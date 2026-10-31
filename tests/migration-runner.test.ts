import assert from "node:assert/strict";
import test from "node:test";

import { mayUseSqlFallback, parseMigrationTarget } from "../lib/migration-runner-policy.ts";

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
