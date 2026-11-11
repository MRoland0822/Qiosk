'use strict';
/*
 * Card terminal connection.
 *
 * Every terminal brand talks differently, so the kiosk supports "drivers",
 * chosen with config.json -> payment.terminal:
 *
 *   "simulator"  No hardware. Waits a few seconds and approves (or declines,
 *                see payment.simulatorOutcome). For testing and demos.
 *
 *   "file"       Folder handshake, for terminals driven by a small bridge
 *                program (most ECR / POS integrations can do this):
 *                  1. the kiosk writes  order-0001-total.txt   (amount, e.g. "59.00")
 *                  2. the bridge charges that amount on the terminal
 *                  3. the bridge writes order-0001-payment.txt with
 *                       APPROVED            on the first line, or
 *                       DECLINED            (optional reason on the second line)
 *                The kiosk waits for that file (up to payment.timeoutSeconds).
 *
 * A driver is just: charge(order, signal) -> Promise<{ approved, message }>.
 * To support a terminal's own SDK/API later, add a driver here.
 */
const fs = require('fs');

function sleep(ms, signal) {
  return new Promise((resolve, reject) => {
    if (signal && signal.aborted) return reject(abortError());
    const t = setTimeout(resolve, ms);
    if (signal) signal.addEventListener('abort', () => { clearTimeout(t); reject(abortError()); }, { once: true });
  });
}

function abortError() {
  const e = new Error('Payment cancelled');
  e.name = 'AbortError';
  return e;
}

const drivers = {
  simulator(cfg) {
    const delay = (cfg.simulatorDelaySeconds ?? 4) * 1000;
    return {
      async charge(_order, signal) {
        await sleep(delay, signal);
        let outcome = cfg.simulatorOutcome || 'approve';
        if (outcome === 'random') outcome = Math.random() < 0.8 ? 'approve' : 'decline';
        return outcome === 'decline'
          ? { approved: false, message: 'Card declined (simulator)' }
          : { approved: true, message: 'Approved (simulator)' };
      },
    };
  },

  file(cfg) {
    const timeout = (cfg.timeoutSeconds || 120) * 1000;
    const poll = 300;
    return {
      async charge(order, signal) {
        const deadline = Date.now() + timeout;
        while (Date.now() < deadline) {
          await sleep(poll, signal);
          let text;
          try { text = fs.readFileSync(order.paymentFile, 'utf8'); } catch (_) { continue; }
          const [status = '', reason = ''] = text.trim().split(/\r?\n/);
          const approved = /^(APPROVED|OK|SUCCESS|PAID)$/i.test(status.trim());
          return { approved, message: reason.trim() || status.trim() };
        }
        return { approved: false, message: 'No response from the card terminal' };
      },
    };
  },
};

function createTerminal(cfg = {}) {
  const name = cfg.terminal || 'simulator';
  const make = drivers[name];
  if (!make) throw new Error(`Unknown payment terminal driver: ${name}`);
  return Object.assign({ name }, make(cfg));
}

module.exports = { createTerminal };
