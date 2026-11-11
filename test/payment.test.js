'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { createTerminal } = require('../src/payment');

const order = () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'qiosk-pay-'));
  return { paymentFile: path.join(dir, 'order-0001-payment.txt') };
};

test('simulator approves or declines', async () => {
  assert.deepStrictEqual((await createTerminal({ simulatorDelaySeconds: 0 }).charge(order())).approved, true);
  const r = await createTerminal({ simulatorDelaySeconds: 0, simulatorOutcome: 'decline' }).charge(order());
  assert.strictEqual(r.approved, false);
});

test('file driver reads the answer of the terminal bridge', async () => {
  const t = createTerminal({ terminal: 'file', timeoutSeconds: 5 });
  const o1 = order();
  setTimeout(() => fs.writeFileSync(o1.paymentFile, 'APPROVED\n'), 200);
  assert.strictEqual((await t.charge(o1)).approved, true);

  const o2 = order();
  setTimeout(() => fs.writeFileSync(o2.paymentFile, 'DECLINED\r\nInsufficient funds\r\n'), 200);
  assert.deepStrictEqual(await t.charge(o2), { approved: false, message: 'Insufficient funds' });
});

test('file driver times out and can be cancelled', async () => {
  const r = await createTerminal({ terminal: 'file', timeoutSeconds: 0.5 }).charge(order());
  assert.strictEqual(r.approved, false);

  const ac = new AbortController();
  setTimeout(() => ac.abort(), 100);
  await assert.rejects(createTerminal({ terminal: 'file' }).charge(order(), ac.signal), { name: 'AbortError' });
});

test('unknown driver is an error', () => {
  assert.throws(() => createTerminal({ terminal: 'nope' }));
});
