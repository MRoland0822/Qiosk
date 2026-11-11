'use strict';
/*
 * Writes the two files produced for every order:
 *
 *   order-0001-total.txt     -> the amount to pay, e.g. "57.00"
 *   order-0001-products.txt  -> one line per product, e.g. "1 x Shawarma (Chicken)"
 *
 * The total is recomputed here from the menu (never trusted from the UI).
 * Each file is written to a temp name first and then renamed, so another
 * program watching the folder never reads a half-written file. The products
 * file is written first and the total file last, so the appearance of the
 * total file means the order is complete.
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
  // Never overwrite an existing order, even if the counter file was deleted.
  while (fs.existsSync(path.join(dir, `order-${pad(next)}-total.txt`))) next++;
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
 * @param {string} dir         folder where the files are written (created if missing)
 * @param {object} menu        parsed data/menu.json
 * @param {Array}  lines       cart lines from the UI
 * @param {object} [opts]      { lang: 'en' | 'ro' }
 * @returns {{orderNumber:number, total:string, totalFile:string, productsFile:string, products:string[]}}
 */
function writeOrderFiles(dir, menu, lines, opts = {}) {
  if (!Array.isArray(lines) || lines.length === 0) throw new Error('The order is empty');
  const lang = opts.lang || 'en';

  const merged = mergeLines(lines);
  merged.forEach((l) => Pricing.resolveLine(menu, l)); // validates everything before touching disk

  const total = Pricing.formatMoney(Pricing.orderTotal(menu, merged));
  const products = merged.map((l) => `${l.qty} x ${Pricing.lineLabel(menu, l, lang, true)}`);

  fs.mkdirSync(dir, { recursive: true });
  const orderNumber = nextOrderNumber(dir);
  const base = path.join(dir, `order-${pad(orderNumber)}`);
  const productsFile = `${base}-products.txt`;
  const totalFile = `${base}-total.txt`;

  writeAtomic(productsFile, products.join('\n') + '\n');
  writeAtomic(totalFile, total + '\n');

  return { orderNumber, total, totalFile, productsFile, products };
}

module.exports = { writeOrderFiles, mergeLines };
