import { and, asc, eq } from "drizzle-orm";
import { NextResponse } from "next/server";

import { getDb } from "@/lib/db";
import { gyms, plans } from "@/lib/schema";

export async function GET(_request: Request, context: { params: Promise<{ gymId: string }> }) {
  try {
    const { gymId } = await context.params;
    const [gym] = await getDb().select({ id: gyms.id, name: gyms.name, status: gyms.status }).from(gyms).where(eq(gyms.id, gymId)).limit(1);
    if (!gym || gym.status !== "active") return NextResponse.json({ error: "Gym not found." }, { status: 404 });
    const availablePlans = await getDb().select({ id: plans.id, name: plans.name, durationDays: plans.durationDays, priceKobo: plans.priceKobo, description: plans.description })
      .from(plans).where(and(eq(plans.gymId, gym.id), eq(plans.isActive, true))).orderBy(asc(plans.sortOrder), asc(plans.priceKobo));
    return NextResponse.json({ gym: { id: gym.id, name: gym.name }, plans: availablePlans });
  } catch {
    return NextResponse.json({ error: "Could not load gym plans." }, { status: 503 });
  }
}
