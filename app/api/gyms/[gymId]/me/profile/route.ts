import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";

import { AuthorizationError, requireOwnMemberRecord, requireVerifiedUser } from "@/lib/authz";
import { getDb } from "@/lib/db";
import { auditEvents, members } from "@/lib/schema";

const profileSchema = z.object({
  fullName: z.string().trim().min(2).max(120),
  phone: z.string().trim().max(40).optional().transform((value) => value || null),
});

/** Updates only the authenticated member's gym-local profile fields. */
export async function PATCH(request: Request, context: { params: Promise<{ gymId: string }> }) {
  try {
    const identity = await requireVerifiedUser();
    const { gymId } = await context.params;
    const parsed = profileSchema.safeParse(await request.json());
    if (!parsed.success) return NextResponse.json({ error: "Enter a name and a valid phone number." }, { status: 400 });

    const db = getDb();
    const [candidate] = await db.select({ id: members.id }).from(members)
      .where(and(eq(members.gymId, gymId), eq(members.userId, identity.userId))).limit(1);
    if (!candidate) return NextResponse.json({ error: "Member profile not found." }, { status: 404 });
    const ownership = await requireOwnMemberRecord(gymId, candidate.id);

    const updated = await db.transaction(async (tx) => {
      const [profile] = await tx.update(members)
        .set({ ...parsed.data, updatedAt: new Date() })
        .where(and(eq(members.gymId, gymId), eq(members.id, ownership.member.id), eq(members.userId, identity.userId)))
        .returning({ id: members.id, fullName: members.fullName, phone: members.phone, membershipCode: members.membershipCode });
      if (!profile) return null;
      await tx.insert(auditEvents).values({
        gymId,
        actorUserId: identity.userId,
        actorLabel: "gym_member",
        action: "gym_member.profile_updated",
        subjectType: "member",
        subjectId: profile.id,
      });
      return profile;
    });
    if (!updated) return NextResponse.json({ error: "Member profile not found." }, { status: 404 });
    return NextResponse.json({ member: updated });
  } catch (error) {
    const denied = error instanceof AuthorizationError;
    return NextResponse.json({ error: denied ? error.message : "Could not update your profile." }, { status: denied ? 403 : 503 });
  }
}
