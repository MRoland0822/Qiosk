#!/usr/bin/env node
'use strict';
/*
 * UI check for the kiosk: opens the real Electron app at several kiosk screen
 * sizes, walks through every screen, saves screenshots and reports problems:
 *
 *   - touch targets smaller than the minimum (default 48 CSS px)
 *   - text that doesn't have enough contrast with its background (WCAG AA)
 *   - text that overflows its box, buttons that stick out of the screen
 *   - missing Romanian/English texts (UI strings and menu.json)
 *   - JavaScript errors
 *
 * Usage:
 *   npm run ui:check                      all sizes
 *   npm run ui:check -- --sizes=1080x1920 only these sizes (comma separated)
 *   npm run ui:check -- --min-target=44   different touch-target minimum
 *
 * Output: ui-check/*.png and ui-check/report.md. Exit code 1 if anything failed.
 * On a Linux server without a display run it under:
 *   xvfb-run -a -s "-screen 0 3840x3840x24" npm run ui:check
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const vm = require('vm');
const { _electron } = require('playwright-core');

const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'ui-check');
const arg = (name, def) => {
  const a = process.argv.find((x) => x.startsWith(`--${name}=`));
  return a ? a.split('=')[1] : def;
};

const ALL_SIZES = [
  [1080, 1920, 'Full HD portrait (most standing kiosks)'],
  [2160, 3840, '4K portrait (large kiosks)'],
  [768, 1366, 'small portrait'],
  [1280, 1024, '5:4 (older kiosks)'],
  [1920, 1080, 'landscape / counter screen'],
];
const sizes = arg('sizes')
  ? arg('sizes').split(',').map((s) => { const [w, h] = s.split('x').map(Number); return [w, h, `${w}x${h}`]; })
  : ALL_SIZES;
const MIN_TARGET = Number(arg('min-target', 48));

// ---------------------------------------------------------------- static checks
function checkTexts() {
  const problems = [];
  const sandbox = { window: {} };
  vm.runInNewContext(fs.readFileSync(path.join(ROOT, 'renderer', 'i18n.js'), 'utf8'), sandbox);
  const { ro, en } = sandbox.window.I18N;
  for (const k of Object.keys(ro)) if (!(k in en)) problems.push(`i18n: "${k}" has no English text`);
  for (const k of Object.keys(en)) if (!(k in ro)) problems.push(`i18n: "${k}" has no Romanian text`);

  const menu = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'menu.json'), 'utf8'));
  const walk = (obj, where) => {
    if (!obj || typeof obj !== 'object') return;
    if (('ro' in obj || 'en' in obj) && !(obj.ro && obj.en)) problems.push(`menu.json: ${where} is missing ${obj.ro ? 'en' : 'ro'}`);
    for (const [k, v] of Object.entries(obj)) walk(v, Array.isArray(obj) ? `${where}[${(v && v.id) || k}]` : `${where}.${k}`);
  };
  walk(menu, 'menu');
  return problems;
}

// ------------------------------------------------------------- in-page checks
/* Runs inside the kiosk page. Returns a list of human-readable problems. */
function pageAudit(minTarget) {
  const problems = [];
  const visible = (el) => {
    const r = el.getBoundingClientRect();
    if (!r.width || !r.height) return false;
    for (let e = el; e; e = e.parentElement) {
      const cs = getComputedStyle(e);
      if (cs.display === 'none' || cs.visibility === 'hidden' || e.hidden) return false;
    }
    // hidden behind an open dialog?
    const cx = Math.min(Math.max(r.left + r.width / 2, 0), innerWidth - 1);
    const cy = Math.min(Math.max(r.top + r.height / 2, 0), innerHeight - 1);
    const top = document.elementFromPoint(cx, cy);
    return !!top && (el.contains(top) || top.contains(el));
  };
  const label = (el) => (el.textContent || el.getAttribute('aria-label') || el.className || el.tagName).trim().replace(/\s+/g, ' ').slice(0, 40);

  // 1. touch targets
  for (const b of document.querySelectorAll('button')) {
    if (!visible(b) || b.disabled) continue;
    const r = b.getBoundingClientRect();
    if (r.width < minTarget || r.height < minTarget) problems.push(`touch target ${Math.round(r.width)}×${Math.round(r.height)}px < ${minTarget}px: "${label(b)}"`);
    if (r.right > innerWidth + 1 || r.left < -1) problems.push(`button sticks out of the screen: "${label(b)}"`);
  }

  // 2. overflowing text (descriptions are clamped on purpose and skipped)
  for (const el of document.querySelectorAll('button, h1, h2, h3, .product-name, .panel-name, .option-name, .summary-row span')) {
    if (!visible(el)) continue;
    if (el.scrollWidth > el.clientWidth + 2) problems.push(`text overflows its box: "${label(el)}"`);
  }

  // 3. contrast (WCAG 2.1 AA: 4.5:1, or 3:1 for large text)
  const parse = (c) => { const m = c.match(/[\d.]+/g); return m ? m.map(Number) : null; };
  const lum = ([r, g, b]) => {
    const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
    return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
  };
  const background = (el) => {
    for (let e = el; e; e = e.parentElement) {
      const cs = getComputedStyle(e);
      if (cs.backgroundImage && cs.backgroundImage !== 'none') return null; // gradient: can't judge reliably
      const c = parse(cs.backgroundColor);
      if (c && (c[3] === undefined || c[3] > 0.9)) return c;
    }
    return parse(getComputedStyle(document.body).backgroundColor);
  };
  const seen = new Set();
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    const text = n.textContent.trim();
    if (!/[\p{L}\p{N}]/u.test(text)) continue; // emoji / symbols only
    const el = n.parentElement;
    if (!el || seen.has(el) || !visible(el) || el.closest('[disabled], [aria-hidden="true"]')) continue;
    seen.add(el);
    const cs = getComputedStyle(el);
    const fg = parse(cs.color);
    const bg = background(el);
    if (!fg || !bg) continue;
    const [l1, l2] = [lum(fg), lum(bg)].sort((a, b) => b - a);
    const ratio = (l1 + 0.05) / (l2 + 0.05);
    const size = parseFloat(cs.fontSize);
    const large = size >= 24 || (size >= 18.66 && Number(cs.fontWeight) >= 700);
    const need = large ? 3 : 4.5;
    if (ratio < need) problems.push(`low contrast ${ratio.toFixed(2)}:1 (needs ${need}:1): "${text.slice(0, 40)}"`);
  }
  return problems;
}

