# FitPass actual page sitemap

Review date: 2026-11-15. Routes below were enumerated from App Router `page.tsx` files. Role protection is described from page source; an API's separate guard is still required and is not implied by a page guard.

## Public website

| Route | Source | Access / behavior |
|---|---|---|
| `/` | `app/page.tsx` | Public landing page; initial-gym content depends on server configuration and data. |
| `/gyms` | `app/gyms/page.tsx`, `app/gyms/GymDirectory.tsx` | Public gym directory and search/discovery. |
| `/gyms/[gymId]` | `app/gyms/[gymId]/page.tsx` | Public profile for an eligible/published gym, including available plan/content data. |
| `/gyms/[gymId]/join` | `app/gyms/[gymId]/join/page.tsx`, `JoinGym.tsx` | Public route shell, but join/purchase requires verified authenticated member workflow; checkout APIs decide authorization and payment. |
| `/plans` | `app/plans/page.tsx` | Public legacy/alternate plans entry route. Exact redirect/alias behavior should be confirmed in browser; source exists. |
| `/pricing` | `app/pricing/page.tsx`, `app/PublicPricing.tsx` | Public FitPass SaaS package comparison. |
| `/apply` | `app/apply/page.tsx` | Public gym application; application remains subject to platform review. |
| `/about` | `app/about/page.tsx` | Public informational page. |
| `/features` | `app/features/page.tsx` | Public feature page. |
| `/contact` | `app/contact/page.tsx` | Public contact page. |

**Blueprint routes not found:** `/terms`, `/privacy`.

## Authentication and account lifecycle

| Route | Source | Access / behavior |
|---|---|---|
| `/sign-in` | `app/sign-in/page.tsx`, `app/AuthForm.tsx` | Public Better Auth sign-in entry. Workspace role is resolved server-side after authentication. |
| `/sign-up` | `app/sign-up/page.tsx`, `app/AuthForm.tsx` | Public account signup; source auth config does not expose a client role selector. Gym access is separate. |
| `/forgot-password` | `app/forgot-password/page.tsx`, `app/PasswordResetRequestForm.tsx` | Public reset request. Email delivery requires configured provider; not exercised here. |
| `/reset-password` | `app/reset-password/page.tsx`, `app/ResetPasswordForm.tsx` | Token-based reset UI. |
| `/invitations/accept` | `app/invitations/accept/page.tsx` | Invitation acceptance UI; backend must verify token, expiry and matching identity. |
| `/platform/login` | `app/platform/login/page.tsx` | Dedicated platform-admin login route. Server workspace permission remains decisive. |
| `/platform/setup` | `app/platform/setup/page.tsx` | Initial admin setup UI exists; `lib/platform-setup-policy.ts` disables public setup in production and permits a development-only bootstrap. |
| `/owner/login` | `app/owner/login/page.tsx` | Dedicated owner login. |
| `/desk/login` | `app/desk/login/page.tsx` | Dedicated desk login. |
| `/member/login` | `app/member/login/page.tsx` | Dedicated member login. |
| `/dashboard` | `app/dashboard/page.tsx` | Authenticated workspace hub; requires a session and resolves platform/gym grants from the server. |

## Authenticated workspaces

| Route | Source | Access / behavior |
|---|---|---|
| `/admin` | `app/admin/page.tsx`, `AdminDashboard.tsx` | `requirePlatformAdmin()` page guard; platform-wide control center. Underlying APIs need their own guard. |
| `/gyms/[gymId]/owner` | `app/gyms/[gymId]/owner/page.tsx`, `OwnerDashboard.tsx` | `requireGymOwner(gymId)` guard; owner workspace. Active-gym rules apply to writes. |
| `/gyms/[gymId]/desk` | `app/gyms/[gymId]/desk/page.tsx`, `DeskCheckin.tsx` | `requireActiveGymDeskStaff(gymId)` guard; staff operations. |
| `/gyms/[gymId]/member` | `app/gyms/[gymId]/member/page.tsx`, `MemberRecords.tsx` | `requireGymMember(gymId)` guard; member-only records and profile. |

## Payment return and demo flows

| Route | Source | Access / behavior |
|---|---|---|
| `/payment/complete` | `app/payment/complete/page.tsx` | Public return/status UI; a redirect alone does not confirm a payment. |
| `/payment/demo` | `app/payment/demo/page.tsx` | Explicitly labelled demo payment simulation; it is not a Paystack settlement. |

## Coverage and caveats

- All listed paths correspond to source files, not evidence that the live deployment is operational.
- No browser run was performed for this review. Runtime availability, actual data, error screens and responsive rendering are UNVERIFIED.
- The source exposes APIs beyond this page sitemap, including `/api/platform/*`, `/api/gyms/[gymId]/*`, Better Auth and payment webhooks. Each protected API must be reviewed independently; route-page guards do not secure API calls automatically.
- Blueprint describes a “master admin” area; source route label/path is `/admin`, with dedicated login at `/platform/login`.
