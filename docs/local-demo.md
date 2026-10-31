# Local FitPass review demo

## Run the existing migrated review database

For the already-restored and migrated `demo_test` database, use the guarded
review command below. It is bound to `127.0.0.1:55433/demo_test`; it does not
run migrations, load `.env` files, or terminate another process using port
3000. It uses `.next-fitpass-local-review/` so an existing standard Next
development server cannot block the review server; normal development and
production builds continue to use `.next`. The guard is preloaded into the
launcher and its Next.js child process.
The launcher sets local-only Better Auth and test-mode service values in its
process environment. Resend calls are written to a gitignored local mail-sink
file and Paystack network requests are blocked.

```powershell
$env:PGPASSFILE = Join-Path $env:APPDATA 'postgresql\pgpass.conf'
$env:DATABASE_URL = 'postgresql://postgres@127.0.0.1:55433/demo_test?sslmode=disable'
npm run dev:demo
```

Open `http://localhost:3000`. The four local account emails are
`platform-admin@fitpass-demo.test`, `gym-owner@fitpass-demo.test`,
`desk-staff@fitpass-demo.test`, and `gym-member@fitpass-demo.test`. On the
first guarded startup, the four demo account passwords are rotated locally
once and stored only in the gitignored
`.fitpass-local/demo-credentials.json`. If that file already exists, startup
does not rotate them again. Reset links created during local review are
written to `.fitpass-local/email-sink.jsonl`. Never commit or share either
file. `.fitpass-local/` is checked in `.gitignore` before these files are
created.

The process-level preloader rejects attempts to inspect or read `.env`,
`.env.*` (including `.env.local.docx`) before touching the filesystem. Do not
remove the preload or change the exact target guard. `dev:demo` does not use
the old PostgreSQL port 55432 and refuses any host, port, database, or embedded
password other than the approved local target.

This demo is for a **disposable local PostgreSQL copy only**. It applies the
staged Drizzle migration files and then adds clearly marked demo accounts,
fixed FitPass packages, and a pending DEMO membership checkout. It does not
contact Neon, Paystack, Resend, or Vercel. The demo runner refuses hosts other
than `localhost`, `127.0.0.1`, and `::1`, and refuses database names that do not
contain `demo` or `test`.

## Before running it

The runner intentionally does not bootstrap invented plan rows. First create a
new disposable PostgreSQL 18 database and restore the **independent custom
format backup** into it. Keep the backup outside the repository and retain the
original Neon snapshot. Never restore over Neon or the source database. The
local restore and its structure/plan verification are still outstanding until
they have actually been performed and recorded.

On Windows, use the PostgreSQL 18 client tools (`createdb`, `pg_restore`,
`psql`) and a local PostgreSQL server listening only on loopback. For the
previously verified local instance, create a database named `fitpass_demo`:

```powershell
createdb.exe -h 127.0.0.1 -p 55433 -U postgres fitpass_demo
```

Restore into that empty local database only (substitute the path to the
independent backup file; keep that file outside the Git repository):

```powershell
pg_restore.exe --exit-on-error --no-owner --no-privileges -h 127.0.0.1 -p 55433 -U postgres -d fitpass_demo 'D:\FitPass-Backups\fitpass-before-migration.dump'
```

If PostgreSQL requests a password, enter it at the hidden prompt. Do not put it
in a command, URL, script, `.env` file, Git, or chat. `pg_restore --list` can
inspect the archive without restoring it. The demo runner verifies that the
five legacy FitPass business tables and all four confirmed plan IDs, names,
durations, and kobo prices are present before it runs migrations. It captures
and compares each plan's ID, name, duration, price, description, active flag,
sort order, and `created_at` before and after migration. If a precondition or
preservation check fails, stop and restore a fresh disposable copy.

### Supplying a local-only connection in PowerShell

Use the local PostgreSQL password file rather than placing a password in a URL
or command history. For the configured Windows instance, point libpq and
node-postgres at the existing password file and use a passwordless URL:

```powershell
$env:PGPASSFILE = Join-Path $env:APPDATA 'postgresql\pgpass.conf'
$env:DATABASE_URL = 'postgresql://postgres@127.0.0.1:55433/fitpass_demo?sslmode=disable'
```

