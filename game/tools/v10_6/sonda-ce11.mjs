// V10.6 · sonda (no es guardián): repite CE-11 y enseña el registro de dedos de input.ts para ver qué pasa con el del joystick.
import { Report, runTest, launch, sleep, arg } from '../v8/lib.mjs';
import { open8, start8, dev, S20, toAct, until, Fingers } from '../it8/lib8.mjs';
const R = new Report('v106-sonda-ce11', { task: arg('task', 'V10-6') });
await runTest(R, async () => { const b = await launch();
  try { const page = await open8(b, R, dev('ip14'), 'h', { save: S20 }); await start8(page, true); await sleep(1200);
    await toAct(page, 'act.pantherTalk'); await until(page, () => !document.getElementById('prompt').hidden, 4000);
    const F = await new Fingers(page).init(); await F.stick(180, 0.2); await sleep(100);
    const l0 = await page.evaluate(() => window.__bk.input.log.length);
    await F.tap('#btn-action'); await sleep(1500); await until(page, () => !document.getElementById('dialog').hidden, 6000);
    for (let i = 0; i < 4 && await page.evaluate(() => !document.getElementById('dialog').hidden); i++) { await F.tap('#dialog-ok'); await sleep(700); }
    await until(page, () => window.__bk.mode === 'explore', 4000);
    const mid = await page.evaluate(() => ({ owners: window.__bk.input.activeOwners, mode: window.__bk.mode }));
    await F.stick(0, 1); await sleep(1500);
    const r = await page.evaluate((l0) => ({ log: window.__bk.input.log.slice(l0 - 3), owners: window.__bk.input.activeOwners, move: window.__bk.input.read() }), l0);
    R.note({ mid, ...r }); R.check(true, 'sonda', 'unit'); await F.close();
  } finally { await b.close(); } }, { timeoutMs: 200000 });
