import { NextResponse } from "next/server";
import { z } from "zod";

import { getAuth } from "@/lib/auth";
import { getAuthEnv } from "@/lib/env";
import { PASSWORD_RESET_RESPONSE, requestPasswordResetPrivately } from "@/lib/password-reset-policy";

const requestSchema = z.object({ email: z.string().trim().email().max(254) }).strict();

export async function POST(request: Request) {
  const input = requestSchema.safeParse(await request.json().catch(() => null));
  if (!input.success) return NextResponse.json(PASSWORD_RESET_RESPONSE, { status: 202, headers: { "Cache-Control": "no-store" } });
  const response = await requestPasswordResetPrivately(async () => {
    const redirectTo = new URL("/reset-password", getAuthEnv().BETTER_AUTH_URL).toString();
    await getAuth().api.requestPasswordReset({ body: { email: input.data.email, redirectTo }, headers: request.headers });
  });
  return NextResponse.json(response, { status: 202, headers: { "Cache-Control": "no-store" } });
}
