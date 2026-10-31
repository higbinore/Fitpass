import "server-only";

import { del, put } from "@vercel/blob";
import { randomUUID } from "node:crypto";

import { validateGymImage, type ImageUpload } from "@/lib/image-validation";

export type GymImageSlot = "logo" | "facility";

export async function storeGymImage(pathPrefix: string, slot: GymImageSlot, file: ImageUpload) {
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    throw new Error("Persistent image storage is unavailable. Configure BLOB_READ_WRITE_TOKEN in the server environment.");
  }
  const image = await validateGymImage(file);
  const blob = await put(`${pathPrefix}/${slot}/${randomUUID()}.${image.extension}`, image.bytes, {
    access: "public",
    addRandomSuffix: false,
    contentType: image.contentType,
  });
  return blob.url;
}

export async function removeGymImages(urls: string[]) {
  if (!process.env.BLOB_READ_WRITE_TOKEN) return;
  const blobUrls = urls.filter((value) => {
    try {
      const parsed = new URL(value);
      return parsed.protocol === "https:" && parsed.hostname.endsWith(".blob.vercel-storage.com");
    } catch {
      return false;
    }
  });
  if (blobUrls.length > 0) await del(blobUrls);
}
