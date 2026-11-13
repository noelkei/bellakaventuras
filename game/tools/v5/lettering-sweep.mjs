// T5-27 · Posición del cartel de NMG (OPUS-016, DT-31): candidatos en el paseo exterior (r 38–41, θ 4–70°, de cara al
// interior, giro extra −30…+30°) evaluados desde la CÁMARA DE JUEGO en la llegada (snapBehind en el spawn) en escritorio,
// vertical y horizontal: rectángulo del cartel entero en pantalla, sin solapar cabeza/torso de ANMI, Pantera ni el corazón,
// sin oclusión (rayos cámara→4 esquinas y centro contra colliders), ángulo de lectura ≤ 60°, y altura en pantalla. Elige el
// candidato con la menor altura mínima mayor entre layouts. Solo mide; el valor se fija en nmg_kit.json (layout.lettering).
import { Report, runTest, launch, openGame, clickStart, sleep, fixture, VIEWPORTS, r3 } from './lib.mjs';
const R = new Report('lettering-sweep');
await runTest(R, async () => {
  const b = await launch();
  try {
    const all = {};
    for (const [lay, vp] of [['escritorio', VIEWPORTS.desktop], ['vertical', VIEWPORTS.phone], ['horizontal', VIEWPORTS.phoneLand]]) {
      const page = await openGame(b, R, { viewport: vp }); await clickStart(page); await sleep(800);
      await fixture(page, R, `${lay}: llegada con la cámara de juego`, () => { const g = window.__bk, m = g.park.manifest.spawn; g.skater.teleport(m.pos, m.heading, 'walk'); g.rig.snapBehind(g.skater); return {}; });
      await sleep(1500);
      all[lay] = await page.evaluate(() => {
        const g = window.__bk, T = window.__bkTHREE, RA = window.__bkRapier, cam = g.rig.cam, W = innerWidth, H = innerHeight, D2R = Math.PI / 180;
        cam.updateMatrixWorld(); const own = g.park.signs.find((m) => m.name === 'NMG_LETTERING');
        const P = (v) => { const n = v.clone().project(cam); return [(n.x + 1) / 2 * W, (1 - n.y) / 2 * H, n.z]; };
        const bb = (pts) => { const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]); return { x: Math.min(...xs), y: Math.min(...ys), w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) }; };
        const bones = (root, re) => { const pts = []; root.traverse((o) => { if (o.isBone && re.test(o.name)) { const p = new T.Vector3(); o.getWorldPosition(p); pts.push(P(p)); } }); return pts; };
        const pad = (q, k) => ({ x: q.x - k, y: q.y - k, w: q.w + 2 * k, h: q.h + 2 * k });
        const anmi = pad(bb(bones(g.visual.root, /(Head|Neck|Spine2|Spine1|Spine|Hips)$/)), 0.03 * H), pan = pad(bb(bones(g.npcs.get('la_pantera')[0].root, /(Head|Neck|Spine2|Spine1|Spine|Hips)$/)), 0.02 * H);
        const hp = g.manifest.get('nmg.heart').pos; const heart = pad(bb([[-0.9, 0], [0.9, 0], [-0.9, 0.95], [0.9, 0.95]].map(([dx, h]) => P(new T.Vector3(hp.x + dx * 0.84, h, hp.z + dx * 0.54)))), 0.01 * H);
        const ov = (p, q) => Math.max(0, Math.min(p.x + p.w, q.x + q.w) - Math.max(p.x, q.x)) * Math.max(0, Math.min(p.y + p.h, q.y + q.h) - Math.max(p.y, q.y));
        const ray = new RA.Ray({ x: 0, y: 0, z: 0 }, { x: 0, y: 1, z: 0 }); const ownHandles = new Set();
        g.world.forEachCollider((c) => { if (g.park.colliderName(c.handle) === 'signpost') { const t = c.translation(); if (own && Math.hypot(t.x - own.position.x, t.z - own.position.z) < 2) ownHandles.add(c.handle); } });
        const out = [];
        for (const r of [37.6, 38.5, 39.5, 40.5]) for (let th = 4; th <= 70; th += 2) for (const yo of [-30, -15, 0, 15, 30]) {
          const c = { x: r * Math.sin(th * D2R), z: -r * Math.cos(th * D2R) }, yaw = -th * D2R + yo * D2R;
          const ax = [Math.cos(yaw), -Math.sin(yaw)], nrm = [Math.sin(yaw), Math.cos(yaw)];
          const corners = [[-1.2, 1.25], [1.2, 1.25], [-1.2, 2.45], [1.2, 2.45]].map(([dx, y]) => new T.Vector3(c.x + ax[0] * dx, y, c.z + ax[1] * dx));
          const ctr = new T.Vector3(c.x, 1.85, c.z), sp = corners.map(P);
          if (sp.some((p) => p[2] >= 1 || p[0] < 0 || p[0] > W || p[1] < 0 || p[1] > H)) continue;
          const toCam = [cam.position.x - c.x, cam.position.z - c.z], L = Math.hypot(...toCam), cosA = (toCam[0] * nrm[0] + toCam[1] * nrm[1]) / L;
          if (cosA < 0.5) continue;
          let occ = 0; for (const v of [...corners, ctr]) { const d = v.clone().sub(cam.position), l = d.length(); d.divideScalar(l); ray.origin = { x: cam.position.x, y: cam.position.y, z: cam.position.z }; ray.dir = { x: d.x, y: d.y, z: d.z };
            const h = g.world.castRay(ray, l - 0.3, true, RA.QueryFilterFlags.EXCLUDE_SENSORS, undefined, undefined, (col) => !ownHandles.has(col.handle) && col.handle !== g.skater.collider.handle); if (h) occ++; }
          if (occ) continue;
          // holgura física: nada sólido (radiocasete, zócalo, farolas, lechos, palmeras…) a < 1 m de la huella del cartel
          { const q = { x: 0, y: Math.sin(yaw / 2), z: 0, w: Math.cos(yaw / 2) }; let hit = null;
            g.world.intersectionsWithShape({ x: c.x, y: 1.375, z: c.z }, q, new RA.Cuboid(1.2 + 1.0, 1.2, 0.1 + 1.0), (o) => { if (!o.isSensor() && !ownHandles.has(o.handle) && o.handle !== g.skater.collider.handle) { hit = g.park.colliderName(o.handle) || `h${o.handle}`; return false; } return true; });
            if (hit) continue; }
          const rect = bb(sp); if (ov(rect, anmi) > 0 || ov(rect, pan) > 0 || ov(rect, heart) > 0) continue;
          out.push({ r, th, yo, hPx: Math.round(rect.h), wPx: Math.round(rect.w), dist: +L.toFixed(1), angDeg: Math.round(Math.acos(cosA) / D2R) });
        }
        return out;
      });
      await page.close();
    }
    const key = (c) => `${c.r}|${c.th}|${c.yo}`, common = new Map();
    for (const [lay, list] of Object.entries(all)) for (const c of list) { const k = key(c); const e = common.get(k) ?? { r: c.r, th: c.th, yo: c.yo, per: {} }; e.per[lay] = c; common.set(k, e); }
    const ok = [...common.values()].filter((e) => Object.keys(e.per).length === 3).map((e) => ({ ...e, minRel: Math.min(e.per.escritorio.hPx / 800, e.per.vertical.hPx / 844, e.per.horizontal.hPx / 390) })).sort((a, b) => b.minRel - a.minRel);
    R.measure('candidatos_validos_3_layouts', ok.length); R.measure('mejores', ok.slice(0, 8));
    console.log(JSON.stringify(ok.slice(0, 5)));
    R.check(ok.length > 0, `hay posiciones en el paseo exterior legibles desde la llegada sin tapar personajes ni el corazón en los 3 layouts (${ok.length})`, 'emulation', ok.slice(0, 3));
  } finally { await b.close(); }
}, { timeoutMs: 600000 });
