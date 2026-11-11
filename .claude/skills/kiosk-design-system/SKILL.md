---
name: kiosk-design-system
description: The visual language of the Qiosk self-order kiosk (colors, type scale, spacing, components, motion, iconography, bilingual copy). Use before creating or changing ANY screen, component, style or text in renderer/ so new work looks like it belongs — new screens, buttons, dialogs, banners, menu cards, payment screens, colors or animations.
---

# Qiosk design system

A warm Turkish-grill look: pomegranate red, saffron and cream, big friendly emoji
food, chunky rounded shapes. It must read from 1 m away on a standing touch screen
and feel as fast as a fast-food kiosk. Match what already exists before inventing.

Source of truth: `renderer/styles.css` (tokens in `:root`), `renderer/index.html`,
`renderer/app.js`, texts in `renderer/i18n.js` and `data/menu.json`.

## Tokens — always use the variables, never raw hex in new rules

| Token | Value | Use for |
|---|---|---|
| `--red` | #b3121b | Primary actions, prices, brand bars, selected state border |
| `--red-dark` | #7e0c12 | Pressed primary, headline on saffron |
| `--saffron` | #f4a623 | Highlights, secondary CTA, brand mark, active counts |
| `--saffron-soft` | #ffe2a8 | Selected tabs, icon halos, qty buttons, calorie chip |
| `--cream` | #fff7ec | App background |
| `--paper` | #ffffff | Cards, panel, dialogs |
| `--ink` | #2b1a12 | Text, dark surfaces (card-terminal screen) |
| `--muted` | #6b5649 | Secondary text (already tuned to pass 4.5:1 on cream) |
| `--line` | #ecdccb | Borders, dividers |
| `--green` | #23714a | Success only (paid, added) |
| `--radius` | 22px | Cards; pills use 999px; dialogs 30px; chips 16px |
| `--shadow` | 0 6px 20px rgba(60,20,0,.12) | Every raised surface |

Do not add colors casually. If a new one is truly needed, add a token to `:root`,
check contrast (≥ 4.5:1 for text, 3:1 for large text and UI shapes) and say why.

## Sizing — everything in `rem`

`html` font-size is `max(13px, 1.9vmin)`: 1rem ≈ 20px on a 1080×1920 kiosk and
≈ 41px on 4K, so the layout is identical on every screen. Rules:

- Use `rem` for sizes, spacing, radii of components. Never fixed `px` for layout.
- Exception: touch floors are in px (`min-height: 48px` etc., see the "Touch floor"
  block in styles.css) because fingers don't scale. Add new controls to that block.
- Type scale (rem): 0.75 caption · 0.85–0.9 meta · 1 body · 1.15–1.2 card title ·
  1.35–1.4 panel/section · 1.8–2 screen title · 2.4–2.6 hero · 4–6 big numbers
  (price on payment, order number). Weights: 600 labels, 700 buttons, 800 titles
  and prices, 900 hero numbers.
- Spacing steps: .4 / .6 / .8 / 1 / 1.2 / 1.6 / 2 rem. Card padding 1–1.2rem,
  screen padding 1.2–2rem.

## Components (reuse these classes)

- **Buttons**: `.btn` + `.btn-primary` (red, one per screen = the main action),
  `.btn-secondary` (saffron), `.btn-ghost` (quiet). Sizes `.small`, `.btn-large`,
  `.btn-huge`; `.btn-block` for full width. Pills only.
- **Product card** `.product-card`: emoji in a saffron halo, name, 3-line clamped
  description, "from" price in red + kcal. Badge `.in-cart` shows quantity.
- **Option chip** `.option` (+ `.selected`): meat/extras; price delta on the right,
  "MIXT/MIXED" eyebrow for mixed meats.
- **Quantity stepper** `.qty` / `.qty-sm` with round `.qty-btn`; at qty 1 the minus
  becomes 🗑 (remove).
- **Order side panel** `.order-panel`: header + count bubble, items, sticky footer
  with calories, total and the Pay button. It is the only cart — keep it visible on
  the menu screen.
- **Dialog** `.modal-backdrop` > `.modal`: slides up from the bottom in portrait
  (reachable), centered in landscape. Hero strip in saffron gradient.
- **Big choice cards** `.dining-card`, `.pay-card`: emoji, title, one-line sub.
- **Toast** `.toast`: short confirmation, green, auto-hides.
- **Promo banner** `.promo`: tall portrait only; driven by `menu.json → promo`.

## Iconography

Food and actions use emoji (🌯 🥙 🧀 🍯 🍟 🥤 💳 💵 🍽️ 🛍️ ♿). No icon fonts, no external
images (the kiosk runs offline). One emoji per item, shown large on a halo. Never
rely on an emoji alone for meaning — pair it with a word.

## Motion

Fast and purposeful: 0.08s press scale (0.97), 0.2–0.25s screen fade/slide,
0.4s "pop" for success/failure icons. Loops only for attract/waiting states
(welcome float, pulse CTA, card-tap animation, spinner). Nothing longer than
~0.4s blocks interaction. New animations need a reason a customer would notice.

## Copy (Romanian first, English second)

- Every UI string goes in `renderer/i18n.js` under **both** `ro` and `en`;
  product texts in `data/menu.json` with `ro` and `en`. No hard-coded text in JS/HTML.
- Romanian with diacritics (ă â î ș ț). Short, friendly, imperative verbs:
  "Adaugă", "Plătește", "Încearcă din nou". Tutoiement ("tu") like the rest.
- Prices always as `money()` → `26.00 lei`. Mixed meat written `Pui + Vită`.
- Romanian is usually longer — design for the Romanian length.

## Before you finish

Run the `kiosk-ui-check` skill (`npm run ui:check`) and look at the screenshots of
the screens you touched. Fix what it reports before calling the work done.
