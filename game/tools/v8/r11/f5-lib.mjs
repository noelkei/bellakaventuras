// R11 · utilidades de las pruebas de física (F5 vaso YY, F6 apoyo falso, F7 rampas/impactos, F8 trucos). Simulación determinista
// con el paso fijo del juego (`g.autoMode = true; g.simulate`) y teclas reales despachadas en el paso exacto (keydown/keyup en window).
// Solo lee el estado del juego; la colocación inicial (teletransporte + velocidad) es fixture.
import { launch, openGame, clickStart, sleep, SAVE_20 } from './lib-r11.mjs';
export { launch, openGame, clickStart, sleep, SAVE_20 };

/** Abre la build, arranca, oculta avisos flotantes, apaga coches (los tests que los necesitan los encienden) e instala el corredor. */
export async function abrir(b, R, { save = SAVE_20, cars = false } = {}) {
  const page = await openGame(b, R, { save }); await clickStart(page); await sleep(600);
  await page.evaluate(INSTALAR_FN);
  await page.evaluate((cars) => { const g = window.__bk; g.cars.setActive(cars); g.autoMode = true; for (const id of ['hint', 'toast']) { const e = document.getElementById(id); if (e) e.hidden = true; } }, cars);
  return page;
}

// Código que se inyecta en la página: `window.__R11.run(o)` coloca, simula `o.sec` s y ejecuta `o.script` (cuerpo de función) en cada
// paso con (st, s, g, pool, key, M, R); devuelve M + resumen.
const INSTALAR_FN = () => {
  const g = window.__bk, T = window.__bkTHREE, RA = window.__bkRapier;
  const key = (code, down, extra = {}) => window.dispatchEvent(new KeyboardEvent(down ? 'keydown' : 'keyup', { code, key: code === 'Space' ? ' ' : code, bubbles: true, ...extra }));
  const ray = (x, z, y0 = 9, len = 14, excl = true) => { const h = g.world.castRayAndGetNormal(new RA.Ray({ x, y: y0, z }, { x: 0, y: -1, z: 0 }), len, true, RA.QueryFilterFlags.EXCLUDE_SENSORS, undefined, excl ? g.skater.collider : undefined); return h ? { y: y0 - h.timeOfImpact, ny: h.normal.y, name: g.park.colliderName(h.collider.handle) ?? `h${h.collider.handle}`, handle: h.collider.handle } : null; };
  const angd = (a, b) => { let d = a - b; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI; return d; };
  window.__R11 = {
    key, ray, angd,
    releaseAll() { for (const c of ['KeyW', 'KeyA', 'KeyS', 'KeyD', 'Space', 'KeyF', 'KeyQ', 'KeyC', 'KeyE', 'ShiftLeft']) key(c, false); g.input.fakePad = null; g.input.clear(); },
    async run(o) {
      const s = g.skater, pool = s.pool; g.autoMode = true; this.releaseAll();
      for (const a of g.activities) if (a.busy) a.cancel?.();
      s.teleport(new T.Vector3(o.p[0], o.p[1], o.p[2]), o.h, o.loco ?? 'ride');
      const vd = o.vdir ?? o.h, v = o.v ?? 0; s.vel.set(Math.sin(vd) * v, 0, Math.cos(vd) * v);
      if (o.vLong !== undefined) s.vLong = o.vLong; else s.vLong = v;
      g.rig.snapBehind(s); s.events.length = 0; if (pool) pool.log.length = 0; { const t = document.getElementById('toast'); if (t) { t.hidden = true; t.textContent = ''; } }
      const p0 = pool ? { hooks: pool.hooks, airs: pool.airs, rehooks: pool.rehooks, exits: pool.exits, carves: pool.carves, airOuts: pool.airOuts, contains: pool.contains } : {};
      const b0 = s.bails, r0 = s.respawns, tl0 = s.trickLog.length, il0 = s.impactLog.length, bd0 = s.boardDenied, sl0 = g.audio.sfxLog.length;
      const M = { st: 0, maxDh: 0, hs: [] }; let st = 0, prevH = s.heading;
      const fn = o.script ? new Function('st', 's', 'g', 'pool', 'key', 'M', 'R', o.script) : null;
      if (o.pre) new Function('s', 'g', 'pool', 'key', 'M', 'R', o.pre)(s, g, pool, key, M, this);
      await g.simulate(o.sec, () => { st++; M.st = st; fn?.(st, s, g, pool, key, M, this);
        const dh = Math.abs(angd(s.heading, prevH)); prevH = s.heading; if (st > 2) M.maxDh = Math.max(M.maxDh, dh); });
      this.releaseAll(); await g.simulate(1 / 60);
      const f = s.footPos;
      return { ...M, end: [f.x, f.y, f.z].map((q) => +q.toFixed(3)), loco: s.loco, grounded: s.grounded,
        pool: pool ? Object.fromEntries(Object.entries(p0).map(([k, q]) => [k, pool[k] - q])) : null, log: pool ? pool.log.map((e) => e.e).filter((x) => !/contiene/.test(x)) : [],
        ev: s.events.map((e) => e.e), bails: s.bails - b0, respawns: s.respawns - r0, tricks: s.trickLog.slice(tl0), impacts: s.impactLog.slice(il0), boardDenied: s.boardDenied - bd0,
        sfx: g.audio.sfxLog.slice(sl0).filter((q) => q.ok).map((q) => q.n), toast: document.getElementById('toast').hidden ? null : document.getElementById('toast').textContent.trim() };
    },
  };
};
export const run = (page, o) => page.evaluate((o) => window.__R11.run(o), o);

