// R6 · Capturas de la VEGETACIÓN de NO ME GUILLO con cámara directa (HUD oculto), mismas posiciones en cualquier build
// (antes/después): las 4 islas de palmera (a la altura de los ojos, 3,6 m), la franja del paseo exterior, el borde exterior
// (arbustos florales), y dos generales. Posiciones calculadas del contrato (polar r/θ del layout de nmg_kit.json, leído
// del juego), no de la vegetación: el mismo encuadre sirve para comparar builds.
import { Report, runTest, launch, openGame, clickStart, sleep, directShot, arg } from '../lib.mjs';
const R = new Report('veg-shots');
await runTest(R, async () => {
  const b = await launch();
  try {
    const page = await openGame(b, R, { viewport: { width: 1200, height: 800 } }); await clickStart(page); await sleep(2500);
    const L = await page.evaluate(() => { const P = (r, th) => [r * Math.sin(th * Math.PI / 180), -r * Math.cos(th * Math.PI / 180)];
      return { palms: [[36.8, 2.5], [36.55, 63.0], [26.7, 12.0], [26.7, 62.0]].map(([r, t]) => [...P(r, t), r, t]), row: P(37.3, 31.3), rowT: 31.3,
        edge: [[43.8, 8.0], [43.8, 41.0], [43.8, 64.5]].map(([r, t]) => [...P(r, t), r, t]), P: P(33.4, 33) }; });
    const P = (r, th) => [r * Math.sin(th * Math.PI / 180), -r * Math.cos(th * Math.PI / 180)];
    for (const [i, [x, z, r, t]] of L.palms.entries()) {   // isla: cámara hacia el centro del parque, 3,6 m, ojos
      const c = P(r - 3.6, t + 4);
      await directShot(page, R, `isla_${i + 1}`, [c[0], 1.5, c[1]], [x, 0.55, z], 55);
      await directShot(page, R, `isla_${i + 1}_palmera`, [c[0] * 1.0, 1.7, c[1]], [x, 3.2, z], 75);
    }
    { const c = P(35.0, L.rowT - 4); await directShot(page, R, 'paseo_franja', [c[0], 1.4, c[1]], [L.row[0], 0.3, L.row[1]], 60); }
    for (const [i, [x, z, r, t]] of L.edge.entries()) { const c = P(r - 4.2, t - 6); await directShot(page, R, `borde_floral_${i + 1}`, [c[0], 1.6, c[1]], [x, 0.5, z], 55); }
    { const c = P(18, 40); await directShot(page, R, 'general_alta', [c[0], 16, c[1]], [L.P[0], 0, L.P[1]], 70); }
    { const c = P(28.5, 52); await directShot(page, R, 'general_baja', [c[0], 2.4, c[1]], [P(36, 20)[0], 1.2, P(36, 20)[1]], 72); }
    R.check(true, 'capturas de vegetación generadas', 'vision');
  } finally { await b.close(); }
}, { timeoutMs: 180000 });
