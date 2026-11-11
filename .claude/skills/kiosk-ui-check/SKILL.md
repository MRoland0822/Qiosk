---
name: kiosk-ui-check
description: Render and audit the Qiosk kiosk UI in the real Electron app at all kiosk screen sizes (Full HD and 4K portrait, small portrait, 5:4, landscape), in Romanian, English and accessibility mode; reports touch targets under 48px, low contrast, overflowing text, missing translations and JS errors, and saves screenshots. Use after ANY change to renderer/, data/menu.json texts or styles, before committing UI work, or when asked to review/test/screenshot the kiosk UI.
---

# Kiosk UI check

`scripts/ui-check.js` opens the real app (Electron + playwright-core, no browser
download), walks Welcome → Product dialog → Menu with side panel → Payment → Card
terminal, and audits each screen.

## Run it

```bash
npm run ui:check                          # all sizes (~1 min)
npm run ui:check -- --sizes=1080x1920     # just one size while iterating
npm run ui:check -- --min-target=56       # stricter touch targets
```

On Linux without a display (cloud/CI), wrap it — the big virtual screen lets 4K
render 1:1 instead of zoomed:

```bash
xvfb-run -a -s "-screen 0 3840x3840x24" npm run ui:check
```

If `node_modules` is missing, run `npm install` first. Orders made during the
check go to a temp folder (`QIOSK_ORDERS_DIR`), not to `orders/`.

## Read the results

- `ui-check/report.md` — per size/language/mode, ✅ or ❌ per screen with the exact
  problem (`touch target 36×36px < 48px: "+"`, `low contrast 4.36:1 …`,
  `text overflows its box …`, missing `ro`/`en` texts).
- `ui-check/<W>x<H>-<lang>[-access]-<n>-<screen>.png` — **open and look at** the
  screenshots for the screens you changed (Read the PNG). The script can't judge
  taste: check alignment, hierarchy, crowding, truncation, that the main action is
  obvious and in the lower half, and that ♿ mode still fits.
- Exit code 0 = clean, 1 = problems found, 2 = the script crashed.

## Fix, don't silence

- Touch target too small → enlarge the control, or add its class to the
  "Touch floor" block in `renderer/styles.css`. Don't lower `--min-target`.
- Low contrast → use a darker token (`--ink`, `--muted`, `--red-dark`) or a darker
  background; if a token itself fails, adjust it in `:root` and re-run.
- Overflow → let text wrap, shorten copy (both languages), or give the box room.
  Decorative pseudo-elements that stick out also count; draw them as backgrounds.
- Missing text → add it to `renderer/i18n.js` or `data/menu.json` in both languages.
- If a new screen should be audited, add its steps to the walk in
  `scripts/ui-check.js` (the `screens.push(await shot(...))` sequence).

Iterate until the report is clean, then share 2–3 key screenshots with the user.
