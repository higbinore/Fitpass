import { and, eq, lte } from "drizzle-orm";
import { NextResponse } from "next/server";

import { getDb } from "@/lib/db";
import { getCronSecret } from "@/lib/env";
import { isAuthorizedCronRequest } from "@/lib/cron-security";
import { platformSubscriptions, subscriptions } from "@/lib/schema";

export async function GET(request: Request) {
  let expectedSecret: string;
  try { expectedSecret = getCronSecret(); }
  catch { return NextResponse.json({ error: "Scheduled task is not configured." }, { status: 503, headers: { "Cache-Control": "no-store" } }); }
  if (!isAuthorizedCronRequest(request.headers.get("authorization"), expectedSecret)) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401, headers: { "Cache-Control": "no-store" } });
  }

  try {
    const now = new Date();
    const db = getDb();
    const [expiredGymSubscriptions, expiredTrials] = await Promise.all([
      db.update(subscriptions).set({ status: "expired", updatedAt: now })
        .where(and(eq(subscriptions.status, "active"), lte(subscriptions.expiresAt, now)))
        .returning({ id: subscriptions.id }),
      db.update(platformSubscriptions).set({ status: "expired", updatedAt: now })
        .where(and(eq(platformSubscriptions.status, "trialing"), lte(platformSubscriptions.currentPeriodEnd, now)))
        .returning({ id: platformSubscriptions.id }),
    ]);
    return NextResponse.json({ expiredGymSubscriptions: expiredGymSubscriptions.length, expiredPlatformTrials: expiredTrials.length, completedAt: now.toISOString() }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ error: "Scheduled expiry update failed." }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
