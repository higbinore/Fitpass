import Link from "next/link";
import type { ReactNode } from "react";
import PublicSiteHeader from "./PublicSiteHeader";

export default function PublicDestinationPage({
  eyebrow,
  title,
  description,
  children,
}: {
  eyebrow: string;
  title: string;
  description: string;
  children: ReactNode;
}) {
  return <main className="mx-auto min-h-dvh w-full max-w-5xl px-4 py-6 sm:px-6 lg:px-8">
    <PublicSiteHeader />
    <header className="mt-10 rounded-3xl bg-primary px-6 py-9 text-primary-foreground sm:px-10 sm:py-12">
      <p className="text-sm font-bold uppercase tracking-widest text-green-300">{eyebrow}</p>
      <h1 className="mt-3 max-w-3xl font-heading text-3xl font-bold leading-tight text-white sm:text-4xl">{title}</h1>
      <p className="mt-4 max-w-2xl text-base leading-7 text-white/80">{description}</p>
    </header>
    <div className="mt-8 space-y-6">{children}</div>
    <nav aria-label="Related pages" className="mt-8 flex flex-wrap gap-3 border-t border-border pt-6">
      <Link href="/" className="inline-flex min-h-11 items-center rounded-xl border border-primary px-4 font-semibold text-primary hover:bg-primary/5">FitPass home</Link>
      <Link href="/gyms" className="inline-flex min-h-11 items-center rounded-xl bg-primary px-4 font-semibold text-primary-foreground hover:bg-primary/90">Find a gym</Link>
    </nav>
  </main>;
}
