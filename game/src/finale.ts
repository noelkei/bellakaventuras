// V10.1 · escena final (usuario, 19 oct): al pasarse el juego, en vez del preview, una animación cinematográfica (V10.3: 47 s, W07/W-D09)
// con la canción de SECRETNOVIO desde el segundo 0 (el parque calla): los seis niños uno a uno, ANMI con Bellakat y Bellakroak al lado y los niños detrás
// frente a la rampa de A, la cámara apunta al cielo, las nubes rosas del juego se juntan y forman el logo de Bellakaciones y después
// «DISPONIBLE EL 30/10»; al acabar se vuelve con ANMI y la cámara donde estaban. El logo de nubes se QUEDA en el cielo (se ve desde todo el
// mapa; usuario: «en la animación solo se enfoca»). Bolas de nube: assets/bola/logo_nube.json (receta assets/derived/v10_1/final/make_final.py).
import * as THREE from 'three';
import type { Game } from './game';
import { ASSET_BASE } from './assets';
import { camFadeUniform } from './world/camfade';
import { snW, snH } from './world/sn';
import * as avisos from './avisos';   // V10.6 (B5): métricas sin identificadores

type Blob = [number, number, number, number];
interface LogoData { logo: { h: number; blobs: Blob[] }; fecha: { h: number; blobs: Blob[] }; fecha2?: { h: number; blobs: Blob[] } }   // fecha2: «30/10» aparte (letras del usuario)

/** Dónde vive el logo (usuario: «que se quede en la esquina de la plaza… como detrás de nosotros si volvemos a empezar»): sobre la
 *  esquina de la plaza de salida (40, −40), más allá de ella, alto (110 m) y grande (150 m): marca la cuarta esquina del parque (las otras:
 *  Bellakroak, Bellakat y el cartel de Bellakaciones). Levantando la vista queda por encima de los edificios desde todo el mapa y siempre
 *  mira a la cámara. */
// (con el interior de SN girado −45°, el muro A mira a esa esquina: el logo queda JUSTO detrás de la rampa, en su eje)
export const SKY_LOGO = { pos: snW(new THREE.Vector3(0, 110, -124.5)), width: 150, fechaK: 0.78 };
/** V10.4 R18 (usuario: «se queda en el aire detrás de la plaza… al menos en el móvil, pero tiene que quedarse también el disponible el 30 / 10,
 *  en todos los dispositivos»): fuera de la escena, el logo (con la fecha) descansa en la MISMA dirección, detrás de la plaza, pero más lejos y
 *  más bajo: desde el centro del parque, su borde de abajo a ~18° (por encima de los edificios) y el de arriba a ~30°. En la escena (a 42° de
 *  altura) quedaba por encima del encuadre de la cámara de juego en pantallas apaisadas y solo se veía en el móvil en vertical. */
export const SKY_LOGO_REST = { pos: snW(new THREE.Vector3(0, 128, -260)), scale: 0.85 };
const FINAL_SONG = 'audio/secretnovio-final-v103.m4a';
export const FINAL_LEN = 47;   // V10.3 (W07, W-D09): del 0 al 47 (antes 32)
/** V10.3 (W08, W-D10): la pista de SN del parque es la ventana 0:32–0:52 de la canción; al acabar la escena sigue en el 0:47. */
export const PARK_SONG_IN = 32;

let DATA: Promise<LogoData | null> | null = null;
export const loadLogoData = () => (DATA ??= fetch(`${ASSET_BASE}bola/logo_nube.json`).then((r) => (r.ok ? r.json() : null)).catch(() => null));

/** Logo de nubes: las mismas bolas facetadas (icosaedro) y el mismo material de las nubes del cielo (sky.ts), en dos rosas como el logo
 *  (blanco delante, línea/sombra detrás), al 90 % de opacidad. `form(k)`: 0 = nubes sueltas y pequeñas → 1 = logo formado. */
