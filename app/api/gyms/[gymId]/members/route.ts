import { and, desc, eq, ilike, lt, or } from "drizzle-orm";
import { NextResponse } from "next/server";

import { AuthorizationError, requireActiveGymOwner } from "@/lib/authz";
import { getDb } from "@/lib/db";
import { members, subscriptions } from "@/lib/schema";

/** Owner-only member directory with every query constrained to its gym. */
export async function GET(request: Request, context: { params: Promise<unknown> }) {
  try {
    const { gymId } = await context.params as { gymId: string };
    await requireActiveGymOwner(gymId);
    const url = new URL(request.url);
    const search = (url.searchParams.get("q") ?? "").trim().slice(0, 80);
    const before = url.searchParams.get("before");
    const beforeId = url.searchParams.get("beforeId");
    if ((before && !Number.isFinite(Date.parse(before))) || Boolean(before) !== Boolean(beforeId) || (beforeId && !/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(beforeId))) {
      return NextResponse.json({ error: "The member page cursor is invalid." }, { status: 400 });
    }

    const filters = [eq(members.gymId, gymId)];
    if (search) filters.push(or(ilike(members.fullName, `%${search}%`), ilike(members.membershipCode, `%${search}%`), ilike(members.phone, `%${search}%`))!);
    if (before && beforeId) filters.push(or(lt(members.createdAt, new Date(before)), and(eq(members.createdAt, new Date(before)), lt(members.id, beforeId)))!);
    const rows = await getDb().select({
      id: members.id,
      fullName: members.fullName,
      phone: members.phone,
      membershipCode: members.membershipCode,
      createdAt: members.createdAt,
    }).from(members).where(and(...filters)).orderBy(desc(members.createdAt), desc(members.id)).limit(26);
    const hasMore = rows.length > 25;
    const pageRows = rows.slice(0, 25);
    const histories = pageRows.length ? await getDb().select({
      memberId: subscriptions.memberId,
      status: subscriptions.status,
      startsAt: subscriptions.startsAt,
      expiresAt: subscriptions.expiresAt,
      createdAt: subscriptions.createdAt,
    }).from(subscriptions)
      .where(and(eq(subscriptions.gymId, gymId), or(...pageRows.map((member) => eq(subscriptions.memberId, member.id)))!))
      .orderBy(desc(subscriptions.createdAt)) : [];
    const subscriptionByMember = new Map<string, (typeof histories)[number]>();
    for (const history of histories) if (!subscriptionByMember.has(history.memberId)) subscriptionByMember.set(history.memberId, history);
    const now = new Date();
    const last = pageRows.at(-1);

    return NextResponse.json({
      members: pageRows.map((member) => {
        const history = subscriptionByMember.get(member.id);
        const status = history?.status === "active" && history.startsAt <= now && history.expiresAt > now
          ? "active"
          : history?.status === "pending"
            ? "pending"
            : history
              ? "expired"
              : "no_subscription";
        return { ...member, subscription: history ? { status, startsAt: history.startsAt, expiresAt: history.expiresAt } : null };
      }),
      nextCursor: hasMore && last ? { before: last.createdAt.toISOString(), beforeId: last.id } : null,
    });
  } catch (error) {
    const denied = error instanceof AuthorizationError;
    return NextResponse.json({ error: denied ? "A gym owner role is required." : "Could not load gym members." }, { status: denied ? 403 : 503 });
  }
}
