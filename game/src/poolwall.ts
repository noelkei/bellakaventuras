// V8 YINYANG · R2 del usuario (15 oct): mecánica de pared del vaso. SOLO dentro del vaso (tabla del borde que exporta
// build_yy_pool.py con la misma h(x, v) que la malla y la colisión). No cambia la física global: es un modo propio del patinador,
// como el grind (mueve el cuerpo cinemático por la superficie analítica de la pared y devuelve el control al controlador normal
// en el suelo del vaso).
//   · Enganche: en tabla, apoyada, dentro del vaso, hacia una pared a ≥ hookMin (≈ dos empujones desde parado) con al menos
//     intoFrac de la velocidad hacia la pared.
//   · De frente (componente hacia la pared ≥ airInto): sube asistida, sale VERTICAL por encima del labio con aire para un
//     frontflip/backflip (gravedad airGravity), gira 180° en el aire y se vuelve a enganchar al bajar (aterrizaje = labio).
//   · En diagonal: talla la pared (la gravedad la devuelve) y vuelve al fondo; nunca pasa del labio.
//   · Contención: con el pie por encima de la cota del labio, ANMI no puede salir por encima de un tramo de pared; se sale por E1.
// Coordenadas de la pared por muestra del labio: q < 0 suelo (m desde el pie de la curva), 0..1 curva (θ = q·π/2 del cuarto
// de elipse de h), 1..1+vertical tramo vertical (m). Normal hacia dentro del vaso `n`, tangente del labio `t`.
import * as THREE from 'three';
import type { InputFrame } from './input';
import type { Skater } from './skater';
import { TUNING, angleDiff, angleWrap, ease } from './skater';

export interface WallRideCfg { driftSpeed: number; hookMin: number; intoFrac: number; airInto: number; lipSpeed: [number, number]; airGravity: number; wallGravity: number; downGravity: number; airOffset: number; turnRate: number; airYawT: number; reach: number }
export interface WallRideTable { step: number; vertical: number; cols: string[]; pts: number[][] }

const HALF_PI = Math.PI / 2;

export class PoolWall {
  readonly n: number;
  private X: Float64Array; private Z: Float64Array; private NX: Float64Array; private NZ: Float64Array;
  private ZF: Float64Array; private DD: Float64Array; private RC: Float64Array; private WALL: Uint8Array; private EXIT: Uint8Array;
  private step0: number; private vert: number;
  active = false;
  phase: 'wall' | 'air' = 'wall';
  s = 0; q = 0; vs = 0; vu = 0;          // posición (índice de muestra, coordenada de perfil) y velocidad (a lo largo, por el perfil)
  pump = false; lipV = 0; nose = 1; entrySp = 0;
  airT = 0; airY = 0; airD = 0; yaw0 = 0; yawTurn = Math.PI; drift = false; yawU = 0;
  private off = new THREE.Vector3();     // fundido de la posición al engancharse (sin salto visible)
  private pend: { x: number; y: number } | null = null;
  inPool = false;
  // registro para pruebas
  hooks = 0; airs = 0; rehooks = 0; carves = 0; exits = 0; contains = 0; lipBounces = 0; airOuts = 0; drops = 0;
  /** ritmo del giro visual de ANMI hacia la pared (rad/s del fundido): más lento al dejarse caer desde el borde (gesto de entrada) */
  tiltRate = 30; private dropT = 0;
  /** R11 (YY-07): en la caída de la entrada desde fuera (antes de quedar bajo el labio). */
  get dropping() { return this.dropT > 0; } private aboveAt = -1e9; private floorSet = false; private gravSet = false;
  /** gesto: 0 = de pie, 1 = comprimida (piernas recogidas al entrar en la curva, al engancharse y al reengancharse) */
  compress = 0; private compT = 0;
  /** sonidos de la pared (los conecta el juego): entrada a la curva, golpe del canto al salir y al volver */
  onSfx: ((name: 'wallIn' | 'coping', p: number) => void) | null = null;
  get speedOnWall() { return Math.hypot(this.vs, this.vu); }
  private bb: [number, number, number, number] | null = null;
  log: { t: number; e: string }[] = [];
  private P = new THREE.Vector3(); private N = new THREE.Vector3(); private EU = new THREE.Vector3(); private tv = new THREE.Vector3();

