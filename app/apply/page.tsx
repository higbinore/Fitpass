"use client";

import Link from "next/link";
import Image from "next/image";
import { formatNaira } from "@/lib/money";
import { useEffect, useState, type FormEvent } from "react";
import PublicSiteHeader from "../PublicSiteHeader";

type Package = { id: string; name: string; priceKobo: number; billingInterval: string; activeMemberLimit: number; adminAccountLimit: number };

export default function ApplyPage() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [packages, setPackages] = useState<Package[]>([]);
  const [packagesLoading, setPackagesLoading] = useState(true);
  const [packagesError, setPackagesError] = useState("");
  const [logoPreview, setLogoPreview] = useState("");
  const [photoPreviews, setPhotoPreviews] = useState<string[]>([]);
  useEffect(() => () => { if (logoPreview) URL.revokeObjectURL(logoPreview); photoPreviews.forEach((url) => URL.revokeObjectURL(url)); }, [logoPreview, photoPreviews]);
  useEffect(() => {
    let current = true;
    fetch("/api/platform/public-packages", { cache: "no-store" })
      .then(async (response) => {
        const result = await response.json() as { packages?: Package[]; error?: string };
        if (!response.ok) throw new Error(result.error ?? "FitPass packages are unavailable right now.");
        if (current) {
          setPackages(result.packages ?? []);
          if (result.packages?.length) setPackagesError("");
          else setPackagesError("No packages are available for new gym applications right now.");
        }
      })
      .catch((cause: unknown) => { if (current) setPackagesError(cause instanceof Error ? cause.message : "FitPass packages are unavailable right now."); })
      .finally(() => { if (current) setPackagesLoading(false); });
    return () => { current = false; };
  }, []);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError("");
    const form = new FormData(event.currentTarget);
    try {
      const response = await fetch("/api/gym-applications", { method: "POST", body: form });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error ?? "Could not submit the application.");
      setSubmitted(true);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Please try again later."); }
    finally { setBusy(false); }
  }
  return <main className="mx-auto min-h-dvh w-full max-w-2xl px-4 py-8 sm:px-6">
    <PublicSiteHeader subtitle="Gym applications" />
    <section className="mt-8 rounded-xl border bg-white p-6 sm:p-8">
      <h1 className="font-heading text-2xl font-bold">Apply to bring your gym to FitPass</h1>
      <p className="mt-2 text-base text-muted-foreground">Applications are reviewed by the FitPass team. Sending this form does not create a gym or grant account access.</p>
      {submitted ? <div role="status" className="mt-6 space-y-4 rounded-xl border border-success bg-emerald-50 p-4"><p className="font-semibold text-emerald-950">Application received and awaiting FitPass review.</p><p className="text-sm leading-6 text-emerald-900">Submitting does not create a gym or grant owner access. If approved, the FitPass team will provision the gym and send the first owner a verified-email invitation.</p><div className="flex flex-wrap gap-3"><Link href="/" className="inline-flex min-h-11 items-center rounded-xl bg-primary px-4 font-semibold text-white">Return to FitPass</Link><Link href="/gyms" className="inline-flex min-h-11 items-center rounded-xl border border-emerald-800 px-4 font-semibold text-emerald-950">Browse gyms</Link></div></div> : <form className="mt-6 grid gap-4 sm:grid-cols-2" onSubmit={submit}>
        <label className="grid gap-2 text-base">Gym name<input name="gymName" required maxLength={120} className="min-h-11 rounded-xl border px-3" /></label>
        <label className="grid gap-2 text-base">Preferred public URL<input name="requestedSlug" required pattern="[a-z0-9]+(-[a-z0-9]+)*" maxLength={80} className="min-h-11 rounded-xl border px-3" /></label>
        <label className="grid gap-2 text-base">Your name<input name="applicantName" required maxLength={120} className="min-h-11 rounded-xl border px-3" /></label>
        <label className="grid gap-2 text-base">Your email<input name="applicantEmail" type="email" required maxLength={254} className="min-h-11 rounded-xl border px-3" /></label>
        <label className="grid gap-2 text-base">Phone (optional)<input name="phone" type="tel" maxLength={40} className="min-h-11 rounded-xl border px-3" /></label>
        <label className="grid gap-2 text-base">Gym location (optional)<input name="location" maxLength={180} className="min-h-11 rounded-xl border px-3" /></label>
        <label className="grid gap-2 text-base sm:col-span-2">Preferred FitPass package<select name="preferredPackageId" required disabled={packagesLoading || packages.length === 0} className="min-h-11 rounded-xl border bg-white px-3"><option value="">{packagesLoading ? "Loading available packages…" : "Choose a package"}</option>{packages.map((item) => <option key={item.id} value={item.id}>{item.name} · {formatNaira(item.priceKobo)} / {item.billingInterval} · {item.activeMemberLimit.toLocaleString()} members · {item.adminAccountLimit} admin accounts</option>)}</select>{packagesError && <span role="status" className="text-sm text-amber-800">{packagesError}</span>}<span className="text-xs text-muted-foreground">Your selected package sets your trial limits. The 30-day trial begins only when the first owner activates the invitation.</span></label>
        <label className="grid gap-2 text-base sm:col-span-2">Gym logo<input name="logo" type="file" accept="image/jpeg,image/png,image/webp" required onChange={(event) => setLogoPreview(event.target.files?.[0] ? URL.createObjectURL(event.target.files[0]) : "")} className="min-h-12 rounded-xl border bg-white px-3 py-2 text-sm" /><span className="text-xs text-muted-foreground">JPEG, PNG or WebP. Maximum 1.25 MB.</span>{logoPreview && <Image src={logoPreview} alt="Selected gym logo preview" width={112} height={112} unoptimized className="size-28 rounded-xl border object-cover" />}</label>
        <label className="grid gap-2 text-base sm:col-span-2">Two facility photos<input name="facilityPhotos" type="file" accept="image/jpeg,image/png,image/webp" multiple required onChange={(event) => setPhotoPreviews(Array.from(event.target.files ?? []).map((file) => URL.createObjectURL(file)))} className="min-h-12 rounded-xl border bg-white px-3 py-2 text-sm" /><span className="text-xs text-muted-foreground">Select exactly two photos. Each image may be up to 1.25 MB; the combined limit is 3.75 MB.</span>{photoPreviews.length > 0 && <div className="grid grid-cols-2 gap-3">{photoPreviews.map((url, index) => <Image key={url} src={url} alt={`Selected facility photo ${index + 1} preview`} width={640} height={360} unoptimized className="aspect-video w-full rounded-xl border object-cover" />)}</div>}</label>
        <label aria-hidden="true" className="absolute -left-[10000px] h-px w-px overflow-hidden">Website<input name="website" tabIndex={-1} autoComplete="off" /></label>
        {error && <p role="alert" className="text-danger sm:col-span-2">{error}</p>}
        <button disabled={busy || packagesLoading || packages.length === 0} className="min-h-11 rounded-xl bg-primary px-5 font-semibold text-white disabled:opacity-60 sm:col-span-2">{busy ? "Submitting…" : "Submit application for review"}</button>
      </form>}
    </section>
  </main>;
}
