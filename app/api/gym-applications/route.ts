import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";

import { getDb } from "@/lib/db";
import { gymApplications, platformPackages, platformSettings } from "@/lib/schema";
import { and, eq } from "drizzle-orm";
import { removeGymImages, storeGymImage } from "@/lib/gym-image-storage";
import { validateGymImage, type ImageUpload } from "@/lib/image-validation";

const applicationSchema = z.object({
  gymName: z.string().trim().min(2).max(120),
  requestedSlug: z.string().trim().toLowerCase().min(3).max(80).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  applicantName: z.string().trim().min(2).max(120),
  applicantEmail: z.string().trim().email().max(254).transform((email) => email.toLowerCase()),
  preferredPackageId: z.string().uuid(),
  phone: z.string().trim().max(40).optional(),
  location: z.string().trim().max(180).optional(),
  website: z.string().optional(),
}).transform(({ website, ...application }) => ({ ...application, hasHoneypot: Boolean(website) }));

/** Public requests are only applications; they never create gyms or memberships. */
export async function POST(request: Request) {
  try {
    const form = await request.formData();
    const fields = Object.fromEntries(["gymName", "requestedSlug", "applicantName", "applicantEmail", "preferredPackageId", "phone", "location", "website"].map((key) => [key, form.get(key) ?? ""]));
    const parsed = applicationSchema.safeParse(fields);
    if (!parsed.success) {
      return NextResponse.json({ error: "Check the application details and try again." }, { status: 400 });
    }
    if (parsed.data.hasHoneypot) {
      return NextResponse.json({ applicationId: "received", status: "pending" }, { status: 202 });
    }
    const logo = form.get("logo");
    const photos = form.getAll("facilityPhotos");
    const isImageUpload = (value: FormDataEntryValue | null): value is File => typeof File !== "undefined" && value instanceof File && value.size > 0;
    if (!isImageUpload(logo) || photos.length !== 2 || !photos.every(isImageUpload)) {
      return NextResponse.json({ error: "Add one gym logo and exactly two facility photos." }, { status: 400 });
    }
    const imageUploads = [logo, ...photos] as File[];
    const totalBytes = imageUploads.reduce((total, file) => total + file.size, 0);
    if (totalBytes > 3_750_000) return NextResponse.json({ error: "The three images together must be no larger than 3.75 MB." }, { status: 413 });
    try {
      for (const image of imageUploads) await validateGymImage(image as ImageUpload);
    } catch (error) {
      return NextResponse.json({ error: error instanceof Error ? error.message : "Check the uploaded images." }, { status: 400 });
    }
    const db = getDb();
    const [intakeSetting] = await db.select({ value: platformSettings.value }).from(platformSettings)
      .where(eq(platformSettings.key, "gym_applications_enabled")).limit(1);
    if (intakeSetting?.value.enabled === false) {
      return NextResponse.json({ error: "Gym applications are temporarily closed. Please check back later." }, { status: 503 });
    }
    const [activePackage] = await db.select({ id: platformPackages.id }).from(platformPackages)
      .where(and(eq(platformPackages.id, parsed.data.preferredPackageId), eq(platformPackages.isActive, true))).limit(1);
    if (!activePackage) return NextResponse.json({ error: "Choose an available FitPass package." }, { status: 400 });
    const applicationId = randomUUID();
    const uploaded: string[] = [];
    try {
      const logoUrl = await storeGymImage(`applications/${applicationId}`, "logo", logo as ImageUpload);
      uploaded.push(logoUrl);
      for (const photo of photos as File[]) uploaded.push(await storeGymImage(`applications/${applicationId}`, "facility", photo as ImageUpload));
      await db.insert(gymApplications).values({
        id: applicationId,
        gymName: parsed.data.gymName,
        requestedSlug: parsed.data.requestedSlug,
        applicantName: parsed.data.applicantName,
        applicantEmail: parsed.data.applicantEmail,
        preferredPackageId: parsed.data.preferredPackageId,
        phone: parsed.data.phone,
        location: parsed.data.location,
        logoUrl,
        facilityPhotoUrls: uploaded.slice(1),
      });
    } catch (error) {
      await removeGymImages(uploaded).catch(() => undefined);
      if (error instanceof Error && error.message.includes("BLOB_READ_WRITE_TOKEN")) {
        return NextResponse.json({ error: error.message }, { status: 503 });
      }
      throw error;
    }
    return NextResponse.json({ applicationId, status: "pending" }, { status: 202 });
  } catch {
    return NextResponse.json({ error: "We could not submit the application. Please try again later." }, { status: 503 });
  }
}
