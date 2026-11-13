// T5-01/T5-03/T5-11…13 · Coherencia malla visible ↔ collider del kit NMG (DT-01; SOL-001, OPUS-001, HUM-002/003).
// Por pieza del kit (hijos del grupo NMG_KIT) y sus colliders por nombre:
//  · rejilla vertical de 0,25 m sobre la huella (AABB malla ∪ collider + 0,3 m): rayo THREE (solo mallas de la pieza) frente
//    a rayo Rapier (solo colliders de la pieza). Denominadores: válidos (ambos), sólo-malla, sólo-collider; |Δ| p50/p99/máx;
//    franja de arista (discontinuidad a ±0,03 m) aparte.
//  · rayos horizontales a 0,1/0,3/0,6 m desde fuera hacia el centro por las 4 caras del marco de la pieza: |Δ| distancia.
// Tolerancia DT-01: caras planas |Δ| ≤ 0,01 m en ≥ 99 % de los rayos válidos fuera de aristas, ninguno > 0,03 m fuera de la
// franja; sólo-malla y sólo-collider = 0 (salvo piezas declaradas atravesables: «bed»); laterales ±0,01 m.
import { Report, runTest, launch, openGame, clickStart, sleep, r3, arg } from '../lib.mjs';

const R = new Report('geo-coherence');
const PIECES = { nmg_platform: ['nmg_platform', 'nmg_step', 'nmg_stair_ramp', 'nmg_bank'], nmg_heart: ['nmg_heart', 'nmg_heart_ledge'], nmg_box_small: ['nmg_box_small'], nmg_box_medium: ['nmg_block'],
  nmg_ledge_long: ['nmg_ledge_long'], nmg_u: ['nmg_alcove', 'nmg_pit_floor', 'nmg_pit_ramp'], nmg_quarter: ['nmg_quarter'], nmg_bench: ['bench'], nmg_bed: [] };
const WALKTHROUGH = new Set(['nmg_bed']);  // islas: obstáculo bajo sin collider (DT-06, declarado)

