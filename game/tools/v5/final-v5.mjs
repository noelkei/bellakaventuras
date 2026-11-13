// T5-29 · Final de SECRENOVIO a cualquier velocidad hasta 20 m/s (N5-04, DT-33, COV-06/07). Guardado 20/20 revelado
// (fixture). Por velocidad de aproximación 6/9/14/20 m/s (velocidad inicial declarada en el ancla final.approach), con
// una ventana sin coches OBSERVADA: W mantenida + SALTO dentro de la ventana → triple → recepción en la mesa → preview.
// Mide la duración de la ventana de armado (tiempo que ANMI pasa dentro de [labio − armWin, labio]) y dónde aterriza.
// Además: despegue SIN armar a 20 m/s (sin SALTO) → no aterriza en la banda de coches; y sin SALTO → rechazo sin premio.
// Aceptación: éxito 3/3 por velocidad; ventana 0,48 ± 0,05 s (la REAL de A, final-v5_A: el «0,32» del plan era 2,6 m / 8,1 m/s
// calculado; DT-33 cambiado con dato); ningún aterrizaje en |r − 17,5| < 3,3.
import { Report, runTest, launch, openGame, clickStart, sleep, fixture, SAVE_20, recStart, recStop, r3, arg } from './lib.mjs';
const R = new Report('final-v5');
const SPEEDS = arg('speeds', '6,9,14,20').split(',').map(Number);
const REPS = Number(arg('reps', '3'));
await runTest(R, async () => {
  const b = await launch();
  try {
    const page = await openGame(b, R, { save: SAVE_20 }); await clickStart(page); await sleep(1000);
    await page.evaluate(() => { document.getElementById('hint').hidden = true; window.__bkFinalLog = []; });
    const F = await page.evaluate(() => ({ ...window.__bkTuning.final }));
    const carAngles = () => page.evaluate(() => window.__bk.cars.cars.map((c) => { let a = Math.atan2(c.pos.x, -c.pos.z); if (a < 0) a += 2 * Math.PI; return a; }));
    const ahead = (a, t) => ((a - t) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI);
    const waitSafe = async () => { for (let i = 0; i < 400; i++) { const a = await carAngles(); if (a.every((q) => [3 * Math.PI / 2, Math.PI / 2].every((c) => ahead(q, c) > 2.4 && ahead(q, c) < 2 * Math.PI - 0.6))) return true; await sleep(40); } return false; };
    const attempt = async (v, jump) => {
      await waitSafe();
      const n0 = await page.evaluate(() => (window.__bkFinalLog ?? []).length);
      await fixture(page, R, `ancla final.approach en tabla a ${v} m/s (velocidad inicial declarada)`, (v) => { const g = window.__bk, a = g.manifest.get('final.approach'); g.input.clear(); g.skater.teleport(a.pos.clone(), a.heading, 'ride'); g.skater.vel.set(Math.sin(a.heading) * v, 0, Math.cos(a.heading) * v); g.rig.snapBehind(g.skater); return { x: a.pos.x }; }, v);
      await recStart(page); await page.keyboard.down('KeyW');
      let pressed = false;
      let w0 = null, w1 = null;   // ventana observada: primer y último instante con el armado posible (juego: inWindow(); A: 2,6 m)
      for (let i = 0; i < 700; i++) { const q = await page.evaluate(() => { const g = window.__bk, s = g.skater, ft = g.activities[5]; return { x: s.footPos.x, clock: g.clock, g: s.grounded, inW: ft.inWindow ? ft.inWindow() : (F0 => F0.lipX - s.footPos.x >= -0.2 && F0.lipX - s.footPos.x <= 2.6)(window.__bkTuning.final), ph: ft.phase, mode: g.mode }; });
        if (q.inW && q.g) { if (w0 == null) w0 = q.clock; w1 = q.clock; }
        if (jump && !pressed && q.inW && w0 != null && q.clock - w0 > 0.1) { await page.keyboard.press('Space'); pressed = true; }
        if (q.ph === 'armed' || q.ph === 'flight') break; if (q.x > F.lipX + 1) break; await sleep(6); }
      await page.keyboard.up('KeyW');
      let res = null; for (let i = 0; i < 160; i++) { const r = await page.evaluate((n0) => { const L = window.__bkFinalLog ?? []; return L.length > n0 ? L[L.length - 1] : null; }, n0); if (r?.landAt || (r && !jump)) { res = r; break; } await sleep(50); }
      const rows = await recStop(page);
      // ventana: tiempo dentro de [labio − armWin(v), labio] con la velocidad en ese tramo
      const inWin = rows.filter((r) => r.x > F.lipX - 2.6 && r.x <= F.lipX && r.g === 1);
      // ventana: si se pulsó SALTO, el armado corta la observación; se mide la ventana completa en el intento SIN pulsar y,
      // con pulsación, desde su inicio hasta el despegue (r.g pasa a 0)
      const take = rows.find((r, i) => i > 0 && r.g === 0 && rows[i - 1].g === 1 && r.x > F.lipX - 1);
      // ventana medida EN EL JUEGO (tiempo de simulación): primer fotograma con la ventana abierta → despegue (telemetría del final)
      const winT = res?.windowS ?? (w0 != null ? +(((take?.clock ?? w1) - w0)).toFixed(3) : null);
      const land = rows.find((r, i) => i > 0 && r.g === 1 && rows[i - 1].g === 0 && r.x > F.lipX);
      const mode = await page.evaluate(() => window.__bk.mode);
      return { v, jump, ok: !!res?.tripleOk && !!res?.onTable, armed: !!res?.armed, winT: r3(winT), speedInWin: inWin.length ? r3(Math.hypot(inWin[0].vx, inWin[0].vz)) : null, land: land ? { x: land.x, z: land.z, r: r3(Math.hypot(land.x, land.z)) } : null, mode, winSrc: res?.windowS != null ? 'juego' : 'sonda', res: res && { onTable: res.onTable, ground: res.ground, landY: res.landY, tripleOk: res.tripleOk, armed: res.armed } };
    };
    const rows = [];
    for (const v of SPEEDS) for (let k = 0; k < REPS; k++) {
      const r = await attempt(v, true); rows.push(r); console.log(JSON.stringify(r));
      // tras un éxito el preview arranca unos segundos después: esperarlo y salir antes del siguiente intento (antes el
      // intento siguiente empezaba dentro del preview y fallaba: artefacto de la sonda)
      if (r.ok) { for (let i = 0; i < 120; i++) { if (await page.evaluate(() => window.__bk.mode) === 'preview') break; await sleep(100); } }
      for (let i = 0; i < 30; i++) { const md = await page.evaluate(() => window.__bk.mode); if (md === 'explore') break; if (md === 'preview') await page.keyboard.press('Escape'); await sleep(300); }
      await sleep(2200);
    }
    const unarmed = await attempt(20, false); console.log('SIN ARMAR', JSON.stringify(unarmed)); await sleep(2500);
    R.measure('intentos', rows); R.measure('sin_armar_20', unarmed);
    R.measure('telemetria_final', await page.evaluate(() => (window.__bkFinalLog ?? []).map((t) => ({ ...t, samples: undefined }))));
    for (const v of SPEEDS) { const rr = rows.filter((r) => r.v === v); R.check(rr.every((r) => r.ok), `triple a ${v} m/s de aproximación: ${rr.filter((r) => r.ok).length}/${rr.length}`, 'input', rr.map((r) => ({ ok: r.ok, winT: r.winT, land: r.land }))); }
    const wins = rows.map((r) => r.winT).filter((x) => x != null);
    R.check(wins.length && wins.every((w) => Math.abs(w - 0.48) <= 0.05), 'ventana de armado temporal 0,48 ± 0,05 s (la real de A) a cualquier velocidad', 'input', wins);
    const all = [...rows, unarmed].filter((r) => r.land);
    R.check(all.every((r) => Math.abs(r.land.r - 17.5) >= 3.3), 'ningún despegue (armado o no) aterriza en la banda de coches', 'input', all.map((r) => r.land));
    R.check(!unarmed.ok, 'sin SALTO no hay triple (rechazo sin premio)', 'input', unarmed);
    R.pendingHuman('Final jugado por el usuario en teléfono y ordenador (G8)');
  } finally { await b.close(); }
}, { timeoutMs: 1200000 });
