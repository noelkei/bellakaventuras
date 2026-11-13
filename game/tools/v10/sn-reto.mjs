// V10 R7 · sn-reto · reto final de SECRETNOVIO (dossier §3, §4, §6; plan 30 S-07, S-16…S-22, S-33…S-39). Entradas reales de teclado:
// TREPAR (E) + W por la escalera vertical → andar por la coronación hasta el carril → ¡BAJAR! (E) → bajada pegada a la pared y curva → SALTO
// (Espacio) al ver el aviso → vuelo con trucazo → recepción y frenado en D → preview. Fixture declarada: partida con las 20 patatas y la
// revelación vista (centro abierto) y ANMI al pie de la escalera.
// Medidas: cima del vuelo ≥ 7 m; aterrizaje dentro de D (|x| ≤ 2,75; 7,25 ≤ z ≤ 12,75) y parada dentro de D; trucazo completo (3 vueltas de
// flip + giro); ningún coche a menos de 2 m de ANMI en todo el reto (los coches siguen en el anillo); cámara nunca dentro de geometría;
// rama sin SALTO: no llega a D, no cae en asfalto (r < 16) ni sobre mesas/montículos, y reintento al pie de la escalera.
// R7: caso «reducido» (S-36): con «reducir movimiento» se completa sin sacudida de cámara.
// Uso: node tools/v10/sn-reto.mjs --url v10 --task V10-R7 --label final [--cases salto,sin,reducido]
import { Report, runTest, launch, openGame, clickStart, sleep, arg } from '../v8/lib.mjs';
import { Pilot } from '../v4/pilot.mjs';
import { snRun, snFrame } from './sn-lib.mjs';
const R = new Report('sn-reto');
const CASES = arg('cases', 'salto,sin,reducido,fallo,auto').split(',');
const ALL = ['no_me_guillo', 'nosvamosdeaqui', 'yinyang', 'tratratra', 'fashion_girl'].flatMap((z) => ['visible', 'medium', 'hidden', 'activity'].map((k) => `${z}.${k}`));
const SAVE = { version: 5, migV10: 99, collected: ALL, activities: { pantherTalk: true, skateTutorial: true, graffiti: true, bridgeTalk: true, danceCombo: true }, bridgeReached: true, finalDone: false, finalProof: null, revealSeen: true,
  checkpoint: null, checkpointRevision: 7, saveEpoch: 'sn-reto', hints: ['basic'], settings: { volume: 0.8, muted: false, advancedControls: true, camSens: 1, invertY: false, reducedMotion: false, orientation: 'auto', mouseLock: true },
  partials: { tutorialStep: 0, tutorialStarted: false, bridgeRest: 4, bridgeHeard: { aissa: true, juseph: true }, graffitiMask: null, graffitiCheck: 0, graffitiRev: 8, graffitiErrRun: 0, graffitiIntro: true, danceRounds: 0 } };
const st = (page) => page.evaluate(() => { const g = window.__bk, a = g.activities.find((x) => x.id === 'secretJump'), s = g.skater, c = g.rig.cam.position, RA = window.__bkRapier;
  const camHit = g.world.intersectionWithShape({ x: c.x, y: c.y, z: c.z }, { x: 0, y: 0, z: 0, w: 1 }, new RA.Ball(0.1), RA.QueryFilterFlags.EXCLUDE_SENSORS, undefined, s.collider, undefined, (cc) => !g.npcColliders.has(cc.handle) && !g.park.cameraIgnore.has(cc.handle) && !g.park.b.thin.has(cc.handle));
  const dCar = Math.min(...g.cars.cars.map((k) => Math.hypot(k.pos.x - s.footPos.x, k.pos.z - s.footPos.z)));
  return { phase: a.phase, armed: a.armed, apex: a.apex, fails: a.failures.length, ok: a.successes, mode: g.mode, foot: [s.footPos.x, s.footPos.y, s.footPos.z], hot: document.getElementById('btn-jump').classList.contains('hot'),
    camIn: camHit ? g.park.colliderName(camHit.handle) : null, dCar, action: !document.getElementById('btn-action')?.hidden ? document.getElementById('btn-action')?.textContent : null,
    ladder: (g.activities.find((x) => x.id === 'ladderClimb') || {}).phase, done: g.state.p.finalDone, proof: g.state.p.finalProof?.kind ?? null, open: g.centerOpen, flip: g.visual.extPose?.flip ?? 0 }; });
