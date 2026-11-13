// Coches de drifting de SECRETNOVIO (V4: HUM-A4-007/009, cap. 08).
// - V10.3 (W04): derrapan SIEMPRE, también antes de 20, detrás de la valla del centro (world/valla.ts).
// - Aparecen JUNTOS en oposición exacta: un único estado de pista `phase` (reloj de simulación); coche A = phase,
//   coche B = phase + π. Velocidad angular constante, sentido antihorario visto desde arriba, NUNCA ceden el paso (ni al
//   jugador ni durante el final). Pausa/preview congelan la simulación global (no hay pasos fijos), no es una cesión.
// - Frente: en el GLB derivado el morro está en −X (comprobado por render, V4/evidencias/CAR-01); el envoltorio lo lleva
//   a +Z una sola vez. El yaw visible = rumbo de la tangente + derrape HACIA DENTRO de la curva (giro a la izquierda).
// - Colisión: cuerpo cinemático por coche (caja orientada con la pose) que bloquea al KCC; el impacto se decide de forma
//   analítica caja–cápsula con barrido entre la pose anterior y la actual y la velocidad NORMAL relativa en el contacto.
import * as THREE from 'three';
import { ASSET_BASE } from './assets';
import RAPIER from '@dimforge/rapier3d-compat';
import { driftCar } from './world/props';
import { Materials } from './world/geo';
import { TrailMarks } from './fx';
/** V10.5 (O-13): temporales reutilizados por paso (antes, ~36 vectores nuevos por paso en el contacto). */
const _cp = new THREE.Vector3(), _pp = new THREE.Vector3(), _q = new THREE.Quaternion(), _up = new THREE.Vector3(0, 1, 0);

export const CARS = {
  R: 19,                                       // V10 (SECRETNOVIO §6, contrato: órbita 19 en el anillo de asfalto r 16–22; envolvente 2,64)
  // V10.3 R1 (U-14, resuelve D2-21): 10,5 m/s con el golpe rehecho (tuning: carAhead 1,25 y tope carMaxH 15: sale por delante del coche)
  W: 10.5 / 19,                                // rad/s
  DRIFT: THREE.MathUtils.degToRad(22),         // derrape medio hacia dentro de la curva (antes 28° fijos)
  // V10.2 Q06 (D2-05, usuario: «que culeen un poco para hacerlos sentir vivos»): el derrape oscila 22° ± 9° (13–31°, dentro de lo que exige
  // cars-v4) con dos senos de frecuencias no múltiplos sobre la fase de la órbita: determinista y el mismo para la malla y la caja de choque;
  // su giro es lento (≤ ~0,4 rad/s), la caja no barre de golpe
  WOBBLE: [[THREE.MathUtils.degToRad(6), 3, 0], [THREE.MathUtils.degToRad(3), 7.3, 1.1]] as [number, number, number][],
  half: new THREE.Vector3(0.93, 0.72, 2.15),   // semiextensiones del proxy (ancho, alto, largo) medidas del derivado 4,3 × 1,52 × 1,81
  wheelR: 0.345,
};
const R = CARS.R;

/** V10.1 P26: tono base de la carrocería del GLB (fucsia del modelo). El segundo coche usa esta MISMA pintura (paints[1]). */
const CAR_BASE_PINK = new THREE.Color(1, 1, 1);
export interface CarContact { car: number; n: THREE.Vector3; depth: number; carVel: THREE.Vector3 }
interface Car { g: THREE.Group; wheels: THREE.Object3D[]; body: RAPIER.RigidBody | null; col: RAPIER.Collider | null; offset: number;
  pos: THREE.Vector3; prevPos: THREE.Vector3; yaw: number; prevYaw: number; vel: THREE.Vector3 }

export class DriftCars {
  group = new THREE.Group();
  cars: Car[] = [];
  active = false;
  /** Fase común de la pareja (rad); A = phase, B = phase + π. Avanza solo con pasos fijos. */
  phase = 0;
  prevPhase = 0;
  stepCount = 0;
  /** V10.3 (perf-v8: los coches derrapan desde el principio): el humo es UNA nube de puntos (una llamada de dibujo) en vez de un sprite con su
   *  material por bocanada (hasta 28 llamadas). Cada bocanada: posición, velocidad, vida y escala; opacidad = vida × 0,35, como antes. */
  private smoke: { p: THREE.Vector3; v: THREE.Vector3; life: number; k: number }[] = [];
  private smokePts!: THREE.Points;
  /** V10.2 Q15 + R-06a: marcas en tira por rueda trasera (4 pistas: 2 coches × 2), siguiendo su trayectoria real con el culeo. */
  private trail!: TrailMarks;
  get marks() { return this.trail.mesh; }
  private markT = 0;
  quality = 1;
  /** Siempre 0 en V4: se conserva el campo para diagnósticos/pruebas heredadas (los coches no ceden). */
  readonly yielding = 0;
  readonly R = CARS.R;   // V10: radio de la pista (lo leen las pruebas para la banda de coches)
  private paints: THREE.MeshStandardMaterial[] = [];
  static readonly ENVELOPE = Math.hypot(4.3 / 2, 1.85 / 2) + 0.3;

