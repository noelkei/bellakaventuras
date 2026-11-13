// NMG-01…05: NO ME GUILLO en la build. Geometría de las piezas contra sus fichas (collider = malla del Builder), holgura de
// La Pantera respecto al corazón/bordillo, lectura del corazón pintado desde la llegada, y rutas con TECLADO REAL:
// bank → plataforma → bajada por la escalera, y quarter → retorno. (Las cuatro patatas con retorno: potatoes.mjs; la charla:
// tutorial.mjs/ux03.mjs.)
//   node tools/v3/nmg.mjs → captures/v3/P6/NMG/nmg.json + *.jpg
import path from 'node:path';
import { Report, launch, openGame, clickStart, sleep } from './lib.mjs';

const R = new Report('P6/NMG', 'nmg', { method: 'consultas de colliders del Builder; teclado real con piloto relativo a cámara; fixtures: posición de salida de cada ruta' });
const browser = await launch();
const page = await openGame(browser, R, { viewport: { width: 1280, height: 800, deviceScaleFactor: 1 }, save: null });
const held = new Set();
async function keys(want) { for (const k of [...held]) if (!want.includes(k)) { await page.keyboard.up(k); held.delete(k); } for (const k of want) if (!held.has(k)) { await page.keyboard.down(k); held.add(k); } }
async function goTo(tg, { tol = 1.0, vmax = 4, maxMs = 12000 } = {}) {
  const t0 = Date.now(); let o = null; const tr = [];
  while (Date.now() - t0 < maxMs) {
    o = await page.evaluate(({ tg, vmax }) => {
      const g = window.__bk, p = g.skater.footPos, f = g.rig.forward, d = { x: tg.x - p.x, z: tg.z - p.z }, L = Math.hypot(d.x, d.z), right = { x: -f.z, z: f.x };
      const combos = [['KeyW'], ['KeyW', 'KeyA'], ['KeyW', 'KeyD'], ['KeyA'], ['KeyD']].map((k) => { const y = k.includes('KeyW') ? 1 : 0, x = (k.includes('KeyD') ? 1 : 0) - (k.includes('KeyA') ? 1 : 0); const n = Math.hypot(x, y) || 1; const w = { x: (f.x * y + right.x * x) / n, z: (f.z * y + right.z * x) / n }; return { k, dot: (w.x * d.x + w.z * d.z) / (L || 1) }; }).sort((a, b) => b.dot - a.dot);
      let k = combos[0].k.slice(); const v = g.skater.speed;
      if (v > vmax + 0.5) k = ['KeyS']; else if (combos[0].dot < 0.75) { k = k.filter((x) => x !== 'KeyW'); if (!k.length) k = ['KeyA']; if (v < 0.8) k.push('KeyW'); } else if (v > vmax) k = k.filter((x) => x !== 'KeyW');
      return { L, keys: k, y: p.y, loco: g.skater.loco, bails: g.skater.bails, respawns: g.skater.respawns };
    }, { tg, vmax });
    tr.push(+o.y.toFixed(2));
    if (o.L < tol) break;
    await keys(o.loco === 'bail' ? [] : o.keys); await sleep(30);
  }
  await keys([]); return { ...o, ys: tr };
}

