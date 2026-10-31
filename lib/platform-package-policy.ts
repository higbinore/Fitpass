import { z } from "zod";

export const fitPassPackageSelectionSchema = z.object({ packageId: z.string().uuid() }).strict();

export const FIXED_FITPASS_PACKAGES = [
  { name: "Starter", billingInterval: "month", priceKobo: 5_000_000, activeMemberLimit: 100, adminAccountLimit: 2, sortOrder: 1 },
  { name: "Growth", billingInterval: "month", priceKobo: 10_000_000, activeMemberLimit: 300, adminAccountLimit: 5, sortOrder: 2 },
  { name: "Professional", billingInterval: "month", priceKobo: 20_000_000, activeMemberLimit: 750, adminAccountLimit: 10, sortOrder: 3 },
  { name: "Enterprise", billingInterval: "month", priceKobo: 30_000_000, activeMemberLimit: 2_000, adminAccountLimit: 20, sortOrder: 4 },
] as const;

export function matchesFixedFitPassPackage(value: {
  name: string;
  billingInterval: string;
  priceKobo: number;
  activeMemberLimit: number;
  adminAccountLimit: number;
}): boolean {
  return FIXED_FITPASS_PACKAGES.some((plan) =>
    plan.name === value.name &&
    plan.billingInterval === value.billingInterval &&
    plan.priceKobo === value.priceKobo &&
    plan.activeMemberLimit === value.activeMemberLimit &&
    plan.adminAccountLimit === value.adminAccountLimit,
  );
}

/** Returns the stored fixed catalog price only when the package record matches its approved tier. */
export function approvedFitPassPackagePriceKobo(value: {
  name: string;
  billingInterval: string;
  priceKobo: number;
  activeMemberLimit: number;
  adminAccountLimit: number;
}): number | null {
  return matchesFixedFitPassPackage(value) ? value.priceKobo : null;
}
