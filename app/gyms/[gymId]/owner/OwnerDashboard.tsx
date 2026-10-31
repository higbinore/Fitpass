"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import Image from "next/image";
import { formatNaira } from "@/lib/money";
import MemberManagement from "./MemberManagement";

type Summary = {
  gym: { id: string; name: string; slug: string; status: string; contactPhone: string | null; contactEmail: string | null; location: string | null; maxDailyCheckins: number; logoUrl: string | null; facilityPhotoUrls: string[] };
  members: number;
  activeSubscriptions: number;
  paidIncomeKobo: string;
  monthIncomeKobo: string;
  checkins: number;
  newMembers: number;
  pendingPayments: number;
  pendingPaymentsKobo: string;
  administrativeRoles: number;
  expiringMemberships: Array<{ id: string; memberName: string; planName: string; expiresAt: string }>;
  recentCheckins: Array<{ id: string; memberName: string; checkedInAt: string }>;
  recentPayments: Array<{ id: string; memberName: string; planName: string; amountKobo: number; status: string; paymentMode: "demo" | "paystack"; createdAt: string; paidAt: string | null }>;
};
type GymPlan = { id: string; name: string; durationDays: number; priceKobo: number; description: string | null; isActive: boolean; sortOrder: number };
type Package = { id: string; name: string; priceKobo: number; activeMemberLimit: number; adminAccountLimit: number; billingInterval: string };
type Billing = { subscription: { id: string; status: string; startsAt: string; currentPeriodEnd: string; trialDaysRemaining: number | null; packageName: string; packagePriceKobo: number; activeMemberLimit: number; adminAccountLimit: number; billingInterval: string } | null; trial: { status: "not_started" | "trialing" | "expired"; activatedAt: string | null; expiresAt: string | null; daysRemaining: number }; usage: { activeMembers: number; activeAdminAccounts: number }; payments: Array<{ id: string; amountKobo: number; status: string; paymentMode: "demo" | "paystack"; reference: string; createdAt: string; paidAt: string | null }>; paymentHistory: { page: number; pageSize: number; total: number; hasMore: boolean } };
type GymMembership = { id: string; name: string; email: string; status: string; roles: string[] };
type MembershipCursor = { before: string; beforeId: string } | null;
type GymInvitation = { id: string; email: string; status: string; expiresAt: string; createdAt: string; roles: string[] };
type GymReport = { totalCheckins: number; totalPaymentRecords: number; payments: { paidKobo: string; paidCount: number; pendingKobo: string; pendingCount: number }; checkins: Array<{ id: string; memberName: string; checkedInAt: string }>; paymentRows: Array<{ id: string; memberName: string; planName: string; amountKobo: number; status: string; paymentMode: "demo" | "paystack"; reference: string; createdAt: string; paidAt: string | null }>; pagination: { checkinPage: number; paymentPage: number; pageSize: number; checkinPages: number; paymentPages: number } };

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { ...init, headers: { "Content-Type": "application/json", ...init?.headers }, cache: "no-store" });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error ?? "The request failed.");
  return payload as T;
}