try {
  await clickStart(page); await page.evaluate(async () => { document.getElementById('hint').hidden = true; await window.__bk.loadNpc('la_pantera'); });
  // 1. geometría: cajas de collider de cada pieza (en el marco de la pieza) frente a las fichas
  const geo = await page.evaluate(() => {
    const g = window.__bk, T = window.__bkTHREE, out = {};
    for (const { c, name } of g.park.b.colliders) {
      if (!/^nmg_(heart|heart_ledge|platform|step|bank)$/.test(name)) continue;
      const sh = c.shape, t = c.translation(), q = c.rotation();
      const he = sh.halfExtents ? { x: +(sh.halfExtents.x * 2).toFixed(3), y: +(sh.halfExtents.y * 2).toFixed(3), z: +(sh.halfExtents.z * 2).toFixed(3) } : null;
      let slope = null;
      if (!he && sh.vertices) { const v = sh.vertices, tris = sh.indices; let mx = 0; for (let i = 0; i < tris.length; i += 3) { const a = new T.Vector3(v[tris[i] * 3], v[tris[i] * 3 + 1], v[tris[i] * 3 + 2]), b = new T.Vector3(v[tris[i + 1] * 3], v[tris[i + 1] * 3 + 1], v[tris[i + 1] * 3 + 2]), cc = new T.Vector3(v[tris[i + 2] * 3], v[tris[i + 2] * 3 + 1], v[tris[i + 2] * 3 + 2]); const n = b.sub(a).cross(cc.sub(a)).normalize(); if (Math.abs(n.y) > 0.5 && Math.abs(n.y) < 0.999) mx = Math.max(mx, Math.acos(Math.abs(n.y)) * 180 / Math.PI); } slope = +mx.toFixed(1); }
      (out[name] ??= []).push({ size: he, top: he ? +(t.y + he.y / 2).toFixed(3) : null, slope, pos: [+t.x.toFixed(2), +t.z.toFixed(2)] });
    }
    const pa = g.manifest.get('npc.la_pantera').pos, hz = g.manifest.get('nmg.heart');
    return { out, panther: [pa.x, pa.z], heart: [hz.pos.x, hz.pos.z, hz.heading] };
  });
  R.data.geo = geo;
  const H = geo.out.nmg_heart?.[0], L = geo.out.nmg_heart_ledge?.[0], Pl = geo.out.nmg_platform?.[0], St = geo.out.nmg_step ?? [], Bk = geo.out.nmg_bank?.[0];
  const near = (a, b, e = 0.01) => Math.abs(a - b) <= e;
  R.check(H && near(H.size.x, 1.8) && near(H.size.y, 0.95) && near(H.size.z, 1.4) && L && near(L.size.x, 1.2) && near(L.size.y, 0.4) && near(L.size.z, 1.4), 'pieza 01: bloque 1,80×0,95×1,40 y bordillo 1,20×0,40×1,40 (collider = caja de la ficha, sin microescalones)', 'static', { H, L });
  R.check(Pl && near(Pl.size.x, 6) && near(Pl.size.y, 0.6) && near(Pl.size.z, 4.2) && St.length === 2 && St.map((s) => s.top).sort().join() === '0.2,0.4' && St.every((s) => near(s.size.z, 0.7)), 'pieza 02: plataforma 6×4,2×0,6 y dos peldaños intermedios de huella 0,7 (subidas de 0,2)', 'static', { Pl, St });
  R.check(Bk && Bk.slope > 10 && Bk.slope <= 15, `pieza 02: bank rodable con pendiente máxima ${Bk?.slope}° (ficha: media 13°, máx. 14,3°)`, 'static', Bk);
  // holgura de La Pantera: fuera del bloque y del bordillo (≥0,8 m del contorno) y a la derecha del corazón
  const clr = await page.evaluate(({ geo }) => {
    const [px, pz] = geo.panther, [hx, hz, yaw] = geo.heart, c = Math.cos(yaw), s = Math.sin(yaw);
    const dx = px - hx, dz = pz - hz, lx = dx * c - dz * s, lz = dx * s + dz * c;   // inversa de rot(): local x/z
    const box = (x0, x1, z0, z1) => Math.hypot(Math.max(x0 - lx, 0, lx - x1), Math.max(z0 - lz, 0, lz - z1));
    return { lx: +lx.toFixed(2), lz: +lz.toFixed(2), toHeart: +box(-0.9, 0.9, -0.7, 0.7).toFixed(2), toLedge: +box(-2.1, -0.9, -0.7, 0.7).toFixed(2) };
  }, { geo });
  R.check(clr.toHeart >= 0.8 && clr.toLedge >= 0.8 && clr.lx > 0.6 && clr.lz > 0.7, 'La Pantera delante y a la derecha del corazón, a ≥0,8 m del bloque y del bordillo (no se sube ni lo tapa entero)', 'static', clr);

  // 2. lectura desde la llegada: frente pintado visible (centro del corazón y sus cuatro esquinas en cuadro y sin sólido delante)
  await sleep(1500);
  const vis = await page.evaluate(() => {
    const g = window.__bk, T = window.__bkTHREE, Rr = window.__bkRapier, cam = g.rig.cam, a = g.manifest.get('nmg.heart'), yaw = a.heading;
    const loc = (lx, ly, lz) => new T.Vector3(a.pos.x + lx * Math.cos(yaw) + lz * Math.sin(yaw), ly, a.pos.z - lx * Math.sin(yaw) + lz * Math.cos(yaw));
    const pts = [loc(0, 0.5, 0.72), loc(-0.8, 0.1, 0.72), loc(0.8, 0.1, 0.72), loc(-0.8, 0.9, 0.72), loc(0.8, 0.9, 0.72)];
    const ray = new Rr.Ray({ x: 0, y: 0, z: 0 }, { x: 0, y: 1, z: 0 });
    const res = pts.map((w) => { const n = w.clone().project(cam), d = w.clone().sub(cam.position), L = d.length(); d.divideScalar(L); ray.origin = { x: cam.position.x, y: cam.position.y, z: cam.position.z }; ray.dir = { x: d.x, y: d.y, z: d.z }; const hit = g.world.castRay(ray, L - 0.15, true, Rr.QueryFilterFlags.EXCLUDE_SENSORS, undefined, g.skater.collider, undefined, (c) => !g.npcColliders.has(c.handle)); /* La Pantera delante del corazón es intencionada */ return { inFrame: Math.abs(n.x) < 0.95 && Math.abs(n.y) < 0.95 && n.z < 1, blocked: !!hit, ndc: [+n.x.toFixed(2), +n.y.toFixed(2)] }; });
    const facing = (() => { const f = new T.Vector3(Math.sin(yaw), 0, Math.cos(yaw)), to = cam.position.clone().sub(a.pos).setY(0).normalize(); return +f.dot(to).toFixed(2); })();
    return { res, facing };
  });
  await page.screenshot({ path: path.join(R.dir, 'nmg_llegada.jpg'), type: 'jpeg', quality: 80 });
  R.check(vis.res.every((r) => r.inFrame && !r.blocked) && vis.facing > 0.8, 'desde la cámara de llegada el frente pintado del corazón se ve entero y de cara', 'input', vis);

  // 3. ruta bank → plataforma → bajada por la escalera (teclado real)
  const pl = await page.evaluate(() => { const S = window.__bk.park.sector('no_me_guillo'), p = S.pl(33, 10), y = p.yaw; const loc = (lx, lz) => ({ x: p.x + lx * Math.cos(y) + lz * Math.sin(y), z: p.z - lx * Math.sin(y) + lz * Math.cos(y) }); return { start: loc(11, 0), bankTop: loc(2.4, 0), mid: loc(0, -1.2), down: loc(0, -7.5) }; });
  R.fixture('salida a 5,4 m del pie del bank de la plataforma, en la tabla', 'teleport');
  await page.evaluate(({ start, bankTop }) => { const g = window.__bk, T = window.__bkTHREE; g.skater.teleport(new T.Vector3(start.x, 0, start.z), Math.atan2(bankTop.x - start.x, bankTop.z - start.z), 'ride'); g.rig.snapBehind(g.skater); g.input.clear(); }, pl);
  await sleep(300);
  const r1 = await goTo(pl.bankTop, { tol: 0.9, vmax: 3.2 });
  const r2 = await goTo(pl.mid, { tol: 0.9, vmax: 2.5 });
  // bajada: de cara a la escalera y W mantenido (el piloto frenaba en el canto del escalón)
  await page.evaluate(({ down }) => { const g = window.__bk, p = g.skater.footPos; g.skater.heading = Math.atan2(down.x - p.x, down.z - p.z); g.rig.snapBehind(g.skater); }, pl);
  R.fixture('antes de bajar: rumbo hacia la escalera (sin mover la posición)', 'evaluate');
  await keys(['KeyW']); await sleep(2200); await keys([]); await sleep(800);
  const r3 = await page.evaluate(({ down }) => { const s = window.__bk.skater, p = s.footPos; return { y: p.y, L: Math.hypot(down.x - p.x, down.z - p.z), bails: s.bails, respawns: s.respawns }; }, pl);
  await page.screenshot({ path: path.join(R.dir, 'nmg_bajada_escalera.jpg'), type: 'jpeg', quality: 80 });
  R.check(Math.max(...r1.ys) > 0.55 && r2.y > 0.55 && r3.y < 0.1 && r3.bails === r1.bails && r3.respawns === 0, 'bank → plataforma (0,6 m) → bajada por la escalera rodando, sin caída ni reaparición', 'input', { r1: { y: r1.y, max: Math.max(...r1.ys) }, r2: r2.y, r3: { y: r3.y, L: r3.L }, bails: [r1.bails, r3.bails] });

  // 4. quarter → retorno: subir la transición, volver a bajar y salir rodando
  // salida con línea despejada hasta el pie de la transición (rayo a 0,3 m de altura), probando desplazamientos laterales
  const q = await page.evaluate(() => {
    const g = window.__bk, Rr = window.__bkRapier, S = g.park.sector('no_me_guillo'), p = S.pl(36.4, 4), y = p.yaw;
    const loc = (lx, lz) => ({ x: p.x + lx * Math.cos(y) + lz * Math.sin(y), z: p.z - lx * Math.sin(y) + lz * Math.cos(y) });
    for (const lx of [0, 1.5, -1.5, 2.5, -2.5]) {
      const a = loc(lx, -7), b = loc(lx, -0.3), L = Math.hypot(b.x - a.x, b.z - a.z);
      const hit = g.world.castRay(new Rr.Ray({ x: a.x, y: 0.3, z: a.z }, { x: (b.x - a.x) / L, y: 0, z: (b.z - a.z) / L }), L, true, Rr.QueryFilterFlags.EXCLUDE_SENSORS);
      if (!hit) return { start: a, up: loc(lx, 2.2), lx };
    }
    return { start: loc(0, -7), up: loc(0, 2.2), lx: null };
  });
  R.data.quarterStart = q;
  R.fixture('salida a 7 m del quarter de NMG, en la tabla y de cara', 'teleport');
  await page.evaluate(({ start, up }) => { const g = window.__bk, T = window.__bkTHREE; g.skater.teleport(new T.Vector3(start.x, 0, start.z), Math.atan2(up.x - start.x, up.z - start.z), 'ride'); g.rig.snapBehind(g.skater); g.input.clear(); }, q);
  await sleep(300);
  const b0 = await page.evaluate(() => window.__bk.skater.bails);
  // recto hacia el quarter con W (rumbo de salida ya alineado), soltar y dejar que vuelva rodando por la transición
  const ys = []; const iv = setInterval(async () => { try { ys.push(await page.evaluate(() => window.__bk.skater.footPos.y)); } catch { /* */ } }, 60);
  await goTo(q.up, { tol: 0.6, vmax: 4.5, maxMs: 6000 }); await keys([]); await sleep(3500);   // conducir a la transición y soltar
  clearInterval(iv);
  const fin = await page.evaluate((q) => { const s = window.__bk.skater, p = s.footPos; return { y: p.y, away: Math.hypot(p.x - q.up.x, p.z - q.up.z), bails: s.bails, respawns: s.respawns, loco: s.loco }; }, q);
  const yMax = Math.max(...ys);
  R.check(yMax > 0.6 && fin.y < yMax - 0.5 && fin.respawns === 0 && fin.bails === b0, 'quarter: sube la transición (>0,6 m) y vuelve a bajar rodando sin caída ni reaparición', 'input', { yMax, fin });
} catch (e) { R.data.errors.push('HARNESS ' + (e?.stack ?? e)); }
finally { await keys([]).catch(() => {}); await browser.close(); R.finish(); }
