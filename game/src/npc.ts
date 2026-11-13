// NPCs: un GLB derivado por personaje (malla skinned reducida + clips elegidos, rig propio). Las instancias se clonan con
// SkeletonUtils (comparten geometría y texturas; cada una tiene su esqueleto y mixer). Las tres chicas de FASHION GIRL
// son una sola base Bella Vibes con variantes por material (pelo, tez, iris) calculadas en el shader: sin texturas extra.
import * as THREE from 'three';
import * as SkeletonUtils from 'three/examples/jsm/utils/SkeletonUtils.js';
import { loadGlb } from './assets';

export interface Variant { hair: string; skin: number; iris: string; scale: number;
  /** V10 (violinistas de SECRETNOVIO, otra malla con el mismo esquema `_region`): luminancia media de la región 1 y sin iris (iris: ''). */
  hairLum?: number }

export class NpcActor {
  root = new THREE.Group();
  model: THREE.Object3D;
  mixer: THREE.AnimationMixer;
  actions = new Map<string, THREE.AnimationAction>();
  current: THREE.AnimationAction | null = null;
  idle = 'Idle';
  yaw = 0; private targetYaw: number | null = null;
  active = true;
  /** Sentada (V4-NMG-05): no gira el cuerpo hacia quien habla; la charla usa el gesto sentado. */
  seated = false;
  tris = 0;

  constructor(gltf: any, opts: { idle?: string; pingPongIdle?: boolean; variant?: Variant; timeScale?: number; phase?: number } = {}) {
    this.model = SkeletonUtils.clone(gltf.scene);
    this.model.updateMatrixWorld(true);
    this.model.traverse((o) => {
      const m = o as THREE.SkinnedMesh;
      if (m.isMesh) {
        m.castShadow = false; // sombra de contacto barata (mancha) en vez de pasada de sombra
        // V10 (D-EX-08, rendimiento): descarte por cámara con la esfera de la pose de reposo + 1,2 m de margen (gestos, baile); antes
        // `frustumCulled = false` dibujaba todos los NPC cargados aunque estuvieran detrás de la cámara
        if ((m as any).isSkinnedMesh) { m.computeBoundingSphere(); m.boundingSphere!.radius += 1.2; m.frustumCulled = true; } else m.frustumCulled = false;
        this.tris += (m.geometry.index ? m.geometry.index.count : m.geometry.attributes.position.count) / 3;
        if (opts.variant) m.material = variantMaterial(m.material as THREE.MeshStandardMaterial, opts.variant);
      }
    });
    if (opts.variant) this.model.scale.setScalar(opts.variant.scale);
    this.root.add(this.model);
    this.root.add(blobShadow(0.55));
    this.mixer = new THREE.AnimationMixer(this.model);
    for (const clip of gltf.animations as THREE.AnimationClip[]) this.actions.set(clip.name, this.mixer.clipAction(clip));
    this.idle = opts.idle ?? (this.actions.has('Idle') ? 'Idle' : [...this.actions.keys()][0]);
    const a = this.actions.get(this.idle)!;
    if (opts.pingPongIdle) a.setLoop(THREE.LoopPingPong, Infinity);
    a.timeScale = opts.timeScale ?? 1;
    a.play(); this.current = a;
    a.time = (opts.phase ?? Math.random()) * a.getClip().duration; // desfase: nunca tres copias sincronizadas
  }

