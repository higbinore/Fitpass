import assert from "node:assert/strict";
import test from "node:test";

import { canBeginInitialPlatformAdminSetup, decideInitialPlatformAdminClaim, initialPlatformAdminSetupSchema, isPublicPlatformAdminSetupEnabled } from "../lib/platform-setup-policy.ts";

test("public first-admin bootstrap is disabled in production", () => {
  assert.equal(isPublicPlatformAdminSetupEnabled("development"), true);
  assert.equal(isPublicPlatformAdminSetupEnabled("test"), true);
  assert.equal(isPublicPlatformAdminSetupEnabled("production"), false);
});

test("initial setup is unavailable after an admin or completion marker exists, and while a claim is pending", () => {
  assert.equal(canBeginInitialPlatformAdminSetup({ administratorExists: false, setupCompleted: false, pendingClaimExists: false }), true);
  assert.equal(canBeginInitialPlatformAdminSetup({ administratorExists: true, setupCompleted: false, pendingClaimExists: false }), false);
  assert.equal(canBeginInitialPlatformAdminSetup({ administratorExists: false, setupCompleted: true, pendingClaimExists: false }), false);
  assert.equal(canBeginInitialPlatformAdminSetup({ administratorExists: false, setupCompleted: false, pendingClaimExists: true }), false);
});

test("setup input trims values, normalizes email, and requires matching strong passwords", () => {
  const valid = initialPlatformAdminSetupSchema.parse({ name: "  FitPass Admin  ", email: " ADMIN@EXAMPLE.COM ", password: "LongPassphrase123", passwordConfirmation: "LongPassphrase123" });
  assert.equal(valid.name, "FitPass Admin");
  assert.equal(valid.email, "admin@example.com");
  assert.equal(initialPlatformAdminSetupSchema.safeParse({ ...valid, passwordConfirmation: "different-value" }).success, false);
  assert.equal(initialPlatformAdminSetupSchema.safeParse({ ...valid, password: "short" }).success, false);
  assert.equal(initialPlatformAdminSetupSchema.safeParse({ ...valid, role: "platform_admin" }).success, false);
});

test("only the verified identity bound to the live one-time claim can become the first admin", () => {
  const base = { administratorExists: false, setupCompleted: false, claimExists: true, claimExpired: false, emailVerified: true, claimUserId: "user-1", authenticatedUserId: "user-1" };
  assert.deepEqual(decideInitialPlatformAdminClaim(base), { allowed: true });
  assert.equal(decideInitialPlatformAdminClaim({ ...base, authenticatedUserId: "attacker" }).allowed, false);
  assert.equal(decideInitialPlatformAdminClaim({ ...base, emailVerified: false }).allowed, false);
  assert.equal(decideInitialPlatformAdminClaim({ ...base, claimExpired: true }).allowed, false);
  assert.equal(decideInitialPlatformAdminClaim({ ...base, setupCompleted: true }).allowed, false);
  assert.equal(decideInitialPlatformAdminClaim({ ...base, administratorExists: true }).allowed, false);
});
