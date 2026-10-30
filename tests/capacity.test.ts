import assert from "node:assert/strict";
import test from "node:test";

import { canAddAccounts, canAddMember } from "../lib/capacity-policy.ts";
import { isFeatureEnabled } from "../lib/feature-policy.ts";

test("member cap blocks new admissions at the configured limit", () => {
  assert.equal(canAddMember({ limit: 100, active: 99, pendingInvitations: 0 }), true);
  assert.equal(canAddMember({ limit: 100, active: 99, pendingInvitations: 1 }), false);
  assert.equal(canAddMember({ limit: 100, active: 100, pendingInvitations: 0 }), false);
});

test("feature permissions fail closed unless the package has an explicit true value", () => {
  assert.equal(isFeatureEnabled({ analytics: true }, "analytics"), true);
  assert.equal(isFeatureEnabled({ analytics: false }, "analytics"), false);
  assert.equal(isFeatureEnabled({}, "analytics"), false);
  assert.equal(isFeatureEnabled(undefined, "analytics"), false);
});

test("admin cap counts pending invitations and does not charge existing accounts twice", () => {
  assert.equal(canAddAccounts({ limit: 2, active: 1, pendingInvitations: 1, addsNewAccount: true }), false);
  assert.equal(canAddAccounts({ limit: 2, active: 2, pendingInvitations: 3, addsNewAccount: false }), true);
});
