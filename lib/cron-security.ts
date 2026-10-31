import { createHash, timingSafeEqual } from "node:crypto";

export function isAuthorizedCronRequest(authorization: string | null, expectedSecret: string): boolean {
  const match = authorization?.match(/^Bearer ([^\s]+)$/i);
  if (!match || expectedSecret.length < 16) return false;
  const receivedDigest = createHash("sha256").update(match[1], "utf8").digest();
  const expectedDigest = createHash("sha256").update(expectedSecret, "utf8").digest();
  return timingSafeEqual(receivedDigest, expectedDigest);
}
