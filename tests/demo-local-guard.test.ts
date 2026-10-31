import assert from "node:assert/strict";
import test from "node:test";

import { parseLocalDemoDatabaseUrl } from "../lib/demo-local-guard.ts";

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