// ------------------------------------------------------------------- runner
async function main() {
  fs.rmSync(OUT, { recursive: true, force: true });
  fs.mkdirSync(OUT, { recursive: true });
  const ordersDir = fs.mkdtempSync(path.join(os.tmpdir(), 'qiosk-ui-check-'));
  const report = [];
  let failures = 0;

  const textProblems = checkTexts();
  failures += textProblems.length;
  report.push('## Texts (RO / EN)\n', ...(textProblems.length ? textProblems.map((p) => `- ❌ ${p}`) : ['- ✅ all texts present in both languages']), '');

  for (const [w, h, title] of sizes) {
    const runs = [{ lang: 'ro', access: false }];
    if (w === sizes[0][0] && h === sizes[0][1]) runs.push({ lang: 'en', access: false });
    if (h > w) runs.push({ lang: 'ro', access: true });

    for (const run of runs) {
      const tag = `${w}x${h}-${run.lang}${run.access ? '-access' : ''}`;
      const args = [ROOT, '--windowed', `--size=${w}x${h}`];
      if (process.platform === 'linux' && process.getuid && process.getuid() === 0) args.unshift('--no-sandbox');
      const app = await _electron.launch({
        executablePath: require('electron'),
        args,
        env: Object.assign({}, process.env, { QIOSK_ORDERS_DIR: ordersDir }),
      });
      const page = await app.firstWindow();
      const errors = [];
      page.on('pageerror', (e) => errors.push(e.message));
      page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });

      // Fit big screens onto the real display: shrink the window, zoom out the page,
      // so the page still "sees" the full kiosk resolution.
      const zoom = await app.evaluate(({ BrowserWindow, screen }, [W, H]) => {
        const area = screen.getPrimaryDisplay().workAreaSize;
        const k = Math.max(1, W / area.width, H / area.height);
        const win = BrowserWindow.getAllWindows()[0];
        win.setContentSize(Math.round(W / k), Math.round(H / k));
        win.webContents.setZoomFactor(1 / k);
        return k;
      }, [w, h]);
      await page.waitForSelector('.pulse');
      await page.waitForFunction(([W]) => Math.abs(innerWidth - W) <= 2, [w], { timeout: 5000 }).catch(() => {});
      const vp = await page.evaluate(() => [innerWidth, innerHeight]);

      const shot = async (name) => {
        await page.waitForTimeout(450); // let entrance animations finish
        const file = `${tag}-${name}.png`;
        await page.screenshot({ path: path.join(OUT, file) });
        const problems = await page.evaluate(pageAudit, MIN_TARGET);
        return { name, file, problems };
      };

      const screens = [];
      if (run.lang === 'en') await page.click('[data-lang="en"]');
      if (run.access) await page.click('#access-btn');
      screens.push(await shot('1-welcome'));
      await page.click('.pulse', { force: true });
      await page.click('[data-dining="eat-in"]');
      await page.click('.product-card[data-product="shawarma"]');
      await page.click('[data-action="add-to-order"]');
      await page.click('.product-card[data-product="cheesy-box"]');
      await page.click('[data-meat="chicken-lamb"]');
      await page.click('[data-extra="extra-cheese"]');
      screens.push(await shot('2-product'));
      await page.click('[data-action="add-to-order"]');
      await page.waitForTimeout(1600); // toast gone
      screens.push(await shot('3-menu'));
      await page.click('#btn-checkout');
      if (await page.isVisible('#screen-payment.active')) {
        screens.push(await shot('4-payment'));
        if (await page.isVisible('[data-pay="card"]')) await page.click('[data-pay="card"]');
      }
      if (await page.isVisible('#screen-card.active')) {
        screens.push(await shot('5-card-terminal'));
        await page.click('#card-waiting [data-action="cancel-payment"]');
      }
      await app.close();

      report.push(`## ${w}×${h} · ${title} · ${run.lang.toUpperCase()}${run.access ? ' · ♿ accessibility mode' : ''}\n`);
      if (vp[0] !== w || vp[1] !== h) report.push(`- ⚠️ page viewport was ${vp[0]}×${vp[1]} (zoom ${(1 / zoom).toFixed(2)})`);
      for (const e of errors) { report.push(`- ❌ JavaScript error: ${e}`); failures++; }
      for (const s of screens) {
        const unique = [...new Set(s.problems)];
        failures += unique.length;
        report.push(`- ${unique.length ? '❌' : '✅'} **${s.name}** — [${s.file}](${s.file})`);
        unique.forEach((p) => report.push(`  - ${p}`));
      }
      report.push('');
      process.stdout.write(`${tag}: ${screens.reduce((n, s) => n + new Set(s.problems).size, 0) + errors.length} problem(s)\n`);
    }
  }

  const header = `# Kiosk UI check\n\n${failures ? `❌ ${failures} problem(s) found` : '✅ no problems found'} · touch-target minimum ${MIN_TARGET}px · ${new Date().toISOString()}\n\n`;
  fs.writeFileSync(path.join(OUT, 'report.md'), header + report.join('\n') + '\n');
  fs.rmSync(ordersDir, { recursive: true, force: true });
  console.log(`\n${failures ? `❌ ${failures} problem(s)` : '✅ no problems'} — see ui-check/report.md and the screenshots in ui-check/`);
  process.exit(failures ? 1 : 0);
}

main().catch((err) => { console.error(err); process.exit(2); });