  constructor(tab: WallRideTable, public cfg: WallRideCfg) {
    const c = (k: string) => tab.cols.indexOf(k), pts = tab.pts;
    this.n = pts.length; this.step0 = tab.step; this.vert = tab.vertical;
    const col = (k: string) => Float64Array.from(pts, (r) => r[c(k)]);
    this.X = col('X'); this.Z = col('Z'); this.NX = col('nx'); this.NZ = col('nz'); this.ZF = col('zf'); this.DD = col('D'); this.RC = col('Rc');
    this.WALL = Uint8Array.from(pts, (r) => (r[c('wall')] > 0.5 ? 1 : 0));
    this.EXIT = Uint8Array.from(pts, (r) => (c('exit') >= 0 ? (r[c('exit')] > 0.5 ? 1 : 0) : r[c('wall')] > 0.5 ? 0 : 1));   // salida real: peldaños altos de E1
  }

  private ev(sk: Skater, e: string) { this.log.push({ t: +sk.now.toFixed(3), e }); if (this.log.length > 200) this.log.shift(); }
  reset() { this.active = false; this.pend = null; }
  private wrap(i: number) { return ((i % this.n) + this.n) % this.n; }

  /** Muestra más cercana (horizontal) y distancia hacia dentro desde el labio. */
  nearest(x: number, z: number) {
    let best = 1e18, bi = 0;
    for (let i = 0; i < this.n; i++) { const dx = x - this.X[i], dz = z - this.Z[i], d2 = dx * dx + dz * dz; if (d2 < best) { best = d2; bi = i; } }
    const j = this.wrap(bi + 1), tx = this.X[j] - this.X[bi], tz = this.Z[j] - this.Z[bi], tl = Math.hypot(tx, tz) || 1;
    const along = ((x - this.X[bi]) * tx + (z - this.Z[bi]) * tz) / tl;
    const dh = (x - this.X[bi]) * this.NX[bi] + (z - this.Z[bi]) * this.NZ[bi];
    return { i: bi, s: bi + THREE.MathUtils.clamp(along / this.step0, -0.5, 0.5), dh, dist: Math.sqrt(best) };
  }
  /** Datos interpolados de la muestra continua s. */
  private at(s: number) {
    const i0 = Math.floor(s), f = s - i0, a = this.wrap(i0), b = this.wrap(i0 + 1), L = (u: Float64Array) => u[a] + (u[b] - u[a]) * f;
    let nx = L(this.NX), nz = L(this.NZ); const nl = Math.hypot(nx, nz) || 1; nx /= nl; nz /= nl;
    let tx = this.X[b] - this.X[a], tz = this.Z[b] - this.Z[a]; const tl = Math.hypot(tx, tz) || 1; tx /= tl; tz /= tl;
    return { x: L(this.X), z: L(this.Z), nx, nz, tx, tz, zf: L(this.ZF), D: Math.max(0.05, L(this.DD)), Rc: Math.max(0.05, L(this.RC)), wall: this.WALL[a] && this.WALL[b] };
  }
  /** Punto de la superficie, normal (hacia el aire), tangente «pared arriba» y jacobiano dP/dq. */
  private surf(s: number, q: number) {
    const w = this.at(s);
    let d: number, y: number, J: number;
    if (q < 0) { d = w.Rc - q; y = w.zf; J = 1; this.N.set(0, 1, 0); this.EU.set(-w.nx, 0, -w.nz); }
    else if (q <= 1) {
      const th = q * HALF_PI, sn = Math.sin(th), cs = Math.cos(th);
      d = w.Rc * (1 - sn); y = w.zf + w.D * (1 - cs);
      const a = w.D * sn, b = w.Rc * cs, m = Math.hypot(a, b) || 1;
      this.N.set(w.nx * a / m, b / m, w.nz * a / m);
      this.EU.set(-w.nx * b / m, a / m, -w.nz * b / m);
      J = HALF_PI * m;
    } else { d = 0; y = -this.vert + (q - 1); J = 1; this.N.set(w.nx, 0, w.nz); this.EU.set(0, 1, 0); }
    this.P.set(w.x + w.nx * d, y, w.z + w.nz * d);
    return { w, J, sinPhi: q < 0 ? 0 : q > 1 ? 1 : this.N.x * w.nx + this.N.z * w.nz };
  }
  private qTop() { return 1 + this.vert; }

