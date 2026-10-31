# FitPass Phase 1 execution report

Branch: `fix/phase-1`

Scope: code-only implementation and a local demo runner. No Neon connection,
database migration, seed, Vercel configuration change, or production-data write
was performed by this work.

## Task-by-task record

| Task | Implemented work and principal files | Tests / verification | Not completed or verification limit |
| --- | --- | --- | --- |
| 1. Public content | Landing page/pricing content now loads the launch gym through `FITPASS_INITIAL_GYM_SLUG`; removed sample gym details and negotiated-price language. (`app/page.tsx`, `app/PublicPricing.tsx`, `app/layout.tsx`, `lib/tenant.ts`, `lib/schema.ts`) | Existing unit suite, TypeScript, lint, build. | Database-backed content cannot be confirmed without a migrated database. |
| 2. Fixed SaaS pricing | Restricted package pricing to the four approved monthly tiers and removed custom-price controls/updates from platform and owner flows. (`lib/platform-package-policy.ts`, platform billing APIs, `app/admin/AdminDashboard.tsx`, owner dashboard, schema) | `tests/platform-package-policy.test.ts`; full test suite. | Live package rows were not inspected or changed. |
| 3. Read-only billing GET | GET billing status derives trial expiry at read time; persistent status changes remain in explicit write/cron paths. (`lib/trial-policy.ts`, platform subscription/billing APIs) | `tests/trial-policy.test.ts`; full suite. | Database behavior remains unverified. |
| 4. First Super Admin hardening | Disabled production public first-admin setup; kept the controlled operator provisioning process and `/platform/login`; public navigation does not expose it. (`app/api/platform/setup/route.ts`, `app/api/platform/setup/complete/route.ts`, `lib/platform-setup-policy.ts`, `AGENTS.md`) | `tests/platform-setup-policy.test.ts`. | No Super Admin account was created or tested against a database. |
| 5. Admin cap/suspension | Added a transactional, capped platform-admin management flow, suspension/reinstatement auditing, suspended-session rejection, and last-active-admin protection. (`app/api/platform/admins/route.ts`, `lib/authz.ts`, `lib/platform-admin-policy.ts`, schema, admin UI, provisioning script) | `tests/platform-admin-policy.test.ts`, `tests/authz.test.ts`, schema tests. | Route/database concurrency tests require the disposable local database and remain skipped. |
| 6. Password reset | Added generic reset request, reset page, Better Auth email flow via existing Resend helper, and login links. (`app/forgot-password/page.tsx`, `app/reset-password/page.tsx`, reset forms/API, `lib/auth.ts`, policy) | `tests/password-reset-policy.test.ts`; full suite. | Email delivery and actual credential reset were not tested; Resend configuration is not verified. |
| 7. Daily check-in limit | Added server-validated per-gym limit (1–20), audited owner/platform edits, Lagos calendar-day count and rejection inside the locked check-in transaction; surfaced usage to desk staff. (check-in/settings APIs, owner/admin/desk UI, schema, policy, `AGENTS.md`) | `tests/daily-checkin-policy.test.ts`, schema tests. | Database lock/concurrency, day-boundary, and live check-in workflows were not exercised against PostgreSQL. |
| 8. Expiry cron | Added bearer-secret-protected daily expiry endpoint and Vercel cron schedule. (`app/api/cron/expire-subscriptions/route.ts`, `lib/cron-security.ts`, `lib/env.ts`, `vercel.json`) | `tests/cron-security.test.ts`. | No scheduled deployment or database transition was exercised. |
| 9. Invitation email failure | Successful approval now returns a specific invitation-email failure state and a resend action instead of a generic gateway error. (application review route and `app/admin/AdminDashboard.tsx`) | TypeScript, lint, and build. | Email provider behavior was not exercised. |
| 10. Staged migration | Replaced the former monolithic foundation with baseline marker plus additive foundation, owner-confirmed launch-gym backfill, validated tenant constraints, launch-gym content, and rollback notes. (`drizzle/0000_live_schema_baseline.sql` through `0004_launch_gym_content.sql`, journal, `drizzle/MIGRATION_NOTES.md`) | SQL/source review only. | **UNVERIFIED / NOT REHEARSED.** No local independent restore is available yet. No production migration was run. The existing snapshot chain still needs comparison against the restored database before any rehearsal. |
| 11. Route integration tests | Added loopback-only HTTP integration coverage for tenant boundaries, escalation, member privacy, invitation replay/email matching, last-owner protection, limits, expired check-in, and webhook replay. (`tests/route-integration.test.ts`, `docs/route-integration-tests.md`) | Test command reports 9 integration tests skipped with the documented fixture requirement. | These routes have not been proven end-to-end tenant-safe by those tests until run with the disposable database and fixtures. |
| 12. Launch gym profile/discovery/editing | Added owner/platform editing for agreed gym fields, audit events, admin image upload route, address-query map with honest fallback, public profile content, and neutral image placeholders. (`app/api/gyms/[gymId]/settings/route.ts`, platform gym routes, owner/admin/public UI, `components/GymLocationMap.tsx`, `components/GymImagePlaceholder.tsx`, schema and migration) | Route boundary case added to integration suite; it was skipped without local fixtures. | Static paths and component code compile; browser rendering, Blob upload, and map behavior were not verified. No coordinates were invented. |
| 13. Demo artwork | Added original FitPass Elite SVG logo and three original gym illustrations plus a credits note. (`public/demo/*`) | Included in successful production build. | The assets are original illustrations, not photographs. No external photography or identifiable people were used. |
| 14. Local review demo | Added `demo:local`, loopback/database-name guard, source plan pre/post comparison, Drizzle staged migration invocation, fixed package provisioning without overwrite, hashed demo accounts, simulated local owner acceptance/trial, and pending DEMO member payment. (`scripts/demo-local.ts`, `lib/demo-local-guard.ts`, `tests/demo-local-guard.test.ts`, `docs/local-demo.md`, `package.json`) | Four guard tests pass; full TypeScript/lint/build pass. | **UNVERIFIED.** The runner was not executed. It requires `psql`, a separately restored pre-migration local backup, and local database authentication. It refuses an empty database rather than inventing source plan records. |

