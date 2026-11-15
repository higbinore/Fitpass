# FitPass tooling and dependency audit

Audit date: 2026-11-15. Versions below are from the current checkout's `package.json` and installed `node_modules`; this is not a complete transitive software-bill-of-materials audit.

## Runtime and package manager

| Tool | Version / source |
|---|---|
| Node.js active in this review shell | `v26.13.0` (`node --version`) |
| npm active in this review shell | `11.20.0` (`npm --version`) |
| Package manager / lockfile | npm, `package-lock.json`, lockfileVersion 3 |
| Next.js | `16.4.3` |
| React / React DOM | `19.3.0` |
| TypeScript installed | `5.9.3` |
| Tailwind CSS installed | `4.3.3` |

`npm run build` was not run, as explicitly waived. `npm test`, lint and TypeScript were not rerun in this documentation audit.

## Direct UI, image and application dependencies

| Dependency | Installed version | Declared license | Purpose / notes |
|---|---:|---|---|
| `tailwindcss` | 4.3.3 | MIT | Utility styling and CSS-first theme. |
| `@tailwindcss/turbopack` | 4.3.3 | MIT | Tailwind integration for the Next/Turbopack build. |
| `shadcn` | 4.23.0 | MIT | CLI/component tooling; actual component files are in `components/ui`. |
| `radix-ui` | 1.8.1 | MIT | Accessible primitive components. |
| `lucide-react` | 1.64.0 | ISC | Icons. |
| `class-variance-authority` | 0.7.1 | Apache-2.0 | Component variant classes. |
| `cn` | 0.5.0 | MIT | Class-name utility. |
| `tw-animate-css` | 1.4.0 | MIT | CSS animation utilities. |
| `sharp` | 0.35.5 | Apache-2.0 | Server-side image validation/normalization to WebP. |
| `zod` | 4.6.7 | MIT | Boundary validation. |
| `next` | 16.4.3 | MIT | App framework and Next font loader. |
| `react`, `react-dom` | 19.3.0 | MIT | UI runtime. |

## Server, database and development dependencies

| Dependency | Installed version | Declared license | Purpose / notes |
|---|---:|---|---|
| `better-auth` | 1.7.14 | MIT | Authentication. |
| `@neondatabase/serverless` | 1.2.0 | MIT | Hosted PostgreSQL driver. |
| `pg` | 8.23.1 | MIT | Local PostgreSQL driver and migration-runner fallback support. |
| `drizzle-orm` | 0.45.4 | Apache-2.0 | Typed database access. |
| `drizzle-kit` | 0.31.11 | MIT | Schema/migration tooling; Windows failure is recorded in the fit-gap report. |
| `@vercel/blob` | 2.8.2 | Apache-2.0 | Gym image storage. |
| `tsx` | 4.23.15 | MIT | TypeScript script runner; not used by the updated standard `npm test` command. |
| `typescript` | 5.9.3 | Apache-2.0 | Type checking/compiler. |
| `eslint` | 9.39.5 | MIT | Linting. |
| `eslint-config-next` | 16.4.3 | MIT | Next lint rules. |
| `@types/node` | 20.19.43 | MIT | Node types. |
| `@types/pg` | 8.23.1 | MIT | PostgreSQL types. |
| `@types/react`, `@types/react-dom` | 19.3.0 | MIT | React types. |

All listed direct dependencies declare MIT, ISC or Apache-2.0 licenses; no direct GPL/AGPL package was identified in this set. Transitive dependency licenses and runtime OS/native-library licenses are **UNVERIFIED**. Google Fonts' licensing and the remote Unsplash asset license were not independently checked. `resend`, `xlsx`/ExcelJS, PDF libraries, chart libraries and an animation runtime such as Framer Motion are not declared direct dependencies. Email code uses a server-side HTTP integration rather than the Resend package. `shadcn/ui` is used as component source/primitives, not as a single runtime UI package. `next/font/google` is used in `app/layout.tsx`.

## Client bundle and build notes

- Public pages use server components where possible, with client islands such as navigation, gym search, auth forms and join interactions. Their production bundle sizes were not measured.
- Platform/owner/member/desk dashboards are substantial interactive client components and include Lucide icons. Public routes do not import a large charting package.
- The platform charts are custom inline SVG; there is no chart-library dependency.
- `sharp` is used on server upload paths and should remain server-only.
- The browser-loaded `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` is intentionally a public Maps Embed key and must be restricted by Google HTTP referrer/API settings; it is not a server secret. No actual key/configuration was inspected.
- No Lighthouse, bundle analyzer or source-map bundle report was run. Public performance and total client JavaScript are UNVERIFIED.
