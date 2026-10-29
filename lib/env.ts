import { z } from "zod";

/**
 * Server-only environment configuration.
 *
 * Parsed lazily (on first use) so that `next build` and `npm run lint` can run
 * before any secrets exist. Import this only from server code: route handlers,
 * Server Actions, and `lib/` modules that never reach the browser.
 */
const envSchema = z
  .object({
    DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
    BETTER_AUTH_SECRET: z
      .string()
      .min(32, "BETTER_AUTH_SECRET must be at least 32 characters"),
    BETTER_AUTH_URL: z.string().min(1, "BETTER_AUTH_URL is required"),
    PAYSTACK_SECRET_KEY: z.string().min(1, "PAYSTACK_SECRET_KEY is required"),
    RESEND_API_KEY: z.string().min(1, "RESEND_API_KEY is required"),
    EMAIL_FROM: z.string().min(3, "EMAIL_FROM is required"),
    CRON_SECRET: z.string().min(16, "CRON_SECRET must be at least 16 characters"),
  })
  .superRefine((value, ctx) => {
    if (!value.PAYSTACK_SECRET_KEY.startsWith("sk_test_")) {
      ctx.addIssue({
        code: "custom",
        path: ["PAYSTACK_SECRET_KEY"],
        message:
          "PAYSTACK_SECRET_KEY must be a Paystack TEST key (sk_test_...). Live keys are not allowed in this project.",
      });
    }
  });

export type Env = z.infer<typeof envSchema>;

let cached: Env | null = null;

/**
 * The database connection string on its own.
 *
 * getEnv() validates everything FitPass will eventually need (auth, Paystack,
 * Resend). Until those secrets exist, the database is the only setting the app
 * requires, so database code uses this instead of the full schema.
 */
export function getDatabaseUrl(): string {
  const url = process.env.DATABASE_URL;

  if (!url) {
    throw new Error(
      "DATABASE_URL is not set. Add it to .env.local for local development, or to the Vercel project settings for deployments.",
    );
  }

  return url;
}

/**
 * Returns the validated environment, or throws with the names of the settings
 * that are missing or invalid. It never includes the values in the message.
 */
export function getEnv(): Env {
  if (cached) {
    return cached;
  }

  const parsed = envSchema.safeParse(process.env);

  if (!parsed.success) {
    const problems = parsed.error.issues
      .map((issue) => `  - ${issue.path.join(".")}: ${issue.message}`)
      .join("\n");

    throw new Error(
      `FitPass environment configuration is incomplete:\n${problems}\n` +
        "Add these names to .env.local for local development, or to the Vercel project settings for deployments. Never commit the values.",
    );
  }

  cached = parsed.data;
  return cached;
}
