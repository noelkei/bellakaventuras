// V10 R2 · ext-geo · exterior Bola de Oro: geometría física frente al contrato (dossier §13, §16 «Distribución y dimensiones»; plan 10 E-02,
// E-04, E-10, E-12…E-15, E-21, E-29). Estático (Node) + en el juego:
//  · cada una de las 130 raíces físicas + 44 muros tiene sus piezas de colisión, y su caja envolvente = `native_bounds` del contrato (± 2 cm);
//  · en el juego existe cada pieza (nombre `bola_<familia>`, centroide ± 1 cm) y no queda ningún collider del perímetro antiguo;
//  · rayos: cima de cada módulo de skate = cima nativa (± 2 cm); suelo Y 0 en una rejilla del exterior fuera de piezas (± 1 mm);
//  · secciones nativas A-A…F-F (`secciones-nativas.json`): la altura del collider a lo largo de cada corte sigue los segmentos nativos (± 3 cm);
//  · plaza: radio 8,50 / banda 8,90 centrada en (40, −40); paseo 3,50 libres a 45° (malla del lobby).
// Uso: node tools/v10/ext-geo.mjs --url v10 --task V10-R2 --label final   (contra v9 da ROJO)
import fs from 'node:fs';
import { Report, runTest, launch, openGame, clickStart, sleep } from '../v8/lib.mjs';
const R = new Report('ext-geo');
const DOS = '/Users/TU_USUARIO/Desktop/Bellakaventuras/referencias/escenarios/BOLA DE ORO/dossier-definitivo-v1-2026-10-17';
const C = JSON.parse(fs.readFileSync(`${DOS}/contrato-maestro.json`, 'utf8'));
const SEC = JSON.parse(fs.readFileSync(`${DOS}/anexos/planos-v2/secciones-nativas.json`, 'utf8'));
// cajas de cada malla nativa (Three) de la maqueta aprobada: la autoridad para «la forma física corresponde a la pieza visible» (§13)
const BOUNDS = new Map(JSON.parse(fs.readFileSync(`${DOS}/anexos/maqueta-v28/bounds-objetos.json`, 'utf8')).map((o) => [o.name, o]));
const VISUAL = /(_JOINT|_VJOINT|BK_JUNTA|_LEAFDECAL|_BOTANIC|_FOL\d|_LOW\d|_FLOWER|_RIM\d|^V28-)/;
const COLS = JSON.parse(fs.readFileSync('/Users/TU_USUARIO/Desktop/Bellakaventuras/game/public/assets/bola/bola_colliders.json', 'utf8')).parts;
const r3 = (v) => Math.round(v * 1000) / 1000;
const partBox = (p) => { if (p.t === 'cyl') return { mn: [p.c[0] - p.r, p.c[1] - p.h / 2, p.c[2] - p.r], mx: [p.c[0] + p.r, p.c[1] + p.h / 2, p.c[2] + p.r] };
  const mn = [1e9, 1e9, 1e9], mx = [-1e9, -1e9, -1e9]; for (let i = 0; i < p.v.length; i += 3) for (let k = 0; k < 3; k++) { mn[k] = Math.min(mn[k], p.v[i + k]); mx[k] = Math.max(mx[k], p.v[i + k]); } return { mn, mx }; };
