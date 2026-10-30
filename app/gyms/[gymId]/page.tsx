import { and, asc, eq, gt, inArray } from "drizzle-orm";
import { MapPin, Phone, Mail } from "lucide-react";
import { connection } from "next/server";
import Link from "next/link";
import Image from "next/image";
import { Suspense } from "react";
import { notFound } from "next/navigation";

import { getDb } from "@/lib/db";
import { formatNaira } from "@/lib/money";
import { gyms, plans, platformSubscriptions } from "@/lib/schema";
import PublicSiteHeader from "../../PublicSiteHeader";

async function GymProfile({ gymId }: { gymId: string }) {
  await connection();
  const db = getDb();
  const now = new Date();
  const [gym] = await db.select({ id: gyms.id, name: gyms.name, slug: gyms.slug, location: gyms.location, latitude: gyms.latitude, longitude: gyms.longitude, locationVerifiedAt: gyms.locationVerifiedAt, contactPhone: gyms.contactPhone, contactEmail: gyms.contactEmail, logoUrl: gyms.logoUrl, facilityPhotoUrls: gyms.facilityPhotoUrls })
    .from(gyms).where(and(eq(gyms.id, gymId), eq(gyms.status, "active"))).limit(1);
  if (!gym) notFound();

  const [eligible] = await db.select({ id: platformSubscriptions.id }).from(platformSubscriptions)
    .where(and(eq(platformSubscriptions.gymId, gymId), inArray(platformSubscriptions.status, ["active", "trialing"]), gt(platformSubscriptions.currentPeriodEnd, now))).limit(1);
  if (!eligible) notFound();

  const availablePlans = await db.select({ id: plans.id, name: plans.name, durationDays: plans.durationDays, priceKobo: plans.priceKobo, description: plans.description })
    .from(plans).where(and(eq(plans.gymId, gymId), eq(plans.isActive, true))).orderBy(asc(plans.sortOrder), asc(plans.priceKobo));

  return <main className="mx-auto min-h-dvh w-full max-w-6xl px-4 py-6 sm:px-6 lg:px-8">
    <PublicSiteHeader subtitle="Gym profile" />
    <section className="mt-5 overflow-hidden rounded-3xl border bg-white shadow-sm">
      <div className="bg-green-900 px-6 py-10 text-white sm:px-10 sm:py-14">{gym.logoUrl && <Image src={gym.logoUrl} alt={`${gym.name} logo`} width={96} height={96} unoptimized className="mb-5 size-20 rounded-2xl border border-white/20 object-cover" />}<p className="text-xs font-bold uppercase tracking-[0.2em] text-green-300">FitPass gym profile</p><h1 className="mt-3 break-words font-heading text-3xl font-bold sm:text-5xl">{gym.name}</h1><p className="mt-4 flex items-start gap-2 text-sm leading-6 text-slate-200 sm:text-base"><MapPin size={18} className="mt-1 shrink-0 text-green-300" />{gym.location || "The gym has not published a location yet."}</p><div className="mt-7 flex flex-wrap gap-3"><Link href={`/gyms/${encodeURIComponent(gym.id)}/join`} className="inline-flex min-h-12 items-center justify-center rounded-xl bg-orange-500 px-5 font-bold text-slate-950 hover:bg-orange-600">View membership plans</Link>{gym.contactPhone && <a href={`tel:${gym.contactPhone}`} className="inline-flex min-h-12 items-center gap-2 rounded-xl border border-white/20 px-4 font-semibold text-white hover:bg-white/10"><Phone size={16} />Contact gym</a>}</div></div>
      <div className="grid gap-5 p-5 sm:p-8 lg:grid-cols-[1.1fr_0.9fr]">
        <section aria-labelledby="profile-location-title" className="rounded-2xl border border-slate-200 bg-slate-50 p-5">
          <div className="flex items-center gap-2"><MapPin className="text-green-700" size={20} /><h2 id="profile-location-title" className="font-heading text-lg font-bold text-slate-950">Gym location</h2></div>
          <p className="mt-3 text-sm leading-6 text-slate-700">{gym.location || "No location has been provided."}</p>
          {gym.locationVerifiedAt && gym.latitude !== null && gym.longitude !== null && process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ? <iframe title={`Map showing verified location of ${gym.name}`} loading="lazy" referrerPolicy="no-referrer-when-downgrade" className="mt-4 aspect-video w-full rounded-xl border border-slate-200" src={`https://www.google.com/maps/embed/v1/view?key=${encodeURIComponent(process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY)}&center=${gym.latitude}%2C${gym.longitude}&zoom=16`} /> : <p role="status" className="mt-4 rounded-xl border border-slate-200 bg-white p-3 text-sm leading-6 text-slate-600">{!gym.locationVerifiedAt || gym.latitude === null || gym.longitude === null ? "Map preview is unavailable because this gym does not yet have verified coordinates." : "Map preview is unavailable because NEXT_PUBLIC_GOOGLE_MAPS_API_KEY is not configured."} No marker is shown until both verified coordinates and a restricted Google Maps embed key are available. Please confirm directions with the gym before travelling.</p>}
          {gym.locationVerifiedAt && gym.latitude !== null && gym.longitude !== null && <a href={`https://www.google.com/maps/dir/?api=1&destination=${gym.latitude}%2C${gym.longitude}`} target="_blank" rel="noreferrer" className="mt-3 inline-flex min-h-11 items-center rounded-xl border border-primary px-4 text-sm font-semibold text-primary hover:bg-green-50">Get directions in Google Maps</a>}
          {gym.contactEmail && <a href={`mailto:${gym.contactEmail}`} className="mt-4 inline-flex min-h-11 items-center gap-2 font-semibold text-primary underline underline-offset-4"><Mail size={16} />Email the gym</a>}
        </section>
        <section aria-labelledby="photos-title" className="rounded-2xl border border-slate-200 bg-slate-50 p-5">
          <h2 id="photos-title" className="font-heading text-lg font-bold text-slate-950">Gym photos</h2>
          {gym.facilityPhotoUrls.length ? <div className="mt-3 grid gap-3 sm:grid-cols-2">{gym.facilityPhotoUrls.map((url, index) => <Image key={url} src={url} alt={`${gym.name} facility photo ${index + 1}`} width={640} height={360} unoptimized className="aspect-video w-full rounded-xl border border-slate-200 object-cover" />)}</div> : <p className="mt-3 rounded-xl border border-dashed border-slate-300 bg-white p-4 text-sm leading-6 text-slate-600">No facility photos have been published yet.</p>}
        </section>
      </div>
    </section>

    <section id="membership-plans" className="mt-8 scroll-mt-6">
      <div><p className="text-xs font-bold uppercase tracking-[0.18em] text-green-700">Plans set by this gym</p><h2 className="mt-2 font-heading text-2xl font-bold text-slate-950 sm:text-3xl">Membership prices</h2><p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">Compare this gym’s currently active plans. FitPass membership and payment information is separate from the gym’s own offers.</p></div>
      {availablePlans.length === 0 ? <div className="mt-5 rounded-2xl border border-dashed border-slate-300 bg-white p-7 text-center"><h3 className="font-semibold text-slate-900">No active plans published</h3><p className="mt-2 text-sm text-slate-600">Contact the gym for current membership availability.</p></div> : <ul className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{availablePlans.map((plan) => <li key={plan.id} className="flex flex-col rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><h3 className="font-heading text-lg font-bold text-slate-950">{plan.name}</h3>{plan.description && <p className="mt-2 min-h-10 text-sm leading-5 text-slate-600">{plan.description}</p>}<p className="mt-4 font-heading text-2xl font-bold text-slate-950">{formatNaira(plan.priceKobo)}</p><p className="mt-1 text-sm text-slate-500">{plan.durationDays} {plan.durationDays === 1 ? "day" : "days"}</p><Link href={`/gyms/${encodeURIComponent(gym.id)}/join?plan=${encodeURIComponent(plan.id)}`} className="mt-5 inline-flex min-h-11 items-center justify-center rounded-xl bg-primary px-4 font-semibold text-primary-foreground hover:bg-primary/90">Choose this plan</Link></li>)}</ul>}
    </section>
  </main>;
}

async function GymProfilePageContent({ params }: { params: Promise<{ gymId: string }> }) {
  const { gymId } = await params;
  return <GymProfile gymId={gymId} />;
}

export default function GymProfilePage({ params }: { params: Promise<{ gymId: string }> }) {
  return <Suspense fallback={<main className="grid min-h-dvh place-items-center bg-background px-4 text-center text-muted-foreground">Loading gym profile…</main>}><GymProfilePageContent params={params} /></Suspense>;
}
