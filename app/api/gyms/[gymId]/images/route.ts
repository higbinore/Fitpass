import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";

import { AuthorizationError, requireActiveGymOwner } from "@/lib/authz";
import { getDb } from "@/lib/db";
import { validateGymImage, type ImageUpload } from "@/lib/image-validation";
import { removeGymImages, storeGymImage } from "@/lib/gym-image-storage";
import { auditEvents, gyms } from "@/lib/schema";
import { hasActiveGymRoleInTransaction } from "@/lib/transaction-authz";

export async function PATCH(request: Request, context: { params: Promise<{ gymId: string }> }) {
  let uploaded: string[] = [];
  try {
    const { gymId } = await context.params;
    const owner = await requireActiveGymOwner(gymId);
    const form = await request.formData();
    const logo = form.get("logo");
    const photoEntries = form.getAll("facilityPhotos");
    const isFile = (value: FormDataEntryValue | null): value is File => typeof File !== "undefined" && value instanceof File && value.size > 0;
    const hasLogo = isFile(logo);
    const hasPhotos = photoEntries.length > 0;
    if (!hasLogo && !hasPhotos) return NextResponse.json({ error: "Choose a logo or a set of two facility photos." }, { status: 400 });
    if ((hasPhotos && (photoEntries.length !== 2 || !photoEntries.every(isFile))) || (logo !== null && (!isFile(logo)))) {
      return NextResponse.json({ error: "Choose one logo and exactly two facility photos when updating photos." }, { status: 400 });
    }
    const files = [...(hasLogo ? [logo as File] : []), ...(hasPhotos ? photoEntries as File[] : [])];
    if (files.reduce((sum, file) => sum + file.size, 0) > 3_750_000) return NextResponse.json({ error: "The selected images together must be no larger than 3.75 MB." }, { status: 413 });
    try { for (const file of files) await validateGymImage(file as ImageUpload); }
    catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Check the uploaded images." }, { status: 400 }); }

    let newLogoUrl: string | null = null;
    let newPhotoUrls: string[] | null = null;
    if (hasLogo) { newLogoUrl = await storeGymImage(`gyms/${gymId}`, "logo", logo as ImageUpload); uploaded.push(newLogoUrl); }
    if (hasPhotos) {
      newPhotoUrls = [];
      for (const photo of photoEntries as File[]) { const url = await storeGymImage(`gyms/${gymId}`, "facility", photo as ImageUpload); uploaded.push(url); newPhotoUrls.push(url); }
    }
    const result = await getDb().transaction(async (tx) => {
      const [gym] = await tx.select({ status: gyms.status, logoUrl: gyms.logoUrl, facilityPhotoUrls: gyms.facilityPhotoUrls }).from(gyms).where(eq(gyms.id, gymId)).for("update").limit(1);
      if (!gym || gym.status !== "active") return { error: "Archived or unavailable gyms cannot change images.", code: 409 as const };
      if (!await hasActiveGymRoleInTransaction(tx, { gymId, userId: owner.userId, membershipId: owner.membershipId, role: "gym_owner" })) return { error: "Active owner access is required.", code: 403 as const };
      const [updated] = await tx.update(gyms).set({ ...(newLogoUrl ? { logoUrl: newLogoUrl } : {}), ...(newPhotoUrls ? { facilityPhotoUrls: newPhotoUrls } : {}), updatedAt: new Date() }).where(eq(gyms.id, gymId)).returning({ logoUrl: gyms.logoUrl, facilityPhotoUrls: gyms.facilityPhotoUrls });
      await tx.insert(auditEvents).values({ gymId, actorUserId: owner.userId, actorLabel: "gym_owner", action: "gym.images_updated", subjectType: "gym", subjectId: gymId, metadata: { logoChanged: Boolean(newLogoUrl), facilityPhotosChanged: Boolean(newPhotoUrls) } });
      return { images: updated, oldUrls: [...(newLogoUrl && gym.logoUrl ? [gym.logoUrl] : []), ...(newPhotoUrls ? gym.facilityPhotoUrls : [])] };
    });
    if ("error" in result) { await removeGymImages(uploaded).catch(() => undefined); uploaded = []; return NextResponse.json({ error: result.error }, { status: result.code }); }
    uploaded = [];
    await removeGymImages(result.oldUrls).catch(() => undefined);
    return NextResponse.json({ images: result.images });
  } catch (error) {
    await removeGymImages(uploaded).catch(() => undefined);
    const denied = error instanceof AuthorizationError;
    const missingStorage = error instanceof Error && error.message.includes("BLOB_READ_WRITE_TOKEN");
    return NextResponse.json({ error: denied || missingStorage ? (error as Error).message : "Could not update gym images." }, { status: denied ? 403 : missingStorage ? 503 : 503 });
  }
}
