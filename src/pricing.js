/*
 * Pricing / labelling logic shared by the UI (renderer) and the main process.
 * Works both as a CommonJS module (Node/Electron main) and as a browser global
 * (window.Pricing) so prices are computed the same way everywhere.
 *
 * A cart line looks like:
 *   { productId: "shawarma", meatId: "chicken-beef", extraIds: ["extra-cheese"], qty: 2 }
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Pricing = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const round2 = (n) => Math.round(n * 100) / 100;
  const byId = (list, id) => (list || []).find((x) => x.id === id);

  /** Validate a line against the menu and return the resolved objects. Throws on bad data. */
  function resolveLine(menu, line) {
    const product = byId(menu.products, line.productId);
    if (!product) throw new Error(`Unknown product: ${line.productId}`);

    const qty = Number(line.qty);
    if (!Number.isInteger(qty) || qty < 1 || qty > 99) throw new Error(`Invalid quantity for ${line.productId}`);

    let meat = null;
    if (product.meatChoice) {
      meat = byId(menu.meats, line.meatId);
      if (!meat) throw new Error(`Missing or unknown meat for ${line.productId}`);
    }

    const extraIds = Array.isArray(line.extraIds) ? line.extraIds : [];
    if (extraIds.length && !product.extras) throw new Error(`${line.productId} does not take extras`);
    const extras = [...new Set(extraIds)].map((id) => {
      const extra = byId(menu.extras, id);
      if (!extra) throw new Error(`Unknown extra: ${id}`);
      return extra;
    });

    return { product, meat, extras, qty };
  }

  function unitPrice(menu, line) {
    const { product, meat, extras } = resolveLine(menu, line);
    return round2(product.price + (meat ? meat.price : 0) + extras.reduce((s, e) => s + e.price, 0));
  }

  function lineTotal(menu, line) {
    return round2(unitPrice(menu, line) * resolveLine(menu, line).qty);
  }

  function orderTotal(menu, lines) {
    return round2(lines.reduce((sum, line) => sum + lineTotal(menu, line), 0));
  }

  /** Nutrition for ONE unit of the line, adjusted for meat type and extras. */
  function lineNutrition(menu, line) {
    const { product, meat, extras } = resolveLine(menu, line);
    const n = Object.assign({ weight: 0, kcal: 0, protein: 0, carbs: 0, fat: 0 }, product.nutrition);
    if (meat) {
      n.kcal += meat.kcal || 0;
      n.protein += meat.protein || 0;
      n.fat += meat.fat || 0;
    }
    extras.forEach((e) => { n.kcal += e.kcal || 0; });
    return n;
  }

  /**
   * Human readable name of a line, e.g. "Cheesy Shawarma (Chicken + Beef)" and,
   * optionally, the extras: "Shawarma (Chicken) + Extra cheese, No onion".
   */
  function lineLabel(menu, line, lang, withExtras) {
    const { product, meat, extras } = resolveLine(menu, line);
    const t = (obj) => (obj && (obj[lang] || obj.en || obj.ro)) || '';
    let label = t(product.name);
    if (meat) label += ` (${t(meat.name)})`;
    if (withExtras !== false && extras.length) label += ' + ' + extras.map((e) => t(e.name)).join(', ');
    return label;
  }

  function formatMoney(amount) {
    return round2(amount).toFixed(2);
  }

  return { resolveLine, unitPrice, lineTotal, orderTotal, lineNutrition, lineLabel, formatMoney, round2 };
});
