// T5-03/T5-11/T5-12/T5-13 · Capturas de revisión del cluster NMG con cámara directa (fixture de cámara; el juego no cambia):
// laterales a 0,45 m de plataforma, corazón y quarter, con y sin colliders superpuestos (alambre rojo), y planos generales
// (llegada, charla, U). Se usan para pares A/V5 y con las referencias. La revisión es visual (se anota qué se miró).
import { Report, runTest, launch, openGame, clickStart, sleep, directShot, arg } from './lib.mjs';
const R = new Report('nmg-shots');
const th = 33 * Math.PI / 180, O = [33.4 * Math.sin(th), -33.4 * Math.cos(th)], X = [Math.cos(th), Math.sin(th)], Z = [-Math.sin(th), Math.cos(th)];
const V = (x, z, h = 0) => [O[0] + X[0] * x + Z[0] * z, h, O[1] + X[1] * x + Z[1] * z];
const SHOTS = {
  plataforma_lateral: [V(0, 9, 0.45), V(0, 0, 0.45), 70],
  corazon_lateral: [V(-3.7, 6.5, 0.45), V(-3.7, 1.2, 0.45), 60],
  quarter_lateral: [V(12.5, 8, 0.45), V(12.5, 1.4, 0.45), 65],
  u_lateral: [V(15, 6.6, 0.45), V(9.6, 6.6, 0.45), 60],
  general_llegada: [V(-14, 2.5, 1.7), V(2, 2, 0.6), 75],
  charla_pantera: [V(-6.5, -3.5, 1.75), V(-4.6, 0.6, 0.7), 60],
};
await runTest(R, async () => {
  const b = await launch();
  try {
    const page = await openGame(b, R); await clickStart(page); await sleep(2500);
    for (const [n, [p, t, f]] of Object.entries(SHOTS)) {
      await directShot(page, R, n, p, t, f);
      if (n.endsWith('lateral')) await directShot(page, R, n + '_colliders', p, t, f, { debugCols: true });
    }
    R.check(true, 'capturas NMG generadas (revisión visual aparte)', 'vision');
  } finally { await b.close(); }
});
