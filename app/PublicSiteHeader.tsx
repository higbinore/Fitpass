"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  Building2, CircleDollarSign, Dumbbell, House, Info, Mail, MapPinned,
  Menu, Sparkles, UserRound, UserRoundCog, X,
} from "lucide-react";

const groups = [
  {
    title: "Public navigation",
    links: [
      { label: "Home", href: "/", icon: House },
      { label: "About FitPass", href: "/about", icon: Info },
      { label: "Features", href: "/features", icon: Sparkles },
      { label: "Pricing", href: "/pricing", icon: CircleDollarSign },
      { label: "Find a Gym", href: "/gyms", icon: MapPinned },
      { label: "Contact", href: "/contact", icon: Mail },
    ],
  },
  {
    title: "Account access",
    links: [
      { label: "Gym registration / application", href: "/apply", icon: Building2 },
      { label: "Gym Owner login", href: "/owner/login", icon: UserRoundCog },
      { label: "Desk Staff login", href: "/desk/login", icon: Dumbbell },
      { label: "Gym Member login", href: "/member/login", icon: UserRound },
    ],
  },
];

export default function PublicSiteHeader({ subtitle = "Benin City" }: { subtitle?: string }) {
  const [open, setOpen] = useState(false);
  const headerRef = useRef<HTMLElement>(null);

  useEffect(() => {
    function closeOutside(event: PointerEvent) {
      if (!headerRef.current?.contains(event.target as Node)) setOpen(false);
    }
    function closeEscape(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("pointerdown", closeOutside);
    document.addEventListener("keydown", closeEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOutside);
      document.removeEventListener("keydown", closeEscape);
    };
  }, []);

  return <header ref={headerRef} className="relative z-30 flex items-center justify-between gap-4">
    <Link href="/" className="flex min-h-11 items-center gap-2 rounded-lg text-primary" aria-label="FitPass home">
      <span aria-hidden="true" className="grid size-9 place-items-center rounded-lg bg-primary text-sm font-bold text-primary-foreground">FP</span>
      <span className="font-heading text-xl font-bold">FitPass</span>
    </Link>
    <div className="flex items-center gap-3">
      {subtitle && <span className="hidden text-sm text-muted-foreground sm:inline">{subtitle}</span>}
      <nav aria-label="Primary navigation" className="hidden items-center gap-1 lg:flex">
        <Link href="/gyms" className="inline-flex min-h-11 items-center rounded-lg px-3 text-sm font-semibold text-slate-700 transition hover:bg-green-50 hover:text-primary">Find a gym</Link>
        <Link href="/plans" className="inline-flex min-h-11 items-center rounded-lg px-3 text-sm font-semibold text-slate-700 transition hover:bg-green-50 hover:text-primary">Memberships</Link>
        <Link href="/pricing" className="inline-flex min-h-11 items-center rounded-lg px-3 text-sm font-semibold text-slate-700 transition hover:bg-green-50 hover:text-primary">For gyms</Link>
      </nav>
      <Link href="/sign-in" className="hidden min-h-11 items-center rounded-xl border border-primary/25 px-4 text-sm font-semibold text-primary transition hover:bg-green-50 sm:inline-flex">Sign in</Link>
      <Link href="/apply" className="hidden min-h-11 items-center rounded-xl bg-accent px-4 text-sm font-bold text-accent-foreground transition hover:bg-accent/90 md:inline-flex">List your gym</Link>
      <div className="relative">
        <button type="button" aria-label={open ? "Close navigation menu" : "Open navigation menu"} aria-expanded={open} aria-controls="fitpass-public-menu" onClick={() => setOpen((value) => !value)} className="grid size-11 place-items-center rounded-xl border border-border bg-white text-foreground shadow-sm transition hover:border-primary hover:text-primary focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/30">
          {open ? <X size={21} aria-hidden="true" /> : <Menu size={22} aria-hidden="true" />}
        </button>
        {open && <div id="fitpass-public-menu" className="absolute right-0 top-[calc(100%+0.65rem)] max-h-[min(78dvh,42rem)] w-[min(92vw,22rem)] overflow-y-auto rounded-2xl border border-border bg-white p-3 shadow-xl">
          {groups.map((group, groupIndex) => <section key={group.title} aria-labelledby={`fitpass-menu-group-${groupIndex}`} className={groupIndex ? "mt-3 border-t border-border pt-3" : ""}>
            <h2 id={`fitpass-menu-group-${groupIndex}`} className="px-2 pb-1.5 text-[11px] font-bold uppercase tracking-[0.12em] text-muted-foreground">{group.title}</h2>
            <ul className="space-y-0.5">{group.links.map(({ label, href, icon: Icon }) => <li key={label}><Link href={href} onClick={() => setOpen(false)} className="flex min-h-11 items-center gap-3 rounded-xl px-3 text-sm font-medium text-foreground transition hover:bg-green-50 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"><Icon size={17} aria-hidden="true" className="shrink-0 text-primary" /><span>{label}</span></Link></li>)}</ul>
          </section>)}
        </div>}
      </div>
    </div>
  </header>;
}