  /** R4 usuario: entrar desde FUERA enganchada. En tabla, cayendo, tras pasar por encima del labio (rodando por el borde o
   *  saltando, ≤ 0,8 s), por debajo del labio y cerca de una pared: se engancha bajando por ella (gesto de entrada: el giro hacia
   *  la pared es más lento). Si llevaba un truco, el enganche es la recepción (se evalúa como cualquier aterrizaje). */
  catchTry(sk: Skater, dt: number, f: InputFrame): boolean {
    if (this.active || (sk.loco !== 'ride' && sk.loco !== 'manual') || sk.frozen) return false;
    const p = sk.footPos;
    if (!this.bb) { let x0 = 1e9, x1 = -1e9, z0 = 1e9, z1 = -1e9; for (let i = 0; i < this.n; i++) { x0 = Math.min(x0, this.X[i]); x1 = Math.max(x1, this.X[i]); z0 = Math.min(z0, this.Z[i]); z1 = Math.max(z1, this.Z[i]); } this.bb = [x0 - 2, x1 + 2, z0 - 2, z1 + 2]; }
    const clearFloor = () => { if (this.floorSet) { sk.airFloorY = null; this.floorSet = false; } if (this.gravSet) { sk.gravityScale = 1; this.gravSet = false; } };
    const [x0, x1, z0, z1] = this.bb; if (p.x < x0 || p.x > x1 || p.z < z0 || p.z > z1 || p.y < -1.9 || p.y > 3) { clearFloor(); return false; }
    if (sk.grounded) clearFloor();
    if (p.y >= -0.03) { this.aboveAt = sk.now; if (sk.grounded) return false; }
    const nr = this.nearest(p.x, p.z), w = this.at(nr.s);
    // en el aire entrando al vaso junto al borde: el tiempo para trucos cuenta hasta el FONDO del vaso (margen para el flip al
    // entrar desde el deck); con un truco en curso no hay enganche al muro: se aterriza en la curva o en el fondo y ahí se evalúa
    if (!sk.grounded && p.y > -0.1 && w.wall && !this.EXIT[nr.i] && nr.dh > -1.3 && nr.dh < 1.6 && sk.vel.x * w.nx + sk.vel.z * w.nz > 0.4) {
      sk.airFloorY = w.zf; this.floorSet = true;
    }
    if (sk.grounded || sk.vy >= 0 || sk.now - this.aboveAt > 0.8 || p.y > 0.02) return false;
    const tricking = !!sk.trick && !sk.trick.done;
    if (nr.dh < -0.12 || nr.dist > 1.9 || this.EXIT[nr.i] || !w.wall) return false;
    // (B) sobre la curva (N2, de 0,5 m al pie de la curva): cae con naturalidad y se engancha AL TOCAR la curva (sin tirón)
    // (A) junto al muro (≤ 0,5 m) o más allá de la curva hasta 1,6 m: enganche bajando por el tramo vertical; el acercamiento a la
    //     pared se funde despacio (sin «imán» brusco)
    let qCatch: number;
    if (nr.dh > 1.6) return false;
    if (nr.dh <= 0.5 || nr.dh >= w.Rc - 0.03) {
      if (p.y < -0.78 || tricking) return false;
      qCatch = 1 + THREE.MathUtils.clamp(p.y + this.vert, 0, this.vert - 0.02);
    } else {
      const sn = 1 - nr.dh / w.Rc, th = Math.asin(THREE.MathUtils.clamp(sn, 0, 1)), ySurf = w.zf + w.D * (1 - Math.cos(th));
      if (p.y > ySurf + 0.06 + TUNING.kccOffset || tricking) return false;
      qCatch = th / HALF_PI;
    }
    const vin = Math.max(0, sk.vel.x * w.nx + sk.vel.z * w.nz), hs = Math.hypot(sk.vel.x, sk.vel.z);
    // si llevaba truco, el enganche es su recepción (truco sin terminar = caída, sin enganche)
    if (sk.trick || sk.airTime > 0.25) { const vy0 = sk.vy; sk.vel.set(0, 0, 0); sk.airFloorY = null; sk.wallLand(); if (sk.loco !== 'ride') return false; sk.vy = vy0; }
    if (sk.loco === 'manual') sk.endManual('pared');
    this.active = true; this.phase = 'wall'; this.s = nr.s; this.q = qCatch; this.exitArmed = f.move.y < 0.3;
    // velocidad por el perfil hacia abajo: en el tramo vertical, la de caída; en la curva, la caída y el avance proyectados en la pendiente
    const k0 = this.surf(this.s, this.q), sinP = k0.sinPhi, cosP = Math.sqrt(Math.max(0, 1 - sinP * sinP));
    this.vs = sk.vel.x * w.tx + sk.vel.z * w.tz; this.vu = -Math.max(1.2, Math.abs(sk.vy) * sinP + vin * cosP, this.q > 1 ? Math.abs(sk.vy) : 0);
    this.entrySp = Math.max(this.cfg.hookMin, hs); this.pump = false; this.pend = null; this.inPool = true;
    const fx = Math.sin(sk.heading), fz = Math.cos(sk.heading); this.nose = fx * w.nx + fz * w.nz >= 0 ? 1 : -1;
    this.surf(this.s, this.q); this.off.copy(p).setY(p.y - TUNING.kccOffset).sub(this.P);
    this.dropT = nr.dh <= 0.5 ? 0.45 : this.q < 1 ? 0.25 : 0.6; this.drops++; sk.gravityScale = 1; this.gravSet = false; this.compT = 0.35; this.onSfx?.('wallIn', Math.abs(this.vu));
    this.ev(sk, `entra:${(-this.vu).toFixed(1)}:d${nr.dh.toFixed(2)}`);
    void dt; void f;
    return true;
  }

