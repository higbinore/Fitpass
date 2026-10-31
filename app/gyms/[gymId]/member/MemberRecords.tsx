"use client";

import Link from "next/link";
import Image from "next/image";
import { useEffect, useState, type FormEvent } from "react";
import { ArrowUpRight, CalendarDays, Check, Clock3, CreditCard, History, Pencil, Save, X } from "lucide-react";
import { formatNaira } from "@/lib/money";
import GymImagePlaceholder from "@/components/GymImagePlaceholder";

type Records = {
  gym: { name: string; logoUrl: string | null; facilityPhotoUrls: string[] };
  member: { fullName: string; phone?: string | null; membershipCode: string };
  subscriptions: Array<{ id: string; planName: string; status: string; startsAt: string; expiresAt: string }>;
  payments: Array<{ id: string; planName: string; amountKobo: number; currency: string; status: string; paymentMode: "demo" | "paystack"; paidAt: string | null; createdAt: string }>;
  checkins: Array<{ id: string; createdAt: string }>;
  pagination: { pageSize: number; subscriptionsPage: number; paymentsPage: number; checkinsPage: number; subscriptionsTotal: number; paymentsTotal: number; checkinsTotal: number };
};

function date(value: string) { return new Date(value).toLocaleDateString("en-NG", { day: "numeric", month: "short", year: "numeric" }); }

