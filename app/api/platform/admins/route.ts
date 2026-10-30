import { and, eq, sql } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";

import { requirePlatformAdmin } from "@/lib/authz";
import { getDb } from "@/lib/db";
import { auditEvents, authUsers, platformAdmins } from "@/lib/schema";

const grantSchema = z.object({ email: z.string().trim().email().max(254).transform((value) => value.toLowerCase()) });
const revokeSchema = z.object({ userId: z.string().trim().min(1).max(200) });

/** Platform admin access is granted only by an already authorized admin to a verified account. */
export async function GET() {
  try {
    await requirePlatformAdmin();
    const admins = await getDb().select({ userId: platformAdmins.userId, name: authUsers.name, email: authUsers.email, createdAt: platformAdmins.createdAt })
      .from(platformAdmins).innerJoin(authUsers, eq(authUsers.id, platformAdmins.userId)).orderBy(platformAdmins.createdAt);
    return NextResponse.json({ admins });
  } catch (error) {
    const denied = error instanceof Error && error.name === "AuthorizationError";
    return NextResponse.json({ error: denied ? "Platform administrator access required." : "Could not load platform administrators." }, { status: denied ? 403 : 503 });
  }
}

export async function POST(request: Request) {
  try {
    const actor = await requirePlatformAdmin();
    const parsed = grantSchema.safeParse(await request.json());
    if (!parsed.success) return NextResponse.json({ error: "Enter the email of a verified FitPass account." }, { status: 400 });
    const result = await getDb().transaction(async (tx) => {
      const [user] = await tx.select({ id: authUsers.id, name: authUsers.name, email: authUsers.email, emailVerified: authUsers.emailVerified })
        .from(authUsers).where(sql`lower(${authUsers.email}) = ${parsed.data.email}`).limit(1);
      if (!user || !user.emailVerified) return { error: "A registered account with a verified email is required.", status: 404 as const };
      const [admin] = await tx.insert(platformAdmins).values({ userId: user.id, createdByUserId: actor.userId }).onConflictDoNothing().returning({ userId: platformAdmins.userId, createdAt: platformAdmins.createdAt });
      if (!admin) return { error: "This account is already a platform administrator.", status: 409 as const };
      await tx.insert(auditEvents).values({ actorUserId: actor.userId, actorLabel: "platform_admin", action: "platform_admin.granted", subjectType: "platform_admin", subjectId: user.id, metadata: { email: user.email } });
      return { admin: { ...admin, name: user.name, email: user.email } };
    });
    if ("error" in result) return NextResponse.json({ error: result.error }, { status: result.status });
    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    const denied = error instanceof Error && error.name === "AuthorizationError";
    return NextResponse.json({ error: denied ? "Platform administrator access required." : "Could not grant platform access." }, { status: denied ? 403 : 503 });
  }
}

export async function DELETE(request: Request) {
  try {
    const actor = await requirePlatformAdmin();
    const parsed = revokeSchema.safeParse(await request.json());
    if (!parsed.success) return NextResponse.json({ error: "Choose a valid platform administrator." }, { status: 400 });
    const result = await getDb().transaction(async (tx) => {
      if (parsed.data.userId === actor.userId) return { error: "Ask another platform administrator to remove your access.", status: 409 as const };
      // Lock the current set so concurrent revocations cannot both remove the final administrator.
      const admins = await tx.select({ userId: platformAdmins.userId }).from(platformAdmins).for("update");
      if (!admins.some((admin) => admin.userId === parsed.data.userId)) return { error: "Platform administrator not found.", status: 404 as const };
      if (admins.length <= 1) return { error: "The last platform administrator cannot be removed.", status: 409 as const };
      const [target] = await tx.select({ email: authUsers.email }).from(authUsers).where(eq(authUsers.id, parsed.data.userId)).limit(1);
      await tx.delete(platformAdmins).where(and(eq(platformAdmins.userId, parsed.data.userId)));
      await tx.insert(auditEvents).values({ actorUserId: actor.userId, actorLabel: "platform_admin", action: "platform_admin.revoked", subjectType: "platform_admin", subjectId: parsed.data.userId, metadata: { email: target?.email ?? null } });
      return { success: true };
    });
    if ("error" in result) return NextResponse.json({ error: result.error }, { status: result.status });
    return NextResponse.json(result);
  } catch (error) {
    const denied = error instanceof Error && error.name === "AuthorizationError";
    return NextResponse.json({ error: denied ? "Platform administrator access required." : "Could not revoke platform access." }, { status: denied ? 403 : 503 });
  }
}
