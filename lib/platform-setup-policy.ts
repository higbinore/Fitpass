import { z } from "zod";

export const initialPlatformAdminSetupSchema = z.object({
  name: z.string().trim().min(2).max(120),
  email: z.string().trim().email().max(254).transform((value) => value.toLowerCase()),
  password: z.string().min(12).max(128),
  passwordConfirmation: z.string().min(12).max(128),
}).strict().refine((value) => value.password === value.passwordConfirmation, {
  path: ["passwordConfirmation"],
  message: "Passwords do not match.",
});

export type InitialPlatformAdminSetupInput = z.infer<typeof initialPlatformAdminSetupSchema>;

/** Public first-admin bootstrap is a development-only recovery path. */
export function isPublicPlatformAdminSetupEnabled(nodeEnv = process.env.NODE_ENV): boolean {
  return nodeEnv !== "production";
}

export type SetupAvailability = {
  administratorExists: boolean;
  setupCompleted: boolean;
  pendingClaimExists: boolean;
};

export function canBeginInitialPlatformAdminSetup(state: SetupAvailability): boolean {
  return !state.administratorExists && !state.setupCompleted && !state.pendingClaimExists;
}

export type SetupClaimDecision =
  | { allowed: true }
  | { allowed: false; reason: "already_completed" | "invalid_claim" | "unverified_identity" | "identity_mismatch" };

export function decideInitialPlatformAdminClaim(input: {
  administratorExists: boolean;
  setupCompleted: boolean;
  claimExists: boolean;
  claimExpired: boolean;
  emailVerified: boolean;
  claimUserId: string | null;
  authenticatedUserId: string | null;
}): SetupClaimDecision {
  if (input.setupCompleted || input.administratorExists) return { allowed: false, reason: "already_completed" };
  if (!input.claimExists || input.claimExpired) return { allowed: false, reason: "invalid_claim" };
  if (!input.emailVerified || !input.authenticatedUserId) return { allowed: false, reason: "unverified_identity" };
  if (input.claimUserId !== input.authenticatedUserId) return { allowed: false, reason: "identity_mismatch" };
  return { allowed: true };
}
