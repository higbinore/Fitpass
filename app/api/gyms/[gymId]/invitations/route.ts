import { createHash, randomBytes } from "node:crypto";
import { and, countDistinct, desc, eq, gt, inArray, isNull, sql } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";

import { AuthorizationError, requireActiveGymOwner } from "@/lib/authz";
import { canAddAccounts, canAddMember } from "@/lib/capacity-policy";
import { getDb } from "@/lib/db";
import { sendGymInvitationEmail } from "@/lib/invite-email";
import { hasActiveGymRoleInTransaction } from "@/lib/transaction-authz";
import { auditEvents, authUsers, gymInvitationRoles, gymInvitations, gymMembershipRoles, gymMemberships, gyms, platformPackages, platformSubscriptions, type GymRole } from "@/lib/schema";

const inviteSchema = z.object({
  email: z.string().trim().email().max(254).transform((email) => email.toLowerCase()),
  roles: z.array(z.enum(["gym_owner", "gym_desk_staff", "gym_member"])).min(1).max(3),
}).refine((data) => new Set(data.roles).size === data.roles.length, "Roles must not be repeated.");

export async function POST(request: Request, context: { params: Promise<{ gymId: string }> }) {
  try {
    const { gymId } = await context.params;
    const owner = await requireActiveGymOwner(gymId);
    const parsed = inviteSchema.safeParse(await request.json());
    if (!parsed.success) return NextResponse.json({ error: "Provide a valid email and one or more gym roles." }, { status: 400 });

    const token = randomBytes(32).toString("base64url");
    const tokenHash = createHash("sha256").update(token).digest("hex");
    const created = await getDb().transaction(async (tx) => {
      const [gym] = await tx.select({ id: gyms.id, name: gyms.name, status: gyms.status }).from(gyms).where(eq(gyms.id, gymId)).for("update").limit(1);
      if (!gym || gym.status !== "active") return null;
      if (!await hasActiveGymRoleInTransaction(tx, { gymId, userId: owner.userId, membershipId: owner.membershipId, role: "gym_owner" })) {
        return { error: "An active gym owner role is required.", statusCode: 403 as const };
      }
      const now = new Date();
      const [platformSubscription] = await tx.select({ packageId: platformSubscriptions.packageId }).from(platformSubscriptions)
        .where(and(eq(platformSubscriptions.gymId, gymId), inArray(platformSubscriptions.status, ["active", "trialing"]), gt(platformSubscriptions.currentPeriodEnd, now))).for("update").limit(1);
      if (!platformSubscription) return { error: "An active FitPass package is required before sending gym invitations.", statusCode: 402 as const };
      const [pkg] = await tx.select({ activeMemberLimit: platformPackages.activeMemberLimit, adminAccountLimit: platformPackages.adminAccountLimit }).from(platformPackages).where(eq(platformPackages.id, platformSubscription.packageId)).limit(1);
      if (!pkg) return { error: "FitPass package configuration is unavailable.", statusCode: 503 as const };
      const [user] = await tx.select({ id: authUsers.id }).from(authUsers).where(sql`lower(${authUsers.email}) = ${parsed.data.email}`).limit(1);
      const [existingMembership] = user ? await tx.select({ id: gymMemberships.id, status: gymMemberships.status }).from(gymMemberships)
        .where(and(eq(gymMemberships.gymId, gymId), eq(gymMemberships.userId, user.id))).for("update").limit(1) : [];
      if (existingMembership && existingMembership.status !== "active") return { error: "This account has a suspended or revoked gym membership.", statusCode: 409 as const };
      const existingRoles = existingMembership ? await tx.select({ role: gymMembershipRoles.role }).from(gymMembershipRoles)
        .where(and(eq(gymMembershipRoles.gymId, gymId), eq(gymMembershipRoles.membershipId, existingMembership.id), isNull(gymMembershipRoles.revokedAt))) : [];
      const hasAdminRole = existingRoles.some(({ role }) => role === "gym_owner" || role === "gym_desk_staff");
      const hasMemberRole = existingRoles.some(({ role }) => role === "gym_member");
      if (parsed.data.roles.some((role) => role === "gym_owner" || role === "gym_desk_staff") && !hasAdminRole) {
        const [active] = await tx.select({ total: countDistinct(gymMemberships.id) }).from(gymMemberships)
          .innerJoin(gymMembershipRoles, and(eq(gymMembershipRoles.gymId, gymMemberships.gymId), eq(gymMembershipRoles.membershipId, gymMemberships.id)))
          .where(and(eq(gymMemberships.gymId, gymId), eq(gymMemberships.status, "active"), inArray(gymMembershipRoles.role, ["gym_owner", "gym_desk_staff"]), isNull(gymMembershipRoles.revokedAt)));
        const [pending] = await tx.select({ total: countDistinct(gymInvitations.email) }).from(gymInvitations)
          .innerJoin(gymInvitationRoles, eq(gymInvitationRoles.invitationId, gymInvitations.id))
          .where(and(eq(gymInvitations.gymId, gymId), eq(gymInvitations.status, "pending"), gt(gymInvitations.expiresAt, now), inArray(gymInvitationRoles.role, ["gym_owner", "gym_desk_staff"])));
        if (!canAddAccounts({ limit: pkg.adminAccountLimit, active: active?.total ?? 0, pendingInvitations: pending?.total ?? 0, addsNewAccount: true })) return { error: "The FitPass package administrator-account limit has been reached.", statusCode: 409 as const };
      }
      if (parsed.data.roles.includes("gym_member") && !hasMemberRole) {
        const [active] = await tx.select({ total: countDistinct(gymMemberships.id) }).from(gymMemberships)
          .innerJoin(gymMembershipRoles, and(eq(gymMembershipRoles.gymId, gymMemberships.gymId), eq(gymMembershipRoles.membershipId, gymMemberships.id)))
          .where(and(eq(gymMemberships.gymId, gymId), eq(gymMemberships.status, "active"), eq(gymMembershipRoles.role, "gym_member"), isNull(gymMembershipRoles.revokedAt)));
        const [pending] = await tx.select({ total: countDistinct(gymInvitations.email) }).from(gymInvitations)
          .innerJoin(gymInvitationRoles, eq(gymInvitationRoles.invitationId, gymInvitations.id))
          .where(and(eq(gymInvitations.gymId, gymId), eq(gymInvitations.status, "pending"), gt(gymInvitations.expiresAt, now), eq(gymInvitationRoles.role, "gym_member")));
        if (!canAddMember({ limit: pkg.activeMemberLimit, active: active?.total ?? 0, pendingInvitations: pending?.total ?? 0 })) return { error: "The FitPass package active-member limit has been reached.", statusCode: 409 as const };
      }
      const [invitation] = await tx.insert(gymInvitations).values({
        gymId,
        email: parsed.data.email,
        tokenHash,
        invitedByMembershipId: owner.membershipId,
        expiresAt: new Date(Date.now() + 72 * 60 * 60 * 1000),
      }).returning({ id: gymInvitations.id });
      await tx.insert(gymInvitationRoles).values(parsed.data.roles.map((role: GymRole) => ({ invitationId: invitation.id, role })));
      await tx.insert(auditEvents).values({
        gymId,
        actorUserId: owner.userId,
        actorLabel: "gym_owner",
        action: "gym_invitation.created",
        subjectType: "gym_invitation",
        subjectId: invitation.id,
        metadata: { roles: parsed.data.roles },
      });
      return { gym, invitationId: invitation.id };
    });
    if (!created) return NextResponse.json({ error: "This gym is archived." }, { status: 409 });
    if ("error" in created) return NextResponse.json({ error: created.error }, { status: created.statusCode });

    try {
      await sendGymInvitationEmail({ to: parsed.data.email, gymName: created.gym.name, token });
    } catch {
      return NextResponse.json({ invitationId: created.invitationId, error: "Invitation created, but email delivery failed. Revoke it and issue a replacement after checking email configuration." }, { status: 502 });
    }
    return NextResponse.json({ invitationId: created.invitationId, status: "pending" }, { status: 201 });
  } catch (error) {
    const status = error instanceof Error && error.name === "AuthorizationError" ? 403 : 503;
    return NextResponse.json({ error: status === 403 ? "An active gym owner role is required." : "Could not create the invitation right now." }, { status });
  }
}

