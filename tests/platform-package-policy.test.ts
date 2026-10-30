import assert from "node:assert/strict";
import test from "node:test";

import { FIXED_FITPASS_PACKAGES, matchesFixedFitPassPackage } from "../lib/platform-package-policy.ts";

test("the four FitPass package prices and capacity limits match the approved monthly catalog", () => {
  assert.deepEqual(FIXED_FITPASS_PACKAGES, [
    { name: "Starter", billingInterval: "month", priceKobo: 5_000_000, activeMemberLimit: 100, adminAccountLimit: 2, sortOrder: 1 },
    { name: "Growth", billingInterval: "month", priceKobo: 10_000_000, activeMemberLimit: 300, adminAccountLimit: 5, sortOrder: 2 },
    { name: "Professional", billingInterval: "month", priceKobo: 20_000_000, activeMemberLimit: 750, adminAccountLimit: 10, sortOrder: 3 },
    { name: "Enterprise", billingInterval: "month", priceKobo: 30_000_000, activeMemberLimit: 2_000, adminAccountLimit: 20, sortOrder: 4 },
  ]);
});

test("fixed package validation rejects price, limit, or interval drift", () => {
  const starter = FIXED_FITPASS_PACKAGES[0];
  assert.equal(matchesFixedFitPassPackage(starter), true);
  assert.equal(matchesFixedFitPassPackage({ ...starter, priceKobo: 4_999_999 }), false);
  assert.equal(matchesFixedFitPassPackage({ ...starter, activeMemberLimit: 101 }), false);
  assert.equal(matchesFixedFitPassPackage({ ...starter, adminAccountLimit: 3 }), false);
  assert.equal(matchesFixedFitPassPackage({ ...starter, billingInterval: "year" }), false);
});
