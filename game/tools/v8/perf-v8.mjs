// V8 YY8-12 · copia adaptada de perf-v7 (que queda intacto): base = V7 FINAL R8 (copia de dist-v7 servida en 5233) frente a V8
// (--url, normalmente dist-v8 en 5232). Mismo protocolo (3 ventanas × 300 fotogramas, p95 MEDIANO).
// Escenas: controles NMG, FG y TT (entrada) idénticos en las dos builds; YY comunes en el MISMO punto y rumbo (paseo interior
// mirando el sector y deck exterior mirando hacia dentro; en V7 se ve el descampado) y YY solo V8 (fondo N3 hacia T1, P1 junto a
// la rana). Presupuesto FIJADO ANTES del acabado (09 R8 · contrato de pruebas V8): controles llamadas ≤ ×1,10 y triángulos ≤ ×1,15;
// YY comunes p95 mediano ≤ V7 + 1 ms y llamadas ≤ V7 + 40; YY solo V8 p95 ≤ (máximo p95 de las YY comunes en V7) + 1 ms.
// (Cabecera V7 original:) Rendimiento relativo V6 FINAL R7 (copia de dist-v6 servida en 5223) frente a V7 (--url, normalmente dist-v7 en
// 5222). Adaptación de tools/v6/perf-fg.mjs con el MISMO protocolo: Chrome headless, perfil temporal, caché caliente, mismos
// viewport y DPR, NPC del sector cargados, 3 ventanas de 300 fotogramas por escena y p95 MEDIANO (se guardan las tres).
// Escenas: NMG y FG (controles: ajenas a TT) y tres de TT en el MISMO punto y rumbo en las dos builds: entrada (frente a la
// escalera), plaza al este mirando el conjunto y vista elevada. En V7 además: junto a EV1 y sobre el techo de la limo.
// Presupuesto fijado ANTES de producir (08, R7-10): controles llamadas ≤ ×1,10 y triángulos ≤ ×1,15; TT p95 mediano ≤ V6 +
// 1 ms y llamadas ≤ ×1,30. Emulación de escritorio/móvil: NO es teléfono físico.
import { Report, runTest, launch, sleep, argUrl, VIEWPORTS } from './lib.mjs';
import { W, HD, KIT, ROOF } from './tt-lib.mjs';
const R = new Report('perf-v8');
import { W as YW, HD as YHD } from './yy-lib.mjs';
// V10 (D-EX-01): la corona gira +9°. Los puntos se escriben en el marco de la build nueva (FG 108+9, TT/YY ya girados por sus libs) y en
// V7 se miden en el MISMO sitio relativo deshaciendo el giro (posición −9° alrededor del centro, rumbo +9°). Control NMG: la llegada
// (ancla `nmg.llegada` si la build la tiene; si no, la salida, que en V7–V10 R1 es esa misma llegada).
const CR9 = Math.cos(9 * Math.PI / 180), SR9 = Math.sin(9 * Math.PI / 180);
const unrot = (p, h) => [[CR9 * p[0] + SR9 * p[2], p[1] ?? 0, -SR9 * p[0] + CR9 * p[2]], h + 9 * Math.PI / 180];
const th = (108 + 9) * Math.PI / 180, O = [30.5 * Math.sin(th), -30.5 * Math.cos(th)], Wf = [Math.sin(th), -Math.cos(th)], Sf = [-Math.cos(th), -Math.sin(th)];
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
const TT_SCENES = { tt_entrada: [W(0.6, -8.4), HD(0, 1)] };
const YY_COMMON = { yy_paseo_interior: [YW(1.0, 24.0), YHD(0, 1)], yy_deck_exterior: [YW(-1.0, 37.0), YHD(0.2, -1)] };
const YY_V8 = { yy_n3: [YW(2.5, 27.4, -2.5), YHD(-0.2, 1)], yy_p1: [YW(1.4, 33.6), YHD(0, -1)] };
await runTest(R, async () => {
  const targets = { V7: 'http://127.0.0.1:5233/', V8: argUrl() };
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
      const go = async (p0, h0, npcs) => { const [p, h] = lab === 'V7' ? unrot(p0, h0) : [p0, h0]; await page.evaluate((p, h, npcs) => { const g = window.__bk, T = window.__bkTHREE; g.skater.teleport(new T.Vector3(p[0], p[1] ?? 0, p[2]), h, 'walk'); g.rig.snapBehind(g.skater); for (const n of npcs) g.loadNpc(n); }, p, h, npcs); await sleep(3500); };
      await page.evaluate(() => { const g = window.__bk, a = g.manifest?.anchors?.get?.('nmg.llegada'); if (a) { g.skater.teleport(a.pos.clone(), a.heading, 'walk'); g.rig.snapBehind(g.skater); } }); await sleep(3500);
      res.nmg = await measure3(page);
      await go(VF(0.8, -15.5), HF(0, 1), ['bella']); res.fg = await measure3(page);
      for (const [k, [p, h]] of Object.entries(TT_SCENES)) { await go(p, h, ['aissa', 'juseph']); res[k] = await measure3(page); }
      for (const [k, [p, h]] of Object.entries(YY_COMMON)) { await go(p, h, ['rana']); res[k] = await measure3(page); }
      if (lab === 'V8') for (const [k, [p, h]] of Object.entries(YY_V8)) { await go(p, h, ['rana']); res[k] = await measure3(page); }
      res.colliders = await page.evaluate(() => { let n = 0; window.__bk.world.forEachCollider(() => n++); return n; });
      out[`${vpName}_${lab}`] = res; R.measure(`${vpName}_${lab}`, res);
    } finally { await b.close(); }
  }
  for (const vp of ['desktop', 'phone']) {
    const a = out[`${vp}_V7`], b = out[`${vp}_V8`];
    // V10.4 R15 (usuario, 20 oct: «Bella está muy trinchada… a lo mejor deberíamos subir el límite de triángulos, aunque puede ser un poco
    // flexible»; copia previa en V10/backups/pruebas/V10_4-R10): en la vista de FG el tope de triángulos pasa de ×1,15 a ×1,27 por las cinco
    // Bella de 40 k (malla completa simplificada con meshoptimizer). Medido: p95 de FG 18,2 ms frente a 18,7 de V7 (escritorio) y 18,0 frente a
    // 18,5 (móvil), con menos llamadas de dibujo; el resto de topes no cambia
    const TRIS = { fg: 1.27 };
    for (const k of ['nmg', 'fg', 'tt_entrada']) R.check(b[k].drawCalls <= a[k].drawCalls * 1.10 && b[k].tris <= a[k].tris * (TRIS[k] ?? 1.15), `${vp}: control ${k} dentro del presupuesto relativo V7 (llamadas ×1,10, triángulos ×${String(TRIS[k] ?? 1.15).replace('.', ',')})`, 'emulation', { V7: [a[k].drawCalls, a[k].tris, a[k].p95], V8: [b[k].drawCalls, b[k].tris, b[k].p95] });
    for (const k of Object.keys(YY_COMMON)) R.check(b[k].p95 <= a[k].p95 + 1 && b[k].drawCalls <= a[k].drawCalls + 40, `${vp}: ${k} p95 (mediana de 3 ventanas) ≤ V7 + 1 ms y llamadas ≤ V7 + 40`, 'emulation', { V7: [a[k].drawCalls, a[k].tris, a[k].p95, a[k].p95s], V8: [b[k].drawCalls, b[k].tris, b[k].p95, b[k].p95s] });
    const ref = Math.max(...Object.keys(YY_COMMON).map((k) => a[k].p95));
    for (const k of Object.keys(YY_V8)) R.check(b[k].p95 <= ref + 1, `${vp}: ${k} (solo V8) p95 ≤ máximo YY común en V7 (${ref}) + 1 ms`, 'emulation', { V8: [b[k].drawCalls, b[k].tris, b[k].p95, b[k].p95s] });
    R.note(`${vp}: YY paseo interior llamadas ${a.yy_paseo_interior.drawCalls} → ${b.yy_paseo_interior.drawCalls}, tris ${a.yy_paseo_interior.tris} → ${b.yy_paseo_interior.tris}, paso ${a.yy_paseo_interior.stepMs} → ${b.yy_paseo_interior.stepMs} ms; texturas ${a.yy_paseo_interior.textures} → ${b.yy_paseo_interior.textures}; descarga en caliente ${a.bytesWarm} → ${b.bytesWarm} bytes; colliders ${a.colliders} → ${b.colliders}; heap ${a.yy_paseo_interior.heapMB} → ${b.yy_paseo_interior.heapMB} MB`);
  }
  R.pendingHuman('rendimiento en teléfono físico (aquí emulación headless en escritorio)');
}, { timeoutMs: 900000 });
