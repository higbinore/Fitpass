import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { defineConfig } from "drizzle-kit";

/**
 * Drizzle Kit reads DATABASE_URL from the environment. Next.js loads
 * .env.local automatically, but Drizzle Kit does not, so the value is read
 * from that file here. The value is never logged.
 */
function readDatabaseUrl(): string {
  if (process.env.DATABASE_URL) {
    return process.env.DATABASE_URL;
  }

  const envPath = resolve(process.cwd(), ".env.local");

  try {
    const contents = readFileSync(envPath, "utf8");

    for (const line of contents.split(/\r?\n/)) {
      const match = line.match(/^\s*DATABASE_URL\s*=\s*(.+?)\s*$/);

      if (match) {
        return match[1].replace(/^["']|["']$/g, "");
      }
    }
  } catch {
    // Fall through to the error below.
  }

  throw new Error(
    "DATABASE_URL is not set. Add it to .env.local (local) or the Vercel environment variables (deployed).",
  );
}

export default defineConfig({
  schema: "./lib/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url: readDatabaseUrl(),
  },
  verbose: true,
});