  private pendingBack: (() => void) | null = null;
  /** Gesto puntual (opcionalmente recortado a `maxSec`); vuelve al reposo con mezcla al terminar. */
  gesture(name: string, fade = 0.3, timeScale = 1, maxSec = 0) {
    const a = this.actions.get(name); if (!a || !this.current) return 0;
    this.pendingBack?.();
    a.reset(); a.setLoop(THREE.LoopOnce, 1); a.clampWhenFinished = true; a.timeScale = timeScale;
    a.play(); if (this.current !== a) this.current.crossFadeTo(a, fade, false);
    const prev = this.actions.get(this.idle)!;
    let done = false;
    const back = () => { if (done) return; done = true; this.pendingBack = null; this.mixer.removeEventListener('finished', on); prev.reset(); prev.play(); a.crossFadeTo(prev, fade, false); this.current = prev; };
    const on = (e: any) => { if (e.action === a) back(); };
    this.mixer.addEventListener('finished', on);
    this.pendingBack = back;
    this.current = a;
    this.gestureLimit = maxSec > 0 ? maxSec : 0; this.gestureT = 0;
    return (maxSec > 0 ? Math.min(maxSec, a.getClip().duration / timeScale) : a.getClip().duration / timeScale);
  }
  private gestureLimit = 0; private gestureT = 0;
  /** Corta el gesto en curso y vuelve al reposo (cancelación de actividad). */
  backToIdle() { this.pendingBack?.(); }
  /** Cambia el bucle de reposo (p. ej. animar más fuerte durante el baile). */
  setLoop(name: string, fade = 0.4, timeScale = 1) {
    const a = this.actions.get(name); if (!a || a === this.current) return;
    a.reset(); a.setLoop(THREE.LoopRepeat, Infinity); a.timeScale = timeScale; a.play();
    this.current?.crossFadeTo(a, fade, false); this.current = a; this.idle = name;
  }
  /** V6 (D6-06): baile sincronizado con ANMI: la acción arranca en t = 0 en este mismo paso. `loop` = bucle (pasa a ser el
   *  reposo); si no, se baila una vez y vuelve al reposo vigente. false si el derivado no trae ese clip. */
  playSync(name: string, loop = true, fade = 0.3) {
    const a = this.actions.get(name); if (!a) return false;
    if (!loop) { this.gesture(name, fade, 1); return true; }
    this.pendingBack?.(); this.gestureLimit = 0;
    a.reset(); a.setLoop(THREE.LoopRepeat, Infinity); a.timeScale = 1; a.time = 0; a.play();
    if (this.current && this.current !== a) this.current.crossFadeTo(a, fade, false);
    this.current = a; this.idle = name;
    return true;
  }
  faceTo(p: THREE.Vector3) { if (this.seated && !this.seatPose) return; this.targetYaw = Math.atan2(p.x - this.root.position.x, p.z - this.root.position.z); }
  // R7 (usuario, 12 oct): La Pantera se LEVANTA del bordillo para hablar (Talk de pie) o bailar (Dance_*): la raíz avanza
  // `standFwd` m (fuera del bordillo) con un fundido; `sitBack` la devuelve al asiento y a su reposo sentado.
  private seatPose: { pos: THREE.Vector3; yaw: number } | null = null;
  /** R11 (F2): asiento fijo (el primero que se ve sentada). Antes, un `standLoop` justo tras `sitBack` (con la raíz aún de pie) tomaba la
   *  posición de pie como asiento y La Pantera acababa 0,45 m fuera de su banco. */
  private seatHome: { pos: THREE.Vector3; yaw: number } | null = null;
  private slide: { from: THREE.Vector3; to: THREE.Vector3; t: number; dur: number; yaw0?: number; yaw1?: number; linear?: boolean; arc?: number } | null = null;
  /** V7 R1 (usuario, 14 oct): Aissa y Juseph se LEVANTAN de la limo para hablar. `home` = asiento al que vuelven. */
  home: { pos: THREE.Vector3; yaw: number } | null = null;
  /** Bucle que NO cambia el reposo (`idle` sigue siendo el sentado). false si el derivado no trae el clip. */
  play(name: string, fade = 0.35, timeScale = 1) {
    const a = this.actions.get(name); if (!a) return false;
    if (a === this.current) return true;
    this.pendingBack?.(); this.gestureLimit = 0;
    a.reset(); a.setLoop(THREE.LoopRepeat, Infinity); a.timeScale = timeScale; a.play();
    this.current?.crossFadeTo(a, fade, false); this.current = a;
    return true;
  }
  /** Una vez y se queda en su último fotograma (sin volver al reposo): impulso y aterrizaje de un salto. */
  playOnce(name: string, fade = 0.15, timeScale = 1, startAt = 0) {
    const a = this.actions.get(name); if (!a) return false;
    this.pendingBack?.(); this.gestureLimit = 0;
    a.reset(); a.setLoop(THREE.LoopOnce, 1); a.clampWhenFinished = true; a.timeScale = timeScale; a.time = startAt; a.play();
    if (this.current && this.current !== a) this.current.crossFadeTo(a, fade, false);
    this.current = a; return true;
  }
  /** Lleva la raíz a `to` en `dur` s girando a `yaw` por el camino corto (suave, o a velocidad constante si `linear`);
   *  `arc` > 0 = parábola de salto de esa altura sobre la recta entre los dos puntos. */
  glide(to: THREE.Vector3, yaw: number, dur: number, linear = false, arc = 0) {
    this.targetYaw = null; this.yaw = THREE.MathUtils.euclideanModulo(this.yaw + Math.PI, Math.PI * 2) - Math.PI;   // sin vueltas acumuladas
    const d = THREE.MathUtils.euclideanModulo(yaw - this.yaw + Math.PI, Math.PI * 2) - Math.PI;
    this.slide = { from: this.root.position.clone(), to: to.clone(), t: 0, dur: Math.max(0.01, dur), yaw0: this.yaw, yaw1: this.yaw + d, linear, arc };
  }
  get gliding() { return !!this.slide; }
  get standing() { return !!this.seatPose; }
  standLoop(name: string, standFwd = 0.45, fade = 0.35, pingPong = false) {
    const a = this.actions.get(name); if (!a) return false;
    this.pendingBack?.(); this.gestureLimit = 0;   // corta un gesto en curso (quita su escucha de «finished»)
    if (this.seated && !this.seatPose) {
      this.seatHome ??= { pos: this.root.position.clone(), yaw: this.yaw };
      this.seatPose = { pos: this.seatHome.pos.clone(), yaw: this.seatHome.yaw };
      const to = this.seatHome.pos.clone().add(new THREE.Vector3(Math.sin(this.seatHome.yaw), 0, Math.cos(this.seatHome.yaw)).multiplyScalar(standFwd));
      this.slide = { from: this.root.position.clone(), to, t: 0, dur: 0.45 };
    }
    a.reset(); a.setLoop(pingPong ? THREE.LoopPingPong : THREE.LoopRepeat, Infinity); a.timeScale = 1; a.time = 0; a.play();
    if (this.current && this.current !== a) this.current.crossFadeTo(a, fade, false);
    this.current = a;
    return true;
  }
  sitBack(fade = 0.45) {
    if (!this.seatPose) return;
    const idle = this.actions.get(this.idle)!; idle.reset(); idle.play();
    if (this.current && this.current !== idle) this.current.crossFadeTo(idle, fade, false);
    this.current = idle;
    this.slide = { from: this.root.position.clone(), to: this.seatPose.pos.clone(), t: 0, dur: 0.45 };
    this.targetYaw = this.seatPose.yaw; this.seatPose = null;
  }
  /** V10.1 P21 (usuario: «al hablar con nosotros deberían mirarnos, mirando hacia arriba porque son más bajitos»): mirada con cuello (40 %) y
   *  cabeza (60 %) a un punto del mundo mientras `lookAt` devuelva uno; giro ±70°, levantar la vista hasta 35°, fundido ~0,3 s. Se aplica
   *  DESPUÉS del mixer (no se acumula: el mixer reescribe esos huesos en cada fotograma). Ejes locales medidos por el agente de personajes:
   *  +Y = girar hacia su izquierda, −X = levantar la vista. */
  lookAt: (() => THREE.Vector3 | null) | null = null;
  lookW = 0; lookYaw = 0; lookPitch = 0; private lookBones: [THREE.Bone, THREE.Bone] | null | undefined;
  private applyLook(dt: number) {
    if (!this.lookAt) return;
    if (this.lookBones === undefined) { let n: THREE.Bone | null = null, h: THREE.Bone | null = null; this.model.traverse((o) => { if ((o as THREE.Bone).isBone) { if (o.name.endsWith('Neck')) n = o as THREE.Bone; else if (/Head$/.test(o.name)) h = o as THREE.Bone; } }); this.lookBones = n && h ? [n, h] : null; }
    if (!this.lookBones) return;
    const T = this.lookAt(), [neck, head] = this.lookBones; let wy = 0, wp = 0, want = 0;
    if (T) { head.updateWorldMatrix(true, false); const hp = new THREE.Vector3().setFromMatrixPosition(head.matrixWorld), pyaw = this.root.parent ? new THREE.Euler().setFromQuaternion(this.root.parent.getWorldQuaternion(new THREE.Quaternion()), 'YXZ').y : 0, v = T.clone().sub(hp).applyAxisAngle(new THREE.Vector3(0, 1, 0), -(this.yaw + pyaw));   /* V10.1: + el giro del grupo padre (SN girado) */
      const yr = Math.atan2(v.x, v.z); if (Math.abs(yr) < THREE.MathUtils.degToRad(115)) { want = 1; wy = THREE.MathUtils.clamp(yr, -1.22, 1.22); wp = THREE.MathUtils.clamp(Math.atan2(v.y, Math.hypot(v.x, v.z)), -0.26, 0.61); } }
    const k = 1 - Math.exp(-dt / 0.1);
    this.lookW += (want - this.lookW) * k; if (want) { this.lookYaw += (wy - this.lookYaw) * k; this.lookPitch += (wp - this.lookPitch) * k; }
    if (this.lookW < 0.005) return;
    const q = new THREE.Quaternion(), e = new THREE.Euler(0, 0, 0, 'YXZ');
    for (const [b, f] of [[neck, 0.4], [head, 0.6]] as [THREE.Bone, number][]) { e.set(-this.lookPitch * f * this.lookW, this.lookYaw * f * this.lookW, 0, 'YXZ'); b.quaternion.multiply(q.setFromEuler(e)); }
  }
  update(dt: number) {
    if (!this.active) return;
    if (this.targetYaw !== null) {
      const d = THREE.MathUtils.euclideanModulo(this.targetYaw - this.yaw + Math.PI, Math.PI * 2) - Math.PI;
      this.yaw += d * (1 - Math.exp(-4 * dt));
      if (Math.abs(d) < 0.01) this.targetYaw = null;
    }
    if (this.slide) {
      const sl = this.slide; sl.t += dt; const k = Math.min(1, sl.t / sl.dur), e = sl.linear ? k : k * k * (3 - 2 * k);
      this.root.position.lerpVectors(sl.from, sl.to, e);
      if (sl.arc) this.root.position.y += sl.arc * 4 * k * (1 - k);
      if (sl.yaw0 !== undefined && sl.yaw1 !== undefined) this.yaw = sl.yaw0 + (sl.yaw1 - sl.yaw0) * e;
      if (k >= 1) this.slide = null;
    }
    this.root.rotation.y = this.yaw;
    if (this.gestureLimit > 0) { this.gestureT += dt; if (this.gestureT >= this.gestureLimit) { this.gestureLimit = 0; this.backToIdle(); } }
    if (this.waveSaved) { this.waveSaved.b.quaternion.copy(this.waveSaved.q); this.waveSaved = null; }
    if (this.footSaved) { this.footSaved.b.quaternion.copy(this.footSaved.q); this.footSaved = null; }
    this.mixer.update(dt);
    this.applyWave();   // V10.5 (G9)
    this.applyWalkFeet();   // V10.5 (G8)
    this.applyLook(dt);   // V10.1 P21
  }
  /** V10.5 (G9 de la revisión de animaciones, E5-35): en el saludo (`Wave`) la mano de Bellakat subía pegada a su oreja grande (de frente parecía
   *  tocarla): el hombro derecho se abre ~13° hacia fuera mientras dura el gesto (con su peso; se deshace antes del siguiente mixer.update). */
  /** V10.5 (G8 de la revisión de animaciones, E5-35): en el paso de la rana (`Walk`) el pie izquierdo se abría 80° y el derecho 60° (paso algo
   *  cojo): mientras anda, el izquierdo se gira lo que haga falta para abrirse lo mismo que el derecho (en espejo). Solo la rana (lo marca el juego). */
  walkFix = false;
  private footSaved: { b: THREE.Bone; q: THREE.Quaternion } | null = null; private feet: { lf: THREE.Bone; lt: THREE.Object3D; rf: THREE.Bone; rt: THREE.Object3D } | null | undefined;
  private applyWalkFeet() {
    const a = this.walkFix ? this.actions.get('Walk') : undefined; if (!a || !a.isRunning()) return; const w = a.getEffectiveWeight(); if (w < 0.05) return;
    if (this.feet === undefined) { const f: Record<string, THREE.Object3D> = {}; this.model.traverse((o) => { for (const n of ['LeftFoot', 'LeftToeBase', 'RightFoot', 'RightToeBase']) if (o.name.endsWith(n) && !f[n]) f[n] = o; });
      this.feet = f.LeftFoot && f.LeftToeBase && f.RightFoot && f.RightToeBase ? { lf: f.LeftFoot as THREE.Bone, lt: f.LeftToeBase, rf: f.RightFoot as THREE.Bone, rt: f.RightToeBase } : null; }
    const F = this.feet; if (!F || !F.lf.parent) return;
    this.model.updateMatrixWorld(true);
    const fwd = new THREE.Vector3(Math.sin(this.yaw), 0, Math.cos(this.yaw)), up = new THREE.Vector3(0, 1, 0);
    const ang = (foot: THREE.Object3D, toe: THREE.Object3D) => { const d = toe.getWorldPosition(new THREE.Vector3()).sub(foot.getWorldPosition(new THREE.Vector3())).setY(0); if (d.lengthSq() < 1e-8) return 0; d.normalize(); return Math.atan2(new THREE.Vector3().crossVectors(fwd, d).y, fwd.dot(d)); };
    const aL = ang(F.lf, F.lt), aR = ang(F.rf, F.rt), want = -aR, delta = THREE.MathUtils.clamp((want - aL) * w, -0.6, 0.6);
    if (Math.abs(delta) < 0.005) return;
    this.footSaved = { b: F.lf, q: F.lf.quaternion.clone() };
    const q = new THREE.Quaternion().setFromAxisAngle(up, delta), wq = F.lf.getWorldQuaternion(new THREE.Quaternion()), pq = F.lf.parent.getWorldQuaternion(new THREE.Quaternion());
    F.lf.quaternion.copy(pq.invert().multiply(q.multiply(wq))); F.lf.updateMatrixWorld(true);
  }
  /** Solo Bellakat (fennec): lo marca el juego. */
  waveOpen = false;
  private waveSaved: { b: THREE.Bone; q: THREE.Quaternion } | null = null; private waveArm: THREE.Bone | null | undefined; private waveHead: THREE.Bone | null = null;
  private applyWave() {
    const a = this.waveOpen ? this.actions.get('Wave') : undefined; if (!a) return; const w = a.isRunning() ? a.getEffectiveWeight() : 0; if (w < 0.02) return;
    if (this.waveArm === undefined) { this.waveArm = null; this.model.traverse((o) => { if ((o as THREE.Bone).isBone && /RightArm$/.test(o.name) && !this.waveArm) this.waveArm = o as THREE.Bone; if ((o as THREE.Bone).isBone && /Head$/.test(o.name) && !this.waveHead) this.waveHead = o as THREE.Bone; }); }
    const arm = this.waveArm, head = this.waveHead; if (!arm || !head || !arm.parent) return;
    this.waveSaved = { b: arm, q: arm.quaternion.clone() };
    this.model.updateMatrixWorld(true);
    const fwd = new THREE.Vector3(Math.sin(this.yaw), 0, Math.cos(this.yaw)), hand = arm.children[0]?.children[0] ?? arm.children[0];
    if (!hand) return;
    const dist = () => hand.getWorldPosition(new THREE.Vector3()).distanceTo(head.getWorldPosition(new THREE.Vector3()));
    const turn = (ang: number) => { const q = new THREE.Quaternion().setFromAxisAngle(fwd, ang), wq = arm.getWorldQuaternion(new THREE.Quaternion()), pq = arm.parent!.getWorldQuaternion(new THREE.Quaternion()); arm.quaternion.copy(pq.invert().multiply(q.multiply(wq))); arm.updateMatrixWorld(true); };
    const d0 = dist(), ang = 0.23 * w; turn(ang); if (dist() < d0) { arm.quaternion.copy(this.waveSaved.q); arm.updateMatrixWorld(true); turn(-ang); }
  }
  place(p: THREE.Vector3, yaw: number) { this.root.position.copy(p); this.yaw = yaw; this.root.rotation.y = yaw; }
}

