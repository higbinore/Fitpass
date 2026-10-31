# FitPass Phase 2a — local rehearsal report

Date: 2026-10-31
Branch: `fix/phase-1`
Scope: isolated local backup restore, staged migration rehearsal, route tests,
and local application verification.

## Safety boundary

- **No Neon connection was made.** The supplied dump file was the only source
  used. No production SQL, migration, write, or inspection was run.
- No Vercel setting, real email, or real payment was used. The existing Neon
  snapshot was not touched.
- All database commands in this report used only PostgreSQL 18.6 at
  `127.0.0.1:55433`, with `postgres` authentication through the existing
  `pgpass.conf`. The previous local port `55432` was not used.
- `.env.local` and `.env.local.docx` were not opened or displayed. One early
  development-server attempt caused Next.js to announce that it had loaded
  `.env.local`; no contents or values were displayed, and that process was
  stopped. Subsequent demo, test, and build processes used process-only local
  settings and a preload guard that blocked environment-file reads. This is
  recorded as an environment-safety incident, not represented as if it never
  happened.

## Backup and restore evidence

The independent backup was supplied at `C:\FitPassBackups\fitpass-neon.dump`.
It remains outside the repository.

| Check | Result |
| --- | --- |
| SHA-256 | `AE2A9B8340E9C51F67607F27CCBA669E55475F7B53A9D92D61D43CD3E312C154` — matches the supplied hash |
| File size | 15,739 bytes |
| `pg_restore --list` | Passed; 51 archive entries |
| Local server | PostgreSQL 18.6 on loopback port 55433 |
| Restored copies | `rehearsal_test` and `demo_test` |

The restore command form was:

```powershell
$env:PGPASSFILE = Join-Path $env:APPDATA 'postgresql\pgpass.conf'
createdb.exe -h 127.0.0.1 -p 55433 -U postgres rehearsal_test
pg_restore.exe --exit-on-error --no-owner --no-privileges -h 127.0.0.1 -p 55433 -U postgres -d rehearsal_test 'C:\FitPassBackups\fitpass-neon.dump'
```

The same restore was performed into the separately named `demo_test` database.
No password appeared in a command, report, or repository file.

### Restored source state

Both restored copies initially contained the five legacy public business
tables: `plans`, `members`, `subscriptions`, `payments`, and `checkins`.
Pre-migration counts matched the earlier Neon inspection exactly:

| Table | Rows in each restored source copy |
| --- | ---: |
| `plans` | 4 |
| `members` | 0 |
| `subscriptions` | 0 |
| `payments` | 0 |
| `checkins` | 0 |

The source plans below were compared across migration on every field requested;
IDs, name, duration, integer-kobo price, description, active status, order,
and timestamp stayed unchanged. The initial-gym assignment was the only
business change to those rows.

| ID | Plan | Days | Price (kobo) | Active | Sort | `created_at` |
| --- | --- | ---: | ---: | --- | ---: | --- |
| `cedb6309-8a1c-4dc4-b95c-6ff28e2877a0` | Day Pass | 1 | 200000 | true | 1 | `2026-10-29 15:55:33.425497+01` |
| `9cc70b0f-3445-4232-995f-0fde36c36c3c` | Monthly | 30 | 1500000 | true | 2 | `2026-10-29 15:55:33.732095+01` |
| `d4710408-7014-4c07-be21-18ef3d5e8a64` | 3 Months | 90 | 4000000 | true | 3 | `2026-10-29 15:55:33.990846+01` |
| `4df6abf0-c63a-44f0-bbfe-28273282fc16` | Annual | 365 | 14000000 | true | 4 | `2026-10-29 15:55:34.360475+01` |

Descriptions also matched the restored source byte-for-byte; they are omitted
from this table for readability. The source schema contained no Drizzle
migration history table, consistent with the earlier inspection.

## Baseline snapshot reconciliation