  /** Intento de enganche ANTES del paso normal (así la pared no llega a dar impacto/bump). */
  hookTry(sk: Skater, dt: number, f: InputFrame): boolean {
    if (this.active || (sk.loco !== 'ride' && sk.loco !== 'manual') || !sk.grounded || sk.popT >= 0 || sk.frozen) return false;
    const p = sk.footPos; if (p.y > -0.25) return false;
    const sp = Math.hypot(sk.vel.x, sk.vel.z); if (sp < this.cfg.hookMin) return false;
    const nr = this.nearest(p.x, p.z); if (nr.dh <= 0 || nr.dist > 3.5) return false;
    const w = this.at(nr.s); if (!w.wall) return false;
    const into = -(sk.vel.x * w.nx + sk.vel.z * w.nz);
    if (into < this.cfg.intoFrac * sp) return false;
    if (nr.dh > w.Rc + TUNING.radius + this.cfg.reach + into * dt) return false;
    if (p.y > w.zf + w.D + 0.1) return false;
    // coordenada de perfil inicial desde la posición real del pie
    let q: number;
    if (nr.dh >= w.Rc) q = -(nr.dh - w.Rc);
    else q = Math.asin(THREE.MathUtils.clamp(1 - nr.dh / w.Rc, 0, 1)) / HALF_PI;
    if (sk.loco === 'manual') sk.endManual('pared');   // R11 (YY-14): el manual termina al llegar a la pared (antes frenazo o choque)
    this.active = true; this.phase = 'wall'; this.s = nr.s; this.q = q; this.exitArmed = f.move.y < 0.3;
    this.vs = sk.vel.x * w.tx + sk.vel.z * w.tz; this.vu = into; this.entrySp = sp;
    this.nose = sk.vLong >= 0 ? 1 : -1;
    this.pump = into >= this.cfg.airInto;
    const [l0, l1] = this.cfg.lipSpeed;
    this.lipV = THREE.MathUtils.clamp(l0 + (into - this.cfg.airInto) * 0.25, l0, l1);
    this.surf(this.s, this.q); this.off.copy(p).setY(p.y - TUNING.kccOffset).sub(this.P);
    if (this.off.length() > 0.5) this.off.setLength(0.5);
    this.pend = null; this.hooks++; if (!this.pump) this.carves++; this.onSfx?.('wallIn', sp); this.compT = 0.2;
    this.ev(sk, `hook:${this.pump ? 'aire' : 'talla'}:${sp.toFixed(1)}:${into.toFixed(1)}:q${q.toFixed(2)}`);
    void f;
    return true;
  }

