import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";

import { AuthorizationError, requireGymMember } from "@/lib/authz";
import MemberRecords from "./MemberRecords";

async function MemberContent({ params }: { params: Promise<{ gymId: string }> }) {
  const { gymId } = await params;
  try { await requireGymMember(gymId); }
  catch (error) {
    if (error instanceof AuthorizationError) redirect("/sign-in?next=" + encodeURIComponent(`/gyms/${gymId}/member`));
    throw error;
  }
  return <main className="min-h-dvh overflow-x-clip bg-background px-4 py-5 sm:px-6 sm:py-8">
    <div className="mx-auto max-w-6xl">
      <header className="flex items-center justify-between border-b border-slate-200 pb-5"><Link href="/" className="font-heading text-xl font-bold tracking-tight text-slate-950">Fit<span className="text-green-600">Pass</span></Link><Link href="/dashboard" className="min-h-11 rounded-xl px-3 py-2 text-sm font-semibold text-slate-600 hover:bg-white">All workspaces</Link></header>
      <div className="mt-7"><p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-500">Member workspace</p><h1 className="mt-2 font-heading text-2xl font-bold text-slate-950 sm:text-3xl">My gym membership</h1><p className="mt-2 text-sm text-slate-600 sm:text-base">Your membership, payments, and visit history in one place.</p></div>
      <MemberRecords gymId={gymId} />
    </div>
  </main>;
}

export default function MemberPage({ params }: { params: Promise<{ gymId: string }> }) {
  return <Suspense fallback={<main className="grid min-h-dvh place-items-center bg-background px-4 text-center text-muted-foreground">Loading membership…</main>}><MemberContent params={params} /></Suspense>;
}
