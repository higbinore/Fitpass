import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import PublicDestinationPage from "../PublicDestinationPage";

export default function AboutPage() {
  return <PublicDestinationPage eyebrow="About FitPass" title="A simpler way to stay connected to your gym." description="FitPass helps people manage gym access with a clear membership record and helps participating gyms verify a visit at the front desk.">
    <Card><CardHeader><CardTitle>Membership stays clear</CardTitle></CardHeader><CardContent className="text-base leading-7 text-muted-foreground">Choose from the plans a gym has actually published. Your membership becomes active only after payment is confirmed by the payment provider. At check-in, staff verify the current status against gym records.</CardContent></Card>
    <Card><CardHeader><CardTitle>Built around local gyms</CardTitle></CardHeader><CardContent className="text-base leading-7 text-muted-foreground">Browse participating gyms, check their published location and compare current offers. Gym-specific plans and payments remain managed by each gym.</CardContent></Card>
    <p className="text-sm text-muted-foreground">Want to see current participating gyms? <Link className="font-semibold text-primary underline underline-offset-4" href="/gyms">Open the gym directory</Link>.</p>
  </PublicDestinationPage>;
}