### Build correction

The final production build initially failed while prerendering `/` because the
page performs request-time database reads without a page-level Suspense
boundary. The existing homepage was preserved and its content moved behind a
small `Suspense` wrapper in `app/page.tsx`. The later full build passed.

## Verification performed

- `npm test` — **passed**: 66 tests total, 57 passed, 0 failed, 9 skipped.
  The 9 route integration tests explicitly skipped because the disposable
  database/API fixtures are not configured. Node emitted existing
  `MODULE_TYPELESS_PACKAGE_JSON` warnings.
- `npx tsc --noEmit` — **passed**.
- `npm run lint` — **passed**.
- `npm run build` — **passed** after the homepage Suspense correction; Next.js
  generated all 51 static/dynamic page entries.
- `git diff --check` — **passed** (Git emitted only a line-ending notice for
  `app/page.tsx`).
- No browser workflow test, local database restore, migration rehearsal, Neon
  connection, or production database operation was performed.

## Preserved work and repository safety

The existing launch plan IDs and business data are not rewritten by this
code-only phase. The staged migration retains the four plan records and checks
their confirmed IDs/names before assigning the approved initial gym. The
Task 14 runner snapshots all four records' IDs, names, durations, kobo prices,
descriptions, active flags, sort orders, and creation timestamps before and
after local migration.

`.env.local` and `.env.local.docx` are ignored by `.gitignore`; they were not
read, displayed, modified, or staged. Only source/docs/test paths explicitly
listed for a task should be committed. Pre-existing untracked `.agents/`,
`.codex/`, Drizzle snapshots/schema/relations, and `skills-lock.json` were left
untouched.

## Decisions and external steps still needed

1. Before database rehearsal, provide/authorize the independent backup and
   restore process in a separate review. Keep the existing Neon snapshot.
2. Confirm the independently restored local copy passes the source-schema and
   all-four-plan checks. The local demo script must not be run before that.
3. After review of rehearsed migration output and recovery evidence, request
   explicit approval for any production database-changing phase. This report
   does not authorize such a change.
4. Verify required deployment configuration through the Vercel environment
   settings flow; only set actual values through the provider UI/CLI, never in
   this report or a repository file.

## Phase 2 — exact safe sequence

1. Re-authorize the Vercel integration in Codex if deployment access is still
   unavailable; verify the repository/project binding and branch before any
   deploy. Do not change production environment values as part of this report.
2. Configure only values supplied through the secure Vercel settings flow.
   Environment names referenced by the current application are
   `DATABASE_URL`, `BETTER_AUTH_URL`, `BETTER_AUTH_SECRET`,
   `PAYSTACK_SECRET_KEY` (TEST key only), `RESEND_API_KEY`, `EMAIL_FROM`,
   `CRON_SECRET`, and `BLOB_READ_WRITE_TOKEN`. The app also reads optional
   `FITPASS_INITIAL_GYM_SLUG` and `FITPASS_PAYMENT_MODE` settings. The current
   map uses an address query and needs no Maps key. Do not copy `.env.local`
   or disclose any value in chat.
3. Create and verify an independent custom-format backup. Restore it to a new
   loopback-only PostgreSQL 18 database; verify the five tables, constraints,
   indexes, row counts, and four plans before migration.
4. Run `npm run demo:local` only against that restored local test/demo database.
   Review migration history, preserved plan fingerprints, constraints,
   package data, and demo workspace behavior. Capture failures without
   exposing database URLs.
5. Review the exact migration and rollback/recovery evidence. Obtain a separate
   explicit approval before any production migration; then independently
   verify the approved operation and first Super Admin flow.

## State

Phase 1 implementation work is recorded on `fix/phase-1`. The local migration
rehearsal and all database-dependent claims remain outstanding. This report
does not state that FitPass has been fully production-verified.
