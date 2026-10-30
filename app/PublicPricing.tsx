"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { formatNaira } from "@/lib/money";
import { FIXED_FITPASS_PACKAGES } from "@/lib/platform-package-policy";

type Package = {
  id: string;
  name: string;
  priceKobo: number;
  billingInterval: string;
  activeMemberLimit: number;
  adminAccountLimit: number;
  features: Record<string, boolean>;
};

function featureName(value: string) {
  return value.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export default function PublicPricing() {
  const [packages, setPackages] = useState<Package[] | null>(null);
  const [catalogNotice, setCatalogNotice] = useState("");

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void fetch("/api/platform/public-packages", { cache: "no-store" })
        .then(async (response) => {
          const result = await response.json() as { packages?: Package[]; error?: string };
          if (!response.ok) throw new Error(result.error ?? "FitPass package pricing is unavailable.");
          const configured = result.packages ?? [];
          const approvedCatalog = FIXED_FITPASS_PACKAGES.map((item) => {
            const stored = configured.find((candidate) => candidate.name === item.name);
            return { ...item, id: stored?.id ?? item.name, features: stored?.features ?? {} };
          });
          setPackages(approvedCatalog);
          if (configured.length !== FIXED_FITPASS_PACKAGES.length) setCatalogNotice("These are the approved monthly package terms. Live package records are not fully available, so gym subscription enrollment may be unavailable.");
        })
        .catch(() => {
          setPackages(FIXED_FITPASS_PACKAGES.map((item) => ({ ...item, id: item.name, features: {} })));
          setCatalogNotice("These are the approved monthly package terms. Live package records are not available, so gym subscription enrollment may be unavailable.");
        });
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  return <section id="gym-pricing" className="mt-16 scroll-mt-6 rounded-[2rem] bg-primary p-6 text-primary-foreground sm:p-9 lg:p-10">
    <div className="flex flex-wrap items-end justify-between gap-5">
      <div className="max-w-2xl"><p className="text-sm font-bold uppercase tracking-widest text-green-300">For gym operators</p><h2 className="mt-2 text-3xl text-white sm:text-4xl">FitPass platform pricing</h2><p className="mt-3 text-base leading-7 text-white/75">These monthly packages are paid by gyms using FitPass. They are separate from each gym’s own member plans and membership payments.</p></div>
      <Link href="/apply" className="inline-flex min-h-11 items-center justify-center rounded-xl bg-accent px-5 font-bold text-accent-foreground hover:bg-accent/90">Register your gym</Link>
    </div>

    {!packages && <p role="status" className="mt-6 rounded-xl border border-white/15 bg-white/5 p-4 text-sm text-white/80">Loading approved FitPass packages…</p>}
    {catalogNotice && <p role="status" className="mt-6 rounded-xl border border-amber-200/30 bg-amber-50/10 p-4 text-sm leading-6 text-white">{catalogNotice}</p>}
    {packages && packages.length > 0 && <ul className="mt-7 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{packages.map((item) => {
      const enabledFeatures = Object.entries(item.features ?? {}).filter(([, enabled]) => enabled).map(([key]) => featureName(key));
      return <li key={item.id} className="flex min-w-0 flex-col rounded-2xl border border-white/15 bg-white p-5 text-slate-900 shadow-sm">
        <h3 className="font-heading text-xl font-bold">{item.name}</h3>
        <p className="mt-3 font-heading text-2xl font-bold">{formatNaira(item.priceKobo)}<span className="ml-1 text-sm font-medium text-slate-500">/{item.billingInterval}</span></p>
        <dl className="mt-5 grid gap-3 border-t border-slate-100 pt-4 text-sm">
          <div className="flex items-start justify-between gap-3"><dt className="text-slate-600">Active members</dt><dd className="text-right font-bold">{item.activeMemberLimit.toLocaleString()}</dd></div>
          <div className="flex items-start justify-between gap-3"><dt className="text-slate-600">Admin accounts</dt><dd className="text-right font-bold">{item.adminAccountLimit}</dd></div>
        </dl>
        <div className="mt-4 flex-1 border-t border-slate-100 pt-4"><p className="text-xs font-bold uppercase tracking-wide text-slate-500">Configured features</p>{enabledFeatures.length ? <ul className="mt-2 space-y-1.5">{enabledFeatures.map((feature) => <li key={feature} className="text-sm text-slate-700">✓ {feature}</li>)}</ul> : <p className="mt-2 text-sm leading-5 text-slate-600">Ask FitPass about the features available for this package.</p>}</div>
      </li>;
    })}</ul>}
    <p className="mt-5 text-sm text-white/75">Custom negotiated pricing or discounts may be arranged where applicable. Final pricing is confirmed with FitPass.</p>
  </section>;
}
