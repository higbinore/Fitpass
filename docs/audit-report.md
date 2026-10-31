# FitPass Security and Implementation Audit

Audit date: 2026-10-31  
Repository: `higbinore/Fitpass`, branch `master`  
Production URL under review: <https://fitpass-delta.vercel.app>

## Executive summary

- Public pages render, but the public gym, package, and first-admin setup APIs currently return HTTP 503; the live site is not fully operational.
- Local tests, TypeScript, lint, and production build pass; these do not establish live database integration or route-level tenant security.
- The installed source contains broad role workflows, tenant predicates, Paystack webhook checks, application review, invitations, trial rules, and package limits.
- The current first-platform-admin setup remains an open first-claim bootstrap; email verification is required, but the first verified public claimant can win and a pending claim can block setup for one hour.
- The checked-in Drizzle migration is unsafe for the reported live data: it drops existing constraints/indexes and adds non-null `gym_id` to populated tables without backfilling.
- No production database or Neon connection was used for this audit; database state below is prior user-supplied discovery, not reverified here.
- Vercel CLI authorization expired during this audit, so current project settings, environment variable names, and runtime logs could not be re-read.
- The source still advertises negotiated FitPass package pricing, contrary to the fixed-price decision in the audit brief.
- Existing application modifications and untracked files were preserved; this report is the only new file intended for the audit commit.

## Git state

At audit time:

- Current branch: `master`.
- `HEAD`: `96459de7e72d7b29937e894a99f075de398e28c6` (`Save FitPass project baseline`).
- `origin/master` tracking ref and baseline commit `96459de`: same SHA as `HEAD`.
- Recent history: `96459de Save FitPass project baseline`; `8306687 Checkpoint Fitpass before Codex`; `4a44e07 feat: add Drizzle schema, database client and plan seed`; `88a76d6 chore: scaffold FitPass with Next.js, Tailwind and shadcn design tokens`.
- Local tracked difference: `M lib/schema.ts` (2 insertions, 2 deletions). It restores the legacy `checkins.checked_in_by -> members.id` FK in the Drizzle definition so existing actor attribution is retained.
- Untracked files preserved as found:
  - `.agents/skills/neon-postgres-branches/SKILL.md`
  - `.agents/skills/neon-postgres/SKILL.md`
  - `.agents/skills/neon-postgres/references/full-text-search.md`
  - `.agents/skills/neon-postgres/references/hybrid-search.md`
  - `.agents/skills/neon-postgres/references/lakebase-search-drizzle.md`
  - `.agents/skills/neon-postgres/references/vector-search.md`
  - `.agents/skills/neon/SKILL.md`
  - `.agents/skills/neon/references/auth.md`
  - `.agents/skills/neon/references/claimable-neon.md`
  - `.agents/skills/neon/references/function-triggers.md`
  - `.agents/skills/neon/references/logs-loki.md`
  - `.agents/skills/neon/references/parse-env.md`
  - `.agents/skills/neon/references/sdk.md`
  - `.codex/config.toml` (name only; contents were not inspected)
  - `drizzle/0000_live_schema_baseline.sql`
  - `drizzle/0001_fitpass_multitenant_foundation.sql`
  - `drizzle/meta/0000_snapshot.json`
  - `drizzle/meta/0001_snapshot.json`
  - `drizzle/meta/_journal.json`
  - `drizzle/relations.ts`
  - `drizzle/schema.ts`
  - `skills-lock.json`
- `.env.local`, `.env.local.docx`, `.env`, and `.env.production` are not tracked by Git (checked by tracked filenames only; no contents were read).
- No changes were made to the app, database, Vercel, or existing worktree files during the audit. This report is a separate, explicitly requested documentation deliverable.

## Feature matrix and route inventory

Status meanings: **WORKING (proven)** requires an observed end-to-end result; **BUILT BUT FAILING** means an observed error; **BUILT BUT UNVERIFIED** means source is present but the necessary live dependency or authenticated journey was unavailable; **PARTIAL** means material pieces or policies are missing/misaligned; **NOT BUILT** means no implementation was found.

### Application pages

