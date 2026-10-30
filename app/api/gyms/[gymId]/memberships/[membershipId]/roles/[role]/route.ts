import { and, countDistinct, eq, isNull } from "drizzle-orm";
import { NextResponse } from "next/server";

import { requireActiveGymOwner } from "@/lib/authz";
import { getDb } from "@/lib/db";
import { auditEvents, gymMembershipRoles, gymMemberships, gyms, type GymRole } from "@/lib/schema";
import { hasActiveGymRoleInTransaction } from "@/lib/transaction-authz";
import { canRemoveActiveOwner } from "@/lib/workflow-policy";

const allowedRoles = new Set<GymRole>(["gym_owner", "gym_desk_staff", "gym_member"]);

export async function DELETE(_request: Request, context: { params: Promise<{ gymId: string; membershipId: string; role: string }> }) {
  try {
    const { gymId, membershipId, role: untrustedRole } = await context.params;
    const actor = await requireActiveGymOwner(gymId);
    if (!allowedRoles.has(untrustedRole as GymRole)) return NextResponse.json({ error: "Unknown gym role." }, { status: 400 });
    const role = untrustedRole as GymRole;

    const result = await getDb().transaction(async (tx) => {
      const [gym] = await tx.select({ id: gyms.id, status: gyms.status }).from(gyms).where(eq(gyms.id, gymId)).for("update").limit(1);
      if (!gym || gym.status !== "active") return { error: "This gym is archived.", statusCode: 409 as const };
      if (!await hasActiveGymRoleInTransaction(tx, { gymId, userId: actor.userId, membershipId: actor.membershipId, role: "gym_owner" })) return { error: "An active gym owner role is required.", statusCode: 403 as const };
      const [target] = await tx.select({ id: gymMemberships.id, status: gymMemberships.status }).from(gymMemberships)
        .where(and(eq(gymMemberships.id, membershipId), eq(gymMemberships.gymId, gymId))).for("update").limit(1);
      if (!target || target.status !== "active") return { error: "Active membership not found.", statusCode: 404 as const };
      const [grant] = await tx.select({ id: gymMembershipRoles.id }).from(gymMembershipRoles)
        .where(and(eq(gymMembershipRoles.gymId, gymId), eq(gymMembershipRoles.membershipId, membershipId), eq(gymMembershipRoles.role, role), isNull(gymMembershipRoles.revokedAt))).limit(1);
      if (!grant) return { error: "Role grant not found.", statusCode: 404 as const };

      if (role === "gym_owner") {
        const [owners] = await tx.select({ total: countDistinct(gymMemberships.id) }).from(gymMemberships)
          .innerJoin(gymMembershipRoles, and(eq(gymMembershipRoles.gymId, gymMemberships.gymId), eq(gymMembershipRoles.membershipId, gymMemberships.id)))
          .where(and(eq(gymMemberships.gymId, gymId), eq(gymMemberships.status, "active"), eq(gymMembershipRoles.role, "gym_owner"), isNull(gymMembershipRoles.revokedAt)));
        if (!canRemoveActiveOwner({ activeOwnerCount: owners?.total ?? 0, removesActiveOwner: true })) return { error: "The last active gym owner role cannot be revoked. Grant another owner first.", statusCode: 409 as const };
      }

      await tx.update(gymMembershipRoles).set({ revokedAt: new Date(), revokedByMembershipId: actor.membershipId, revokedByPlatformAdminUserId: null }).where(eq(gymMembershipRoles.id, grant.id));
      await tx.insert(auditEvents).values({ gymId, actorUserId: actor.userId, actorLabel: "gym_owner", action: "gym_role.revoked", subjectType: "gym_membership_role", subjectId: grant.id, metadata: { membershipId, role } });
      return { membershipId, role, status: "revoked" as const };
    });
    if ("error" in result) return NextResponse.json({ error: result.error }, { status: result.statusCode });
    return NextResponse.json(result);
  } catch (error) {
    const status = error instanceof Error && error.name === "AuthorizationError" ? 403 : 503;
    return NextResponse.json({ error: status === 403 ? "An active gym owner role is required." : "Could not revoke the role right now." }, { status });
  }
}