export default function MemberRecords({ gymId }: { gymId: string }) {
  const [records, setRecords] = useState<Records | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [editingProfile, setEditingProfile] = useState(false);
  const [savingProfile, setSavingProfile] = useState(false);
  const [loadingHistory, setLoadingHistory] = useState<"subscriptions" | "payments" | "checkins" | null>(null);
  useEffect(() => {
    const timer = window.setTimeout(() => {
      void fetch(`/api/gyms/${encodeURIComponent(gymId)}/me`, { cache: "no-store" }).then(async (response) => {
        const data = await response.json() as Records & { error?: string };
        if (!response.ok) throw new Error(data.error ?? "Could not load membership records.");
        setRecords(data);
      }).catch((cause: unknown) => setError(cause instanceof Error ? cause.message : "Could not load membership records."));
    }, 0);
    return () => window.clearTimeout(timer);
  }, [gymId]);

  if (error) return <p role="alert" className="mt-6 rounded-2xl border border-rose-200 bg-white p-5 text-rose-800">{error}</p>;
  if (!records) return <p role="status" className="mt-6 rounded-2xl border border-slate-200 bg-white p-5 text-slate-600">Loading your records…</p>;

  const loadedRecords = records;
  const now = new Date();
  const current = records.subscriptions.find((subscription) => subscription.status === "active" && new Date(subscription.startsAt) <= now && new Date(subscription.expiresAt) > now);
  const daysRemaining = current ? Math.ceil((new Date(current.expiresAt).getTime() - now.getTime()) / 86400000) : 0;

  async function loadOlder(kind: "subscriptions" | "payments" | "checkins") {
    if (loadingHistory) return;
    setLoadingHistory(kind);
    setError("");
    const pageKey = `${kind}Page` as "subscriptionsPage" | "paymentsPage" | "checkinsPage";
    const nextPage = loadedRecords.pagination[pageKey] + 1;
    try {
      const query = new URLSearchParams({ subscriptionsPage: String(kind === "subscriptions" ? nextPage : loadedRecords.pagination.subscriptionsPage), paymentsPage: String(kind === "payments" ? nextPage : loadedRecords.pagination.paymentsPage), checkinsPage: String(kind === "checkins" ? nextPage : loadedRecords.pagination.checkinsPage) });
      const response = await fetch(`/api/gyms/${encodeURIComponent(gymId)}/me?${query}`, { cache: "no-store" });
      const next = await response.json() as Records & { error?: string };
      if (!response.ok) throw new Error(next.error ?? "Could not load older records.");
      setRecords((previous) => previous ? {
        ...previous,
        subscriptions: kind === "subscriptions" ? [...previous.subscriptions, ...next.subscriptions] : previous.subscriptions,
        payments: kind === "payments" ? [...previous.payments, ...next.payments] : previous.payments,
        checkins: kind === "checkins" ? [...previous.checkins, ...next.checkins] : previous.checkins,
        pagination: next.pagination,
      } : previous);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not load older records."); }
    finally { setLoadingHistory(null); }
  }

  async function updateProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!records) return;
    setSavingProfile(true);
    setError("");
    setNotice("");
    const form = new FormData(event.currentTarget);
    try {
      const response = await fetch(`/api/gyms/${encodeURIComponent(gymId)}/me/profile`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fullName: form.get("fullName"), phone: form.get("phone") }),
      });
      const data = await response.json() as { member?: Records["member"]; error?: string };
      if (!response.ok || !data.member) throw new Error(data.error ?? "Could not update your profile.");
      setRecords((currentRecords) => currentRecords ? { ...currentRecords, member: { ...currentRecords.member, ...data.member } } : currentRecords);
      setEditingProfile(false);
      setNotice("Your gym profile was updated.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not update your profile.");
    } finally {
      setSavingProfile(false);
    }
  }

  return <div className="mt-6 space-y-5">
    {error && <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">{error}</p>}
    {notice && <p role="status" className="rounded-xl border border-green-200 bg-green-50 p-3 text-sm text-green-900">{notice}</p>}
    <section className="flex flex-wrap items-center gap-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
      {records.gym.facilityPhotoUrls[0] ? <Image src={records.gym.facilityPhotoUrls[0]} alt={`${records.gym.name} facility`} width={240} height={144} unoptimized className="h-24 w-40 rounded-xl object-cover" /> : records.gym.logoUrl ? <Image src={records.gym.logoUrl} alt={`${records.gym.name} logo`} width={96} height={96} unoptimized className="size-20 rounded-xl border object-cover" /> : <GymImagePlaceholder label="Gym photo will appear here when published" className="w-full max-w-xs rounded-xl" />}
      <div><p className="text-xs font-bold uppercase tracking-wide text-green-700">Your gym</p><h2 className="mt-1 font-heading text-lg font-bold text-slate-950">{records.gym.name}</h2><Link href={`/gyms/${encodeURIComponent(gymId)}`} className="mt-1 inline-flex min-h-9 items-center text-sm font-semibold text-primary underline">View gym profile</Link></div>
    </section>
    <section className="grid gap-5 lg:grid-cols-[1.2fr_0.8fr]">
      <article className="overflow-hidden rounded-3xl bg-green-900 p-6 text-white shadow-[0_12px_36px_rgba(15,23,42,0.12)] sm:p-8">
        <div className="flex flex-wrap items-start justify-between gap-4"><div><p className="text-xs font-bold uppercase tracking-[0.18em] text-green-300">Your FitPass card</p><h2 className="mt-2 font-heading text-2xl font-bold sm:text-3xl">Welcome, {records.member.fullName.split(" ")[0]}</h2></div><div className="flex flex-wrap items-center gap-2"><span className={`rounded-full px-3 py-1.5 text-xs font-bold ${current ? "bg-orange-500 text-slate-950" : "bg-white/10 text-white"}`}>{current ? "Membership active" : "No active membership"}</span><button type="button" onClick={() => { setEditingProfile((value) => !value); setError(""); setNotice(""); }} className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-white/20 px-3 text-sm font-semibold text-white hover:bg-white/10">{editingProfile ? <X size={15} /> : <Pencil size={15} />}{editingProfile ? "Cancel" : "Edit profile"}</button></div></div>
        <div className="mt-7 rounded-2xl border border-white/10 bg-white/5 p-5"><p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Member code</p><p className="mt-2 font-mono text-2xl font-bold tracking-[0.12em] text-green-300 sm:text-3xl">{records.member.membershipCode}</p><p className="mt-2 text-xs text-slate-400">Show this code at the gym front desk.</p></div>
        {editingProfile && <form onSubmit={(event) => void updateProfile(event)} className="mt-5 grid gap-3 rounded-2xl border border-white/10 bg-white/5 p-4 sm:grid-cols-2"><label className="grid gap-1.5 text-sm font-semibold text-white">Full name<input name="fullName" required minLength={2} maxLength={120} defaultValue={records.member.fullName} className="min-h-11 rounded-xl border border-white/20 bg-green-900/30 px-3 text-white outline-none focus:border-green-300" /></label><label className="grid gap-1.5 text-sm font-semibold text-white">Phone number<input name="phone" type="tel" maxLength={40} defaultValue={records.member.phone ?? ""} className="min-h-11 rounded-xl border border-white/20 bg-green-900/30 px-3 text-white outline-none focus:border-green-300" /></label><button disabled={savingProfile} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-orange-500 px-4 text-sm font-bold text-slate-950 hover:bg-orange-600 disabled:opacity-60 sm:col-span-2"><Save size={16} />{savingProfile ? "Saving…" : "Save gym profile"}</button></form>}
      </article>
      <article className="flex flex-col justify-between rounded-3xl border border-slate-200 bg-white p-6 shadow-[0_3px_14px_rgba(15,23,42,0.04)] sm:p-7">
        <div><p className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-[0.15em] text-slate-500"><CalendarDays size={15} />Current plan</p>{current ? <><h2 className="mt-4 font-heading text-2xl font-bold text-slate-950">{current.planName}</h2><p className="mt-2 text-sm text-slate-600">Valid through <strong className="text-slate-900">{date(current.expiresAt)}</strong></p><p className="mt-1 text-sm text-slate-600">{daysRemaining} {daysRemaining === 1 ? "day" : "days"} remaining</p></> : <><h2 className="mt-4 font-heading text-xl font-bold text-slate-950">Ready for your next session?</h2><p className="mt-2 text-sm leading-6 text-slate-600">Choose an available gym plan to activate or renew your membership.</p></>}</div>
        <Link href={`/gyms/${encodeURIComponent(gymId)}/join`} className="mt-6 inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-orange-500 px-5 text-sm font-bold text-slate-950 transition hover:bg-orange-600">{current ? "View renewal plans" : "Browse gym plans"}<ArrowUpRight size={17} /></Link>
      </article>
    </section>

    <section className="grid gap-5 lg:grid-cols-2">
      <article className="rounded-3xl border border-slate-200 bg-white p-5 shadow-[0_3px_14px_rgba(15,23,42,0.04)] sm:p-6"><div className="flex items-center gap-3"><span className="grid size-10 place-items-center rounded-xl bg-green-100 text-slate-900"><CreditCard size={19} /></span><div><h2 className="font-heading text-lg font-bold text-slate-950">Payment history</h2><p className="text-xs text-slate-500">Gym membership payments</p></div></div>
        {records.payments.length === 0 ? <p className="mt-5 rounded-xl bg-slate-50 p-4 text-sm text-slate-600">No payments recorded yet. Confirmed payments will appear here.</p> : <ul className="mt-4 divide-y divide-slate-100">{records.payments.map((payment) => <li key={payment.id} className="flex flex-wrap items-center justify-between gap-3 py-3"><div><p className="text-sm font-semibold text-slate-900">{payment.planName}</p><p className="mt-1 text-xs capitalize text-slate-500">{date(payment.paidAt ?? payment.createdAt)} · {payment.status.replaceAll("_", " ")}{payment.paymentMode === "demo" ? " · DEMO (no charge)" : ""}</p></div><p className="text-sm font-bold text-slate-900">{formatNaira(payment.amountKobo)}</p></li>)}</ul>}{records.payments.length < records.pagination.paymentsTotal && <button type="button" disabled={Boolean(loadingHistory)} onClick={() => void loadOlder("payments")} className="mt-3 min-h-10 rounded-lg border px-3 text-sm font-semibold disabled:opacity-50">{loadingHistory === "payments" ? "Loading…" : `Load older payments (${records.payments.length} of ${records.pagination.paymentsTotal})`}</button>}
      </article>

      <article className="rounded-3xl border border-slate-200 bg-white p-5 shadow-[0_3px_14px_rgba(15,23,42,0.04)] sm:p-6"><div className="flex items-center gap-3"><span className="grid size-10 place-items-center rounded-xl bg-slate-100 text-slate-800"><History size={19} /></span><div><h2 className="font-heading text-lg font-bold text-slate-950">Membership history</h2><p className="text-xs text-slate-500">Your plans and gym visits</p></div></div>
        {records.subscriptions.length === 0 ? <p className="mt-5 rounded-xl bg-slate-50 p-4 text-sm text-slate-600">No plan history yet. Browse plans when you are ready to join.</p> : <ul className="mt-4 divide-y divide-slate-100">{records.subscriptions.map((subscription) => <li key={subscription.id} className="flex flex-wrap items-center justify-between gap-3 py-3"><div><p className="text-sm font-semibold text-slate-900">{subscription.planName}</p><p className="mt-1 text-xs text-slate-500">{date(subscription.startsAt)} – {date(subscription.expiresAt)}</p></div><span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-bold capitalize text-slate-700">{subscription.status.replaceAll("_", " ")}</span></li>)}</ul>}{records.subscriptions.length < records.pagination.subscriptionsTotal && <button type="button" disabled={Boolean(loadingHistory)} onClick={() => void loadOlder("subscriptions")} className="mt-3 min-h-10 rounded-lg border px-3 text-sm font-semibold disabled:opacity-50">{loadingHistory === "subscriptions" ? "Loading…" : `Load older membership history (${records.subscriptions.length} of ${records.pagination.subscriptionsTotal})`}</button>}
        <div className="mt-4 border-t border-slate-100 pt-4"><p className="inline-flex items-center gap-2 text-sm font-semibold text-slate-800"><Check size={16} className="text-green-700" />Check-in history</p>{records.checkins.length === 0 ? <p className="mt-2 text-sm text-slate-600">No visits recorded yet.</p> : <ul className="mt-2 space-y-2">{records.checkins.map((checkin) => <li key={checkin.id} className="flex items-center justify-between gap-3 text-sm"><span className="text-slate-600">Gym visit</span><time className="inline-flex items-center gap-1 text-xs tabular-nums text-slate-500"><Clock3 size={13} />{new Date(checkin.createdAt).toLocaleString("en-NG", { dateStyle: "medium", timeStyle: "short" })}</time></li>)}</ul>}{records.checkins.length < records.pagination.checkinsTotal && <button type="button" disabled={Boolean(loadingHistory)} onClick={() => void loadOlder("checkins")} className="mt-3 min-h-10 rounded-lg border px-3 text-sm font-semibold disabled:opacity-50">{loadingHistory === "checkins" ? "Loading…" : `Load older check-ins (${records.checkins.length} of ${records.pagination.checkinsTotal})`}</button>}</div>
      </article>
    </section>
  </div>;
}
