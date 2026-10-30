import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";

import { requirePlatformAdmin } from "@/lib/authz";
import { getDb } from "@/lib/db";
import { auditEvents, gyms } from "@/lib/schema";

const archiveSchema = z.object({ status: z.enum(["active", "archived"]) });

/** Platform-controlled archival/reinstatement; historical records are retained. */
export async function PATCH(request: Request, context: { params: Promise<{ gymId: string }> }) {
  try {
    const admin = await requirePlatformAdmin();
    const { gymId } = await context.params;
    const parsed = archiveSchema.safeParse(await request.json());
    if (!parsed.success) return NextResponse.json({ error: "Choose active or archived." }, { status: 400 });
    const result = await getDb().transaction(async (tx) => {
      const [gym] = await tx.select({ id: gyms.id, status: gyms.status }).from(gyms).where(eq(gyms.id, gymId)).for("update").limit(1);
      if (!gym) return null;
      const now = new Date();
      await tx.update(gyms).set({ status: parsed.data.status, archivedAt: parsed.data.status === "archived" ? now : null, updatedAt: now }).where(eq(gyms.id, gymId));
      await tx.insert(auditEvents).values({ gymId, actorUserId: admin.userId, actorLabel: "platform_admin", action: `gym.${parsed.data.status}`, subjectType: "gym", subjectId: gymId, metadata: { previousStatus: gym.status } });
      return { gymId, status: parsed.data.status };
    });
    if (!result) return NextResponse.json({ error: "Gym not found." }, { status: 404 });
    return NextResponse.json(result);
  } catch (error) {
    const status = error instanceof Error && error.name === "AuthorizationError" ? 403 : 503;
    return NextResponse.json({ error: status === 403 ? "Platform administrator access required." : "Could not update the gym right now." }, { status });
  }
}
