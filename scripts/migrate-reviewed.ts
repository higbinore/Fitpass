import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { createReadStream, existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { Pool, type PoolClient } from "pg";

import { mayUseSqlFallback, parseMigrationTarget, type MigrationRunMode } from "../lib/migration-runner-policy.ts";

const ROOT = resolve(fileURLToPath(new URL("..", import.meta.url)));
const MIGRATIONS = resolve(ROOT, "drizzle");
const PLAN_IDS = [
  "cedb6309-8a1c-4dc4-b95c-6ff28e2877a0",
  "9cc70b0f-3445-4232-995f-0fde36c36c3c",
  "d4710408-7014-4c07-be21-18ef3d5e8a64",
  "4df6abf0-c63a-44f0-bbfe-28273282fc16",
] as const;
const PLAN_FIXTURES = [
  { id: PLAN_IDS[0], name: "Day Pass", durationDays: 1, priceKobo: 200000, description: "One full day at the gym, for visitors and drop-ins.", active: true, sortOrder: 1, createdAtUtc: "2026-10-29T14:55:33.425497Z" },
  { id: PLAN_IDS[1], name: "Monthly", durationDays: 30, priceKobo: 1500000, description: "30 days of unlimited visits.", active: true, sortOrder: 2, createdAtUtc: "2026-10-29T14:55:33.732095Z" },
  { id: PLAN_IDS[2], name: "3 Months", durationDays: 90, priceKobo: 4000000, description: "90 days of unlimited visits, about ₦13,333 a month.", active: true, sortOrder: 3, createdAtUtc: "2026-10-29T14:55:33.990846Z" },
  { id: PLAN_IDS[3], name: "Annual", durationDays: 365, priceKobo: 14000000, description: "A full year of unlimited visits, about ₦11,667 a month.", active: true, sortOrder: 4, createdAtUtc: "2026-10-29T14:55:34.360475Z" },
] as const;
const LEGACY_TABLES = ["plans", "members", "subscriptions", "payments", "checkins"] as const;

type JournalEntry = { idx: number; tag: string; when: number };
type RunnerArgs = { mode: MigrationRunMode; allowSqlFallback: boolean; confirmBackup: boolean; backupFile: string; backupSha256: string };

function fail(message: string): never {
  throw new Error(message);
}

function parseArgs(args: string[]): RunnerArgs {
  const production = args.includes("--confirm-production");
  const rehearsal = args.includes("--local-rehearsal");
  if (production === rehearsal) fail("Choose exactly one mode: --local-rehearsal or --confirm-production.");
  const allowSqlFallback = args.includes("--allow-sql-fallback");
  if (allowSqlFallback && !production) fail("--allow-sql-fallback is only meaningful with --confirm-production.");
  const confirmBackup = args.includes("--confirm-backup");
  if (production && !confirmBackup) fail("Production mode requires --confirm-backup after fresh backup verification.");
  const backupFileIndex = args.indexOf("--backup-file");
  const backupHashIndex = args.indexOf("--backup-sha256");
  if (backupFileIndex < 0 || backupHashIndex < 0 || !args[backupFileIndex + 1] || !args[backupHashIndex + 1]) {
    fail("A verified backup is required: provide --backup-file and --backup-sha256.");
  }
  const known = new Set(["--local-rehearsal", "--confirm-production", "--confirm-backup", "--allow-sql-fallback", "--backup-file", args[backupFileIndex + 1], "--backup-sha256", args[backupHashIndex + 1]]);
  if (args.some((arg) => !known.has(arg))) fail("Migration runner received an unsupported argument.");
  const backupSha256 = args[backupHashIndex + 1].toLowerCase();
  if (!/^[a-f0-9]{64}$/.test(backupSha256)) fail("--backup-sha256 must be a 64-character hexadecimal SHA-256.");
  return {
    mode: production ? "production" : "local-rehearsal",
    allowSqlFallback,
    confirmBackup,
    backupFile: resolve(args[backupFileIndex + 1]),
    backupSha256,
  };
}

function scrub(value: string, databaseUrl: string): string {
  let safe = value.replaceAll(databaseUrl, "[DATABASE_URL redacted]");
  try {
    const parsed = new URL(databaseUrl);
    if (parsed.password) safe = safe.replaceAll(decodeURIComponent(parsed.password), "[password redacted]");
  } catch {
    // The URL was validated before any process or connection is started.
  }
  safe = safe.replace(/postgres(?:ql)?:\/\/[^\s"'`<>]+/gi, "[DATABASE_URL redacted]");
  return safe;
}

function sha256File(file: string): Promise<string> {
  return new Promise((resolvePromise, reject) => {
    const digest = createHash("sha256");
    const stream = createReadStream(file);
    stream.on("data", (chunk) => {
      digest.update(chunk);
    });
    stream.once("error", reject);
    stream.once("end", () => resolvePromise(digest.digest("hex")));
  });
}

function pgTool(name: "pg_restore.exe" | "psql.exe"): string {
  const override = process.env[name === "pg_restore.exe" ? "PG_RESTORE_BIN" : "PSQL_BIN"];
  if (override) return override;
  if (process.platform === "win32") {
    const programFiles = process.env.ProgramFiles ?? "C:\\Program Files";
    return join(programFiles, "PostgreSQL", "18", "bin", name);
  }
  return name.replace(/\.exe$/, "");
}

function verifyBackup(file: string, expectedHash: string) {
  if (!existsSync(file)) fail("The verified backup file does not exist at the supplied path.");
  const restoredList = spawnSync(pgTool("pg_restore.exe"), ["--list", file], {
    cwd: ROOT,
    windowsHide: true,
    encoding: "utf8",
    maxBuffer: 8 * 1024 * 1024,
  });
  if (restoredList.error || restoredList.status !== 0) fail("pg_restore --list could not verify the supplied backup archive.");
  return sha256File(file).then((actualHash) => {
    if (actualHash !== expectedHash) fail("Backup SHA-256 does not match --backup-sha256; no database connection was opened.");
  });
}

function loadJournal(): JournalEntry[] {
  const path = resolve(MIGRATIONS, "meta/_journal.json");
  if (!existsSync(path)) fail("Drizzle migration journal is missing.");
  const journal = JSON.parse(readFileSync(path, "utf8")) as { entries?: JournalEntry[] };
  if (!Array.isArray(journal.entries) || journal.entries.length !== 5) fail("Expected the reviewed five-entry FitPass migration journal.");
  return journal.entries;
}

function safeChildEnv(databaseUrl: string): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { DATABASE_URL: databaseUrl, NODE_ENV: "production" };
  for (const key of ["PATH", "PATHEXT", "SystemRoot", "WINDIR", "TEMP", "TMP", "APPDATA", "PGPASSFILE", "USERPROFILE", "HOME", "ProgramFiles"]) {
    if (process.env[key]) env[key] = process.env[key];
  }
  const guard = resolve(ROOT, "scripts/dev-demo-preload.cjs").replaceAll("\\", "/");
  env.NODE_OPTIONS = `--require="${guard}"`;
  return env;
}

async function getAppliedMigrations(client: PoolClient, journal: JournalEntry[]) {
  const exists = await client.query<{ present: boolean }>("SELECT to_regclass('public.__drizzle_migrations') IS NOT NULL AS present");
  if (!exists.rows[0]?.present) return [] as Array<{ hash: string; created_at: string }>;
  const result = await client.query<{ hash: string; created_at: string }>("SELECT hash, created_at::text FROM public.__drizzle_migrations ORDER BY created_at");
  const journalMap = new Map(journal.map((entry) => [String(entry.when), entry]));
  const appliedIdx = new Set<number>();
  for (const row of result.rows) {
    const entry = journalMap.get(String(row.created_at));
    if (!entry || entry.idx < 0 || entry.idx >= journal.length) fail("Migration history does not match the reviewed Drizzle journal.");
    const migrationFile = resolve(MIGRATIONS, `${entry.tag}.sql`);
    const migrationHash = createHash("sha256").update(readFileSync(migrationFile)).digest("hex");
    if (row.hash !== migrationHash) fail(`Migration ${entry.tag} has a journal hash mismatch; no migration was run.`);
    appliedIdx.add(entry.idx);
  }
  for (let idx = 0; idx < journal.length; idx += 1) {
    if (appliedIdx.has(idx) && [...Array(idx).keys()].some((prior) => !appliedIdx.has(prior))) {
      fail("Migration history has a gap; no migration was run.");
    }
  }
  return result.rows;
}

async function readPlanFingerprint(client: PoolClient, includeTenant: boolean) {
  const result = await client.query<{
    id: string; name: string; duration_days: number; price_kobo: number; description: string;
    is_active: boolean; sort_order: number; created_at_utc: string; gym_id?: string | null;
  }>(
    `SELECT id::text, name, duration_days, price_kobo, description, is_active, sort_order,
      to_char(created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS created_at_utc${includeTenant ? ", gym_id::text" : ""}
     FROM public.plans WHERE id = ANY($1::uuid[]) ORDER BY sort_order`,
    [PLAN_IDS],
  );
  if (result.rowCount !== PLAN_FIXTURES.length) fail("Preflight requires all four approved plan records; no migration was run.");
  for (let index = 0; index < PLAN_FIXTURES.length; index += 1) {
    const expected = PLAN_FIXTURES[index];
    const actual = result.rows[index];
    if (
      actual.id !== expected.id || actual.name !== expected.name || actual.duration_days !== expected.durationDays ||
      actual.price_kobo !== expected.priceKobo || actual.description !== expected.description ||
      actual.is_active !== expected.active || actual.sort_order !== expected.sortOrder || actual.created_at_utc !== expected.createdAtUtc
    ) fail(`Plan ${expected.id} does not match the complete verified backup fingerprint; no migration was run.`);
  }
  return result.rows;
}

async function readLegacyCounts(client: PoolClient) {
  const counts = new Map<string, number>();
  for (const table of LEGACY_TABLES) {
    const result = await client.query<{ count: string }>(`SELECT count(*)::text AS count FROM public."${table}"`);
    counts.set(table, Number(result.rows[0].count));
  }
  return counts;
}

function runDrizzle(node22: string, databaseUrl: string): { ok: boolean; diagnostic: string } {
  const drizzleKit = resolve(ROOT, "node_modules/drizzle-kit/bin.cjs");
  if (!existsSync(drizzleKit)) return { ok: false, diagnostic: "Installed Drizzle Kit executable is missing." };
  const version = spawnSync(node22, ["--version"], { cwd: ROOT, env: safeChildEnv(databaseUrl), windowsHide: true, encoding: "utf8" });
  if (version.error || version.status !== 0 || !/^v22\./.test((version.stdout ?? "").trim())) {
    return { ok: false, diagnostic: "The configured side-by-side Node runtime is not Node 22." };
  }
  const result = spawnSync(node22, [drizzleKit, "migrate", "--config=drizzle.config.ts"], {
    cwd: ROOT,
    env: safeChildEnv(databaseUrl),
    windowsHide: true,
    encoding: "utf8",
    maxBuffer: 16 * 1024 * 1024,
  });
  if (!result.error && result.status === 0) return { ok: true, diagnostic: result.stdout ?? "" };
  return { ok: false, diagnostic: scrub(`${result.error?.message ?? ""}\n${result.stderr ?? ""}\n${result.stdout ?? ""}`, databaseUrl).trim() };
}

function runSqlFallback(databaseUrl: string, journal: JournalEntry[]) {
  const parsed = new URL(databaseUrl);
  const baseEnv = safeChildEnv(databaseUrl);
  baseEnv.PGHOST = parsed.hostname.replace(/^\[|\]$/g, "");
  baseEnv.PGPORT = String(parsed.port || 5432);
  baseEnv.PGDATABASE = decodeURIComponent(parsed.pathname.replace(/^\//, ""));
  baseEnv.PGUSER = decodeURIComponent(parsed.username);
  if (parsed.password) baseEnv.PGPASSWORD = decodeURIComponent(parsed.password);
  if (parsed.searchParams.has("sslmode")) baseEnv.PGSSLMODE = parsed.searchParams.get("sslmode") ?? undefined;
  const psql = pgTool("psql.exe");

  for (const entry of journal) {
    const migrationPath = resolve(MIGRATIONS, `${entry.tag}.sql`);
    if (!existsSync(migrationPath)) fail(`Migration ${entry.tag} is missing.`);
    const hash = createHash("sha256").update(readFileSync(migrationPath)).digest("hex");
    const historyCheck = spawnSync(psql, ["-X", "-A", "-t", "-v", "ON_ERROR_STOP=1", "-c", "SELECT to_regclass('public.__drizzle_migrations') IS NOT NULL"], {
      cwd: ROOT, env: baseEnv, windowsHide: true, encoding: "utf8", maxBuffer: 1024 * 1024,
    });
    if (historyCheck.error || historyCheck.status !== 0) fail("Could not inspect migration history with psql.");
    let applied: Array<[string, string]> = [];
    if (historyCheck.stdout.trim() === "t") {
      const history = spawnSync(psql, ["-X", "-A", "-t", "-v", "ON_ERROR_STOP=1", "-c", "SELECT hash || '|' || created_at::text FROM public.__drizzle_migrations ORDER BY created_at"], {
        cwd: ROOT, env: baseEnv, windowsHide: true, encoding: "utf8", maxBuffer: 1024 * 1024,
      });
      if (history.error || history.status !== 0) fail("Could not read migration history with psql.");
      applied = history.stdout.split(/\r?\n/).filter(Boolean).map((row) => {
        const separator = row.lastIndexOf("|");
        return [row.slice(0, separator), row.slice(separator + 1)];
      });
    }
    const prior = applied.find(([, timestamp]) => timestamp === String(entry.when));
    if (prior) {
      if (prior[0] !== hash) fail(`Migration ${entry.tag} hash mismatch; it was not replayed.`);
      continue;
    }
    if (applied.some(([, timestamp]) => Number(timestamp) > entry.when)) fail(`Migration history skips ${entry.tag}; it was not applied.`);
    const ddl = "CREATE TABLE IF NOT EXISTS public.__drizzle_migrations (id SERIAL PRIMARY KEY, hash text NOT NULL, created_at bigint)";
    const historyInsert = `INSERT INTO public.__drizzle_migrations (hash, created_at) VALUES ('${hash}', ${entry.when})`;
    const result = spawnSync(psql, ["-X", "-1", "-v", "ON_ERROR_STOP=1", "-c", ddl, "-f", migrationPath, "-c", historyInsert], {
      cwd: ROOT, env: baseEnv, windowsHide: true, encoding: "utf8", maxBuffer: 16 * 1024 * 1024,
    });
    if (result.error || result.status !== 0) fail(`Local SQL fallback failed at ${entry.tag}: ${scrub(`${result.stderr ?? ""}\n${result.stdout ?? ""}`, databaseUrl).trim()}`);
  }
}

async function verifyPostMigration(client: PoolClient, beforePlans: Awaited<ReturnType<typeof readPlanFingerprint>>, beforeCounts: Map<string, number>) {
  const afterPlans = await readPlanFingerprint(client, true);
  for (let index = 0; index < PLAN_FIXTURES.length; index += 1) {
    if (JSON.stringify({ ...beforePlans[index], gym_id: undefined }) !== JSON.stringify({ ...afterPlans[index], gym_id: undefined })) {
      fail("A confirmed plan field changed during migration; stop and restore the disposable database.");
    }
    if (!afterPlans[index].gym_id) fail("A confirmed plan was not assigned to a gym.");
  }
  const launchGym = await client.query<{ id: string; name: string }>("SELECT id::text, name FROM public.gyms WHERE slug = 'fitpass-elite-fitness-club'");
  if (launchGym.rowCount !== 1 || launchGym.rows[0].name !== "FITPASS ELITE FITNESS CLUB") fail("The approved initial gym is missing or has a different identity.");
  const planGymIds = new Set(afterPlans.map((row) => row.gym_id));
  if (planGymIds.size !== 1 || !planGymIds.has(launchGym.rows[0].id)) fail("The four confirmed plans are not all assigned to the approved initial gym.");

  const afterCounts = await readLegacyCounts(client);
  for (const table of LEGACY_TABLES) if (beforeCounts.get(table) !== afterCounts.get(table)) fail(`Legacy ${table} row count changed during migration.`);
  const nulls = await client.query<{ count: string }>(`SELECT
    (SELECT count(*) FROM public.plans WHERE gym_id IS NULL) +
    (SELECT count(*) FROM public.members WHERE gym_id IS NULL) +
    (SELECT count(*) FROM public.subscriptions WHERE gym_id IS NULL) +
    (SELECT count(*) FROM public.payments WHERE gym_id IS NULL) +
    (SELECT count(*) FROM public.checkins WHERE gym_id IS NULL) AS count`);
  if (Number(nulls.rows[0].count) !== 0) fail("Tenant backfill left NULL gym_id values.");

  const constraints = await client.query<{ scoped_foreign_keys: string; actor_fk: string; daily_limit: number | null; dup_plans: string; dup_codes: string }>(`SELECT
    (SELECT count(*)::text FROM pg_constraint c JOIN pg_class r ON r.oid=c.conrelid
      WHERE c.contype='f' AND c.connamespace='public'::regnamespace
      AND r.relname IN ('plans','members','subscriptions','payments','checkins')
      AND pg_get_constraintdef(c.oid) LIKE '%gym_id%') AS scoped_foreign_keys,
    (SELECT count(*)::text FROM pg_constraint c JOIN pg_class r ON r.oid=c.conrelid
      WHERE c.contype='f' AND r.relname='checkins'
      AND pg_get_constraintdef(c.oid) LIKE 'FOREIGN KEY (checked_in_by) REFERENCES members(id)%') AS actor_fk,
    (SELECT max(max_daily_checkins) FROM public.gyms WHERE slug='fitpass-elite-fitness-club') AS daily_limit,
    (SELECT count(*)::text FROM (SELECT gym_id,name FROM public.plans GROUP BY gym_id,name HAVING count(*)>1) d) AS dup_plans,
    (SELECT count(*)::text FROM (SELECT gym_id,membership_code FROM public.members GROUP BY gym_id,membership_code HAVING count(*)>1) d) AS dup_codes`);
  const result = constraints.rows[0];
  if (Number(result.scoped_foreign_keys) !== 10 || result.actor_fk !== "1" || result.daily_limit !== 1 || result.dup_plans !== "0" || result.dup_codes !== "0") {
    fail("Tenant constraints, check-in actor attribution, daily limit, or scoped uniqueness verification failed.");
  }
  const migrationRows = await client.query<{ count: string }>("SELECT count(*)::text AS count FROM public.__drizzle_migrations");
  if (migrationRows.rows[0].count !== String(loadJournal().length)) fail("Expected all reviewed Drizzle migrations to be recorded after the runner completed.");
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.mode === "production" && !process.argv.includes("--confirm-production")) fail("Production mode requires --confirm-production.");
  if (args.mode === "production" && !args.confirmBackup) fail("Production mode requires --confirm-backup after fresh backup verification.");
  if (args.mode === "local-rehearsal" && process.env.FITPASS_DEMO_LOCAL_ONLY === "1") fail("Migration rehearsal and review-server processes must run separately.");

  const databaseUrl = process.env.DATABASE_URL;
  const target = parseMigrationTarget(databaseUrl, args.mode);
  if (args.mode === "production" && process.env.FITPASS_DEMO_LOCAL_ONLY === "1") fail("Production migration mode refuses local demo process settings.");
  const expectedTarget = args.mode === "local-rehearsal" ? "127.0.0.1:55433/migrate_runner_test" : "direct Neon (non-pooler)";
  process.stdout.write(`Reviewed migration target accepted: ${expectedTarget}. Connection details are not printed.\n`);

  await verifyBackup(args.backupFile, args.backupSha256);
  process.stdout.write("Backup archive and SHA-256 verification passed.\n");
  const journal = loadJournal();
  const pool = new Pool({ connectionString: databaseUrl, max: 1, application_name: "fitpass-reviewed-migration" });
  const client = await pool.connect();
  try {
    await client.query("SELECT 1");
    const beforePlans = await readPlanFingerprint(client, false);
    const beforeCounts = await readLegacyCounts(client);
    await getAppliedMigrations(client, journal);
    const node22 = process.env.FITPASS_NODE22_EXE ?? join(
      process.env.LOCALAPPDATA ?? "",
      "FitPassTools", "node-v22.23.4", "node-v22.23.4-win-x64", "node.exe",
    );
    const drizzle = runDrizzle(node22, databaseUrl!);
    if (!drizzle.ok) {
      if (!mayUseSqlFallback(args.mode, args.allowSqlFallback)) {
        fail(`Drizzle Kit migration failed; production SQL fallback is disabled. ${scrub(drizzle.diagnostic, databaseUrl!)}`.trim());
      }
      const safeDiagnostic = scrub(drizzle.diagnostic, databaseUrl!);
      process.stderr.write(`Drizzle Kit migration failed in ${args.mode}; ${args.mode === "production" ? "explicit SQL fallback flag accepted" : "local-only SQL fallback permitted"}. ${safeDiagnostic}\n`);
      process.stdout.write("Using journaled per-file transactions.\n");
      runSqlFallback(databaseUrl!, journal);
    } else {
      process.stdout.write("Drizzle Kit migration completed under the verified Node 22 runtime.\n");
    }
    await verifyPostMigration(client, beforePlans, beforeCounts);
    process.stdout.write("Post-migration preservation, tenant, constraint, and launch-plan checks passed.\n");
  } finally {
    client.release();
    await pool.end();
  }
  void target;
}

main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.message : "Reviewed migration runner failed."}\n`);
  process.exitCode = 1;
});
