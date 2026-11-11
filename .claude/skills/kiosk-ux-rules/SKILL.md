---
name: kiosk-ux-rules
description: UX rules for the Qiosk standing touch-screen kiosk — reach zones, touch targets, accessibility mode, flow, feedback, errors, idle reset, bilingual parity and payment safety. Use when designing or changing any user flow, screen layout, interaction or ordering/payment behaviour, and when reviewing UX of the kiosk.
---

# Qiosk UX rules

Customers are standing, hungry, often in a queue, sometimes with kids, a
wheelchair, gloves, or no Romanian. They use the kiosk once, without training.
Every rule below exists for that person. When a change breaks a rule, say so
and explain why it is worth it — don't break them silently.

## 1. Reach and screen zones (standing portrait screens)

- Assume a tall portrait screen (1080×1920 or 4K, 32–55"). The **top ~25% is above
  comfortable reach** — use it for brand and promo (`.promo`), never for anything
  required to finish an order.
- Primary actions live in the **lower half**: Pay button in the panel footer,
  "Add" in the dialog footer, payment choices mid-screen.
- Dialogs open from the **bottom** in portrait.
- **Accessibility mode (♿ button, bottom-left) must keep working on every screen**:
  it moves the whole UI into the lower ~55%. Any new screen must still fit and be
  usable in that height (check with `npm run ui:check`, which renders it).
- The ♿ button must stay visible and never cover a control (it is hidden while
  the product dialog is open for that reason).

## 2. Touch

- Minimum target **48×48 px** (enforced in CSS "Touch floor" and by ui-check);
  prefer ≥ 56 px for frequent actions. ≥ 8 px between neighbouring targets.
- No hover-only affordances, no long-press, no double-tap, no swipe-only actions,
  no tiny "×" as the only way out. Every tap gives visible feedback within 100 ms
  (`:active` scale/colour).
- Right-click/context menu is disabled; keep it that way.

## 3. Flow

Welcome → (language) → Eat in / Take away → Menu + side panel → Product dialog →
Pay → Card terminal or Counter → Order number. Keep it this short.

- **One primary (red) action per screen.** Secondary actions are ghost/saffron.
- Show the **running total and cart at all times** on the menu (side panel).
  Never hide the price of a choice: options show their price delta, the Add button
  shows the line total.
- Categories ≤ 7 visible items (Hick's law); "Popular" first.
- Defaults reduce taps: chicken pre-selected, qty 1, same item twice merges.
- Every step has an obvious way back (Back / Cancel), and going back **keeps the
  cart**. Only "Cancel" on the menu and the idle timeout clear it.
- Language can be switched on any menu screen without losing anything.

## 4. Feedback and errors

- Confirm additions (toast + panel flash + count badge).
- Errors say **what happened and what to do next**, in the customer's language, with
  a way forward (e.g. card declined → Try again / Pay at the counter / Back).
- Never show stack traces, codes or English-only technical text to customers.
- Waiting states (card terminal) show motion + text + a cancel button.

## 5. Payment safety (do not regress)

- The total is computed in the main process from `menu.json`, never trusted from UI.
- `order-NNNN-total.txt` = payment request; `order-NNNN-products.txt` is written only
  after card approval or "pay at the counter". Cancelling removes the total file.
- Disable/ignore double taps on pay buttons (`state.busy`); idle reset never fires
  while on the card screen.
- After success, show the order number big and return to welcome automatically.

## 6. Inclusive by default

- Text contrast ≥ 4.5:1 (≥ 3:1 for ≥ 24 px or bold ≥ 18.66 px) — ui-check measures it.
- Information never by colour alone (selected options also get a ✓/border; prices
  have the word "lei").
- Allergens and calories visible before adding (dialog) and kcal total in panel.
- Plain words; Romanian first, English available; both complete.
- Respect motion sensitivity: loops only for attract/waiting, nothing flashing.

## 7. Session hygiene

- Idle (default 90 s, `idleTimeoutSeconds`) → "Are you still there?" with a 15 s
  countdown → full reset: empty cart, Romanian, accessibility off, open order
  cancelled. New features must also reset in `resetAll()`.

## Checklist for any UX change

1. Can a wheelchair user finish it in ♿ mode?
2. Is the main action in the lower half and ≥ 48 px?
3. Is the price/total always visible before committing?
4. Is there a way back that keeps the cart?
5. Are both RO and EN texts added?
6. Does `npm run ui:check` pass, and do the screenshots look right?