  /** R11 (YY-02): la salida por arriba se arma al ver ↑ en neutro (< 0,3) en algún momento desde el enganche (R12: o al pulsar SALTO);
   *  luego ↑ > 0,5 en el aire sale. Así ↑/stick mantenido desde antes (para coger velocidad, crucero del mando) ya no saca del vaso sin querer. */
  exitArmed = false;
  step(sk: Skater, dt: number, f: InputFrame) {
    if (f.move.y < 0.3) this.exitArmed = true;
    // R12 (usuario, 17 oct): SALTO en la pared o en su aire es una intención clara: arma la salida. Así, frontflip con ↑ mantenida sale
    // hacia delante al deck y, soltando ↑, vuelve a entrar; con W mantenida SIN saltar sigue sin sacar del vaso (YY-02)
    if (f.jumpPressed) this.exitArmed = true;
    if (this.phase === 'air') { this.airStep(sk, dt, f); return; }
    const C = this.cfg, g = TUNING.gravity;
    let k = this.surf(this.s, this.q);
    // gravedad a lo largo del perfil; subida asistida (bombeo) hacia la velocidad del labio
    if (this.pump && this.vu > 0) this.vu += (this.lipV - this.vu) * Math.min(1, 6 * dt);
    else this.vu -= g * (this.vu > 0 ? C.wallGravity : C.downGravity) * k.sinPhi * dt;
    // bajando no gana energía respecto a la entrada (sin «péndulo» infinito de pared a pared: para seguir hay que empujar)
    if (this.vu < 0) this.vu = Math.max(this.vu, -Math.max(this.entrySp, C.hookMin) * 0.98);
    this.vs *= Math.exp(-0.15 * dt);
    // giro con A/D en el plano de la pared (derecha real de ANMI: frente × normal)
    const st = sk.steer;
    if (st) {
      const sp = Math.hypot(this.vs, this.vu);
      if (sp > 0.3) {
        const tx = k.w.tx, tz = k.w.tz, dir = this.tv.set(tx * this.vs + this.EU.x * this.vu, this.EU.y * this.vu, tz * this.vs + this.EU.z * this.vu).normalize();
        const r = dir.clone().cross(this.N).normalize(), a = st * C.turnRate * dt * this.nose;
        const rt = r.x * tx + r.z * tz, ru = r.dot(this.EU);
        const vs2 = this.vs * Math.cos(a) + sp * rt * Math.sin(a), vu2 = this.vu * Math.cos(a) + sp * ru * Math.sin(a);
        this.vs = vs2; this.vu = vu2;
        if (this.pump && this.vu < C.airInto * 0.7) this.pump = false;   // girar fuerte cancela la salida por arriba
      }
    }
    if (f.jumpPressed && this.pump && this.q > 0.4) this.pend = { x: f.move.x, y: f.move.y };   // truco pedido en la subida
    // avanzar
    const ns = this.s + this.vs * dt / this.step0;
    if (!this.at(ns).wall) { this.vs = 0; this.ev(sk, 'borde-E1'); } else this.s = this.wrap(ns);   // R11 (YY-10): antes rebotaba (−0,3·vs)
    this.q += this.vu * dt / k.J;
    const top = this.qTop();
    if (this.q >= top) {
      if (this.pump) { this.q = top; this.launch(sk, f); return; }
      this.q = top - 1e-3; this.vu = -0.2 * Math.abs(this.vu); this.lipBounces++; this.ev(sk, 'labio-rebote');
    }
    k = this.surf(this.s, this.q);
    const w = k.w, qExit = -Math.max(0, TUNING.radius + 0.04 - w.Rc);
    // salida al fondo: el controlador normal retoma (cápsula entera libre de la pared)
    if (this.vu < 0 && this.q <= qExit - 0.02) { this.exit(sk, w); return; }
    this.place(sk, dt, w);
    sk.grounded = true; sk.kccGrounded = true; sk.groundNormal.copy(this.N); sk.boardPitch = 0; sk.timeSinceGround = 0; sk.airTime = 0;
    sk.slopeTangentY = this.EU.y * Math.sign(this.vu || 1);
    sk.state = 'ride';
  }

