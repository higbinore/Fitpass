import { and, eq, gt, or } from "drizzle-orm";
import { NextResponse } from "next/server";

import { getPaymentEnv } from "@/lib/env";
import { getDb } from "@/lib/db";
import { addCalendarMonth, calculateGymSubscriptionWindow, classifyPaymentProcessing, classifyWebhookDelivery, isValidPaystackSignature } from "@/lib/paystack-security";
import { auditEvents, paymentReferenceRegistry, payments, paystackWebhookEvents, plans, platformPackages, platformPayments, platformSubscriptions, subscriptions } from "@/lib/schema";
import { validateSuccessfulCharge } from "@/lib/workflow-policy";

type PaystackEvent = {
  event?: string;
  data?: {
    id?: number | string;
    reference?: string;
    amount?: number;
    currency?: string;
    status?: string;
    paid_at?: string;
    customer?: { email?: string };
  };
};

function getTransactionId(value: number | string | undefined): string | null {
  return value === undefined || value === null ? null : String(value);
}

export async function POST(request: Request) {
  const rawBody = await request.text();
  const signature = request.headers.get("x-paystack-signature");
  let env;
  try { env = getPaymentEnv(); } catch { return NextResponse.json({ error: "Webhook configuration unavailable." }, { status: 503 }); }
  if (!isValidPaystackSignature(rawBody, signature, env.PAYSTACK_SECRET_KEY)) {
    return NextResponse.json({ error: "Invalid webhook signature." }, { status: 401 });
  }

  let event: PaystackEvent;
  try { event = JSON.parse(rawBody) as PaystackEvent; } catch { return NextResponse.json({ error: "Invalid webhook body." }, { status: 400 }); }
  if (event.event !== "charge.success") return NextResponse.json({ received: true });
  const data = event.data;
  const transactionId = getTransactionId(data?.id);
  const reference = data?.reference;
  if (!transactionId || !reference || data?.status !== "success" || !Number.isSafeInteger(data.amount) || data.currency !== "NGN") {
    return NextResponse.json({ error: "Invalid successful payment event." }, { status: 400 });
  }
  const validTransactionId: string = String(transactionId);
  const validReference: string = String(reference);
  const paymentType = reference.startsWith("fitpass_platform_") ? "platform" : reference.startsWith("fitpass_gym_") ? "gym" : null;
  if (!paymentType) return NextResponse.json({ error: "Unknown payment reference." }, { status: 400 });
  const validPaymentType: "platform" | "gym" = paymentType;

  try {
    const result = await getDb().transaction(async (tx) => {
      const now = new Date();
      const [registeredReference] = await tx.select({ paymentType: paymentReferenceRegistry.paymentType }).from(paymentReferenceRegistry)
        .where(eq(paymentReferenceRegistry.reference, validReference)).limit(1);
      if (!registeredReference || registeredReference.paymentType !== validPaymentType) return { error: "Payment reference registry does not match this charge.", status: 409 as const };
      async function recordEvent() {
        const [row] = await tx.insert(paystackWebhookEvents).values({ transactionId: validTransactionId, reference: validReference, paymentType: validPaymentType }).onConflictDoNothing().returning({ transactionId: paystackWebhookEvents.transactionId });
        if (row) return "inserted" as const;
        const [existing] = await tx.select().from(paystackWebhookEvents).where(or(eq(paystackWebhookEvents.transactionId, validTransactionId), eq(paystackWebhookEvents.reference, validReference))).limit(1);
        return classifyWebhookDelivery(existing ? { transactionId: existing.transactionId, reference: existing.reference, paymentType: existing.paymentType as "gym" | "platform" } : null, { transactionId: validTransactionId, reference: validReference, paymentType: validPaymentType });
      }
      if (paymentType === "platform") {
        const [payment] = await tx.select().from(platformPayments).where(eq(platformPayments.reference, reference)).for("update").limit(1);
        if (!payment || payment.paymentMode !== "paystack" || !validateSuccessfulCharge({ event: event.event, status: data.status, amount: data.amount, expectedAmountKobo: payment.amountKobo, currency: data.currency, expectedCurrency: payment.currency, reference, paymentType: "platform" })) return { error: "Payment does not match the stored platform charge.", status: 409 as const };
        const paymentDecision = classifyPaymentProcessing({ status: payment.status, storedTransactionId: payment.paystackTransactionId, incomingTransactionId: validTransactionId });
        if (paymentDecision === "duplicate") return { duplicate: true };
        if (paymentDecision === "conflict") return { error: "Payment was already recorded under another transaction.", status: 409 as const };
        if (paymentDecision === "not_pending") return { error: "Payment is not pending.", status: 409 as const };
        const [sub] = await tx.select().from(platformSubscriptions).where(and(eq(platformSubscriptions.id, payment.platformSubscriptionId), eq(platformSubscriptions.gymId, payment.gymId))).for("update").limit(1);
        const [pkg] = await tx.select({ id: platformPackages.id }).from(platformPackages).where(eq(platformPackages.id, payment.platformPackageId)).limit(1);
        if (!sub || !pkg) return { error: "Subscription record is missing.", status: 409 as const };
        const existingPeriod = sub.status === "active" && sub.currentPeriodEnd > now ? sub.currentPeriodEnd : now;
        const periodEnd = addCalendarMonth(existingPeriod);
        const eventResult = await recordEvent();
        if (eventResult === "duplicate") return { duplicate: true };
        if (eventResult === "conflict") return { error: "Transaction identifier is already linked to another payment.", status: 409 as const };
        await tx.update(platformPayments).set({ status: "paid", paystackTransactionId: validTransactionId, paidAt: data.paid_at ? new Date(data.paid_at) : now }).where(eq(platformPayments.id, payment.id));
        await tx.update(platformSubscriptions).set({ packageId: payment.platformPackageId, paymentMode: "paystack", customPriceKobo: sub.packageId === payment.platformPackageId ? sub.customPriceKobo : null, pricingNote: sub.packageId === payment.platformPackageId ? sub.pricingNote : null, status: "active", startsAt: sub.startsAt > now ? sub.startsAt : now, currentPeriodEnd: periodEnd, updatedAt: now }).where(eq(platformSubscriptions.id, sub.id));
        await tx.insert(auditEvents).values({ gymId: payment.gymId, actorLabel: "paystack_webhook", action: "platform_payment.paid", subjectType: "platform_payment", subjectId: payment.id, metadata: { transactionId: validTransactionId, reference: validReference, amountKobo: payment.amountKobo } });
        return { paid: true, paymentType };
      }

      const [payment] = await tx.select().from(payments).where(eq(payments.reference, reference)).for("update").limit(1);
      if (!payment || payment.paymentMode !== "paystack" || !validateSuccessfulCharge({ event: event.event, status: data.status, amount: data.amount, expectedAmountKobo: payment.amountKobo, currency: data.currency, expectedCurrency: payment.currency, reference, paymentType: "gym" })) return { error: "Payment does not match the stored gym charge.", status: 409 as const };
      const paymentDecision = classifyPaymentProcessing({ status: payment.status, storedTransactionId: payment.paystackTransactionId, incomingTransactionId: validTransactionId });
      if (paymentDecision === "duplicate") return { duplicate: true };
      if (paymentDecision === "conflict") return { error: "Payment was already recorded under another transaction.", status: 409 as const };
      if (paymentDecision === "not_pending") return { error: "Payment is not pending.", status: 409 as const };
      const [plan] = await tx.select({ durationDays: plans.durationDays }).from(plans).where(and(eq(plans.id, payment.planId), eq(plans.gymId, payment.gymId))).limit(1);
      const [nextSubscription] = await tx.select().from(subscriptions).where(and(eq(subscriptions.id, payment.subscriptionId!), eq(subscriptions.gymId, payment.gymId))).for("update").limit(1);
      if (!plan || !nextSubscription) return { error: "Subscription record is missing.", status: 409 as const };
      const [current] = await tx.select().from(subscriptions).where(and(eq(subscriptions.gymId, payment.gymId), eq(subscriptions.memberId, payment.memberId), eq(subscriptions.status, "active"), gt(subscriptions.expiresAt, now))).for("update").limit(1);
      const { startsAt: startAt, expiresAt } = calculateGymSubscriptionWindow(now, current?.expiresAt ?? null, plan.durationDays);
      const eventResult = await recordEvent();
      if (eventResult === "duplicate") return { duplicate: true };
      if (eventResult === "conflict") return { error: "Transaction identifier is already linked to another payment.", status: 409 as const };
      if (current) await tx.update(subscriptions).set({ status: "expired", updatedAt: now }).where(eq(subscriptions.id, current.id));
      await tx.update(subscriptions).set({ status: "active", paymentMode: "paystack", startsAt: startAt, expiresAt, updatedAt: now }).where(eq(subscriptions.id, nextSubscription.id));
      await tx.update(payments).set({ status: "paid", paystackTransactionId: validTransactionId, paidAt: data.paid_at ? new Date(data.paid_at) : now, webhookPayload: { event: "charge.success", transactionId: validTransactionId, reference: validReference, amount: data.amount, currency: data.currency, paidAt: data.paid_at ?? null } }).where(eq(payments.id, payment.id));
      await tx.insert(auditEvents).values({ gymId: payment.gymId, actorLabel: "paystack_webhook", action: "gym_payment.paid", subjectType: "payment", subjectId: payment.id, metadata: { transactionId: validTransactionId, reference: validReference, amountKobo: payment.amountKobo } });
      return { paid: true, paymentType };
    });
    if ("error" in result) return NextResponse.json({ error: result.error }, { status: result.status });
    return NextResponse.json({ received: true, ...result });
  } catch {
    return NextResponse.json({ error: "Could not process the payment notification." }, { status: 503 });
  }
}
