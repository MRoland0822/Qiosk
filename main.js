'use strict';
const { app, BrowserWindow, ipcMain, globalShortcut } = require('electron');
const fs = require('fs');
const path = require('path');
const { createOrder, writeTotal, confirmOrder, cancelOrder } = require('./src/orderWriter');
const { createTerminal } = require('./src/payment');

const windowed = process.argv.includes('--windowed');

/**
 * Settings and menu can be overridden without rebuilding the app: a
 * config.json / menu.json placed next to the executable (or in the app's
 * user-data folder) wins over the bundled defaults.
 */
function findFile(name, bundledRelPath) {
  const candidates = [
    path.join(path.dirname(app.getPath('exe')), name),
    path.join(app.getPath('userData'), name),
    path.join(__dirname, bundledRelPath),
  ];
  return candidates.find((p) => fs.existsSync(p));
}

function loadJson(name, bundledRelPath) {
  return JSON.parse(fs.readFileSync(findFile(name, bundledRelPath), 'utf8'));
}

let config;
let menu;
let terminal;

function ordersDir() {
  // QIOSK_ORDERS_DIR lets tools (e.g. scripts/ui-check.js) write to a throwaway folder.
  const dir = process.env.QIOSK_ORDERS_DIR || config.ordersDir || 'orders';
  if (path.isAbsolute(dir)) return dir;
  // Relative paths: next to the project when running from source,
  // otherwise in the user's Documents folder (the install dir may be read-only).
  const base = app.isPackaged ? path.join(app.getPath('documents'), 'Qiosk') : __dirname;
  return path.join(base, dir);
}

function createWindow() {
  const kiosk = config.kiosk !== false && !windowed;
  // --size=1080x1920 emulates a specific kiosk screen in windowed mode.
  const sizeArg = process.argv.find((a) => a.startsWith('--size='));
  const [width, height] = sizeArg ? sizeArg.slice(7).split('x').map(Number) : [608, 1080];
  const win = new BrowserWindow({
    width,
    height,
    useContentSize: true,
    kiosk,
    fullscreen: kiosk,
    autoHideMenuBar: true,
    backgroundColor: '#1a0f0a',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  win.loadFile(path.join(__dirname, 'renderer', 'index.html'));
  // Block navigation away from the kiosk page.
  win.webContents.on('will-navigate', (e) => e.preventDefault());
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
}

function paymentConfig() {
  return Object.assign({ card: true, cash: true, terminal: 'simulator' }, config.payment);
}

ipcMain.handle('kiosk:get-data', () => {
  const pay = paymentConfig();
  return {
    menu,
    config: {
      restaurantName: config.restaurantName || 'Kebab House',
      currency: config.currency || 'lei',
      idleTimeoutSeconds: config.idleTimeoutSeconds || 90,
      payment: { card: pay.card !== false, cash: pay.cash !== false },
    },
  };
});

// Orders that have a total file but are not confirmed yet: orderNumber -> { order, abort }
const pending = new Map();

const fail = (err) => {
  console.error(err);
  return { ok: false, error: err.message };
};

function getPending(orderNumber) {
  const p = pending.get(orderNumber);
  if (!p) throw new Error(`No open order #${orderNumber}`);
  return p;
}

function confirm(p, how) {
  confirmOrder(p.order);
  pending.delete(p.order.orderNumber);
  console.log(`Order #${p.order.orderNumber} confirmed (${how}): ${p.order.total}`);
  return { ok: true, orderNumber: p.order.orderNumber, total: p.order.total };
}

/** Step 1: write the total file and keep the order open until it is paid. */
ipcMain.handle('kiosk:create-order', (_e, req) => {
  try {
    const order = createOrder(ordersDir(), menu, req && req.lines, { lang: config.fileLanguage || 'en' });
    pending.set(order.orderNumber, { order, abort: null, attempts: 0 });
    return { ok: true, orderNumber: order.orderNumber, total: order.total };
  } catch (err) {
    return fail(err);
  }
});

/** Charge the order on the card terminal; on approval write the products file. */
ipcMain.handle('kiosk:pay-card', async (_e, orderNumber) => {
  let p;
  try {
    p = getPending(orderNumber);
    if (!paymentConfig().card) throw new Error('Card payment is disabled');
    if (p.abort) throw new Error('A payment is already in progress');
    if (p.attempts++ > 0) {
      // Retry: clear the old answer and re-issue the request for the terminal.
      fs.rmSync(p.order.paymentFile, { force: true });
      writeTotal(p.order);
    }
    p.abort = new AbortController();
    const result = await terminal.charge(p.order, p.abort.signal);
    p.abort = null;
    if (!result.approved) return { ok: true, approved: false, message: result.message };
    return Object.assign(confirm(p, `card: ${result.message}`), { approved: true });
  } catch (err) {
    if (p) p.abort = null;
    if (err.name === 'AbortError') return { ok: true, approved: false, cancelled: true };
    return fail(err);
  }
});

/** Customer pays at the counter: confirm the order straight away. */
ipcMain.handle('kiosk:pay-cash', (_e, orderNumber) => {
  try {
    const p = getPending(orderNumber);
    if (!paymentConfig().cash) throw new Error('Paying at the counter is disabled');
    if (p.abort) p.abort.abort();
    fs.rmSync(p.order.paymentFile, { force: true });
    return confirm(p, 'counter');
  } catch (err) {
    return fail(err);
  }
});

/** Customer gave up: stop the terminal wait and remove the payment request. */
ipcMain.handle('kiosk:cancel-order', (_e, orderNumber) => {
  const p = pending.get(orderNumber);
  if (!p) return { ok: true };
  if (p.abort) p.abort.abort();
  cancelOrder(p.order);
  pending.delete(orderNumber);
  console.log(`Order #${orderNumber} cancelled before payment`);
  return { ok: true };
});

app.whenReady().then(() => {
  config = loadJson('config.json', 'config.json');
  menu = loadJson('menu.json', path.join('data', 'menu.json'));
  terminal = createTerminal(paymentConfig());
  console.log(`Card terminal driver: ${terminal.name}`);
  createWindow();
  // Staff exit from kiosk mode.
  globalShortcut.register('CommandOrControl+Shift+Q', () => app.quit());
});

app.on('will-quit', () => globalShortcut.unregisterAll());
app.on('window-all-closed', () => app.quit());
