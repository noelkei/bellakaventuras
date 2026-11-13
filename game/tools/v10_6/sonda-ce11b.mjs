// V10.6 · sonda (no es guardián): CE-11 paso a paso (charla, «Vale», modo, dueños de los dedos).
import { Report, runTest, launch, sleep, arg } from '../v8/lib.mjs';
import { open8, start8, dev, S20, toAct, until, Fingers } from '../it8/lib8.mjs';
const R = new Report('v106-sonda-ce11b', { task: arg('task', 'V10-6') });
const st = (page, k) => page.evaluate((k) => { const g = window.__bk, d = document.getElementById('dialog'); return { k, mode: g.mode, dlg: !d.hidden, txt: d.hidden ? '' : document.getElementById('dialog-text').textContent.slice(0, 30), owners: g.input.activeOwners, prompt: !document.getElementById('prompt').hidden, log: g.input.log.slice(-3) }; }, k);
await runTest(R, async () => { const b = await launch();
  try { const page = await open8(b, R, dev('ip14'), 'h', { save: S20 }); await start8(page, true); await sleep(1200);
    await toAct(page, 'act.pantherTalk'); await until(page, () => !document.getElementById('prompt').hidden, 4000);
    const F = await new Fingers(page).init(); await F.stick(180, 0.2); await sleep(100); const s = [await st(page, 'stick')];
    await F.tap('#btn-action'); await sleep(300); s.push(await st(page, 'tras-accion'));
    await until(page, () => !document.getElementById('dialog').hidden, 6000); s.push(await st(page, 'charla'));
    await page.evaluate(() => { window.__ev = []; for (const t of ['pointerdown', 'pointerup', 'pointercancel', 'click']) document.addEventListener(t, (e) => window.__ev.push(`${t}:${e.pointerId ?? ''}:${e.target?.id || e.target?.tagName}`), true); });
    const top = await page.evaluate(() => { const r = document.getElementById('dialog-ok').getBoundingClientRect(), e = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2); return { r: [r.left, r.top, r.width, r.height].map(Math.round), en: e?.id || e?.tagName }; });
    const ok = await page.evaluate(() => { document.getElementById('dialog-ok').click(); return true; }); await sleep(700); s.push({ ...(await st(page, 'tras-vale')), tapOk: ok, top, ev: await page.evaluate(() => window.__ev) });
    await sleep(1500); s.push(await st(page, 'luego')); await F.stick(0, 1); await sleep(1200); s.push({ ...(await st(page, 'tras-mover')), move: await page.evaluate(() => window.__bk.input.read()) });
    R.note(s); R.check(true, 'sonda', 'unit'); await F.close();
  } finally { await b.close(); } }, { timeoutMs: 200000 });
