// T5-15 · Tabla en curvas y rampas (REV04-004, DT-07). Por fotograma de render, con ANMI en tabla y apoyada: penetración
// máxima de los vértices del DECK (malla con skin) en la superficie de colisión que tienen debajo, y la «flecha» de la cuerda
// nariz–cola frente al centro. Rampas (trimesh localizadas por nombre): quarter_bola, trick_kicker, nmg_bank, nmg_quarter,
// tt_stair_ramp, tut_kicker, bank. Velocidad de entrada declarada (fixture) 4/8/14 m/s, sin W: sube y vuelve (ambos
// sentidos). Control negativo: llano a 5 m/s → penetración ≤ 3 mm y la tabla no flota (misma altura del deck que en A).
// Aceptación: penetración ≤ 0,02 m en todas las rampas y velocidades.
import { Report, runTest, launch, openGame, clickStart, sleep, fixture, r3, arg, baselineGet, baselineSet, isA } from '../lib.mjs';
const R = new Report('board-curves');
// V7 (Auditoría 7/plan-v7/09): `tt_stair_ramp` era la rampa continua de la escalera del TRA TRA TRA anterior (retirada: las escaleras
// nuevas son peldaños físicos y no se suben en tabla). No aplica; la única rampa nueva de TT es R1 (0,60 m, lanzadera sobre el corte),
// que se mide con la tabla en tt-matrix F (16 saltos) y tt-routes. El resto de la lista es la de V5/V6.
const RAMPS = arg('ramps', 'quarter_bola,trick_kicker,nmg_bank,nmg_quarter,tut_kicker,bank').split(',');
const SPEEDS = arg('speeds', '4,8,14').split(',').map(Number);
await runTest(R, async () => {
  const b = await launch();
  try {
    const page = await openGame(b, R); await clickStart(page); await sleep(800);
    await page.evaluate(() => {
      const g = window.__bk, T = window.__bkTHREE, RA = window.__bkRapier; let deck = null; g.visual.root.traverse((o) => { if (o.name === 'DECK') deck = o; });
      const meshes = []; deck.traverse((o) => o.isMesh && meshes.push(o));
      const tmp = new T.Vector3(), ray = new RA.Ray({ x: 0, y: 0, z: 0 }, { x: 0, y: -1, z: 0 });
      window.__deck = { on: false, maxPen: -9, maxPenN: -9, minGap: 9, frames: 0 };
      const r0 = g.render.bind(g);
      g.render = () => { r0(); const D = window.__deck, s = g.skater; if (!D.on || !s.grounded || !s.riding || s.loco === 'grind') return;
        D.frames++;
        for (const m of meshes) { if (m.isSkinnedMesh) m.skeleton.update(); const n = m.geometry.attributes.position.count;
          for (let i = 0; i < n; i += 3) { m.getVertexPosition ? m.getVertexPosition(i, tmp) : tmp.fromBufferAttribute(m.geometry.attributes.position, i); tmp.applyMatrix4(m.matrixWorld);
            ray.origin = { x: tmp.x, y: tmp.y + 0.5, z: tmp.z }; const h = g.world.castRayAndGetNormal(ray, 1.0, true, RA.QueryFilterFlags.EXCLUDE_SENSORS | RA.QueryFilterFlags.EXCLUDE_KINEMATIC, undefined, s.collider);
            if (!h) continue; const sy = tmp.y + 0.5 - h.timeOfImpact, pen = sy - tmp.y, penN = pen * Math.abs(h.normal.y); if (penN > D.maxPenN) { D.maxPenN = penN; D.atN = { pen: +pen.toFixed(3), ny: +h.normal.y.toFixed(3) }; } if (pen > D.maxPen) { D.maxPen = pen; const lv = m.worldToLocal(tmp.clone()); D.at = { v: [+tmp.x.toFixed(2), +tmp.y.toFixed(3), +tmp.z.toFixed(2)], local: [+lv.x.toFixed(2), +lv.y.toFixed(2), +lv.z.toFixed(2)], foot: [+s.footPos.x.toFixed(2), +s.footPos.y.toFixed(3), +s.footPos.z.toFixed(2)], vy: +s.vy.toFixed(2), state: s.state, alpha: +s.alpha.toFixed(2) }; } if (-pen < D.minGap) D.minGap = -pen; } } };
    });
    const ramps = await page.evaluate((names) => { const g = window.__bk, P = g.park, out = {};
      g.world.forEachCollider((c) => { const n = P.colliderName(c.handle); if (!names.includes(n) || out[n] || !c.shape.vertices) return; const v = c.shape.vertices;
        let lo = [0, 0, 0, 0], hi = [0, 0, 0, 0], ymax = -9; for (let i = 0; i < v.length; i += 3) ymax = Math.max(ymax, v[i + 1]);
        for (let i = 0; i < v.length; i += 3) { if (v[i + 1] < 0.02 + Math.min(0, ymax)) { lo[0] += v[i]; lo[2] += v[i + 2]; lo[3]++; } if (v[i + 1] > ymax - 0.05) { hi[0] += v[i]; hi[2] += v[i + 2]; hi[3]++; } }
        if (!lo[3] || !hi[3]) return; lo = [lo[0] / lo[3], 0, lo[2] / lo[3]]; hi = [hi[0] / hi[3], 0, hi[2] / hi[3]]; const dx = hi[0] - lo[0], dz = hi[2] - lo[2], L = Math.hypot(dx, dz);
        out[n] = { lo, dir: [dx / L, dz / L], top: ymax }; });
      return out; }, RAMPS);
    R.measure('rampas', ramps);
    const rows = [];
    R.note('no aplica: tt_stair_ramp (escalera antigua de TT, retirada en V7); cobertura en tt-matrix F y tt-routes');
    for (const name of RAMPS) { const rp = ramps[name]; if (!rp) { R.invalid(`${name}: rampa no encontrada`); continue; }
      for (const v of SPEEDS) {
        const st = [rp.lo[0] - rp.dir[0] * 3.0, 0, rp.lo[2] - rp.dir[1] * 3.0], hd = Math.atan2(rp.dir[0], rp.dir[1]);
        await fixture(page, R, `${name}: velocidad inicial declarada ${v} m/s a 3 m del pie`, (p, h, v) => { const g = window.__bk, T = window.__bkTHREE; g.input.clear(); g.skater.teleport(new T.Vector3(p[0], 0, p[2]), h, 'ride'); g.skater.vel.set(Math.sin(h) * v, 0, Math.cos(h) * v); g.rig.snapBehind(g.skater); window.__deck = { ...window.__deck, on: true, maxPen: -9, maxPenN: -9, minGap: 9, frames: 0 }; g.skater.impactLog.length = 0; return {}; }, st, hd, v);
        let ymax = 0; const t0 = Date.now(); while (Date.now() - t0 < 3200) { ymax = Math.max(ymax, await page.evaluate(() => window.__bk.skater.footPos.y)); await sleep(40); }
        const d = await page.evaluate(() => { window.__deck.on = false; return { ...window.__deck, imp: window.__bk.skater.impactLog.length, bails: window.__bk.skater.bails }; });
        const row = { name, v, ymax: r3(ymax), maxPen: r3(d.maxPen), maxPenN: r3(d.maxPenN), atN: d.atN, frames: d.frames, impacts: d.imp, at: d.maxPen > 0.015 ? d.at : undefined };
        if (ymax < 0.15 || d.frames < 10) { R.invalid(`${name} ${v}: no subió a la rampa`, row); continue; }
        rows.push(row); console.log(JSON.stringify(row));
      } }
    // control: llano
    await fixture(page, R, 'llano (-14,0,-2) a 5 m/s', () => { const g = window.__bk, T = window.__bkTHREE; g.skater.teleport(new T.Vector3(-14, 0, -2), 0, 'ride'); g.skater.vel.set(0, 0, 5); window.__deck = { ...window.__deck, on: true, maxPen: -9, minGap: 9, frames: 0 }; return {}; });
    await sleep(1500); const flat = await page.evaluate(() => { window.__deck.on = false; return window.__deck; });
    R.measure('llano', flat); R.measure('casos', rows);
    if (isA(R)) baselineSet(R, 'deck_flat_gap', r3(flat.minGap), 'hueco mínimo deck–suelo en llano (A)');
    const A = baselineGet('deck_flat_gap');
    // Penetración geométrica = distancia a lo largo de la normal de la superficie (vertical × |n_y|). La vertical se conserva
    // como dato: en paredes casi verticales (alfa ≈ 1 en la quarter) exagera la penetración real por 1/|n_y|.
    R.check(rows.length > 0 && rows.every((r) => r.maxPenN <= 0.02), `tabla sin penetrar > 2 cm (normal a la superficie) en rampas (${rows.filter((r) => r.maxPenN <= 0.02).length}/${rows.length})`, 'vision', rows.map((r) => `${r.name}@${r.v}: n ${r.maxPenN} / vert ${r.maxPen}`));
    R.measure('penetracion_vertical_max', Math.max(...rows.map((r) => r.maxPen)));
    R.check(flat.maxPen <= 0.003 && (A == null || Math.abs(flat.minGap - A) <= 0.003), 'control: en llano ni penetra (≤ 3 mm) ni flota (hueco = A ±3 mm)', 'vision', { flat, A });
  } finally { await b.close(); }
}, { timeoutMs: 900000 });
