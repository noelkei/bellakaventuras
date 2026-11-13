// V4-PERF-01 · Perfil antes/después en condiciones EQUIVALENTES: mismo Chrome headless, mismo viewport (1280×800, DPR 1),
// caché fría (perfil nuevo por medida) y caliente (recarga), build de producción servido localmente (V3 = baseline
// game_dist; V4 = dist-v4). Mide: bytes transferidos hasta poder jugar, tiempo hasta JUGAR habilitado, heap JS, draw calls/
// triángulos/texturas y tiempo de fotograma p50/p95 durante 6 s en la llegada (NMG). No certifica móvil físico, 120 Hz
// ni batería (pendientes). Uso: node perf-v4.mjs --url <build> --tag v3|v4
import fs from 'node:fs';
import path from 'node:path';
import { Report, runTest, launch, sleep, arg } from './lib.mjs';
const tag = arg('tag', 'v4'), url = arg('url', 'http://127.0.0.1:5194/') + '?bktest';   // ?bktest: ganchos de lectura en el build de producción
const R = new Report('PERF-01', `perf-${tag}`);
await runTest(R, async () => {
  const runs = [];
  for (const cache of ['fria', 'caliente']) {
    const browser = await launch();
    try {
      const page = await browser.newPage(); await page.setViewport({ width: 1280, height: 800, deviceScaleFactor: 1 });
      const cdp = await page.createCDPSession(); await cdp.send('Network.enable');
      let bytes = 0; cdp.on('Network.loadingFinished', (e) => { bytes += e.encodedDataLength; });
      if (cache === 'caliente') { await page.goto(url, { waitUntil: 'load' }); await page.waitForFunction(() => window.__bk && !document.getElementById('btn-start').disabled, { timeout: 120000 }); bytes = 0; }
      const t0 = Date.now();
      await page.goto(url, { waitUntil: 'load' });
      await page.waitForFunction(() => window.__bk && !document.getElementById('btn-start').disabled, { timeout: 120000 });
      const tReady = Date.now() - t0, bytesReady = bytes;
      await page.click('#btn-start'); await sleep(2500);
      const bytesAfter = bytes;
      const m = await page.evaluate(async () => {
        const g = window.__bk; const ts = []; let last = performance.now();
        await new Promise((res) => { const f = () => { const n = performance.now(); ts.push(n - last); last = n; if (ts.length < 360) requestAnimationFrame(f); else res(); }; requestAnimationFrame(f); });
        const s = ts.slice(10).sort((a, b) => a - b), q = (p) => +s[Math.floor(p * (s.length - 1))].toFixed(2);
        return { p50: q(0.5), p95: q(0.95), max: q(1), drawCalls: g.stats.drawCalls, tris: g.stats.tris, textures: g.stats.textures, geometries: g.stats.geometries, heapMB: performance.memory ? +(performance.memory.usedJSHeapSize / 1048576).toFixed(1) : null };
      });
      runs.push({ cache, tReadyMs: tReady, bytesReadyMB: +(bytesReady / 1048576).toFixed(2), bytesTotalMB: +(bytesAfter / 1048576).toFixed(2), ...m });
    } finally { await browser.close(); }
  }
  R.note({ tag, url, runs });
  const out = path.join(path.dirname(new URL(import.meta.url).pathname), '..', '..', '..', 'V4', 'evidencias', 'PERF'); fs.mkdirSync(out, { recursive: true });
  fs.writeFileSync(path.join(out, `perf_${tag}.json`), JSON.stringify({ tag, url, date: new Date().toISOString(), runs }, null, 1));
  R.check(runs.length === 2 && runs.every((r) => r.p50 > 0 && r.tReadyMs > 0), `perfil ${tag} medido (fría y caliente)`, 'emulation', runs);
  R.pendingHuman('Rendimiento en dispositivos físicos (móvil gama baja/alta, 120 Hz, batería)');
});
