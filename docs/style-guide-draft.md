# FitPass style guide draft — extracted from current source

Review date: 2026-11-15. This records source-defined styles; it is not a redesign proposal or a claim of browser verification.

## Current visual system

`STYLE.md` defines the live intended identity as deep green with orange accents on a light grey-white background. `app/globals.css` implements semantic Tailwind v4 CSS variables and `@theme inline` mappings:

| Semantic use | CSS token | Current value | Observed use |
|---|---|---|---|
| Page background | `--background` | `#f9fafb` | body and page background |
| Primary text | `--foreground` | `#111827` | headings/body |
| Card/popover | `--card`, `--popover` | `#ffffff` | surfaces |
| Primary/action | `--primary` | `#0f7b4f` | primary buttons, focus ring, brand |
| Primary foreground | `--primary-foreground` | `#ffffff` | text on primary |
| Secondary | `--secondary` | `#ffffff` | secondary surface |
| Secondary foreground | `--secondary-foreground` | `#0f7b4f` | secondary action text |
| Muted surface | `--muted` | `#f3f4f6` | muted UI |
| Muted text | `--muted-foreground` | `#6b7280` | labels/secondary copy |
| Accent | `--accent` | `#f97316` | CTA/highlight |
| Accent foreground | `--accent-foreground` | `#111827` | dark text on orange |
| Destructive/danger | `--destructive`, `--danger` | `#dc2626` | error/destructive state |
| Success | `--success` | `#16a34a` | success state |
| Border/input | `--border`, `--input` | `#e5e7eb` | control and card boundaries |
| Focus | `--ring` | `#0f7b4f` | focus indicator |

`STYLE.md` names the same green, orange, foreground, muted, background, success, danger and white colors. The stylesheet has one light `:root` token set. It declares a `.dark` Tailwind variant but no dark token set or theme toggle was found. Therefore dark-mode functionality is not established; most pages use light-surface utility classes directly.

## Typography

`app/layout.tsx` loads Inter and Poppins through `next/font/google`, with `display: "swap"`, CSS variables `--font-inter` and `--font-poppins`, and Latin subsets. Inter is mapped to Tailwind `font-sans`; Poppins to `font-heading`. Poppins weights 600 and 700 are loaded. The stylesheet applies Poppins bold to `h1`–`h4`; components also use `font-heading` explicitly. `STYLE.md` specifies H1 32px (28px mobile), H2 24px, body 16px minimum, small 14px.

The application uses Tailwind size utilities (`text-sm`, `text-xs`, responsive `text-2xl`/`text-3xl`, etc.); there is no single explicit global type scale enforcing the style guide. Important dashboard metadata frequently uses 10–14px utilities, so the style guide's minimum-body rule is not universally enforced by tokens.

## Shape, spacing and components

- `--radius: 0.75rem` (12px) is the base; Tailwind theme derives `sm`, `md`, `lg`, `xl` radii from it.
- Spacing is primarily Tailwind's spacing scale plus responsive utilities. `STYLE.md` prescribes 8/16/24/32/48px, but there is no dedicated project spacing-token set.
- `components/ui/` contains shadcn-generated primitives. `components/ui/card.tsx` uses tokenized card surfaces and internal spacing; `components/ui/button.tsx` provides variants. The app also uses bespoke Tailwind button/card markup throughout route components, so not every control is guaranteed to use shared variants.
- Forms generally use visible labels, native controls and borders; validation and errors are handled by feature components/APIs. There is no single global form-control component contract.
- Tables and responsive overflow patterns are implemented within dashboards/reports, not one shared table system.
- Navigation is split between `app/PublicSiteHeader.tsx`, workspace-specific layouts/headers, and platform dashboard navigation; responsive behavior is therefore not centralized.
- Lucide React icons are the primary icon system. Charts in the platform dashboard are hand-built SVG; no charting package is used.

## Responsive behavior

The code uses Tailwind's default breakpoints (`sm` 640px, `md` 768px, `lg` 1024px, `xl` 1280px, `2xl` 1536px) and many responsive grid/flex utilities. Mobile-first layouts are visible in public, owner, desk and member source. There is no custom breakpoint configuration in Tailwind v4 CSS. Source inspection does not prove absence of overflow at every viewport; no visual browser or Lighthouse check was run for this review.

## Logo and image usage

There is an original local SVG demo mark at `public/demo/fitpass-elite-logo.svg`. Product wordmarks are often text (`Fit<span>Pass</span>`) instead of an image logo. Gym logos/facility images are database-backed URLs and uploaded through Vercel Blob routes; the public gym profile supplies descriptive alt text. The admin dashboard has a desktop-only remote Unsplash background image with a separate photographer credit. More details are in `docs/image-inventory.md`.

## Inconsistencies and hard-coded styling outside the semantic token block

The following literal hexadecimal colors were found in `app`, `components` and `public` outside the central CSS tokens (duplicates intentionally listed once here):

| File | Values / use |
|---|---|
| `app/page.tsx` | `#f4f5ef` — landing page and loading background. |
| `app/layout.tsx` | `#0F7B4F` — Next.js browser theme-color metadata, duplicating the primary token. |
| `app/admin/AdminDashboard.tsx` | `#e2e8f0`, `#65a30d`, `#334155` chart SVG strokes; `#111827` chart/banner overlay; white SVG point strokes. |
| `components/GymImagePlaceholder.tsx` | `#eaf3e8`, `#dce9dc`, `#c8ddcf` placeholder gradient. |
| `public/demo/fitpass-elite-cardio.svg` | `#0e211f`, `#0f7b4f`, `#152b2b`, `#203b32`, `#235b48`, `#42856c`, `#515f50`, `#56675c`, `#668072`, `#6ba88c`, `#75b294`, `#b6f34a`, `#bbc1a9`, `#bde6d2`, `#dce3d2`, `#e2e8d7`, `#eff0dc`, `#f7f7f0`. |
| `public/demo/fitpass-elite-free-weights.svg` | `#121a18`, `#203b32`, `#303a35`, `#668072`, `#75806a`, `#b6f34a`, `#dbe2cf`, `#e4e8d9`, `#eff0dc`, `#0f7b4f`, `#f7f7f0`. |
| `public/demo/fitpass-elite-gym-floor.svg` | `#152b2b`, `#183a31`, `#294d40`, `#515f50`, `#6ba88c`, `#b6f34a`, `#c6eadb`, `#d4d9c7`, `#e6eadb`, `#eff0dc`, `#0f7b4f`, `#f7f7f0`. |
| `public/demo/fitpass-elite-logo.svg` | `#0f7b4f`, `#f7f7f0`, `#b6f34a`. |

The same repeated values (`#ffffff`, green, slate and red) also appear as Tailwind named palette utilities and cannot be captured by a search for literal hex codes. Landing-page background differs from the semantic `--background`. Charts, placeholder and demo SVG palette each have their own literals. Consequently changing the semantic primary token alone will not recolor the whole brand.

**Font literals:** `app/globals.css` maps `--font-sans` and `--font-heading`; SVG text uses `Arial,sans-serif`. Tailwind utility classes select sizes/weights across components. No extra CSS `font-family` override was found in the scanned application source.

## Evidence limits

No live screenshot, contrast audit, font-network check, dark-mode browser test, keyboard audit or viewport run was performed. This extraction describes code and `STYLE.md`, not observed production rendering.
