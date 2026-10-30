import { and, countDistinct, eq, isNull } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";

import { requireActiveGymOwner } from "@/lib/authz";
import { getDb } from "@/lib/db";
import { auditEvents, gymMembershipRoles, gymMemberships, gyms } from "@/lib/schema";
import { hasActiveGymRoleInTransaction } from "@/lib/transaction-authz";
import { canRemoveActiveOwner } from "@/lib/workflow-policy";

const statusSchema = z.object({ status: z.enum(["active", "suspended", "revoked"]) });

/** Serializes owner removals on the gym row so concurrent requests cannot remove every owner. */
export async function PATCH(request: Request, context: { params: Promise<{ gymId: string; membershipId: string }> }) {
  try {
    const { gymId, membershipId } = await context.params;
    const actor = await requireActiveGymOwner(gymId);
    const parsed = statusSchema.safeParse(await request.json());
    if (!parsed.success) return NextResponse.json({ error: "Choose active, suspended, or revoked." }, { status: 400 });

    const changed = await getDb().transaction(async (tx) => {
      const [gym] = await tx.select({ id: gyms.id, status: gyms.status }).from(gyms).where(eq(gyms.id, gymId)).for("update").limit(1);
      if (!gym || gym.status !== "active") return { error: "This gym is archived.", statusCode: 409 as const };
      if (!await hasActiveGymRoleInTransaction(tx, { gymId, userId: actor.userId, membershipId: actor.membershipId, role: "gym_owner" })) return { error: "An active gym owner role is required.", statusCode: 403 as const };
      const [target] = await tx.select().from(gymMemberships).where(and(eq(gymMemberships.gymId, gymId), eq(gymMemberships.id, membershipId))).for("update").limit(1);
      if (!target) return { error: "Membership not found.", statusCode: 404 as const };
      if (target.status === "revoked") return { error: "Membership is already revoked.", statusCode: 409 as const };
      if (parsed.data.status === "active" && target.status !== "suspended") return { error: "Only suspended memberships can be restored.", statusCode: 409 as const };
      if (parsed.data.status !== "active" && target.status === parsed.data.status) return { error: `Membership is already ${parsed.data.status}.`, statusCode: 409 as const };

      const [targetOwnerRole] = await tx.select({ membershipId: gymMembershipRoles.membershipId }).from(gymMembershipRoles)
        .where(and(eq(gymMembershipRoles.gymId, gymId), eq(gymMembershipRoles.membershipId, membershipId), eq(gymMembershipRoles.role, "gym_owner"), isNull(gymMembershipRoles.revokedAt))).limit(1);
      if (targetOwnerRole && parsed.data.status !== "active") {
        const [owners] = await tx.select({ total: countDistinct(gymMemberships.id) }).from(gymMemberships)
          .innerJoin(gymMembershipRoles, and(eq(gymMembershipRoles.gymId, gymMemberships.gymId), eq(gymMembershipRoles.membershipId, gymMemberships.id)))
          .where(and(eq(gymMemberships.gymId, gymId), eq(gymMemberships.status, "active"), eq(gymMembershipRoles.role, "gym_owner"), isNull(gymMembershipRoles.revokedAt)));
        if (!canRemoveActiveOwner({ activeOwnerCount: owners?.total ?? 0, removesActiveOwner: target.status === "active" })) return { error: "The last active gym owner cannot be suspended or revoked. Transfer ownership first.", statusCode: 409 as const };
      }

      await tx.update(gymMemberships).set({ status: parsed.data.status, revokedAt: parsed.data.status === "revoked" ? new Date() : null, updatedAt: new Date() }).where(eq(gymMemberships.id, membershipId));
      if (parsed.data.status === "revoked") {
        await tx.update(gymMembershipRoles).set({ revokedAt: new Date(), revokedByMembershipId: actor.membershipId, revokedByPlatformAdminUserId: null })
          .where(and(eq(gymMembershipRoles.gymId, gymId), eq(gymMembershipRoles.membershipId, membershipId), isNull(gymMembershipRoles.revokedAt)));
      }
      await tx.insert(auditEvents).values({ gymId, actorUserId: actor.userId, actorLabel: "gym_owner", action: `gym_membership.${parsed.data.status}`, subjectType: "gym_membership", subjectId: membershipId, metadata: { previousStatus: target.status } });
      return { membershipId, status: parsed.data.status };
    });
    if ("error" in changed) return NextResponse.json({ error: changed.error }, { status: changed.statusCode });
    return NextResponse.json(changed);
  } catch (error) {
    const status = error instanceof Error && error.name === "AuthorizationError" ? 403 : 503;
    return NextResponse.json({ error: status === 403 ? "An active gym owner role is required." : "Could not update this membership right now." }, { status });
  }
}
