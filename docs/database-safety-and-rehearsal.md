# FitPass database backup and migration rehearsal

This runbook is preparation only. The Neon snapshot already created is a separate recovery point and must not be deleted or replaced. No command below is permission to change Neon. Do not run migrations, `drizzle-kit push`, seeds, DDL, or DML against Neon without separate explicit approval.

## Current verified baseline

Previously reported Neon state (verify again from the independent dump before relying on it): `plans`, `members`, `subscriptions`, `payments`, and `checkins`; row counts were 4, 0, 0, 0, and 0 respectively. None had `gym_id`. `members.user_id` and `members.membership_code` were globally unique; `plans.name` was globally unique; one active subscription per member was enforced. Existing foreign keys connect payments/subscriptions/check-ins to their current business rows. Exact names and definitions must be collected from the restored copy.

The committed legacy seed source defines these expected plan values, but does not contain database IDs or `created_at`. It is not authoritative for current live rows:

| Name | Duration (days) | Price (kobo) | Description | Sort order |
|---|---:|---:|---|---:|
| Day Pass | 1 | 200000 | One full day at the gym, for visitors and drop-ins. | 1 |
| Monthly | 30 | 1500000 | 30 days of unlimited visits. | 2 |
| 3 Months | 90 | 4000000 | 90 days of unlimited visits, about ₦13,333 a month. | 3 |
| Annual | 365 | 14000000 | A full year of unlimited visits, about ₦11,667 a month. | 4 |

Never use the legacy seed command to recover or compare live plans. The four live IDs, values, and creation times must come from the backup/restore queries below.

## PostgreSQL requirements and version check

