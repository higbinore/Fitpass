"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import PasswordResetRequestForm from "../PasswordResetRequestForm";

const allowedAudiences = new Set(["owner", "desk", "member", "platform"]);

function ForgotPasswordContent() {
  const requested = useSearchParams().get("audience") ?? "member";
  const audience = allowedAudiences.has(requested) ? requested : "member";
  return <PasswordResetRequestForm audience={audience} />;
}

export default function ForgotPasswordPage() {
  return <Suspense fallback={<main className="grid min-h-dvh place-items-center bg-background px-4 text-muted-foreground">Loading password reset…</main>}><ForgotPasswordContent /></Suspense>;
}
