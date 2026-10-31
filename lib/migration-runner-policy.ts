export type MigrationRunMode = "local-rehearsal" | "production";

export function mayUseSqlFallback(mode: MigrationRunMode, allowSqlFallback: boolean): boolean {
  return mode === "local-rehearsal" || allowSqlFallback;
}

export function parseMigrationTarget(databaseUrl: string | undefined, mode: MigrationRunMode): URL {
  if (!databaseUrl) throw new Error("DATABASE_URL must be provided by the current process environment.");
  let parsed: URL;
  try {
    parsed = new URL(databaseUrl);
  } catch {
    throw new Error("DATABASE_URL is not a valid PostgreSQL URL.");
  }
  if (parsed.protocol !== "postgres:" && parsed.protocol !== "postgresql:") {
    throw new Error("Migration runner accepts PostgreSQL URLs only.");
  }
  if (mode === "local-rehearsal") {
    if (parsed.hostname.toLowerCase() !== "127.0.0.1" || Number(parsed.port || 5432) !== 55433 || parsed.pathname !== "/migrate_runner_test") {
      throw new Error("Local migration rehearsal is restricted to 127.0.0.1:55433/migrate_runner_test.");
    }
    if (decodeURIComponent(parsed.username) !== "postgres" || parsed.password) {
      throw new Error("Use local postgres authentication through pgpass.conf; DATABASE_URL must not contain a password.");
    }
    return parsed;
  }

  const host = parsed.hostname.toLowerCase();
  if (!host.endsWith(".neon.tech") || host.includes("-pooler")) {
    throw new Error("Production migrations require a direct, non-pooler Neon hostname.");
  }
  if (parsed.searchParams.get("sslmode") !== "require" && parsed.searchParams.get("sslmode") !== "verify-full") {
    throw new Error("The direct Neon DATABASE_URL must require TLS.");
  }
  return parsed;
}
