import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import test from "node:test";

import { parseLocalDemoDatabaseUrl, parseLocalReviewServerTarget } from "../lib/demo-local-guard.ts";

test("allows loopback demo and test databases", () => {
  assert.equal(parseLocalDemoDatabaseUrl("postgresql://demo_user:local-only@127.0.0.1:55432/fitpass_demo").database, "fitpass_demo");
  assert.equal(parseLocalDemoDatabaseUrl("postgres://localhost/fitpass_test").host, "localhost");
  assert.equal(parseLocalDemoDatabaseUrl("postgres://user@[::1]:5432/fitpass-test").host, "::1");
});
test("refuses remote hosts, including Neon, before a connection is attempted", () => {
  assert.throws(() => parseLocalDemoDatabaseUrl("postgres://user:secret@ep-example.neon.tech/fitpass_demo"), /restricted to localhost/);
});

test("refuses connection parameters that could override the guarded local target", () => {
  assert.throws(() => parseLocalDemoDatabaseUrl("postgres://user@localhost/fitpass_demo?host=remote.example"), /unsupported connection overrides/);
});

test("refuses loopback production database names", () => {
  assert.throws(() => parseLocalDemoDatabaseUrl("postgres://user@127.0.0.1:55432/fitpass"), /must contain 'demo' or 'test'/);
});

test("rejects missing and non-PostgreSQL targets", () => {
  assert.throws(() => parseLocalDemoDatabaseUrl(undefined), /Set DATABASE_URL/);
  assert.throws(() => parseLocalDemoDatabaseUrl("https://localhost/fitpass_demo"), /PostgreSQL URLs only/);
});

test("review server accepts only the exact local demo database on port 55433", () => {
  assert.equal(
    parseLocalReviewServerTarget("postgresql://postgres@127.0.0.1:55433/demo_test?sslmode=disable").database,
    "demo_test",
  );
});

test("review server refuses any other host, port, database, or embedded password", () => {
  for (const target of [
    "postgresql://postgres@localhost:55433/demo_test",
    "postgresql://postgres@127.0.0.1:55432/demo_test",
    "postgresql://postgres@127.0.0.1:55433/rehearsal_test",
    "postgresql://postgres:secret@127.0.0.1:55433/demo_test",
    "postgresql://postgres@ep-example.neon.tech/demo_test",
  ]) {
    assert.throws(() => parseLocalReviewServerTarget(target));
  }
});

test("review preload blocks environment-file probes without opening their contents", () => {
  const guard = resolve("scripts/dev-demo-preload.cjs");
  const probe = String.raw`const fs = require('node:fs');
const paths = ['.env.local', '.env.local.docx'];
for (const path of paths) {
  if (fs.existsSync(path)) process.exit(2);
  try { fs.readFileSync(path); process.exit(3); }
  catch (error) { if (error.code !== 'ENOENT') process.exit(4); }
}
process.stdout.write('environment-file access blocked');`;
  const result = spawnSync(process.execPath, ["--require", guard, "-e", probe], {
    cwd: process.cwd(),
    encoding: "utf8",
    windowsHide: true,
    env: { ...process.env, NODE_OPTIONS: "" },
  });

  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout, "environment-file access blocked");
});
