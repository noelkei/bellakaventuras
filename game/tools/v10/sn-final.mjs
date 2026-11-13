// V10 R6 · sn-final · progresión del final de SECRETNOVIO (sustituye a v4/final-v4 para el reto nuevo; dossier §3, §6; plan 30 S-21, S-22,
// S-34, S-39). Fixtures declaradas: guardados (19/20; 20/20 sin revelación vista; 20/20 con revelación) y, en E, ANMI al pie de la escalera.
//  A · 19/20: (V10.3) valla del centro y coches derrapando detrás; la arquitectura del reto NO existe aún (ni muro ni rampa: el rayo cae al
//      suelo); se llega andando a la valla frente al radiocasete central;
//  B · 20/20 sin revelar: al empezar hay revelación (modo «reveal») y después centro abierto, coches en marcha y muro A (rayo a 7 m);
//  C · SALTO pulsado ANTES de la ventana (una sola vez, al empezar la bajada): no hay logro;
//  D · SALTO en la ventana: logro guardado (`secretnovio_v10`) y preview; vuelve al parque; recargar conserva el logro y el reto se puede
//      repetir (TREPAR sigue ofreciéndose al pie de la escalera).
// Uso: node tools/v10/sn-final.mjs --url v10 --task V10-R6 --label final
import { Report, runTest, launch, openGame, clickStart, sleep } from '../v8/lib.mjs';
import { Pilot } from '../v4/pilot.mjs';
import { snRun, snState } from './sn-lib.mjs';
import { snFrame as snFrame2 } from './sn-lib.mjs';
const R = new Report('sn-final');
const Z = ['no_me_guillo', 'nosvamosdeaqui', 'yinyang', 'tratratra', 'fashion_girl'];
const ALL = Z.flatMap((z) => ['visible', 'medium', 'hidden', 'activity'].map((k) => `${z}.${k}`));
const save = (collected, revealSeen) => ({ version: 5, migV10: 99, collected, activities: { pantherTalk: true, skateTutorial: true, graffiti: true, bridgeTalk: true, danceCombo: true }, bridgeReached: true, finalDone: false, finalProof: null, revealSeen,
  checkpoint: null, checkpointRevision: 7, saveEpoch: `sn-final-${collected.length}-${revealSeen}`, hints: ['basic'], settings: { volume: 0.8, muted: false, advancedControls: true, camSens: 1, invertY: false, reducedMotion: false, orientation: 'auto', mouseLock: true },
  partials: { tutorialStep: 0, tutorialStarted: false, bridgeRest: 4, bridgeHeard: { aissa: true, juseph: true }, graffitiMask: null, graffitiCheck: 0, graffitiRev: 8, graffitiErrRun: 0, graffitiIntro: true, danceRounds: 0 } });
const world = (page) => page.evaluate(() => { const g = window.__bk, RA = window.__bkRapier, th = g.park.sn.group.rotation.y, h = g.world.castRay(new RA.Ray({ x: -12.8 * Math.sin(th), y: 12, z: -12.8 * Math.cos(th) },   /* V10.1: centro del muro A en el marco girado */ { x: 0, y: -1, z: 0 }), 14, true, RA.QueryFilterFlags.EXCLUDE_SENSORS | RA.QueryFilterFlags.EXCLUDE_KINEMATIC);
  return { wallTop: h ? +(12 - h.timeOfImpact).toFixed(2) : null, cars: g.cars.active, open: g.centerOpen, mode: g.mode, total: g.state.total, done: g.state.p.finalDone, proof: g.state.p.finalProof?.kind ?? null, foot: g.skater.footPos.toArray() }; });
