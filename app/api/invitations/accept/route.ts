import { createHash } from "node:crypto";
import { and, countDistinct, eq, gt, inArray, isNull } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";

import { AuthorizationError, requireVerifiedUser } from "@/lib/authz";
import { canAddAccounts, canAddMember } from "@/lib/capacity-policy";
import { getDb } from "@/lib/db";
import { auditEvents, gymInvitationRoles, gymInvitations, gymMembershipRoles, gymMemberships, gymOnboarding, gyms, members, platformPackages, platformSubscriptions, type GymRole } from "@/lib/schema";
import { createTrialWindow } from "@/lib/trial-policy";
import { decideInvitationAcceptance } from "@/lib/workflow-policy";
import { randomBytes } from "node:crypto";

const acceptSchema = z.object({ token: z.string().min(32).max(200) });

/** Accepts a single-use, email-bound invitation after verified sign-in. */
export async function POST(request: Request) {
  try {
    const identity = await requireVerifiedUser();
    const parsed = acceptSchema.safeParse(await request.json());
    if (!parsed.success) return NextResponse.json({ error: "Invitation token is invalid." }, { status: 400 });
    const tokenHash = createHash("sha256").update(parsed.data.token).digest("hex");

    const accepted = await getDb().transaction(async (tx) => {
      // Read the tenant key first, then lock rows in the same gym->invitation
      // order used by invitation revocation to avoid lock-order deadlocks.
      const [candidate] = await tx.select({ id: gymInvitations.id, gymId: gymInvitations.gymId }).from(gymInvitations)
        .where(eq(gymInvitations.tokenHash, tokenHash)).limit(1);
      if (!candidate) return { error: "Invitation is invalid or already used.", status: 404 as const };
      const [gym] = await tx.select({ id: gyms.id, name: gyms.name, status: gyms.status }).from(gyms).where(eq(gyms.id, candidate.gymId)).for("update").limit(1);
      const [invitation] = await tx.select().from(gymInvitations).where(and(eq(gymInvitations.id, candidate.id), eq(gymInvitations.tokenHash, tokenHash))).for("update").limit(1);
      if (!invitation) return { error: "Invitation is invalid or already used.", status: 404 as const };
      if (invitation.status !== "pending") return { error: "Invitation is invalid or already used.", status: 404 as const };
      if (invitation.expiresAt <= new Date()) {
        await tx.update(gymInvitations).set({ status: "expired" }).where(eq(gymInvitations.id, invitation.id));
        return { error: "Invitation has expired. Ask a gym owner to send a new one.", status: 410 as const };
      }
      const [existing] = gym ? await tx.select().from(gymMemberships).where(and(eq(gymMemberships.gymId, gym.id), eq(gymMemberships.userId, identity.userId))).for("update").limit(1) : [];
      const decision = decideInvitationAcceptance({
        status: invitation.status,
        expiresAt: invitation.expiresAt,
        now: new Date(),
        invitationEmail: invitation.email,
        verifiedEmail: identity.email,
        gymStatus: gym?.status ?? "missing",
        membershipStatus: existing?.status ?? null,
      });
      if (decision === "invalid_or_used") return { error: "Invitation is invalid or already used.", status: 404 as const };
      if (decision === "email_mismatch") return { error: "Sign in with the verified email address that received this invitation.", status: 403 as const };
      if (decision === "archived_gym") return { error: "This gym is archived and cannot accept invitations.", status: 410 as const };
      if (decision === "inactive_membership") return { error: "This gym membership is suspended or revoked. Ask an owner to review it before accepting another invitation.", status: 409 as const };
      if (decision === "expired") {
        await tx.update(gymInvitations).set({ status: "expired" }).where(eq(gymInvitations.id, invitation.id));
        return { error: "Invitation has expired. Ask a gym owner to send a new one.", status: 410 as const };
      }
      if (!gym) return { error: "This gym is unavailable.", status: 410 as const };
      const requestedRoles = await tx.select({ role: gymInvitationRoles.role }).from(gymInvitationRoles).where(eq(gymInvitationRoles.invitationId, invitation.id));
      if (requestedRoles.length === 0) return { error: "Invitation has no valid role grants.", status: 409 as const };
      const acceptsOwnerRole = requestedRoles.some(({ role }) => role === "gym_owner");
      if (invitation.invitedByPlatformAdminUserId && acceptsOwnerRole) {
        const [onboarding] = await tx.select().from(gymOnboarding).where(eq(gymOnboarding.gymId, gym.id)).for("update").limit(1);
        if (!onboarding) return { error: "First-owner onboarding is incomplete. Contact FitPass support before accepting this invitation.", status: 409 as const };
        if (!onboarding.trialActivatedAt) {
          const [existingCurrent] = await tx.select({ id: platformSubscriptions.id }).from(platformSubscriptions)
            .where(and(eq(platformSubscriptions.gymId, gym.id), inArray(platformSubscriptions.status, ["pending_payment", "trialing", "active", "past_due"]))).for("update").limit(1);
          if (existingCurrent) return { error: "This gym already has a FitPass subscription; platform support must resolve onboarding before activation.", status: 409 as const };
          const activatedAt = new Date();
          const trial = createTrialWindow(activatedAt);
          await tx.insert(platformSubscriptions).values({
            gymId: gym.id,
            packageId: onboarding.preferredPackageId,
            status: "trialing",
            startsAt: trial.startedAt,
            currentPeriodEnd: trial.expiresAt,
          });
          await tx.update(gymOnboarding).set({
            trialActivatedAt: trial.startedAt,
            trialExpiresAt: trial.expiresAt,
            updatedAt: activatedAt,
          }).where(and(eq(gymOnboarding.gymId, gym.id), isNull(gymOnboarding.trialActivatedAt)));
        }
      }
      if (!invitation.invitedByPlatformAdminUserId) {
        const [activePlan] = await tx.select({ id: platformSubscriptions.id, packageId: platformSubscriptions.packageId }).from(platformSubscriptions)
          .where(and(eq(platformSubscriptions.gymId, gym.id), inArray(platformSubscriptions.status, ["active", "trialing"]), gt(platformSubscriptions.currentPeriodEnd, new Date()))).for("update").limit(1);
        if (!activePlan) return { error: "This gym cannot accept new accounts until its FitPass package is active.", status: 402 as const };
        const [pkg] = await tx.select({ activeMemberLimit: platformPackages.activeMemberLimit, adminAccountLimit: platformPackages.adminAccountLimit }).from(platformPackages).where(eq(platformPackages.id, activePlan.packageId)).limit(1);
        if (!pkg) return { error: "FitPass package configuration is unavailable.", status: 503 as const };

        const activeRoles = existing ? await tx.select({ role: gymMembershipRoles.role }).from(gymMembershipRoles)
          .where(and(eq(gymMembershipRoles.gymId, gym.id), eq(gymMembershipRoles.membershipId, existing.id), isNull(gymMembershipRoles.revokedAt))) : [];
        const hasAdminRole = activeRoles.some(({ role }) => role === "gym_owner" || role === "gym_desk_staff");
        const hasMemberRole = activeRoles.some(({ role }) => role === "gym_member");
        const addsAdminRole = requestedRoles.some(({ role }) => role === "gym_owner" || role === "gym_desk_staff") && !hasAdminRole;
        const addsMemberRole = requestedRoles.some(({ role }) => role === "gym_member") && !hasMemberRole;

        if (addsAdminRole) {
          const [active] = await tx.select({ total: countDistinct(gymMemberships.id) }).from(gymMemberships)
            .innerJoin(gymMembershipRoles, and(eq(gymMembershipRoles.gymId, gymMemberships.gymId), eq(gymMembershipRoles.membershipId, gymMemberships.id)))
            .where(and(eq(gymMemberships.gymId, gym.id), eq(gymMemberships.status, "active"), inArray(gymMembershipRoles.role, ["gym_owner", "gym_desk_staff"]), isNull(gymMembershipRoles.revokedAt)));
          const [pending] = await tx.select({ total: countDistinct(gymInvitations.email) }).from(gymInvitations)
            .innerJoin(gymInvitationRoles, eq(gymInvitationRoles.invitationId, gymInvitations.id))
            .where(and(eq(gymInvitations.gymId, gym.id), eq(gymInvitations.status, "pending"), gt(gymInvitations.expiresAt, new Date()), inArray(gymInvitationRoles.role, ["gym_owner", "gym_desk_staff"])));
          if (!canAddAccounts({ limit: pkg.adminAccountLimit, active: active?.total ?? 0, pendingInvitations: Math.max(0, (pending?.total ?? 0) - 1), addsNewAccount: true })) {
            return { error: "The FitPass package administrator-account limit has been reached.", status: 409 as const };
          }
        }
        if (addsMemberRole) {
          const [active] = await tx.select({ total: countDistinct(gymMemberships.id) }).from(gymMemberships)
            .innerJoin(gymMembershipRoles, and(eq(gymMembershipRoles.gymId, gymMemberships.gymId), eq(gymMembershipRoles.membershipId, gymMemberships.id)))
            .where(and(eq(gymMemberships.gymId, gym.id), eq(gymMemberships.status, "active"), eq(gymMembershipRoles.role, "gym_member"), isNull(gymMembershipRoles.revokedAt)));
          const [pending] = await tx.select({ total: countDistinct(gymInvitations.email) }).from(gymInvitations)
            .innerJoin(gymInvitationRoles, eq(gymInvitationRoles.invitationId, gymInvitations.id))
            .where(and(eq(gymInvitations.gymId, gym.id), eq(gymInvitations.status, "pending"), gt(gymInvitations.expiresAt, new Date()), eq(gymInvitationRoles.role, "gym_member")));
          if (!canAddMember({ limit: pkg.activeMemberLimit, active: active?.total ?? 0, pendingInvitations: Math.max(0, (pending?.total ?? 0) - 1) })) {
            return { error: "The FitPass package active-member limit has been reached.", status: 409 as const };
          }
        }
      }
      const acceptedRoles = requestedRoles.map(({ role }) => role as GymRole);

      const [membership] = existing
        ? [existing]
        : await tx.insert(gymMemberships).values({ gymId: gym.id, userId: identity.userId, status: "active" }).returning();

      for (const grant of requestedRoles) {
        await tx.insert(gymMembershipRoles).values({
          gymId: gym.id,
          membershipId: membership.id,
          role: grant.role,
          grantedByMembershipId: invitation.invitedByMembershipId,
          grantedByPlatformAdminUserId: invitation.invitedByPlatformAdminUserId,
        }).onConflictDoNothing();
      }
      if (acceptedRoles.includes("gym_member")) {
        const [profile] = await tx.select({ id: members.id }).from(members)
          .where(and(eq(members.gymId, gym.id), eq(members.userId, identity.userId))).limit(1);
        if (!profile) {
          await tx.insert(members).values({ gymId: gym.id, userId: identity.userId, fullName: identity.name, membershipCode: `FP-${randomBytes(5).toString("hex").toUpperCase()}` });
        }
      }
      await tx.update(gymInvitations).set({ status: "accepted", acceptedByUserId: identity.userId, acceptedAt: new Date() }).where(and(eq(gymInvitations.id, invitation.id), eq(gymInvitations.status, "pending")));
      await tx.insert(auditEvents).values({
        gymId: gym.id,
        actorUserId: identity.userId,
        actorLabel: identity.email,
        action: "gym_invitation.accepted",
        subjectType: "gym_membership",
        subjectId: membership.id,
        metadata: { invitationId: invitation.id, roles: acceptedRoles },
      });
      return { gym: { id: gym.id, name: gym.name }, roles: acceptedRoles };
    });

    if ("error" in accepted) return NextResponse.json({ error: accepted.error }, { status: accepted.status });
    return NextResponse.json(accepted, { status: 200 });
  } catch (error) {
    const status = error instanceof AuthorizationError ? 401 : 503;
    const message = error instanceof AuthorizationError ? error.message : "Could not accept this invitation right now.";
    return NextResponse.json({ error: message }, { status });
  }
}
