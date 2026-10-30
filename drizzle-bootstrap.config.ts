import { defineConfig } from "drizzle-kit";

/** Fresh-database config. The connection target is hard-limited to loopback. */
const disposableUrl = process.env.FITPASS_DISPOSABLE_DATABASE_URL;
if (!disposableUrl) {
  throw new Error("FITPASS_DISPOSABLE_DATABASE_URL must point to a local disposable PostgreSQL database.");
}
const host = new URL(disposableUrl).hostname;
if (host !== "localhost" && host !== "127.0.0.1" && host !== "::1") {
  throw new Error("Fresh-database bootstrap commands are restricted to a local disposable PostgreSQL host.");
}

export default defineConfig({
  schema: "./lib/schema.ts",
  out: "./drizzle-bootstrap",
  dialect: "postgresql",
  dbCredentials: { url: disposableUrl },
  schemaFilter: ["public"],
  migrations: { table: "__drizzle_migrations", schema: "public" },
});
