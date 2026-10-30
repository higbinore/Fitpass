import { NextResponse } from "next/server";
import { z } from "zod";

import { requirePlatformAdmin } from "@/lib/authz";
import { getDb } from "@/lib/db";
import { FIXED_FITPASS_PACKAGES, matchesFixedFitPassPackage } from "@/lib/platform-package-policy";
import { auditEvents, platformPackages } from "@/lib/schema";

const packageSchema = z.object({
  name: z.string().trim().min(2).max(80),
  priceKobo: z.number().int().positive().max(100_000_000_000),
  activeMemberLimit: z.number().int().positive().max(1_000_000),
  adminAccountLimit: z.number().int().positive().max(100_000),
  features: z.record(z.string(), z.boolean()).default({}),
  isActive: z.literal(true).default(true),
}).strict();

export async function GET() {
  try {
    await requirePlatformAdmin();
    const packages = await getDb().select().from(platformPackages).orderBy(platformPackages.sortOrder, platformPackages.name);
    return NextResponse.json({ packages });
  } catch (error) {
    const status = error instanceof Error && error.name === "AuthorizationError" ? 403 : 503;
    return NextResponse.json({ error: status === 403 ? "Platform administrator access required." : "Could not load packages." }, { status });
  }
}

export async function POST(request: Request) {
  try {
    const admin = await requirePlatformAdmin();
    const parsed = packageSchema.safeParse(await request.json());
    if (!parsed.success) return NextResponse.json({ error: "Package values are invalid." }, { status: 400 });
    const fixedPackage = FIXED_FITPASS_PACKAGES.find((item) => item.name === parsed.data.name);
    if (!fixedPackage || !matchesFixedFitPassPackage({ ...parsed.data, billingInterval: "month" })) {
      return NextResponse.json({ error: "FitPass offers a fixed monthly package catalog. Use one of the four published packages and its listed limits." }, { status: 400 });
    }
    const created = await getDb().transaction(async (tx) => {
      const [row] = await tx.insert(platformPackages).values({ ...fixedPackage, features: parsed.data.features, isActive: true }).returning();
      await tx.insert(auditEvents).values({ actorUserId: admin.userId, actorLabel: "platform_admin", action: "platform_package.created", subjectType: "platform_package", subjectId: row.id, metadata: { name: row.name, priceKobo: row.priceKobo, activeMemberLimit: row.activeMemberLimit, adminAccountLimit: row.adminAccountLimit } });
      return row;
    });
    return NextResponse.json({ package: created }, { status: 201 });
  } catch (error) {
    const status = error instanceof Error && error.name === "AuthorizationError" ? 403 : 503;
    return NextResponse.json({ error: status === 403 ? "Platform administrator access required." : "Could not create the package." }, { status });
  }
}