await runTest(R, async () => {
  const b = await launch();
  try {
    { // A · 19/20
      const page = await openGame(b, R, { save: save(ALL.filter((k) => k !== 'nosvamosdeaqui.medium'), false) }); await clickStart(page); await sleep(2000);
      const w = await world(page); const P = new Pilot(page, R); await P.buildNav({ cars: false });
      // V10.3 R1 (W04, W-D33; cambio de diseño aprobado, copia previa en V10/backups/pruebas/V10_3-R1): antes de 20 los coches derrapan detrás
      // de la valla y el radiocasete se ve tras la malla: se llega andando hasta la valla, frente al radiocasete (antes: hasta él)
      const F = await snFrame2(page), C0 = F.W(6.0, 0.9), k = 23.2 / Math.hypot(C0[0], C0[1]), C = [C0[0] * k, C0[1] * k];
      const r = await P.walkTo(C, { tol: 0.6, maxMs: 120000 }); const f = await world(page), fence = await page.evaluate(() => window.__bk.park.vallaUp);
      R.check(w.total === 19 && w.cars && fence && (w.wallTop ?? 0) < 0.1 && r.ok && Math.hypot(f.foot[0] - C[0], f.foot[2] - C[1]) < 1, 'A · con 19/20: coches tras la valla y sin arquitectura del reto; se llega andando a la valla frente al radiocasete central', 'input', { w, f, fence, r: r.why });
      await page.close(); }
    { // B · 20/20 sin revelar
      const page = await openGame(b, R, { save: save(ALL, false) }); await clickStart(page);
      let sawReveal = false; const t0 = Date.now(); while (Date.now() - t0 < 25000) { const w = await world(page); if (w.mode === 'reveal') sawReveal = true; if (sawReveal && w.mode === 'explore') break; await sleep(150); }
      await sleep(1000); const w = await world(page);
      R.check(sawReveal && w.open && w.cars && Math.abs((w.wallTop ?? 0) - 7) < 0.05, 'B · con 20/20: revelación y después centro abierto, coches en marcha y muro A levantado (7 m)', 'input', { sawReveal, w });
      await page.close(); }
    { // C · SALTO antes de la ventana
      const page = await openGame(b, R, { save: save(ALL, true) }); await clickStart(page); await sleep(1500);
      const r = await snRun(page, R, { jump: 'early' }); const w = await world(page);
      R.check(r.log.jumped && !w.done && w.proof === null && r.end.fails >= 1, 'C · SALTO pulsado al empezar la bajada (antes de la ventana): sin trucazo ni logro', 'input', { end: r.end, w });
      await page.close(); }
    { // D · éxito, preview, recarga y repetición
      const page = await openGame(b, R, { save: save(ALL, true) }); await clickStart(page); await sleep(1500);
      const r = await snRun(page, R, { jump: 'hot' }); let w = await world(page);
      R.check(w.done && w.proof === 'secretnovio_v10' && (r.end.mode === 'preview' || w.mode === 'preview' || r.end.done), 'D · SALTO en la ventana: logro guardado y preview', 'input', { end: r.end, w });
      // salir del preview (Escape / botón de volver) y recargar
      for (let i = 0; i < 20 && (await world(page)).mode === 'preview'; i++) { await page.click('#btn-close-final').catch(() => {}); await sleep(500); }   // «Volver al parque»
      await sleep(800); await page.reload(); await page.waitForFunction(() => window.__bk && !document.getElementById('btn-start').disabled, { timeout: 120000 }); await clickStart(page); await sleep(2000);
      w = await world(page); const P = new Pilot(page, R); await P.buildNav({ cars: true });
      await page.evaluate(() => { const g = window.__bk, a = g.manifest.get('sn.retry'); g.skater.teleport(a.pos.clone(), a.heading, 'walk'); g.rig.snapBehind(g.skater); });
      await P.walkTo((await snFrame2(page)).W(5.65, -12.7), { tol: 0.35, maxMs: 20000 }); let s = await snState(page); for (let i = 0; i < 10 && !(s.action && /TREPAR/.test(s.action)); i++) { await sleep(200); s = await snState(page); }
      R.check(w.done && w.proof === 'secretnovio_v10' && !!s.action && /TREPAR/.test(s.action), 'D · tras recargar se conserva el logro y el reto se puede repetir (TREPAR al pie de la escalera)', 'input', { w, action: s.action });
      await page.close(); }
  } finally { await b.close(); }
}, { timeoutMs: 900000 });