The application uses PostgreSQL features already represented by Drizzle: UUIDs, `jsonb`, partial unique indexes, composite foreign keys, and row-locking transactions. The schema uses Drizzle `defaultRandom()`, which emits `gen_random_uuid()`. PostgreSQL 13 and newer provide this function in core; older installations may require `pgcrypto`. The app schema does not explicitly require an extension. Inspect actual extensions and function availability before choosing a rehearsal server. See the [PostgreSQL UUID function documentation](https://www.postgresql.org/docs/current/functions-uuid.html) and [pgcrypto documentation](https://www.postgresql.org/docs/current/pgcrypto.html).

Use a `pg_dump` client whose major version is at least the source server version, and rehearse on the same PostgreSQL major version if available. PostgreSQL documents that `pg_dump` refuses a server newer than its client and that restoring to an older major is not guaranteed. [pg_dump compatibility](https://www.postgresql.org/docs/current/app-pgdump.html).

The user reported the final read-only Neon inspection results: PostgreSQL 18.6 (`server_version_num` 180006), only `plpgsql` installed, and `gen_random_uuid()` available. PostgreSQL 18.6 client/server tools are installed locally. The user verified that the local service listens only on `127.0.0.1:55432`. An authenticated local client connection has not yet been confirmed by this workspace. Do not repeat the Neon inspection or read environment files.

Use Neon’s **direct** hostname where possible. Do not put a connection URI or password in the command line, script, transcript, or report. Do not paste connection details into chat.

## Independent custom-format backup

Required Windows tools: `pg_dump`, `pg_restore`, and `psql` from PostgreSQL client tools. Use a destination outside the repository, on an encrypted local volume with access limited to the current Windows account. This example uses `%LOCALAPPDATA%`, refuses an existing timestamped target, and prompts for the connection fields locally so values are absent from command history and process arguments. The password is collected only by libpq's hidden prompt:

```powershell
$repo = (Resolve-Path .).Path
$backupDir = Join-Path $env:LOCALAPPDATA 'FitPass\Backups'
New-Item -ItemType Directory -Force -Path $backupDir | Out-Null
$backupDir = (Resolve-Path $backupDir).Path
if ($backupDir.StartsWith($repo, [System.StringComparison]::OrdinalIgnoreCase)) { throw 'Backup directory must be outside the Git repository.' }
$volume = Split-Path -Qualifier $backupDir
$bitlocker = Get-BitLockerVolume -MountPoint $volume -ErrorAction SilentlyContinue
if (-not $bitlocker -or $bitlocker.ProtectionStatus -ne 'On') { throw 'Choose an encrypted BitLocker volume before saving the backup.' }
$principal = [System.Security.Principal.WindowsIdentity]::GetCurrent().Name
icacls $backupDir /inheritance:r /grant:r "${principal}:(OI)(CI)F"
$backupFile = Join-Path $backupDir ('fitpass-neon-' + (Get-Date -Format 'yyyyMMdd-HHmmss') + '.dump')
if (Test-Path -LiteralPath $backupFile) { throw 'Refusing to overwrite an existing backup.' }
$env:PGHOST = Read-Host 'Neon host (hostname only)'
$env:PGDATABASE = Read-Host 'Neon database name'
$env:PGUSER = Read-Host 'Neon database role'
$env:PGPORT = '5432'
$env:PGSSLMODE = 'require'
try {
  & 'C:\Program Files\PostgreSQL\18\bin\pg_dump.exe' --format=custom --no-owner --no-acl --verbose --file $backupFile --password
  if ($LASTEXITCODE -ne 0) { throw 'pg_dump failed; do not use this file as a backup.' }
} finally {
  Remove-Item Env:PGHOST,Env:PGDATABASE,Env:PGUSER,Env:PGPORT,Env:PGSSLMODE -ErrorAction SilentlyContinue
}
```

Run this in a local PowerShell session only after reviewing and approving the exact command and destination. Do not dot-source or save it with connection values. Host, database, and role values are held temporarily in process environment variables and are removed when `pg_dump` exits. The password is entered only at the hidden client prompt and is not stored in an environment variable. Keep the existing Neon snapshot untouched.

Check that the file is present, readable, non-empty, and structurally listable; record its SHA-256 and size in the local recovery record (not in Git):

```powershell
Get-Item -LiteralPath $backupFile | Select-Object FullName, Length, LastWriteTimeUtc
Get-FileHash -Algorithm SHA256 -LiteralPath $backupFile
$archiveToc = pg_restore --list $backupFile
if ($LASTEXITCODE -ne 0) { throw 'pg_restore could not read the archive.' }
$businessDataEntries = $archiveToc | Select-String '\bTABLE DATA\s+public\s+(plans|members|subscriptions|payments|checkins)\b'
if (-not ($businessDataEntries | Where-Object { $_.Line -match '\bTABLE DATA\s+public\s+plans\b' })) { throw 'Archive has no plans data entry; do not treat it as complete.' }
$businessDataEntries
```

A valid archive listing is an initial integrity check, not proof that the dump is restorable. Only a successful restore followed by the checks below establishes that. Keep the dump and its hash outside the repository, on encrypted storage with restricted ACLs; do not email or attach the dump. Keep a second encrypted copy under the organisation’s approved backup policy. Do not keep only a temporary-directory copy.

## Disposable restore and verification

The local PostgreSQL 18.6 tools and server are installed. The user verified the service listener is only `127.0.0.1:55432`; a local `pg_isready` check also reports that this endpoint accepts connections. Create a local-only rehearsal database only after authenticated local client access is verified; never reuse Neon credentials. Do not connect to Neon until the user has reviewed the backup command and credential-handling method above.

Start a local cluster with an isolated data directory (choose a path outside the repository), a locally prompted password, and host authentication restricted to `scram-sha-256`. For example, in a local PostgreSQL binary shell:

```powershell
initdb --pgdata $PgData --username fitpass_rehearsal --auth-local=scram-sha-256 --auth-host=scram-sha-256 --pwprompt
pg_ctl --pgdata $PgData --log (Join-Path $PgData 'server.log') --options '-h 127.0.0.1 -p 55432' start
createdb --host 127.0.0.1 --port 55432 --username fitpass_rehearsal --maintenance-db postgres --password fitpass_restore
pg_restore --verbose --exit-on-error --single-transaction --no-owner --no-acl --host 127.0.0.1 --port 55432 --username fitpass_rehearsal --dbname fitpass_restore --password $backupFile
```

Only a loopback target is permitted. Confirm the target host/port and database name immediately before restore. If the dump lists an extension unavailable locally, stop and install the same compatible extension before repeating the restore; do not silently omit it. Do not use `--clean`, `--create`, or restore into a shared/local development database.

Run the following against the restored copy. Save outputs outside Git and compare with the corresponding read-only Neon query output:

```powershell
$env:PGSSLMODE = 'disable'
psql --no-psqlrc --host 127.0.0.1 --port 55432 --username fitpass_rehearsal --dbname fitpass_restore --password --command "SELECT 'plans' AS table_name, count(*) FROM public.plans UNION ALL SELECT 'members', count(*) FROM public.members UNION ALL SELECT 'subscriptions', count(*) FROM public.subscriptions UNION ALL SELECT 'payments', count(*) FROM public.payments UNION ALL SELECT 'checkins', count(*) FROM public.checkins ORDER BY table_name;"
psql --no-psqlrc --host 127.0.0.1 --port 55432 --username fitpass_rehearsal --dbname fitpass_restore --password --command "SELECT id, name, duration_days, price_kobo, description, is_active, sort_order, created_at FROM public.plans ORDER BY sort_order, id;"
psql --no-psqlrc --host 127.0.0.1 --port 55432 --username fitpass_rehearsal --dbname fitpass_restore --password --command "SELECT c.relname AS table_name, con.conname, con.contype, pg_get_constraintdef(con.oid) AS definition FROM pg_constraint con JOIN pg_class c ON c.oid = con.conrelid JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'public' ORDER BY c.relname, con.conname;"
psql --no-psqlrc --host 127.0.0.1 --port 55432 --username fitpass_rehearsal --dbname fitpass_restore --password --command "SELECT tablename, indexname, indexdef FROM pg_indexes WHERE schemaname = 'public' ORDER BY tablename, indexname;"
psql --no-psqlrc --host 127.0.0.1 --port 55432 --username fitpass_rehearsal --dbname fitpass_restore --password --command "SELECT table_name, column_name, data_type, is_nullable, column_default FROM information_schema.columns WHERE table_schema = 'public' ORDER BY table_name, ordinal_position;"
```

Acceptance criteria: all five row counts match the source baseline; the four restored plan IDs and all seven requested fields (`name`, `duration_days`, `price_kobo`, `description`, `is_active`, `sort_order`, `created_at`) match the source; every reported primary key, unique/check constraint, index, and foreign key matches the source; extension list and `gen_random_uuid()` availability are understood. Resolve every mismatch before migration rehearsal.

## Live-schema comparison and tenant backfill gate

Compare the restored baseline (not a guessed schema) with the current `lib/schema.ts` and the fresh-only `drizzle-bootstrap/` sequence. Capture source and target table/column lists, types, nullability/defaults, primary/unique/check constraints, indexes, and foreign keys. The current intended schema adds Better Auth tables, gyms, platform admins/packages, gym memberships and role grants, applications/invitations, platform subscriptions/payments, audit events, webhook events, and a central payment-reference registry. Existing tables gain `gym_id`; check-ins gain `checked_in_by_membership_id` while the legacy actor column remains available for controlled backfill.

Expected changes requiring careful sequencing:

1. Add the initial `gyms` row only after the initial gym identity (name and slug) is confirmed. Do not choose a gym or claim records for one without confirmation.
2. Add `gym_id` to existing business tables nullable, retain old constraints/indexes, then backfill every row to the approved gym. Verify no nulls and record counts before enforcing `NOT NULL`.
3. Preserve all four live plan primary keys and every live field. Replace global `plans.name` uniqueness only after the gym-scoped unique index exists and duplicate checks pass. Do not reseed plans.
4. Backfill normalized memberships and role grants from legacy member rows only when records exist and their `user_id` is confirmed to match a Better Auth user. Preserve legacy role meanings with an explicit reviewed mapping. Do not fabricate user accounts.
5. Add tenant-aware composite unique keys and foreign keys for `(gym_id, id)` references. Validate all parent/child rows before adding constraints; preserve existing single-column foreign keys until the composite equivalents validate.
6. Keep global payment references and Paystack transaction uniqueness. Add the reference registry without changing existing references. Preserve kobo amounts and original payment/subscription statuses.
7. For check-ins, retain the legacy `checked_in_by` FK. If rows exist, map the referenced member profile to exactly one membership in the same gym and populate the new actor membership FK. If an actor cannot be mapped unambiguously, stop; do not null or rewrite the attribution. Current reported check-in count was zero, but the restore must verify it.
8. Validate role history, active owner presence, one active/pending subscription rules, invitation email/expiry/status constraints, and archived-gym restrictions before enabling application writes.

The currently reported live state has four plans and zero rows in members/subscriptions/payments/check-ins; therefore no member/payment/check-in backfill was expected, but only a restored dump can reconfirm this. The source seed values above are not proof of live plan values.

The minimum unresolved ownership facts are: the authoritative initial gym name and slug, and confirmation that each live plan belongs to that gym. If the fresh restore shows any members, subscriptions, payments, or check-ins, provide the correct gym assignment for those rows (or confirm they all belong to the same named initial gym). Stop rather than infer ownership.

## Migration baseline, rehearsal, and recovery

`drizzle-bootstrap/` is for an empty database only; it is not a live baseline. The live database reportedly has no Drizzle history table. After restore verification and schema comparison, create a separate live-history baseline whose SQL is a no-op and whose Drizzle snapshot represents the exact five-table live schema. Do not use the current full bootstrap as that baseline. Rehearse the baseline and then the additive tenant migration against a fresh restore copy; the source-of-truth plan rows must remain unchanged.

The migration rehearsal must assert before/after row counts and plan rows, same-gym composite FKs, globally unique payment references/transaction IDs, member/profile identity mappings, preserved payment/subscription history, check-in actor mapping, role/invitation checks, active owner protections, and archived-gym write restrictions. Run the application’s tenant-isolation and role tests against this disposable DB as well as the unit suite.

Inspect `public.__drizzle_migrations` on the disposable target before each run. Confirm the baseline hash is recorded once; confirm the target migration hash is absent before first application and present with the expected hash afterward. A retry should use Drizzle’s journal tracking and a preflight that compares the expected schema/version marker; never manually replay a partially applied SQL file. Rehearse both a clean restore-and-reapply recovery and a failure before commit. Keep the verified source backup immutable.

Recovery plan: restore the independent custom archive to a *new* empty disposable database and rerun verification. For any future live failure, stop application writes and use the approved Neon recovery/snapshot procedure or restore the independent backup into a separate recovery database for extraction. Do not overwrite the only Neon snapshot, and do not attempt an unreviewed reverse migration that could discard financial or audit history. Production recovery and any cutover remain separately gated by explicit approval.

## Outstanding policies

### Package feature gates

`requireGymFeature()` exists but no current route calls it, and default platform packages start with an empty feature map. `GET /api/gyms/[gymId]/owner-summary` is the clear candidate if analytics/income reporting is a package feature. The remaining tenant routes implement baseline membership sales, member records, plan management, invitations with account caps, and check-ins; no feature-key catalogue has been established for them. Before gating summary, define the stable feature key and which packages grant it; otherwise all default packages fail closed and the launch owner summary disappears.

### Retention/anonymisation for legal review

These are options for counsel/DPO review, not implemented periods or legal advice:

- Keep payment/receipt/accounting evidence intact for the period required by the gym’s and FitPass’s applicable entity, tax, and dispute obligations. CAMA section 332 sets a six-year preservation period for accounting records of companies; counsel must determine whether and how it applies to each operator and which records qualify. [Companies and Allied Matters Act, s. 332](https://www.lawsofnigeria.placng.org/laws/C20.pdf).
- Keep immutable transaction, subscription, check-in, and security-event facts while they are needed for contract, dispute, fraud, and audit purposes. Minimise personal fields in audit metadata; restrict access and maintain legal holds. Do not delete rows referenced by financial/audit records.
- After the approved operational/dispute window, consider irreversible anonymisation of direct identifiers while keeping transaction IDs, amounts, timestamps, gym/member surrogate IDs, and linkage constraints where lawful. This may still be pseudonymous personal data if re-linking remains possible. Keep the re-identification map separately with narrow access, or destroy it only after legal approval.
- For account deletion, revoke sessions and access promptly, then either retain a restricted pseudonymous identity for records that must remain attributable or anonymise only after retention/legal-hold checks. The Nigeria Data Protection Act requires purpose/necessity-based storage limitation and provides data-subject rights subject to lawful exceptions; it does not create one universal retention duration for these app records. [NDPC NDP Act resources](https://ndpc.gov.ng/resources/), [NDPC privacy policy](https://ndpc.gov.ng/our-data-privacy-policy/).
- Expired/revoked invitations and unused token hashes can be purged after a short, approved security/audit window; retain minimal event metadata rather than invitation email/token data where appropriate.

Before implementation, confirm the legal entity for each data controller, record categories, retention trigger and duration, legal-hold process, anonymisation standard, and who can approve deletion. Until settled, preserve rows and avoid irreversible anonymisation.