| Route / source | Purpose and access | Data / status |
|---|---|---|
| `/` — `app/page.tsx` | Public landing and initial-gym plans | Reads initial gym/plans; **BUILT BUT FAILING** for live plans when DB is unavailable; static page renders. Contains stale sample gym content. |
| `/about` — `app/about/page.tsx` | Public product information | No protected data; **BUILT BUT UNVERIFIED** in this audit beyond public HTTP response. |
| `/features` — `app/features/page.tsx` | Public feature information | No protected data; **BUILT BUT UNVERIFIED** beyond public HTTP response. |
| `/contact` — `app/contact/page.tsx` | Public contact page | No protected data; **BUILT BUT UNVERIFIED** beyond public HTTP response. |
| `/apply` — `app/apply/page.tsx` | Public gym application form | Submits to `/api/gym-applications`; **BUILT BUT UNVERIFIED** for success because DB/Blob configuration is unavailable. |
| `/gyms` — `app/gyms/page.tsx`, `GymDirectory.tsx` | Public searchable gym directory and map fallback | `/api/gyms`; **BUILT BUT FAILING** because API returns 503. Maps use verified coordinates only and honestly fall back when unavailable. |
| `/gyms/[gymId]` — `app/gyms/[gymId]/page.tsx` | Public gym profile, plans, images, map | Gyms/plans; **BUILT BUT UNVERIFIED**; no fabricated map coordinates. |
| `/gyms/[gymId]/join` — `app/gyms/[gymId]/join/page.tsx`, `JoinGym.tsx` | Join/purchase journey | Auth/session plus plan and checkout APIs; **BUILT BUT UNVERIFIED**; live DB and payment were not exercised. |
| `/sign-in` — `app/sign-in/page.tsx`, `AuthForm.tsx` | General sign-in entry | Better Auth; **BUILT BUT UNVERIFIED** for live account session. |
| `/sign-up` — `app/sign-up/page.tsx`, `AuthForm.tsx` | Public member-oriented signup | Better Auth does not expose roles; **BUILT BUT UNVERIFIED** for live signup/email delivery. |
| `/platform/setup` — `app/platform/setup/page.tsx` | First platform admin bootstrap | `/api/platform/setup`; **BUILT BUT FAILING** on production (503) and **PARTIAL** security: first verified public claimant can acquire the bootstrap. |
| `/platform/login` — `app/platform/login/page.tsx` | Platform admin login | Better Auth plus workspace routing; **BUILT BUT UNVERIFIED** with no live DB/session. |
| `/owner/login` — `app/owner/login/page.tsx` | Gym owner login | Better Auth; **BUILT BUT UNVERIFIED**. |
| `/desk/login` — `app/desk/login/page.tsx` | Desk staff login | Better Auth; **BUILT BUT UNVERIFIED**. |
| `/member/login` — `app/member/login/page.tsx` | Gym member login | Better Auth; **BUILT BUT UNVERIFIED**. |
| `/dashboard` — `app/dashboard/page.tsx` | Authenticated role/workspace resolver | Session, memberships, role grants; **BUILT BUT UNVERIFIED** end-to-end. |
| `/admin` — `app/admin/page.tsx`, `AdminDashboard.tsx` | Platform-wide admin workspace; page guard requires platform admin | gyms, applications, packages, subscriptions, payments, settings, audits; **BUILT BUT UNVERIFIED** with production DB unavailable. |
| `/gyms/[gymId]/owner` — owner page/components | Gym owner operations | Server page requires owner role; owner APIs provide scoped records; **BUILT BUT UNVERIFIED** against migrated DB. |
| `/gyms/[gymId]/desk` — desk page, `DeskCheckin.tsx` | Desk search, eligibility and check-in | Requires active desk role; check-in API has gym-scoped transaction; **BUILT BUT UNVERIFIED** against migrated DB. |
| `/gyms/[gymId]/member` — member page, `MemberRecords.tsx` | Own membership, payments, check-ins, profile | Requires gym member identity; **BUILT BUT UNVERIFIED** against migrated DB. |
| `/invitations/accept` — `app/invitations/accept/page.tsx` | Authenticated, verified invitation acceptance UI | `/api/invitations/accept`; **BUILT BUT UNVERIFIED** live. |
| `/payment/demo` — `app/payment/demo/page.tsx` | Clearly labelled demo payment screen | Demo confirm API; **BUILT BUT UNVERIFIED** live. Must not be confused with a real Paystack settlement. |
| `/payment/complete` — `app/payment/complete/page.tsx` | Payment return/status UI | Payment status API; **BUILT BUT UNVERIFIED**; redirect does not itself activate payment. |
| `/plans` — `app/plans/page.tsx` | Public plans route | **BUILT BUT UNVERIFIED**; the audit probe showed HTTP 200 but live plan APIs are unavailable. |
| `/pricing` — `app/pricing/page.tsx`, `PublicPricing.tsx` | Public FitPass SaaS package comparison | `/api/platform/public-packages`; **BUILT BUT FAILING** live API 503; code also advertises custom pricing contrary to fixed-pricing rule. |

### API routes

The table names below are derived from source imports and queries, not evidence that the deployed database currently contains the expected schema. Every dynamic `gymId` remains a selector; security depends on the server guard plus the query predicate.

