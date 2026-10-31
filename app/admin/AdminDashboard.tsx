"use client";

import { useCallback, useEffect, useState, type FormEvent, type ReactNode } from "react";
import Image from "next/image";
import {
  Activity, Bell, Building2, Check, ChevronDown,
  ChevronRight, CircleDollarSign, ClipboardCheck, CreditCard, Dumbbell,
  FileBarChart2, LayoutDashboard, Menu, PackageCheck, Search, Settings2,
  ShieldCheck, Users, X,
} from "lucide-react";
import { formatNaira } from "@/lib/money";

type Application = { id: string; gymName: string; requestedSlug: string; applicantName: string; applicantEmail: string; phone?: string | null; location: string | null; logoUrl?: string | null; facilityPhotoUrls?: string[]; preferredPackageId?: string | null; createdAt: string; status?: string; reviewNote?: string | null; reviewedAt?: string | null };
type Gym = { id: string; name: string; slug: string; status: string; createdAt?: string };
type GymDetails = { gym: Gym & { contactPhone: string | null; contactEmail: string | null; location: string | null; maxDailyCheckins: number; latitude: number | null; longitude: number | null; locationSource: string | null; locationVerifiedAt: string | null; logoUrl?: string | null; facilityPhotoUrls?: string[]; archivedAt: string | null; suspendedAt: string | null }; counts: { accounts: number; activeMembers: number; activeAdminAccounts: number }; owners: Array<{ name: string; email: string; membershipStatus: string; createdAt: string }>; subscription: { id: string; status: string; packageName: string; priceKobo: number; billingInterval: string; currentPeriodEnd: string } | null; activity: Array<{ action: string; actorLabel: string; createdAt: string }> };
type Package = { id: string; name: string; priceKobo: number; billingInterval: string; activeMemberLimit: number; adminAccountLimit: number; isActive: boolean; features: Record<string, boolean> };
type PlatformSubscription = { id: string; gymId: string; gymName: string; packageName: string; status: string; currentPeriodEnd: string; billedPriceKobo: number; billingInterval: string };
type PlatformPayment = { id: string; gymName: string; reference: string; amountKobo: number; currency: string; status: string; paymentMode: "demo" | "paystack"; createdAt: string; paidAt: string | null; paystackTransactionId: string | null };
type ActivityEntry = { id: string; gymName: string | null; actorLabel: string; action: string; subjectType: string; subjectId: string | null; createdAt: string };
type PlatformAdmin = { userId: string; name: string; email: string; createdAt: string; suspendedAt: string | null; isCurrentUser: boolean };
type Overview = {
  metrics: { totalGyms: number; activeGyms: number; suspendedGyms: number; archivedGyms: number; pendingApplications: number; activeMembers: number; activePlatformSubscriptions: number; activeTrials: number; trialsExpiringSoon: number; overduePlatformSubscriptions: number; monthlyRecurringRevenueKobo: string; outstandingPayments: number; outstandingPaymentsKobo: string };
  trends: Array<{ month: string; label: string; revenueKobo: string; gyms: number }>;
  reportPeriod: { from: string; to: string };
  recentApplications: Application[];
  recentGyms: Gym[];
  recentSubscriptions: Array<{ id: string; gymName: string; packageName: string; status: string; currentPeriodEnd: string; priceKobo: number; billingInterval: string }>;
  recentPayments: Array<{ id: string; gymName: string; amountKobo: number; currency: string; status: string; paymentMode: "demo" | "paystack"; createdAt: string; paidAt: string | null }>;
  activity: Array<{ id: string; actorLabel: string; action: string; subjectType: string; createdAt: string }>;
  packages: Package[];
};

const navigation = [
  { label: "Overview", href: "#overview", icon: LayoutDashboard },
  { label: "Gyms", href: "#gyms", icon: Building2 },
  { label: "Applications", href: "#applications", icon: ClipboardCheck },
  { label: "Platform subscriptions", href: "#subscriptions", icon: CreditCard },
  { label: "Pricing packages", href: "#packages", icon: PackageCheck },
  { label: "Payments", href: "#payments", icon: CircleDollarSign },
  { label: "Reports", href: "#reports", icon: FileBarChart2 },
  { label: "Activity logs", href: "#activity", icon: Activity },
  { label: "Settings", href: "#settings", icon: Settings2 },
];

async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { ...init, headers: { "Content-Type": "application/json", ...init?.headers }, cache: "no-store" });
  const result = await response.json().catch(() => ({})) as { error?: string } & T;
  if (!response.ok) throw new Error(result.error ?? "The request failed.");
  return result;
}

function MetricCard({ title, value, caption, icon: Icon, tone = "lime" }: { title: string; value: string | number; caption: string; icon: typeof Building2; tone?: "lime" | "slate" }) {
  return <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-[0_2px_8px_rgba(16,24,40,0.04)] sm:p-6">
    <div className="flex items-start justify-between gap-3"><p className="text-sm font-medium text-slate-500">{title}</p><span className={`grid size-10 place-items-center rounded-xl ${tone === "lime" ? "bg-green-100 text-slate-950" : "bg-slate-100 text-slate-700"}`}><Icon size={19} aria-hidden="true" /></span></div>
    <p className="mt-5 font-heading text-3xl font-bold tracking-tight text-slate-950">{value}</p><p className="mt-1 text-xs text-slate-500">{caption}</p>
  </article>;
}

function Panel({ title, action, children, id, hidden = false }: { title: string; action?: ReactNode; children: ReactNode; id?: string; hidden?: boolean }) {
  return <section id={id} hidden={hidden} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-[0_2px_8px_rgba(16,24,40,0.04)] sm:p-6"><div className="mb-5 flex flex-wrap items-center justify-between gap-3"><h2 className="font-heading text-lg font-bold text-slate-950">{title}</h2>{action}</div>{children}</section>;
}

function RevenueChart({ points }: { points: Overview["trends"] }) {
  const values = points.map((point) => Number(BigInt(point.revenueKobo)) / 100);
  const max = Math.max(1, ...values);
  const coords = values.map((value, index) => `${points.length < 2 ? 50 : (index / (points.length - 1)) * 100},${92 - (value / max) * 78}`);
  return <div aria-label="Platform payment revenue by month" role="img">
    <div className="mb-4 flex items-end justify-between"><div><p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Paid platform payments</p><p className="mt-1 text-xs text-slate-400">Monthly totals · NGN</p></div><span className="rounded-full bg-green-100 px-2.5 py-1 text-xs font-semibold text-slate-800">{points.length} months</span></div>
    <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="h-44 w-full overflow-visible" aria-hidden="true">
      {[20, 42, 64, 86].map((y) => <line key={y} x1="0" x2="100" y1={y} y2={y} stroke="#e2e8f0" strokeDasharray="1.5 2" strokeWidth="0.6" />)}
      {coords.length > 1 && <polyline points={coords.join(" ")} fill="none" stroke="#65a30d" strokeWidth="2.5" vectorEffect="non-scaling-stroke" strokeLinecap="round" strokeLinejoin="round" />}
      {coords.map((point, index) => { const [cx, cy] = point.split(","); return <circle key={points[index].month} cx={cx} cy={cy} r="1.6" fill="#65a30d" stroke="white" strokeWidth="0.8" vectorEffect="non-scaling-stroke" />; })}
    </svg>
    <div className="mt-2 grid text-center text-[10px] text-slate-500 sm:text-xs" style={{ gridTemplateColumns: `repeat(${points.length}, minmax(0, 1fr))` }}>{points.map((point) => <span key={point.month} className="truncate">{point.label}</span>)}</div>
  </div>;
}

function GrowthChart({ points }: { points: Overview["trends"] }) {
  const values = points.map((point) => point.gyms);
  const max = Math.max(1, ...values);
  const coords = values.map((value, index) => `${points.length < 2 ? 50 : (index / (points.length - 1)) * 100},${92 - (value / max) * 78}`);
  return <div aria-label="New gym registrations by month" role="img">
    <div className="mb-4 flex items-end justify-between"><div><p className="text-xs font-semibold uppercase tracking-wider text-slate-500">New gym registrations</p><p className="mt-1 text-xs text-slate-400">Created gyms · monthly</p></div><span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-700">{points.length} months</span></div>
    <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="h-44 w-full overflow-visible" aria-hidden="true">
      {[20, 42, 64, 86].map((y) => <line key={y} x1="0" x2="100" y1={y} y2={y} stroke="#e2e8f0" strokeDasharray="1.5 2" strokeWidth="0.6" />)}
      {coords.length > 1 && <polyline points={coords.join(" ")} fill="none" stroke="#334155" strokeWidth="2.5" vectorEffect="non-scaling-stroke" strokeLinecap="round" strokeLinejoin="round" />}
      {coords.map((point, index) => { const [cx, cy] = point.split(","); return <circle key={points[index].month} cx={cx} cy={cy} r="1.6" fill="#334155" stroke="white" strokeWidth="0.8" vectorEffect="non-scaling-stroke" />; })}
    </svg>
    <div className="mt-2 grid text-center text-[10px] text-slate-500 sm:text-xs" style={{ gridTemplateColumns: `repeat(${points.length}, minmax(0, 1fr))` }}>{points.map((point) => <span key={point.month} className="truncate">{point.label}</span>)}</div>
  </div>;
}

