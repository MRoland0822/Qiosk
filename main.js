'use strict';
const { app, BrowserWindow, ipcMain, globalShortcut } = require('electron');
const fs = require('fs');
const path = require('path');
const { writeOrderFiles } = require('./src/orderWriter');

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

function ordersDir() {
  const dir = config.ordersDir || 'orders';
  if (path.isAbsolute(dir)) return dir;
  // Relative paths: next to the project when running from source,
  // otherwise in the user's Documents folder (the install dir may be read-only).
  const base = app.isPackaged ? path.join(app.getPath('documents'), 'Qiosk') : __dirname;
  return path.join(base, dir);
}

function createWindow() {
  const kiosk = config.kiosk !== false && !windowed;
  const win = new BrowserWindow({
    width: 1080,
    height: 1920,
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

ipcMain.handle('kiosk:get-data', () => ({
  menu,
  config: {
    restaurantName: config.restaurantName || 'Kebab House',
    currency: config.currency || 'lei',
    idleTimeoutSeconds: config.idleTimeoutSeconds || 90,
  },
}));

ipcMain.handle('kiosk:place-order', (_event, order) => {
  try {
    const result = writeOrderFiles(ordersDir(), menu, order && order.lines, { lang: config.fileLanguage || 'en' });
    console.log(`Order #${result.orderNumber}: ${result.total} -> ${result.totalFile}`);
    return { ok: true, orderNumber: result.orderNumber, total: result.total };
  } catch (err) {
    console.error('Order failed:', err);
    return { ok: false, error: err.message };
  }
});

app.whenReady().then(() => {
  config = loadJson('config.json', 'config.json');
  menu = loadJson('menu.json', path.join('data', 'menu.json'));
  createWindow();
  // Staff exit from kiosk mode.
  globalShortcut.register('CommandOrControl+Shift+Q', () => app.quit());
});

app.on('will-quit', () => globalShortcut.unregisterAll());
app.on('window-all-closed', () => app.quit());
