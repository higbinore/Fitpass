"use client";

import Link from "next/link";
import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";

export default function AcceptInvitationPage() {
  return <Suspense fallback={<main className="grid min-h-dvh place-items-center px-4">Loading invitation…</main>}><InvitationContent /></Suspense>;
}

function InvitationContent() {
  const token = useSearchParams().get("token") ?? "";
  const [accepted, setAccepted] = useState<{ gym: { id: string; name: string }; roles: string[] } | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function accept() {
    setBusy(true); setError("");
    try {
      const response = await fetch("/api/invitations/accept", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token }) });
      const result = await response.json() as { error?: string; gym?: { id: string; name: string }; roles?: string[] };
      if (!response.ok) throw new Error(result.error ?? "Invitation could not be accepted.");
      if (result.gym) setAccepted({ gym: result.gym, roles: result.roles ?? [] });
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Please try again."); }
    finally { setBusy(false); }
  }

  const signInUrl = `/sign-in?next=${encodeURIComponent(`/invitations/accept?token=${encodeURIComponent(token)}`)}`;
  const signUpUrl = `/sign-up?next=${encodeURIComponent(`/invitations/accept?token=${encodeURIComponent(token)}`)}`;
  const dashboard = accepted?.roles.includes("gym_owner") ? "owner" : accepted?.roles.includes("gym_desk_staff") ? "desk" : "member";
  return <main className="grid min-h-dvh place-items-center px-4 py-10">
    <section className="w-full max-w-lg rounded-xl border bg-white p-6 sm:p-8">
      <Link href="/" className="font-heading text-xl font-bold text-primary">FitPass</Link>
      <h1 className="mt-6 font-heading text-2xl font-bold">Accept your gym invitation</h1>
      <p className="mt-2 text-base text-muted-foreground">Sign in with the verified email address that received the invitation. New accounts must verify their email first.</p>
      {!token && <p role="alert" className="mt-4 text-danger">This invitation link is missing its token.</p>}
      {error && <p role="alert" className="mt-4 text-danger">{error}</p>}
      {accepted && <><p role="status" className="mt-4 text-success">You joined {accepted.gym.name} as {accepted.roles.join(", ")}.</p><Link className="mt-4 inline-block min-h-11 rounded-xl bg-primary px-5 py-3 font-semibold text-white" href={`/gyms/${accepted.gym.id}/${dashboard}`}>Continue to your gym</Link></>}
      {token && !accepted && <div className="mt-6 grid gap-3">
        <button disabled={busy} onClick={() => void accept()} className="min-h-11 rounded-xl bg-primary px-5 font-semibold text-white disabled:opacity-60">{busy ? "Checking invitation…" : "Accept invitation"}</button>
        <p className="text-sm text-muted-foreground">Need to sign in first? <Link className="font-semibold text-primary underline" href={signInUrl}>Sign in</Link> or <Link className="font-semibold text-primary underline" href={signUpUrl}>create an account</Link>.</p>
      </div>}
    </section>
  </main>;
}