| API route | Purpose / guard | Main tables | Status |
|---|---|---|---|
| `/api/auth/[...all]` | Better Auth handlers | user, session, account, verification | BUILT BUT UNVERIFIED live configuration |
| `/api/auth/destination` | Resolve logged-in workspace; session | user, gym memberships, role grants, platform admins | BUILT BUT UNVERIFIED |
| `/api/gym-applications` | Public pending application submission | gym applications, platform settings/packages | BUILT BUT FAILING without live DB/Blob; application remains pending until admin review |
| `/api/gyms` | Public approved gym directory | gyms, plans, platform subscriptions | BUILT BUT FAILING: live GET 503 |
| `/api/gyms/[gymId]/public-plans` | Public plans scoped to active/published gym | gyms, plans | BUILT BUT UNVERIFIED |
| `/api/gyms/[gymId]/join` | Verified-user member enrollment; capacity checks | gyms, memberships, roles, members, packages/subscriptions | BUILT BUT UNVERIFIED |
| `/api/gyms/[gymId]/checkout` | Gym-member checkout initialization; member authorization | gyms, plans, members, subscriptions, payments, reference registry, platform subscriptions | BUILT BUT UNVERIFIED; no live payment initiated |
| `/api/gyms/[gymId]/checkins` GET,POST | Desk lookup/activity and valid check-in; active desk guard | gyms, members, subscriptions, checkins | BUILT BUT UNVERIFIED. POST transaction validates active, unexpired subscription and active gym/desk role before insert. No duplicate check-in prevention was found. |
| `/api/gyms/[gymId]/images` | Owner image replacement; active owner guard | gyms, audit events; Vercel Blob | BUILT BUT UNVERIFIED; storage requires server token |
| `/api/gyms/[gymId]/invitations` GET,POST | Owner staff/owner invitations; active owner guard | auth users, gyms, memberships/roles, packages, invitations, platform subscriptions, audit events | BUILT BUT UNVERIFIED |
| `/api/gyms/[gymId]/invitations/[invitationId]` DELETE | Revoke pending invite; owner guard plus transactional gym and active-owner recheck | gyms, invitations, memberships/roles, audit events | BUILT BUT UNVERIFIED |
| `/api/invitations/accept` | Verified account accepts hashed, expiring invitation | auth users, gyms, invitations, memberships/roles, onboarding/trial, packages, audits | BUILT BUT UNVERIFIED; source checks email, expiry, replay, archived status, and existing suspended/revoked state |
| `/api/gyms/[gymId]/members` GET | Owner member list; active owner guard | gyms, members, subscriptions | BUILT BUT UNVERIFIED |
| `/api/gyms/[gymId]/members/[memberId]` PATCH | Owner member updates; active owner guard | gyms, members, audit events | BUILT BUT UNVERIFIED |
| `/api/gyms/[gymId]/me` GET | Own member record/history; ownership helper | gyms, plans, members, subscriptions, payments, checkins | BUILT BUT UNVERIFIED |
| `/api/gyms/[gymId]/me/profile` PATCH | Own profile edit; verified member ownership | members, audit events | BUILT BUT UNVERIFIED |
| `/api/gyms/[gymId]/memberships` GET | Owner membership/role listing; active owner guard | auth users, memberships, roles | BUILT BUT UNVERIFIED |
| `/api/gyms/[gymId]/memberships/[membershipId]` PATCH | Suspend/restore membership; active owner guard | gyms, memberships, roles, audit events | BUILT BUT UNVERIFIED |
| `/api/gyms/[gymId]/memberships/[membershipId]/roles/[role]` DELETE | Revoke role; active owner/last-owner protection | gyms, memberships, roles, audit events | BUILT BUT UNVERIFIED |
| `/api/gyms/[gymId]/memberships/[membershipId]/transfer-ownership` POST | Controlled owner transfer | gyms, memberships, roles, audit events | BUILT BUT UNVERIFIED |
| `/api/gyms/[gymId]/plans` GET,POST | Owner plan list/create; active owner guard | gyms, plans | BUILT BUT UNVERIFIED |
| `/api/gyms/[gymId]/plans/[planId]` PATCH | Owner plan edit/deactivate; active owner guard | gyms, plans | BUILT BUT UNVERIFIED |
| `/api/gyms/[gymId]/owner-summary` GET | Owner aggregate view; active owner guard | gyms, memberships/roles, plans, members, subscriptions, payments, checkins | BUILT BUT UNVERIFIED |
| `/api/gyms/[gymId]/reports` GET | Owner reports; active owner guard | plans, members, payments, checkins | BUILT BUT UNVERIFIED |
| `/api/gyms/[gymId]/settings` PATCH | Owner gym settings; active owner guard | gyms, audit events | BUILT BUT UNVERIFIED |
| `/api/gyms/[gymId]/platform-billing/checkout` GET,POST | Owner billing view / FitPass subscription checkout | gyms, memberships, package, platform subscriptions/payments, registry, onboarding | BUILT BUT UNVERIFIED. GET currently writes expired trial status (see findings). |
| `/api/payments/demo/confirm` POST | Explicit DEMO-only simulated confirmation | gym payments/subscriptions OR separate platform payments/subscriptions | BUILT BUT UNVERIFIED; server checks pending DB state, but this is simulation and must not be described as Paystack confirmation |
| `/api/payments/status` GET | Authorized owner/member payment status | gym payments and platform payments | BUILT BUT UNVERIFIED |
| `/api/paystack/webhook` POST | Raw-body Paystack signature, reference/amount/currency/status/idempotency processing | package/plans/subscriptions/payments/platform billing, reference registry, webhook events, audits | BUILT BUT UNVERIFIED; no webhook was sent |
| `/api/platform/setup` GET,POST | Public bootstrap availability and controlled setup claim; no role accepted from client | auth users/verifications, platform admins, audit events | BUILT BUT FAILING live GET (503); security is PARTIAL because bootstrap is not restricted to a pre-authorized identity |
| `/api/platform/setup/complete` GET | One-time verified-email bootstrap claim under advisory lock | auth users/verifications, platform admins, audit events | BUILT BUT UNVERIFIED; publicly reachable callback is claim-bound, but claim issuance is open |
| `/api/platform/admins` GET,POST,DELETE | Existing platform admin manages accounts; protects last admin on delete | auth users, platform admins, audits | BUILT BUT UNVERIFIED. No 10-admin cap or suspension state found. |
| `/api/platform/overview` GET | Platform metrics | gyms, applications, members, platform subscriptions/payments | BUILT BUT UNVERIFIED |
| `/api/platform/gyms` GET,POST | Platform gym directory/create and owner invitation | gyms, onboarding, packages, memberships/roles, invitations, audits | BUILT BUT UNVERIFIED |
| `/api/platform/gyms/[gymId]` GET,PATCH | Platform gym details/edit | gyms, auth users, memberships/roles, packages, members, platform subscriptions, audits | BUILT BUT UNVERIFIED |
| `/api/platform/gyms/[gymId]/archive` PATCH | Platform archive, no physical deletion | gyms, audits | BUILT BUT UNVERIFIED |
| `/api/platform/gyms/[gymId]/first-owner-invitation` POST | Reissue/provision initial owner invite | gyms, onboarding, memberships, packages, invitations, roles, audits | BUILT BUT UNVERIFIED |
| `/api/platform/applications` GET | Review queue | gym applications | BUILT BUT UNVERIFIED |
| `/api/platform/applications/[applicationId]` PATCH | Admin reject/approve, creates gym and first-owner invitation on approval | applications, gyms, onboarding, invitations, roles, packages, audits | BUILT BUT UNVERIFIED; DB transaction commits before email send, so email failure can return 502 after approval; replacement invite route exists |
| `/api/platform/packages` GET,POST | Admin package configuration | platform packages, audits | BUILT BUT UNVERIFIED |
| `/api/platform/packages/[packageId]` PATCH | Admin package update | platform packages, audits | BUILT BUT UNVERIFIED |
| `/api/platform/public-packages` GET | Public SaaS catalog | platform packages | BUILT BUT FAILING: live GET 503 |
| `/api/platform/subscriptions` GET | Paginated platform subscription list/status filtering | gyms, packages, platform subscriptions | BUILT BUT UNVERIFIED; response computes expired trial state without writing in this route |
| `/api/platform/subscriptions/[subscriptionId]` PATCH | Admin subscription policy/status edits | platform subscriptions/payments, audits | BUILT BUT UNVERIFIED; supports custom price that contradicts fixed packages |
| `/api/platform/payments` GET | Platform payment history, distinct from gym payments | gyms, gym payments, platform payments | BUILT BUT UNVERIFIED |
| `/api/platform/exports` GET | Authorized platform exports | gyms, packages, applications, subscriptions, payments | BUILT BUT UNVERIFIED |
| `/api/platform/activity` GET | Platform audit/activity feed | gyms, audit events | BUILT BUT UNVERIFIED |
| `/api/platform/settings` GET,PATCH | Persistent platform settings with admin guard/audit | platform settings, audits | BUILT BUT UNVERIFIED |

