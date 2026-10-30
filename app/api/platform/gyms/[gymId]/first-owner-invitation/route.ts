import { createHash, randomBytes } from "node:crypto";
import { and, countDistinct, eq, isNull } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";

import { requirePlatformAdmin } from "@/lib/authz";
import { getDb } from "@/lib/db";
import { sendGymInvitationEmail } from "@/lib/invite-email";
import { auditEvents, gymInvitationRoles, gymInvitations, gymMembershipRoles, gymMemberships, gymOnboarding, gyms, platformPackages } from "@/lib/schema";

const schema = z.object({ email: z.string().trim().email().max(254).transform((email) => email.toLowerCase()), preferredPackageId: z.string().uuid().optional() });

/** Reissues a controlled first-owner invitation when no owner has accepted yet. */
export async function POST(request: Request, context: { params: Promise<{ gymId: string }> }) {
  try {
    const admin = await requirePlatformAdmin();
    const { gymId } = await context.params;
    const parsed = schema.safeParse(await request.json());
    if (!parsed.success) return NextResponse.json({ error: "Enter a valid first-owner email address." }, { status: 400 });
    const token = randomBytes(32).toString("base64url");
    const tokenHash = createHash("sha256").update(token).digest("hex");
    const provisioned = await getDb().transaction(async (tx) => {
      const [gym] = await tx.select({ id: gyms.id, name: gyms.name, status: gyms.status }).from(gyms).where(eq(gyms.id, gymId)).for("update").limit(1);
      if (!gym || gym.status !== "active") return { error: "An active gym is required.", statusCode: 409 as const };
      const [onboarding] = await tx.select({ gymId: gymOnboarding.gymId }).from(gymOnboarding).where(eq(gymOnboarding.gymId, gymId)).for("update").limit(1);
      const [owners] = await tx.select({ total: countDistinct(gymMemberships.id) }).from(gymMemberships)
        .innerJoin(gymMembershipRoles, and(eq(gymMembershipRoles.gymId, gymMemberships.gymId), eq(gymMembershipRoles.membershipId, gymMemberships.id)))
        .where(and(eq(gymMemberships.gymId, gymId), eq(gymMemberships.status, "active"), eq(gymMembershipRoles.role, "gym_owner"), isNull(gymMembershipRoles.revokedAt)));
      if ((owners?.total ?? 0) > 0) return { error: "This gym already has an active owner; use the regular owner invitation workflow.", statusCode: 409 as const };
      if (!onboarding) {
        if (!parsed.data.preferredPackageId) return { error: "Choose a FitPass package to complete first-owner onboarding.", statusCode: 400 as const };
        const [pkg] = await tx.select({ id: platformPackages.id }).from(platformPackages)
          .where(and(eq(platformPackages.id, parsed.data.preferredPackageId), eq(platformPackages.isActive, true))).limit(1);
        if (!pkg) return { error: "Choose an active FitPass package.", statusCode: 400 as const };
        await tx.insert(gymOnboarding).values({ gymId, preferredPackageId: pkg.id });
      }
      const pendingOwnerInvitations = await tx.select({ id: gymInvitations.id }).from(gymInvitations)
        .innerJoin(gymInvitationRoles, eq(gymInvitationRoles.invitationId, gymInvitations.id))
        .where(and(eq(gymInvitations.gymId, gymId), eq(gymInvitations.status, "pending"), eq(gymInvitationRoles.role, "gym_owner"))).for("update");
      for (const previous of pendingOwnerInvitations) {
        await tx.update(gymInvitations).set({ status: "revoked" }).where(eq(gymInvitations.id, previous.id));
        await tx.insert(auditEvents).values({ gymId, actorUserId: admin.userId, actorLabel: "platform_admin", action: "gym_first_owner_invitation.replaced", subjectType: "gym_invitation", subjectId: previous.id });
      }
      const [invitation] = await tx.insert(gymInvitations).values({
        gymId,
        email: parsed.data.email,
        tokenHash,
        invitedByPlatformAdminUserId: admin.userId,
        expiresAt: new Date(Date.now() + 72 * 60 * 60 * 1000),
      }).returning({ id: gymInvitations.id });
      await tx.insert(gymInvitationRoles).values({ invitationId: invitation.id, role: "gym_owner" });
      await tx.insert(auditEvents).values({ gymId, actorUserId: admin.userId, actorLabel: "platform_admin", action: "gym_first_owner_invitation.created", subjectType: "gym_invitation", subjectId: invitation.id, metadata: onboarding ? {} : { preferredPackageId: parsed.data.preferredPackageId } });
      return { gym, invitationId: invitation.id };
    });
    if ("error" in provisioned) return NextResponse.json({ error: provisioned.error }, { status: provisioned.statusCode });
    try {
      await sendGymInvitationEmail({ to: parsed.data.email, gymName: provisioned.gym.name, token });
    } catch {
      return NextResponse.json({ invitationId: provisioned.invitationId, error: "Invitation was created, but email delivery failed. Retry to replace this pending invitation after checking email configuration." }, { status: 502 });
    }
    return NextResponse.json({ invitationId: provisioned.invitationId, status: "pending" }, { status: 201 });
  } catch (error) {
    const status = error instanceof Error && error.name === "AuthorizationError" ? 403 : 503;
    return NextResponse.json({ error: status === 403 ? "Platform administrator access required." : "Could not issue the owner invitation." }, { status });
  }
}
