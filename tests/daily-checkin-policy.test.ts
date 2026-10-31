import assert from "node:assert/strict";
import test from "node:test";

import { decideDailyCheckin, getLagosDayBounds } from "../lib/daily-checkin-policy.ts";

test("daily check-in policy enforces configured limits one and three", () => {
  assert.deepEqual(decideDailyCheckin(0, 1), { allowed: true, countAfter: 1, limit: 1 });
  assert.deepEqual(decideDailyCheckin(1, 1), { allowed: false, countAfter: 1, limit: 1, message: "Daily check-in limit reached (1 of 1 today)." });
  assert.equal(decideDailyCheckin(2, 3).allowed, true);
  assert.equal(decideDailyCheckin(3, 3).allowed, false);
});

test("Lagos day bounds roll over at local midnight and span 24 hours", () => {
  const beforeMidnight = getLagosDayBounds(new Date("2026-10-30T22:59:59.999Z"));
  const afterMidnight = getLagosDayBounds(new Date("2026-10-30T23:00:00.000Z"));
  assert.equal(beforeMidnight.start.toISOString(), "2026-10-29T23:00:00.000Z");
  assert.equal(beforeMidnight.end.toISOString(), "2026-10-30T23:00:00.000Z");
  assert.equal(afterMidnight.start.toISOString(), "2026-10-30T23:00:00.000Z");
  assert.equal(afterMidnight.end.getTime() - afterMidnight.start.getTime(), 24 * 60 * 60 * 1000);
});

test("different gym limits are evaluated independently and malformed limits fail closed", () => {
  const gymA = decideDailyCheckin(1, 1);
  const gymB = decideDailyCheckin(1, 3);
  assert.equal(gymA.allowed, false);
  assert.equal(gymB.allowed, true);
  assert.throws(() => decideDailyCheckin(0, 21), RangeError);
});