These variables stay in the current PowerShell process. Keep the terminal open
for the demo. Do not use a Neon URL.

## Run the local setup

From the FitPass repository root, in the same PowerShell session:

```powershell
npm run demo:local
$env:FITPASS_PAYMENT_MODE = 'demo'
npm run dev
```

`demo:local` performs these steps in order:

1. Validates the `DATABASE_URL` protocol, loopback host, and test/demo database
   name before starting any database client or migration process.
2. Confirms the restored copy contains the five source business tables and the
   four confirmed plans, then saves a temporary in-memory comparison of all
   preserved plan fields.
3. Runs the checked-in Drizzle migration journal with the installed Drizzle Kit
   migration runner. The migrator records completed journal entries; a safe
   rerun resumes from its migration history. If a migration fails, stop and
   restore a new disposable database from the independent backup rather than
   manually replaying SQL.
4. Confirms that all four plan records still match their pre-migration fields
   and now belong to `FITPASS ELITE FITNESS CLUB`.
5. Inserts the four fixed monthly FitPass packages only when missing; it never
   overwrites a package and aborts if an existing package conflicts with the
   approved prices or limits.
6. Creates one local account for each workspace, one accepted demo owner
   invitation (so the local trial represents post-acceptance), a 30-day local
   trial, the member identity, and a **pending** DEMO Day Pass payment. It
   generates one random password, stores only Better Auth's password hash,
   and prints the password once when it creates the accounts. The password is
   not stored in the repository. If the accounts already exist, the script
   does not reset them or print the password again.

The demo email addresses are:

| Workspace | Email |
| --- | --- |
| Platform administrator | `platform-admin@fitpass-demo.test` |
| Gym owner | `gym-owner@fitpass-demo.test` |
| Desk staff | `desk-staff@fitpass-demo.test` |
| Gym member | `gym-member@fitpass-demo.test` |

The initial `demo:local` setup generated credentials only if it created the
demo accounts. The review-server command above has a separate one-time local
rotation so the credentials are available in an ignored file without printing
passwords. These accounts and credentials are for disposable local databases
only.

## Review the product journeys

With `npm run dev` running, visit:

- `/` — launch gym landing page
- `/gyms` — public gym directory and address-based map fallback
- `/gyms/<gym-id>` — launch gym profile; obtain the gym ID from the local
  database or click its directory card
- `/platform/login` — platform administrator workspace
- `/owner/login` — owner workspace and trial/package overview
- `/desk/login` — member lookup and front-desk check-in
- `/member/login` — member membership, payment, and check-in records

The member starts with a pending DEMO payment, not an active membership. After
signing in as the demo member, open the local demo-checkout URL printed by the
runner and choose its simulated success outcome. The server-side DEMO
confirmation endpoint records the local payment outcome and only then activates
the membership. The desk workspace can then verify the code and record a valid
check-in, subject to the gym's configured daily limit. This simulation does
not contact Paystack or move money.

`dev:demo` sets `FITPASS_PAYMENT_MODE=demo` in its child process. For the
older manual `demo:local` + `dev` flow, set it only in that local PowerShell
session before starting Next.js. This is a mode selector, not a payment
credential. Never set it in production.

## Safety and verification status

- No live Neon hostname can pass the runner's connection guard.
- The script does not read `.env.local` or `.env.local.docx`; set the local URL
  directly in the PowerShell process environment as above.
- Phase 2a restored the independent backup into `rehearsal_test` and
  `demo_test` on `127.0.0.1:55433`, verified both restores, manually rehearsed
  migrations in `rehearsal_test`, and ran this demo setup against the separate
  `demo_test` copy. See `docs/phase-2a-report.md` for evidence and limitations.
- Interactive browser review and screenshots remain **UNVERIFIED** because
  browser control was disabled in the Codex Work settings. HTTP smoke checks
  and the route integration suite are not a substitute for visual review.
- This runner expects the reviewed pre-migration copy. It deliberately refuses
  an empty database instead of fabricating the four source plan rows or
  claiming to have reproduced their original timestamps and descriptions.
- Do not use this local demo to infer that production migrations, live payment,
  email delivery, map APIs, or Vercel deployment have been verified.
