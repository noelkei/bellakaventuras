// V7 T7-13 · Rendimiento relativo V6 FINAL R7 (copia de dist-v6 servida en 5223) frente a V7 (--url, normalmente dist-v7 en
// 5222). Adaptación de tools/v6/perf-fg.mjs con el MISMO protocolo: Chrome headless, perfil temporal, caché caliente, mismos
// viewport y DPR, NPC del sector cargados, 3 ventanas de 300 fotogramas por escena y p95 MEDIANO (se guardan las tres).
// Escenas: NMG y FG (controles: ajenas a TT) y tres de TT en el MISMO punto y rumbo en las dos builds: entrada (frente a la
// escalera), plaza al este mirando el conjunto y vista elevada. En V7 además: junto a EV1 y sobre el techo de la limo.
// Presupuesto fijado ANTES de producir (08, R7-10): controles llamadas ≤ ×1,10 y triángulos ≤ ×1,15; TT p95 mediano ≤ V6 +
// 1 ms y llamadas ≤ ×1,30. Emulación de escritorio/móvil: NO es teléfono físico.
import { Report, runTest, launch, sleep, argUrl, VIEWPORTS } from './lib.mjs';
import { W, HD, KIT, ROOF } from './tt-lib.mjs';
const R = new Report('perf-v7');
const th = 108 * Math.PI / 180, O = [30.5 * Math.sin(th), -30.5 * Math.cos(th)], Wf = [Math.sin(th), -Math.cos(th)], Sf = [-Math.cos(th), -Math.sin(th)];
const VF = (w, s) => [O[0] + Wf[0] * w + Sf[0] * s, 0, O[1] + Wf[1] * w + Sf[1] * s], HF = (dw, ds) => Math.atan2(Wf[0] * dw + Sf[0] * ds, Wf[1] * dw + Sf[1] * ds);
const measure = (page) => page.evaluate(async () => {
  const g = window.__bk; const ts = []; let last = performance.now();
  const fu = g.fixedUpdate.bind(g); let stepMs = 0, steps = 0; g.fixedUpdate = (dt) => { const a = performance.now(); fu(dt); stepMs += performance.now() - a; steps++; };
  const info = g.renderer.info; let calls = 0, tris = 0, n = 0;
  await new Promise((res) => { const f = () => { const t = performance.now(); ts.push(t - last); last = t; calls += info.render.calls; tris += info.render.triangles; n++; if (ts.length < 300) requestAnimationFrame(f); else res(); }; requestAnimationFrame(f); });
  g.fixedUpdate = fu;
  const s = ts.slice(10).sort((a, b) => a - b), q = (p) => +s[Math.floor(p * (s.length - 1))].toFixed(2);
  return { p50: q(0.5), p95: q(0.95), drawCalls: Math.round(calls / n), tris: Math.round(tris / n), geometries: info.memory.geometries, textures: info.memory.textures, stepMs: +(stepMs / Math.max(1, steps)).toFixed(3), heapMB: performance.memory ? +(performance.memory.usedJSHeapSize / 1048576).toFixed(1) : null };
});
const measure3 = async (page) => { const w = []; for (let i = 0; i < 3; i++) w.push(await measure(page)); const m = [...w].sort((a, b) => a.p95 - b.p95)[1]; return { ...m, p95s: w.map((x) => x.p95) }; };
// escenas TT comunes: puntos de SUELO libres en las dos builds (fuera del tablero antiguo y de la obra nueva)
const TT_SCENES = { tt_entrada: [W(0.6, -8.4), HD(0, 1)], tt_plaza_este: [W(15.2, -4.2), HD(-0.8, 0.6)], tt_interior: [W(-1.0, 9.6), HD(0.2, -1)] };
await runTest(R, async () => {
  const targets = { V6: 'http://127.0.0.1:5223/', V7: argUrl() };
  const out = {};
  for (const [vpName, vp] of [['desktop', VIEWPORTS.desktop], ['phone', VIEWPORTS.phone]]) for (const [lab, url] of Object.entries(targets)) {
    const b = await launch();
    try {
      const page = await b.newPage(); await page.setViewport(vp);
      const cdp = await page.createCDPSession(); await cdp.send('Network.enable'); let bytes = 0; cdp.on('Network.loadingFinished', (e) => { bytes += e.encodedDataLength; });
      await page.goto(url + '?bktest=1', { waitUntil: 'load' }); await page.waitForFunction(() => window.__bk && !document.getElementById('btn-start').disabled, { timeout: 120000 });
      bytes = 0; await page.reload({ waitUntil: 'load' }); await page.waitForFunction(() => window.__bk && !document.getElementById('btn-start').disabled, { timeout: 120000 });
      const bytesWarm = bytes;
      await page.click('#btn-start'); await sleep(2500);
      const res = { bytesWarm };
      const go = async (p, h, npcs) => { await page.evaluate((p, h, npcs) => { const g = window.__bk, T = window.__bkTHREE; g.skater.teleport(new T.Vector3(p[0], p[1] ?? 0, p[2]), h, 'walk'); g.rig.snapBehind(g.skater); for (const n of npcs) g.loadNpc(n); }, p, h, npcs); await sleep(3500); };
      res.nmg = await measure3(page);
      await go(VF(0.8, -15.5), HF(0, 1), ['bella']); res.fg = await measure3(page);
      for (const [k, [p, h]] of Object.entries(TT_SCENES)) { await go(p, h, ['aissa', 'juseph']); res[k] = await measure3(page); }
      if (lab === 'V7') {
        await go(W(10, -0.3, 1.23), HD(0, 1), []); res.tt_ev1 = await measure3(page);
        await go(W(KIT.limo.center[0], 3.6, ROOF + 0.03), HD(0, -1), []); res.tt_techo = await measure3(page);
      }
      res.colliders = await page.evaluate(() => { let n = 0; window.__bk.world.forEachCollider(() => n++); return n; });
      out[`${vpName}_${lab}`] = res; R.measure(`${vpName}_${lab}`, res);
    } finally { await b.close(); }
  }
  for (const vp of ['desktop', 'phone']) {
    const a = out[`${vp}_V6`], b = out[`${vp}_V7`];
    for (const k of ['nmg', 'fg']) R.check(b[k].drawCalls <= a[k].drawCalls * 1.10 && b[k].tris <= a[k].tris * 1.15, `${vp}: control ${k.toUpperCase()} dentro del presupuesto relativo V6 (llamadas ×1,10, triángulos ×1,15)`, 'emulation', { V6: [a[k].drawCalls, a[k].tris, a[k].p95], V7: [b[k].drawCalls, b[k].tris, b[k].p95] });
    for (const k of Object.keys(TT_SCENES)) R.check(b[k].p95 <= a[k].p95 + 1 && b[k].drawCalls <= a[k].drawCalls * 1.3, `${vp}: ${k} p95 (mediana de 3 ventanas) ≤ V6 + 1 ms y llamadas ≤ ×1,30`, 'emulation', { V6: [a[k].drawCalls, a[k].tris, a[k].p95, a[k].p95s], V7: [b[k].drawCalls, b[k].tris, b[k].p95, b[k].p95s] });
    R.note(`${vp}: TT entrada llamadas ${a.tt_entrada.drawCalls} → ${b.tt_entrada.drawCalls}, tris ${a.tt_entrada.tris} → ${b.tt_entrada.tris}, paso ${a.tt_entrada.stepMs} → ${b.tt_entrada.stepMs} ms; texturas ${a.tt_entrada.textures} → ${b.tt_entrada.textures}; descarga en caliente ${a.bytesWarm} → ${b.bytesWarm} bytes; colliders ${a.colliders} → ${b.colliders}`);
  }
  R.pendingHuman('rendimiento en teléfono físico (aquí emulación headless en escritorio)');
}, { timeoutMs: 900000 });
