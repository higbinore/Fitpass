import { Pool } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-serverless";
import { Pool as LocalPostgresPool } from "pg";
import { drizzle as drizzleLocalPostgres } from "drizzle-orm/node-postgres";
import { getDatabaseUrl } from "./env";
import * as schema from "./schema";

/**
 * Database access for FitPass.
 *
 * The pooled WebSocket driver is used instead of the HTTP driver because the
 * check-in and Paystack webhook paths need real transactions and row locks
 * (`SELECT ... FOR UPDATE`), which the HTTP driver does not support.
 *
 * The connection is created lazily so that builds and lint runs do not need a
 * database, and so a missing DATABASE_URL fails at the point of use with the
 * variable name only — never the value.
 */
function createDatabase(connectionString: string) {
  const url = new URL(connectionString);
  const isLoopback = ["localhost", "127.0.0.1", "::1", "[::1]"].includes(
    url.hostname.toLowerCase(),
  );

  // Local PostgreSQL has no Neon WebSocket proxy. Keep the Neon serverless
  // driver for hosted databases and use node-postgres only for loopback URLs.
  if (isLoopback) {
    const pool = new LocalPostgresPool({ connectionString });
    return drizzleLocalPostgres(pool, { schema });
  }

  const pool = new Pool({ connectionString });
  return drizzle(pool, { schema });
}

type Database = ReturnType<typeof createDatabase>;

let database: Database | null = null;

export function getDb(): Database {
  if (!database) {
    database = createDatabase(getDatabaseUrl());
  }

  return database;
}

export { schema };
