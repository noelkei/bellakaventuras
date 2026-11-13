// FIN-01…04: final de SECRENOVIO con TECLADO REAL. Fixtures declaradas: partidas (19/20 migrada; 20/20 sin revelar) y
// posición de salida en el ancla final.approach (inicio de carrera). Nada fija trick/rotación/éxito.
//   A 19/20: centro cerrado → la superrampa no colisiona (se cruza su zona a ras de suelo)
//   B 20/20: revelación en reloj de simulación (pausa la congela) → colisión activa
//     B1 sin SALTO → fallo + vuelta a la aproximación, sin preview     B2 SALTO antes de la ventana → ollie no armado → fallo
//     B3 SALTO en la ventana → triple con pausa a mitad de vuelo (el giro no avanza) → éxito, prueba guardada, preview
//        telemetría: entrada, labio, vuelo, ápice, ángulo acumulado sin envolver, recepción; coches: holgura y cesión
//   C recarga: final ganado persiste y el preview se ofrece en la pausa
//   node tools/v3/final.mjs → captures/v3/P5/FIN/final.json + flight.jpg
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { Report, launch, openGame, clickStart, sleep } from './lib.mjs';

const PORTRAIT = process.argv.includes('--portrait');
const VP = PORTRAIT ? { width: 390, height: 844, deviceScaleFactor: 1, isMobile: true, hasTouch: true } : { width: 900, height: 620, deviceScaleFactor: 1 };
const R = new Report('P5/FIN', PORTRAIT ? 'final-portrait' : 'final', { method: 'teclado real; fixtures: partidas declaradas y salida en final.approach; resultado leído de la telemetría del juego (__bkFinalLog) y del estado guardado' });
const fx = (n) => JSON.parse(fs.readFileSync(new URL(`../fixtures/${n}.json`, import.meta.url)));
const browser = await launch();
const down = (p, k) => p.keyboard.down(k), up = (p, k) => p.keyboard.up(k);
const st = (p) => p.evaluate(() => { const g = window.__bk, s = g.skater, ft = g.activities?.find?.((a) => a.id === 'finalTriple') ?? g.final; return { mode: g.mode, paused: g.paused, centerOpen: g.centerOpen, x: +s.footPos.x.toFixed(2), y: +s.footPos.y.toFixed(2), z: +s.footPos.z.toFixed(2), speed: +s.speed.toFixed(2), loco: s.loco, grounded: s.grounded, trick: s.trick ? { kind: s.trick.kind, angle: +s.trick.angle.toFixed(3) } : null, phase: ft?.phase, proof: g.state.p.finalProof, finalDone: g.state.p.finalDone, log: (window.__bkFinalLog ?? []).slice(-1)[0] ?? null, nlog: (window.__bkFinalLog ?? []).length }; });
const toApproach = (p) => p.evaluate(() => { const g = window.__bk, a = g.manifest.get('final.approach'); g.skater.teleport(a.pos.clone(), a.heading, 'ride'); g.rig.snapBehind(g.skater); g.input.clear(); });
const waitFor = async (p, fn, ms, step = 25) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { const s = await st(p); if (fn(s)) return s; await sleep(step); } return null; };
const F = { lipX: -7.8, armWindow: 2.6 };

