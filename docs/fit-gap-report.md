# FitPass fit-gap review

Review date: 2026-11-15
Source branch reviewed: `fix/phase-1` at `f1a1af5159542b0e1bfb8da3486f8276738a19fd`
Scope: source-only review; no database, Neon, Vercel, or environment-file access.

## Part 0 — status of the preceding local-rehearsal task

The preceding task is documented in `docs/phase-2a-addendum.md` and commit `f1a1af5159542b0e1bfb8da3486f8276738a19fd`. That commit is the current `fix/phase-1` HEAD and its upstream tracking ref is `origin/fix/phase-1`.

| Item | Status evidenced by source/report | Verification boundary |
|---|---|---|
| `npm run dev:demo` | Done. The addendum describes the local-only launcher, guarded environment-file reads, local email sink, local demo credential rotation, loopback binding and a database-name/port guard. | Historical report records HTTP smoke checks. At this review, no process was listening on port 3000, so the server is not currently running. Its documented URL is `http://localhost:3000`. No DB was touched to determine this. |
| Maps | Done in source. `components/GymLocationMap.tsx` uses `lib/google-maps.ts`, which builds Google's official Maps Embed API `place` URL only when `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` and an address exist. Otherwise it renders the address and a Google Maps directions link. | No key/configuration was inspected and no live map was opened. Actual embed rendering is UNVERIFIED. |
| Reviewed migration runner | Done in source as `scripts/migrate-reviewed.ts` (not `.mjs`). The addendum documents local-only SQL fallback and a production fallback gate requiring a separate `--allow-sql-fallback` flag. | Historical addendum reports local restore/rehearsal and preservation checks. Production mode has not run. |
| Node 22 | Addendum records official Node.js 22.23.4 Windows x64 archive SHA-256 verification and extraction outside the repository without changing system Node/PATH. | Node 22 was installed. Drizzle Kit was run with it and still failed with `uv_os_get_passwd returned ENOMEM`; the Node major version alone does not explain the failure. |
| Checks | Addendum records 69 passed, 0 failed, 9 integration tests skipped; TypeScript, lint, build and diff checks passed in that prior run. | Historical results only; not rerun during this source audit. The build was explicitly waived for this documentation-only branch. |

### Drizzle Kit `uv_os_get_passwd` investigation (read-only)

The error was reported under both the machine's default Node 26 environment in `docs/phase-2a-report.md` and verified Node 22.23.4 in `docs/phase-2a-addendum.md`. This rules out “use Node 22” as a sufficient fix; it does not identify the root cause. No stack trace or native call site is recorded in the project reports, and this review did not reproduce the command.

The installed Drizzle Kit bundle contains calls to Node's `os.homedir()`. A static search found no direct `os.userInfo()` call in the inspected Drizzle Kit bundle, but the error name alone is insufficient to identify which native path or transitive code raised it. Windows profile paths normally support spaces and periods; their presence is not evidence of a failure, and no controlled comparison was performed. `USERPROFILE` and `HOME` values were not read. `scripts/migrate-reviewed.ts` imports `pg` for its own guarded SQL fallback, while it starts Drizzle Kit as a separate Node child process; that makes the runner's `pg` import an unlikely direct cause of the child CLI error, but does not prove there is no transitive driver interaction. Root cause is **UNVERIFIED**.

Safe options for a later separately approved production operation (none tried here):

1. Run the standard reviewed Drizzle migration under Node 22 in WSL, with a fresh restored rehearsal and a securely injected direct Neon URL. Keep the URL out of command arguments, logs and files; inspect output before any production action.
2. Run the same under a clean second Windows user profile, using a restricted local workspace path and a controlled environment. Do not copy secrets into the repository or shell history.
3. Run in GitHub Codespaces with Node 22 and a narrowly scoped secret supplied through the platform secret mechanism. This requires repository access and a separate operator review.
4. Use the guarded journal/hash-checked SQL fallback only after explicit approval of that fallback. For production the runner requires `--confirm-production`, a fresh verified backup, and the additional `--allow-sql-fallback` flag. This is not approval to run it.

Before selecting an option, capture a redacted stack trace and compare only non-secret environment-variable presence (not values) in a disposable environment. Preserve the existing backup and do not trial-run any option against Neon.

## Part 1 — requested fit-gap matrix

