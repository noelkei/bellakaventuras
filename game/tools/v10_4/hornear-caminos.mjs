// V10.4 R9 (R4-02) · hornea la rejilla de caminos ANDABLES del modo ayuda sobre el mapa ya terminado de V10.3: celdas de 0,5 m en todo el
// parque jugable (x, z ∈ ±62 m), hasta 2 suelos por celda (bajo y sobre puentes), y para cada suelo los 8 vecinos a los que se puede ir
// andando: se muestrea el suelo cada 0,1 m a lo largo del paso y ningún escalón puede pasar de lo que sube ANMI a pie (autostep 0,18 +
// pendiente de 52°), y debe haber sitio de pie (1,75 m) en el destino. Las escaleras de mano (manifest.ladders) se añaden como enlaces.
// No se dibuja nada a mano. Escribe game/public/assets/nav/caminos.json (base64 de un binario compacto) e informe en V8/evidencias.
// Uso (con una partida de 20 y la revelación vista, sin valla): node game/tools/v10_4/hornear-caminos.mjs --url <url> --task V10_4-R9 --label horneado
import fs from 'node:fs';
import path from 'node:path';
import { Report, runTest, launch, openGame, clickStart, sleep, SAVE_20, ROOT } from '../v8/lib.mjs';
const R = new Report('hornear-caminos');
await runTest(R, async () => { const b = await launch(); const page = await openGame(b, R, { save: SAVE_20 }); await clickStart(page); await sleep(2500);
  const out = await page.evaluate(() => {
    const g = window.__bk, RA = window.__bkRapier, W = g.world, F = RA.QueryFilterFlags.EXCLUDE_SENSORS | RA.QueryFilterFlags.EXCLUDE_KINEMATIC;
    const skc = g.skater.collider, C = 0.5, H = 62, N = Math.round(2 * H / C), STEP = 0.2, SLOPE = Math.tan(52 * Math.PI / 180), HEAD = 1.75;
    const down = (x, y, z, max = 30) => { const h = W.castRay(new RA.Ray({ x, y, z }, { x: 0, y: -1, z: 0 }), max, true, F, undefined, skc); return h ? y - h.timeOfImpact : null; };
    const up = (x, y, z, max) => !!W.castRay(new RA.Ray({ x, y, z }, { x: 0, y: 1, z: 0 }), max, true, F, undefined, skc);
    // 1) suelos por celda: rayos desde arriba encadenados (hasta 3 superficies), con sitio de pie encima
    const layers = new Array(N * N);
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) { const x = -H + (i + 0.5) * C, z = -H + (j + 0.5) * C, L = []; let y = 14;
      for (let k = 0; k < 4 && y > -4; k++) { const h = down(x, y, z, y + 4); if (h === null) break; if (!up(x, h + 0.05, z, HEAD) && h > -3.5) L.push(h); y = h - 0.05; }
      layers[j * N + i] = L.slice(0, 2); }
    // 2) vecinos andables por suelo
    const D8 = [[1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1], [0, -1], [1, -1]];
    const edges = new Array(N * N); let nEdge = 0, nCell = 0;
    const walk = (x0, z0, h0, x1, z1, h1) => { const n = Math.ceil(Math.hypot(x1 - x0, z1 - z0) / 0.1); let prev = h0;
      for (let s = 1; s <= n; s++) { const t = s / n, x = x0 + (x1 - x0) * t, z = z0 + (z1 - z0) * t, ref = h0 + (h1 - h0) * t, hh = down(x, Math.max(prev, ref) + 0.6, z, 1.5);
        if (hh === null || Math.abs(hh - prev) > STEP + 0.02) return false; if (up(x, hh + 0.05, z, 1.6)) return false; prev = hh; }
      return Math.abs(prev - h1) < 0.12; };
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) { const L = layers[j * N + i]; edges[j * N + i] = L.map(() => [0, 0]);
      if (L.length) nCell++;
      L.forEach((h0, a) => { const x0 = -H + (i + 0.5) * C, z0 = -H + (j + 0.5) * C;
        D8.forEach(([di, dj], d) => { const ii = i + di, jj = j + dj; if (ii < 0 || jj < 0 || ii >= N || jj >= N) return; const L2 = layers[jj * N + ii];
          L2.forEach((h1, bb) => { if (Math.abs(h1 - h0) > 1.0) return; if (walk(x0, z0, h0, x0 + di * C, z0 + dj * C, h1)) { edges[j * N + i][a][0] |= 1 << d; edges[j * N + i][a][1] |= bb << d; nEdge++; } }); }); }); }
    // 3) binario: por celda [nº de suelos (u8)], y por suelo [altura cm (i16), vecinos (u8), capa del vecino (u8)]
    // por celda: un byte de cabecera = nº de suelos (bits 0–1) + bit 7 si lleva el byte de «capa del vecino»; una celda vacía lleva detrás
    // cuántas vacías seguidas hay (1–255). Por suelo: altura en cm (i16), vecinos (u8) y, si hace falta, capa del vecino (u8)
    const bytes = []; const i16 = (v) => { const u = Math.round(v * 100) & 0xffff; bytes.push(u & 255, u >> 8); };
    for (let c = 0; c < N * N; ) { const L = layers[c];
      if (!L.length) { let run = 1; while (run < 255 && c + run < N * N && !layers[c + run].length) run++; bytes.push(0, run); c += run; continue; }
      const eb = L.some((_, a) => edges[c][a][1] !== 0); bytes.push(L.length | (eb ? 128 : 0)); L.forEach((h, a) => { i16(h); bytes.push(edges[c][a][0]); if (eb) bytes.push(edges[c][a][1]); }); c++; }
    let bin = ''; for (const v of bytes) bin += String.fromCharCode(v);
    const ladders = g.park.manifest.ladders.map((l) => ({ id: l.id, foot: [+l.axis.x.toFixed(2), +(l.bottom ?? 0).toFixed(2), +l.axis.z.toFixed(2)], top: [+l.topPos.x.toFixed(2), +l.topPos.y.toFixed(2), +l.topPos.z.toFixed(2)] }));
    return { json: { v: 2, cell: C, half: H, n: N, data: btoa(bin), ladders, note: 'V10.4 R9: rejilla de caminos andables (game/tools/v10_4/hornear-caminos.mjs)' }, stats: { nCell, nEdge, bytes: bytes.length } };
  });
  const dst = path.join(ROOT, 'game/public/assets/nav/caminos.json'); fs.mkdirSync(path.dirname(dst), { recursive: true });
  fs.writeFileSync(dst, JSON.stringify(out.json)); const sz = fs.statSync(dst).size;
  R.measure('rejilla', { ...out.stats, archivo: path.relative(ROOT, dst), kB: +(sz / 1024).toFixed(1) });
  R.check(sz < 300 * 1024, `caminos.json < 300 KB (${(sz / 1024).toFixed(1)} KB)`, 'static');
  await b.close(); }, { timeoutMs: 900000 });
