export type InvitationAcceptanceDecision =
  | "accept"
  | "invalid_or_used"
  | "expired"
  | "email_mismatch"
  | "archived_gym"
  | "inactive_membership";

export function decideInvitationAcceptance(input: {
  status: string;
  expiresAt: Date;
  now: Date;
  invitationEmail: string;
  verifiedEmail: string;
  gymStatus: string;
  membershipStatus: string | null;
}): InvitationAcceptanceDecision {
  if (input.status !== "pending") return "invalid_or_used";
  if (input.expiresAt <= input.now) return "expired";
  if (input.invitationEmail.toLowerCase() !== input.verifiedEmail.toLowerCase()) return "email_mismatch";
  if (input.gymStatus !== "active") return "archived_gym";
  if (input.membershipStatus !== null && input.membershipStatus !== "active") return "inactive_membership";
  return "accept";
}

export function canRemoveActiveOwner(input: { activeOwnerCount: number; removesActiveOwner: boolean }): boolean {
  return !input.removesActiveOwner || input.activeOwnerCount > 1;
}

export function paymentReferenceMatchesType(reference: string, paymentType: "gym" | "platform"): boolean {
  return paymentType === "gym"
    ? reference.startsWith("fitpass_gym_")
    : reference.startsWith("fitpass_platform_");
}

export function validateSuccessfulCharge(input: {
  event: string | undefined;
  status: string | undefined;
  amount: number | undefined;
  expectedAmountKobo: number;
  currency: string | undefined;
  expectedCurrency: string;
  reference: string | undefined;
  paymentType: "gym" | "platform";
}): boolean {
  return input.event === "charge.success" && input.status === "success" &&
    Number.isSafeInteger(input.amount) && input.amount === input.expectedAmountKobo &&
    input.currency === input.expectedCurrency && typeof input.reference === "string" &&
    paymentReferenceMatchesType(input.reference, input.paymentType);
}
