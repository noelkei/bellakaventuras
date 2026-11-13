// V4-CAR-05 · Coches y limo SERVIDOS (derivados V4) en el juego: carga del modelo (no proxy), ruedas animadas que giran
// en el sentido de la marcha, rótulo en ambos lados, y capturas con cámara de juego (coche en la pista a 20/20, limo en
// el puente de TRATRATRA). Fixture declarada: guardado 20/20 con la revelación vista.
import { Report, runTest, launch, openGame, clickStart, directShot, sleep } from './lib.mjs';
const ZONES = ['no_me_guillo', 'nosvamosdeaqui', 'yinyang', 'tratratra', 'fashion_girl'];
const save = { version: 4, collected: ZONES.flatMap((z) => ['visible', 'medium', 'hidden', 'activity'].map((k) => `${z}.${k}`)), activities: { pantherTalk: true, skateTutorial: true, graffiti: true, bridgeTalk: true, danceCombo: true }, bridgeReached: true, finalDone: false, finalProof: null, revealSeen: true, checkpoint: null, checkpointRevision: 4, partials: { tutorialStep: 0, tutorialStarted: false, bridgeRest: 4, graffitiMask: null, graffitiCheck: 0, danceRounds: 0 }, hints: ['basic'], settings: {} };
const R = new Report('CAR-05', 'vehicles-shots');
await runTest(R, async () => {
  const browser = await launch();
  try {
    const page = await openGame(browser, R, { save });
    await clickStart(page); await sleep(2500);
    const st = await page.evaluate(() => {
      const g = window.__bk, C = g.cars;
      const names = []; C.cars[0].g.traverse((o) => { if (o.name) names.push(o.name); });
      const w = C.cars[0].wheels.map((x) => x.rotation.z);
      let limo = null; g.park.root.traverse((o) => { if (!limo && /^PROP_limo/.test(o.name)) limo = o; });
      return { active: C.active, wheels: C.cars[0].wheels.length, names: names.filter((n) => /wheel|letter|car_body/.test(n)), w0: w, limo: !!limo, limoVisible: !!limo?.visible };
    });
    await sleep(600);
    const w1 = await page.evaluate(() => window.__bk.cars.cars[0].wheels.map((x) => x.rotation.z));
    R.check(st.active && st.wheels === 4 && st.names.includes('car_body') && st.names.filter((n) => /lettering/.test(n)).length === 2, 'coche V4 cargado: carrocería, 4 ruedas y rótulo en ambos lados', 'static', st);
    R.check(w1.every((v, i) => Math.abs(v - st.w0[i]) > 0.5), 'las ruedas giran mientras el coche avanza', 'input', { w0: st.w0, w1 });
    R.check(st.limo && st.limoVisible, 'limo V4 cargada y visible (no proxy)', 'static', { limo: st.limo });
    // capturas: coche desde el borde de la pista (cámara de jugador) y limo desde el pie de la escalera de TT
    await page.evaluate(() => { window.__bk.paused = true; }); await sleep(300);   // primero se congela la simulación
    const P = await page.evaluate(() => { const g = window.__bk, T = window.__bkTHREE, c = g.cars.cars[0]; let limo = null; g.park.root.traverse((o) => { if (!limo && /^PROP_limo/.test(o.name)) limo = o; }); const lp = new T.Box3().setFromObject(limo).getCenter(new T.Vector3()); return { car: [c.pos.x, c.pos.z], limo: [lp.x, lp.y, lp.z] }; });
    const r = Math.hypot(P.car[0], P.car[1]), ux = P.car[0] / r, uz = P.car[1] / r;
    await directShot(page, R, 'coche_pista', [P.car[0] + ux * 6.5 - uz * 2, 1.7, P.car[1] + uz * 6.5 + ux * 2], [P.car[0], 0.7, P.car[1]], 55);
    await directShot(page, R, 'coche_cerca', [P.car[0] + ux * 3.6 + uz * 2.6, 1.3, P.car[1] + uz * 3.6 - ux * 2.6], [P.car[0], 0.6, P.car[1]], 55);
    const lr = Math.hypot(P.limo[0], P.limo[2]);
    await directShot(page, R, 'limo_puente', [P.limo[0] * (lr - 7) / lr, P.limo[1] + 2.2, P.limo[2] * (lr - 7) / lr], [P.limo[0], P.limo[1], P.limo[2]], 60);
    R.pendingHuman('Aceptación visual de coche y limo (usuario)');
  } finally { await browser.close(); }
});
