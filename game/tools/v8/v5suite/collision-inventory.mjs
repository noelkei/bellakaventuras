// T5-14 · Inventario de colisión por objeto (HUM-012, REV04-013, OPUS-021, DT-06). Recorre las piezas visuales estáticas
// registradas por el Builder (park.b.pieces) y los props instanciados (PROP_*) dentro del cuadrado ±52, con altura
// transitable (base ≤ 0,3 m y ≥ 0,12 m de alto), comprueba si un collider ocupa su volumen y asigna una clase con motivo:
//   sólido · obstáculo bajo pisable · atravesable deliberado (copa, botes, rosetas ≤ 0,6, pintura/calcos) · fuera de recinto.
// Una pieza sin collider y sin clase deliberada = fallo. Además: ensayo cono frente a cilindro (desvío lateral al andar y en
// tabla contra un cono, mutación EN MEMORIA de la forma del collider, declarada) y recorridos contra un ejemplar de cada clase.
import { Report, runTest, launch, openGame, clickStart, sleep, fixture, recStart, recStop, r3 } from '../lib.mjs';
const R = new Report('collision-inventory');
await runTest(R, async () => {
  const b = await launch();
  try {
    const page = await openGame(b, R); await clickStart(page);
    await page.waitForFunction(() => window.__bk.park.nmgKit.ok, { timeout: 30000 }); await sleep(1500);
    const inv = await page.evaluate(() => {
      const g = window.__bk, T = window.__bkTHREE, RA = window.__bkRapier, P = g.park, W = g.world;
      const occ = (min, max) => { const c = [(min[0] + max[0]) / 2, (min[1] + max[1]) / 2, (min[2] + max[2]) / 2], e = [(max[0] - min[0]) / 2, (max[1] - min[1]) / 2, (max[2] - min[2]) / 2];
        const shape = new RA.Cuboid(Math.max(0.02, e[0] * 0.8), Math.max(0.02, e[1] * 0.8), Math.max(0.02, e[2] * 0.8)); const hits = new Set();
        W.intersectionsWithShape({ x: c[0], y: c[1], z: c[2] }, { x: 0, y: 0, z: 0, w: 1 }, shape, (col) => { const n = P.colliderName(col.handle); if (n !== 'ground' && !col.isSensor()) hits.add(n || 'h' + col.handle); return true; }, RA.QueryFilterFlags.EXCLUDE_SENSORS, undefined, g.skater.collider);
        return [...hits]; };
      const rows = [];
      const classify = (src, chunk, mat, min, max, cols) => {
        const h = max[1] - min[1], inSquare = Math.max(Math.abs(min[0]), Math.abs(max[0]), Math.abs(min[2]), Math.abs(max[2])) <= 52.5;
        if (!inSquare) return ['fuera de recinto', 'fondo aplazado (D1), inalcanzable'];
        if (cols.length) return ['sólido', cols.slice(0, 3).join(',')];
        if (min[1] > 2.0) return ['atravesable deliberado', 'copa/follaje por encima de la cabeza'];
        if (/leaf|leaf_light/.test(mat) && h <= 0.62) return ['atravesable deliberado', 'follaje bajo ≤ 0,6 m'];
        if (/nmg_shrub|PROP_nmg_shrub|shrub_low|shrub_mid|shrub_tall|nmg_plant|PROP_nmg_plant/.test(chunk + mat) && h <= 1.0) return ['atravesable deliberado', 'mata NMG (follaje)'];
        if (chunk === 'yinyang' && /fuchsia|turquoise|yellow|black/.test(mat) && h <= 0.21) return ['atravesable deliberado', 'botes de pintura 0,2 m: una caja atascaría el skate (DT-06)'];
        // V10 IT2: los tres sprays de NVDA junto al pilar (acercamiento C2 del dossier, D-NV): mismo caso que los botes de YY
        if (chunk === 'nosvamosdeaqui' && h <= 0.21 && Math.max(max[0] - min[0], max[2] - min[2]) < 0.1) return ['atravesable deliberado', 'sprays 0,2 m de NVDA: una caja atascaría el skate (DT-06)'];
        if (/paint|decal|G_|T_/.test(mat) || (max[0] - min[0] < 0.02 || max[2] - min[2] < 0.02)) return ['atravesable deliberado', 'pintura/calco plano sobre otra pieza'];
        if (/proxy_/.test(chunk)) return ['proxy oculto', 'sustituido por el derivado GLB (su colisión es la del prop)'];
        return [null, 'SIN CLASE'];
      };
      for (const p of P.b.pieces) {
        const h = p.max[1] - p.min[1]; if (p.min[1] > 0.3 && p.min[1] < 2.0) continue; if (h < 0.12) continue;
        const cols = occ(p.min, p.max); const [cls, why] = classify('piece', p.chunk, p.mat, p.min, p.max, cols);
        rows.push({ src: 'pieza', chunk: p.chunk, mat: p.mat, name: p.name, h: +h.toFixed(2), at: [+((p.min[0] + p.max[0]) / 2).toFixed(1), +((p.min[2] + p.max[2]) / 2).toFixed(1)], cls, why });
      }
      const m = new T.Matrix4();
      P.root.traverse((o) => { if (!o.isInstancedMesh || !o.name.startsWith('PROP_')) return; o.geometry.computeBoundingBox();
        for (let i = 0; i < o.count; i++) { o.getMatrixAt(i, m); const bb = o.geometry.boundingBox.clone().applyMatrix4(m.clone().premultiply(o.matrixWorld)); const min = bb.min.toArray(), max = bb.max.toArray(); const h = max[1] - min[1];
          if (min[1] > 0.3 || h < 0.12) continue; const cols = occ(min, max); const [cls, why] = classify('prop', o.name, o.name, min, max, cols);
          rows.push({ src: 'prop', chunk: o.name, mat: o.name, h: +h.toFixed(2), at: [+((min[0] + max[0]) / 2).toFixed(1), +((min[2] + max[2]) / 2).toFixed(1)], cls, why }); } });
      let n = 0; W.forEachCollider(() => n++);
      return { rows, colliders: n };
    });
    R.measure('inventario', inv.rows); R.measure('colliders', inv.colliders);
    const by = {}; for (const r of inv.rows) { const k = `${r.cls ?? 'SIN CLASE'}`; by[k] = (by[k] || 0) + 1; }
    R.note({ porClase: by, colliders: inv.colliders });
    const bad = inv.rows.filter((r) => !r.cls);
    R.check(bad.length === 0, `todas las piezas transitables tienen collider o clase deliberada (${inv.rows.length - bad.length}/${inv.rows.length})`, 'unit', bad.slice(0, 20));
    // ---------------------------------------------------------------- ensayo cono frente a cilindro (OPUS-021)
    const cones = await page.evaluate(() => { const g = window.__bk, P = g.park, out = []; g.world.forEachCollider((c) => { if (P.colliderName(c.handle) === 'cone') { const t = c.translation(); out.push([t.x, t.z, c.shape.type]); } }); return out; });
    const RA_CYL = await page.evaluate(() => window.__bkRapier.ShapeType.Cylinder);
    R.measure('conos_forma_servida', cones.map((c) => c[2]));
    // V10 (cambio de diseño aprobado): los conos eran del circuito tutorial de NVDA, retirado. Si la build no trae conos, la forma servida no
    // aplica y el ensayo de impacto se hace con un cono DECLARADO (cilindro 0,25 × 0,4 en llano, nombre `cone`, en el conjunto de conos)
    if (cones.length) R.check(cones.every((c) => c[2] === RA_CYL), `conos con collider cilindro en la build servida (${cones.filter((c) => c[2] === RA_CYL).length}/${cones.length})`, 'unit', cones.map((c) => c[2]));
    else { R.note('build sin conos (circuito tutorial retirado en V10): forma servida no aplica; ensayo con un cono declarado');
      const fx = await fixture(page, R, 'cono declarado en llano (−24; −37,5), cilindro 0,25 × 0,4', () => { const g = window.__bk, RA = window.__bkRapier, P = g.park;
        const c = g.world.createCollider(RA.ColliderDesc.cylinder(0.2, 0.25).setTranslation(-24, 0.2, -37.5)); P.nameCollider(c.handle, 'cone'); P.cones.add(c.handle); return { h: c.handle }; });
      void fx; cones.push([-24, -37.5, RA_CYL]); }
    const trial = [];
    for (const shape of ['cono', 'cilindro']) for (const loco of ['walk', 'ride']) {
      const c = cones[0];
      await fixture(page, R, `forma del collider de los conos: ${shape} (mutación en memoria)`, (shape) => {
        const g = window.__bk, P = g.park, RA = window.__bkRapier;
        g.world.forEachCollider((col) => { if (P.colliderName(col.handle) !== 'cone') return; col.setShape(shape === 'cono' ? new RA.Cone(0.25, 0.2) : new RA.Cylinder(0.25, 0.2)); });
        return { shape };
      }, shape);
      // aproximación frontal con 5 cm de desfase lateral (W real), desde 3 m
      const hd = 0; const st = [c[0] + 0.05, 0, c[1] - 3.0];
      await fixture(page, R, `frente a un cono (${loco})`, (p, h, l) => { const g = window.__bk, T = window.__bkTHREE; g.input.clear(); g.skater.teleport(new T.Vector3(p[0], 0, p[2]), h, l); g.rig.snapBehind(g.skater); g.skater.impactLog.length = 0; return {}; }, st, hd, loco);
      await sleep(300); await recStart(page); await page.keyboard.down('KeyW'); await sleep(loco === 'walk' ? 2200 : 1500); await page.keyboard.up('KeyW'); await sleep(300);
      const rows = await recStop(page); const imp = await page.evaluate(() => window.__bk.skater.impactLog.length);
      const lat = Math.max(...rows.map((r) => Math.abs(r.x - st[0]))); const passed = Math.max(...rows.map((r) => r.z)) > c[1] + 0.5;
      trial.push({ shape, loco, latMax: r3(lat), passed, impacts: imp });
    }
    R.measure('ensayo_cono', trial); console.log(JSON.stringify(trial));
    R.check(trial.every((t) => t.impacts === 0), 'los conos nunca producen estrella (bloquean y desvían)', 'input', trial);
  } finally { await b.close(); }
}, { timeoutMs: 600000 });
