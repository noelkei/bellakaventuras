// V10 · ext-cierre · D-EX-01 (Bola de Oro §13 «muro nativo físico», sin barreras invisibles en las letras; plan 10 E-14): no se puede salir
// del cuadrado. Para 48 puntos a lo largo del cuadrado (a 2,5 m por dentro del muro perimetral) se busca lo MÁS ALTO alcanzable cerca
// ALCANZABLE en un radio de 2,5 m (R6b: recorrido por rejilla desde el suelo subiendo solo ≤ 1,2 m por casilla, lo que da el ollie) y, desde ahí (fixture declarada), carrera hacia el muro
// en tabla a 8 m/s con SALTO (entrada real) y también andando con SALTO. Tras 3 s: ANMI dentro del cuadrado (|x|, |z| ≤ 52,2) y no encima
// de la coronación del muro.
// Uso: node tools/v10/ext-cierre.mjs --url v10 --task V10-R6 --label final
import { Report, runTest } from '../v8/lib.mjs';
import { launch, abrir, run } from '../v8/r11/f5-lib.mjs';
const R = new Report('ext-cierre');
await runTest(R, async () => {
  const b = await launch();
  try {
    const page = await abrir(b, R, { save: null });
    const spots = await page.evaluate(() => { const g = window.__bk, RA = window.__bkRapier, W = g.world, FL = RA.QueryFilterFlags.EXCLUDE_SENSORS | RA.QueryFilterFlags.EXCLUDE_KINEMATIC;
      const skip = (c) => g.npcColliders.has(c.handle) || c === g.skater.collider;
      const top = (x, z) => { const h = W.castRay(new RA.Ray({ x, y: 12, z }, { x: 0, y: -1, z: 0 }), 14, true, FL, undefined, undefined, undefined, (c) => !skip(c)); return h ? 12 - h.timeOfImpact : -9; };
      const free = (x, y, z) => !W.intersectionWithShape({ x, y: y + 0.97, z }, { x: 0, y: 0, z: 0, w: 1 }, new RA.Capsule(0.45, 0.4), FL, undefined, undefined, undefined, (c) => !skip(c));
      // alcance real (R6b): rejilla de 0,5 m en el cuadrado; desde el suelo (Y 0) se sube a una casilla vecina si su cima está ≤ 1,2 m por
      // encima (ollie ≈ 1,17 m, TUNING.ollieVel) y cabe la cápsula; bajar siempre se puede. Lo alto que no se alcanza así no cuenta
      const S = 0.5, N = Math.round(104.4 / S), X = (i) => -52.2 + (i + 0.5) * S, tops = new Float32Array(N * N), ok = new Uint8Array(N * N), reach = new Uint8Array(N * N);
      for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) { const x = X(i), z = X(j), y = top(x, z); tops[i * N + j] = y; ok[i * N + j] = y >= -0.1 && y < 7 && free(x, y, z) ? 1 : 0; }
      const q = []; for (let k = 0; k < N * N; k++) if (ok[k] && Math.abs(tops[k]) < 0.05) { reach[k] = 1; q.push(k); }
      while (q.length) { const k = q.pop(), i = Math.floor(k / N), j = k % N;
        for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const a = i + di, c = j + dj; if (a < 0 || c < 0 || a >= N || c >= N) continue; const m = a * N + c; if (reach[m] || !ok[m]) continue; if (tops[m] - tops[k] <= 1.2) { reach[m] = 1; q.push(m); } } }
      const out = [], H = 52.2 - 2.5;
      for (let k = 0; k < 48; k++) { const side = Math.floor(k / 12), t = ((k % 12) + 0.5) / 12 * 2 - 1;
        const [cx, cz, nx, nz] = side === 0 ? [t * H, -H, 0, -1] : side === 1 ? [H, t * H, 1, 0] : side === 2 ? [-t * H, H, 0, 1] : [-H, -t * H, -1, 0];
        let best = null; for (let i = 0; i < N; i++) { const x = X(i); if (Math.abs(x - cx) > 2.5) continue; for (let j = 0; j < N; j++) { const z = X(j); if (Math.abs(z - cz) > 2.5) continue; const m = i * N + j; if (!reach[m]) continue; const y = tops[m]; if (!best || y > best.y) best = { x, y, z }; } }
        if (best) out.push({ ...best, n: [nx, nz] }); }
      window.__reachMax = Math.max(...Array.from(tops).filter((_, m) => reach[m]));
      return out; });
    R.measure('puntos', spots.length); R.measure('alcance_max', await page.evaluate(() => window.__reachMax)); R.measure('alturas', spots.map((p) => +p.y.toFixed(2)));
    const esc = [];
    for (const p of spots) for (const loco of ['ride', 'walk']) {
      // W mantenida y SALTO (Espacio real) a los 0,25 s, hacia el muro
      const r = await run(page, { p: [p.x, p.y + 0.02, p.z], h: Math.atan2(p.n[0], p.n[1]), v: loco === 'ride' ? 8 : 0, loco, sec: 3, pre: "key('KeyW', true)",
        script: "if (st === 15) key('Space', true); if (st === 19) key('Space', false); M.maxOut = Math.max(M.maxOut ?? 0, Math.abs(s.footPos.x), Math.abs(s.footPos.z)); M.maxY = Math.max(M.maxY ?? -9, s.footPos.y);" });
      if (r.maxOut > 52.2) esc.push({ p, loco, ...r });
    }
    R.measure('escapes', esc);
    R.check(spots.length >= 40, `puntos altos junto al muro perimetral encontrados: ${spots.length}`, 'fixture');
    R.check(esc.length === 0, `desde lo más alto junto al muro, carrera y salto (tabla y a pie): nadie sale del cuadrado (${esc.length} escapes de ${spots.length * 2})`, 'emulation', esc.slice(0, 6));
  } finally { await b.close(); }
}, { timeoutMs: 600000 });
