// T5-11 · Apoyos y relaciones NMG tras restaurar matrices (HUM-002/003, REV04-002/005/006, REV04-013).
//  · Pantera sentada: suelas (vértices fuera del bordillo) frente al suelo visible y asiento (vértices sobre la huella del
//    bordillo) frente a la cara superior VISIBLE del bordillo (malla del kit); hueco/penetración en [−0,02; +0,01] m.
//  · Patatas NMG: punto de apoyo (spawn) frente a la superficie visible bajo él (±0,01).
//  · Matas de las islas (R6: nmg_plant_*; antes rosetas nmg_shrub_*): base de cada instancia frente a la cara superior visible de su isla ([−0,01; +0,01]).
//  · Respaldos de banco (todos los bancos del parque): un rayo horizontal a media altura del respaldo impacta en un collider.
// Más capturas de observación R14 (corazón frente a Pantera sentada) desde el punto de vista de la referencia 03.
import { Report, runTest, launch, openGame, clickStart, sleep, directShot, r3 } from '../lib.mjs';

const R = new Report('nmg-supports');
const th = (33 + 9) * Math.PI / 180 /* V10 (preparación): marco NMG con el giro de corona, como world/nmg.ts */, O = [33.4 * Math.sin(th), -33.4 * Math.cos(th)], X = [Math.cos(th), Math.sin(th)], Z = [-Math.sin(th), Math.cos(th)];
const V = (x, z, h = 0) => [O[0] + X[0] * x + Z[0] * z, h, O[1] + X[1] * x + Z[1] * z];

