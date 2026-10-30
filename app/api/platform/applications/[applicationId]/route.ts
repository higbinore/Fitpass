import { createHash, randomBytes } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";

import { requirePlatformAdmin } from "@/lib/authz";
import { getDb } from "@/lib/db";
import { sendGymInvitationEmail } from "@/lib/invite-email";
import { auditEvents, gymApplications, gymInvitationRoles, gymInvitations, gymOnboarding, gyms, platformPackages } from "@/lib/schema";

const reviewSchema = z.object({
  decision: z.enum(["approve", "reject"]),
  reviewNote: z.string().trim().min(3).max(1000).optional(),
  slug: z.string().trim().toLowerCase().min(3).max(80).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).optional(),
  preferredPackageId: z.string().uuid().optional(),
}).refine((value) => value.decision !== "reject" || Boolean(value.reviewNote), { message: "Provide a reason when rejecting an application.", path: ["reviewNote"] });

export async function PATCH(request: Request, context: { params: Promise<{ applicationId: string }> }) {
  let pendingEmail: { to: string; gymName: string; token: string } | null = null;
  try {
    const admin = await requirePlatformAdmin();
    const { applicationId } = await context.params;
    const parsed = reviewSchema.safeParse(await request.json());
    if (!parsed.success) return NextResponse.json({ error: "Invalid review decision." }, { status: 400 });

    const rawToken = parsed.data.decision === "approve" ? randomBytes(32).toString("base64url") : null;
    const tokenHash = rawToken ? createHash("sha256").update(rawToken).digest("hex") : null;
    const reviewed = await getDb().transaction(async (tx) => {
      const [application] = await tx.select().from(gymApplications).where(eq(gymApplications.id, applicationId)).for("update").limit(1);
      if (!application || application.status !== "pending") return null;

      if (parsed.data.decision === "reject") {
        await tx.update(gymApplications).set({ status: "rejected", reviewNote: parsed.data.reviewNote ?? null, reviewedByUserId: admin.userId, reviewedAt: new Date(), updatedAt: new Date() }).where(and(eq(gymApplications.id, applicationId), eq(gymApplications.status, "pending")));
        await tx.insert(auditEvents).values({ actorUserId: admin.userId, actorLabel: "platform_admin", action: "gym_application.rejected", subjectType: "gym_application", subjectId: applicationId, metadata: { note: parsed.data.reviewNote ?? null } });
        return { decision: "reject" as const };
      }

      const preferredPackageId = application.preferredPackageId ?? parsed.data.preferredPackageId;
      if (!preferredPackageId) return { decision: "package_required" as const };
      const [selectedPackage] = await tx.select({ id: platformPackages.id }).from(platformPackages)
        .where(and(eq(platformPackages.id, preferredPackageId), eq(platformPackages.isActive, true))).limit(1);
      if (!selectedPackage) return { decision: "package_unavailable" as const };

      const slug = parsed.data.slug ?? application.requestedSlug;
      const [gym] = await tx.insert(gyms).values({ name: application.gymName, slug, contactPhone: application.phone, contactEmail: application.applicantEmail, location: application.location, logoUrl: application.logoUrl, facilityPhotoUrls: application.facilityPhotoUrls }).returning({ id: gyms.id, name: gyms.name });
      await tx.insert(gymOnboarding).values({ gymId: gym.id, preferredPackageId });
      const [invitation] = await tx.insert(gymInvitations).values({
        gymId: gym.id,
        email: application.applicantEmail,
        tokenHash: tokenHash!,
        invitedByPlatformAdminUserId: admin.userId,
        expiresAt: new Date(Date.now() + 72 * 60 * 60 * 1000),
      }).returning({ id: gymInvitations.id });
      await tx.insert(gymInvitationRoles).values({ invitationId: invitation.id, role: "gym_owner" });
      await tx.update(gymApplications).set({ status: "approved", reviewNote: parsed.data.reviewNote ?? null, reviewedByUserId: admin.userId, reviewedAt: new Date(), updatedAt: new Date() }).where(and(eq(gymApplications.id, applicationId), eq(gymApplications.status, "pending")));
      await tx.insert(auditEvents).values({ gymId: gym.id, actorUserId: admin.userId, actorLabel: "platform_admin", action: "gym_application.approved", subjectType: "gym_application", subjectId: applicationId, metadata: { invitationId: invitation.id, preferredPackageId } });
      pendingEmail = { to: application.applicantEmail, gymName: gym.name, token: rawToken! };
      return { decision: "approve" as const, gym, invitationId: invitation.id };
    });

    if (!reviewed) return NextResponse.json({ error: "Application is missing or has already been reviewed." }, { status: 409 });
    if (reviewed.decision === "package_required") return NextResponse.json({ error: "Select a FitPass package before approving this application." }, { status: 400 });
    if (reviewed.decision === "package_unavailable") return NextResponse.json({ error: "The selected FitPass package is unavailable. Choose an active package." }, { status: 400 });
    if (pendingEmail) {
      try {
        await sendGymInvitationEmail(pendingEmail);
      } catch {
        return NextResponse.json({ ...reviewed, error: "Application approved, but invitation email delivery failed. Issue a replacement invitation from the admin dashboard." }, { status: 502 });
      }
    }
    return NextResponse.json(reviewed);
  } catch (error) {
    const status = error instanceof Error && error.name === "AuthorizationError" ? 403 : 503;
    return NextResponse.json({ error: status === 403 ? "Platform administrator access required." : "Could not review this application right now." }, { status });
  }
}
