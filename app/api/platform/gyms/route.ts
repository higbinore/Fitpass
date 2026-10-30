import { createHash, randomBytes } from "node:crypto";
import { and, count, desc, eq, ilike, or } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";

import { requirePlatformAdmin } from "@/lib/authz";
import { getDb } from "@/lib/db";
import { sendGymInvitationEmail } from "@/lib/invite-email";
import { auditEvents, gymInvitationRoles, gymInvitations, gymOnboarding, gyms, platformPackages } from "@/lib/schema";

const createGymSchema = z.object({
  name: z.string().trim().min(2).max(120),
  slug: z.string().trim().toLowerCase().min(3).max(80).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  firstOwnerEmail: z.string().trim().email().max(254).transform((email) => email.toLowerCase()),
  preferredPackageId: z.string().uuid(),
});

/** Controlled platform-admin provisioning for a gym and its first owner invite. */
export async function POST(request: Request) {
  try {
    const admin = await requirePlatformAdmin();
    const parsed = createGymSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json({ error: "Check the gym name, URL slug, owner email, and selected FitPass package." }, { status: 400 });
    }

    const token = randomBytes(32).toString("base64url");
    const tokenHash = createHash("sha256").update(token).digest("hex");
    const expiresAt = new Date(Date.now() + 72 * 60 * 60 * 1000);
    const result = await getDb().transaction(async (tx) => {
      const [selectedPackage] = await tx.select({ id: platformPackages.id }).from(platformPackages)
        .where(and(eq(platformPackages.id, parsed.data.preferredPackageId), eq(platformPackages.isActive, true))).limit(1);
      if (!selectedPackage) return null;
      const [gym] = await tx.insert(gyms).values({ name: parsed.data.name, slug: parsed.data.slug }).returning({ id: gyms.id, name: gyms.name });
      await tx.insert(gymOnboarding).values({ gymId: gym.id, preferredPackageId: selectedPackage.id });
      const [invitation] = await tx.insert(gymInvitations).values({
        gymId: gym.id,
        email: parsed.data.firstOwnerEmail,
        tokenHash,
        invitedByPlatformAdminUserId: admin.userId,
        expiresAt,
      }).returning({ id: gymInvitations.id });
      await tx.insert(gymInvitationRoles).values({ invitationId: invitation.id, role: "gym_owner" });
      await tx.insert(auditEvents).values({
        gymId: gym.id,
        actorUserId: admin.userId,
        actorLabel: "platform_admin",
        action: "gym.created_with_first_owner_invitation",
        subjectType: "gym",
        subjectId: gym.id,
        metadata: { invitationId: invitation.id, ownerEmail: parsed.data.firstOwnerEmail, preferredPackageId: selectedPackage.id },
      });
      return { gym, invitationId: invitation.id };
    });

    if (!result) return NextResponse.json({ error: "Choose an active FitPass package." }, { status: 400 });

    try {
      await sendGymInvitationEmail({ to: parsed.data.firstOwnerEmail, gymName: result.gym.name, token });
    } catch {
      return NextResponse.json({ gym: result.gym, invitationId: result.invitationId, error: "Gym created, but invitation email could not be delivered. Issue a replacement invitation from the admin dashboard." }, { status: 502 });
    }

    return NextResponse.json({ gym: result.gym, invitationId: result.invitationId }, { status: 201 });
  } catch (error) {
    const status = error instanceof Error && error.name === "AuthorizationError" ? 403 : 503;
    return NextResponse.json({ error: status === 403 ? "Platform administrator access required." : "Could not create the gym right now." }, { status });
  }
}

export async function GET(request: Request) {
  try {
    await requirePlatformAdmin();
    const url = new URL(request.url);
    const rawSearch = url.searchParams.get("search")?.trim().slice(0, 100) ?? "";
    const status = url.searchParams.get("status") ?? "all";
    const page = Math.max(1, Math.min(100_000, Number(url.searchParams.get("page") ?? 1)));
    const pageSize = Math.max(1, Math.min(50, Number(url.searchParams.get("pageSize") ?? 20)));
    if (!Number.isInteger(page) || !Number.isInteger(pageSize) || !["all", "active", "suspended", "archived"].includes(status)) {
      return NextResponse.json({ error: "Invalid gym directory filters." }, { status: 400 });
    }
    const searchPattern = `%${rawSearch.replace(/[\\%_]/g, "\\$&")}%`;
    const filters = [];
    if (status !== "all") filters.push(eq(gyms.status, status));
    if (rawSearch) filters.push(or(ilike(gyms.name, searchPattern), ilike(gyms.slug, searchPattern))!);
    const where = filters.length ? and(...filters) : undefined;
    const db = getDb();
    const [rows, [total]] = await Promise.all([
      db.select({ id: gyms.id, slug: gyms.slug, name: gyms.name, status: gyms.status, archivedAt: gyms.archivedAt, createdAt: gyms.createdAt })
        .from(gyms).where(where).orderBy(desc(gyms.createdAt), desc(gyms.id)).limit(pageSize).offset((page - 1) * pageSize),
      db.select({ total: count() }).from(gyms).where(where),
    ]);
    return NextResponse.json({ gyms: rows, total: total.total, page, pageSize, hasMore: page * pageSize < total.total });
  } catch (error) {
    const status = error instanceof Error && error.name === "AuthorizationError" ? 403 : 503;
    return NextResponse.json({ error: status === 403 ? "Platform administrator access required." : "Could not load gyms." }, { status });
  }
}