const centroid = (p) => { if (p.t === 'cyl') return p.c; let x = 0, y = 0, z = 0, n = 0; for (let i = 0; i < p.v.length; i += 3) { x += p.v[i]; y += p.v[i + 1]; z += p.v[i + 2]; n++; } return [x / n, y / n, z / n]; };
await runTest(R, async () => {
  // ---------------------------------------------------------------- estático: receta ↔ contrato
  const byId = new Map(); for (const p of COLS) byId.set(p.id, [...(byId.get(p.id) ?? []), p]);
  const bad = [], miss = [];
  for (const r of C.collision.physical_roots) {
    const ps = byId.get(r.id); if (!ps) { miss.push(r.id); continue; }
    if (r.kind === 'lamp' || r.kind === 'bench') continue;   // farola = fuste (sin caja alta); banco = asiento/apoyos/respaldo (huecos): la caja no es la nativa por diseño
    const mn = [1e9, 1e9, 1e9], mx = [-1e9, -1e9, -1e9]; for (const p of ps) { const b = partBox(p); for (let k = 0; k < 3; k++) { mn[k] = Math.min(mn[k], b.mn[k]); mx[k] = Math.max(mx[k], b.mx[k]); } }
    // caja esperada: unión de las mallas FÍSICAS nativas de la raíz (sin juntas, remates, hojas ni flores); si no hay medida, native_bounds
    let nb = r.native_bounds; { const mm = r.native_meshes.filter((x) => !VISUAL.test(x)).map((x) => BOUNDS.get(x)).filter(Boolean);
      if (mm.length) nb = { min: [0, 1, 2].map((k) => Math.min(...mm.map((o) => o.min_three[k]))), max: [0, 1, 2].map((k) => Math.max(...mm.map((o) => o.max_three[k]))) }; }
    const d = Math.max(...[0, 1, 2].map((k) => Math.max(Math.abs(mn[k] - nb.min[k]), Math.abs(mx[k] - nb.max[k]))));
    // el pie cosmético ≤ 0,015 se suelda a Y 0 (regla del contrato): esa diferencia en Y mínima es esperada
    const dy0 = Math.abs(mn[1] - nb.min[1]); const ok = d <= 0.02 || (dy0 <= 0.016 && Math.max(...[0, 2].map((k) => Math.max(Math.abs(mn[k] - nb.min[k]), Math.abs(mx[k] - nb.max[k]))), Math.abs(mx[1] - nb.max[1])) <= 0.02);
    if (!ok) bad.push({ id: r.id, kind: r.kind, d: r3(d), mn: mn.map(r3), mx: mx.map(r3), nb });
  }
  R.check(miss.length === 0, `las 130 raíces físicas del contrato tienen colisión (faltan ${miss.length})`, 'static', miss);
  R.check(bad.length === 0, `cajas envolventes de las colisiones = mallas físicas nativas de la maqueta aprobada (± 2 cm; ${C.collision.physical_roots.length} raíces, farolas y bancos aparte)`, 'static', bad.slice(0, 8));
  const walls = C.collision.perimeter.wall_ids.filter((w) => !byId.has(w));
  R.check(walls.length === 0, `los 44 tramos de muro nativo tienen colisión (faltan ${walls.length})`, 'static', walls);
  { const q = COLS.filter((p) => p.k === 'quarter'); R.check(q.length === 2 && q.every((p) => p.t === 'tri' && p.i.length / 3 >= 48), 'quarters SE-M01/M02 con su malla nativa de triángulos (no caja ni rampa plana)', 'static', q.map((p) => ({ id: p.id, tris: p.i.length / 3 }))); }
  { const st = COLS.filter((p) => p.k === 'stairs'); R.check(st.length === 3, 'escalera NO-ST-M02: tres peldaños en la receta (V10.1 P19/D14 a: en el juego colisiona como UNA rampa por el centro de las huellas, ver abajo)', 'static', st.map((p) => partBox(p))); }
  // ---------------------------------------------------------------- en el juego
  const b = await launch();
  try {
    const page = await openGame(b, R); await clickStart(page); await sleep(600);
    const G = await page.evaluate(() => { const g = window.__bk, P = g.park, out = [];
      g.world.forEachCollider((c) => { const n = P.colliderName(c.handle), t = c.translation(), sh = c.shape; let p = [t.x, t.y, t.z];
        if (sh.vertices && Math.hypot(t.x, t.z) < 1e-6) { let x = 0, y = 0, z = 0, k = 0; const V = sh.vertices; for (let i = 0; i < V.length; i += 3) { x += V[i]; y += V[i + 1]; z += V[i + 2]; k++; } p = [x / k, y / k, z / k]; }
        out.push({ n, p }); }); return { cols: out, stats: P.bolaStats, load: P.bolaLoad }; });
    const pool = new Map(); for (const c of G.cols) if (c.n.startsWith('bola_')) pool.set(c.n, [...(pool.get(c.n) ?? []), c]);
    // V10.1 P19 (D14 a, cambio de diseño aprobado; copia previa en V10/backups/pruebas/V10_1-R1): los 3 peldaños de NO-ST-M02 son UNA rampa
    const STAIRS = COLS.filter((p) => p.k === 'stairs'), ramp = (pool.get('bola_stairs') ?? []);
    R.check(ramp.length === 1, `NO-ST-M02: una sola colisión de rampa en lugar de los ${STAIRS.length} peldaños (${ramp.length})`, 'static', ramp);
    const lost = []; for (const p of COLS) { if (p.k === 'stairs') continue; const cand = pool.get(`bola_${p.k}`) ?? [], c = centroid(p), i = cand.findIndex((q) => Math.hypot(q.p[0] - c[0], q.p[1] - c[1], q.p[2] - c[2]) < 0.012); if (i < 0) lost.push({ id: p.id, m: p.m }); else cand.splice(i, 1); }
    R.check(lost.length === 0, `cada pieza de colisión de la receta existe en el juego en su sitio (${COLS.length}; faltan ${lost.length})`, 'static', lost.slice(0, 10));
    const old = G.cols.filter((c) => /^(quarter_bola|cajon|bank|trick_kicker|grind_rail|bound)$/.test(c.n));
    R.check(old.length === 0, `sin colisiones del perímetro antiguo (quarter_bola, cajones, bank, lanzadera, rail, cierre invisible): ${old.length}`, 'static', old.slice(0, 6));
    // cimas de los módulos de skate por rayo (punto más alto de la caja nativa)
    const mods = C.collision.physical_roots.filter((r) => /^(platform|ledge|manual|bank|hip|quarter|curved_ledge)$/.test(r.kind));
    const tops = await page.evaluate((mods) => { const g = window.__bk, RA = window.__bkRapier, ray = new RA.Ray({ x: 0, y: 8, z: 0 }, { x: 0, y: -1, z: 0 }), out = [];
      for (const m of mods) { // muestreo de la huella: el punto más alto encontrado
        let best = -1; const [x0, , z0] = m.native_bounds.min, [x1, , z1] = m.native_bounds.max;
        // R2: solo los colliders de ESTE módulo (id del contrato): la caja nativa de un módulo solapa con vecinos (letras a 4,70, jardineras)
        const own = (cc) => g.park.bolaPartOf?.get(cc.handle) === m.id;
        for (let i = 0; i <= 48; i++) for (let j = 0; j <= 48; j++) { ray.origin = { x: x0 + (x1 - x0) * i / 48, y: 8, z: z0 + (z1 - z0) * j / 48 };   // R2b: rejilla 49×49 (la cresta de la onda TO-M01 caía entre muestras)
          const h = g.world.castRay(ray, 9, true, RA.QueryFilterFlags.EXCLUDE_SENSORS, undefined, undefined, undefined, own); if (h) best = Math.max(best, 8 - h.timeOfImpact); }
        out.push({ id: m.id, top: +best.toFixed(3), native: m.native_bounds.max[1] }); } return out; }, mods);
    const tb = tops.filter((t) => Math.abs(t.top - t.native) > 0.02);
    R.check(tb.length === 0, `cimas de los ${mods.length} módulos de skate medidas con rayos = cima nativa (± 2 cm)`, 'static', tb);
    // secciones nativas: altura del collider a lo largo de cada corte
    // R2b: las secciones nativas son CONTORNOS cerrados (cara superior, inferior y cantos verticales). Se compara la ENVOLVENTE superior:
    // en cada tramo no vertical, sus extremos 2 cm hacia dentro y su punto medio; si ese tramo es el más alto del contorno en esa s, la
    // superficie del collider (rayo desde arriba) debe estar a esa altura ± 3 cm. Los cantos exactos (empates del rayo) no se muestrean.
    const secs = await page.evaluate((S) => { const g = window.__bk, RA = window.__bkRapier, ray = new RA.Ray({ x: 0, y: 8, z: 0 }, { x: 0, y: -1, z: 0 }), out = [];
      for (const s of S.sections ?? S) { const [ox, oz] = s.origin, [dx, dz] = s.direction, L = Math.hypot(dx, dz), ux = dx / L, uz = dz / L; let worst = 0, n = 0, at = null;
        const flat = s.native_segments.flatMap((seg) => seg.slice(1).map((q, k) => [seg[k], q])).filter(([a, b]) => Math.abs(b[0] - a[0]) > 1e-3);
        const yAt = ([a, b], sv) => a[1] + (b[1] - a[1]) * (sv - a[0]) / (b[0] - a[0]);
        const env = (sv) => Math.max(...flat.filter(([a, b]) => sv >= Math.min(a[0], b[0]) - 1e-6 && sv <= Math.max(a[0], b[0]) + 1e-6).map((t) => yAt(t, sv)));
        for (const t of flat) { const s0 = Math.min(t[0][0], t[1][0]), s1 = Math.max(t[0][0], t[1][0]); if (s1 - s0 < 0.05) continue;
          for (const sv of [s0 + 0.02, (s0 + s1) / 2, s1 - 0.02]) { const yv = yAt(t, sv); if (Math.abs(yv - env(sv)) > 1e-3) continue;
            ray.origin = { x: ox + ux * sv, y: 8, z: oz + uz * sv }; const h = g.world.castRay(ray, 9, true, RA.QueryFilterFlags.EXCLUDE_SENSORS); if (!h) continue;
            if (g.park.bolaPartOf?.get(h.collider.handle) === 'NO-ST-M02') continue;   // V10.1 P19: la escalera es una rampa (escaleras-v10-1)
            const top = 8 - h.timeOfImpact; if (Math.abs(top - yv) > worst) { worst = Math.abs(top - yv); at = { s: +sv.toFixed(3), y: +yv.toFixed(3), hit: +top.toFixed(3), col: g.park.colliderName(h.collider.handle), id: g.park.bolaPartOf?.get(h.collider.handle) ?? null }; } n++; } }
        out.push({ id: s.id, zone: s.zone, n, worst: +worst.toFixed(3), at }); } return out; }, SEC.map((x) => ({ ...x, origin: typeof x.origin === 'string' ? JSON.parse(x.origin) : x.origin, direction: typeof x.direction === 'string' ? JSON.parse(x.direction) : x.direction, native_segments: typeof x.native_segments === 'string' ? JSON.parse(x.native_segments) : x.native_segments })));
    R.measure('secciones', secs);
    R.check(secs.length >= 6 && secs.every((s) => s.n > 0 && s.worst <= 0.03), 'secciones nativas A-A…F-F: el perfil del collider sigue la sección (± 3 cm)', 'static', secs);
    // suelo Y 0 en el exterior lejos de piezas (rejilla 2 m en la banda r 42,6–51,5)
    const gr = await page.evaluate(() => { const g = window.__bk, RA = window.__bkRapier, ray = new RA.Ray({ x: 0, y: 8, z: 0 }, { x: 0, y: -1, z: 0 }); let n = 0, zero = 0; const off = [];
      for (let x = -51; x <= 51; x += 2) for (let z = -51; z <= 51; z += 2) { const r = Math.hypot(x, z); if (r < 42.6) continue; ray.origin = { x, y: 8, z }; const h = g.world.castRay(ray, 12, true, RA.QueryFilterFlags.EXCLUDE_SENSORS); if (!h) { off.push([x, z, null]); continue; }
        n++; const y = 8 - h.timeOfImpact; if (Math.abs(y) < 0.001) zero++; else if (y < 0 || y > 6) off.push([x, z, +y.toFixed(3)]); }
      return { n, zero, off: off.slice(0, 12), offN: off.length }; });
    R.measure('suelo_exterior', gr);
    R.check(gr.offN === 0 && gr.zero > gr.n * 0.6, `suelo del exterior: siempre hay apoyo, en Y 0 donde no hay pieza (${gr.zero}/${gr.n} puntos a Y 0; sin hueco ni hundimiento)`, 'static', gr);
    R.check(G.stats?.colliders === COLS.length - STAIRS.length + 1 && Object.values(G.load ?? {}).every((x) => x.ok !== false), `exterior cargado: ${G.stats?.colliders} colisiones y todas las capas/familias`, 'static', G.load);
  } finally { await b.close(); }
}, { timeoutMs: 400000 });
