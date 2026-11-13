// V10.6 · sonda (no es guardián): CE-01 de it8/entradas-cortes 3 veces, con la fase del grind y el registro del juego en la ventana de medida,
// para saber si el giro que mide viene del equilibrio pegado (H8-13) o de la recolocación tras una caída del grind.
import { Report, runTest, launch, sleep, arg } from '../v8/lib.mjs';
import { open8, start8, dev, S20, toAct, until, tapOrClick, center, Fingers } from '../it8/lib8.mjs';
const R = new Report('v106-sonda-ce01', { task: arg('task', 'V10-6') });
await runTest(R, async () => { const b = await launch();
  try { for (let k = 0; k < 3; k++) { const page = await open8(b, R, dev('ip14'), 'h', { save: S20 }); await start8(page, true); await sleep(1200);
      await toAct(page, 'act.skateTutorial'); await until(page, () => !document.getElementById('prompt').hidden, 4000); await tapOrClick(page, '#btn-action', true); await until(page, () => document.body.classList.contains('grind'), 6000); await sleep(1500);
      const F = await new Fingers(page).init(); const L = await center(page, '#btn-lean-l');
      await F.down(3, L.x, L.y); await sleep(300); await F.tap('#btn-pause'); await sleep(500); await F.up(3); await sleep(300);
      await tapOrClick(page, '#btn-resume', true); await sleep(500);
      const st = await page.evaluate(() => { const g = window.__bk, a = g.activities.find((x) => x.id === 'skateTutorial'); const r = { phase: a.phase, busy: a.busy, x: g.input.read().x, l0: g.log.length }; for (const q of g.activities) if (q.busy) q.cancel?.(); return r; });
      await sleep(800); const h0 = await page.evaluate(() => window.__bk.skater.heading); await sleep(1500);
      const fin = await page.evaluate((l0) => { const g = window.__bk, a = g.activities.find((x) => x.id === 'skateTutorial'); return { h1: g.skater.heading, phase: a.phase, x: g.input.read().x, log: g.log.slice(l0 - 2) }; }, st.l0);
      R.note({ k, st, giro: +(fin.h1 - h0).toFixed(3), fin }); await page.close(); }
    R.check(true, 'sonda', 'unit');
  } finally { await b.close(); } }, { timeoutMs: 300000 });