  /** Cuerpo, velocidad expuesta y rumbo a partir del estado de pared. */
  private place(sk: Skater, dt: number, w: ReturnType<PoolWall['at']>) {
    this.dropT = Math.max(0, this.dropT - dt); this.tiltRate = this.dropT > 0 ? 9 : 30;
    this.compT = Math.max(0, this.compT - dt);
    const want = this.compT > 0 ? 1 : this.q >= 0 && this.q <= 1.15 ? (this.vu > 0 ? 0.85 : 0.5) : this.q > 1.5 && this.vu > 0 ? 0 : 0.25;
    this.compress += (want - this.compress) * (1 - Math.exp(-14 * dt));
    this.off.multiplyScalar(Math.exp(-(this.dropT > 0 ? (this.off.length() > 0.5 ? 4.5 : 6) : 18) * dt)); if (this.off.lengthSq() < 1e-6) this.off.set(0, 0, 0);
    const p = this.P.clone().add(this.off);
    sk.body.setNextKinematicTranslation({ x: p.x, y: p.y + TUNING.kccOffset, z: p.z });
    const v3 = this.tv.set(w.tx * this.vs + this.EU.x * this.vu, this.EU.y * this.vu, w.tz * this.vs + this.EU.z * this.vu);
    sk.vel.set(v3.x, 0, v3.z); sk.vy = v3.y;
    // frente: proyección horizontal de la marcha (pared arriba → hacia la pared); en fakie, la opuesta
    const fx = (w.tx * this.vs - w.nx * this.vu) * this.nose, fz = (w.tz * this.vs - w.nz * this.vu) * this.nose;
    // R11 (YY-10): giro acotado por paso (≈ 690°/s): al quedarse sin marcha a lo largo (borde de E1) el frente saltaba hasta 51° en un paso
    if (Math.hypot(fx, fz) > 0.25) { const h = Math.atan2(fx, fz), dh = THREE.MathUtils.clamp(angleDiff(h, sk.heading) * (1 - Math.exp(-20 * dt)), -12 * dt, 12 * dt); sk.heading = angleWrap(sk.heading + dh); }
  }

  private launch(sk: Skater, f: InputFrame) {
    const C = this.cfg;
    this.phase = 'air'; this.airT = 0; this.airY = 0; this.airD = 0; this.airs++; this.yawU = 0; this.drift = false; this.compress = 0;
    this.yaw0 = sk.heading;
    const side = sk.steer ? Math.sign(sk.steer) : this.vs >= 0 ? 1 : -1; this.yawTurn = this.nose < 0 ? 0 : Math.PI * side;   // R11 (YY-01): en fakie ya mira al vaso: sin giro
    sk.grounded = false; sk.kccGrounded = false; sk.vy = this.lipV; sk.gravityScale = C.airGravity;
    sk.airTime = 0; sk.airPeak = 0; sk.airStartY = 0; sk.timeSinceGround = TUNING.coyote; sk.airFloorY = 0;
    sk.groundNormal.set(0, 1, 0); sk.state = 'air';
    sk.onJump?.('ollie'); this.onSfx?.('coping', this.lipV);
    this.ev(sk, `aire:${this.lipV.toFixed(1)}`);
    void f;
  }

