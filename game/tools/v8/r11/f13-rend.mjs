// R11 · F13 · rendimiento y robustez (2 repeticiones; deterministas salvo SIS-35/SIS-16, que miran la carga real).
//  FPS-05  10 fotogramas de 0,1 s (10 fps) avanzan 1,0 s de simulación (base 0,83 s: 5 pasos por fotograma).
//  FPS-01  30 Hz ESTABLES con poco trabajo (dt 1/30, workMs 3) durante 5 s no bajan la resolución (base: de 2 a 1).
//  FPS-02  al pasar la página a densidad 2 (cambio de monitor/zoom) el pixel ratio del lienzo sube a 2 (base: se queda en 1).
//  ANIM-01 un NPC a ~55 m (visible) sigue animándose (su mezclador avanza); base: congelado entre 45 y 70 m.
//  COD-05  el registro del juego no pasa de 4000 entradas.
//  SIS-35  la barra de carga pasa por ≥ 5 valores distintos entre 15 % y 80 % (base: 15 % → 80 % de golpe).
//  SIS-16  con la PRIMERA petición de props/fry.glb cortada, el juego arranca igual (base: error de carga).
//   node tools/v8/r11/f13-rend.mjs --url pre --task R11 --label pre
import { Report, runTest, argUrl, sleep, SAVE_20 } from '../lib.mjs';
import { launch, abrir } from './f5-lib.mjs';
const R = new Report('r11-f13-rend');
await runTest(R, async () => {
  const b = await launch();
  try {
    for (let k = 1; k <= 2; k++) {
      const page = await abrir(b, R);
      { const r = await page.evaluate(() => { const g = window.__bk; g.autoMode = true; const t0 = g.sim.now; g.acc = 0; for (let i = 0; i < 10; i++) g.tick(0.1); return +(g.sim.now - t0).toFixed(3); });
        R.check(Math.abs(r - 1.0) < 0.02, `#${k} FPS-05 a 10 fps, 1 s real = ${r} s de simulación (≈ 1,0)`, 'unit', { r }); }
      { const r = await page.evaluate(() => { const g = window.__bk; g.paused = false; g.maxPixelRatio = 2; g.renderer.setPixelRatio(2); const p0 = g.renderer.getPixelRatio();
          for (let i = 0; i < 150; i++) { g.workMs = 3; g.adaptResolution(1 / 30); } return { p0, p1: g.renderer.getPixelRatio() }; });
        R.check(r.p1 === r.p0, `#${k} FPS-01 30 Hz estables con poco trabajo durante 5 s: la resolución no baja (${r.p0} → ${r.p1})`, 'unit', r);
        await page.evaluate(() => { const g = window.__bk; g.maxPixelRatio = Math.min(devicePixelRatio, 2); g.renderer.setPixelRatio(g.maxPixelRatio); g.resize(); }); }
      { const r = await page.evaluate(async () => { const g = window.__bk, T = window.__bkTHREE, s = g.skater;
          // fixture: ANMI al otro lado del centro, a ~52 m de La Pantera (la cámara queda a ~55 m de ella)
          const n0 = g.npcs.get('la_pantera')?.[0]; if (!n0) return null; const p = n0.root.position, r = Math.hypot(p.x, p.z), ux = p.x / r, uz = p.z / r;
          s.teleport(new T.Vector3(p.x - ux * 52, 0.05, p.z - uz * 52), Math.atan2(ux, uz), 'walk'); g.rig.snapBehind(s); g.autoMode = true; await g.simulate(0.3);   // mirando hacia ella: la cámara queda detrás, más lejos
          const cam = g.rig.cam.position; let best = null;
          for (const list of g.npcs.values()) for (const n of list) { const d = n.root.position.distanceTo(cam); if (d > 48 && d < 66 && (!best || Math.abs(d - 56) < Math.abs(best.d - 56))) best = { n, d }; }
          if (!best) return null; const t0 = best.n.mixer.time; g.autoMode = true; await g.simulate(1.5); const d1 = best.n.root.position.distanceTo(g.rig.cam.position); return { d: +best.d.toFixed(1), d1: +d1.toFixed(1), dt: +(best.n.mixer.time - t0).toFixed(2) }; });
        if (!r) R.invalid(`#${k} ANIM-01: ningún NPC a 48–66 m de la cámara`, {});
        else R.check(r.dt > 0.5, `#${k} ANIM-01 NPC a ${r.d} m: su animación avanza (${r.dt} s en 1,5 s)`, 'input', r); }
      { const r = await page.evaluate(async () => { const g = window.__bk; for (let i = 0; i < 9000; i++) g.log.push('r11-' + i); g.autoMode = true; await g.simulate(0.1); return g.log.length; });
        R.check(r <= 4000, `#${k} COD-05 el registro del juego se recorta (${r} entradas tras 9000 añadidas)`, 'unit', { r }); }
      { await page.setViewport({ width: 1280, height: 800, deviceScaleFactor: 2 }); await sleep(800);
        const r = await page.evaluate(() => ({ dpr: devicePixelRatio, pr: window.__bk.renderer.getPixelRatio() }));
        R.check(r.dpr === 2 ? r.pr === 2 : true, `#${k} FPS-02 densidad 1 → 2: pixel ratio del lienzo ${r.pr} (devicePixelRatio ${r.dpr})`, 'emulation', r);
        await page.setViewport({ width: 1280, height: 800, deviceScaleFactor: 1 }); }
      await page.close();
      // ---------------------------------------------------------------- SIS-35 / SIS-16 (carga real)
      { const p2 = await b.newPage(); await p2.setViewport({ width: 1280, height: 800 });
        await p2.evaluateOnNewDocument((s) => { sessionStorage.setItem('__bk6_fixture_done', '1'); localStorage.setItem('bellakaventuras.remake.save', JSON.stringify(s));
          // cada cambio de la barra (MutationObserver: varias piezas pueden terminar en el mismo fotograma)
          window.__barras = []; const obs = () => { const e = document.querySelector('#load-bar > *'); if (!e) { setTimeout(obs, 5); return; } new MutationObserver(() => { const w = e.style.width; if (w && window.__barras.at(-1) !== w) window.__barras.push(w); }).observe(e, { attributes: true, attributeFilter: ['style'] }); }; obs(); }, SAVE_20);
        await p2.setRequestInterception(true); let cortada = false;
        p2.on('request', (rq) => { if (!cortada && /props\/fry\.glb/.test(rq.url())) { cortada = true; rq.abort('failed'); } else rq.continue(); });
        await p2.goto(argUrl() + '?bktest=1&narr=off', { waitUntil: 'load' });
        const ok = await p2.waitForFunction(() => window.__bk && !document.getElementById('btn-start').disabled, { timeout: 90000 }).then(() => true).catch(() => false);
        const r = await p2.evaluate(() => ({ barras: window.__barras, err: document.getElementById('start-error')?.textContent?.trim() || null }));
        const mid = [...new Set(r.barras.map((w) => parseFloat(w)).filter((v) => v > 15 && v < 80))];
        R.check(cortada && ok && !r.err, `#${k} SIS-16 con la 1.ª petición de la patata cortada el juego arranca (${ok ? 'arranca' : 'no arranca'}${r.err ? ': ' + r.err : ''})`, 'input', { cortada, ...r });
        R.check(mid.length >= 5, `#${k} SIS-35 la barra de carga avanza por partes (${mid.length} valores entre 15 % y 80 %)`, 'input', { barras: r.barras });
        await p2.close(); }
    }
  } finally { await b.close(); }
}, { timeoutMs: 600000 });
