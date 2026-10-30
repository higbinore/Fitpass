import "server-only";

import { createHash } from "node:crypto";
import { and, eq, gt } from "drizzle-orm";

import { getDb } from "@/lib/db";
import { auditEvents, authVerifications, platformAdmins } from "@/lib/schema";

export const INITIAL_ADMIN_SETUP_IDENTIFIER = "fitpass.platform_admin.initial_setup";
export const INITIAL_ADMIN_SETUP_COMPLETED_ACTION = "platform_admin.initial_setup_completed";
export const INITIAL_ADMIN_SETUP_LOCK = "fitpass.platform-admin.initial-setup";

export function initialAdminSetupClaimId(token: string): string {
  const digest = createHash("sha256").update(token).digest("hex");
  return `fitpass-platform-admin-setup:${digest}`;
}

export async function readInitialAdminSetupAvailability() {
  const db = getDb();
  const now = new Date();
  const [admin, completion, pendingClaim] = await Promise.all([
    db.select({ userId: platformAdmins.userId }).from(platformAdmins).limit(1),
    db.select({ id: auditEvents.id }).from(auditEvents).where(eq(auditEvents.action, INITIAL_ADMIN_SETUP_COMPLETED_ACTION)).limit(1),
    db.select({ id: authVerifications.id }).from(authVerifications).where(and(
      eq(authVerifications.identifier, INITIAL_ADMIN_SETUP_IDENTIFIER),
      gt(authVerifications.expiresAt, now),
    )).limit(1),
  ]);
  return {
    administratorExists: admin.length > 0,
    setupCompleted: completion.length > 0,
    pendingClaimExists: pendingClaim.length > 0,
  };
}
