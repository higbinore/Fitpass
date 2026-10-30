import assert from "node:assert/strict";
import test from "node:test";

import { getAuthEnv, getEmailEnv } from "../lib/env.ts";
import { getPaymentMode } from "../lib/payment-mode.ts";

test("auth can initialize without email delivery settings while email remains fail-closed", () => {
  const keys = ["BETTER_AUTH_SECRET", "BETTER_AUTH_URL", "RESEND_API_KEY", "EMAIL_FROM"] as const;
  const previous = Object.fromEntries(keys.map((key) => [key, process.env[key]]));
  try {
    process.env.BETTER_AUTH_SECRET = "test-only-secret-that-is-long-enough-for-auth-validation";
    process.env.BETTER_AUTH_URL = "http://127.0.0.1:3000";
    delete process.env.RESEND_API_KEY;
    delete process.env.EMAIL_FROM;

    assert.equal(getAuthEnv().BETTER_AUTH_URL, "http://127.0.0.1:3000");
    assert.throws(getEmailEnv, (error: unknown) =>
      error instanceof Error && error.message.includes("RESEND_API_KEY") && error.message.includes("EMAIL_FROM"),
    );
  } finally {
    for (const key of keys) {
      const value = previous[key];
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
});

test("payment mode defaults to Paystack, accepts explicit demo, and rejects invalid configuration", () => {
  const previous = process.env.FITPASS_PAYMENT_MODE;
  try {
    delete process.env.FITPASS_PAYMENT_MODE;
    assert.equal(getPaymentMode(), "paystack");
    process.env.FITPASS_PAYMENT_MODE = "demo";
    assert.equal(getPaymentMode(), "demo");
    process.env.FITPASS_PAYMENT_MODE = "live";
    assert.throws(() => getPaymentMode(), /FITPASS_PAYMENT_MODE/);
  } finally {
    if (previous === undefined) delete process.env.FITPASS_PAYMENT_MODE;
    else process.env.FITPASS_PAYMENT_MODE = previous;
  }
});
