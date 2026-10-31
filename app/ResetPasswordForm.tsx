"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useState, type FormEvent } from "react";

export default function ResetPasswordForm() {
  const token = useSearchParams().get("token") ?? "";
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError(""); setBusy(true);
    const data = new FormData(event.currentTarget);
    const password = String(data.get("password") ?? "");
    const confirmation = String(data.get("confirmation") ?? "");
    if (!token) { setError("This reset link is missing its token. Request a new link."); setBusy(false); return; }
    if (password !== confirmation) { setError("Passwords do not match."); setBusy(false); return; }
    try {
      const response = await fetch("/api/auth/reset-password", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token, newPassword: password }) });
      if (!response.ok) {
        const result = await response.json().catch(() => null) as { message?: string; error?: string } | null;
        throw new Error(result?.message ?? result?.error ?? "This link may have expired. Request a new one.");
      }
      setDone(true);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "This link may have expired. Request a new one."); }
    finally { setBusy(false); }
  }

  return <main className="grid min-h-dvh place-items-center bg-background px-4 py-8 sm:py-12">
    <section className="w-full max-w-md rounded-2xl border border-border bg-card p-6 shadow-xl shadow-slate-900/5 sm:p-8">
      <Link href="/" className="font-heading text-xl font-bold text-primary">FitPass</Link>
      <h1 className="mt-6 font-heading text-2xl font-bold">Choose a new password</h1>
      {done ? <div className="mt-5 space-y-4"><p role="status" className="text-sm text-success">Your password has been reset. You can now sign in with your new password.</p><div className="flex flex-wrap gap-3">{["owner", "desk", "member", "platform"].map((audience) => <Link key={audience} className="font-semibold text-primary underline" href={`/${audience}/login`}>{audience === "platform" ? "Platform admin" : audience} sign in</Link>)}</div></div> : <form onSubmit={submit} className="mt-6 space-y-4">
        <p className="text-sm text-muted-foreground">Use at least 8 characters. Reset links expire after one hour.</p>
        <label className="grid gap-2 text-base">New password<input name="password" type="password" required minLength={8} maxLength={128} autoComplete="new-password" className="min-h-11 rounded-xl border px-3" /></label>
        <label className="grid gap-2 text-base">Confirm new password<input name="confirmation" type="password" required minLength={8} maxLength={128} autoComplete="new-password" className="min-h-11 rounded-xl border px-3" /></label>
        {error && <p role="alert" className="text-sm text-danger">{error}</p>}
        <button disabled={busy || !token} className="min-h-11 w-full rounded-xl bg-primary px-5 font-semibold text-white disabled:opacity-60">{busy ? "Updating…" : "Update password"}</button>
        {!token && <p className="text-sm text-danger">The reset link is invalid or expired. Request a new one.</p>}
      </form>}
      {!done && <p className="mt-5 text-sm"><Link className="font-semibold text-primary underline" href="/forgot-password">Request a new reset link</Link></p>}
    </section>
  </main>;
}