class CloudWord {
  mesh: THREE.InstancedMesh;
  private fin: THREE.Matrix4[] = []; private from: THREE.Vector3[] = []; private delay: number[] = []; private k = -1;
  constructor(d: { h: number; blobs: Blob[] }, width: number, mat: THREE.Material, rng: () => number) {
    const geo = new THREE.IcosahedronGeometry(1, 0);
    this.mesh = new THREE.InstancedMesh(geo, mat, d.blobs.length);
    const light = new THREE.Color('#ffe0ec'), deep = new THREE.Color('#ec8fb9'), q = new THREE.Quaternion(), e = new THREE.Euler();
    d.blobs.forEach(([x, y, r, white], i) => {
      const R = r * width, p = new THREE.Vector3((x - 0.5) * width, (y - d.h / 2) * width, white ? rng() * 0.3 : -R * 0.8 - 0.4);
      q.setFromEuler(e.set(rng() * 0.6, rng() * Math.PI * 2, rng() * 0.6));
      const k = white ? 1.12 : 1.0;   // el blanco algo más gordo: tapa los huecos entre bolas (se leía «moteado»)
      this.fin.push(new THREE.Matrix4().compose(p, q, new THREE.Vector3(R * k, R * 0.95 * k, R * 0.75 * k)));
      // al formarse llegan desde una nube desordenada algo más grande y más alta (de izquierda a derecha, con algo de azar)
      this.from.push(p.clone().multiply(new THREE.Vector3(1.25, 1.6, 1)).add(new THREE.Vector3((rng() - 0.5) * width * 0.35, width * (0.08 + rng() * 0.12), (rng() - 0.5) * width * 0.2)));
      this.delay.push(Math.min(1, Math.max(0, x * 0.75 + rng() * 0.25)));
      this.mesh.setColorAt(i, white ? light : deep);
    });
    this.mesh.instanceColor!.needsUpdate = true; this.mesh.renderOrder = -7; this.mesh.castShadow = this.mesh.receiveShadow = false;
    this.form(1); this.mesh.computeBoundingSphere();
  }
  form(k: number, scatter = true) {
    if (Math.abs(k - this.k) < 1e-4) return; this.k = k;
    const m = new THREE.Matrix4(), p = new THREE.Vector3(), q = new THREE.Quaternion(), s = new THREE.Vector3(), z = new THREE.Vector3(0, 0, 0);
    for (let i = 0; i < this.fin.length; i++) {
      const u = THREE.MathUtils.clamp((k - this.delay[i] * 0.55) / 0.45, 0, 1), e = u * u * (3 - 2 * u);
      this.fin[i].decompose(p, q, s);
      if (scatter) p.lerpVectors(this.from[i], p, e);
      this.mesh.setMatrixAt(i, m.compose(p, q, e <= 0 ? z : s.multiplyScalar(0.35 + 0.65 * e)));
    }
    this.mesh.instanceMatrix.needsUpdate = true; this.mesh.visible = k > 0;
  }
}

