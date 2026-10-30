"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Search, UserRound, Users, X } from "lucide-react";

type MemberRow = {
  id: string;
  fullName: string;
  phone: string | null;
  membershipCode: string;
  createdAt: string;
  subscription: { status: string; startsAt: string; expiresAt: string } | null;
};
type Cursor = { before: string; beforeId: string } | null;

export default function MemberManagement({ gymId }: { gymId: string }) {
  const [members, setMembers] = useState<MemberRow[]>([]);
  const [cursor, setCursor] = useState<Cursor>(null);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const load = useCallback(async (search: string, append = false, nextCursor: Cursor = null) => {
    setLoading(true); setError("");
    try {
      const params = new URLSearchParams();
      if (search.trim()) params.set("q", search.trim());
      if (nextCursor) { params.set("before", nextCursor.before); params.set("beforeId", nextCursor.beforeId); }
      const response = await fetch(`/api/gyms/${encodeURIComponent(gymId)}/members?${params}`, { cache: "no-store" });
      const payload = await response.json() as { members: MemberRow[]; nextCursor: Cursor; error?: string };
      if (!response.ok) throw new Error(payload.error ?? "Could not load gym members.");
      setMembers((current) => append ? [...current, ...payload.members] : payload.members);
      setCursor(payload.nextCursor);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not load gym members."); }
    finally { setLoading(false); }
  }, [gymId]);

  useEffect(() => {
    const timer = window.setTimeout(() => { void load(query); }, query ? 300 : 0);
    return () => window.clearTimeout(timer);
  }, [load, query]);

  async function saveProfile(event: FormEvent<HTMLFormElement>, member: MemberRow) {
    event.preventDefault(); setBusyId(member.id); setError(""); setNotice("");
    const form = new FormData(event.currentTarget);
    try {
      const response = await fetch(`/api/gyms/${encodeURIComponent(gymId)}/members/${encodeURIComponent(member.id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fullName: form.get("fullName"), phone: String(form.get("phone") ?? "").trim() || null }),
      });
      const payload = await response.json() as { error?: string };
      if (!response.ok) throw new Error(payload.error ?? "Could not update the member profile.");
      setNotice(`${String(form.get("fullName"))}’s gym profile was updated.`);
      await load(query);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not update the member profile."); }
    finally { setBusyId(""); }
  }

  return <section aria-labelledby="member-directory-heading" className="rounded-3xl border border-slate-200 bg-white p-5 shadow-[0_3px_14px_rgba(15,23,42,0.04)] sm:p-7">
    <div className="flex flex-wrap items-end justify-between gap-4"><div><p className="text-xs font-bold uppercase tracking-[0.16em] text-green-700">Member operations</p><h2 id="member-directory-heading" className="mt-2 font-heading text-2xl font-bold text-slate-950">Member directory</h2><p className="mt-1 text-sm leading-6 text-slate-600">Search profiles and view current subscription status. New people join through a verified member invitation.</p></div><div className="inline-flex items-center gap-2 rounded-xl bg-slate-100 px-3 py-2 text-sm font-semibold text-slate-700"><Users size={17} />{members.length}{cursor ? "+" : ""} shown</div></div>
    <label className="relative mt-5 block"><Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" /><span className="sr-only">Search members by name, code or phone</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search name, membership code, or phone" className="min-h-12 w-full rounded-xl border border-slate-300 bg-slate-50 pl-10 pr-10 text-sm outline-none focus:border-green-600 focus:ring-4 focus:ring-green-100" />{query && <button type="button" onClick={() => setQuery("")} aria-label="Clear member search" className="absolute right-2 top-1/2 grid size-8 -translate-y-1/2 place-items-center rounded-lg text-slate-500 hover:bg-white"><X size={16} /></button>}</label>
    {error && <p role="alert" className="mt-4 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">{error}</p>}
    {notice && <p role="status" className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900">{notice}</p>}
    {loading && members.length === 0 && <p role="status" className="mt-4 rounded-xl bg-slate-50 p-5 text-sm text-slate-600">Loading members…</p>}
    {!loading && !error && members.length === 0 && <div className="mt-4 rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-6 text-center"><UserRound className="mx-auto text-slate-400" size={23} /><p className="mt-2 font-semibold text-slate-800">{query ? "No matching members" : "No member profiles yet"}</p><p className="mt-1 text-sm text-slate-600">{query ? "Try a different name, code, or phone number." : "Invite a person with the gym member role. Their profile is created after they verify their account and accept."}</p></div>}
    {members.length > 0 && <ul className="mt-4 grid gap-3 xl:grid-cols-2">{members.map((member) => {
      const sub = member.subscription;
      const active = sub?.status === "active";
      const label = active ? "Active" : sub?.status === "pending" ? "Payment pending" : sub ? "Expired" : "No subscription";
      return <li key={member.id} className="rounded-2xl border border-slate-200 p-4 sm:p-5">
        <div className="flex flex-wrap items-start justify-between gap-3"><div className="min-w-0"><h3 className="truncate font-heading text-lg font-bold text-slate-950">{member.fullName}</h3><p className="mt-1 font-mono text-xs font-semibold tracking-wide text-slate-500">{member.membershipCode}</p></div><span className={`rounded-full px-3 py-1 text-xs font-bold ${active ? "bg-emerald-50 text-emerald-800" : sub?.status === "pending" ? "bg-amber-50 text-amber-800" : "bg-slate-100 text-slate-700"}`}>{label}</span></div>
        <div className="mt-4 grid gap-2 text-sm text-slate-600 sm:grid-cols-2"><p><span className="font-semibold text-slate-700">Phone:</span> {member.phone || "Not provided"}</p><p><span className="font-semibold text-slate-700">Joined:</span> {new Date(member.createdAt).toLocaleDateString("en-NG")}</p><p className="sm:col-span-2"><span className="font-semibold text-slate-700">Plan period:</span> {sub ? `${new Date(sub.startsAt).toLocaleDateString("en-NG")} – ${new Date(sub.expiresAt).toLocaleDateString("en-NG")}` : "No plan history"}</p></div>
        <details className="mt-4 border-t border-slate-100 pt-3"><summary className="min-h-10 cursor-pointer py-2 text-sm font-semibold text-slate-700">Edit gym profile</summary><form className="grid gap-3 pt-2 sm:grid-cols-2" onSubmit={(event) => void saveProfile(event, member)}><label className="grid gap-1 text-xs font-semibold text-slate-600">Full name<input name="fullName" required minLength={2} maxLength={120} defaultValue={member.fullName} className="min-h-10 rounded-lg border border-slate-300 px-3 text-sm font-normal" /></label><label className="grid gap-1 text-xs font-semibold text-slate-600">Phone<input name="phone" maxLength={40} defaultValue={member.phone ?? ""} className="min-h-10 rounded-lg border border-slate-300 px-3 text-sm font-normal" /></label><button disabled={busyId === member.id} className="min-h-10 rounded-lg bg-green-900 px-4 text-sm font-semibold text-white disabled:opacity-60 sm:col-span-2">{busyId === member.id ? "Saving…" : "Save profile"}</button></form></details>
      </li>;
    })}</ul>}
    {cursor && <button type="button" disabled={loading} onClick={() => void load(query, true, cursor)} className="mt-4 min-h-11 rounded-xl border border-slate-300 px-4 text-sm font-semibold text-slate-700 disabled:opacity-60">{loading ? "Loading…" : "Load more members"}</button>}
  </section>;
}
