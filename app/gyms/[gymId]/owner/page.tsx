import { redirect } from "next/navigation";
import { Suspense } from "react";

import { AuthorizationError, requireGymOwner } from "@/lib/authz";
import OwnerDashboard from "./OwnerDashboard";

async function OwnerContent({ params }: { params: Promise<{ gymId: string }> }) {
  const { gymId } = await params;
  try { await requireGymOwner(gymId); }
  catch (error) {
    if (error instanceof AuthorizationError) redirect("/sign-in?next=" + encodeURIComponent(`/gyms/${gymId}/owner`));
    throw error;
  }
  return <OwnerDashboard gymId={gymId} />;
}

export default function OwnerPage({ params }: { params: Promise<{ gymId: string }> }) {
  return <Suspense fallback={<main className="grid min-h-dvh place-items-center bg-background px-4 text-center text-muted-foreground">Loading gym dashboard…</main>}><OwnerContent params={params} /></Suspense>;
}
