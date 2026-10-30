import assert from "node:assert/strict";
import test from "node:test";
import sharp from "sharp";

import { MAX_GYM_IMAGE_BYTES, validateGymImage } from "../lib/image-validation.ts";

function file(data: Buffer, type = "image/png") {
  return { size: data.byteLength, type, arrayBuffer: async () => new Uint8Array(data).buffer as ArrayBuffer };
}

test("image validation accepts supported signatures only when declared content type matches", async () => {
  const png = await sharp({ create: { width: 2, height: 2, channels: 3, background: "#a3e635" } }).png().toBuffer();
  const result = await validateGymImage(file(png));
  assert.equal(result.contentType, "image/webp");
  assert.equal(result.extension, "webp");
  assert.equal((await sharp(result.bytes).metadata()).format, "webp");
  await assert.rejects(validateGymImage(file(png, "image/jpeg")), /decodable/);
  await assert.rejects(validateGymImage(file(Buffer.from("<svg></svg>"), "image/svg+xml")), /valid JPEG/);
});

test("image validation rejects empty, incomplete, and oversized uploads", async () => {
  await assert.rejects(validateGymImage(file(Buffer.alloc(0))), /smaller than 1.25 MB/);
  await assert.rejects(validateGymImage({ size: 10, type: "image/png", arrayBuffer: async () => new ArrayBuffer(8) }), /incomplete/);
  await assert.rejects(validateGymImage({ size: MAX_GYM_IMAGE_BYTES + 1, type: "image/png", arrayBuffer: async () => new ArrayBuffer(0) }), /smaller than 1.25 MB/);
});
