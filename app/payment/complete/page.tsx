"use client";

import Link from "next/link";
import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";

type PaymentState = { type: "gym" | "platform"; gymId: string; paymentMode: "demo" | "paystack"; status: string };

function PaymentStatus() {
  const reference = useSearchParams().get("reference") ?? "";
  const [payment, setPayment] = useState<PaymentState | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    let stopped = false;
    let attempts = 0;
    const check = async () => {
      if (!reference || stopped) return;
      try {
        const response = await fetch(`/api/payments/status?reference=${encodeURIComponent(reference)}`, { cache: "no-store" });
        const result = await response.json() as PaymentState & { error?: string };
        if (!response.ok) throw new Error(result.error ?? "Payment status could not be loaded.");
        if (stopped) return;
        setPayment(result);
        if (result.status === "pending" && attempts++ < 12) window.setTimeout(() => void check(), 2500);
      } catch (cause) { if (!stopped) setError(cause instanceof Error ? cause.message : "Could not check payment status."); }
    };
    const timer = window.setTimeout(() => void check(), 0);
    return () => { stopped = true; window.clearTimeout(timer); };
  }, [reference]);

  const destination = payment ? payment.type === "gym" ? `/gyms/${payment.gymId}/member` : `/gyms/${payment.gymId}/owner` : "/";
  return <main className="grid min-h-dvh place-items-center px-4 py-10"><section className="w-full max-w-lg rounded-xl border bg-white p-6 text-center sm:p-8">
    <h1 className="font-heading text-2xl font-bold">Payment status</h1>
    {!reference && <p role="alert" className="mt-4 text-danger">No payment reference was supplied.</p>}
    {error && <p role="alert" className="mt-4 text-danger">{error}</p>}
    {!error && payment?.status === "paid" && <><p role="status" className="mt-4 text-success">{payment.paymentMode === "demo" ? "DEMO payment recorded. No funds were charged." : "Payment verified by Paystack. Your records have been updated."}</p><Link className="mt-5 inline-block min-h-11 rounded-xl bg-primary px-5 py-3 font-semibold text-white" href={destination}>Continue to FitPass</Link></>}
    {!error && payment && payment.status === "pending" && <p role="status" className="mt-4 text-base">{payment.paymentMode === "demo" ? "This DEMO payment has not been confirmed yet. No funds were charged." : "Payment is awaiting a verified Paystack notification. Do not pay again; this page will check again shortly."}</p>}
    {!error && payment && ["failed", "abandoned"].includes(payment.status) && <p role="status" className="mt-4 text-base">Payment was not completed. Your membership is not active.</p>}
    <Link className="mt-5 block text-sm font-semibold text-primary underline" href="/">Return to FitPass</Link>
  </section></main>;
}

export default function PaymentCompletePage() {
  return <Suspense fallback={<main className="grid min-h-dvh place-items-center">Checking payment…</main>}><PaymentStatus /></Suspense>;
}
