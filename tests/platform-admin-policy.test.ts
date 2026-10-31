import assert from "node:assert/strict";
import test from "node:test";

import { canGrantPlatformAdmin, canReinstatePlatformAdmin, canSuspendPlatformAdmin, PLATFORM_ADMIN_ACTIVE_LIMIT } from "../lib/platform-admin-policy.ts";

test("platform administrator grant cap permits at most ten active accounts", () => {
  assert.equal(PLATFORM_ADMIN_ACTIVE_LIMIT, 10);
  assert.equal(canGrantPlatformAdmin(9), true);
  assert.equal(canGrantPlatformAdmin(10), false);
  assert.equal(canGrantPlatformAdmin(-1), false);
});

test("suspension and reinstatement preserve one active administrator and the cap", () => {
  assert.equal(canSuspendPlatformAdmin({ targetIsActive: true, activeCount: 1 }), false);
  assert.equal(canSuspendPlatformAdmin({ targetIsActive: true, activeCount: 2 }), true);
  assert.equal(canSuspendPlatformAdmin({ targetIsActive: false, activeCount: 1 }), true);
  assert.equal(canReinstatePlatformAdmin({ targetIsSuspended: true, activeCount: 9 }), true);
  assert.equal(canReinstatePlatformAdmin({ targetIsSuspended: true, activeCount: 10 }), false);
  assert.equal(canReinstatePlatformAdmin({ targetIsSuspended: false, activeCount: 10 }), true);
});
