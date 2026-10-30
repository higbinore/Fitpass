import assert from "node:assert/strict";
import test from "node:test";

import { formatNaira } from "../lib/money.ts";

test("formats kobo as naira without floating-point conversion", () => {
  assert.equal(formatNaira(1_500_000), "₦15,000");
  assert.equal(formatNaira(1_500_050), "₦15,001");
  assert.equal(formatNaira(BigInt("9007199254740991")), "₦90,071,992,547,410");
  assert.throws(() => formatNaira(1.5), /integer number of kobo/);
});
