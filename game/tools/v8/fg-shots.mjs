// V6 · capturas fijas de FASHION GIRL en el marco v10 (W radial, S deck→pista). Vistas equivalentes a las referencias:
// general ¾ (FG-001/003), cenital (FG-002), perfil (FG-004/v2-01), túnel (v2-02), pista, cuñas, escalera. Con
// `--cols` añade la versión con colisiones superpuestas. Uso: node game/tools/v6/fg-shots.mjs --task T6-02 --label b1 [--cols]
import { Report, runTest, launch, openGame, clickStart, sleep, directShot, arg, flag } from './lib.mjs';
const R = new Report('fg-shots');
const th = (108 + 9) * Math.PI / 180, /* V10 (preparación): marco FG con el giro de corona +9° (Bola de Oro §07), como world/fg.ts */ O = [30.5 * Math.sin(th), -30.5 * Math.cos(th)], W = [Math.sin(th), -Math.cos(th)], S = [-Math.cos(th), -Math.sin(th)];
export const V = (w, s, h = 0) => [O[0] + W[0] * w + S[0] * s, h, O[1] + W[1] * w + S[1] * s];
const SHOTS = {
  general_v9: [V(10.5, -19, 13), V(0, -1.5, 0.3), 70],
  general_v9_lejos: [V(14, -24, 19), V(0, 1.5, 0), 72],
  cenital: [V(0.01, 2.6, 46), V(0, 2.5, 0), 62],
  perfil: [V(-15, 0.5, 1.8), V(0, 0.5, 1.0), 80],
  usuario1_ledge: [V(-1.2, -17.2, 2.3), V(0.2, -11.6, 0.7), 62],
  usuario2_deck: [V(0.9, -15.0, 1.25), V(0.5, -10.0, 1.45), 66],
  tunel_boca: [V(6.4, -8.2, 1.4), V(2.8, -9.0, 0.6), 62],
  tunel_interior: [V(2.2, -9.0, 0.9), V(-2.2, -9.0, 0.3), 80],
  u_desde_deck: [V(0, -9.6, 3.4), V(0, 0, 0.6), 74],
  pista: [V(1.75, -0.5, 3.6), V(0, 6.0, 1.6), 68],
  cunas: [V(1.5, 21.0, 3.2), V(0, 13.8, 0.9), 62],
  tablas: [V(1.6, -13.2, 0.9), V(1.6, -10.55, 0.45), 42],
  lado_interior: [V(-9.5, -3.2, 1.9), V(-2.8, -3.2, 0.8), 76],   // R3: grafitis del lado del paseo interior
  lado_exterior: [V(9.5, -2.0, 1.9), V(2.8, -2.0, 0.8), 76],     // R3: grafitis del lado exterior
  barandilla: [V(1.2, -13.0, 2.6), V(0.2, -9.6, 2.2), 60],
  graf_mona: [V(-6.4, -10.2, 1.4), V(-2.8, -9.0, 0.95), 50],
  graf_ai: [V(-6.0, -3.6, 1.1), V(-2.8, -3.6, 0.5), 50],
  graf_sapo: [V(6.0, -5.0, 1.1), V(2.8, -5.0, 0.5), 50],
  graf_skate: [V(5.0, 1.9, 0.9), V(2.8, 1.9, 0.45), 50],
  graf_gato: [V(-2.4, -15.4, 0.9), V(-2.6, -13.1, 0.25), 50],
  reparto_interior: [V(-12.5, -3.0, 3.2), V(-1.0, -3.5, 0.6), 72],
  cunas_cerca: [V(-6.2, 10.6, 1.6), V(-2.0, 13.8, 0.4), 60],   // R5: rodadura de las cuñas (imagen del usuario)
  reparto_exterior: [V(12.5, -3.0, 3.2), V(1.0, -3.5, 0.6), 72],
};

const only = arg('only', null);
await runTest(R, async () => {
  const b = await launch();
  try {
    const page = await openGame(b, R); await clickStart(page); await sleep(3500);
    await page.evaluate((p) => { const g = window.__bk, T = window.__bkTHREE; g.skater.teleport(new T.Vector3(p[0], 0, p[2]), 0, 'walk'); g.rig.snapBehind(g.skater); for (const id of ['bella']) g.loadNpc?.(id); }, V(6.5, -4, 0));
    await sleep(2500);
    for (const [n, [p, t, f]] of Object.entries(SHOTS)) {
      if (only && !only.split(',').includes(n)) continue;
      await directShot(page, R, n, p, t, f);
      if (flag('cols')) await directShot(page, R, n + '_cols', p, t, f, { debugCols: true });
    }
    R.check(true, 'capturas FG generadas (revisión visual aparte)', 'vision');
  } finally { await b.close(); }
});
