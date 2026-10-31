import { and, desc, eq, gt, gte, inArray, lt, lte, sql } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";

import { AuthorizationError, requireActiveGymDeskStaff } from "@/lib/authz";
import { getDb } from "@/lib/db";
import { checkins, gyms, members, subscriptions } from "@/lib/schema";
import { hasActiveGymRoleInTransaction } from "@/lib/transaction-authz";
import { decideDailyCheckin, getLagosDayBounds } from "@/lib/daily-checkin-policy";

const checkinSchema = z.object({ code: z.string().trim().min(4).max(40) });

/** Desk-only, gym-scoped read for today's activity and non-mutating code verification. */
export async function GET(request: Request, context: { params: Promise<{ gymId: string }> }) {
  try {
    const { gymId } = await context.params;
    await requireActiveGymDeskStaff(gymId);
    const db = getDb();
    const now = new Date();
    const { start: todayStart, end: tomorrowStart } = getLagosDayBounds(now);
    const [gym] = await db.select({ maxDailyCheckins: gyms.maxDailyCheckins }).from(gyms).where(eq(gyms.id, gymId)).limit(1);
    if (!gym) return NextResponse.json({ error: "Gym not found." }, { status: 404 });
    const [[today], recentCheckins] = await Promise.all([
      db.select({ total: sql<number>`count(*)::int` }).from(checkins)
        .where(and(eq(checkins.gymId, gymId), gte(checkins.createdAt, todayStart), lt(checkins.createdAt, tomorrowStart))),
      db.select({ id: checkins.id, memberName: members.fullName, checkedInAt: checkins.createdAt })
        .from(checkins)
        .innerJoin(members, and(eq(members.gymId, checkins.gymId), eq(members.id, checkins.memberId)))
        .where(and(eq(checkins.gymId, gymId), gte(checkins.createdAt, todayStart), lt(checkins.createdAt, tomorrowStart)))
        .orderBy(desc(checkins.createdAt))
        .limit(10),
    ]);

    const codeValue = new URL(request.url).searchParams.get("code");
    if (codeValue === null) return NextResponse.json({ todayCount: today.total, recentCheckins });
    const parsed = checkinSchema.safeParse({ code: codeValue });
    if (!parsed.success) return NextResponse.json({ error: "Enter a valid membership code." }, { status: 400 });
    const code = parsed.data.code.replace(/\s+/g, "").toUpperCase();
    const [member] = await db.select({ id: members.id, fullName: members.fullName }).from(members)
      .where(and(eq(members.gymId, gymId), eq(members.membershipCode, code))).limit(1);
    if (!member) return NextResponse.json({ eligible: false, reason: "Membership code was not found." });

    const [activeSubscription] = await db.select({ startsAt: subscriptions.startsAt, expiresAt: subscriptions.expiresAt })
      .from(subscriptions)
      .where(and(eq(subscriptions.gymId, gymId), eq(subscriptions.memberId, member.id), eq(subscriptions.status, "active")))
      .limit(1);
    if (!activeSubscription || activeSubscription.startsAt > now || activeSubscription.expiresAt <= now) {
      const reason = !activeSubscription
        ? "No active membership was found. Ask the member to renew."
        : activeSubscription.startsAt > now
          ? "This membership has not started yet."
          : "This membership has expired. Ask the member to renew.";
      return NextResponse.json({ eligible: false, reason });
    }
    const [used] = await db.select({ total: sql<number>`count(*)::int` }).from(checkins)
      .where(and(eq(checkins.gymId, gymId), eq(checkins.memberId, member.id), gte(checkins.createdAt, todayStart), lt(checkins.createdAt, tomorrowStart)));
    const daily = decideDailyCheckin(used.total, gym.maxDailyCheckins);
    return NextResponse.json({ eligible: true, canCheckIn: daily.allowed, reason: daily.allowed ? null : daily.message, memberName: member.fullName, expiresAt: activeSubscription.expiresAt, dailyCheckins: { used: used.total, limit: gym.maxDailyCheckins } });
  } catch (error) {
    const denied = error instanceof AuthorizationError;
    return NextResponse.json({ error: denied ? "Active gym desk access is required." : "Could not load desk activity." }, { status: denied ? 403 : 503 });
  }
}