try {
  // ---------------------------------------------------------------- A: 19/20
  let page = await openGame(browser, R, { viewport: VP, save: fx('v2-19de20') });
  await clickStart(page); await page.evaluate(() => { document.getElementById('hint').hidden = true; });
  await page.evaluate(() => { const g = window.__bk; g.skater.teleport(new window.__bkTHREE.Vector3(-17, 0, 0), Math.PI / 2, 'ride'); g.input.clear(); });
  await down(page, 'KeyW'); let ymax = 0; for (let i = 0; i < 40; i++) { const s = await st(page); ymax = Math.max(ymax, s.y); if (s.x > -4) break; await sleep(60); } await up(page, 'KeyW');
  let s = await st(page);
  R.check(!s.centerOpen && ymax < 0.3, 'A 19/20: centro cerrado y la superrampa no colisiona (se cruza su zona a ras de suelo)', 'input', { ymax, x: s.x, centerOpen: s.centerOpen });
  await page.close();

  // ---------------------------------------------------------------- B: 20/20 sin revelar
  page = await openGame(browser, R, { viewport: VP, save: fx('v4-20-sin-revelar') });
  await clickStart(page); await page.evaluate(() => { document.getElementById('hint').hidden = true; window.__bkFinalLog = []; });
  s = await waitFor(page, (x) => x.mode === 'reveal', 4000);
  const r0 = await page.evaluate(() => window.__bk.revealT);
  await page.keyboard.press('Escape'); await sleep(900);
  const r1 = await page.evaluate(() => window.__bk.revealT);
  await page.keyboard.press('Escape');
  s = await waitFor(page, (x) => x.mode === 'explore' && x.centerOpen, 8000);
  R.check(!!s && r1 >= r0 && r1 - r0 < 0.05, 'B: la revelación corre en reloj de simulación (la pausa la congela) y termina con el centro abierto', 'input', { r0, r1, s });

  // B1 sin SALTO
  await toApproach(page); await sleep(300);
  await down(page, 'KeyW'); s = await waitFor(page, (x) => x.nlog >= 1, 9000); await up(page, 'KeyW');
  const b1 = s?.log;
  const back1 = await waitFor(page, (x) => x.x < -18 && x.loco !== 'bail', 4000);
  R.check(!!b1 && !b1.armed && !b1.tripleOk && !!back1 && !back1.proof && back1.mode === 'explore', 'B1: sin SALTO arriba no hay triple → fallo explicado y vuelta a la aproximación, sin preview', 'input', { b1: b1 && { ...b1, samples: undefined }, back: back1 && { x: back1.x, mode: back1.mode } });

  // B2 SALTO antes de la ventana
  await toApproach(page); await sleep(300); await down(page, 'KeyW');
  await waitFor(page, (x) => x.x > F.lipX - F.armWindow - 3.2, 6000, 10); await page.keyboard.press('Space');
  s = await waitFor(page, (x) => x.nlog >= 2, 9000); await up(page, 'KeyW');
  const b2 = s?.log;
  R.check(!!b2 && !b2.armed && !b2.tripleOk && !s.proof, 'B2: SALTO antes de la ventana del labio es un ollie no armado → fallo', 'input', { b2: b2 && { ...b2, samples: undefined } });
  await waitFor(page, (x) => x.x < -18 && x.loco !== 'bail', 4000);

  // B3 éxito con pausa a mitad de vuelo + coches
  await page.evaluate(() => { const g = window.__bk; window.__carMon = { minClear: 99, yielding: 0, active: g.cars.active, n: g.cars.cars.length, minSpeed: 99 }; clearInterval(window.__carIv); window.__carIv = setInterval(() => { const c = window.__carMon, p = g.skater.footPos; c.minClear = Math.min(c.minClear, g.cars.clearance(p)); c.yielding = Math.max(c.yielding, g.cars.yielding); }, 30); });
  await toApproach(page); await sleep(300); await down(page, 'KeyW');
  const inWin = await waitFor(page, (x) => x.x > F.lipX - F.armWindow + 0.5, 6000, 8);
  await page.keyboard.press('Space');
  const armedOk = await waitFor(page, (x) => x.phase === 'armed' || x.phase === 'flight', 2000, 10);
  await up(page, 'KeyW');
  await waitFor(page, (x) => x.phase === 'flight' && x.trick && x.trick.angle < -4, 4000, 10);
  const shots = [];
  for (let i = 0; i < 4; i++) { shots.push(await page.screenshot({ type: 'jpeg', quality: 72 })); await sleep(90); }
  await page.keyboard.press('Escape'); await sleep(150);
  const a0 = (await st(page)).trick?.angle; await sleep(1000); const a1 = (await st(page)).trick?.angle; const pz = await st(page);
  await page.keyboard.press('Escape');
  R.check(pz.paused && a0 === a1, 'B3: con pausa a mitad de vuelo el giro no avanza', 'input', { a0, a1, paused: pz.paused });
  for (let i = 0; i < 12; i++) { shots.push(await page.screenshot({ type: 'jpeg', quality: 72 })); await sleep(90); }
  s = await waitFor(page, (x) => x.nlog >= 3, 6000);
  const b3 = s?.log;
  const samples = b3?.samples ?? [];
  const minAngle = samples.reduce((m, r) => Math.min(m, r[4]), 0);
  R.data.flight = { ...b3, samples: samples.length, entry: inWin && { x: inWin.x, speed: inWin.speed }, minAngleRad: minAngle, turns: +(-minAngle / (2 * Math.PI)).toFixed(3), armedPhase: armedOk?.phase };
  R.check(!!b3 && b3.armed && b3.trickAccepted !== false && b3.tripleOk && b3.onTable && !b3.bail, 'B3: SALTO en la ventana → vuelo real, triple completo y recepción en la mesa', 'input', R.data.flight);
  R.check(minAngle <= -6 * Math.PI + 0.6 && minAngle >= -6 * Math.PI - 0.6, 'B3: ángulo acumulado sin envolver ≈ −6π (tres vueltas)', 'input', { minAngle, target: -6 * Math.PI });
  R.check(b3 && b3.apex > 6 && b3.tFlight > 1.8, 'B3: vuelo con ápice y duración legibles (ápice >6 m, >1,8 s)', 'input', { apex: b3?.apex, tFlight: b3?.tFlight });
  const pv = await waitFor(page, (x) => x.mode === 'preview', 4000);
  await sleep(900); await page.screenshot({ path: path.join(R.dir, PORTRAIT ? 'preview-portrait.jpg' : 'preview.jpg'), type: 'jpeg', quality: 80 });
  R.check(!!pv && pv.proof?.kind === 'triple_v3' && pv.finalDone, 'B3: éxito → prueba triple guardada y preview abierto', 'input', { mode: pv?.mode, proof: pv?.proof });
  const cars = await page.evaluate(() => { clearInterval(window.__carIv); return window.__carMon; });
  R.check(cars.active && cars.n === 2 && cars.minClear > 2.0, 'B3: dos coches activos y sin cruzarse con ANMI durante el intento (holgura >2 m)', 'input', cars);
  await page.keyboard.press('Escape'); s = await waitFor(page, (x) => x.mode === 'explore', 3000);
  R.check(!!s, 'B4: cerrar el preview vuelve al parque', 'input', s && { mode: s.mode });
  const W = PORTRAIT ? 150 : 300, H = PORTRAIT ? 325 : 207, tiles = await Promise.all(shots.map((b) => sharp(b).resize(W, H).toBuffer()));
  await sharp({ create: { width: W * 8, height: H * 2, channels: 3, background: '#fff' } }).composite(tiles.map((t, i) => ({ input: t, left: (i % 8) * W, top: Math.floor(i / 8) * H }))).jpeg({ quality: 78 }).toFile(path.join(R.dir, PORTRAIT ? 'flight-portrait.jpg' : 'flight.jpg'));

  // ---------------------------------------------------------------- C: recarga con final ganado
  await page.reload({ waitUntil: 'load' }); await page.waitForFunction(() => window.__bk && !document.getElementById('btn-start').disabled, { timeout: 90000 });
  await clickStart(page); await sleep(500);
  await page.keyboard.press('Escape'); await sleep(300);
  const c = await page.evaluate(() => ({ proof: window.__bk.state.p.finalProof, again: !document.getElementById('btn-preview-again').hidden, centerOpen: window.__bk.centerOpen }));
  R.check(c.proof?.kind === 'triple_v3' && c.again && c.centerOpen, 'C: tras recargar, el final ganado persiste y la pausa ofrece repetir el preview', 'input', c);
  await page.close();
} catch (e) { R.data.errors.push('HARNESS ' + (e?.stack ?? e)); }
finally { await browser.close(); R.finish(); }
