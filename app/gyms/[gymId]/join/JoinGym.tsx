"use client";

import { useEffect, useState } from "react";
import { formatNaira } from "@/lib/money";

type Plan = { id: string; name: string; durationDays: number; priceKobo: number; description: string | null };
type PlansResponse = { plans: Plan[]; error?: string };

export default function JoinGym({ gymId, initialPlanId = "" }: { gymId: string; initialPlanId?: string }) {
  const [plans, setPlans] = useState<Plan[]>([]);
  const [selectedPlanId, setSelectedPlanId] = useState(initialPlanId);
  const [memberCode, setMemberCode] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    const timer = window.setTimeout(() => {
      void fetch(`/api/gyms/${encodeURIComponent(gymId)}/public-plans`, { cache: "no-store" }).then(async (response) => {
        const result = await response.json() as PlansResponse;
        if (!response.ok) throw new Error(result.error ?? "Could not load gym plans.");
        setPlans(result.plans);
      }).catch((cause: unknown) => setError(cause instanceof Error ? cause.message : "Could not load gym plans."))
        .finally(() => setLoading(false));
    }, 0);
    return () => window.clearTimeout(timer);
  }, [gymId]);

  async function continueToPayment() {
    if (!plans.some((plan) => plan.id === selectedPlanId) || busy) return;
    setBusy(true); setError("");
    try {
      const enrollmentResponse = await fetch(`/api/gyms/${encodeURIComponent(gymId)}/join`, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
      const enrollment = await enrollmentResponse.json() as { membershipCode?: string; error?: string };
      if (!enrollmentResponse.ok) throw new Error(enrollment.error ?? "Could not prepare your gym membership.");
      setMemberCode(enrollment.membershipCode ?? "");

      const checkoutResponse = await fetch(`/api/gyms/${encodeURIComponent(gymId)}/checkout`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ planId: selectedPlanId }) });
      const checkout = await checkoutResponse.json() as { authorizationUrl?: string; demoUrl?: string; paymentMode?: string; error?: string };
      const destination = checkout.paymentMode === "demo" ? checkout.demoUrl : checkout.authorizationUrl;
      if (!checkoutResponse.ok || !destination) throw new Error(checkout.error ?? "Your profile is ready, but payment could not be started. You can try again shortly.");
      window.location.assign(destination);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not join this gym."); }
    finally { setBusy(false); }
  }

  return <div className="space-y-5">
    {error && <p role="alert" className="rounded-xl border border-danger bg-white p-4 text-danger">{error}</p>}
    {memberCode && <section role="status" className="rounded-xl border border-success bg-white p-5"><h2 className="font-heading text-lg font-bold">Your member profile is ready</h2><p className="mt-2 text-sm text-muted-foreground">FitPass code: <strong className="font-mono text-slate-900">{memberCode}</strong>. It becomes valid for check-in only after payment is verified.</p></section>}
    <section><div className="flex flex-wrap items-end justify-between gap-2"><div><h2 className="font-heading text-xl font-bold">Choose your gym plan</h2><p className="mt-1 text-sm text-muted-foreground">Select one option to continue. No membership activates until the payment is verified.</p></div></div>
      {loading && <p role="status" className="mt-3 rounded-xl border bg-white p-5 text-sm text-muted-foreground">Loading current gym plans…</p>}
      {!loading && plans.length > 0 && <ul className="mt-3 grid gap-3 sm:grid-cols-2">{plans.map((plan) => { const selected = selectedPlanId === plan.id; return <li key={plan.id} className={`flex min-w-0 flex-col rounded-2xl border bg-white p-5 transition ${selected ? "border-primary ring-2 ring-accent shadow-md" : "border-slate-200 shadow-sm"}`}><div className="flex items-start justify-between gap-3"><h3 className="break-words font-heading text-lg font-bold">{plan.name}</h3><span aria-hidden="true" className={`grid size-6 shrink-0 place-items-center rounded-full border text-xs font-bold ${selected ? "border-primary bg-primary text-white" : "border-slate-300 text-transparent"}`}>✓</span></div>{plan.description && <p className="mt-1 text-sm leading-6 text-muted-foreground">{plan.description}</p>}<p className="mt-4 font-heading text-2xl font-bold">{formatNaira(plan.priceKobo)}</p><p className="mt-1 text-sm text-muted-foreground">Valid for {plan.durationDays} {plan.durationDays === 1 ? "day" : "days"}</p><button type="button" aria-pressed={selected} disabled={busy} onClick={() => setSelectedPlanId(plan.id)} className={`mt-4 min-h-11 w-full rounded-xl border px-4 font-semibold disabled:opacity-60 ${selected ? "border-primary bg-primary text-white" : "border-slate-300 bg-white text-slate-900 hover:bg-slate-50"}`}>{selected ? "Selected plan" : "Select this plan"}</button></li>; })}</ul>}
      {!loading && plans.length === 0 && !error && <p className="mt-3 rounded-xl border bg-white p-5 text-muted-foreground">This gym has no active membership plans right now. Please contact the gym directly.</p>}
    </section>
    <section className="sticky bottom-0 z-10 -mx-4 border-t border-slate-200 bg-white/95 p-4 shadow-[0_-8px_24px_rgba(15,23,42,0.06)] backdrop-blur sm:static sm:mx-0 sm:rounded-2xl sm:border sm:p-5 sm:shadow-sm"><div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><p className="min-w-0 text-sm text-slate-600">{selectedPlanId ? `Selected: ${plans.find((plan) => plan.id === selectedPlanId)?.name ?? "gym plan"}` : "Choose a plan above to continue to secure payment."}<span className="mt-1 block text-xs text-slate-500">Gym payments are separate from FitPass billing. In DEMO mode no card is charged; activation is processed by FitPass’s demo simulator.</span></p><button type="button" disabled={!plans.some((plan) => plan.id === selectedPlanId) || busy || loading} onClick={() => void continueToPayment()} className="min-h-12 w-full shrink-0 rounded-xl bg-accent px-5 font-bold text-accent-foreground hover:bg-accent/90 disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto">{busy ? "Preparing checkout…" : memberCode ? "Continue to checkout" : "Set up profile & continue"}</button></div></section>
  </div>;
}
