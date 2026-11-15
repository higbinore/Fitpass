# FitPass image inventory

Review date: 2026-11-15. Inventory reflects image references found in current application source and `public/`; no database, environment, Vercel Blob listing, network fetch, or browser was used. “Photographer/license unknown” means source did not establish the license; it is not a judgment about pictured people.

## Repository assets

| Asset | Use | Source / creator / license | Size | Type / alt text |
|---|---|---|---:|---|
| `public/demo/fitpass-elite-logo.svg` | Local demo/logo media; public asset | Original FitPass demo SVG. No third-party image or brand; no third-party license applies per credits. | 475 bytes (0.46 KB) | Logo illustration; where rendered via `Image`, verify consumer alt; there is no content inventory proving every rendering. |
| `public/demo/fitpass-elite-gym-floor.svg` | Local demo gym scene | Original FitPass demo SVG. No third-party image or brand; no third-party license applies per credits. | 2,007 bytes (1.96 KB) | Gym interior illustration. |
| `public/demo/fitpass-elite-free-weights.svg` | Local demo strength area | Original FitPass demo SVG. No third-party image or brand; no third-party license applies per credits. | 2,261 bytes (2.21 KB) | Free-weights illustration. |
| `public/demo/fitpass-elite-cardio.svg` | Local demo cardio area | Original FitPass demo SVG. No third-party image or brand; no third-party license applies per credits. | 1,964 bytes (1.92 KB) | Cardio-floor illustration. |
| `public/demo/CREDITS.md` | Credits record for the four SVGs above | States that the assets are original vector illustrations, not photos, with no third-party license. | 484 bytes per prior report; current byte count not remeasured | Documentation, not a displayed image. |

## Remote and runtime-provided image sources

| Source / host | Where used | Source attribution / license | Size | Type / alt text |
|---|---|---|---|---|
| `images.unsplash.com` asset `photo-1667556205536-e5b04ee97ace` (`w=900&q=80`) | `app/admin/AdminDashboard.tsx`, desktop-only dashboard banner via CSS `background-image` | UI credits “Shalom Ejiofor / Unsplash” and links to the photo page. License/attribution terms were not independently verified; no download was made. | Remote delivered size **UNVERIFIED** | Photograph. Container has `role="img"` and an `aria-label`; credit is visible in the banner. |
| Vercel Blob URLs stored in `gyms.logo_url` | Owner/platform upload, public gym profile and admin image preview | Runtime values are database-backed and were not enumerated. Attribution/rights depend on uploader; not inspectable in a source-only review. | **UNVERIFIED** | Uploaded logo images; source code provides gym-name-based alt text on profile/admin preview. |
| Vercel Blob URLs stored in `gyms.facility_photo_urls` | Public gym profile and admin image preview | Runtime values were not enumerated. Photographer/license cannot be determined from source. | **UNVERIFIED** | Uploaded facility images; rendered profile/admin `Image` elements use generated descriptive alt text. |
| `components/GymImagePlaceholder.tsx` | Fallback when the gym has no uploaded photos | Original code-generated vector/CSS treatment; no external asset. | No image file | Decorative illustration built with CSS and Lucide icon; wrapper supplies `role="img"` and a caller-provided `aria-label`. |

## Findings and limits

- The repository's only local raster/vector media discovered under `public/` is four small SVG assets. No local photo asset was found in the scanned image extensions.
- Application upload code accepts JPEG, PNG and WebP, then normalizes with Sharp to WebP. Current code accepts a logo plus exactly two facility photos per replacement operation, limits each upload to 1.25 MB and combined inputs to 3.75 MB. This is different from the proposed future 1-logo/1-cover/10-gallery at 5 MB each.
- The application source does not reveal which user-provided images exist in a running database or Blob account. No photos were read, downloaded, judged or enumerated.
- Image presence, successful remote loading, responsive crop, contrast overlay and accessibility were not visually browser-tested. The Unsplash image's final delivered dimensions/bytes are UNVERIFIED.
- No definite missing `alt` attribute was identified in the image snippets inspected; a full rendered-page accessibility scan was not performed, so missing alt coverage remains **UNVERIFIED**.