### Feature-by-feature assessment

| Requirement | Status | Evidence / finding |
|---|---|---|
| Better Auth / session | BUILT BUT UNVERIFIED live | `lib/auth.ts` uses the Drizzle adapter with `user`, `session`, `account`, `verification` schema mappings; email/password is enabled and verified email is required. API catch-all is `app/api/auth/[...all]/route.ts`. No role assignment hook is exposed at signup. |
| Platform admin provisioning | PARTIAL | `/api/platform/setup` is one-time, transaction-locked, email-verified, claim-token-bound and audited, but no pre-approved email/invitation/operator allowlist; first successful public claim wins. `app/api/platform/admins/route.ts` allows authorized existing admins to add existing verified users. Last admin protection exists; no suspension/10-admin cap found. |
| Gym application and first owner | BUILT BUT UNVERIFIED | Public application creates pending application only; admin approval provisions gym/onboarding/invite. Email is sent after transaction; failure can leave an approved gym and usable replacement-invite workflow. |
| Owner operations | BUILT BUT UNVERIFIED | Owner routes exist for members, plans, staff/roles, settings, reports, check-ins and FitPass billing. No authenticated live workflow was run. |
| Desk operations | BUILT BUT UNVERIFIED | Check-in `GET` scopes by gym and requires active desk role; `POST` locks gym/member/subscription, verifies active non-expired subscription and rechecks active desk role before inserting. No duplicate-visit suppression found. |
| Member operations | BUILT BUT UNVERIFIED | Own-record helper protects profile/history, and checkout is member-scoped. Activation is via verified webhook or explicitly labelled demo simulator. No member journey was run. |
| Trial | BUILT BUT UNVERIFIED | Owner invitation acceptance sets one trial per gym; 30-day calculation and access gates exist. Trial begins on first invited owner acceptance, not application. Expiry restriction preserves billing/login. No cron sweep needed for access checks, but billing GET mutates expired status. |
| Fixed FitPass SaaS packages | PARTIAL | Package policy contains the approved four prices/capacities and server-side capacity checks exist. Custom negotiated amount fields/endpoint and public custom-pricing copy contradict fixed-only instruction. |
| Paystack | BUILT BUT UNVERIFIED | Webhook source performs raw signature and transaction/reference checks and separates platform/member tables. No real Paystack interaction performed; test-only key validation is in `lib/env.ts`. Demo flow is explicitly separate and cannot prove Paystack. |
| Resend | BUILT BUT UNVERIFIED | Email verification/invitation paths use Resend helpers and require `RESEND_API_KEY`, `EMAIL_FROM`; no mail delivered or verified in this audit. Password reset was not found in route inventory. |
| Tenant isolation | PARTIAL / NOT PROVEN | API handlers generally derive identity from `lib/authz.ts` and include `gymId` predicates/composite joins. But the reported live database lacks `gym_id`; migration has not been applied. User-supplied discovery from prior work says old tables have no tenant keys. Existing route/schema security is therefore not live-secure until migration and per-route review. |
| Cron / expiry reminders | NOT BUILT | `CRON_SECRET` appears in `lib/env.ts` and README, but no cron route was found under `app/api`; no expiry reminder/sweep endpoint was found. Access restrictions are calculated on requests. |
| Dashboard metrics | BUILT BUT UNVERIFIED | Platform and owner summary APIs query the DB; live API availability/accuracy is not proven. |
| Responsive behavior | BUILT BUT UNVERIFIED | Responsive classes and mobile layouts are present across key screens, but this audit did not run viewport-based visual/browser checks. |

