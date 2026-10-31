import { eq, sql } from "drizzle-orm";

import { getDb } from "../lib/db";
import { canGrantPlatformAdmin } from "../lib/platform-admin-policy";
import { auditEvents, authUsers, platformAdmins } from "../lib/schema";

const ADMIN_LOCK = "fitpass:platform-admin-accounts";

async function main() {
  const emailArg = process.argv.find((arg) => arg.startsWith("--email="));
  const confirmed = process.argv.includes("--confirm");
  const email = emailArg?.slice("--email=".length).trim().toLowerCase();
  if (!email || !confirmed || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error("Usage: npm run provision:platform-admin -- --email=verified-account@example.com --confirm");
  }

  const db = getDb();
  try {
    await db.transaction(async (tx) => {
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${ADMIN_LOCK}))`);
      const [user] = await tx.select({ id: authUsers.id, emailVerified: authUsers.emailVerified }).from(authUsers).where(eq(authUsers.email, email)).for("update").limit(1);
      if (!user || !user.emailVerified) throw new Error("A verified Better Auth account with that email must exist first.");
      const admins = await tx.select({ userId: platformAdmins.userId, suspendedAt: platformAdmins.suspendedAt }).from(platformAdmins).for("update");
      const [existing] = admins.filter((admin) => admin.userId === user.id);
      if (existing) throw new Error("This account is already a platform administrator.");
      if (!canGrantPlatformAdmin(admins.filter((admin) => admin.suspendedAt === null).length)) throw new Error("The limit of 10 active platform administrators has been reached.");
      await tx.insert(platformAdmins).values({ userId: user.id, createdByUserId: "controlled_initial_provisioning" });
      await tx.insert(auditEvents).values({ actorLabel: "controlled_initial_provisioning", action: "platform_admin.provisioned", subjectType: "platform_admin", subjectId: user.id, metadata: { method: "operator_cli" } });
    });
    console.log("Platform administrator provisioned for the verified account. Email omitted.");
  } finally {
    await db.$client.end();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "Platform administrator provisioning failed.");
  process.exitCode = 1;
});
