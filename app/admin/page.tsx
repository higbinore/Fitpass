import { redirect } from "next/navigation";
import { Suspense } from "react";
import { connection } from "next/server";

import { AuthorizationError, requirePlatformAdmin } from "@/lib/authz";
import AdminDashboard from "./AdminDashboard";

async function AdminContent() {
  await connection();
  try {
    await requirePlatformAdmin();
  } catch (error) {
    if (error instanceof AuthorizationError) redirect("/sign-in?next=%2Fadmin");
    throw error;
  }
  return <AdminDashboard />;
}

export default function PlatformAdminPage() {
  return <Suspense fallback={<main className="grid min-h-dvh place-items-center">Loading platform administration…</main>}><AdminContent /></Suspense>;
}
