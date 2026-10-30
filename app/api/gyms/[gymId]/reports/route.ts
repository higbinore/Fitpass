import { and, desc, eq, gte, lt, sql } from "drizzle-orm";
import { NextResponse } from "next/server";

import { AuthorizationError, requireActiveGymOwner } from "@/lib/authz";
import { getDb } from "@/lib/db";
import { checkins, members, payments, plans } from "@/lib/schema";

function parseDate(value: string | null): Date | null {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value ? null : date;
}

/** Owner-only, tenant-scoped member revenue and check-in report. */
export async function GET(request: Request, context: { params: Promise<{ gymId: string }> }) {
  try {
    const { gymId } = await context.params;
    await requireActiveGymOwner(gymId);
    const params = new URL(request.url).searchParams;
    const from = parseDate(params.get("from"));
    const to = parseDate(params.get("to"));
    const checkinPage = Number(params.get("checkinPage") ?? "1");
    const paymentPage = Number(params.get("paymentPage") ?? "1");
    if (!Number.isInteger(checkinPage) || checkinPage < 1 || !Number.isInteger(paymentPage) || paymentPage < 1) {
      return NextResponse.json({ error: "Report page must be a positive whole number." }, { status: 400 });
    }
    if (!from || !to || from > to) return NextResponse.json({ error: "Choose a valid report date range." }, { status: 400 });
    // Date inputs represent Benin City calendar dates (UTC+1), while Postgres
    // timestamps are stored as absolute instants.
    const fromBenin = new Date(from.getTime() - 60 * 60 * 1000);
    const until = new Date(to.getTime() + 23 * 60 * 60 * 1000);
    if (until.getTime() - fromBenin.getTime() > 93 * 86400000) return NextResponse.json({ error: "Report ranges cannot exceed 92 days." }, { status: 400 });

    const db = getDb();
    const pageSize = 25;
    const [checkinRows, paymentRows, [paymentSummary], [checkinCount], [paymentCount]] = await Promise.all([
      db.select({ id: checkins.id, memberName: members.fullName, checkedInAt: checkins.createdAt })
        .from(checkins).innerJoin(members, and(eq(members.gymId, checkins.gymId), eq(members.id, checkins.memberId)))
        .where(and(eq(checkins.gymId, gymId), gte(checkins.createdAt, fromBenin), lt(checkins.createdAt, until)))
        .orderBy(desc(checkins.createdAt)).limit(pageSize).offset((checkinPage - 1) * pageSize),
      db.select({ id: payments.id, memberName: members.fullName, planName: plans.name, amountKobo: payments.amountKobo, status: payments.status, paymentMode: payments.paymentMode, reference: payments.reference, createdAt: payments.createdAt, paidAt: payments.paidAt })
        .from(payments).innerJoin(members, and(eq(members.gymId, payments.gymId), eq(members.id, payments.memberId)))
        .innerJoin(plans, and(eq(plans.gymId, payments.gymId), eq(plans.id, payments.planId)))
        .where(and(eq(payments.gymId, gymId), gte(payments.createdAt, fromBenin), lt(payments.createdAt, until)))
        .orderBy(desc(payments.createdAt)).limit(pageSize).offset((paymentPage - 1) * pageSize),
      db.select({ paidKobo: sql<string>`coalesce(sum(case when ${payments.status} = 'paid' and ${payments.paymentMode} = 'paystack' then ${payments.amountKobo} else 0 end), 0)`, paidCount: sql<number>`count(*) filter (where ${payments.status} = 'paid' and ${payments.paymentMode} = 'paystack')::int`, pendingKobo: sql<string>`coalesce(sum(case when ${payments.status} = 'pending' then ${payments.amountKobo} else 0 end), 0)`, pendingCount: sql<number>`count(*) filter (where ${payments.status} = 'pending')::int` }).from(payments)
        .where(and(eq(payments.gymId, gymId), gte(payments.createdAt, fromBenin), lt(payments.createdAt, until))),
      db.select({ total: sql<number>`count(*)::int` }).from(checkins)
        .where(and(eq(checkins.gymId, gymId), gte(checkins.createdAt, fromBenin), lt(checkins.createdAt, until))),
      db.select({ total: sql<number>`count(*)::int` }).from(payments)
        .where(and(eq(payments.gymId, gymId), gte(payments.createdAt, fromBenin), lt(payments.createdAt, until))),
    ]);
    return NextResponse.json({ from: params.get("from"), to: params.get("to"), totalCheckins: checkinCount.total, totalPaymentRecords: paymentCount.total, payments: paymentSummary, checkins: checkinRows, paymentRows, pagination: { checkinPage, paymentPage, pageSize, checkinPages: Math.max(1, Math.ceil(checkinCount.total / pageSize)), paymentPages: Math.max(1, Math.ceil(paymentCount.total / pageSize)) } });
  } catch (error) {
    const denied = error instanceof AuthorizationError;
    return NextResponse.json({ error: denied ? "Gym owner access is required." : "Could not load gym reports." }, { status: denied ? 403 : 503 });
  }
}
