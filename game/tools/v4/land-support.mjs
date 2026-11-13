// V4-FINAL-01/FIS-02 · Collider de apoyo en el PASO del aterrizaje (hallazgo de la campaña VAL-02: el KCC marcaba suelo con
// la sonda aún a 0,12 m y `groundCollider` quedaba nulo → «fuera de la mesa» según el punto del paso en que caía el
// contacto). Unidad determinista con pasos fijos (Game.simulate): 20 vuelos con la trayectoria REAL del final (vX, vY y
// gravedad de vuelo de la semilla) cuyo despegue barre el avance de un paso; en el PRIMER paso en suelo el apoyo debe ser
// `super_landing`.
// Fixtures declaradas: guardado 20/20 con la revelación vista; colocación y velocidad vertical de caída escritas.
import { Report, runTest, launch, openGame, clickStart, sleep } from './lib.mjs';
const ZONES = ['no_me_guillo', 'nosvamosdeaqui', 'yinyang', 'tratratra', 'fashion_girl'];
const save = { version: 4, collected: ZONES.flatMap((z) => ['visible', 'medium', 'hidden', 'activity'].map((k) => `${z}.${k}`)), activities: { pantherTalk: true, skateTutorial: true, graffiti: true, bridgeTalk: true, danceCombo: true }, bridgeReached: true, finalDone: false, finalProof: null, revealSeen: true, checkpoint: null, checkpointRevision: 4, partials: { tutorialStep: 0, tutorialStarted: false, bridgeRest: 4, graffitiMask: null, graffitiCheck: 0, danceRounds: 0 }, hints: ['basic'], settings: {} };
const R = new Report('FIS-02', 'land-support');
await runTest(R, async () => {
  const browser = await launch();
  try {
    const page = await openGame(browser, R, { save });
    await clickStart(page); await sleep(1000);
    const res = await page.evaluate(async () => {
      const g = window.__bk, T = window.__bkTHREE, s = g.skater, out = [];
      g.autoMode = true;
      const G = window.__bkTuning?.gravity ?? 9.81, F = window.__bkTuning?.final ?? { launchVX: 7, launchVY: 9.6, flightGravity: 8, lipX: -7.8 };
      for (let k = 0; k < 20; k++) {
        // trayectoria REAL del final: lanzamiento sobre el labio con vX/vY y gravedad de vuelo de la semilla; el punto de
        // salida se desplaza 1/20 del avance de un paso cada vez (barre la fase del contacto dentro del paso)
        const x0 = F.lipX + 0.7 + k * (F.launchVX / 60) / 20;
        s.teleport(new T.Vector3(x0, 2.62, 0.1), Math.PI / 2, 'ride'); g.input.clear();
        s.launch(new T.Vector3(F.launchVX, 0, 0), F.launchVY, F.flightGravity / G);
        const h = x0;
        let first = null;
        await g.simulate(3.0, () => { if (!first && s.grounded) first = { col: s.groundCollider, name: g.park.colliderName(s.groundCollider ?? -1), y: +s.footPos.y.toFixed(3), gap: +s.supportGap.toFixed(3) }; });
        out.push({ h: +h.toFixed(4), ...first });
      }
      g.autoMode = false;
      return out;
    });
    const bad = res.filter((r) => r.name !== 'super_landing');
    R.check(res.length === 20 && bad.length === 0, 'en el primer paso en suelo el apoyo es la mesa del final en las 20 fases del paso', 'unit', { bad, sample: res.slice(0, 4) });
  } finally { await browser.close(); }
});