/** Muestras de la pared del vaso (yy_pool.json): [X, Z, nx, nz, zf, D, Rc, wall, exit]; n apunta hacia el interior del vaso. */
export async function paredes(page) {
  return page.evaluate(async () => (await fetch('assets/yy/yy_pool.json').then((r) => r.json())).wallRide.pts);
}
/** Salida a `dist` m de la muestra (por dentro del vaso), girada `ang` grados hacia la tangente; rumbo hacia la pared. */
export function salida(w, dist, ang = 0) {
  const [X, Z, nx, nz, zf] = w, a = ang * Math.PI / 180, tx = -nz, tz = nx;
  const dx = -nx * Math.cos(a) + tx * Math.sin(a), dz = -nz * Math.cos(a) + tz * Math.sin(a);
  const p = [X + nx * dist - tx * Math.sin(a) * dist, zf + 0.02, Z + nz * dist - tz * Math.sin(a) * dist];
  return { p, h: Math.atan2(dx, dz) };
}
/** Racha máxima de pasos consecutivos que cumplen `pred` (cadena con (s, g, pool, R)). Devuelve código de script para run(). */
export const racha = (name, pred) => `{ const ok = (${pred}); M['${name}_c'] = ok ? (M['${name}_c'] || 0) + 1 : 0; M['${name}'] = Math.max(M['${name}'] || 0, M['${name}_c']); }`;

/** V10 (preparación): giro de la corona respecto a la base de estas pruebas (V9), en grados (0 en V9, 9 en V10), leído de los sectores
 *  de la build (`__bkSectors`, solo con ?bktest). Las pruebas con posiciones literales de V9 las pasan por `giro(rot)`: P gira un punto
 *  [x, y, z] (o [x, z]) alrededor del centro si está en la corona (22 ≤ r ≤ 46: el centro no gira y más allá de 46 m —esquinas
 *  de V9— está el parque exterior nuevo, que tampoco gira), H gira un rumbo three y XZ un vector. */
export const corona = (page) => page.evaluate(() => { const s = (window.__bkSectors ?? []).find((q) => q.id === 'no_me_guillo'); return s ? s.axis - 36 : 0; });
export function giro(rot) {
  const a = rot * Math.PI / 180, c = Math.cos(a), sn = Math.sin(a);
  const XZ = (x, z) => [x * c - z * sn, z * c + x * sn];
  const P = (p) => { const three = p.length === 3, x = p[0], z = three ? p[2] : p[1]; { const r = Math.hypot(x, z); if (r < 22 || r > 46) return p.slice(); } const [X, Z] = XZ(x, z); return three ? [X, p[1], Z] : [X, Z]; };
  const H = (h) => h - a;
  return { rot, P, H, XZ };
}