await runTest(R, async () => {
  const b = await launch();
  try {
    const page = await openGame(b, R); await clickStart(page);
    await page.waitForFunction(() => window.__bk.park.nmgKit.ok && window.__bk.npcs.has('la_pantera'), { timeout: 30000 });
    await sleep(1500);
    const m = await page.evaluate(() => {
      const g = window.__bk, T = window.__bkTHREE, RA = window.__bkRapier, P = g.park;
      g.scene.updateMatrixWorld(true);
      const kit = P.root.getObjectByName('NMG_KIT'); const kitMeshes = []; kit.traverse((o) => o.isMesh && kitMeshes.push(o));
      const rc = new T.Raycaster();
      const visTop = (x, z, from = 5) => { rc.set(new T.Vector3(x, from, z), new T.Vector3(0, -1, 0)); const h = rc.intersectObjects(kitMeshes, false)[0]; return h ? h.point.y : 0; };
      // --- Pantera
      const pan = g.npcs.get('la_pantera')[0]; const sk = []; pan.root.traverse((o) => o.isSkinnedMesh && sk.push(o));
      const ledge = [...(() => { const out = []; g.world.forEachCollider((c) => { if (P.colliderName(c.handle) === 'nmg_heart_ledge') out.push(c); }); return out; })()][0];
      const lt = ledge.translation(), lq = ledge.rotation(), lh = ledge.shape.halfExtents, lyaw = 2 * Math.atan2(lq.y, lq.w);
      const onLedge = (x, z) => { const dx = x - lt.x, dz = z - lt.z, c = Math.cos(lyaw), s = Math.sin(lyaw); const lx = dx * c - dz * s, lz = dx * s + dz * c; return Math.abs(lx) <= lh.x - 0.02 && Math.abs(lz) <= lh.z - 0.02; };
      let soleGap = Infinity, seatGap = Infinity, calfPen = 0; const tmp = new T.Vector3();
      const ledgeTop = lt.y + lh.y;
      for (const mesh of sk) { mesh.skeleton.update(); const n = mesh.geometry.attributes.position.count;
        for (let i = 0; i < n; i += 3) { mesh.getVertexPosition(i, tmp).applyMatrix4(mesh.matrixWorld);
          const dx = tmp.x - lt.x, dz = tmp.z - lt.z, c = Math.cos(lyaw), s = Math.sin(lyaw), lx = dx * c - dz * s, lz = dx * s + dz * c;
          const inFoot = Math.abs(lx) <= lh.x && Math.abs(lz) <= lh.z;
          if (inFoot && tmp.y >= ledgeTop - 0.03) { const top = visTop(tmp.x, tmp.z, tmp.y + 0.6); seatGap = Math.min(seatGap, tmp.y - top); }   // asiento
          else if (inFoot && tmp.y < ledgeTop - 0.03) calfPen = Math.max(calfPen, Math.min(lh.x - Math.abs(lx), lh.z - Math.abs(lz)));            // piernas dentro del bordillo
          else if (!inFoot && tmp.y < 0.3) soleGap = Math.min(soleGap, tmp.y - 0); } }
      // --- patatas NMG
      const fries = g.pickups.filter((p) => p.id.startsWith('no_me_guillo')).map((p) => { const sp = p.spawn; const top = visTop(sp.pos.x, sp.pos.z, sp.pos.y + 1.5);
        return { id: p.id, supportY: +sp.pos.y.toFixed(3), visTop: +top.toFixed(3), d: +(sp.pos.y - top).toFixed(3), hover: sp.hover }; });
      // --- rosetas (instancias) frente a la isla visible (malla nmg_bed)
      const beds = []; kit.traverse((o) => { if (o.isMesh && /nmg_bed/.test(o.name)) beds.push(o); });
      const bedTop = (x, z) => { rc.set(new T.Vector3(x, 3, z), new T.Vector3(0, -1, 0)); const h = rc.intersectObjects(beds, false)[0]; return h ? h.point.y : null; };
      const shr = []; const mm = new T.Matrix4();
      P.root.traverse((o) => { if (!o.isInstancedMesh || !/PROP_nmg_plant/.test(o.name)) return; o.geometry.computeBoundingBox();
        for (let i = 0; i < o.count; i++) { o.getMatrixAt(i, mm); const bb = o.geometry.boundingBox.clone().applyMatrix4(mm.clone().premultiply(o.matrixWorld)); const c = bb.getCenter(new T.Vector3()); const t = bedTop(c.x, c.z);
          shr.push({ k: o.name, i, base: +bb.min.y.toFixed(3), bed: t === null ? null : +t.toFixed(3), gap: t === null ? null : +(bb.min.y - t).toFixed(3) }); } });
      // por instancia: la base es el mínimo de sus primitivas (varias InstancedMesh por tipo)
      const byInst = {}; for (const s of shr) { const k = s.k.replace(/_\d+$/, '') + ':' + s.i; if (!byInst[k] || s.base < byInst[k].base) byInst[k] = s; }
      const shrubs = Object.values(byInst);
      // --- respaldos: bancos por collider 'bench' (asiento) → rayo horizontal a 0,65 m hacia el respaldo
      const benches = []; g.world.forEachCollider((c) => { const n = P.colliderName(c.handle); if (n !== 'bench') return; const t = c.translation(), q = c.rotation(), h = c.shape.halfExtents, yaw = 2 * Math.atan2(q.y, q.w);
        const res = []; for (const sgn of [1, -1]) { const nx = Math.sin(yaw) * sgn, nz = Math.cos(yaw) * sgn; // eje local z (profundidad)
          const o = { x: t.x - nx * 1.0, y: t.y + h.y + 0.22, z: t.z - nz * 1.0 };
          const hit = g.world.castRay(new RA.Ray(o, { x: nx, y: 0, z: nz }), 2.0, true, RA.QueryFilterFlags.EXCLUDE_SENSORS, undefined, undefined, undefined, (cc) => cc.handle !== c.handle);
          res.push(hit ? P.colliderName(hit.collider.handle) : null); }
        benches.push({ at: [+t.x.toFixed(1), +t.z.toFixed(1)], seatTop: +(t.y + h.y).toFixed(2), back: res }); });
      return { pantera: { soleGap: +soleGap.toFixed(3), seatGap: +seatGap.toFixed(3), calfPen: +calfPen.toFixed(3) }, fries, shrubs, benches };
    });
    R.measure('apoyos', m); console.log(JSON.stringify(m.pantera), JSON.stringify(m.fries));
    R.check(m.pantera.soleGap >= -0.02 && m.pantera.soleGap <= 0.01, 'Pantera: suelas sobre el suelo visible (−0,02…+0,01 m)', 'unit', m.pantera);
    R.check(m.pantera.seatGap >= -0.02 && m.pantera.seatGap <= 0.01, 'Pantera: asiento sobre el bordillo visible (−0,02…+0,01 m)', 'unit', m.pantera);
    R.check(m.pantera.calfPen <= 0.02, 'Pantera: piernas sin atravesar el bordillo (≤ 2 cm)', 'unit', m.pantera);
    R.check(m.fries.every((f) => Math.abs(f.d) <= 0.01 || f.id.endsWith('.hidden')), 'patatas NMG: apoyo = superficie visible ±0,01 (la de la U se rehace en T5-12)', 'unit', m.fries);
    const sh = m.shrubs.filter((s) => s.gap !== null);
    R.check(R.nonEmpty(sh, 'rosetas sobre isla') && sh.every((s) => s.gap >= -0.01 && s.gap <= 0.01), `rosetas: base sobre su isla visible ±0,01 (${sh.filter((s) => s.gap >= -0.01 && s.gap <= 0.01).length}/${sh.length})`, 'unit', { gaps: [...new Set(sh.map((s) => s.gap))].sort((a, b) => a - b) });
    R.check(m.benches.every((bn) => bn.back.some((x) => x === 'bench_back')), `respaldos con collider (${m.benches.filter((bn) => bn.back.some((x) => x === 'bench_back')).length}/${m.benches.length})`, 'unit', m.benches);
    // --- observación R14: corazón frente a Pantera sentada, desde un punto de vista como el de la referencia 03 (elevado, ¾)
    await directShot(page, R, 'r14_llegada_ref03', V(-15.5, -1.0, 6.5), V(-2.0, 2.4, 0.4), 55);
    await directShot(page, R, 'r14_charla', V(-7.2, -3.8, 1.7), V(-4.4, 0.8, 0.7), 55);
    R.pendingHuman('R14: comparar el corazón con la referencia 03 (par en evidencias)');
  } finally { await b.close(); }
});
