// R13 · punto 1 · flips al salir de una rampa con la dirección MANTENIDA desde la carrerilla (decisión v3: «backflip y frontflip libres
// con carrerilla»). La máscara de ejes de R11 (MOV-01: W mantenida para empujar = neutra) convertía W + SALTO en el aire de un quarter
// en kickflip. Ahora la máscara solo vale para el ollie en llano (MOV-01 sigue en `r11/f8-trucos`).
//  A  quarter_bola ×3, nmg_quarter y trick_kicker: W mantenida desde 6 m antes + SALTO en el aire → el truco pedido es frontflip.
//  B  mismas piezas con S pulsada en el aire + SALTO → backflip (no empeorar).
// Los bank (pirámides) no entran: se sube, se cruza la meseta y se cae por la bajada (no es un despegue de rampa; 0,2 s de aire).
// «Pedido» = primer `trick:` o `trick-denied:` del registro (un flip que no cabe en el aire de un kicker bajo se deniega: cuenta igual).
//   node tools/v8/r13/f17-rampa-flips.mjs --url pre13 --task R13 --label base
import { Report, runTest } from '../lib.mjs';
import { launch, abrir, run } from '../r11/f5-lib.mjs';
const R = new Report('r13-f17-rampa-flips');
// V10 (cambio de diseño aprobado): `trick_kicker` y los 3 `quarter_bola` desaparecen con el exterior y SECRETNOVIO; sus equivalentes
// son `sn_kicker` (rampa B), los 2 `bola_quarter` del exterior y `sn_quarter` (curva del muro A)
const NAMES = ['trick_kicker', 'quarter_bola', 'nmg_quarter', 'sn_kicker', 'bola_quarter', 'sn_quarter'];
const PEDIDO = (r) => (r.ev.find((e) => /^trick(-denied)?:/.test(e)) ?? 'nada').split(':')[1] ?? 'nada';
await runTest(R, async () => {
  const b = await launch();
  try {
    const page = await abrir(b, R);
    // piezas: agrupa los colisores por nombre y proximidad, ajusta un plano a la superficie y toma la dirección de subida
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
        out.push({ n: p.n, c: [mx_, mz_], up, toe: Math.min(...pts.map(al)), lat: (Math.min(...pts.map(pe)) + Math.max(...pts.map(pe))) / 2 }); }
      return out; }, NAMES);
    R.check((piezas.filter((p) => p.n === 'quarter_bola').length >= 3 || (piezas.filter((p) => p.n === 'bola_quarter').length >= 2 && piezas.some((p) => p.n === 'sn_quarter'))) && piezas.some((p) => p.n === 'nmg_quarter'), `piezas encontradas: ${piezas.map((p) => p.n).join(', ')}`, 'fixture', { piezas });
    // en el aire (tras 0,15 s), dirección + SALTO durante 4 pasos
    const AIRE = (dirs) => `if (!s.grounded && s.loco === 'ride' && s.airTime > 0.15 && !M.hecho) { M.hecho = st; ${dirs.map((d) => `key('${d}', true);`).join(' ')} key('Space', true); }
      if (M.hecho && st === M.hecho + 4) { key('Space', false); }`;
    for (let k = 1; k <= 2; k++) {
      for (const p of piezas) {
        const tag = `${p.n}@${p.c.map((q) => q.toFixed(0)).join(',')}`;
        const toe = [p.c[0] + p.up[0] * p.toe - p.up[1] * p.lat, p.c[1] + p.up[1] * p.toe + p.up[0] * p.lat], st = [toe[0] - p.up[0] * 6, toe[1] - p.up[1] * 6];
        const y = await page.evaluate((st) => window.__R11.ray(st[0], st[1], 4, 8)?.y, st);
        const o = { p: [st[0], (y ?? 0) + 0.02, st[1]], h: Math.atan2(p.up[0], p.up[1]), v: 9, sec: 3.5 };
        { const r = await run(page, { ...o, pre: "key('KeyW', true)", script: AIRE([]) });
          if (!r.hecho) { R.note(`#${k} ${tag}: esta aproximación no despega (sin aire de 0,15 s): pieza sin caso`); continue; }
          R.check(PEDIDO(r) === 'frontflip', `#${k} A ${tag}: W mantenida desde la carrerilla + SALTO en el aire → frontflip (pedido: ${PEDIDO(r)})`, 'input', { ev: r.ev.filter((e) => /trick|takeoff|leave/.test(e)), hecho: r.hecho }); }
        { const r = await run(page, { ...o, pre: "key('KeyW', true)", script: `if (!s.grounded && s.airTime > 0.1 && !M.suelta) { M.suelta = 1; key('KeyW', false); }` + AIRE(['KeyS']) + "if (M.hecho && st === M.hecho + 4) key('KeyS', false);" });
          R.check(PEDIDO(r) === 'backflip', `#${k} B ${tag}: S + SALTO en el aire → backflip (pedido: ${PEDIDO(r)})`, 'input', { ev: r.ev.filter((e) => /trick|takeoff|leave/.test(e)), hecho: r.hecho }); }
      }
    }
  } finally { await b.close(); }
}, { timeoutMs: 600000 });
