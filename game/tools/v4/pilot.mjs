// V4-VAL-02 · Piloto con TECLADO REAL para la campaña: técnica asistida declarada (cap. 16: «una ruta teclado/ratón
// asistida es válida como técnica si lo declara; no equivale humano»). Solo LEE el estado (posición, rumbo, velocidad,
// geometría física para planificar) y PULSA teclas; nunca teletransporta ni escribe estado del juego.
//  · Rejilla de navegación a pie (0,5 m): suelo por raycast + holgura de una cápsula de 1,7 m (r 0,4) con
//    intersectionWithShape contra los colliders reales (sensores, cuerpos cinemáticos y la propia ANMI excluidos).
//  · A* 8-conexo + suavizado por línea de visión; replanifica si se atasca.
//  · Seguimiento: A/D giran (A = izquierda, rumbo creciente), W avanza; en tabla S frena por encima de la velocidad objetivo.
import { sleep } from './lib.mjs';

export class Pilot {
  constructor(page, R) { this.page = page; this.R = R; this.held = new Set(); this.log = []; this.walkOnly = false; this.wSince = 0; }
  async keys(want) {
    for (const k of [...this.held]) if (!want.includes(k)) { await this.page.keyboard.up(k); this.held.delete(k); }
    for (const k of want) if (!this.held.has(k)) { await this.page.keyboard.down(k); this.held.add(k); }
  }
  async release() { await this.keys([]); }
  state() {
    return this.page.evaluate(() => {
      const g = window.__bk, s = g.skater, p = s.footPos;
      return { x: p.x, y: p.y, z: p.z, h: s.heading, v: s.vLong, sp: Math.hypot(s.vel.x, s.vel.z), loco: s.loco, st: s.state, grounded: s.grounded, mode: g.mode, paused: g.paused, total: g.state.total,
        prompt: document.getElementById('prompt').hidden ? '' : document.getElementById('btn-action').textContent, impact: s.loco === 'impact' };
    });
  }
  /** Construye (una vez) la rejilla de navegación en la página. `cars`: tratar la banda de la pista de coches como bloqueada. */
  //  V10 (preparación): con el parque exterior de la Bola de Oro (D-EX-01) la rejilla cubre el cuadrado y la plaza (±56) y no se corta en
  //  r 42,2; la banda de coches usa el radio de la pista del juego (`g.cars.R`, 17,5 hasta V9).
  async buildNav({ cars = false } = {}) {
    return this.page.evaluate((cars) => {
      const g = window.__bk, RA = window.__bkRapier, W = g.world, S = 0.5, ext = !!g.park?.bolaLoad, H = ext ? 56 : 44, N = Math.round(2 * H / S), RMAX = ext ? Infinity : 42.2, CR = g.cars?.R ?? 17.5;
      const free = new Uint8Array(N * N), gy = new Float32Array(N * N);
      const cap = new RA.Capsule(0.45, 0.4);
      const flags = RA.QueryFilterFlags.EXCLUDE_SENSORS | RA.QueryFilterFlags.EXCLUDE_KINEMATIC;
      let nFree = 0;
      for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) {
        const x = -H + (i + 0.5) * S, z = -H + (j + 0.5) * S, k = i * N + j;
        if (Math.hypot(x, z) > RMAX) continue;
        if (cars && Math.abs(Math.hypot(x, z) - CR) < 3.4) continue;
        const h = W.castRay(new RA.Ray({ x, y: 8, z }, { x: 0, y: -1, z: 0 }), 12, true, flags);
        if (!h) continue; const y = 8 - h.timeOfImpact; gy[k] = y;
        if (y > 0.25 || y < -0.5) continue;   // V5 T5-30: el hoyo de la U (T5-12) tiene el fondo a −0,45 y se entra por su rampa
        const hit = W.intersectionWithShape({ x, y: y + 0.97, z }, { x: 0, y: 0, z: 0, w: 1 }, cap, flags, undefined, undefined, undefined, (c) => c.handle !== g.skater.collider?.handle);
        if (!hit) { free[k] = 1; nFree++; }
      }
      window.__nav = { free, gy, S, H, N };
      return { N, nFree };
    }, cars);
  }
  /** Camino suavizado (lista de [x, z]) desde la posición actual hasta `goal` por la rejilla. */
  async plan(goal) {
    return this.page.evaluate((goal) => {
      const { free, S, H, N } = window.__nav, p = window.__bk.skater.footPos;
      const cell = (x, z) => [Math.max(0, Math.min(N - 1, Math.floor((x + H) / S))), Math.max(0, Math.min(N - 1, Math.floor((z + H) / S)))];
      const ctr = (i, j) => [-H + (i + 0.5) * S, -H + (j + 0.5) * S];
      const nearestFree = (i0, j0) => { if (free[i0 * N + j0]) return [i0, j0]; for (let r = 1; r < 14; r++) for (let di = -r; di <= r; di++) for (let dj = -r; dj <= r; dj++) { if (Math.max(Math.abs(di), Math.abs(dj)) !== r) continue; const i = i0 + di, j = j0 + dj; if (i >= 0 && j >= 0 && i < N && j < N && free[i * N + j]) return [i, j]; } return null; };
      const s = nearestFree(...cell(p.x, p.z)), t = nearestFree(...cell(goal[0], goal[1]));
      if (!s || !t) return { ok: false, why: !s ? 'inicio sin celda libre' : 'meta sin celda libre' };
      const key = (i, j) => i * N + j, g0 = new Float32Array(N * N).fill(Infinity), came = new Int32Array(N * N).fill(-1), closed = new Uint8Array(N * N);
      const open = [[0, s[0], s[1]]]; g0[key(...s)] = 0;
      const hh = (i, j) => Math.hypot(i - t[0], j - t[1]);
      let found = false, it = 0;
      while (open.length && it++ < 200000) {
        let bi = 0; for (let q = 1; q < open.length; q++) if (open[q][0] < open[bi][0]) bi = q;
        const [, i, j] = open[bi]; open.splice(bi, 1); const k = key(i, j); if (closed[k]) continue; closed[k] = 1;
        if (i === t[0] && j === t[1]) { found = true; break; }
        for (let di = -1; di <= 1; di++) for (let dj = -1; dj <= 1; dj++) {
          if (!di && !dj) continue; const a = i + di, b = j + dj; if (a < 0 || b < 0 || a >= N || b >= N) continue; const kb = key(a, b);
          if (!free[kb] || closed[kb]) continue; if (di && dj && (!free[key(i + di, j)] || !free[key(i, j + dj)])) continue;
          const ng = g0[k] + (di && dj ? 1.4142 : 1); if (ng < g0[kb]) { g0[kb] = ng; came[kb] = k; open.push([ng + hh(a, b), a, b]); }
        }
      }
      if (!found) return { ok: false, why: 'sin camino' };
      const cells = []; for (let k = key(...t); k !== -1; k = came[k]) cells.push([Math.floor(k / N), k % N]); cells.reverse();
      const pts = cells.map(([i, j]) => ctr(i, j));
      const los = (a, b) => { const L = Math.hypot(b[0] - a[0], b[1] - a[1]), n = Math.ceil(L / 0.2); for (let q = 0; q <= n; q++) { const x = a[0] + (b[0] - a[0]) * q / n, z = a[1] + (b[1] - a[1]) * q / n; const [i, j] = cell(x, z); if (!free[key(i, j)]) return false; } return true; };
      const out = [pts[0]]; let a = 0;
      while (a < pts.length - 1) { let b = pts.length - 1; while (b > a + 1 && !los(pts[a], pts[b])) b--; out.push(pts[b]); a = b; }
      return { ok: true, path: out.slice(1), cells: cells.length };
    }, goal);
  }
  /** Gira en el sitio hasta el rumbo `h` (a pie o parada en tabla). */
  async face(h, tol = 0.06, maxMs = 4000) {
    const t0 = Date.now();
    while (Date.now() - t0 < maxMs) {
      const s = await this.state(); const e = angleDiff(h, s.h);
      if (Math.abs(e) < tol) break;
      await this.keys([e > 0 ? 'KeyA' : 'KeyD']); await sleep(Math.min(60, Math.abs(e) * 120));
      await this.keys([]); await sleep(20);
    }
    await this.release();
  }
  /** Sigue una lista de puntos [x, z]. Opciones: tol final, ride (en tabla, velocidad objetivo), until (función de corte). */
  async follow(path, { tol = 0.6, ride = false, speed = 3.5, until = null, maxMs = 60000, label = '' } = {}) {
    const t0 = Date.now(); let i = 0, last = null, lastProg = Date.now(), best = Infinity, s = null;
    while (Date.now() - t0 < maxMs && i < path.length) {
      s = await this.state();
      if (until && (await until(s))) { await this.release(); return { ok: true, why: 'until', s }; }
      if (s.impact || s.mode !== 'explore' && s.mode !== 'final') { await this.release(); await sleep(150); continue; }
      const [tx, tz] = path[i], dx = tx - s.x, dz = tz - s.z, L = Math.hypot(dx, dz);
      const isLast = i === path.length - 1;
      if (L < (isLast ? tol : ride ? 1.2 : 0.7)) { i++; best = Infinity; continue; }
      if (L < best - 0.15) { best = L; lastProg = Date.now(); }
      if (Date.now() - lastProg > 3500) { await this.release(); return { ok: false, why: 'atasco', i, L, s }; }
      const want = Math.atan2(dx, dz), e = angleDiff(want, s.h), k = [];
      if (ride) {
        if (Math.abs(e) > 0.12) k.push(e > 0 ? 'KeyA' : 'KeyD');
        const vt = Math.min(speed, isLast ? Math.max(1.2, L * 1.2) : speed);
        if (s.v > vt + 1.2 || (Math.abs(e) > 1.3 && s.v > 2.2)) k.push('KeyS');
        else if (s.v < vt && Math.abs(e) < 0.9) k.push('KeyW');
      } else {
        // V10.1 P02 (D02, cambio de diseño aprobado): con W mantenida ANMI CORRE (5 m/s) y al soltar se para en ~2 m (sin frenazo): al llegar a la
        // última meta corriendo se suelta W a la distancia de parada, como haría quien juega (copia previa en V10/backups/pruebas/V10_1-R5)
        const coast = isLast && s.sp > 2.6 && L < s.sp * s.sp / 9 + 0.4;
        // `walkOnly` (campaña): anda sin correr, como quien no mantiene W: la suelta un instante cada 0,6 s (la carrera pide 0,8 s seguidos)
        if (!this.held.has('KeyW')) this.wSince = Date.now();
        const tap = this.walkOnly && this.held.has('KeyW') && Date.now() - this.wSince > 600;
        if (Math.abs(e) > 0.5) k.push(e > 0 ? 'KeyA' : 'KeyD');
        else { if (!coast && !tap) k.push('KeyW'); if (Math.abs(e) > 0.06) k.push(e > 0 ? 'KeyA' : 'KeyD'); }
      }
      await this.keys(k); await sleep(35);
    }
    await this.release();
    return { ok: i >= path.length, why: i >= path.length ? 'llegó' : 'tiempo', s };
  }
  /** Ir a pie hasta (x, z) por la rejilla, replanificando hasta 3 veces. */
  async walkTo(goal, opts = {}) {
    await this.ensureFoot();
    for (let attempt = 0; attempt < 4; attempt++) {
      const pl = await this.plan(goal);
      if (!pl.ok) { this.log.push({ goal, attempt, plan: pl.why }); if (attempt === 3) return { ok: false, why: pl.why }; await this.nudge(); continue; }
      const r = await this.follow([...pl.path, goal], { tol: opts.tol ?? 0.6, until: opts.until, maxMs: opts.maxMs ?? 70000, label: opts.label });
      this.log.push({ goal, attempt, r: r.why });
      if (r.ok) return r;
      await this.nudge();
    }
    return { ok: false, why: 'agotado' };
  }
  /** Desatascar: retroceder un poco y girar. */
  async nudge() { await this.keys(['KeyS']); await sleep(500); await this.keys(['KeyA']); await sleep(300); await this.release(); }
  async ensureFoot() {
    let s = await this.state();
    for (let attempt = 0; attempt < 4 && s.loco !== 'walk'; attempt++) {
      // frenar hasta casi parar: S frena la marcha adelante; W frena la marcha atrás (S mantenida pasaría a reversa)
      for (let k = 0; k < 60 && Math.abs(s.v) > 0.6; k++) { await this.keys([s.v > 0 ? 'KeyS' : 'KeyW']); await sleep(50); s = await this.state(); }
      await this.release(); await this.page.keyboard.press('KeyQ'); await sleep(700);
      s = await this.state();
      // denegado (techo, pendiente, en el aire…): rodar un poco hacia delante y reintentar, como haría un jugador
      if (s.loco !== 'walk' && s.loco !== 'dismount') { this.log.push({ bajar_denegado: attempt }); await this.keys(['KeyW']); await sleep(500); await this.release(); await sleep(200); s = await this.state(); }
    }
    return s.loco === 'walk';
  }
  async ensureRide() {
    let s = await this.state(); if (s.loco === 'ride') return true;
    await this.page.keyboard.press('KeyQ'); await sleep(700); s = await this.state(); return s.loco === 'ride';
  }
  /** Pulsar la acción contextual (E) cuando el texto del botón coincide con `re`. */
  async act(re, timeout = 4000) {
    const t0 = Date.now(); while (Date.now() - t0 < timeout) { const s = await this.state(); if (re.test(s.prompt)) { await this.page.keyboard.press('KeyE'); return true; } await sleep(80); } return false;
  }
}
export function angleDiff(a, b) { let d = (a - b) % (2 * Math.PI); if (d > Math.PI) d -= 2 * Math.PI; if (d < -Math.PI) d += 2 * Math.PI; return d; }