The restored legacy table and column definitions, primary keys, foreign keys,
unique constraints, checks, and named indexes were compared with
`drizzle/meta/0000_snapshot.json`. Five incorrect index opclass snapshot values
were corrected in that pre-existing untracked snapshot; the migration SQL was
not changed:

| Index field | Snapshot value before | Restored PostgreSQL value |
| --- | --- | --- |
| `checkins_member_created_idx.member_id` | `timestamptz_ops` | `uuid_ops` |
| `subscriptions_member_status_idx.member_id` | `text_ops` | `uuid_ops` |
| `payments_member_created_idx.member_id` | `timestamptz_ops` | `uuid_ops` |
| `payments_member_created_idx.created_at` | `uuid_ops` | `timestamptz_ops` |
| `plans_active_sort_idx.is_active` | `int4_ops` | `bool_ops` |

No table-recreation statement was introduced. The no-op baseline migration
`0000_live_schema_baseline.sql` remains unchanged because its SQL hash is part
of the migration history. The source snapshot files were already untracked
before this pass; only `0000_snapshot.json` was corrected. The separate
pre-existing `0001_snapshot.json` was left untouched.

## Migration rehearsal

The staged SQL was applied manually, in order and in its own transaction, to
`rehearsal_test` only:

1. `drizzle/0000_live_schema_baseline.sql` — no-op marker; no legacy tables
   recreated.
2. `drizzle/0001_fitpass_multitenant_foundation.sql` — additive platform,
   authentication, membership, billing, invitation, and audit structures;
   nullable `gym_id` columns added while legacy constraints remained.
3. `drizzle/0002_backfill_initial_gym.sql` — created/reused the approved
   `FITPASS ELITE FITNESS CLUB` gym and assigned the four confirmed plan IDs;
   preserved every plan field and then enforced tenant ownership and the daily
   check-in limit.
4. `drizzle/0003_tenant_constraints.sql` — validated replacement scoped
   uniqueness and same-gym foreign keys before removing replaced global
   constraints.
5. `drizzle/0004_launch_gym_content.sql` — applied the reviewed launch-gym
   content fields.

The local `public.__drizzle_migrations` table contains five rows after the
rehearsal. The installed Drizzle Kit migration command failed in this Windows
Node 26 environment with `uv_os_get_passwd returned ENOMEM`; the stage files
were therefore executed with `psql` transaction mode and the standard Drizzle
hash/timestamp metadata. `scripts/demo-local.ts` was updated to use that same
guarded local `psql` approach, because Drizzle Kit could not safely complete
here. This fallback is host/client behavior, not a change to the migration
SQL.

### Post-migration checks in `rehearsal_test`

- All four source plan records retained their confirmed IDs and full field
  values and belong to `FITPASS ELITE FITNESS CLUB`.
- Zero `gym_id` NULLs across the five migrated business tables.
- Ten gym-scoped foreign keys exist across the five business tables.
- The legacy `checkins.checked_in_by -> members.id` foreign key remains.
- `max_daily_checkins` exists and is `1` for the launch gym.
- No duplicate `(gym_id, plan name)` pairs or `(gym_id, membership_code)` pairs.
- Replacement constraints were validated before the corresponding global
  constraints were dropped.
- Existing payment, subscription, and check-in source rows remained at zero;
  no historical rows were fabricated.

## Demo database and test fixtures

`npm run demo:local` was run against the separate, restored `demo_test` copy.
It applied the staged migrations itself, verified plan preservation, and
created only local demo packages/accounts/memberships plus a pending DEMO
member payment. A safe rerun recognized existing migration hashes and demo
rows without resetting credentials or overwriting package records.

The post-demo counts were `plans=4`, `members=5`, `subscriptions=3`,
`payments=2`, `checkins=0`. These extra rows are clearly local demo/test
fixtures; they are not evidence of production data or real transactions. The
demo gym has the seeded location “University of Benin, Ugbowo Campus, Ugbowo,
Benin City, Edo State, Nigeria”, and `max_daily_checkins=1`.

