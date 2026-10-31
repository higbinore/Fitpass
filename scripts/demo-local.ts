import { spawnSync } from "node:child_process";
import { randomBytes, randomUUID, createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import { hashPassword } from "better-auth/crypto";

import { parseLocalDemoDatabaseUrl } from "../lib/demo-local-guard.ts";
import { FIXED_FITPASS_PACKAGES } from "../lib/platform-package-policy.ts";

const ROOT = process.cwd();
const MIGRATIONS_DIR = resolve(ROOT, "drizzle");
const INITIAL_GYM_SLUG = "fitpass-elite-fitness-club";
const LEGACY_TABLES = ["plans", "members", "subscriptions", "payments", "checkins"] as const;
const PLAN_FIXTURES = [
  { id: "cedb6309-8a1c-4dc4-b95c-6ff28e2877a0", name: "Day Pass", durationDays: 1, priceKobo: 200_000 },
  { id: "9cc70b0f-3445-4232-995f-0fde36c36c3c", name: "Monthly", durationDays: 30, priceKobo: 1_500_000 },
  { id: "d4710408-7014-4c07-be21-18ef3d5e8a64", name: "3 Months", durationDays: 90, priceKobo: 4_000_000 },
  { id: "4df6abf0-c63a-44f0-bbfe-28273282fc16", name: "Annual", durationDays: 365, priceKobo: 14_000_000 },
] as const;
const DEMO_USERS = [
  { key: "admin", name: "Demo Platform Administrator", email: "platform-admin@fitpass-demo.test" },
  { key: "owner", name: "Demo Gym Owner", email: "gym-owner@fitpass-demo.test" },
  { key: "desk", name: "Demo Desk Staff", email: "desk-staff@fitpass-demo.test" },
  { key: "member", name: "Demo Gym Member", email: "gym-member@fitpass-demo.test" },
] as const;

type DemoUserKey = (typeof DEMO_USERS)[number]["key"];

function fail(message: string): never {
  throw new Error(message);
}

function sqlLiteral(value: string): string {
  return `'${value.replaceAll("'", "''")}'`;
}

function redacted(value: string, connectionString: string): string {
  let output = value.replaceAll(connectionString, "[DATABASE_URL redacted]");
  try {
    const parsed = new URL(connectionString);
    if (parsed.password) {
      output = output.replaceAll(parsed.password, "[password redacted]");
      output = output.replaceAll(decodeURIComponent(parsed.password), "[password redacted]");
    }
  } catch {
    // The URL was already validated before any child process is started.
  }
  return output;
}

function childEnvironment(extra: Partial<NodeJS.ProcessEnv> = {}): NodeJS.ProcessEnv {
  const environment: NodeJS.ProcessEnv = { NODE_ENV: process.env.NODE_ENV ?? "development" };
  for (const key of ["PATH", "PATHEXT", "SystemRoot", "WINDIR", "TEMP", "TMP", "LANG", "LC_ALL", "APPDATA", "PGPASSFILE", "USERPROFILE", "HOME"]) {
    if (process.env[key]) environment[key] = process.env[key];
  }
  return Object.assign(environment, extra);
}

function psqlEnvironment(databaseUrl: string) {
  const target = parseLocalDemoDatabaseUrl(databaseUrl);
  const environment = childEnvironment();
  environment.PGHOST = target.host;
  environment.PGPORT = String(target.port);
  environment.PGDATABASE = target.database;
  if (target.username) environment.PGUSER = target.username;
  else delete environment.PGUSER;
  if (target.password) environment.PGPASSWORD = target.password;
  else delete environment.PGPASSWORD;
  if (target.sslMode) environment.PGSSLMODE = target.sslMode;
  else delete environment.PGSSLMODE;
  return environment;
}

function psql(sql: string, databaseUrl: string, capture = false): string {
  const connectionEnvironment = psqlEnvironment(databaseUrl);
  const result = spawnSync("psql", ["-X", "-v", "ON_ERROR_STOP=1", "-A", "-t", ...(capture ? ["-c", sql] : [])], {
    cwd: ROOT,
    env: connectionEnvironment,
    input: capture ? undefined : sql,
    encoding: "utf8",
    maxBuffer: 8 * 1024 * 1024,
    windowsHide: true,
  });
  if (result.error) fail("PostgreSQL client psql is unavailable. Install PostgreSQL 18 client tools and retry.");
  if (result.status !== 0) {
    const safeOutput = redacted(`${result.stderr ?? ""}${result.stdout ?? ""}`, databaseUrl).trim();
    fail(`Local PostgreSQL command failed${safeOutput ? `: ${safeOutput}` : "."}`);
  }
  return (result.stdout ?? "").trim();
}

function verifyLegacySource(databaseUrl: string) {
  const tableCheck = psql(
    `SELECT count(*) FROM information_schema.tables WHERE table_schema = 'public' AND table_name IN (${LEGACY_TABLES.map(sqlLiteral).join(",")})`,
    databaseUrl,
    true,
  );
  if (tableCheck !== String(LEGACY_TABLES.length)) {
    fail("The local target must first be restored from the independent pre-migration FitPass backup. An empty or partial database is not a valid source for this preservation rehearsal.");
  }

  const plans = psql(
    `SELECT coalesce(json_agg(json_build_array(id::text, name, duration_days, price_kobo, description, is_active, sort_order, created_at::text) ORDER BY id)::text, '[]') FROM public.plans WHERE id IN (${PLAN_FIXTURES.map((plan) => `${sqlLiteral(plan.id)}::uuid`).join(",")})`,
    databaseUrl,
    true,
  );
  let records: unknown;
  try {
    records = JSON.parse(plans);
  } catch {
    fail("Could not verify the preserved launch plan records in the local database.");
  }
  if (!Array.isArray(records) || records.length !== PLAN_FIXTURES.length) {
    fail("The local restored copy must contain exactly the four confirmed FitPass plan IDs before migration rehearsal.");
  }

  const planFacts = psql(
    `SELECT id::text || '|' || name || '|' || duration_days::text || '|' || price_kobo::text FROM public.plans WHERE id IN (${PLAN_FIXTURES.map((plan) => `${sqlLiteral(plan.id)}::uuid`).join(",")}) ORDER BY id`,
    databaseUrl,
    true,
  );
  const actual = new Set(planFacts.split(/\r?\n/).filter(Boolean));
  for (const plan of PLAN_FIXTURES) {
    if (!actual.has(`${plan.id}|${plan.name}|${plan.durationDays}|${plan.priceKobo}`)) {
      fail(`Plan ${plan.id} does not match its confirmed ID, name, duration, and kobo price. No migration was run.`);
    }
  }
  return plans;
}

function verifyPlanPreservation(before: string, databaseUrl: string) {
  const after = psql(
    `SELECT coalesce(json_agg(json_build_array(id::text, name, duration_days, price_kobo, description, is_active, sort_order, created_at::text) ORDER BY id)::text, '[]') FROM public.plans WHERE id IN (${PLAN_FIXTURES.map((plan) => `${sqlLiteral(plan.id)}::uuid`).join(",")})`,
    databaseUrl,
    true,
  );
  if (before !== after) fail("The plan record preservation check differed after migration; stop and restore a new disposable copy before proceeding.");
  const launchGym = psql(
    `SELECT count(*) FROM public.plans p JOIN public.gyms g ON g.id = p.gym_id WHERE g.slug = ${sqlLiteral(INITIAL_GYM_SLUG)} AND p.id IN (${PLAN_FIXTURES.map((plan) => `${sqlLiteral(plan.id)}::uuid`).join(",")})`,
    databaseUrl,
    true,
  );
  if (launchGym !== "4") fail("Not all four preserved plans are assigned to the approved initial gym after the staged migration.");
}

function runMigrations(databaseUrl: string) {
  const journalPath = resolve(MIGRATIONS_DIR, "meta/_journal.json");
  if (!existsSync(journalPath)) fail("The staged Drizzle migration journal is missing.");

  const journal = JSON.parse(readFileSync(journalPath, "utf8")) as {
    entries?: Array<{ tag: string; when: number }>;
  };
  if (!Array.isArray(journal.entries) || journal.entries.length === 0) {
    fail("The staged Drizzle migration journal is empty or invalid.");
  }

  const migrationTableExists = psql(
    "SELECT to_regclass('public.__drizzle_migrations') IS NOT NULL",
    databaseUrl,
    true,
  ) === "t";
  const applied = migrationTableExists
    ? JSON.parse(psql(
        "SELECT coalesce(json_agg(json_build_array(hash, created_at::text) ORDER BY created_at), '[]'::json)::text FROM public.__drizzle_migrations",
        databaseUrl,
        true,
      )) as Array<[string, string]>
    : [];
  const appliedByTimestamp = new Map(applied.map(([hash, timestamp]) => [timestamp, hash]));

  for (const entry of journal.entries) {
    const migrationPath = resolve(MIGRATIONS_DIR, `${entry.tag}.sql`);
    if (!existsSync(migrationPath)) fail(`Migration ${entry.tag} is missing from the local Drizzle folder.`);
    const migrationSql = readFileSync(migrationPath, "utf8");
    const hash = createHash("sha256").update(migrationSql).digest("hex");
    const timestamp = String(entry.when);
    const priorHash = appliedByTimestamp.get(timestamp);

    if (priorHash) {
      if (priorHash !== hash) fail(`Recorded migration ${entry.tag} has a different file hash; no migration was replayed.`);
      process.stdout.write(`Local migration already applied: ${entry.tag}\n`);
      continue;
    }

    if (applied.some(([, appliedTimestamp]) => Number(appliedTimestamp) > entry.when)) {
      fail(`Migration history skips ${entry.tag}; inspect this disposable database before continuing.`);
    }

    const historyTable = "CREATE TABLE IF NOT EXISTS public.__drizzle_migrations (id SERIAL PRIMARY KEY, hash text NOT NULL, created_at bigint)";
    const recordMigration = `INSERT INTO public.__drizzle_migrations (hash, created_at) VALUES ('${hash}', ${entry.when})`;
    const connectionEnvironment = psqlEnvironment(databaseUrl);
    const result = spawnSync("psql", [
      "-X", "-1", "-v", "ON_ERROR_STOP=1", "-c", historyTable,
      "-f", migrationPath, "-c", recordMigration,
    ], {
      cwd: ROOT,
      env: connectionEnvironment,
      encoding: "utf8",
      maxBuffer: 12 * 1024 * 1024,
      windowsHide: true,
    });
    if (result.error || result.status !== 0) {
      const diagnostic = redacted(`${result.stderr ?? ""}${result.stdout ?? ""}`, databaseUrl).trim();
      fail(`Local migration ${entry.tag} failed${diagnostic ? `: ${diagnostic}` : "."} Restore a fresh disposable copy before retrying.`);
    }

    applied.push([hash, timestamp]);
    appliedByTimestamp.set(timestamp, hash);
    process.stdout.write(`Applied local migration: ${entry.tag}\n`);
  }
}

function demoSeedSql(ids: Record<DemoUserKey, string>, membershipIds: Record<Exclude<DemoUserKey, "admin">, string>, passwordHash: string) {
  const userRows = DEMO_USERS.map((user) => `(${sqlLiteral(ids[user.key])}, ${sqlLiteral(user.name)}, ${sqlLiteral(user.email)}, true)`).join(",\n");
  const accountRows = DEMO_USERS.map((user) => `(${sqlLiteral(randomUUID())}, ${sqlLiteral(ids[user.key])}, 'credential', ${sqlLiteral(ids[user.key])}, ${sqlLiteral(passwordHash)})`).join(",\n");
  const roleRows = [
    `(${sqlLiteral(randomUUID())}, ${sqlLiteral(membershipIds.owner)}, 'gym_owner', NULL, ${sqlLiteral(ids.admin)})`,
    `(${sqlLiteral(randomUUID())}, ${sqlLiteral(membershipIds.desk)}, 'gym_desk_staff', ${sqlLiteral(membershipIds.owner)}, NULL)`,
    `(${sqlLiteral(randomUUID())}, ${sqlLiteral(membershipIds.member)}, 'gym_member', ${sqlLiteral(membershipIds.owner)}, NULL)`,
  ].join(",\n");
  const pendingReference = `fitpass_demo_gym_${randomUUID()}`;
  const membershipCode = `DEMO-FITPASS-${randomBytes(4).toString("hex").toUpperCase()}`;
  const inviteTokenHash = createHash("sha256").update(randomBytes(32)).digest("hex");

  const sql = `BEGIN;
DO $$ BEGIN
  IF (SELECT count(*) FROM public.gyms WHERE slug = '${INITIAL_GYM_SLUG}' AND status = 'active') <> 1 THEN
    RAISE EXCEPTION 'The approved active demo gym is missing.';
  END IF;
  IF (SELECT count(*) FROM public.plans WHERE gym_id = (SELECT id FROM public.gyms WHERE slug = '${INITIAL_GYM_SLUG}') AND id IN (${PLAN_FIXTURES.map((plan) => `'${plan.id}'::uuid`).join(",")})) <> 4 THEN
    RAISE EXCEPTION 'The four confirmed plans are not attached to the demo gym.';
  END IF;
  IF (SELECT count(*) FROM public.platform_packages WHERE name IN ('Starter','Growth','Professional','Enterprise')) <> 4 THEN
    RAISE EXCEPTION 'The fixed FitPass package catalog is incomplete or differs from the approved package values.';
  END IF;
END $$;

INSERT INTO public."user" (id, name, email, email_verified)
VALUES ${userRows};
INSERT INTO public."account" (id, account_id, provider_id, user_id, password)
VALUES ${accountRows};

INSERT INTO public.platform_admins (user_id, created_by_user_id)
VALUES (${sqlLiteral(ids.admin)}, 'local_demo_seed');
INSERT INTO public.gym_memberships (id, gym_id, user_id, status)
SELECT ${sqlLiteral(membershipIds.owner)}::uuid, g.id, ${sqlLiteral(ids.owner)}, 'active' FROM public.gyms g WHERE g.slug = '${INITIAL_GYM_SLUG}';
INSERT INTO public.gym_memberships (id, gym_id, user_id, status)
SELECT ${sqlLiteral(membershipIds.desk)}::uuid, g.id, ${sqlLiteral(ids.desk)}, 'active' FROM public.gyms g WHERE g.slug = '${INITIAL_GYM_SLUG}';
INSERT INTO public.gym_memberships (id, gym_id, user_id, status)
SELECT ${sqlLiteral(membershipIds.member)}::uuid, g.id, ${sqlLiteral(ids.member)}, 'active' FROM public.gyms g WHERE g.slug = '${INITIAL_GYM_SLUG}';
INSERT INTO public.gym_membership_roles (id, gym_id, membership_id, role, granted_by_membership_id, granted_by_platform_admin_user_id)
SELECT seed.id::uuid, g.id, seed.membership_id::uuid, seed.role, seed.granted_by_membership_id::uuid, seed.granted_by_platform_admin_user_id
FROM public.gyms g CROSS JOIN (VALUES ${roleRows}) AS seed(id, membership_id, role, granted_by_membership_id, granted_by_platform_admin_user_id)
WHERE g.slug = '${INITIAL_GYM_SLUG}';

INSERT INTO public.gym_invitations (id, gym_id, email, token_hash, invited_by_platform_admin_user_id, status, expires_at, accepted_by_user_id, accepted_at)
SELECT ${sqlLiteral(randomUUID())}::uuid, g.id, 'gym-owner@fitpass-demo.test', ${sqlLiteral(inviteTokenHash)}, ${sqlLiteral(ids.admin)}, 'accepted', now() + interval '1 day', ${sqlLiteral(ids.owner)}, now()
FROM public.gyms g WHERE g.slug = '${INITIAL_GYM_SLUG}';
INSERT INTO public.gym_invitation_roles (invitation_id, role)
SELECT i.id, 'gym_owner' FROM public.gym_invitations i WHERE i.token_hash = ${sqlLiteral(inviteTokenHash)};

INSERT INTO public.members (gym_id, user_id, full_name, role, membership_code)
SELECT g.id, ${sqlLiteral(ids.member)}, 'Demo Gym Member', 'member', ${sqlLiteral(membershipCode)}
FROM public.gyms g WHERE g.slug = '${INITIAL_GYM_SLUG}';

INSERT INTO public.gym_onboarding (gym_id, preferred_package_id, trial_activated_at, trial_expires_at)
SELECT g.id, p.id, now(), now() + interval '30 days'
FROM public.gyms g CROSS JOIN public.platform_packages p
WHERE g.slug = '${INITIAL_GYM_SLUG}' AND p.name = 'Starter';
INSERT INTO public.platform_subscriptions (gym_id, package_id, payment_mode, status, starts_at, current_period_end)
SELECT g.id, p.id, 'demo', 'trialing', now(), now() + interval '30 days'
FROM public.gyms g CROSS JOIN public.platform_packages p
WHERE g.slug = '${INITIAL_GYM_SLUG}' AND p.name = 'Starter';

INSERT INTO public.subscriptions (gym_id, member_id, plan_id, status, payment_mode, starts_at, expires_at)
SELECT g.id, m.id, p.id, 'pending', 'demo', now(), now() + make_interval(days => p.duration_days)
FROM public.gyms g JOIN public.members m ON m.gym_id = g.id
JOIN public.plans p ON p.gym_id = g.id AND p.id = '${PLAN_FIXTURES[0].id}'::uuid
WHERE g.slug = '${INITIAL_GYM_SLUG}' AND m.user_id = ${sqlLiteral(ids.member)};
INSERT INTO public.payment_reference_registry (reference, payment_type)
VALUES (${sqlLiteral(pendingReference)}, 'gym');
INSERT INTO public.payments (gym_id, member_id, plan_id, subscription_id, reference, payment_mode, amount_kobo, currency, status)
SELECT g.id, m.id, p.id, s.id, ${sqlLiteral(pendingReference)}, 'demo', p.price_kobo, 'NGN', 'pending'
FROM public.gyms g JOIN public.members m ON m.gym_id = g.id
JOIN public.plans p ON p.gym_id = g.id AND p.id = '${PLAN_FIXTURES[0].id}'::uuid
JOIN public.subscriptions s ON s.gym_id = g.id AND s.member_id = m.id AND s.plan_id = p.id AND s.status = 'pending'
WHERE g.slug = '${INITIAL_GYM_SLUG}' AND m.user_id = ${sqlLiteral(ids.member)};
INSERT INTO public.audit_events (gym_id, actor_user_id, actor_label, action, subject_type, subject_id, metadata)
SELECT g.id, ${sqlLiteral(ids.admin)}, 'local_demo_seed', 'demo.workspace_seeded', 'gym', g.id::text,
  jsonb_build_object('simulatedOwnerInvitationAcceptance', true, 'paymentMode', 'demo', 'credentialsPrintedOnce', true)
FROM public.gyms g WHERE g.slug = '${INITIAL_GYM_SLUG}';
COMMIT;`;
  return { sql, pendingReference };
}

async function main() {
  const databaseUrl = process.env.DATABASE_URL;
  const target = parseLocalDemoDatabaseUrl(databaseUrl);
  if (!existsSync(resolve(MIGRATIONS_DIR, "meta/_journal.json"))) fail("The staged Drizzle migration journal is missing.");

  process.stdout.write(`Local demo target accepted: ${target.host}:${target.port}/${target.database}. No connection string will be printed.\n`);
  const originalPlans = verifyLegacySource(databaseUrl!);
  runMigrations(databaseUrl!);
  verifyPlanPreservation(originalPlans, databaseUrl!);

  const packageRows = FIXED_FITPASS_PACKAGES.map((pkg) => `(${sqlLiteral(pkg.name)}, 'month', ${pkg.priceKobo}, ${pkg.activeMemberLimit}, ${pkg.adminAccountLimit}, '{}'::jsonb, true, ${pkg.sortOrder})`).join(",\n");
  psql(`BEGIN;
INSERT INTO public.platform_packages (name, billing_interval, price_kobo, active_member_limit, admin_account_limit, features, is_active, sort_order)
VALUES ${packageRows}
ON CONFLICT (name) DO NOTHING;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM (VALUES ${FIXED_FITPASS_PACKAGES.map((pkg) => `(${sqlLiteral(pkg.name)}, ${pkg.priceKobo}, ${pkg.activeMemberLimit}, ${pkg.adminAccountLimit}, ${pkg.sortOrder})`).join(",")}) AS expected(name, price_kobo, member_limit, admin_limit, sort_order)
    LEFT JOIN public.platform_packages actual USING (name)
    WHERE actual.id IS NULL OR actual.price_kobo <> expected.price_kobo OR actual.billing_interval <> 'month'
      OR actual.active_member_limit <> expected.member_limit OR actual.admin_account_limit <> expected.admin_limit
      OR actual.sort_order <> expected.sort_order OR actual.is_active IS NOT TRUE) THEN
    RAISE EXCEPTION 'A local FitPass package differs from the approved fixed catalog; no package was overwritten.';
  END IF;
END $$;
COMMIT;`, databaseUrl!);

  const existingDemoUsers = Number(psql(
    `SELECT count(*) FROM public."user" WHERE email IN (${DEMO_USERS.map((user) => sqlLiteral(user.email)).join(",")})`,
    databaseUrl!,
    true,
  ));
  if (existingDemoUsers === DEMO_USERS.length) {
    const fixtureCounts = psql(`SELECT
      (SELECT count(*) FROM public.platform_admins a JOIN public."user" u ON u.id = a.user_id WHERE u.email = 'platform-admin@fitpass-demo.test')::text || '|' ||
      (SELECT count(*) FROM public.gym_memberships gm JOIN public."user" u ON u.id = gm.user_id WHERE u.email IN ('gym-owner@fitpass-demo.test','desk-staff@fitpass-demo.test','gym-member@fitpass-demo.test') AND gm.status = 'active')::text || '|' ||
      (SELECT count(*) FROM public.gym_membership_roles r JOIN public.gym_memberships gm ON gm.id = r.membership_id JOIN public."user" u ON u.id = gm.user_id WHERE r.revoked_at IS NULL AND u.email IN ('gym-owner@fitpass-demo.test','desk-staff@fitpass-demo.test','gym-member@fitpass-demo.test'))::text || '|' ||
      (SELECT count(*) FROM public.members m JOIN public."user" u ON u.id = m.user_id WHERE u.email = 'gym-member@fitpass-demo.test')::text || '|' ||
      (SELECT count(*) FROM public.gym_invitations i WHERE i.email = 'gym-owner@fitpass-demo.test' AND i.status = 'accepted')::text || '|' ||
      (SELECT count(*) FROM public.gym_onboarding o JOIN public.gyms g ON g.id = o.gym_id WHERE g.slug = '${INITIAL_GYM_SLUG}' AND o.trial_activated_at IS NOT NULL AND o.trial_expires_at > now())::text || '|' ||
      (SELECT count(*) FROM public.platform_subscriptions s JOIN public.gyms g ON g.id = s.gym_id WHERE g.slug = '${INITIAL_GYM_SLUG}' AND s.status = 'trialing')::text || '|' ||
      (SELECT count(*) FROM public.payments p WHERE p.reference LIKE 'fitpass_demo_gym_%' AND p.status = 'pending' AND p.payment_mode = 'demo')::text`, databaseUrl!, true);
    if (fixtureCounts !== "1|3|3|1|1|1|1|1") fail("Demo accounts exist but their expected local roles, trial, membership, or pending demo payment fixture is incomplete. No records were changed.");
    process.stdout.write("The four local demo accounts already exist; they were not modified and no password was printed.\n");
    return;
  }
  if (existingDemoUsers !== 0) fail("A partial set of demo accounts already exists. No accounts were changed; inspect this disposable database or restore a fresh copy.");

  const demoPassword = randomBytes(24).toString("base64url");
  const passwordHash = await hashPassword(demoPassword);
  const userIds = Object.fromEntries(DEMO_USERS.map((user) => [user.key, randomUUID()])) as Record<DemoUserKey, string>;
  const membershipIds = { owner: randomUUID(), desk: randomUUID(), member: randomUUID() };
  const demoSeed = demoSeedSql(userIds, membershipIds, passwordHash);
  psql(demoSeed.sql, databaseUrl!);

  process.stdout.write("Local demo workspaces are ready. Demo password (displayed once; it is not stored in plaintext):\n");
  process.stdout.write(`${demoPassword}\n`);
  process.stdout.write("Use the four documented @fitpass-demo.test emails with this password. Do not reuse it outside this disposable database.\n");
  process.stdout.write(`After signing in as the demo member, open http://localhost:3000/payment/demo?reference=${demoSeed.pendingReference} to confirm the seeded pending DEMO payment.\n`);
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : "Local demo setup failed.";
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
});
