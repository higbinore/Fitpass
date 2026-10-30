import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";

import { requireActiveGymOwner } from "@/lib/authz";
import { getDb } from "@/lib/db";
import { plans } from "@/lib/schema";
import { gyms } from "@/lib/schema";
import { hasActiveGymRoleInTransaction } from "@/lib/transaction-authz";

const updateSchema = z.object({
  name: z.string().trim().min(2).max(80).optional(),
  durationDays: z.number().int().positive().max(3650).optional(),
  priceKobo: z.number().int().positive().max(100_000_000_000).optional(),
  description: z.string().trim().max(500).nullable().optional(),
  isActive: z.boolean().optional(),
  sortOrder: z.number().int().optional(),
}).refine((value) => Object.keys(value).length > 0, "Provide a plan field to update.");

export async function PATCH(request: Request, context: { params: Promise<{ gymId: string; planId: string }> }) {
  try {
    const { gymId, planId } = await context.params;
    const owner = await requireActiveGymOwner(gymId);
    const parsed = updateSchema.safeParse(await request.json());
    if (!parsed.success) return NextResponse.json({ error: "Plan details are invalid." }, { status: 400 });
    const updated = await getDb().transaction(async (tx) => {
      const [gym] = await tx.select({ status: gyms.status }).from(gyms).where(eq(gyms.id, gymId)).for("update").limit(1);
      if (!gym || gym.status !== "active") return null;
      if (!await hasActiveGymRoleInTransaction(tx, { gymId, userId: owner.userId, membershipId: owner.membershipId, role: "gym_owner" })) return null;
      const [row] = await tx.update(plans).set({ ...parsed.data, updatedAt: new Date() }).where(and(eq(plans.gymId, gymId), eq(plans.id, planId))).returning();
      return row ?? null;
    });
    if (!updated) return NextResponse.json({ error: "Plan not found in this gym." }, { status: 404 });
    return NextResponse.json({ plan: updated });
  } catch (error) {
    const status = error instanceof Error && error.name === "AuthorizationError" ? 403 : 503;
    return NextResponse.json({ error: status === 403 ? "An active gym owner role is required." : "Could not update the plan." }, { status });
  }
}
