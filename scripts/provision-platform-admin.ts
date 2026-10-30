import { eq } from "drizzle-orm";

import { getDb } from "../lib/db";
import { auditEvents, authUsers, platformAdmins } from "../lib/schema";

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
      const [user] = await tx.select({ id: authUsers.id, emailVerified: authUsers.emailVerified }).from(authUsers).where(eq(authUsers.email, email)).for("update").limit(1);
      if (!user || !user.emailVerified) throw new Error("A verified Better Auth account with that email must exist first.");
      const [existing] = await tx.select({ userId: platformAdmins.userId }).from(platformAdmins).where(eq(platformAdmins.userId, user.id)).limit(1);
      if (existing) throw new Error("This account is already a platform administrator.");
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
