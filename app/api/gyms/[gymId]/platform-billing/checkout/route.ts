import { randomBytes } from "node:crypto";
import { and, count, countDistinct, desc, eq, inArray, isNull, lte } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";

import { AuthorizationError, requireVerifiedUser, requireGymOwner } from "@/lib/authz";
import { getDb } from "@/lib/db";
import { getPaymentEnv } from "@/lib/env";
import { getPaymentMode } from "@/lib/payment-mode";
import { gyms, gymMembershipRoles, gymMemberships, gymOnboarding, paymentReferenceRegistry, platformPackages, platformPayments, platformSubscriptions } from "@/lib/schema";
import { hasActiveGymRoleInTransaction } from "@/lib/transaction-authz";
import { trialDaysRemaining } from "@/lib/trial-policy";

const schema = z.object({ packageId: z.string().uuid() });

/** Owner-only view of this gym's FitPass subscription, usage, and billing history. */
export async function GET(request: Request, context: { params: Promise<{ gymId: string }> }) {
  try {
    const { gymId } = await context.params;
    await requireGymOwner(gymId);
    const page = Number(new URL(request.url).searchParams.get("page") ?? "1");
    if (!Number.isInteger(page) || page < 1) return NextResponse.json({ error: "Payment history page is invalid." }, { status: 400 });
    const db = getDb();
    const pageSize = 20;
    const [[subscription], payments, [members], [admins]] = await Promise.all([
      db.select({ id: platformSubscriptions.id, status: platformSubscriptions.status, startsAt: platformSubscriptions.startsAt, currentPeriodEnd: platformSubscriptions.currentPeriodEnd, packageName: platformPackages.name, packagePriceKobo: platformPackages.priceKobo, customPriceKobo: platformSubscriptions.customPriceKobo, pricingNote: platformSubscriptions.pricingNote, activeMemberLimit: platformPackages.activeMemberLimit, adminAccountLimit: platformPackages.adminAccountLimit, billingInterval: platformPackages.billingInterval })
        .from(platformSubscriptions).innerJoin(platformPackages, eq(platformPackages.id, platformSubscriptions.packageId))
        .where(eq(platformSubscriptions.gymId, gymId)).orderBy(desc(platformSubscriptions.createdAt)).limit(1),
      db.select({ id: platformPayments.id, amountKobo: platformPayments.amountKobo, status: platformPayments.status, paymentMode: platformPayments.paymentMode, reference: platformPayments.reference, createdAt: platformPayments.createdAt, paidAt: platformPayments.paidAt })
        .from(platformPayments).where(eq(platformPayments.gymId, gymId)).orderBy(desc(platformPayments.createdAt), desc(platformPayments.id)).limit(pageSize).offset((page - 1) * pageSize),
      db.select({ total: countDistinct(gymMemberships.id) }).from(gymMemberships)
        .innerJoin(gymMembershipRoles, and(eq(gymMembershipRoles.gymId, gymMemberships.gymId), eq(gymMembershipRoles.membershipId, gymMemberships.id)))
        .where(and(eq(gymMemberships.gymId, gymId), eq(gymMemberships.status, "active"), eq(gymMembershipRoles.role, "gym_member"), isNull(gymMembershipRoles.revokedAt))),
      db.select({ total: countDistinct(gymMemberships.id) }).from(gymMemberships)
        .innerJoin(gymMembershipRoles, and(eq(gymMembershipRoles.gymId, gymMemberships.gymId), eq(gymMembershipRoles.membershipId, gymMemberships.id)))
        .where(and(eq(gymMemberships.gymId, gymId), eq(gymMemberships.status, "active"), inArray(gymMembershipRoles.role, ["gym_owner", "gym_desk_staff"]), isNull(gymMembershipRoles.revokedAt))),
    ]);
    const [paymentCount] = await db.select({ total: count() }).from(platformPayments).where(eq(platformPayments.gymId, gymId));
    const now = new Date();
    if (subscription?.status === "trialing" && subscription.currentPeriodEnd <= now) {
      await db.update(platformSubscriptions).set({ status: "expired", updatedAt: now })
        .where(and(eq(platformSubscriptions.id, subscription.id), eq(platformSubscriptions.status, "trialing"), lte(platformSubscriptions.currentPeriodEnd, now)));
    }
    const [onboarding] = await db.select({ trialActivatedAt: gymOnboarding.trialActivatedAt, trialExpiresAt: gymOnboarding.trialExpiresAt })
      .from(gymOnboarding).where(eq(gymOnboarding.gymId, gymId)).limit(1);
    const trialStatus = onboarding?.trialActivatedAt
      ? onboarding.trialExpiresAt && onboarding.trialExpiresAt > now ? "trialing" : "expired"
      : "not_started";
    const billingSubscription = subscription
      ? { ...subscription, status: subscription.status === "trialing" && subscription.currentPeriodEnd <= now ? "expired" : subscription.status, trialDaysRemaining: subscription.status === "trialing" ? trialDaysRemaining(subscription.currentPeriodEnd, now) : null }
      : null;
    return NextResponse.json({ subscription: billingSubscription, trial: { status: trialStatus, activatedAt: onboarding?.trialActivatedAt ?? null, expiresAt: onboarding?.trialExpiresAt ?? null, daysRemaining: onboarding?.trialExpiresAt && trialStatus === "trialing" ? trialDaysRemaining(onboarding.trialExpiresAt, now) : 0 }, usage: { activeMembers: members.total, activeAdminAccounts: admins.total }, payments, paymentHistory: { page, pageSize, total: paymentCount.total, hasMore: page * pageSize < paymentCount.total } });
  } catch (error) {
    const denied = error instanceof AuthorizationError;
    return NextResponse.json({ error: denied ? error.message : "Could not load FitPass billing." }, { status: denied ? 403 : 503 });
  }
}

