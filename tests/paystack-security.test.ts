import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import test from "node:test";

import { addCalendarMonth, calculateGymSubscriptionWindow, classifyPaymentProcessing, classifyWebhookDelivery, isValidPaystackSignature } from "../lib/paystack-security.ts";

test("Paystack webhook signature checks the exact raw body", () => {
  const body = '{"event":"charge.success","data":{"reference":"r1"}}';
  const secret = "sk_test_unit-test-secret";
  const signature = createHmac("sha512", secret).update(body).digest("hex");
  assert.equal(isValidPaystackSignature(body, signature, secret), true);
  assert.equal(isValidPaystackSignature(`${body} `, signature, secret), false);
  assert.equal(isValidPaystackSignature(body, null, secret), false);
});

test("monthly package periods clamp month-end dates safely", () => {
  assert.equal(addCalendarMonth(new Date("2026-01-31T12:00:00Z")).toISOString(), "2026-02-28T12:00:00.000Z");
  assert.equal(addCalendarMonth(new Date("2026-03-15T12:00:00Z")).toISOString(), "2026-04-15T12:00:00.000Z");
});

test("webhook idempotency accepts only an exact transaction/reference replay", () => {
  const event = { transactionId: "tx-1", reference: "fitpass_gym_abc", paymentType: "gym" as const };
  assert.equal(classifyWebhookDelivery(null, event), "new");
  assert.equal(classifyWebhookDelivery(event, event), "duplicate");
  assert.equal(classifyWebhookDelivery(event, { ...event, reference: "fitpass_gym_other" }), "conflict");
  assert.equal(classifyWebhookDelivery(event, { ...event, paymentType: "platform" }), "conflict");
});

test("payment status transitions apply pending charges, allow exact retries, and reject conflicting or closed states", () => {
  assert.equal(classifyPaymentProcessing({ status: "pending", storedTransactionId: null, incomingTransactionId: "tx-1" }), "apply");
  assert.equal(classifyPaymentProcessing({ status: "paid", storedTransactionId: "tx-1", incomingTransactionId: "tx-1" }), "duplicate");
  assert.equal(classifyPaymentProcessing({ status: "paid", storedTransactionId: "tx-1", incomingTransactionId: "tx-2" }), "conflict");
  assert.equal(classifyPaymentProcessing({ status: "failed", storedTransactionId: null, incomingTransactionId: "tx-1" }), "not_pending");
});

test("gym subscription periods extend from a still-active expiry and otherwise start now", () => {
  const now = new Date("2026-10-30T12:00:00Z");
  const future = new Date("2026-11-10T12:00:00Z");
  assert.deepEqual(calculateGymSubscriptionWindow(now, future, 30), { startsAt: future, expiresAt: new Date("2026-12-10T12:00:00Z") });
  assert.deepEqual(calculateGymSubscriptionWindow(now, new Date("2026-10-01T12:00:00Z"), 30), { startsAt: now, expiresAt: new Date("2026-11-29T12:00:00Z") });
});