export class SkyLogo {
  group = new THREE.Group(); logo: CloudWord; fecha!: CloudWord; fecha2: CloudWord | null = null; midY = 0;
  private q = new THREE.Quaternion(); private tmp = new THREE.Object3D();
  constructor(d: LogoData) {
    let a = 30101; const rng = () => { a = (a * 16807) % 2147483647; return a / 2147483647; };
    // material de las nubes del cielo (sky.ts lowPolyClouds) al 90 % (usuario) y con el color por bola
    const mat = new THREE.MeshLambertMaterial({ color: '#ffffff', emissive: '#e7a3bf', emissiveIntensity: 0.62, flatShading: true, fog: false, transparent: true, opacity: 0.9 });
    this.logo = new CloudWord(d.logo, SKY_LOGO.width, mat, rng);
    // la fecha bajo el logo. Con las letras del usuario (dos piezas): «disponible el» y «30/10» en UNA línea (apiladas no cabían en el plano)
    const ext = (w: { h: number; blobs: Blob[] }, k: number) => ({ lo: (Math.min(...w.blobs.map((b) => b[1] - b[2])) - w.h / 2) * k, hi: (Math.max(...w.blobs.map((b) => b[1] + b[2])) - w.h / 2) * k,
      l: (Math.min(...w.blobs.map((b) => b[0] - b[2])) - 0.5) * k, r: (Math.max(...w.blobs.map((b) => b[0] + b[2])) - 0.5) * k });
    const W = SKY_LOGO.width, gap = 0.03 * W, eL = ext(d.logo, W);
    let bottom: number;
    if (d.fecha2) {
      const f1w = 0.56 * W, f2w = 0.72 * W;   /* «30/10» al doble (usuario) */ this.fecha = new CloudWord(d.fecha, f1w, mat, rng); this.fecha2 = new CloudWord(d.fecha2, f2w, mat, rng);
      const e1 = ext(d.fecha, f1w), e2 = ext(d.fecha2, f2w), w1 = e1.r - e1.l, w2 = e2.r - e2.l, row = w1 + gap + w2, rh = Math.max(e1.hi - e1.lo, e2.hi - e2.lo), cy = eL.lo - gap - rh / 2;
      this.fecha.mesh.position.set(-row / 2 - e1.l, cy - (e1.hi + e1.lo) / 2, 0.02 * W); this.fecha2.mesh.position.set(row / 2 - e2.r, cy - (e2.hi + e2.lo) / 2, 0.03 * W);
      this.fecha2.form(0); this.group.add(this.fecha2.mesh); bottom = cy - rh / 2;
    } else {
      const fw = W * SKY_LOGO.fechaK; this.fecha = new CloudWord(d.fecha, fw, mat, rng); const e1 = ext(d.fecha, fw);
      this.fecha.mesh.position.y = eL.lo - gap - e1.hi; this.fecha.mesh.position.z = 0.02 * W; bottom = this.fecha.mesh.position.y + e1.lo;
    }
    this.fecha.form(0);
    this.midY = (eL.hi + bottom) / 2;   // centro vertical del conjunto (la cámara de la escena apunta ahí)
    this.group.add(this.logo.mesh, this.fecha.mesh); this.group.name = 'SKY_LOGO_BELLAKACIONES'; this.group.position.copy(SKY_LOGO.pos);
  }
  /** Sitio de la escena (encuadre de la grúa) o de reposo (visible jugando); en reposo, la fecha completa también. */
  /** Las nubes del cielo que pasan por delante del logo en reposo se recogen (sky.ts, `userData.avoid`). */
  clouds: { dir: THREE.Vector3 | null } | null = null;
  stage() { this.group.position.copy(SKY_LOGO.pos); this.group.scale.setScalar(1); if (this.clouds) this.clouds.dir = null; }
  rest() { this.group.position.copy(SKY_LOGO_REST.pos); this.group.scale.setScalar(SKY_LOGO_REST.scale); this.logo.form(1, false); this.fecha.form(1, false); this.fecha2?.form(1, false);
    if (this.clouds) this.clouds.dir = SKY_LOGO_REST.pos.clone().setY(0).normalize(); }
  /** Mira siempre hacia la cámara (se lee desde cualquier lado del mapa), girando suave. */
  update(dt: number, cam: THREE.Camera, snap = false) {
    this.tmp.position.copy(this.group.position); this.tmp.lookAt(cam.position); this.q.copy(this.tmp.quaternion);
    if (snap) this.group.quaternion.copy(this.q); else this.group.quaternion.slerp(this.q, 1 - Math.exp(-2.5 * dt));
  }
}