/** Initializes the gym's independent FitPass platform subscription payment. */
export async function POST(request: Request, context: { params: Promise<{ gymId: string }> }) {
  try {
    const identity = await requireVerifiedUser();
    const { gymId } = await context.params;
    const owner = await requireGymOwner(gymId);
    const parsed = schema.safeParse(await request.json());
    if (!parsed.success) return NextResponse.json({ error: "Choose an available FitPass package." }, { status: 400 });
    const paymentMode = getPaymentMode();
    // Fail before creating pending billing records if Paystack configuration is unavailable.
    const env = paymentMode === "paystack" ? getPaymentEnv() : null;
    const reference = `fitpass_${paymentMode === "demo" ? "demo_platform" : "platform"}_${randomBytes(18).toString("hex")}`;

    const charge = await getDb().transaction(async (tx) => {
      const [gym] = await tx.select({ status: gyms.status }).from(gyms).where(eq(gyms.id, gymId)).for("update").limit(1);
      if (!gym || gym.status !== "active") return { error: "Archived gyms cannot start billing.", statusCode: 410 as const };
      if (!await hasActiveGymRoleInTransaction(tx, { gymId, userId: owner.userId, membershipId: owner.membershipId, role: "gym_owner" })) return { error: "An active gym owner role is required.", statusCode: 403 as const };
      const [pkg] = await tx.select().from(platformPackages).where(and(eq(platformPackages.id, parsed.data.packageId), eq(platformPackages.isActive, true))).limit(1);
      if (!pkg) return { error: "Package is unavailable.", statusCode: 404 as const };

      const [current] = await tx.select().from(platformSubscriptions).where(and(eq(platformSubscriptions.gymId, gymId), inArray(platformSubscriptions.status, ["pending_payment", "trialing", "active", "past_due"]))).for("update").limit(1);
      const existing = current?.status === "trialing" && current.currentPeriodEnd <= new Date()
        ? (await tx.update(platformSubscriptions).set({ status: "expired", updatedAt: new Date() }).where(eq(platformSubscriptions.id, current.id)), null)
        : current;
      if (existing?.status === "pending_payment") return { error: "A FitPass subscription payment is already pending for this gym.", statusCode: 409 as const };
      const amountKobo = existing?.packageId === pkg.id && existing.customPriceKobo !== null ? existing.customPriceKobo : pkg.priceKobo;
      const [registeredReference] = await tx.insert(paymentReferenceRegistry).values({ reference, paymentType: "platform" }).onConflictDoNothing().returning({ reference: paymentReferenceRegistry.reference });
      if (!registeredReference) return { error: "Could not reserve this payment reference.", statusCode: 409 as const };
      let subscriptionId: string;
      if (existing) {
        subscriptionId = existing.id;
      } else {
        const now = new Date();
        const [created] = await tx.insert(platformSubscriptions).values({ gymId, packageId: pkg.id, paymentMode, status: "pending_payment", startsAt: now, currentPeriodEnd: now }).returning({ id: platformSubscriptions.id });
        subscriptionId = created.id;
      }
      const [payment] = await tx.insert(platformPayments).values({ gymId, platformSubscriptionId: subscriptionId, platformPackageId: pkg.id, reference, paymentMode, amountKobo }).returning({ id: platformPayments.id });
      return { paymentId: payment.id, amountKobo, packageId: pkg.id, subscriptionId };
    });
    if ("error" in charge) return NextResponse.json({ error: charge.error }, { status: charge.statusCode });

    if (paymentMode === "demo") return NextResponse.json({ demoUrl: `/payment/demo?type=platform&reference=${encodeURIComponent(reference)}`, reference, paymentMode }, { status: 201 });
    if (!env) throw new Error("Paystack configuration is unavailable.");
    const response = await fetch("https://api.paystack.co/transaction/initialize", {
      method: "POST",
      headers: { Authorization: `Bearer ${env.PAYSTACK_SECRET_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ email: identity.email, amount: charge.amountKobo, currency: "NGN", reference, callback_url: new URL("/billing/complete", env.BETTER_AUTH_URL).toString(), metadata: { payment_type: "platform", gym_id: gymId, package_id: charge.packageId, paid_by: identity.userId } }),
      cache: "no-store",
    });
    const payload = await response.json() as { status?: boolean; data?: { authorization_url?: string; reference?: string } };
    if (!response.ok || !payload.status || !payload.data?.authorization_url || payload.data.reference !== reference) throw new Error("Paystack did not initialize this payment.");
    return NextResponse.json({ authorizationUrl: payload.data.authorization_url, reference, paymentMode }, { status: 201 });
  } catch (error) {
    const status = error instanceof AuthorizationError ? 403 : 503;
    const message = error instanceof AuthorizationError ? error.message : "Could not start FitPass billing right now.";
    return NextResponse.json({ error: message }, { status });
  }
}
