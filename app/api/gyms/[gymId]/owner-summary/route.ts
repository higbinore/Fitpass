import { and, count, desc, eq, gt, gte, lte, sql } from "drizzle-orm";
import { NextResponse } from "next/server";

import { AuthorizationError, requireActiveGymOwner } from "@/lib/authz";
import { getDb } from "@/lib/db";
import { checkins, gyms, gymMemberships, gymMembershipRoles, members, payments, plans, subscriptions } from "@/lib/schema";

function startOfTodayInBenin(now: Date): Date {
  const localTime = new Date(now.getTime() + 60 * 60 * 1000);
  localTime.setUTCHours(0, 0, 0, 0);
  return new Date(localTime.getTime() - 60 * 60 * 1000);
}

export async function GET(_request: Request, context: { params: Promise<{ gymId: string }> }) {
  try {
    const { gymId } = await context.params;
    await requireActiveGymOwner(gymId);
    const db = getDb();
    const now = new Date();
    const todayStart = startOfTodayInBenin(now);
    const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    const expiringBefore = new Date(now.getTime() + 7 * 86400000);
    const newMemberStart = new Date(now.getTime() - 30 * 86400000);
    const [gym] = await db.select({ id: gyms.id, name: gyms.name, slug: gyms.slug, status: gyms.status, contactPhone: gyms.contactPhone, contactEmail: gyms.contactEmail, location: gyms.location, description: gyms.description, openingHours: gyms.openingHours, amenities: gyms.amenities, equipment: gyms.equipment, maxDailyCheckins: gyms.maxDailyCheckins, latitude: gyms.latitude, longitude: gyms.longitude, locationSource: gyms.locationSource, locationVerifiedAt: gyms.locationVerifiedAt, logoUrl: gyms.logoUrl, facilityPhotoUrls: gyms.facilityPhotoUrls }).from(gyms).where(eq(gyms.id, gymId)).limit(1);
    if (!gym) return NextResponse.json({ error: "Gym not found." }, { status: 404 });
    const [
      [memberCount], [activeSubscriptions], [paidIncome], [monthIncome], [todayCheckins], [newMembers], [pendingPayments],
      expiringMemberships, recentCheckins, recentPayments,
    ] = await Promise.all([
      db.select({ total: count() }).from(members).where(eq(members.gymId, gymId)),
      db.select({ total: count() }).from(subscriptions).where(and(eq(subscriptions.gymId, gymId), eq(subscriptions.status, "active"), lte(subscriptions.startsAt, now), gt(subscriptions.expiresAt, now))),
      db.select({ totalKobo: sql<string>`coalesce(sum(${payments.amountKobo}), 0)` }).from(payments).where(and(eq(payments.gymId, gymId), eq(payments.status, "paid"), eq(payments.paymentMode, "paystack"))),
      db.select({ totalKobo: sql<string>`coalesce(sum(${payments.amountKobo}), 0)` }).from(payments).where(and(eq(payments.gymId, gymId), eq(payments.status, "paid"), eq(payments.paymentMode, "paystack"), gte(payments.paidAt, monthStart))),
      db.select({ total: count() }).from(checkins).where(and(eq(checkins.gymId, gymId), gte(checkins.createdAt, todayStart))),
      db.select({ total: count() }).from(members).where(and(eq(members.gymId, gymId), gte(members.createdAt, newMemberStart))),
      db.select({ total: count(), totalKobo: sql<string>`coalesce(sum(${payments.amountKobo}), 0)` }).from(payments).where(and(eq(payments.gymId, gymId), eq(payments.status, "pending"), eq(payments.paymentMode, "paystack"))),
      db.select({ id: subscriptions.id, memberName: members.fullName, planName: plans.name, expiresAt: subscriptions.expiresAt })
        .from(subscriptions).innerJoin(members, and(eq(members.gymId, subscriptions.gymId), eq(members.id, subscriptions.memberId)))
        .innerJoin(plans, and(eq(plans.gymId, subscriptions.gymId), eq(plans.id, subscriptions.planId)))
        .where(and(eq(subscriptions.gymId, gymId), eq(subscriptions.status, "active"), lte(subscriptions.startsAt, now), gt(subscriptions.expiresAt, now), lte(subscriptions.expiresAt, expiringBefore)))
        .orderBy(subscriptions.expiresAt).limit(6),
      db.select({ id: checkins.id, memberName: members.fullName, checkedInAt: checkins.createdAt })
        .from(checkins).innerJoin(members, and(eq(members.gymId, checkins.gymId), eq(members.id, checkins.memberId)))
        .where(and(eq(checkins.gymId, gymId), gte(checkins.createdAt, todayStart)))
        .orderBy(desc(checkins.createdAt)).limit(8),
      db.select({ id: payments.id, memberName: members.fullName, planName: plans.name, amountKobo: payments.amountKobo, status: payments.status, paymentMode: payments.paymentMode, createdAt: payments.createdAt, paidAt: payments.paidAt })
        .from(payments).innerJoin(members, and(eq(members.gymId, payments.gymId), eq(members.id, payments.memberId)))
        .innerJoin(plans, and(eq(plans.gymId, payments.gymId), eq(plans.id, payments.planId)))
        .where(eq(payments.gymId, gymId)).orderBy(desc(payments.createdAt)).limit(8),
    ]);
    const [staffCount] = await db.select({ total: count() }).from(gymMemberships)
      .innerJoin(gymMembershipRoles, and(eq(gymMembershipRoles.gymId, gymMemberships.gymId), eq(gymMembershipRoles.membershipId, gymMemberships.id)))
      .where(and(eq(gymMemberships.gymId, gymId), eq(gymMemberships.status, "active"), sql`${gymMembershipRoles.role} in ('gym_owner', 'gym_desk_staff')`, sql`${gymMembershipRoles.revokedAt} is null`));
    return NextResponse.json({
      gym,
      members: memberCount.total,
      activeSubscriptions: activeSubscriptions.total,
      paidIncomeKobo: paidIncome.totalKobo,
      monthIncomeKobo: monthIncome.totalKobo,
      checkins: todayCheckins.total,
      newMembers: newMembers.total,
      expiringMemberships,
      recentCheckins,
      recentPayments,
      pendingPayments: pendingPayments.total,
      pendingPaymentsKobo: pendingPayments.totalKobo,
      administrativeRoles: staffCount.total,
    });
  } catch (error) {
    const status = error instanceof AuthorizationError ? 403 : 503;
    return NextResponse.json({ error: error instanceof AuthorizationError ? error.message : "Could not load gym summary." }, { status });
  }
}
