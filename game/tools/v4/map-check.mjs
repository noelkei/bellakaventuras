// V4-MAP-01/02 · Comprobador de planta en runtime (static): WORLD 42/22, manifiesto (20 IDs, 6 cassettes), soporte bajo
// cada patata, colliders de módulos dentro de la banda r 25–38 (o del centro), solapes entre módulos por intersección de
// formas Rapier (no AABB), pasos/carreras reservados de NMG y TT, y capturas de revisión desde cámaras fijas.
import fs from 'node:fs';
import path from 'node:path';
import { Report, runTest, launch, openGame, clickStart, reviewShot, ROOT } from './lib.mjs';

const R = new Report('MAP-02', 'map-check');
await runTest(R, async () => {
  const browser = await launch();
  try {
    const page = await openGame(browser, R, { save: null });
    const res = await page.evaluate(() => {
      const g = window.__bk, W = window.__bkWORLD, RA = window.__bkRapier, P = g.park, T = window.__bkTHREE;
      const pol = (x, z) => { const r = Math.hypot(x, z); let th = Math.atan2(x, -z) * 180 / Math.PI; if (th < 0) th += 360; return { r, th }; };
      const out = { world: W, validate: g.manifest.validate(), fries: [], outOfBand: [], overlaps: [], counts: {} };
      // soporte bajo cada patata (rayo desde 1,5 m por encima)
      for (const f of g.manifest.fries) {
        // rayo desde 0,5 m por encima (bajo los techos de los pasos agachados)
        const ray = new RA.Ray({ x: f.pos.x, y: f.pos.y + 0.5, z: f.pos.z }, { x: 0, y: -1, z: 0 });
        const hit = g.world.castRay(ray, 2, true, RA.QueryFilterFlags.EXCLUDE_SENSORS);
        const sup = hit ? +(f.pos.y + 0.5 - hit.timeOfImpact).toFixed(3) : null;
        // ¿cabe la cápsula (de pie o agachada según acceso) en el punto?
        const half = f.access === 'crouch' ? 0.25 : 0.6, shape = new RA.Capsule(half, 0.28);
        const blocked = g.world.intersectionWithShape({ x: f.pos.x, y: (sup ?? f.pos.y) + half + 0.3 + 0.03, z: f.pos.z }, { x: 0, y: 0, z: 0, w: 1 }, shape, RA.QueryFilterFlags.EXCLUDE_SENSORS);
        out.fries.push({ id: f.id, ...pol(f.pos.x, f.pos.z), y: f.pos.y, sup, access: f.access, blocked: blocked ? P.colliderName(blocked.handle) || 'otro' : null });
      }
      // colliders de módulos: banda y solapes
      const skip = /^(ground|bound|signpost|lamp|palm_trunk|tree_trunk|cone|rail|grind_rail|railing|npc|)$/;
      const cols = []; g.world.forEachCollider((c) => { const n = P.colliderName(c.handle); if (!c.isEnabled() || skip.test(n) || g.cars.colliderHandles.includes(c.handle)) return; cols.push({ c, n }); });
      for (const { c, n } of cols) {
        const t = c.translation(); let rmax = 0, rmin = 1e9;
        // muestreo de la forma: 64 puntos de su AABB proyectados (para trimesh se usa el contorno de sus vértices)
        let pts = [];
        if (c.shape.vertices) { const v = c.shape.vertices; for (let i = 0; i < v.length; i += 3) pts.push([v[i], v[i + 2]]); }
        else if (c.shape.halfExtents) { const h = c.shape.halfExtents, q = c.rotation(); const e = new T.Euler().setFromQuaternion(new T.Quaternion(q.x, q.y, q.z, q.w)); for (const sx of [-1, 1]) for (const sz of [-1, 1]) { const v = new T.Vector3(sx * h.x, 0, sz * h.z).applyEuler(e); pts.push([t.x + v.x, t.z + v.z]); } }
        else pts.push([t.x, t.z]);
        for (const [x, z] of pts) { const r = Math.hypot(x, z); rmax = Math.max(rmax, r); rmin = Math.min(rmin, r); }
        const p = pol(pts[0][0], pts[0][1]);
        const inCenter = rmax <= W.rCenter + 0.01;
        const inPerim = rmin >= W.rOuter - 0.01;
        if (!inCenter && !inPerim && (rmax > W.outerPath[0] + 0.05 || rmin < W.innerPath[1] - 0.05)) out.outOfBand.push({ n, rmin: +rmin.toFixed(2), rmax: +rmax.toFixed(2), th: +p.th.toFixed(1) });
      }
      // solapes reales entre módulos (formas Rapier)
      const seen = new Set();
      for (const { c, n } of cols) {
        g.world.intersectionsWithShape(c.translation(), c.rotation(), c.shape, (o) => {
          if (o.handle === c.handle) return true;
          const on = P.colliderName(o.handle); if (skip.test(on) || !o.isEnabled() || g.cars.colliderHandles.includes(o.handle)) return true;
          const key = [c.handle, o.handle].sort().join('-'); if (seen.has(key)) return true; seen.add(key);
          const ta = c.translation(), tb = o.translation(); if (Math.hypot(ta.x, ta.z) > W.rOuter && Math.hypot(tb.x, tb.z) > W.rOuter) return true;   // perímetro común (sin cambios V4)
          // contactos de piezas del mismo módulo (escalones con plataforma, rampa con macizo, etc.) se anotan aparte
          out.overlaps.push({ a: n, b: on, at: (() => { const t = c.translation(); const q = pol(t.x, t.z); return [+q.r.toFixed(1), +q.th.toFixed(1)]; })() });
          return true;
        }, RA.QueryFilterFlags.EXCLUDE_SENSORS);
      }
      out.counts = { colliders: cols.length };
      return out;
    });
    R.check(res.world.rOuter === 42 && res.world.rCenter === 22 && res.world.outerPath[0] === 38 && res.world.outerPath[1] === 42, 'WORLD: rOuter 42, rCenter 22, corona 20, paseo exterior 38–42', 'static', res.world);
    R.check(res.validate.length === 0, 'manifiesto válido (20 IDs únicos, 4 por sector, 6 cassettes, spawn en NO ME GUILLO)', 'static', res.validate);
    R.nonEmpty(res.fries, 'patatas');
    for (const f of res.fries) R.check(f.sup !== null && Math.abs(f.sup - f.y) < 0.12 && !f.blocked, `${f.id}: soporte bajo la patata y cápsula ${f.access === 'crouch' ? 'agachada' : 'de pie'} libre (r ${f.r.toFixed(1)})`, 'static', f);
    R.check(res.outOfBand.length === 0, 'ningún collider de módulo invade los paseos (banda r 25–38, centro o perímetro)', 'static', res.outOfBand);
    // solapes intencionados: piezas del mismo módulo que se tocan por construcción
    const intended = /^(nmg_platform|nmg_step|nmg_bank|nmg_heart|nmg_heart_ledge|nmg_box_small)$|^tt_|^bridge_deck$|^limo|^tut_tunnel|^plinth$/;
    const bad = res.overlaps.filter((o) => !(intended.test(o.a) && intended.test(o.b)));
    R.note({ solapes_intencionados: res.overlaps.length - bad.length });
    R.check(bad.length === 0, 'sin solapes entre módulos distintos', 'static', bad.slice(0, 20));
    // NV: el carril de carrerilla del paso 3 (6 m antes de su puerta, ±1 m) queda libre de conos (sólidos desde V4); antes
    // el último cono del slalom estaba a ~0,5 m y paraba la carrerilla (campaña VAL-02)
    const lane = await page.evaluate(() => {
      const g = window.__bk, P = g.park, gt = P.tutorialGates[2], tun = P.tutorialGates[3];
      let d = [Math.sin(gt.yaw), Math.cos(gt.yaw)]; const tow = [tun.c.x - gt.c.x, tun.c.z - gt.c.z]; if (d[0] * tow[0] + d[1] * tow[1] < 0) d = [-d[0], -d[1]];
      const cones = []; g.world.forEachCollider((c) => { if (P.colliderName(c.handle) === 'cone') { const t = c.translation(); cones.push([t.x, t.z]); } });
      const inLane = cones.map(([x, z]) => { const rx = x - gt.c.x, rz = z - gt.c.z, al = rx * d[0] + rz * d[1], lat = -rx * d[1] + rz * d[0]; return { al: +al.toFixed(2), lat: +lat.toFixed(2) }; }).filter((q) => q.al > -6 && q.al < 0 && Math.abs(q.lat) < 1.0);
      return { cones: cones.length, inLane };
    });
    R.check(lane.cones > 0 && lane.inLane.length === 0, 'NV: ningún cono (sólido) en el carril de carrerilla hacia la barra del paso 3 (6 m × ±1 m)', 'static', lane);
    fs.mkdirSync(path.join(ROOT, 'V4', 'evidencias', 'MAP-02'), { recursive: true });
    fs.writeFileSync(path.join(ROOT, 'V4', 'evidencias', 'MAP-02', 'map-check.json'), JSON.stringify(res, null, 1));
    // capturas de revisión (cámaras fijas, no recorridos)
    const shots = [
      ['nmg_general', [10, 26, -6], [21, 0, -27]], ['nmg_llegada', [14.6, 1.9, -30.4], [19.5, 1.0, -26.4]], ['tt_escalera', [-12, 9, 19], [-4, 2, 31]],
      ['nv_circuito', [-11, 18, -12], [-18, 0, -24]], ['fg_pista', [14, 12, 2], [28, 0, 9]], ['yy_muro', [-12, 10, 2], [-29, 1, 10]], ['mapa_cenital', [0.1, 110, 0], [0, 0, 0]],
    ];
    await clickStart(page);
    const got = [];
    for (const [name, pos, tgt] of shots) got.push({ name, ...(await reviewShot(page, R, name, pos, tgt)) });
    R.check(got.length === shots.length && got.every((q) => q.sd >= 6), 'capturas de revisión con el mundo visible (sin pantalla de inicio, imagen no uniforme)', 'vision', got.map((q) => ({ n: q.name, sd: +q.sd.toFixed(1) })));
  } finally { await browser.close(); }
});
