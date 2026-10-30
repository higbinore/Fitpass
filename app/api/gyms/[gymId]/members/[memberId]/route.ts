import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";

import { AuthorizationError, requireActiveGymOwner } from "@/lib/authz";
import { getDb } from "@/lib/db";
import { auditEvents, gyms, members } from "@/lib/schema";
import { hasActiveGymRoleInTransaction } from "@/lib/transaction-authz";

const profileSchema = z.object({
  fullName: z.string().trim().min(2).max(120),
  phone: z.string().trim().max(40).nullable(),
});

/** Updates gym-local member contact details without touching auth identity or history. */
export async function PATCH(request: Request, context: { params: Promise<unknown> }) {
  try {
    const { gymId, memberId } = await context.params as { gymId: string; memberId: string };
    const owner = await requireActiveGymOwner(gymId);
    if (!/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(memberId)) {
      return NextResponse.json({ error: "Member not found." }, { status: 404 });
    }
    const parsed = profileSchema.safeParse(await request.json());
    if (!parsed.success) return NextResponse.json({ error: "Enter a valid name and phone number." }, { status: 400 });

    const updated = await getDb().transaction(async (tx) => {
      const [gym] = await tx.select({ status: gyms.status }).from(gyms).where(eq(gyms.id, gymId)).for("update").limit(1);
      if (!gym || gym.status !== "active") return { error: "This gym is archived and cannot change member profiles.", status: 410 as const };
      if (!await hasActiveGymRoleInTransaction(tx, { gymId, userId: owner.userId, membershipId: owner.membershipId, role: "gym_owner" })) {
        return { error: "An active gym owner role is required.", status: 403 as const };
      }
      const [existing] = await tx.select({ id: members.id }).from(members)
        .where(and(eq(members.gymId, gymId), eq(members.id, memberId))).for("update").limit(1);
      if (!existing) return { error: "Member not found.", status: 404 as const };
      const [member] = await tx.update(members).set({ ...parsed.data, updatedAt: new Date() })
        .where(and(eq(members.gymId, gymId), eq(members.id, memberId)))
        .returning({ id: members.id, fullName: members.fullName, phone: members.phone });
      await tx.insert(auditEvents).values({
        gymId,
        actorUserId: owner.userId,
        actorLabel: "gym_owner",
        action: "gym_member.profile_updated",
        subjectType: "member",
        subjectId: memberId,
        metadata: { fields: ["fullName", "phone"] },
      });
      return { member };
    });
    if ("error" in updated) return NextResponse.json({ error: updated.error }, { status: updated.status });
    return NextResponse.json(updated);
  } catch (error) {
    const denied = error instanceof AuthorizationError;
    return NextResponse.json({ error: denied ? "An active gym owner role is required." : "Could not update this member." }, { status: denied ? 403 : 503 });
  }
}
