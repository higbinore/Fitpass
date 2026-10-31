import { and, eq, sql } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";

import { requirePlatformAdmin } from "@/lib/authz";
import { canGrantPlatformAdmin, canReinstatePlatformAdmin, canSuspendPlatformAdmin } from "@/lib/platform-admin-policy";
import { getDb } from "@/lib/db";
import { auditEvents, authUsers, platformAdmins } from "@/lib/schema";

const ADMIN_LOCK = "fitpass:platform-admin-accounts";
const grantSchema = z.object({ email: z.string().trim().email().max(254).transform((value) => value.toLowerCase()) }).strict();
const userSchema = z.object({ userId: z.string().trim().min(1).max(200) }).strict();
const statusSchema = userSchema.extend({ action: z.enum(["suspend", "reinstate"]) }).strict();

function errorResponse(error: unknown, fallback: string) {
  const denied = error instanceof Error && error.name === "AuthorizationError";
  return NextResponse.json({ error: denied ? "Active platform administrator access required." : fallback }, { status: denied ? 403 : 503 });
}

/** Platform admin access is granted only by an active admin to a verified account. */
export async function GET() {
  try {
    const actor = await requirePlatformAdmin();
    const admins = await getDb().select({ userId: platformAdmins.userId, name: authUsers.name, email: authUsers.email, createdAt: platformAdmins.createdAt, suspendedAt: platformAdmins.suspendedAt })
      .from(platformAdmins).innerJoin(authUsers, eq(authUsers.id, platformAdmins.userId)).orderBy(platformAdmins.createdAt);
    return NextResponse.json({ admins: admins.map((admin) => ({ ...admin, isCurrentUser: admin.userId === actor.userId })), activeCount: admins.filter((admin) => admin.suspendedAt === null).length, activeLimit: 10 });
  } catch (error) { return errorResponse(error, "Could not load platform administrators."); }
}

