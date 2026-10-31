import { and, count, desc, eq, gt, ilike, lte, or } from "drizzle-orm";
import { NextResponse } from "next/server";

import { requirePlatformAdmin } from "@/lib/authz";
import { getDb } from "@/lib/db";
import { gyms, platformPackages, platformSubscriptions } from "@/lib/schema";
import { resolvePlatformSubscriptionStatus } from "@/lib/trial-policy";

export async function GET(request: Request) {
  try {
    await requirePlatformAdmin();
    const params = new URL(request.url).searchParams;
    const status = params.get("status") ?? "all";
    const search = params.get("search")?.trim().slice(0, 100) ?? "";
    const page = Number(params.get("page") ?? 1);
    const pageSize = Number(params.get("pageSize") ?? 20);
    if (!Number.isInteger(page) || page < 1 || !Number.isInteger(pageSize) || pageSize < 1 || pageSize > 50 || !["all", "pending_payment", "trialing", "active", "past_due", "cancelled", "expired"].includes(status)) {
      return NextResponse.json({ error: "Invalid subscription filters." }, { status: 400 });
    }
    const conditions = [];
    const now = new Date();
    if (status === "trialing") conditions.push(and(eq(platformSubscriptions.status, "trialing"), gt(platformSubscriptions.currentPeriodEnd, now))!);
    else if (status === "expired") conditions.push(or(eq(platformSubscriptions.status, "expired"), and(eq(platformSubscriptions.status, "trialing"), lte(platformSubscriptions.currentPeriodEnd, now)))!);
    else if (status !== "all") conditions.push(eq(platformSubscriptions.status, status));
    if (search) {
      const pattern = `%${search.replace(/[\\%_]/g, "\\$&")}%`;
      conditions.push(or(ilike(gyms.name, pattern), ilike(platformPackages.name, pattern))!);
    }
    const where = conditions.length ? and(...conditions) : undefined;
    const db = getDb();
    const [rows, [total]] = await Promise.all([
      db.select({ id: platformSubscriptions.id, gymId: platformSubscriptions.gymId, gymName: gyms.name, packageName: platformPackages.name, packageId: platformPackages.id, status: platformSubscriptions.status, currentPeriodEnd: platformSubscriptions.currentPeriodEnd, priceKobo: platformPackages.priceKobo, billingInterval: platformPackages.billingInterval, createdAt: platformSubscriptions.createdAt })
        .from(platformSubscriptions).innerJoin(gyms, eq(gyms.id, platformSubscriptions.gymId)).innerJoin(platformPackages, eq(platformPackages.id, platformSubscriptions.packageId))
        .where(where).orderBy(desc(platformSubscriptions.createdAt), desc(platformSubscriptions.id)).limit(pageSize).offset((page - 1) * pageSize),
      db.select({ total: count() }).from(platformSubscriptions).innerJoin(gyms, eq(gyms.id, platformSubscriptions.gymId)).innerJoin(platformPackages, eq(platformPackages.id, platformSubscriptions.packageId)).where(where),
    ]);
    return NextResponse.json({ subscriptions: rows.map((row) => ({ ...row, status: resolvePlatformSubscriptionStatus(row.status, row.currentPeriodEnd, now), billedPriceKobo: row.priceKobo })), total: total.total, page, pageSize, hasMore: page * pageSize < total.total });
  } catch (error) {
    const denied = error instanceof Error && error.name === "AuthorizationError";
    return NextResponse.json({ error: denied ? "Platform administrator access required." : "Could not load subscriptions." }, { status: denied ? 403 : 503 });
  }
}