  private airStep(sk: Skater, dt: number, f: InputFrame) {
    const C = this.cfg, g = TUNING.gravity * C.airGravity;
    this.airT += dt;
    sk.vy -= g * dt; this.airY += sk.vy * dt;
    this.vs *= Math.exp(-4 * dt);
    const ns = this.s + this.vs * dt / this.step0; if (this.at(ns).wall) this.s = this.wrap(ns); else this.vs = 0;
    // R3 usuario: manteniendo ADELANTE en el aire se avanza hacia el deck y se sale del vaso (con o sin frontflip); sin él (o con
    // backflip) se queda sobre el labio, gira 180° y se reengancha. Por encima de 0,5 m (o subiendo) decide la entrada; ya cerca del
    // labio bajando se termina hacia el lado en el que esté (nunca se aterriza a caballo del borde).
    // junto a la escalera E1 no se sale por arriba (el avance acabaría sobre los peldaños): ahí se sale por la escalera
    const nearE1 = this.exitAt(this.at(this.s).x - this.at(this.s).nx * 0.6, this.at(this.s).z - this.at(this.s).nz * 0.6, 1.2);
    const fwd = this.exitArmed && f.move.y > 0.5 && !nearE1;
    if (sk.vy > 0 || this.airY > 0.5) this.drift = fwd; else this.drift = this.airD < 0;
    const tgtD = this.drift ? -(TUNING.radius + 0.2) : C.airOffset, rate = (this.drift ? C.driftSpeed : 3) * dt;
    this.airD += THREE.MathUtils.clamp(tgtD - this.airD, -rate, rate);
    // giro de 180° al principio del aire (vuelve de frente hacia el vaso); saliendo hacia delante no gira (o deshace el giro)
    this.yawU = THREE.MathUtils.clamp(this.yawU + (this.drift ? -1 : 1) * dt / C.airYawT, 0, 1);
    sk.heading = angleWrap(this.yaw0 + this.yawTurn * ease(this.yawU));
    sk.wallAirTricks(dt, f, this.pend); this.pend = null;
    const w = this.at(this.s);
    if (this.airD <= -(TUNING.radius + 0.12) || (sk.vy < 0 && this.airY <= 0 && this.airD < 0)) { this.outOver(sk, w); return; }
    if (sk.vy < 0 && this.airY <= 0) {
      // reengancharse en el labio: aterrizaje (evalúa el truco como en cualquier recepción)
      sk.heading = angleWrap(this.yaw0 + this.yawTurn);
      sk.vel.set(0, 0, 0); const vDown = sk.vy;
      sk.airFloorY = null; sk.wallLand();
      if (sk.loco === 'bail') {
        // truco sin terminar: cae dentro del vaso pegada a la pared (sin quedar dentro del sólido) y se levanta abajo
        const x = w.x + w.nx * (TUNING.radius + 0.06), z = w.z + w.nz * (TUNING.radius + 0.06);
        sk.body.setNextKinematicTranslation({ x, y: -0.02 + TUNING.kccOffset, z });
        sk.vel.set(w.nx * 0.8, 0, w.nz * 0.8); sk.vy = vDown * 0.5; sk.grounded = false; sk.kccGrounded = false;
        this.active = false; this.ev(sk, 'aire-caida'); return;
      }
      this.phase = 'wall'; this.q = this.qTop(); this.vu = vDown; this.pump = false; this.rehooks++;
      this.surf(this.s, this.q); this.off.set(0, 0, 0);
      // R11 (YY-01): el sentido de la tabla se elige para que el frente siga donde mira (antes nose = 1 fijo: latigazo de 180° en fakie)
      { const fx = w.tx * this.vs - w.nx * this.vu, fz = w.tz * this.vs - w.nz * this.vu; this.nose = Math.sin(sk.heading) * fx + Math.cos(sk.heading) * fz >= 0 ? 1 : -1; }
      this.ev(sk, `reengancha:${vDown.toFixed(1)}`); this.onSfx?.('coping', Math.abs(vDown)); this.compT = 0.3;
      this.place(sk, dt, w); sk.grounded = true; sk.kccGrounded = true; sk.groundNormal.copy(this.N); sk.state = 'land';
      return;
    }
    const x = w.x + w.nx * this.airD, z = w.z + w.nz * this.airD;
    sk.body.setNextKinematicTranslation({ x, y: this.airY + TUNING.kccOffset, z });
    sk.vel.set(w.tx * this.vs, 0, w.tz * this.vs);
    sk.state = 'air';
  }

  /** Salida por arriba (adelante mantenido): el controlador normal sigue el vuelo y aterriza en el deck (evalúa el truco). */
  private outOver(sk: Skater, w: ReturnType<PoolWall['at']>) {
    const d = Math.min(this.airD, -(TUNING.radius + 0.12));
    sk.body.setNextKinematicTranslation({ x: w.x + w.nx * d, y: Math.max(0.02, this.airY) + TUNING.kccOffset, z: w.z + w.nz * d });
    sk.vel.set(-w.nx * this.cfg.driftSpeed + w.tx * this.vs, 0, -w.nz * this.cfg.driftSpeed + w.tz * this.vs);
    sk.heading = Math.atan2(sk.vel.x, sk.vel.z); sk.prevHeading = sk.heading;   // R11 (YY-18): antes aterrizaba «cruzada» y caía
    sk.airFloorY = null; sk.grounded = false; sk.kccGrounded = false; sk.state = 'air';
    this.active = false; this.inPool = false; this.airOuts++; this.ev(sk, `sale-arriba:${this.airY.toFixed(2)}`);
  }

