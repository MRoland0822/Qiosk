'use strict';
/*
 * Writes the two files produced for every order:
 *
 *   order-0001-total.txt     -> the amount to pay, e.g. "57.00"
 *   order-0001-products.txt  -> one line per product, e.g. "1 x Shawarma (Chicken)"
 *
 * The order happens in two steps:
 *   1. createOrder()   writes the TOTAL file. This is the payment request: the
 *                      card terminal (or the cashier) charges this amount.
 *   2. confirmOrder()  writes the PRODUCTS file once the order is paid by card or
 *                      the customer chose to pay at the counter. The products file
 *                      appearing means "make this order".
 *   cancelOrder()      removes the total file if the customer gives up, so an
 *                      unpaid, abandoned order never reaches the kitchen.
 *
 * The total is recomputed here from the menu (never trusted from the UI).
 * Each file is written to a temp name first and then renamed, so another
 * program watching the folder never reads a half-written file.
 */
const fs = require('fs');
const path = require('path');
const Pricing = require('./pricing');

function pad(n) {
  return String(n).padStart(4, '0');
}

function nextOrderNumber(dir) {
  const counterFile = path.join(dir, '.order-counter');
  let last = 0;
  try {
    last = parseInt(fs.readFileSync(counterFile, 'utf8'), 10) || 0;
  } catch (_) { /* first order */ }
  let next = last + 1;
  // Never reuse a number, even if the counter file was deleted.
  while (['total', 'products'].some((k) => fs.existsSync(path.join(dir, `order-${pad(next)}-${k}.txt`)))) next++;
  fs.writeFileSync(counterFile, String(next));
  return next;
}

function writeAtomic(file, content) {
  const tmp = `${file}.tmp`;
  fs.writeFileSync(tmp, content, 'utf8');
  fs.renameSync(tmp, file);
}

/**
 * Merge identical lines (same product, meat and extras) so the products file
 * says "2 x Shawarma (Chicken)" instead of two separate lines.
 */
function mergeLines(lines) {
  const map = new Map();
  for (const l of lines) {
    const extras = [...new Set(l.extraIds || [])].sort();
    const key = [l.productId, l.meatId || '', extras.join(',')].join('|');
    const existing = map.get(key);
    if (existing) existing.qty += Number(l.qty);
    else map.set(key, { productId: l.productId, meatId: l.meatId || null, extraIds: extras, qty: Number(l.qty) });
  }
  return [...map.values()];
}

/**
 * Step 1: validate the cart, give it a number and write the total file.
 * @returns {{orderNumber:number, total:string, products:string[], totalFile:string, productsFile:string, dir:string}}
 */
function createOrder(dir, menu, lines, opts = {}) {
  if (!Array.isArray(lines) || lines.length === 0) throw new Error('The order is empty');
  const lang = opts.lang || 'en';

  const merged = mergeLines(lines);
  merged.forEach((l) => Pricing.resolveLine(menu, l)); // validates everything before touching disk

  const total = Pricing.formatMoney(Pricing.orderTotal(menu, merged));
  const products = merged.map((l) => `${l.qty} x ${Pricing.lineLabel(menu, l, lang, true)}`);

  fs.mkdirSync(dir, { recursive: true });
  const orderNumber = nextOrderNumber(dir);
  const base = path.join(dir, `order-${pad(orderNumber)}`);
  const order = {
    dir,
    orderNumber,
    total,
    products,
    totalFile: `${base}-total.txt`,
    productsFile: `${base}-products.txt`,
    paymentFile: `${base}-payment.txt`,
  };
  writeTotal(order);
  return order;
}

/** (Re)write the total file — also used to ask the terminal to try again. */
function writeTotal(order) {
  writeAtomic(order.totalFile, order.total + '\n');
}

/** Step 2: the order is paid (or will be paid at the counter) — write the products file. */
function confirmOrder(order) {
  writeAtomic(order.productsFile, order.products.join('\n') + '\n');
}

/** The customer gave up before paying: remove the payment request. */
function cancelOrder(order) {
  for (const f of [order.totalFile, order.paymentFile]) fs.rmSync(f, { force: true });
}

/** Both steps at once (used for "pay at the counter" and in tests). */
function writeOrderFiles(dir, menu, lines, opts = {}) {
  const order = createOrder(dir, menu, lines, opts);
  confirmOrder(order);
  return order;
}

module.exports = { createOrder, writeTotal, confirmOrder, cancelOrder, writeOrderFiles, mergeLines };
