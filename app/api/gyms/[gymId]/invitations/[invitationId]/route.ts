import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";

import { AuthorizationError, requireGymOwner } from "@/lib/authz";
import { getDb } from "@/lib/db";
import { auditEvents, gymInvitations, gyms } from "@/lib/schema";
import { hasActiveGymRoleInTransaction } from "@/lib/transaction-authz";

/** Revocation is allowed on archived gyms as a security action; acceptance is not. */
export async function DELETE(_request: Request, context: { params: Promise<{ gymId: string; invitationId: string }> }) {
  try {
    const { gymId, invitationId } = await context.params;
    const actor = await requireGymOwner(gymId);
    const result = await getDb().transaction(async (tx) => {
      const [gym] = await tx.select({ id: gyms.id }).from(gyms).where(eq(gyms.id, gymId)).for("update").limit(1);
      if (!gym) return { error: "Gym not found.", statusCode: 404 as const };
      if (!await hasActiveGymRoleInTransaction(tx, { gymId, userId: actor.userId, membershipId: actor.membershipId, role: "gym_owner" })) {
        return { error: "An active gym owner role is required.", statusCode: 403 as const };
      }
      const [invitation] = await tx.select({ id: gymInvitations.id, status: gymInvitations.status }).from(gymInvitations)
        .where(and(eq(gymInvitations.gymId, gymId), eq(gymInvitations.id, invitationId))).for("update").limit(1);
      if (!invitation) return { error: "Invitation not found.", statusCode: 404 as const };
      if (invitation.status !== "pending") return { error: "Only pending invitations can be revoked.", statusCode: 409 as const };
      await tx.update(gymInvitations).set({ status: "revoked" }).where(eq(gymInvitations.id, invitationId));
      await tx.insert(auditEvents).values({ gymId, actorUserId: actor.userId, actorLabel: "gym_owner", action: "gym_invitation.revoked", subjectType: "gym_invitation", subjectId: invitationId });
      return { invitationId, status: "revoked" as const };
    });
    if ("error" in result) return NextResponse.json({ error: result.error }, { status: result.statusCode });
    return NextResponse.json(result);
  } catch (error) {
    const status = error instanceof AuthorizationError ? 403 : 503;
    return NextResponse.json({ error: status === 403 ? "An active gym owner role is required." : "Could not revoke the invitation." }, { status });
  }
}
