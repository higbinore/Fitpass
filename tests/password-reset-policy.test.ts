import assert from "node:assert/strict";
import test from "node:test";

import { PASSWORD_RESET_RESPONSE, requestPasswordResetPrivately } from "../lib/password-reset-policy.ts";

test("password reset request returns identical public copy when delivery succeeds or fails", async () => {
  assert.deepEqual(await requestPasswordResetPrivately(async () => ({ status: true })), PASSWORD_RESET_RESPONSE);
  assert.deepEqual(await requestPasswordResetPrivately(async () => { throw new Error("private provider failure"); }), PASSWORD_RESET_RESPONSE);
  assert.equal(JSON.stringify(PASSWORD_RESET_RESPONSE).includes("email@example.com"), false);
});