Statuses describe code evidence, not a successful production workflow. `READY` means the specified prohibition has no corresponding code path in the inspected source; it is not a security certification. Size is a rough implementation estimate. Database notes describe future reviewed schema work only; no migration is authorized here.

| # | Requirement and status | Evidence / gap | Size | Likely database work |
|---:|---|---|:---:|---|
| 1 | Per-gym Paystack subaccounts and split member checkout — **NOT BUILT** | Checkout routes `app/api/gyms/[gymId]/checkout/route.ts` and `.../platform-billing/checkout/route.ts` initialize transactions. No subaccount setup or transaction split field was found. Platform billing is separate, which should remain unsplit. | L | Add verified bank/subaccount state per gym and audit history; retain payment owner/type separation. Review tenant-aware FKs and Paystack reference uniqueness. |
| 2 | Gym/member card-fee choice and exact markup — **NOT BUILT** | No per-gym fee payer setting or fee calculation exists. The specified 1.5% + ₦100 (waived below ₦2,500; capped at ₦2,000) rule is not implemented. The Paystack account-wide switch cannot be verified from source. | M | Persist a constrained fee-payer setting per gym and store base amount, fee and charged amount separately in integer kobo for each member payment. Never apply it to FitPass subscription payments. |
| 3 | Bank selection, account-name resolution and master-admin approval — **NOT BUILT** | No Resolve Account Number or bank/subaccount approval path found. Existing coordinate verification is unrelated. | L | Bank details should be staged as pending changes; store verification/approval actor, timestamps and provider code with audit trail. Avoid retaining full account numbers when a token/masked form suffices. |
| 4 | Never refund/reverse through Paystack — **READY (source scan only)** | The only Paystack API URL found in application routes is `/transaction/initialize` for member and platform billing. No refund/reversal endpoint or cashback feature was found in `app`, `lib`, `scripts`, or `tests`. | S | None. Add a static regression test that scans first-party runtime source for Paystack refund/reversal endpoint paths and fails on a match; exclude test fixture strings only through a narrowly documented allowlist. |
| 5 | Fixed gym refund disclosure, member acknowledgement and “Report a Problem” — **NOT BUILT** | No gym-controlled refund-policy field plus immutable FitPass line, payment-time acknowledgement, or problem-report route/notification flow was found. | M | Store gym policy text and version/acknowledgement with payment intent; put the fixed platform wording in audited platform settings. Add durable reports with gym/admin notification delivery state. Never represent FitPass as refund issuer. |
| 6 | Desk cash/transfer/POS receipt, void reason, optional closeout and activation switch — **NOT BUILT** | Existing member and FitPass payment flows are electronic; no offline tender ledger, void event, closeout count or staff activation setting was found. | L | Add append-only manual payment entries, tender enum, actor, receipt/ref, void event/reason and optional cash closeout. Store all amounts in kobo; never delete/overwrite posted financial entries. Add gym-scoped FKs. |
| 7 | Bookkeeping daily/weekly/monthly channel totals and Excel/PDF — **NEEDS CHANGE** | `app/api/gyms/[gymId]/reports/route.ts` and owner UI provide paginated filtered reports, but not the requested app/cash/transfer/POS ledger view or staff-own-entry visibility. Platform export is CSV (`app/api/platform/exports/route.ts`). No Excel/PDF library is installed. | L | Depends on offline tender ledger and auditable voids. Aggregate by gym and Africa/Lagos calendar boundaries; enforce owner versus staff row-level visibility server-side. |
| 8 | Admin-editable trial default and per-gym override, audited; one trial by identity/business attributes — **NEEDS CHANGE** | `lib/trial-policy.ts` hard-codes 30 days. `gym_onboarding` stores activation/expiry, but no default/override settings or matching/deduplication rule for bank account, owner phone and business name was found. | M | Add an audited global default and nullable per-gym override; snapshot effective duration at activation so later defaults affect only later gyms. Add a one-trial uniqueness strategy only after deciding how to normalize and retain match keys. |
| 9 | Join-source attribution and global/per-gym referral rate — **NOT BUILT** | Current member/application/invitation schemas have no marketplace/link/desk attribution or referral-fee fields. | M | Add a constrained source enum on member enrollment and audited global/per-gym rates; snapshot the applied rate/amount per eligible transaction. Default to 0. |
| 10 | Super Admin/Operations/Finance/Support roles, unlimited count, invitation-only — **NEEDS CHANGE** | `platform_admins` has active/suspended status, not platform role grants. A 10-active-admin cap exists in `lib/platform-admin-policy.ts`, `app/api/platform/admins/route.ts` grant/reinstate, `app/admin/AdminDashboard.tsx` UI, `scripts/provision-platform-admin.ts`, and `tests/platform-admin-policy.test.ts`. Admin route promotes an existing verified account by email; it is not an invitation acceptance flow. `AGENTS.md` separately documents the same current cap. | L | Replace flat admin identity with normalized platform role grants and invitations, audit grant/revoke/suspend, serialized transactional protection for the last active Super Admin. Remove cap only after approval. |
| 11 | Code and QR check-in, daily limit, optional checkout — **NEEDS CHANGE** | Code lookup/check-in and per-gym `max_daily_checkins` (1–20, default 1) exist in `app/gyms/[gymId]/desk/DeskCheckin.tsx`, API and `lib/schema.ts`. No QR flow or check-out fields/route found. | M | Add short-lived signed member QR token support without putting PII in QR; optional check-out event/time with default off. Preserve current transactional daily-limit enforcement and composite gym constraints. |
| 12 | Visit-only weekly/monthly count, streak, calendar; no health data — **NEEDS CHANGE** | Member visit/check-in history exists in the member workspace. Weekly/monthly rollups, streak and calendar UI were not found. The inspected core schema has no calorie, diet, photo-health or body-measurement feature. | M | Existing `checkins` may support aggregation; add indexes only if query plans show need. No health-data schema should be introduced. |
| 13 | Excel/CSV member import and activation link (email primary, SMS optional off) — **NEEDS CHANGE** | Secure invitation acceptance and transactional email helpers exist. No bulk member import/parser or member activation batch workflow found. SMS integration was not found. | L | Add import batch/error audit and idempotent member enrollment keys; enforce package limits inside transaction and record invitation/activation provenance. SMS remains disabled unless separately approved. |
| 14 | Logo 1, cover 1, gallery 10, 5 MB each, resized WebP — **NEEDS CHANGE** | `lib/image-validation.ts` accepts JPEG/PNG/WebP, converts with Sharp to WebP and caps source bytes at 1.25 MB / 40 MP. Owner/admin upload routes accept one logo and exactly two facility photos; schema has `logo_url` and `facility_photo_urls`. No cover field or 10-item gallery limit. | M | Add cover URL and gallery storage/ordering with constrained counts; preserve existing logo/photos during additive migration. Decide whether limits apply to originals or upload bytes; enforce 5 MB server-side and retain safe normalized image output. |
| 15 | Every public route ≤3s mobile; cache/index/lazy/bundle/font review — **NEEDS CHANGE / UNVERIFIED** | Public routes and some paginated/indexed data paths exist. This review ran no Lighthouse, bundle analysis, real mobile timing, production query plan or cache verification. `next/font/google` fonts are configured. | L | Likely targeted indexes/caching policy after measurements; do not add speculative indexes. Verify tenant filters before caching and never cache private responses publicly. |
| 16 | Per-gym visual brand data model, without building brand editor — **NEEDS CHANGE** | Gym schema supports logo and facility photos but has no accent color, cover image or section order. | S | Add nullable, validated color token, cover URL and ordered section list in later reviewed migration. No custom HTML/CSS/JS field. |
| 17 | Product name defined in one place — **NEEDS CHANGE** | Exact literal search finds 152 `FitPass` occurrences in first-party `app`, `components`, and `lib` TypeScript/CSS files. Occurrence references are listed below. There is no single product-name constant. | S | None. Centralize product display name/metadata later; avoid changing payment/audit identifiers or migration names as part of a string-only refactor. |
| 18 | Installable PWA — **NOT BUILT** | No manifest, service worker, install prompt, PWA icon set or offline strategy was found in the source inventory. | M | None necessarily; add static manifest/icon assets and only a narrowly scoped service worker after deciding offline behavior. Do not cache authenticated or financial responses. |
| 19 | One token source, light/dark values, one-file brand swap — **NEEDS CHANGE** | `app/globals.css` maps semantic Tailwind v4 variables and defines light values, but no `.dark` variable block or theme switch was found. Hard-coded colours remain in landing page, chart SVGs, placeholder gradient and demo SVGs; direct Tailwind color utilities also appear broadly. | M | No database work. Consolidate design tokens and add separately reviewed dark values only if dark mode is required; preserve UI and verify contrast. |

