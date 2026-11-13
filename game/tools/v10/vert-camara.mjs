// V10 IT2 · vert-camara · D-IT2-03: en las transiciones empinadas nuevas (`bola_quarter` ×2, `sn_quarter`, `sn_kicker`) la marcha pasa a
// vertical («vert») o a salida por el labio («kick»). Para cada pieza, de frente a 8, 10 y 13 m/s (eje por ajuste de plano a su superficie,
// método de r11/f7-rampas; salida 5 m antes del pie, W 0,4 s y soltar), durante 3 s:
//  · hay vuelo «vert/kick» a ≥ 8 m/s (evento `vert:`), sin estrella ni caída;
//  · la cámara nunca está dentro de un sólido (sin sensores, NPC, ignorados por la cámara ni piezas finas);
//  · ANMI no queda tapada: el rayo cámara→pecho no corta geometría sólida en más de 6 pasos seguidos (0,1 s).
// Uso: node tools/v10/vert-camara.mjs --url v10 --task V10-IT2 --label final
import { Report, runTest } from '../v8/lib.mjs';
import { launch, abrir, run } from '../v8/r11/f5-lib.mjs';
const R = new Report('vert-camara');
const NAMES = ['bola_quarter', 'sn_quarter', 'sn_kicker'];
const CAM = `{ const RA = window.__bkRapier, c = g.rig.cam.position, ok = (h) => { const q = g.world.getCollider(h); return q && !q.isSensor() && !g.npcColliders.has(h) && !g.park.cameraIgnore.has(h) && !g.park.b.thin.has(h) && h !== s.collider.handle; };
  let dentro = null; g.world.intersectionsWithPoint({ x: c.x, y: c.y, z: c.z }, (col) => { if (ok(col.handle)) { dentro = g.park.colliderName(col.handle) ?? '#'; return false; } return true; });
  if (dentro) { M.dentro = (M.dentro || 0) + 1; M.dn ??= dentro; }
  const p = { x: s.footPos.x, y: s.footPos.y + 1.1, z: s.footPos.z }, d = { x: p.x - c.x, y: p.y - c.y, z: p.z - c.z }, L = Math.hypot(d.x, d.y, d.z);
  const h = L > 0.3 ? g.world.castRay(new RA.Ray({ x: c.x, y: c.y, z: c.z }, { x: d.x / L, y: d.y / L, z: d.z / L }), L - 0.25, true, RA.QueryFilterFlags.EXCLUDE_SENSORS, undefined, s.collider, undefined, (q) => ok(q.handle)) : null;
  M.tap = h ? (M.tap || 0) + 1 : 0; M.tapMax = Math.max(M.tapMax || 0, M.tap); if (h) M.tn ??= g.park.colliderName(h.collider.handle);
  if (s.loco === 'impact') M.imp = 1; if (s.loco === 'bail') M.bail = 1; }`;
