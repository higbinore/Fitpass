/** Parses a user-entered Naira amount into integer kobo without floating point. */
export function parseNairaFilter(value: string | null): number | null | undefined {
  if (value === null || value.trim() === "") return null;
  const normalized = value.trim();
  const match = /^(0|[1-9]\d*)(?:\.(\d{1,2}))?$/.exec(normalized);
  if (!match) return undefined;
  const naira = Number(match[1]);
  const kobo = Number((match[2] ?? "").padEnd(2, "0"));
  const total = naira * 100 + kobo;
  return Number.isSafeInteger(total) && total >= 0 ? total : undefined;
}
