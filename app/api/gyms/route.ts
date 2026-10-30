import { and, asc, count, eq, exists, gte, gt, ilike, inArray, lte, or } from "drizzle-orm";
import { NextResponse } from "next/server";

import { getDb } from "@/lib/db";
import { gyms, platformSubscriptions, plans } from "@/lib/schema";
import { parseNairaFilter } from "@/lib/marketplace-policy";

/** Public directory data only: active gym identity and location fields. */
export async function GET(request: Request) {
  try {
    const params = new URL(request.url).searchParams;
    const search = (params.get("q") ?? "").trim().slice(0, 80).replace(/[\\%_]/g, "\\$&");
    const minPriceKobo = parseNairaFilter(params.get("minPrice"));
    const maxPriceKobo = parseNairaFilter(params.get("maxPrice"));
    const page = Number(params.get("page") ?? 1);
    const pageSize = Number(params.get("pageSize") ?? 12);
    if (minPriceKobo === undefined || maxPriceKobo === undefined || (minPriceKobo !== null && maxPriceKobo !== null && minPriceKobo > maxPriceKobo)) {
      return NextResponse.json({ error: "Enter a valid price range in Naira." }, { status: 400 });
    }
    if (!Number.isInteger(page) || page < 1 || !Number.isInteger(pageSize) || pageSize < 1 || pageSize > 30) {
      return NextResponse.json({ error: "Invalid gym directory pagination." }, { status: 400 });
    }
    const db = getDb();
    const filters = [eq(gyms.status, "active")];
    if (search) filters.push(or(ilike(gyms.name, `%${search}%`), ilike(gyms.slug, `%${search}%`), ilike(gyms.location, `%${search}%`))!);
    const activePriceFilters = [eq(plans.gymId, gyms.id), eq(plans.isActive, true)];
    if (minPriceKobo !== null) activePriceFilters.push(gte(plans.priceKobo, minPriceKobo));
    if (maxPriceKobo !== null) activePriceFilters.push(lte(plans.priceKobo, maxPriceKobo));
    filters.push(exists(db.select({ id: plans.id }).from(plans).where(and(...activePriceFilters))));
    const now = new Date();
    const [rows, [total]] = await Promise.all([db.select({ id: gyms.id, name: gyms.name, slug: gyms.slug, location: gyms.location, logoUrl: gyms.logoUrl, facilityPhotoUrls: gyms.facilityPhotoUrls, latitude: gyms.latitude, longitude: gyms.longitude, locationVerifiedAt: gyms.locationVerifiedAt })
      .from(gyms).innerJoin(platformSubscriptions, and(eq(platformSubscriptions.gymId, gyms.id), inArray(platformSubscriptions.status, ["active", "trialing"]), gt(platformSubscriptions.currentPeriodEnd, now)))
      .where(and(...filters))
      .orderBy(asc(gyms.name), asc(gyms.id)).limit(pageSize).offset((page - 1) * pageSize),
      db.select({ total: count() }).from(gyms)
        .where(and(...filters, exists(db.select({ id: platformSubscriptions.id }).from(platformSubscriptions)
          .where(and(eq(platformSubscriptions.gymId, gyms.id), inArray(platformSubscriptions.status, ["active", "trialing"]), gt(platformSubscriptions.currentPeriodEnd, now))))))]);
    const planRows = rows.length ? await db.select({ gymId: plans.gymId, priceKobo: plans.priceKobo }).from(plans)
      .where(and(inArray(plans.gymId, rows.map((gym) => gym.id)), eq(plans.isActive, true)))
      .orderBy(plans.priceKobo) : [];
    const startingPrice = new Map<string, number>();
    for (const plan of planRows) if (!startingPrice.has(plan.gymId)) startingPrice.set(plan.gymId, plan.priceKobo);
    return NextResponse.json({ gyms: rows.map((gym) => ({ ...gym, startingPriceKobo: startingPrice.get(gym.id) ?? null })), total: total.total, page, pageSize, hasMore: page * pageSize < total.total });
  } catch {
    return NextResponse.json({ error: "Gym directory is unavailable right now." }, { status: 503 });
  }
}
