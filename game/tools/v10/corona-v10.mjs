// IT8 paso 2 (cambio de diseño aprobado; copia previa en V10/backups/pruebas/IT8-paso2/): `--v103` excluye por NOMBRE solo lo que V10.3
// cambió a propósito (V10/IT6/ANALISIS_V10_3_4.md): túnel de FG y su patata (W05: anclas fg.tunnel.*, cajas fg.tunnel/fg.mouth/fg.tunnel.inner,
// patata fashion_girl.hidden, colliders fg_deck*, fg_tunnel_*, fg_mouth_*), vegetación en islas y plantas de NMG (§1.8: palm_trunk, tree_trunk,
// nmg_plant_*) y carteles (D3-07: signpost).
// V10 R1 · Invariancia del giro de corona +9° (Bola de Oro §07): lo que estaba en la corona (r 22–42) debe estar en R(antes) y lo
// del centro y el cuadrado, idéntico. Se vuelca el mundo de la BASE (--base, por defecto v9) y de la versión a probar (--url) y se compara:
//  · rayos verticales en una rejilla de 0,5 m: altura del primer collider bajo cada punto (corona: base(p) = nueva(R·p); fuera: base(p) = nueva(p));
//  · anclas, patatas, cassettes, checkpoints y escaleras del manifiesto, zonas y cajas orientadas (posición girada y rumbo − 9°);
//  · colliders por nombre: cada collider de la corona de la base tiene uno del mismo nombre y tipo en R(t) (± 2 mm);
//  · comprobación mínima del dossier: un punto norte girado da X positivo.
// Rojo esperado contra sí misma (--base v9 --url v9): nada está girado. Excepciones declaradas: losas `ground` (rejilla fija de 12 m) y deck YY.
// Uso: node tools/v10/corona-v10.mjs --base v9 --url v10 --task V10-R1 --label final
import { Report, runTest, launch, openGame, URLS, arg, r3 } from '../v8/lib.mjs';

const R = new Report('corona-v10');
const BASE = URLS[arg('base', 'v9')] ?? arg('base');
const ROT = +arg('rot', '9') * Math.PI / 180;   // giro esperado (grados → rad); 0 = «nada debía girar»
const c = Math.cos(ROT), s = Math.sin(ROT);
const rot = (x, z) => [c * x - s * z, s * x + c * z];
// corona: r 22,6–45,5 (margen 0,6 m al centro; hasta 45,5 entra la vegetación de los kits NMG/YY que está fuera de r 42 y gira con su sector;
// el perímetro antiguo empieza en r ≥ 47,6)
const inCorona = (x, z) => { const r = Math.hypot(x, z); return r >= 22.6 && r <= 45.5; };
const STEP = +arg('step', '0.5');
// R2: zonas sustituidas por diseño (`--exclude exterior,nvda,centro`, como regression-v8), en coordenadas de la BASE: sus pruebas propias
// están en tools/v10 (ext-*, nv-*, sn-*); aquí se sigue exigiendo el giro exacto de todo lo demás
const EXCL = new Set((arg('exclude', '') || '').split(',').filter(Boolean));
const V103 = process.argv.includes('--v103');
const V103_K = /^(fg\.tunnel(\..*)?|fg\.mouth|fashion_girl\.hidden)$/, V103_N = /^(palm_trunk|tree_trunk|signpost|fg_deck(_mass)?|fg_tunnel_.*|fg_mouth_.*|(proxy_)?nmg_plant_.*|fg_lamp|(proxy_)?nmg_palm_.*|(proxy_)?nmg_tree_.*)$/;
const excl = (x, z) => { const r = Math.hypot(x, z), t = ((Math.atan2(x, -z) * 180 / Math.PI) + 360) % 360;
  if (EXCL.has('exterior') && r > 41.9) return true;
  if (EXCL.has('nvda') && r > 21.9 && r < 42.1 && (t > 287.9 || t < 0.1)) return true;
  if (EXCL.has('centro') && r < 22.6) return true; return false; };

