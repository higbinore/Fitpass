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
export function formatNaira(kobo: number): string {
  if (!Number.isInteger(kobo)) {
    throw new Error("Money must be an integer number of kobo.");
  }

  return nairaFormatter.format(kobo / 100);
}
