import { NextResponse } from "next/server";
import { headers } from "next/headers";

import { getAuth } from "@/lib/auth";
import { AuthorizationError, requireActiveGymDeskStaff, requireGymMember, requireGymOwner, requirePlatformAdmin } from "@/lib/authz";

/** Resolves a post-auth destination using the actual session and current server-side grants. */
export async function GET(request: Request) {
  try {
    const session = await getAuth().api.getSession({ headers: await headers() });
    if (!session?.user?.id || !session.user.emailVerified) {
      return NextResponse.json({ error: "A verified sign-in is required." }, { status: 401, headers: { "Cache-Control": "no-store" } });
    }

    const currentUrl = new URL(request.url);
    const rawNext = currentUrl.searchParams.get("next");
    let next: URL | null = null;
    if (rawNext) {
      try {
        const parsed = new URL(rawNext, currentUrl.origin);
        if (parsed.origin === currentUrl.origin) next = parsed;
      } catch { /* Invalid destinations fall back to the workspace hub. */ }
    }

    let destination = "/dashboard";
    if (!next) {
      try { await requirePlatformAdmin(); destination = "/admin"; }
      catch (error) { if (!(error instanceof AuthorizationError)) throw error; }
    } else if (next.pathname === "/admin") {
      try { await requirePlatformAdmin(); destination = "/admin"; }
      catch (error) { if (!(error instanceof AuthorizationError)) throw error; }
    } else {
      const workspace = next.pathname.match(/^\/gyms\/([^/]+)\/(owner|desk|member)$/);
      if (workspace) {
        let gymId: string;
        try { gymId = decodeURIComponent(workspace[1]); }
        catch { return NextResponse.json({ destination }, { headers: { "Cache-Control": "no-store" } }); }
        try {
          if (workspace[2] === "owner") await requireGymOwner(gymId);
          if (workspace[2] === "desk") await requireActiveGymDeskStaff(gymId);
          if (workspace[2] === "member") await requireGymMember(gymId);
          destination = next.pathname;
        } catch (error) { if (!(error instanceof AuthorizationError)) throw error; }
      } else if (next.pathname === "/invitations/accept" || /^\/gyms\/[^/]+\/join$/.test(next.pathname)) {
        destination = `${next.pathname}${next.search}`;
      } else if (next.pathname === "/dashboard") {
        destination = "/dashboard";
      }
    }

    return NextResponse.json({ destination }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ error: "Could not resolve your FitPass workspace." }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