await runTest(R, async () => {
  const b = await launch();
  try {
    const page = await abrir(b, R);
    const piezas = await page.evaluate((NAMES) => {
      const g = window.__bk, RA = window.__bkRapier, raw = [];
      g.world.forEachCollider((c) => { const n = g.park.colliderName(c.handle); if (!NAMES.includes(n) || c.isSensor() || !c.isEnabled()) return;
        let mn = [1e9, 1e9, 1e9], mx = [-1e9, -1e9, -1e9]; const v = c.shape.vertices, t = c.translation();
        if (v) for (let i = 0; i < v.length; i += 3) { const p = [v[i] + t.x, v[i + 1] + t.y, v[i + 2] + t.z]; for (let k = 0; k < 3; k++) { mn[k] = Math.min(mn[k], p[k]); mx[k] = Math.max(mx[k], p[k]); } }
        else { const h = c.shape.halfExtents; if (!h) return; mn = [t.x - h.x, t.y - h.y, t.z - h.z]; mx = [t.x + h.x, t.y + h.y, t.z + h.z]; }
        raw.push({ n, handles: [c.handle], mn, mx }); });
      const cl = []; for (const r of raw) { const o = cl.find((q) => q.n === r.n && r.mn[0] < q.mx[0] + 0.1 && r.mx[0] > q.mn[0] - 0.1 && r.mn[2] < q.mx[2] + 0.1 && r.mx[2] > q.mn[2] - 0.1);
        if (o) { o.handles.push(...r.handles); for (let k = 0; k < 3; k++) { o.mn[k] = Math.min(o.mn[k], r.mn[k]); o.mx[k] = Math.max(o.mx[k], r.mx[k]); } } else cl.push(r); }
      const out = [];
      for (const p of cl) { const H = new Set(p.handles), pts = [];
        for (let x = p.mn[0]; x <= p.mx[0]; x += 0.2) for (let z = p.mn[2]; z <= p.mx[2]; z += 0.2) { const h = g.world.castRay(new RA.Ray({ x, y: p.mx[1] + 2, z }, { x: 0, y: -1, z: 0 }), p.mx[1] + 4, true, RA.QueryFilterFlags.EXCLUDE_SENSORS); if (h && H.has(h.collider.handle)) pts.push([x, p.mx[1] + 2 - h.timeOfImpact, z]); }
        if (pts.length < 6) continue;
        const mx_ = pts.reduce((a, q) => a + q[0], 0) / pts.length, mz_ = pts.reduce((a, q) => a + q[2], 0) / pts.length, my_ = pts.reduce((a, q) => a + q[1], 0) / pts.length;
        let sxx = 0, sxz = 0, szz = 0, sxy = 0, szy = 0; for (const [x, y, z] of pts) { const dx = x - mx_, dz = z - mz_, dy = y - my_; sxx += dx * dx; sxz += dx * dz; szz += dz * dz; sxy += dx * dy; szy += dz * dy; }
        const det = sxx * szz - sxz * sxz, gx = (sxy * szz - szy * sxz) / det, gz = (szy * sxx - sxy * sxz) / det, gl = Math.hypot(gx, gz) || 1, up = [gx / gl, gz / gl];
        const al = (q) => (q[0] - mx_) * up[0] + (q[2] - mz_) * up[1], pe = (q) => -(q[0] - mx_) * up[1] + (q[2] - mz_) * up[0];
        out.push({ n: p.n, c: [mx_, mz_], up, toe: Math.min(...pts.map(al)), back: Math.max(...pts.map(al)), lat: (Math.min(...pts.map(pe)) + Math.max(...pts.map(pe))) / 2, top: Math.max(...pts.map((q) => q[1])) }); }
      return out; }, NAMES);
    R.measure('piezas', piezas.map((p) => ({ n: p.n, c: p.c.map((q) => +q.toFixed(1)) })));
    R.check(piezas.filter((p) => p.n === 'bola_quarter').length >= 2 && piezas.some((p) => p.n === 'sn_quarter') && piezas.some((p) => p.n === 'sn_kicker'), `piezas encontradas: ${piezas.map((p) => p.n).join(', ')}`, 'fixture', piezas.map((p) => p.n));
    for (const p of piezas) for (const v of [8, 10, 13]) {
      const toe = [p.c[0] + p.up[0] * p.toe - p.up[1] * p.lat, p.c[1] + p.up[1] * p.toe + p.up[0] * p.lat], st = [toe[0] - p.up[0] * 5, toe[1] - p.up[1] * 5];
      const y = await page.evaluate((st) => window.__R11.ray(st[0], st[1], 4, 8)?.y, st);
      const r = await run(page, { p: [st[0], (y ?? 0) + 0.02, st[1]], h: Math.atan2(p.up[0], p.up[1]), v, sec: 3, pre: "key('KeyW', true)", script: "if (st === 24) key('KeyW', false); " + CAM });
      const tag = `${p.n} (${p.c.map((q) => q.toFixed(0)).join(',')}) ${v} m/s`, vert = r.ev.some((e) => /^vert:/.test(e));
      R.check(vert && !r.imp && !r.bail, `${tag}: vuelo vert/kick sin estrella ni caída (${r.ev.filter((e) => /vert|bump|bail/.test(e)).join(',') || 'sin eventos'})`, 'input', { ev: r.ev.slice(0, 6), end: r.end });
      R.check(!r.dentro && (r.tapMax ?? 0) <= 6, `${tag}: cámara fuera de sólidos (${r.dentro ?? 0} pasos dentro${r.dn ? ' de ' + r.dn : ''}) y ANMI sin tapar más de 0,1 s (racha ${r.tapMax ?? 0} pasos${r.tn ? ', ' + r.tn : ''})`, 'vision', { end: r.end });
    }
  } finally { await b.close(); }
}, { timeoutMs: 600000 });
