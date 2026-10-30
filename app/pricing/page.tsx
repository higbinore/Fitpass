import Link from "next/link";
import PublicDestinationPage from "../PublicDestinationPage";
import PublicPricing from "../PublicPricing";

export default function PricingPage() {
  return <PublicDestinationPage eyebrow="Pricing" title="Gym plans and FitPass packages are separate." description="Members pay for plans offered by their chosen gym. Gym operators pay for FitPass platform packages. Each price is shown in its correct context.">
    <section className="rounded-2xl border border-border bg-white p-5 sm:p-7"><h2 className="font-heading text-xl font-bold">Looking for a membership plan?</h2><p className="mt-2 text-base leading-7 text-muted-foreground">Browse gyms to compare their currently published member plans, prices and durations.</p><Link href="/plans" className="mt-4 inline-flex min-h-11 items-center rounded-xl bg-primary px-4 font-semibold text-primary-foreground hover:bg-primary/90">Browse gym membership plans</Link></section>
    <PublicPricing />
  </PublicDestinationPage>;
}
