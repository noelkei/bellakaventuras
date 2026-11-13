// V10 IT2 · sn-centro · lo que medía `r11/f3-centro` (superrampa y triple, retirados: S-34) llevado al reto de SECRETNOVIO, con TECLADO REAL
// (tools/v10/sn-lib.mjs). Lo que ya cubren otras pruebas V10 no se repite: CEN-01 (pasar sin SALTO) y FPS-03 (SALTO temprano) → `sn-reto`
// casos «sin» y `sn-final` (SALTO temprano); MOV-09 (kicker que aceleraba parado) no tiene equivalente (el reto es una bajada guiada).
//  CEN-02  quieta 30 s en el ancla de reintento (`sn.retry`, pie de la escalera) con coches en el anillo: ningún coche la golpea.
//  EVT-01  recolocar (g.recover) en pleno vuelo del reto: el juego vuelve a explorar, sin intento colgado y con ANMI controlable (W la mueve).
//  PEN-01  tras un intento sin SALTO y tras uno con SALTO, el punto seguro queda en suelo llano y libre (no en la bajada ni en la rampa B).
//  SIS-12  la revelación 20/20 espera a que ANMI toque suelo y la deja quieta (igual que en f3-centro).
// Uso: node tools/v10/sn-centro.mjs --url v10 --task V10-IT2 --label final
import { Report, runTest, launch, openGame, clickStart, sleep } from '../v8/lib.mjs';
import { snRun, snState } from './sn-lib.mjs';
const R = new Report('sn-centro');
const ALL = ['no_me_guillo', 'nosvamosdeaqui', 'yinyang', 'tratratra', 'fashion_girl'].flatMap((z) => ['visible', 'medium', 'hidden', 'activity'].map((k) => `${z}.${k}`));
const SAVE = { version: 5, migV10: 99, collected: ALL, activities: { pantherTalk: true, skateTutorial: true, graffiti: true, bridgeTalk: true, danceCombo: true }, bridgeReached: true, finalDone: false, finalProof: null, revealSeen: true,
  checkpoint: null, checkpointRevision: 7, saveEpoch: 'sn-centro', hints: ['basic'], settings: { volume: 0.8, muted: false, advancedControls: true, camSens: 1, invertY: false, reducedMotion: false, orientation: 'auto', mouseLock: true },
  partials: { tutorialStep: 0, tutorialStarted: false, bridgeRest: 4, bridgeHeard: { aissa: true, juseph: true }, graffitiMask: null, graffitiCheck: 0, graffitiRev: 8, graffitiErrRun: 0, graffitiIntro: true, danceRounds: 0 } };
// punto seguro: suelo bajo él (rayo) con normal casi vertical y cápsula libre
const safeInfo = (page) => page.evaluate(() => { const g = window.__bk, s = g.skater, RA = window.__bkRapier, W = g.world, ls = s.lastSafe, FL = RA.QueryFilterFlags.EXCLUDE_SENSORS;
  const skip = (c) => g.npcColliders.has(c.handle) || c === s.collider;
  const h = W.castRayAndGetNormal(new RA.Ray({ x: ls.x, y: ls.y + 0.6, z: ls.z }, { x: 0, y: -1, z: 0 }), 1.5, true, FL, undefined, undefined, undefined, (c) => !skip(c));
  const free = !W.intersectionWithShape({ x: ls.x, y: ls.y + 0.97, z: ls.z }, { x: 0, y: 0, z: 0, w: 1 }, new RA.Capsule(0.45, 0.4), FL, undefined, undefined, undefined, (c) => !skip(c));
  return { ls: [ls.x, ls.y, ls.z].map((v) => +v.toFixed(2)), ny: h ? +h.normal.y.toFixed(3) : null, sobre: h ? g.park.colliderName(h.collider.handle) : null, free }; });
