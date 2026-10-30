import assert from "node:assert/strict";
import test from "node:test";

import { canRemoveActiveOwner, decideInvitationAcceptance, validateSuccessfulCharge } from "../lib/workflow-policy.ts";

const now = new Date("2026-10-30T12:00:00Z");
const validInvitation = {
  status: "pending",
  expiresAt: new Date("2026-10-31T12:00:00Z"),
  now,
  invitationEmail: "Owner@Example.com",
  verifiedEmail: "owner@example.com",
  gymStatus: "active",
  membershipStatus: null,
};

test("invitation acceptance accepts a pending, unexpired invite for the verified matching email", () => {
  assert.equal(decideInvitationAcceptance(validInvitation), "accept");
});

test("expired, replayed, mismatched-email, archived-gym and suspended memberships are denied", () => {
  assert.equal(decideInvitationAcceptance({ ...validInvitation, expiresAt: now }), "expired");
  assert.equal(decideInvitationAcceptance({ ...validInvitation, status: "accepted" }), "invalid_or_used");
  assert.equal(decideInvitationAcceptance({ ...validInvitation, status: "revoked" }), "invalid_or_used");
  assert.equal(decideInvitationAcceptance({ ...validInvitation, verifiedEmail: "other@example.com" }), "email_mismatch");
  assert.equal(decideInvitationAcceptance({ ...validInvitation, gymStatus: "archived" }), "archived_gym");
  assert.equal(decideInvitationAcceptance({ ...validInvitation, membershipStatus: "suspended" }), "inactive_membership");
  assert.equal(decideInvitationAcceptance({ ...validInvitation, membershipStatus: "revoked" }), "inactive_membership");
});

test("last active owner cannot be removed; owner removal is allowed when another active owner remains", () => {
  assert.equal(canRemoveActiveOwner({ activeOwnerCount: 1, removesActiveOwner: true }), false);
  assert.equal(canRemoveActiveOwner({ activeOwnerCount: 2, removesActiveOwner: true }), true);
  assert.equal(canRemoveActiveOwner({ activeOwnerCount: 0, removesActiveOwner: false }), true);
});

test("a webhook charge must match the stored amount, currency, successful event, and payment domain", () => {
  const charge = { event: "charge.success", status: "success", amount: 1500000, expectedAmountKobo: 1500000, currency: "NGN", expectedCurrency: "NGN", reference: "fitpass_gym_abcdef", paymentType: "gym" as const };
  assert.equal(validateSuccessfulCharge(charge), true);
  assert.equal(validateSuccessfulCharge({ ...charge, amount: 1499999 }), false);
  assert.equal(validateSuccessfulCharge({ ...charge, currency: "USD" }), false);
  assert.equal(validateSuccessfulCharge({ ...charge, event: "charge.failed" }), false);
  assert.equal(validateSuccessfulCharge({ ...charge, status: "failed" }), false);
  assert.equal(validateSuccessfulCharge({ ...charge, reference: "fitpass_platform_abcdef" }), false);
});
