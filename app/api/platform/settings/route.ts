import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";

import { requirePlatformAdmin } from "@/lib/authz";
import { getDb } from "@/lib/db";
import { auditEvents, platformSettings } from "@/lib/schema";

const applicationsKey = "gym_applications_enabled";
const updateSchema = z.object({ gymApplicationsEnabled: z.boolean() });

export async function GET() {
  try {
    await requirePlatformAdmin();
    const [setting] = await getDb().select({ value: platformSettings.value }).from(platformSettings).where(eq(platformSettings.key, applicationsKey)).limit(1);
    return NextResponse.json({ gymApplicationsEnabled: setting?.value.enabled ?? true });
  } catch (error) {
    const denied = error instanceof Error && error.name === "AuthorizationError";
    return NextResponse.json({ error: denied ? "Platform administrator access required." : "Could not load platform settings." }, { status: denied ? 403 : 503 });
  }
}

export async function PATCH(request: Request) {
  try {
    const admin = await requirePlatformAdmin();
    const parsed = updateSchema.safeParse(await request.json());
    if (!parsed.success) return NextResponse.json({ error: "Choose whether gym applications are open." }, { status: 400 });
    await getDb().transaction(async (tx) => {
      const now = new Date();
      await tx.insert(platformSettings).values({ key: applicationsKey, value: { enabled: parsed.data.gymApplicationsEnabled }, updatedByUserId: admin.userId, updatedAt: now })
        .onConflictDoUpdate({ target: platformSettings.key, set: { value: { enabled: parsed.data.gymApplicationsEnabled }, updatedByUserId: admin.userId, updatedAt: now } });
      await tx.insert(auditEvents).values({ actorUserId: admin.userId, actorLabel: "platform_admin", action: "platform_setting.gym_applications_updated", subjectType: "platform_setting", subjectId: applicationsKey, metadata: { enabled: parsed.data.gymApplicationsEnabled } });
    });
    return NextResponse.json({ gymApplicationsEnabled: parsed.data.gymApplicationsEnabled });
  } catch (error) {
    const denied = error instanceof Error && error.name === "AuthorizationError";
    return NextResponse.json({ error: denied ? "Platform administrator access required." : "Could not update platform settings." }, { status: denied ? 403 : 503 });
  }
}
