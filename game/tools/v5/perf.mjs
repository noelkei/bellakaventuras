// T5-00/T5-32 · Rendimiento relativo (DT-35, COV-10). Misma ruta, resolución, DPR y calidad para A y V5: Chrome headless,
// caché fría (perfil nuevo) y caliente (recarga), llegada NMG (spawn) durante 6 s. Escritorio 1280×800 DPR 1 y emulación
// móvil 390×844 DPR 2 (emulación, NO teléfono). Mide: tiempo hasta JUGAR habilitado, bytes, heap, draw calls, triángulos,
// texturas, geometrías, colliders, coste del paso fijo (ms medios de fixedUpdate) y p50/p95 de fotograma.
// Presupuesto V5 relativo a A (escritorio): draw calls ≤ A·1,10; triángulos ≤ A·1,15; p95 ≤ A + 1 ms. En A guarda la base.
import { Report, runTest, launch, sleep, argUrl, VIEWPORTS, baselineGet, baselineSet, isA, r3 } from './lib.mjs';

const R = new Report('perf');
await runTest(R, async () => {
  const url = argUrl() + '?bktest=1';
  const runs = [];
  for (const [vpName, vp] of [['desktop', VIEWPORTS.desktop], ['phone', VIEWPORTS.phone]]) for (const cache of ['fria', 'caliente']) {
    const browser = await launch();
    try {
      const page = await browser.newPage(); await page.setViewport(vp);
      const cdp = await page.createCDPSession(); await cdp.send('Network.enable');
      let bytes = 0; cdp.on('Network.loadingFinished', (e) => { bytes += e.encodedDataLength; });
      if (cache === 'caliente') { await page.goto(url, { waitUntil: 'load' }); await page.waitForFunction(() => window.__bk && !document.getElementById('btn-start').disabled, { timeout: 120000 }); bytes = 0; }
      const t0 = Date.now();
      await page.goto(url, { waitUntil: 'load' });
      await page.waitForFunction(() => window.__bk && !document.getElementById('btn-start').disabled, { timeout: 120000 });
      const tReady = Date.now() - t0, bytesReady = bytes;
      await page.click('#btn-start'); await sleep(3000);
      const m = await page.evaluate(async () => {
        const g = window.__bk; const ts = []; let last = performance.now();
        // coste del paso fijo: envoltura de medida (solo lectura del reloj)
        const fu = g.fixedUpdate.bind(g); let stepMs = 0, steps = 0; g.fixedUpdate = (dt) => { const a = performance.now(); fu(dt); stepMs += performance.now() - a; steps++; };
        await new Promise((res) => { const f = () => { const n = performance.now(); ts.push(n - last); last = n; if (ts.length < 360) requestAnimationFrame(f); else res(); }; requestAnimationFrame(f); });
        g.fixedUpdate = fu;
        const s = ts.slice(10).sort((a, b) => a - b), q = (p) => +s[Math.floor(p * (s.length - 1))].toFixed(2);
        let colliders = 0; g.world.forEachCollider(() => colliders++);
        return { p50: q(0.5), p95: q(0.95), max: q(1), drawCalls: g.stats.drawCalls, tris: g.stats.tris, textures: g.stats.textures, geometries: g.stats.geometries, colliders, stepMs: +(stepMs / Math.max(1, steps)).toFixed(3), pixelRatio: g.renderer.getPixelRatio(),
          heapMB: performance.memory ? +(performance.memory.usedJSHeapSize / 1048576).toFixed(1) : null };
      });
      runs.push({ vp: vpName, cache, tReadyMs: tReady, bytesReadyMB: +(bytesReady / 1048576).toFixed(2), ...m });
      console.log(JSON.stringify(runs.at(-1)));
    } finally { await browser.close(); }
  }
  R.measure('runs', runs);
  const d = runs.find((r) => r.vp === 'desktop' && r.cache === 'caliente');
  if (isA(R)) baselineSet(R, 'perf_desktop_caliente', d, 'perf.mjs escritorio caché caliente (llegada NMG 6 s)');
  const A = baselineGet('perf_desktop_caliente');
  R.check(!!A && d.drawCalls <= A.drawCalls * 1.10, 'draw calls ≤ A·1,10 (escritorio, llegada NMG)', 'emulation', { v: d.drawCalls, A: A?.drawCalls });
  R.check(!!A && d.tris <= A.tris * 1.15, 'triángulos ≤ A·1,15', 'emulation', { v: d.tris, A: A?.tris });
  R.check(!!A && d.p95 <= A.p95 + 1, 'p95 de fotograma ≤ A + 1 ms (headless; orientativo)', 'emulation', { v: d.p95, A: A?.p95 });
  R.pendingHuman('Rendimiento en el teléfono del usuario (G8): p95 y estabilidad 10 min en NMG y centro con coches');
});
