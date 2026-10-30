import { createHmac, timingSafeEqual } from "node:crypto";

export function isValidPaystackSignature(rawBody: string, signature: string | null, secret: string): boolean {
  if (!signature || !/^[a-f0-9]{128}$/i.test(signature)) return false;
  const expected = createHmac("sha512", secret).update(rawBody).digest();
  const provided = Buffer.from(signature, "hex");
  return provided.length === expected.length && timingSafeEqual(provided, expected);
}

export function addCalendarMonth(from: Date): Date {
  const result = new Date(from);
  const day = result.getUTCDate();
  result.setUTCDate(1);
  result.setUTCMonth(result.getUTCMonth() + 1);
  const lastDay = new Date(Date.UTC(result.getUTCFullYear(), result.getUTCMonth() + 1, 0)).getUTCDate();
  result.setUTCDate(Math.min(day, lastDay));
  return result;
}

export function classifyWebhookDelivery(
  existing: { transactionId: string; reference: string; paymentType: "gym" | "platform" } | null,
  incoming: { transactionId: string; reference: string; paymentType: "gym" | "platform" },
): "new" | "duplicate" | "conflict" {
  if (!existing) return "new";
  return existing.transactionId === incoming.transactionId &&
    existing.reference === incoming.reference &&
    existing.paymentType === incoming.paymentType
    ? "duplicate"
    : "conflict";
}

export type PaymentProcessingDecision = "apply" | "duplicate" | "conflict" | "not_pending";

export function classifyPaymentProcessing(input: {
  status: string;
  storedTransactionId: string | null;
  incomingTransactionId: string;
}): PaymentProcessingDecision {
  if (input.status === "paid") return input.storedTransactionId === input.incomingTransactionId ? "duplicate" : "conflict";
  return input.status === "pending" ? "apply" : "not_pending";
}

export function calculateGymSubscriptionWindow(now: Date, currentExpiresAt: Date | null, durationDays: number) {
  const startsAt = currentExpiresAt && currentExpiresAt > now ? currentExpiresAt : now;
  return { startsAt, expiresAt: new Date(startsAt.getTime() + durationDays * 24 * 60 * 60 * 1000) };
}