## Root-cause analysis

### Live API 503s

Read-only HTTP GET probes to the public deployment returned HTTP 200 and FitPass title for `/`, `/gyms`, `/plans`, `/pricing`, `/apply`, `/sign-in`, `/platform/setup`, `/platform/login`, `/owner/login`, `/desk/login`, and `/member/login`. These status codes show pages render, not that their data workflows work.

The public API probes returned:

| Request | Result body | Source path |
|---|---|---|
| `GET /api/gyms` | HTTP 503, “Gym directory is unavailable right now.” | `app/api/gyms/route.ts` |
| `GET /api/platform/public-packages` | HTTP 503, “Could not load FitPass packages.” | `app/api/platform/public-packages/route.ts` |
| `GET /api/platform/setup` | HTTP 503, “First-time administrator setup is temporarily unavailable.” | `app/api/platform/setup/route.ts` |

These handlers call DB-backed queries and catch dependency errors into generic 503 responses. `lib/db.ts` requires `DATABASE_URL`; `lib/tenant.ts` uses `FITPASS_INITIAL_GYM_SLUG` to select the initial landing-page gym. Prior successful Vercel environment listing reported no configured environment variables at that time. This audit did not re-read current Vercel settings because the saved Vercel CLI token had expired (`The specified token is not valid. Use vercel login to generate a new token.`). Therefore missing live `DATABASE_URL` is consistent with the 503s and prior configuration evidence, but current variable state is **UNVERIFIED**. The site’s “Loading…” data sections cannot resolve while their APIs return 503.

