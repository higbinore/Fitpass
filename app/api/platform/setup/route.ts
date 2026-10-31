import { randomBytes } from "node:crypto";
import { and, eq, gt, lt, sql } from "drizzle-orm";
import { headers } from "next/headers";
import { NextResponse } from "next/server";

import { getAuth } from "@/lib/auth";
import { getAuthEnv } from "@/lib/env";
import { getDb } from "@/lib/db";
import { INITIAL_ADMIN_SETUP_COMPLETED_ACTION, INITIAL_ADMIN_SETUP_IDENTIFIER, INITIAL_ADMIN_SETUP_LOCK, initialAdminSetupClaimId, readInitialAdminSetupAvailability } from "@/lib/platform-setup";
import { auditEvents, authUsers, authVerifications, platformAdmins } from "@/lib/schema";
import { canBeginInitialPlatformAdminSetup, initialPlatformAdminSetupSchema, isPublicPlatformAdminSetupEnabled } from "@/lib/platform-setup-policy";

export async function GET() {
  if (!isPublicPlatformAdminSetupEnabled()) {
    return NextResponse.json({ available: false, pending: false }, { headers: { "Cache-Control": "no-store" } });
  }
  try {
    const state = await readInitialAdminSetupAvailability();
    return NextResponse.json({ available: canBeginInitialPlatformAdminSetup(state), pending: state.pendingClaimExists }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ error: "First-time administrator setup is temporarily unavailable." }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}

export async function POST(request: Request) {
  if (!isPublicPlatformAdminSetupEnabled()) {
    return NextResponse.json({ error: "Public administrator setup is disabled." }, { status: 404, headers: { "Cache-Control": "no-store" } });
  }
  try {
    const expectedOrigin = new URL(getAuthEnv().BETTER_AUTH_URL).origin;
    if (request.headers.get("origin") !== expectedOrigin) {
      return NextResponse.json({ error: "This setup request is not allowed." }, { status: 403 });
    }

    const parsed = initialPlatformAdminSetupSchema.safeParse(await request.json());
    if (!parsed.success) return NextResponse.json({ error: "Enter a valid name, email, and matching password of at least 12 characters." }, { status: 400 });

    const available = canBeginInitialPlatformAdminSetup(await readInitialAdminSetupAvailability());
    if (!available) return NextResponse.json({ error: "First-time administrator setup is closed or already in progress." }, { status: 409 });

    const claimToken = randomBytes(32).toString("base64url");
    const callback = new URL(`/api/platform/setup/complete?claim=${encodeURIComponent(claimToken)}`, expectedOrigin).toString();
    let createdUserId: string;
    try {
      const result = await getAuth().api.signUpEmail({
        body: { name: parsed.data.name, email: parsed.data.email, password: parsed.data.password, callbackURL: callback },
        headers: await headers(),
      });
      createdUserId = result.user.id;
    } catch {
      return NextResponse.json({ error: "FitPass could not create this setup account. Check the details or use an email address that is not already registered." }, { status: 400 });
    }

    const db = getDb();
    const [createdUser] = await db.select({ id: authUsers.id, email: authUsers.email, emailVerified: authUsers.emailVerified })
      .from(authUsers).where(eq(authUsers.id, createdUserId)).limit(1);
    if (!createdUser || createdUser.email.toLowerCase() !== parsed.data.email || createdUser.emailVerified) {
      return NextResponse.json({ error: "FitPass could not create a new, unverified setup account for that email. No administrator role was granted." }, { status: 409 });
    }

    const now = new Date();
    const stored = await db.transaction(async (tx) => {
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${INITIAL_ADMIN_SETUP_LOCK}))`);
      const [admin] = await tx.select({ userId: platformAdmins.userId }).from(platformAdmins).limit(1);
      const [completed] = await tx.select({ id: auditEvents.id }).from(auditEvents).where(eq(auditEvents.action, INITIAL_ADMIN_SETUP_COMPLETED_ACTION)).limit(1);
      const [pending] = await tx.select({ id: authVerifications.id }).from(authVerifications).where(and(
        eq(authVerifications.identifier, INITIAL_ADMIN_SETUP_IDENTIFIER),
        gt(authVerifications.expiresAt, now),
      )).limit(1);
      if (admin || completed || pending) return false;

      await tx.delete(authVerifications).where(and(
        eq(authVerifications.identifier, INITIAL_ADMIN_SETUP_IDENTIFIER),
        lt(authVerifications.expiresAt, now),
      ));
      await tx.insert(authVerifications).values({
        id: initialAdminSetupClaimId(claimToken),
        identifier: INITIAL_ADMIN_SETUP_IDENTIFIER,
        value: createdUser.id,
        expiresAt: new Date(now.getTime() + 60 * 60 * 1000),
      });
      return true;
    });

    if (!stored) return NextResponse.json({ error: "Another first-time administrator setup is already in progress or has completed. This account received no administrator role." }, { status: 409 });
    return NextResponse.json({ message: "Account created. Verify the email sent to you to activate the first platform administrator access." }, { status: 202 });
  } catch {
    return NextResponse.json({ error: "First-time administrator setup is temporarily unavailable. No administrator access was granted." }, { status: 503 });
  }
}
