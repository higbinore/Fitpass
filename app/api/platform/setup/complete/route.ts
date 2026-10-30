import { and, eq, sql } from "drizzle-orm";
import { headers } from "next/headers";
import { NextResponse } from "next/server";

import { getAuth } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { INITIAL_ADMIN_SETUP_COMPLETED_ACTION, INITIAL_ADMIN_SETUP_IDENTIFIER, INITIAL_ADMIN_SETUP_LOCK, initialAdminSetupClaimId } from "@/lib/platform-setup";
import { decideInitialPlatformAdminClaim } from "@/lib/platform-setup-policy";
import { auditEvents, authUsers, authVerifications, platformAdmins } from "@/lib/schema";

function setupRedirect(request: Request, state: "complete" | "closed" | "verify") {
  const destination = state === "complete" ? "/platform/login?setup=complete" : `/platform/setup?state=${state}`;
  return NextResponse.redirect(new URL(destination, request.url), 303);
}

export async function GET(request: Request) {
  const claimToken = new URL(request.url).searchParams.get("claim") ?? "";
  if (!/^[A-Za-z0-9_-]{43}$/.test(claimToken)) return setupRedirect(request, "closed");

  try {
    const session = await getAuth().api.getSession({ headers: await headers() });
    if (!session?.user?.emailVerified) return setupRedirect(request, "verify");
    const authenticatedUserId = session.user.id;
    const verifiedSessionEmail = session.user.emailVerified;

    const db = getDb();
    const now = new Date();
    const result = await db.transaction(async (tx) => {
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${INITIAL_ADMIN_SETUP_LOCK}))`);
      const [existingAdmin] = await tx.select({ userId: platformAdmins.userId }).from(platformAdmins).limit(1);
      const [completion] = await tx.select({ id: auditEvents.id }).from(auditEvents).where(eq(auditEvents.action, INITIAL_ADMIN_SETUP_COMPLETED_ACTION)).limit(1);
      const [claim] = await tx.select({ id: authVerifications.id, value: authVerifications.value, expiresAt: authVerifications.expiresAt })
        .from(authVerifications).where(and(
          eq(authVerifications.id, initialAdminSetupClaimId(claimToken)),
          eq(authVerifications.identifier, INITIAL_ADMIN_SETUP_IDENTIFIER),
        )).for("update").limit(1);
      const [user] = await tx.select({ id: authUsers.id, emailVerified: authUsers.emailVerified })
        .from(authUsers).where(eq(authUsers.id, authenticatedUserId)).limit(1);
      const decision = decideInitialPlatformAdminClaim({
        administratorExists: Boolean(existingAdmin),
        setupCompleted: Boolean(completion),
        claimExists: Boolean(claim),
        claimExpired: !claim || claim.expiresAt <= now,
        emailVerified: Boolean(user?.emailVerified && verifiedSessionEmail),
        claimUserId: claim?.value ?? null,
        authenticatedUserId,
      });
      if (!decision.allowed) return decision.reason === "already_completed" ? "closed" as const : "verify" as const;

      const [createdAdmin] = await tx.insert(platformAdmins).values({ userId: authenticatedUserId, createdByUserId: "controlled_initial_setup" }).onConflictDoNothing().returning({ userId: platformAdmins.userId });
      if (!createdAdmin) return "closed" as const;
      await tx.insert(auditEvents).values({
        actorLabel: "controlled_initial_setup",
        // Permanent circuit breaker: retention/cleanup must preserve this audit event.
        action: INITIAL_ADMIN_SETUP_COMPLETED_ACTION,
        subjectType: "platform_admin",
        subjectId: authenticatedUserId,
        metadata: { method: "verified_email_setup" },
      });
      await tx.delete(authVerifications).where(eq(authVerifications.id, claim.id));
      return "complete" as const;
    });

    return setupRedirect(request, result);
  } catch {
    return setupRedirect(request, "closed");
  }
}
