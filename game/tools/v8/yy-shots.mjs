// V8 · capturas de revisión de YINYANG con cámara DIRECTA (no acreditan jugabilidad). Vistas comparables a las seis vistas
// elegidas «Menta y rosa» (01, 04–08), al detalle M01, a T02 y al rótulo. `--final` muestra el grafiti terminado (como en las
// referencias); sin él, el estado inicial (estarcido). `--cols` superpone las colisiones.
// Uso: node game/tools/v8/yy-shots.mjs --url dev --task YY8-09 [--label x] [--final] [--cols] [--only v01,m01]
import { Report, runTest, launch, openGame, clickStart, directShot, arg, flag, sleep } from './lib.mjs';
import { W } from './yy-lib.mjs';
import path from 'node:path';
/** [posición local (x, v, h), objetivo local, hfov] */
export const VIEWS = {
  v01: [[0.6, 20.6, 13.5], [0.6, 30.9, -1.2], 62],      // 01 propuesta: alta desde el paseo interior
  v04: [[0.3, 30.7, 31], [0.3, 30.75, -2], 40],          // 04 cenital
  v05: [[-11.5, 25.2, 5.2], [0.8, 31.6, -1.2], 72],      // 05 lateral desde la entrada E1
  v06: [[13.6, 24.2, 9.5], [-0.5, 31.2, -1.6], 62],      // 06 lateral opuesto
  v07: [[1.4, 26.5, -0.75], [1.4, 33.5, 1.2], 86],       // 07 interior (N3) hacia el parque
  v08: [[1.4, 43.0, 13.5], [1.4, 30.4, -1.2], 60],       // 08 parque (paseo exterior) hacia el interior
  m01: [[0.2, 38.9, 1.7], [-3.0, 35.95, 0.3], 46],    // M01 mobiliario
  t02: [[6.6, 26.7, 4.6], [1.4, 31.9, 3.5], 50],          // T02 torre (frente-derecha)
  logo: [[1.1, 24.4, 6.6], [1.1, 28.6, -2.5], 66],        // rótulo Bellakaciones
  e1: [[-10.6, 33.6, 2.6], [-7.0, 31.2, -1.0], 70],       // detalle E1
  t1top: [[4.2, 29.0, 8.4], [1.4, 31.9, 6.4], 40],        // remate de T1 (frente-derecha, alto)
  t1full: [[10.6, 22.6, 4.6], [1.4, 31.9, 3.8], 52],       // T1 entera frente-derecha (como T02)
};
const R = new Report('yy-shots');
await runTest(R, async () => {
  const browser = await launch();
  try {
    const page = await openGame(browser, R); await clickStart(page);
    await page.evaluate((p) => { const g = window.__bk, T = window.__bkTHREE; g.skater.teleport(new T.Vector3(p[0], 0, p[2]), 0); }, W(-14, 38));
    R.fixture('ANMI fuera de cuadro (deck exterior, junto a NV)', W(-14, 38));
    if (flag('final')) { await page.evaluate(() => window.__bk.activities[2].showFinal()); R.fixture('grafiti mostrado terminado (estado de las referencias)'); }
    await page.evaluate(() => window.__bk.loadNpc?.('rana')); await sleep(3500);
    const info = await page.evaluate(() => { const g = window.__bk, m = g.manifest; return { manifestErrors: m.validate(), yyProps: g.park.yyProps, colliders: g.park.stats.colliders, log: g.log.slice(-8) }; });
    R.measure('info', info);
    R.check(info.manifestErrors.length === 0, 'manifiesto sin errores', 'static', info.manifestErrors);
    const only = arg('only'); const names = only ? only.split(',') : Object.keys(VIEWS); const files = {};
    for (const n of names) { const [p, t, f] = VIEWS[n]; files[n] = path.basename(await directShot(page, R, n, W(...p), W(...t), f, { debugCols: flag('cols') })); }
    R.measure('files', files);
  } finally { await browser.close(); }
});
