// V4-FINAL-01 / V4-CAR-04 / V4-UX-04 · Final de SECRENOVIO con TECLADO REAL y coches sin cesión.
// Fixtures declaradas: guardados (19/20 y 20/20 sin revelar) y colocación en el ancla `final.approach` montada. El estado
// de los coches NO se escribe: el momento de salida se elige OBSERVANDO su fase (para un intento limpio o para un choque).
//   A 19/20: sin coches ni superrampa (se cruza su zona a ras de suelo); el centro se recorre
//   B 20/20: revelación en reloj de simulación (pausa la congela), sin vallas, coches en π
//   B1 sin SALTO → fallo · B2 SALTO antes de la ventana → fallo · B3 SALTO en la ventana (pausa en vuelo) → triple y preview 19 s
//   D choque con un coche en la aproximación → intento anulado SIN premio, coches siguen (sin frenar, en π), ANMI se levanta
//     fuera de la pista y el segundo intento es posible · C recarga conserva el logro
import fs from 'node:fs';
import path from 'node:path';
import { Report, runTest, launch, openGame, clickStart, sleep } from './lib.mjs';

const ZONES = ['no_me_guillo', 'nosvamosdeaqui', 'yinyang', 'tratratra', 'fashion_girl'];
const saveWith = (n, extra = {}) => ({ version: 4, collected: ZONES.flatMap((z) => ['visible', 'medium', 'hidden', 'activity'].map((k) => `${z}.${k}`)).slice(0, n),
  activities: { pantherTalk: true, skateTutorial: true, graffiti: true, bridgeTalk: true, danceCombo: true }, bridgeReached: true, finalDone: false, finalProof: null, revealSeen: false,
  checkpoint: null, checkpointRevision: 4, partials: { tutorialStep: 0, tutorialStarted: false, bridgeRest: 4, graffitiMask: null, graffitiCheck: 0, danceRounds: 0 }, hints: ['basic'], settings: {}, ...extra });
const R = new Report('FINAL', 'final-v4');
const st = (p) => p.evaluate(() => { const g = window.__bk, s = g.skater, ft = g.activities[5]; return { mode: g.mode, paused: g.paused, centerOpen: g.centerOpen, x: +s.footPos.x.toFixed(2), y: +s.footPos.y.toFixed(2), z: +s.footPos.z.toFixed(2), v: +s.vLong.toFixed(2), loco: s.loco, ph: s.impactPhase, iT: +s.impactT.toFixed(2), ilog: JSON.stringify(s.impactLog.slice(-1)[0] ?? null) + '|' + g.log.slice(-1)[0], trick: s.trick ? { kind: s.trick.kind, angle: +s.trick.angle.toFixed(3) } : null, phase: ft.phase, failures: ft.failures.length, proof: g.state.p.finalProof, finalDone: g.state.p.finalDone, log: (window.__bkFinalLog ?? []).slice(-1)[0] ?? null, nlog: (window.__bkFinalLog ?? []).length, carSteps: g.cars.stepCount, carPhase: g.cars.phase, sep: g.cars.separation, carsActive: g.cars.active }; });
const TRACE = [];   // muestras compactas de la última espera (para diagnosticar un rojo)
const waitFor = async (p, fn, ms, step = 25) => { const t0 = Date.now(); TRACE.length = 0; while (Date.now() - t0 < ms) { const s = await st(p); TRACE.push([s.mode, s.x, s.y, s.v, s.loco, s.ph, s.iT, s.phase, s.nlog, s.ilog]); if (TRACE.length > 400) TRACE.shift(); if (fn(s)) return s; await sleep(step); } return null; };
const tail = () => [TRACE.slice(0, 12), TRACE.slice(-6)];
const toApproach = (p) => p.evaluate(() => { const g = window.__bk, a = g.manifest.get('final.approach'); g.skater.teleport(a.pos.clone(), a.heading, 'ride'); g.rig.snapBehind(g.skater); g.input.clear(); });
// ángulo (rad, 0..2π) de cada coche: θ de la pose (sin θ·R, −cos θ·R)
const carAngles = (p) => p.evaluate(() => window.__bk.cars.cars.map((c) => { let a = Math.atan2(c.pos.x, -c.pos.z); if (a < 0) a += 2 * Math.PI; return a; }));
const W_CROSS = 3 * Math.PI / 2, E_CROSS = Math.PI / 2;
const ahead = (a, target) => ((a - target) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI);   // rad que le faltan para llegar (fase decreciente)

