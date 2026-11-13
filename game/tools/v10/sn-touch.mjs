// V10 R6 · sn-touch · reto de SECRETNOVIO con control TÁCTIL en EMULACIÓN (CDP touch, sin teclado), 390×844 y 844×390 (sustituye a
// v5suite/final-touch para el reto nuevo; plan 30 S-35). Fixtures declaradas: guardado 20/20 con revelación vista; ANMI al pie de la escalera
// mirando a ella; tras desembarcar, ANMI en el carril de bajada de la coronación (el paseo por la coronación con el joystick no se mide aquí).
// Comprueba por layout: TREPAR con el botón de acción; subir con el joystick ARRIBA hasta la coronación; ¡BAJAR! con el botón de acción;
// el botón SALTO se marca «caliente» en la ventana y, tocándolo, el reto se completa (logro); los dedos quedan libres al terminar.
// Emulación ≠ teléfono (pendiente humano G8-T).
// Uso: node tools/v10/sn-touch.mjs --url v10 --task V10-R6 --label final
import { Report, runTest, launch, openGame, clickStart, sleep, fixture, VIEWPORTS } from '../v8/lib.mjs';
import { snState } from './sn-lib.mjs';
const R = new Report('sn-touch');
const ALL = ['no_me_guillo', 'nosvamosdeaqui', 'yinyang', 'tratratra', 'fashion_girl'].flatMap((z) => ['visible', 'medium', 'hidden', 'activity'].map((k) => `${z}.${k}`));
const SAVE = { version: 5, migV10: 99, collected: ALL, activities: { pantherTalk: true, skateTutorial: true, graffiti: true, bridgeTalk: true, danceCombo: true }, bridgeReached: true, finalDone: false, finalProof: null, revealSeen: true,
  checkpoint: null, checkpointRevision: 7, saveEpoch: 'sn-touch', hints: ['basic'], settings: { volume: 0.8, muted: false, advancedControls: true, camSens: 1, invertY: false, reducedMotion: false, orientation: 'auto', mouseLock: true },
  partials: { tutorialStep: 0, tutorialStarted: false, bridgeRest: 4, bridgeHeard: { aissa: true, juseph: true }, graffitiMask: null, graffitiCheck: 0, graffitiRev: 8, graffitiErrRun: 0, graffitiIntro: true, danceRounds: 0 } };
await runTest(R, async () => {
  const b = await launch();
  try {
    for (const [lay, vp] of [['vertical', VIEWPORTS.phone], ['horizontal', VIEWPORTS.phoneLand]]) {
      const page = await openGame(b, R, { viewport: vp, save: SAVE }); await clickStart(page); await sleep(1500);
      await page.evaluate(() => { document.getElementById('hint').hidden = true; });
      const cdp = await page.target().createCDPSession();
      const touch = (type, pts) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts.map(([x, y, id]) => ({ x, y, id, radiusX: 8, radiusY: 8, force: 1 })) });
      const center = (id) => page.evaluate((id) => { const e = document.getElementById(id); if (!e || e.hidden || e.offsetParent === null) return null; const r = e.getBoundingClientRect(); return [Math.round(r.x + r.width / 2), Math.round(r.y + r.height / 2)]; }, id);
      const tap = async (id, n = 5) => { const c = await center(id); if (!c) return false; await touch('touchStart', [[c[0], c[1], n]]); await sleep(70); await touch('touchEnd', []); await sleep(200); return true; };
      const rect = await page.evaluate(() => { const r = document.getElementById('stick-zone').getBoundingClientRect(); return [r.x, r.y, r.width, r.height]; });
      const ox = Math.round(rect[0] + Math.min(80, rect[2] * 0.45)), oy = Math.round(rect[1] + rect[3] - 110);
      await fixture(page, R, `${lay}: ANMI al pie de la escalera de A, mirando a ella`, () => { const g = window.__bk, T = window.__bkTHREE; g.input.clear(); const th = g.park.sn.group.rotation.y; g.skater.teleport(new T.Vector3(5.65, 0, -12.7).applyAxisAngle(new T.Vector3(0, 1, 0), th), -Math.PI / 2 + th, 'walk');   /* V10.1: marco girado del reto */ g.rig.snapBehind(g.skater); });
      await sleep(800);
      let s = await snState(page); for (let i = 0; i < 10 && !(s.action && /TREPAR/.test(s.action)); i++) { await sleep(200); s = await snState(page); }
      const climbOffer = !!(s.action && /TREPAR/.test(s.action)); await tap('btn-action');
      await touch('touchStart', [[ox, oy, 1]]); await sleep(30); await touch('touchMove', [[ox, oy - 56, 1]]);
      const t0 = Date.now(); let maxY = 0; while (Date.now() - t0 < 30000) { s = await snState(page); maxY = Math.max(maxY, s.foot[1]); if (s.ladder === 'off' && s.foot[1] > 6.5) break; await sleep(80); }
      await touch('touchEnd', []); await sleep(500);
      await fixture(page, R, `${lay}: ANMI en el carril de bajada de la coronación`, () => { const g = window.__bk, T = window.__bkTHREE; g.input.clear(); const th = g.park.sn.group.rotation.y; g.skater.teleport(new T.Vector3(0, 7, -12.5).applyAxisAngle(new T.Vector3(0, 1, 0), th), th, 'walk');   /* V10.1: marco girado del reto */ g.rig.snapBehind(g.skater); });
      await sleep(700); s = await snState(page); const dropOffer = !!(s.action && /BAJAR/.test(s.action)); await tap('btn-action');
      let hot = false, pressed = false; const t1 = Date.now();
      while (Date.now() - t1 < 15000) { s = await snState(page); if (s.hot) hot = true;
        if (s.hot && !pressed) { pressed = await tap('btn-jump', 2); }
        if (s.mode === 'preview' || s.done || (s.phase === 'idle' && Date.now() - t1 > 2500)) break; await sleep(25); }
      await sleep(1500); s = await snState(page);
      const owners = await page.evaluate(() => window.__bk.input.activeOwners);
      const row = { lay, climbOffer, maxY: +maxY.toFixed(2), dropOffer, hot, pressed, done: s.done, proof: s.proof, owners };
      R.measure(lay, row); console.log(JSON.stringify(row));
      R.check(climbOffer && maxY > 6.5, `${lay}: TREPAR con el botón de acción y subida con el joystick hasta la coronación`, 'emulation', row);
      R.check(dropOffer, `${lay}: ¡BAJAR! en el botón de acción en el carril`, 'emulation', row);
      R.check(hot && pressed && s.done && s.proof === 'secretnovio_v10', `${lay}: el botón SALTO se marca en la ventana y, tocándolo, se completa el reto`, 'emulation', row);
      R.check(owners.length === 0, `${lay}: dedos liberados al terminar`, 'emulation', owners);
      await page.close();
    }
    R.pendingHuman('Reto de SECRETNOVIO jugado en el teléfono del usuario (G8-T)');
  } finally { await b.close(); }
}, { timeoutMs: 600000 });
