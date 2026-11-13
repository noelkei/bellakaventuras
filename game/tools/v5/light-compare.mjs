// T5-26 · Luz (DT-27, decisión A1: cálida de tarde en TODO el mapa). Mismas cámaras fijas en varias zonas con cada ajuste
// (?bklight=<id>) + llegada con la cámara de juego; rejilla comparativa y medida del coste (sin texturas nuevas: 0 bytes).
import fs from 'node:fs';
import { Report, runTest, launch, openGame, clickStart, sleep, directShot, SAVE_20, arg } from './lib.mjs';
const R = new Report('light-compare');
const IDS = arg('ids', 'mediodia,tarde_a,tarde_b,tarde_c').split(',');
const SHOTS = { nmg_general: [[5.7, 16.36, -8.08], [17.17, 0.3, -27.94], 55], centro: [[-10, 9, -20], [0, 0.5, 0], 60], fashion_girl: [[14, 6, 4], [28, 1, 12], 60], yinyang: [[-14, 5, 2], [-28, 1, 8], 60], tratratra: [[-4, 6, 16], [-13, 2, 28], 60] };
await runTest(R, async () => {
  const b = await launch();
  try {
    for (const id of IDS) {
      const page = await openGame(b, R, { viewport: { width: 1200, height: 800 }, save: SAVE_20, query: `?bktest=1&bklight=${id}` }); await clickStart(page); await sleep(2500);
      const got = await page.evaluate(() => window.__bk.light?.id); R.note(`${id}: ajuste servido ${got}`);
      for (const [n, [p, t, f]] of Object.entries(SHOTS)) await directShot(page, R, `${id}_${n}`, p, t, f);
      await page.evaluate(() => { const g = window.__bk, m = g.park.manifest.spawn; g.skater.teleport(m.pos, m.heading, 'walk'); g.rig.snapBehind(g.skater); for (const x of ['hud', 'touch']) { const e = document.getElementById(x); if (e) e.style.visibility = 'hidden'; } });
      await sleep(1500); await R.shot(page, `${id}_llegada`);
      await page.close();
    }
    R.check(true, 'capturas de luz generadas (revisión visual)', 'vision');
  } finally { await b.close(); }
});