`/platform/setup` returns 503 because it checks database-backed setup availability and Better Auth configuration before offering setup. No account creation was attempted.

### Migration hazard

`drizzle/0001_fitpass_multitenant_foundation.sql` creates new tables, then drops legacy constraints/indexes (around lines 252–285) and adds `gym_id uuid NOT NULL` to existing `members`, `checkins`, `subscriptions`, `payments`, and `plans` (lines 286–294). The existing `plans` table reportedly has four rows. Adding a NOT NULL column to a populated table with no default/backfill fails; no authoritative gym ID backfill is present before this DDL. The same hazard applies if any other legacy table is non-empty. Constraint and index drops occur before those statements, creating additional risk if the migration runs outside a fully atomic, validated recovery process. Do not apply this migration as-is.

The migration also drops the old `checkins_checked_in_by_members_id_fk` (line 261), while the source tree has an uncommitted schema edit restoring `checked_in_by -> members.id`. Inspect the migration’s final FK section and reconcile it before any rehearsal; do not lose the historical actor attribution relationship.

`drizzle/0000_live_schema_baseline.sql` is a no-op `SELECT 1`, with a generated snapshot/journal. Source claims the snapshot was generated from the restored live schema, but no dump or restored database was available here to verify its provenance. The baseline cannot be certified as matching production. Drizzle Kit is 0.31.11; installed `drizzle-orm` 0.45.4 and Better Auth 1.7.14. No migration command was run.

### Additional observed defects / risks

- `GET /api/gyms/[gymId]/platform-billing/checkout` updates `platform_subscriptions.status` when a trial is expired. A GET endpoint therefore has a database side effect; this should be moved to an explicit state-changing operation or made a derived read only.
- First-admin setup requires verified email and uses a database lock and one-hour one-time claim, but anyone can race to create that first pending account; an attacker can also hold the claim until expiry. Production is presently failing closed due unavailable config, but setup should be controlled by a preauthorized identity or separately issued bootstrap secret before enabling it.
- `app/api/gyms/[gymId]/checkins/route.ts` does not check whether a check-in already exists for that member/subscription/day. Repeated scans can create multiple successful rows. Whether duplicate suppression is required needs to be reconciled with the original business rule; currently no prevention is implemented.
- Platform approval commits gym/application/invitation before sending invitation email. A provider error may produce a 502 even though approval succeeded; the replacement invitation route makes recovery possible but UX should explicitly report that the gym was approved and email delivery failed.
- Gym public uploads require `BLOB_READ_WRITE_TOKEN`; without it upload routes return unavailable. Public Blob URLs are used, so uploaded images are public by design; only reviewed/approved gym assets should be exposed publicly.
- Google Maps embeds require `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY`; the source falls back without fabricated markers. Current Vercel key state is unverified.
- `CRON_SECRET` is required by the broad environment schema but no cron route consumes it. This is dead configuration unless future cron work is added.
- The fixed package policy currently conflicts with custom negotiated pricing capability. Remove/disable the custom pricing capability only after the fixed-only policy is treated as authoritative (it is in this audit brief); no values were changed in this audit.

## Database gap list (expected vs actual)

### Actual state available to this audit

No Neon MCP server or Neon CLI was available in this session, and no database connection or SQL was made. The following actual-state statements are **previously user-verified findings** from the project’s database-safety notes, not rechecked in this audit:

- Existing public business tables: `plans`, `members`, `subscriptions`, `payments`, `checkins`.
- Counts: plans 4; members, subscriptions, payments, and checkins 0 at the time of prior discovery.
- No existing table name containing `drizzle` or `migration` was found at that time.
- None of those five legacy tables had `gym_id`.
- `members.user_id`, membership code and plan name had global uniqueness; active subscription index was global per member.
- `checkins.checked_in_by` referenced `members.id`.
- Existing foreign keys linked check-ins, payments and subscriptions to member/plan/subscription rows.
- PostgreSQL version reported 18.6; `plpgsql` only; `gen_random_uuid()` available.
- The four existing plan IDs supplied by the user are preserved in project context, but plan values/created_at were not reselected during this audit.

### Expected by current code/migration

Current `lib/schema.ts` and the new `drizzle/schema.ts` expect new Better Auth tables (`user`, `session`, `account`, `verification`), `gyms`, normalized gym memberships/role grants, platform admins/packages/subscriptions/payments/settings, applications/invitations/onboarding, audit events, payment reference registry, webhook events, and tenant columns/constraints on business tables. `drizzle/meta/0000_snapshot.json` lists the five legacy tables only; snapshot 0001 expects the expanded schema. The actual production state must be freshly inspected from the restored backup before claiming any of these expected tables/columns exist.

