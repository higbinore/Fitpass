import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import PublicDestinationPage from "../PublicDestinationPage";

export default function ContactPage() {
  return <PublicDestinationPage eyebrow="Contact" title="Get help from the right gym team." description="Membership availability and gym-specific plan questions are handled by the gym. FitPass shows each gym’s published contact details on its profile when provided.">
    <Card><CardHeader><CardTitle>Questions about a membership?</CardTitle></CardHeader><CardContent className="space-y-3 text-base leading-7 text-muted-foreground"><p>Open the gym profile to see its available phone or email contact details. If contact details are not published, ask at the gym’s front desk.</p><Link href="/gyms" className="inline-flex min-h-11 items-center rounded-xl bg-primary px-4 font-semibold text-primary-foreground hover:bg-primary/90">Find a gym</Link></CardContent></Card>
    <Card><CardHeader><CardTitle>Represent a gym?</CardTitle></CardHeader><CardContent className="space-y-3 text-base leading-7 text-muted-foreground"><p>Submit your gym for review through the existing application process.</p><Link href="/apply" className="inline-flex min-h-11 items-center rounded-xl border border-primary px-4 font-semibold text-primary hover:bg-primary/5">Apply to FitPass</Link></CardContent></Card>
  </PublicDestinationPage>;
}
