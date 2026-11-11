# Qiosk — self-order kiosk for a Turkish restaurant

A touch-screen ordering kiosk, like the big screens at McDonald's, for a Turkish
restaurant: shawarma, cheesy shawarma, kebab, Cheesy Box, baklava, sides and drinks.
It runs as a desktop app (Electron) on Windows, Linux or macOS and is in Romanian
and English.

## What the customer sees

1. **Welcome screen**: tap to start, pick 🇷🇴 Română or 🇬🇧 English.
2. **Eat in / Take away**.
3. **Menu**: categories on the left, products with price, calories and a short
   description, and a **side panel on the right** showing the order as it's built:
   each item with its meat and extras, + / − buttons, edit, calories and the total.
4. **Product screen**: choose the meat (**Pui / Chicken, Vită / Beef, Berbecuț / Lamb**
   or a mix: **Pui + Vită, Pui + Berbecuț, Vită + Berbecuț**), extras (extra cheese,
   no onion...), the quantity, nutrition values and allergens.
5. **Pay**: choose **Card** (at the terminal: contactless, Apple Pay, Google Pay) or
   **Pay at the counter**.
6. **Card terminal screen**: "Tap, insert or swipe your card", while the kiosk waits
   for the terminal. If the card is declined, the customer can try again, pay at the
   counter instead, or go back to the order.
7. **Confirmation**: order number and the amount paid (or to pay at the counter).

If nobody touches the screen for 90 seconds, it asks "Are you still there?" and then
goes back to the start.

## The two files for every order

| File | Contents | Written when |
|---|---|---|
| `order-0001-total.txt` | Only the amount to pay, e.g. `59.00` | The customer chooses how to pay |
| `order-0001-products.txt` | One line per product, e.g. `1 x Shawarma (Chicken)` | The card payment is **approved**, or the customer chose **pay at the counter** |

Example `order-0001-products.txt`:

```
2 x Shawarma (Chicken)
1 x Cheesy Shawarma (Chicken + Beef) + Extra cheese
1 x Pistachio Baklava (4 pcs)
```

- The **total file is the payment request**: the card terminal charges this amount.
- The **products file means "make this order"**. An unpaid card order never reaches
  the kitchen. If the customer cancels, the total file is deleted again.
- The order number goes up by one each time (`0001`, `0002`, ...). A cancelled
  order's number is not reused.
- The total is calculated by the app from `menu.json`, not taken from the screen.
- Each file is written in full before it shows up, so a program watching the folder
  never reads half a file.

## Card terminal

Set in `config.json` under `"payment"`:

| Setting | Meaning |
|---|---|
| `card` / `cash` | Which payment options to offer. If only one is on, that screen is skipped. |
| `terminal` | `"simulator"` (no hardware, for testing) or `"file"` (real terminal, see below) |
| `timeoutSeconds` | How long to wait for the terminal before giving up (`file` mode) |
| `simulatorDelaySeconds` | How long the simulator "takes" to pay |
| `simulatorOutcome` | `"approve"`, `"decline"` or `"random"`, to test both cases |

**`"file"` mode** works with any terminal that has a small bridge program (most
terminal providers or POS integrators can supply one):

1. The kiosk writes `order-0001-total.txt` (e.g. `59.00`).
2. The bridge sends that amount to the terminal and the customer pays.
3. The bridge writes `order-0001-payment.txt` into the same folder:
   - `APPROVED` on the first line if the payment succeeded, or
   - `DECLINED`, optionally followed by a reason on the second line
     (e.g. `Insufficient funds`), which is shown on the screen.
4. If the customer presses **Try again**, the kiosk deletes the old
   `payment.txt` and writes the total file again, as a new request.

If your terminal has its own SDK or API instead, you can add a driver in
`src/payment.js`. A driver only needs one function, `charge(order)`, that returns
"approved" or "declined".

## Run it

You need [Node.js](https://nodejs.org) 18 or newer.

```bash
npm install
npm start        # full-screen kiosk mode
npm run dev      # in a normal window, for testing
npm test         # checks prices, order files and the terminal drivers
```

To leave kiosk mode press **Ctrl + Shift + Q**.

To build an installer (`.exe` on Windows, AppImage on Linux, `.dmg` on Mac):

```bash
npm run dist
```

## Change prices, products or settings

Everything you edit is in two files. You don't need to change any code.

**`data/menu.json`**: the products, prices (in lei), descriptions (RO + EN),
nutrition and allergens. You can also change the meat choices and extras and their
surcharges (for example, lamb is +7 lei).
Set `"meatChoice": true` on a product to ask for the meat, `"extras": true` to offer
extras and `"popular": true` to show it on the first page.

**`config.json`**:

| Setting | Meaning |
|---|---|
| `restaurantName` | Name shown on the screen |
| `ordersDir` | Folder for the order files. It can be a full path, e.g. `C:\\POS\\orders` |
| `fileLanguage` | Language of the product names in the files: `"en"` or `"ro"` |
| `currency` | Shown after prices (`lei`) |
| `kiosk` | `true` = full screen with no way out except Ctrl+Shift+Q |
| `idleTimeoutSeconds` | How long without a touch before the kiosk resets |

In an installed app you can put your own `config.json` or `menu.json` next to the
`.exe`, and it will be used instead of the built-in one. In the installed app,
relative `ordersDir` paths go to `Documents/Qiosk/`.

## Project layout

```
main.js             Electron window, kiosk mode, order + payment flow
preload.js          Safe bridge between the screen and the computer
src/pricing.js      Price, nutrition and product name logic (shared by screen + main)
src/orderWriter.js  Writes the two files for each order
src/payment.js      Card terminal drivers (simulator, file handshake)
renderer/           The kiosk screen (HTML, CSS, JS, translations)
data/menu.json      The menu
config.json         Settings
test/               Automated tests
```
