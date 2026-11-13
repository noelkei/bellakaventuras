// V10 R2 · E-30 (RAMP-02/NMG-23 · encargo: «el defecto de lanzar por detrás» de los 3 `quarter_bola` de las esquinas). RAMP-02 (AUD-JUG,
// RAMPAS/HALLAZGOS) es: de FRENTE a 8–16 m/s el quarter no devuelve por la cara y ANMI SALE POR DETRÁS. En V10 los `quarter_bola`
// desaparecen con el perímetro antiguo (sustitución del dossier) y los quarters nuevos del exterior (SE-M01/M02, perfil nativo, `bola_quarter`)
// no deben tener el defecto. Método de R11 (`r11/f7-rampas.mjs`, simulación determinista): eje de cada quarter por ajuste de plano a su
// superficie (rayos sobre sus colliders), salida 5 m antes del pie, W 0,4 s y soltar, 4 s. Exigencias:
//  · a 6, 8, 10, 11, 12 y 13 m/s: sin estrella contra la transición y NO sale por detrás (más allá del borde trasero + 0,3 m) — el criterio
//    que R11 dejó pendiente para los `quarter_bola` (rojo en V9) y que el dossier resuelve con piezas nuevas;
//  · a 4 m/s: sube por la cara (≥ media altura) y vuelve, sin estrella.
// (R2a, copia en V10/backups/pruebas: la primera versión aproximaba por la cara VERTICAL trasera; eso solo mide el choque arcade que da
// cualquier muro a 10 m/s, en V9 y en V10 por igual, y no es RAMP-02.)
// Uso: node tools/v10/ext-quarter-detras.mjs --url v9|v10 --task V10-R2 --label base|final
import { Report, runTest } from '../v8/lib.mjs';
import { launch, abrir, run } from '../v8/r11/f5-lib.mjs';
const R = new Report('ext-quarter-detras');
const NAMES = ['quarter_bola', 'bola_quarter'];
const SEG = (p) => `{ const al = (s.footPos.x - ${p.c[0]}) * ${p.up[0]} + (s.footPos.z - ${p.c[1]}) * ${p.up[1]}; M.alMax = Math.max(M.alMax ?? -99, al); M.al = al; M.yMax = Math.max(M.yMax ?? -9, s.footPos.y);
  if (st === 24) key('KeyW', false);
  if (s.loco === 'impact' && !M.imp) M.imp = 1; }`;
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
        raw.push({ n, id: g.park.bolaPartOf?.get(c.handle) ?? null, handles: [c.handle], mn, mx }); });
      const cl = []; for (const r of raw) { const o = cl.find((q) => q.n === r.n && (r.id ? q.id === r.id : r.mn[0] < q.mx[0] + 0.1 && r.mx[0] > q.mn[0] - 0.1 && r.mn[2] < q.mx[2] + 0.1 && r.mx[2] > q.mn[2] - 0.1));
        if (o) { o.handles.push(...r.handles); for (let k = 0; k < 3; k++) { o.mn[k] = Math.min(o.mn[k], r.mn[k]); o.mx[k] = Math.max(o.mx[k], r.mx[k]); } } else cl.push(r); }
      const out = [];
      for (const p of cl) { const H = new Set(p.handles), pts = [];
        for (let x = p.mn[0]; x <= p.mx[0]; x += 0.2) for (let z = p.mn[2]; z <= p.mx[2]; z += 0.2) { const h = g.world.castRay(new RA.Ray({ x, y: p.mx[1] + 2, z }, { x: 0, y: -1, z: 0 }), p.mx[1] + 4, true, RA.QueryFilterFlags.EXCLUDE_SENSORS); if (h && H.has(h.collider.handle)) pts.push([x, p.mx[1] + 2 - h.timeOfImpact, z]); }
        if (pts.length < 6) continue;
        // eje: plano ajustado a la CARA (puntos por debajo del 85 % de la cima: sin la plataforma de arriba)
        const top = Math.max(...pts.map((q) => q[1])), face = pts.filter((q) => q[1] > 0.05 && q[1] < top * 0.85), F = face.length >= 6 ? face : pts;
        const mx_ = F.reduce((a, q) => a + q[0], 0) / F.length, mz_ = F.reduce((a, q) => a + q[2], 0) / F.length, my_ = F.reduce((a, q) => a + q[1], 0) / F.length;
        let sxx = 0, sxz = 0, szz = 0, sxy = 0, szy = 0; for (const [x, y, z] of F) { const dx = x - mx_, dz = z - mz_, dy = y - my_; sxx += dx * dx; sxz += dx * dz; szz += dz * dz; sxy += dx * dy; szy += dz * dy; }
        const det = sxx * szz - sxz * sxz, gx = (sxy * szz - szy * sxz) / det, gz = (szy * sxx - sxy * sxz) / det, gl = Math.hypot(gx, gz) || 1, up = [gx / gl, gz / gl];
        const al = (q) => (q[0] - mx_) * up[0] + (q[2] - mz_) * up[1], pe = (q) => -(q[0] - mx_) * up[1] + (q[2] - mz_) * up[0];
        out.push({ n: p.n, id: p.id, c: [mx_, mz_], up, toe: Math.min(...pts.map(al)), back: Math.max(...pts.map(al)), lat: (Math.min(...F.map(pe)) + Math.max(...F.map(pe))) / 2, top }); }
      return out; }, NAMES);
    R.measure('quarters', piezas.map((p) => ({ n: p.n, id: p.id, c: p.c.map((q) => +q.toFixed(2)), up: p.up.map((q) => +q.toFixed(3)), top: +p.top.toFixed(2), back: +p.back.toFixed(2) })));
    if (!R.nonEmpty(piezas, 'quarters del exterior (quarter_bola o bola_quarter)')) return;
    const go = (p, v, sec = 4) => { const toe = [p.c[0] + p.up[0] * p.toe - p.up[1] * p.lat, p.c[1] + p.up[1] * p.toe + p.up[0] * p.lat];
      const st = [toe[0] - p.up[0] * 5, null, toe[1] - p.up[1] * 5];
      return page.evaluate((st) => window.__R11.ray(st[0], st[2], 4, 8)?.y, st).then((y) => run(page, { p: [st[0], (y ?? 0) + 0.02, st[2]], h: Math.atan2(p.up[0], p.up[1]), v, sec, pre: "key('KeyW', true)", script: SEG(p) })); };
    const res = [];
    for (const p of piezas) {
      const tag = `${p.n}${p.id ? ' ' + p.id : ''} (${p.c.map((q) => q.toFixed(0)).join(',')})`;
      for (const v of [6, 8, 10, 11, 12, 13]) { const r = await go(p, v), detras = r.alMax > p.back + 0.3 && r.al > p.back;
        res.push({ q: tag, v, detras, imp: !!r.imp, alMax: +r.alMax.toFixed(2), back: +p.back.toFixed(2), yMax: +r.yMax.toFixed(2) }); }
      const r4 = await go(p, 4);
      // «sube»: al menos la mitad de lo que permite la energía a 4 m/s (v²/2g con la gravedad del juego, 21 m/s²: 0,38 m) o de la cima si es
      // más baja. El umbral de R11 (media cima) era para los quarter_bola de 1,3 m; con 1,35–1,65 m es físicamente inalcanzable a 4 m/s
      const hMin = 0.5 * Math.min(p.top, 4 * 4 / (2 * 21));
      R.check(r4.yMax > hMin && r4.al < p.back && !r4.imp, `${tag} a 4 m/s: sube por la cara (altura máx. ${r4.yMax.toFixed(2)} ≥ ${hMin.toFixed(2)}) y vuelve, sin estrella`, 'input', { alMax: r4.alMax, back: p.back, top: p.top });
    }
    R.measure('frente', res);
    const imp = res.filter((x) => x.imp), out = res.filter((x) => x.detras);
    R.check(imp.length === 0, `quarters de frente a 6–13 m/s: sin estrella contra la transición (${res.length} intentos; estrella ${imp.length})`, 'input', imp.slice(0, 8));
    R.check(out.length === 0, `quarters de frente a 6–13 m/s: no salen despedidos por detrás (RAMP-02; ${res.length} intentos; por detrás ${out.length})`, 'input', out.slice(0, 8));
  } finally { await b.close(); }
}, { timeoutMs: 500000 });
