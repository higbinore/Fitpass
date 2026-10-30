# FitPass Style Guide (P04)
**Product:** FitPass — gym membership app  
**Market:** Benin City, Nigeria  
**Design feeling:** Energetic, trusted, clear  
**Primary context:** Mobile-first; fast to scan and comfortable to use on low-cost Android phones.

---

## 1. Design principles

- **Readable at a glance:** Keep labels direct, use clear hierarchy, and avoid dense screens.
- **Mobile first:** Prioritize narrow screens, large tap targets, and layouts that work on modest devices.
- **Consistent:** Reuse the same colors, typography, spacing, radii, and button styles across every page.
- **Trustworthy:** Make membership status, pricing, and check-in outcomes unmistakable.
- **Realistic content:** Use Naira (₦) prices and real Benin City places where examples are needed. Do not use lorem ipsum.

## 2. Colour palette

| Token | Hex | Use |
|---|---|---|
| Main green | `#0F7B4F` | Primary buttons, headings, active badges, key actions |
| Accent orange | `#F97316` | Highlights, large calls to action, and icons |
| Main text | `#111827` | Body copy and headings on light backgrounds |
| Muted text | `#6B7280` | Supporting labels and secondary information |
| Background | `#F9FAFB` | App background and light page surfaces |
| Success green | `#16A34A` | Success states and valid membership |
| Danger red | `#DC2626` | Errors, expired membership, and destructive actions |
| White | `#FFFFFF` | Cards and text on green buttons |

### Contrast rules
- Use **white text on the main green** for primary buttons.
- Use **dark text (`#111827`) on orange**. Avoid small white text on orange because contrast is weaker.
- Keep body text high contrast. Do not communicate status using color alone; include clear text and, where useful, an icon.
- Verify final color combinations with a contrast checker before release.

## 3. Typography

Use Google Fonts:
- **Headings:** Poppins Bold
- **Body and controls:** Inter Regular

| Style | Size | Guidance |
|---|---:|---|
| H1 | 32 px; 28 px on phones | Main page title |
| H2 | 24 px | Section headings |
| Body | 16 px minimum | Main content, forms, and buttons |
| Small | 14 px | Secondary metadata only; use muted text |

Use a clear hierarchy and short, plain-language labels. Avoid using small text for essential prices, membership dates, errors, or check-in results.

## 4. Spacing and shape

Use this spacing scale consistently: **8, 16, 24, 32, 48 px**.

- Card and button corner radius: **12 px**
- Keep related information grouped and separate sections with consistent spacing.
- Provide comfortable touch targets; aim for at least **44 × 44 px** for interactive controls.
- Avoid crowded layouts and unnecessary decoration.

## 5. Buttons

### Primary
- Background: `#0F7B4F`
- Text: white (`#FFFFFF`), bold
- Use for the main action on a screen.

### Secondary
- Background: white (`#FFFFFF`)
- Border and text: `#0F7B4F`
- Use for lower-priority actions.

### Accent
- Background: `#F97316`
- Text: dark (`#111827`)
- Use sparingly for prominent calls to action such as “Join now”.

### Danger
- Background: `#DC2626`
- Text: white (`#FFFFFF`)
- Use for cancel, expired, or destructive actions.

All buttons should have clear action labels, consistent 12 px corners, visible focus states, and disabled/loading states where relevant. Do not rely on color alone to explain what a button does.

## 6. Cards, forms, and status

- Use `#F9FAFB` as the overall background and white surfaces for cards when needed.
- Keep card corners at 12 px and use the spacing scale above.
- Form labels must remain visible; placeholders are not a substitute for labels.
- Show validation messages beside the relevant field in clear language.
- Display membership status with both a text label and an appropriate visual treatment.
- Make prices, renewal dates, and membership duration easy to scan.

## 7. Critical screen: check-in result

The check-in result is the most important screen in FitPass. It must be understandable from across a desk.

### Valid membership
- Full-screen green treatment.
- Large, high-contrast text: **“Welcome, [name]”**.
- Clearly show **days remaining**.
- Use text at least **28 px** for the main result.
- Make the successful state unmistakable without relying only on an icon.

### Expired membership
- Full-screen red treatment.
- Large, high-contrast text: **“Expired. Ask them to renew.”**
- Use text at least **28 px** for the main result.
- Make the expired state unmistakable and avoid presenting it as a successful check-in.

Ensure both states are readable on small screens, in bright environments, and at a quick glance.

## 8. Implementation guidance

- Use **Tailwind CSS** and **shadcn/ui**.
- Load Poppins and Inter from Google Fonts, with sensible system fallbacks.
- Build responsive layouts for small Android screens first, then scale up.
- Reuse design tokens rather than hard-coding slightly different colors or spacing values.
- Include loading, empty, error, success, and disabled states for relevant screens.
- Use realistic Naira pricing and Benin City place names in sample data. Do not use lorem ipsum.
- Test legibility, contrast, keyboard/focus behavior where applicable, and touch targets before release.

## 9. Paste-ready OpenCode prompt

Copy this block to the top of each FitPass build prompt:

```text
STYLE GUIDE for FitPass (gym membership app, Benin City, Nigeria)
Feeling: energetic, trusted, clear. Mobile first, built for cheap Android phones.
Colours: main #0F7B4F (buttons, headings, active badges), accent #F97316 (large buttons and icons only; use dark text on orange), text #111827, muted #6B7280, background #F9FAFB, success #16A34A, danger #DC2626.
Fonts: Poppins Bold for headings and Inter Regular for body (Google Fonts), with system fallbacks.
Sizes: H1 32px (28px on phones), H2 24px, body 16px minimum, small 14px muted.
Spacing: 8, 16, 24, 32, 48. Corner radius 12px on cards and buttons.
Buttons: primary = green background with white bold text; secondary = white background with green border and text; danger = red background with white text; orange accent uses dark text.
Check-in result screen: full-screen green for valid membership or red for expired membership; main result text at least 28px. Valid: “Welcome, [name]” plus days left. Expired: “Expired. Ask them to renew.”
Use Tailwind CSS and shadcn/ui. Use realistic Naira prices and Benin City places. No lorem ipsum. Keep contrast readable, layouts mobile-first, and status clear in both text and color.
```

---

## 10. Quick quality checklist

- [ ] Main green, orange accent, text, muted, background, success, and danger colors match the tokens.
- [ ] Poppins Bold and Inter Regular are applied consistently.
- [ ] Body text is at least 16 px; small metadata is 14 px and muted.
- [ ] Cards and buttons use 12 px corners.
- [ ] Spacing follows 8 / 16 / 24 / 32 / 48 px.
- [ ] Buttons have clear labels and sufficient touch area.
- [ ] Check-in valid and expired screens use the specified full-screen treatments and 28 px minimum result text.
- [ ] Prices use ₦ and examples are grounded in Benin City.
- [ ] No lorem ipsum appears in the interface.
