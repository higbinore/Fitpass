"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import AuthForm from "../../AuthForm";

function PlatformLoginForm() {
  const params = useSearchParams();
  const initialMessage = params.get("setup") === "complete"
    ? "Email verified. Your first platform administrator account is ready to sign in."
    : "";
  return <AuthForm mode="sign-in" audience="platform" defaultNext="/admin" initialMessage={initialMessage} />;
}

export default function PlatformLoginPage() {
  return <Suspense fallback={<main className="grid min-h-dvh place-items-center bg-background px-4 text-muted-foreground">Loading platform sign in…</main>}><PlatformLoginForm /></Suspense>;
}