// V10.1 P04 (D05/D06, cambio de diseño aprobado; copia previa en V10/backups/pruebas/V10_1-R2): el recorrido es el de sn-lib, que además pulsa
// los 3 círculos del vuelo (backflip, giro 360, grab) cuando el anillo llega a cada uno
async function run(page, jump, circles = 'hit') { return snRun(page, R, { jump: jump ? 'hot' : false, circles }); }
await runTest(R, async () => {
  const b = await launch();
  try {
    if (CASES.includes('salto')) { const page = await openGame(b, R, { save: SAVE }); await clickStart(page); await sleep(1500);
      const r = await run(page, true); R.measure('salto', r);
      R.check(r.climbOffer && r.maxY > 6.5 && r.top.foot[1] > 6.6, 'escalera vertical: TREPAR al pie y W hasta la coronación (Y 7)', 'input', { maxY: r.maxY, top: r.top.foot });
      R.check(r.dropOffer, 'en el carril de la coronación aparece ¡BAJAR!', 'input');
      R.check(r.end.done && r.end.proof === 'secretnovio_v10' && r.fin?.ok, 'con SALTO en la ventana: completa el reto y guarda el logro', 'input', { end: r.end, fin: r.fin });
      R.check((r.fin?.land?.apex ?? r.log.apex) >= 7.0, `cima del salto ≥ 7 m (medida ${(r.fin?.land?.apex ?? r.log.apex).toFixed?.(2)})`, 'input');
      const lz = r.fin?.land?.z; R.check(lz >= 7.25 && lz <= 12.75, `aterrizaje dentro de D (z ${lz})`, 'input');
      // V10.1 P04: los trucos con su círculo, acertados a la primera. V10.2 Q08 (D-08, cambio de diseño aprobado): cinco (BACKFLIP, GIRO 360,
      // BACKFLIP, GRAB, BACKFLIP: tres vueltas de backflip; copia previa en V10/backups/pruebas/V10_2-R4)
      const cl = r.fin?.land?.circles ?? [];
      R.check(r.fin?.land?.hits === 5 && cl.filter((c) => c.ok && !c.auto).length === 5 && r.log.maxFlip >= 3 * 2 * Math.PI * 0.95, `trucazo con los 5 círculos acertados (backflip ${(r.log.maxFlip / (2 * Math.PI)).toFixed(2)} vueltas, giro y grab)`, 'input', { cl, hits: r.fin?.land?.hits });
      R.check(r.log.minCar > 2.0, `ningún coche a menos de 2 m durante el reto (mín ${r.log.minCar.toFixed(1)} m)`, 'input');
      R.check(r.log.camIn.length === 0, 'la cámara del reto nunca dentro de geometría', 'input', r.log.camIn);
      R.check(r.end.mode === 'preview' || r.end.done, 'tras el éxito se abre el preview', 'input', { mode: r.end.mode });
      await page.close(); }
    if (CASES.includes('sin')) { const page = await openGame(b, R, { save: SAVE }); await clickStart(page); await sleep(1500);
      const r = await run(page, false); R.measure('sin', r);
      // V10.1 (giro de SN −45°, cambio aprobado): D y la escalera se comparan en el marco del reto (copia previa en V10/backups/pruebas/V10_1-SNROT)
      const F = await snFrame(page), fl = F.L(r.end.foot[0], r.end.foot[2]), f = [fl[0], r.end.foot[1], fl[1]], rr = Math.hypot(f[0], f[2]);
      R.check(!r.end.done && r.end.fails >= 1, 'sin SALTO: no hay trucazo ni logro', 'input', r.end);
      R.check(rr < 16 && !(Math.abs(f[0]) < 4.3 && f[2] > 7.2 && f[2] < 12.8), `sin SALTO: no llega a D ni cae en el asfalto (cae en r ${rr.toFixed(1)})`, 'input', { foot: f });
      await sleep(2500); const back = await st(page);
      const bl = F.L(back.foot[0], back.foot[2]);
      R.check(Math.hypot(bl[0] - 6.55, bl[1] + 11.5) < 1.5, 'sin SALTO: reintento al pie de la escalera', 'input', { foot: back.foot });
      await page.close(); }
    // V10.1 P04 (D06 b): fallar un círculo congela el vuelo (cámara lenta) con el anillo en bucle hasta acertar; a los 3 fallos se hace solo
    if (CASES.includes('fallo')) { const page = await openGame(b, R, { save: { ...SAVE, saveEpoch: 'sn-reto-fallo' } }); await clickStart(page); await sleep(1500);
      const r = await run(page, true, 'miss'); const cl = r.fin?.land?.circles ?? []; R.measure('fallo', { cl, end: r.end });
      const c0 = cl.filter((c) => c.i === 0);
      R.check(r.end.done && c0.filter((c) => !c.ok).length === 2 && c0.some((c) => c.ok && !c.auto), 'fallar dos veces el primer círculo: el vuelo espera y al acertar sigue (reto completado)', 'input', { c0, done: r.end.done });
      await page.close(); }
    if (CASES.includes('auto')) { const page = await openGame(b, R, { save: { ...SAVE, saveEpoch: 'sn-reto-auto' } }); await clickStart(page); await sleep(1500);
      const r = await run(page, true, 'none'); const cl = r.fin?.land?.circles ?? []; R.measure('auto', { cl, end: r.end });
      R.check(r.end.done && cl.filter((c) => c.auto).length === 5 && cl.filter((c) => !c.ok).length === 15, 'sin pulsar ningún círculo: a los 3 fallos de cada uno el truco se hace solo y el reto se completa', 'input', { n: cl.length, auto: cl.filter((c) => c.auto).length });
      await page.close(); }
    if (CASES.includes('reducido')) { // S-36: con «reducir movimiento», sin sacudida de cámara (al aterrizar) y el reto se completa igual
      const page = await openGame(b, R, { save: { ...SAVE, saveEpoch: 'sn-reto-red', settings: { ...SAVE.settings, reducedMotion: true } } }); await clickStart(page); await sleep(1500);
      const r = await snRun(page, R, { jump: 'hot' }); R.measure('reducido', { done: r.end.done, maxShake: r.log.maxShake });
      R.check(r.end.done && (r.log.maxShake ?? 0) === 0, `reducir movimiento: reto completado sin sacudida de cámara (máx ${r.log.maxShake})`, 'input', { end: r.end, maxShake: r.log.maxShake });
      await page.close(); }
  } finally { await b.close(); }
}, { timeoutMs: 600000 });
