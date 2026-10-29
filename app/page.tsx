import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

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

export default function Home() {
  return (
    <main className="mx-auto w-full max-w-3xl px-4 pb-12 pt-6 sm:px-6">
      <header className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span
            aria-hidden="true"
            className="flex size-10 items-center justify-center rounded-lg bg-primary text-base font-bold text-primary-foreground"
          >
            FP
          </span>
          <span className="font-heading text-xl font-bold text-foreground">
            FitPass
          </span>
        </div>
        <span className="text-sm text-muted-foreground">Benin City</span>
      </header>

      <section className="mt-8">
        <h1 className="max-w-md text-[28px] leading-tight sm:text-[32px]">
          Your gym, one code away.
        </h1>
        <p className="mt-4 max-w-md text-base text-muted-foreground">
          FitPass keeps your gym membership in one place. Buy a plan, show your
          code at the front desk, and train. No paper cards, no guessing whether
          your membership still runs.
        </p>
        <div className="mt-6">
          <Button asChild>
            <a href="#how-it-works">How it works</a>
          </Button>
        </div>
      </section>

      <section id="how-it-works" className="mt-12 scroll-mt-6">
        <h2 className="text-2xl">How it works</h2>
        <ol className="mt-4 space-y-3">
          {steps.map((step, index) => (
            <li key={step.title}>
              <Card>
                <CardContent className="flex gap-4">
                  <span
                    aria-hidden="true"
                    className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-bold text-primary"
                  >
                    {index + 1}
                  </span>
                  <div>
                    <h3 className="text-base font-semibold">{step.title}</h3>
                    <p className="mt-1 text-base text-muted-foreground">
                      {step.body}
                    </p>
                  </div>
                </CardContent>
              </Card>
            </li>
          ))}
        </ol>
      </section>

      <section className="mt-12">
        <h2 className="text-2xl">At the front desk</h2>
        <Card className="mt-4">
          <CardHeader>
            <CardTitle className="text-base">
              The desk decides, not the app on your phone
            </CardTitle>
            <CardDescription className="text-base">
              Staff check your code against the gym records every time. Both
              outcomes are shown in plain words, not colour alone.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap items-center gap-3">
              <Badge className="bg-success text-success-foreground">
                Valid
              </Badge>
              <p className="text-base">
                Welcome message, with the days left on the membership.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <Badge className="bg-danger text-danger-foreground">
                Expired
              </Badge>
              <p className="text-base">
                &ldquo;Expired. Ask them to renew.&rdquo; No check-in is
                recorded.
              </p>
            </div>
          </CardContent>
        </Card>
      </section>

      <section className="mt-12">
        <h2 className="text-2xl">Find us</h2>
        <Card className="mt-4">
          <CardContent className="space-y-2">
            <p className="text-base font-semibold">
              FitPass Gym, Adesuwa Road, GRA, Benin City
            </p>
            <p className="text-base text-muted-foreground">
              Monday to Saturday, 5:30am to 9:00pm. Closed on Sundays.
            </p>
            <p className="text-base text-muted-foreground">
              Ask at the front desk if you need directions or want to renew.
            </p>
          </CardContent>
        </Card>
      </section>

      <footer className="mt-12 border-t border-border pt-6">
        <p className="text-sm text-muted-foreground">
          FitPass · Gym membership, Benin City
        </p>
      </footer>
    </main>
  );
}
