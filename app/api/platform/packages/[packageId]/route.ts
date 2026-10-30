import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";

import { requirePlatformAdmin } from "@/lib/authz";
import { getDb } from "@/lib/db";
import { matchesFixedFitPassPackage } from "@/lib/platform-package-policy";
import { auditEvents, platformPackages } from "@/lib/schema";

const packageSchema = z.object({
  features: z.record(z.string(), z.boolean()).optional(),
  isActive: z.literal(true).optional(),
}).strict().refine((value) => Object.keys(value).length > 0, "Provide package feature settings or re-enable the fixed package.");

export async function PATCH(request: Request, context: { params: Promise<{ packageId: string }> }) {
  try {
    const admin = await requirePlatformAdmin();
    const { packageId } = await context.params;
    const parsed = packageSchema.safeParse(await request.json());
    if (!parsed.success) return NextResponse.json({ error: "Package values are invalid." }, { status: 400 });
    const updated = await getDb().transaction(async (tx) => {
      const [before] = await tx.select().from(platformPackages).where(eq(platformPackages.id, packageId)).for("update").limit(1);
      if (!before) return null;
      if (!matchesFixedFitPassPackage(before)) return { packageMismatch: true as const };
      const [after] = await tx.update(platformPackages).set({ ...parsed.data, updatedAt: new Date() }).where(eq(platformPackages.id, packageId)).returning();
      await tx.insert(auditEvents).values({ actorUserId: admin.userId, actorLabel: "platform_admin", action: "platform_package.updated", subjectType: "platform_package", subjectId: after.id, metadata: { changedFields: Object.keys(parsed.data), previous: { priceKobo: before.priceKobo, activeMemberLimit: before.activeMemberLimit, adminAccountLimit: before.adminAccountLimit, isActive: before.isActive }, current: { priceKobo: after.priceKobo, activeMemberLimit: after.activeMemberLimit, adminAccountLimit: after.adminAccountLimit, isActive: after.isActive } } });
      return after;
    });
    if (!updated) return NextResponse.json({ error: "Package not found." }, { status: 404 });
    if ("packageMismatch" in updated) return NextResponse.json({ error: "This stored package does not match the approved fixed monthly catalog. It was left unchanged; reconcile it only through a reviewed database phase." }, { status: 409 });
    return NextResponse.json({ package: updated });
  } catch (error) {
    const status = error instanceof Error && error.name === "AuthorizationError" ? 403 : 503;
    return NextResponse.json({ error: status === 403 ? "Platform administrator access required." : "Could not update the package." }, { status });
  }
}