The nine route integration tests used temporary fixtures in `demo_test`: two
gyms; owner, desk, member, and platform-admin sessions; a second member for
cross-gym privacy checks; a pending invitation with matching and wrong-email
invitees; an expired membership; a pending local Paystack-test payment and
webhook transaction; and package-capacity fixture state. Fixture cookies,
tokens, references, and passwords were not printed or committed. The app
served these tests from `http://localhost:3001` and connected only to
`demo_test`.

## Results

### Automated checks

| Command/check | Result |
| --- | --- |
| `npm test` with all local route-test inputs configured | **Passed: 67 passed, 0 failed, 0 skipped.** This includes all nine HTTP route integration tests. |
| `npm run lint` | **Passed** (exit 0) after removing the temporary build output. |
| `npx tsc --noEmit` | **Passed** (exit 0). |
| `npm run build` | **Passed** (exit 0); all 51 app routes were generated. First attempt failed only because the sandbox could not fetch the existing Google Fonts; retry with network permission succeeded. |
| `git diff --check` | **Passed** (exit 0; Git displayed line-ending notices only). |

The production build emitted a `pgpass` deprecation warning from the current
`pg` dependency. It did not fail the build. A future driver upgrade should
review the replacement password callback API.

### HTTP and local workflow checks

- HTTP smoke responses returned 200 for `/`, `/gyms`, `/plans`, `/sign-in`,
  `/platform/login`, and the authenticated owner, desk, member, and platform
  workspace routes using local fixture sessions.
- Password reset ran through the local email sink: request returned 202, the
  local reset page returned 200, reset confirmation returned 200, and the
  changed local member credentials signed in with 200. The sink file was
  removed; no real email was sent.
- The route suite exercised cross-gym owner access, attempted role escalation,
  member-record privacy, invitation email matching/replay, last-owner
  protection, admin capacity, expired-membership check-in rejection, and
  Paystack webhook replay idempotency using test-only local fixtures. No
  Paystack network request or real payment occurred.

### Not verified

- Interactive browser review at desktop/mobile widths and screenshots were not
  completed. Codex Work browser control reported that local browser use is
  disabled; HTTP 200 responses are not visual verification. Therefore no fake
  screenshots were saved.
- The map component uses the URL form
  `https://maps.google.com/maps?q=...&output=embed`, not Google's documented
  Maps Embed API URL. The iframe source is present, but actual rendering was
  not visually verified. The Google Maps directions link is a normal search
  link. Recommended follow-up: use Google's official Maps Embed API with a
  restricted key, or choose a supported OpenStreetMap-based provider with
  proper attribution. No map setting or key was added.
- Image paths resolve to original local SVG illustrations (logo, gym floor,
  free weights, cardio), not authentic photography. Image rendering was not
  browser-verified.
- The daily check-in limit was verified in schema/data and its policy tests,
  but the full daily-limit user flow was not visually exercised in a browser.
- A destructive rollback/recovery drill was not performed. The plan to restore a
  fresh disposable copy from the immutable dump is documented, but end-to-end
  recovery from a deliberately failed migration remains **UNVERIFIED**.
- No real authentication email provider, real Paystack, Vercel deployment, or
  production database workflow was tested.

## Production migration proposal — not executed

Nothing in this section authorizes a production connection or write. A future
production phase requires separate approval after review of this report and a
fresh production backup/recovery plan. Use an operator shell or secret manager
to inject `DATABASE_URL`; do not put the credential in a command, report, or
repository file.

1. Confirm the destination Neon project/database identity through the approved
   secure channel and confirm the exact live table/plan state. Do not proceed
   if it differs from this restored backup or if plan ownership is uncertain.
2. Create and independently verify a new custom-format backup, retain the
   existing Neon snapshot, restore the backup to a disposable database, and
   pass the schema/plan checks above.
