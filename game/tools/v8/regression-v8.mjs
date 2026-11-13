// IT8 paso 2 (cambio de diseño aprobado; copia previa en V10/backups/pruebas/IT8-paso2/): `--v103` excluye, por NOMBRE y una región,
// SOLO lo que V10.3 cambió a propósito (V10/IT6/ANALISIS_V10_3_4.md): túnel de FG retirado y su patata movida (W05: fg_deck*, fg_tunnel_*,
// fg_mouth_*, anclas fg.tunnel.*, patata fashion_girl.hidden y el suelo donde estaba el túnel), vegetación nueva en islas y plantas de NMG
// replantadas (§1.8: palm_trunk, tree_trunk, nmg_plant_*, nmg_palm_*, nmg_tree_*), farolillos de FG quitados (U-03: fg_lamp) y carteles a +33°
// (D3-07: signpost). Todo lo demás sigue igual.
// V10 (cambio de diseño aprobado, copia previa en V10/backups/pruebas/regression-v8.mjs): regresión del mundo FUERA de lo que V10 cambia
// a propósito. Base = V9 congelada (--base, por defecto v9 en 5240) frente a V10 (--url). La exigencia es la de V8 («todo lo ajeno a la
// obra es idéntico»), con el giro de corona +9° (Bola de Oro §07) APLICADO a la base: lo de la corona (r 21,9–46,5, incluida la vegetación
// de los kits fuera de r 42) debe estar en R(base) y lo demás, idéntico. Zonas sustituidas por diseño en V10 (se excluyen y las cubren sus
// pruebas nuevas en tools/v10): `--exclude exterior,nvda,centro` según avanzan las rondas.
//  · colliders (nombre, tipo, forma, posición girada, rotación compuesta con el giro), piezas visuales del Builder (trozo, material,
//    centro girado y medidas invariantes), anclas, patatas, cassettes, checkpoints, props, contratos por índice.
//  · losas de suelo: la rejilla fija de 12 m no gira; se comparan las losas que no tocan ningún hueco (U NMG, pozo FG, vaso YY) en
//    ninguna de las dos versiones; la cobertura de los huecos la mide `tools/v10/corona-v10.mjs` con rayos.
import { Report, runTest, launch, openGame, clickStart, sleep, URLS, arg } from './lib.mjs';
const R = new Report('regression-v8');
const BASE = URLS[arg('base', 'v9')] ?? arg('base');
const EXC = new Set((arg('exclude', '') || '').split(',').filter(Boolean));
const V103 = process.argv.includes('--v103');
const V103_N = /^(palm_trunk|tree_trunk|signpost|fg_deck(_mass)?|fg_tunnel_.*|fg_mouth_.*|(proxy_)?nmg_plant_.*|fg_lamp|proxy_fgprops_fg_lamp|[a-z]+_lettering_frame|(proxy_)?nmg_palm_.*|(proxy_)?nmg_tree_.*)$/;
const v103 = (n) => V103 && String(n ?? '').split('@')[0].split('|').some((x) => V103_N.test(x));   // grupo|material|nombre: vale cualquiera
const ROT = 9 * Math.PI / 180, cR = Math.cos(ROT), sR = Math.sin(ROT);
const r3 = (v) => Math.round(v * 1000) / 1000;
const rotXZ = (x, z) => [cR * x - sR * z, sR * x + cR * z];
const inCorona = (x, z) => { const r = Math.hypot(x, z); return r > 21.9 && r < 46.5; };
// R1b (preparación): el manifiesto gira en la banda de los sectores (r 22,6–42, como corona-v10): lo de r > 42 (p. ej. `trick.approach`
// del perímetro antiguo, r 43,5) y el checkpoint del centro (r 22,3) no son de ningún sector y no giran
const inSectors = (x, z) => { const r = Math.hypot(x, z); return r > 22.6 && r < 42; };
const th = (x, z) => ((Math.atan2(x, -z) * 180 / Math.PI) + 360) % 360;
/** Zonas sustituidas por diseño en V10 (en coordenadas de cada versión: la base sin girar, V10 girada). */
const excluded = (x, z, rotated) => {
  const r = Math.hypot(x, z), t = th(x, z) - (rotated ? 9 : 0);
  if (EXC.has('exterior') && r > 41.9) return true;
  if (EXC.has('nvda') && r > 21.9 && r < 42.1 && (((t + 360) % 360) > 287.9 || ((t + 360) % 360) < 0.1)) return true;
  if (EXC.has('centro') && r < 22.6) return true;
  if (V103 && r > 29.4 && r < 34.6 && ((t + 360) % 360) > 118 && ((t + 360) % 360) < 130) return true;   // suelo donde estaba el túnel de FG (W05)
  return false;
};
const dump = (page) => page.evaluate(() => {
  const g = window.__bk, P = g.park, r3 = (v) => Math.round(v * 1000) / 1000;
  const cols = []; g.world.forEachCollider((c) => { if (g.npcColliders.has(c.handle) || c === g.skater?.collider) return; const t = c.translation(), q = c.rotation(), sh = c.shape;
    const he = sh.halfExtents ? [r3(sh.halfExtents.x), r3(sh.halfExtents.y), r3(sh.halfExtents.z)] : sh.radius !== undefined ? [r3(sh.radius), r3(sh.halfHeight ?? 0)] : [];
    let p = [t.x, t.y, t.z];
    if (sh.vertices && Math.hypot(t.x, t.z) < 1e-6) { let n = 0, a = [0, 0, 0]; const V = sh.vertices; for (let i = 0; i < V.length; i += 3) { a[0] += V[i]; a[1] += V[i + 1]; a[2] += V[i + 2]; n++; } p = a.map((v) => v / n); }
    cols.push({ n: P.colliderName(c.handle), type: sh.type, he, p: p.map(r3), q: [q.x, q.y, q.z, q.w], nv: sh.vertices ? sh.vertices.length / 3 : 0 }); });
  // R1b: suelo VISUAL de la corona por rayos contra las mallas `STATIC_ground|*` (rejilla polar r 22,5–41,5 cada 1 m, θ cada 2°; en V10 el
  // punto se gira +9°): material del primer impacto y cota. Sustituye a comparar por caja las piezas de suelo que tocan la corona (un
  // arco girado no conserva el centro de su caja)
  const T = window.__bkTHREE, rc = new T.Raycaster(), gm = []; P.root.traverse((o) => { if (o.isMesh && /^STATIC_ground\|/.test(o.name)) gm.push(o); });
  const rotd = window.__rgRot ?? 0, gray = [];
  for (let r = 22.5; r <= 41.51; r += 1) for (let t = 1; t < 360; t += 2) {   // θ impares: los bordes de sector caen en grados pares (empates)
    const a = (t + rotd) * Math.PI / 180, x = r * Math.sin(a), z = -r * Math.cos(a);
    rc.set(new T.Vector3(x, 10, z), new T.Vector3(0, -1, 0)); const h = rc.intersectObjects(gm, false)[0];
    gray.push([r, t, h ? h.object.name.slice(7) : null, h ? r3(h.point.y) : null]); }
  const pieces = P.b.pieces.map((p) => ({ chunk: p.chunk, mat: p.mat, name: p.name, c: [(p.min[0] + p.max[0]) / 2, (p.min[1] + p.max[1]) / 2, (p.min[2] + p.max[2]) / 2], hy: r3(p.max[1] - p.min[1]), mn: p.min, mx: p.max }));
  const anchors = [...P.manifest.anchors.entries()].map(([k, a]) => ({ k, p: a.pos.toArray(), h: a.heading }));
  const fries = P.manifest.fries.map((f) => ({ k: f.id, p: f.pos.toArray(), hover: f.hover }));
  const cass = P.manifest.cassettes.map((c) => ({ k: c.zone, p: c.pos.toArray(), h: c.heading }));
  const cps = P.manifest.checkpoints.map((c) => ({ k: c.id, p: c.pos.toArray(), h: c.heading }));
  return { cols, pieces, anchors, fries, cass, cps, props: P.propSlots.map((s) => ({ k: s.kind, p: [s.x, s.y, s.z], h: s.yaw, hs: s.h })),
    gray, acts: g.activities.map((a) => a.id), fgLadder: g.manifest.ladders.find((l) => l.id === 'fg') ?? null, zones: ['act.ladderFoot', 'act.ladderTop', 'act.bridgeTalk', 'act.danceCombo', 'act.pantherTalk'].map((z) => P.zones.has(z)) };
});
/** Lleva un elemento de la base a donde debe estar en V10: girado si está en la corona (posición y rumbo), igual si no. */
// R1b: el rumbo gira también cuando la base vale 0 (las anclas de TT miraban a 0 y ahora a −9°); un 0 que el juego deja en 0 es un
// rumbo «sin uso» y se acepta igual (solo para base 0)
const expect = (o, band = inCorona) => { const [x, y, z] = o.p; if (!band(x, z)) return { ...o, rot: false };
  const [X, Z] = rotXZ(x, z); return { ...o, p: [X, y, Z], h: o.h === undefined ? undefined : o.h - ROT, h0: o.h === 0, rot: true }; };