### Must be resolved before migration

1. Independently restore the custom-format backup into an isolated PostgreSQL 18 database and verify all original rows, IDs, constraints, indexes, FKs, and plan fields.
2. Reconcile actual restored schema against snapshot 0000 and the 0001 SQL; prove the baseline does not recreate legacy tables under the installed Drizzle Kit version.
3. Before adding non-null tenant keys, backfill existing plans to the approved `FITPASS ELITE FITNESS CLUB` gym and determine the correct gym for every other legacy row. Do not guess; current earlier counts show other business tables empty, but must be verified on restored copy.
4. Preserve the four plan IDs and every field including timestamps, and change global plan-name uniqueness to `(gym_id, name)` only after scoped duplicate validation.
5. Preserve `checked_in_by -> members.id` historical links while adding gym-membership actor attribution for future check-ins; use composite gym-aware FKs.
6. Replace global member-code and user uniqueness with the approved tenant scope only after checking duplicates and user mapping; maintain global payment reference and Paystack transaction uniqueness.
7. Preserve all existing FKs/index semantics while creating composite `(gym_id, id)` keys and tenant-aware FKs for member, plan, subscription, payment, check-in relations.
8. Do not run `drizzle-kit push`, seed, or production migration. No Neon writes occurred in this audit.

## Environment variable gap list (names only)

| Variable | Purpose / source requirement | Status in this audit |
|---|---|---|
| `DATABASE_URL` | Drizzle/Neon runtime connection | Not re-read from Vercel; last successful Vercel listing reported no env vars. Live DB APIs 503. |
| `BETTER_AUTH_SECRET` | Better Auth session/signing secret (minimum 32 chars) | Current Vercel state UNVERIFIED; no value accessed. |
| `BETTER_AUTH_URL` | Canonical app URL / setup origin | Current Vercel state UNVERIFIED. |
| `RESEND_API_KEY` | Email delivery | Current Vercel state UNVERIFIED. |
| `EMAIL_FROM` | Verified sender identity | Current Vercel state UNVERIFIED. |
| `PAYSTACK_SECRET_KEY` | Paystack TEST key only (`sk_test_`) | Current Vercel state UNVERIFIED. |
| `CRON_SECRET` | Declared env schema setting, no cron route found | Current Vercel state UNVERIFIED; presently no consuming route. |
| `FITPASS_INITIAL_GYM_SLUG` | Select initial gym on landing page | Current Vercel state UNVERIFIED; expected approved launch slug is `fitpass-elite-fitness-club`. |
| `BLOB_READ_WRITE_TOKEN` | Vercel Blob image storage | Required by upload helper; current Vercel state UNVERIFIED. |
| `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` | Google Maps embed | Optional for honest no-map fallback; current Vercel state UNVERIFIED. |
| `FITPASS_PAYMENT_MODE` | `paystack` default or explicit demo | Optional; source defaults to Paystack and rejects invalid values. Current deployment setting unverified. |

`lib/env.ts`, `lib/tenant.ts`, `lib/gym-image-storage.ts`, `lib/payment-mode.ts`, and map source files were reviewed. `.env.local` and `.env.local.docx` were not opened or read.

## Security and tenant-isolation findings (ranked)

### Critical / high

1. **Production tenant security not established.** Source helpers and predicates do not secure the existing database until tenant migrations are applied and every query is checked against the live migrated schema. The prior inspected DB had no `gym_id`; all gym records therefore cannot yet be proven isolated in production.
2. **Migration is not safe for populated legacy tables.** Existing four plans plus `ADD gym_id NOT NULL` without a backfill means migration failure/data outage; prior destructive constraint/index drops must be reconciled.
3. **Initial platform admin bootstrap is claimable by the first public user.** Email verification is good but does not establish that the claimant is the intended operator. Use a tightly controlled one-time operator identity/process before enabling production setup.

### Medium

4. **Billing GET mutates state.** Expired-trial status update in `/api/gyms/[gymId]/platform-billing/checkout` should not occur on GET.
5. **Repeated check-in risk.** Check-in inserts have no detected duplicate suppression/idempotency window; repeated scans may inflate attendance.
6. **Policy drift in package price capability.** Custom pricing fields/routes/copy remain although the audit’s approved rules say four fixed prices, no negotiation.
7. **Email-after-commit state ambiguity.** Approval succeeds in the DB before the invitation email; response may imply failure even though the state changed.
8. **Historical check-in actor migration discrepancy.** Legacy actor FK is dropped in migration but is restored in current uncommitted schema change. Migration and runtime schema must agree.

