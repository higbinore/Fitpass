import assert from "node:assert/strict";
import test from "node:test";

import { createTrialWindow, isTrialActive, resolvePlatformSubscriptionStatus, trialDaysRemaining } from "../lib/trial-policy.ts";

test("FitPass trial is 30 days from the activation instant, independent of a browser clock", () => {
  const start = new Date("2026-10-30T12:45:00.000Z");
  const trial = createTrialWindow(start);
  assert.equal(trial.startedAt.toISOString(), start.toISOString());
  assert.equal(trial.expiresAt.toISOString(), "2026-11-29T12:45:00.000Z");
});

test("trial access fails closed before activation, at expiry, and when dates are incomplete", () => {
  const start = new Date("2026-10-30T00:00:00.000Z");
  const end = new Date("2026-11-29T00:00:00.000Z");
  assert.equal(isTrialActive({ activatedAt: null, expiresAt: null, now: start }), false);
  assert.equal(isTrialActive({ activatedAt: start, expiresAt: null, now: start }), false);
  assert.equal(isTrialActive({ activatedAt: start, expiresAt: end, now: new Date(start.getTime() - 1) }), false);
  assert.equal(isTrialActive({ activatedAt: start, expiresAt: end, now: end }), false);
  assert.equal(isTrialActive({ activatedAt: start, expiresAt: end, now: new Date(end.getTime() - 1) }), true);
});

test("trial countdown rounds partial days up and never reports a negative value", () => {
  const end = new Date("2026-11-01T00:00:00.000Z");
  assert.equal(trialDaysRemaining(end, new Date("2026-10-31T23:00:00.000Z")), 1);
  assert.equal(trialDaysRemaining(end, new Date("2026-11-01T00:00:00.000Z")), 0);
});

test("expired FitPass trial status is derived at read time without changing unrelated states", () => {
  const now = new Date("2026-10-31T12:00:00.000Z");
  assert.equal(resolvePlatformSubscriptionStatus("trialing", new Date("2026-10-31T12:00:00.000Z"), now), "expired");
  assert.equal(resolvePlatformSubscriptionStatus("trialing", new Date("2026-11-01T12:00:00.000Z"), now), "trialing");
  assert.equal(resolvePlatformSubscriptionStatus("active", new Date("2026-10-01T00:00:00.000Z"), now), "active");
  assert.equal(resolvePlatformSubscriptionStatus("trialing", new Date(Number.NaN), now), "expired");
});
