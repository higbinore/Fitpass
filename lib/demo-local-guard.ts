export type LocalDemoTarget = {
  host: string;
  port: number;
  database: string;
  username: string;
  password: string;
  sslMode: string | null;
};

const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);

/** Parse a database target without ever returning or logging the source URL. */
export function parseLocalDemoDatabaseUrl(value: string | undefined): LocalDemoTarget {
  if (!value) throw new Error("Set DATABASE_URL in this terminal to the local disposable database before running the demo.");

  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error("DATABASE_URL is not a valid PostgreSQL URL.");
  }

  if (url.protocol !== "postgres:" && url.protocol !== "postgresql:") {
    throw new Error("The local demo accepts PostgreSQL URLs only.");
  }

  const host = url.hostname.toLowerCase();
  if (!LOOPBACK_HOSTS.has(host)) {
    throw new Error("The local demo is restricted to localhost, 127.0.0.1, or ::1. Remote database targets are refused.");
  }

  for (const key of url.searchParams.keys()) {
    if (key.toLowerCase() !== "sslmode") {
      throw new Error("DATABASE_URL contains unsupported connection overrides; only an optional sslmode is allowed.");
    }
  }
  if (url.hash) throw new Error("DATABASE_URL fragments are not supported.");

  const database = decodeURIComponent(url.pathname.replace(/^\//, ""));
  if (!/^[a-z0-9_-]+$/i.test(database) || !/(demo|test)/i.test(database)) {
    throw new Error("The local database name must contain 'demo' or 'test'.");
  }

  const port = Number(url.port || 5432);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error("DATABASE_URL must use a valid PostgreSQL port.");
  }

  return {
    host: host.replace(/^\[|\]$/g, ""),
    port,
    database,
    username: decodeURIComponent(url.username),
    password: decodeURIComponent(url.password),
    sslMode: url.searchParams.get("sslmode"),
  };
}

/** Strict target for the long-running review server; never reuse the broader demo/test guard. */
export function parseLocalReviewServerTarget(value: string | undefined): LocalDemoTarget {
  const target = parseLocalDemoDatabaseUrl(value);
  if (target.host !== "127.0.0.1" || target.port !== 55433 || target.database !== "demo_test") {
    throw new Error("The review server is restricted to 127.0.0.1:55433/demo_test.");
  }
  if (target.username !== "postgres" || target.password) {
    throw new Error("Use the local postgres account through pgpass.conf; do not put a password in DATABASE_URL.");
  }
  return target;
}
