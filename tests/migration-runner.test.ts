import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";

import { mayUseSqlFallback, parseMigrationTarget } from "../lib/migration-runner-policy.ts";

const require = createRequire(import.meta.url);
const userInfoShim = require("../scripts/os-userinfo-shim.cjs") as {
  installOsUserInfoShim: (input?: { platform?: string; osModule?: { userInfo: (...args: unknown[]) => unknown; homedir: () => string }; env?: Record<string, string | undefined> }) => boolean;
  isOptInEnabled: (env?: Record<string, string | undefined>) => boolean;
};

test("local rehearsal target is pinned to migrate_runner_test on port 55433", () => {
  const target = parseMigrationTarget("postgresql://postgres@127.0.0.1:55433/migrate_runner_test?sslmode=disable", "local-rehearsal");
  assert.equal(target.hostname, "127.0.0.1");
  assert.equal(target.pathname, "/migrate_runner_test");
});

test("local rehearsal refuses any other database, host, port, or embedded password", () => {
  for (const url of [
    "postgresql://postgres@127.0.0.1:55433/demo_test",
    "postgresql://postgres@127.0.0.1:55432/migrate_runner_test",
    "postgresql://postgres@localhost:55433/migrate_runner_test",
    "postgresql://postgres:secret@127.0.0.1:55433/migrate_runner_test",
  ]) assert.throws(() => parseMigrationTarget(url, "local-rehearsal"));
});

test("production target requires a direct Neon hostname and TLS", () => {
  assert.equal(
    parseMigrationTarget("postgresql://user:password@ep-safe.us-east-2.aws.neon.tech/fitpass?sslmode=require", "production").hostname,
    "ep-safe.us-east-2.aws.neon.tech",
  );
  assert.throws(() => parseMigrationTarget("postgresql://user:password@ep-safe-pooler.us-east-2.aws.neon.tech/fitpass?sslmode=require", "production"), /direct, non-pooler/);
  assert.throws(() => parseMigrationTarget("postgresql://user:password@localhost/fitpass?sslmode=require", "production"), /direct, non-pooler/);
  assert.throws(() => parseMigrationTarget("postgresql://user:password@ep-safe.us-east-2.aws.neon.tech/fitpass", "production"), /require TLS/);
});

test("a Drizzle failure never enables SQL fallback in production without the extra flag", () => {
  assert.equal(mayUseSqlFallback("production", false), false);
  assert.equal(mayUseSqlFallback("production", true), true);
});

test("SQL fallback is permitted only for local rehearsal or the explicit production flag", () => {
  assert.equal(mayUseSqlFallback("local-rehearsal", false), true);
  assert.equal(mayUseSqlFallback("production", false), false);
  assert.equal(mayUseSqlFallback("production", true), true);
});

test("os.userInfo shim is off by default and requires an explicit child-process opt-in", () => {
  assert.equal(userInfoShim.isOptInEnabled({}), false);
  assert.equal(userInfoShim.isOptInEnabled({ FITPASS_OS_USERINFO_SHIM: "0" }), false);
  assert.equal(userInfoShim.isOptInEnabled({ FITPASS_OS_USERINFO_SHIM: "1" }), true);
});

test("os.userInfo shim handles ENOMEM only on win32 and returns a fixed placeholder", () => {
  const osModule = {
    userInfo: (): unknown => { throw Object.assign(new Error("system lookup failed"), { code: "ENOMEM" }); },
    homedir: () => "C:\\safe-home",
  };
  assert.equal(userInfoShim.installOsUserInfoShim({ platform: "win32", osModule }), true);
  assert.deepEqual(osModule.userInfo(), { username: "user", uid: -1, gid: -1, shell: null, homedir: "C:\\safe-home" });
});

test("os.userInfo shim handles Node's nested uv_os_get_passwd ENOMEM system error", () => {
  const osModule = {
    userInfo: (): unknown => { throw Object.assign(new Error("native lookup failed"), { code: "ERR_SYSTEM_ERROR", syscall: "uv_os_get_passwd", info: { code: "ENOMEM" } }); },
    homedir: () => "C:\\safe-home",
  };
  userInfoShim.installOsUserInfoShim({ platform: "win32", osModule });
  assert.equal((osModule.userInfo() as { username: string }).username, "user");
});

test("os.userInfo shim rethrows non-ENOMEM errors and never installs on other platforms", () => {
  const original = () => { throw Object.assign(new Error("access denied"), { code: "EACCES" }); };
  const windowsOs = { userInfo: original, homedir: () => "C:\\safe-home" };
  assert.equal(userInfoShim.installOsUserInfoShim({ platform: "win32", osModule: windowsOs }), true);
  assert.throws(() => windowsOs.userInfo(), (error: NodeJS.ErrnoException) => error.code === "EACCES");

  const unixOs = { userInfo: original, homedir: () => "/home/test" };
  assert.equal(userInfoShim.installOsUserInfoShim({ platform: "linux", osModule: unixOs }), false);
  assert.equal(unixOs.userInfo, original);

  const otherNativeError = () => { throw Object.assign(new Error("different system error"), { code: "ERR_SYSTEM_ERROR", syscall: "uv_os_get_passwd", info: { code: "EACCES" } }); };
  const otherNativeOs = { userInfo: otherNativeError, homedir: () => "C:\\safe-home" };
  userInfoShim.installOsUserInfoShim({ platform: "win32", osModule: otherNativeOs });
  assert.throws(() => otherNativeOs.userInfo(), (error: NodeJS.ErrnoException) => error.code === "ERR_SYSTEM_ERROR");
});

test("os.userInfo shim rethrows ENOMEM if no home directory can be resolved", () => {
  const originalError = Object.assign(new Error("memory exhausted"), { code: "ENOMEM" });
  const osModule = { userInfo: (): unknown => { throw originalError; }, homedir: () => "" };
  assert.equal(userInfoShim.installOsUserInfoShim({ platform: "win32", osModule, env: {} }), true);
  assert.throws(() => osModule.userInfo(), (error: unknown) => error === originalError);
});