function toKobo(value: string): number {
  if (!/^\d+(?:\.\d{1,2})?$/.test(value)) throw new Error("Enter a valid Naira amount with up to two decimal places.");
  const [whole, fraction = ""] = value.split(".");
  const kobo = BigInt(whole) * BigInt(100) + BigInt((fraction + "00").slice(0, 2));
  if (kobo > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error("Amount is too large.");
  return Number(kobo);
}

export default function OwnerDashboard({ gymId }: { gymId: string }) {
  const [summary, setSummary] = useState<Summary | null>(null);
  const [plans, setPlans] = useState<GymPlan[]>([]);
  const [packages, setPackages] = useState<Package[]>([]);
  const [billing, setBilling] = useState<Billing | null>(null);
  const [memberships, setMemberships] = useState<GymMembership[]>([]);
  const [invitations, setInvitations] = useState<GymInvitation[]>([]);
  const [membershipCursor, setMembershipCursor] = useState<MembershipCursor>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [reportFrom, setReportFrom] = useState("");
  const [reportTo, setReportTo] = useState("");
  const [report, setReport] = useState<GymReport | null>(null);
  const [reportError, setReportError] = useState("");

  const refresh = useCallback(async () => {
    try {
      const [summaryData, planData, packageData, membershipData, invitationData, billingData] = await Promise.all([
        api<Summary>(`/api/gyms/${encodeURIComponent(gymId)}/owner-summary`),
        api<{ plans: GymPlan[] }>(`/api/gyms/${encodeURIComponent(gymId)}/plans`),
        api<{ packages: Package[] }>("/api/platform/public-packages"),
        api<{ memberships: GymMembership[]; nextCursor: MembershipCursor }>(`/api/gyms/${encodeURIComponent(gymId)}/memberships`),
        api<{ invitations: GymInvitation[] }>(`/api/gyms/${encodeURIComponent(gymId)}/invitations`),
        api<Billing>(`/api/gyms/${encodeURIComponent(gymId)}/platform-billing/checkout`),
      ]);
      setSummary(summaryData); setPlans(planData.plans); setPackages(packageData.packages); setMemberships(membershipData.memberships); setMembershipCursor(membershipData.nextCursor); setInvitations(invitationData.invitations); setBilling(billingData);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not load the gym dashboard."); }
  }, [gymId]);
  useEffect(() => { const timer = window.setTimeout(() => { void refresh(); }, 0); return () => window.clearTimeout(timer); }, [refresh]);

  async function loadReport(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setReportError(""); setBusy(true);
    try {
      const query = new URLSearchParams({ from: reportFrom, to: reportTo, checkinPage: "1", paymentPage: "1" });
      setReport(await api<GymReport>(`/api/gyms/${encodeURIComponent(gymId)}/reports?${query}`));
    } catch (cause) { setReportError(cause instanceof Error ? cause.message : "Could not load the report."); }
    finally { setBusy(false); }
  }

  async function changeReportPage(kind: "checkinPage" | "paymentPage", page: number) {
    if (!report || page < 1) return;
    setBusy(true); setReportError("");
    try {
      const query = new URLSearchParams({ from: reportFrom, to: reportTo, checkinPage: String(kind === "checkinPage" ? page : report.pagination.checkinPage), paymentPage: String(kind === "paymentPage" ? page : report.pagination.paymentPage) });
      setReport(await api<GymReport>(`/api/gyms/${encodeURIComponent(gymId)}/reports?${query}`));
    } catch (cause) { setReportError(cause instanceof Error ? cause.message : "Could not load the requested report page."); }
    finally { setBusy(false); }
  }

  async function loadOlderPlatformPayments() {
    if (!billing?.paymentHistory.hasMore) return;
    setBusy(true); setError("");
    try { setBilling(await api<Billing>(`/api/gyms/${encodeURIComponent(gymId)}/platform-billing/checkout?page=${billing.paymentHistory.page + 1}`)); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Could not load older FitPass payments."); }
    finally { setBusy(false); }
  }

  async function createPlan(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError(""); setNotice("");
    const form = new FormData(event.currentTarget);
    try {
      await api(`/api/gyms/${encodeURIComponent(gymId)}/plans`, { method: "POST", body: JSON.stringify({ name: form.get("name"), durationDays: Number(form.get("durationDays")), priceKobo: toKobo(String(form.get("priceNaira"))), description: form.get("description") }) });
      event.currentTarget.reset(); setNotice("Gym plan created."); await refresh();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not create the plan."); }
    finally { setBusy(false); }
  }

  async function updatePlan(event: FormEvent<HTMLFormElement>, plan: GymPlan) {
    event.preventDefault(); setBusy(true); setError(""); setNotice("");
    const form = new FormData(event.currentTarget);
    try {
      await api(`/api/gyms/${encodeURIComponent(gymId)}/plans/${encodeURIComponent(plan.id)}`, {
        method: "PATCH",
        body: JSON.stringify({
          name: form.get("name"),
          durationDays: Number(form.get("durationDays")),
          priceKobo: toKobo(String(form.get("priceNaira"))),
          description: String(form.get("description") ?? "").trim() || null,
          isActive: form.get("isActive") === "on",
        }),
      });
      setNotice(`${plan.name} plan settings saved.`); await refresh();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not update the gym plan."); }
    finally { setBusy(false); }
  }

  async function updateGymProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError(""); setNotice("");
    const form = new FormData(event.currentTarget);
    try {
      await api<{ gym: { name: string; slug: string } }>(`/api/gyms/${encodeURIComponent(gymId)}/settings`, {
        method: "PATCH",
        body: JSON.stringify({ name: form.get("gymName"), slug: form.get("gymSlug"), contactPhone: form.get("contactPhone"), contactEmail: form.get("contactEmail"), location: form.get("location"), maxDailyCheckins: Number(form.get("maxDailyCheckins")) }),
      });
      setNotice("Gym profile settings saved."); await refresh();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not update gym settings."); }
    finally { setBusy(false); }
  }

  async function updateGymImages(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError(""); setNotice("");
    try {
      const response = await fetch(`/api/gyms/${encodeURIComponent(gymId)}/images`, { method: "PATCH", body: new FormData(event.currentTarget), cache: "no-store" });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error ?? "Could not update gym images.");
      setNotice("Gym images updated."); event.currentTarget.reset(); await refresh();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not update gym images."); }
    finally { setBusy(false); }
  }

  async function invite(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError(""); setNotice("");
    const form = new FormData(event.currentTarget);
    const roles = ["gym_owner", "gym_desk_staff", "gym_member"].filter((role) => form.get(role) === "on");
    try {
      await api(`/api/gyms/${encodeURIComponent(gymId)}/invitations`, { method: "POST", body: JSON.stringify({ email: form.get("email"), roles }) });
      event.currentTarget.reset(); setNotice("Invitation sent. The invitee must verify this email address before accepting."); await refresh();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not send the invitation."); }
    finally { setBusy(false); }
  }

  async function revokeInvitation(invitation: GymInvitation) {
    if (!window.confirm(`Revoke the invitation sent to ${invitation.email}? The link will stop working.`)) return;
    setBusy(true); setError(""); setNotice("");
    try {
      await api(`/api/gyms/${encodeURIComponent(gymId)}/invitations/${encodeURIComponent(invitation.id)}`, { method: "DELETE" });
      setNotice(`Invitation for ${invitation.email} was revoked.`); await refresh();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not revoke this invitation."); }
    finally { setBusy(false); }
  }

  async function payForPackage(packageId: string) {
    setBusy(true); setError("");
    try {
      const result = await api<{ authorizationUrl?: string; demoUrl?: string; paymentMode?: string }>(`/api/gyms/${encodeURIComponent(gymId)}/platform-billing/checkout`, { method: "POST", body: JSON.stringify({ packageId }) });
      const destination = result.paymentMode === "demo" ? result.demoUrl : result.authorizationUrl;
      if (!destination) throw new Error("Billing did not return a checkout destination.");
      window.location.assign(destination);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not start FitPass billing."); setBusy(false); }
  }

  async function updateMembership(membership: GymMembership, action: "suspend" | "restore" | "revoke" | "remove-role", role?: string) {
    if (action === "revoke" && !window.confirm(`Revoke ${membership.name}'s gym membership? This cannot be undone.`)) return;
    if (action === "remove-role" && role === "gym_owner" && !window.confirm(`Remove ${membership.name}'s owner role? The last active owner cannot be removed.`)) return;
    setBusy(true); setError(""); setNotice("");
    try {
      const endpoint = action === "remove-role"
        ? `/api/gyms/${encodeURIComponent(gymId)}/memberships/${encodeURIComponent(membership.id)}/roles/${encodeURIComponent(role!)}`
        : `/api/gyms/${encodeURIComponent(gymId)}/memberships/${encodeURIComponent(membership.id)}`;
      await api(endpoint, action === "remove-role"
        ? { method: "DELETE" }
        : { method: "PATCH", body: JSON.stringify({ status: action === "restore" ? "active" : action === "suspend" ? "suspended" : "revoked" }) });
      setNotice(action === "remove-role" ? "Role removed." : `Gym membership ${action === "restore" ? "restored" : action === "revoke" ? "revoked" : "suspended"}.`);
      await refresh();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not update this gym membership."); }
    finally { setBusy(false); }
  }

  async function loadOlderMemberships() {
    if (!membershipCursor) return;
    setBusy(true); setError("");
    try {
      const query = new URLSearchParams(membershipCursor).toString();
      const result = await api<{ memberships: GymMembership[]; nextCursor: MembershipCursor }>(`/api/gyms/${encodeURIComponent(gymId)}/memberships?${query}`);
      setMemberships((current) => [...current, ...result.memberships]); setMembershipCursor(result.nextCursor);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not load more gym accounts."); }
    finally { setBusy(false); }
  }

  return <main className="mx-auto min-h-dvh w-full max-w-5xl space-y-8 overflow-x-clip px-4 py-8 sm:px-6">
    <header className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-200 pb-5"><div className="min-w-0"><p className="text-sm font-semibold uppercase tracking-wide text-primary">Gym owner</p><h1 className="mt-2 break-words font-heading text-2xl font-bold sm:text-3xl">{summary?.gym.name ?? "Gym dashboard"}</h1><p className="mt-2 text-base text-muted-foreground">Manage your gym plans, invitations, and FitPass package.</p></div><Link href="/dashboard" className="inline-flex min-h-11 shrink-0 items-center rounded-xl border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-700 hover:bg-slate-50">All workspaces</Link></header>
    {summary?.gym.status === "archived" && <p role="status" className="rounded-xl border bg-white p-4">This gym is archived. Historical information is available, but new sales, invitations, and check-ins are disabled.</p>}
    {error && <p role="alert" className="rounded-xl border border-danger bg-white p-4 text-danger">{error}</p>}
    {notice && <p role="status" className="rounded-xl border border-success bg-white p-4">{notice}</p>}
    {summary && <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{[
      ["Member profiles", summary.members, "All gym profiles"],
      ["Active memberships", summary.activeSubscriptions, "Valid right now"],
      ["New members", summary.newMembers, "Last 30 days"],
      ["Paid this month", formatNaira(BigInt(summary.monthIncomeKobo)), "Confirmed member payments"],
      ["Today’s check-ins", summary.checkins, "Benin City time"],
      ["Outstanding payments", `${summary.pendingPayments} · ${formatNaira(BigInt(summary.pendingPaymentsKobo))}`, "Pending confirmation"],
    ].map(([label, value, caption]) => <article key={String(label)} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-[0_3px_14px_rgba(15,23,42,0.04)]"><p className="text-sm text-slate-500">{label}</p><p className="mt-2 font-heading text-2xl font-bold text-slate-950">{value}</p><p className="mt-1 text-xs text-slate-500">{caption}</p></article>)}</section>}

    {summary && <section className="grid gap-5 xl:grid-cols-3">
      <article className="rounded-2xl border border-slate-200 bg-white p-5"><h2 className="font-heading text-lg font-bold">Today’s check-ins</h2>{summary.recentCheckins.length === 0 ? <p className="mt-4 rounded-xl bg-slate-50 p-4 text-sm text-slate-600">No visits recorded today.</p> : <ul className="mt-3 divide-y divide-slate-100">{summary.recentCheckins.map((item) => <li key={item.id} className="flex items-center justify-between gap-3 py-3"><span className="truncate text-sm font-semibold text-slate-800">{item.memberName}</span><time className="shrink-0 text-xs text-slate-500">{new Date(item.checkedInAt).toLocaleTimeString("en-NG", { hour: "2-digit", minute: "2-digit" })}</time></li>)}</ul>}</article>
      <article className="rounded-2xl border border-slate-200 bg-white p-5"><h2 className="font-heading text-lg font-bold">Expiring soon</h2><p className="mt-1 text-xs text-slate-500">Active plans ending in the next seven days</p>{summary.expiringMemberships.length === 0 ? <p className="mt-4 rounded-xl bg-slate-50 p-4 text-sm text-slate-600">No memberships are due to expire this week.</p> : <ul className="mt-3 divide-y divide-slate-100">{summary.expiringMemberships.map((item) => <li key={item.id} className="py-3"><div className="flex justify-between gap-3"><span className="truncate text-sm font-semibold text-slate-800">{item.memberName}</span><time className="shrink-0 text-xs text-amber-800">{new Date(item.expiresAt).toLocaleDateString("en-NG", { day: "numeric", month: "short" })}</time></div><p className="mt-1 text-xs text-slate-500">{item.planName}</p></li>)}</ul>}</article>
      <article className="rounded-2xl border border-slate-200 bg-white p-5"><h2 className="font-heading text-lg font-bold">Recent payments</h2>{summary.recentPayments.length === 0 ? <p className="mt-4 rounded-xl bg-slate-50 p-4 text-sm text-slate-600">No member payments recorded yet.</p> : <ul className="mt-3 divide-y divide-slate-100">{summary.recentPayments.map((item) => <li key={item.id} className="flex items-center justify-between gap-3 py-3"><div className="min-w-0"><p className="truncate text-sm font-semibold text-slate-800">{item.memberName}</p><p className="mt-1 truncate text-xs text-slate-500">{item.planName} · {item.status.replaceAll("_", " ")}{item.paymentMode === "demo" ? " · DEMO (no charge)" : ""}</p></div><span className="shrink-0 text-sm font-bold text-slate-900">{formatNaira(item.amountKobo)}</span></li>)}</ul>}</article>
    </section>}

    <MemberManagement gymId={gymId} />

    <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-[0_3px_14px_rgba(15,23,42,0.04)] sm:p-7">
      <div><p className="text-xs font-bold uppercase tracking-[0.16em] text-slate-500">Gym operations</p><h2 className="mt-2 font-heading text-2xl font-bold text-slate-950">Payments and visit reports</h2><p className="mt-1 text-sm text-slate-600">Filter confirmed and pending member payments and check-ins. FitPass package payments remain in the separate billing section.</p></div>
      <form onSubmit={(event) => void loadReport(event)} className="mt-5 grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
        <label className="grid gap-1.5 text-sm font-semibold text-slate-700">From<input type="date" required value={reportFrom} onChange={(event) => setReportFrom(event.target.value)} className="min-h-11 rounded-xl border border-slate-300 px-3" /></label>
        <label className="grid gap-1.5 text-sm font-semibold text-slate-700">To<input type="date" required value={reportTo} onChange={(event) => setReportTo(event.target.value)} className="min-h-11 rounded-xl border border-slate-300 px-3" /></label>
        <button disabled={busy || !reportFrom || !reportTo} className="min-h-11 rounded-xl bg-green-900 px-5 text-sm font-semibold text-white disabled:opacity-60">{busy ? "Loading…" : "Run report"}</button>
      </form>
      {reportError && <p role="alert" className="mt-4 rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">{reportError}</p>}
      {report && <>
        <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{[["Successful visits", report.totalCheckins], ["Confirmed payments", `${report.payments.paidCount} · ${formatNaira(BigInt(report.payments.paidKobo))}`], ["Pending confirmation", `${report.payments.pendingCount} · ${formatNaira(BigInt(report.payments.pendingKobo))}`], ["Payment records", report.paymentRows.length]].map(([label, value]) => <article key={String(label)} className="rounded-xl bg-slate-50 p-4"><p className="text-xs text-slate-500">{label}</p><p className="mt-1 font-semibold text-slate-950">{value}</p></article>)}</div>
        <div className="mt-6 grid gap-6 xl:grid-cols-2"><div><div className="flex items-center justify-between gap-2"><h3 className="font-semibold text-slate-950">Check-in history <span className="text-xs font-normal text-slate-500">({report.totalCheckins})</span></h3><div className="flex items-center gap-2"><button type="button" aria-label="Previous check-in page" disabled={busy || report.pagination.checkinPage <= 1} onClick={() => void changeReportPage("checkinPage", report.pagination.checkinPage - 1)} className="min-h-10 rounded-lg border px-3 disabled:opacity-40">Previous</button><span className="text-xs text-slate-500">{report.pagination.checkinPage}/{report.pagination.checkinPages}</span><button type="button" aria-label="Next check-in page" disabled={busy || report.pagination.checkinPage >= report.pagination.checkinPages} onClick={() => void changeReportPage("checkinPage", report.pagination.checkinPage + 1)} className="min-h-10 rounded-lg border px-3 disabled:opacity-40">Next</button></div></div>{report.checkins.length === 0 ? <p className="mt-3 rounded-xl bg-slate-50 p-4 text-sm text-slate-600">No check-ins in this date range.</p> : <div className="mt-3 max-h-80 overflow-auto rounded-xl border"><ul className="divide-y divide-slate-100">{report.checkins.map((item) => <li key={item.id} className="flex items-center justify-between gap-3 px-4 py-3 text-sm"><span className="truncate font-medium">{item.memberName}</span><time className="shrink-0 text-xs text-slate-500">{new Date(item.checkedInAt).toLocaleString("en-NG")}</time></li>)}</ul></div>}</div>
          <div><div className="flex items-center justify-between gap-2"><h3 className="font-semibold text-slate-950">Member payments <span className="text-xs font-normal text-slate-500">({report.totalPaymentRecords})</span></h3><div className="flex items-center gap-2"><button type="button" aria-label="Previous payment page" disabled={busy || report.pagination.paymentPage <= 1} onClick={() => void changeReportPage("paymentPage", report.pagination.paymentPage - 1)} className="min-h-10 rounded-lg border px-3 disabled:opacity-40">Previous</button><span className="text-xs text-slate-500">{report.pagination.paymentPage}/{report.pagination.paymentPages}</span><button type="button" aria-label="Next payment page" disabled={busy || report.pagination.paymentPage >= report.pagination.paymentPages} onClick={() => void changeReportPage("paymentPage", report.pagination.paymentPage + 1)} className="min-h-10 rounded-lg border px-3 disabled:opacity-40">Next</button></div></div>{report.paymentRows.length === 0 ? <p className="mt-3 rounded-xl bg-slate-50 p-4 text-sm text-slate-600">No member payments in this date range.</p> : <div className="mt-3 max-h-80 overflow-auto rounded-xl border"><ul className="divide-y divide-slate-100">{report.paymentRows.map((item) => <li key={item.id} className="flex items-center justify-between gap-3 px-4 py-3"><div className="min-w-0"><p className="truncate text-sm font-semibold">{item.memberName} · {item.planName}</p><p className="mt-1 truncate font-mono text-[11px] text-slate-500">{item.reference}</p><p className="text-xs capitalize text-slate-500">{item.status.replaceAll("_", " ")} · {new Date(item.paidAt ?? item.createdAt).toLocaleDateString("en-NG")}</p></div><span className="shrink-0 text-sm font-bold">{formatNaira(item.amountKobo)}</span></li>)}</ul></div>}</div></div>
      </>}
    </section>

    <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-[0_3px_14px_rgba(15,23,42,0.04)] sm:p-7">
      <div className="flex flex-wrap items-end justify-between gap-3"><div><p className="text-xs font-bold uppercase tracking-[0.16em] text-slate-500">Access management</p><h2 className="mt-2 font-heading text-2xl font-bold text-slate-950">Invitations</h2><p className="mt-1 text-sm text-slate-600">Review open and recent invitations. Links expire automatically and can be revoked.</p></div><span className="rounded-full bg-slate-100 px-3 py-1.5 text-xs font-semibold text-slate-700">{invitations.filter((item) => item.status === "pending").length} open</span></div>
      {invitations.length === 0 ? <p className="mt-5 rounded-xl bg-slate-50 p-5 text-sm text-slate-600">No invitations have been sent yet.</p> : <ul className="mt-4 divide-y divide-slate-100">{invitations.map((invitation) => <li key={invitation.id} className="flex flex-wrap items-center justify-between gap-3 py-4"><div className="min-w-0"><p className="truncate text-sm font-semibold text-slate-900">{invitation.email}</p><div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-500"><span>{invitation.roles.map((role) => role.replace("gym_", "").replaceAll("_", " ")).join(" · ") || "No role"}</span><span aria-hidden="true">·</span><span className="capitalize">{invitation.status.replaceAll("_", " ")}</span><span aria-hidden="true">·</span><span>Expires {new Date(invitation.expiresAt).toLocaleDateString("en-NG")}</span></div></div>{invitation.status === "pending" && <button type="button" disabled={busy} onClick={() => void revokeInvitation(invitation)} className="min-h-10 rounded-lg border border-rose-200 px-3 text-sm font-semibold text-rose-800 hover:bg-rose-50 disabled:opacity-60">Revoke invitation</button>}</li>)}</ul>}
    </section>

    <section className="grid gap-6 lg:grid-cols-2">
      <div className="rounded-xl border bg-white p-5"><h2 className="font-heading text-xl font-bold">Invite a gym account</h2><p className="mt-1 text-sm text-muted-foreground">A person may hold several roles on one account. Owners do not automatically get desk access.</p>
        <form className="mt-4 space-y-4" onSubmit={invite}><label className="grid gap-2 text-base">Email<input name="email" type="email" required maxLength={254} className="min-h-11 rounded-xl border px-3" /></label>
          <fieldset className="space-y-2"><legend className="text-base font-semibold">Roles to grant</legend>{[["gym_owner", "Gym owner"], ["gym_desk_staff", "Gym desk staff"], ["gym_member", "Gym member"]].map(([value, label]) => <label key={value} className="flex min-h-11 items-center gap-3 text-base"><input name={value} type="checkbox" className="size-5 accent-primary" />{label}</label>)}</fieldset>
          <button disabled={busy || summary?.gym.status === "archived"} className="min-h-11 w-full rounded-xl bg-primary px-5 font-semibold text-white disabled:opacity-60">Send verified-email invitation</button>
        </form>
      </div>
      <div className="rounded-xl border bg-white p-5"><h2 className="font-heading text-xl font-bold">Create a gym membership plan</h2><p className="mt-1 text-sm text-muted-foreground">Prices are stored as integer kobo. Existing plans are retained when their price changes.</p>
        <form className="mt-4 grid gap-4" onSubmit={createPlan}><label className="grid gap-2 text-base">Plan name<input name="name" required maxLength={80} className="min-h-11 rounded-xl border px-3" /></label><div className="grid gap-4 sm:grid-cols-2"><label className="grid gap-2 text-base">Duration (days)<input name="durationDays" type="number" min="1" max="3650" required className="min-h-11 rounded-xl border px-3" /></label><label className="grid gap-2 text-base">Price (naira)<input name="priceNaira" inputMode="decimal" placeholder="15000.00" required className="min-h-11 rounded-xl border px-3" /></label></div><label className="grid gap-2 text-base">Description<input name="description" maxLength={500} className="min-h-11 rounded-xl border px-3" /></label><button disabled={busy || summary?.gym.status === "archived"} className="min-h-11 rounded-xl bg-primary px-5 font-semibold text-white disabled:opacity-60">Create plan</button></form>
      </div>
    </section>

    <section className="space-y-4" aria-labelledby="membership-roster-heading">
      <div><h2 id="membership-roster-heading" className="font-heading text-2xl font-bold">Gym accounts</h2><p className="mt-1 text-sm text-muted-foreground">Manage people and roles for this gym. Each person keeps one account, even when they have more than one role.</p></div>
      {memberships.length === 0 ? <p className="rounded-xl border bg-white p-5 text-muted-foreground">No gym accounts yet. Send an invitation to get started.</p> : <ul className="grid gap-3 lg:grid-cols-2">{memberships.map((membership) => <li key={membership.id} className="rounded-xl border bg-white p-5">
        <div className="flex flex-wrap items-start justify-between gap-3"><div><h3 className="font-semibold">{membership.name}</h3><p className="text-sm text-muted-foreground">{membership.email}</p></div><span className="rounded-full bg-muted px-3 py-1 text-sm font-semibold capitalize">{membership.status}</span></div>
        <div className="mt-3 flex flex-wrap gap-2">{membership.roles.length ? membership.roles.map((role) => <span key={role} className="rounded-full bg-primary/10 px-3 py-1 text-sm font-medium text-primary">{role.replace("gym_", "").replaceAll("_", " ")}</span>) : <span className="text-sm text-muted-foreground">No active roles</span>}</div>
        {membership.status === "active" ? <div className="mt-4 flex flex-wrap gap-2">{membership.roles.map((role) => <button key={role} disabled={busy || summary?.gym.status === "archived"} onClick={() => void updateMembership(membership, "remove-role", role)} className="min-h-10 rounded-lg border px-3 text-sm font-semibold hover:bg-muted disabled:opacity-60">Remove {role.replace("gym_", "").replaceAll("_", " ")}</button>)}<button disabled={busy || summary?.gym.status === "archived"} onClick={() => void updateMembership(membership, "suspend")} className="min-h-10 rounded-lg border border-danger/40 px-3 text-sm font-semibold text-danger hover:bg-danger/5 disabled:opacity-60">Suspend access</button><button disabled={busy || summary?.gym.status === "archived"} onClick={() => void updateMembership(membership, "revoke")} className="min-h-10 rounded-lg px-3 text-sm font-semibold text-danger underline disabled:opacity-60">Revoke membership</button></div> : membership.status === "suspended" ? <button disabled={busy || summary?.gym.status === "archived"} onClick={() => void updateMembership(membership, "restore")} className="mt-4 min-h-10 rounded-lg border px-3 text-sm font-semibold hover:bg-muted disabled:opacity-60">Restore access</button> : null}
      </li>)}</ul>}
      {membershipCursor && <button disabled={busy} onClick={() => void loadOlderMemberships()} className="min-h-11 rounded-xl border px-4 font-semibold disabled:opacity-60">{busy ? "Loading accounts…" : "Load older accounts"}</button>}
    </section>

    <section className="space-y-3"><div><h2 className="font-heading text-xl font-bold">Gym plans</h2><p className="mt-1 text-sm text-muted-foreground">Deactivate a plan to stop new sales while preserving existing subscription and payment history.</p></div>{plans.length === 0 ? <p className="rounded-xl border bg-white p-5 text-muted-foreground">No plans have been configured for this gym.</p> : <ul className="grid gap-3 lg:grid-cols-2">{plans.map((plan) => <li key={plan.id} className="rounded-2xl border border-slate-200 bg-white p-5"><div className="flex items-start justify-between gap-3"><div><h3 className="font-heading text-lg font-bold text-slate-950">{plan.name}</h3><p className="mt-1 text-xl font-bold text-slate-900">{formatNaira(plan.priceKobo)}</p><p className="mt-1 text-sm text-slate-600">{plan.durationDays} days · {plan.isActive ? "Available for purchase" : "Inactive"}</p></div><span className={`rounded-full px-2.5 py-1 text-xs font-bold ${plan.isActive ? "bg-emerald-50 text-emerald-800" : "bg-slate-100 text-slate-600"}`}>{plan.isActive ? "Active" : "Inactive"}</span></div>{plan.description && <p className="mt-3 text-sm leading-6 text-slate-600">{plan.description}</p>}<details className="mt-4 border-t border-slate-100 pt-3"><summary className="min-h-10 cursor-pointer py-2 text-sm font-semibold text-slate-700">Edit plan</summary><form className="grid gap-3 pt-2 sm:grid-cols-2" onSubmit={(event) => void updatePlan(event, plan)}><label className="grid gap-1 text-xs font-semibold text-slate-600">Plan name<input name="name" required minLength={2} maxLength={80} defaultValue={plan.name} className="min-h-10 rounded-lg border px-3 text-sm font-normal" /></label><label className="grid gap-1 text-xs font-semibold text-slate-600">Price (naira)<input name="priceNaira" required defaultValue={(plan.priceKobo / 100).toFixed(2)} className="min-h-10 rounded-lg border px-3 text-sm font-normal" /></label><label className="grid gap-1 text-xs font-semibold text-slate-600">Duration (days)<input name="durationDays" type="number" min={1} max={3650} required defaultValue={plan.durationDays} className="min-h-10 rounded-lg border px-3 text-sm font-normal" /></label><label className="grid gap-1 text-xs font-semibold text-slate-600">Description<input name="description" maxLength={500} defaultValue={plan.description ?? ""} className="min-h-10 rounded-lg border px-3 text-sm font-normal" /></label><label className="flex min-h-10 items-center gap-2 text-sm text-slate-700 sm:col-span-2"><input name="isActive" type="checkbox" defaultChecked={plan.isActive} className="size-4 accent-green-600" />Available for new purchases</label><button disabled={busy || summary?.gym.status === "archived"} className="min-h-10 rounded-lg bg-green-900 px-4 text-sm font-semibold text-white disabled:opacity-60 sm:col-span-2">{busy ? "Saving…" : "Save plan"}</button></form></details></li>)}</ul>}</section>

    <section className="space-y-4"><div><h2 className="font-heading text-xl font-bold">FitPass subscription</h2><p className="text-base text-muted-foreground">This subscription pays FitPass for the gym platform and is separate from gym-member payments.</p></div>{billing?.trial.status === "trialing" && <div role="status" className="rounded-xl border border-green-300 bg-green-50 p-4 text-sm text-green-950"><p className="font-bold">Your 30-day FitPass trial is active</p><p className="mt-1">{billing.trial.daysRemaining} {billing.trial.daysRemaining === 1 ? "day" : "days"} remaining · trial ends {billing.trial.expiresAt ? new Date(billing.trial.expiresAt).toLocaleDateString("en-NG") : ""}.</p><p className="mt-1">Choose a package below when you are ready to subscribe. Your trial remains active until payment is verified.</p></div>}{billing?.trial.status === "expired" && billing.subscription?.status !== "active" && <div role="alert" className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950"><p className="font-bold">Your FitPass trial has expired</p><p className="mt-1">Gym records remain saved. Choose a package below to restore full operational access; the change takes effect after payment is verified.</p></div>}{billing?.subscription ? <article className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-6"><div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-xs font-bold uppercase tracking-wide text-slate-500">Current package</p><h3 className="mt-1 font-heading text-xl font-bold text-slate-950">{billing.subscription.packageName}</h3><p className="mt-1 text-sm text-slate-600">{formatNaira(billing.subscription.packagePriceKobo)} / {billing.subscription.billingInterval} · {billing.subscription.status.replaceAll("_", " ")}</p></div><span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700">{billing.subscription.status === "trialing" ? "Trial ends" : "Renews"} {new Date(billing.subscription.currentPeriodEnd).toLocaleDateString("en-NG")}</span></div><div className="mt-5 grid gap-4 sm:grid-cols-2"><div><div className="flex justify-between text-xs"><span>Active gym members</span><span>{billing.usage.activeMembers} / {billing.subscription.activeMemberLimit}</span></div><div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-green-500" style={{ width: `${Math.min(100, billing.usage.activeMembers / billing.subscription.activeMemberLimit * 100)}%` }} /></div></div><div><div className="flex justify-between text-xs"><span>Administrative accounts</span><span>{billing.usage.activeAdminAccounts} / {billing.subscription.adminAccountLimit}</span></div><div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-slate-800" style={{ width: `${Math.min(100, billing.usage.activeAdminAccounts / billing.subscription.adminAccountLimit * 100)}%` }} /></div></div></div></article> : <p className="rounded-xl border border-dashed bg-white p-5 text-sm text-slate-600">No FitPass subscription is recorded yet.</p>}{packages.map((item) => <article key={item.id} className="flex flex-wrap items-center justify-between gap-4 rounded-xl border bg-white p-5"><div><h3 className="font-semibold">{item.name}</h3><p className="mt-1 text-lg font-bold">{formatNaira(item.priceKobo)} / {item.billingInterval}</p><p className="text-sm text-muted-foreground">{item.activeMemberLimit.toLocaleString()} active members · {item.adminAccountLimit} administrative accounts</p></div><button disabled={busy || summary?.gym.status !== "active"} onClick={() => void payForPackage(item.id)} className="min-h-11 rounded-xl bg-accent px-5 font-semibold text-accent-foreground disabled:opacity-60">{billing?.subscription ? "Change / renew package" : "Choose package"}</button></article>)}{billing && <article className="rounded-2xl border border-slate-200 bg-white p-5"><h3 className="font-semibold">FitPass payment history</h3>{billing.payments.length === 0 ? <p className="mt-3 text-sm text-slate-600">No FitPass payments recorded yet.</p> : <ul className="mt-2 divide-y divide-slate-100">{billing.payments.map((payment) => <li key={payment.id} className="flex flex-wrap items-center justify-between gap-2 py-3"><div><p className="font-mono text-xs text-slate-600">{payment.reference}</p><p className="text-xs text-slate-500">{new Date(payment.paidAt ?? payment.createdAt).toLocaleDateString("en-NG")}</p></div><div className="text-right"><p className="text-sm font-semibold">{formatNaira(payment.amountKobo)}</p><span className="text-xs capitalize text-slate-500">{payment.status}{payment.paymentMode === "demo" ? " · DEMO" : ""}</span></div></li>)}</ul>}{billing.paymentHistory.hasMore && <button type="button" disabled={busy} onClick={() => void loadOlderPlatformPayments()} className="mt-3 min-h-10 rounded-lg border px-3 text-sm font-semibold disabled:opacity-50">{busy ? "Loading…" : `Load older FitPass payments (${billing.payments.length} of ${billing.paymentHistory.total})`}</button>}</article>}</section>

    <section className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-6"><div><p className="text-xs font-bold uppercase tracking-[0.15em] text-slate-500">Gym profile</p><h2 className="mt-2 font-heading text-xl font-bold text-slate-950">Identity and contact</h2><p className="mt-1 text-sm text-slate-600">Manage the gym name, unique URL, contact details, location, and daily visit policy shown to members and staff.</p></div><form className="mt-5 grid gap-4 sm:grid-cols-2" onSubmit={updateGymProfile}><label className="grid gap-1.5 text-sm font-semibold text-slate-700">Gym name<input name="gymName" required minLength={2} maxLength={120} defaultValue={summary?.gym.name ?? ""} className="min-h-11 rounded-xl border border-slate-300 px-3 font-normal" /></label><label className="grid gap-1.5 text-sm font-semibold text-slate-700">Gym URL slug<input name="gymSlug" required pattern="[a-z0-9]+(-[a-z0-9]+)*" minLength={3} maxLength={80} defaultValue={summary?.gym.slug ?? ""} className="min-h-11 rounded-xl border border-slate-300 px-3 font-normal" /></label><label className="grid gap-1.5 text-sm font-semibold text-slate-700">Contact phone<input name="contactPhone" type="tel" maxLength={40} defaultValue={summary?.gym.contactPhone ?? ""} className="min-h-11 rounded-xl border border-slate-300 px-3 font-normal" /></label><label className="grid gap-1.5 text-sm font-semibold text-slate-700">Contact email<input name="contactEmail" type="email" maxLength={254} defaultValue={summary?.gym.contactEmail ?? ""} className="min-h-11 rounded-xl border border-slate-300 px-3 font-normal" /></label><label className="grid gap-1.5 text-sm font-semibold text-slate-700 sm:col-span-2">Gym location<input name="location" maxLength={240} defaultValue={summary?.gym.location ?? ""} placeholder="Area and street, Benin City" className="min-h-11 rounded-xl border border-slate-300 px-3 font-normal" /></label><label className="grid gap-1.5 text-sm font-semibold text-slate-700">Daily check-in limit per member<input name="maxDailyCheckins" type="number" min={1} max={20} step={1} required defaultValue={summary?.gym.maxDailyCheckins ?? 1} className="min-h-11 rounded-xl border border-slate-300 px-3 font-normal" /><span className="text-xs font-normal text-slate-500">Between 1 and 20 visits per Lagos calendar day.</span></label><button disabled={busy || !summary || summary.gym.status !== "active"} className="min-h-11 self-end rounded-xl bg-green-900 px-4 font-semibold text-white disabled:opacity-60">{busy ? "Saving…" : "Save gym profile"}</button></form><div className="mt-6 border-t border-slate-200 pt-5"><h3 className="font-semibold text-slate-900">Public profile images</h3><p className="mt-1 text-sm text-slate-600">JPEG, PNG or WebP up to 1.25 MB each. Replacing an image removes the previous stored copy.</p><div className="my-4 flex flex-wrap gap-3">{summary?.gym.logoUrl && <Image src={summary.gym.logoUrl} alt="Current gym logo" width={80} height={80} unoptimized className="size-20 rounded-xl border object-cover" />}{summary?.gym.facilityPhotoUrls.map((url, index) => <Image key={url} src={url} alt={`Current gym facility photo ${index + 1}`} width={128} height={80} unoptimized className="h-20 w-32 rounded-xl border object-cover" />)}</div><form onSubmit={updateGymImages} className="grid gap-3 sm:grid-cols-2"><label className="grid gap-1.5 text-sm font-semibold text-slate-700">Replace logo<input name="logo" type="file" accept="image/jpeg,image/png,image/webp" className="min-h-11 rounded-xl border px-2 py-2 text-sm font-normal" /></label><label className="grid gap-1.5 text-sm font-semibold text-slate-700 sm:col-span-2">Replace both facility photos<input name="facilityPhotos" type="file" accept="image/jpeg,image/png,image/webp" multiple className="min-h-11 rounded-xl border px-2 py-2 text-sm font-normal" /><span className="text-xs font-normal text-slate-500">Select exactly two images to replace the current facility photos.</span></label><button disabled={busy || !summary || summary.gym.status !== "active"} className="min-h-11 rounded-xl border border-slate-300 px-4 text-sm font-semibold text-slate-800 disabled:opacity-60 sm:col-span-2">{busy ? "Uploading…" : "Save images"}</button></form></div></section>
  </main>;
}