### Lower / operational

9. No scheduled expiry/reminder route consumes `CRON_SECRET`.
10. Better Auth and database-dependent paths cannot be validated in production until env and database access are restored.
11. No route-to-database integration tests or browser user-journey tests were found in the suite. Unit policy tests are useful but insufficient to prove API permission boundaries.

## Content and decision mismatches

- `app/page.tsx` still describes “FitPass Gym, Adesuwa Road, GRA, Benin City” at line 191; approved demo tenant is “FITPASS ELITE FITNESS CLUB” / `fitpass-elite-fitness-club`. Site metadata also uses the stale example. This may be placeholder content, but currently reads as a real participating gym.
- `app/PublicPricing.tsx` line 68 says custom negotiated prices/discounts may be arranged. This conflicts with the audit brief’s fixed-price-only decision; current platform subscription admin/owner billing code supports custom prices too.
- Current source advertises Paystack on public membership journeys, while payment mode defaults to Paystack; no successful production configuration/payment was verified. The audit must not call payment flows operational based only on UI.
- Public `/gyms` and `/pricing` render, but their data APIs currently return 503, so the visible loading/error state contradicts the appearance of a functioning marketplace/pricing page.

## Checks and live read-only probes

Commands/checks already run for this audit:

| Command | Result |
|---|---|
| `npm test` | PASS: 41 passed, 0 failed, 0 skipped. Node emitted `[MODULE_TYPELESS_PACKAGE_JSON]` warnings for module reparsing. These are policy/unit tests, not route/database integration tests. |
| `npx tsc --noEmit` | PASS, exit 0, no output. |
| `npm run lint` | PASS, exit 0, no output. |
| `npm run build` | PASS, exit 0 using Next.js 16.4.3 / Turbopack; TypeScript check passed and 47 static pages generated. Build output noted `.env.local` as an environment source, but its contents were not read or printed. |
| `npm ci` | Not run; dependencies were already installed (`node_modules` present). |
| `git diff --check` | PASS in the preceding verification run. |
| Neon schema inspection / SQL / migration | NOT RUN, as required for this audit. |
| Paystack charge / email delivery | NOT RUN. |

Live website probes used GET only; no login, form submission, or write API was invoked. Public page responses were HTTP 200 with title `FitPass`. The three API 503 responses and bodies are listed above. Other private APIs were not probed unauthenticated because meaningful authenticated verification needs a live account and DB.

Vercel tools were not usable for current project/environment/log inspection: `vercel inspect` and `vercel env ls` reported that the saved token was invalid/expired. At the last successful deployment/configuration inspection before this audit, the project was linked to `higbinore/Fitpass`, Next.js preset was selected, and a production deployment at `https://fitpass-delta.vercel.app` returned HTTP 200. The deployment was built from commit `96459de`; current deployment status and logs are UNVERIFIED because authorization has since expired. Prior environment listing had no production variables, but current names/status must be rechecked after Vercel reauthorization.

## Recommended fix order and approvals

1. **Security gate before enabling first admin setup:** make the first admin setup require a pre-authorized operator process (for example a separately controlled one-time provisioning capability), then test race, replay, expiry, and verified-email binding. Requires code review; secret provisioning requires explicit approval.
2. **Restore rehearsal:** obtain the independent custom-format backup and restore it into the disposable local PostgreSQL 18 instance; verify plan IDs/fields, all table/constraint/index/FK inventory. This needs secure local credential handling and explicit approval for connecting to Neon for read-only backup/export; no credentials in chat.
3. **Repair and rehearse incremental migration:** generate a staged nullable/backfill/validate/not-null sequence using the approved initial gym; preserve all IDs, kobo values, timestamps, and historical actor links. Run only against verified restored copy. Production migration requires separate explicit approval.
4. **Recheck Vercel configuration (names only):** reauthorize Vercel, inspect variable names and latest logs without displaying values, then set missing production values only with explicit user approval and securely provided values. Do not set fake payment/auth/database values.
5. **Fix public availability and content:** configure correct runtime dependencies after approval; replace the stale example with approved demo gym data without inventing address/hours; remove custom pricing support/copy to honor fixed tiers.
6. **Add route-level integration coverage:** tenant A cannot read/write tenant B, role escalation rejected, member ownership, invitations/race/replay, last owner concurrency, package capacity, check-in expiry/duplicates, webhook replay and billing state transitions.
7. **Operational cleanup:** make GET routes read-only; clarify invitation-email failure after approval; either implement a cron endpoint protected by `CRON_SECRET` or remove the unused requirement after review.

Explicit approval is required before any production database backup connection/export, migration/push/seed, production secret/environment change, real email, or payment. No such action was taken during this audit.

