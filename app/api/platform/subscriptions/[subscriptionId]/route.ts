import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";

import { requirePlatformAdmin } from "@/lib/authz";
import { getDb } from "@/lib/db";
import { auditEvents, platformPayments, platformSubscriptions } from "@/lib/schema";

const pricingSchema = z.object({
  customPriceKobo: z.number().int().positive().max(100_000_000_000).nullable(),
  pricingNote: z.string().trim().max(500).nullable().optional(),
});

/** Changes only the renewal price; paid status remains exclusively webhook controlled. */
export async function PATCH(request: Request, context: { params: Promise<{ subscriptionId: string }> }) {
  try {
    const admin = await requirePlatformAdmin();
    const { subscriptionId } = await context.params;
    const parsed = pricingSchema.safeParse(await request.json());
    if (!parsed.success) return NextResponse.json({ error: "Enter a valid negotiated renewal amount and note." }, { status: 400 });

    const result = await getDb().transaction(async (tx) => {
      const [subscription] = await tx.select().from(platformSubscriptions)
        .where(eq(platformSubscriptions.id, subscriptionId)).for("update").limit(1);
      if (!subscription) return { error: "Subscription not found.", status: 404 as const };
      const [pendingPayment] = await tx.select({ id: platformPayments.id }).from(platformPayments)
        .where(and(eq(platformPayments.platformSubscriptionId, subscriptionId), eq(platformPayments.status, "pending"))).limit(1);
      if (pendingPayment) return { error: "A pending payment exists. Wait for its verified webhook result before changing the renewal price.", status: 409 as const };
      const note = parsed.data.customPriceKobo === null ? null : (parsed.data.pricingNote ?? null);
      const [updated] = await tx.update(platformSubscriptions).set({ customPriceKobo: parsed.data.customPriceKobo, pricingNote: note, updatedAt: new Date() })
        .where(eq(platformSubscriptions.id, subscriptionId)).returning({ id: platformSubscriptions.id, gymId: platformSubscriptions.gymId, customPriceKobo: platformSubscriptions.customPriceKobo, pricingNote: platformSubscriptions.pricingNote });
      await tx.insert(auditEvents).values({
        gymId: subscription.gymId,
        actorUserId: admin.userId,
        actorLabel: "platform_admin",
        action: "platform_subscription.custom_pricing_updated",
        subjectType: "platform_subscription",
        subjectId: subscriptionId,
        metadata: { previousCustomPriceKobo: subscription.customPriceKobo, customPriceKobo: updated.customPriceKobo, pricingNote: updated.pricingNote },
      });
      return { subscription: updated };
    });
    if ("error" in result) return NextResponse.json({ error: result.error }, { status: result.status });
    return NextResponse.json(result);
  } catch (error) {
    const denied = error instanceof Error && error.name === "AuthorizationError";
    return NextResponse.json({ error: denied ? "Platform administrator access required." : "Could not update subscription pricing." }, { status: denied ? 403 : 503 });
  }
}
