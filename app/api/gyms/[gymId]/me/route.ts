import { and, count, desc, eq } from "drizzle-orm";
import { NextResponse } from "next/server";

import { AuthorizationError, requireVerifiedUser, requireOwnMemberRecord } from "@/lib/authz";
import { getDb } from "@/lib/db";
import { checkins, gyms, members, payments, plans, subscriptions } from "@/lib/schema";

export async function GET(request: Request, context: { params: Promise<{ gymId: string }> }) {
  try {
    const identity = await requireVerifiedUser();
    const { gymId } = await context.params;
    const [candidate] = await getDb().select({ id: members.id }).from(members).where(and(eq(members.gymId, gymId), eq(members.userId, identity.userId))).limit(1);
    if (!candidate) return NextResponse.json({ error: "Member profile not found." }, { status: 404 });
    await requireOwnMemberRecord(gymId, candidate.id);

    const params = new URL(request.url).searchParams;
    const page = (key: string) => {
      const value = Number(params.get(key) ?? "1");
      return Number.isInteger(value) && value > 0 && value <= 10000 ? value : null;
    };
    const subscriptionsPage = page("subscriptionsPage");
    const paymentsPage = page("paymentsPage");
    const checkinsPage = page("checkinsPage");
    if (!subscriptionsPage || !paymentsPage || !checkinsPage) return NextResponse.json({ error: "History page must be a positive whole number." }, { status: 400 });

    const db = getDb();
    const [gym] = await db.select({ name: gyms.name, logoUrl: gyms.logoUrl, facilityPhotoUrls: gyms.facilityPhotoUrls })
      .from(gyms).where(eq(gyms.id, gymId)).limit(1);
    const pageSize = 20;
    const [profile] = await db.select({ id: members.id, fullName: members.fullName, phone: members.phone, membershipCode: members.membershipCode, createdAt: members.createdAt })
      .from(members).where(and(eq(members.gymId, gymId), eq(members.id, candidate.id))).limit(1);
    const memberSubscriptions = await db.select({ id: subscriptions.id, planName: plans.name, status: subscriptions.status, startsAt: subscriptions.startsAt, expiresAt: subscriptions.expiresAt })
      .from(subscriptions).innerJoin(plans, and(eq(plans.gymId, subscriptions.gymId), eq(plans.id, subscriptions.planId)))
      .where(and(eq(subscriptions.gymId, gymId), eq(subscriptions.memberId, candidate.id))).orderBy(desc(subscriptions.createdAt), desc(subscriptions.id)).limit(pageSize).offset((subscriptionsPage - 1) * pageSize);
    const memberPayments = await db.select({ id: payments.id, planName: plans.name, amountKobo: payments.amountKobo, currency: payments.currency, status: payments.status, paymentMode: payments.paymentMode, paidAt: payments.paidAt, createdAt: payments.createdAt })
      .from(payments).innerJoin(plans, and(eq(plans.gymId, payments.gymId), eq(plans.id, payments.planId)))
      .where(and(eq(payments.gymId, gymId), eq(payments.memberId, candidate.id))).orderBy(desc(payments.createdAt), desc(payments.id)).limit(pageSize).offset((paymentsPage - 1) * pageSize);
    const memberCheckins = await db.select({ id: checkins.id, createdAt: checkins.createdAt })
      .from(checkins).where(and(eq(checkins.gymId, gymId), eq(checkins.memberId, candidate.id))).orderBy(desc(checkins.createdAt), desc(checkins.id)).limit(pageSize).offset((checkinsPage - 1) * pageSize);
    const [[subscriptionCount], [paymentCount], [checkinCount]] = await Promise.all([
      db.select({ total: count() }).from(subscriptions).where(and(eq(subscriptions.gymId, gymId), eq(subscriptions.memberId, candidate.id))),
      db.select({ total: count() }).from(payments).where(and(eq(payments.gymId, gymId), eq(payments.memberId, candidate.id))),
      db.select({ total: count() }).from(checkins).where(and(eq(checkins.gymId, gymId), eq(checkins.memberId, candidate.id))),
    ]);
    return NextResponse.json({ gym, member: profile, subscriptions: memberSubscriptions, payments: memberPayments, checkins: memberCheckins, pagination: { pageSize, subscriptionsPage, paymentsPage, checkinsPage, subscriptionsTotal: subscriptionCount.total, paymentsTotal: paymentCount.total, checkinsTotal: checkinCount.total } });
  } catch (error) {
    const status = error instanceof AuthorizationError ? 401 : 503;
    return NextResponse.json({ error: error instanceof AuthorizationError ? error.message : "Could not load member records." }, { status });
  }
}
