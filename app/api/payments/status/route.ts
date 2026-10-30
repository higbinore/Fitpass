import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";

import { AuthorizationError, requireGymOwner, requireVerifiedUser } from "@/lib/authz";
import { getDb } from "@/lib/db";
import { members, payments, platformPayments } from "@/lib/schema";

const referenceSchema = z.string().min(20).max(110).regex(/^fitpass_(?:(?:demo_)?gym|(?:demo_)?platform)_[a-f0-9]+$/);

export async function GET(request: Request) {
  try {
    const identity = await requireVerifiedUser();
    const parsed = referenceSchema.safeParse(new URL(request.url).searchParams.get("reference"));
    if (!parsed.success) return NextResponse.json({ error: "Payment reference is invalid." }, { status: 400 });
    const db = getDb();
    if (parsed.data.startsWith("fitpass_gym_")) {
      const isPlatformStyleRef = parsed.data.startsWith("fitpass_demo_platform_");
      if (isPlatformStyleRef) return NextResponse.json({ error: "Payment type and reference do not match." }, { status: 400 });
      const [payment] = await db.select({ status: payments.status, paymentMode: payments.paymentMode, gymId: payments.gymId })
        .from(payments).innerJoin(members, and(eq(members.gymId, payments.gymId), eq(members.id, payments.memberId)))
        .where(and(eq(payments.reference, parsed.data), eq(members.userId, identity.userId))).limit(1);
      if (!payment) return NextResponse.json({ error: "Payment not found." }, { status: 404 });
      return NextResponse.json({ type: "gym", gymId: payment.gymId, paymentMode: payment.paymentMode, status: payment.status });
    }
    const [payment] = await db.select({ gymId: platformPayments.gymId, status: platformPayments.status, paymentMode: platformPayments.paymentMode }).from(platformPayments).where(eq(platformPayments.reference, parsed.data)).limit(1);
    if (!payment) return NextResponse.json({ error: "Payment not found." }, { status: 404 });
    await requireGymOwner(payment.gymId);
    return NextResponse.json({ type: "platform", gymId: payment.gymId, paymentMode: payment.paymentMode, status: payment.status });
  } catch (error) {
    const status = error instanceof AuthorizationError ? 403 : 503;
    return NextResponse.json({ error: error instanceof AuthorizationError ? error.message : "Could not load payment status." }, { status });
  }
}
