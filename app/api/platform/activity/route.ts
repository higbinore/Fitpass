import { count, desc, eq, ilike, or } from "drizzle-orm";
import { NextResponse } from "next/server";

import { requirePlatformAdmin } from "@/lib/authz";
import { getDb } from "@/lib/db";
import { auditEvents, gyms } from "@/lib/schema";

export async function GET(request: Request) {
  try {
    await requirePlatformAdmin();
    const params = new URL(request.url).searchParams;
    const search = params.get("search")?.trim().slice(0, 100) ?? "";
    const page = Number(params.get("page") ?? 1);
    const pageSize = Number(params.get("pageSize") ?? 20);
    if (!Number.isInteger(page) || page < 1 || !Number.isInteger(pageSize) || pageSize < 1 || pageSize > 50) {
      return NextResponse.json({ error: "Invalid activity pagination." }, { status: 400 });
    }
    const where = search
      ? or(ilike(auditEvents.action, `%${search.replace(/[\\%_]/g, "\\$&")}%`), ilike(auditEvents.actorLabel, `%${search.replace(/[\\%_]/g, "\\$&")}%`), ilike(auditEvents.subjectType, `%${search.replace(/[\\%_]/g, "\\$&")}%`), ilike(gyms.name, `%${search.replace(/[\\%_]/g, "\\$&")}%`))
      : undefined;
    const db = getDb();
    const [events, [total]] = await Promise.all([
      db.select({ id: auditEvents.id, gymId: auditEvents.gymId, gymName: gyms.name, actorLabel: auditEvents.actorLabel, action: auditEvents.action, subjectType: auditEvents.subjectType, subjectId: auditEvents.subjectId, metadata: auditEvents.metadata, createdAt: auditEvents.createdAt })
        .from(auditEvents).leftJoin(gyms, eq(gyms.id, auditEvents.gymId)).where(where).orderBy(desc(auditEvents.createdAt), desc(auditEvents.id)).limit(pageSize).offset((page - 1) * pageSize),
      db.select({ total: count() }).from(auditEvents).leftJoin(gyms, eq(gyms.id, auditEvents.gymId)).where(where),
    ]);
    return NextResponse.json({ events, total: total.total, page, pageSize, hasMore: page * pageSize < total.total });
  } catch (error) {
    const denied = error instanceof Error && error.name === "AuthorizationError";
    return NextResponse.json({ error: denied ? "Platform administrator access required." : "Could not load activity logs." }, { status: denied ? 403 : 503 });
  }
}
