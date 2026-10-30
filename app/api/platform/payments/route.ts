import { and, count, desc, eq, ilike } from "drizzle-orm";
import { NextResponse } from "next/server";

import { requirePlatformAdmin } from "@/lib/authz";
import { getDb } from "@/lib/db";
import { gyms, platformPayments } from "@/lib/schema";

export async function GET(request: Request) {
  try {
    await requirePlatformAdmin();
    const params = new URL(request.url).searchParams;
    const status = params.get("status") ?? "all";
    const search = params.get("search")?.trim().slice(0, 100) ?? "";
    const page = Number(params.get("page") ?? 1);
    const pageSize = Number(params.get("pageSize") ?? 20);
    if (!Number.isInteger(page) || page < 1 || !Number.isInteger(pageSize) || pageSize < 1 || pageSize > 50 || !["all", "pending", "paid", "failed", "abandoned"].includes(status)) {
      return NextResponse.json({ error: "Invalid payment filters." }, { status: 400 });
    }
    const conditions = [];
    if (status !== "all") conditions.push(eq(platformPayments.status, status));
    if (search) conditions.push(ilike(gyms.name, `%${search.replace(/[\\%_]/g, "\\$&")}%`));
    const where = conditions.length ? and(...conditions) : undefined;
    const db = getDb();
    const [payments, [total]] = await Promise.all([
      db.select({ id: platformPayments.id, gymName: gyms.name, reference: platformPayments.reference, amountKobo: platformPayments.amountKobo, currency: platformPayments.currency, status: platformPayments.status, paymentMode: platformPayments.paymentMode, createdAt: platformPayments.createdAt, paidAt: platformPayments.paidAt, paystackTransactionId: platformPayments.paystackTransactionId })
        .from(platformPayments).innerJoin(gyms, eq(gyms.id, platformPayments.gymId)).where(where)
        .orderBy(desc(platformPayments.createdAt), desc(platformPayments.id)).limit(pageSize).offset((page - 1) * pageSize),
      db.select({ total: count() }).from(platformPayments).innerJoin(gyms, eq(gyms.id, platformPayments.gymId)).where(where),
    ]);
    return NextResponse.json({ payments, total: total.total, page, pageSize, hasMore: page * pageSize < total.total });
  } catch (error) {
    const denied = error instanceof Error && error.name === "AuthorizationError";
    return NextResponse.json({ error: denied ? "Platform administrator access required." : "Could not load payments." }, { status: denied ? 403 : 503 });
  }
}