  constructor(mats: Materials, smokeTex: THREE.Texture, private world: RAPIER.World) {
    const paints = this.paints = [new THREE.MeshStandardMaterial({ color: '#F18AAE', roughness: 0.35, metalness: 0.4 }), new THREE.MeshStandardMaterial({ color: '#F18AAE', roughness: 0.35, metalness: 0.4 })];   // IT3: los dos rosas
    paints[1].color.copy(CAR_BASE_PINK);   // V10.1 P26: el segundo, con el tono del modelo (repintado relativo = identidad)
    for (let i = 0; i < 2; i++) {
      const g = driftCar(paints[i], mats);
      g.visible = false;
      this.group.add(g);
      this.cars.push({ g, wheels: g.userData.wheels, body: null, col: null, offset: i * Math.PI, pos: new THREE.Vector3(), prevPos: new THREE.Vector3(), yaw: 0, prevYaw: 0, vel: new THREE.Vector3() });
    }
    // cuerpos cinemáticos (creados desactivados: antes de 20 no existe colisión de coche)
    for (const c of this.cars) {
      c.body = world.createRigidBody(RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(0, -50, 0));
      c.col = world.createCollider(RAPIER.ColliderDesc.cuboid(CARS.half.x, CARS.half.y, CARS.half.z).setTranslation(0, CARS.half.y + 0.05, 0), c.body);
      c.col.setEnabled(false);
    }
    { const MAX = 64, g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(MAX * 3), 3)); g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(MAX * 4), 4)); g.setAttribute('aScale', new THREE.BufferAttribute(new Float32Array(MAX), 1));
      const m = new THREE.PointsMaterial({ map: smokeTex, color: '#e8e2ea', size: 1.4, sizeAttenuation: true, transparent: true, depthWrite: false, vertexColors: true });
      m.onBeforeCompile = (sh) => { sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute float aScale;').replace('gl_PointSize = size;', 'gl_PointSize = size * aScale;'); };
      m.customProgramCacheKey = () => 'bk_humo_v103';
      this.smokePts = new THREE.Points(g, m); this.smokePts.name = 'CAR_SMOKE'; this.smokePts.frustumCulled = false; g.setDrawRange(0, 0); this.group.add(this.smokePts); }
    this.trail = new TrailMarks(this.group, { n: 1100, tracks: 4, width: 0.2, life: 6, step: 0.25, color: '#141216', opacity: 0.42, name: 'CAR_MARKS', lift: 0.012 });
    this.group.visible = false;
  }

  get colliderHandles() { return this.cars.map((c) => c.col!.handle); }

  /** Activa (20) o retira (0–19) la pareja. Al activar, `phase0` = fase inicial elegida para no aparecer sobre ANMI. */
  setActive(on: boolean, phase0?: number) {
    if (on && !this.active) {
      this.phase = this.prevPhase = phase0 ?? this.phase;
      this.place(0, true);
    }
    if (!on) { this.clearFx(); for (const c of this.cars) c.body!.setNextKinematicTranslation({ x: 0, y: -50, z: 0 }); }
    this.active = on; this.group.visible = on;
    for (const c of this.cars) { c.g.visible = on; c.col!.setEnabled(on); }
  }
  private clearFx() {
    this.smoke = []; this.smokePts.geometry.setDrawRange(0, 0); this.trail.clear();
  }
  /** Fase inicial segura: la pareja (en π) con ambos coches a ≥ `clear` m de ANMI (y del corredor si se pide). */
  static safePhase(player: THREE.Vector3, clear = 9) {
    let best = 0, bestD = -1;
    for (let k = 0; k < 72; k++) {
      const a = k / 72 * Math.PI * 2;
      const d = Math.min(...[0, Math.PI].map((o) => { const p = DriftCars.poseAt(a + o).pos; return Math.hypot(p.x - player.x, p.z - player.z); }));
      if (d > bestD) { bestD = d; best = a; }
      if (d >= clear && k > 0 && bestD >= clear) break;
    }
    return best;
  }

  /** Interpolación de yaw por la diferencia angular MÍNIMA: al cruzar ±π el lerp directo daba la vuelta larga (el coche
   *  giraba ~360° en un fotograma y la caja del barrido de contacto quedaba orientada mal en ese subpaso). */
  static lerpYaw(a: number, b: number, t: number) { return a + (THREE.MathUtils.euclideanModulo(b - a + Math.PI, Math.PI * 2) - Math.PI) * t; }

  /** Pose de un coche en la pista para la fase `a` (posición, yaw visible con derrape, velocidad lineal). */
  static poseAt(a: number) {
    const pos = new THREE.Vector3(Math.sin(a) * R, 0, -Math.cos(a) * R);
    const tangent = Math.atan2(-Math.cos(a), -Math.sin(a));       // la fase DECRECE: antihorario visto desde arriba
    const vel = new THREE.Vector3(Math.sin(tangent), 0, Math.cos(tangent)).multiplyScalar(CARS.W * R);
    return { pos, yaw: tangent + DriftCars.driftAt(a), tangent, vel };
  }
  /** V10.2 Q06: derrape (rad, hacia dentro) en la fase `a` de la órbita. */
  static driftAt(a: number) { let d = CARS.DRIFT; for (const [A, k, ph] of CARS.WOBBLE) d += A * Math.sin(k * a + ph); return d;
  }

  /** Paso fijo: avanza la fase común y coloca cuerpos cinemáticos (se aplican en el world.step de este paso). */
  step(dt: number) {
    if (!this.active) return;
    this.prevPhase = this.phase;
    this.phase -= CARS.W * dt;
    this.stepCount++;
    this.place(dt, false);
  }
  private place(dt: number, snap: boolean) {
    for (const c of this.cars) {
      const p = DriftCars.poseAt(this.phase + c.offset);
      c.prevPos.copy(snap ? p.pos : c.pos); c.prevYaw = snap ? p.yaw : c.yaw;
      c.pos.copy(p.pos); c.yaw = p.yaw; c.vel.copy(p.vel);
      const q = _q.setFromAxisAngle(_up, p.yaw);
      if (snap) { c.body!.setTranslation(p.pos, true); c.body!.setRotation(q, true); }
      c.body!.setNextKinematicTranslation(p.pos); c.body!.setNextKinematicRotation(q);
    }
    void dt;
  }

  /** Separación angular real entre los dos coches (rad, en [0, π]); debe ser π. */
  get separation() {
    const a = this.cars[0].pos, b = this.cars[1].pos;
    const ta = Math.atan2(a.x, -a.z), tb = Math.atan2(b.x, -b.z);
    return Math.abs(((ta - tb + 3 * Math.PI) % (2 * Math.PI)) - Math.PI);
  }

  /**
   * Contacto analítico con la cápsula de ANMI (pie `foot`, radio `rad`, altura `h`) usando la caja orientada de cada coche,
   * con barrido entre la posición relativa anterior y la actual (8 submuestras). Devuelve el contacto más profundo.
   */
  contact(foot: THREE.Vector3, prevFoot: THREE.Vector3, rad: number, h: number): CarContact | null {
    if (!this.active) return null;
    let best: CarContact | null = null as CarContact | null;
    this.cars.forEach((c, i) => {
      if (Math.hypot(foot.x - c.pos.x, foot.z - c.pos.z) > 8) return;   // V10.5 (O-13): lejos del coche, sin barrido (el coche mide < 5 m y avanza 0,15 m por paso)
      for (let k = 0; k <= 8; k++) {
        const u = k / 8;
        const cp = _cp.copy(c.prevPos).lerp(c.pos, u), yaw = DriftCars.lerpYaw(c.prevYaw, c.yaw, u);   // V10.5 (O-13): sin crear vectores por submuestra
        const pp = _pp.copy(prevFoot).lerp(foot, u);
        if (pp.y > CARS.half.y * 2 + 0.1 || pp.y + h < 0) continue;      // por encima del techo o debajo: sin contacto
        const cs = Math.cos(yaw), sn = Math.sin(yaw);
        const dx = pp.x - cp.x, dz = pp.z - cp.z;
        const lx = dx * cs - dz * sn, lz = dx * sn + dz * cs;          // local (x = ancho, z = largo)
        const qx = THREE.MathUtils.clamp(lx, -CARS.half.x, CARS.half.x), qz = THREE.MathUtils.clamp(lz, -CARS.half.z, CARS.half.z);
        let nx = lx - qx, nz = lz - qz; let d = Math.hypot(nx, nz);
        let depth = rad - d;
        if (d < 1e-4) { // dentro de la caja: sale por el lado más cercano
          const ex = CARS.half.x - Math.abs(lx), ez = CARS.half.z - Math.abs(lz);
          if (ex < ez) { nx = Math.sign(lx) || 1; nz = 0; depth = rad + ex; } else { nx = 0; nz = Math.sign(lz) || 1; depth = rad + ez; }
          d = 1;
        }
        if (depth <= 0) continue;
        nx /= d; nz /= d;
        const n = new THREE.Vector3(nx * cs + nz * sn, 0, -nx * sn + nz * cs).normalize(); // a mundo (inversa de la rotación)
        if (!best || depth > best.depth) best = { car: i, n, depth, carVel: c.vel.clone() };
        break;
      }
    });
    return best;
  }

  /** Presentación (cada fotograma de render): pose interpolada, ruedas, humo y huellas. Sin efectos si está inactivo. */
  /** V10.3 (perf-v8): llantas y rótulos de cada coche (de lejos no se distinguen: se dejan de dibujar a > 32 m de la cámara). */
  private lod: THREE.Object3D[][] = [[], []];
  present(dt: number, alpha: number, cam?: THREE.Vector3) {
    if (cam) this.cars.forEach((c, i) => { const far = c.g.position.distanceTo(cam) > 32; for (const o of this.lod[i]) o.visible = !far; });
    if (!this.active) return;
    dt = Math.min(dt, 0.1);
    const w = CARS.W;
    this.markT += dt; this.trail.setTime(this.markT);   // V10.2 Q15: reloj de las marcas (su fundido)
    for (const c of this.cars) {
      const pos = c.prevPos.clone().lerp(c.pos, alpha), yaw = DriftCars.lerpYaw(c.prevYaw, c.yaw, alpha);
      c.g.position.copy(pos); c.g.rotation.y = yaw;
      for (const wh of c.wheels) { if (wh.userData.axis === 'z') wh.rotation.z += (wh.userData.spin ?? 1) * w * R / CARS.wheelR * dt; else wh.rotation.x += w * R / CARS.wheelR * dt; }
      // humo y huellas desde la TRASERA real (−frente del coche)
      if (Math.random() < dt * 14 * this.quality && this.smoke.length < 28 * this.quality) {
        const back = new THREE.Vector3(Math.sin(yaw), 0, Math.cos(yaw)).multiplyScalar(-1.6);
        this.smoke.push({ p: pos.clone().add(back).add(new THREE.Vector3(0, 0.3, 0)), v: new THREE.Vector3((Math.random() - 0.5) * 0.6, 0.6, (Math.random() - 0.5) * 0.6), life: 1.2, k: 1 });
      }
    }
    // V10.2 Q15: cada rueda trasera deja su tira (desde la pose real: con el culeo la trasera barre y la marca lo dibuja)
    { const up = new THREE.Vector3(0, 1, 0);
      this.cars.forEach((c, ci) => [-0.8, 0.8].forEach((sx, k) => { const p = new THREE.Vector3(sx, 0, -1.35).applyAxisAngle(up, c.g.rotation.y).add(c.g.position); p.y = 0; this.trail.push(ci * 2 + k, p, up, this.markT); })); }
    for (let i = this.smoke.length - 1; i >= 0; i--) { const p = this.smoke[i]; p.life -= dt; p.p.addScaledVector(p.v, dt); p.k *= 1 + dt * 0.9; if (p.life <= 0) this.smoke.splice(i, 1); }
    { const g = this.smokePts.geometry, P = g.attributes.position as THREE.BufferAttribute, C = g.attributes.color as THREE.BufferAttribute, S = g.attributes.aScale as THREE.BufferAttribute, n = Math.min(this.smoke.length, P.count);
      for (let i = 0; i < n; i++) { const q = this.smoke[i]; P.setXYZ(i, q.p.x - this.group.position.x, q.p.y - this.group.position.y, q.p.z - this.group.position.z); C.setXYZW(i, 1, 1, 1, Math.max(0, q.life * 0.35)); S.setX(i, q.k); }
      P.needsUpdate = C.needsUpdate = S.needsUpdate = true; g.setDrawRange(0, n); }
  }

  /** Sustituye la carrocería procedural por el derivado. Morro del GLB en −X (CAR-01) → +Z del coche: rotación +π/2.
   *  Ruedas = nodos wheel_*; el sentido de giro se toma del morro real (las «FL/FR» del derivado V3 están en la trasera). */
  /** V5 T5-28: el GLB horneado es rosa; el segundo coche recolorea en el shader SOLO los píxeles rosas de la carrocería con su
   *  pintura (`paints[1]`, como pretendía el código), conservando la luminancia (sombras y desgaste horneados). */
  private repaint(mat: THREE.MeshStandardMaterial, color: THREE.Color) {
    const m = mat.clone(); m.name = mat.name + '_repaint';
    // V10.1 P26 (usuario: «los dos con el rosa fucsia del modelo original»): repintado RELATIVO al tono base del modelo (uPaint / uBase): con
    // la pintura igual al tono base el segundo coche queda idéntico al primero (antes se repintaba con un rosa chicle uniforme)
    m.onBeforeCompile = (sh) => {
      sh.uniforms.uPaint = { value: color }; sh.uniforms.uBase = { value: CAR_BASE_PINK };
      sh.fragmentShader = 'uniform vec3 uPaint; uniform vec3 uBase;\n' + sh.fragmentShader.replace('#include <map_fragment>', `#include <map_fragment>
        { vec3 c0 = diffuseColor.rgb; float pk = smoothstep(0.10, 0.28, c0.r - c0.g) * smoothstep(0.0, 0.1, c0.r - c0.b * 0.9);
          diffuseColor.rgb = mix(c0, clamp(c0 * (uPaint / max(uBase, vec3(0.02))), 0.0, 1.0), pk); }`);
    };
    m.customProgramCacheKey = () => 'repaint';
    return m;
  }
  useModel(scene: THREE.Object3D) {
    for (const [ci, c] of this.cars.entries()) {
      const vis = c.g.visible;
      for (const ch of [...c.g.children]) c.g.remove(ch);
      const wrap = new THREE.Group(); wrap.rotation.y = Math.PI / 2; wrap.name = 'CAR_FRONT_FIX(-X→+Z)';
      const m = scene.clone(true); wrap.add(m); c.g.add(wrap);
      const wheels: THREE.Object3D[] = []; this.lod[this.cars.indexOf(c)] = [];
      m.traverse((o: any) => {
        // V10.3 (perf-v8, coches desde el principio): solo la carrocería proyecta sombra (ruedas, cristales y rótulos quedan bajo ella y doblaban
        // las llamadas de dibujo en la pasada de sombra)
        if (o.isMesh && (/lettering/i.test(o.name) || /rim/i.test(String(o.material?.name ?? '')))) this.lod[this.cars.indexOf(c)]?.push(o);
        if (o.isMesh) { const mn = String((o.material as any)?.name ?? ''); o.castShadow = !/wheel|lettering/i.test(o.name) && !/glass|tire|rim/i.test(mn); o.receiveShadow = true; }
        // solo el nodo de la rueda (sus primitivas por material se exportan como hijas wheel_XX_1/_2)
        if (/^wheel_[^_]+$/.test(o.name)) { o.userData.spin = Math.abs(o.quaternion.y) > 0.5 ? 1 : -1; o.userData.axis = 'z'; wheels.push(o); }
        if (o.isMesh && /lettering/i.test(o.material?.name ?? '')) { o.material = o.material.clone(); o.material.polygonOffset = true; o.material.polygonOffsetFactor = -2; o.material.alphaTest = 0.4; o.material.transparent = false;
          // V10 (SECRETNOVIO §5, §7): el rótulo dice el nombre vigente, negro y sin espejo en los dos lados (receta assets/derived/v10/secretnovio/make_sn_car_lettering.py)
          const old = o.material.map as THREE.Texture | null, t = new THREE.TextureLoader().load(`${ASSET_BASE}tex/T_secretnovio_lettering.webp`);
          if (old) { t.flipY = old.flipY; t.colorSpace = old.colorSpace; t.wrapS = old.wrapS; t.wrapT = old.wrapT; t.anisotropy = 8; }
          o.material.map = t; o.material.name = 'M_car_lettering_secretnovio'; o.material.needsUpdate = true; }
        // V10 IT3 (feedback: «los dos coches del centro deben ser rosas de SN»): el segundo coche sigue con SU pintura (`paints[1]`, contrato
        // de vehicles-v5), que ahora es el mismo rosa SN en vez de carbón
        if (ci === 1 && o.isMesh && /^M_car$/.test(o.material?.name ?? '')) o.material = this.repaint(o.material, this.paints[1].color);
      });
      c.wheels = wheels; c.g.visible = vis;
    }
  }

  /** Distancia mínima entre la envolvente de cualquier coche y un punto. */
  clearance(p: THREE.Vector3) {
    let d = Infinity;
    for (const c of this.cars) d = Math.min(d, Math.hypot(c.pos.x - p.x, c.pos.z - p.z) - DriftCars.ENVELOPE);
    return d;
  }
  get avgSpeed() { return this.active ? CARS.W * R : 0; }
}
