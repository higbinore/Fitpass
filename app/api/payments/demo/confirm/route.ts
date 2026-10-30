import { and, eq, gt } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";

import { AuthorizationError, requireGymMember, requireGymOwner } from "@/lib/authz";
import { getDb } from "@/lib/db";
import { addCalendarMonth, calculateGymSubscriptionWindow } from "@/lib/paystack-security";
import { auditEvents, gyms, members, payments, platformPayments, platformSubscriptions, plans, subscriptions } from "@/lib/schema";
import { hasActiveGymRoleInTransaction } from "@/lib/transaction-authz";

const inputSchema = z.object({ reference: z.string().regex(/^fitpass_demo_(?:gym|platform)_[a-f0-9]{36}$/), outcome: z.enum(["success", "failure"]) });

/** Explicit simulation endpoint. It is never used by Paystack and never initiates a charge. */
export async function POST(request: Request) {
  try {
    const parsed = inputSchema.safeParse(await request.json());
    if (!parsed.success) return NextResponse.json({ error: "Choose a valid demo payment outcome." }, { status: 400 });
    const { reference, outcome } = parsed.data;
    const db = getDb();

    if (reference.startsWith("fitpass_demo_gym_")) {
      const [candidate] = await db.select({ gymId: payments.gymId }).from(payments).where(eq(payments.reference, reference)).limit(1);
      if (!candidate) return NextResponse.json({ error: "Demo payment not found." }, { status: 404 });
      const actor = await requireGymMember(candidate.gymId);
      const result = await db.transaction(async (tx) => {
        const [gym] = await tx.select({ status: gyms.status }).from(gyms).where(eq(gyms.id, candidate.gymId)).for("update").limit(1);
        if (!gym || gym.status !== "active") return { error: "This gym cannot process a demo sale.", code: 409 as const };
        if (!await hasActiveGymRoleInTransaction(tx, { gymId: candidate.gymId, userId: actor.userId, membershipId: actor.membershipId, role: "gym_member" })) return { error: "Active member access is required.", code: 403 as const };
        const [member] = await tx.select({ id: members.id }).from(members).where(and(eq(members.gymId, candidate.gymId), eq(members.userId, actor.userId))).limit(1);
        const [payment] = await tx.select().from(payments).where(and(eq(payments.reference, reference), eq(payments.gymId, candidate.gymId))).for("update").limit(1);
        if (!member || !payment || payment.memberId !== member.id || payment.paymentMode !== "demo") return { error: "Demo payment not found for this account.", code: 404 as const };
        if (payment.status === "paid") return { duplicate: true, status: "paid" as const };
        if (payment.status === "failed") return { duplicate: true, status: "failed" as const };
        if (payment.status !== "pending" || !payment.subscriptionId) return { error: "This demo payment is no longer pending.", code: 409 as const };
        const [subscription] = await tx.select().from(subscriptions).where(and(eq(subscriptions.gymId, candidate.gymId), eq(subscriptions.id, payment.subscriptionId), eq(subscriptions.memberId, payment.memberId))).for("update").limit(1);
        if (!subscription || subscription.status !== "pending") return { error: "The pending membership record is unavailable.", code: 409 as const };
        const now = new Date();
        if (outcome === "failure") {
          await tx.update(payments).set({ status: "failed", updatedAt: now }).where(eq(payments.id, payment.id));
          await tx.update(subscriptions).set({ status: "cancelled", updatedAt: now }).where(eq(subscriptions.id, subscription.id));
          await tx.insert(auditEvents).values({ gymId: candidate.gymId, actorUserId: actor.userId, actorLabel: "demo_payment", action: "gym_payment.demo_failed", subjectType: "payment", subjectId: payment.id, metadata: { paymentMode: "demo" } });
          return { status: "failed" as const };
        }
        const [plan] = await tx.select({ durationDays: plans.durationDays }).from(plans).where(and(eq(plans.gymId, candidate.gymId), eq(plans.id, payment.planId))).limit(1);
        if (!plan) return { error: "Membership plan history is unavailable.", code: 409 as const };
        const [current] = await tx.select().from(subscriptions).where(and(eq(subscriptions.gymId, candidate.gymId), eq(subscriptions.memberId, payment.memberId), eq(subscriptions.status, "active"), gt(subscriptions.expiresAt, now))).for("update").limit(1);
        const period = calculateGymSubscriptionWindow(now, current?.expiresAt ?? null, plan.durationDays);
        if (current) await tx.update(subscriptions).set({ status: "expired", updatedAt: now }).where(eq(subscriptions.id, current.id));
        await tx.update(subscriptions).set({ status: "active", paymentMode: "demo", startsAt: period.startsAt, expiresAt: period.expiresAt, updatedAt: now }).where(eq(subscriptions.id, subscription.id));
        await tx.update(payments).set({ status: "paid", paidAt: now, updatedAt: now }).where(eq(payments.id, payment.id));
        await tx.insert(auditEvents).values({ gymId: candidate.gymId, actorUserId: actor.userId, actorLabel: "demo_payment", action: "gym_payment.demo_paid", subjectType: "payment", subjectId: payment.id, metadata: { paymentMode: "demo", amountKobo: payment.amountKobo } });
        return { status: "paid" as const };
      });
      if ("error" in result) return NextResponse.json({ error: result.error }, { status: result.code });
      return NextResponse.json({ type: "gym", paymentMode: "demo", ...result });
    }

    const [candidate] = await db.select({ gymId: platformPayments.gymId }).from(platformPayments).where(eq(platformPayments.reference, reference)).limit(1);
    if (!candidate) return NextResponse.json({ error: "Demo payment not found." }, { status: 404 });
    const actor = await requireGymOwner(candidate.gymId);
    const result = await db.transaction(async (tx) => {
      const [gym] = await tx.select({ status: gyms.status }).from(gyms).where(eq(gyms.id, candidate.gymId)).for("update").limit(1);
      if (!gym || gym.status !== "active") return { error: "Archived gyms cannot process FitPass billing.", code: 409 as const };
      if (!await hasActiveGymRoleInTransaction(tx, { gymId: candidate.gymId, userId: actor.userId, membershipId: actor.membershipId, role: "gym_owner" })) return { error: "Active owner access is required.", code: 403 as const };
      const [payment] = await tx.select().from(platformPayments).where(and(eq(platformPayments.reference, reference), eq(platformPayments.gymId, candidate.gymId))).for("update").limit(1);
      if (!payment || payment.paymentMode !== "demo") return { error: "Demo payment not found for this gym.", code: 404 as const };
      if (payment.status === "paid") return { duplicate: true, status: "paid" as const };
      if (payment.status === "failed") return { duplicate: true, status: "failed" as const };
      if (payment.status !== "pending") return { error: "This demo payment is no longer pending.", code: 409 as const };
      const [subscription] = await tx.select().from(platformSubscriptions).where(and(eq(platformSubscriptions.gymId, candidate.gymId), eq(platformSubscriptions.id, payment.platformSubscriptionId))).for("update").limit(1);
      if (!subscription) return { error: "FitPass subscription history is unavailable.", code: 409 as const };
      const now = new Date();
      if (outcome === "failure") {
        await tx.update(platformPayments).set({ status: "failed" }).where(eq(platformPayments.id, payment.id));
        if (subscription.status === "pending_payment") await tx.update(platformSubscriptions).set({ status: "cancelled", updatedAt: now }).where(eq(platformSubscriptions.id, subscription.id));
        await tx.insert(auditEvents).values({ gymId: candidate.gymId, actorUserId: actor.userId, actorLabel: "demo_payment", action: "platform_payment.demo_failed", subjectType: "platform_payment", subjectId: payment.id, metadata: { paymentMode: "demo" } });
        return { status: "failed" as const };
      }
      const periodStart = subscription.status === "active" && subscription.currentPeriodEnd > now ? subscription.currentPeriodEnd : now;
      const periodEnd = addCalendarMonth(periodStart);
      await tx.update(platformPayments).set({ status: "paid", paidAt: now }).where(eq(platformPayments.id, payment.id));
      await tx.update(platformSubscriptions).set({ packageId: payment.platformPackageId, paymentMode: "demo", customPriceKobo: subscription.packageId === payment.platformPackageId ? subscription.customPriceKobo : null, pricingNote: subscription.packageId === payment.platformPackageId ? subscription.pricingNote : null, status: "active", startsAt: now, currentPeriodEnd: periodEnd, updatedAt: now }).where(eq(platformSubscriptions.id, subscription.id));
      await tx.insert(auditEvents).values({ gymId: candidate.gymId, actorUserId: actor.userId, actorLabel: "demo_payment", action: "platform_payment.demo_paid", subjectType: "platform_payment", subjectId: payment.id, metadata: { paymentMode: "demo", amountKobo: payment.amountKobo } });
      return { status: "paid" as const };
    });
    if ("error" in result) return NextResponse.json({ error: result.error }, { status: result.code });
    return NextResponse.json({ type: "platform", paymentMode: "demo", ...result });
  } catch (error) {
    const denied = error instanceof AuthorizationError;
    return NextResponse.json({ error: denied ? error.message : "Could not process the demo payment." }, { status: denied ? 403 : 503 });
  }
}
