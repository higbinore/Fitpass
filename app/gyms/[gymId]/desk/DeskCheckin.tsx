"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { ArrowLeft, Check, CircleAlert, Clock3, ScanLine } from "lucide-react";

type Lookup = { eligible: boolean; canCheckIn?: boolean; memberName?: string; expiresAt?: string; reason?: string; dailyCheckins?: { used: number; limit: number } };
type CheckinResult = { accepted: boolean; memberName?: string; daysRemaining?: number; error?: string; dailyCheckins?: { used: number; limit: number } };
type DeskOverview = { todayCount: number; recentCheckins: Array<{ id: string; memberName: string; checkedInAt: string }> };

export default function DeskCheckin({ gymId }: { gymId: string }) {
  const [code, setCode] = useState("");
  const [lookup, setLookup] = useState<Lookup | null>(null);
  const [checkinResult, setCheckinResult] = useState<CheckinResult | null>(null);
  const [overview, setOverview] = useState<DeskOverview | null>(null);
  const [overviewError, setOverviewError] = useState("");
  const [lookupError, setLookupError] = useState("");
  const [busy, setBusy] = useState(false);

  const refreshOverview = useCallback(async () => {
    try {
      const response = await fetch(`/api/gyms/${encodeURIComponent(gymId)}/checkins`, { cache: "no-store" });
      const payload = await response.json() as DeskOverview & { error?: string };
      if (!response.ok) throw new Error(payload.error ?? "Could not load today's desk activity.");
      setOverview(payload);
      setOverviewError("");
    } catch (cause) {
      setOverviewError(cause instanceof Error ? cause.message : "Could not load today's desk activity.");
    }
  }, [gymId]);

  useEffect(() => { const timer = window.setTimeout(() => { void refreshOverview(); }, 0); return () => window.clearTimeout(timer); }, [refreshOverview]);

  async function verify(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setLookup(null); setCheckinResult(null); setLookupError("");
    try {
      const response = await fetch(`/api/gyms/${encodeURIComponent(gymId)}/checkins?code=${encodeURIComponent(code)}`, { cache: "no-store" });
      const payload = await response.json() as Lookup & { error?: string };
      if (!response.ok) throw new Error(payload.error ?? "Membership could not be verified.");
      setLookup(payload);
    } catch (cause) { setLookupError(cause instanceof Error ? cause.message : "Network error. No check-in was recorded. Try again."); }
    finally { setBusy(false); }
  }

  async function recordCheckin() {
    setBusy(true); setCheckinResult(null);
    try {
      const response = await fetch(`/api/gyms/${encodeURIComponent(gymId)}/checkins`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ code }) });
      const payload = await response.json() as CheckinResult;
      if (!response.ok) throw new Error(payload.error ?? "Check-in could not be completed.");
      setCheckinResult(payload);
      setCode(""); setLookup(null);
      await refreshOverview();
    } catch (cause) {
      setCheckinResult({ accepted: false, error: cause instanceof Error ? cause.message : "Network error. No check-in was recorded. Try again." });
    } finally { setBusy(false); }
  }

  return <div className="mt-6 space-y-5">
    <div className="flex items-center justify-between gap-3"><Link href="/dashboard" className="inline-flex min-h-11 items-center gap-2 rounded-xl px-3 text-sm font-semibold text-slate-600 hover:bg-white"><ArrowLeft size={17} />All workspaces</Link><span className="inline-flex items-center gap-2 rounded-full bg-green-100 px-3 py-2 text-xs font-bold text-slate-800"><span className="size-2 rounded-full bg-green-700" />Desk workspace</span></div>

    <section className="overflow-hidden rounded-3xl bg-green-900 text-white shadow-[0_12px_36px_rgba(15,23,42,0.12)]">
      <div className="grid gap-6 p-6 sm:p-8 md:grid-cols-[1fr_auto] md:items-end"><div><p className="inline-flex items-center gap-2 rounded-full bg-orange-500/15 px-3 py-1.5 text-xs font-bold uppercase tracking-[0.15em] text-green-300"><ScanLine size={14} />Front desk</p><h2 className="mt-4 font-heading text-3xl font-bold tracking-tight sm:text-4xl">A smooth start to every session.</h2><p className="mt-2 max-w-xl text-sm leading-6 text-slate-300">Verify a membership first. FitPass checks its current status on the server before a check-in can be recorded.</p></div><div className="rounded-2xl border border-white/10 bg-white/5 p-5 md:min-w-44"><p className="text-sm text-slate-300">Today’s check-ins</p><p className="mt-2 font-heading text-4xl font-bold text-green-300">{overview ? overview.todayCount : "—"}</p><p className="mt-1 text-xs text-slate-400">Benin City time</p></div></div>
    </section>

    <div className="grid gap-5 lg:grid-cols-[1.1fr_0.9fr]">
      <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-[0_3px_14px_rgba(15,23,42,0.04)] sm:p-7">
        <div><p className="text-xs font-bold uppercase tracking-[0.16em] text-green-700">Member lookup</p><h2 className="mt-2 font-heading text-xl font-bold text-slate-950">Check membership status</h2><p className="mt-1 text-sm leading-6 text-slate-600">Search by the member’s FitPass code. Lookup does not record a visit.</p></div>
        <form onSubmit={verify} className="mt-5"><label className="grid gap-2 text-sm font-semibold text-slate-700">Membership code<input name="code" value={code} onChange={(event) => { setCode(event.target.value); setLookup(null); setCheckinResult(null); }} required minLength={4} maxLength={40} autoComplete="off" placeholder="Enter member code" className="min-h-12 rounded-xl border border-slate-300 bg-slate-50 px-4 font-mono text-lg tracking-wide outline-none transition focus:border-green-600 focus:ring-4 focus:ring-green-100" /></label><button disabled={busy || code.trim().length < 4} className="mt-4 min-h-12 w-full rounded-xl bg-orange-500 px-5 font-bold text-slate-950 transition hover:bg-orange-600 disabled:cursor-wait disabled:opacity-60">{busy ? "Verifying…" : "Verify membership"}</button></form>
        {lookupError && <p role="alert" className="mt-4 rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">{lookupError}</p>}
        {lookup && <div role="status" aria-live="polite" className={`mt-5 rounded-2xl border p-5 ${lookup.eligible && lookup.canCheckIn !== false ? "border-emerald-200 bg-emerald-50" : "border-amber-200 bg-amber-50"}`}>
          <div className="flex items-start gap-3">{lookup.eligible && lookup.canCheckIn !== false ? <span className="grid size-9 shrink-0 place-items-center rounded-full bg-emerald-600 text-white"><Check size={19} /></span> : <span className="grid size-9 shrink-0 place-items-center rounded-full bg-amber-500 text-white"><CircleAlert size={19} /></span>}<div className="min-w-0 flex-1"><p className={`font-heading text-lg font-bold ${lookup.eligible && lookup.canCheckIn !== false ? "text-emerald-950" : "text-amber-950"}`}>{lookup.eligible ? lookup.canCheckIn === false ? "Daily limit reached" : "Membership active" : "Check-in unavailable"}</p>{lookup.eligible ? <><p className="mt-1 text-sm text-emerald-900">{lookup.memberName}</p><p className="mt-1 inline-flex items-center gap-1.5 text-xs text-emerald-800"><Clock3 size={14} />Valid until {lookup.expiresAt ? new Date(lookup.expiresAt).toLocaleDateString("en-NG") : "—"}</p>{lookup.dailyCheckins && <p className="mt-2 text-sm font-semibold text-slate-800">Today’s visits: {lookup.dailyCheckins.used} of {lookup.dailyCheckins.limit}</p>}{lookup.canCheckIn === false ? <p className="mt-2 text-sm text-amber-900">{lookup.reason}</p> : <button type="button" disabled={busy} onClick={() => void recordCheckin()} className="mt-4 min-h-11 w-full rounded-xl bg-emerald-700 px-4 font-semibold text-white hover:bg-emerald-800 disabled:opacity-60">{busy ? "Recording check-in…" : "Confirm and record check-in"}</button>}</> : <p className="mt-1 text-sm text-amber-900">{lookup.reason}</p>}</div></div>
        </div>}
        {checkinResult && <div role={checkinResult.accepted ? "status" : "alert"} aria-live="polite" className={`mt-4 rounded-2xl p-6 sm:p-8 ${checkinResult.accepted ? "bg-emerald-700 text-white" : "border border-rose-200 bg-rose-50 text-rose-950"}`}><p className="font-heading text-3xl font-bold leading-tight sm:text-4xl">{checkinResult.accepted ? `Welcome, ${checkinResult.memberName}.` : "Check-in not recorded."}</p>{checkinResult.accepted ? <p className="mt-3 text-base font-semibold text-white">Visit recorded · {checkinResult.daysRemaining} {checkinResult.daysRemaining === 1 ? "day" : "days"} remain on the active membership.{checkinResult.dailyCheckins ? ` Today: ${checkinResult.dailyCheckins.used} of ${checkinResult.dailyCheckins.limit}.` : ""}</p> : <p className="mt-2 text-base">{checkinResult.error}</p>}</div>}
      </section>

      <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-[0_3px_14px_rgba(15,23,42,0.04)] sm:p-7"><div className="flex items-start justify-between gap-3"><div><p className="text-xs font-bold uppercase tracking-[0.16em] text-slate-500">Live activity</p><h2 className="mt-2 font-heading text-xl font-bold text-slate-950">Recent check-ins</h2></div><button type="button" onClick={() => void refreshOverview()} className="min-h-10 rounded-lg border border-slate-200 px-3 text-sm font-semibold text-slate-700 hover:bg-slate-50">Refresh</button></div>
        {overviewError && <p role="alert" className="mt-4 rounded-xl bg-rose-50 p-3 text-sm text-rose-800">{overviewError}</p>}
        {!overview && !overviewError && <p role="status" className="mt-5 rounded-xl bg-slate-50 p-4 text-sm text-slate-500">Loading today’s activity…</p>}
        {overview && overview.recentCheckins.length === 0 && <p className="mt-5 rounded-xl bg-slate-50 p-5 text-sm leading-6 text-slate-600">No check-ins have been recorded today. New successful visits will appear here.</p>}
        {overview && overview.recentCheckins.length > 0 && <ul className="mt-4 divide-y divide-slate-100">{overview.recentCheckins.map((item) => <li key={item.id} className="flex items-center justify-between gap-4 py-3 first:pt-1"><div className="flex min-w-0 items-center gap-3"><span className="grid size-9 shrink-0 place-items-center rounded-full bg-green-100 text-slate-800"><Check size={17} /></span><p className="truncate text-sm font-semibold text-slate-800">{item.memberName}</p></div><time className="shrink-0 text-xs tabular-nums text-slate-500">{new Date(item.checkedInAt).toLocaleTimeString("en-NG", { hour: "2-digit", minute: "2-digit" })}</time></li>)}</ul>}
      </section>
    </div>
  </div>;
}
