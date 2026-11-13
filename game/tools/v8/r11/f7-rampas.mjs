// R11 · F7 · rampas (simulación determinista, 2 repeticiones). Eje de cada pieza por ajuste de plano a su superficie (rayos sobre sus
// colliders), salida 5 m antes del pie por el eje, W 0,4 s y soltar.
//  RAMP-02 / NMG-23  quarters (`nmg_quarter` y los 3 `quarter_bola`) de frente a 6–12 m/s: vuelven por la cara o, al menos, NO salen
//                    despedidos por detrás, y sin estrella.
//  RAMP-05  U de FASHION GIRL desde la zona plana hacia el deck a ≥ 10 m/s: 0 estrellas.
//  RAMP-04  cuñas rosas de FG sin ollie a 9 m/s: solo se ANOTA (plan R11 v3 §6, decisión de diseño pendiente).
//  No empeorar (verdes en la base): los quarters a 4 m/s suben y vuelven; la U de FG a ≤ 8 m/s sube y vuelve; los kickers (tut/trick)
//  y los banks de esquina siguen lanzando por detrás a 10 m/s como hoy; las cuñas a 7 m/s sin estrella.
//   node tools/v8/r11/f7-rampas.mjs --url pre --task R11 --label pre
import { Report, runTest } from '../lib.mjs';
import { launch, abrir, run } from './f5-lib.mjs';
const R = new Report('r11-f7-rampas');
// V10 (cambio de diseño aprobado): los 3 `quarter_bola`, los kickers `tut_kicker`/`trick_kicker` y los `bank` de las plazas de esquina
// desaparecen (parque exterior, NOSVAMOSDEAQUÍ y SECRETNOVIO). Sus equivalentes: quarters `bola_quarter` (2, exterior) y `sn_quarter` (curva
// del muro A), kicker `sn_kicker` (rampa B). Los `bola_bank` del exterior suben a una plataforma (no «lanzan por detrás»): no entran.
const NAMES = ['quarter_bola', 'nmg_quarter', 'tut_kicker', 'trick_kicker', 'bank', 'bola_quarter', 'sn_quarter', 'sn_kicker'];
// en cada paso: posición a lo largo del eje, estrella y contra qué
const SEG = (p, lat) => `{ const al = (s.footPos.x - ${p.c[0]}) * ${p.up[0]} + (s.footPos.z - ${p.c[1]}) * ${p.up[1]}; M.alMax = Math.max(M.alMax ?? -99, al); M.al = al; M.yMax = Math.max(M.yMax ?? -9, s.footPos.y);
  if (st === 24) key('KeyW', false);
  if (s.loco === 'impact' && !M.imp) { const RA = window.__bkRapier, c = s.collider.translation(), t = []; g.world.intersectionsWithShape(c, s.collider.rotation(), new RA.Capsule(s.capsuleHeight / 2 - 0.3, 0.42), (o) => { t.push(g.park.colliderName(o.handle) || '#'); return true; }, RA.QueryFilterFlags.EXCLUDE_SENSORS, undefined, s.collider); M.imp = [...new Set(t)].filter((q) => q !== 'ground').join(',') || '?'; } }`;
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
    const quarters = piezas.filter((p) => /quarter/.test(p.n)), kick = piezas.filter((p) => /kicker/.test(p.n)), banks = piezas.filter((p) => p.n === 'bank').slice(0, 2);
    R.measure('piezas', piezas.map((p) => ({ n: p.n, c: p.c.map((q) => +q.toFixed(1)), top: +p.top.toFixed(2) })));
    if (quarters.length < 4) R.invalid('no se encontraron los 4 quarters', piezas.map((p) => p.n));
    const go = (p, v, lat = 0, sec = 4) => { const toe = [p.c[0] + p.up[0] * p.toe - p.up[1] * (p.lat + lat), p.c[1] + p.up[1] * p.toe + p.up[0] * (p.lat + lat)];
      const st = [toe[0] - p.up[0] * 5, null, toe[1] - p.up[1] * 5];
      return page.evaluate((st) => window.__R11.ray(st[0], st[2], 4, 8)?.y, st).then((y) => run(page, { p: [st[0], (y ?? 0) + 0.02, st[2]], h: Math.atan2(p.up[0], p.up[1]), v, sec, pre: "key('KeyW', true)", script: SEG(p) })); };
    for (let k = 1; k <= 2; k++) {
      // ---------------------------------------------------------------- RAMP-02 / NMG-23
      // plan R11 v3 (§0b F7 y §6): en F7 se arregla la ESTRELLA (la cara inclinada de la transición no es «pared»); que el quarter devuelva
      // en vez de lanzar por detrás exige cambiar su perfil (labio a 60°) o una asistencia de vert: decisión del usuario (§6), se anota aparte
      const lanza = [];
      for (const p of quarters) for (const v of [6, 8, 10, 11, 12, 13]) {
        const r = await go(p, v); const detras = r.alMax > p.back + 0.3 && r.al > p.back;
        if (detras) lanza.push(`${p.n}@${v}`);
        R.check(!r.imp, `#${k} RAMP-02/NMG-23 ${p.n} (${p.c.map((q) => q.toFixed(0)).join(',')}) ${v} m/s: sin estrella contra la transición (${r.imp ? 'estrella contra ' + r.imp : 'no'}; ${detras ? 'sale por detrás' : 'vuelve'})`, 'input', { alMax: +r.alMax.toFixed(2), back: +p.back.toFixed(2), end: r.end });
      }
      R.note(`#${k} §6 (pendiente de decisión del usuario): quarters que lanzan por detrás en vez de devolver: ${lanza.length}/${quarters.length * 6} (${lanza.join(' ')})`);
      for (const p of quarters) { const r = await go(p, 4);
        // V10: en las piezas nuevas (sin «base» con la que comparar) «sube» es lo de ext-quarter-detras: al menos la mitad de lo que permite la
        // energía a 4 m/s (v²/2g, gravedad del juego 21 m/s²) o de la cima si es más baja; en las de V9 sigue la media cima de siempre
        const nueva = /^(bola_|sn_)/.test(p.n), hMin = nueva ? 0.5 * Math.min(p.top, 4 * 4 / (2 * 21)) : p.top * 0.5;
        R.check(r.yMax > hMin && r.al < p.back && !r.imp, `#${k} no empeorar ${p.n} (${p.c.map((q) => q.toFixed(0)).join(',')}) 4 m/s: sube por la cara y vuelve (altura máx. ${r.yMax.toFixed(2)})`, 'input', {}); }
      // ---------------------------------------------------------------- no empeorar: kickers y banks siguen lanzando
      for (const p of [...kick, ...banks]) { const r = await go(p, 10);
        R.check(r.alMax > p.back + 2, `#${k} no empeorar ${p.n} (${p.c.map((q) => q.toFixed(0)).join(',')}) 10 m/s: sigue lanzando por detrás como hoy (llega a ${(r.alMax - p.back).toFixed(1)} m tras el borde)`, 'input', {}); }
      // ---------------------------------------------------------------- RAMP-05 (U de FG)
      { const G = await page.evaluate(() => { const m = window.__bk.manifest, c = m.get('fg.u.center'), l = m.get('fg.landing'); return { c: [c.pos.x, c.pos.y, c.pos.z], l: [l.pos.x, l.pos.y, l.pos.z] }; });
        const a0 = [G.l[0] - G.c[0], G.l[2] - G.c[2]], L = Math.hypot(...a0), ax = [a0[0] / L, a0[1] / L], lt = [-ax[1], ax[0]];
        for (const [v, lat] of [[10, 0], [12, -1.2], [14, 1.2], [16, 0], [6, 0], [8, 1.2]]) {
          const p = [G.c[0] + ax[0] * (L + 1.2) + lt[0] * lat, G.l[1] + 0.02, G.c[2] + ax[1] * (L + 1.2) + lt[1] * lat];
          const r = await run(page, { p, h: Math.atan2(-ax[0], -ax[1]), v, sec: 4, pre: "key('KeyW', true)", script: `if (st === 24) key('KeyW', false); if (s.loco === 'impact' && !M.imp) M.imp = 1; M.ymax = Math.max(M.ymax ?? -9, s.footPos.y);` });
          if (v >= 10) R.check(!r.imp, `#${k} RAMP-05 U de FG ${v} m/s carril ${lat}: hacia el deck sin estrella`, 'input', { end: r.end, ymax: r.ymax });
          else R.check(!r.imp && r.ymax > 1.0, `#${k} no empeorar U de FG ${v} m/s: sube la pared del deck y vuelve sin estrella (altura máx. ${r.ymax.toFixed(2)})`, 'input', { end: r.end });
        } }
      // ---------------------------------------------------------------- RAMP-04 (cuñas de FG, sin ollie)
      { const W = await page.evaluate(() => { const g = window.__bk, o = []; g.world.forEachCollider((c) => { if (g.park.colliderName(c.handle) === 'fg_wedge') { const v = c.shape.vertices, t = c.translation(); let sx = 0, sz = 0, n = 0; for (let i = 0; i < v.length; i += 3) { sx += v[i] + t.x; sz += v[i + 2] + t.z; n++; } o.push([sx / n, sz / n]); } }); return o; });
        if (W.length < 2) R.invalid('no se encontraron las cuñas de FG', W);
        else { const mid = [(W[0][0] + W[1][0]) / 2, (W[0][1] + W[1][1]) / 2], a0 = [W[1][0] - W[0][0], W[1][1] - W[0][1]], L = Math.hypot(...a0), ax = [a0[0] / L, a0[1] / L];
          for (const v of [9, 7]) { const p = [mid[0] - ax[0] * 7, 0.02, mid[1] - ax[1] * 7];
            const r = await run(page, { p, h: Math.atan2(ax[0], ax[1]), v, sec: 3, pre: "key('KeyW', true)", script: `if (st === 24) key('KeyW', false); if (s.loco === 'impact' && !M.imp) M.imp = 1; M.al = (s.footPos.x - ${mid[0]}) * ${ax[0]} + (s.footPos.z - ${mid[1]}) * ${ax[1]}; M.alMax = Math.max(M.alMax ?? -99, M.al);` });
            if (v === 7) R.check(!r.imp, `#${k} no empeorar cuñas de FG 7 m/s: sin estrella (como en la base)`, 'input', { end: r.end });
            else R.note(`#${k} §6 RAMP-04 (pendiente de decisión: bisel de la arista o ignorar contactos junto a ella) cuñas de FG ${v} m/s sin ollie: ${r.imp ? 'ESTRELLA' : 'sin estrella'}`);
          } } }
    }
  } finally { await b.close(); }
}, { timeoutMs: 600000 });