#### Exact `FitPass` source occurrence references (152)

The count is literal, case-sensitive `rg -o -n "FitPass" app components lib --glob '*.{ts,tsx,css}'`. Each listed line contains the stated number of occurrences (repeated JSX lines may contain several):

| File | Line references (`line × count` where repeated) |
|---|---|
| `app/about/page.tsx` | 6 × 2 |
| `app/admin/AdminDashboard.tsx` | 190, 419, 436, 441, 447, 471, 491, 503, 510, 517 |
| `app/api/auth/destination/route.ts` | 53 |
| `app/api/gym-applications/route.ts` | 56 |
| `app/api/gyms/[gymId]/invitations/route.ts` | 36, 38, 54, 63 |
| `app/api/gyms/[gymId]/platform-billing/checkout/route.ts` | 9, 14, 49, 53, 60, 72, 73, 79, 109 |
| `app/api/invitations/accept/route.ts` | 62, 66, 86, 88, 105, 116 |
| `app/api/payments/demo/confirm/route.ts` | 63, 71 |
| `app/api/platform/admins/route.ts` | 34 |
| `app/api/platform/applications/[applicationId]/route.ts` | 62, 63 |
| `app/api/platform/gyms/[gymId]/first-owner-invitation/route.ts` | 31, 34 |
| `app/api/platform/gyms/route.ts` | 24, 56 |
| `app/api/platform/packages/[packageId]/route.ts` | 7, 24 |
| `app/api/platform/packages/route.ts` | 6, 35, 36 |
| `app/api/platform/public-packages/route.ts` | 5, 12, 14 |
| `app/api/platform/setup/route.ts` | 51, 58 |
| `app/apply/page.tsx` | 26, 33, 51, 52, 53 × 3, 60 |
| `app/AuthForm.tsx` | 12, 62, 74, 76 |
| `app/contact/page.tsx` | 6, 8 |
| `app/dashboard/page.tsx` | 31, 67, 78, 83, 105, 112 |
| `app/features/page.tsx` | 5, 11 × 2 |
| `app/globals.css` | 7 |
| `app/gyms/[gymId]/desk/DeskCheckin.tsx` | 63, 68 |
| `app/gyms/[gymId]/join/JoinGym.tsx` | 48, 54 × 2 |
| `app/gyms/[gymId]/join/page.tsx` | 19, 20 |
| `app/gyms/[gymId]/member/MemberRecords.tsx` | 103 |
| `app/gyms/[gymId]/owner/OwnerDashboard.tsx` | 102, 190, 222, 244, 287 × 8 |
| `app/gyms/[gymId]/page.tsx` | 34, 57 |
| `app/gyms/GymDirectory.tsx` | 60 |
| `app/gyms/page.tsx` | 7 |
| `app/invitations/accept/page.tsx` | 32 |
| `app/layout.tsx` | 20, 22 |
| `app/page.tsx` | 32, 157, 159, 160, 182, 207, 227 × 2, 235 |
| `app/PasswordResetRequestForm.tsx` | 31 |
| `app/payment/complete/page.tsx` | 36, 39 |
| `app/payment/demo/page.tsx` | 45 × 2, 52 |
| `app/plans/page.tsx` | 7 |
| `app/platform/setup/page.tsx` | 67 |
| `app/pricing/page.tsx` | 6 × 2 |
| `app/PublicDestinationPage.tsx` | 25 |
| `app/PublicPricing.tsx` | 31, 50 × 2, 54, 65 |
| `app/PublicSiteHeader.tsx` | 15, 53, 55 |
| `app/ResetPasswordForm.tsx` | 33 |
| `lib/auth.ts` | 17, 36, 37, 46, 47 |
| `lib/authz.ts` | 102 × 2, 127 |
| `lib/db.ts` | 9 |
| `lib/env.ts` | 69, 103, 147 |
| `lib/invite-email.ts` | 16, 17 |
| `lib/password-reset-policy.ts` | 2 |
| `lib/payment-mode.ts` | 1, 4 |
| `lib/platform-package-policy.ts` | 12, 29, 36 |