await runTest(R, async () => {
  const b = await launch();
  try {
    const page = await openGame(b, R); await clickStart(page); await sleep(500);
    const res = await page.evaluate((PIECES) => {
      const g = window.__bk, T = window.__bkTHREE, RA = window.__bkRapier, P = g.park;
      const kit = P.root.getObjectByName('NMG_KIT');
      if (!kit) return { err: 'sin NMG_KIT (el kit no cargó)', kitState: P.nmgKit };
      kit.updateMatrixWorld(true);
      // colliders por nombre
      const byName = {}; g.world.forEachCollider((c) => { if (c.isSensor()) return; const n = P.colliderName(c.handle); (byName[n] ||= []).push(c); });
      const ray = new T.Raycaster(); const down = new T.Vector3(0, -1, 0);
      const out = [];
      const counted = {};
      for (const child of kit.children) {
        const node = child.name || child.children[0]?.name || '';
        const key = Object.keys(PIECES).find((k) => node.startsWith(k)); if (!key) { out.push({ node, err: 'pieza desconocida' }); continue; }
        counted[key] = (counted[key] || 0) + 1;
        const meshes = []; child.traverse((m) => { if (m.isMesh && m.visible) meshes.push(m); });
        const box = new T.Box3().setFromObject(child);
        // colliders de esta pieza: los del nombre cuyo centro cae en la huella ampliada
        const big = box.clone().expandByScalar(0.3);
        // asociación collider↔pieza: cajas por su centro; trimesh (bank, quarter, rampa) por la caja de sus vértices (mundo)
        const cols = (PIECES[key] || []).flatMap((n) => byName[n] || []).filter((c) => {
          const v = c.shape.vertices;
          if (v && v.length) { const vb = new T.Box3(); for (let i = 0; i < v.length; i += 3) vb.expandByPoint(new T.Vector3(v[i], v[i + 1], v[i + 2])); return vb.intersectsBox(big); }
          const t = c.translation(); return big.containsPoint(new T.Vector3(t.x, Math.max(big.min.y, Math.min(big.max.y, t.y)), t.z)); });
        const colSet = new Set(cols.map((c) => c.handle));
        const colBox = new T.Box3(); for (const c of cols) { const a = c.shape.halfExtents; const t = c.translation(); if (a) colBox.expandByPoint(new T.Vector3(t.x - 2 * Math.max(a.x, a.z), t.y, t.z - 2 * Math.max(a.x, a.z))).expandByPoint(new T.Vector3(t.x + 2 * Math.max(a.x, a.z), t.y, t.z + 2 * Math.max(a.x, a.z))); else colBox.expandByPoint(new T.Vector3(t.x, t.y, t.z)); }
        const area = box.clone(); if (!colBox.isEmpty()) area.union(colBox); area.expandByScalar(0.3);
        const mTop = (x, z) => { ray.set(new T.Vector3(x, 8, z), down); ray.far = 9; const h = ray.intersectObjects(meshes, false)[0]; return h ? h.point.y : null; };
        const cTop = (x, z) => { const h = g.world.castRay(new RA.Ray({ x, y: 8, z }, { x: 0, y: -1, z: 0 }), 9, true, RA.QueryFilterFlags.EXCLUDE_SENSORS, undefined, undefined, undefined, (c) => colSet.has(c.handle)); return h ? { y: 8 - h.timeOfImpact, n: P.colliderName(h.collider.handle) } : null; };
        const cells = { valid: 0, flat: [], edge: [], meshOnly: [], colOnly: [], bad: [], stairs: [] };
        const SIMPLE = key === 'nmg_bench';   // sólido simplificado (DT-06): listones con huecos frente a una caja
        const step = SIMPLE ? 0.05 : 0.25, E = 0.03;
        const nearBoth = (x, z) => { const lo = key === 'nmg_u' ? -2 : 0.02; for (const [ox, oz] of [[0.04, 0], [-0.04, 0], [0, 0.04], [0, -0.04]]) { const a = mTop(x + ox, z + oz), b = cTop(x + ox, z + oz); if (a !== null && a > lo && b && b.y > lo) return true; } return false; };
        for (let x = area.min.x; x <= area.max.x; x += step) for (let z = area.min.z; z <= area.max.z; z += step) {
          const m = mTop(x, z), ch = cTop(x, z), c = ch ? ch.y : null;
          const LOW = key === 'nmg_u' ? -2 : 0.02;   // el hoyo de la U está bajo el suelo
          const mm = m !== null && m > LOW ? m : null, cc = c !== null && c > LOW ? c : null;
          // desviación DECLARADA (DT-05, HUM-012): la escalera NMG colisiona como rampa bajo/entre las huellas (≤ 0,10 m + bisel)
          // (delante del primer peldaño el pie de la rampa está sobre el suelo visible: malla = 0)
          if (ch && (ch.n === 'nmg_stair_ramp' || ch.n === 'nmg_pit_ramp')) { cells.stairs.push(Math.abs((mm ?? 0) - cc)); continue; }
          if (mm === null && cc === null) continue;
          if (mm !== null && cc === null) { if (nearBoth(x, z)) cells.edge.push(0); else cells.meshOnly.push([+x.toFixed(2), +z.toFixed(2), +mm.toFixed(3)]); continue; }
          if (mm === null && cc !== null) { if (SIMPLE || nearBoth(x, z)) cells.edge.push(0); else cells.colOnly.push([+x.toFixed(2), +z.toFixed(2), +cc.toFixed(3)]); continue; }
          cells.valid++;
          const d = Math.abs(mm - cc);
          // franja de arista: alguna de las 4 sondas a ±3 cm cambia de altura > 3 cm (malla o collider)
          let edge = false;
          for (const [ox, oz] of [[E, 0], [-E, 0], [0, E], [0, -E]]) { const m2 = mTop(x + ox, z + oz), c2h = cTop(x + ox, z + oz), c2 = c2h ? c2h.y : null; if (m2 === null || c2 === null || Math.abs(m2 - mm) > 0.03 || Math.abs(c2 - cc) > 0.03) { edge = true; break; } }
          (edge ? cells.edge : cells.flat).push(d);
          if (!edge && d > 0.03) cells.bad.push([+x.toFixed(2), +z.toFixed(2), +mm.toFixed(3), +cc.toFixed(3)]);
        }
        // laterales: marco de la pieza (rotación Y del contenedor o del nodo)
        const q = new T.Quaternion(); child.getWorldQuaternion(q); const e = new T.Euler().setFromQuaternion(q, 'YXZ'); const yaw = e.y;
        const ctr = box.getCenter(new T.Vector3());
        const lat = [];
        for (const h of [0.1, 0.3, Math.min(0.6, box.max.y - 0.05)]) for (const [lx, lz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const nx = lx * Math.cos(yaw) + lz * Math.sin(yaw), nz = -lx * Math.sin(yaw) + lz * Math.cos(yaw);
          const o = new T.Vector3(ctr.x + nx * 6, h, ctr.z + nz * 6), dir = new T.Vector3(-nx, 0, -nz);
          ray.set(o, dir); ray.far = 6; const hm = ray.intersectObjects(meshes, false)[0];
          const hc = g.world.castRay(new RA.Ray({ x: o.x, y: o.y, z: o.z }, { x: dir.x, y: 0, z: dir.z }), 6, true, RA.QueryFilterFlags.EXCLUDE_SENSORS, undefined, undefined, undefined, (c) => colSet.has(c.handle));
          const dm = hm ? hm.distance : null, dc = hc ? hc.timeOfImpact : null;
          if (dm === null && dc === null) continue;
          if (hc && /nmg_(stair|pit)_ramp/.test(P.colliderName(hc.collider.handle))) continue;   // rampa declarada (DT-05): ya medida arriba
          lat.push({ h, side: [lx, lz], dm: dm === null ? null : +dm.toFixed(3), dc: dc === null ? null : +dc.toFixed(3), d: dm !== null && dc !== null ? +Math.abs(dm - dc).toFixed(3) : null });
        }
        const sorted = (a) => [...a].sort((p, q) => p - q), pct = (a, p) => (a.length ? sorted(a)[Math.min(a.length - 1, Math.floor(p * a.length))] : null);
        out.push({ piece: key, node, simple: SIMPLE, colliders: cols.length, valid: cells.valid, flat: cells.flat.length, edge: cells.edge.length,
          flatOk01: cells.flat.filter((d) => d <= 0.01).length, p50: pct(cells.flat, 0.5), p99: pct(cells.flat, 0.99), max: cells.flat.length ? Math.max(...cells.flat) : null,
          bad: cells.bad.length, badSample: cells.bad.slice(0, 6), meshOnly: cells.meshOnly.length, meshOnlySample: cells.meshOnly.slice(0, 6), colOnly: cells.colOnly.length, colOnlySample: cells.colOnly.slice(0, 6),
          stairs: { n: cells.stairs.length, max: cells.stairs.length ? Math.max(...cells.stairs) : null }, lateral: lat, latBad: lat.filter((l) => l.d === null || l.d > 0.01).length, bbox: { min: box.min.toArray().map((v) => +v.toFixed(3)), max: box.max.toArray().map((v) => +v.toFixed(3)) } });
      }
      return { pieces: out, counted };
    }, PIECES);
    if (res.err) throw new Error(res.err + ' ' + JSON.stringify(res.kitState));
    // T5-03 paso 4: otros cargadores (props instanciados de loadProps): base de cada instancia sobre su apoyo y centro XZ
    // sobre su slot (un nodo meshopt mal compuesto aparecería hundido/desplazado como el kit en V4)
    const props = await page.evaluate(() => {
      const g = window.__bk, T = window.__bkTHREE, P = g.park, out = {};
      const byKind = {}; for (const s of P.propSlots) (byKind[s.kind] ||= []).push(s);
      P.root.traverse((o) => {
        if (!o.isInstancedMesh || !o.name.startsWith('PROP_')) return;
        const kind = o.name.slice(5), slots = byKind[kind] || [];
        o.geometry.computeBoundingBox(); const bb0 = o.geometry.boundingBox; const m = new T.Matrix4();
        const rec = out[kind] ||= { slots: slots.length, worst: { dy: 0, dxz: 0 }, n: 0 };
        for (let i = 0; i < Math.min(o.count, slots.length); i++) {
          o.getMatrixAt(i, m); const bb = bb0.clone().applyMatrix4(m.clone().premultiply(o.matrixWorld)); const s = slots[i];
          const c = bb.getCenter(new T.Vector3());
          rec.n++;
          // la base de la UNIÓN de primitivas del prop se evalúa al final (aquí el mínimo por primitiva)
          rec.minY = Math.min(rec.minY ?? 9, bb.min.y - (s.y ?? 0)); rec.dxzMax = Math.max(rec.dxzMax ?? 0, Math.hypot(c.x - s.x, c.z - s.z));
        }
      });
      return out;
    });
    R.measure('props', props);
    for (const [k, v] of Object.entries(props)) R.check(v.minY > -0.05 && v.minY < 0.25 && v.dxzMax < 1.6, `prop ${k}: base sobre su apoyo (−0,05…0,25 m) y centro cerca del slot`, 'unit', v);
    R.measure('piezas', res.pieces);
    if (!R.nonEmpty(res.pieces, 'piezas del kit')) return;
    for (const p of res.pieces) {
      if (p.err) { R.check(false, `${p.node}: ${p.err}`, 'unit'); continue; }
      const free = WALKTHROUGH.has(p.piece);
      const pctOk = p.flat ? p.flatOk01 / p.flat : 0;
      R.check(free || (p.flat > 0 && pctOk >= 0.99 && p.bad === 0), `${p.node}: caras planas |Δ| ≤ 0,01 en ≥99 % (${p.flatOk01}/${p.flat}) y 0 > 0,03 fuera de aristas (${p.bad})`, 'unit', { p50: p.p50, p99: p.p99, max: p.max, badSample: p.badSample });
      R.check(free || (p.meshOnly === 0 && p.colOnly === 0), `${p.node}: sólo-malla = ${p.meshOnly}, sólo-collider = ${p.colOnly} (deben ser 0)`, 'unit', { meshOnlySample: p.meshOnlySample, colOnlySample: p.colOnlySample });
      if (p.stairs?.n) R.check(p.stairs.max <= 0.115, `${p.node}: escalera como rampa de colisión (DT-05), desviación pie-huella ≤ 0,10 m + bisel (${p.stairs.n} celdas)`, 'unit', p.stairs);
      if (!free && !p.simple) R.check(p.latBad === 0, `${p.node}: laterales malla↔collider ±0,01 m (${p.lateral.length - p.latBad}/${p.lateral.length})`, 'unit', p.lateral.filter((l) => l.d === null || l.d > 0.01).slice(0, 6));
    }
  } finally { await b.close(); }
}, { timeoutMs: 600000 });
