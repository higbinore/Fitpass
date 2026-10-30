"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";

type Audience = "member" | "owner" | "desk" | "platform";

const audienceCopy: Record<Audience, { title: string; description: string }> = {
  member: { title: "Member sign in", description: "Sign in to view your gym membership, payments and visits." },
  owner: { title: "Gym owner sign in", description: "Use the verified account associated with your gym invitation." },
  desk: { title: "Desk staff sign in", description: "Sign in to access check-in tools for your assigned gym." },
  platform: { title: "FitPass administration", description: "Sign in with a pre-provisioned, verified platform administrator account." },
};

export default function AuthForm({ mode, audience = "member", defaultNext, initialMessage = "" }: { mode: "sign-in" | "sign-up"; audience?: Audience; defaultNext?: string; initialMessage?: string }) {
  const [message, setMessage] = useState(initialMessage);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const signingUp = mode === "sign-up";

  function safeSignupDestination(value: string | null) {
    if (!value) return "/dashboard";
    try {
      const destination = new URL(value, window.location.origin);
      if (destination.origin !== window.location.origin) return "/dashboard";
      if (destination.pathname === "/invitations/accept" || /^\/gyms\/[^/]+\/join$/.test(destination.pathname)) return `${destination.pathname}${destination.search}`;
      return "/dashboard";
    } catch { return "/dashboard"; }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError(""); setMessage("");
    const data = new FormData(event.currentTarget);
    const payload: Record<string, string> = { email: String(data.get("email")), password: String(data.get("password")) };
    const requestedNext = new URLSearchParams(window.location.search).get("next") ?? defaultNext ?? null;
    if (signingUp) {
      payload.name = String(data.get("name"));
      payload.callbackURL = new URL(safeSignupDestination(requestedNext), window.location.origin).toString();
    }
    try {
      const response = await fetch(`/api/auth/${signingUp ? "sign-up" : "sign-in"}/email`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload),
      });
      if (!response.ok) {
        const result = await response.json().catch(() => null) as { message?: string; error?: string } | null;
        throw new Error(result?.message ?? result?.error ?? "We could not complete that request.");
      }
      if (signingUp) setMessage("Account created. Check your inbox to verify your email before continuing.");
      else {
        const query = requestedNext ? `?next=${encodeURIComponent(requestedNext)}` : "";
        const destinationResponse = await fetch(`/api/auth/destination${query}`, { cache: "no-store" });
        const destination = await destinationResponse.json() as { destination?: string };
        window.location.assign(destinationResponse.ok && destination.destination?.startsWith("/") ? destination.destination : "/dashboard");
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Please try again.");
    } finally { setBusy(false); }
  }

  return <main className="grid min-h-dvh place-items-center bg-background px-4 py-8 sm:py-12">
    <section className="w-full max-w-md overflow-hidden rounded-2xl border border-border bg-card p-6 shadow-xl shadow-slate-900/5 sm:p-8">
      <Link href="/" className="font-heading text-xl font-bold text-primary">FitPass</Link>
      <h1 className="mt-6 font-heading text-2xl font-bold">{signingUp ? "Create your account" : audienceCopy[audience].title}</h1>
      <p className="mt-2 text-base text-muted-foreground">{signingUp ? "We’ll verify your email before you continue." : audienceCopy[audience].description}</p>
      <form onSubmit={submit} className="mt-6 space-y-4">
        {signingUp && <label className="grid gap-2 text-base">Full name<input name="name" required maxLength={120} autoComplete="name" className="min-h-11 rounded-xl border px-3" /></label>}
        <label className="grid gap-2 text-base">Email<input name="email" type="email" required maxLength={254} autoComplete="email" className="min-h-11 rounded-xl border px-3" /></label>
        <label className="grid gap-2 text-base">Password<input name="password" type="password" required minLength={8} autoComplete={signingUp ? "new-password" : "current-password"} className="min-h-11 rounded-xl border px-3" /></label>
        {error && <p role="alert" className="text-danger">{error}</p>}
        {message && <p role="status" className="text-success">{message}</p>}
        <button disabled={busy} className="min-h-11 w-full rounded-xl bg-primary px-5 font-semibold text-white disabled:opacity-60">{busy ? "Please wait…" : signingUp ? "Create account" : "Sign in"}</button>
      </form>
      {audience !== "platform" && <p className="mt-5 text-sm text-muted-foreground">{signingUp ? "Already registered? " : "New to FitPass? "}<Link className="font-semibold text-primary underline" href={signingUp ? "/sign-in" : "/sign-up"}>{signingUp ? "Sign in" : "Create an account"}</Link></p>}
      {audience === "platform" && <p className="mt-4 border-t border-border pt-4 text-sm text-muted-foreground">Platform administrator accounts are provisioned through a controlled process. Public registration cannot create or promote an administrator.</p>}
      {!signingUp && audience !== "platform" && <nav aria-label="Other FitPass sign-in options" className="mt-5 border-t border-border pt-4"><p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Other sign-in options</p><div className="mt-2 flex flex-wrap gap-x-4 gap-y-2 text-sm">{audience !== "member" && <Link className="font-semibold text-primary underline" href="/member/login">Member</Link>}{audience !== "owner" && <Link className="font-semibold text-primary underline" href="/owner/login">Gym owner</Link>}{audience !== "desk" && <Link className="font-semibold text-primary underline" href="/desk/login">Desk staff</Link>}</div></nav>}
    </section>
  </main>;
}
