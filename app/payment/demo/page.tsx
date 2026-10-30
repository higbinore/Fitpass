"use client";

import Link from "next/link";
import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";

type PaymentState = { type: "gym" | "platform"; gymId: string; paymentMode: string; status: string };

function DemoPaymentContent() {
  const reference = useSearchParams().get("reference") ?? "";
  const [payment, setPayment] = useState<PaymentState | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [outcome, setOutcome] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    if (!reference) return;
    void fetch(`/api/payments/status?reference=${encodeURIComponent(reference)}`, { cache: "no-store" })
      .then(async (response) => {
        const result = await response.json() as PaymentState & { error?: string };
        if (!response.ok) throw new Error(result.error ?? "Could not load this demo payment.");
        if (result.paymentMode !== "demo") throw new Error("This reference is not a demo payment.");
        if (active) setPayment(result);
      })
      .catch((cause: unknown) => { if (active) setError(cause instanceof Error ? cause.message : "Could not load this demo payment."); });
    return () => { active = false; };
  }, [reference]);

  async function simulate(result: "success" | "failure") {
    setBusy(true); setError(""); setOutcome(null);
    try {
      const response = await fetch("/api/payments/demo/confirm", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ reference, outcome: result }) });
      const payload = await response.json() as { status?: string; error?: string };
      if (!response.ok) throw new Error(payload.error ?? "Could not complete the demo payment.");
      setOutcome(payload.status ?? result);
      if (payment) setPayment({ ...payment, status: payload.status ?? result });
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not complete the demo payment."); }
    finally { setBusy(false); }
  }

  return <main className="grid min-h-dvh place-items-center bg-slate-50 px-4 py-10"><section className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
    <span className="inline-flex rounded-full border border-amber-300 bg-amber-50 px-3 py-1 text-xs font-bold uppercase tracking-wide text-amber-900">DEMO · no charge</span>
    <h1 className="mt-4 font-heading text-2xl font-bold text-slate-950">Simulated payment</h1>
    <p className="mt-2 text-sm leading-6 text-slate-600">This is a FitPass demonstration. It does not contact Paystack or charge a card. The server records the selected result against the pending {payment?.type === "platform" ? "FitPass subscription" : "gym membership"} payment.</p>
    {!reference && <p role="alert" className="mt-4 text-sm text-rose-800">No demo payment reference was provided.</p>}
    {error && <p role="alert" className="mt-4 rounded-xl bg-rose-50 p-3 text-sm text-rose-800">{error}</p>}
    {payment && <p className="mt-4 rounded-xl bg-slate-50 p-3 text-sm text-slate-700">Payment status: <strong className="capitalize">{payment.status}</strong></p>}
    {outcome && <p role="status" className="mt-4 rounded-xl border border-green-300 bg-green-50 p-3 text-sm font-semibold text-slate-900">Demo outcome recorded: {outcome}.</p>}
    <div className="mt-5 grid gap-3 sm:grid-cols-2"><button type="button" disabled={busy || payment?.status !== "pending"} onClick={() => void simulate("success")} className="min-h-12 rounded-xl bg-orange-500 px-4 font-bold text-slate-950 disabled:opacity-50">{busy ? "Recording…" : "Simulate success"}</button><button type="button" disabled={busy || payment?.status !== "pending"} onClick={() => void simulate("failure")} className="min-h-12 rounded-xl border border-slate-300 px-4 font-semibold text-slate-800 disabled:opacity-50">Simulate failure</button></div>
    {payment && payment.status !== "pending" && <Link className="mt-5 inline-flex min-h-11 w-full items-center justify-center rounded-xl bg-green-900 px-4 font-semibold text-white" href={`/payment/complete?reference=${encodeURIComponent(reference)}`}>View payment result</Link>}
    <Link className="mt-4 block text-center text-sm font-semibold text-slate-600 underline" href="/">Return to FitPass</Link>
  </section></main>;
}

export default function DemoPaymentPage() {
  return <Suspense fallback={<main className="grid min-h-dvh place-items-center">Loading demo checkout…</main>}><DemoPaymentContent /></Suspense>;
}
