// T5-29 · Final con control TÁCTIL en EMULACIÓN (CDP touch; sin teclado): 390×844 y 844×390, aproximación a 9 m/s (velocidad
// inicial declarada) con el pulgar «arriba» en el stick (T+) y SALTO tocando el botón real cuando el juego abre la ventana.
// Comprueba: triple con recepción en la mesa 2/2 por layout, el botón SALTO se marca «caliente» (clase hot) durante la
// ventana, y los dedos quedan libres al terminar. Emulación ≠ teléfono (G8-T).
import { Report, runTest, launch, openGame, clickStart, sleep, fixture, VIEWPORTS, SAVE_20 } from './lib.mjs';
const R = new Report('final-touch');
await runTest(R, async () => {
  const b = await launch();
  try {
    for (const [lay, vp] of [['vertical', VIEWPORTS.phone], ['horizontal', VIEWPORTS.phoneLand]]) {
      const page = await openGame(b, R, { viewport: vp, save: SAVE_20 }); await clickStart(page); await sleep(1000);
      await page.evaluate(() => { document.getElementById('hint').hidden = true; window.__bkFinalLog = []; });
      const cdp = await page.target().createCDPSession();
      const touch = (type, pts) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts.map(([x, y, id]) => ({ x, y, id, radiusX: 8, radiusY: 8, force: 1 })) });
      const rect = await page.evaluate(() => { const r = document.getElementById('stick-zone').getBoundingClientRect(); return [r.x, r.y, r.width, r.height]; });
      const ox = Math.round(rect[0] + Math.min(80, rect[2] * 0.45)), oy = Math.round(rect[1] + rect[3] - 110);
      const jb = await page.evaluate(() => { const r = document.getElementById('btn-jump').getBoundingClientRect(); return [Math.round(r.x + r.width / 2), Math.round(r.y + r.height / 2)]; });
      const carAngles = () => page.evaluate(() => window.__bk.cars.cars.map((c) => { let a = Math.atan2(c.pos.x, -c.pos.z); if (a < 0) a += 2 * Math.PI; return a; }));
      const ahead = (a, t) => ((a - t) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI);
      const res = [];
      for (let k = 0; k < 2; k++) {
        for (let i = 0; i < 400; i++) { const a = await carAngles(); if (a.every((q) => [3 * Math.PI / 2, Math.PI / 2].every((c) => ahead(q, c) > 2.4 && ahead(q, c) < 2 * Math.PI - 0.6))) break; await sleep(40); }
        const n0 = await page.evaluate(() => window.__bkFinalLog.length);
        await fixture(page, R, `${lay}: ancla final.approach a 9 m/s`, () => { const g = window.__bk, a = g.manifest.get('final.approach'); g.input.clear(); g.skater.teleport(a.pos.clone(), a.heading, 'ride'); g.skater.vel.set(Math.sin(a.heading) * 9, 0, Math.cos(a.heading) * 9); g.rig.snapBehind(g.skater); return {}; });
        await touch('touchStart', [[ox, oy, 1]]); await sleep(30); await touch('touchMove', [[ox, oy - 56, 1]]);
        let hot = false, pressed = false;
        for (let i = 0; i < 600; i++) { const q = await page.evaluate(() => { const g = window.__bk, ft = g.activities[5]; return { inW: ft.inWindow(), ph: ft.phase, hot: document.getElementById('btn-jump').classList.contains('hot') }; });
          if (q.inW && q.hot) hot = true;
          if (!pressed && q.inW) { await touch('touchStart', [[ox, oy - 56, 1], [jb[0], jb[1], 2]]); await sleep(60); await touch('touchEnd', [[jb[0], jb[1], 2]]); pressed = true; }
          if (q.ph === 'flight' || q.ph === 'failed') break; await sleep(6); }
        await touch('touchEnd', []);
        let r = null; for (let i = 0; i < 160; i++) { r = await page.evaluate((n0) => { const L = window.__bkFinalLog; return L.length > n0 ? L[L.length - 1] : null; }, n0); if (r?.landAt) break; await sleep(50); }
        const owners = await page.evaluate(() => window.__bk.input.activeOwners);
        const row = { lay, ok: !!r?.tripleOk && !!r?.onTable && !!r?.armed, hot, pressed, owners, ground: r?.ground, windowS: r?.windowS };
        res.push(row); console.log(JSON.stringify(row));
        for (let i = 0; i < 120; i++) { if (await page.evaluate(() => window.__bk.mode) === 'preview') break; await sleep(100); }
        for (let i = 0; i < 30; i++) { const md = await page.evaluate(() => window.__bk.mode); if (md === 'explore') break; if (md === 'preview') await page.keyboard.press('Escape'); await sleep(300); }
        await sleep(2000);
      }
      R.check(res.every((x) => x.ok), `${lay}: triple con SALTO táctil y recepción en la mesa ${res.filter((x) => x.ok).length}/${res.length}`, 'emulation', res);
      R.check(res.every((x) => x.hot), `${lay}: el botón SALTO se marca durante la ventana`, 'emulation', res.map((x) => x.hot));
      R.check(res.every((x) => x.owners.length === 0), `${lay}: dedos liberados al terminar`, 'emulation', res.map((x) => x.owners));
      await page.close();
    }
    R.pendingHuman('Final jugado en el teléfono del usuario (G8-T)');
  } finally { await b.close(); }
}, { timeoutMs: 900000 });
