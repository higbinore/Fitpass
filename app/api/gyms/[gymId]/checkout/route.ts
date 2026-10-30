import { randomBytes } from "node:crypto";
import { and, eq, gt, inArray } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";

import { AuthorizationError, requireVerifiedUser, requireGymMember } from "@/lib/authz";
import { getDb } from "@/lib/db";
import { getPaymentEnv } from "@/lib/env";
import { members, paymentReferenceRegistry, payments, plans, platformSubscriptions, subscriptions, gyms } from "@/lib/schema";
import { hasActiveGymRoleInTransaction } from "@/lib/transaction-authz";
import { getPaymentMode } from "@/lib/payment-mode";

const checkoutSchema = z.object({ planId: z.string().uuid() });

export async function POST(request: Request, context: { params: Promise<{ gymId: string }> }) {
  try {
    const identity = await requireVerifiedUser();
    const { gymId } = await context.params;
    const gymMembership = await requireGymMember(gymId);
    const parsed = checkoutSchema.safeParse(await request.json());
    if (!parsed.success) return NextResponse.json({ error: "Choose a valid gym plan." }, { status: 400 });
    const paymentMode = getPaymentMode();
    // Fail before persisting a pending subscription when Paystack configuration is unavailable.
    const env = paymentMode === "paystack" ? getPaymentEnv() : null;
    const reference = `fitpass_${paymentMode === "demo" ? "demo_gym" : "gym"}_${randomBytes(18).toString("hex")}`;

    const result = await getDb().transaction(async (tx) => {
      const [gym] = await tx.select({ status: gyms.status }).from(gyms).where(eq(gyms.id, gymId)).for("update").limit(1);
      if (!gym || gym.status !== "active") return { error: "This gym cannot accept new sales.", statusCode: 410 as const };
      if (!await hasActiveGymRoleInTransaction(tx, { gymId, userId: identity.userId, membershipId: gymMembership.membershipId, role: "gym_member" })) return { error: "Active gym member access is required.", statusCode: 403 as const };
      const [packageAccess] = await tx.select({ id: platformSubscriptions.id }).from(platformSubscriptions)
        .where(and(eq(platformSubscriptions.gymId, gymId), inArray(platformSubscriptions.status, ["active", "trialing"]), gt(platformSubscriptions.currentPeriodEnd, new Date()))).for("update").limit(1);
      if (!packageAccess) return { error: "This gym is not currently accepting new memberships.", statusCode: 402 as const };
      const [member] = await tx.select({ id: members.id }).from(members).where(and(eq(members.gymId, gymId), eq(members.userId, identity.userId))).limit(1);
      const [plan] = await tx.select({ id: plans.id, priceKobo: plans.priceKobo, durationDays: plans.durationDays }).from(plans)
        .where(and(eq(plans.gymId, gymId), eq(plans.id, parsed.data.planId), eq(plans.isActive, true))).limit(1);
      if (!member || !plan) return { error: "Member profile or active plan was not found for this gym.", statusCode: 404 as const };
      const [pending] = await tx.select({ id: subscriptions.id }).from(subscriptions)
        .where(and(eq(subscriptions.gymId, gymId), eq(subscriptions.memberId, member.id), eq(subscriptions.status, "pending"))).limit(1);
      if (pending) return { error: "A payment is already pending for this member.", statusCode: 409 as const };
      const [registeredReference] = await tx.insert(paymentReferenceRegistry).values({ reference, paymentType: "gym" }).onConflictDoNothing().returning({ reference: paymentReferenceRegistry.reference });
      if (!registeredReference) return { error: "Could not reserve this payment reference.", statusCode: 409 as const };
      const now = new Date();
      const [subscription] = await tx.insert(subscriptions).values({ gymId, memberId: member.id, planId: plan.id, status: "pending", paymentMode, startsAt: now, expiresAt: new Date(now.getTime() + plan.durationDays * 86400000) }).returning({ id: subscriptions.id });
      const [payment] = await tx.insert(payments).values({ gymId, memberId: member.id, planId: plan.id, subscriptionId: subscription.id, reference, paymentMode, amountKobo: plan.priceKobo, status: "pending" }).returning({ id: payments.id });
      return { paymentId: payment.id, subscriptionId: subscription.id, reference, amountKobo: plan.priceKobo };
    });
    if ("error" in result) return NextResponse.json({ error: result.error }, { status: result.statusCode });
    if (paymentMode === "demo") return NextResponse.json({ demoUrl: `/payment/demo?type=gym&reference=${encodeURIComponent(result.reference)}`, reference: result.reference, paymentMode }, { status: 201 });
    if (!env) throw new Error("Paystack configuration is unavailable.");
    const response = await fetch("https://api.paystack.co/transaction/initialize", {
      method: "POST",
      headers: { Authorization: `Bearer ${env.PAYSTACK_SECRET_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ email: identity.email, amount: result.amountKobo, currency: "NGN", reference: result.reference, callback_url: new URL("/payment/complete", env.BETTER_AUTH_URL).toString(), metadata: { payment_type: "gym", gym_id: gymId } }),
      cache: "no-store",
    });
    const payload = await response.json() as { status?: boolean; data?: { authorization_url?: string; reference?: string } };
    if (!response.ok || !payload.status || !payload.data?.authorization_url || payload.data.reference !== result.reference) throw new Error("Paystack did not initialize this payment.");
    return NextResponse.json({ authorizationUrl: payload.data.authorization_url, reference: result.reference, paymentMode }, { status: 201 });
  } catch (error) {
    // A timeout can happen after Paystack has accepted the charge. Keep the
    // pending payment for reconciliation; never claim it failed from a client request.
    const status = error instanceof AuthorizationError ? 403 : 503;
    const message = error instanceof AuthorizationError ? error.message : "Could not start payment. Try again later.";
    return NextResponse.json({ error: message }, { status });
  }
}
