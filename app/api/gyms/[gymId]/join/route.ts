import { randomBytes } from "node:crypto";
import { and, countDistinct, eq, gt, inArray, isNull } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";

import { AuthorizationError, requireVerifiedUser } from "@/lib/authz";
import { canAddMember } from "@/lib/capacity-policy";
import { getDb } from "@/lib/db";
import { auditEvents, gymInvitationRoles, gymInvitations, gymMembershipRoles, gymMemberships, gyms, members, platformPackages, platformSubscriptions } from "@/lib/schema";

const joinSchema = z.object({ phone: z.string().trim().max(40).optional() });

/** Verified enrollment creates only the basic gym_member role and profile. */
export async function POST(request: Request, context: { params: Promise<{ gymId: string }> }) {
  try {
    const identity = await requireVerifiedUser();
    const parsed = joinSchema.safeParse(await request.json());
    if (!parsed.success) return NextResponse.json({ error: "Phone number is invalid." }, { status: 400 });
    const { gymId } = await context.params;

    const joined = await getDb().transaction(async (tx) => {
      const [gym] = await tx.select({ id: gyms.id, status: gyms.status }).from(gyms).where(eq(gyms.id, gymId)).for("update").limit(1);
      if (!gym || gym.status !== "active") return { error: "This gym is unavailable for new memberships.", statusCode: 410 as const };
      const [platformSubscription] = await tx.select({ id: platformSubscriptions.id, packageId: platformSubscriptions.packageId }).from(platformSubscriptions)
        .where(and(eq(platformSubscriptions.gymId, gymId), inArray(platformSubscriptions.status, ["active", "trialing"]), gt(platformSubscriptions.currentPeriodEnd, new Date()))).for("update").limit(1);
      if (!platformSubscription) return { error: "This gym is not currently accepting new memberships.", statusCode: 402 as const };
      const [pkg] = await tx.select({ activeMemberLimit: platformPackages.activeMemberLimit }).from(platformPackages).where(eq(platformPackages.id, platformSubscription.packageId)).limit(1);
      if (!pkg) return { error: "Gym package configuration is unavailable.", statusCode: 503 as const };

      let [membership] = await tx.select().from(gymMemberships).where(and(eq(gymMemberships.gymId, gymId), eq(gymMemberships.userId, identity.userId))).for("update").limit(1);
      if (membership && membership.status !== "active") return { error: "Your gym access is suspended or revoked. Contact the gym owner.", statusCode: 403 as const };
      const [memberRole] = membership ? await tx.select({ id: gymMembershipRoles.id }).from(gymMembershipRoles)
        .where(and(eq(gymMembershipRoles.gymId, gymId), eq(gymMembershipRoles.membershipId, membership.id), eq(gymMembershipRoles.role, "gym_member"), isNull(gymMembershipRoles.revokedAt))).limit(1) : [];

      if (!memberRole) {
        const [activeCount] = await tx.select({ total: countDistinct(gymMemberships.id) }).from(gymMemberships)
          .innerJoin(gymMembershipRoles, and(eq(gymMembershipRoles.gymId, gymMemberships.gymId), eq(gymMembershipRoles.membershipId, gymMemberships.id)))
          .where(and(eq(gymMemberships.gymId, gymId), eq(gymMemberships.status, "active"), eq(gymMembershipRoles.role, "gym_member"), isNull(gymMembershipRoles.revokedAt)));
        const [pendingCount] = await tx.select({ total: countDistinct(gymInvitations.email) }).from(gymInvitations)
          .innerJoin(gymInvitationRoles, eq(gymInvitationRoles.invitationId, gymInvitations.id))
          .where(and(eq(gymInvitations.gymId, gymId), eq(gymInvitations.status, "pending"), gt(gymInvitations.expiresAt, new Date()), eq(gymInvitationRoles.role, "gym_member")));
        if (!canAddMember({ limit: pkg.activeMemberLimit, active: activeCount?.total ?? 0, pendingInvitations: pendingCount?.total ?? 0 })) {
          return { error: "This gym has reached its active member limit.", statusCode: 409 as const };
        }
      }

      if (!membership) {
        [membership] = await tx.insert(gymMemberships).values({ gymId, userId: identity.userId, status: "active" }).returning();
      }
      if (!memberRole) {
        const [grant] = await tx.insert(gymMembershipRoles).values({ gymId, membershipId: membership.id, role: "gym_member", grantedByMembershipId: membership.id }).returning({ id: gymMembershipRoles.id });
        await tx.insert(auditEvents).values({ gymId, actorUserId: identity.userId, actorLabel: identity.email, action: "gym_role.self_enrolled", subjectType: "gym_membership_role", subjectId: grant.id, metadata: { membershipId: membership.id, role: "gym_member" } });
      }
      let [profile] = await tx.select({ id: members.id, membershipCode: members.membershipCode }).from(members)
        .where(and(eq(members.gymId, gymId), eq(members.userId, identity.userId))).limit(1);
      if (!profile) {
        const code = `FP-${randomBytes(5).toString("hex").toUpperCase()}`;
        [profile] = await tx.insert(members).values({ gymId, userId: identity.userId, fullName: identity.name, phone: parsed.data.phone ?? null, membershipCode: code }).returning({ id: members.id, membershipCode: members.membershipCode });
        await tx.insert(auditEvents).values({ gymId, actorUserId: identity.userId, actorLabel: identity.email, action: "gym_member.enrolled", subjectType: "member", subjectId: profile.id, metadata: { membershipId: membership.id } });
      }
      return { memberId: profile.id, membershipCode: profile.membershipCode };
    });
    if ("error" in joined) return NextResponse.json({ error: joined.error }, { status: joined.statusCode });
    return NextResponse.json(joined, { status: 201 });
  } catch (error) {
    const status = error instanceof AuthorizationError ? 401 : 503;
    const message = error instanceof AuthorizationError ? error.message : "Could not join this gym right now.";
    return NextResponse.json({ error: message }, { status });
  }
}
