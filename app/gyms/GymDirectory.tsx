"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { formatNaira } from "@/lib/money";

type Gym = { id: string; name: string; slug: string; location: string | null; logoUrl: string | null; facilityPhotoUrls: string[]; startingPriceKobo: number | null; latitude: number | null; longitude: number | null; locationVerifiedAt: string | null };
type DirectoryResult = { gyms?: Gym[]; total?: number; page?: number; pageSize?: number; hasMore?: boolean; error?: string };

export default function GymDirectory() {
  const [query, setQuery] = useState("");
  const [minPrice, setMinPrice] = useState("");
  const [maxPrice, setMaxPrice] = useState("");
  const [page, setPage] = useState(1);
  const [gyms, setGyms] = useState<Gym[] | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [total, setTotal] = useState(0);
  const [error, setError] = useState("");
  const [mapGymId, setMapGymId] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      const params = new URLSearchParams({ q: query, page: String(page), pageSize: "12" });
      if (minPrice) params.set("minPrice", minPrice);
      if (maxPrice) params.set("maxPrice", maxPrice);
      void fetch(`/api/gyms?${params}`, { cache: "no-store", signal: controller.signal })
        .then(async (response) => {
          const result = await response.json() as DirectoryResult;
          if (!response.ok) throw new Error(result.error ?? "Could not load gyms.");
          setGyms(result.gyms ?? []);
          setHasMore(Boolean(result.hasMore));
          setTotal(result.total ?? 0);
          setError("");
        })
        .catch((cause: unknown) => { if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : "Could not load gyms."); });
    }, 180);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [query, minPrice, maxPrice, page]);

  function changeFilter(setter: (value: string) => void, value: string) {
    setter(value);
    setPage(1);
    setGyms(null);
  }

  return <>
    <div className="mt-7 grid gap-3 rounded-2xl border border-slate-200 bg-white p-4 sm:grid-cols-2 sm:p-5">
      <label className="grid gap-2 text-sm font-semibold text-slate-700 sm:col-span-2">Search by gym name or location<input value={query} onChange={(event) => changeFilter(setQuery, event.target.value)} maxLength={80} className="min-h-12 w-full rounded-xl border border-slate-300 bg-white px-4 text-base font-normal outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/30" placeholder="For example, GRA or Benin City" /></label>
      <label className="grid gap-2 text-sm font-semibold text-slate-700">Minimum plan price (₦)<input inputMode="decimal" value={minPrice} onChange={(event) => changeFilter(setMinPrice, event.target.value)} className="min-h-12 w-full rounded-xl border border-slate-300 px-4 text-base font-normal" placeholder="Any minimum" /></label>
      <label className="grid gap-2 text-sm font-semibold text-slate-700">Maximum plan price (₦)<input inputMode="decimal" value={maxPrice} onChange={(event) => changeFilter(setMaxPrice, event.target.value)} className="min-h-12 w-full rounded-xl border border-slate-300 px-4 text-base font-normal" placeholder="Any maximum" /></label>
      <p className="text-xs text-slate-500 sm:col-span-2">Price filters match gyms with at least one active plan in the selected range. Amounts come from each gym’s published plans.</p>
    </div>
    {error && <p role="alert" className="mt-5 rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">{error}</p>}
    {!gyms && !error && <p role="status" className="mt-5 rounded-xl border bg-white p-4 text-sm text-slate-600">Loading available gyms…</p>}
    {gyms?.length === 0 && !error && <div className="mt-5 rounded-2xl border border-dashed border-slate-300 bg-white p-7 text-center"><h2 className="font-heading text-lg font-bold">No gyms found</h2><p className="mt-2 text-sm text-slate-600">Try another name, location or plan price range.</p></div>}
    {gyms && gyms.length > 0 && <><p className="mt-4 text-sm text-slate-600" aria-live="polite">Page {page} · {total} matching {total === 1 ? "gym" : "gyms"}</p><ul className="mt-3 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{gyms.map((gym) => <li key={gym.id} className="flex min-w-0 flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">{gym.facilityPhotoUrls?.[0] ? <Image src={gym.facilityPhotoUrls[0]} alt={`${gym.name} facility`} width={720} height={420} unoptimized className="aspect-[12/7] w-full object-cover" /> : gym.logoUrl ? <div className="grid aspect-[12/7] place-items-center bg-green-50 p-6"><Image src={gym.logoUrl} alt={`${gym.name} logo`} width={120} height={120} unoptimized className="size-24 rounded-2xl border border-white object-cover shadow-sm" /></div> : <div className="grid aspect-[12/7] place-items-center bg-green-50 px-4 text-center text-sm font-medium text-green-900">Gym photos will appear here when published</div>}<div className="flex flex-1 flex-col p-5"><p className="text-xs font-bold uppercase tracking-wide text-green-700">Available on FitPass</p><h2 className="mt-2 break-words font-heading text-xl font-bold text-slate-950">{gym.name}</h2><p className="mt-1 min-h-6 text-sm text-slate-600">{gym.location || "Location details available from the gym"}</p><p className="mt-4 text-sm text-slate-500">{gym.startingPriceKobo === null ? "No active plans published" : <>Plans from <span className="font-semibold text-slate-950">{formatNaira(gym.startingPriceKobo)}</span></>}</p><Link href={`/gyms/${encodeURIComponent(gym.id)}`} className="mt-5 inline-flex min-h-11 items-center justify-center rounded-xl bg-primary px-4 font-semibold text-primary-foreground hover:bg-primary/90">View gym profile</Link></div></li>)}</ul><nav aria-label="Gym results pages" className="mt-6 flex items-center justify-between gap-3"><button type="button" disabled={page <= 1} onClick={() => setPage((current) => Math.max(1, current - 1))} className="min-h-11 rounded-xl border border-slate-300 px-4 font-semibold disabled:opacity-40">Previous</button><span className="text-sm text-slate-600">Page {page}</span><button type="button" disabled={!hasMore} onClick={() => setPage((current) => current + 1)} className="min-h-11 rounded-xl border border-slate-300 px-4 font-semibold disabled:opacity-40">Next</button></nav></>}
    {gyms && gyms.length > 0 && <section aria-labelledby="gym-map-title" className="mt-6 rounded-2xl border border-slate-200 bg-white p-4 sm:p-5"><div className="flex flex-wrap items-start justify-between gap-3"><div><h2 id="gym-map-title" className="font-heading text-lg font-bold text-slate-950">Map-backed gym discovery</h2><p className="mt-1 text-sm text-slate-600">Map previews use verified gym coordinates only.</p></div><label className="grid min-w-0 gap-1 text-xs font-semibold text-slate-600 sm:min-w-64">Choose a gym with verified location<select value={mapGymId ?? ""} onChange={(event) => setMapGymId(event.target.value || null)} className="min-h-11 rounded-xl border border-slate-300 bg-white px-3 text-sm font-normal"><option value="">Select a verified gym</option>{gyms.filter((gym) => gym.locationVerifiedAt && gym.latitude !== null && gym.longitude !== null).map((gym) => <option key={gym.id} value={gym.id}>{gym.name}</option>)}</select></label></div>{(() => { const selected = gyms.find((gym) => gym.id === mapGymId); const mapsKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY; return selected?.locationVerifiedAt && selected.latitude !== null && selected.longitude !== null && mapsKey ? <iframe title={`Map of ${selected.name}`} loading="lazy" referrerPolicy="no-referrer-when-downgrade" className="mt-4 aspect-video w-full rounded-xl border border-slate-200" src={`https://www.google.com/maps/embed/v1/place?key=${encodeURIComponent(mapsKey)}&q=${selected.latitude}%2C${selected.longitude}`} /> : <p role="status" className="mt-4 rounded-xl bg-slate-50 p-4 text-sm leading-6 text-slate-600">{!mapsKey ? "Map display is not configured yet. The directory remains searchable and shows each gym’s listed location." : gyms.some((gym) => gym.locationVerifiedAt && gym.latitude !== null && gym.longitude !== null) ? "Choose a gym to view its verified location." : "No gyms on this results page have platform-verified coordinates yet. No map markers are shown."}</p>; })()}</section>}
  </>;
}
