// Presentación de ANMI (V3): árbol de mezcla por pesos sobre clips horneados, conducido por el estado físico.
// Autoridad (BASE-02): la posición y el rumbo vienen del controlador (snapshots interpolados, CTRL-07); los clips no
// trasladan el cuerpo. Capas:
//   root  → posición interpolada + alineación al suelo + rumbo de marcha (+π en fakie, + giro de revert/spin)
//   spin  → yaw de trucos (180/360) con el ángulo acumulado del controlador
//   pivot → giro corporal de flips (front/back/triple) a la altura de la cadera; ÚNICO dueño de esas vueltas
//   Board → hueso de la tabla: el clip la coloca (pies, mano, apoyo) y la capa de flip añade el giro sobre su eje largo
//           restaurando antes la base evaluada (no acumula multiplicaciones).
// Fases autoritativas: Push, Scoot, Pop, Catch, Land, FlipKick, Mount/Dismount fijan su tiempo desde el controlador.
// Overrides (bailes, charla) con entrada/salida limpia; la vuelta al árbol usa reloj de presentación (no setTimeout).
import { SPRAY, sprayAim, zigzag, strokeK, type SprayJob } from './spray';
import * as THREE from 'three';
import * as SkeletonUtils from 'three/examples/jsm/utils/SkeletonUtils.js';
import { loadGlb, loadJson } from './assets';
import { Skater, SkaterVisual, TUNING, angleDiff, ease } from './skater';

/** R11 (ANIM-02): velocidad natural medida de SK_CrouchWalk (m/s de la zancada del pie de apoyo). */
const CROUCH_WALK_SPEED = 1.33;   // medido en r11/f14-slide2 (pie de apoyo): escala 2,5 → 1,47 m/s; 1,4 → 0,55; 1,0 → 0,45; 0,75 → 0,36 (mínimo); 0,625 → 0,41
interface ClipMeta { loop: boolean; seconds: number; contact?: number[]; takeoff?: number; release?: number[]; events?: Record<string, number>; natural_speed?: number; phases?: Record<string, number> }

const Y_AXIS = new THREE.Vector3(0, 1, 0);
const X_AXIS = new THREE.Vector3(1, 0, 0);
const Z_AXIS = new THREE.Vector3(0, 0, 1);
/** V7 R8: cadena que se contrarrota en el paso lateral (de la cadera hacia arriba) y su reparto (suma 0,85). */
const TWIST_BONES = ['Spine', 'Spine1', 'Spine2', 'Neck', 'Head'];
const TWIST_SHARE = [0.2, 0.2, 0.2, 0.13, 0.12];
const STRAFE_MAX = THREE.MathUtils.degToRad(70);
const WALK_LEAN_SIGN = -1;   // V5 T5-19: verificado con anmi-pie (con +1 la cabeza se iba hacia fuera del giro)
const LOCO = ['SK_Idle', 'SK_Ride', 'SK_CarveL', 'SK_CarveR', 'SK_Brake', 'SK_CrouchRide', 'SK_Push', 'SK_Scoot', 'SK_Manual'];
const AIR = ['SK_Pop', 'SK_Air', 'SK_Catch', 'SK_FlipKick', 'SK_FlipHeel', 'SK_Land', 'SK_LandHard', 'SK_FlipCrouch', 'SK_FlipTuck', 'SK_FlipOpen', 'SK_Grind', 'SK_Grab', 'SK_Bail', 'SK_Stand',
  'SK_ImpactStar', 'SK_ImpactLand', 'SK_GetUp'];
const FOOT = ['SK_IdleBoard', 'SK_WalkBoard', 'SK_RunBoard', 'SK_JogBoard', 'SK_CrouchWalk', 'SK_CrouchIdle', 'SK_HopBoard', 'SK_Mount', 'SK_Dismount'];
const DRIVEN = new Set(['SK_Push', 'SK_Scoot', 'SK_Pop', 'SK_Catch', 'SK_FlipKick', 'SK_FlipHeel', 'SK_Land', 'SK_LandHard', 'SK_FlipOpen', 'SK_Mount', 'SK_Dismount', 'SK_Bail', 'SK_ImpactLand', 'SK_GetUp']);
const LOOPS = new Set(['SK_Idle', 'SK_Ride', 'SK_CarveL', 'SK_CarveR', 'SK_Brake', 'SK_CrouchRide', 'SK_Air', 'SK_FlipTuck', 'SK_FlipCrouch', 'SK_Grind', 'SK_Stand', 'SK_Manual', 'SK_Grab', 'SK_ImpactStar',
  'SK_IdleBoard', 'SK_WalkBoard', 'SK_RunBoard', 'SK_JogBoard', 'SK_CrouchWalk', 'SK_CrouchIdle', 'Step_Hip_Hop_Dance']);

export async function createAnmiVisual(): Promise<AnmiVisual> {
  const [gltf, meta] = await Promise.all([loadGlb('character/anmi.glb'), loadJson('character/anmi.clips.json').catch(() => ({ clips: {} }))]);
  return new AnmiVisual(gltf, meta.clips ?? {});
}

export class AnmiVisual implements SkaterVisual {
  root = new THREE.Group();
  private spin = new THREE.Group();
  private pivot = new THREE.Group();
  model: THREE.Object3D;
  mixer: THREE.AnimationMixer;
  actions = new Map<string, THREE.AnimationAction>();
  private names: string[] = [];
  private w = new Map<string, number>();
  private target = new Map<string, number>();
  private override: string | null = null;
  private overrideAction: THREE.AnimationAction | null = null;
  private overrideOut: { action: THREE.AnimationAction; t: number } | null = null;
  private onEnd: (() => void) | null = null;
  private deck: THREE.Object3D | null = null;
  private deckProp: THREE.Object3D | null = null;
  private boardBone: THREE.Bone | null = null;
  private boardBase = new THREE.Quaternion();   // orientación del clip antes de la capa de flip
  private boardLayered = false;
  private body: THREE.SkinnedMesh | null = null;
  private soleIdx: number[] = [];
  /** V4-ANIM-03: muestra de vértices de TODO el cuerpo (1 de cada 4) para la guarda de suelo de impacto/levantarse. */
  private guardIdx: number[] = [];
  private danceLift = 0;              // m que se sube el modelo durante bailes para que los fundidos no hundan los pies
  private tmpV = new THREE.Vector3();
  private flipQ = new THREE.Quaternion();
  private handBone: THREE.Bone | null = null;
  private tilt = new THREE.Quaternion();
  private crouchW = 0;
  private revertVis = 0;
  private bailRoll = 0;
  // V5 (banco NMG): sentada. La cápsula queda delante del banco (congelada); la raíz VISUAL se desliza al asiento y gira
  // al frente del banco con un fundido (también al levantarse). El clip SK_SitBench está calibrado a un asiento de 0,45 m.
  private sitTarget: { pos: THREE.Vector3; yaw: number } | null = null;
  private sitLast: { pos: THREE.Vector3; yaw: number } | null = null;
  private sitK = 0;
  /** V10: pose guionizada por una actividad (bajada pegada a la pared y trucazo de SECRETNOVIO): `up` = normal de la superficie sobre la
   *  que va la tabla (sustituye a la del suelo), `flip` = giro alrededor del eje lateral (backflips, negativo hacia atrás), `spin` = giro
   *  vertical. null = control normal. */
  extPose: { up?: THREE.Vector3 | null; flip?: number; spin?: number } | null = null;
  setExtPose(p: { up?: THREE.Vector3 | null; flip?: number; spin?: number } | null) { this.extPose = p; }
  /** V10: pose del grind de RG1 (NVDA): inclinación lateral (rad, + = derecha) y agachada. null = control normal. */
  grindPose: { lean: number; crouch: boolean } | null = null;
  private grindCrouchNow: boolean | null = null;
  /** V10 IT3 (feedback: «la inclinación del cuerpo de ANMI está siempre igual; tiene que balancearse y flexionar un poco las rodillas»):
   *  capa de huesos sobre el clip del grind: columna inclinada hacia el lado del desequilibrio (en pantalla izquierda/derecha), balanceo
   *  suave continuo y flexión de rodillas que respira. Se guarda la base y se restaura antes del mixer (como la torsión de la mirada). */
  private gB: { spine: THREE.Bone[]; up: THREE.Bone[]; leg: THREE.Bone[] } | null = null;
  private gSaved: THREE.Quaternion[] | null = null; private gT = 0; private gQ = new THREE.Quaternion(); private gHips: { b: THREE.Bone; p: THREE.Vector3 } | null = null;
  static GRIND_SIGN = 1; static GRIND_TILT_SIGN = -1;   // sentido del giro del conjunto en el grind (comprobado midiendo cabeza y tabla en pantalla)   // sentido de la inclinación de la columna (eje Z local de Mixamo), comprobado midiendo la cabeza en pantalla
  setGrindPose(p: { lean: number; crouch: boolean } | null) {
    this.grindPose = p;
    if (!p) { this.grindCrouchNow = null; return; }
    if (p.crouch !== this.grindCrouchNow) { this.grindCrouchNow = p.crouch; this.play(p.crouch ? 'SK_CrouchRide' : 'SK_Grind', { loop: true, fade: 0.18 }); }
  }
  setGrindWarn(_on: boolean) { /* el aviso es de interfaz (botón y texto); el cuerpo no cambia */ }
  sitAt(pos: THREE.Vector3 | null, yaw = 0) { this.sitTarget = pos ? { pos: pos.clone(), yaw } : null; if (this.sitTarget) this.sitLast = this.sitTarget; }
  get sitBlend() { return this.sitK; }
  /** V5 T5-10: giro acumulado (rad) de las vueltas del choque de coche en curso y registro de los últimos (pruebas). */
  impactSpin = 0; impactSpinLog: number[] = []; private impactP = 0;
  /** V5 T5-15: altura del suelo (colliders) bajo (x, z) desde y0 hacia abajo; la conecta el juego. */
  groundAt: ((x: number, z: number, y0: number) => number | null) | null = null;
  private boardLift = 0;
  private walkLean = 0;
  private deckMeshes: THREE.SkinnedMesh[] = []; private deckLow: [THREE.SkinnedMesh, number][] = [];
  /** Tabla en la mano provisional (si el GLB aún no trae clips de andar con tabla): una sola instancia visible. */
  private handBoard: THREE.Object3D | null = null;
  hasFootClips = false;
  meta: Record<string, ClipMeta>;
  currentName = '';
  get weightSum() { let s = 0; for (const a of this.actions.values()) if (a.isScheduled() && a.enabled) s += a.getEffectiveWeight(); return s; }
  get activeActions() { return [...this.actions.entries()].filter(([, a]) => a.isScheduled() && a.enabled && a.getEffectiveWeight() > 0.01).map(([n, a]) => `${n}:${a.getEffectiveWeight().toFixed(2)}`); }

