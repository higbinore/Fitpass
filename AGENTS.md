# AGENTS.md — FitPass House Rules

## Project overview

FitPass is a gym membership app for a neighbourhood gym in Benin City, Nigeria.

- Members purchase a membership plan and receive a code.
- Front-desk staff check membership codes and record successful check-ins.
- The owner reviews income, subscriptions, and renewals.

Treat the rules in this file as project constraints. Do not weaken security or business rules to make a feature easier to implement.

## Technology stack

- Next.js with the App Router
- TypeScript
- Tailwind CSS
- shadcn/ui
- Better Auth
- Neon Postgres
- Drizzle ORM
- Resend for email
- Paystack in **TEST mode only**
- Vercel for deployment

## Commands

- `npm run dev` — run locally at `http://localhost:3000`
- `npm run build` — must pass before any push
- `npm run lint` — run lint checks

Run the relevant checks after each change. Before pushing, ensure `npm run build` passes. Report any command that cannot be run and why; never claim a check passed unless it actually did.

## Roles and authorization

The supported roles are:

- `member`
- `front_desk`
- `owner`

The role is stored on the member row.

Enforce authorization on the **server** for every protected page, Server Action, route handler, and data query. Hiding a button or link is not access control.

- **Member:** can access only their own member, subscription, payment, and check-in records.
- **Front desk:** can look up membership codes and record check-ins. They must not gain access to owner-only income, payment management, member administration, or other unrelated functions.
- **Owner:** can access the full set of owner-authorized records and management features.
- **Logged out:** can access public pages only.

Default to denying access when identity or role cannot be verified. Never trust a role, member ID, membership status, or other authorization claim supplied by the browser. Derive identity from the verified server-side session and check ownership on the server.

## Database conventions

The core tables are:

- `plans`
- `members`
- `subscriptions`
- `payments`
- `checkins`

Every table has a `created_at` field.

Store monetary amounts as **integer kobo**, not naira decimals. Example: ₦15,000 is stored as `1500000`. Format amounts as naira only at the presentation boundary, and avoid floating-point arithmetic for money.

Use Drizzle for schema-aware database access. Keep database access and reusable queries in the appropriate `lib/` modules. Use safe, parameterized queries and validate inputs at server boundaries.

## Core business and security rules — never break these

### 1. Membership check-in is decided on the server

A code is accepted only when the server verifies that the member has a subscription whose status is exactly `active` and whose `expires_at` is in the future at the time of the check-in.

- Do not trust a result calculated or supplied by the browser.
- Validate and normalize submitted codes on the server.
- Handle missing, invalid, inactive, and expired memberships safely.
- Do not expose unnecessary personal or payment information during a code lookup.

### 2. Only a verified Paystack webhook confirms payment

A payment counts as paid only after a Paystack webhook has been received and its signature has been verified using the correct server-side secret.

- Never mark a payment as paid from a browser callback, redirect, query parameter, or client-side state.
- Verify the webhook signature against the raw request body as required by Paystack.
- Validate the event and transaction details, including the expected reference, amount, currency, and transaction status, before applying payment effects.
- Make webhook processing idempotent so retries cannot create duplicate payment effects or subscriptions.
- Keep Paystack in **TEST mode only**. Use test keys and test cards; never use live keys.

### 3. Enforce access control on the server

Follow the role rules above for every read and write. Check authorization close to the protected operation, not only in the UI or page layout.

- Members must never read or change another member's rows.
- Front-desk users may look up codes and add check-ins only.
- Owner-only data and actions must remain owner-only.
- Logged-out users may access public routes only.
- Never treat an untrusted request body, URL parameter, hidden form field, or client-side role as proof of permission.

### 4. Only a valid check-in creates a check-in row

Insert a row into `checkins` only after the server has determined that the membership is valid under rule 1.

Invalid, expired, inactive, or missing memberships must not create a `checkins` row. Do not record an unsuccessful attempt as a successful check-in.

Where practical, perform the membership verification and check-in write in a transaction or with suitable concurrency protection so the result is consistent.

## Secrets and environment variables

- Store local secrets only in `.env.local`; configure deployment secrets through Vercel environment variables.
- Never hard-code keys, commit secrets, print them in logs, or paste them into chat.
- Ensure `.env.local` is ignored by Git. Do not expose server-only secrets through `NEXT_PUBLIC_*` variables.
- Paystack must use `sk_test_` keys and test cards only. Never configure live Paystack keys for this project.
- If a required secret is missing, fail safely and explain which environment variable name is needed without revealing its value.

## Working style and change control

1. **Make one small change at a time.**
2. Before a large change, explain the plan, likely files affected, and how it will be tested. Wait for the user's explicit **“go”** before proceeding.
3. Do not modify files, routes, or pages the user did not mention unless the requested change requires it. If extra changes are necessary, explain why and ask first when the scope is significant.
4. After each change, report:
   - what changed;
   - which files changed;
   - how to test it;
   - which checks were run and their actual results.
5. If something breaks, investigate the root cause before editing. Do not repeatedly apply patches without understanding the failure.
6. Prefer the smallest correct solution. Avoid unrelated refactors, new dependencies, or speculative features.
7. Never claim functionality is tested, secure, deployed, or complete unless the relevant evidence supports that claim.
8. If a requirement is ambiguous or a change could affect payments, authorization, member data, or production behavior, stop and ask before making assumptions.

## Design and content rules

Follow `STYLE.md` for the FitPass colors, typography, spacing, buttons, and component styling.

- Mobile-first; prioritize clear layouts on low-cost Android phones.
- Keep important text readable and actions easy to tap.
- Use realistic Naira prices and Benin City places in examples.
- Do not use lorem ipsum.
- Keep membership states and payment states clear in both text and visual presentation.
- Do not rely on color alone to communicate success, failure, or expiry.

## Project folder map

- `app/` — public, member, front-desk (`desk`), and owner pages
- `app/api/` — server route handlers, including check-in, Paystack webhook, and reminders
- `components/` — reusable UI such as `PlanCard`, `MemberCard`, and `StatusBadge`
- `lib/db.ts` — database connection and queries
- `lib/auth.ts` — authentication and role checks
- `lib/schema.ts` — database table definitions
- `STYLE.md` — visual style guide

Keep new files in the appropriate existing area. Inspect the current project structure before assuming a path or introducing a new convention.

## Definition of done

Before calling a change complete:

- [ ] The implementation stays within the agreed scope.
- [ ] Server-side authorization is enforced for protected reads and writes.
- [ ] Check-in and payment rules above remain intact.
- [ ] No secrets are committed or exposed to the client.
- [ ] The UI follows `STYLE.md` and works on mobile.
- [ ] Relevant lint/build checks have been run and their results reported.
- [ ] The user receives a concise summary and clear test instructions.