await runTest(R, async () => {
  const browser = await launch();
  const F = { lipX: -7.8, armWindow: 2.6 };
  try {
    // ---------------------------------------------------------------- A: 19/20
    let page = await openGame(browser, R, { save: saveWith(19) });
    await clickStart(page);
    await page.evaluate(() => { const g = window.__bk; g.skater.teleport(new window.__bkTHREE.Vector3(-17, 0, 0.6), Math.PI / 2, 'ride'); g.input.clear(); });
    await page.keyboard.down('KeyW'); let ymax = 0; for (let i = 0; i < 50; i++) { const s = await st(page); ymax = Math.max(ymax, s.y); if (s.x > -1.5) break; await sleep(60); } await page.keyboard.up('KeyW');
    let s = await st(page);
    R.check(!s.centerOpen && !s.carsActive && ymax < 0.3, 'A 19/20: sin coches y sin superrampa: se cruza su zona a ras de suelo', 'input', { ymax, x: s.x, carsActive: s.carsActive });
    await page.close();

    // ---------------------------------------------------------------- B: 20/20 sin revelar
    page = await openGame(browser, R, { save: saveWith(20) });
    await clickStart(page); await page.evaluate(() => { document.getElementById('hint').hidden = true; window.__bkFinalLog = []; });
    s = await waitFor(page, (x) => x.mode === 'reveal', 5000);
    const r0 = await page.evaluate(() => window.__bk.revealT);
    await page.keyboard.press('Escape'); await sleep(900); const r1 = await page.evaluate(() => window.__bk.revealT); await page.keyboard.press('Escape');
    s = await waitFor(page, (x) => x.mode === 'explore' && x.centerOpen && x.carsActive, 8000);
    R.check(!!s && r1 >= r0 && r1 - r0 < 0.05, 'B: revelación en reloj de simulación (la pausa la congela); termina con superrampa y coches', 'input', { r0, r1, ok: !!s });
    const fence = await page.evaluate(() => { let n = 0; window.__bk.world.forEachCollider((c) => { if (/center_(fence|gate)|gate_post/.test(window.__bk.park.colliderName(c.handle))) n++; }); return n; });
    R.check(fence === 0, 'B: sin valla ni puertas en el centro', 'static', { fence });
    // espera a una ventana segura: ningún coche cruzará el corredor (x = ±17,5) en los próximos 4,8 s ni acaba de cruzarlo
    const waitSafe = async () => { for (let i = 0; i < 400; i++) { const a = await carAngles(page); if (a.every((q) => [W_CROSS, E_CROSS].every((c) => ahead(q, c) > 2.4 && ahead(q, c) < 2 * Math.PI - 0.6))) return a; await sleep(40); } return null; };

    // B1 sin SALTO
    R.check(!!(await waitSafe()), "B1: hay ventana sin coches en el corredor (observada, no escrita)", "input"); await toApproach(page); await sleep(200);
    await page.keyboard.down('KeyW'); s = await waitFor(page, (x) => x.nlog >= 1, 9000); await page.keyboard.up('KeyW');
    const b1 = s?.log;
    R.check(!!b1 && !b1.armed && !b1.tripleOk && !s.proof, 'B1: sin SALTO arriba no hay triple → fallo, sin premio', 'input', b1 ? { ...b1, samples: undefined } : { trace: tail() });
    await waitFor(page, (x) => x.loco !== 'impact' && x.phase === 'idle', 6000);

    // B2 SALTO antes de la ventana
    await waitSafe(); await toApproach(page); await sleep(200); await page.keyboard.down('KeyW');
    await waitFor(page, (x) => x.x > F.lipX - F.armWindow - 3.2, 6000, 10); await page.keyboard.press('Space');
    s = await waitFor(page, (x) => x.nlog >= 2, 9000); await page.keyboard.up('KeyW');
    R.check(!!s?.log && !s.log.armed && !s.log.tripleOk && !s.proof, 'B2: SALTO antes de la ventana = ollie no armado → fallo', 'input', s?.log ? { ...s.log, samples: undefined } : { trace: tail() });
    await waitFor(page, (x) => x.loco !== 'impact' && x.phase === 'idle', 6000);

    // D: choque con un coche durante la aproximación (se observa la fase y se sale cuando un coche llegará al cruce oeste
    //    a la vez que ANMI; si no hay golpe, se repite y se registra el denominador)
    const crashTries = [];
    let crash = null;
    // el intento pasa a `approach` hacia x ≈ −16,5 (velocidad ≥ 4,4): se busca un golpe con el intento YA en curso
    // (salida con 0,55…0,85 rad de adelanto del coche); cada intento queda registrado con su resultado
    for (let k = 0; k < 7 && !crash; k++) {
      const lead = 0.55 + 0.05 * k;
      for (let i = 0; i < 700; i++) { const a = await carAngles(page); if (a.some((q) => Math.abs(ahead(q, W_CROSS) - lead) < 0.03)) break; await sleep(12); }
      const failsBefore = (await st(page)).failures;
      await toApproach(page); await page.keyboard.down('KeyW');
      const samples = []; const t0 = Date.now();
      while (Date.now() - t0 < 3500) { const q = await st(page); samples.push(q); if (q.loco === 'impact') break; await sleep(20); }
      await page.keyboard.up('KeyW');
      const hi = samples.findIndex((q) => q.loco === 'impact'), hit = hi >= 0 ? samples[hi] : null, prev = hi > 0 ? samples[hi - 1] : null;
      const during = !!prev && (prev.phase === 'approach' || prev.phase === 'armed');
      crashTries.push({ k, lead, hit: !!hit, prevPhase: prev?.phase, at: hit && { x: hit.x, v: prev?.v } });
      if (hit && during) crash = { failsBefore, hit, samples };
      await waitFor(page, (x) => x.phase === 'idle' && x.loco !== 'impact', 8000);
    }
    R.note({ intentos_de_choque: crashTries });
    R.check(!!crash, `D: un coche golpea a ANMI con el intento en curso (salidas ${crashTries.length}, con golpe ${crashTries.filter((t) => t.hit).length})`, 'input', crashTries);
    if (crash) {
      const after = await waitFor(page, (x) => x.loco === 'walk', 6000, 40);
      const steps = []; for (let i = 0; i < 6; i++) { steps.push(await st(page)); await sleep(200); }
      const rates = []; for (let i = 1; i < steps.length; i++) rates.push((steps[i - 1].carPhase - steps[i].carPhase) / Math.max(1, steps[i].carSteps - steps[i - 1].carSteps) * 60);
      const lastFail = await page.evaluate(() => window.__bk.activities[5].failures.slice(-1)[0]);
      R.check(!after?.proof && !after?.finalDone && after?.phase === 'idle' && after?.failures === crash.failsBefore + 1 && lastFail === 'choque' && after?.mode === 'explore', 'D: el golpe anula el intento en curso (fallo «choque») SIN premio ni preview', 'input', { phase: after?.phase, proof: after?.proof, failures: [crash.failsBefore, after?.failures], lastFail });
      R.check(rates.every((r) => Math.abs(r - 0.5) < 1e-6) && steps.every((q) => Math.abs(q.sep - Math.PI) < 1e-6), 'D: los coches siguen a la misma velocidad y en π durante y tras el golpe', 'unit', { rates });
      R.check(after && Math.abs(Math.hypot(after.x, after.z) - 17.5) > 3.2, 'D: ANMI se levanta fuera de la pista (los coches no paran)', 'input', after && { r: Math.hypot(after.x, after.z) });
    }

    // B3 éxito (segundo intento tras el choque) con pausa a mitad de vuelo
    await waitSafe(); await toApproach(page); await sleep(200); await page.keyboard.down('KeyW');
    const inWin = await waitFor(page, (x) => x.x > F.lipX - F.armWindow + 0.5, 6000, 8);
    await page.keyboard.press('Space');
    await waitFor(page, (x) => x.phase === 'armed' || x.phase === 'flight', 2000, 10);
    await page.keyboard.up('KeyW');
    await waitFor(page, (x) => x.phase === 'flight' && x.trick && x.trick.angle < -4, 4000, 10);
    await page.keyboard.press('Escape'); await sleep(150);
    const a0 = (await st(page)).trick?.angle; await sleep(1000); const pz = await st(page); const a1 = pz.trick?.angle;
    await page.keyboard.press('Escape');
    R.check(pz.paused && a0 === a1, 'B3: con pausa a mitad de vuelo el giro (y los coches) no avanzan', 'input', { a0, a1 });
    // R13: se busca la entrada de aterrizaje del 3.er intento con aterrizaje (B1 y B2 son las dos primeras); antes se miraba solo la
    // ÚLTIMA entrada y, si el éxito añadía otra justo después, la sonda no la veía aunque el triple se hubiera guardado (proof y preview)
    const b3At = () => page.evaluate(() => (window.__bkFinalLog ?? []).filter((e) => e && e.landAt !== undefined)[2] ?? null);
    let b3 = null; for (const t0 = Date.now(); !b3 && Date.now() - t0 < 6000; await sleep(25)) b3 = await b3At();
    R.check(!!b3 && b3.armed && b3.tripleOk && b3.onTable && !b3.bail, 'B3: SALTO en la ventana → vuelo real, triple completo y recepción en la mesa', 'input', b3 && { ...b3, samples: b3.samples?.length, entry: inWin && { x: inWin.x, v: inWin.v } });
    const pv = await waitFor(page, (x) => x.mode === 'preview', 4000);
    await sleep(1200);
    const pvAudio = await page.evaluate(() => { const mu = window.__bk.audio.music; return { state: mu.previewState, dur: mu.tracks.get('secrenovio').previewBuf?.duration }; });
    await R.shot(page, 'preview');
    R.check(!!pv && pv.proof?.kind === 'triple_v3' && Math.abs(pvAudio.dur - 19) <= 2 / 44100, 'B3: éxito → prueba triple guardada y preview limpio de 19 s (±2 muestras de redondeo)', 'input', { mode: pv?.mode, proof: pv?.proof, pvAudio });
    const fr = await page.evaluate(() => window.__bk.cars.stepCount); await sleep(800); const fr2 = await page.evaluate(() => window.__bk.cars.stepCount);
    R.check(fr === fr2, 'preview: la simulación global (coches) se congela mientras está abierto', 'input', { fr, fr2 });
    await page.keyboard.press('Escape'); s = await waitFor(page, (x) => x.mode === 'explore', 3000);
    R.check(!!s, 'cerrar el preview vuelve al parque', 'input', s && { mode: s.mode });
    // C: recarga
    await page.reload({ waitUntil: 'load' }); await page.waitForFunction(() => window.__bk && !document.getElementById('btn-start').disabled, { timeout: 90000 });
    await clickStart(page); await sleep(600);
    await page.keyboard.press('Escape'); await sleep(300);
    const c = await page.evaluate(() => ({ proof: window.__bk.state.p.finalProof, again: !document.getElementById('btn-preview-again').hidden, centerOpen: window.__bk.centerOpen, cars: window.__bk.cars.active }));
    R.check(c.proof?.kind === 'triple_v3' && c.again && c.centerOpen && c.cars, 'C: tras recargar el logro persiste (preview en pausa) y los coches siguen presentes', 'input', c);
  } finally { await browser.close(); }
}, { timeoutMs: 420000 });
