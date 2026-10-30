import assert from "node:assert/strict";
import test from "node:test";

import { parseNairaFilter } from "../lib/marketplace-policy.ts";

test("Naira marketplace filters convert to integer kobo without float arithmetic", () => {
  assert.equal(parseNairaFilter("15000"), 1_500_000);
  assert.equal(parseNairaFilter("15000.5"), 1_500_050);
  assert.equal(parseNairaFilter("0.09"), 9);
});

test("blank price filters are omitted and malformed or unsafe values fail closed", () => {
  assert.equal(parseNairaFilter(null), null);
  assert.equal(parseNairaFilter("  "), null);
  assert.equal(parseNairaFilter("1.001"), undefined);
  assert.equal(parseNairaFilter("-1"), undefined);
  assert.equal(parseNairaFilter("1e4"), undefined);
  assert.equal(parseNairaFilter("90071992547410"), undefined);
});