function dateLabel(value: string) { return new Intl.DateTimeFormat("en-NG", { dateStyle: "medium" }).format(new Date(value)); }

export default function AdminDashboard() {
  const [data, setData] = useState<Overview | null>(null);
  const [applications, setApplications] = useState<Application[]>([]);
  const [gyms, setGyms] = useState<Gym[]>([]);
  const [gymHasMore, setGymHasMore] = useState(false);
  const [selectedGym, setSelectedGym] = useState<GymDetails | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [resendApprovedOwner, setResendApprovedOwner] = useState<{ gymId: string; email: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [activeSection, setActiveSection] = useState("overview");
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [gymPage, setGymPage] = useState(1);
  const [gymStatus, setGymStatus] = useState("all");
  const [applicationStatus, setApplicationStatus] = useState("pending");
  const [applicationPage, setApplicationPage] = useState(1);
  const [applicationHasMore, setApplicationHasMore] = useState(false);
  const [applicationPackageChoices, setApplicationPackageChoices] = useState<Record<string, string>>({});
  const [paymentStatus, setPaymentStatus] = useState("all");
  const [gymApplicationsEnabled, setGymApplicationsEnabled] = useState(true);
  const [subscriptions, setSubscriptions] = useState<PlatformSubscription[]>([]);
  const [subscriptionPage, setSubscriptionPage] = useState(1);
  const [subscriptionHasMore, setSubscriptionHasMore] = useState(false);
  const [subscriptionStatus, setSubscriptionStatus] = useState("all");
  const [platformPayments, setPlatformPayments] = useState<PlatformPayment[]>([]);
  const [paymentPage, setPaymentPage] = useState(1);
  const [paymentHasMore, setPaymentHasMore] = useState(false);
  const [activity, setActivity] = useState<ActivityEntry[]>([]);
  const [activityPage, setActivityPage] = useState(1);
  const [activityHasMore, setActivityHasMore] = useState(false);
  const [platformAdmins, setPlatformAdmins] = useState<PlatformAdmin[]>([]);
  const [reportFrom, setReportFrom] = useState("");
  const [reportTo, setReportTo] = useState("");
  const [appliedFrom, setAppliedFrom] = useState("");
  const [appliedTo, setAppliedTo] = useState("");
  const [exportType, setExportType] = useState("revenue");
  const [exportStatus, setExportStatus] = useState("all");

  const refresh = useCallback(async () => {
    setError("");
    try {
      const gymQuery = new URLSearchParams({ search: debouncedSearch, status: gymStatus, page: "1", pageSize: "20" });
      const applicationQuery = new URLSearchParams({ search: debouncedSearch, status: applicationStatus, page: "1", pageSize: "20" });
      const subscriptionQuery = new URLSearchParams({ search: debouncedSearch, status: subscriptionStatus, page: "1", pageSize: "20" });
      const paymentQuery = new URLSearchParams({ search: debouncedSearch, status: paymentStatus, page: "1", pageSize: "20" });
      const activityQuery = new URLSearchParams({ search: debouncedSearch, page: "1", pageSize: "20" });
      const overviewQuery = new URLSearchParams(); if (appliedFrom && appliedTo) { overviewQuery.set("from", appliedFrom); overviewQuery.set("to", appliedTo); }
      const [overview, applicationData, gymData, settings, subscriptionData, paymentData, activityData, adminData] = await Promise.all([
        requestJson<Overview>(`/api/platform/overview${overviewQuery.size ? `?${overviewQuery}` : ""}`),
        requestJson<{ applications: Application[]; hasMore: boolean }>(`/api/platform/applications?${applicationQuery}`),
        requestJson<{ gyms: Gym[]; hasMore: boolean }>(`/api/platform/gyms?${gymQuery}`),
        requestJson<{ gymApplicationsEnabled: boolean }>("/api/platform/settings"),
        requestJson<{ subscriptions: PlatformSubscription[]; hasMore: boolean }>(`/api/platform/subscriptions?${subscriptionQuery}`),
        requestJson<{ payments: PlatformPayment[]; hasMore: boolean }>(`/api/platform/payments?${paymentQuery}`),
        requestJson<{ events: ActivityEntry[]; hasMore: boolean }>(`/api/platform/activity?${activityQuery}`),
        requestJson<{ admins: PlatformAdmin[]; activeCount: number; activeLimit: number }>("/api/platform/admins"),
      ]);
      setData(overview); setApplications(applicationData.applications); setApplicationHasMore(applicationData.hasMore); setApplicationPage(1); setGyms(gymData.gyms); setGymHasMore(gymData.hasMore); setGymPage(1);
      setGymApplicationsEnabled(settings.gymApplicationsEnabled);
      setSubscriptions(subscriptionData.subscriptions); setSubscriptionHasMore(subscriptionData.hasMore); setSubscriptionPage(1);
      setPlatformPayments(paymentData.payments); setPaymentHasMore(paymentData.hasMore); setPaymentPage(1);
      setActivity(activityData.events); setActivityHasMore(activityData.hasMore); setActivityPage(1);
      setPlatformAdmins(adminData.admins);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not load platform data."); }
    finally { setLoading(false); }
  }, [applicationStatus, appliedFrom, appliedTo, debouncedSearch, gymStatus, paymentStatus, subscriptionStatus]);

  useEffect(() => { const timer = window.setTimeout(() => { void refresh(); }, 0); return () => window.clearTimeout(timer); }, [refresh]);
  useEffect(() => { const timer = window.setTimeout(() => setDebouncedSearch(search.trim()), 250); return () => window.clearTimeout(timer); }, [search]);

  async function createGym(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError(""); setNotice("");
    const form = new FormData(event.currentTarget);
    try {
      await requestJson("/api/platform/gyms", { method: "POST", body: JSON.stringify({ name: form.get("name"), slug: form.get("slug"), firstOwnerEmail: form.get("email"), preferredPackageId: form.get("preferredPackageId") }) });
      setNotice("Gym created and the first owner invitation was sent."); event.currentTarget.reset(); await refresh();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not create the gym."); }
    finally { setBusy(false); }
  }

  async function review(application: Application, decision: "approve" | "reject") {
    let reviewNote: string | undefined;
    if (decision === "reject") {
      const reason = window.prompt(`Reason for rejecting ${application.gymName}'s application:`);
      if (reason === null) return;
      reviewNote = reason.trim();
      if (reviewNote.length < 3) { setError("Enter a rejection reason of at least three characters."); return; }
    }
    const storedPackageIsActive = Boolean(application.preferredPackageId && data?.packages.some((item) => item.id === application.preferredPackageId && item.isActive));
    const preferredPackageId = storedPackageIsActive ? application.preferredPackageId : applicationPackageChoices[application.id];
    if (decision === "approve" && !preferredPackageId) { setError("Choose a FitPass package before approving this application."); return; }
    setBusy(true); setError(""); setNotice("");
    try {
      const result = await requestJson<{ decision: "approve" | "reject"; gym?: { id: string }; invitationEmailSent?: boolean; message?: string }>(`/api/platform/applications/${application.id}`, { method: "PATCH", body: JSON.stringify({ decision, reviewNote, slug: application.requestedSlug, preferredPackageId }) });
      if (decision === "approve" && result.decision === "approve" && result.invitationEmailSent === false && result.gym) {
        setNotice("Gym approved. Invitation email failed. Resend invitation.");
        setResendApprovedOwner({ gymId: result.gym.id, email: application.applicantEmail });
      } else {
        setNotice(decision === "approve" ? `Approved ${application.gymName}; its owner invitation was sent.` : `Rejected ${application.gymName}'s application.`);
        setResendApprovedOwner(null);
      }
      await refresh();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not review the application."); }
    finally { setBusy(false); }
  }

  async function resendApprovedInvitation() {
    if (!resendApprovedOwner) return;
    setBusy(true); setError("");
    try {
      await requestJson(`/api/platform/gyms/${encodeURIComponent(resendApprovedOwner.gymId)}/first-owner-invitation`, { method: "POST", body: JSON.stringify({ email: resendApprovedOwner.email }) });
      setNotice("Gym approved and the owner invitation was sent."); setResendApprovedOwner(null); await refresh();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Invitation resend failed. The gym remains approved; retry the invitation."); }
    finally { setBusy(false); }
  }

  async function loadMoreGyms() {
    const nextPage = gymPage + 1;
    setBusy(true); setError("");
    try {
      const query = new URLSearchParams({ search: debouncedSearch, status: gymStatus, page: String(nextPage), pageSize: "20" });
      const result = await requestJson<{ gyms: Gym[]; hasMore: boolean }>(`/api/platform/gyms?${query}`);
      setGyms((current) => [...current, ...result.gyms]); setGymHasMore(result.hasMore); setGymPage(nextPage);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not load more gyms."); }
    finally { setBusy(false); }
  }

  async function loadMoreApplications() {
    const nextPage = applicationPage + 1;
    setBusy(true); setError("");
    try {
      const query = new URLSearchParams({ search: debouncedSearch, status: applicationStatus, page: String(nextPage), pageSize: "20" });
      const result = await requestJson<{ applications: Application[]; hasMore: boolean }>(`/api/platform/applications?${query}`);
      setApplications((current) => [...current, ...result.applications]); setApplicationHasMore(result.hasMore); setApplicationPage(nextPage);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not load more applications."); }
    finally { setBusy(false); }
  }

  async function loadMoreSubscriptions() {
    const nextPage = subscriptionPage + 1;
    setBusy(true); setError("");
    try {
      const query = new URLSearchParams({ search: debouncedSearch, status: subscriptionStatus, page: String(nextPage), pageSize: "20" });
      const result = await requestJson<{ subscriptions: PlatformSubscription[]; hasMore: boolean }>(`/api/platform/subscriptions?${query}`);
      setSubscriptions((current) => [...current, ...result.subscriptions]); setSubscriptionHasMore(result.hasMore); setSubscriptionPage(nextPage);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not load more subscriptions."); }
    finally { setBusy(false); }
  }

  async function loadMorePayments() {
    const nextPage = paymentPage + 1;
    setBusy(true); setError("");
    try {
      const query = new URLSearchParams({ search: debouncedSearch, status: paymentStatus, page: String(nextPage), pageSize: "20" });
      const result = await requestJson<{ payments: PlatformPayment[]; hasMore: boolean }>(`/api/platform/payments?${query}`);
      setPlatformPayments((current) => [...current, ...result.payments]); setPaymentHasMore(result.hasMore); setPaymentPage(nextPage);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not load more payments."); }
    finally { setBusy(false); }
  }

  async function loadMoreActivity() {
    const nextPage = activityPage + 1;
    setBusy(true); setError("");
    try {
      const query = new URLSearchParams({ search: debouncedSearch, page: String(nextPage), pageSize: "20" });
      const result = await requestJson<{ events: ActivityEntry[]; hasMore: boolean }>(`/api/platform/activity?${query}`);
      setActivity((current) => [...current, ...result.events]); setActivityHasMore(result.hasMore); setActivityPage(nextPage);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not load more activity."); }
    finally { setBusy(false); }
  }

  async function openGymDetails(gym: Gym) {
    setDetailLoading(true); setError("");
    try { setSelectedGym(await requestJson<GymDetails>(`/api/platform/gyms/${encodeURIComponent(gym.id)}`)); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Could not load gym details."); }
    finally { setDetailLoading(false); }
  }

  async function saveGymDetails(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedGym) return;
    setBusy(true); setError(""); setNotice("");
    const form = new FormData(event.currentTarget);
    try {
      const latitudeInput = String(form.get("latitude") ?? "").trim();
      const longitudeInput = String(form.get("longitude") ?? "").trim();
      const coordinateSource = String(form.get("locationSource") ?? "").trim();
      await requestJson(`/api/platform/gyms/${encodeURIComponent(selectedGym.gym.id)}`, { method: "PATCH", body: JSON.stringify({ name: form.get("name"), slug: form.get("slug"), status: form.get("status"), latitude: latitudeInput ? Number(latitudeInput) : null, longitude: longitudeInput ? Number(longitudeInput) : null, locationSource: coordinateSource || null, maxDailyCheckins: Number(form.get("maxDailyCheckins")) }) });
      setNotice(`${selectedGym.gym.name} settings saved.`); setSelectedGym(null); await refresh();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not save gym settings."); }
    finally { setBusy(false); }
  }

  async function sendFirstOwnerInvitation(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedGym) return;
    setBusy(true); setError(""); setNotice("");
    const form = new FormData(event.currentTarget);
    try {
      await requestJson(`/api/platform/gyms/${encodeURIComponent(selectedGym.gym.id)}/first-owner-invitation`, { method: "POST", body: JSON.stringify({ email: form.get("ownerEmail"), preferredPackageId: form.get("preferredPackageId") || undefined }) });
      setNotice("The verified-email first-owner invitation was sent.");
      await openGymDetails(selectedGym.gym);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not send the owner invitation."); }
    finally { setBusy(false); }
  }

  async function updateApplicationIntake(enabled: boolean) {
    setBusy(true); setError(""); setNotice("");
    try {
      const result = await requestJson<{ gymApplicationsEnabled: boolean }>("/api/platform/settings", { method: "PATCH", body: JSON.stringify({ gymApplicationsEnabled: enabled }) });
      setGymApplicationsEnabled(result.gymApplicationsEnabled);
      setNotice(result.gymApplicationsEnabled ? "Gym application intake is open." : "Gym application intake is closed.");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not update platform settings."); }
    finally { setBusy(false); }
  }

  async function applyReportPeriod(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!reportFrom || !reportTo || reportFrom > reportTo) { setError("Choose a valid report start and end date."); return; }
    setError(""); setAppliedFrom(reportFrom); setAppliedTo(reportTo);
  }

  async function grantPlatformAdmin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError(""); setNotice("");
    const form = new FormData(event.currentTarget);
    try {
      const result = await requestJson<{ admin: PlatformAdmin }>("/api/platform/admins", { method: "POST", body: JSON.stringify({ email: form.get("email") }) });
      setNotice(`${result.admin.email} now has platform administrator access.`); event.currentTarget.reset();
      setPlatformAdmins((current) => [...current, result.admin]);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not grant administrator access."); }
    finally { setBusy(false); }
  }

  async function revokePlatformAdmin(admin: PlatformAdmin) {
    if (!window.confirm(`Remove platform administrator access from ${admin.email}?`)) return;
    setBusy(true); setError(""); setNotice("");
    try {
      await requestJson("/api/platform/admins", { method: "DELETE", body: JSON.stringify({ userId: admin.userId }) });
      setNotice(`Platform administrator access was removed from ${admin.email}.`);
      setPlatformAdmins((current) => current.filter((item) => item.userId !== admin.userId));
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not remove administrator access."); }
    finally { setBusy(false); }
  }

  async function updatePlatformAdminStatus(admin: PlatformAdmin) {
    const action = admin.suspendedAt ? "reinstate" : "suspend";
    if (!window.confirm(`${action === "suspend" ? "Suspend" : "Reinstate"} platform administrator access for ${admin.email}?`)) return;
    setBusy(true); setError(""); setNotice("");
    try {
      await requestJson(`/api/platform/admins`, { method: "PATCH", body: JSON.stringify({ userId: admin.userId, action }) });
      setNotice(`${admin.email} was ${action === "suspend" ? "suspended" : "reinstated"}.`);
      await refresh();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not update administrator access."); }
    finally { setBusy(false); }
  }

  async function downloadExport() {
    const query = new URLSearchParams({ type: exportType, status: exportStatus, search: debouncedSearch });
    if (reportFrom && reportTo) { query.set("from", reportFrom); query.set("to", reportTo); }
    setBusy(true); setError(""); setNotice("");
    try {
      const response = await fetch(`/api/platform/exports?${query}`, { cache: "no-store" });
      if (!response.ok) {
        const result = await response.json().catch(() => ({})) as { error?: string };
        throw new Error(result.error ?? "Could not download this report.");
      }
      const file = URL.createObjectURL(await response.blob());
      const link = document.createElement("a");
      link.href = file; link.download = `fitpass-${exportType}-${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.append(link); link.click(); link.remove(); URL.revokeObjectURL(file);
      setNotice("Your filtered CSV export is ready.");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not download this report."); }
    finally { setBusy(false); }
  }

  async function savePackage(event: FormEvent<HTMLFormElement>, item: Package) {
    event.preventDefault(); setBusy(true); setError(""); setNotice("");
    const form = new FormData(event.currentTarget);
    try {
      let features: Record<string, boolean>;
      try { features = JSON.parse(String(form.get("features"))) as Record<string, boolean>; }
      catch { throw new Error("Feature permissions must be valid JSON with boolean values."); }
      const body = { features, ...(form.get("isActive") === "on" ? { isActive: true } : {}) };
      await requestJson(`/api/platform/packages/${item.id}`, { method: "PATCH", body: JSON.stringify(body) });
      setNotice(`${item.name} package settings saved.`);
      await refresh();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not save package settings."); }
    finally { setBusy(false); }
  }

  const visibleGyms = gyms;
  const displayedGyms = gyms;
  const visibleApplications = applications;
  const visiblePayments = platformPayments;
  const pendingCount = data?.metrics.pendingApplications ?? 0;

  return <div className="min-h-dvh overflow-x-clip bg-background text-slate-900">
    <aside className={`fixed inset-y-0 left-0 z-40 flex w-[278px] max-w-[calc(100vw-2rem)] flex-col bg-green-900 text-white transition-transform duration-200 lg:translate-x-0 ${mobileNavOpen ? "translate-x-0" : "-translate-x-full"}`}>
      <div className="flex h-[76px] items-center justify-between border-b border-white/10 px-6"><button type="button" onClick={() => setActiveSection("overview")} className="flex items-center gap-3 text-left"><span className="grid size-10 place-items-center rounded-xl bg-orange-500 text-sm font-black text-slate-950"><Dumbbell size={20} /></span><span className="font-heading text-xl font-bold tracking-tight">FitPass<span className="text-green-400">.</span></span></button><button className="rounded-lg p-2 text-white/70 hover:bg-white/10 lg:hidden" onClick={() => setMobileNavOpen(false)} aria-label="Close navigation"><X size={20} /></button></div>
      <div className="px-4 pt-6"><p className="px-3 text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500">Platform workspace</p><nav className="mt-3 space-y-1" aria-label="Platform administration">{navigation.map(({ label, href, icon: Icon }) => <button type="button" key={href} aria-current={activeSection === href.slice(1) ? "page" : undefined} onClick={() => { setActiveSection(href.slice(1)); setMobileNavOpen(false); }} className={`flex min-h-11 w-full items-center gap-3 rounded-xl px-3 text-left text-sm font-medium transition ${activeSection === href.slice(1) ? "bg-orange-500 font-semibold text-slate-950" : "text-slate-300 hover:bg-white/8 hover:text-white"}`}><Icon size={18} aria-hidden="true" /><span>{label}</span>{label === "Applications" && pendingCount > 0 && <span className="ml-auto rounded-full bg-orange-500/15 px-2 py-0.5 text-xs font-bold text-green-300">{pendingCount}</span>}</button>)}</nav></div>
      <div className="mt-auto border-t border-white/10 p-4"><div className="flex items-center gap-3 rounded-xl bg-white/5 p-3"><span className="grid size-10 place-items-center rounded-full bg-slate-700 text-sm font-bold text-green-300">PA</span><div className="min-w-0"><p className="truncate text-sm font-semibold">Platform administrator</p><p className="mt-0.5 text-xs text-slate-400">Secure platform access</p></div><ShieldCheck className="ml-auto shrink-0 text-green-400" size={18} /></div></div>
    </aside>
    {mobileNavOpen && <button className="fixed inset-0 z-30 bg-green-900/50 lg:hidden" onClick={() => setMobileNavOpen(false)} aria-label="Close navigation overlay" />}

    <div className="min-h-dvh lg:pl-[278px]">
      <header className="sticky top-0 z-20 flex h-[76px] items-center justify-between gap-4 border-b border-slate-200 bg-white/95 px-4 backdrop-blur sm:px-7 lg:px-10">
        <div className="flex min-w-0 items-center gap-3"><button onClick={() => setMobileNavOpen(true)} className="grid size-10 shrink-0 place-items-center rounded-xl border border-slate-200 text-slate-700 lg:hidden" aria-label="Open navigation"><Menu size={20} /></button><div className="hidden text-sm text-slate-400 sm:block">Platform <ChevronRight className="mx-1 inline" size={14} /> <span className="font-semibold text-slate-800">{navigation.find((item) => item.href === `#${activeSection}`)?.label ?? (activeSection === "create-gym" ? "Add gym" : "Overview")}</span></div><h1 className="truncate font-heading text-lg font-bold sm:hidden">{navigation.find((item) => item.href === `#${activeSection}`)?.label ?? (activeSection === "create-gym" ? "Add gym" : "Overview")}</h1></div>
        <div className="flex items-center gap-2 sm:gap-3"><label className="relative hidden w-60 md:block"><Search size={17} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" /><span className="sr-only">Search gyms and applications</span><input value={search} onChange={(event) => { setSearch(event.target.value); setGymPage(1); }} placeholder="Search gyms, applications…" className="h-10 w-full rounded-xl border border-slate-200 bg-slate-50 pl-9 pr-3 text-sm outline-none placeholder:text-slate-400 focus:border-green-500 focus:ring-2 focus:ring-green-100" /></label><button onClick={() => void refresh()} className="hidden h-10 rounded-xl border border-slate-200 px-3 text-sm font-semibold text-slate-700 hover:bg-slate-50 sm:inline-flex">Refresh</button><button type="button" onClick={() => setActiveSection("activity")} aria-label="View platform activity" className="relative grid size-10 place-items-center rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-50"><Bell size={18} />{pendingCount > 0 && <span className="absolute right-2 top-2 size-2 rounded-full bg-green-500" />}</button><span className="grid size-10 place-items-center rounded-full bg-green-800 text-xs font-bold text-green-300">PA</span></div>
      </header>

      <main className="mx-auto max-w-[1500px] space-y-6 px-4 py-6 sm:px-7 sm:py-8 lg:px-10">
        {error && <div role="alert" className="flex items-start justify-between gap-4 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800"><p>{error}</p><button onClick={() => void refresh()} className="shrink-0 font-semibold underline">Retry</button></div>}
        {notice && <div role="status" className={`flex flex-wrap items-center gap-2 rounded-xl border p-4 text-sm font-medium ${resendApprovedOwner ? "border-amber-200 bg-amber-50 text-amber-950" : "border-green-200 bg-green-50 text-slate-800"}`}><Check size={17} className={resendApprovedOwner ? "text-amber-700" : "text-green-700"} /><span>{notice}</span>{resendApprovedOwner && <button type="button" disabled={busy} onClick={() => void resendApprovedInvitation()} className="min-h-10 rounded-lg bg-green-900 px-3 font-bold text-white underline-offset-2 hover:underline disabled:opacity-60">Resend invitation</button>}</div>}

        <section id="overview" hidden={activeSection !== "overview"} className="grid min-w-0 overflow-hidden rounded-2xl bg-green-900 text-white shadow-sm lg:grid-cols-[1fr_300px]">
          <div className="px-5 py-7 sm:px-8 sm:py-9"><p className="inline-flex items-center gap-2 rounded-full bg-orange-500/15 px-3 py-1.5 text-xs font-bold uppercase tracking-[0.14em] text-green-300"><span className="size-1.5 rounded-full bg-orange-500" />FitPass platform</p><h2 className="mt-4 max-w-2xl font-heading text-3xl font-bold leading-tight tracking-tight sm:text-4xl">A stronger community starts with a well-run gym.</h2><p className="mt-3 max-w-xl text-sm leading-6 text-slate-300">Your platform overview brings gym growth, member access and billing into one clear workspace.</p><div className="mt-5 flex flex-wrap items-center gap-3 text-xs text-slate-300"><span className="inline-flex items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-3 py-2"><span className="size-2 rounded-full bg-orange-500" />Live platform records</span><span>{dateLabel(new Date().toISOString())}</span></div></div>
          <div className="relative hidden min-h-[190px] overflow-hidden lg:block"><div role="img" aria-label="Athlete taking a focused moment between gym sessions" className="absolute inset-0 bg-cover bg-center" style={{ backgroundImage: "linear-gradient(90deg, #111827 0%, rgba(17,24,39,.3) 55%, rgba(17,24,39,.1) 100%), url('https://images.unsplash.com/photo-1667556205536-e5b04ee97ace?auto=format&fit=crop&w=900&q=80')" }} /><a href="https://unsplash.com/es/fotos/un-hombre-con-una-camisa-roja-y-auriculares-6RxiZFCneWs" target="_blank" rel="noreferrer" className="absolute bottom-2 right-3 rounded bg-green-900/60 px-2 py-1 text-[10px] text-white/80">Photo: Shalom Ejiofor / Unsplash</a></div>
        </section>

        {activeSection === "overview" && (loading && !data ? <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{Array.from({ length: 10 }, (_, index) => <div key={index} className="h-36 animate-pulse rounded-2xl border border-slate-200 bg-white" />)}</section> : data && <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <MetricCard title="Total gyms" value={data.metrics.totalGyms.toLocaleString()} caption="Registered on FitPass" icon={Building2} />
          <MetricCard title="Active gyms" value={data.metrics.activeGyms.toLocaleString()} caption="Currently operating" icon={Dumbbell} tone="slate" />
          <MetricCard title="Suspended gyms" value={data.metrics.suspendedGyms.toLocaleString()} caption="Temporarily restricted" icon={Building2} tone="slate" />
          <MetricCard title="Archived gyms" value={data.metrics.archivedGyms.toLocaleString()} caption="Historical access only" icon={Building2} tone="slate" />
          <MetricCard title="Pending applications" value={data.metrics.pendingApplications.toLocaleString()} caption="Awaiting platform review" icon={ClipboardCheck} />
          <MetricCard title="Active gym members" value={data.metrics.activeMembers.toLocaleString()} caption="Across active gym memberships" icon={Users} tone="slate" />
          <MetricCard title="Active FitPass subscriptions" value={data.metrics.activePlatformSubscriptions.toLocaleString()} caption="Current paid platform accounts" icon={CreditCard} tone="slate" />
          <MetricCard title="Active 30-day trials" value={data.metrics.activeTrials.toLocaleString()} caption={`${data.metrics.trialsExpiringSoon} ending within 7 days`} icon={CreditCard} />
          <MetricCard title="Overdue subscriptions" value={data.metrics.overduePlatformSubscriptions.toLocaleString()} caption="Marked past due" icon={CreditCard} tone="slate" />
          <MetricCard title="Monthly recurring revenue" value={formatNaira(BigInt(data.metrics.monthlyRecurringRevenueKobo))} caption="Active monthly packages only" icon={CircleDollarSign} />
          <MetricCard title="Outstanding payments" value={data.metrics.outstandingPayments.toLocaleString()} caption={`${formatNaira(BigInt(data.metrics.outstandingPaymentsKobo))} pending`} icon={CreditCard} tone="slate" />
        </section>)}

        {data && <section id="reports" hidden={activeSection !== "reports"} className="space-y-5">
          <Panel title="Custom reporting period"><form onSubmit={(event) => void applyReportPeriod(event)} className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end"><label className="grid gap-1 text-sm font-semibold text-slate-700">From<input type="date" required value={reportFrom} onChange={(event) => setReportFrom(event.target.value)} className="min-h-11 rounded-lg border border-slate-200 px-3" /></label><label className="grid gap-1 text-sm font-semibold text-slate-700">To<input type="date" required value={reportTo} onChange={(event) => setReportTo(event.target.value)} className="min-h-11 rounded-lg border border-slate-200 px-3" /></label><button disabled={busy} className="min-h-11 rounded-lg bg-green-800 px-4 text-sm font-semibold text-white disabled:opacity-50">Apply period</button></form><p className="mt-3 text-xs text-slate-500">Current chart range: {data.reportPeriod.from} to {data.reportPeriod.to}. Maximum range: 366 days.</p></Panel>
          <div className="grid gap-5 xl:grid-cols-2"><Panel title="Platform revenue"><RevenueChart points={data.trends} /></Panel><Panel title="Gym registrations"><GrowthChart points={data.trends} /></Panel></div>
          <Panel title="Download platform report"><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[1fr_1fr_1fr_auto]"><label className="grid gap-1 text-xs font-semibold text-slate-600">Export data<select value={exportType} onChange={(event) => { setExportType(event.target.value); setExportStatus("all"); }} className="min-h-11 rounded-lg border border-slate-200 bg-white px-3 text-sm"><option value="revenue">Platform revenue</option><option value="gyms">Gym directory</option><option value="applications">Gym applications</option><option value="subscriptions">Platform subscriptions</option><option value="payments">Platform payments</option></select></label><label className="grid gap-1 text-xs font-semibold text-slate-600">Status filter<select value={exportStatus} onChange={(event) => setExportStatus(event.target.value)} className="min-h-11 rounded-lg border border-slate-200 bg-white px-3 text-sm"><option value="all">All / confirmed revenue</option>{(exportType === "gyms" ? ["active", "suspended", "archived"] : exportType === "applications" ? ["pending", "approved", "rejected", "withdrawn"] : exportType === "subscriptions" ? ["pending_payment", "trialing", "active", "past_due", "cancelled", "expired"] : exportType === "payments" ? ["pending", "paid", "failed", "abandoned"] : ["paid"]).map((status) => <option value={status} key={status}>{status.replaceAll("_", " ")}</option>)}</select></label><div className="flex flex-wrap items-end gap-2 text-xs text-slate-500 sm:col-span-2 lg:col-span-1">{reportFrom && reportTo ? <span>Date range: {reportFrom} to {reportTo}</span> : <span>No date filter · all matching history</span>}</div><button type="button" onClick={downloadExport} className="min-h-11 rounded-lg bg-orange-500 px-4 text-sm font-bold text-slate-950 hover:bg-orange-600">Download CSV</button></div><p className="mt-3 text-xs text-slate-500">Exports use the current global search, selected status, and date range. Revenue exports include verified paid platform payments only. Files over 10,000 rows require narrower filters.</p></Panel>
        </section>}

        <section hidden={activeSection !== "applications" && activeSection !== "gyms"} className="grid gap-5 xl:grid-cols-[1.15fr_0.85fr]">
          <Panel id="applications" hidden={activeSection !== "applications"} title="Gym applications" action={<div className="flex items-center gap-2"><label className="sr-only" htmlFor="application-status">Filter applications</label><select id="application-status" value={applicationStatus} onChange={(event) => setApplicationStatus(event.target.value)} className="h-9 rounded-lg border border-slate-200 bg-white px-2 text-xs font-semibold text-slate-700"><option value="pending">Pending</option><option value="approved">Approved</option><option value="rejected">Rejected</option><option value="withdrawn">Withdrawn</option></select><ChevronDown size={14} className="-ml-7 pointer-events-none text-slate-500" /><span className="ml-2 hidden rounded-full bg-green-100 px-2.5 py-1 text-xs font-semibold text-slate-800 sm:inline">{visibleApplications.length} shown</span></div>}>
            {loading && !data ? <p role="status" className="py-8 text-center text-sm text-slate-500">Loading applications…</p> : visibleApplications.length === 0 ? <p className="rounded-xl border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500">No {applicationStatus} applications found.</p> : <div className="space-y-4">{visibleApplications.map((application) => {
              const storedPackageIsActive = Boolean(application.preferredPackageId && data?.packages.some((item) => item.id === application.preferredPackageId && item.isActive));
              const packageChoice = storedPackageIsActive ? application.preferredPackageId ?? "" : applicationPackageChoices[application.id] ?? "";
              return <article key={application.id} className="overflow-hidden rounded-xl border border-slate-200 p-4">
                <div className="flex flex-wrap items-start gap-4">
                  {application.logoUrl ? <Image src={application.logoUrl} alt={`${application.gymName} logo`} width={64} height={64} className="size-16 rounded-xl border border-slate-200 object-cover" unoptimized /> : <span className="grid size-16 shrink-0 place-items-center rounded-xl bg-slate-100 text-xs font-semibold text-slate-500">No logo</span>}
                  <div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><h3 className="font-semibold text-slate-950">{application.gymName}</h3><span className="rounded-full bg-slate-100 px-2 py-1 text-[11px] font-semibold capitalize text-slate-700">{application.status ?? "pending"}</span></div><p className="mt-1 break-all text-sm text-slate-600">{application.applicantName} · {application.applicantEmail}</p><p className="mt-1 text-xs text-slate-500">/{application.requestedSlug} · {application.location || "Location not provided"} · submitted {dateLabel(application.createdAt)}</p>{application.phone && <p className="mt-1 text-xs text-slate-500">{application.phone}</p>}{application.reviewNote && <p className="mt-2 rounded-lg bg-amber-50 p-2 text-sm text-amber-900">Review note: {application.reviewNote}</p>}</div>
                </div>
                {application.facilityPhotoUrls?.length ? <div className="mt-3 flex gap-2 overflow-x-auto">{application.facilityPhotoUrls.map((url, index) => <Image key={url} src={url} alt={`${application.gymName} facility ${index + 1}`} width={180} height={112} className="h-28 w-44 shrink-0 rounded-lg border border-slate-200 object-cover" unoptimized />)}</div> : <p className="mt-3 text-xs text-slate-500">No facility photos supplied.</p>}
                {(application.status ?? "pending") === "pending" && <div className="mt-4 flex flex-wrap items-end gap-2 border-t border-slate-100 pt-3"><label className="grid min-w-48 flex-1 gap-1 text-xs font-semibold text-slate-600">FitPass package for approval{storedPackageIsActive ? <span className="min-h-10 rounded-lg bg-slate-50 px-3 py-2 text-sm font-medium text-slate-700">{data?.packages.find((item) => item.id === application.preferredPackageId)?.name} · applicant preference</span> : <select value={packageChoice} onChange={(event) => setApplicationPackageChoices((current) => ({ ...current, [application.id]: event.target.value }))} className="min-h-10 rounded-lg border border-slate-200 bg-white px-3 text-sm"><option value="">Select active package</option>{data?.packages.filter((item) => item.isActive).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select>}</label><button type="button" disabled={busy} onClick={() => void review(application, "approve")} className="min-h-10 rounded-lg bg-orange-500 px-4 text-sm font-bold text-slate-950 disabled:opacity-50">Approve & invite owner</button><button type="button" disabled={busy} onClick={() => void review(application, "reject")} className="min-h-10 rounded-lg border border-rose-200 px-4 text-sm font-semibold text-rose-700 disabled:opacity-50">Reject</button></div>}
              </article>;
            })}</div>}
            {applicationHasMore && <button type="button" disabled={busy} onClick={() => void loadMoreApplications()} className="mt-4 min-h-10 rounded-lg border border-slate-200 px-4 text-sm font-semibold disabled:opacity-60">{busy ? "Loading…" : "Load more applications"}</button>}
          </Panel>

          <Panel id="gyms" hidden={activeSection !== "gyms"} title="Gym directory" action={<div className="flex items-center gap-2"><label className="sr-only" htmlFor="gym-status-filter">Filter gyms by status</label><select id="gym-status-filter" value={gymStatus} onChange={(event) => setGymStatus(event.target.value)} className="h-9 rounded-lg border border-slate-200 bg-white px-2 text-xs font-semibold text-slate-700"><option value="all">All gyms</option><option value="active">Active</option><option value="suspended">Suspended</option><option value="archived">Archived</option></select><button type="button" onClick={() => setActiveSection("create-gym")} className="inline-flex min-h-9 items-center gap-1 rounded-lg bg-green-800 px-3 text-xs font-semibold text-white hover:bg-green-900">Add gym <ChevronRight size={15} /></button></div>}>
            <div className="mb-3 md:hidden"><label className="relative block"><Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" /><input value={search} onChange={(event) => { setSearch(event.target.value); setGymPage(1); }} placeholder="Search gyms…" className="h-10 w-full rounded-lg border border-slate-200 pl-9 pr-3 text-sm" /></label></div>
            {loading && !data ? <p role="status" className="py-8 text-center text-sm text-slate-500">Loading gyms…</p> : visibleGyms.length === 0 ? <div className="rounded-xl border border-dashed border-slate-300 px-4 py-9 text-center"><Building2 className="mx-auto text-slate-400" size={25} /><p className="mt-3 font-semibold text-slate-800">No gyms found</p><p className="mt-1 text-sm text-slate-500">Adjust the search or status filter.</p></div> : <div className="divide-y divide-slate-100">{displayedGyms.map((gym) => <article key={gym.id} className="flex flex-wrap items-center justify-between gap-3 py-3 first:pt-0 last:pb-0"><div className="flex min-w-0 items-center gap-3"><span className="grid size-10 shrink-0 place-items-center rounded-xl bg-slate-100 text-slate-600"><Building2 size={18} /></span><div className="min-w-0"><h3 className="truncate text-sm font-semibold text-slate-900">{gym.name}</h3><p className="truncate text-xs text-slate-500">/{gym.slug}{gym.createdAt ? ` · ${dateLabel(gym.createdAt)}` : ""}</p></div></div><div className="flex shrink-0 items-center gap-2"><span className={`rounded-full px-2 py-1 text-[11px] font-semibold capitalize ${gym.status === "active" ? "bg-green-100 text-green-800" : gym.status === "suspended" ? "bg-amber-100 text-amber-900" : "bg-slate-100 text-slate-600"}`}>{gym.status}</span><button disabled={busy || detailLoading} onClick={() => void openGymDetails(gym)} className="min-h-10 rounded-lg border border-slate-200 px-3 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60">Details & edit</button></div></article>)}</div>}
            {gymHasMore && <button type="button" disabled={busy} onClick={() => void loadMoreGyms()} className="mt-4 min-h-10 rounded-lg border border-slate-200 px-4 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60">{busy ? "Loading…" : "Load more gyms"}</button>}
          </Panel>
        </section>

        <section hidden={activeSection !== "subscriptions" && activeSection !== "payments"} className="grid gap-5 xl:grid-cols-2"><Panel id="subscriptions" hidden={activeSection !== "subscriptions"} title="Platform subscriptions" action={<select aria-label="Filter platform subscriptions" value={subscriptionStatus} onChange={(event) => setSubscriptionStatus(event.target.value)} className="h-9 rounded-lg border border-slate-200 bg-white px-2 text-xs font-semibold text-slate-700"><option value="all">All statuses</option><option value="pending_payment">Pending payment</option><option value="trialing">Trialing</option><option value="active">Active</option><option value="past_due">Past due</option><option value="cancelled">Cancelled</option><option value="expired">Expired</option></select>}>{subscriptions.length === 0 ? <p className="rounded-xl border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500">No subscriptions match these filters.</p> : <div className="space-y-3">{subscriptions.map((subscription) => <article key={subscription.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 p-4"><div><h3 className="text-sm font-semibold text-slate-900">{subscription.gymName}</h3><p className="mt-1 text-xs text-slate-500">{subscription.packageName} · renews {dateLabel(subscription.currentPeriodEnd)}</p></div><div className="text-right"><p className="text-sm font-bold text-slate-900">{formatNaira(subscription.billedPriceKobo)} / {subscription.billingInterval}</p><span className="text-xs capitalize text-slate-500">{subscription.status.replaceAll("_", " ")}</span></div></article>)}</div>}{subscriptionHasMore && <button type="button" disabled={busy} onClick={() => void loadMoreSubscriptions()} className="mt-4 min-h-10 rounded-lg border border-slate-200 px-4 text-sm font-semibold disabled:opacity-60">{busy ? "Loading…" : "Load more subscriptions"}</button>}</Panel>

        <Panel id="payments" hidden={activeSection !== "payments"} title="Platform payments" action={<select aria-label="Filter platform payments" value={paymentStatus} onChange={(event) => setPaymentStatus(event.target.value)} className="h-9 rounded-lg border border-slate-200 bg-white px-2 text-xs font-semibold text-slate-700"><option value="all">All statuses</option><option value="paid">Paid</option><option value="pending">Pending</option><option value="failed">Failed</option><option value="abandoned">Abandoned</option></select>}>
          {visiblePayments.length === 0 ? <p className="rounded-xl border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500">No platform payments match this filter.</p> : <><ul className="space-y-3 md:hidden">{visiblePayments.map((payment) => <li key={payment.id} className="rounded-xl border border-slate-200 p-4"><div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="break-words text-sm font-semibold text-slate-900">{payment.gymName}</p><p className="mt-1 break-all font-mono text-[11px] text-slate-500">{payment.reference}</p></div><span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold capitalize ${payment.status === "paid" ? "bg-green-100 text-green-800" : payment.status === "pending" ? "bg-amber-50 text-amber-800" : "bg-slate-100 text-slate-600"}`}>{payment.status}{payment.paymentMode === "demo" ? " · DEMO (no charge)" : ""}</span></div><div className="mt-3 flex items-center justify-between gap-3 border-t border-slate-100 pt-3"><time className="text-xs text-slate-500">{dateLabel(payment.paidAt ?? payment.createdAt)}</time><p className="font-semibold text-slate-950">{formatNaira(payment.amountKobo)}</p></div></li>)}</ul><div className="hidden overflow-x-auto md:block"><table className="w-full min-w-[540px] text-left text-sm"><thead><tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500"><th className="pb-3 font-semibold">Gym / reference</th><th className="pb-3 font-semibold">Date</th><th className="pb-3 font-semibold">Status</th><th className="pb-3 text-right font-semibold">Amount</th></tr></thead><tbody>{visiblePayments.map((payment) => <tr key={payment.id} className="border-b border-slate-100 last:border-0"><td className="py-3"><p className="font-medium text-slate-800">{payment.gymName}</p><p className="max-w-[180px] truncate font-mono text-[10px] text-slate-500">{payment.reference}</p></td><td className="py-3 text-slate-500">{dateLabel(payment.paidAt ?? payment.createdAt)}</td><td className="py-3"><span className={`rounded-full px-2 py-1 text-xs font-semibold capitalize ${payment.status === "paid" ? "bg-green-100 text-green-800" : payment.status === "pending" ? "bg-amber-50 text-amber-800" : "bg-slate-100 text-slate-600"}`}>{payment.status}{payment.paymentMode === "demo" ? " · DEMO (no charge)" : ""}</span></td><td className="py-3 text-right font-semibold text-slate-900">{formatNaira(payment.amountKobo)}</td></tr>)}</tbody></table></div></>}{paymentHasMore && <button type="button" disabled={busy} onClick={() => void loadMorePayments()} className="mt-4 min-h-11 rounded-lg border border-slate-200 px-4 text-sm font-semibold disabled:opacity-60">{busy ? "Loading…" : "Load more payments"}</button>}
        </Panel></section>

        <section id="packages" hidden={activeSection !== "packages"} className="space-y-5"><Panel title="Pricing packages"><p className="mb-4 text-sm leading-6 text-slate-600">The four monthly package prices and account limits are fixed. Only explicitly configured feature permissions can be adjusted here.</p>
          {loading && !data ? <p role="status" className="py-6 text-sm text-slate-500">Loading package catalog…</p> : !data?.packages.length ? <p className="rounded-xl border border-dashed border-slate-300 p-6 text-sm text-slate-500">No fixed FitPass package records are configured yet. Controlled database provisioning is required before gym subscriptions can use the catalog.</p> : <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">{data.packages.map((item) => <article key={item.id} className="rounded-xl border border-slate-200 p-4"><div className="flex items-start justify-between gap-2"><h3 className="font-semibold text-slate-900">{item.name}</h3><span className={`size-2.5 rounded-full ${item.isActive ? "bg-green-500" : "bg-slate-300"}`} aria-label={item.isActive ? "Available" : "Inactive"} /></div><p className="mt-3 font-heading text-xl font-bold text-slate-950">{formatNaira(item.priceKobo)}<span className="ml-1 text-xs font-medium text-slate-500">/{item.billingInterval}</span></p><p className="mt-2 text-xs leading-5 text-slate-500">{item.activeMemberLimit.toLocaleString()} active members<br />{item.adminAccountLimit} admin accounts</p></article>)}</div>}
        </Panel></section>

        <section id="activity" hidden={activeSection !== "activity"}><Panel title="Platform activity and audit log" action={<span className="text-xs text-slate-500">{activity.length} loaded</span>}>
          {activity.length === 0 ? <div className="py-6 text-center"><Activity className="mx-auto text-slate-400" size={22} /><p className="mt-2 text-sm text-slate-500">No activity matches this search.</p></div> : <ul className="divide-y divide-slate-100">{activity.map((event) => <li key={event.id} className="flex items-start gap-3 py-3 first:pt-0 last:pb-0"><span className="mt-0.5 grid size-9 shrink-0 place-items-center rounded-full bg-slate-100 text-slate-600"><Activity size={16} /></span><div className="min-w-0 flex-1"><p className="break-words text-sm font-medium text-slate-800">{event.action.replaceAll(".", " · ").replaceAll("_", " ")}</p><p className="mt-0.5 break-all text-xs text-slate-500">{event.actorLabel.replaceAll("_", " ")} · {event.subjectType.replaceAll("_", " ")}{event.gymName ? ` · ${event.gymName}` : " · Platform"}</p></div><time className="shrink-0 text-xs text-slate-500">{dateLabel(event.createdAt)}</time></li>)}</ul>}
          {activityHasMore && <button type="button" disabled={busy} onClick={() => void loadMoreActivity()} className="mt-4 min-h-10 rounded-lg border border-slate-200 px-4 text-sm font-semibold disabled:opacity-60">{busy ? "Loading…" : "Load more activity"}</button>}
        </Panel></section>

        <section id="create-gym" hidden={activeSection !== "create-gym"}><Panel title="Provision a gym and first owner"><p className="-mt-2 mb-5 text-sm text-slate-500">Creates a gym and sends a controlled, verified-email owner invitation. The selected package starts its free trial only after the owner activates the invite.</p><form className="grid gap-4 md:grid-cols-2" onSubmit={createGym}><label className="grid gap-1.5 text-sm font-medium text-slate-700">Gym name<input name="name" required maxLength={120} className="h-11 rounded-lg border border-slate-200 px-3" /></label><label className="grid gap-1.5 text-sm font-medium text-slate-700">Public slug<input name="slug" required pattern="[a-z0-9]+(-[a-z0-9]+)*" maxLength={80} className="h-11 rounded-lg border border-slate-200 px-3" /></label><label className="grid gap-1.5 text-sm font-medium text-slate-700">First owner email<input name="email" type="email" required maxLength={254} className="h-11 rounded-lg border border-slate-200 px-3" /></label><label className="grid gap-1.5 text-sm font-medium text-slate-700">Trial package<select name="preferredPackageId" required className="h-11 rounded-lg border border-slate-200 bg-white px-3"><option value="">Choose an active package</option>{data?.packages.filter((item) => item.isActive).map((item) => <option key={item.id} value={item.id}>{item.name} · {item.activeMemberLimit.toLocaleString()} members</option>)}</select></label><button disabled={busy} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-green-800 px-5 text-sm font-semibold text-white hover:bg-green-900 disabled:opacity-60 md:col-span-2"><Building2 size={17} />{busy ? "Working…" : "Create gym and invite owner"}</button></form></Panel></section>

        {selectedGym && <div className="fixed inset-0 z-50 grid place-items-end bg-green-900/55 p-0 backdrop-blur-sm sm:place-items-center sm:p-4" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setSelectedGym(null); }}><section role="dialog" aria-modal="true" aria-labelledby="gym-details-title" className="max-h-[94dvh] w-full max-w-3xl overflow-y-auto rounded-t-3xl bg-white p-5 shadow-2xl sm:rounded-3xl sm:p-7"><div className="flex items-start justify-between gap-4"><div><p className="text-xs font-bold uppercase tracking-[0.16em] text-green-700">Platform directory</p><h2 id="gym-details-title" className="mt-1 font-heading text-2xl font-bold text-slate-950">{selectedGym.gym.name}</h2><p className="mt-1 text-sm text-slate-500">/{selectedGym.gym.slug} · created {selectedGym.gym.createdAt ? dateLabel(selectedGym.gym.createdAt) : "date unavailable"}</p></div><button type="button" onClick={() => setSelectedGym(null)} className="grid size-11 shrink-0 place-items-center rounded-xl border border-slate-200 text-slate-600" aria-label="Close gym details"><X size={19} /></button></div>
          <div className="mt-5 grid gap-3 sm:grid-cols-3"><div className="rounded-xl bg-slate-50 p-4"><p className="text-xs text-slate-500">Gym accounts</p><p className="mt-1 text-xl font-bold">{selectedGym.counts.accounts}</p></div><div className="rounded-xl bg-slate-50 p-4"><p className="text-xs text-slate-500">Active members</p><p className="mt-1 text-xl font-bold">{selectedGym.counts.activeMembers}</p></div><div className="rounded-xl bg-slate-50 p-4"><p className="text-xs text-slate-500">Active admin accounts</p><p className="mt-1 text-xl font-bold">{selectedGym.counts.activeAdminAccounts}</p></div></div>
          <div className="mt-5 grid gap-5 lg:grid-cols-2"><div><h3 className="font-semibold text-slate-900">Gym owners</h3>{selectedGym.owners.length ? <ul className="mt-2 divide-y divide-slate-100">{selectedGym.owners.map((owner) => <li key={owner.email} className="py-2"><p className="text-sm font-semibold">{owner.name}</p><p className="text-xs text-slate-500">{owner.email} · {owner.membershipStatus}</p></li>)}</ul> : <><p className="mt-2 rounded-xl bg-slate-50 p-3 text-sm text-slate-600">No owner invitation has been accepted yet.</p>{selectedGym.gym.status === "active" && <form onSubmit={(event) => void sendFirstOwnerInvitation(event)} className="mt-3 grid gap-2 sm:grid-cols-[1fr_1fr_auto]"><label className="sr-only" htmlFor="first-owner-email">First owner email</label><input id="first-owner-email" name="ownerEmail" type="email" required maxLength={254} placeholder="First owner email" className="min-h-11 min-w-0 rounded-lg border border-slate-300 px-3 text-sm" /><select name="preferredPackageId" aria-label="First-owner trial package if not already selected" className="min-h-11 min-w-0 rounded-lg border border-slate-300 bg-white px-3 text-sm"><option value="">Keep existing package choice</option>{data?.packages.filter((item) => item.isActive).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select><button disabled={busy} className="min-h-11 rounded-lg bg-orange-500 px-4 text-sm font-bold text-slate-950 disabled:opacity-60">Send owner invite</button></form>}</>}</div><div><h3 className="font-semibold text-slate-900">FitPass subscription</h3>{selectedGym.subscription ? <><div className="mt-2 rounded-xl bg-slate-50 p-3"><p className="font-semibold">{selectedGym.subscription.packageName} · {selectedGym.subscription.status.replaceAll("_", " ")}</p><p className="mt-1 text-sm text-slate-600">Fixed monthly package price: {formatNaira(selectedGym.subscription.priceKobo)} / {selectedGym.subscription.billingInterval}</p><p className="text-xs text-slate-500">Period ends {dateLabel(selectedGym.subscription.currentPeriodEnd)}</p></div></> : <p className="mt-2 rounded-xl bg-slate-50 p-3 text-sm text-slate-600">No platform subscription found.</p>}</div></div>
          <form onSubmit={(event) => void saveGymDetails(event)} className="mt-6 grid gap-3 border-t border-slate-200 pt-5 sm:grid-cols-2"><h3 className="font-semibold sm:col-span-2">Edit gym and access status</h3><label className="grid gap-1 text-sm font-medium text-slate-700">Gym name<input name="name" required minLength={2} maxLength={120} defaultValue={selectedGym.gym.name} className="min-h-11 rounded-lg border border-slate-300 px-3" /></label><label className="grid gap-1 text-sm font-medium text-slate-700">Slug<input name="slug" required pattern="[a-z0-9]+(-[a-z0-9]+)*" minLength={3} maxLength={80} defaultValue={selectedGym.gym.slug} className="min-h-11 rounded-lg border border-slate-300 px-3" /></label><label className="grid gap-1 text-sm font-medium text-slate-700 sm:col-span-2">Status<select name="status" defaultValue={selectedGym.gym.status} className="min-h-11 rounded-lg border border-slate-300 px-3"><option value="active">Active</option><option value="suspended">Suspended</option><option value="archived">Archived</option></select></label><label className="grid gap-1 text-sm font-medium text-slate-700">Daily check-in limit per member<input name="maxDailyCheckins" type="number" min={1} max={20} step={1} required defaultValue={selectedGym.gym.maxDailyCheckins} className="min-h-11 rounded-lg border border-slate-300 px-3" /></label><label className="grid gap-1 text-sm font-medium text-slate-700">Verified latitude<input name="latitude" type="number" step="any" min="-90" max="90" defaultValue={selectedGym.gym.latitude ?? ""} className="min-h-11 rounded-lg border border-slate-300 px-3" /></label><label className="grid gap-1 text-sm font-medium text-slate-700">Verified longitude<input name="longitude" type="number" step="any" min="-180" max="180" defaultValue={selectedGym.gym.longitude ?? ""} className="min-h-11 rounded-lg border border-slate-300 px-3" /></label><label className="grid gap-1 text-sm font-medium text-slate-700 sm:col-span-2">Coordinate verification source URL<input name="locationSource" type="url" maxLength={1000} defaultValue={selectedGym.gym.locationSource ?? ""} placeholder="https://maps.google.com/…" className="min-h-11 rounded-lg border border-slate-300 px-3" /><span className="text-xs font-normal text-slate-500">Enter coordinates only after verifying the gym location. Clear all three fields to remove the verified marker.</span></label><button disabled={busy} className="min-h-11 rounded-lg bg-green-900 px-4 text-sm font-semibold text-white disabled:opacity-60 sm:col-span-2">{busy ? "Saving…" : "Save gym changes"}</button></form>
          <div className="mt-5 border-t border-slate-200 pt-4"><h3 className="font-semibold text-slate-900">Recent gym activity</h3>{selectedGym.activity.length ? <ul className="mt-2 divide-y divide-slate-100">{selectedGym.activity.map((event, index) => <li key={`${event.action}-${event.createdAt}-${index}`} className="flex flex-wrap justify-between gap-2 py-2 text-sm"><span className="capitalize">{event.action.replaceAll(".", " · ").replaceAll("_", " ")}</span><span className="text-xs text-slate-500">{event.actorLabel} · {dateLabel(event.createdAt)}</span></li>)}</ul> : <p className="mt-2 text-sm text-slate-500">No recorded activity.</p>}</div>
        </section></div>}

        <section id="package-create" hidden={activeSection !== "packages"}><details open className="group rounded-2xl border border-slate-200 bg-white p-5 shadow-[0_2px_8px_rgba(16,24,40,0.04)] sm:p-6"><summary className="flex cursor-pointer list-none items-center justify-between gap-3"><div><h2 className="font-heading text-lg font-bold text-slate-950">Edit package catalog</h2><p className="mt-1 text-sm text-slate-500">Change price, capacity limits and explicit feature flags.</p></div><ChevronDown className="text-slate-500 transition group-open:rotate-180" size={19} /></summary><div className="mt-5 space-y-5">
          {(data?.packages ?? []).map((item) => <form key={item.id} className="grid gap-3 rounded-xl border border-slate-200 p-4 sm:grid-cols-2" onSubmit={(event) => void savePackage(event, item)}><h3 className="font-semibold sm:col-span-2">{item.name}</h3><label className="grid gap-1 text-xs font-semibold text-slate-600">Name<input value={item.name} readOnly aria-label="Fixed package name" className="h-10 rounded-lg border border-slate-200 bg-slate-50 px-3 text-sm font-normal" /></label><label className="grid gap-1 text-xs font-semibold text-slate-600">Monthly price in naira<input value={(item.priceKobo / 100).toLocaleString()} readOnly aria-label="Fixed monthly package price in naira" className="h-10 rounded-lg border border-slate-200 bg-slate-50 px-3 text-sm font-normal" /></label><label className="grid gap-1 text-xs font-semibold text-slate-600">Active member limit<input value={item.activeMemberLimit} readOnly aria-label="Fixed active member limit" className="h-10 rounded-lg border border-slate-200 bg-slate-50 px-3 text-sm font-normal" /></label><label className="grid gap-1 text-xs font-semibold text-slate-600">Admin account limit<input value={item.adminAccountLimit} readOnly aria-label="Fixed admin account limit" className="h-10 rounded-lg border border-slate-200 bg-slate-50 px-3 text-sm font-normal" /></label><label className="grid gap-1 text-xs font-semibold text-slate-600 sm:col-span-2">Feature permissions (JSON)<textarea name="features" defaultValue={JSON.stringify(item.features, null, 2)} rows={3} className="rounded-lg border border-slate-200 px-3 py-2 font-mono text-xs font-normal" /></label>{item.isActive ? <p className="flex min-h-10 items-center text-sm font-medium text-green-800">Available for new subscriptions</p> : <label className="flex min-h-10 items-center gap-2 text-sm text-slate-700"><input name="isActive" type="checkbox" className="size-4 accent-green-600" />Re-enable this fixed package</label>}<button disabled={busy} className="min-h-10 rounded-lg bg-green-800 px-4 text-sm font-semibold text-white disabled:opacity-60">Save package</button></form>)}
          <p className="rounded-xl border border-dashed border-slate-300 p-4 text-sm leading-6 text-slate-600">FitPass has four fixed monthly tiers. New tiers cannot be added here; package prices and account limits are maintained through the reviewed platform package provisioning process.</p>        </div></details></section>

        <section id="settings" hidden={activeSection !== "settings"} className="space-y-5">
          <Panel title="Platform administrator accounts"><div className="grid gap-5 lg:grid-cols-[0.8fr_1.2fr]"><form onSubmit={(event) => void grantPlatformAdmin(event)} className="rounded-xl border border-slate-200 bg-slate-50 p-4"><h3 className="font-semibold text-slate-900">Grant controlled access</h3><p className="mt-1 text-sm leading-5 text-slate-600">Only an existing registered account with a verified email can be promoted. Public signup never grants this role.</p><label className="mt-4 grid gap-1.5 text-sm font-semibold text-slate-700">Verified account email<input name="email" type="email" required maxLength={254} placeholder="admin@example.com" className="min-h-11 rounded-lg border border-slate-300 bg-white px-3 font-normal" /></label><button disabled={busy || platformAdmins.filter((admin) => !admin.suspendedAt).length >= 10} className="mt-3 min-h-11 w-full rounded-lg bg-green-800 px-4 text-sm font-semibold text-white disabled:opacity-50">{busy ? "Saving…" : "Grant platform admin"}</button><p className="mt-2 text-xs text-slate-500">Maximum 10 active administrators.</p></form><div><div className="flex items-center justify-between gap-3"><h3 className="font-semibold text-slate-900">Authorized administrators</h3><span className="rounded-full bg-green-100 px-2.5 py-1 text-xs font-bold">{platformAdmins.filter((admin) => !admin.suspendedAt).length} / 10 active</span></div>{platformAdmins.length === 0 ? <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">No administrator records are listed. Controlled provisioning remains the recovery path for an empty administrator table.</p> : <ul className="mt-2 divide-y divide-slate-100">{platformAdmins.map((admin) => { const activeCount = platformAdmins.filter((item) => !item.suspendedAt).length; return <li key={admin.userId} className="flex flex-wrap items-center justify-between gap-3 py-3"><div className="min-w-0"><p className="truncate text-sm font-semibold text-slate-900">{admin.name}{admin.isCurrentUser ? " · You" : ""}</p><p className="truncate text-xs text-slate-500">{admin.email} · Added {dateLabel(admin.createdAt)}{admin.suspendedAt ? ` · Suspended ${dateLabel(admin.suspendedAt)}` : " · Active"}</p></div><div className="flex flex-wrap gap-2"><button type="button" disabled={busy || admin.isCurrentUser || (!admin.suspendedAt && activeCount <= 1) || (Boolean(admin.suspendedAt) && activeCount >= 10)} onClick={() => void updatePlatformAdminStatus(admin)} className="min-h-10 rounded-lg border border-slate-300 px-3 text-sm font-semibold text-slate-800 disabled:cursor-not-allowed disabled:opacity-40">{admin.suspendedAt ? "Reinstate" : "Suspend"}</button><button type="button" disabled={busy || admin.isCurrentUser || (!admin.suspendedAt && activeCount <= 1)} onClick={() => void revokePlatformAdmin(admin)} title={!admin.suspendedAt && activeCount <= 1 ? "The last active administrator cannot be removed" : "Remove administrator record"} className="min-h-10 rounded-lg border border-rose-200 px-3 text-sm font-semibold text-rose-800 disabled:cursor-not-allowed disabled:opacity-40">Remove access</button></div></li>; })}</ul>}<p className="mt-2 text-xs text-slate-500">Suspended administrators are denied by the server session guard. Changes are serialized, the last active administrator is protected, and each action is audited.</p></div></div></Panel>
          <Panel title="Platform settings"><div className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-slate-200 bg-slate-50 p-4"><div className="flex items-start gap-3"><Settings2 className="mt-0.5 shrink-0 text-slate-500" size={18} /><div><p className="text-sm font-semibold text-slate-900">Public gym applications</p><p className="mt-1 max-w-xl text-sm text-slate-600">Control whether gym owners can submit applications for platform review. Existing applications are retained and review actions remain available. This setting is stored and audited on the server.</p></div></div><button type="button" disabled={busy} aria-pressed={gymApplicationsEnabled} onClick={() => void updateApplicationIntake(!gymApplicationsEnabled)} className={`min-h-11 rounded-xl px-4 text-sm font-bold disabled:opacity-60 ${gymApplicationsEnabled ? "bg-orange-500 text-slate-950" : "bg-green-800 text-white"}`}>{busy ? "Saving…" : gymApplicationsEnabled ? "Open · pause intake" : "Closed · open intake"}</button></div></Panel>
        </section>

        <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 pt-5 text-xs text-slate-500"><span>FitPass Platform · Administrator workspace</span><span>Gym-owner permissions stay separate from platform access.</span></footer>
      </main>
    </div>
  </div>;
}
