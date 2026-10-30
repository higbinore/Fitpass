import { asc, eq } from "drizzle-orm";
import { NextResponse } from "next/server";

import { getDb } from "@/lib/db";
import { matchesFixedFitPassPackage } from "@/lib/platform-package-policy";
import { platformPackages } from "@/lib/schema";

export async function GET() {
  try {
    const packages = await getDb().select({ id: platformPackages.id, name: platformPackages.name, priceKobo: platformPackages.priceKobo, billingInterval: platformPackages.billingInterval, activeMemberLimit: platformPackages.activeMemberLimit, adminAccountLimit: platformPackages.adminAccountLimit, features: platformPackages.features })
      .from(platformPackages).where(eq(platformPackages.isActive, true)).orderBy(asc(platformPackages.sortOrder));
    return NextResponse.json({ packages: packages.filter(matchesFixedFitPassPackage) });
  } catch {
    return NextResponse.json({ error: "Could not load FitPass packages." }, { status: 503 });
  }
}
