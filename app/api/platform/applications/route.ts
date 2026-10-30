import { and, count, desc, eq, ilike, or } from "drizzle-orm";
import { NextResponse } from "next/server";

import { requirePlatformAdmin } from "@/lib/authz";
import { getDb } from "@/lib/db";
import { gymApplications } from "@/lib/schema";

export async function GET(request: Request) {
  try {
    await requirePlatformAdmin();
    const status = new URL(request.url).searchParams.get("status") ?? "pending";
    const params = new URL(request.url).searchParams;
    const search = params.get("search")?.trim().slice(0, 100) ?? "";
    const page = Number(params.get("page") ?? 1);
    const pageSize = Number(params.get("pageSize") ?? 20);
    if (!["pending", "approved", "rejected", "withdrawn"].includes(status)) {
      return NextResponse.json({ error: "Unknown application status." }, { status: 400 });
    }
    if (!Number.isInteger(page) || page < 1 || !Number.isInteger(pageSize) || pageSize < 1 || pageSize > 50) {
      return NextResponse.json({ error: "Invalid application pagination." }, { status: 400 });
    }
    const filters = [eq(gymApplications.status, status)];
    if (search) {
      const pattern = `%${search.replace(/[\\%_]/g, "\\$&")}%`;
      filters.push(or(ilike(gymApplications.gymName, pattern), ilike(gymApplications.applicantName, pattern), ilike(gymApplications.applicantEmail, pattern), ilike(gymApplications.requestedSlug, pattern))!);
    }
    const where = and(...filters);
    const db = getDb();
    const [applications, [total]] = await Promise.all([db.select({
      id: gymApplications.id,
      gymName: gymApplications.gymName,
      requestedSlug: gymApplications.requestedSlug,
      applicantName: gymApplications.applicantName,
      applicantEmail: gymApplications.applicantEmail,
      preferredPackageId: gymApplications.preferredPackageId,
      phone: gymApplications.phone,
      location: gymApplications.location,
      logoUrl: gymApplications.logoUrl,
      facilityPhotoUrls: gymApplications.facilityPhotoUrls,
      status: gymApplications.status,
      createdAt: gymApplications.createdAt,
      reviewNote: gymApplications.reviewNote,
      reviewedAt: gymApplications.reviewedAt,
    }).from(gymApplications).where(where).orderBy(desc(gymApplications.createdAt), desc(gymApplications.id)).limit(pageSize).offset((page - 1) * pageSize), db.select({ total: count() }).from(gymApplications).where(where)]);
    return NextResponse.json({ applications, total: total.total, page, pageSize, hasMore: page * pageSize < total.total });
  } catch (error) {
    const code = error instanceof Error && error.name === "AuthorizationError" ? 403 : 503;
    return NextResponse.json({ error: code === 403 ? "Platform administrator access required." : "Could not load applications." }, { status: code });
  }
}
