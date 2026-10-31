export const FITPASS_TRIAL_DAYS = 30;

export function createTrialWindow(startedAt: Date, days = FITPASS_TRIAL_DAYS) {
  if (!Number.isFinite(startedAt.getTime()) || !Number.isInteger(days) || days < 1) {
    throw new RangeError("A valid trial start date and positive whole-day duration are required.");
  }
  const expiresAt = new Date(startedAt);
  expiresAt.setUTCDate(expiresAt.getUTCDate() + days);
  return { startedAt: new Date(startedAt), expiresAt };
}

export function isTrialActive(input: { activatedAt: Date | null; expiresAt: Date | null; now: Date }) {
  return Boolean(
    input.activatedAt &&
    input.expiresAt &&
    Number.isFinite(input.activatedAt.getTime()) &&
    Number.isFinite(input.expiresAt.getTime()) &&
    Number.isFinite(input.now.getTime()) &&
    input.activatedAt <= input.now &&
    input.expiresAt > input.now,
  );
}

export function trialDaysRemaining(expiresAt: Date, now: Date) {
  if (!Number.isFinite(expiresAt.getTime()) || !Number.isFinite(now.getTime())) return 0;
  return Math.max(0, Math.ceil((expiresAt.getTime() - now.getTime()) / 86_400_000));
}

/** Derives expired trial status for reads without persisting a state change. */
export function resolvePlatformSubscriptionStatus(status: string, periodEnd: Date, now: Date): string {
  if (status !== "trialing") return status;
  if (!Number.isFinite(periodEnd.getTime()) || !Number.isFinite(now.getTime()) || periodEnd <= now) return "expired";
  return "trialing";
}