async function dump(browser, url) {
  const page = await openGame(browser, R, { url });
  const out = await page.evaluate((STEP) => {
    const g = window.__bk, P = g.park, W = g.world, RA = window.__bkRapier;
    const m = P.manifest, v = (p) => [+p.x.toFixed(4), +p.y.toFixed(4), +p.z.toFixed(4)];
    const anchors = {}; for (const [k, a] of m.anchors) anchors[k] = { p: v(a.pos), h: +a.heading.toFixed(5) };
    const fries = Object.fromEntries(m.fries.map((f) => [f.id, { p: v(f.pos) }]));
    const cass = Object.fromEntries(m.cassettes.map((c) => [c.zone, { p: v(c.pos), h: +c.heading.toFixed(5) }]));
    const cps = Object.fromEntries(m.checkpoints.map((c) => [c.id, { p: v(c.pos), h: +c.heading.toFixed(5) }]));
    const ladders = Object.fromEntries(m.ladders.map((l) => [l.id, { p: v(l.axis), h: +l.heading.toFixed(5), top: v(l.topPos) }]));
    const zones = {}; for (const [k, z] of P.zones) zones[k] = { p: v(z.pos), r: z.r };
    const boxes = {}; for (const [k, b] of P.boxes) boxes[k] = { p: v(b.c), h: +b.yaw.toFixed(5) };
    const cols = [];
    W.colliders.forEach((col) => {
      if (!col.isEnabled() || col === g.skater?.collider || g.npcColliders?.has(col.handle)) return;   // R2: ANMI (en la salida) y NPC no son mundo
      const t = col.translation(), sh = col.shape, name = P.colliderName(col.handle) || '';
      let cx = t.x, cy = t.y, cz = t.z;
      if (sh.vertices && sh.vertices.length && Math.hypot(t.x, t.z) < 1e-6) { let n = 0; cx = cy = cz = 0; const V = sh.vertices; for (let i = 0; i < V.length; i += 3) { cx += V[i]; cy += V[i + 1]; cz += V[i + 2]; n++; } cx /= n; cy /= n; cz /= n; }
      cols.push({ name, type: sh.type, c: [+cx.toFixed(4), +cy.toFixed(4), +cz.toFixed(4)] });
    });
    // rejilla de rayos verticales (desde 12 m, colisión más alta bajo el punto); excluye sensores, NPC y cuerpos cinemáticos (coches)
    const rays = []; const ray = new RA.Ray({ x: 0, y: 12, z: 0 }, { x: 0, y: -1, z: 0 });
    const skip = (cc) => g.npcColliders.has(cc.handle) || cc === g.skater?.collider;
    for (let x = -51.75; x <= 51.75; x += STEP) for (let z = -51.75; z <= 51.75; z += STEP) {
      ray.origin = { x, y: 12, z };
      const h = W.castRay(ray, 20, true, RA.QueryFilterFlags.EXCLUDE_SENSORS | RA.QueryFilterFlags.EXCLUDE_KINEMATIC, undefined, undefined, undefined, (cc) => !skip(cc));
      rays.push(h ? +(12 - h.timeOfImpact).toFixed(3) : null);
    }
    return { anchors, fries, cass, cps, ladders, zones, boxes, cols, rays, axes: window.__bkWORLD ? null : null };
  }, STEP);
  await page.close();
  return out;
}