export async function POST(request: Request) {
  try {
    const actor = await requirePlatformAdmin();
    const parsed = grantSchema.safeParse(await request.json());
    if (!parsed.success) return NextResponse.json({ error: "Enter the email of a verified FitPass account." }, { status: 400 });
    const result = await getDb().transaction(async (tx) => {
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${ADMIN_LOCK}))`);
      const admins = await tx.select({ userId: platformAdmins.userId, suspendedAt: platformAdmins.suspendedAt }).from(platformAdmins).for("update");
      if (!admins.some((admin) => admin.userId === actor.userId && admin.suspendedAt === null)) return { error: "Active platform administrator access required.", status: 403 as const };
      const [user] = await tx.select({ id: authUsers.id, name: authUsers.name, email: authUsers.email, emailVerified: authUsers.emailVerified })
        .from(authUsers).where(sql`lower(${authUsers.email}) = ${parsed.data.email}`).limit(1);
      if (!user || !user.emailVerified) return { error: "A registered account with a verified email is required.", status: 404 as const };
      if (admins.some((admin) => admin.userId === user.id)) return { error: "This account already has a platform administrator record. Reinstate it explicitly if suspended.", status: 409 as const };
      const activeCount = admins.filter((admin) => admin.suspendedAt === null).length;
      if (!canGrantPlatformAdmin(activeCount)) return { error: "The limit of 10 active platform administrators has been reached.", status: 409 as const };
      const [admin] = await tx.insert(platformAdmins).values({ userId: user.id, createdByUserId: actor.userId }).returning({ userId: platformAdmins.userId, createdAt: platformAdmins.createdAt, suspendedAt: platformAdmins.suspendedAt });
      await tx.insert(auditEvents).values({ actorUserId: actor.userId, actorLabel: "platform_admin", action: "platform_admin.granted", subjectType: "platform_admin", subjectId: user.id, metadata: { email: user.email } });
      return { admin: { ...admin, name: user.name, email: user.email, isCurrentUser: user.id === actor.userId } };
    });
    if ("error" in result) return NextResponse.json({ error: result.error }, { status: result.status });
    return NextResponse.json(result, { status: 201 });
  } catch (error) { return errorResponse(error, "Could not grant platform access."); }
}

export async function PATCH(request: Request) {
  try {
    const actor = await requirePlatformAdmin();
    const parsed = statusSchema.safeParse(await request.json());
    if (!parsed.success) return NextResponse.json({ error: "Choose an administrator and a valid suspension action." }, { status: 400 });
    if (parsed.data.userId === actor.userId) return NextResponse.json({ error: "Ask another administrator to change your access." }, { status: 409 });
    const result = await getDb().transaction(async (tx) => {
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${ADMIN_LOCK}))`);
      const admins = await tx.select({ userId: platformAdmins.userId, suspendedAt: platformAdmins.suspendedAt }).from(platformAdmins).for("update");
      if (!admins.some((admin) => admin.userId === actor.userId && admin.suspendedAt === null)) return { error: "Active platform administrator access required.", status: 403 as const };
      const target = admins.find((admin) => admin.userId === parsed.data.userId);
      if (!target) return { error: "Platform administrator not found.", status: 404 as const };
      const activeCount = admins.filter((admin) => admin.suspendedAt === null).length;
      if (parsed.data.action === "suspend" && !canSuspendPlatformAdmin({ targetIsActive: target.suspendedAt === null, activeCount })) return { error: "The last active platform administrator cannot be suspended.", status: 409 as const };
      if (parsed.data.action === "reinstate" && !canReinstatePlatformAdmin({ targetIsSuspended: target.suspendedAt !== null, activeCount })) return { error: "The limit of 10 active platform administrators has been reached.", status: 409 as const };
      const suspendedAt = parsed.data.action === "suspend" ? (target.suspendedAt ?? new Date()) : null;
      await tx.update(platformAdmins).set({ suspendedAt }).where(eq(platformAdmins.userId, target.userId));
      const [person] = await tx.select({ email: authUsers.email }).from(authUsers).where(eq(authUsers.id, target.userId)).limit(1);
      await tx.insert(auditEvents).values({ actorUserId: actor.userId, actorLabel: "platform_admin", action: parsed.data.action === "suspend" ? "platform_admin.suspended" : "platform_admin.reinstated", subjectType: "platform_admin", subjectId: target.userId, metadata: { email: person?.email ?? null } });
      return { success: true, userId: target.userId, suspendedAt };
    });
    if ("error" in result) return NextResponse.json({ error: result.error }, { status: result.status });
    return NextResponse.json(result);
  } catch (error) { return errorResponse(error, "Could not update administrator access."); }
}

export async function DELETE(request: Request) {
  try {
    const actor = await requirePlatformAdmin();
    const parsed = userSchema.safeParse(await request.json());
    if (!parsed.success) return NextResponse.json({ error: "Choose a valid platform administrator." }, { status: 400 });
    if (parsed.data.userId === actor.userId) return NextResponse.json({ error: "Ask another platform administrator to remove your access." }, { status: 409 });
    const result = await getDb().transaction(async (tx) => {
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${ADMIN_LOCK}))`);
      const admins = await tx.select({ userId: platformAdmins.userId, suspendedAt: platformAdmins.suspendedAt }).from(platformAdmins).for("update");
      if (!admins.some((admin) => admin.userId === actor.userId && admin.suspendedAt === null)) return { error: "Active platform administrator access required.", status: 403 as const };
      const target = admins.find((admin) => admin.userId === parsed.data.userId);
      if (!target) return { error: "Platform administrator not found.", status: 404 as const };
      const activeCount = admins.filter((admin) => admin.suspendedAt === null).length;
      if (target.suspendedAt === null && activeCount <= 1) return { error: "The last active platform administrator cannot be removed.", status: 409 as const };
      const [person] = await tx.select({ email: authUsers.email }).from(authUsers).where(eq(authUsers.id, target.userId)).limit(1);
      await tx.delete(platformAdmins).where(and(eq(platformAdmins.userId, target.userId)));
      await tx.insert(auditEvents).values({ actorUserId: actor.userId, actorLabel: "platform_admin", action: "platform_admin.revoked", subjectType: "platform_admin", subjectId: target.userId, metadata: { email: person?.email ?? null } });
      return { success: true };
    });
    if ("error" in result) return NextResponse.json({ error: result.error }, { status: result.status });
    return NextResponse.json(result);
  } catch (error) { return errorResponse(error, "Could not revoke platform access."); }
}