  private exit(sk: Skater, w: ReturnType<PoolWall['at']>) {
    this.surf(this.s, this.q);
    const p = this.P.clone().add(this.off); p.y = w.zf + TUNING.kccOffset;
    // R3 (pruebas de romper): en una esquina junto a E1 el pie quedaba 4 cm dentro de la colisión de la escalera: se busca sitio
    // hacia dentro del vaso (≤ 0,4 m) antes de devolver el control
    if (!sk.fitsFoot(p)) {
      const p0 = p.clone(); let ok = false;
      for (let r = 0.05; r <= 0.45 && !ok; r += 0.05) for (let k = 0; k < 12 && !ok; k++) {
        const a = k / 12 * Math.PI * 2; p.set(p0.x + Math.cos(a) * r, p0.y, p0.z + Math.sin(a) * r);
        if (this.inside(p.x, p.z) && sk.fitsFoot(p)) ok = true;
      }
      if (!ok) p.copy(p0);
      this.ev(sk, `sale-recolocada:${ok ? p.distanceTo(p0).toFixed(2) : 'no'}`);
    }
    sk.body.setNextKinematicTranslation({ x: p.x, y: p.y, z: p.z });
    sk.vel.set(w.tx * this.vs + w.nx * -this.vu, 0, w.tz * this.vs + w.nz * -this.vu); sk.vy = 0;
    const fx = sk.vel.x * this.nose, fz = sk.vel.z * this.nose; if (Math.hypot(fx, fz) > 0.2) sk.heading = Math.atan2(fx, fz);
    sk.grounded = true; sk.kccGrounded = true; sk.groundNormal.set(0, 1, 0); sk.slopeTangentY = 0; sk.state = 'ride';
    this.active = false; this.exits++; this.ev(sk, `sale:${Math.hypot(sk.vel.x, sk.vel.z).toFixed(1)}`);
  }

  /** ¿Punto (x, z) dentro del borde del vaso? (para recolocar tras una caída sin sacar a ANMI del vaso) */
  /** ¿El borde más cercano a (x, z) es la salida real por E1? (pruebas) */
  exitAt(x: number, z: number, r = 0) { const nr = this.nearest(x, z); if (this.EXIT[nr.i]) return true;
    if (r > 0) { const k = Math.ceil(r / this.step0); for (let j = -k; j <= k; j++) if (this.EXIT[this.wrap(nr.i + j)]) return true; } return false; }
  inside(x: number, z: number) { const nr = this.nearest(x, z); return nr.dh > 0.05 && nr.dist < 12; }

  /** Contención: del vaso solo se sale por E1. Con el pie por encima de −0,35 junto a un tramo de PARED, la cápsula no pasa del
   *  labio (lo mismo que haría la cara vertical si siguiera hacia arriba). Devuelve la posición corregida. */
  /** R11 (YY-05): ¿apoyada (KCC) en la arista del labio DESDE DENTRO, sin suelo bajo la sonda central? Devuelve la normal hacia el
   *  vaso y cuánto empujar (hasta radio + 2 cm de la pared, como mucho 4 cm por paso). */
  lipHangs = 0;
  lipHang(sk: Skater, supported: boolean) {
    if (this.active || supported) return null;
    const p = sk.footPos; if (p.y > -0.04 || p.y < -0.5) return null;
    const nr = this.nearest(p.x, p.z); if (this.EXIT[nr.i] || nr.dist > 3.5 || nr.dh < -0.1 || nr.dh > TUNING.radius + 0.06) return null;
    const w = this.at(nr.s); this.lipHangs++; if (this.lipHangs % 30 === 1) this.ev(sk, 'labio');
    return { nx: w.nx, nz: w.nz, push: Math.min(0.04, Math.max(0, TUNING.radius + 0.02 - nr.dh)) };
  }
  contain(sk: Skater, x: number, y: number, z: number): [number, number] {
    if (this.active) return [x, z];
    const p = sk.footPos, cur = this.nearest(p.x, p.z);
    // dentro del vaso: bajo la cota del deck y por dentro del borde (el vaso mide < 22 m: a más de 12 m de todo borde no es el vaso)
    if (p.y < -0.3 && cur.dh > 0 && cur.dist < 12) this.inPool = true;
    else if (this.inPool && p.y > -0.05 && (cur.dh < 0 || cur.dist > 12)) this.inPool = false;
    if (!this.inPool || y < -0.35) return [x, z];
    const nr = this.nearest(x, z), w = this.at(nr.s), lim = TUNING.radius + 0.02;
    if (this.EXIT[nr.i] || nr.dh >= lim || nr.dist > 3.5) return [x, z];
    const push = lim - nr.dh; x += w.nx * push; z += w.nz * push;
    const out = sk.vel.x * w.nx + sk.vel.z * w.nz; if (out < 0) { sk.vel.x -= out * w.nx; sk.vel.z -= out * w.nz; }
    this.contains++; if (this.contains % 30 === 1) this.ev(sk, 'contiene');
    return [x, z];
  }
}