const near = (a, b, tol = 0.02) => Math.hypot(a[0] - b[0], a[2] - b[2]) <= tol && Math.abs(a[1] - b[1]) <= tol;
const angOk = (a, b, h0 = false) => a === undefined || b === undefined || Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b))) < 0.003 || (a === 0 && b === 0) || (h0 && b === 0);
/** Empareja listas con clave `k` (anclas, patatas…): cada elemento de la base, en su sitio esperado en V10. */
function matchKeyed(label, A, B) {
  const mb = new Map(B.map((o) => [o.k, o])), bad = [], miss = [];
  for (const a of A) { const [x, , z] = a.p; if (excluded(x, z, false) || (V103 && (/^fg\.tunnel\./.test(a.k) || a.k === 'fashion_girl.hidden'))) continue; const e = expect(a, inSectors), b = mb.get(a.k);
    if (!b) { miss.push(a.k); continue; } if (!near(e.p, b.p) || !angOk(e.h, b.h, e.h0)) bad.push({ k: a.k, esperado: e.p.map(r3), v10: b.p.map(r3), h: [e.h, b.h] }); }
  R.check(miss.length === 0 && bad.length === 0, `${label}: idénticos fuera de la corona y girados +9° dentro (${A.length}; faltan ${miss.length}, desplazados ${bad.length})`, 'static', { miss: miss.slice(0, 8), bad: bad.slice(0, 6) });
}
await runTest(R, async () => {
  const b = await launch();
  try {
    R.fixture('comparación V9 (base) ↔ V10 con el giro de corona aplicado a la base; zonas excluidas por diseño', [...EXC, ...(V103 ? ['v103 (nombres y túnel FG)'] : [])]);
    const npcs = (pg) => pg.waitForFunction(() => window.__bk.npcs?.has?.('aissa') && window.__bk.npcs.has('juseph'), { timeout: 15000 }).catch(() => {});
    const pa = await openGame(b, R, { url: BASE }); await clickStart(pa); await sleep(800); await npcs(pa); const A = await dump(pa); await pa.close();
    const pb = await openGame(b, R); await clickStart(pb); await sleep(800); await npcs(pb); await pb.evaluate(() => { window.__rgRot = 9; }); const B = await dump(pb);
    // ---- colliders (salvo suelo, que se compara aparte, y el vaso YY regenerado, que comprueba corona-v10 con rayos)
    const skipCol = (c, rotated) => v103(c.n) || c.n === 'ground' || /^yy_(deck|shell|stairs)/.test(c.n) || excluded(c.p[0], c.p[2], rotated);
    const pool = new Map(); for (const c of B.cols) { if (skipCol(c, true)) continue; const k = `${c.n}|${c.type}|${c.he.join(',')}|${c.nv}`; pool.set(k, [...(pool.get(k) ?? []), c]); }
    const lost = [];
    for (const a of A.cols) { if (skipCol(a, false)) continue; const e = expect(a), k = `${a.n}|${a.type}|${a.he.join(',')}|${a.nv}`, cand = pool.get(k) ?? [];
      const i = cand.findIndex((c) => near(e.p, c.p)); if (i < 0) lost.push({ n: a.n, type: a.type, p: a.p.map(r3) }); else cand.splice(i, 1); }
    const extra = [...pool.values()].flat();
    R.measure('colliders', { base: A.cols.length, v10: B.cols.length, sinPareja: lost.length, sobrantes: extra.length });
    R.check(lost.length === 0 && extra.length === 0, 'colliders idénticos fuera de la corona y en su sitio girado dentro (nombre, tipo, forma; salvo suelo y vaso YY regenerado)', 'static', { lost: lost.slice(0, 10), extra: extra.slice(0, 10).map((c) => ({ n: c.n, p: c.p })) });
    // ---- losas de suelo (rejilla fija): las que no tocan huecos en ninguna versión, idénticas
    const gKey = (c) => `${c.p.join(',')}|${c.he.join(',')}`, isTile = (c) => c.n === 'ground' && c.he[0] === 6 && c.he[2] === 6;
    const tA = new Set(A.cols.filter(isTile).map(gKey)), tB = new Set(B.cols.filter(isTile).map(gKey));
    const both = [...tA].filter((k) => tB.has(k)), onlyA = [...tA].filter((k) => !tB.has(k)), onlyB = [...tB].filter((k) => !tA.has(k));
    const nearHole = (k) => { const [x, , z] = k.split('|')[0].split(',').map(Number); return inCorona(x, z) || Math.hypot(x, z) > 20; };
    R.check(onlyA.every(nearHole) && onlyB.every(nearHole) && both.length > 60, `losas de la rejilla común idénticas salvo las que tocan huecos de la corona (comunes ${both.length}; cambian ${onlyA.length}/${onlyB.length}, todas junto a la corona)`, 'static', { onlyA, onlyB });
    // ---- piezas visuales del Builder: trozo, material, nombre, centro (girado en la corona) y alto
    // suelo de la corona por rayos visuales (ver dump)
    { const bad = []; let n = 0; A.gray.forEach((ra, i) => { const rb = B.gray[i]; const t = ra[1], r = ra[0], x = r * Math.sin(t * Math.PI / 180), z = -r * Math.cos(t * Math.PI / 180);
        if (excluded(x, z, false)) return; n++; if (ra[2] !== rb[2] || (ra[3] !== null && Math.abs(ra[3] - rb[3]) > 0.001)) bad.push({ r, t, base: ra.slice(2), v10: rb.slice(2) }); });
      R.check(bad.length === 0 && n > 2000, `suelo visual de la corona: mismo material y cota en el punto girado (${n} rayos; distintos ${bad.length})`, 'static', bad.slice(0, 8)); }
    // piezas de SUELO cuya caja toca la banda de la corona (r 21,9–42): las cubren los rayos de arriba; el resto, por caja como siempre
    const groundBand = (p) => { if (p.chunk !== 'ground') return false; const dx = Math.max(p.mn[0], 0, -p.mx[0]), dz = Math.max(p.mn[2], 0, -p.mx[2]);
      const far = Math.hypot(Math.max(Math.abs(p.mn[0]), Math.abs(p.mx[0])), Math.max(Math.abs(p.mn[2]), Math.abs(p.mx[2]))); return Math.hypot(dx, dz) < 42 && far > 21.9; };
    // el alto se compara con ±2 mm (la caja de una pieza girada se recalcula y redondea a 1 mm: 6,545 → 6,544 en los raíles de TT)
    const pk = (p) => `${p.chunk}|${p.mat}|${p.name}`;
    const pp = new Map(); for (const p of B.pieces) { if (excluded(p.c[0], p.c[2], true) || groundBand(p) || v103(pk(p))) continue; pp.set(pk(p), [...(pp.get(pk(p)) ?? []), p]); }
    const plost = [];
    for (const a of A.pieces) { if (excluded(a.c[0], a.c[2], false) || groundBand(a) || v103(pk(a))) continue; const e = expect({ p: a.c }), cand = pp.get(pk(a)) ?? [];
      // el centro de una caja AABB girada se desplaza menos de media diagonal: tolerancia relativa al tamaño (la forma la comprueban los colliders)
      // R1b: cota del desplazamiento del centro de la caja al girar 9° una forma dentro de ella ≈ (1 − cos 9° + sin 9°) · semidiagonal ≈ 0,17·sd
      const sd = Math.hypot(a.mx[0] - a.mn[0], a.mx[2] - a.mn[2]) / 2, tol = e.rot ? Math.max(0.6, 0.17 * sd) : 0.02;
      // la pareja más cercana dentro de la tolerancia (no la primera: con tolerancias grandes el emparejamiento voraz se cruza)
      let i = -1, best = Infinity; cand.forEach((c, j) => { const d = Math.hypot(e.p[0] - c.c[0], e.p[2] - c.c[2]); if (near(e.p, c.c, tol) && Math.abs(c.hy - a.hy) <= 0.002 && d < best) { best = d; i = j; } }); if (i < 0) plost.push({ k: pk(a), base: a.c.map(r3), esperado: e.p.map(r3), sd: r3(sd), cand: cand.slice(0, 3).map((c) => c.c.map(r3)) }); else cand.splice(i, 1); }
    R.check(plost.length === 0, `piezas visuales idénticas fuera de la corona y en su sitio girado dentro (${A.pieces.length}; sin pareja ${plost.length})`, 'static', plost.slice(0, 8));
    matchKeyed('anclas', A.anchors, B.anchors);
    matchKeyed('patatas', A.fries, B.fries);
    matchKeyed('cassettes', A.cass, B.cass);
    matchKeyed('checkpoints', A.cps, B.cps);
    R.check(B.fries.length === 20 && B.cass.length === 6, '20 patatas y 6 cassettes', 'static', { fries: B.fries.length, cass: B.cass.length });
    // ---- props (vegetación/mobiliario de los kits): mismo tipo y alto, en su sitio girado
    { const prp = (s) => `${s.k}|${r3(s.hs)}`, pool2 = new Map(); for (const s of B.props) { if (excluded(s.p[0], s.p[2], true) || v103(s.k)) continue; pool2.set(prp(s), [...(pool2.get(prp(s)) ?? []), s]); }
      const lostP = []; for (const a of A.props) { if (excluded(a.p[0], a.p[2], false) || v103(a.k)) continue; const e = expect(a), cand = pool2.get(prp(a)) ?? []; const i = cand.findIndex((c) => near(e.p, c.p)); if (i < 0) lostP.push(`${a.k}@${a.p.map(r3)}`); else cand.splice(i, 1); }
      R.check(lostP.length === 0, `props idénticos fuera de la corona y girados dentro (${A.props.length}; sin pareja ${lostP.length})`, 'static', lostP.slice(0, 8)); }
    // ---- contratos que consumen las pruebas heredadas por índice/nombre
    // V10 (cambio de diseño aprobado): con el centro sustituido, el reto de SECRETNOVIO ocupa el MISMO índice 5 que el triple (id `secretJump`);
    // NVDA conserva la clave interna `skateTutorial` (D-NV-01). El orden y los demás ids, idénticos
    const accts = EXC.has('centro') ? A.acts.map((a) => (a === 'finalTriple' ? 'secretJump' : a)) : A.acts;
    R.check(JSON.stringify(B.acts) === JSON.stringify(accts), `actividades en el mismo orden e ids que la base (pruebas por índice${EXC.has('centro') ? '; finalTriple → secretJump en el índice 5' : ''})`, 'static', B.acts);
    R.check(!!B.fgLadder && B.fgLadder.bottom === 0 && B.fgLadder.footZone === 'act.ladderFoot' && B.zones.every(Boolean), 'la escalera de FG es la instancia `fg` (base 0) con sus zonas de siempre', 'static', { bottom: B.fgLadder?.bottom });
  } finally { await b.close(); }
}, { timeoutMs: 400000 });
