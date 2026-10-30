import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";

import { AuthorizationError, requireActiveGymDeskStaff } from "@/lib/authz";
import DeskCheckin from "./DeskCheckin";

async function DeskContent({ params }: { params: Promise<{ gymId: string }> }) {
  const { gymId } = await params;
  try { await requireActiveGymDeskStaff(gymId); }
  catch (error) {
    if (error instanceof AuthorizationError) redirect("/sign-in?next=" + encodeURIComponent(`/gyms/${gymId}/desk`));
    throw error;
  }
  return <main className="min-h-dvh overflow-x-clip bg-background px-4 py-5 sm:px-6 sm:py-8">
    <div className="mx-auto max-w-6xl">
      <header className="flex items-center justify-between border-b border-slate-200 pb-5"><Link href="/" className="font-heading text-xl font-bold tracking-tight text-slate-950">Fit<span className="text-green-600">Pass</span></Link><span className="text-xs font-medium text-slate-500">Benin City · Front desk</span></header>
      <div className="mt-7"><p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-500">Staff workspace</p><h1 className="mt-2 font-heading text-2xl font-bold text-slate-950 sm:text-3xl">Gym check-in</h1><p className="mt-2 text-sm text-slate-600 sm:text-base">Verify membership status before recording a visit.</p></div>
      <DeskCheckin gymId={gymId} />
    </div>
  </main>;
}

export default function DeskPage({ params }: { params: Promise<{ gymId: string }> }) {
  return <Suspense fallback={<main className="grid min-h-dvh place-items-center bg-background px-4 text-center text-muted-foreground">Loading gym desk…</main>}><DeskContent params={params} /></Suspense>;
}
