'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const menu = require('../data/menu.json');
const Pricing = require('../src/pricing');
const { writeOrderFiles } = require('../src/orderWriter');

const tmpDir = () => fs.mkdtempSync(path.join(os.tmpdir(), 'qiosk-'));

test('menu is consistent', () => {
  const cats = new Set(menu.categories.map((c) => c.id));
  const ids = new Set();
  for (const p of menu.products) {
    assert.ok(cats.has(p.category), `${p.id} has unknown category`);
    assert.ok(!ids.has(p.id), `duplicate id ${p.id}`);
    ids.add(p.id);
    assert.ok(p.name.ro && p.name.en && p.description.ro && p.description.en, `${p.id} texts`);
    assert.ok(p.price > 0 && p.nutrition && p.nutrition.kcal >= 0, `${p.id} price/nutrition`);
  }
});

test('prices include meat and extras', () => {
  const line = { productId: 'cheesy-shawarma', meatId: 'chicken-lamb', extraIds: ['extra-cheese'], qty: 2 };
  // 30 + 4 (chicken+lamb) + 4 (cheese) = 38, x2
  assert.strictEqual(Pricing.unitPrice(menu, line), 38);
  assert.strictEqual(Pricing.lineTotal(menu, line), 76);
});

test('meat choice is required where applicable and rejected bad data', () => {
  assert.throws(() => Pricing.resolveLine(menu, { productId: 'shawarma', qty: 1 }));
  assert.throws(() => Pricing.resolveLine(menu, { productId: 'nope', qty: 1 }));
  assert.throws(() => Pricing.resolveLine(menu, { productId: 'ayran', qty: 0 }));
  assert.throws(() => Pricing.resolveLine(menu, { productId: 'ayran', extraIds: ['extra-cheese'], qty: 1 }));
});

test('writes a total file and a products file', () => {
  const dir = tmpDir();
  const res = writeOrderFiles(dir, menu, [
    { productId: 'shawarma', meatId: 'chicken', extraIds: [], qty: 1 },
    { productId: 'cheesy-shawarma', meatId: 'chicken-beef', extraIds: [], qty: 1 },
    { productId: 'shawarma', meatId: 'chicken', extraIds: [], qty: 1 },
    { productId: 'baklava-pistachio', qty: 1 },
  ], { lang: 'en' });

  // 2 x 26 + (30 + 2) + 16 = 100
  assert.strictEqual(res.orderNumber, 1);
  assert.strictEqual(fs.readFileSync(path.join(dir, 'order-0001-total.txt'), 'utf8'), '100.00\n');
  assert.strictEqual(
    fs.readFileSync(path.join(dir, 'order-0001-products.txt'), 'utf8'),
    '2 x Shawarma (Chicken)\n1 x Cheesy Shawarma (Chicken + Beef)\n1 x Pistachio Baklava (4 pcs)\n',
  );
  assert.deepStrictEqual(fs.readdirSync(dir).filter((f) => f.endsWith('.tmp')), []);
});

test('order numbers increase and Romanian labels work', () => {
  const dir = tmpDir();
  writeOrderFiles(dir, menu, [{ productId: 'ayran', qty: 1 }]);
  const res = writeOrderFiles(dir, menu, [{ productId: 'cheesy-box', meatId: 'beef-lamb', extraIds: ['no-onion'], qty: 1 }], { lang: 'ro' });
  assert.strictEqual(res.orderNumber, 2);
  assert.strictEqual(fs.readFileSync(res.productsFile, 'utf8'), '1 x Cheesy Box (Vită + Berbecuț) + Fără ceapă\n');
  assert.strictEqual(fs.readFileSync(res.totalFile, 'utf8'), '35.00\n');
});

test('empty or invalid orders write nothing', () => {
  const dir = tmpDir();
  assert.throws(() => writeOrderFiles(dir, menu, []));
  assert.throws(() => writeOrderFiles(dir, menu, [{ productId: 'ayran', qty: 1 }, { productId: 'bad', qty: 1 }]));
  assert.deepStrictEqual(fs.readdirSync(dir), []);
});

test('card flow: total file first, products file only after payment', () => {
  const { createOrder, confirmOrder } = require('../src/orderWriter');
  const dir = tmpDir();
  const order = createOrder(dir, menu, [{ productId: 'shawarma', meatId: 'beef', qty: 1 }]);
  assert.strictEqual(fs.readFileSync(order.totalFile, 'utf8'), '30.00\n');
  assert.ok(!fs.existsSync(order.productsFile), 'kitchen must not see an unpaid order');
  confirmOrder(order);
  assert.strictEqual(fs.readFileSync(order.productsFile, 'utf8'), '1 x Shawarma (Beef)\n');
});

test('cancelled order removes the payment request and keeps its number used', () => {
  const { createOrder, cancelOrder } = require('../src/orderWriter');
  const dir = tmpDir();
  const order = createOrder(dir, menu, [{ productId: 'ayran', qty: 1 }]);
  cancelOrder(order);
  assert.ok(!fs.existsSync(order.totalFile));
  assert.strictEqual(createOrder(dir, menu, [{ productId: 'ayran', qty: 1 }]).orderNumber, 2);
});
