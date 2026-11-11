/* Kiosk screen logic. Talks to the computer only through window.kiosk (see preload.js). */
(function () {
  'use strict';

  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => [...document.querySelectorAll(sel)];
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  let menu = null;
  let config = null;

  const state = {
    lang: 'ro',
    dining: null,
    category: 'popular',
    cart: [],       // { uid, productId, meatId, extraIds, qty }
    modal: null,    // { productId, meatId, extraIds, qty, editingUid }
    placing: false,
  };
  let uidSeq = 0;

  // ---------- helpers ----------
  const T = (key) => (I18N[state.lang] && I18N[state.lang][key]) || I18N.en[key] || key;
  const tr = (obj) => (obj && (obj[state.lang] || obj.en)) || '';
  const money = (n) => `${Pricing.formatMoney(n)} ${config.currency}`;
  const product = (id) => menu.products.find((p) => p.id === id);
  const cartLines = () => state.cart.map(({ productId, meatId, extraIds, qty }) => ({ productId, meatId, extraIds, qty }));

  function showScreen(name) {
    $$('.screen').forEach((s) => s.classList.toggle('active', s.id === `screen-${name}`));
    state.screen = name;
  }

  function toast(msg) {
    const el = $('#toast');
    el.textContent = msg;
    el.hidden = false;
    el.classList.remove('show');
    void el.offsetWidth; // restart animation
    el.classList.add('show');
    clearTimeout(toast.timer);
    toast.timer = setTimeout(() => { el.hidden = true; }, 1800);
  }

  // ---------- language ----------
  function applyLanguage() {
    document.documentElement.lang = state.lang;
    $$('[data-i18n]').forEach((el) => { el.textContent = T(el.dataset.i18n); });
    $$('.lang-btn[data-lang]').forEach((b) => b.classList.toggle('active', b.dataset.lang === state.lang));
    $$('[data-lang-toggle]').forEach((b) => { b.textContent = state.lang === 'ro' ? '🇬🇧 EN' : '🇷🇴 RO'; });
    renderMenu();
    renderCartBar();
    if (state.screen === 'review') renderReview();
    if (state.modal) renderModal();
    updateDiningBadge();
  }

  function updateDiningBadge() {
    $('#dining-badge').textContent = state.dining === 'take-away' ? `🛍️ ${T('takeAway')}` : `🍽️ ${T('eatIn')}`;
  }

  // ---------- menu ----------
  function renderMenu() {
    const cats = [{ id: 'popular', icon: '⭐', name: { ro: T('popular'), en: T('popular') } }, ...menu.categories];
    $('#category-rail').innerHTML = cats.map((c) => `
      <button class="cat-btn ${c.id === state.category ? 'active' : ''}" data-category="${esc(c.id)}">
        <span class="cat-icon">${esc(c.icon)}</span>
        <span class="cat-name">${esc(c.id === 'popular' ? T('popular') : tr(c.name))}</span>
      </button>`).join('');

    const current = cats.find((c) => c.id === state.category);
    $('#category-title').textContent = state.category === 'popular' ? `⭐ ${T('popular')}` : `${current.icon} ${tr(current.name)}`;

    const items = state.category === 'popular'
      ? menu.products.filter((p) => p.popular)
      : menu.products.filter((p) => p.category === state.category);

    $('#product-grid').innerHTML = items.map((p) => {
      const n = p.nutrition || {};
      const inCart = state.cart.filter((l) => l.productId === p.id).reduce((s, l) => s + l.qty, 0);
      return `
      <button class="product-card" data-product="${esc(p.id)}">
        ${inCart ? `<span class="in-cart">${inCart}</span>` : ''}
        <span class="product-icon">${esc(p.icon)}</span>
        <span class="product-name">${esc(tr(p.name))}</span>
        <span class="product-desc">${esc(tr(p.description))}</span>
        <span class="product-meta">
          <span class="product-price">${p.meatChoice ? `<small>${esc(T('from'))}</small> ` : ''}${esc(money(p.price))}</span>
          <span class="product-kcal">${esc(n.kcal)} kcal</span>
        </span>
      </button>`;
    }).join('');
  }

  // ---------- product dialog ----------
  function openProduct(productId, editingUid) {
    const p = product(productId);
    const existing = editingUid && state.cart.find((l) => l.uid === editingUid);
    state.modal = existing
      ? { productId, meatId: existing.meatId, extraIds: [...existing.extraIds], qty: existing.qty, editingUid }
      : { productId, meatId: p.meatChoice ? menu.meats[0].id : null, extraIds: [], qty: 1, editingUid: null };
    renderModal();
    $('#product-modal').hidden = false;
  }

  function closeModal() {
    state.modal = null;
    $('#product-modal').hidden = true;
  }

  function renderModal() {
    const m = state.modal;
    const p = product(m.productId);
    const line = { productId: m.productId, meatId: m.meatId, extraIds: m.extraIds, qty: m.qty };

    $('#pm-icon').textContent = p.icon;
    $('#pm-name').textContent = tr(p.name);
    $('#pm-desc').textContent = tr(p.description);

    $('#pm-meat-section').hidden = !p.meatChoice;
    if (p.meatChoice) {
      $('#pm-meats').innerHTML = menu.meats.map((meat) => `
        <button class="option ${meat.id === m.meatId ? 'selected' : ''}" data-meat="${esc(meat.id)}">
          <span class="option-name">${meat.id.includes('-') ? `<small>${esc(T('mixed'))}</small>` : ''}${esc(tr(meat.name))}</span>
          <span class="option-price">${meat.price ? `+${esc(money(meat.price))}` : '✓'}</span>
        </button>`).join('');
    }

    $('#pm-extra-section').hidden = !p.extras;
    if (p.extras) {
      $('#pm-extras').innerHTML = menu.extras.map((e) => `
        <button class="option ${m.extraIds.includes(e.id) ? 'selected' : ''}" data-extra="${esc(e.id)}">
          <span class="option-name">${esc(tr(e.name))}</span>
          <span class="option-price">${e.price ? `+${esc(money(e.price))}` : ''}</span>
        </button>`).join('');
    }

    const n = Pricing.lineNutrition(menu, line);
    const facts = [['weight', `${n.weight} g`], ['kcal', `${n.kcal}`], ['protein', `${n.protein} g`], ['carbs', `${n.carbs} g`], ['fat', `${n.fat} g`]];
    $('#pm-nutrition').innerHTML = facts.map(([k, v]) => `
      <div class="fact ${k === 'kcal' ? 'fact-main' : ''}"><span class="fact-value">${esc(v)}</span><span class="fact-label">${esc(T(k))}</span></div>`).join('');

    const names = I18N[state.lang].allergenNames;
    $('#pm-allergens').innerHTML = p.allergens && p.allergens.length
      ? `⚠️ <strong>${esc(T('allergens'))}:</strong> ${esc(p.allergens.map((a) => names[a] || a).join(', '))}`
      : `✅ ${esc(T('noAllergens'))}`;

    $('#pm-qty').textContent = m.qty;
    $('#pm-add-label').textContent = m.editingUid ? T('update') : T('add');
    $('#pm-price').textContent = money(Pricing.lineTotal(menu, line));
  }

  function addToOrder() {
    const m = state.modal;
    const line = { productId: m.productId, meatId: m.meatId, extraIds: [...m.extraIds], qty: m.qty };
    if (m.editingUid) {
      Object.assign(state.cart.find((l) => l.uid === m.editingUid), line);
    } else {
      // Same product with same options already in cart? Just raise the quantity.
      const sameKey = (l) => l.productId === line.productId && l.meatId === line.meatId
        && [...l.extraIds].sort().join() === [...line.extraIds].sort().join();
      const same = state.cart.find(sameKey);
      if (same) same.qty = Math.min(99, same.qty + line.qty);
      else state.cart.push(Object.assign({ uid: ++uidSeq }, line));
      toast(`✓ ${T('added')}`);
    }
    closeModal();
    renderMenu();
    renderCartBar();
    if (state.screen === 'review') renderReview();
  }

  // ---------- cart ----------
  function renderCartBar() {
    const count = state.cart.reduce((s, l) => s + l.qty, 0);
    $('#cart-count').textContent = count;
    $('#cart-bar-total').textContent = count ? money(Pricing.orderTotal(menu, cartLines())) : T('emptyCart');
    $('#btn-review').disabled = count === 0;
    $('#cart-bar').classList.toggle('has-items', count > 0);
  }

  function renderReview() {
    if (!state.cart.length) { showScreen('menu'); return; }
    $('#review-list').innerHTML = state.cart.map((l) => {
      const p = product(l.productId);
      const meat = l.meatId && menu.meats.find((x) => x.id === l.meatId);
      const extras = l.extraIds.map((id) => tr(menu.extras.find((e) => e.id === id).name));
      return `
      <div class="review-item">
        <span class="review-icon">${esc(p.icon)}</span>
        <div class="review-info">
          <div class="review-name">${esc(tr(p.name))}</div>
          ${meat ? `<div class="review-opt">🥩 ${esc(tr(meat.name))}</div>` : ''}
          ${extras.length ? `<div class="review-opt">➕ ${esc(extras.join(', '))}</div>` : ''}
          <div class="review-actions">
            ${p.meatChoice || p.extras ? `<button class="link-btn" data-edit="${l.uid}">✎ ${esc(T('edit'))}</button>` : ''}
            <button class="link-btn danger" data-remove="${l.uid}">🗑 ${esc(T('remove'))}</button>
          </div>
        </div>
        <div class="qty">
          <button class="qty-btn" data-line-minus="${l.uid}">−</button>
          <span>${l.qty}</span>
          <button class="qty-btn" data-line-plus="${l.uid}">+</button>
        </div>
        <div class="review-price">${esc(money(Pricing.lineTotal(menu, l)))}</div>
      </div>`;
    }).join('');

    const kcal = state.cart.reduce((s, l) => s + Pricing.lineNutrition(menu, l).kcal * l.qty, 0);
    $('#review-kcal').textContent = `${kcal} kcal`;
    $('#review-total').textContent = money(Pricing.orderTotal(menu, cartLines()));
  }

  function changeLineQty(uid, delta) {
    const line = state.cart.find((l) => l.uid === uid);
    if (!line) return;
    line.qty += delta;
    if (line.qty < 1) state.cart = state.cart.filter((l) => l.uid !== uid);
    if (line.qty > 99) line.qty = 99;
    renderCartBar();
    renderMenu();
    renderReview();
  }

  async function pay() {
    if (state.placing || !state.cart.length) return;
    state.placing = true;
    $('#btn-pay').disabled = true;
    try {
      const res = await window.kiosk.placeOrder(cartLines());
      if (!res || !res.ok) throw new Error(res && res.error);
      $('#done-number').textContent = res.orderNumber;
      $('#done-total').textContent = `${res.total} ${config.currency}`;
      showScreen('done');
      clearTimeout(pay.finishTimer);
      pay.finishTimer = setTimeout(resetAll, 20000);
    } catch (err) {
      console.error(err);
      toast(T('orderFailed'));
    } finally {
      state.placing = false;
      $('#btn-pay').disabled = false;
    }
  }

  function resetAll() {
    clearTimeout(pay.finishTimer);
    closeModal();
    $('#idle-modal').hidden = true;
    state.cart = [];
    state.dining = null;
    state.category = 'popular';
    state.lang = 'ro'; // next customer starts in Romanian
    showScreen('welcome');
    applyLanguage();
  }

  // ---------- idle timeout ----------
  let idleTimer = null;
  let countdownTimer = null;
  function resetIdle() {
    clearTimeout(idleTimer);
    if (!$('#idle-modal').hidden) return; // only the button closes the warning
    if (state.screen === 'welcome' || state.screen === 'done') return;
    idleTimer = setTimeout(showIdleWarning, config.idleTimeoutSeconds * 1000);
  }
  function showIdleWarning() {
    let left = 15;
    $('#idle-count').textContent = `${left}s`;
    $('#idle-modal').hidden = false;
    clearInterval(countdownTimer);
    countdownTimer = setInterval(() => {
      left -= 1;
      $('#idle-count').textContent = `${left}s`;
      if (left <= 0) { clearInterval(countdownTimer); resetAll(); }
    }, 1000);
  }

  // ---------- events ----------
  document.addEventListener('click', (e) => {
    const t = e.target.closest('button, [data-action]');
    if (!t) return;
    const d = t.dataset;

    if (d.lang) { state.lang = d.lang; applyLanguage(); return; }
    if ('langToggle' in d) { state.lang = state.lang === 'ro' ? 'en' : 'ro'; applyLanguage(); return; }
    if (d.dining) { state.dining = d.dining; updateDiningBadge(); showScreen('menu'); resetIdle(); return; }
    if (d.category) { state.category = d.category; renderMenu(); $('.product-area').scrollTop = 0; return; }
    if (d.product) { openProduct(d.product); return; }
    if (d.meat) { state.modal.meatId = d.meat; renderModal(); return; }
    if (d.extra) {
      const ex = state.modal.extraIds;
      state.modal.extraIds = ex.includes(d.extra) ? ex.filter((x) => x !== d.extra) : [...ex, d.extra];
      renderModal();
      return;
    }
    if (d.edit) { const l = state.cart.find((x) => x.uid === +d.edit); openProduct(l.productId, l.uid); return; }
    if (d.remove) { changeLineQty(+d.remove, -999); return; }
    if (d.lineMinus) { changeLineQty(+d.lineMinus, -1); return; }
    if (d.linePlus) { changeLineQty(+d.linePlus, +1); return; }

    switch (d.action) {
      case 'start': showScreen('dining'); resetIdle(); break;
      case 'cancel': resetAll(); break;
      case 'review': renderReview(); showScreen('review'); break;
      case 'back-to-menu': showScreen('menu'); break;
      case 'close-modal': closeModal(); break;
      case 'qty-minus': state.modal.qty = Math.max(1, state.modal.qty - 1); renderModal(); break;
      case 'qty-plus': state.modal.qty = Math.min(99, state.modal.qty + 1); renderModal(); break;
      case 'add-to-order': addToOrder(); break;
      case 'pay': pay(); break;
      case 'finish': resetAll(); break;
      case 'still-here':
        clearInterval(countdownTimer);
        $('#idle-modal').hidden = true;
        resetIdle();
        break;
      default: break;
    }
  });

  // Tap on the dark area around the dialog closes it.
  $('#product-modal').addEventListener('click', (e) => { if (e.target.id === 'product-modal') closeModal(); });

  ['pointerdown', 'keydown', 'wheel', 'touchstart'].forEach((ev) => document.addEventListener(ev, resetIdle, { passive: true }));
  document.addEventListener('contextmenu', (e) => e.preventDefault()); // no right-click menu on a kiosk

  // ---------- boot ----------
  window.kiosk.getData().then((data) => {
    menu = data.menu;
    config = data.config;
    $$('[data-bind="restaurantName"]').forEach((el) => { el.textContent = config.restaurantName; });
    document.title = config.restaurantName;
    state.screen = 'welcome';
    applyLanguage();
  });
})();
