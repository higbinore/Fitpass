import { and, desc, eq, inArray, isNull, lt, or } from "drizzle-orm";
import { NextResponse } from "next/server";

import { AuthorizationError, requireActiveGymOwner } from "@/lib/authz";
import { getDb } from "@/lib/db";
import { authUsers, gymMembershipRoles, gymMemberships } from "@/lib/schema";

/** Owner-only roster; the gym scope comes from the route and is verified server-side. */
export async function GET(_request: Request, context: { params: Promise<{ gymId: string }> }) {
  try {
    const { gymId } = await context.params;
    await requireActiveGymOwner(gymId);
    const url = new URL(_request.url);
    const before = url.searchParams.get("before");
    const beforeId = url.searchParams.get("beforeId");
    if ((before && !Number.isFinite(Date.parse(before))) || Boolean(before) !== Boolean(beforeId) || (beforeId && !/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(beforeId))) {
      return NextResponse.json({ error: "The membership page cursor is invalid." }, { status: 400 });
    }
    const db = getDb();
    const rows = await db.select({
      id: gymMemberships.id,
      name: authUsers.name,
      email: authUsers.email,
      status: gymMemberships.status,
      createdAt: gymMemberships.createdAt,
    }).from(gymMemberships)
      .innerJoin(authUsers, eq(authUsers.id, gymMemberships.userId))
      .where(before && beforeId
        ? and(eq(gymMemberships.gymId, gymId), or(lt(gymMemberships.createdAt, new Date(before)), and(eq(gymMemberships.createdAt, new Date(before)), lt(gymMemberships.id, beforeId)))!)
        : eq(gymMemberships.gymId, gymId))
      .orderBy(desc(gymMemberships.createdAt), desc(gymMemberships.id))
      .limit(101);
    const hasMore = rows.length > 100;
    const pageRows = rows.slice(0, 100);

    const roles = pageRows.length ? await db.select({ membershipId: gymMembershipRoles.membershipId, role: gymMembershipRoles.role })
      .from(gymMembershipRoles)
      .where(and(eq(gymMembershipRoles.gymId, gymId), inArray(gymMembershipRoles.membershipId, pageRows.map((row) => row.id)), isNull(gymMembershipRoles.revokedAt))) : [];
    const rolesByMembership = new Map<string, string[]>();
    for (const grant of roles) rolesByMembership.set(grant.membershipId, [...(rolesByMembership.get(grant.membershipId) ?? []), grant.role]);

    const last = pageRows.at(-1);
    return NextResponse.json({
      memberships: pageRows.map((row) => ({ ...row, roles: rolesByMembership.get(row.id) ?? [] })),
      nextCursor: hasMore && last ? { before: last.createdAt.toISOString(), beforeId: last.id } : null,
    });
  } catch (error) {
    const denied = error instanceof AuthorizationError;
    return NextResponse.json({ error: denied ? "A gym owner role is required." : "Could not load gym memberships." }, { status: denied ? 403 : 503 });
  }
}
