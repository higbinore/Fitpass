import assert from "node:assert/strict";
import test from "node:test";

import { isAuthorizedCronRequest } from "../lib/cron-security.ts";

const secret = "test-only-cron-secret-0123456789";

test("cron authorization requires the exact bearer secret and rejects malformed or missing values", () => {
  assert.equal(isAuthorizedCronRequest(`Bearer ${secret}`, secret), true);
  assert.equal(isAuthorizedCronRequest(`Bearer ${secret}x`, secret), false);
  assert.equal(isAuthorizedCronRequest(`Bearer ${secret.slice(1)}`, secret), false);
  assert.equal(isAuthorizedCronRequest(secret, secret), false);
  assert.equal(isAuthorizedCronRequest(null, secret), false);
  assert.equal(isAuthorizedCronRequest(`Bearer ${secret}`, "too-short"), false);
});
