# Qiosk — notes for Claude Code

Self-order touch kiosk (Electron) for a Turkish restaurant. Romanian first, English second.
See README.md for features, config and the order/payment file protocol.

## UI / UX work — use the project skills

- **kiosk-design-system** — colors, type, spacing, components, motion, copy. Read before
  changing anything in `renderer/` or the texts in `data/menu.json`.
- **kiosk-ux-rules** — standing-kiosk UX rules (reach zones, 48px touch, ♿ mode, flow,
  payment safety). Read before changing a flow or layout.
- **kiosk-ui-check** — run `npm run ui:check` after every UI change and look at the
  screenshots in `ui-check/`. UI work is not done until the report is clean.

## Commands

- `npm test` — pricing, order files, payment drivers
- `npm run ui:check` — UI audit at all kiosk sizes (on Linux without display:
  `xvfb-run -a -s "-screen 0 3840x3840x24" npm run ui:check`)
- `npm run dev -- --size=1080x1920` — run in a window at a kiosk resolution

## Don't break

- Totals are computed in `main.js` from `data/menu.json`, never trusted from the UI.
- Products file is written only after payment approval / pay-at-counter.
- Every UI string exists in both `ro` and `en`.