/** Only gym desk staff can create successful, server-validated check-ins. */
export async function POST(request: Request, context: { params: Promise<{ gymId: string }> }) {
  try {
    const { gymId } = await context.params;
    const desk = await requireActiveGymDeskStaff(gymId);
    const parsed = checkinSchema.safeParse(await request.json());
    if (!parsed.success) return NextResponse.json({ error: "Enter a valid membership code." }, { status: 400 });
    const code = parsed.data.code.replace(/\s+/g, "").toUpperCase();
    const result = await getDb().transaction(async (tx) => {
      const [gym] = await tx.select({ status: gyms.status, maxDailyCheckins: gyms.maxDailyCheckins }).from(gyms).where(eq(gyms.id, gymId)).for("update").limit(1);
      if (!gym || gym.status !== "active") return { error: "This gym cannot record new check-ins.", statusCode: 410 as const };
      if (!await hasActiveGymRoleInTransaction(tx, { gymId, userId: desk.userId, membershipId: desk.membershipId, role: "gym_desk_staff" })) return { error: "Active gym desk access is required.", statusCode: 403 as const };
      const [member] = await tx.select({ id: members.id, fullName: members.fullName }).from(members)
        .where(and(eq(members.gymId, gymId), eq(members.membershipCode, code))).for("update").limit(1);
      if (!member) return { error: "Membership code was not found.", statusCode: 404 as const };
      const now = new Date();
      const [subscription] = await tx.select({ id: subscriptions.id, expiresAt: subscriptions.expiresAt }).from(subscriptions)
        .where(and(eq(subscriptions.gymId, gymId), eq(subscriptions.memberId, member.id), eq(subscriptions.status, "active"), lte(subscriptions.startsAt, now), gt(subscriptions.expiresAt, now))).for("update").limit(1);
      if (!subscription) {
        const [expired] = await tx.select({ id: subscriptions.id }).from(subscriptions)
          .where(and(eq(subscriptions.gymId, gymId), eq(subscriptions.memberId, member.id), inArray(subscriptions.status, ["active", "expired"]), lte(subscriptions.expiresAt, now))).limit(1);
        return expired
          ? { error: "Expired. Ask them to renew.", statusCode: 409 as const }
          : { error: "Membership is not active. Ask the member to renew.", statusCode: 409 as const };
      }
      const { start: todayStart, end: tomorrowStart } = getLagosDayBounds(now);
      const [used] = await tx.select({ total: sql<number>`count(*)::int` }).from(checkins)
        .where(and(eq(checkins.gymId, gymId), eq(checkins.memberId, member.id), gte(checkins.createdAt, todayStart), lt(checkins.createdAt, tomorrowStart)));
      const daily = decideDailyCheckin(used.total, gym.maxDailyCheckins);
      if (!daily.allowed) return { error: daily.message, statusCode: 409 as const };
      await tx.insert(checkins).values({ gymId, memberId: member.id, subscriptionId: subscription.id, code, checkedInByMembershipId: desk.membershipId });
      const daysRemaining = Math.max(1, Math.ceil((subscription.expiresAt.getTime() - now.getTime()) / 86400000));
      return { accepted: true as const, memberName: member.fullName, daysRemaining, dailyCheckins: { used: daily.countAfter, limit: daily.limit } };
    });
    if ("error" in result) return NextResponse.json({ error: result.error }, { status: result.statusCode });
    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    const status = error instanceof AuthorizationError ? 403 : 503;
    return NextResponse.json({ error: error instanceof AuthorizationError ? error.message : "Could not record the check-in." }, { status });
  }
}
