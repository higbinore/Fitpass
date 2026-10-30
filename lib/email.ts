import "server-only";

import { getEmailEnv } from "@/lib/env";

/** Sends plain-text transactional mail without logging credentials or payloads. */
export async function sendTransactionalEmail(input: {
  to: string;
  subject: string;
  text: string;
}): Promise<void> {
  const env = getEmailEnv();
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ from: env.EMAIL_FROM, ...input }),
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(`Transactional email delivery failed (HTTP ${response.status}).`);
  }
}
