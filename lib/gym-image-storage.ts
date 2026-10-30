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
  if (urls.length > 0 && process.env.BLOB_READ_WRITE_TOKEN) await del(urls);
}