let BLOB: THREE.Texture | null = null;
/** Mancha de sombra de contacto (un quad): sustituye la sombra proyectada de NPCs y cassettes en móvil. */
export function blobShadow(r: number) {
  if (!BLOB) {
    const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d')!;
    const gr = g.createRadialGradient(32, 32, 2, 32, 32, 32); gr.addColorStop(0, 'rgba(0,0,0,0.55)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = gr; g.fillRect(0, 0, 64, 64); BLOB = new THREE.CanvasTexture(c);
  }
  const m = new THREE.Mesh(new THREE.PlaneGeometry(r * 2, r * 2), new THREE.MeshBasicMaterial({ map: BLOB, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4 }));
  m.rotation.x = -Math.PI / 2; m.position.y = 0.02; m.renderOrder = 1;
  return m;
}

/** V10: Fennec de NVDA = derivado rosa aprobado (assets/derived/v10/rana_fennec_rosa). */
const NPC_GLB: Record<string, string> = { fennec: 'fennec_rosa', rana: 'rana_rosa' };   // IT3 (usuario): la rana de YINYANG también es la Rana nueva (v3, con Walk)
export async function loadNpcGltf(id: string) { return loadGlb(`npcs/${NPC_GLB[id] ?? id}.glb`); }

// ------------------------------------------------------------------ variantes de Bella (shader)
// Regiones explícitas por isla UV (atributo _region del builder, NPC-02): 1 pelo, 2 piel/cara, 0 resto. Antes eran
// umbrales de color por píxel, que teñían las fosas nasales y dejaban mechones oscuros sin teñir. El iris sigue siendo
// «oscuro dentro de la caja de los ojos en reposo» (probe_eyes.py), fuera del pelo.
const EYE_BOX = { min: new THREE.Vector3(-0.098, 1.555, 0.165), max: new THREE.Vector3(0.098, 1.64, 0.215) };
const HAIR_MEAN_LUM = 0.1794;   // luminancia lineal media del pelo en el atlas (report.json → regions)

function variantMaterial(base: THREE.MeshStandardMaterial, v: Variant) {
  const m = base.clone();
  const hair = new THREE.Color(v.hair), iris = new THREE.Color(v.iris || '#000000'), irisOn = v.iris ? 1 : 0, lumRef = v.hairLum ?? HAIR_MEAN_LUM;
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uHair = { value: hair }; sh.uniforms.uIris = { value: iris }; sh.uniforms.uSkin = { value: v.skin }; sh.uniforms.uIrisOn = { value: irisOn };
    sh.uniforms.uEyeMin = { value: EYE_BOX.min }; sh.uniforms.uEyeMax = { value: EYE_BOX.max };
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute float _region; varying vec3 vBindPos; varying float vRegion;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvBindPos = position; vRegion = _region;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>
varying vec3 vBindPos; varying float vRegion; uniform vec3 uHair; uniform vec3 uIris; uniform float uSkin; uniform float uIrisOn; uniform vec3 uEyeMin; uniform vec3 uEyeMax;`)
      .replace('#include <map_fragment>', `#include <map_fragment>
{
  vec3 c = diffuseColor.rgb;
  float lum = dot(c, vec3(0.299, 0.587, 0.114));
  float hairM = 1. - step(0.5, abs(vRegion - 1.));
  float skinM = 1. - step(0.5, abs(vRegion - 2.));
  bool inEye = all(greaterThan(vBindPos, uEyeMin)) && all(lessThan(vBindPos, uEyeMax));
  float irisM = inEye ? (1. - smoothstep(0.035, 0.09, lum)) * (1. - hairM) * uIrisOn : 0.;
  c = mix(c, clamp(uHair * (lum / ${lumRef.toFixed(4)}), 0., 1.5), hairM);
  c = mix(c, c * uSkin, skinM * (1. - irisM));
  c = mix(c, uIris * (0.4 + lum * 8.), irisM);
  diffuseColor.rgb = c;
}`);
  };
  m.customProgramCacheKey = () => `bella_r_${v.hair}_${v.skin}_${v.iris}_${lumRef}`;
  return m;
}

/** Reparto propuesto (07, ajustable): rubia/ojos castaño oscuro/0,94/tez más clara; castaña/castaño claro/1,0/base;
 *  pelo negro/ojos negros/1,06/tez algo más profunda. */
const BELLA_BASE: Variant[] = [
  { hair: '#e0b25e', iris: '#3b2414', skin: 1.07, scale: 0.94 },
  { hair: '#94663f', iris: '#8a5a32', skin: 1.0, scale: 1.0 },
  { hair: '#141016', iris: '#0b0a0c', skin: 0.84, scale: 1.06 },
];
export const BELLA_VARIANTS: Variant[] = [
  ...BELLA_BASE,
  // V6 (JUGABILIDAD): dos variantes intermedias calculadas desde las tres reales (punto medio en espacio LINEAL, el mismo en
  // que el shader multiplica el color del pelo y del iris; tez y escala también a medio camino): rubia↔castaña y castaña↔negra
  ...[[0, 1], [1, 2]].map(([a, b]) => mixVariant(a, b)),
];
function mixVariant(i: number, j: number): Variant {
  const V0 = BELLA_BASE[i], V1 = BELLA_BASE[j];
  const mid = (x: string, y: string) => '#' + new THREE.Color(x).lerp(new THREE.Color(y), 0.5).getHexString();
  return { hair: mid(V0.hair, V1.hair), iris: mid(V0.iris, V1.iris), skin: +((V0.skin + V1.skin) / 2).toFixed(3), scale: +((V0.scale + V1.scale) / 2).toFixed(3) };
}
