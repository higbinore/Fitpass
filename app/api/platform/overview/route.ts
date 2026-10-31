import { and, count, countDistinct, desc, eq, gt, gte, isNull, lt, lte, sql } from "drizzle-orm";
import { NextResponse } from "next/server";

import { requirePlatformAdmin } from "@/lib/authz";
import { getDb } from "@/lib/db";
import { auditEvents, gymApplications, gymMembershipRoles, gymMemberships, gyms, platformPackages, platformPayments, platformSubscriptions } from "@/lib/schema";

function parseDate(value: string | null): Date | null {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value ? null : date;
}

export async function GET(request: Request) {
  try {
    await requirePlatformAdmin();
    const db = getDb();
    const now = new Date();
    const params = new URL(request.url).searchParams;
    const requestedFrom = params.get("from");
    const requestedTo = params.get("to");
    if (Boolean(requestedFrom) !== Boolean(requestedTo)) return NextResponse.json({ error: "Provide both report dates." }, { status: 400 });
    const parsedFrom = requestedFrom ? parseDate(requestedFrom) : null;
    const parsedTo = requestedTo ? parseDate(requestedTo) : null;
    if (requestedFrom && (!parsedFrom || !parsedTo || parsedFrom > parsedTo)) return NextResponse.json({ error: "Choose a valid report date range." }, { status: 400 });
    const fromDate = parsedFrom ?? new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 5, 1));
    const toDate = parsedTo ?? new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    const from = new Date(fromDate.getTime() - 60 * 60 * 1000);
    const until = new Date(toDate.getTime() + 23 * 60 * 60 * 1000);
    if (until.getTime() - from.getTime() > 367 * 86400000) return NextResponse.json({ error: "Report ranges cannot exceed 366 days." }, { status: 400 });
    const firstMonth = new Date(Date.UTC(fromDate.getUTCFullYear(), fromDate.getUTCMonth(), 1));
    const lastMonth = new Date(Date.UTC(toDate.getUTCFullYear(), toDate.getUTCMonth(), 1));
    const revenueMonth = sql<string>`to_char(date_trunc('month', ${platformPayments.paidAt}), 'YYYY-MM')`;
    const gymMonth = sql<string>`to_char(date_trunc('month', ${gyms.createdAt}), 'YYYY-MM')`;

    const [
      [totalGyms], [activeGyms], [suspendedGyms], [archivedGyms], [pendingApplications], [activeMembers], [activeSubscriptions], [activeTrials], [trialsExpiringSoon], [overdueSubscriptions], [mrr], [outstanding],
      revenueRows, gymRows, recentApplications, recentGyms, recentSubscriptions, recentPayments, activity,
    ] = await Promise.all([
      db.select({ total: count() }).from(gyms),
      db.select({ total: count() }).from(gyms).where(eq(gyms.status, "active")),
      db.select({ total: count() }).from(gyms).where(eq(gyms.status, "suspended")),
      db.select({ total: count() }).from(gyms).where(eq(gyms.status, "archived")),
      db.select({ total: count() }).from(gymApplications).where(eq(gymApplications.status, "pending")),
        db.select({ total: countDistinct(gymMemberships.id) }).from(gymMemberships)
        .innerJoin(gymMembershipRoles, and(eq(gymMembershipRoles.gymId, gymMemberships.gymId), eq(gymMembershipRoles.membershipId, gymMemberships.id)))
        .innerJoin(gyms, eq(gyms.id, gymMemberships.gymId))
        .where(and(eq(gymMemberships.status, "active"), eq(gyms.status, "active"), eq(gymMembershipRoles.role, "gym_member"), isNull(gymMembershipRoles.revokedAt))),
      db.select({ total: count() }).from(platformSubscriptions).where(and(eq(platformSubscriptions.status, "active"), gt(platformSubscriptions.currentPeriodEnd, now))),
      db.select({ total: count() }).from(platformSubscriptions).where(and(eq(platformSubscriptions.status, "trialing"), gt(platformSubscriptions.currentPeriodEnd, now))),
      db.select({ total: count() }).from(platformSubscriptions).where(and(eq(platformSubscriptions.status, "trialing"), gt(platformSubscriptions.currentPeriodEnd, now), lte(platformSubscriptions.currentPeriodEnd, new Date(now.getTime() + 7 * 86400000)))),
      db.select({ total: count() }).from(platformSubscriptions).where(eq(platformSubscriptions.status, "past_due")),
      db.select({ totalKobo: sql<string>`coalesce(sum(${platformPackages.priceKobo}), 0)` }).from(platformSubscriptions)
        .innerJoin(platformPackages, eq(platformPackages.id, platformSubscriptions.packageId))
        .where(and(eq(platformSubscriptions.status, "active"), eq(platformSubscriptions.paymentMode, "paystack"), gt(platformSubscriptions.currentPeriodEnd, now), eq(platformPackages.billingInterval, "month"))),
      db.select({ total: count(), totalKobo: sql<string>`coalesce(sum(${platformPayments.amountKobo}), 0)` }).from(platformPayments).where(and(eq(platformPayments.status, "pending"), eq(platformPayments.paymentMode, "paystack"))),
      db.select({ month: revenueMonth, totalKobo: sql<string>`coalesce(sum(${platformPayments.amountKobo}), 0)` }).from(platformPayments)
        .where(and(eq(platformPayments.status, "paid"), eq(platformPayments.paymentMode, "paystack"), gte(platformPayments.paidAt, from), lt(platformPayments.paidAt, until)))
        .groupBy(revenueMonth).orderBy(revenueMonth),
      db.select({ month: gymMonth, total: count() }).from(gyms).where(and(gte(gyms.createdAt, from), lt(gyms.createdAt, until))).groupBy(gymMonth).orderBy(gymMonth),
      db.select({ id: gymApplications.id, gymName: gymApplications.gymName, applicantName: gymApplications.applicantName, applicantEmail: gymApplications.applicantEmail, requestedSlug: gymApplications.requestedSlug, location: gymApplications.location, createdAt: gymApplications.createdAt }).from(gymApplications).where(eq(gymApplications.status, "pending")).orderBy(desc(gymApplications.createdAt)).limit(5),
      db.select({ id: gyms.id, name: gyms.name, slug: gyms.slug, status: gyms.status, createdAt: gyms.createdAt }).from(gyms).orderBy(desc(gyms.createdAt)).limit(5),
      db.select({ id: platformSubscriptions.id, gymName: gyms.name, packageName: platformPackages.name, status: platformSubscriptions.status, currentPeriodEnd: platformSubscriptions.currentPeriodEnd, priceKobo: platformPackages.priceKobo, billingInterval: platformPackages.billingInterval }).from(platformSubscriptions)
        .innerJoin(gyms, eq(gyms.id, platformSubscriptions.gymId)).innerJoin(platformPackages, eq(platformPackages.id, platformSubscriptions.packageId)).orderBy(desc(platformSubscriptions.createdAt)).limit(6),
      db.select({ id: platformPayments.id, gymName: gyms.name, amountKobo: platformPayments.amountKobo, currency: platformPayments.currency, status: platformPayments.status, paymentMode: platformPayments.paymentMode, createdAt: platformPayments.createdAt, paidAt: platformPayments.paidAt }).from(platformPayments)
        .innerJoin(gyms, eq(gyms.id, platformPayments.gymId)).orderBy(desc(platformPayments.createdAt)).limit(8),
      db.select({ id: auditEvents.id, actorLabel: auditEvents.actorLabel, action: auditEvents.action, subjectType: auditEvents.subjectType, createdAt: auditEvents.createdAt }).from(auditEvents).orderBy(desc(auditEvents.createdAt)).limit(8),
    ]);

    const monthLength = (lastMonth.getUTCFullYear() - firstMonth.getUTCFullYear()) * 12 + lastMonth.getUTCMonth() - firstMonth.getUTCMonth() + 1;
    const monthKeys = Array.from({ length: monthLength }, (_, index) => {
      const month = new Date(Date.UTC(firstMonth.getUTCFullYear(), firstMonth.getUTCMonth() + index, 1));
      return { key: month.toISOString().slice(0, 7), label: month.toLocaleDateString("en-NG", { month: "short", timeZone: "UTC" }) };
    });
    const revenueByMonth = new Map(revenueRows.map((row) => [row.month, row.totalKobo]));
    const gymsByMonth = new Map(gymRows.map((row) => [row.month, row.total]));

    return NextResponse.json({
      metrics: {
        totalGyms: totalGyms.total,
        activeGyms: activeGyms.total,
        suspendedGyms: suspendedGyms.total,
        archivedGyms: archivedGyms.total,
        pendingApplications: pendingApplications.total,
        activeMembers: activeMembers.total,
        activePlatformSubscriptions: activeSubscriptions.total,
        activeTrials: activeTrials.total,
        trialsExpiringSoon: trialsExpiringSoon.total,
        overduePlatformSubscriptions: overdueSubscriptions.total,
        monthlyRecurringRevenueKobo: mrr.totalKobo,
        outstandingPayments: outstanding.total,
        outstandingPaymentsKobo: outstanding.totalKobo,
      },
      trends: monthKeys.map(({ key, label }) => ({ month: key, label, revenueKobo: revenueByMonth.get(key) ?? "0", gyms: gymsByMonth.get(key) ?? 0 })),
      reportPeriod: { from: requestedFrom ?? fromDate.toISOString().slice(0, 10), to: requestedTo ?? toDate.toISOString().slice(0, 10) },
      recentApplications,
      recentGyms,
      recentSubscriptions: recentSubscriptions.map((item) => ({ ...item, status: item.status === "trialing" && item.currentPeriodEnd <= now ? "expired" : item.status })),
      recentPayments,
      activity,
      packages: await db.select({ id: platformPackages.id, name: platformPackages.name, priceKobo: platformPackages.priceKobo, billingInterval: platformPackages.billingInterval, activeMemberLimit: platformPackages.activeMemberLimit, adminAccountLimit: platformPackages.adminAccountLimit, isActive: platformPackages.isActive, features: platformPackages.features }).from(platformPackages).orderBy(platformPackages.sortOrder, platformPackages.name),
    });
  } catch (error) {
    const denied = error instanceof Error && error.name === "AuthorizationError";
    return NextResponse.json({ error: denied ? "Platform administrator access required." : "Could not load platform overview." }, { status: denied ? 403 : 503 });
  }
}
