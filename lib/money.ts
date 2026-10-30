/**
 * Money helpers.
 *
 * Amounts are stored and compared as integer kobo. Naira formatting happens
 * only at the presentation boundary, in this file.
 */

const nairaFormatter = new Intl.NumberFormat("en-NG", {
  style: "currency",
  currency: "NGN",
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});

/** Formats integer kobo for display: 1500000 -> "₦15,000". */
export function formatNaira(kobo: number | bigint): string {
  if (typeof kobo === "number" && (!Number.isSafeInteger(kobo) || !Number.isInteger(kobo))) {
    throw new Error("Money must be an integer number of kobo.");
  }
  const amount = typeof kobo === "bigint" ? kobo : BigInt(kobo);
  const zero = BigInt(0);
  const sign = amount < zero ? BigInt(-1) : BigInt(1);
  const absolute = amount < zero ? -amount : amount;
  const wholeNaira = (absolute + BigInt(50)) / BigInt(100);
  return nairaFormatter.format(sign * wholeNaira);
}
