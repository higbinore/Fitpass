import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import PublicDestinationPage from "../PublicDestinationPage";

const items = [
  { title: "Gym-set plans", body: "See plan prices and durations published by each gym, without confusing them with FitPass platform packages." },
  { title: "Verified membership status", body: "A member code is checked against the gym’s current records before a check-in is accepted." },
  { title: "Clear payment status", body: "Membership activation follows verified payment confirmation. A browser redirect by itself does not activate a plan." },
];

export default function FeaturesPage() {
  return <PublicDestinationPage eyebrow="FitPass features" title="The essential gym journey, in one place." description="FitPass connects gym members and participating gym teams with a focused set of membership and front-desk workflows.">
    <div className="grid gap-4 md:grid-cols-3">{items.map((item) => <Card key={item.title}><CardHeader><CardTitle>{item.title}</CardTitle></CardHeader><CardContent className="text-base leading-7 text-muted-foreground">{item.body}</CardContent></Card>)}</div>
  </PublicDestinationPage>;
}
