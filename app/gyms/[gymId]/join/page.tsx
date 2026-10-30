import { headers } from "next/headers";
import Link from "next/link";
import { Suspense } from "react";

import { getAuth } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { gyms } from "@/lib/schema";
import { eq } from "drizzle-orm";
import JoinGym from "./JoinGym";

async function JoinGymContent({ params, searchParams }: { params: Promise<{ gymId: string }>; searchParams: Promise<{ plan?: string }> }) {
  const [{ gymId }, query] = await Promise.all([params, searchParams]);
  const [gym] = await getDb().select({ id: gyms.id, name: gyms.name, status: gyms.status }).from(gyms).where(eq(gyms.id, gymId)).limit(1);
  if (!gym || gym.status !== "active") return <main className="mx-auto max-w-2xl px-4 py-10"><p role="alert">This gym is not accepting new memberships.</p></main>;
  let signedIn = false;
  try { signedIn = Boolean((await getAuth().api.getSession({ headers: await headers() }))?.user?.emailVerified); } catch { signedIn = false; }
  const next = `/gyms/${encodeURIComponent(gymId)}/join${query.plan ? `?plan=${encodeURIComponent(query.plan)}` : ""}`;
  return <main className="mx-auto min-h-dvh w-full max-w-3xl space-y-6 px-4 py-8 sm:px-6">
    <Link href="/" className="font-heading text-xl font-bold text-primary">FitPass</Link>
    <header className="mt-6"><p className="text-sm font-semibold uppercase tracking-wide text-primary">Join FitPass</p><h1 className="mt-2 font-heading text-3xl font-bold">{gym.name}</h1><p className="mt-2 text-base text-muted-foreground">Create your member profile, choose a gym plan, and complete payment securely.</p></header>
    {signedIn ? <JoinGym gymId={gymId} initialPlanId={query.plan} /> : <section className="rounded-xl border bg-white p-5"><p className="text-base">Sign in or create an account with a verified email address to view this gym’s plans and join.</p><div className="mt-4 flex flex-wrap gap-3"><Link className="min-h-11 rounded-xl bg-primary px-5 py-3 font-semibold text-white" href={`/member/login?next=${encodeURIComponent(next)}`}>Member sign in</Link><Link className="min-h-11 rounded-xl border border-primary px-5 py-3 font-semibold text-primary" href={`/sign-up?next=${encodeURIComponent(next)}`}>Create account</Link></div></section>}
  </main>;
}

export default function JoinGymPage({ params, searchParams }: { params: Promise<{ gymId: string }>; searchParams: Promise<{ plan?: string }> }) {
  return <Suspense fallback={<main className="grid min-h-dvh place-items-center">Loading gym…</main>}><JoinGymContent params={params} searchParams={searchParams} /></Suspense>;
}