/** Owner-only invitation list. Invitation tokens and hashes are never returned. */
export async function GET(_request: Request, context: { params: Promise<{ gymId: string }> }) {
  try {
    const { gymId } = await context.params;
    await requireActiveGymOwner(gymId);
    const db = getDb();
    const rows = await db.select({
      id: gymInvitations.id,
      email: gymInvitations.email,
      status: gymInvitations.status,
      expiresAt: gymInvitations.expiresAt,
      createdAt: gymInvitations.createdAt,
    }).from(gymInvitations)
      .where(eq(gymInvitations.gymId, gymId))
      .orderBy(desc(gymInvitations.createdAt))
      .limit(25);
    const roles = rows.length ? await db.select({ invitationId: gymInvitationRoles.invitationId, role: gymInvitationRoles.role })
      .from(gymInvitationRoles).where(inArray(gymInvitationRoles.invitationId, rows.map((row) => row.id))) : [];
    const rolesByInvitation = new Map<string, string[]>();
    for (const item of roles) rolesByInvitation.set(item.invitationId, [...(rolesByInvitation.get(item.invitationId) ?? []), item.role]);
    const now = new Date();
    return NextResponse.json({ invitations: rows.map((row) => ({
      ...row,
      status: row.status === "pending" && row.expiresAt <= now ? "expired" : row.status,
      roles: rolesByInvitation.get(row.id) ?? [],
    })) });
  } catch (error) {
    const denied = error instanceof AuthorizationError;
    return NextResponse.json({ error: denied ? "An active gym owner role is required." : "Could not load gym invitations." }, { status: denied ? 403 : 503 });
  }
}
