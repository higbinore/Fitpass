import { eq } from "drizzle-orm";
import { getDb } from "../lib/db";
import { auditEvents, platformPackages } from "../lib/schema";
import { FIXED_FITPASS_PACKAGES, matchesFixedFitPassPackage } from "../lib/platform-package-policy";

async function main() {
  if (!process.argv.includes("--confirm")) throw new Error("This database-writing script requires --confirm and may be run only after the target schema and backup have been approved.");
  const db = getDb();
  try {
    await db.transaction(async (tx) => {
      const inserted: string[] = [];
      for (const pkg of FIXED_FITPASS_PACKAGES) {
        const [row] = await tx.insert(platformPackages).values({ ...pkg, features: {}, isActive: true }).onConflictDoNothing().returning({ id: platformPackages.id, name: platformPackages.name });
        if (row) inserted.push(row.name);
        else {
          const [existing] = await tx.select({ name: platformPackages.name, billingInterval: platformPackages.billingInterval, priceKobo: platformPackages.priceKobo, activeMemberLimit: platformPackages.activeMemberLimit, adminAccountLimit: platformPackages.adminAccountLimit }).from(platformPackages).where(eq(platformPackages.name, pkg.name)).limit(1);
          if (!existing || !matchesFixedFitPassPackage(existing)) throw new Error(`Existing ${pkg.name} FitPass package does not match the approved monthly catalog; it was left unchanged.`);
        }
      }
      if (inserted.length) {
        await tx.insert(auditEvents).values({ actorLabel: "controlled_initial_provisioning", action: "platform_package.defaults_seeded", subjectType: "platform_package_catalog", metadata: { inserted } });
      }
      console.log(`Inserted ${inserted.length} missing initial FitPass package(s).`);
    });
  } finally {
    await db.$client.end();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "Package provisioning failed.");
  process.exitCode = 1;
});
