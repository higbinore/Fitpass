import { and, countDistinct, desc, eq, inArray, isNull } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";

import { requirePlatformAdmin } from "@/lib/authz";
import { getDb } from "@/lib/db";
import { auditEvents, authUsers, gymMembershipRoles, gymMemberships, gyms, platformPackages, platformSubscriptions } from "@/lib/schema";

const updateSchema = z.object({
  name: z.string().trim().min(2).max(120),
  slug: z.string().trim().toLowerCase().min(3).max(80).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  status: z.enum(["active", "suspended", "archived"]),
  contactPhone: z.string().trim().max(40).nullable(),
  contactEmail: z.string().trim().email().max(254).nullable(),
  location: z.string().trim().max(240).nullable(),
  description: z.string().trim().max(1200).nullable(),
  openingHours: z.string().trim().max(240).nullable(),
  amenities: z.array(z.string().trim().min(1).max(80)).max(20),
  equipment: z.array(z.string().trim().min(1).max(80)).max(30),
  latitude: z.number().finite().min(-90).max(90).nullable(),
  longitude: z.number().finite().min(-180).max(180).nullable(),
  locationSource: z.string().trim().url().max(1000).nullable(),
  maxDailyCheckins: z.number().int().min(1).max(20),
}).refine((value) => (value.latitude === null) === (value.longitude === null) && (value.latitude === null ? value.locationSource === null : Boolean(value.locationSource)), { message: "Provide both coordinates and their verification source, or clear all three." });

export async function GET(_request: Request, context: { params: Promise<{ gymId: string }> }) {
  try {
    const admin = await requirePlatformAdmin();
    const { gymId } = await context.params;
    const db = getDb();
    const [gym] = await db.select().from(gyms).where(eq(gyms.id, gymId)).limit(1);
    if (!gym) return NextResponse.json({ error: "Gym not found." }, { status: 404 });

    const [[memberships], [members], [activeMembers], owners, [subscription], activity] = await Promise.all([
      db.select({ total: countDistinct(gymMemberships.id) }).from(gymMemberships).where(eq(gymMemberships.gymId, gymId)),
      db.select({ total: countDistinct(gymMemberships.id) }).from(gymMemberships)
        .innerJoin(gymMembershipRoles, and(eq(gymMembershipRoles.gymId, gymMemberships.gymId), eq(gymMembershipRoles.membershipId, gymMemberships.id)))
        .where(and(eq(gymMemberships.gymId, gymId), eq(gymMemberships.status, "active"), eq(gymMembershipRoles.role, "gym_member"), isNull(gymMembershipRoles.revokedAt))),
      db.select({ total: countDistinct(gymMemberships.id) }).from(gymMemberships)
        .innerJoin(gymMembershipRoles, and(eq(gymMembershipRoles.gymId, gymMemberships.gymId), eq(gymMembershipRoles.membershipId, gymMemberships.id)))
        .where(and(eq(gymMemberships.gymId, gymId), eq(gymMemberships.status, "active"), inArray(gymMembershipRoles.role, ["gym_owner", "gym_desk_staff"]), isNull(gymMembershipRoles.revokedAt))),
      db.select({ name: authUsers.name, email: authUsers.email, membershipStatus: gymMemberships.status, createdAt: gymMemberships.createdAt })
        .from(gymMemberships).innerJoin(gymMembershipRoles, and(eq(gymMembershipRoles.gymId, gymMemberships.gymId), eq(gymMembershipRoles.membershipId, gymMemberships.id)))
        .innerJoin(authUsers, eq(authUsers.id, gymMemberships.userId))
        .where(and(eq(gymMemberships.gymId, gymId), eq(gymMembershipRoles.role, "gym_owner"), isNull(gymMembershipRoles.revokedAt)))
        .orderBy(desc(gymMemberships.createdAt)).limit(20),
      db.select({ id: platformSubscriptions.id, status: platformSubscriptions.status, packageName: platformPackages.name, priceKobo: platformPackages.priceKobo, billingInterval: platformPackages.billingInterval, currentPeriodEnd: platformSubscriptions.currentPeriodEnd })
        .from(platformSubscriptions).innerJoin(platformPackages, eq(platformPackages.id, platformSubscriptions.packageId))
        .where(eq(platformSubscriptions.gymId, gymId)).orderBy(desc(platformSubscriptions.createdAt)).limit(1),
      db.select({ action: auditEvents.action, actorLabel: auditEvents.actorLabel, createdAt: auditEvents.createdAt })
        .from(auditEvents).where(eq(auditEvents.gymId, gymId)).orderBy(desc(auditEvents.createdAt)).limit(10),
    ]);

    await db.insert(auditEvents).values({ actorUserId: admin.userId, actorLabel: "platform_admin", action: "platform_admin.gym_details_viewed", subjectType: "gym", subjectId: gymId });
    return NextResponse.json({
      gym,
      counts: { accounts: memberships.total, activeMembers: members.total, activeAdminAccounts: activeMembers.total },
      owners,
      subscription: subscription ?? null,
      activity,
    });
  } catch (error) {
    const denied = error instanceof Error && error.name === "AuthorizationError";
    return NextResponse.json({ error: denied ? "Platform administrator access required." : "Could not load gym details." }, { status: denied ? 403 : 503 });
  }
}

