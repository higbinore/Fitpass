import { and, eq, isNull } from "drizzle-orm";
import { Building2, ChevronRight, CircleUserRound, Dumbbell, ShieldCheck } from "lucide-react";
import { headers } from "next/headers";
import Link from "next/link";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";

import { getAuth } from "@/lib/auth";
import { AuthorizationError, requirePlatformAdmin } from "@/lib/authz";
import { getDb } from "@/lib/db";
import { gyms, gymMembershipRoles, gymMemberships } from "@/lib/schema";

type Workspace = { id: string; name: string; status: string; roles: Set<string> };

const roleDetails: Record<string, { label: string; description: string; path: string }> = {
  gym_owner: { label: "Gym owner", description: "Manage memberships, plans, invitations, and gym operations.", path: "owner" },
  gym_desk_staff: { label: "Front desk", description: "Look up membership codes and record valid check-ins.", path: "desk" },
  gym_member: { label: "My membership", description: "View your membership, payments, and recent visits.", path: "member" },
};

async function DashboardContent() {
  await connection();
  const session = await getAuth().api.getSession({ headers: await headers() });
  if (!session?.user?.id) redirect("/sign-in?next=%2Fdashboard");
  if (!session.user.emailVerified) {
    return <main className="grid min-h-dvh place-items-center bg-background px-4 py-10">
      <section className="w-full max-w-lg rounded-3xl border border-slate-200 bg-white p-8 shadow-sm">
        <p className="font-heading text-xl font-bold text-slate-950">Fit<span className="text-green-600">Pass</span></p>
        <h1 className="mt-8 font-heading text-2xl font-bold text-slate-950">Verify your email to continue</h1>
        <p className="mt-3 text-slate-600">Open the verification link we sent to your email address, then sign in to see the FitPass workspaces linked to your account.</p>
        <Link href="/sign-in?next=%2Fdashboard" className="mt-6 inline-flex min-h-11 items-center rounded-xl bg-green-900 px-5 font-semibold text-white">Return to sign in</Link>
      </section>
    </main>;
  }

  let isPlatformAdmin = false;
  try {
    await requirePlatformAdmin();
    isPlatformAdmin = true;
  } catch (error) {
    if (!(error instanceof AuthorizationError)) throw error;
  }

  const rows = await getDb().select({ gymId: gyms.id, gymName: gyms.name, gymStatus: gyms.status, role: gymMembershipRoles.role })
    .from(gymMemberships)
    .innerJoin(gyms, eq(gyms.id, gymMemberships.gymId))
    .innerJoin(gymMembershipRoles, and(
      eq(gymMembershipRoles.gymId, gymMemberships.gymId),
      eq(gymMembershipRoles.membershipId, gymMemberships.id),
    ))
    .where(and(
      eq(gymMemberships.userId, session.user.id),
      eq(gymMemberships.status, "active"),
      isNull(gymMembershipRoles.revokedAt),
    ));

  const workspaces = new Map<string, Workspace>();
  for (const row of rows) {
    const workspace = workspaces.get(row.gymId) ?? { id: row.gymId, name: row.gymName, status: row.gymStatus, roles: new Set<string>() };
    workspace.roles.add(row.role);
    workspaces.set(row.gymId, workspace);
  }

  return <div className="min-h-dvh overflow-x-clip bg-background text-slate-900 lg:flex">
    <aside className="hidden w-64 shrink-0 flex-col bg-green-900 px-5 py-7 text-white lg:flex">
      <Link href="/" aria-label="FitPass home" className="font-heading text-2xl font-bold tracking-tight">Fit<span className="text-green-400">Pass</span></Link>
      <p className="mt-2 text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Gym management</p>
      <nav className="mt-12 space-y-2" aria-label="Workspace navigation">
        <div className="flex min-h-11 items-center gap-3 rounded-xl bg-white/10 px-3 text-sm font-semibold"><Dumbbell size={18} className="text-green-400" />Your workspaces</div>
        {isPlatformAdmin && <Link href="/admin" className="flex min-h-11 items-center gap-3 rounded-xl px-3 text-sm text-slate-300 transition hover:bg-white/10 hover:text-white"><ShieldCheck size={18} />Platform admin</Link>}
      </nav>
      <div className="mt-auto rounded-2xl border border-white/10 bg-white/5 p-4"><p className="text-xs font-semibold uppercase tracking-wider text-green-300">One account</p><p className="mt-2 text-sm leading-6 text-slate-300">Your access is based on verified roles for each gym.</p></div>
    </aside>

    <main className="min-w-0 flex-1 px-4 py-5 sm:px-7 sm:py-8 lg:px-10">
      <header className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 pb-5">
        <div className="flex items-center gap-3"><span className="grid size-11 place-items-center rounded-2xl bg-green-900 font-heading text-lg font-bold text-white lg:hidden">F<span className="text-green-400">P</span></span><div><p className="text-sm font-medium text-slate-500">FitPass workspace</p><p className="font-semibold text-slate-900">Choose where to work</p></div></div>
        <div className="flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-2 text-sm text-slate-600"><CircleUserRound size={17} aria-hidden="true" /><span className="max-w-48 truncate">{session.user.name || session.user.email}</span></div>
      </header>

      <section className="mx-auto min-w-0 max-w-6xl py-9 sm:py-12">
        <div className="max-w-2xl"><p className="text-xs font-bold uppercase tracking-[0.2em] text-green-700">Your FitPass</p><h1 className="mt-3 font-heading text-3xl font-bold tracking-tight text-slate-950 sm:text-4xl">Good to see you{session.user.name ? `, ${session.user.name.split(" ")[0]}` : ""}.</h1><p className="mt-3 text-base leading-7 text-slate-600">Open a workspace using the roles currently assigned to your account.</p></div>

        <div className="mt-8 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {isPlatformAdmin && <Link href="/admin" className="group rounded-3xl bg-green-900 p-6 text-white shadow-sm transition hover:-translate-y-0.5 hover:shadow-lg focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-green-500">
            <div className="flex items-start justify-between"><span className="grid size-12 place-items-center rounded-2xl bg-orange-500 text-slate-950"><ShieldCheck size={22} /></span><ChevronRight className="text-slate-400 transition group-hover:translate-x-1 group-hover:text-green-300" /></div>
            <p className="mt-8 text-xs font-bold uppercase tracking-[0.18em] text-green-300">Platform</p><h2 className="mt-2 font-heading text-2xl font-bold">Admin control centre</h2><p className="mt-2 text-sm leading-6 text-slate-300">Review applications, manage gyms and packages, and monitor platform activity.</p>
          </Link>}

          {[...workspaces.values()].flatMap((workspace) => [...workspace.roles].filter((role) => role in roleDetails).map((role) => {
            const detail = roleDetails[role];
            const historical = workspace.status === "archived";
            const disabled = historical && role === "gym_desk_staff";
            return <article key={`${workspace.id}:${role}`} className="rounded-3xl border border-slate-200 bg-white p-6 shadow-[0_3px_14px_rgba(15,23,42,0.04)]">
              <div className="flex items-start justify-between gap-3"><span className="grid size-12 place-items-center rounded-2xl bg-green-100 text-slate-950"><Building2 size={21} /></span><span className={`rounded-full px-3 py-1 text-xs font-semibold ${historical ? "bg-slate-100 text-slate-600" : "bg-emerald-50 text-emerald-700"}`}>{historical ? "Archived gym" : "Active gym"}</span></div>
              <p className="mt-6 text-xs font-bold uppercase tracking-[0.16em] text-slate-500">{detail.label}</p><h2 className="mt-1 font-heading text-xl font-bold text-slate-950">{workspace.name}</h2><p className="mt-2 min-h-12 text-sm leading-6 text-slate-600">{detail.description}</p>
              {disabled ? <p className="mt-5 rounded-xl bg-slate-50 px-3 py-2 text-sm text-slate-600">Check-ins are unavailable for archived gyms.</p> : <Link href={`/gyms/${workspace.id}/${detail.path}`} className="mt-5 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-green-900 px-4 text-sm font-semibold text-white transition hover:bg-green-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-green-500">Open {detail.label.toLowerCase()} workspace<ChevronRight size={17} /></Link>}
            </article>;
          }))}

          {!isPlatformAdmin && workspaces.size === 0 && <article className="rounded-3xl border border-dashed border-slate-300 bg-white p-7 md:col-span-2 xl:col-span-3"><span className="grid size-12 place-items-center rounded-2xl bg-slate-100 text-slate-700"><Building2 size={21} /></span><h2 className="mt-5 font-heading text-xl font-bold text-slate-950">No gym workspace is linked yet</h2><p className="mt-2 max-w-xl text-sm leading-6 text-slate-600">Gym access is granted through an approved application or a verified invitation. If you have just accepted an invitation, refresh this page. Public registration cannot grant staff or owner access.</p><Link href="/apply" className="mt-5 inline-flex min-h-11 items-center rounded-xl bg-green-900 px-5 text-sm font-semibold text-white">Apply to list a gym<ChevronRight className="ml-2" size={17} /></Link></article>}
        </div>

        <footer className="mt-10 flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 pt-5 text-sm text-slate-500"><p>Access follows your current FitPass gym roles.</p><Link href="/" className="font-semibold text-slate-700 underline underline-offset-4">Back to public site</Link></footer>
      </section>
    </main>
  </div>;
}

export default function DashboardHome() {
  return <Suspense fallback={<main className="grid min-h-dvh place-items-center bg-background px-4 text-slate-600">Loading your FitPass workspaces…</main>}><DashboardContent /></Suspense>;
}
