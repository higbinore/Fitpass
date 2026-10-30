import "server-only";

import { getAuthEnv } from "@/lib/env";
import { sendTransactionalEmail } from "@/lib/email";

export async function sendGymInvitationEmail(input: {
  to: string;
  gymName: string;
  token: string;
}): Promise<void> {
  const { BETTER_AUTH_URL } = getAuthEnv();
  const url = new URL("/invitations/accept", BETTER_AUTH_URL);
  url.searchParams.set("token", input.token);
  await sendTransactionalEmail({
    to: input.to,
    subject: `Invitation to join ${input.gymName} on FitPass`,
    text: `You have been invited to ${input.gymName} on FitPass. Sign in or create an account using this email address, verify it, then accept the invitation here:\n\n${url.toString()}\n\nThis invitation expires in 72 hours. If you were not expecting it, ignore this message.`,
  });
}
