# FitPass Phase 2a addendum — local review, maps, and guarded migration runner

Date: 2026-10-31
Branch: `fix/phase-1`

## Local review server

`npm run dev:demo` accepts only
`postgresql://postgres@127.0.0.1:55433/demo_test?sslmode=disable`, uses the
existing `%APPDATA%\postgresql\pgpass.conf`, and binds Next.js to
`127.0.0.1:3000`. It refuses a busy port instead of killing another process.
The environment-file preload is active in both the launcher and child. It
blocks `.env`, `.env.*`, and `.env.local.docx` reads. Local-only auth and test
service values are set in process memory; no external email or payment is
sent. Resend requests go to `.fitpass-local/email-sink.jsonl`; Paystack network
requests are rejected. The directory was added to `.gitignore` and committed
before any local credential or sink file was created.

The first run rotates only the four known local demo credential hashes and
writes newly generated passwords to the ignored file
`.fitpass-local/demo-credentials.json`. The file is created only after
`git check-ignore` verifies the directory. Re-running with the file present
does not change the credentials. Passwords are never printed by the command.
This operation is local-only and does not affect Neon.

## Maps

When `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` is configured, map previews use Google's
documented Maps Embed API place endpoint. No key was added. Without a key, the
interface shows the gym's published address and an **Open in Google Maps**
directions link; it does not invent coordinates or markers.

## Node 22 and reviewed migrations

Drizzle Kit was verified with the official Node.js release archive before
extraction. Node 22.23.4 Windows x64 archive:

- Archive: `https://nodejs.org/dist/v22.23.4/node-v22.23.4-win-x64.zip`
- Official SHA-256: `cbc74b5e0982c9dbb41525fd8fb5dcd32fbee237863f7829072f4639a1ce5f20`
- Extracted outside the repository to `%LOCALAPPDATA%\FitPassTools\node-v22.23.4\node-v22.23.4-win-x64\node.exe`.
- System Node and the system `PATH` were not changed.

The migration runner takes `DATABASE_URL` only from the process environment,
verifies the custom-format backup SHA-256 and `pg_restore --list`, checks all
four original plan fingerprints before connecting, and verifies their
preservation plus tenant constraints after migration. It accepts exactly one
of two modes:

- Local rehearsal: the URL must target `127.0.0.1:55433/migrate_runner_test`
  with passwordless URL auth and `pgpass.conf`.
- Production: requires `--confirm-production`, `--confirm-backup`, a direct
  non-pooler Neon host, and TLS. This mode has **not** been run.

In production, Drizzle Kit failure prints a scrubbed diagnostic and exits
non-zero. It never falls back to psql unless the separate
`--allow-sql-fallback` option is present. That option requires separate
explicit approval and has not been used. The SQL-hash/per-file transaction
fallback is permitted in local rehearsal only.

The installed Drizzle Kit migration command returned
`uv_os_get_passwd returned ENOMEM` under verified Node 22.23.4 on this Windows
machine. The runner then used its local-only, per-file journal/hash checked
transaction fallback against the newly restored `migrate_runner_test` copy.
Post-migration preservation and tenant checks passed. No Neon connection or
production operation occurred.

Local rehearsal command form (the existing local pgpass file supplies
authentication; no password is placed in a command):

```powershell
$env:PGPASSFILE = Join-Path $env:APPDATA 'postgresql\pgpass.conf'
$env:DATABASE_URL = 'postgresql://postgres@127.0.0.1:55433/migrate_runner_test?sslmode=disable'
$env:FITPASS_NODE22_EXE = Join-Path $env:LOCALAPPDATA 'FitPassTools\node-v22.23.4\node-v22.23.4-win-x64\node.exe'
npm run db:migrate:reviewed -- --local-rehearsal --backup-file 'C:\FitPassBackups\fitpass-neon.dump' --backup-sha256 AE2A9B8340E9C51F67607F27CCBA669E55475F7B53A9D92D61D43CD3E312C154
```

Production command form for a separately approved future operation only; it
was not executed here:

```text
npm run db:migrate:reviewed -- --confirm-production --confirm-backup --backup-file <fresh-verified-backup-path> --backup-sha256 <fresh-backup-sha256>
```

The production connection must be injected securely into the operator process
as a direct Neon URL. Do not put its value in a command, source file, report,
or chat. If Drizzle Kit fails, the command stops. Do not add
`--allow-sql-fallback` without separate approval.

## Remaining verification boundary

## Verification results

- Backup file verification: SHA-256 matched
  `AE2A9B8340E9C51F67607F27CCBA669E55475F7B53A9D92D61D43CD3E312C154`;
  file size was 15,739 bytes; `pg_restore --list` exited successfully.
- A new `migrate_runner_test` was restored from that file on local PostgreSQL
  18.6 at port 55433. It contained all five legacy tables and four plans
  before migration. The reviewed runner completed all post-migration checks,
  and a second run recognized the migration hashes and passed the same checks.
- Drizzle Kit itself failed under Node 22.23.4 with
  `uv_os_get_passwd returned ENOMEM`; only the local-rehearsal mode used the
  transaction-per-file fallback. The production failure branch was not run.
- `npm test`: 69 passed, 0 failed, 9 HTTP route-integration tests skipped
  because this pass did not configure route fixture credentials.
- `npx tsc --noEmit`: passed.
- `npm run lint`: passed after excluding the isolated generated review build
  directory from ESLint.
- `npm run build`: passed; all 51 routes were generated.
- `git diff --check`: passed.
- HTTP smoke checks on the guarded local server returned 200 for `/`, `/gyms`,
  `/plans`, `/platform/login`, `/owner/login`, `/desk/login`, and
  `/member/login`. These are route availability checks, not visual/browser
  verification or signed-in workflow tests.
- The generated local credentials file is ignored and contains the rotated
  passwords. Its contents were not read or printed. No email-sink file has
  been created; email interception remains configured for local use.
- No Neon connection or production database operation occurred.

This addendum records local-only preparation. It does not authorize or claim
production migration, production Super Admin provisioning, real email or
payment, Vercel changes, or a visual browser review. The migration runner's
production path and recovery from a deliberately failed migration remain
unverified until separately approved and tested in an isolated disposable
environment.
