"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";
import { PASSWORD_RESET_RESPONSE } from "@/lib/password-reset-policy";

export default function PasswordResetRequestForm({ audience }: { audience: string }) {
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    const email = String(new FormData(event.currentTarget).get("email") ?? "").trim();
    try {
      const response = await fetch("/api/password-reset/request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const result = await response.json().catch(() => PASSWORD_RESET_RESPONSE) as typeof PASSWORD_RESET_RESPONSE;
      setMessage(result.message ?? PASSWORD_RESET_RESPONSE.message);
    } catch {
      setMessage(PASSWORD_RESET_RESPONSE.message);
    } finally { setBusy(false); }
  }

  return <main className="grid min-h-dvh place-items-center bg-background px-4 py-8 sm:py-12">
    <section className="w-full max-w-md rounded-2xl border border-border bg-card p-6 shadow-xl shadow-slate-900/5 sm:p-8">
      <Link href="/" className="font-heading text-xl font-bold text-primary">FitPass</Link>
      <h1 className="mt-6 font-heading text-2xl font-bold">Reset your password</h1>
      <p className="mt-2 text-base text-muted-foreground">Enter the email address on your account. We’ll send a secure, time-limited link when email delivery is available.</p>
      <form onSubmit={submit} className="mt-6 space-y-4">
        <label className="grid gap-2 text-base">Email<input name="email" type="email" required maxLength={254} autoComplete="email" className="min-h-11 rounded-xl border px-3" /></label>
        {message && <p role="status" className="text-sm text-success">{message}</p>}
        <button disabled={busy} className="min-h-11 w-full rounded-xl bg-primary px-5 font-semibold text-white disabled:opacity-60">{busy ? "Sending…" : "Send reset link"}</button>
      </form>
      <p className="mt-5 text-sm text-muted-foreground"><Link className="font-semibold text-primary underline" href={`/${audience}/login`}>Return to sign in</Link></p>
    </section>
  </main>;
}