await runTest(R, async () => {
  const b = await launch();
  try {
    R.fixture('volcado del mundo (sin jugar): base y versión a probar, una pestaña cada vez', { base: BASE, url: R.data.url, excluidas: [...EXCL] });
    const A = await dump(b, BASE), B = await dump(b, R.data.url);
    // --- comprobación mínima del dossier
    const [nx] = rot(0, -30); R.check(nx > 0, 'un punto norte (0,0,−30) girado da X positivo', 'unit', { x: r3(nx) });
    // --- rejilla de rayos
    const N = Math.round((51.75 * 2) / STEP) + 1, at = (arr, i, j) => arr[i * N + j];
    const idx = (x, z) => [Math.round((x + 51.75) / STEP), Math.round((z + 51.75) / STEP)];
    let nC = 0, badC = 0, nO = 0, badO = 0; const exC = [], exO = [];
    const near = (arr, x, z) => {   // altura de la nueva en un punto arbitrario: el vecino de rejilla más parecido entre los 4 que lo rodean
      const fi = (x + 51.75) / STEP, fj = (z + 51.75) / STEP, i0 = Math.floor(fi), j0 = Math.floor(fj), out = [];
      for (const [di, dj] of [[0, 0], [1, 0], [0, 1], [1, 1]]) { const i = i0 + di, j = j0 + dj; if (i >= 0 && j >= 0 && i < N && j < N) out.push(at(arr, i, j)); }
      return out;
    };
    for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) {
      const x = -51.75 + i * STEP, z = -51.75 + j * STEP, ha = at(A.rays, i, j);
      if (excl(x, z)) continue;
      if (inCorona(x, z)) {
        // la base en p debe verse en la nueva en R·p: se compara contra los 4 vecinos (sin interpolar bordes de piezas)
        const [qx, qz] = rot(x, z); const cand = near(B.rays, qx, qz); nC++;
        const ok = cand.some((hb) => (ha === null && hb === null) || (ha !== null && hb !== null && Math.abs(ha - hb) <= 0.03));
        // la altura de la base en un punto interior de pieza: exigir coincidencia salvo en bordes (algún vecino de la base distinto)
        const [ii, jj] = [i, j]; const nb = [[1, 0], [-1, 0], [0, 1], [0, -1]].map(([a, d]) => at(A.rays, ii + a, jj + d));
        const edge = nb.some((h) => h === undefined || (h === null) !== (ha === null) || (h !== null && ha !== null && Math.abs(h - ha) > 0.03));
        if (!ok && !edge) { badC++; if (exC.length < 12) exC.push({ p: [x, z], base: ha, nueva: cand }); }
      } else {
        const r = Math.hypot(x, z); if (r > 21.4 && r < 22.6) continue;   // franja de borde con el centro: sin exigencia
        nO++; const hb = at(B.rays, i, j);
        if (!((ha === null && hb === null) || (ha !== null && hb !== null && Math.abs(ha - hb) <= 0.03))) { badO++; if (exO.length < 12) exO.push({ p: [x, z], base: ha, nueva: hb }); }
      }
    }
    R.measure('rayos', { corona: nC, coronaDistintos: badC, fuera: nO, fueraDistintos: badO });
    R.check(badC === 0, `corona: la altura del suelo/piezas en cada punto de la base coincide con la nueva en el punto girado (${nC} rayos; distintos fuera de bordes: ${badC})`, 'static', exC);
    R.check(badO <= +arg('outTol', '0'), `centro y exterior: altura idéntica en el mismo punto (${nO} rayos; distintos: ${badO})`, 'static', exO);
    // --- datos del manifiesto
    const cmp = (label, a, b2) => {
      const miss = [], bad = [];
      for (const [k, va] of Object.entries(a)) {
        if (excl(va.p[0], va.p[2]) || (V103 && V103_K.test(k))) continue;
        const vb = b2[k]; if (!vb) { miss.push(k); continue; }
        const [x, y, z] = va.p, rr = Math.hypot(x, z), cor = rr >= 22.6 && rr <= 42;   // datos del manifiesto: solo la corona (fuera, el perímetro)
        const [ex, ez] = cor ? rot(x, z) : [x, z];
        const dp = Math.hypot(vb.p[0] - ex, vb.p[2] - ez) + Math.abs(vb.p[1] - y);
        // anclas de cámara/punto sin rumbo (0 por defecto) no se comparan en rumbo
        let dh = 0; if (va.h !== undefined && !(va.h === 0 && vb.h === 0)) { const eh = cor ? va.h - ROT : va.h; dh = Math.abs(Math.atan2(Math.sin(vb.h - eh), Math.cos(vb.h - eh))); }
        if (dp > 0.01 || dh > 0.002) bad.push({ k, base: va.p, nueva: vb.p, esperado: [r3(ex), y, r3(ez)], dh: r3(dh) });
      }
      R.check(miss.length === 0 && bad.length === 0, `${label}: ${Object.keys(a).length} elementos en su sitio (girados si están en la corona); faltan ${miss.length}, desplazados ${bad.length}`, 'static', { miss: miss.slice(0, 10), bad: bad.slice(0, 8) });
    };
    for (const k of ['anchors', 'fries', 'cass', 'cps', 'ladders', 'zones', 'boxes']) cmp(k, A[k], B[k]);
    // --- colliders por nombre y tipo (corona)
    const pool = new Map(); for (const cb of B.cols) { const key = `${cb.name}|${cb.type}`; pool.set(key, [...(pool.get(key) ?? []), cb]); }
    let n = 0, lost = []; const EXC = /^(ground|yy_deck)$/;
    for (const ca of A.cols) {
      const [x, , z] = ca.c; if (!inCorona(x, z) || EXC.test(ca.name) || excl(x, z) || (V103 && V103_N.test(ca.name))) continue; n++;
      const [ex, ez] = rot(x, z), cand = pool.get(`${ca.name}|${ca.type}`) ?? [];
      if (!cand.some((cb) => Math.hypot(cb.c[0] - ex, cb.c[2] - ez) < 0.02 && Math.abs(cb.c[1] - ca.c[1]) < 0.02)) lost.push({ name: ca.name, type: ca.type, c: ca.c });
    }
    R.check(lost.length === 0, `colliders de la corona: ${n} con pareja del mismo nombre y tipo en el punto girado (± 2 cm); sin pareja: ${lost.length}`, 'static', lost.slice(0, 12));
  } finally { await b.close(); }
}, { timeoutMs: 600000 });
