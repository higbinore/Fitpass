import { Suspense } from "react";
import Link from "next/link";
import Image from "next/image";
import { connection } from "next/server";
import { and, asc, eq } from "drizzle-orm";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { getDb } from "@/lib/db";
import { formatNaira } from "@/lib/money";
import { plans } from "@/lib/schema";
import { getInitialGym } from "@/lib/tenant";
import PublicPricing from "./PublicPricing";
import PublicSiteHeader from "./PublicSiteHeader";

const steps = [
  {
    title: "Pick a plan",
    body: "Choose the membership that fits how often you train and pay with Paystack.",
  },
  {
    title: "Get your FitPass code",
    body: "Your code appears on your member card as soon as the payment is confirmed.",
  },
  {
    title: "Check in at the desk",
    body: "Read the code to the front desk. It is checked in seconds, and you are in.",
  },
];

/**
 * Reads the active plans on every request. Uncached data lives inside a
 * Suspense boundary so the rest of the page can still be prerendered.
 */
async function PlanList() {
  // Render at request time: the plans are live data, and opening the Neon
  // connection during prerendering is not allowed.
  await connection();

  let availablePlans: {
    id: string;
    name: string;
    durationDays: number;
    priceKobo: number;
    description: string | null;
  }[];
  let launchGymId = "";
  let launchGymName = "";

  try {
    const gym = await getInitialGym();
    launchGymId = gym?.id ?? "";
    launchGymName = gym?.name ?? "";
    availablePlans = gym
      ? await getDb()
          .select({
            id: plans.id,
            name: plans.name,
            durationDays: plans.durationDays,
            priceKobo: plans.priceKobo,
            description: plans.description,
          })
          .from(plans)
          .where(and(eq(plans.gymId, gym.id), eq(plans.isActive, true)))
          .orderBy(asc(plans.sortOrder), asc(plans.priceKobo))
      : [];
  } catch (error) {
    console.error(
      "Failed to load plans:",
      error instanceof Error ? error.message : "unknown error",
    );

    return (
      <Card>
        <CardContent>
          <p className="text-base text-muted-foreground">
            Plans are unavailable right now. Please ask at the front desk.
          </p>
        </CardContent>
      </Card>
    );
  }

  if (availablePlans.length === 0) {
    return (
      <Card>
        <CardContent>
          <p className="text-base text-muted-foreground">
            No plans are available right now. Please ask at the front desk and
            they will help you join.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <>
    <div className="mt-6 flex flex-wrap items-center justify-between gap-2"><p className="text-sm text-muted-foreground">{launchGymName ? `Plans for ${launchGymName}` : "Gym-specific membership plans"}</p><Link href="/gyms" className="text-sm font-semibold text-primary underline underline-offset-4">Find another gym</Link></div>
    <ul className="mt-3 grid gap-4 lg:grid-cols-2">
      {availablePlans.map((plan) => (
        <li key={plan.id}>
          <Card>
            <CardHeader>
              <CardTitle className="text-base">{plan.name}</CardTitle>
              {plan.description ? (
                <CardDescription className="text-base">
                  {plan.description}
                </CardDescription>
              ) : null}
            </CardHeader>
            <CardContent className="flex flex-wrap items-end justify-between gap-4">
              <div>
                <p className="font-heading text-2xl font-bold text-foreground">
                  {formatNaira(plan.priceKobo)}
                </p>
                <p className="mt-1 text-sm text-muted-foreground">
                  {plan.durationDays} {plan.durationDays === 1 ? "day" : "days"}
                </p>
              </div>
              <div className="flex w-full flex-wrap gap-2 sm:w-auto">
                <Button asChild variant="outline" className="min-h-11 flex-1 px-4 sm:flex-none"><Link href={`/gyms/${encodeURIComponent(launchGymId)}/join?plan=${encodeURIComponent(plan.id)}`}>View details</Link></Button>
                <Button asChild variant="accent" className="min-h-11 flex-1 px-4 sm:flex-none"><Link href={`/gyms/${encodeURIComponent(launchGymId)}/join?plan=${encodeURIComponent(plan.id)}`}>Select plan</Link></Button>
              </div>
            </CardContent>
          </Card>
        </li>
      ))}
    </ul>
    </>
  );
}

function PlansLoading() {
  return (
    <Card className="mt-4">
      <CardContent>
        <p className="text-base text-muted-foreground">Loading plans…</p>
      </CardContent>
    </Card>
  );
}

export default function Home() {
  return (
    <main className="min-h-dvh overflow-x-clip bg-[#f4f5ef] px-4 pb-14 pt-5 sm:px-6 lg:px-8">
      <div className="mx-auto w-full max-w-[1440px]">
      <PublicSiteHeader />
      <section id="about" className="mt-6 grid scroll-mt-6 items-center gap-7 rounded-[2rem] bg-white p-4 shadow-[0_18px_60px_rgba(17,24,39,0.08)] sm:p-7 lg:grid-cols-[0.88fr_1.12fr] lg:gap-10 lg:p-10">
        <div className="px-2 py-5 sm:px-4 lg:py-10">
          <p className="inline-flex items-center gap-2 rounded-full border border-green-100 bg-green-50 px-3 py-1.5 text-xs font-bold uppercase tracking-[0.16em] text-primary"><span className="size-2 rounded-full bg-accent" />FitPass · Benin City</p>
          <h1 className="mt-5 max-w-xl font-heading text-4xl font-bold leading-[1.08] tracking-tight text-foreground sm:text-5xl lg:text-6xl">Make room for the <span className="text-primary">stronger you.</span></h1>
          <p className="mt-5 max-w-lg text-base leading-7 text-muted-foreground sm:text-lg">A more considered gym experience. Discover local clubs, compare their real membership plans, and keep your membership details ready when it is time to train.</p>
          <div className="mt-7 flex flex-col gap-3 sm:flex-row">
            <Button asChild className="min-h-12 rounded-xl px-6 text-base"><Link href="/gyms">Explore gyms <span aria-hidden="true">↗</span></Link></Button>
            <Button asChild variant="outline" className="min-h-12 rounded-xl border-primary/25 px-6 text-base"><Link href="/plans">Compare membership plans</Link></Button>
          </div>
          <div className="mt-8 flex flex-wrap gap-x-6 gap-y-2 border-t border-border pt-5 text-sm font-medium text-slate-600"><span>Gym-set prices</span><span>Verified membership</span><span>Easy front-desk check-in</span></div>
        </div>
        <figure className="relative isolate min-h-[340px] overflow-hidden rounded-[1.5rem] bg-green-950 sm:min-h-[440px] lg:min-h-[540px]">
          <Image src="https://images.pexels.com/photos/33832205/pexels-photo-33832205/free-photo-of-strong-woman-exercising-in-modern-lagos-gym.jpeg?auto=compress&dpr=1&h=1100&w=1400" alt="African woman training in a modern Lagos gym" fill priority sizes="(max-width: 1024px) 100vw, 56vw" unoptimized className="-z-20 object-cover object-center" />
          <div aria-hidden="true" className="absolute inset-0 -z-10 bg-gradient-to-t from-green-950/85 via-green-950/15 to-green-950/10" />
          <div className="absolute left-4 top-4 rounded-2xl border border-white/25 bg-white/90 px-4 py-3 shadow-lg backdrop-blur sm:left-6 sm:top-6"><p className="text-[11px] font-bold uppercase tracking-[0.14em] text-primary">Your next session</p><p className="mt-1 text-sm font-semibold text-foreground">Starts with a plan that fits.</p></div>
          <figcaption className="absolute inset-x-0 bottom-0 flex flex-wrap items-end justify-between gap-4 p-5 text-white sm:p-7"><div><p className="text-xs font-bold uppercase tracking-[0.18em] text-green-200">Train with intention</p><p className="mt-2 max-w-md font-heading text-2xl font-bold leading-tight sm:text-3xl">Find your pace. Find your place.</p></div><span className="rounded-xl bg-accent px-3 py-2 text-xs font-bold text-slate-950">Benin City · Nigeria</span><span className="w-full text-[11px] text-white/75">Editorial photo by photobydela on Pexels; not a FitPass gym.</span></figcaption>
        </figure>
      </section>
      <section id="plans" className="mt-14 scroll-mt-6 rounded-[2rem] bg-white p-5 shadow-sm sm:p-8">
        <p className="text-xs font-bold uppercase tracking-[0.16em] text-primary">Choose your membership</p><h2 className="mt-2 font-heading text-3xl">Plans from participating gyms</h2>
        <p className="mt-2 text-base text-muted-foreground">Prices and availability are set by each gym. Select a gym to see its current plans.</p>
        <div className="mt-3"><Link href="/gyms" className="text-sm font-semibold text-primary underline underline-offset-4">Browse gyms and prices</Link></div>
        <Suspense fallback={<PlansLoading />}><PlanList /></Suspense>
      </section>
      <PublicPricing />
      <section id="features" className="mt-14 scroll-mt-6 rounded-[2rem] bg-white p-5 shadow-sm sm:p-8">
        <p className="text-xs font-bold uppercase tracking-[0.16em] text-primary">Simple by design</p><h2 className="mt-2 font-heading text-3xl">How FitPass works</h2>
        <ol className="mt-4 space-y-3">{steps.map((step, index) => <li key={step.title}><Card><CardContent className="flex gap-4"><span aria-hidden="true" className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-bold text-primary">{index + 1}</span><div><h3 className="text-base font-semibold">{step.title}</h3><p className="mt-1 text-base text-muted-foreground">{step.body}</p></div></CardContent></Card></li>)}</ol>
      </section>
      <section id="contact" className="mt-14 scroll-mt-6">
        <h2 className="text-2xl">At the front desk</h2>
        <Card className="mt-4"><CardHeader><CardTitle className="text-base">The desk decides, not the app on your phone</CardTitle><CardDescription className="text-base">Staff check your code against the gym records every time. Both outcomes are shown in plain words, not colour alone.</CardDescription></CardHeader><CardContent className="space-y-4"><div className="flex flex-wrap items-center gap-3"><Badge className="bg-success text-success-foreground">Valid</Badge><p className="text-base">Welcome message, with the days left on the membership.</p></div><div className="flex flex-wrap items-center gap-3"><Badge className="bg-danger text-danger-foreground">Expired</Badge><p className="text-base">&ldquo;Expired. Ask them to renew.&rdquo; No check-in is recorded.</p></div></CardContent></Card>
      </section>
      <section className="mt-14 rounded-[2rem] bg-white p-5 shadow-sm sm:p-8">
        <h2 className="text-2xl">Find us</h2>
        <Card className="mt-4"><CardContent className="space-y-2"><p className="text-base font-semibold">FitPass Gym, Adesuwa Road, GRA, Benin City</p><p className="text-base text-muted-foreground">Monday to Saturday, 5:30am to 9:00pm. Closed on Sundays.</p><p className="text-base text-muted-foreground">Ask at the front desk if you need directions or want to renew.</p><Link href="/gyms" className="inline-flex min-h-11 items-center text-sm font-semibold text-primary underline">Browse all participating gyms</Link></CardContent></Card>
      </section>
      <footer className="mt-14 flex flex-col gap-4 rounded-[2rem] bg-green-950 p-6 text-white sm:flex-row sm:items-center sm:justify-between sm:p-8"><div><p className="font-heading text-xl font-bold">FitPass<span className="text-accent">.</span></p><p className="mt-1 text-sm text-white/70">Gym membership, made clear in Benin City.</p></div><Link href="/apply" className="inline-flex min-h-11 items-center justify-center rounded-xl bg-accent px-5 font-bold text-slate-950">Run a gym? Apply to FitPass</Link></footer>
      </div>
    </main>
  );
}