export async function PATCH(request: Request, context: { params: Promise<{ gymId: string }> }) {
  try {
    const admin = await requirePlatformAdmin();
    const { gymId } = await context.params;
    const parsed = updateSchema.safeParse(await request.json());
    if (!parsed.success) return NextResponse.json({ error: "Check the gym name, slug, status, and verified coordinate details." }, { status: 400 });

    const updated = await getDb().transaction(async (tx) => {
      const [before] = await tx.select().from(gyms).where(eq(gyms.id, gymId)).for("update").limit(1);
      if (!before) return null;
      const now = new Date();
      const coordinatesChanged = before.latitude !== parsed.data.latitude || before.longitude !== parsed.data.longitude || before.locationSource !== parsed.data.locationSource;
      const changedFields = (Object.keys(parsed.data) as Array<keyof typeof parsed.data>).filter((key) =>
        JSON.stringify(before[key]) !== JSON.stringify(parsed.data[key]),
      );
      const [after] = await tx.update(gyms).set({
        name: parsed.data.name,
        slug: parsed.data.slug,
        status: parsed.data.status,
        contactPhone: parsed.data.contactPhone,
        contactEmail: parsed.data.contactEmail,
        location: parsed.data.location,
        description: parsed.data.description,
        openingHours: parsed.data.openingHours,
        amenities: parsed.data.amenities,
        equipment: parsed.data.equipment,
        latitude: parsed.data.latitude,
        longitude: parsed.data.longitude,
        locationSource: parsed.data.locationSource,
        maxDailyCheckins: parsed.data.maxDailyCheckins,
        locationVerifiedAt: parsed.data.latitude === null ? null : coordinatesChanged ? now : before.locationVerifiedAt,
        locationVerifiedByUserId: parsed.data.latitude === null ? null : coordinatesChanged ? admin.userId : before.locationVerifiedByUserId,
        suspendedAt: parsed.data.status === "suspended" ? (before.suspendedAt ?? now) : null,
        archivedAt: parsed.data.status === "archived" ? (before.archivedAt ?? now) : null,
        updatedAt: now,
      }).where(eq(gyms.id, gymId)).returning({ id: gyms.id, name: gyms.name, slug: gyms.slug, status: gyms.status, maxDailyCheckins: gyms.maxDailyCheckins, suspendedAt: gyms.suspendedAt, archivedAt: gyms.archivedAt });
      await tx.insert(auditEvents).values({
        actorUserId: admin.userId,
        actorLabel: "platform_admin",
        action: "platform_admin.gym_updated",
        subjectType: "gym",
        subjectId: gymId,
        metadata: { changedFields: [...changedFields.filter((key) => key !== "latitude" && key !== "longitude" && key !== "locationSource"), ...(coordinatesChanged ? ["verified_coordinates"] : [])], previousStatus: before.status, currentStatus: after.status, previousMaxDailyCheckins: before.maxDailyCheckins, currentMaxDailyCheckins: after.maxDailyCheckins, ...(coordinatesChanged ? { coordinates: parsed.data.latitude === null ? null : { latitude: parsed.data.latitude, longitude: parsed.data.longitude, source: parsed.data.locationSource } } : {}) },
      });
      return after;
    });
    if (!updated) return NextResponse.json({ error: "Gym not found." }, { status: 404 });
    return NextResponse.json({ gym: updated });
  } catch (error) {
    const denied = error instanceof Error && error.name === "AuthorizationError";
    if (!denied && error instanceof Error && /unique|duplicate/i.test(error.message)) {
      return NextResponse.json({ error: "That gym URL is already in use." }, { status: 409 });
    }
    return NextResponse.json({ error: denied ? "Platform administrator access required." : "Could not update gym settings." }, { status: denied ? 403 : 503 });
  }
}
