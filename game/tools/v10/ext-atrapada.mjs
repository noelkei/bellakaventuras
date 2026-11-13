// V10 IT3 · ext-atrapada · feedback humano: «que no te puedas quedar atrapado en ningún lado del parque de la Bola de Oro y luego no salir,
// ni quedarte atrapado por saltar una rampa e irte a los edificios». Grafo de alcance sobre una rejilla de 0,5 m de todo el cuadrado:
//  · celda = cima sólida bajo un rayo vertical (sin sensores, NPC ni cinemáticos) donde cabe la cápsula de ANMI;
//  · movimientos: a la vecina subiendo ≤ 1,2 m (ollie, TUNING.ollieVel) o bajando lo que sea; salto de hueco hasta 2,5 m en línea recta con
//    Δh ≤ 1,0 si nada en medio sobresale más de 1,2 m sobre el despegue; desde una celda de TRANSICIÓN (quarter, kicker, bank, hip: lanza)
//    a cualquier celda a ≤ 4 m con Δh ≤ 4,5 (los vuelos vert/kick de vert-camara suben hasta 4,4 m);
//  · alcanzables = desde la plaza de salida; ATRAPADA = alcanzable desde la plaza pero sin camino de vuelta a ella con los mismos movimientos.
// Las celdas atrapadas se agrupan (componentes) y cada grupo se confirma con el controlador real (fixture: ANMI colocada en la celda; 6 s con
// W + giros + saltos con teclas reales en 8 rumbos): si en algún intento sale del grupo, no es trampa.
// Plaza de salida: (40, 0, −40) (Bola de Oro §05).
// Uso: node tools/v10/ext-atrapada.mjs --url v10 --task V10-IT3 --label final
import { Report, runTest } from '../v8/lib.mjs';
import { launch, abrir, run } from '../v8/r11/f5-lib.mjs';
const R = new Report('ext-atrapada');
await runTest(R, async () => {
  const b = await launch();
  try {
    const page = await abrir(b, R, { save: null });
    const res = await page.evaluate(() => { const g = window.__bk, RA = window.__bkRapier, W = g.world, FL = RA.QueryFilterFlags.EXCLUDE_SENSORS | RA.QueryFilterFlags.EXCLUDE_KINEMATIC;
      const skip = (c) => g.npcColliders.has(c.handle) || c === g.skater.collider;
      const S = 0.5, H = 52.2, N = Math.round(2 * H / S), X = (i) => -H + (i + 0.5) * S;
      const tops = new Float32Array(N * N), ok = new Uint8Array(N * N), tr = new Uint8Array(N * N);
      const isTr = (h) => g.park.transitions.has(h) || (g.park.vertFaces?.has?.(h) ?? false);
      for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) { const x = X(i), z = X(j), k = i * N + j;
        const h = W.castRayAndGetNormal(new RA.Ray({ x, y: 40, z }, { x: 0, y: -1, z: 0 }), 45, true, FL, undefined, undefined, undefined, (c) => !skip(c));
        // rampa = transición declarada o cualquier cara inclinada (banks, alas, onda, bajadas…) por encima del suelo
        const y = h ? 40 - h.timeOfImpact : -9; tops[k] = y; if (h && (isTr(h.collider.handle) || (h.normal.y > 0.3 && h.normal.y < 0.97 && y > 0.1))) tr[k] = 1;
        ok[k] = y > -3 && !W.intersectionWithShape({ x, y: y + 0.97, z }, { x: 0, y: 0, z: 0, w: 1 }, new RA.Capsule(0.45, 0.4), FL, undefined, undefined, undefined, (c) => !skip(c)) ? 1 : 0; }
      // vecinos de cada celda (lista de aristas dirigidas)
      const nb = (k, f) => { const i = Math.floor(k / N), j = k % N, h0 = tops[k];
        for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const a = i + di, c = j + dj; if (a < 0 || c < 0 || a >= N || c >= N) continue; const m = a * N + c; if (ok[m] && tops[m] - h0 <= 1.2) f(m); }
        for (let di = -5; di <= 5; di++) for (let dj = -5; dj <= 5; dj++) { const d = Math.hypot(di, dj) * S; if (d <= 0.75 || d > 2.5) continue; const a = i + di, c = j + dj; if (a < 0 || c < 0 || a >= N || c >= N) continue; const m = a * N + c; if (!ok[m] || Math.abs(tops[m] - h0) > 1.0) continue;
          let libre = true; const n = Math.ceil(d / S); for (let t = 1; t < n && libre; t++) { const ii = Math.round(i + di * t / n), jj = Math.round(j + dj * t / n); if (tops[ii * N + jj] > h0 + 1.2) libre = false; } if (libre) f(m); }
        if (tr[k]) for (let di = -8; di <= 8; di++) for (let dj = -8; dj <= 8; dj++) { const d = Math.hypot(di, dj) * S; if (d > 4) continue; const a = i + di, c = j + dj; if (a < 0 || c < 0 || a >= N || c >= N) continue; const m = a * N + c; if (ok[m] && tops[m] - h0 <= 4.5) f(m); } };
      const sp = { x: 40, z: -40 }, s0 = Math.floor((sp.x + H) / S) * N + Math.floor((sp.z + H) / S);
      const reach = new Uint8Array(N * N), q = [s0]; reach[s0] = 1;
      const rev = new Map();   // aristas inversas para la vuelta
      while (q.length) { const k = q.pop(); nb(k, (m) => { let r = rev.get(m); if (!r) rev.set(m, r = []); r.push(k); if (!reach[m]) { reach[m] = 1; q.push(m); } }); }
      const back = new Uint8Array(N * N), q2 = [s0]; back[s0] = 1;
      while (q2.length) { const m = q2.pop(); for (const k of rev.get(m) ?? []) if (!back[k]) { back[k] = 1; q2.push(k); } }
      const trap = []; for (let k = 0; k < N * N; k++) if (reach[k] && !back[k]) trap.push(k);
      // grupos de celdas atrapadas (vecindad 8)
      const seen = new Set(), grupos = [];
      for (const k of trap) { if (seen.has(k)) continue; const comp = [], st = [k]; seen.add(k); const T = new Set(trap);
        while (st.length) { const c = st.pop(); comp.push(c); const i = Math.floor(c / N), j = c % N; for (let di = -1; di <= 1; di++) for (let dj = -1; dj <= 1; dj++) { const m = (i + di) * N + (j + dj); if (T.has(m) && !seen.has(m)) { seen.add(m); st.push(m); } } }
        const cs = comp.map((c) => [X(Math.floor(c / N)), tops[c], X(c % N)]), cx = cs.reduce((a, p) => a + p[0], 0) / cs.length, cz = cs.reduce((a, p) => a + p[2], 0) / cs.length;
        const rep = cs.reduce((a, p) => (Math.hypot(p[0] - cx, p[2] - cz) < Math.hypot(a[0] - cx, a[2] - cz) ? p : a));
        let nombre = null; { const h = W.castRay(new RA.Ray({ x: rep[0], y: rep[1] + 0.5, z: rep[2] }, { x: 0, y: -1, z: 0 }), 1, true, FL, undefined, undefined, undefined, (c) => !skip(c)); nombre = h ? g.park.colliderName(h.collider.handle) : null; }
        grupos.push({ n: comp.length, rep: rep.map((v) => +v.toFixed(2)), r: +Math.hypot(rep[0], rep[2]).toFixed(1), sobre: nombre, celdas: cs.slice(0, 400) }); }
      let nReach = 0; for (let k = 0; k < N * N; k++) nReach += reach[k];
      window.__atrBack = { N, S, H, back };   // para confirmar salidas en la página
      // rampas (celdas de transición) agrupadas: centroides para los lanzamientos
      const rampas = []; { const seenT = new Set(); for (let k = 0; k < N * N; k++) { if (!tr[k] || !reach[k] || seenT.has(k)) continue; const st = [k], comp = []; seenT.add(k);
        while (st.length) { const c = st.pop(); comp.push(c); const i = Math.floor(c / N), j = c % N; for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const m = (i + di) * N + (j + dj); if (m >= 0 && m < N * N && tr[m] && !seenT.has(m)) { seenT.add(m); st.push(m); } } }
        if (comp.length < 6) continue; const cx = comp.reduce((a, c) => a + X(Math.floor(c / N)), 0) / comp.length, cz = comp.reduce((a, c) => a + X(c % N), 0) / comp.length;
        let nombre = null; { const h = W.castRay(new RA.Ray({ x: cx, y: 40, z: cz }, { x: 0, y: -1, z: 0 }), 45, true, FL, undefined, undefined, undefined, (c) => !skip(c)); nombre = h ? g.park.colliderName(h.collider.handle) : null; }
        rampas.push({ c: [+cx.toFixed(2), +cz.toFixed(2)], n: comp.length, nombre }); } }
      window.__atrRampas = rampas;
      return { N, nReach, nTrap: trap.length, grupos: grupos.sort((a, b) => b.n - a.n) }; });
    R.measure('alcance', { celdas: res.nReach, atrapadas: res.nTrap, grupos: res.grupos.map((g) => ({ n: g.n, rep: g.rep, r: g.r, sobre: g.sobre })) });
    R.check(res.nReach > 20000, `rejilla: ${res.nReach} celdas alcanzables desde la plaza`, 'fixture', {});
    // confirmación con el controlador real en cada grupo
    const reales = [];
    for (const gr of res.grupos.slice(0, 40)) {
      const dentro = new Set(gr.celdas.map((c) => `${Math.round(c[0] * 2)},${Math.round(c[2] * 2)}`));
      let sale = false; const intentos = [];
      for (let a = 0; a < 8 && !sale; a++) for (const loco of ['ride', 'walk']) { if (sale) break;
        const r = await run(page, { p: [gr.rep[0], gr.rep[1] + 0.03, gr.rep[2]], h: a * Math.PI / 4, v: loco === 'ride' ? 4 : 0, loco, sec: 6, pre: "key('KeyW', true)",
          script: "if (st % 50 === 10) key('Space', true); if (st % 50 === 14) key('Space', false); if (st % 120 === 60) key('KeyA', true); if (st % 120 === 80) key('KeyA', false); { const B = window.__atrBack, i = Math.floor((s.footPos.x + B.H) / B.S), j = Math.floor((s.footPos.z + B.H) / B.S); if (s.grounded && i >= 0 && j >= 0 && i < B.N && j < B.N && B.back[i * B.N + j] && Math.abs(s.footPos.y - 0) < 9) M.vuelve = 1; } M.tr ??= []; if (st % 10 === 0) M.tr.push([+s.footPos.x.toFixed(2), +s.footPos.z.toFixed(2), +s.footPos.y.toFixed(2)]);" });
        // sale = apoyada en una celda desde la que el grafo vuelve a la plaza (no basta con pisar una vecina)
        const fuera = !!r.vuelve && !dentro.has(`${Math.round(r.end[0] * 2)},${Math.round(r.end[2] * 2)}`);   /* una recolocación automática no es salir por su pie */
        intentos.push({ a, loco, end: r.end, fuera }); if (fuera) sale = true; }
      if (!sale) reales.push({ ...gr, celdas: undefined, intentos: intentos.slice(0, 4) });
    }
    // lanzamientos desde cada rampa (feedback: «saltar una rampa e irte a los edificios»): 8 rumbos × 9 y 13 m/s con W, ollie al pisar la
    // transición y otro en el aire; tras 5 s debe estar apoyada en una celda con vuelta a la plaza o poder volver con los intentos de salida
    const rampas = await page.evaluate(() => window.__atrRampas.filter((r) => Math.hypot(r.c[0], r.c[1]) > 22));
    R.measure('rampas', rampas);
    const LANZA = "if (!M.j && s.groundCollider !== null && g.park.transitions.has(s.groundCollider)) { M.j = st; key('Space', true); } if (M.j && st === M.j + 4) key('Space', false); if (M.j && st === M.j + 30) key('Space', true); if (M.j && st === M.j + 34) { key('Space', false); key('KeyW', false); }"
      + " { const B = window.__atrBack, i = Math.floor((s.footPos.x + B.H) / B.S), j = Math.floor((s.footPos.z + B.H) / B.S); M.ok = s.grounded && i >= 0 && j >= 0 && i < B.N && j < B.N && !!B.back[i * B.N + j]; }";
    const lanzTrampas = []; let lanzN = 0;
    for (const rp of rampas) for (let a = 0; a < 8; a++) for (const v of [9, 13]) { const h = a * Math.PI / 4, p = [rp.c[0] - Math.sin(h) * 7, null, rp.c[1] - Math.cos(h) * 7];
      const y = await page.evaluate((p) => window.__R11.ray(p[0], p[2], 8, 12)?.y, p); if (y === undefined || y > 0.6) continue; p[1] = y + 0.03; lanzN++;
      const r = await run(page, { p, h, v, loco: 'ride', sec: 5, pre: "key('KeyW', true)", script: LANZA });
      if (r.ok) continue;
      // no ha quedado en zona con vuelta: intentos de salida desde donde cayó
      let sale = false; for (let b2 = 0; b2 < 8 && !sale; b2++) { const e = await run(page, { p: [r.end[0], r.end[1] + 0.03, r.end[2]], h: b2 * Math.PI / 4, v: 0, loco: 'walk', sec: 5, pre: "key('KeyW', true)",
        script: "if (st % 50 === 10) key('Space', true); if (st % 50 === 14) key('Space', false); { const B = window.__atrBack, i = Math.floor((s.footPos.x + B.H) / B.S), j = Math.floor((s.footPos.z + B.H) / B.S); if (s.grounded && i >= 0 && j >= 0 && i < B.N && j < B.N && B.back[i * B.N + j]) M.vuelve = 1; }" }); if (e.vuelve) sale = true; }
      if (!sale) lanzTrampas.push({ rampa: rp, rumbo: a * 45, v, cae: r.end }); }
    R.measure('lanzamientos', { n: lanzN, trampas: lanzTrampas });
    R.check(lanzN >= 100, `lanzamientos desde rampas e inclinadas del parque y la corona: ${lanzN} (${rampas.length} rampas × 8 rumbos × 2 velocidades, salvo salidas ocupadas)`, 'fixture', {});
    R.check(lanzTrampas.length === 0, `saltando desde cualquier rampa ANMI nunca acaba donde no pueda volver (${lanzTrampas.length} casos)`, 'emulation', lanzTrampas.slice(0, 8));
    R.measure('trampas_confirmadas', reales);
    R.check(reales.length === 0, `ninguna zona alcanzable desde la plaza deja a ANMI atrapada (grupos del grafo: ${res.grupos.length}; confirmados con el controlador: ${reales.length})`, 'emulation', reales.map((g) => ({ n: g.n, rep: g.rep, r: g.r, sobre: g.sobre })));
  } finally { await b.close(); }
}, { timeoutMs: 1800000 });
