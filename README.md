# FitPass

FitPass is a multi-tenant gym management app launching with one gym in Benin City. It uses Next.js App Router, Better Auth, Neon Postgres, and Drizzle ORM. The existing public landing page and design system remain the launch experience.

## Local development

Install dependencies and run the development server:

```bash
npm install
npm run dev
```

The public page is available at `http://localhost:3000`. Its plans are scoped to the gym selected by `FITPASS_INITIAL_GYM_SLUG`; an unset or invalid slug shows no plans rather than exposing every tenant's catalog.

## Authentication configuration

Better Auth uses the Drizzle adapter. Configure these server-only environment variable names in the local environment or deployment settings:

- `DATABASE_URL`
- `BETTER_AUTH_SECRET` (at least 32 characters)
- `BETTER_AUTH_URL` (the canonical application URL)
- `RESEND_API_KEY`
- `EMAIL_FROM`
- `PAYSTACK_SECRET_KEY` (TEST key beginning with `sk_test_`)
- `CRON_SECRET` (at least 16 characters)
- `FITPASS_INITIAL_GYM_SLUG` (public slug of the launch gym; not a secret)

Never commit or disclose secret values. Protect `.env.local` and `.env.local.docx`; do not display, copy, modify, or commit them. Drizzle Kit reads `DATABASE_URL` only from the process environment and never parses a local environment file.

## Roles and tenant security

- `platform_admin` is a global privilege held separately from gym membership and may only be provisioned through a controlled server-side process. Public registration cannot assign it.
- `gym_owner`, `gym_desk_staff`, and `gym_member` are normalized role grants on one user-to-gym membership. A person can hold more than one role; owner does not imply desk access.
- Protected operations must derive the user from a verified server session, resolve gym membership on the server, and scope every gym-owned query to the authorized gym. Request-supplied roles or gym IDs do not grant access.
- Members may access only their own records. Desk staff can perform successful check-ins for their gym. Owners manage only their gym. Archived gyms allow authorized historical reads and reject new writes.
- Public gym applications create only pending applications. A platform administrator must approve an application before FitPass creates a gym and emails its first-owner invitation.
- FitPass package subscriptions/payments are separate from gym-member plans/subscriptions/payments. Prices use integer kobo, and package capacity/feature settings are stored as platform package records.
- The old global plan seed is disabled; it must not be used after plans become gym-scoped.
- Application APIs and schema now express tenant rules, but the live database has **not** been migrated. Do not describe database-backed product routes as production-ready until migrations and the recovery rehearsal have been approved and completed.

See [AGENTS.md](AGENTS.md) for the full security and business rules.

## Database change control

Do not connect to or alter the configured Neon database until an independent custom-format backup has been restored and verified in a disposable PostgreSQL database, the live schema baseline has been reconciled, and the exact migration has been rehearsed. Obtain explicit approval for every database-changing phase. Never run `db:push` or the disabled global plan seed against a tenant database.

See [the database backup and migration rehearsal runbook](docs/database-safety-and-rehearsal.md) for the Windows backup, restore-verification, schema-comparison, and recovery procedure. It is preparation only; no production migration is authorized by that document.

The initial FitPass administrator is provisioned only after a verified Better Auth account exists, using `npm run provision:platform-admin -- --email=<verified-account> --confirm` against the specifically approved database. Do not make this part of public registration or an automatic seed.

The `drizzle/` migration history must start with a no-op live baseline in `public.__drizzle_migrations`; `drizzle-bootstrap/` is reserved for a new empty database. Do not generate or apply live migrations from an unverified snapshot. A full exact baseline still depends on inspecting the restored backup.

## Checks

`npm test` uses Node's built-in TypeScript stripping and requires Node.js 22.6 or newer.

```bash
npm test
npm run lint
npm run build
```

Unit tests run without a database connection. Tenant, migration, payment, invitation, and recovery integration tests still require a disposable PostgreSQL rehearsal; none of these checks authorize a live migration.
