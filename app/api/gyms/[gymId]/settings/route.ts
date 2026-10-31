import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";

import { AuthorizationError, requireActiveGymOwner } from "@/lib/authz";
import { getDb } from "@/lib/db";
import { auditEvents, gyms } from "@/lib/schema";
import { hasActiveGymRoleInTransaction } from "@/lib/transaction-authz";

const settingsSchema = z.object({
  name: z.string().trim().min(2).max(120),
  slug: z.string().trim().toLowerCase().min(3).max(80).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  contactPhone: z.string().trim().max(40).optional().transform((value) => value || null),
  contactEmail: z.string().trim().email().max(254).optional().or(z.literal("")).transform((value) => value || null),
  location: z.string().trim().max(240).optional().transform((value) => value || null),
  maxDailyCheckins: z.number().int().min(1).max(20),
});

/** Updates the current gym's existing profile fields; tenant identity comes from the route and is verified server-side. */
export async function PATCH(request: Request, context: { params: Promise<{ gymId: string }> }) {
  try {
    const { gymId } = await context.params;
    const owner = await requireActiveGymOwner(gymId);
    const parsed = settingsSchema.safeParse(await request.json());
    if (!parsed.success) return NextResponse.json({ error: "Enter a gym name and a valid URL slug." }, { status: 400 });

    const result = await getDb().transaction(async (tx) => {
      const [gym] = await tx.select({ id: gyms.id, name: gyms.name, slug: gyms.slug, status: gyms.status, maxDailyCheckins: gyms.maxDailyCheckins })
        .from(gyms).where(eq(gyms.id, gymId)).for("update").limit(1);
      if (!gym || gym.status !== "active") return { error: "This gym is unavailable for profile changes.", status: 409 as const };
      if (!await hasActiveGymRoleInTransaction(tx, { gymId, userId: owner.userId, membershipId: owner.membershipId, role: "gym_owner" })) {
        return { error: "An active gym owner role is required.", status: 403 as const };
      }
      const [updated] = await tx.update(gyms).set({ ...parsed.data, updatedAt: new Date() })
        .where(eq(gyms.id, gymId)).returning({ id: gyms.id, name: gyms.name, slug: gyms.slug });
      await tx.insert(auditEvents).values({
        gymId,
        actorUserId: owner.userId,
        actorLabel: "gym_owner",
        action: "gym.profile_updated",
        subjectType: "gym",
        subjectId: gymId,
        metadata: { changedFields: ["name", "slug", "contactPhone", "contactEmail", "location", ...(gym.maxDailyCheckins !== parsed.data.maxDailyCheckins ? ["maxDailyCheckins"] : [])], previousSlug: gym.slug, previousMaxDailyCheckins: gym.maxDailyCheckins, currentMaxDailyCheckins: parsed.data.maxDailyCheckins },
      });
      return { gym: updated };
    });
    if ("error" in result) return NextResponse.json({ error: result.error }, { status: result.status });
    return NextResponse.json(result);
  } catch (error) {
    const denied = error instanceof AuthorizationError;
    if (!denied && error instanceof Error && /unique|duplicate/i.test(error.message)) {
      return NextResponse.json({ error: "That gym URL is already in use. Choose another slug." }, { status: 409 });
    }
    return NextResponse.json({ error: denied ? error.message : "Could not update gym settings." }, { status: denied ? 403 : 503 });
  }
}
