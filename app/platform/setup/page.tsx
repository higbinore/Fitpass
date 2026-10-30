"use client";

import Link from "next/link";
import { useEffect, useState, type FormEvent } from "react";

type SetupStatus = { available: boolean; pending: boolean; error?: string };

export default function PlatformSetupPage() {
  const [status, setStatus] = useState<SetupStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function refreshStatus() {
    try {
      const response = await fetch("/api/platform/setup", { cache: "no-store" });
      const result = await response.json() as SetupStatus;
      if (!response.ok) throw new Error(result.error ?? "Setup status is unavailable.");
      setStatus(result);
    } catch (cause) {
      setStatus({ available: false, pending: false, error: cause instanceof Error ? cause.message : "Setup status is unavailable." });
    }
  }

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void fetch("/api/platform/setup", { cache: "no-store" })
        .then(async (response) => {
          const result = await response.json() as SetupStatus;
          if (!response.ok) throw new Error(result.error ?? "Setup status is unavailable.");
          setStatus(result);
        })
        .catch((cause: unknown) => setStatus({ available: false, pending: false, error: cause instanceof Error ? cause.message : "Setup status is unavailable." }));
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true); setError(""); setMessage("");
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    try {
      const response = await fetch("/api/platform/setup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.get("name"),
          email: form.get("email"),
          password: form.get("password"),
          passwordConfirmation: form.get("passwordConfirmation"),
        }),
      });
      const result = await response.json() as { message?: string; error?: string };
      if (!response.ok) throw new Error(result.error ?? "Setup could not be completed.");
      setMessage(result.message ?? "Verify your email to continue.");
      setStatus({ available: false, pending: true });
      formElement.reset();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Setup could not be completed.");
      await refreshStatus();
    } finally { setBusy(false); }
  }

  return <main className="grid min-h-dvh place-items-center bg-background px-4 py-8 sm:py-12">
    <section className="w-full max-w-lg overflow-hidden rounded-3xl border border-border bg-card shadow-xl shadow-slate-900/5">
      <div className="bg-green-950 px-6 py-6 text-white sm:px-8"><Link href="/" className="font-heading text-xl font-bold">FitPass<span className="text-accent">.</span></Link><p className="mt-5 text-xs font-bold uppercase tracking-[0.18em] text-green-300">Controlled setup</p><h1 className="mt-2 font-heading text-2xl font-bold">First platform administrator</h1><p className="mt-2 text-sm leading-6 text-white/75">This one-time setup is available only before the first platform administrator is activated. Email verification is required before access is granted.</p></div>
      <div className="p-6 sm:p-8">
        {message && <p role="status" className="mb-5 rounded-xl border border-green-200 bg-green-50 p-4 text-sm leading-6 text-green-900">{message}</p>}
        {error && <p role="alert" className="mb-5 rounded-xl border border-red-200 bg-red-50 p-4 text-sm leading-6 text-red-800">{error}</p>}
        {!status && <p role="status" className="rounded-xl bg-muted p-4 text-sm text-muted-foreground">Checking whether first-time setup is available…</p>}
        {status?.error && <div role="alert" className="rounded-xl border border-amber-200 bg-amber-50 p-4"><p className="text-sm leading-6 text-amber-950">{status.error}</p><button type="button" onClick={() => void refreshStatus()} className="mt-3 min-h-10 rounded-lg border border-amber-300 px-3 text-sm font-semibold text-amber-950">Try again</button></div>}
        {status && !status.error && status.available && <form onSubmit={submit} className="space-y-4">
          <label className="grid gap-2 text-sm font-semibold text-foreground">Full name<input name="name" required minLength={2} maxLength={120} autoComplete="name" className="min-h-12 rounded-xl border border-input bg-white px-3 font-normal" /></label>
          <label className="grid gap-2 text-sm font-semibold text-foreground">Email address<input name="email" type="email" required maxLength={254} autoComplete="email" className="min-h-12 rounded-xl border border-input bg-white px-3 font-normal" /></label>
          <label className="grid gap-2 text-sm font-semibold text-foreground">Password<input name="password" type="password" required minLength={12} maxLength={128} autoComplete="new-password" className="min-h-12 rounded-xl border border-input bg-white px-3 font-normal" /><span className="text-xs font-normal text-muted-foreground">Use at least 12 characters.</span></label>
          <label className="grid gap-2 text-sm font-semibold text-foreground">Confirm password<input name="passwordConfirmation" type="password" required minLength={12} maxLength={128} autoComplete="new-password" className="min-h-12 rounded-xl border border-input bg-white px-3 font-normal" /></label>
          <p className="rounded-xl bg-muted p-3 text-xs leading-5 text-muted-foreground">The server assigns the platform administrator role after your email is verified. This form never accepts a role value.</p>
          <button type="submit" disabled={busy} className="min-h-12 w-full rounded-xl bg-primary px-5 font-bold text-primary-foreground transition hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-60">{busy ? "Creating account…" : "Create first administrator account"}</button>
        </form>}
        {status && !status.error && !status.available && <div className="rounded-xl border border-amber-200 bg-amber-50 p-4"><h2 className="font-semibold text-amber-950">{status.pending ? "Email verification is pending" : "First-time setup is closed"}</h2><p className="mt-2 text-sm leading-6 text-amber-900">{status.pending ? "Continue from the verification email sent to the setup account. No platform access is granted until that email is verified." : "A platform administrator has already been provisioned. Public setup cannot create or promote another account."}</p><Link href="/platform/login" className="mt-4 inline-flex min-h-11 items-center rounded-xl bg-green-900 px-4 font-semibold text-white">Go to platform login</Link></div>}
        <p className="mt-6 border-t border-border pt-5 text-center text-sm text-muted-foreground">Already have platform access? <Link href="/platform/login" className="font-semibold text-primary underline underline-offset-4">Sign in</Link></p>
      </div>
    </section>
  </main>;
}
