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
    busy: false,
    openOrder: null, // { orderNumber, total } once the total file is written
    lastAdded: null,
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
    renderPanel();
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
      if (same) {
        same.qty = Math.min(99, same.qty + line.qty);
        state.lastAdded = same.uid;
      } else {
        state.cart.push(Object.assign({ uid: ++uidSeq }, line));
        state.lastAdded = uidSeq;
      }
      toast(`✓ ${T('added')}`);
    }
    closeModal();
    renderMenu();
    renderPanel();
  }

  // ---------- side panel (order) ----------
  function renderPanel() {
    const count = state.cart.reduce((s, l) => s + l.qty, 0);
    $('#panel-count').textContent = count;
    $('#panel-empty').hidden = count > 0;
    $('#btn-checkout').disabled = count === 0;
    $('#order-panel').classList.toggle('has-items', count > 0);

    $('#panel-list').innerHTML = state.cart.map((l) => {
      const p = product(l.productId);
      const meat = l.meatId && menu.meats.find((x) => x.id === l.meatId);
      const extras = l.extraIds.map((id) => tr(menu.extras.find((e) => e.id === id).name));
      const editable = p.meatChoice || p.extras;
      return `
      <div class="panel-item ${l.uid === state.lastAdded ? 'flash' : ''}">
        <button class="panel-item-main" ${editable ? `data-edit="${l.uid}"` : 'disabled'}>
          <span class="panel-icon">${esc(p.icon)}</span>
          <span class="panel-info">
            <span class="panel-name">${esc(tr(p.name))}</span>
            ${meat ? `<span class="panel-opt">${esc(tr(meat.name))}</span>` : ''}
            ${extras.length ? `<span class="panel-opt">+ ${esc(extras.join(', '))}</span>` : ''}
            ${editable ? `<span class="panel-edit">✎ ${esc(T('edit'))}</span>` : ''}
          </span>
        </button>
        <div class="panel-item-side">
          <span class="panel-price">${esc(money(Pricing.lineTotal(menu, l)))}</span>
          <div class="qty qty-sm">
            <button class="qty-btn" data-line-minus="${l.uid}" aria-label="${esc(T('remove'))}">${l.qty === 1 ? '🗑' : '−'}</button>
            <span>${l.qty}</span>
            <button class="qty-btn" data-line-plus="${l.uid}" aria-label="+">+</button>
          </div>
        </div>
      </div>`;
    }).join('');

    const kcal = state.cart.reduce((s, l) => s + Pricing.lineNutrition(menu, l).kcal * l.qty, 0);
    $('#panel-kcal').textContent = `${kcal} kcal`;
    $('#panel-total').textContent = money(count ? Pricing.orderTotal(menu, cartLines()) : 0);
    state.lastAdded = null;
  }

  function changeLineQty(uid, delta) {
    const line = state.cart.find((l) => l.uid === uid);
    if (!line) return;
    line.qty = Math.min(99, line.qty + delta);
    if (line.qty < 1) state.cart = state.cart.filter((l) => l.uid !== uid);
    renderPanel();
    renderMenu();
  }

  // ---------- payment ----------
  // An "open" order has its total file written but is not paid/confirmed yet.
  async function cancelOpenOrder() {
    if (!state.openOrder) return;
    const n = state.openOrder.orderNumber;
    state.openOrder = null;
    try { await window.kiosk.cancelOrder(n); } catch (err) { console.error(err); }
  }

  function goToCheckout() {
    if (!state.cart.length) return;
    const total = money(Pricing.orderTotal(menu, cartLines()));
    $('#pay-amount').textContent = total;
    const { card, cash } = config.payment;
    $('#pay-opt-card').hidden = !card;
    $('#pay-opt-cash').hidden = !cash;
    if (card && !cash) return startPayment('card');
    if (cash && !card) return startPayment('cash');
    showScreen('payment');
  }

  async function ensureOpenOrder() {
    if (state.openOrder) return state.openOrder;
    const res = await window.kiosk.createOrder(cartLines());
    if (!res || !res.ok) throw new Error((res && res.error) || 'create failed');
    state.openOrder = { orderNumber: res.orderNumber, total: res.total };
    return state.openOrder;
  }

  async function startPayment(method) {
    if (state.busy) return;
    state.busy = true;
    try {
      const order = await ensureOpenOrder();
      if (method === 'cash') return await payAtCounter();
      const amount = `${order.total} ${config.currency}`;
      $('#card-amount').textContent = amount;
      $('#terminal-amount').textContent = amount;
      $('#card-waiting').hidden = false;
      $('#card-declined').hidden = true;
      $('#btn-counter-instead').hidden = !config.payment.cash;
      showScreen('card');

      const res = await window.kiosk.payCard(order.orderNumber);
      if (state.screen !== 'card') return; // customer left meanwhile
      if (!res || !res.ok) throw new Error((res && res.error) || 'payment error');
      if (res.cancelled) return;
      if (res.approved) {
        state.openOrder = null;
        showDone('card', res.orderNumber, res.total);
      } else {
        $('#card-declined-msg').textContent = res.message || '';
        $('#card-waiting').hidden = true;
        $('#card-declined').hidden = false;
      }
    } catch (err) {
      console.error(err);
      toast(T('orderFailed'));
      await cancelOpenOrder();
      showScreen('menu');
    } finally {
      state.busy = false;
    }
  }

  async function payAtCounter() {
    const res = await window.kiosk.payCash(state.openOrder.orderNumber);
    if (!res || !res.ok) throw new Error((res && res.error) || 'cash failed');
    state.openOrder = null;
    showDone('cash', res.orderNumber, res.total);
  }

  async function cancelPayment() {
    await cancelOpenOrder();
    showScreen('menu'); // the cart is kept, the customer can change it or try again
    resetIdle();
  }

  function showDone(method, orderNumber, total) {
    const paid = method === 'card';
    $('#done-title').textContent = paid ? T('paidTitle') : T('thankYou');
    $('#done-pay-label').textContent = paid ? T('paidLabel') : T('counterLabel');
    $('#done-hint').textContent = paid ? T('paidHint') : T('counterHint');
    $('#done-number').textContent = orderNumber;
    $('#done-total').textContent = `${total} ${config.currency}`;
    $('#screen-done').classList.toggle('paid', paid);
    showScreen('done');
    clearTimeout(showDone.timer);
    showDone.timer = setTimeout(resetAll, 20000);
  }

  function resetAll() {
    clearTimeout(showDone.timer);
    cancelOpenOrder();
    closeModal();
    clearInterval(countdownTimer);
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
    if (['welcome', 'done', 'card'].includes(state.screen)) return;
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
    if (d.pay) { startPayment(d.pay); return; }
    if (d.lineMinus) { changeLineQty(+d.lineMinus, -1); return; }
    if (d.linePlus) { changeLineQty(+d.linePlus, +1); return; }

    switch (d.action) {
      case 'start': showScreen('dining'); resetIdle(); break;
      case 'cancel': resetAll(); break;
      case 'checkout': goToCheckout(); break;
      case 'back-to-menu': cancelOpenOrder(); showScreen('menu'); break;
      case 'cancel-payment': cancelPayment(); break;
      case 'retry-card': startPayment('card'); break;
      case 'pay-counter-instead':
        state.busy = true;
        payAtCounter().catch((err) => { console.error(err); toast(T('orderFailed')); }).finally(() => { state.busy = false; });
        break;
      case 'close-modal': closeModal(); break;
      case 'qty-minus': state.modal.qty = Math.max(1, state.modal.qty - 1); renderModal(); break;
      case 'qty-plus': state.modal.qty = Math.min(99, state.modal.qty + 1); renderModal(); break;
      case 'add-to-order': addToOrder(); break;
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