3. Run the reviewed migration chain in order using the project migration
   journal and files:

   ```text
   0000_live_schema_baseline
   0001_fitpass_multitenant_foundation
   0002_backfill_initial_gym
   0003_tenant_constraints
   0004_launch_gym_content
   ```

   On an approved migration runner with the approved database URL supplied
   only through its process environment, the proposed command is:

   ```powershell
   npx drizzle-kit migrate --config=drizzle.config.ts
   ```

   This command was **not** run against Neon. Do not use `db:push`, seeds,
   `demo:local`, or the local `psql` fallback against production. If Drizzle
   Kit fails on the selected operator runtime, stop and obtain a reviewed
   production runner procedure rather than improvising.

4. Before and after the migration, run approved read-only checks for the four
   plan IDs and all source fields. Example preflight (run only in a separately
   approved production window):

   ```sql
   SELECT id, name, duration_days, price_kobo, description, is_active,
          sort_order, created_at
   FROM public.plans
   WHERE id IN (
     'cedb6309-8a1c-4dc4-b95c-6ff28e2877a0',
     '9cc70b0f-3445-4232-995f-0fde36c36c3c',
     'd4710408-7014-4c07-be21-18ef3d5e8a64',
     '4df6abf0-c63a-44f0-bbfe-28273282fc16'
   )
   ORDER BY sort_order;
   ```

   Then verify each has `gym_id` for the approved launch gym, no tenant NULLs
   remain, all replacement constraints/indexes exist, and the
   `checked_in_by -> members.id` relation remains. Compare the complete output
   to the pre-migration backup, not just IDs and names.

5. Only after migration review/approval, provision the first platform admin
   from an existing Better Auth account with verified email using the
   controlled command below. Never enable public admin signup.

### First Super Admin provisioning command (not run)

After production migration approval and account verification, run from a
secure operator environment whose process database target has been explicitly
approved:

```powershell
npm run provision:platform-admin -- --email=<verified-account@example.com> --confirm
```

The account must already exist in Better Auth and have verified email. Expected
success output is exactly:

```text
Platform administrator provisioned for the verified account. Email omitted.
```

This command was not run during Phase 2a.

## Recovery and rollback

- Keep `C:\FitPassBackups\fitpass-neon.dump` protected outside Git and preserve
  its SHA-256; do not delete or replace the existing Neon snapshot.
- For a failed rehearsal, do not hand-replay a partial migration. Use a new
  disposable database restored from the immutable dump and repeat verification.
- The staged tenant migrations are forward-only once application writes use
  the new columns. Do not reverse them by nulling `gym_id`, restoring global
  uniqueness, or deleting audit/financial history.
- If a future production deployment fails before tenant-aware writes begin,
  stop application writes and prefer a compatible application rollback after
  reviewing schema compatibility. If data has been written under the new
  schema, use a reviewed forward correction where possible.
- Restoring a Neon snapshot or the independent dump may lose writes made after
  that recovery point. Any production restore requires explicit approval,
  incident scope review, and a verified recovery target; retain the existing
  snapshot and use the independent dump as a separate recovery source.

## Files changed in this rehearsal

- `package.json`, `package-lock.json` — added the local PostgreSQL driver and
  type definitions required to connect to the disposable local server.
- `lib/db.ts` — uses node-postgres for loopback URLs and preserves the Neon
  serverless driver for non-loopback connections.
- `scripts/demo-local.ts` — carries the local password-file environment to
  `psql` and applies the reviewed journal with transaction/hash guards because
  Drizzle Kit could not run on this Windows/Node setup.
- `tests/route-integration.test.ts` — accepts the route's intentional 404
  masking for an already-used invitation; the replay test now matches the
  actual API contract.
- `docs/local-demo.md`, `docs/route-integration-tests.md` — local port,
  password-file setup, and completed-vs-unverified state.
- `docs/phase-2a-report.md` — this evidence and remaining work.
- `drizzle/meta/0000_snapshot.json` — the five opclass corrections above.

Pre-existing untracked `.agents/`, `.codex/`, `drizzle/meta/0001_snapshot.json`,
`drizzle/relations.ts`, `drizzle/schema.ts`, and `skills-lock.json` were not
modified or included in the report changes. No application UI or migration SQL
was changed.
