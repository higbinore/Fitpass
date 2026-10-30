export type FitPassPaymentMode = "paystack" | "demo";

/** Demo is explicit and never selected in production by default. */
export function getPaymentMode(): FitPassPaymentMode {
  const value = process.env.FITPASS_PAYMENT_MODE ?? "paystack";
  if (value === "demo" || value === "paystack") return value;
  throw new Error("FITPASS_PAYMENT_MODE must be either 'paystack' or 'demo'.");
}
