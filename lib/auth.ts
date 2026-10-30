import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";

import { getDb } from "@/lib/db";
import {
  authAccounts,
  authSessions,
  authUsers,
  authVerifications,
} from "@/lib/schema";
import { getAuthEnv } from "@/lib/env";
import { sendTransactionalEmail } from "@/lib/email";

function createAuth() {
  const env = getAuthEnv();
  return betterAuth({
    appName: "FitPass",
    baseURL: env.BETTER_AUTH_URL,
    secret: env.BETTER_AUTH_SECRET,
    database: drizzleAdapter(getDb(), {
      provider: "pg",
      schema: {
        user: authUsers,
        session: authSessions,
        account: authAccounts,
        verification: authVerifications,
      },
    }),
    emailAndPassword: {
      enabled: true,
      requireEmailVerification: true,
    },
    emailVerification: {
      sendOnSignUp: true,
      sendVerificationEmail: async ({ user, url }) => {
        await sendTransactionalEmail({
          to: user.email,
          subject: "Verify your FitPass email",
          text: `Confirm your email address by opening this link:\n\n${url}\n\nIf you did not create a FitPass account, you can ignore this email.`,
        });
      },
      autoSignInAfterVerification: true,
    },
    // No user role fields or role assignment hooks are exposed through signup.
  });
}

let authInstance: ReturnType<typeof createAuth> | undefined;

/** Build the auth handler on demand so importing routes does not require secrets. */
export function getAuth(): ReturnType<typeof createAuth> {
  authInstance ??= createAuth();
  return authInstance;
}
