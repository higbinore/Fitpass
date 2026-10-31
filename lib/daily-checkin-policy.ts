export type DailyCheckinDecision = { allowed: true; countAfter: number; limit: number } | { allowed: false; countAfter: number; limit: number; message: string };

/** Build UTC timestamps for a calendar day in Benin City (Africa/Lagos, UTC+1). */
export function getLagosDayBounds(now: Date): { start: Date; end: Date } {
  const local = new Date(now.getTime() + 60 * 60 * 1000);
  local.setUTCHours(0, 0, 0, 0);
  const start = new Date(local.getTime() - 60 * 60 * 1000);
  return { start, end: new Date(start.getTime() + 24 * 60 * 60 * 1000) };
}

export function decideDailyCheckin(usedCount: number, limit: number): DailyCheckinDecision {
  if (!Number.isInteger(usedCount) || usedCount < 0 || !Number.isInteger(limit) || limit < 1 || limit > 20) {
    throw new RangeError("Daily check-in count or limit is invalid.");
  }
  if (usedCount >= limit) return { allowed: false, countAfter: usedCount, limit, message: `Daily check-in limit reached (${usedCount} of ${limit} today).` };
  return { allowed: true, countAfter: usedCount + 1, limit };
}
