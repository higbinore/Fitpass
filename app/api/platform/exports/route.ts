import { and, desc, eq, gte, ilike, lt, or, sql } from "drizzle-orm";
import { NextResponse } from "next/server";

import { requirePlatformAdmin } from "@/lib/authz";
import { getDb } from "@/lib/db";
import { gymApplications, gyms, platformPackages, platformPayments, platformSubscriptions } from "@/lib/schema";

const types = ["revenue", "gyms", "applications", "subscriptions", "payments"] as const;
type ExportType = (typeof types)[number];

function csvCell(value: unknown): string {
  let text = value instanceof Date ? value.toISOString() : String(value ?? "");
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return `"${text.replaceAll('"', '""')}"`;
}

function csvResponse(type: ExportType, headers: string[], rows: unknown[][]) {
  const csv = [headers, ...rows].map((row) => row.map(csvCell).join(",")).join("\r\n");
  return new NextResponse(`\uFEFF${csv}`, { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="fitpass-${type}-${new Date().toISOString().slice(0, 10)}.csv"`, "Cache-Control": "private, no-store" } });
}

function date(value: string | null): Date | null {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const result = new Date(`${value}T00:00:00.000Z`);
  return Number.isNaN(result.getTime()) || result.toISOString().slice(0, 10) !== value ? null : result;
}

/** Filtered exports are private platform data and require a verified platform-admin row. */
export async function GET(request: Request) {
  try {
    await requirePlatformAdmin();
    const params = new URL(request.url).searchParams;
    const type = params.get("type") as ExportType | null;
    const status = params.get("status") ?? "all";
    const search = params.get("search")?.trim().slice(0, 100) ?? "";
    if (!type || !types.includes(type)) return NextResponse.json({ error: "Choose a supported export." }, { status: 400 });
    const fromText = params.get("from");
    const toText = params.get("to");
    if (Boolean(fromText) !== Boolean(toText)) return NextResponse.json({ error: "Provide both report dates." }, { status: 400 });
    const fromDate = fromText ? date(fromText) : null;
    const toDate = toText ? date(toText) : null;
    if (fromText && (!fromDate || !toDate || fromDate > toDate)) return NextResponse.json({ error: "Choose a valid date range." }, { status: 400 });
    const from = fromDate ? new Date(fromDate.getTime() - 3600000) : undefined;
    const until = toDate ? new Date(toDate.getTime() + 23 * 3600000) : undefined;
    if (from && until && until.getTime() - from.getTime() > 367 * 86400000) return NextResponse.json({ error: "Export date ranges cannot exceed 366 days." }, { status: 400 });
    const db = getDb();
    const limit = 10_001;
    const like = `%${search.replace(/[\\%_]/g, "\\$&")}%`;

    if (type === "gyms") {
      if (!(["all", "active", "suspended", "archived"] as string[]).includes(status)) return NextResponse.json({ error: "Invalid gym status filter." }, { status: 400 });
      const filters = [];
      if (status !== "all") filters.push(eq(gyms.status, status));
      if (search) filters.push(or(ilike(gyms.name, like), ilike(gyms.slug, like))!);
      if (from) filters.push(gte(gyms.createdAt, from));
      if (until) filters.push(lt(gyms.createdAt, until));
      const rows = await db.select({ id: gyms.id, name: gyms.name, slug: gyms.slug, status: gyms.status, contactEmail: gyms.contactEmail, contactPhone: gyms.contactPhone, location: gyms.location, createdAt: gyms.createdAt }).from(gyms).where(filters.length ? and(...filters) : undefined).orderBy(desc(gyms.createdAt)).limit(limit);
      if (rows.length >= limit) return NextResponse.json({ error: "More than 10,000 rows match. Narrow the filters before exporting." }, { status: 413 });
      return csvResponse(type, ["Gym ID", "Name", "Slug", "Status", "Contact email", "Contact phone", "Location", "Created at"], rows.map((r) => [r.id, r.name, r.slug, r.status, r.contactEmail, r.contactPhone, r.location, r.createdAt]));
    }

    if (type === "applications") {
      if (!(["all", "pending", "approved", "rejected", "withdrawn"] as string[]).includes(status)) return NextResponse.json({ error: "Invalid application status filter." }, { status: 400 });
      const filters = [];
      if (status !== "all") filters.push(eq(gymApplications.status, status));
      if (search) filters.push(or(ilike(gymApplications.gymName, like), ilike(gymApplications.applicantName, like), ilike(gymApplications.applicantEmail, like), ilike(gymApplications.requestedSlug, like))!);
      if (from) filters.push(gte(gymApplications.createdAt, from));
      if (until) filters.push(lt(gymApplications.createdAt, until));
      const rows = await db.select({ id: gymApplications.id, gymName: gymApplications.gymName, requestedSlug: gymApplications.requestedSlug, applicantName: gymApplications.applicantName, applicantEmail: gymApplications.applicantEmail, status: gymApplications.status, location: gymApplications.location, createdAt: gymApplications.createdAt, reviewedAt: gymApplications.reviewedAt, reviewNote: gymApplications.reviewNote }).from(gymApplications).where(filters.length ? and(...filters) : undefined).orderBy(desc(gymApplications.createdAt)).limit(limit);
      if (rows.length >= limit) return NextResponse.json({ error: "More than 10,000 rows match. Narrow the filters before exporting." }, { status: 413 });
      return csvResponse(type, ["Application ID", "Gym", "Requested slug", "Applicant", "Email", "Status", "Location", "Submitted at", "Reviewed at", "Review note"], rows.map((r) => [r.id, r.gymName, r.requestedSlug, r.applicantName, r.applicantEmail, r.status, r.location, r.createdAt, r.reviewedAt, r.reviewNote]));
    }

    if (type === "subscriptions") {
      if (!(["all", "pending_payment", "trialing", "active", "past_due", "cancelled", "expired"] as string[]).includes(status)) return NextResponse.json({ error: "Invalid subscription status filter." }, { status: 400 });
      const filters = [];
      if (status !== "all") filters.push(eq(platformSubscriptions.status, status));
      if (search) filters.push(or(ilike(gyms.name, like), ilike(platformPackages.name, like))!);
      if (from) filters.push(gte(platformSubscriptions.createdAt, from));
      if (until) filters.push(lt(platformSubscriptions.createdAt, until));
      const rows = await db.select({ id: platformSubscriptions.id, gymId: platformSubscriptions.gymId, gymName: gyms.name, packageName: platformPackages.name, status: platformSubscriptions.status, amountKobo: platformPackages.priceKobo, billingInterval: platformPackages.billingInterval, startsAt: platformSubscriptions.startsAt, currentPeriodEnd: platformSubscriptions.currentPeriodEnd, createdAt: platformSubscriptions.createdAt }).from(platformSubscriptions).innerJoin(gyms, eq(gyms.id, platformSubscriptions.gymId)).innerJoin(platformPackages, eq(platformPackages.id, platformSubscriptions.packageId)).where(filters.length ? and(...filters) : undefined).orderBy(desc(platformSubscriptions.createdAt)).limit(limit);
      if (rows.length >= limit) return NextResponse.json({ error: "More than 10,000 rows match. Narrow the filters before exporting." }, { status: 413 });
      return csvResponse(type, ["Subscription ID", "Gym ID", "Gym", "Package", "Status", "Billed amount kobo", "Interval", "Starts at", "Period ends", "Created at"], rows.map((r) => [r.id, r.gymId, r.gymName, r.packageName, r.status, r.amountKobo, r.billingInterval, r.startsAt, r.currentPeriodEnd, r.createdAt]));
    }

    if (type === "payments") {
      if (!(["all", "pending", "paid", "failed", "abandoned"] as string[]).includes(status)) return NextResponse.json({ error: "Invalid payment status filter." }, { status: 400 });
      const filters = [];
      if (status !== "all") filters.push(eq(platformPayments.status, status));
      if (search) filters.push(or(ilike(gyms.name, like), ilike(platformPayments.reference, like))!);
      if (from) filters.push(gte(platformPayments.createdAt, from));
      if (until) filters.push(lt(platformPayments.createdAt, until));
      const rows = await db.select({ id: platformPayments.id, gymName: gyms.name, reference: platformPayments.reference, transactionId: platformPayments.paystackTransactionId, amountKobo: platformPayments.amountKobo, currency: platformPayments.currency, status: platformPayments.status, paymentMode: platformPayments.paymentMode, createdAt: platformPayments.createdAt, paidAt: platformPayments.paidAt }).from(platformPayments).innerJoin(gyms, eq(gyms.id, platformPayments.gymId)).where(filters.length ? and(...filters) : undefined).orderBy(desc(platformPayments.createdAt)).limit(limit);
      if (rows.length >= limit) return NextResponse.json({ error: "More than 10,000 rows match. Narrow the filters before exporting." }, { status: 413 });
      return csvResponse(type, ["Payment ID", "Gym", "Reference", "Paystack transaction ID", "Amount kobo", "Currency", "Status", "Created at", "Paid at"], rows.map((r) => [r.id, r.gymName, r.reference, r.transactionId, r.amountKobo, r.currency, r.status, r.createdAt, r.paidAt]));
    }

    if (status !== "all" && status !== "paid") return NextResponse.json({ error: "Revenue exports include confirmed payments only." }, { status: 400 });
    const period = from && until ? and(gte(platformPayments.paidAt, from), lt(platformPayments.paidAt, until)) : undefined;
    const searchFilter = search ? ilike(gyms.name, like) : undefined;
    const rows = await db.select({ month: sql<string>`to_char(date_trunc('month', ${platformPayments.paidAt}), 'YYYY-MM')`, gymName: gyms.name, paymentCount: sql<number>`count(*)::int`, totalKobo: sql<string>`sum(${platformPayments.amountKobo})` }).from(platformPayments).innerJoin(gyms, eq(gyms.id, platformPayments.gymId)).where(and(eq(platformPayments.status, "paid"), eq(platformPayments.paymentMode, "paystack"), period, searchFilter)).groupBy(sql`date_trunc('month', ${platformPayments.paidAt})`, gyms.name).orderBy(sql`date_trunc('month', ${platformPayments.paidAt})`).limit(limit);
    if (rows.length >= limit) return NextResponse.json({ error: "More than 10,000 rows match. Narrow the filters before exporting." }, { status: 413 });
    return csvResponse(type, ["Month", "Gym", "Confirmed payment count", "Revenue kobo"], rows.map((r) => [r.month, r.gymName, r.paymentCount, r.totalKobo]));
  } catch (error) {
    const denied = error instanceof Error && error.name === "AuthorizationError";
    return NextResponse.json({ error: denied ? "Platform administrator access required." : "Could not generate the requested export." }, { status: denied ? 403 : 503 });
  }
}
