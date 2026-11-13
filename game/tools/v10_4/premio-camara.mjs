// V10.4 R13 · guardián (usuario: «en FG al acabar la actividad… aparece la patata pero no hay enfoque de cámara enseñando dónde está»): la patata
// premio aparece con una charla abierta que dura 10 s (como la celebración + la charla de Bella en FG); al cerrarla, la cámara hace su plano
// mirando la patata (antes solo esperaba 8 s y el plano se perdía). En las cinco zonas.
import { Report, runTest, launch, openGame, clickStart, sleep } from '../v8/lib.mjs';
import { FRESH } from '../v10_2/lib102.mjs';
const R = new Report('premio-camara');
const ZONES = ['no_me_guillo', 'nosvamosdeaqui', 'yinyang', 'tratratra', 'fashion_girl'];
await runTest(R, async () => {
  const b = await launch();
  try {
    for (const z of ZONES) {
      const save = { ...FRESH, collected: ['visible', 'medium', 'hidden'].map((k) => `${z}.${k}`) };
      const page = await openGame(b, R, { save }); await clickStart(page); await sleep(2000);
      await page.evaluate(() => { window.__bk.d2.say({ habla: 'kat', texto: 'Charla larga de prueba.', kat: 'habla', kroak: 'espera' }); });
      await sleep(300);
      const r0 = await page.evaluate((z) => { const g = window.__bk; g.revealReward(z); return g.rewardShots; }, z);
      await sleep(10000);
      await page.evaluate(() => window.__bk.d2.close()); await sleep(1200);
      const r1 = await page.evaluate((z) => { const g = window.__bk, p = g.pickups.find((x) => x.id === `${z}.activity`), n = p.base.clone().project(g.rig.cam);
        return { shots: g.rewardShots, mode: g.rig.mode, ndc: [+n.x.toFixed(2), +n.y.toFixed(2), +n.z.toFixed(3)] }; }, z);
      R.check(r1.shots > r0 && r1.mode === 'scripted' && Math.abs(r1.ndc[0]) < 0.5 && Math.abs(r1.ndc[1]) < 0.6 && r1.ndc[2] < 1, `${z}: tras una charla de 10 s, la cámara enseña la patata premio`, 'input', { r0, ...r1 });
      await page.close();
    }
  } finally { await b.close(); }
}, { timeoutMs: 400000 });