### Recommended implementation order and feature branches

One feature branch per item; merge only after its stated dependencies and focused checks pass. This sequence avoids charging and bookkeeping changes ahead of their bank/fee model.

| Order / branch | Depends on | Main risk / database friction |
|---|---|---|
| `feature/bank-verification` | None | Financial identity data; approval and account-change audit. |
| `feature/paystack-subaccounts` | Bank verification | Paystack test account capabilities, split reconciliation and webhook amount expectations. Keep platform billing unsplit. |
| `feature/card-fee-choice` | Subaccount checkout | Fee arithmetic/rounding, cap, thresholds, statement transparency and fixed integer-kobo storage. |
| `feature/offline-payments-bookkeeping` | Existing payment model | Append-only receipts/voids and role-specific access; reconcile cash without treating manual entries as verified Paystack. |
| `feature/export-excel-pdf` | Bookkeeping ledger | Formula-injection protection, privacy and bounded export pagination. Prefer existing platform-safe CSV pattern until format libraries are reviewed. |
| `feature/refund-policy-problem-reports` | Payment acknowledgement model | Policy version snapshots and immutable FitPass wording; notification failure must not lose reports. No refund endpoint. |
| `feature/trial-settings` | Existing onboarding/trial | Default snapshot semantics, per-gym overrides, duplicate detection policy and migration backfill. |
| `feature/join-source-tracking` | Checkout attribution model | Source integrity and referral amount snapshot; default rate remains 0%. |
| `feature/qr-checkin` | Existing code check-in | Signed/rotating QR token, replay prevention, privacy and reuse of daily-limit transaction. |
| `feature/member-import-invites` | Package limits + email invite | Idempotency, duplicate handling, verification and batch partial failures. |
| `feature/admin-roles` | Platform role schema/invitation flow | Migration from flat admin rows; explicitly settle unlimited versus last-Super-Admin protection and scoped finance/support access. |
| `feature/member-visit-tracking` | Existing check-ins | Lagos calendar correctness and index/performance measurement; no health fields. |
| `feature/photo-limits` | Existing Blob uploads | Add cover/gallery while keeping old URLs and URLs tenant-scoped; cleanup only after successful DB write. |
| `feature/speed-budget` | Core route contracts stable | Lighthouse/bundle checks, caching private data safely and real-device baseline. |
| `feature/pwa-install` | Speed/security review | Avoid caching member/payment/admin data; define offline fallback and update policy. |
| `feature/design-system` | Baseline visual audit | Consolidate tokens without redesign regressions; mobile and contrast checks. |
| `feature/branding-stage-1` | Photo limits + token design | Persist accent/cover/section order only; validate CSS colors and safe ordering. |
| `feature/branding-stage-2` | Stage 1 | Apply per-gym tokens to public profile only; prevent arbitrary styles/code. |
| `feature/legal-pages` | Refund wording/policy approved | Terms/privacy/refund language needs owner/legal review; do not invent statutory retention or consumer policy. |

### Decisions requiring product/legal/payment review

- Confirm the payment-fee rule against the active Paystack contract and how its fee is displayed/rounded; the source code does not establish Paystack account configuration.
- Define how a master-admin bank/subaccount approval queue and failed Resolve Account Number responses are handled.
- Decide whether manual cash/transfer/POS postings count toward membership activation. Recommended default: they remain pending until an owner verifies them; do not let staff create a Paystack-paid state.
- Decide void permissions, end-of-day cash variance handling, and receipt number uniqueness.
- Approve exact refund-policy wording/versioning and report escalation/notification expectations.
- Define how bank account, owner phone and business name are normalized/matched for one-trial enforcement without inventing legal identity retention periods.
- Decide whether a “platform administrator” is split into Super Admin, Operations, Finance and read-only Support, and whether invitation-only means no email-based direct grant. This changes current policy.
- Decide QR token lifetime and checkout semantics; default check-out should remain off.
- Define import duplicate resolution and whether email verification is required before first member login.
- Confirm image constraints and user consent/retention for uploaded photos.
- Approve PWA offline scope; recommend no private/offline financial data.
- Supply reviewed Terms, Privacy, retention and refund language before those pages are published.
