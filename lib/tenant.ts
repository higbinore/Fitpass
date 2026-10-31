import "server-only";

import { eq } from "drizzle-orm";

import { getDb } from "@/lib/db";
import { gyms } from "@/lib/schema";

/** Resolves the initial public gym from deployment config, never from a client gym ID. */
export async function getInitialGym() {
  const slug = process.env.FITPASS_INITIAL_GYM_SLUG?.trim().toLowerCase();
  if (!slug || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) return null;
  const [gym] = await getDb().select({
    id: gyms.id,
    slug: gyms.slug,
    name: gyms.name,
    status: gyms.status,
    location: gyms.location,
    contactPhone: gyms.contactPhone,
    contactEmail: gyms.contactEmail,
    description: gyms.description,
    openingHours: gyms.openingHours,
    logoUrl: gyms.logoUrl,
    facilityPhotoUrls: gyms.facilityPhotoUrls,
  })
    .from(gyms).where(eq(gyms.slug, slug)).limit(1);
  return gym?.status === "active" ? gym : null;
}
