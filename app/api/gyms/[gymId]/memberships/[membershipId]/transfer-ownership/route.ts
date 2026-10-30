import { and, eq, isNull } from "drizzle-orm";
import { NextResponse } from "next/server";

import { requireActiveGymOwner } from "@/lib/authz";
import { getDb } from "@/lib/db";
import { auditEvents, gymMembershipRoles, gymMemberships, gyms } from "@/lib/schema";
import { hasActiveGymRoleInTransaction } from "@/lib/transaction-authz";

/** Atomically grants the successor ownership before revoking the transferor. */
export async function POST(_request: Request, context: { params: Promise<{ gymId: string; membershipId: string }> }) {
  try {
    const { gymId, membershipId: successorId } = await context.params;
    const actor = await requireActiveGymOwner(gymId);
    if (successorId === actor.membershipId) return NextResponse.json({ error: "Choose another active membership." }, { status: 400 });

    const transfer = await getDb().transaction(async (tx) => {
      const [gym] = await tx.select({ id: gyms.id, status: gyms.status }).from(gyms).where(eq(gyms.id, gymId)).for("update").limit(1);
      if (!gym || gym.status !== "active") return { error: "This gym is archived.", statusCode: 409 as const };
      if (!await hasActiveGymRoleInTransaction(tx, { gymId, userId: actor.userId, membershipId: actor.membershipId, role: "gym_owner" })) return { error: "An active gym owner role is required.", statusCode: 403 as const };
      const [successor] = await tx.select({ id: gymMemberships.id, status: gymMemberships.status }).from(gymMemberships)
        .where(and(eq(gymMemberships.id, successorId), eq(gymMemberships.gymId, gymId))).for("update").limit(1);
      if (!successor || successor.status !== "active") return { error: "Successor must have an active membership in this gym.", statusCode: 404 as const };
      const [existingGrant] = await tx.select({ id: gymMembershipRoles.id }).from(gymMembershipRoles)
        .where(and(eq(gymMembershipRoles.gymId, gymId), eq(gymMembershipRoles.membershipId, successorId), eq(gymMembershipRoles.role, "gym_owner"), isNull(gymMembershipRoles.revokedAt))).limit(1);
      if (!existingGrant) {
        await tx.insert(gymMembershipRoles).values({ gymId, membershipId: successorId, role: "gym_owner", grantedByMembershipId: actor.membershipId });
      }
      const [actorGrant] = await tx.select({ id: gymMembershipRoles.id }).from(gymMembershipRoles)
        .where(and(eq(gymMembershipRoles.gymId, gymId), eq(gymMembershipRoles.membershipId, actor.membershipId), eq(gymMembershipRoles.role, "gym_owner"), isNull(gymMembershipRoles.revokedAt))).limit(1);
      if (actorGrant) {
        await tx.update(gymMembershipRoles).set({ revokedAt: new Date(), revokedByMembershipId: actor.membershipId }).where(eq(gymMembershipRoles.id, actorGrant.id));
      }
      await tx.insert(auditEvents).values({ gymId, actorUserId: actor.userId, actorLabel: "gym_owner", action: "gym_ownership.transferred", subjectType: "gym_membership", subjectId: successorId, metadata: { previousOwnerMembershipId: actor.membershipId } });
      return { successorMembershipId: successorId, ownershipTransferred: true };
    });
    if ("error" in transfer) return NextResponse.json({ error: transfer.error }, { status: transfer.statusCode });
    return NextResponse.json(transfer);
  } catch (error) {
    const status = error instanceof Error && error.name === "AuthorizationError" ? 403 : 503;
    return NextResponse.json({ error: status === 403 ? "An active gym owner role is required." : "Could not transfer ownership right now." }, { status });
  }
}