/** La cinemática. Tiempo = reloj de la simulación (se congela con la pausa, como el audio). */
export class FinalCine {
  active = false; t = 0; done = false;
  private saved: { pos: THREE.Vector3; heading: number; loco: string } | null = null;
  private homes: { a: any; pos: THREE.Vector3; yaw: number; look: any }[] = [];
  private formed = false; private waved = new Set<any>(); private castH = new Map<any, number>();
  private shot = -1; private pose = { pos: new THREE.Vector3(), look: new THREE.Vector3(), hfov: 60 };
  private natural = false;   // V10.4: false si se corta de golpe (recarga, «Volver a la plaza»): sin despedida
  private src: AudioBufferSourceNode | null = null; private ending = false; private handoff = false; private fade0 = new THREE.Vector2();
  constructor(private g: Game, private logo: SkyLogo | null) {}
  get reduced() { return this.g.state.p.settings.reducedMotion; }
  async start() {
    const g = this.g, s = g.skater!; this.active = true; this.t = 0; this.shot = -1; this.ending = false; this.handoff = false; this.formed = false; this.waved.clear();
    this.logo?.stage();   // R18: en la escena, en su sitio de siempre (fuera de ella descansa más lejos y más bajo)
    this.saved = { pos: s.footPos.clone(), heading: s.heading, loco: s.loco === 'walk' || s.loco === 'dismount' ? 'walk' : 'ride' };
    s.vel.set(0, 0, 0); s.frozen = true;
    // el tramado de cercanía (camfade) también afecta a los niños (cuelgan del grupo de SN): fuera durante la escena
    this.fade0.copy(camFadeUniform.value); camFadeUniform.value.set(0, 0.001);
    document.body.classList.add('cine', 'finale'); document.body.classList.toggle('finale-reducido', this.reduced);
    const sk = document.getElementById('btn-cine-skip'); if (sk) sk.hidden = false;
    this.logo?.logo.form(0); this.logo?.fecha.form(0); this.logo?.fecha2?.form(0);
    // ANMI espera ya en su sitio del plano de grupo (al pie de la rampa de A, mirando a la cámara): si se quedaba en la recepción D, la
    // cámara la atravesaba al pasar de un lado al otro de los niños
    s.teleport(snW(new THREE.Vector3(0, 0, -5.4)), snH(0), 'walk'); s.vel.set(0, 0, 0); s.frozen = true;
    // la canción desde el segundo 0 (el parque ya calla: modo preview del audio)
    this.src = await g.audio.music?.playFinal(`${FINAL_SONG}`) ?? null;
    g.log.push('escena final: inicio');
  }
  /** Reparto: los seis niños (violinistas) y Bellakroak / Bellakat de SECRETNOVIO. */
  private cast() { const c = this.g.snCast; return { rana: c[0] ?? null, fennec: c[1] ?? null, kids: c.slice(2, 8) }; }
  private formation(on: boolean) {
    const g = this.g, s = g.skater!, { rana, fennec, kids } = this.cast();
    if (on) {
      this.homes = [rana, fennec, ...kids].filter(Boolean).map((a: any) => ({ a, pos: a.root.position.clone(), yaw: a.yaw, look: a.lookAt }));
      // al pie de la rampa de A (la bajada del reto), mirando a la cámara: ANMI en el centro, Bellakroak y Bellakat a los lados y los niños detrás
      // (en el marco de SN: −Z hacia el muro A; snW/snH lo llevan al mundo con el giro del reto)
      // (el reparto cuelga del grupo del reto, ya girado: se coloca en el marco de SN sin convertir)
      rana?.place(new THREE.Vector3(-1.25, 0, -5.15), 0.25); fennec?.place(new THREE.Vector3(1.25, 0, -5.15), -0.25);
      kids.forEach((k: any, i: number) => k.place(new THREE.Vector3([-3.2, -2.0, -0.8, 0.8, 2.0, 3.2][i], 0, -7.0 - (i % 2) * 0.25), 0));
      // Bellakroak y Bellakat miran a la cámara (cuello y cabeza) y saludan cuando la cámara llega a cada uno (update); los niños siguen
      // tocando el violín
      for (const a of [rana, fennec]) if (a) { a.lookAt = () => this.g.rig.cam.position.clone(); a.play(a.idle, 0.3);
        a.root.updateMatrixWorld(true); const bb = new THREE.Box3().setFromObject(a.root); this.castH.set(a, Math.max(0.5, bb.max.y - bb.min.y)); }
    } else { for (const h of this.homes) { h.a.place(h.pos, h.yaw); h.a.lookAt = h.look; h.a.play(h.a.idle, 0.3); } this.homes = []; }
  }
  /** Guion. V10.1 (usuario: «16 segundos solo para pasar de foco entre niño y niño; para lo demás, 16 segundos más»); V10.3 (W07, W-D09:
   *  «alargar la animación final hasta los 47 segundos… más smooth el paso… a verse el cielo… ligeramente más lento cómo aparecen las letras y
   *  darle un poco más de tiempo a que se queden las letras»):
   *   0–16 s · los seis niños uno a uno: 1,9 s con cada uno y 0,92 s de paso al siguiente, la cámara deslizándose alrededor del centro
   *            (sin cortes; con «reducir movimiento», corte seco a mitad del paso);
   *  16–23 s · Bellakat 16–17,5 · paso 0,7 s · Bellakroak 18,2–19,5 · paso 0,8 s · ANMI 20,3–21,2 (la paz sube cuando la cámara ya está con
   *            ella, 20,3–20,8) · hacia atrás hasta el plano de todos 21,2–23;
   *  23–26 s · grúa al cielo más lenta y suave (se ve cómo la cámara apunta al cielo);
   *  26–33 s · las nubes se juntan en el logo (más despacio, 26–31,5) y se queda; 33–36,5 s · «disponible el» y «30/10» (más despacio);
   *  36,5–46 s · letras quietas (con un acercamiento muy lento); 46–47 s · fundido.
   *  Todo en el marco del reto (snW / snH) y la cámara del mundo. `cut` = plano nuevo (la cámara salta sin transición). */
  // V10.4 R13 (usuario): 1 s más con el grupo (sky 23 → 24), grúa más lenta y suave (3 → 4,2 s, mirada con giro esférico), logo y fecha 1,4 s más
  // tarde (la espera final con la fecha baja de 9,5 a 8,1 s) y, 3 s después de completarse la fecha, un alejamiento muy lento hasta el fundido.
  // La escena sigue durando 47 s (misma música y mismo empalme)
  static readonly T = { kids: 16, hold: 1.9, group: 16, cat: 17.5, frog0: 18.2, frog: 19.5, anmi0: 20.3, anmi: 21.2, peace0: 20.3, peaceUp: 0.5,
    sky: 24, crane: 4.2, peaceOff: 24.4, peaceDown: 0.5, logo0: 27.4, logo1: 33.2, fecha0: 34.4, fechaA: 3.9, fechaB0: 37.9, fechaB: 4.0, fade0: 46, fade: 1.0,
    wave1: 17.6, away: 3, awayM: 1.6 };   // R16–R17 (usuario): «disponible el» 1,9 → 3,9 s y «30 / 10» 2,0 → 4,0 s, este empezando 2 s más tarde (37,9 s): fecha completa a 41,9 s
  /** Plano corto de Bellakroak o Bellakat (marco del reto). Usuario: «más de cerca, que prácticamente solo se les vea a ellos, y un poquito
   *  los de atrás»: de la cintura para arriba con el brazo del saludo dentro, desde su lado de dentro. */
  private closePose(a: any) {
    // desde el lado de dentro (ANMI, en el centro, queda detrás de la cámara y no asoma por el borde)
    const p = a.root.position, h = this.castH.get(a) ?? 1.1, out = Math.sign(p.x) || 1, yw = (a.yaw ?? 0) - 0.36 * out;
    const dir = new THREE.Vector3(Math.sin(yw), 0, Math.cos(yw)), d = h * 1.12;
    return { pos: p.clone().addScaledVector(dir, d).add(new THREE.Vector3(0, h * 0.8, 0)), look: p.clone().add(new THREE.Vector3(0, h * 0.7, 0)), hfov: 30 };
  }
  /** Bellakat → Bellakroak → ANMI (más lejos, es más alta) → hacia atrás hasta verlos a todos. */
  private groupShot(t: number) {
    const T = FinalCine.T, R = this.reduced, ez = (x: number) => x * x * (3 - 2 * x), { rana, fennec } = this.cast();
    const WIDE = { pos: new THREE.Vector3(0, 1.55, -0.6), look: new THREE.Vector3(0, 1.0, -6.0), hfov: 60 };
    const ANMI = { pos: new THREE.Vector3(-0.16, 1.46, -5.4 + 2.5), look: new THREE.Vector3(-0.13, 1.37, -5.4), hfov: 30 };   // de cabeza a cintura, con la paz
    const CAT = fennec ? this.closePose(fennec) : ANMI, FROG = rana ? this.closePose(rana) : ANMI;
    // [desde, hasta, plano A, plano B, arco hacia atrás en el paso]
    const segs: [number, number, typeof WIDE, typeof WIDE, number][] = [[T.group, T.cat, CAT, CAT, 0], [T.cat, T.frog0, CAT, FROG, 1.6], [T.frog0, T.frog, FROG, FROG, 0],
      [T.frog, T.anmi0, FROG, ANMI, 0.45], [T.anmi0, T.anmi, ANMI, ANMI, 0], [T.anmi, T.sky, ANMI, WIDE, 0]];
    let i = segs.findIndex((sg) => t < sg[1]); if (i < 0) i = segs.length - 1;
    const [t0, t1, A, B, arc] = segs[i], m = THREE.MathUtils.clamp((t - t0) / (t1 - t0), 0, 1);
    const still = A === B, e = R ? (m < 0.5 ? 0 : 1) : ez(m);
    const pos = A.pos.clone().lerp(B.pos, e), look = A.look.clone().lerp(B.look, e);
    if (still && !R) pos.lerp(look, 0.07 * m);   // acercamiento lento en cada plano
    pos.z += Math.sin(Math.PI * e) * arc;
    // con «reducir movimiento», cortes secos a mitad de cada paso
    const cut = R ? 10 + 2 * Math.floor(i / 2) + (i % 2 === 1 && m >= 0.5 ? 2 : 0) + (i === segs.length - 1 && m >= 0.5 ? 2 : 0) : 10;
    return { cut, pos: snW(pos), look: snW(look), hfov: A.hfov + (B.hfov - A.hfov) * e };
  }
  /** Plano «junto a un niño» en el marco del reto: ángulo y radio respecto al centro, altura, mirada y campo (para poder interpolar). */
  private kidPose(k: any, i: number) {
    const p = k.root.position, a = Math.atan2(p.x, p.z), r = Math.hypot(p.x, p.z), low = i % 3 === 1 ? -0.45 : 0;   // uno de cada tres, en contrapicado
    return { a, r: r - 2.6, rk: r, y: p.y + 1.2 + low, ly: p.y + 1.12 - low * 0.3, look: new THREE.Vector3(p.x, p.y + 1.12 - low * 0.3, p.z) };
  }
  private plan(t: number): { cut: number; pos: THREE.Vector3; look: THREE.Vector3; hfov: number } {
    const T = FinalCine.T, R = this.reduced, ez = (x: number) => x * x * (3 - 2 * x);
    // niños ordenados alrededor del centro (en el marco del reto: oeste de norte a sur y este de sur a norte)
    const kids = [...this.cast().kids].sort((u, v) => Math.atan2(u.root.position.x, u.root.position.z) - Math.atan2(v.root.position.x, v.root.position.z));
    if (t < T.kids && kids.length) {
      const n = kids.length, step = n > 1 ? (T.kids - T.hold) / (n - 1) : T.kids, tr = step - T.hold;   // 6 niños: paso de 0,92 s
      const i = Math.min(n - 1, Math.floor(t / step)), tl = t - i * step, inHold = tl < T.hold || i === n - 1;
      const A = this.kidPose(kids[i], i), B = i < n - 1 ? this.kidPose(kids[i + 1], i + 1) : A;
      let m = inHold ? 0 : (tl - T.hold) / tr; if (R) m = m < 0.5 ? 0 : 1; const e = ez(m);
      let da = B.a - A.a; if (da > Math.PI) da -= 2 * Math.PI; if (da < -Math.PI) da += 2 * Math.PI;
      const drift = R ? 0 : (inHold ? (tl / T.hold - 0.5) : 0) * 0.07 * (i % 2 ? 1 : -1);   // barrido lento con cada niño
      // en el paso largo (de un lado al otro, por encima de la recepción y de las mesas de Bellakroak y Bellakat) la cámara sube más
      const lift = 0.35 + 2.2 * THREE.MathUtils.clamp((Math.abs(da) - 0.8) / 1.2, 0, 1);
      const a = A.a + da * e + drift, r = A.r + (B.r - A.r) * e + Math.sin(Math.PI * e) * 0.9, y = A.y + (B.y - A.y) * e + Math.sin(Math.PI * e) * lift;
      // la mirada recorre el anillo de los niños (polar): en el paso, de cara a la escena y no al suelo del centro
      const far = Math.sin(Math.PI * e) * (4 + 14 * THREE.MathUtils.clamp((Math.abs(da) - 0.8) / 1.2, 0, 1));   // en el paso, la mirada se va lejos (barrido)
      const aL = A.a + da * e, rk = A.rk + (B.rk - A.rk) * e + far, ly = A.ly + (B.ly - A.ly) * e + far * 0.08;
      const pos = new THREE.Vector3(Math.sin(a) * r, y, Math.cos(a) * r), look = new THREE.Vector3(Math.sin(aL) * rk, ly, Math.cos(aL) * rk);
      return { cut: R ? (m < 0.5 ? i : i + 1) : 0, pos: snW(pos), look: snW(look), hfov: 40 + 8 * Math.sin(Math.PI * e) };
    }
    if (t < T.sky) return this.groupShot(t);
    // al cielo: la cámara sube como una grúa por encima del muro de A (que no tape el logo) y la mirada pasa del grupo al logo
    const x = Math.min(1, (t - T.sky) / T.crane), u = R ? 1 : x * x * x * (x * (6 * x - 15) + 10), L = SKY_LOGO.pos.clone().add(new THREE.Vector3(0, (this.logo?.midY ?? -0.1 * SKY_LOGO.width) - 0.04 * SKY_LOGO.width, 0));
    // R13: la mirada gira por la esfera (dirección interpolada) con una curva más suave que la subida (sin el tirón de antes, cuando el punto mirado
    // saltaba del grupo, a 6 m, al logo, lejos); antes de completar la fecha, acercamiento lento; 3 s después, alejamiento muy lento
    const v = R ? 1 : 0.5 - 0.5 * Math.cos(Math.PI * x);
    const pos = snW(new THREE.Vector3(0, 1.55, -0.6).lerp(new THREE.Vector3(0, 7.5, 2.5), u)), g0 = snW(new THREE.Vector3(0, 1.0, -6.0));
    const d0 = g0.clone().sub(snW(new THREE.Vector3(0, 1.55, -0.6))).normalize(), d1 = L.clone().sub(pos).normalize();
    const look = pos.clone().addScaledVector(new THREE.Vector3().copy(d0).lerp(d1, v).normalize(), 20);   /* solo cuenta la dirección (con el punto a 165 m, el rig lo usaba para su barrido de colisiones) */
    const fechaEnd = T.fechaB0 + T.fechaB, push = R ? 0 : 2 * THREE.MathUtils.clamp((t - T.sky - T.crane) / (fechaEnd - T.sky - T.crane), 0, 1);
    const aw = R ? 0 : THREE.MathUtils.clamp((t - fechaEnd - T.away) / (FINAL_LEN - fechaEnd - T.away), 0, 1), awe = aw * aw * (3 - 2 * aw);
    if (awe > 0) pos.addScaledVector(d1, -T.awayM * awe).add(new THREE.Vector3(0, 0.4 * awe, 0));
    return { cut: R && t - T.sky < 0.8 ? 31 : 32, pos, look, hfov: 60 - 2 * u - push + 1.5 * awe };   // plano amplio: logo y «disponible el 30/10» (con el 30/10 al doble) caben enteros
  }
  update(dt: number) {
    if (!this.active) return;
    const g = this.g; this.t += dt; const t = this.t, T = FinalCine.T;
    if (!this.formed && t >= T.group) { this.formed = true; this.formation(true); }
    const pl = this.plan(t);
    // cada uno saluda cuando la cámara llega a él; ANMI hace la paz desde que la cámara va hacia ella hasta que sube al cielo
    { const { rana, fennec } = this.cast();
      for (const [a, at] of [[fennec, T.group], [rana, T.wave1]] as const) if (a && t >= at && !this.waved.has(a)) { this.waved.add(a); a.gesture('Wave', 0.3); } }
    const vis = g.visual as any, ez = (x: number) => x * x * (3 - 2 * x);
    if (vis && 'peace' in vis) vis.peace = this.formed ? ez(THREE.MathUtils.clamp((t - T.peace0) / T.peaceUp, 0, 1)) * (1 - ez(THREE.MathUtils.clamp((t - T.peaceOff) / T.peaceDown, 0, 1))) : 0;
    if (pl.cut !== this.shot) {
      this.shot = pl.cut; this.pose.pos.copy(pl.pos); this.pose.look.copy(pl.look); this.pose.hfov = pl.hfov;
      g.rig.toScripted(() => this.pose, true);
    } else { this.pose.pos.copy(pl.pos); this.pose.look.copy(pl.look); this.pose.hfov = pl.hfov; }
    // V10.4 R13: la grúa al cielo, sin la corrección de colisiones del rig (va por encima del muro de A; el barrido la llevaba a las fachadas)
    (this.pose as any).free = t >= T.sky;
    // el logo: las nubes aparecen y se juntan; después la fecha
    const R = this.reduced;
    if (this.logo) { this.logo.update(dt, g.rig.cam, true);
      this.logo.logo.form(THREE.MathUtils.clamp((t - T.logo0) / (T.logo1 - T.logo0), 0, 1), !R);
      if (this.logo.fecha2) { this.logo.fecha.form(THREE.MathUtils.clamp((t - T.fecha0) / T.fechaA, 0, 1), !R); this.logo.fecha2.form(THREE.MathUtils.clamp((t - T.fechaB0) / T.fechaB, 0, 1), !R); }
      else this.logo.fecha.form(THREE.MathUtils.clamp((t - T.fecha0) / (T.fechaB0 + T.fechaB - T.fecha0), 0, 1), !R); }
    if (!this.ending && t >= T.fade0) this.end();
  }
  /** Fundido a negro, todo vuelve a su sitio y fundido de vuelta. `skip`: antes de tiempo (el logo queda formado). */
  end(skip = false) {
    if (!this.active || this.ending) return; this.ending = true; this.natural = true;   // V10.4: fin natural o SALTAR → despedida
    avisos.animacionFinal(skip); if (skip) avisos.saltar('escena-final');   // V10.6 (B5)
    const g = this.g, fade = document.getElementById('cine-fade');
    // V10.3 (W-D10, R3-09): al acabar, la pista de SN del parque (ventana 0:32–0:52) lleva el reloj de la canción de la escena: entra en el
    // mismo segundo (0:47 tras el fundido), llega al 0:52 y vuelve al 0:32. Al SALTAR (R3-10) la del parque empieza en el 0:32
    this.handoff = !skip && !!g.audio.music?.handoffFinal('secretnovio', PARK_SONG_IN);
    if (skip) g.audio.music?.restartTrack('secretnovio');
    if (!this.handoff) g.audio.music?.stopFinal(skip ? 0.25 : 0.6);
    else setTimeout(() => g.audio.music?.stopFinal(0.3), 2500);   // por si la pista del parque no llegara a arrancar
    // fundido a negro: al saltar, el corto de siempre; al acabar, de 1 s (46–47, W-D09)
    const T = FinalCine.T, slow = !skip;   // también con «reducir movimiento» (un fundido no es movimiento): la escena dura 47 s en los dos modos
    if (fade && slow) fade.style.transition = `opacity ${T.fade * 0.92}s ease`;
    fade?.classList.add('on');
    setTimeout(() => {
      this.logo?.rest();
      this.finish(); requestAnimationFrame(() => { if (fade) fade.style.transition = ''; fade?.classList.remove('on'); });
    }, skip ? 260 : slow ? T.fade * 1000 : 380);
  }
  /** Deja todo como estaba (también si se corta de golpe: recarga, «Volver a la plaza»). */
  finish() {
    if (!this.active) return; this.active = false; this.done = true;
    const g = this.g, s = g.skater!;
    if (this.homes.length) this.formation(false);
    { const vis = g.visual as any; if (vis && 'peace' in vis) vis.peace = 0; }
    if (this.saved) { s.teleport(this.saved.pos, this.saved.heading, this.saved.loco as any); s.vel.set(0, 0, 0); }
    s.frozen = false; this.src = null; if (!this.handoff) g.audio.music?.stopFinal(0.05);
    camFadeUniform.value.copy(this.fade0);
    document.body.classList.remove('cine', 'finale', 'finale-reducido');
    const sk = document.getElementById('btn-cine-skip'); if (sk) sk.hidden = true;
    this.logo?.rest();
    g.onFinaleEnd(this.natural); this.natural = false; g.log.push('escena final: fin');
  }
}