  constructor(gltf: any, meta: Record<string, ClipMeta>) {
    this.meta = meta;
    this.model = SkeletonUtils.clone(gltf.scene);
    this.model.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh) {
        m.receiveShadow = false; m.frustumCulled = false;
        if (o.name.startsWith('ANMI_SHADOW')) { m.castShadow = true; m.layers.set(1); }
        else m.castShadow = !o.name.startsWith('ANMI_BODY');
      }
      if (o.name === 'DECK') this.deck = o;
      if (o.name === 'DECK_PROP') this.deckProp = o;
      if ((o as THREE.Bone).isBone && o.name === 'Board') this.boardBone = o as THREE.Bone;
      if ((o as THREE.Bone).isBone && /RightHand$/.test(o.name)) this.handBone = o as THREE.Bone;
      if ((o as THREE.Bone).isBone) { const k = TWIST_BONES.findIndex((n) => o.name.endsWith(n)); if (k >= 0) this.twistBones[k] = o as THREE.Bone; }
      for (const sd of ['Left', 'Right'] as const) if ((o as THREE.Bone).isBone) {
        if (new RegExp(`${sd}Arm$`).test(o.name)) this.arm[sd].upper = o as THREE.Bone;
        if (new RegExp(`${sd}ForeArm$`).test(o.name)) this.arm[sd].fore = o as THREE.Bone;
        if (new RegExp(`${sd}Hand$`).test(o.name)) this.arm[sd].hand = o as THREE.Bone;
      }
    });
    this.deckProp?.removeFromParent();
    // V5 T5-15: vértices más bajos del deck (ruedas y colas) para la comprobación de penetración en rampas
    this.deck?.traverse((o) => { if ((o as THREE.Mesh).isMesh) this.deckMeshes.push(o as THREE.SkinnedMesh); });
    // (los índices se eligen en el MUNDO en el primer fotograma rodando en llano: el eje local del deck no es la vertical)
    // vértices de suela (dominados por pie/dedos y a ≤3 cm del punto más bajo en reposo): guarda de suelo de los bailes
    this.model.traverse((o) => { if ((o as THREE.SkinnedMesh).isSkinnedMesh && o.name.startsWith('ANMI_BODY')) this.body = o as THREE.SkinnedMesh; });
    if (this.body) {
      const pos = this.body.geometry.attributes.position, si = this.body.geometry.attributes.skinIndex, sw = this.body.geometry.attributes.skinWeight;
      const bones = this.body.skeleton.bones, foot = new Set(bones.map((b, i) => (/(Foot|ToeBase|Toe_End)$/.test(b.name) ? i : -1)).filter((i) => i >= 0));
      let ymin = Infinity; for (let i = 0; i < pos.count; i++) ymin = Math.min(ymin, pos.getY(i));
      for (let i = 0; i < pos.count; i++) {
        let w = 0; for (let k = 0; k < 4; k++) if (foot.has(si.getComponent(i, k))) w += sw.getComponent(i, k);
        if (w > 0.5 && pos.getY(i) < ymin + 0.03) this.soleIdx.push(i);
      }
      for (let i = 0; i < pos.count; i += 4) this.guardIdx.push(i);
      // V10.1 P18: el cuerpo es de dos caras; una astilla que la pose dobla se ve del revés y three.js le da la vuelta a la normal (luz
      // de interior: línea gris en el omoplato al correr). El cuerpo es una piel cerrada: el revés se ilumina como el derecho.
      const bm = this.body.material as THREE.MeshStandardMaterial;
      if (bm.side === THREE.DoubleSide) {
        bm.onBeforeCompile = (sh) => { sh.fragmentShader = sh.fragmentShader.replace('#include <normal_fragment_begin>', THREE.ShaderChunk.normal_fragment_begin.replace('gl_FrontFacing ? 1.0 : - 1.0', '1.0')); };
        bm.customProgramCacheKey = () => 'anmi-body-front-lit'; bm.needsUpdate = true;
      }
    }
    this.pivot.position.y = 0.9;
    this.model.position.y = -0.9;
    this.pivot.add(this.model);
    this.spin.add(this.pivot);
    this.root.add(this.spin);
    this.mixer = new THREE.AnimationMixer(this.model);
    for (const clip of gltf.animations as THREE.AnimationClip[]) {
      const a = this.mixer.clipAction(clip);
      const loop = meta[clip.name]?.loop ?? LOOPS.has(clip.name);
      if (!loop) { a.setLoop(THREE.LoopOnce, 1); a.clampWhenFinished = true; }
      this.actions.set(clip.name, a);
      this.w.set(clip.name, 0);
    }
    this.hasFootClips = this.actions.has('SK_WalkBoard');
    this.names = [...LOCO, ...AIR, ...FOOT].filter((n) => this.actions.has(n));
    this.mixer.addEventListener('finished', (e: any) => {
      if (e.action === this.overrideAction && this.onEnd) { const f = this.onEnd; this.onEnd = null; f(); }
    });
    for (const n of this.names) {
      const a = this.actions.get(n)!;
      a.enabled = true; a.setEffectiveWeight(0); a.play();
      if (DRIVEN.has(n) || (n === 'SK_HopBoard' && meta[n]?.phases)) a.timeScale = 0;   // V5 T5-19: salto por fases, conducido
    }
    this.w.set('SK_Idle', 1); this.actions.get('SK_Idle')?.setEffectiveWeight(1);
    if (!this.hasFootClips && this.handBone) {
      // provisional declarado: la misma geometría del deck en la mano mientras no exista el clip de andar con tabla
      this.handBoard = this.makeBoardProp();
      this.handBoard.visible = false;
      this.model.add(this.handBoard);
    }
  }

  get clipNames() { return [...this.actions.keys()]; }
  makeBoardProp() {
    const p = (this.deckProp ?? new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.04, 0.8), new THREE.MeshStandardMaterial({ color: '#F18AAE' }))).clone();
    p.traverse((o) => ((o as THREE.Mesh).castShadow = true));
    return p;
  }
  private boardHidden = false;
  setBoardVisible(v: boolean) { this.boardHidden = !v; if (this.deck) this.deck.visible = v; if (!v && this.handBoard) this.handBoard.visible = false; }

  /** Clip forzado por actividades (baile, charla). 'skate' devuelve el control al árbol de mezcla. */
  play(name: string, opts: { loop?: boolean; fade?: number; onEnd?: () => void; timeScale?: number } = {}) {
    const fade = opts.fade ?? 0.25;
    if (name === 'skate') {
      const prev = this.overrideAction;
      if (prev) { prev.fadeOut(fade); this.overrideOut = { action: prev, t: fade + 0.05 }; }
      this.override = null; this.overrideAction = null; this.onEnd = null;
      for (const n of this.names) { this.w.set(n, 0); this.actions.get(n)?.setEffectiveWeight(0); }
      return;
    }
    const a = this.actions.get(name); if (!a) return;
    const prev = this.overrideAction;
    this.override = name;
    a.reset(); a.timeScale = opts.timeScale ?? 1;
    if (opts.loop === false) { a.setLoop(THREE.LoopOnce, 1); a.clampWhenFinished = true; }
    else if (opts.loop) a.setLoop(THREE.LoopRepeat, Infinity);
    a.setEffectiveWeight(1); a.play();
    if (prev && prev !== a) prev.crossFadeTo(a, fade, false);
    else if (!prev) { for (const n of this.names) { const o = this.actions.get(n); if (o && o !== a) o.fadeOut(fade); } a.fadeIn(fade); }
    this.overrideAction = a; this.onEnd = opts.onEnd ?? null;
    this.currentName = name;
  }

  // ------------------------------------------------------------------ V7 R6: manos que agarran los peldaños (IK de brazos)
  // El clip de trepa (donante de la escalera de FG, 0,60 m) mueve las manos «al aire». Con la escalera en uso, cada mano que está
  // QUIETA respecto a la escalera (fase de agarre del clip) se clava al peldaño más cercano, junto a su larguero y al ancho real
  // de ESA escalera (EV1 0,80 m); mientras sube o baja (cambio de peldaño) el agarre se suelta con fundido y manda el clip.
  // ------------------------------------------------------------------ V7 R8: paso lateral procedural (modo ratón)
  // ANMI no tiene clips de paso lateral: andando de lado (o en diagonal) las piernas/cadera se orientan hacia la marcha (≤ 70°,
  // el ciclo de andar normal; en diagonal hacia atrás, el ciclo invertido) y el tronco, cuello y cabeza se contrarrotan para
  // seguir mirando al frente (≈ 85 % del giro). Fuera del modo ratón la marcha lateral es nula y esto no actúa.
  private twistBones: (THREE.Bone | null)[] = TWIST_BONES.map(() => null);
  private twistSaved: THREE.Quaternion[] | null = null;
  /** Giro lateral mostrado (rad, + = piernas hacia la izquierda del frente). Diagnóstico de pruebas. */
  strafeYaw = 0;
  private applyGrindLayer(dt: number) {
    const gp = this.grindPose; if (!gp || !this.body) { this.gT = 0; return; }
    if (!this.gB) { const k = this.body.skeleton, f = (n: string) => k.bones.find((bn) => /mixamorig/i.test(bn.name) && bn.name.endsWith(n)) ?? null;   /* three quita los «:» */
      const spine = ['Spine', 'Spine1', 'Spine2'].map(f).filter(Boolean) as THREE.Bone[], up = ['LeftUpLeg', 'RightUpLeg'].map(f).filter(Boolean) as THREE.Bone[], leg = ['LeftLeg', 'RightLeg'].map(f).filter(Boolean) as THREE.Bone[];
      if (spine.length < 2 || up.length < 2 || leg.length < 2) return; this.gB = { spine, up, leg }; }
    const B = this.gB, reduced = document.body.classList.contains('reduced');
    this.gT += dt; const t = this.gT;
    this.gSaved = [...B.spine, ...B.up, ...B.leg].map((bn) => bn.quaternion.clone());
    // columna: desequilibrio (ya escalado por la actividad, ±0,66 rad) + balanceo continuo pequeño (temblor de equilibrio)
    const sway = reduced ? 0 : 0.035 * Math.sin(t * 2.1) + 0.018 * Math.sin(t * 5.3 + 1.3);
    const tilt = AnmiVisual.GRIND_SIGN * (gp.lean * 0.9 + sway);   // con el giro del conjunto: ±0,3 de desequilibrio ≈ 11° + 6°; al borde ≈ 34° + 17°
    for (const bn of B.spine) bn.quaternion.multiply(this.gQ.setFromAxisAngle(Z_AXIS, tilt / B.spine.length));   // Z local = hacia puntas/talones
    // rodillas: flexión que respira (y algo más cuanto mayor es el desequilibrio); agachada ya la da el clip SK_CrouchRide
    if (!gp.crouch) { const a = 0.13 + (reduced ? 0 : 0.05 * Math.sin(t * 2.6)) + Math.min(0.12, Math.abs(gp.lean) * 0.15);
      // V10.3 (W01, revisión R6): doblar las rodillas acercaba los pies a la cadera y los levantaba ~3 cm de la tabla: la cadera baja lo mismo
      const hips = B.up[0].parent as THREE.Bone | null, foot = B.leg[0].children.find((c) => /Foot/.test(c.name)) as THREE.Object3D | undefined;
      const y0 = foot ? (this.model.updateMatrixWorld(true), foot.getWorldPosition(this.tmpV).y) : 0;
      for (const bn of B.up) bn.quaternion.multiply(this.gQ.setFromAxisAngle(X_AXIS, -a));
      for (const bn of B.leg) bn.quaternion.multiply(this.gQ.setFromAxisAngle(X_AXIS, 2 * a));
      if (hips && foot && hips.parent) { this.model.updateMatrixWorld(true); const dy = foot.getWorldPosition(this.tmpV).y - y0;
        if (dy > 1e-4) { this.gHips = { b: hips, p: hips.position.clone() }; const w = hips.getWorldPosition(new THREE.Vector3()); w.y -= dy; hips.position.copy(hips.parent.worldToLocal(w)); } } }
  }
  private applyStrafeTwist() {
    const a = this.strafeYaw; if (Math.abs(a) < 0.005 || this.twistBones.some((b) => !b)) return;
    this.twistSaved = this.twistBones.map((b) => b!.quaternion.clone());
    const pq = new THREE.Quaternion(), rq = new THREE.Quaternion();
    for (let i = 0; i < this.twistBones.length; i++) {
      const b = this.twistBones[i]!;
      b.parent!.getWorldQuaternion(pq);
      rq.setFromAxisAngle(Y_AXIS, -a * TWIST_SHARE[i]);
      // giro alrededor de la vertical del MUNDO expresado en el espacio del padre: q' = (P⁻¹·R·P)·q
      b.quaternion.premultiply(pq.clone().invert().multiply(rq).multiply(pq));
      b.updateMatrixWorld(true);
    }
  }
  private arm: Record<'Left' | 'Right', { upper: THREE.Bone | null; fore: THREE.Bone | null; hand: THREE.Bone | null }> = { Left: { upper: null, fore: null, hand: null }, Right: { upper: null, fore: null, hand: null } };
  private grip: Record<'Left' | 'Right', { w: number; lock: number | null; prevY: number | null; vyF: number; holding: boolean }> = { Left: { w: 0, lock: null, prevY: null, vyF: 0, holding: false }, Right: { w: 0, lock: null, prevY: null, vyF: 0, holding: false } };
  private ladderCtx: { axis: THREE.Vector3; heading: number; width: number; rungs: number[] } | null = null;
  private ladderOn = false;
  private armSaved: THREE.Quaternion[] | null = null;
  // ------------------------------------------------------------------ V10.1 (escena final): la paz con dos dedos
  // Usuario: «que haga el símbolo de paz de 2 dedos, mirando a cámara, con su mano derecha». No hay clip: capa sobre la pose del
  // clip (como la IK de la escalera): mano junto a la cara con la palma hacia delante, índice y corazón en V, el resto recogidos.
  /** 0..1, lo mueve la escena final. */
  peace = 0;
  private peaceB: { hips: THREE.Bone; head: THREE.Bone; spine: THREE.Bone; f: Record<string, THREE.Bone>; legs: THREE.Bone[] } | null = null;
  private peaceLegs: { q: THREE.Quaternion[]; hip: THREE.Vector3 } | null = null;
  private peaceList: THREE.Bone[] = []; private peaceSaved: THREE.Quaternion[] | null = null;
  private peaceScale: [THREE.Bone, THREE.Vector3, THREE.Vector3?][] | null = null; private peaceMesh: THREE.Group | null = null;
  /** Dedos de la paz: índice, corazón, anular, meñique y el pulgar en dos tramos, con forma de dedo (algo más finos hacia la yema y con el
   *  nudillo marcado) y el MISMO material de piel de ANMI (mismos parámetros; el color es el de su textura en la mano, medido al crearlos, para
   *  que casen bajo cualquier luz). V10.3 (W06): antes eran cápsulas rígidas de color fijo. */
  private peaceProp(len: number, r: number) {
    if (this.peaceMesh) return this.peaceMesh;
    const src = (Array.isArray(this.body!.material) ? this.body!.material[0] : this.body!.material) as THREE.MeshStandardMaterial;
    const mat = src.clone(); (mat as any).map = null; (mat as any).normalMap = null; (mat as any).roughnessMap = null; (mat as any).aoMap = null; mat.color = (this.handSkin(src) ?? new THREE.Color(AnmiVisual.SKIN)).multiplyScalar(0.86);   // algo más oscuro: la media de la textura sale más clara que la mano iluminada   // sin mapas (con el normalMap salía granulado)
     (mat as any).skinning = false; mat.needsUpdate = true;
    // [largo total, radio] en largos de palma: índice, corazón, anular y meñique doblados, pulgar (dos tramos)
    const dims: [number, number][] = [[0.98, 1], [1.04, 1], [0.34, 1.0], [0.3, 0.92], [0.36, 1.0], [0.4, 0.95]];   // V10.3: anular, meñique y pulgar más cortos (asomaban)
    const g = new THREE.Group(); g.name = 'ANMI_PAZ';
    for (const [L, k] of dims) { const rad = r * k, Lm = L * len, geo = new THREE.CapsuleGeometry(rad, Math.max(0.001, Lm - 2 * rad), 5, 12), pa = geo.attributes.position;
      for (let i = 0; i < pa.count; i++) { const t = THREE.MathUtils.clamp((pa.getY(i) + Lm / 2) / Lm, 0, 1), w = (1 - 0.2 * t) * (1 + 0.07 * Math.exp(-(((t - 0.45) / 0.09) ** 2)));
        pa.setX(i, pa.getX(i) * w); pa.setZ(i, pa.getZ(i) * w * 0.9); }
      geo.computeVertexNormals();
      const m = new THREE.Mesh(geo, mat); m.userData.L = Lm; m.castShadow = false; m.frustumCulled = false; g.add(m); }
    (this.root.parent ?? this.root).add(g); g.visible = false; this.peaceMesh = g; return g;
  }
  /** Color medio de la textura de ANMI en los vértices de la mano derecha (null si la imagen no se puede leer). */
  private handSkin(src: THREE.MeshStandardMaterial) {
    try {
      const img = (src.map as any)?.image as CanvasImageSource & { width: number; height: number }, body = this.body!, geo = body.geometry;
      const hand = this.arm.Right.hand, bones = body.skeleton.bones, hi = hand ? bones.indexOf(hand) : -1;
      if (!img || !img.width || hi < 0 || !geo.attributes.uv || !geo.attributes.skinIndex) return null;
      const S = 256, c = document.createElement('canvas'); c.width = c.height = S; const x = c.getContext('2d', { willReadFrequently: true })!; x.drawImage(img, 0, 0, S, S);
      const px = x.getImageData(0, 0, S, S).data, uv = geo.attributes.uv, si = geo.attributes.skinIndex, sw = geo.attributes.skinWeight;
      let r = 0, gg = 0, bb = 0, n = 0;
      for (let i = 0; i < uv.count; i++) { let w = 0; for (let j = 0; j < 4; j++) if (si.getComponent(i, j) === hi) w += sw.getComponent(i, j); if (w < 0.6) continue;
        let u = uv.getX(i) % 1, v = uv.getY(i) % 1; if (u < 0) u += 1; if (v < 0) v += 1; const X = Math.min(S - 1, Math.floor(u * S)), Y = Math.min(S - 1, Math.floor((src.map!.flipY ? 1 - v : v) * S)), o = (Y * S + X) * 4;
        r += px[o]; gg += px[o + 1]; bb += px[o + 2]; n++; }
      if (n < 8) return null;
      const col = new THREE.Color().setRGB(r / n / 255, gg / n / 255, bb / n / 255, THREE.SRGBColorSpace); this.peaceSkinSamples = n; return col;
    } catch { return null; }
  }
  /** Diagnóstico (pruebas): vértices de la mano usados para medir el color de la piel. */
  peaceSkinSamples = 0;
  /** Diagnóstico (pruebas): cuánto se ven los dedos modelados (0 = manopla, 1 = dedos en V). */
  peaceSwap = 0;
  /** Tono de la piel de las manos de ANMI (medido en su textura bajo la luz del reto). */
  static SKIN = '#e9a26c';
  private applyPeace() {
    const k = this.peace, A = this.arm.Right;
    if (k <= 0.001 || !this.body || !A.upper || !A.fore || !A.hand) return;
    if (!this.peaceB) {
      const bs = this.body.skeleton.bones, f = (n: string) => bs.find((b) => /mixamorig/i.test(b.name) && b.name.endsWith(n)) ?? null;
      const hips = f('Hips'), head = f('Head'), fing: Record<string, THREE.Bone> = {};
      for (const F of ['Index', 'Middle', 'Ring', 'Pinky', 'Thumb']) for (let j = 1; j <= 4; j++) { const b = f(`RightHand${F}${j}`); if (b) fing[`${F}${j}`] = b; }
      const legs = ['RightUpLeg', 'RightFoot', 'LeftUpLeg', 'LeftFoot', 'RightLeg'].map(f);
      const spine = f('Spine2') ?? f('Spine1'), AL = this.arm.Left;
      if (!hips || !head || !spine || !AL.upper || !AL.fore || !AL.hand || Object.keys(fing).length < 20 || legs.some((b) => !b)) return;
      this.peaceB = { hips, head, spine, f: fing, legs: legs as THREE.Bone[] };
      this.peaceList = [spine, head, AL.upper, AL.fore, AL.hand, A.upper, A.fore, A.hand, ...['Index', 'Middle', 'Ring', 'Pinky', 'Thumb'].flatMap((F) => [1, 2, 3].map((j) => fing[`${F}${j}`]))];
    }
    const B = this.peaceB, F = B.f, L = this.peaceList, V = () => new THREE.Vector3();
    const orig = L.map((b) => b.quaternion.clone());
    this.model.updateMatrixWorld(true);
    const W = (b: THREE.Bone) => b.getWorldPosition(V());
    const rotTo = (bone: THREE.Bone, from: THREE.Vector3, to: THREE.Vector3) => {
      const q = new THREE.Quaternion().setFromUnitVectors(from.normalize(), to.clone().normalize());
      const wq = bone.getWorldQuaternion(new THREE.Quaternion()), pq = bone.parent!.getWorldQuaternion(new THREE.Quaternion());
      bone.quaternion.copy(pq.invert().multiply(q.multiply(wq))); bone.updateMatrixWorld(true);
    };
    const aim = (bone: THREE.Bone, child: THREE.Bone, dir: THREE.Vector3) => rotTo(bone, W(child).sub(W(bone)), dir);
    const rotWorld = (bone: THREE.Bone, axis: THREE.Vector3, ang: number) => {
      const q = new THREE.Quaternion().setFromAxisAngle(axis, ang), wq = bone.getWorldQuaternion(new THREE.Quaternion()), pq = bone.parent!.getWorldQuaternion(new THREE.Quaternion());
      bone.quaternion.copy(pq.invert().multiply(q.multiply(wq))); bone.updateMatrixWorld(true);
    };
    /** IK de dos huesos con el codo hacia `poleDir` (mundo). */
    const ikPole = (upB: THREE.Bone, foB: THREE.Bone, haB: THREE.Bone, T: THREE.Vector3, poleDir: THREE.Vector3) => {
      const S0 = W(upB), E0 = W(foB), a0 = S0.distanceTo(E0), b0 = E0.distanceTo(W(haB));
      const toT = T.clone().sub(S0), d = THREE.MathUtils.clamp(toT.length(), Math.abs(a0 - b0) + 1e-3, a0 + b0 - 1e-3), u = toT.normalize();
      const pole = poleDir.clone(); pole.addScaledVector(u, -pole.dot(u)).normalize();
      const cosA = THREE.MathUtils.clamp((a0 * a0 + d * d - b0 * b0) / (2 * a0 * d), -1, 1), E2 = S0.clone().addScaledVector(u, a0 * cosA).addScaledVector(pole, a0 * Math.sqrt(1 - cosA * cosA));
      rotTo(upB, E0.clone().sub(S0), E2.sub(S0));
      rotTo(foB, W(haB).sub(W(foB)), T.clone().sub(W(foB)));
    };
    // marco del cuerpo: «side» = su derecha (del hombro derecho), «fwd» = delante, «up» = arriba
    const S = W(A.upper), up = new THREE.Vector3(0, 1, 0), side = S.clone().sub(W(B.hips)).setY(0).normalize(), fwd = V().crossVectors(up, side);
    // usuario: «que avance un poco la pierna y el pie del mismo lado de la mano de la paz y el otro que lo atrase un poco»: la pierna derecha
    // gira hacia delante desde la cadera y la izquierda hacia atrás, los pies vuelven a quedar planos y la cadera baja lo que subirían los pies
    {
      const [ru, rf, lu, lf, rl] = B.legs, hp = B.hips.position.clone(), rfq0 = rf.getWorldQuaternion(new THREE.Quaternion());
      this.peaceLegs = { q: B.legs.map((bn) => bn.quaternion.clone()), hip: hp };
      const foot0 = [W(rf).y, W(lf).y];
      // gira la pierna sobre `axis` (mundo) llevando el pie hacia `toward` (ángulo negativo = al revés) y deja el pie como estaba en el mundo
      const swing = (upB: THREE.Bone, footB: THREE.Bone, ang: number, axis = side, toward = fwd) => {
        const hipP = W(upB), toFoot = W(footB).sub(hipP), test = toFoot.clone().applyAxisAngle(axis, 0.05), sg = test.dot(toward) > toFoot.dot(toward) ? 1 : -1;
        const q = new THREE.Quaternion().setFromAxisAngle(axis, sg * ang), fq = footB.getWorldQuaternion(new THREE.Quaternion());
        const wq = upB.getWorldQuaternion(new THREE.Quaternion()), pq = upB.parent!.getWorldQuaternion(new THREE.Quaternion());
        upB.quaternion.copy(pq.invert().multiply(q.multiply(wq))); upB.updateMatrixWorld(true);
        const fpq = footB.parent!.getWorldQuaternion(new THREE.Quaternion()); footB.quaternion.copy(fpq.invert().multiply(fq)); footB.updateMatrixWorld(true);   // pie plano
      };
      swing(ru, rf, 0.24 * k); swing(lu, lf, -0.17 * k);
      swing(ru, rf, 0.07 * k, fwd, side); swing(lu, lf, -0.07 * k, fwd, side);   // y algo más abiertas (pose de referencia)
      // la cadera baja lo que sube el pie de atrás (pierna estirada) y la rodilla de delante se dobla lo justo para que su pie pise el suelo
      const rise = Math.max(W(lf).y - foot0[1], 0), tR = W(rf).setY(foot0[0]);
      if (rise > 1e-4) { const hw = W(B.hips).add(new THREE.Vector3(0, -rise, 0)); B.hips.position.copy(B.hips.parent!.worldToLocal(hw)); B.hips.updateMatrixWorld(true); }
      this.twoBoneIK(ru, rl, rf, tR);
      { const fpq = rf.parent!.getWorldQuaternion(new THREE.Quaternion()); rf.quaternion.copy(fpq.invert().multiply(rfq0)); rf.updateMatrixWorld(true); }
    }
    // pose de referencia del usuario (Goku haciendo la paz): el hombro de la paz algo adelantado, la cabeza ladeada hacia la mano, la mano de la
    // paz fuera de la cara con el codo abierto y la otra mano en la cadera con el codo hacia fuera
    { const rel = W(A.upper).sub(W(B.spine)), sg = rel.clone().applyAxisAngle(up, 0.05).dot(fwd) > rel.dot(fwd) ? 1 : -1; rotWorld(B.spine, up, sg * 0.2 * k); }
    { const sg = up.clone().applyAxisAngle(fwd, 0.05).dot(side) > 0 ? 1 : -1; rotWorld(B.head, fwd, sg * 0.13 * k); }
    S.copy(W(A.upper));
    const a = S.distanceTo(W(A.fore));
    const Ht = W(B.head).addScaledVector(side, 1.5 * a).addScaledVector(fwd, 0.8 * a).addScaledVector(up, -0.1 * a);   // V10.3: algo más separada de la cara (tapaba la visera)
    ikPole(A.upper, A.fore, A.hand, Ht, V().addScaledVector(up, -1).addScaledVector(side, 1.0).addScaledVector(fwd, -0.1));
    { const AL = this.arm.Left, aL = W(AL.upper!).distanceTo(W(AL.fore!));
      const Th = W(B.legs[2]).addScaledVector(up, 0.5 * aL).addScaledVector(side, -0.45 * aL).addScaledVector(fwd, 0.05 * aL);
      ikPole(AL.upper!, AL.fore!, AL.hand!, Th, V().addScaledVector(side, -1).addScaledVector(fwd, -0.35)); }
    // mano: dedos hacia arriba (algo hacia fuera) y el meñique por fuera = palma hacia delante (mano derecha)
    {
      const along = W(F.Middle1).sub(W(A.hand)).normalize(), across0 = W(F.Pinky1).sub(W(F.Index1));
      const dA = V().addScaledVector(up, 1).addScaledVector(side, 0.12).normalize(), dC0 = side.clone();
      const basis = (x: THREE.Vector3, y0: THREE.Vector3) => { const y = y0.clone().addScaledVector(x, -y0.dot(x)).normalize(), z = V().crossVectors(x, y); return new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(x, y, z)); };
      const qc = basis(along, across0), qd = basis(dA, dC0), q = qd.multiply(qc.invert());
      const wq = A.hand.getWorldQuaternion(new THREE.Quaternion()), pq = A.hand.parent!.getWorldQuaternion(new THREE.Quaternion());
      A.hand.quaternion.copy(pq.invert().multiply(q.multiply(wq))); A.hand.updateMatrixWorld(true);
    }
    // fundido con la pose del clip (también con la mano casi arriba: sin saltos); se deshace antes del siguiente mixer.update
    if (k < 1) { L.forEach((bn, i) => bn.quaternion.copy(orig[i].clone().slerp(bn.quaternion, k))); this.model.updateMatrixWorld(true); }
    this.peaceSaved = orig;
    // los dedos de la malla de ANMI van unidos (una manopla: no se pueden separar en V). V10.3 (W06): en el último tramo de la subida
    // (peso 0,6 → 0,95, ~0,15 s) sus dedos, pulgar incluido, se recogen poco a poco dentro de la palma (escala desde el nudillo) mientras
    // crecen desde el nudillo unos dedos modelados: índice y corazón en V, anular y meñique doblados y el pulgar cruzado por delante. Nunca
    // se ven las dos cosas enteras a la vez ni hay un cambio de un fotograma a otro
    const sw = THREE.MathUtils.smoothstep(k, 0.6, 0.95); this.peaceSwap = sw;
    const hAlong = W(F.Middle1).sub(W(A.hand)).normalize(), hAcross = W(F.Pinky1).sub(W(F.Index1)), n = V().crossVectors(hAcross, hAlong).normalize();
    hAcross.addScaledVector(hAlong, -hAcross.dot(hAlong)).normalize(); if (n.dot(fwd) < 0) n.negate();
    const len = W(F.Middle1).distanceTo(W(A.hand)), r = len * 0.135;
    const k1 = W(F.Index1), k2 = W(F.Middle1), k3 = W(F.Ring1), k4 = W(F.Pinky1), kt = W(F.Thumb1);
    // V10.5 (mano de la paz, E5-35): la manopla se recoge escalando sus dedos desde los nudillos, y la piel del borde de la palma se estiraba
    // hacia los nudillos en astillas oscuras (la «parte transparente» que veía el usuario). Ahora, además, los dedos recogidos se llevan al
    // INTERIOR de la palma (algo por detrás de su cara): la piel estirada se pliega hacia dentro y la palma queda cerrada por fuera
    const shrink = Math.max(0.02, 1 - sw), mid = W(A.hand).addScaledVector(hAlong, len * 0.6);
    // el pulgar de la manopla no se recoge (al encogerlo rasgaba la piel junto a la muñeca): se dobla por delante de la palma
    if (sw > 0) for (const [j, ang] of [[1, 0.5], [2, 0.6], [3, 0.4]] as [number, number][]) { const b = F[`Thumb${j}`], nb = F[`Thumb${j + 1}`]; if (!b) continue;
      const tip = () => (nb ? W(nb) : W(b).addScaledVector(hAlong, 0.02)), t0 = tip().dot(n); rotWorld(b, hAlong, ang * sw); if (tip().dot(n) < t0) rotWorld(b, hAlong, -2 * ang * sw); }
    this.peaceScale = sw > 0 ? [F.Index1, F.Middle1, F.Ring1, F.Pinky1].map((b) => { const o = b.scale.clone(), op = b.position.clone(); b.scale.setScalar(shrink);
      const k0 = W(b), inside = b === F.Thumb1 ? k0.clone().lerp(mid, 0.5).addScaledVector(n, -r * 0.6) : k0.clone().addScaledVector(n, -r * 0.8).addScaledVector(hAlong, -r * 0.35);
      const lp = b.parent!.worldToLocal(k0.lerp(inside, sw)); b.position.copy(lp); b.updateMatrixWorld(true); return [b, o, op] as [THREE.Bone, THREE.Vector3, THREE.Vector3]; }) : null;
    const P = this.peaceProp(len, r); P.visible = sw > 0.001;
    if (sw > 0.001) {
      // cada dedo crece desde su base a lo largo de su dirección (largo × sw, grosor algo antes)
      const put = (m: THREE.Mesh, from: THREE.Vector3, dir: THREE.Vector3) => { dir.normalize(); const ls = sw, ws = Math.min(1, sw * 1.6);
        m.scale.set(ws, ls, ws); m.position.copy(from).addScaledVector(dir, m.userData.L * ls / 2); m.quaternion.setFromUnitVectors(Y_AXIS, dir); };
      const [mi, mm, mr, mp, mt, mt2] = P.children as THREE.Mesh[];
      put(mi, k1.clone().addScaledVector(hAlong, -r * 0.6), V().addScaledVector(hAlong, 1).addScaledVector(hAcross, -0.36));
      put(mm, k2.clone().addScaledVector(hAlong, -r * 0.6), V().addScaledVector(hAlong, 1).addScaledVector(hAcross, 0.26));
      put(mr, k3.clone().addScaledVector(hAlong, -r * 0.3).addScaledVector(n, -r * 0.3), V().addScaledVector(n, 1).addScaledVector(hAlong, -0.6));   // doblados hacia la palma, sin asomar por el canto
      put(mp, k4.clone().addScaledVector(hAlong, -r * 0.4).addScaledVector(n, -r * 0.3).addScaledVector(hAcross, -r * 0.3), V().addScaledVector(n, 1).addScaledVector(hAlong, -0.65));
      // pulgar: sale de su base hacia delante y cruza por encima del anular y el meñique doblados
      const tb = kt.clone().addScaledVector(n, r * 0.4);
      put(mt, tb, V().addScaledVector(n, 0.75).addScaledVector(hAlong, 0.5).addScaledVector(hAcross, 0.2));
      const te = tb.clone().addScaledVector(V().set(0, 1, 0).applyQuaternion(mt.quaternion), (mt.userData.L - r) * sw);
      put(mt2, te, V().addScaledVector(hAcross, 0.8).addScaledVector(hAlong, 0.3).addScaledVector(n, -0.1));
      // V10.3 (revisión de cerca): anular, meñique y pulgar modelados asomaban como bultos; se quedan recogidos dentro de la palma (la manopla
      // escalada hace de puño) y solo salen índice y corazón en V
      for (const m of [mr, mp, mt, mt2]) m.visible = false;
    }
  }
  /** Registro de diagnóstico (pruebas): por mano, peso del agarre, peldaño y error a su objetivo tras la IK (m). */
  gripLog: { t: number; side: string; w: number; rung: number | null; err: number }[] = [];
  /** Diagnóstico: por fotograma y mano [lado, altura de la muñeca, velocidad vertical, peso]. */
  handTrace: number[][] = [];
  /** Altura de cada muñeca SEGÚN EL CLIP (antes de la IK) en el último fotograma: la trepa decide con ella el salto final. */
  clipHandY: Record<'Left' | 'Right', number> = { Left: -1e9, Right: -1e9 };
  private footY = 0;
  /** V10.2 Q13 (D-13): GRAFITEAR. Capa procedural sobre la pose de pie (sin clip propio), como la paz: coge la lata de la cadera (la lata 3D
   *  del usuario, `props/lata.glb`), la levanta, pinta en ZIGZAG en el plano del dibujo (izquierda → derecha → izquierda → derecha, bajando;
   *  la boquilla apunta siempre al punto que se pinta y el tronco acompaña), con las rodillas dobladas y abiertas «como esforzándose» y los
   *  pies quietos (la cadera baja; IK de pierna con el pie en su sitio), y al final la guarda. Todo hueso tocado se restaura antes del
   *  siguiente `mixer.update` (lección de V10.1). Con «reducir movimiento», zigzag más corto y sin flexión exagerada. */
  private spray: SprayJob | null = null; private sprayCan: THREE.Object3D | null = null; private sprayModel: THREE.Object3D | null = null;
  private sprayB: { hips: THREE.Bone; spine: THREE.Bone; head: THREE.Bone | null; legs: THREE.Bone[]; fing: THREE.Bone[][]; thumb: THREE.Bone[] } | null = null;
  private spraySaved: { b: THREE.Bone[]; q: THREE.Quaternion[]; hip: THREE.Vector3 } | null = null;
  /** Punta de la boquilla en el mundo y hacia dónde apunta (para las partículas). */
  sprayNozzle: { p: THREE.Vector3; d: THREE.Vector3; on: boolean } = { p: new THREE.Vector3(), d: new THREE.Vector3(), on: false };
  /** La lata del usuario (la carga el juego en segundo plano; hasta entonces, un bote rosa provisional del mismo tamaño). */
  setSprayModel(m: THREE.Object3D) { this.sprayModel = m; if (this.sprayCan) { const vis = this.sprayCan.visible; this.sprayCan.removeFromParent(); this.sprayCan = null; this.canObj().visible = vis; } }
  private canObj() {
    if (this.sprayCan) return this.sprayCan;
    const g = new THREE.Group(); g.name = 'ANMI_SPRAY_CAN';
    // lata del usuario: 0,19 m de alto, base en y = 0, boquilla en (0; 0,1824; 0,0193) mirando a +Z (assets/derived/v10_2/lata_espray) → a 0,17 m
    const k = 0.9;
    if (this.sprayModel) { const m = this.sprayModel.clone(true); m.scale.setScalar(k); m.position.y = -0.095 * k; m.traverse((o: any) => { if (o.isMesh) { o.castShadow = true; o.frustumCulled = false; } }); g.add(m); }
    else { const c = new THREE.Mesh(new THREE.CylinderGeometry(0.033, 0.033, 0.17, 12), new THREE.MeshStandardMaterial({ color: '#F18AAE', roughness: 0.4, metalness: 0.3 })); g.add(c); }
    const nz = new THREE.Object3D(); nz.name = 'ANMI_SPRAY_NOZZLE'; nz.position.set(0, (0.1824 - 0.095) * k, 0.0193 * k); g.add(nz);
    this.root.add(g); g.visible = false; this.sprayCan = g; return g;
  }
  setSpray(job: SprayJob | null) { this.spray = job; if (!job && this.sprayCan) this.sprayCan.visible = false; this.sprayNozzle.on = false; }
  private applySpray(_dt: number) {
    const J = this.spray, A = this.arm.Right; if (!J || !this.body || !A.upper || !A.fore || !A.hand) return;
    if (!this.sprayB) {
      const bs = this.body.skeleton.bones, f = (n: string) => bs.find((b) => /mixamorig/i.test(b.name) && b.name.endsWith(n)) ?? null;
      const legs = ['LeftUpLeg', 'LeftLeg', 'LeftFoot', 'RightUpLeg', 'RightLeg', 'RightFoot'].map(f), hips = f('Hips'), spine = f('Spine1') ?? f('Spine');
      const fing = ['Index', 'Middle', 'Ring', 'Pinky'].map((F) => [1, 2, 3].map((j) => f(`RightHand${F}${j}`)).filter(Boolean) as THREE.Bone[]), thumb = [1, 2, 3].map((j) => f(`RightHandThumb${j}`)).filter(Boolean) as THREE.Bone[];
      if (!hips || !spine || legs.some((b) => !b)) return;
      this.sprayB = { hips, spine, head: f('Head'), legs: legs as THREE.Bone[], fing, thumb };
    }
    const B = this.sprayB, reduced = document.body.classList.contains('reduced'), t = J.t, V = () => new THREE.Vector3();
    const touched = [B.spine, A.upper, A.fore, A.hand, ...B.fing.flat(), ...B.thumb, ...B.legs, ...(B.head ? [B.head] : [])];
    this.spraySaved = { b: touched, q: touched.map((b) => b.quaternion.clone()), hip: B.hips.position.clone() };
    this.model.updateMatrixWorld(true);
    const W = (b: THREE.Object3D) => b.getWorldPosition(V());
    const rotWorld = (bone: THREE.Bone, axis: THREE.Vector3, ang: number) => { const q = new THREE.Quaternion().setFromAxisAngle(axis, ang), wq = bone.getWorldQuaternion(new THREE.Quaternion()), pq = bone.parent!.getWorldQuaternion(new THREE.Quaternion());
      bone.quaternion.copy(pq.invert().multiply(q.multiply(wq))); bone.updateMatrixWorld(true); };
    const rotTo = (bone: THREE.Bone, from: THREE.Vector3, to: THREE.Vector3) => rotWorld(bone, V().crossVectors(from, to).normalize(), from.angleTo(to));
    const ikPole = (upB: THREE.Bone, foB: THREE.Bone, haB: THREE.Bone, T: THREE.Vector3, poleDir: THREE.Vector3) => {
      const S0 = W(upB), E0 = W(foB), a0 = S0.distanceTo(E0), b0 = E0.distanceTo(W(haB)), toT = T.clone().sub(S0), d = THREE.MathUtils.clamp(toT.length(), Math.abs(a0 - b0) + 1e-3, a0 + b0 - 1e-3), u = toT.normalize();
      const pole = poleDir.clone(); pole.addScaledVector(u, -pole.dot(u)).normalize();
      const cosA = THREE.MathUtils.clamp((a0 * a0 + d * d - b0 * b0) / (2 * a0 * d), -1, 1), E2 = S0.clone().addScaledVector(u, a0 * cosA).addScaledVector(pole, a0 * Math.sqrt(1 - cosA * cosA));
      if (E0.clone().sub(S0).angleTo(E2.clone().sub(S0)) > 1e-5) rotTo(upB, E0.clone().sub(S0), E2.sub(S0));
      const fh = W(haB).sub(W(foB)), ft = T.clone().sub(W(foB)); if (fh.angleTo(ft) > 1e-5) rotTo(foB, fh, ft); };
    // pesos: entra en 0,15 s, sale en los 0,15 s finales; la lata aparece al cerrar la mano en la cadera y se guarda allí al final
    const sm = (a: number, b: number, x: number) => THREE.MathUtils.smoothstep(x, a, b);
    const wIn = sm(0, 0.15, t) * (1 - sm(SPRAY.sec - 0.15, SPRAY.sec, t)), atHip = 1 - sm(0.22, 0.45, t) + sm(SPRAY.sec - SPRAY.stow, SPRAY.sec - 0.12, t);
    const canOn = t > 0.2 && t < SPRAY.sec - 0.1;
    // marco: n hacia fuera del dibujo; «delante» de ANMI y su derecha
    const S = W(A.upper), up = new THREE.Vector3(0, 1, 0), hipsW = W(B.hips), fwd = V().set(Math.sin(this.root.rotation.y), 0, Math.cos(this.root.rotation.y)), right = V().crossVectors(fwd, up).normalize();
    const aim = sprayAim(J, reduced);
    // 1) piernas: la cadera baja y las rodillas se doblan hacia fuera con los pies en su sitio (pie plano: su giro de mundo no cambia)
    { const [lu, ll, lf, ru, rl, rf] = B.legs, drop = (reduced ? 0.045 : 0.1) * wIn;
      const f0 = [W(lf), W(rf)], q0 = [lf.getWorldQuaternion(new THREE.Quaternion()), rf.getWorldQuaternion(new THREE.Quaternion())];
      // suela medida con sus vértices (lección de V10.1: mover piernas hunde o levanta los pies): la del clip es la referencia
      const soleLow = () => { if (!this.soleIdx.length) return 0; this.model.updateMatrixWorld(true); this.body!.skeleton.update(); let lo = Infinity; for (const i of this.soleIdx) { this.body!.getVertexPosition(i, this.tmpV).applyMatrix4(this.body!.matrixWorld); if (this.tmpV.y < lo) lo = this.tmpV.y; } return lo; };
      const base = soleLow(), out = (reduced ? 0.6 : 1.4) * wIn;   // la apertura de rodillas también entra y sale con el peso
      const legsTo = (dy: number) => { const hw = hipsW.clone().add(V().set(0, -dy, 0)); B.hips.position.copy(B.hips.parent!.worldToLocal(hw)); B.hips.updateMatrixWorld(true);
        ikPole(lu, ll, lf, f0[0], V().addScaledVector(fwd, 1).addScaledVector(right, -out));
        ikPole(ru, rl, rf, f0[1], V().addScaledVector(fwd, 1).addScaledVector(right, out));
        for (const [b, q] of [[lf, q0[0]], [rf, q0[1]]] as [THREE.Bone, THREE.Quaternion][]) { const pq = b.parent!.getWorldQuaternion(new THREE.Quaternion()); b.quaternion.copy(pq.invert().multiply(q)); b.updateMatrixWorld(true); } };
      // la espinilla arrastra parte del zapato al abrir la rodilla: si la suela baja, la cadera baja menos (dos pasadas)
      let dy = drop; legsTo(dy);
      for (let it = 0; it < 2 && drop > 1e-4; it++) { const sink = base - soleLow(); if (sink <= 0.001) break; dy = Math.max(0, dy - sink * 1.6); legsTo(dy); } }
    // 2) el tronco acompaña al brazo (gira hacia el punto que pinta y se inclina un poco hacia él)
    { const to = aim.clone().sub(W(B.spine)).setY(0).normalize(), yaw = Math.atan2(V().crossVectors(fwd, to).y, fwd.dot(to)) * 0.45 * wIn * (1 - atHip);
      rotWorld(B.spine, up, THREE.MathUtils.clamp(yaw, -0.45, 0.45));
      // V10.5 (G5 de la revisión de animaciones, E5-35): la cabeza sigue el punto que pinta (~50 % del giro que falta y de la altura)
      if (B.head) { const hw = W(B.head), d3 = aim.clone().sub(hw), Y = Math.atan2(V().crossVectors(fwd, to).y, fwd.dot(to)), wk = 0.5 * wIn * (1 - atHip);
        rotWorld(B.head, up, THREE.MathUtils.clamp((Y - THREE.MathUtils.clamp(yaw, -0.45, 0.45)) * wk, -0.6, 0.6));
        const hz = Math.hypot(d3.x, d3.z), P = Math.atan2(d3.y, Math.max(0.05, hz)), rt = V().crossVectors(to, up).normalize();
        if (rt.lengthSq() > 0.5) rotWorld(B.head, rt, THREE.MathUtils.clamp(P * wk, -0.5, 0.5)); } }
    // 3) brazo: la lata en el aire entre el hombro y el punto que pinta (a 0,5 m del hombro como mucho) o en la cadera al cogerla/guardarla
    // usuario: «más exagerado»: la mano dibuja el MISMO zigzag en grande delante del pecho (±26 cm a los lados, ±25 cm arriba y abajo, en los
    // ejes del dibujo) mientras la boquilla apunta al punto de la pared; a como mucho 0,58 m del hombro
    const S2 = W(A.upper), jr = V().crossVectors(J.u, J.n).normalize(), [zx, zy] = zigzag(strokeK(t), reduced ? 0.3 : 0.42), big = reduced ? 0.35 : 0.62;
    const toWall = aim.clone().sub(S2).setY(0); if (toWall.lengthSq() < 1e-4) toWall.copy(fwd); toWall.normalize();
    const air0 = S2.clone().addScaledVector(toWall, 0.4).add(V().set(0, -0.06, 0)).addScaledVector(jr, zx * big).addScaledVector(J.u.clone().setY(Math.abs(J.n.y) > 0.5 ? 0 : J.u.y).normalize(), zy * (reduced ? 0.4 : 0.75));
    const dv = air0.clone().sub(S2); if (dv.length() > 0.58) dv.setLength(0.58);
    const canAir = S2.clone().add(dv), canHip = hipsW.clone().addScaledVector(right, 0.24).addScaledVector(fwd, 0.08).add(V().set(0, 0.02, 0));
    // V10.5 (G5): al cogerla y guardarla, la lata sube y baja por FUERA (hacia su derecha), sin pasar por delante de la boca
    const canP = canAir.lerp(canHip, atHip).addScaledVector(right, 0.16 * Math.sin(Math.PI * THREE.MathUtils.clamp(atHip, 0, 1))), nozD = aim.clone().sub(canP).normalize();
    const canUp = up.clone().addScaledVector(nozD, -up.dot(nozD)).normalize(), canSide = V().crossVectors(canUp, nozD).normalize();
    // la mano rodea la lata por detrás y algo por fuera (el índice queda junto a la boquilla)
    const wrist = canP.clone().addScaledVector(nozD, -0.055).addScaledVector(canSide, -0.025).addScaledVector(canUp, -0.01);
    ikPole(A.upper, A.fore, A.hand, wrist, V().addScaledVector(up, -1).addScaledVector(right, 0.8));
    // mano: dedos rodeando la lata en horizontal (hacia la derecha de la lata) y el índice arriba (de índice a meñique = hacia abajo)
    { const F = B.fing; if (F[0][0] && F[1][0] && F[3][0]) {
        const along = W(F[1][0]).sub(W(A.hand)).normalize(), across0 = W(F[3][0]).sub(W(F[0][0]));
        const basis = (x: THREE.Vector3, y0: THREE.Vector3) => { const y = y0.clone().addScaledVector(x, -y0.dot(x)).normalize(), z = V().crossVectors(x, y); return new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(x, y, z)); };
        const dA = V().addScaledVector(canSide, 1).addScaledVector(nozD, 0.35).normalize(), qd = basis(dA, canUp.clone().negate()), qc = basis(along, across0), q = qd.multiply(qc.invert());
        const wq = A.hand.getWorldQuaternion(new THREE.Quaternion()), pq = A.hand.parent!.getWorldQuaternion(new THREE.Quaternion()); A.hand.quaternion.copy(pq.invert().multiply(q.multiply(wq))); A.hand.updateMatrixWorld(true);
        // la manopla se cierra alrededor de la lata (cada falange hacia el centro de la lata); el pulgar por delante
        const grip = sm(0.12, 0.26, t) * (1 - sm(SPRAY.sec - 0.2, SPRAY.sec - 0.08, t));
        for (const ch of F) for (let j = 0; j < ch.length; j++) { const b = ch[j], nb = ch[j + 1] ?? null, tip = nb ? W(nb) : W(b).addScaledVector(along, 0.02);
          const toC = canP.clone().sub(W(b)), axis = V().crossVectors(tip.clone().sub(W(b)), toC).normalize(); if (axis.lengthSq() > 0.5) rotWorld(b, axis, [0.9, 1.1, 0.8][j] * grip); }
        for (let j = 0; j < B.thumb.length - 1; j++) { const b = B.thumb[j], toC = canP.clone().sub(W(b)), dir2 = W(B.thumb[j + 1]).sub(W(b)), axis = V().crossVectors(dir2, toC).normalize(); if (axis.lengthSq() > 0.5) rotWorld(b, axis, 0.5 * grip); } } }
    // fundido con la pose del clip al entrar y al salir
    // (las piernas NO se mezclan hueso a hueso: desplantaba los pies; su IK ya entra y sale con el peso)
    if (wIn < 1) touched.forEach((b, i) => { if (!B.legs.includes(b)) b.quaternion.copy(this.spraySaved!.q[i].clone().slerp(b.quaternion, wIn)); });
    // 4) la lata, en la mano: recta, con la boquilla hacia el punto que pinta
    const can = this.canObj(); can.visible = canOn;
    if (canOn) { this.model.updateMatrixWorld(true); const hw = W(A.hand), cp = hw.clone().addScaledVector(nozD, 0.055).addScaledVector(canSide, 0.025).addScaledVector(canUp, 0.01);
      const m = new THREE.Matrix4().makeBasis(canSide.clone().negate(), canUp, nozD), par = can.parent!; par.updateMatrixWorld(true);
      const wm = m.setPosition(cp), lm = par.matrixWorld.clone().invert().multiply(wm); lm.decompose(can.position, can.quaternion, can.scale);
      can.updateMatrixWorld(true); const nz = can.getObjectByName('ANMI_SPRAY_NOZZLE')!; nz.getWorldPosition(this.sprayNozzle.p); this.sprayNozzle.d.copy(aim).sub(this.sprayNozzle.p).normalize(); }
    this.sprayNozzle.on = canOn && atHip < 0.05;
  }
  /** La trepa entrega la escalera en uso (o null al soltarla: el agarre se funde a 0 antes de desaparecer). */
  setLadderGrip(ctx: { axis: THREE.Vector3; heading: number; width: number; rungs: number[] } | null) { if (ctx) this.ladderCtx = ctx; this.ladderOn = !!ctx; }
  private applyHandGrip(dt: number) {
    const c = this.ladderCtx; if (!c) return;
    const sides = ['Left', 'Right'] as const;
    if (!sides.every((sd) => this.arm[sd].upper && this.arm[sd].fore && this.arm[sd].hand)) return;
    this.model.updateMatrixWorld(true);
    const fwd = new THREE.Vector3(Math.sin(c.heading), 0, Math.cos(c.heading)), lat = new THREE.Vector3(fwd.z, 0, -fwd.x);
    const saved: THREE.Quaternion[] = [];
    let any = false;
    for (const sd of sides) {
      const A = this.arm[sd], G = this.grip[sd], hp = A.hand!.getWorldPosition(new THREE.Vector3());
      const vy = G.prevY === null || dt <= 0 ? 0 : (hp.y - G.prevY) / dt; G.prevY = hp.y;
        this.clipHandY[sd] = hp.y;
      if (this.handTrace.length < 6000) this.handTrace.push([sd === 'Left' ? 0 : 1, +hp.y.toFixed(3), +vy.toFixed(2), +G.w.toFixed(2), +this.footY.toFixed(3)]);
      // velocidad suavizada (el clip conducido da saltitos de un fotograma) con histéresis: agarra < 0,3 m/s, suelta > 0,6 m/s
      G.vyF += (vy - G.vyF) * (1 - Math.exp(-dt / 0.08));
      if (G.holding ? Math.abs(G.vyF) > 0.6 : Math.abs(G.vyF) < 0.3) G.holding = !G.holding;
      const gripping = this.ladderOn && G.holding;
      if (gripping && G.lock === null) { let best = c.rungs[0], bd = Infinity; for (const r of c.rungs) { const d = Math.abs(r + 0.03 - hp.y); if (d < bd) { bd = d; best = r; } } G.lock = bd < 0.2 ? best : null; }
      if (!gripping) G.lock = null;
      const wT = gripping && G.lock !== null ? 1 : 0;
      G.w += (wT - G.w) * (1 - Math.exp(-(wT > G.w ? 14 : 10) * dt)); if (G.w < 0.002) G.w = 0;
      if (G.w <= 0 || (G.lock === null && wT === 0 && G.w < 0.002)) continue;
      // objetivo: muñeca sobre el peldaño, junto al larguero de su lado (lado = el de la mano respecto al eje)
      const side = Math.sign(hp.clone().sub(c.axis).dot(lat)) || (sd === 'Left' ? 1 : -1);
      const rungY = G.lock ?? hp.y - 0.03;
      const T = c.axis.clone().setY(rungY + 0.035).addScaledVector(lat, side * (c.width / 2 - 0.1)).addScaledVector(fwd, -0.035);
      const target = hp.clone().lerp(T, G.w);
      if (!any) { for (const s2 of sides) saved.push(this.arm[s2].upper!.quaternion.clone(), this.arm[s2].fore!.quaternion.clone()); any = true; }
      this.twoBoneIK(A.upper!, A.fore!, A.hand!, target);
      if (this.gripLog.length < 4000) this.gripLog.push({ t: performance.now(), side: sd, w: +G.w.toFixed(2), rung: G.lock, err: +A.hand!.getWorldPosition(new THREE.Vector3()).distanceTo(target).toFixed(3) });
    }
    this.armSaved = any ? saved : null;
    if (!this.ladderOn && sides.every((sd) => this.grip[sd].w === 0)) this.ladderCtx = null;
  }
  /** V10.5 (revisión de animaciones R5, E5-35): en el grab la mano derecha atravesaba la tabla (los dedos asomaban por debajo del deck). IK de dos
   *  huesos que lleva la muñeca al CANTO de la tabla (por fuera del ancho y algo por encima del plano del deck, del lado en que ya está la mano y a
   *  su misma altura a lo largo, entre los ejes), con el peso del grab; se deshace antes del siguiente mixer.update como las demás capas. */
  private grabSaved: THREE.Quaternion[] | null = null;
  private deckBox: { long: number; wide: number; thick: number; half: THREE.Vector3; center: THREE.Vector3 } | null = null;
  /** Diagnóstico (pruebas y láminas): distancia de la muñeca al canto tras la IK (m) y lado. */
  grabLog: { w: number; err: number; side: number }[] = [];
  private applyGrabIK(s: Skater) {
    const w = s.grab, A = this.arm.Right, B = this.boardBone;
    if (w < 0.03 || !B || !A.upper || !A.fore || !A.hand || !this.deckMeshes.length || !this.deck?.visible) return;
    this.model.updateMatrixWorld(true);
    const inv = new THREE.Matrix4().copy(B.matrixWorld).invert();
    this.ensureDeckBox(inv);
    const D = this.deckBox!, hp = A.hand.getWorldPosition(new THREE.Vector3()), hl = hp.clone().applyMatrix4(inv), hips = A.upper.getWorldPosition(new THREE.Vector3()).applyMatrix4(inv);
    const t = hl.clone();
    const sw = Math.sign(hl.getComponent(D.wide) - D.center.getComponent(D.wide)) || 1, st = Math.sign(hips.getComponent(D.thick) - D.center.getComponent(D.thick)) || 1;
    t.setComponent(D.wide, D.center.getComponent(D.wide) + sw * (D.half.getComponent(D.wide) + 0.035));
    t.setComponent(D.thick, D.center.getComponent(D.thick) + st * (D.half.getComponent(D.thick) + 0.02));
    t.setComponent(D.long, THREE.MathUtils.clamp(hl.getComponent(D.long), D.center.getComponent(D.long) - D.half.getComponent(D.long) * 0.45, D.center.getComponent(D.long) + D.half.getComponent(D.long) * 0.45));
    const T = t.applyMatrix4(B.matrixWorld), target = hp.clone().lerp(T, THREE.MathUtils.smoothstep(w, 0, 0.6));
    this.grabSaved = [A.upper.quaternion.clone(), A.fore.quaternion.clone()];
    this.twoBoneIK(A.upper, A.fore, A.hand, target);
    if (this.grabLog.length < 2000) this.grabLog.push({ w: +w.toFixed(2), err: +A.hand.getWorldPosition(new THREE.Vector3()).distanceTo(T).toFixed(3), side: sw });
  }
  /** Caja del deck en el espacio del hueso Board (una vez): eje largo, ancho y grosor. */
  private ensureDeckBox(inv: THREE.Matrix4) {
    if (this.deckBox) return;
    {
      const bb = new THREE.Box3(), v = new THREE.Vector3();
      for (const m of this.deckMeshes) { if (m.isSkinnedMesh) m.skeleton.update(); const n = m.geometry.attributes.position.count;
        for (let i = 0; i < n; i += 3) { if (m.isSkinnedMesh) m.getVertexPosition(i, v); else v.fromBufferAttribute(m.geometry.attributes.position as THREE.BufferAttribute, i); bb.expandByPoint(v.applyMatrix4(m.matrixWorld).applyMatrix4(inv)); } }
      const size = bb.getSize(new THREE.Vector3()), ax = [0, 1, 2].sort((a, b) => size.getComponent(b) - size.getComponent(a));
      this.deckBox = { long: ax[0], wide: ax[1], thick: ax[2], half: size.multiplyScalar(0.5), center: bb.getCenter(new THREE.Vector3()) };
    }
  }
  /** V10.5 (G2 de la revisión de animaciones, E5-35): el heelflip usaba el MISMO cuerpo que el kickflip (`SK_FlipHeel` = `SK_FlipKick`); solo
   *  cambiaba el giro de la tabla. Durante la liberación de pies, el pie de delante sale por el lado contrario de la tabla (el del talón): su
   *  posición a lo ancho del deck se refleja respecto al eje de la tabla con una IK de la pierna (con un fundido de entrada y salida). */
  private heelSaved: THREE.Quaternion[] | null = null; private legB: { up: THREE.Bone; low: THREE.Bone; foot: THREE.Bone }[] | null = null;
  private applyHeelKick(s: Skater) {
    const tr = s.trick, B = this.boardBone; if (!tr || tr.kind !== 'heelflip' || !B || !this.deckMeshes.length || !this.body) return;
    const rel = this.meta['SK_FlipKick']?.release ?? [0.23, 0.85], k = THREE.MathUtils.clamp((s.trickProgress - rel[0]) / (rel[1] - rel[0]), 0, 1), w = Math.sin(Math.PI * k) * 0.85;
    if (w < 0.02) return;
    if (!this.legB) { const bs = this.body.skeleton.bones, f = (n: string) => bs.find((b) => /mixamorig/i.test(b.name) && b.name.endsWith(n));
      const L = ['Left', 'Right'].map((sd) => ({ up: f(`${sd}UpLeg`), low: f(`${sd}Leg`), foot: f(`${sd}Foot`) })); if (L.some((x) => !x.up || !x.low || !x.foot)) return; this.legB = L as any; }
    this.model.updateMatrixWorld(true);
    // en el marco del CUERPO (no del deck, que gira sobre su eje durante el flip): se refleja el desplazamiento lateral del pie de delante
    // respecto al centro de la tabla; la altura y el avance no cambian
    const fwd = new THREE.Vector3(Math.sin(this.root.rotation.y), 0, Math.cos(this.root.rotation.y)), lat = new THREE.Vector3(fwd.z, 0, -fwd.x);
    const legs = this.legB!, P = legs.map((l) => l.foot.getWorldPosition(new THREE.Vector3())), front = P[0].dot(fwd) >= P[1].dot(fwd) ? 0 : 1, Lg = legs[front];
    const off = P[front].clone().sub(B.getWorldPosition(new THREE.Vector3())).dot(lat), shift = THREE.MathUtils.clamp(-2 * off, -0.3, 0.3);
    const t = P[front].clone().addScaledVector(lat, shift);
    const T = t, target = P[front].clone().lerp(T, w), fq = Lg.foot.getWorldQuaternion(new THREE.Quaternion());
    this.heelSaved = [Lg.up.quaternion.clone(), Lg.low.quaternion.clone(), Lg.foot.quaternion.clone()]; this.heelLeg = front;
    this.twoBoneIK(Lg.up, Lg.low, Lg.foot, target);
    const pq = Lg.foot.parent!.getWorldQuaternion(new THREE.Quaternion()); Lg.foot.quaternion.copy(pq.invert().multiply(fq)); Lg.foot.updateMatrixWorld(true);   // el pie conserva su giro
  }
  private heelLeg = 0;
  /** V10.5 (G4 de la revisión de animaciones, E5-35): al correr (`SK_RunBoard`) el antebrazo derecho cruzaba el pecho en horizontal entre 0,32 y
   *  0,42 s («como mirando el reloj»): en ese tramo (con un fundido de 0,1 s a cada lado) se baja hacia el costado lo justo. */
  private runSaved: THREE.Quaternion | null = null;
  private applyRunArm() {
    const ra = this.actions.get('SK_RunBoard'), A = this.arm.Right; if (!ra || !A.fore || !A.hand || !ra.isRunning()) return;
    const w = ra.getEffectiveWeight(); if (w < 0.05) return;
    const t = ra.time, b = THREE.MathUtils.smoothstep(t, 0.22, 0.32) * (1 - THREE.MathUtils.smoothstep(t, 0.42, 0.52)), k = 0.55 * w * b; if (k < 0.01) return;
    this.runSaved = A.fore.quaternion.clone(); this.model.updateMatrixWorld(true);
    const E = A.fore.getWorldPosition(new THREE.Vector3()), H = A.hand.getWorldPosition(new THREE.Vector3()), cur = H.clone().sub(E).normalize();
    const fwd = new THREE.Vector3(Math.sin(this.root.rotation.y), 0, Math.cos(this.root.rotation.y)), want = new THREE.Vector3(0, -1, 0).addScaledVector(fwd, 0.35).normalize();
    const to = cur.clone().lerp(want, k).normalize(), q = new THREE.Quaternion().setFromUnitVectors(cur, to);
    const wq = A.fore.getWorldQuaternion(new THREE.Quaternion()), pq = A.fore.parent!.getWorldQuaternion(new THREE.Quaternion());
    A.fore.quaternion.copy(pq.invert().multiply(q.multiply(wq))); A.fore.updateMatrixWorld(true);
  }
  /** IK analítica de dos huesos en mundo: el codo conserva su plano (polo = codo actual). */
  private twoBoneIK(upper: THREE.Bone, fore: THREE.Bone, hand: THREE.Bone, target: THREE.Vector3) {
    const S = upper.getWorldPosition(new THREE.Vector3()), E = fore.getWorldPosition(new THREE.Vector3()), H = hand.getWorldPosition(new THREE.Vector3());
    const a = S.distanceTo(E), b = E.distanceTo(H); if (a < 1e-4 || b < 1e-4) return;
    const toT = target.clone().sub(S), d = THREE.MathUtils.clamp(toT.length(), Math.abs(a - b) + 1e-3, a + b - 1e-3), u = toT.normalize();
    const pole = E.clone().sub(S); pole.addScaledVector(u, -pole.dot(u)); if (pole.lengthSq() < 1e-8) pole.set(0, -1, 0); pole.normalize();
    const cosA = THREE.MathUtils.clamp((a * a + d * d - b * b) / (2 * a * d), -1, 1), sinA = Math.sqrt(1 - cosA * cosA);
    const E2 = S.clone().addScaledVector(u, a * cosA).addScaledVector(pole, a * sinA);
    const rotTo = (bone: THREE.Bone, from: THREE.Vector3, to: THREE.Vector3) => {
      const q = new THREE.Quaternion().setFromUnitVectors(from.normalize(), to.normalize());
      const wq = bone.getWorldQuaternion(new THREE.Quaternion()), pq = bone.parent!.getWorldQuaternion(new THREE.Quaternion());
      bone.quaternion.copy(pq.invert().multiply(q.multiply(wq))); bone.updateMatrixWorld(true);
    };
    rotTo(upper, E.clone().sub(S), E2.clone().sub(S));
    const E3 = fore.getWorldPosition(new THREE.Vector3()), H3 = hand.getWorldPosition(new THREE.Vector3());
    rotTo(fore, H3.sub(E3), target.clone().sub(E3));
  }

  /** V6 (trepa): tiempo del clip forzado conducido por el controlador (el clip se lanzó con timeScale 0). */
  /** V10.3 (W01, revisión de animaciones R2): un clip cuyas claves empiezan tarde (SK_LadderDown: frames 20–48 → claves de 0,833 a 2,0 s) se
   *  conduce desde su primera clave; antes se conducía desde 0 y el tramo final de la escalera se quedaba congelado y saltaba al acabar. */
  drive(name: string, t: number) { const a = this.actions.get(name); if (!a) return; const c = a.getClip();
    const t0 = (c.userData.t0 ??= c.tracks.length ? Math.min(...c.tracks.map((k) => k.times[0] ?? 0)) : 0) as number;
    a.time = t0 + THREE.MathUtils.euclideanModulo(t, (c.duration - t0) * 1.0000001); }
  /** V6 (trepa): la tabla viaja a la ESPALDA (vertical, ruedas hacia ANMI) mientras trepa; la de la mano se oculta. */
  private backBoard: THREE.Object3D | null = null; private spineBone: THREE.Object3D | null = null;
  setBackBoard(on: boolean) {
    if (on && !this.backBoard) { this.backBoard = this.makeBoardProp(); this.backBoard.name = 'ANMI_BACK_BOARD'; this.root.parent?.add(this.backBoard); this.model.traverse((o) => { if (o.name.endsWith('Spine2')) this.spineBone = o; }); }
    if (this.backBoard) this.backBoard.visible = on;
    this.setBoardVisible(!on);
  }
  private placeBackBoard(s: Skater) {
    if (!this.backBoard?.visible || !this.spineBone) return;
    this.model.updateMatrixWorld(true);
    const sp = this.spineBone.getWorldPosition(this.tmpV.clone()), h = s.headingVis, fwd = new THREE.Vector3(Math.sin(h), 0, Math.cos(h));
    const up = new THREE.Vector3(0, 1, 0), Y = fwd.clone().negate(), X = new THREE.Vector3().crossVectors(Y, up).normalize();
    this.backBoard.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(X, Y, up));
    this.backBoard.position.copy(sp).addScaledVector(fwd, -0.2).add(new THREE.Vector3(0, -0.12, 0));
  }
  private setDriven(name: string, f: number) {
    const a = this.actions.get(name); if (!a) return;
    a.time = THREE.MathUtils.clamp(f, 0, 1) * a.getClip().duration * 0.999;
  }
  private has(n: string) { return this.actions.has(n); }

  update(dt: number, s: Skater) {
    // posición interpolada (CTRL-07): misma muestra para cuerpo, tabla y cámara
    s.lerpPos(s.visualPos);
    this.root.position.copy(s.visualPos); this.footY = s.footPos.y;
    let up = s.grounded && s.riding ? s.groundNormal.clone() : new THREE.Vector3(0, 1, 0);
    if (this.extPose?.up) up = this.extPose.up.clone();   // V10: tabla apoyada en la pared/curva del reto (pose guionizada)
    // V5 T5-15 (REV04-004, DT-07): la tabla es rígida (≈0,8 m): en una cóncava de radio pequeño, colocada en el punto del pie y
    // orientada con sondas a ±0,3, la cuerda cortaba la superficie (hasta 0,21 m en quarter_bola). Ahora se apoya en la CUERDA
    // nariz–cola (rayos a ±0,4): pendiente de la cuerda y altura del punto medio de la cuerda si queda por encima del centro.
    let lift = 0;
    if (s.grounded && s.riding && s.loco !== 'grind' && !s.wallRiding && this.groundAt) {
      const h = s.headingVis, fx = Math.sin(h), fz = Math.cos(h), p = s.visualPos, y0 = p.y + 0.6;
      const hN = this.groundAt(p.x + fx * 0.4, p.z + fz * 0.4, y0), hT = this.groundAt(p.x - fx * 0.4, p.z - fz * 0.4, y0), hC = this.groundAt(p.x, p.z, y0);
      if (hN !== null && hT !== null && hC !== null && Math.abs(hN - hT) < 0.7) {
        lift = Math.max(0, (hN + hT) / 2 - hC);
        const t = new THREE.Vector3(fx * 0.8, hN - hT, fz * 0.8).normalize();
        let r = new THREE.Vector3(-fz, 0, fx); r.addScaledVector(up, -up.dot(r)).normalize();   // alabeo lateral del suelo
        const u2 = new THREE.Vector3().crossVectors(t, r).normalize(); if (u2.y < 0) u2.negate();
        if (u2.y > 0.3) up = u2;
      }
    }
    void lift;
    const align = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), up.clone().normalize());
    this.tilt.slerp(align, 1 - Math.exp(-(this.extPose?.up ? 40 : s.wallRiding ? (s.pool?.tiltRate ?? 30) : 14) * dt));   // V8 R2: en la pared del vaso se apoya más rápido
    // rumbo visible = FRENTE corporal del controlador (V4: la marcha atrás no suma π; HUM-A4-004) + revert/spin en curso
    const tr = s.trick;
    if (s.loco === 'revert') this.revertVis = Math.PI * ease(s.modeT / TUNING.revertDur); else this.revertVis = 0;
    // R8: paso lateral (modo ratón): las piernas hacia la marcha; el tronco se contrarrota después del mezclador
    { const hv = Math.hypot(s.vel.x, s.vel.z); let want = 0;
      if (s.onFoot && s.grounded && !this.override && hv > 0.3 && (s.state === 'walk' || s.state === 'walk_back')) {
        const h = s.heading, f = s.vel.x * Math.sin(h) + s.vel.z * Math.cos(h), r = -s.vel.x * Math.cos(h) + s.vel.z * Math.sin(h);
        if (Math.abs(r) > 0.2) want = THREE.MathUtils.clamp(f < -0.1 ? Math.atan2(r, -f) : -Math.atan2(r, Math.max(0, f)), -STRAFE_MAX, STRAFE_MAX);
      }
      this.strafeYaw += (want - this.strafeYaw) * (1 - Math.exp(-10 * dt)); }
    const yaw = s.headingVis + this.revertVis + s.spinVis + this.strafeYaw;
    const yawQ = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw);
    // caída suave: el cuerpo rueda de lado y vuelve (provisional hasta el clip SK_Bail)
    const bt = s.loco === 'bail' ? Math.min(1, s.modeT / TUNING.bailDur) : 0;
    const target = s.loco === 'bail' && !this.has('SK_Bail') ? Math.sin(Math.min(1, bt * 1.6) * Math.PI / 2) * (1 - THREE.MathUtils.smoothstep(bt, 0.7, 1)) * 1.1 : 0;
    this.bailRoll += (target - this.bailRoll) * (1 - Math.exp(-10 * dt));
    const rollQ = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), this.bailRoll);
    this.root.quaternion.copy(this.tilt).multiply(yawQ).multiply(rollQ);
    // V10.5 (M2, E5-35): sentarse algo más lento (≈ 0,5 s) y LEVANTARSE más lento todavía (≈ 1 s, antes 0,3 s: deslizaba de golpe)
    this.sitK += ((this.sitTarget ? 1 : 0) - this.sitK) * (1 - Math.exp(-(this.sitTarget ? 5 : 2.6) * dt));
    if (this.sitTarget === null && this.sitK < 0.002) this.sitK = 0;
    if (this.sitK > 0 && this.sitLast) {
      const k = ease(Math.min(1, this.sitK * 1.02));
      this.root.position.lerp(this.sitLast.pos, k);
      this.root.quaternion.slerp(new THREE.Quaternion().setFromAxisAngle(Y_AXIS, this.sitLast.yaw), k);
    }
    // V5 T5-15: con la orientación YA MOSTRADA (suavizada), el deck (5 puntos de nariz a cola) no puede quedar bajo la
    // superficie: se eleva lo que haga falta al instante y baja con suavidad (en llano: 0)
    { let need = 0;
      if (s.grounded && s.riding && s.loco !== 'grind' && !s.wallRiding && this.groundAt) {
        const f = new THREE.Vector3(0, 0, 1).applyQuaternion(this.root.quaternion), r = new THREE.Vector3(1, 0, 0).applyQuaternion(this.root.quaternion), p = this.root.position;
        for (const k of [-0.42, -0.21, 0, 0.21, 0.42]) for (const w of [-0.1, 0.1]) {
          const px = p.x + f.x * k + r.x * w, pz = p.z + f.z * k + r.z * w, py = p.y + f.y * k + r.y * w;
          const h = this.groundAt(px, pz, py + 0.6); if (h !== null && h - py > need && h - py < 0.5) need = h - py; }
      }
      this.boardLift = need > this.boardLift ? need : this.boardLift + (need - this.boardLift) * (1 - Math.exp(-12 * dt));
      this.root.position.y += this.boardLift; }

    let spinYaw = 0, flip = 0;
    const ang = s.trickAngleVis;
    if (tr && (tr.kind === 'spin180' || tr.kind === 'spin360')) spinYaw = ang;
    if (tr && (tr.kind === 'frontflip' || tr.kind === 'backflip' || tr.kind === 'triple')) flip = ang;
    // V5 T5-10 (D7): vueltas de presentación del choque de COCHE (mortal hacia atrás del root visual), 1 si el vuelo dura
    // < 0,7 s y 2 si más; ritmo constante y cierre antes de tocar suelo. No son trucos: no pasan por beginTrick ni trickLog.
    if (s.loco === 'impact' && s.impactCause === 'coche' && (s.impactPhase === 'launch' || s.impactPhase === 'air') && s.impactFlight > 0) {
      // progreso por tiempo de aire RESTANTE real (si cae antes sobre la superrampa o un cajón, la vuelta se cierra a tiempo)
      const left = s.vy < 0 ? s.airTimeLeft() : Math.max(0, s.impactFlight - s.impactAirT);
      const n = s.impactFlight < 0.7 ? 1 : 2, p = THREE.MathUtils.clamp(s.impactAirT / Math.max(1e-3, s.impactAirT + left * 1.1), 0, 1);
      this.impactP = Math.max(this.impactP, p);
      flip = -Math.PI * 2 * n * ease(this.impactP); this.impactSpin = Math.max(this.impactSpin, Math.abs(flip));
    } else if (s.loco !== 'impact') { if (this.impactSpin > 0) { this.impactSpinLog.push(+this.impactSpin.toFixed(3)); if (this.impactSpinLog.length > 20) this.impactSpinLog.shift(); } this.impactSpin = 0; this.impactP = 0; }
    // V5 T5-19 (HUM-A5-007): inclinación ligera hacia el giro a pie (≤ 3°, alrededor de los pies: el apoyo no se desplaza)
    const wantLean = s.onFoot && s.grounded && (s.state === 'walk' || s.state === 'walk_idle') ? THREE.MathUtils.clamp(s.turnRateActual * 0.015, -0.05, 0.05) * WALK_LEAN_SIGN : 0;
    this.walkLean += (wantLean - this.walkLean) * (1 - Math.exp(-6 * dt));
    if (this.extPose) { if (this.extPose.flip !== undefined) flip = this.extPose.flip; if (this.extPose.spin !== undefined) spinYaw = this.extPose.spin; }   // V10
    // IT3 (feedback: «el balance se debe notar con toda la inclinación, tanto del cuerpo como de la tabla»): en el grind todo el conjunto
    // (cuerpo y tabla) se inclina sobre el eje del tubo (X local tras el rumbo: orden YXZ), con pivote en los pies; la columna añade algo más
    this.spin.rotation.order = 'YXZ';
    this.spin.rotation.set(this.grindPose ? AnmiVisual.GRIND_TILT_SIGN * this.grindPose.lean * 0.45 : 0, spinYaw, this.grindPose ? 0 : this.walkLean);
    // R1-G8: con la punta otra vez abierta (rumbo de la marcha original) el pie interior del giro bajaba hasta 1,2 cm al
    // inclinar: el cuerpo sube lo que baja ese pie (media separación de pies ≈ 0,12 m × sen(inclinación); ≤ 6 mm)
    this.spin.position.y = Math.abs(Math.sin(this.walkLean)) * 0.12;
    this.pivot.rotation.set(flip, 0, 0);

    if (this.overrideOut) { this.overrideOut.t -= dt; if (this.overrideOut.t <= 0) { if (this.overrideOut.action !== this.overrideAction) this.overrideOut.action.stop(); this.overrideOut = null; } }
    if (!this.override) this.blend(dt, s);
    // el mixer de Three solo reescribe un hueso cuando su valor mezclado cambia: sin restaurar la base, la capa de flip
    // se acumulaba en los fotogramas en que el clip conducido deja la tabla quieta (media vuelta residual y salto al rodar)
    if (this.boardBone && this.boardLayered) { this.boardBone.quaternion.copy(this.boardBase); this.boardLayered = false; }
    // R6: deshace la IK de manos del fotograma anterior (el mixer no reescribe un hueso si su valor mezclado no cambia)
    if (this.spraySaved) { this.spraySaved.b.forEach((b, i) => b.quaternion.copy(this.spraySaved!.q[i])); this.sprayB?.hips.position.copy(this.spraySaved.hip); this.spraySaved = null; }   // V10.2 Q13
    if (this.armSaved) { let i = 0; for (const sd of ['Left', 'Right'] as const) { this.arm[sd].upper!.quaternion.copy(this.armSaved[i++]); this.arm[sd].fore!.quaternion.copy(this.armSaved[i++]); } this.armSaved = null; }
    if (this.grabSaved) { const A = this.arm.Right; A.upper!.quaternion.copy(this.grabSaved[0]); A.fore!.quaternion.copy(this.grabSaved[1]); this.grabSaved = null; }   // V10.5 (R5 Grab)
    if (this.runSaved) { this.arm.Right.fore!.quaternion.copy(this.runSaved); this.runSaved = null; }   // V10.5 (G4)
    if (this.heelSaved && this.legB) { const L = this.legB[this.heelLeg]; L.up.quaternion.copy(this.heelSaved[0]); L.low.quaternion.copy(this.heelSaved[1]); L.foot.quaternion.copy(this.heelSaved[2]); this.heelSaved = null; }   // V10.5 (G2)
    if (this.peaceSaved) { this.peaceList.forEach((b, i) => b.quaternion.copy(this.peaceSaved![i])); this.peaceSaved = null; }   // V10.1 (escena final)
    if (this.peaceScale) { for (const [b, o, op] of this.peaceScale) { b.scale.copy(o); if (op) b.position.copy(op); } this.peaceScale = null; }
    if (this.peaceLegs && this.peaceB) { this.peaceB.legs.forEach((b, i) => b.quaternion.copy(this.peaceLegs!.q[i])); this.peaceB.hips.position.copy(this.peaceLegs.hip); this.peaceLegs = null; }
    if (this.peaceMesh && this.peace <= 0.001) this.peaceMesh.visible = false;
    if (this.twistSaved) { this.twistBones.forEach((b, i) => b!.quaternion.copy(this.twistSaved![i])); this.twistSaved = null; }
    if (this.gSaved && this.gB) { const all = [...this.gB.spine, ...this.gB.up, ...this.gB.leg]; all.forEach((bn, i) => bn.quaternion.copy(this.gSaved![i])); this.gSaved = null; }
    if (this.gHips) { this.gHips.b.position.copy(this.gHips.p); this.gHips = null; }   // V10.3: y la cadera de la capa de grind
    this.mixer.update(dt);
    this.applyStrafeTwist();
    this.applyGrindLayer(dt);
    // capa de tabla: kickflip/heelflip = giro completo sobre su eje largo durante la liberación de pies
    if (this.boardBone && tr && (tr.kind === 'kickflip' || tr.kind === 'heelflip')) {
      const rel = this.meta['SK_FlipKick']?.release ?? [0.23, 0.85];
      const k = THREE.MathUtils.clamp((s.trickProgress - rel[0]) / (rel[1] - rel[0]), 0, 1);
      const sign = tr.kind === 'kickflip' ? -1 : 1;
      this.boardBase.copy(this.boardBone.quaternion); this.boardLayered = true;
      this.boardBone.quaternion.multiply(this.flipQ.setFromAxisAngle(Y_AXIS, sign * Math.PI * 2 * ease(k)));
    }
    // guarda de suelo en bailes/clips forzados: cada clip ya está sobre el suelo (builder, ANIM-06), pero el fundido entre dos
    // bailes con apoyos distintos hundía los pies hasta 4 cm. Se estima la suela con tobillos/dedos y se sube lo que falte
    // (al instante; baja con suavidad), con tope de 6 cm. Fuera de bailes vuelve a 0 (los clips de skate llevan IK calibrado).
    {
      let target = 0;
      // V4-ANIM-03: tumbada y levantándose (clips horneados con IK) el cuerpo deformado entraba en el suelo (tumbada ≈10 cm,
      // al arrodillarse hasta 40 cm, medido en el GLB servido): misma guarda con vértices de todo el cuerpo, tope 0,45 m
      // R11 (ANIM-10): también en la caída suave (bail): a mitad de la caída el cuerpo se hundía 14 cm en el suelo
      const impactGround = ((s.loco === 'impact' && (s.impactPhase === 'land' || s.impactPhase === 'getup')) || s.loco === 'bail') && s.grounded;
      // R1-G8: también andando AGACHADA (SK_CrouchWalk: suela hasta −1,1 cm en V5 y −1,0 en V4, clip heredado sin tocar)
      const crouchFoot = s.onFoot && s.grounded && s.isCrouched && !this.override;
      if ((this.override || this.overrideOut || impactGround || crouchFoot) && this.body && this.soleIdx.length) {
        this.model.updateMatrixWorld(true); this.body.skeleton.update();
        let low = Infinity;
        for (const i of impactGround ? this.guardIdx : this.soleIdx) { this.body.getVertexPosition(i, this.tmpV).applyMatrix4(this.body.matrixWorld); if (this.tmpV.y < low) low = this.tmpV.y; }
        // V10.3 (W01, revisión de animaciones R3/R4): en los dos bailes con la corrección de suelo horneada exagerada (lift_max > 0,3 m:
        // FunnyDancing_02 subía 1,15 m en el aire entre 1,8 y 2,35 s y Step_Hip_Hop_Dance levitaba 31 cm) la guarda también BAJA el cuerpo
        // hasta que la suela pisa el suelo (tope 1,2 m); en el resto de bailes sigue solo subiendo (no se tocan sus saltos)
        const levita = !impactGround && !!this.override && ((this.meta[this.override] as any)?.ground?.lift_max_m ?? 0) > 0.3;
        target = THREE.MathUtils.clamp(-(low - this.root.position.y - this.danceLift) + 0.002, levita ? -1.2 : 0, impactGround ? 0.45 : 0.06);
        // V10.4 R13 (usuario: «el baile 1 BREAK… te hundes la mitad del cuerpo»): Breakdance_1990 también pasa de 0,3 m y, con las piernas por
        // el aire, bajar «hasta que pise la suela» lo metía 1,17 m en el suelo. Al bajar, se para cuando CUALQUIER punto del cuerpo toca el suelo
        if (levita && target < 0 && this.guardIdx.length) { let lowAll = Infinity;
          for (const i of this.guardIdx) { this.body.getVertexPosition(i, this.tmpV).applyMatrix4(this.body.matrixWorld); if (this.tmpV.y < lowAll) lowAll = this.tmpV.y; }
          target = Math.max(target, -(lowAll - this.root.position.y - this.danceLift) + 0.002); }
      }
      // (R11, ANIM-08: limitar esta subida en el golpe hundía los pies al levantarse > 6 cm; se deja inmediata, ver INFORME_R11)
      this.danceLift = target > this.danceLift ? target : this.danceLift + (target - this.danceLift) * (1 - Math.exp(-8 * dt));
      this.model.position.y = -0.9 + this.danceLift;
    }
    // V5 T5-15: comprobación final con la pose REAL del clip: los vértices más bajos del deck deformado (ruedas, colas) no
    // pueden quedar bajo la superficie (frenada/reversa inclinan la tabla respecto a la raíz)
    const vtx = (m: THREE.SkinnedMesh, i: number) => { if (m.isSkinnedMesh) m.getVertexPosition(i, this.tmpV); else this.tmpV.fromBufferAttribute(m.geometry.attributes.position as THREE.BufferAttribute, i); return this.tmpV.applyMatrix4(m.matrixWorld); };
    if (!this.deckLow.length && this.deckMeshes.length && s.grounded && s.riding && s.loco !== 'grind') {
      // fondo de la tabla, en coordenadas de la raíz (no depende de estar parado ni en llano): el vértice más bajo de cada
      // celda de 3 cm (a lo largo) × 5 cm (a lo ancho), incluidas las colas levantadas (las toca el labio de la quarter al
      // cruzarlo), más las ruedas (los 6 cm más bajos, submuestreados)
      this.root.updateMatrixWorld(true); const all: [number, THREE.SkinnedMesh, number, number, number][] = [];
      for (const m of this.deckMeshes) { if (m.isSkinnedMesh) m.skeleton.update(); const n = m.geometry.attributes.position.count;
        for (let i = 0; i < n; i++) { const v = this.root.worldToLocal(vtx(m, i)); all.push([v.y, m, i, v.x, v.z]); } }
      const cells = new Map<string, (typeof all)[number]>();
      for (const e of all) { const key = `${Math.round(e[4] / 0.03)}|${Math.round(e[3] / 0.05)}`; const c = cells.get(key); if (!c || e[0] < c[0]) cells.set(key, e); }
      const lo = Math.min(...all.map((x) => x[0])), low = all.filter((x) => x[0] < lo + 0.06);
      const pick = new Set([...cells.values(), ...low.filter((_, k) => k % Math.max(1, Math.floor(low.length / 64)) === 0)]);
      this.deckLow = [...pick].map(([, m, i]) => [m, i]);
    }
    if (s.grounded && s.riding && s.loco !== 'grind' && !s.wallRiding && this.groundAt && this.deckLow.length) {
      this.root.updateMatrixWorld(true); for (const m of this.deckMeshes) if (m.isSkinnedMesh) m.skeleton.update();
      let need = 0;
      for (const [m, i] of this.deckLow) { const v = vtx(m, i); const h = this.groundAt(v.x, v.z, v.y + 0.6); if (h !== null && h - v.y > need && h - v.y < 0.5) need = h - v.y; }
      if (need > 0.002) { this.root.position.y += need; this.boardLift += need; }
    }
    this.applyHandGrip(dt);
    this.applySpray(dt);   // V10.1 P09
    this.applyPeace();   // V10.1 (escena final)
    this.applyGrabIK(s);   // V10.5 (R5 de la revisión de animaciones)
    this.applyRunArm();   // V10.5 (G4)
    this.applyHeelKick(s);   // V10.5 (G2)
    this.placeBackBoard(s);
    // tabla en la mano provisional: solo cuando va a pie y no hay clip propio
    if (this.handBoard && this.handBone) {
      const onFoot = (s.onFoot || s.loco === 'bail' || s.loco === 'impact') && !this.boardHidden && !this.override;
      const sitMid = this.sitK > 0.02 && this.sitK < 0.97;   // V10.5 (M2): durante el fundido de sentarse o levantarse la tabla no se ve (cruzaba el banco y las piernas)
      this.handBoard.visible = onFoot && !sitMid;
      if (this.deck) this.deck.visible = !onFoot && !this.boardHidden && !sitMid;
      if (onFoot) {
        this.model.updateMatrixWorld(true);
        const hm = this.handBone.matrixWorld.clone();
        const inv = new THREE.Matrix4().copy(this.model.matrixWorld).invert();
        const local = inv.multiply(hm);
        const p = new THREE.Vector3(), q = new THREE.Quaternion(), sc = new THREE.Vector3();
        local.decompose(p, q, sc);
        this.handBoard.position.copy(p);
        // tabla vertical junto a la cadera, ruedas hacia fuera
        this.handBoard.quaternion.setFromEuler(new THREE.Euler(Math.PI / 2, 0, Math.PI / 2));
        this.handBoard.position.add(new THREE.Vector3(0.04, -0.05, 0));
        // V5 T5-09 (OPUS-009): en el vuelo del impacto la tabla sale despedida SEPARADA del cuerpo (no vertical entre las
        // piernas): se aleja hacia atrás y gira; vuelve a la mano al caer
        if (s.loco === 'impact' && (s.impactPhase === 'launch' || s.impactPhase === 'air')) {
          const t = s.impactAirT, k = Math.min(1, t / 0.25);
          this.handBoard.position.set(0.35 + 0.5 * k, 0.75 + 0.35 * Math.sin(Math.min(1, t / 0.6) * Math.PI), -0.55 * k);
          this.handBoard.quaternion.setFromEuler(new THREE.Euler(t * 9, t * 4, Math.PI / 2 + t * 6));
        }
      }
    }
  }

  private blend(dt: number, s: Skater) {
    for (const k of this.target.keys()) this.target.set(k, 0);
    const T = this.target;
    const set = (n: string, v: number, fallback?: string) => { const name = this.has(n) ? n : fallback && this.has(fallback) ? fallback : null; if (name) T.set(name, (T.get(name) ?? 0) + v); };
    const sp = Math.abs(s.speed);
    // V8 R10: en la pared del vaso, compresión (bombeo en la curva, al engancharse y al volver del aire) con el mismo clip agachado
    this.crouchW += (Math.max(s.isCrouched ? 1 : 0, s.wallRiding ? (s.pool?.compress ?? 0) : 0) - this.crouchW) * (1 - Math.exp(-12 * dt));
    let fast = 14;
    const tr = s.trick;
    switch (s.state) {
      case 'walk_idle': case 'walk': case 'walk_back': case 'walk_air': {
        const hv = Math.hypot(s.vel.x, s.vel.z);
        // V5 T5-19: marcha completa desde 0,35 m/s (antes 0,9): a pesos parciales las piernas de reposo y marcha se promediaban
        // y la suela bajaba (giro con pasos −6 cm, marcha lenta −2 cm)
        const m = THREE.MathUtils.smoothstep(hv, 0.05, 0.35);
        // marcha atrás a pie: el mismo ciclo de andar reproducido hacia atrás (adaptación declarada, ANIM-02), nunca el clip
        // hacia delante mientras retrocede; la cadencia sigue a la velocidad real (natural_speed del clip)
        const back = s.vLong < -0.1 ? -1 : 1;
        const nat = this.meta['SK_WalkBoard']?.natural_speed ?? 1.4;
        const P = this.meta['SK_HopBoard']?.phases, lerp = THREE.MathUtils.lerp;
        if (this.crouchW > 0.5) {
          // V5 T5-19 (SOL 87): agachada QUIETA = pose propia con doble apoyo (fundido por velocidad); andando, el ciclo agachado
          const mv = this.has('SK_CrouchIdle') ? THREE.MathUtils.smoothstep(hv, 0.05, 0.25) : 1;
          set('SK_CrouchWalk', mv, 'SK_CrouchRide'); if (mv < 1) set('SK_CrouchIdle', 1 - mv);
        } else if (s.state === 'walk_air' && P) {
          // V5 T5-19 (HUM-A5-009 / N5-02): salto propio por fases (vy y tiempo en el aire); caer sin saltar = pose de caída
          let u: number;
          if (!s.hopAir) u = P.fall;
          else if (s.airTime < 0.06) u = lerp(P.prep, P.push, s.airTime / 0.06);
          else if (s.vy > 0) u = lerp(P.push, P.apex, 1 - s.vy / TUNING.hopVel);
          else u = lerp(P.apex, P.down, Math.min(1, -s.vy / TUNING.hopVel));
          set('SK_HopBoard', 1); this.setDriven('SK_HopBoard', u); fast = 22;
        } else if (s.state === 'walk_air') set('SK_HopBoard', 1, 'SK_Stand');
        else {
          // V5 T5-19 (OPUS-008): marcha ≤ 1,8 m/s, trote ≥ 2,4 m/s (cadencia < 3 pasos/s a 3 m/s); marcha atrás siempre con la marcha
          // R2-G8 (usuario, 12 oct): sin el trote procedural de T5-19 (pie hasta 27 cm, zancada 1,05 m: «patadas hacia delante»);
          // a cualquier velocidad, la marcha de V4 acelerada como antes. El clip SK_JogBoard queda en el GLB sin uso.
          // V10.1 P02 (D03): correr con SK_RunBoard (Running de Meshy llevado al esqueleto, tabla en la mano) por encima de andar
          // (R5: la mezcla empieza POR ENCIMA de andar; desde walkMax × 0,92 andar a 2,5 m/s ya llevaba un 13 % de carrera desacompasada y la
          // suela se hundía 6 cm y patinaba a 1,3 m/s: lo vio feet-v5)
          const j = 0, run = this.has('SK_RunBoard') ? THREE.MathUtils.smoothstep(hv, TUNING.walkMax + 0.05, TUNING.walkMax + 0.75) : 0;
          // recepción a pie tras un vuelo ≥ 0,15 s: contacto → absorción del propio salto, fundiéndose en 0,3 s
          const land = P && s.footLandAir >= 0.15 && s.footLandT < 0.3 ? 1 - THREE.MathUtils.smoothstep(s.footLandT, 0.15, 0.3) : 0;
          set('SK_WalkBoard', m * (1 - j) * (1 - run) * (1 - land), 'SK_Stand'); if (j) set('SK_JogBoard', m * j * (1 - land)); if (run > 0) set('SK_RunBoard', m * run * (1 - land));
          set('SK_IdleBoard', (1 - m) * (1 - land), 'SK_Stand');
          if (land > 0) { set('SK_HopBoard', land); this.setDriven('SK_HopBoard', lerp(P!.contact, P!.end, s.footLandT / 0.3)); fast = 22; }
        }
        // V5 T5-19 (HUM-A5-007): el ciclo sigue a la velocidad real también en el giro con pasos (0,35–0,5 m/s): mínimo propio 0,15
        // al girar, los pies se recolocan también por la rotación (≈ 0,15 m × velocidad de giro): demanda de pie = avance + giro
        const footV = hv + Math.abs(s.turnRateActual) * 0.15;
        const wa = this.actions.get('SK_WalkBoard'); if (wa) wa.timeScale = back * THREE.MathUtils.clamp(footV / nat, 0.15, 2.2);
        const ja = this.actions.get('SK_JogBoard'); if (ja) ja.timeScale = THREE.MathUtils.clamp(hv / (this.meta['SK_JogBoard']?.natural_speed ?? 3), 0.6, 1.5);
        const ra = this.actions.get('SK_RunBoard'); if (ra) ra.timeScale = THREE.MathUtils.clamp(hv / (this.meta['SK_RunBoard']?.natural_speed ?? 4.5), 0.55, 1.35);   // V10.1 P02: la zancada sigue a la velocidad
        // R11 (ANIM-02): la zancada real del clip es ≈ 1 m/s (el 0,714 heredado hacía patinar el pie de apoyo a 0,54 m/s); tope 3
        const cw = this.actions.get('SK_CrouchWalk'); if (cw) cw.timeScale = back * THREE.MathUtils.clamp(hv / CROUCH_WALK_SPEED, 0.15, 3.0);
        fast = 10; break;
      }
      case 'impact': {
        // V4 IMPACT-02: estrella → caída → levantarse. Clips propios (SK_ImpactStar/SK_ImpactLand/SK_GetUp) si existen;
        // si no, SK_Bail conducido por fase (provisional declarado hasta autorar la secuencia en Blender).
        const ph = s.impactPhase, IT = TUNING.impact;
        if (this.has('SK_ImpactStar') && (ph === 'launch' || ph === 'air')) { T.set('SK_ImpactStar', 1); fast = 30; }
        // R11 (ANIM-08): mezclas de ≥ 0,2 s entre estrella → caída → levantarse (con 22/16 la cadera saltaba 12–14 cm en un fotograma)
        else if (this.has('SK_ImpactLand') && ph === 'land') { T.set('SK_ImpactLand', 1); this.setDriven('SK_ImpactLand', s.impactT / IT.lieDur); fast = 9; }
        else if (this.has('SK_GetUp') && ph === 'getup') { T.set('SK_GetUp', 1); this.setDriven('SK_GetUp', s.impactT / IT.getupDur); fast = 8; }
        else { set('SK_Bail', 1, 'SK_LandHard'); this.setDriven('SK_Bail', ph === 'getup' ? 0.6 + 0.4 * s.impactT / IT.getupDur : ph === 'land' ? 0.4 + 0.2 * s.impactT / IT.lieDur : 0.15); fast = 20; }
        break;
      }
      case 'mount': set('SK_Mount', 1, 'SK_Idle'); this.setDriven('SK_Mount', s.modeT / TUNING.mountDur); fast = 24; break;
      case 'dismount': set('SK_Dismount', 1, 'SK_Stand'); this.setDriven('SK_Dismount', s.modeT / TUNING.dismountDur); fast = 18; break;  // desde frenada a fondo, 24 daba 18,5°/f en el torso
      case 'bail': set('SK_Bail', 1, 'SK_LandHard'); this.setDriven(this.has('SK_Bail') ? 'SK_Bail' : 'SK_LandHard', Math.min(1, s.modeT / TUNING.bailDur) * (this.has('SK_Bail') ? 1 : 0.5)); fast = 20; break;
      case 'grind': set('SK_Grind', 1, 'SK_Ride'); fast = 20; break;
      case 'manual': set('SK_Manual', 1, 'SK_Ride'); fast = 16; break;
      case 'pop': {
        set('SK_Pop', 1); fast = 40;
        const tk = this.meta['SK_Pop']?.takeoff ?? 2 / 12;
        this.setDriven('SK_Pop', (s.popT / TUNING.popDelay) * tk);
        break;
      }
      case 'air': {
        const left = s.vy < 0 ? s.airTimeLeft() : 9;
        const tk = this.meta['SK_Pop']?.takeoff ?? 2 / 12;
        const popped = s.airTime < 0.36 && (this.w.get('SK_Pop') ?? 0) > 0.3;
        if (tr && (tr.kind === 'kickflip' || tr.kind === 'heelflip') && tr.done && left < 0.2) { T.set('SK_Catch', 1); this.setDriven('SK_Catch', 1 - left / 0.2); fast = 24; } // giro hecho: recepción como en un ollie
        else if (tr && (tr.kind === 'kickflip' || tr.kind === 'heelflip')) { const n = tr.kind === 'heelflip' && this.has('SK_FlipHeel') ? 'SK_FlipHeel' : 'SK_FlipKick'; T.set(n, 1); this.setDriven(n, s.trickProgress); fast = 30; }
        else if (tr && (tr.kind === 'frontflip' || tr.kind === 'backflip' || tr.kind === 'triple')) {
          const p = s.trickProgress, openAt = 1 - tr.open / tr.dur;
          if (p >= openAt && this.has('SK_FlipOpen')) { T.set('SK_FlipOpen', 1); this.setDriven('SK_FlipOpen', (p - openAt) / Math.max(0.01, 1 - openAt)); }
          else set('SK_FlipTuck', 1, 'SK_Air');
          fast = 18;
        }
        else if (s.grab > 0.05) { set('SK_Grab', s.grab, 'SK_Air'); set('SK_Air', 1 - s.grab); fast = 18; }
        else if (left < 0.2) { T.set('SK_Catch', 1); this.setDriven('SK_Catch', 1 - left / 0.2); fast = 24; }
        else if (popped) { T.set('SK_Pop', 1); this.setDriven('SK_Pop', tk + (1 - tk) * Math.min(1, s.airTime / 0.3)); fast = 30; }
        else T.set('SK_Air', 1);
        break;
      }
      case 'land': {
        const hard = s.landHard, dur = hard ? 0.55 : 0.32;
        const n = hard ? 'SK_LandHard' : 'SK_Land';
        T.set(n, 1); this.setDriven(n, 1 - s.landT / dur); fast = 30; break;
      }
      default: {
        // locomoción montada en suelo (idle/ride/push/scoot/brake/revert)
        const moving = THREE.MathUtils.smoothstep(sp, 0.25, 1.4);
        // V5 T5-04 (OPUS-018): en marcha atrás el lado de la curva respecto a la MARCHA es el opuesto al del frente
        const travelSign = s.vLong < -0.3 ? -1 : 1;
        const turn = THREE.MathUtils.clamp(s.turnRateActual * Math.max(1.5, sp) * 0.11 * travelSign, -1, 1);
        const carve = Math.abs(turn) * moving;
        const ride = moving * (1 - carve), idle = 1 - moving;
        const cl = turn > 0 ? carve : 0, cr = turn < 0 ? carve : 0;
        let push = 0, brake = 0, scoot = 0;
        if (s.pushT > 0) { push = 1; this.setDriven('SK_Push', s.pushPhase); }
        if (s.scootT > 0 && this.has('SK_Scoot')) { scoot = 1; this.setDriven('SK_Scoot', s.scootPhase); }
        if (s.braking) brake = 1;
        const k = 1 - Math.max(push, brake);
        const c = this.crouchW;
        set('SK_Idle', idle * k * (1 - c)); set('SK_Ride', ride * k * (1 - c));
        set('SK_CarveL', cl * k * (1 - c)); set('SK_CarveR', cr * k * (1 - c));
        set('SK_Push', push * (1 - c)); set('SK_Brake', brake * (1 - push) * (1 - c));
        set('SK_CrouchRide', c * (1 - scoot)); if (scoot) set('SK_Scoot', c * scoot);
        // V5 T5-09: contacto intermedio → tropiezo corto (SK_LandHard conducido, peso por intensidad) sin cambio físico
        if (s.bumpT > 0) { const u = 1 - s.bumpT / TUNING.impact.bumpDur; set('SK_LandHard', 0.9 * s.bumpK * Math.sin(Math.PI * u)); this.setDriven('SK_LandHard', 0.15 + 0.5 * u); }
        fast = 10;
      }
    }
    let sum = 0;
    for (const n of this.names) {
      const cur = this.w.get(n) ?? 0, tgt = T.get(n) ?? 0;
      const v = cur + (tgt - cur) * (1 - Math.exp(-fast * dt));
      this.w.set(n, v < 1e-3 && tgt === 0 ? 0 : v); sum += this.w.get(n)!;
    }
    let best = '', bw = 0;
    for (const n of this.names) {
      const a = this.actions.get(n)!;
      const v = sum > 0 ? this.w.get(n)! / sum : 0;
      if (!a.isRunning()) a.play();
      a.enabled = true; a.setEffectiveWeight(v);
      if (v > bw) { bw = v; best = n; }
    }
    this.currentName = best;
  }
}

export { angleDiff };
