// V6 T6-13 · Rendimiento relativo V5 (copia servida en 5213) frente a V6 (--url, normalmente dist-v6 en 5212), mismas
// condiciones (Chrome headless, perfil temporal, caché caliente, viewport y DPR iguales). Escenas: NMG (control, llegada),
// FG general (ANMI frente al deck mirando la U y la pista, chicas cargadas) y baile (solo V6: actividad nueva).
// Mide draw calls, triángulos, geometrías, texturas, coste del paso fijo, p50/p95 de fotograma, heap y bytes descargados.
// Emulación de escritorio/móvil: NO es teléfono físico.
import { Report, runTest, launch, sleep, argUrl, VIEWPORTS } from './lib.mjs';
const R = new Report('perf-fg');
const th = 108 * Math.PI / 180, O = [30.5 * Math.sin(th), -30.5 * Math.cos(th)], W = [Math.sin(th), -Math.cos(th)], S = [-Math.cos(th), -Math.sin(th)];
const V = (w, s, h = 0) => [O[0] + W[0] * w + S[0] * s, h, O[1] + W[1] * w + S[1] * s];
const H = (dw, ds) => Math.atan2(W[0] * dw + S[0] * ds, W[1] * dw + S[1] * ds);
const measure = (page) => page.evaluate(async () => {
  const g = window.__bk; const ts = []; let last = performance.now();
  const fu = g.fixedUpdate.bind(g); let stepMs = 0, steps = 0; g.fixedUpdate = (dt) => { const a = performance.now(); fu(dt); stepMs += performance.now() - a; steps++; };
  const info = g.renderer.info; let calls = 0, tris = 0, n = 0;
  await new Promise((res) => { const f = () => { const t = performance.now(); ts.push(t - last); last = t; calls += info.render.calls; tris += info.render.triangles; n++; if (ts.length < 300) requestAnimationFrame(f); else res(); }; requestAnimationFrame(f); });
  g.fixedUpdate = fu;
  const s = ts.slice(10).sort((a, b) => a - b), q = (p) => +s[Math.floor(p * (s.length - 1))].toFixed(2);
  return { p50: q(0.5), p95: q(0.95), drawCalls: Math.round(calls / n), tris: Math.round(tris / n), geometries: info.memory.geometries, textures: info.memory.textures, stepMs: +(stepMs / Math.max(1, steps)).toFixed(3), heapMB: performance.memory ? +(performance.memory.usedJSHeapSize / 1048576).toFixed(1) : null };
});
// V6 (contrato de pruebas, Auditoría 6/plan-v6/09): el p95 de UNA ventana de 300 fotogramas varía ±1–2 ms entre repeticiones
// (V5 sola: 17,6–19,8 ms), así que comparar una muestra contra «V5 + 1 ms» daba rojos falsos. Se miden 3 ventanas por escena
// y se toma la de p95 MEDIANO (el resto de magnitudes, de esa misma ventana); se guardan las tres.
const measure3 = async (page) => { const w = []; for (let i = 0; i < 3; i++) w.push(await measure(page)); const m = [...w].sort((a, b) => a.p95 - b.p95)[1]; return { ...m, p95s: w.map((x) => x.p95) }; };
await runTest(R, async () => {
  const targets = { V5: 'http://127.0.0.1:5213/', V6: argUrl() };
  const out = {};
  for (const [vpName, vp] of [['desktop', VIEWPORTS.desktop], ['phone', VIEWPORTS.phone]]) for (const [lab, url] of Object.entries(targets)) {
    const b = await launch();
    try {
      const page = await b.newPage(); await page.setViewport(vp);
      const cdp = await page.createCDPSession(); await cdp.send('Network.enable'); let bytes = 0; cdp.on('Network.loadingFinished', (e) => { bytes += e.encodedDataLength; });
      await page.goto(url + '?bktest=1&narr=off', { waitUntil: 'load' }); await page.waitForFunction(() => window.__bk && !document.getElementById('btn-start').disabled, { timeout: 120000 });
      bytes = 0; await page.reload({ waitUntil: 'load' }); await page.waitForFunction(() => window.__bk && !document.getElementById('btn-start').disabled, { timeout: 120000 });
      const bytesWarm = bytes;
      await page.click('#btn-start'); await sleep(2500);
      const res = { bytesWarm };
      res.nmg = await measure3(page);
      await page.evaluate((p, h) => { const g = window.__bk, T = window.__bkTHREE; g.skater.teleport(new T.Vector3(p[0], 0, p[2]), h, 'walk'); g.rig.snapBehind(g.skater); g.loadNpc('bella'); }, V(0.8, -15.5), H(0, 1));
      await sleep(3500);
      res.fg = await measure3(page);
      if (lab === 'V6') {
        await page.evaluate((p, h) => { const g = window.__bk, T = window.__bkTHREE; g.skater.teleport(new T.Vector3(p[0], 1.0, p[2]), h, 'walk'); g.activities.find((a) => a.id === 'danceCombo').start(); }, V(0, 6.0), H(0, 1));
        await sleep(1500); res.baile = await measure(page);
      }
      res.colliders = await page.evaluate(() => { let n = 0; window.__bk.world.forEachCollider(() => n++); return n; });
      out[`${vpName}_${lab}`] = res; R.measure(`${vpName}_${lab}`, res);
    } finally { await b.close(); }
  }
  for (const vp of ['desktop', 'phone']) {
    const a = out[`${vp}_V5`], b = out[`${vp}_V6`];
    R.check(b.nmg.drawCalls <= a.nmg.drawCalls * 1.10 && b.nmg.tris <= a.nmg.tris * 1.15, `${vp}: escena NMG de control dentro del presupuesto relativo V5 (llamadas ×1,10, triángulos ×1,15)`, 'emulation', { V5: a.nmg, V6: b.nmg });
    R.check(b.fg.p95 <= a.fg.p95 + 1 && b.fg.drawCalls <= a.fg.drawCalls * 1.3, `${vp}: FG p95 (mediana de 3 ventanas) ≤ V5 + 1 ms y llamadas ≤ ×1,3 (emulación headless)`, 'emulation', { V5: a.fg, V6: b.fg });
    R.note(`${vp}: FG draw calls ${a.fg.drawCalls} → ${b.fg.drawCalls}, tris ${a.fg.tris} → ${b.fg.tris}, paso ${a.fg.stepMs} → ${b.fg.stepMs} ms, bytes ${a.bytesWarm} → ${b.bytesWarm}`);
  }
}, { timeoutMs: 500000 });
