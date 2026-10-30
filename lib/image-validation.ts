import sharp from "sharp";

export const MAX_GYM_IMAGE_BYTES = 1_250_000;
export const MAX_GYM_IMAGE_PIXELS = 40_000_000;

export type ImageUpload = {
  size: number;
  type: string;
  arrayBuffer(): Promise<ArrayBuffer>;
};

export type ValidatedImage = { bytes: Buffer; contentType: "image/webp"; extension: "webp" };

/** Checks size, declared type and file signature. SVG and animated formats are rejected. */
export async function validateGymImage(file: ImageUpload): Promise<ValidatedImage> {
  if (!Number.isInteger(file.size) || file.size <= 0 || file.size > MAX_GYM_IMAGE_BYTES) {
    throw new Error("Each image must be smaller than 1.25 MB.");
  }
  const bytes = Buffer.from(await file.arrayBuffer());
  if (bytes.length !== file.size) throw new Error("The uploaded image is incomplete.");

  const type = file.type.toLowerCase();
  if (!["image/jpeg", "image/png", "image/webp"].includes(type)) {
    throw new Error("Upload a valid JPEG, PNG or WebP image.");
  }
  try {
    const decoder = sharp(bytes, { failOn: "error", limitInputPixels: MAX_GYM_IMAGE_PIXELS });
    const metadata = await decoder.metadata();
    const actualType = metadata.format === "jpeg" ? "image/jpeg" : metadata.format === "png" ? "image/png" : metadata.format === "webp" ? "image/webp" : null;
    if (!actualType || actualType !== type || !metadata.width || !metadata.height || metadata.width * metadata.height > MAX_GYM_IMAGE_PIXELS) {
      throw new Error("Upload a valid JPEG, PNG or WebP image.");
    }
    const normalized = await sharp(bytes, { failOn: "error", limitInputPixels: MAX_GYM_IMAGE_PIXELS }).rotate().webp({ quality: 85, effort: 4 }).toBuffer();
    return { bytes: normalized, contentType: "image/webp", extension: "webp" };
  } catch {
    throw new Error("The uploaded file is not a valid, decodable JPEG, PNG or WebP image.");
  }
}
