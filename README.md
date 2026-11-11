# Qiosk — self-order kiosk for a Turkish restaurant

A touch-screen ordering kiosk, like the big screens at McDonald's, for a Turkish
restaurant: shawarma, cheesy shawarma, kebab, Cheesy Box, baklava, sides and drinks.
It runs as a desktop app (Electron) on Windows, Linux or macOS and is in Romanian
and English.

## What the customer sees

1. **Welcome screen**: tap to start, pick 🇷🇴 Română or 🇬🇧 English.
2. **Eat in / Take away**.
3. **Menu**: categories on the left, products with price, calories and a short description.
4. **Product screen**: choose the meat (**Pui / Chicken, Vită / Beef, Berbecuț / Lamb**
   or a mix: **Pui + Vită, Pui + Berbecuț, Vită + Berbecuț**), extras (extra cheese,
   no onion...), the quantity, nutrition values and allergens.
5. **Review order**: change quantities, edit or remove items, see the total.
6. **Confirmation**: order number and the amount to pay.

If nobody touches the screen for 90 seconds, it asks "Are you still there?" and then
goes back to the start.

## The two files for every order

When the customer presses **Place order & pay**, two files are written to the
`orders/` folder:

| File | Contents |
|---|---|
| `order-0001-total.txt` | Only the amount to pay, e.g. `59.00` |
| `order-0001-products.txt` | One line per product, e.g. `1 x Shawarma (Chicken)` |

Example `order-0001-products.txt`:

```
2 x Shawarma (Chicken)
1 x Cheesy Shawarma (Chicken + Beef) + Extra cheese
1 x Pistachio Baklava (4 pcs)
```

- The order number goes up by one each time (`0001`, `0002`, ...).
- The total is calculated by the app from `menu.json`, not taken from the screen.
- The products file is written first and the total file last. Each file is written
  in full before it shows up, so a program watching the folder (a till, a payment
  terminal, a kitchen printer) never reads half a file.

## Run it

You need [Node.js](https://nodejs.org) 18 or newer.

```bash
npm install
npm start        # full-screen kiosk mode
npm run dev      # in a normal window, for testing
npm test         # checks prices and the order files
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
main.js             Electron window, kiosk mode, receives the order and writes the files
preload.js          Safe bridge between the screen and the computer
src/pricing.js      Price, nutrition and product name logic (shared by screen + main)
src/orderWriter.js  Writes the two files for each order
renderer/           The kiosk screen (HTML, CSS, JS, translations)
data/menu.json      The menu
config.json         Settings
test/               Automated tests
```