await runTest(R, async () => {
  const b = await launch();
  try {
    for (let k = 1; k <= 2; k++) {
      // CEN-02
      { const page = await openGame(b, R, { save: SAVE }); await clickStart(page); await sleep(1500);
        const r = await page.evaluate(async () => { const g = window.__bk, s = g.skater, a = g.manifest.get('sn.retry');
          g.autoMode = true; g.cars.setActive(true, 0); g.input.clear(); s.teleport(a.pos.clone(), a.heading, 'walk'); g.rig.snapBehind(s);
          const h0 = g.carHits ?? 0; let minCar = 99;
          await g.simulate(30, () => { minCar = Math.min(minCar, ...g.cars.cars.map((c) => Math.hypot(c.pos.x - s.footPos.x, c.pos.z - s.footPos.z))); });
          return { ancla: [a.pos.x, a.pos.z].map((v) => +v.toFixed(2)), r: +Math.hypot(a.pos.x, a.pos.z).toFixed(2), hits: (g.carHits ?? 0) - h0, minCar: +minCar.toFixed(2), coches: g.cars.cars.length }; });
        R.check(r.coches > 0 && r.hits === 0 && r.minCar > 2, `#${k} CEN-02: quieta 30 s en el ancla de reintento (r ${r.r} m) con ${r.coches} coches en el anillo: 0 golpes (mín. ${r.minCar} m)`, 'input', r);
        await page.close(); }
      // PEN-01 (sin SALTO) y EVT-01 (recolocar en pleno vuelo)
      { const page = await openGame(b, R, { save: SAVE }); await clickStart(page); await sleep(1500);
        const sin = await snRun(page, R, { jump: false }); await sleep(1500);
        const s1 = await safeInfo(page);
        R.check(s1.ny !== null && s1.ny > 0.97 && s1.free, `#${k} PEN-01 tras un intento sin SALTO el punto seguro queda en suelo llano y libre (${JSON.stringify(s1.ls)} sobre ${s1.sobre}, normal ${s1.ny})`, 'input', { s1, fin: sin.end });
        // EVT-01: vigilante en paralelo al recorrido con teclado; en el primer paso de vuelo, recolocación
        let rec = null, stop = false;
        const watch = (async () => { while (!stop && !rec) { const x = await page.evaluate(() => { const a = window.__bk.activities.find((y) => y.id === 'secretJump'); if (a.phase === 'flight' && a.t > 0.15) { window.__bk.recover(); return { at: a.phase, mode: window.__bk.mode }; } return null; }); if (x) rec = x; else await sleep(25); } })();
        const run2 = await snRun(page, R, { jump: 'hot' }); stop = true; await watch; await sleep(1200);
        const e = await snState(page);
        if (!rec) R.invalid(`#${k} EVT-01: no se llegó al vuelo del reto`, { run2: run2.end });
        else {
          const p0 = e.foot; await page.keyboard.down('KeyW'); await sleep(1200); await page.keyboard.up('KeyW'); const e2 = await snState(page);
          const moved = Math.hypot(e2.foot[0] - p0[0], e2.foot[2] - p0[2]);
          R.check(e.mode === 'explore' && e.phase === 'idle' && moved > 0.5, `#${k} EVT-01: recolocar en pleno vuelo deja el juego en explorar sin intento colgado y ANMI responde a W (${e.mode}/${e.phase}, se movió ${moved.toFixed(2)} m)`, 'input', { rec, e, moved }); }
        await page.close(); }
      // PEN-01 (con SALTO: reto completo)
      { const page = await openGame(b, R, { save: SAVE }); await clickStart(page); await sleep(1500);
        const ok = await snRun(page, R, { jump: 'hot' });
        await page.evaluate(() => { const g = window.__bk; if (g.mode === 'preview') g.closePreview(); }); await sleep(1500);
        const s2 = await safeInfo(page);
        if (!ok.end.done) R.invalid(`#${k} PEN-01 con SALTO: el reto no se completó`, ok.end);
        else R.check(s2.ny !== null && s2.ny > 0.97 && s2.free, `#${k} PEN-01 tras el reto con SALTO el punto seguro queda en suelo llano y libre (${JSON.stringify(s2.ls)} sobre ${s2.sobre}, normal ${s2.ny})`, 'input', s2);
        await page.close(); }
    }
    // SIS-12 (como en f3-centro)
    const S20 = { ...SAVE, revealSeen: true };
    const page2 = await openGame(b, R, { save: S20 }); await clickStart(page2); await sleep(1200);
    const r2 = await page2.evaluate(async () => { const g = window.__bk, s = g.skater, T = window.__bkTHREE;
      g.autoMode = true; await g.simulate(0.3); if (g.mode !== 'explore') return { skip: true };
      g.state.p.revealSeen = false; g.centerOpen = false; g.cars.setActive(false, 0); g.revealT = -1;
      s.teleport(new T.Vector3(20, 0.02, -30), 0, 'ride'); s.vel.set(0, 0, 7); s.vy = 7; s.grounded = false; await g.simulate(0.05);
      g.beginReveal(); let modeAir = null; let maxSp = 0;
      await g.simulate(3, () => { if (modeAir === null && !s.grounded) modeAir = g.mode; if (g.mode === 'reveal') maxSp = Math.max(maxSp, Math.hypot(s.vel.x, s.vel.z)); });
      return { modeAir, maxSp: +maxSp.toFixed(2) }; });
    if (r2.skip) R.invalid('SIS-12: la revelación ya había empezado al cargar', r2); else R.check(r2.modeAir !== 'reveal' && r2.maxSp < 0.5, `SIS-12: la revelación espera a que ANMI toque suelo y la deja quieta (modo en el aire: ${r2.modeAir}; velocidad máx. ${r2.maxSp})`, 'input', r2);
  } finally { await b.close(); }
}, { timeoutMs: 900000 });
