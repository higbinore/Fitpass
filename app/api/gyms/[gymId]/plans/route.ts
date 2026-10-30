import { asc, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";

import { requireActiveGymOwner } from "@/lib/authz";
import { getDb } from "@/lib/db";
import { plans } from "@/lib/schema";
import { gyms } from "@/lib/schema";
import { hasActiveGymRoleInTransaction } from "@/lib/transaction-authz";

const planSchema = z.object({
  name: z.string().trim().min(2).max(80),
  durationDays: z.number().int().positive().max(3650),
  priceKobo: z.number().int().positive().max(100_000_000_000),
  description: z.string().trim().max(500).optional(),
  sortOrder: z.number().int().default(0),
});

export async function GET(_request: Request, context: { params: Promise<{ gymId: string }> }) {
  try {
    const { gymId } = await context.params;
    await requireActiveGymOwner(gymId);
    const rows = await getDb().select().from(plans).where(eq(plans.gymId, gymId)).orderBy(asc(plans.sortOrder), asc(plans.name));
    return NextResponse.json({ plans: rows });
  } catch (error) {
    const status = error instanceof Error && error.name === "AuthorizationError" ? 403 : 503;
    return NextResponse.json({ error: status === 403 ? "A gym owner role is required." : "Could not load plans." }, { status });
  }
}

export async function POST(request: Request, context: { params: Promise<{ gymId: string }> }) {
  try {
    const { gymId } = await context.params;
    const owner = await requireActiveGymOwner(gymId);
    const parsed = planSchema.safeParse(await request.json());
    if (!parsed.success) return NextResponse.json({ error: "Plan details are invalid." }, { status: 400 });
    const created = await getDb().transaction(async (tx) => {
      const [gym] = await tx.select({ status: gyms.status }).from(gyms).where(eq(gyms.id, gymId)).for("update").limit(1);
      if (!gym || gym.status !== "active") return null;
      if (!await hasActiveGymRoleInTransaction(tx, { gymId, userId: owner.userId, membershipId: owner.membershipId, role: "gym_owner" })) return null;
      const [row] = await tx.insert(plans).values({ ...parsed.data, gymId }).returning();
      return row;
    });
    if (!created) return NextResponse.json({ error: "Gym is unavailable or owner access has changed." }, { status: 409 });
    return NextResponse.json({ plan: created }, { status: 201 });
  } catch (error) {
    const status = error instanceof Error && error.name === "AuthorizationError" ? 403 : 503;
    return NextResponse.json({ error: status === 403 ? "An active gym owner role is required." : "Could not create the plan." }, { status });
  }
}
