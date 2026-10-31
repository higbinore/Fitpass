"use client";

import { Suspense } from "react";
import ResetPasswordForm from "../ResetPasswordForm";

export default function ResetPasswordPage() {
  return <Suspense fallback={<main className="grid min-h-dvh place-items-center bg-background px-4 text-muted-foreground">Loading password reset…</main>}><ResetPasswordForm /></Suspense>;
}
