// Controlador V4 — ÚNICO responsable de movimiento y colisión (los clips no desplazan; toda traslación sale de aquí).
// Rapier resuelve contactos con una cápsula cinemática de altura variable. Encima vive el comportamiento propio.
// Contrato V4 (cap. 03, HUM-A4-002/003/004):
//   · `heading` = FRENTE CORPORAL de ANMI (y de la tabla). La velocidad es un vector del mundo; `vLong` es su componente
//     firmada sobre el frente (negativa = marcha atrás). No hay conversión de yaw por rodar hacia atrás: la marcha atrás
//     conserva el frente. Un 180/revert gira el frente (una sola conversión, en el aterrizaje o al terminar el revert).
//   · Entrada local: steer (A/D, stick X) SOLO gira; throttle (W/S, stick Y) empuja/frena/reversa respecto al frente.
//     La cámara no interviene en la conducción.
//   · Tabla explícita: boardToggle (Q / botón TABLA / LB) pide montar o bajar si es seguro. Sin automontaje ni bajada
//     por soltar; a velocidad alta la bajada se niega con aviso (no se encola).
//   · Apoyo real (FIS-02): grounded = KCC en contacto o suelo bajo el pie a ≤ supportDist. Las sondas largas solo
//     orientan la tabla; nunca sostienen el cuerpo (V3: sonda de 1,2 m + timeSinceGround reiniciado = falso suelo).
// Se conservan: empuje por fases, coast, freno, agachado/scoot, ollie con buffer/coyote, trucos por dirección (D06), EXTRA
// (D07: manual, spin 180/360, grab, grind 50-50, revert), bails, barrido nose/tail y snapshots interpolados (CTRL-07).
import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import type { InputFrame } from './input';
import { TUNING } from './tuning';
import type { PoolWall } from './poolwall';
/** V10.5 (O-13): la traza por paso (11 números con toFixed en cada paso de física) solo la usan las pruebas: solo con ?bktest (o en desarrollo). */
const TRACE = import.meta.env.DEV || (typeof location !== 'undefined' && new URLSearchParams(location.search).has('bktest'));
export { TUNING };

export type Loco = 'walk' | 'mount' | 'ride' | 'dismount' | 'manual' | 'revert' | 'grind' | 'bail' | 'impact';
export type MoveState = 'walk_idle' | 'walk' | 'walk_back' | 'walk_air' | 'mount' | 'dismount' | 'idle' | 'ride' | 'push' | 'scoot' | 'brake'
  | 'reverse' | 'pop' | 'air' | 'land' | 'manual' | 'revert' | 'grind' | 'bail' | 'impact' | 'off';
export type ImpactPhase = 'launch' | 'air' | 'land' | 'getup';
export type TrickKind = 'kickflip' | 'heelflip' | 'frontflip' | 'backflip' | 'spin180' | 'spin360' | 'triple';
export interface Trick { kind: TrickKind; t: number; dur: number; target: number; angle: number; dir: number; done: boolean; tuck: number; open: number; rush?: { a0: number; t0: number; d: number } }
export interface Rail { a: THREE.Vector3; b: THREE.Vector3; top: number; name: string }
export interface StepCtx { rails: Rail[]; now: number; noDismount?: boolean }
/** Registro por paso fijo para diagnóstico de apoyo (FIS-01): anillo de los últimos ~10 s. */
export interface StepTrace { t: number; x: number; y: number; z: number; vy: number; g: 0 | 1; kcc: 0 | 1; sup: number; ny: number; col: number; loco: string; vl: number }

export interface SkaterVisual {
  root: THREE.Object3D;
  update(dt: number, s: Skater): void;
  play?(name: string, opts?: { loop?: boolean; fade?: number; onEnd?: () => void; timeScale?: number }): void;
  setBoardVisible?(v: boolean): void;
  /** V5 (banco NMG): coloca la raíz visual en el asiento (pos en el suelo, rumbo del frente del banco); null = volver. */
  sitAt?(pos: THREE.Vector3 | null, yaw?: number): void;
  /** V6 (trepa FG): tiempo de un clip forzado conducido y tabla a la espalda. */
  drive?(name: string, t: number): void;
  setBackBoard?(on: boolean): void;
}

const UP = new THREE.Vector3(0, 1, 0);
const BOARD_TRICKS: TrickKind[] = ['kickflip', 'heelflip'];
const BODY_FLIPS: TrickKind[] = ['frontflip', 'backflip', 'triple'];
const deadzone = (v: number, d: number) => (Math.abs(v) <= d ? 0 : Math.sign(v) * Math.min(1, (Math.abs(v) - d) / (1 - d)));

export class Skater {
  body: RAPIER.RigidBody;
  collider: RAPIER.Collider;
  kcc: RAPIER.KinematicCharacterController;
  /** FRENTE corporal (y de la tabla): (sin h, 0, cos h). La marcha puede ir en contra (vLong < 0). */
  heading = Math.PI;
  vel = new THREE.Vector3();  // velocidad horizontal (mundo)
  vy = 0;
  gravityScale = 1;           // solo el vuelo del final lo cambia (D11)
  assistSpeed: number | null = null; // final: velocidad mantenida en el kicker armado
  /** R11 (TAC-01): bajada de la tabla pendiente (s restantes) y marcha atrás bloqueada hasta soltar el stick (táctil). */
  pendingDismountT = 0; noReverseUntilRelease = false;
  /** R11 (MOV-09): fuera de un intento, la asistencia del kicker solo frena por arriba (no acelera). */
  assistBrakeOnly = false;
  loco: Loco = 'walk';
  grounded = true;
  kccGrounded = false;
  supportGap = 0;             // distancia del pie al suelo bajo la sonda central (m; 9 = sin suelo en rango)
  groundNormal = new THREE.Vector3(0, 1, 0);
  groundCollider: number | null = null;
  boardPitch = 0;
  slopeTangentY = 0;
  timeSinceGround = 0;
  state: MoveState = 'walk_idle';
  // entrada local del paso (diagnóstico/presentación)
  steer = 0; throttle = 0;
  // empuje / scoot / freno / reversa
  pushT = 0; pushing = false; scootT = 0;
  /** V5 T5-19 (N5-02): en el aire a pie POR UN SALTO (no por caer de un borde); recepción a pie: tiempo desde el último
   *  aterrizaje y duración del vuelo que lo precedió (la animación de absorción solo tras vuelos ≥ 0,15 s). */
  hopAir = false; footLandT = 9; footLandAir = 0;
  /** V5 T5-19: duración del ciclo de empuje en curso (se acorta por encima de 12 m/s; la fracción de contacto no cambia). */
  pushCycleNow = 0.85;
  braking = false; reversing = false;
  private zeroT = 0;          // tiempo con intención estable en la zona neutra antes de invertir marcha
  popT = -1; popWalk = false;
  landT = 0; landHard = false;
  turnRateActual = 0;
  airTime = 0; airPeak = 0; airStartY = 0;
  impact = 0;
  frozen = false;
  modeT = 0;                  // tiempo dentro de mount/dismount/revert/bail/impact
  private pendingJump = false;   // SALTO pulsado durante montar/bajar: se ejecuta al terminar la transición (META-A4-007)
  // trucos
  trick: Trick | null = null;
  lastTrick: TrickKind | null = null;
  tricksDone: TrickKind[] = [];
  trickLog: { kind: TrickKind; ok: boolean; err: number; t: number }[] = [];
  /** V10.1 P22: trucos ya COMPLETOS en este aire (combo) y SALTO pulsado durante un truco para encadenar el siguiente al acabar. */
  chain: TrickKind[] = []; private chainQueued = false; private chainMove = { x: 0, y: 0 };
  onCombo?: (list: TrickKind[]) => void;
  grab = 0;                   // 0..1 peso del grab (presentación)
  private grabHeld = false; private grabT = 0;
  spinVis = 0;                // giro de yaw residual de presentación (spins)
  manualBal = 0; manualT = 0;
  /** R11 (MOV-01/06): ejes que ya estaban pulsados al despegar: para elegir el truco cuentan como neutros hasta soltarlos. */
  private axisMask = { x: 0, y: 0 };
  /** R11 (FPS-04): 2.º SALTO pulsado durante el pop o antes de trickArm: el truco sale en cuanto se puede. */
  trickQueued = false;
  /** R11 (TRK-03): respuesta del grab y del revert (como los demás trucos). */
  onGrab?: () => void; onRevert?: () => void;
  private jumpAt = -1e9; private extraAt = -1e9; private extraPending = -1e9;
  // grind
  rail: Rail | null = null; railS = 0; railSign = 1;
  // bail / impacto
  bailReason = '';
  impactPhase: ImpactPhase | null = null;
  impactT = 0;                // tiempo dentro de la fase de impacto
  impactProtectUntil = -1;    // reloj de sim: no se encadena otro impacto antes (protección acotada de getup)
  impactLog: { t: number; why: string; closing: number; vx: number; vy: number; vz: number; src?: string; closingRaw?: number }[] = [];
  /** V5 T5-13: normal del contacto de suelo del KCC en el último movimiento (la más horizontal con ny > 0,3). */
  private kccFloorN = new THREE.Vector3();
  /** V5 T5-09: contacto intermedio (reacción de presentación). bumpT = s restantes; bumpK = intensidad 0..1. */
  bumpT = 0; bumpK = 0; private bumpAt = -1e9;
  onBump?: (closing: number) => void;
  /** V5 T5-10: causa del impacto en curso, tiempo de vuelo previsto y tiempo en el aire (presentación de las vueltas). */
  impactCause = ''; impactFlight = 0; impactAirT = 0; private bandT = 0;
  /** V5 T5-10: el juego indica si un punto está en la banda de coches activa y hacia dónde queda el lado libre más cercano. */
  bandAt: ((p: THREE.Vector3) => { inBand: boolean; dir: THREE.Vector3 } | null) | null = null;
  /** V5 T5-14: colliders que nunca producen estrella (conos): bloquean y desvían. */
  noImpact: Set<number> | null = null;
  /** R11 (F7): transiciones (contacto inclinado ≠ pared), conos (solo golpe) y NPC (sin estrella, caída suave). */
  transitions: Set<number> | null = null; cones: Set<number> | null = null; softBail: Set<number> | null = null;
  /** V10 IT2: transiciones empinadas («vert» / «kick»), ver Park.vertFaces. */
  vertFaces: Map<number, 'vert' | 'kick'> | null = null; vertLaunches = 0; private vertAir = false;
  softHits = 0;
  /** R11 (RAMP-01): imán de raíl activo en este aire (diagnóstico). */
  private railMag = false;
  /** V5 T5-10: el juego puede vetar puntos seguros (banda de coches): no se guardan como lastSafe. */
  safeOk: ((p: THREE.Vector3) => boolean) | null = null;
  /** V8 R2: mecánica de pared del vaso de YINYANG (modo propio, solo dentro del vaso; null fuera de V8) */
  pool: PoolWall | null = null;
  /** cota de «aterrizaje» del aire de pared (el labio): airTimeLeft la usa en vez de la sonda hacia abajo */
  airFloorY: number | null = null;
  // presentación interpolada (CTRL-07)
  footPos = new THREE.Vector3();
  prevPos = new THREE.Vector3();
  prevHeading = 0;
  prevAngle = 0;
  alpha = 1;
  visualPos = new THREE.Vector3();
  /** V5 T5-05: desfase de presentación tras un escalón asistido (decae en ~0,1 s; la física ya está arriba). */
  stepVis = new THREE.Vector3();
  lastSafe = new THREE.Vector3(); lastSafeHeading = 0; lastSafeT = 0;
  // postura
  wantsCrouch = false;
  isCrouched = false;
  standBlocked = false;
  // diagnóstico
  respawns = 0; jumpsDenied = 0; bails = 0; mounts = 0; dismounts = 0; boardDenied = 0;
  events: { t: number; e: string }[] = [];
  trace: StepTrace[] = [];
  onJump?: (kind: 'ollie' | 'hop' | 'grindOut') => void; onLand?: (impact: number, hard: boolean) => void;
  onTrick?: (k: TrickKind, ok: boolean) => void; onDeny?: (why: string) => void; onBail?: (why: string) => void;
  onMode?: (loco: Loco) => void; onPushContact?: () => void; onGrind?: (on: boolean) => void;
  /** V4-AUD-03: recepción de un truco de tabla (los pies vuelven a la lija) y contacto del pie en scoot. */
  onCatch?: (k: TrickKind) => void; onScootContact?: () => void;
  private scootContactFired = false;
  onImpact?: (phase: ImpactPhase, info: { closing: number }) => void;
  wantsForward = false;
  /** V10.1 P02: corriendo a pie (y tiempo con adelante mantenido para empezar a correr). */
  running = false; private runHoldT = 0;
  /** R8 (diagnóstico): segundos a pie con la marcha respecto a la vista y en tabla girando hacia la vista. */
  mouseWalkT = 0; mouseSteerT = 0;
  now = 0;
  private jumpLock = 0;
  private coll = new RAPIER.CharacterCollision();
  private ray = new RAPIER.Ray({ x: 0, y: 0, z: 0 }, { x: 0, y: -1, z: 0 });
  private standShape: RAPIER.Capsule;
  private half = TUNING.standHalf;
  private standT = 0;
  private pushContactFired = false;

  constructor(public world: RAPIER.World, start: THREE.Vector3, heading: number) {
    const T = TUNING;
    this.body = world.createRigidBody(RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(start.x, start.y + 0.02, start.z));
    this.collider = world.createCollider(RAPIER.ColliderDesc.capsule(T.standHalf, T.radius).setTranslation(0, T.standHalf + T.radius, 0), this.body);
    this.standShape = new RAPIER.Capsule(T.standHalf, T.radius - 0.02);
    this.kcc = world.createCharacterController(T.kccOffset);
    this.kcc.setUp({ x: 0, y: 1, z: 0 });
    this.kcc.setMaxSlopeClimbAngle(THREE.MathUtils.degToRad(T.maxSlope));
    this.kcc.setMinSlopeSlideAngle(THREE.MathUtils.degToRad(T.maxSlope + 8));
    this.kcc.enableAutostep(T.autostep, 0.12, true);
    this.kcc.enableSnapToGround(T.snap);
    this.kcc.setSlideEnabled(true);
    this.heading = heading;
    this.syncFoot();
    this.prevPos.copy(this.footPos); this.prevHeading = heading;
    this.visualPos.copy(this.footPos);
    this.lastSafe.copy(this.footPos); this.lastSafeHeading = heading;
  }

  get dir() { return new THREE.Vector3(Math.sin(this.heading), 0, Math.cos(this.heading)); }
  get right() { return new THREE.Vector3(-Math.cos(this.heading), 0, Math.sin(this.heading)); }
  /** Velocidad longitudinal FIRMADA respecto al frente (negativa = marcha atrás). */
  get vLong() { return this.vel.dot(this.dir); }
  /** Compatibilidad: `speed` = vLong (firmada). */
  get speed() { return this.vLong; }
  set speed(v: number) { this.vel.copy(this.dir).multiplyScalar(v); }
  /** Rueda/anda hacia atrás respecto a su frente (antes «fakie»; ahora es una consecuencia, no un flag aparte). */
  get fakie() { return this.vLong < -0.3; }
  get facing() { return this.heading; }
  get pushPhase() { return this.pushT > 0 ? this.pushT / this.pushCycleNow : 0; }
  get scootPhase() { return this.scootT > 0 ? this.scootT / TUNING.scootCycle : 0; }
  get capsuleHeight() { return 2 * (this.half + TUNING.radius); }
  /** A pie: la tabla va en la mano (también durante montar/desmontar, que la presentación mezcla). */
  get onFoot() { return this.loco === 'walk'; }
  get riding() { return this.loco !== 'walk' && this.loco !== 'bail' && this.loco !== 'impact'; }
  get inImpact() { return this.loco === 'impact'; }
  get trickProgress() { return this.trick ? this.trick.t / this.trick.dur : 0; }
  /** Ángulo de truco interpolado para la presentación (sin envolver). */
  get trickAngleVis() { return this.trick ? THREE.MathUtils.lerp(this.prevAngle, this.trick.angle, this.alpha) : 0; }
  /** Rumbo interpolado para la presentación. */
  get headingVis() { return this.prevHeading + angleDiff(this.heading, this.prevHeading) * this.alpha; }
  /** Posición interpolada (presentación). */
  lerpPos(out = new THREE.Vector3()) { out.lerpVectors(this.prevPos, this.footPos, this.alpha); if (this.loco !== 'grind') out.y -= TUNING.kccOffset; return out.add(this.stepVisNow); }
  /** Desfase visual vigente del escalón asistido (interpolado como el resto de la presentación). */
  private stepVisNow = new THREE.Vector3();
  private ev(e: string) { this.events.push({ t: +this.now.toFixed(3), e }); if (this.events.length > 400) this.events.shift(); }

  /** Coloca al patinador (respawn/teleport autorizado): reinicia snapshots para no arrastrar la presentación. */
  teleport(p: THREE.Vector3, heading: number, loco: Loco = 'walk') {
    const prevLoco = this.loco;   // IT3 (QA-3): avisar del cambio de modo (chip y botón de tabla)
    this.pool?.reset(); this.airFloorY = null;
    this.body.setTranslation({ x: p.x, y: p.y + 0.03, z: p.z }, true);
    this.body.setNextKinematicTranslation({ x: p.x, y: p.y + 0.03, z: p.z });
    this.heading = heading; this.vel.set(0, 0, 0); this.vy = 0; this.grounded = true; this.vertAir = false;
    this.pushT = 0; this.pushing = false; this.scootT = 0; this.popT = -1; this.trick = null; this.landT = 0; this.grab = 0;
    this.spinVis = 0; this.rail = null; this.gravityScale = 1; this.assistSpeed = null; this.stepVis.set(0, 0, 0); this.stepVisNow.set(0, 0, 0);
    this.running = false; this.runHoldT = 0;   // V10.1 P02
    this.loco = loco; this.modeT = 0; this.manualT = 0; this.zeroT = 0; this.pendingJump = false; this.airTime = 0; this.pendingDismountT = 0; this.noReverseUntilRelease = false;   // R11 (EVT-01, TAC-01)
    this.impactPhase = null; this.impactT = 0;
    this.syncFoot(); this.prevPos.copy(this.footPos); this.prevHeading = heading; this.prevAngle = 0;
    this.visualPos.copy(this.footPos); this.lastSafe.copy(this.footPos); this.lastSafeHeading = heading;
    this.state = loco === 'walk' ? 'walk_idle' : 'idle';
    if (this.isCrouched || !this.headroomFree(this.footPos)) this.setCrouched(true); else this.setCrouched(false);
    if (prevLoco !== loco) this.onMode?.(loco);
  }

  private syncFoot() { const t = this.body.translation(); this.footPos.set(t.x, t.y, t.z); }
  /** V6 (trepa FG): coloca la cápsula congelada en `p` (pie) con rumbo, SIN reiniciar la interpolación (a diferencia de
   *  teleport): la presentación desliza de la posición anterior a esta. Solo con `frozen` (la física no la mueve). */
  placeKinematic(p: THREE.Vector3, heading: number) {
    const y = p.y + TUNING.kccOffset;
    this.body.setTranslation({ x: p.x, y, z: p.z }, true); this.body.setNextKinematicTranslation({ x: p.x, y, z: p.z });
    this.footPos.set(p.x, y, p.z); this.heading = heading; this.vel.set(0, 0, 0); this.vy = 0;
    if (this.isCrouched) this.setCrouched(false);
  }

  private setCrouched(on: boolean) {
    const T = TUNING;
    this.isCrouched = on;
    this.half = on ? T.crouchHalf : T.standHalf;
    this.collider.setHalfHeight(this.half);
    this.collider.setTranslationWrtParent({ x: 0, y: this.half + T.radius, z: 0 });
    // la posición mundial del collider no se recalcula hasta el siguiente world.step: el KCC de este paso veía la cápsula
    // alta con el centro de la agachada (0,35 m dentro del suelo) y la empujaba hacia arriba; se quedaba flotando (V3)
    const b = this.body.translation(); this.collider.setTranslation({ x: b.x, y: b.y + this.half + T.radius, z: b.z });
  }

  /** ¿Cabe la cápsula de pie en `foot`? Volumen FINAL de pie (excluye propio collider y sensores). */
  headroomFree(foot: THREE.Vector3) {
    const T = TUNING;
    const hit = this.world.intersectionWithShape({ x: foot.x, y: foot.y + T.standHalf + T.radius + 0.04, z: foot.z }, { x: 0, y: 0, z: 0, w: 1 },
      this.standShape, RAPIER.QueryFilterFlags.EXCLUDE_SENSORS, undefined, this.collider);
    return !hit;
  }
  /** ¿Cabe la cápsula ACTUAL (de pie o agachada) con el pie en `foot`? (V5 T5-05: escalón asistido bajo techos bajos). */
  private fitsAt(foot: THREE.Vector3) {
    const T = TUNING, shape = new RAPIER.Capsule(this.half, T.radius - 0.02);
    return !this.world.intersectionWithShape({ x: foot.x, y: foot.y + this.half + T.radius + 0.02, z: foot.z }, { x: 0, y: 0, z: 0, w: 1 },
      shape, RAPIER.QueryFilterFlags.EXCLUDE_SENSORS, undefined, this.collider);
  }
  private tmpN = new THREE.Vector3();
  /** V7: veces que se ha soltado un falso apoyo en una arista (diagnóstico de pruebas). */
  edgeReleases = 0;
  /** R11 (YY-05 / MOV-04): diagnóstico de pruebas. */
  lipReleases = 0; wedgeFrees = 0; floatSnaps = 0;
  private edgePush = new THREE.Vector3(); private wedgeDrop = new THREE.Vector3(); private tmpE = new THREE.Vector3();
  private wedgeT = 0; private wedgeY = 0; private wedgeOn = false; private lastRelAt = -1e9;
  private floatT = 0; private floatGap = -1; private poolWas = false;
  private edgeHangT = 0;
  /** Normal del contacto más cercano a la semiesfera inferior de la cápsula (si toca algo a ≤ radio + 6 cm). */
  private contactNormal(out: THREE.Vector3) {
    const T = TUNING, t = this.body.translation(), cy = t.y + T.radius;
    const pr = this.world.projectPoint({ x: t.x, y: cy, z: t.z }, true, RAPIER.QueryFilterFlags.EXCLUDE_SENSORS, undefined, this.collider);
    if (!pr) return false;
    out.set(t.x - pr.point.x, cy - pr.point.y, t.z - pr.point.z); const L = out.length();
    if (L < 1e-4 || L > T.radius + T.kccOffset + 0.06) return false;
    out.divideScalar(L); return true;
  }
  private ceilingClear(dist: number) {
    const t = this.body.translation();
    const top = t.y + this.capsuleHeight - 0.05;
    this.ray.origin = { x: t.x, y: top, z: t.z }; this.ray.dir = { x: 0, y: 1, z: 0 };
    const hit = this.world.castRay(this.ray, dist, true, RAPIER.QueryFilterFlags.EXCLUDE_SENSORS, undefined, this.collider);
    this.ray.dir = { x: 0, y: -1, z: 0 };
    return !hit;
  }
  private probe(ox: number, oz: number, maxDist: number) {
    const t = this.body.translation();
    this.ray.origin = { x: t.x + ox, y: t.y + 0.5, z: t.z + oz }; this.ray.dir = { x: 0, y: -1, z: 0 };
    return this.world.castRayAndGetNormal(this.ray, maxDist + 0.5, true, RAPIER.QueryFilterFlags.EXCLUDE_SENSORS, undefined, this.collider);
  }
  heightAboveGround(max = 12) { const h = this.probe(0, 0, max); return h ? h.timeOfImpact - 0.5 : max; }
  /** V5 T5-29: collider justo debajo (rayo central desde la cápsula, hasta `max` m bajo su centro), aunque el apoyo sea por contacto. */
  surfaceBelow(max = 1.6): number | null { const h = this.probe(0, 0, max); return h ? h.collider.handle : null; }
  /** Tiempo de vuelo restante estimado hasta el suelo de debajo (con la gravedad efectiva). */
  airTimeLeft(sweep = false) {
    const h = this.airFloorY !== null ? Math.max(0, this.footPos.y - this.airFloorY) : Math.max(0, this.heightAboveGround(14));
    const g = TUNING.gravity * this.gravityScale;
    let t = (this.vy + Math.sqrt(Math.max(0, this.vy * this.vy + 2 * g * h))) / g;
    // R11 (TRK-01): el suelo de DEBAJO no es donde se aterriza si la parábola cruza antes otra cosa (corte R1, agujero H de TRA TRA TRA:
    // el rayo vertical veía el fondo y el flip empezaba sin aire para acabarlo → caída). Barrido por tramos de 0,05 s (desde 0,05 s)
    if (sweep && t > 0.1) {
      const p = this.footPos, vx = this.vel.x, vz = this.vel.z, vy = this.vy, at = (s: number) => new THREE.Vector3(p.x + vx * s, p.y + 0.05 + vy * s - g * s * s / 2, p.z + vz * s);
      let prev = at(0.05);
      for (let s = 0.1; s <= t + 0.05; s += 0.05) {
        const q = at(s), d = q.clone().sub(prev), L = d.length();
        if (L > 1e-4) { d.divideScalar(L); this.ray.origin = { x: prev.x, y: prev.y, z: prev.z }; this.ray.dir = { x: d.x, y: d.y, z: d.z };
          const hit = this.world.castRay(this.ray, L, true, RAPIER.QueryFilterFlags.EXCLUDE_SENSORS, undefined, this.collider);
          if (hit) { t = Math.min(t, s - 0.05 + 0.05 * hit.timeOfImpact / L); break; } }
        prev = q;
      }
      this.ray.dir = { x: 0, y: -1, z: 0 };
    }
    return t;
  }
  private jumpBuffered() { return this.now - this.jumpAt <= TUNING.jumpBuffer; }
  private consumeJump() { this.jumpAt = -1e9; }

  /** Seguro para subir/bajar de la tabla ahora (sin cambiar nada). Devuelve null si es seguro o el motivo si no. */
  boardBlockReason(ctx?: StepCtx): string | null {
    const T = TUNING;
    if (!this.grounded || this.popT >= 0 || this.trick) return 'aire';
    if (this.loco === 'walk') {
      if (Math.hypot(this.vel.x, this.vel.z) > T.mountMaxSpeed || this.vLong < -0.4) return 'rapido';
      if (this.slopeTangentY > 0.35 || this.slopeTangentY < -0.35) return 'pendiente';
      return null;
    }
    if (this.loco !== 'ride') return 'ocupado';
    if (ctx?.noDismount) return 'final';
    if (Math.hypot(this.vel.x, this.vel.z) > T.dismountSpeed + 0.05) return 'rapido';
    if (Math.abs(this.slopeTangentY) > 0.15) return 'pendiente';
    if (!this.headroomFree(this.footPos)) return 'techo';
    return null;
  }

  // ================================================================== paso de simulación
  /** `f` = frame lógico del paso (entrada local: move.x = giro, move.y = propulsión/freno). */
  step(dt: number, f: InputFrame, ctx: StepCtx) {
    const T = TUNING;
    this.now = ctx.now;
    this.prevPos.copy(this.footPos); this.prevHeading = this.heading; this.prevAngle = this.trick?.angle ?? 0;
    if (this.frozen) { this.vel.set(0, 0, 0); this.vy = 0; this.pushing = false; this.pushT = 0; this.state = this.riding ? 'idle' : 'walk_idle'; return; }
    if (f.jumpPressed) { this.jumpAt = this.now; if (this.loco === 'mount' || this.loco === 'dismount') this.pendingJump = true; }
    // R11 (FPS-04): el 2.º SALTO llega durante el pop o antes de poder armar el truco → queda en cola (antes caducaba el búfer de 0,12 s)
    if (f.jumpPressed && this.riding && !this.trick && (this.popT >= 0 || (!this.grounded && this.timeSinceGround >= TUNING.coyote && this.airTime <= TUNING.trickArm))) this.trickQueued = true;
    if (this.grounded && this.popT < 0) { this.trickQueued = false; this.chainQueued = false; }
    // V10.1 P22: SALTO durante un truco que aún gira = encadenar el siguiente (con la dirección de ese momento) en cuanto acabe
    if (f.jumpPressed && this.riding && this.trick && !this.trick.done && !this.grounded && this.trick.kind !== 'triple') { this.chainQueued = true; this.chainMove = { x: f.move.x, y: f.move.y }; this.consumeJump();
      const tr = this.trick; if (!tr.rush) tr.rush = { a0: tr.angle, t0: tr.t, d: Math.max(0.16, Math.min(tr.dur - tr.t, 0.26)) }; }
    { const th = TUNING.dirThreshold, sx = Math.abs(f.move.x) >= th ? Math.sign(f.move.x) : 0, sy = Math.abs(f.move.y) >= th ? Math.sign(f.move.y) : 0;
      // R11 (MOV-01/06); R13: solo en llano. Al despegar de una rampa (subiendo por ella) la dirección mantenida cuenta tal cual
      // (decisión v3: «backflip y frontflip libres con carrerilla»: W mantenida + SALTO en el aire de un quarter = frontflip)
      if (this.grounded || this.popT >= 0) { const ramp = this.riding && Math.sign(this.vLong || 1) * this.slopeTangentY > 0.15; this.axisMask.x = ramp ? 0 : sx; this.axisMask.y = ramp ? 0 : sy; }
      else { if (sx !== this.axisMask.x) this.axisMask.x = 0; if (sy !== this.axisMask.y) this.axisMask.y = 0; } }
    this.modeT += dt;

    // --- postura (deseada vs posible): solo se levanta si cabe el volumen de pie final
    this.wantsCrouch = f.crouchDesired && this.loco !== 'grind' && this.loco !== 'manual' && this.loco !== 'impact';
    if (this.wantsCrouch && !this.isCrouched) { this.setCrouched(true); this.pushT = 0; this.pushing = false; }
    if (!this.wantsCrouch && this.isCrouched) {
      if (this.headroomFree(this.footPos)) { this.standT += dt; if (this.standT > 0.08) { this.setCrouched(false); this.standT = 0; } }
      else this.standT = 0;
    }
    this.standBlocked = this.isCrouched && !this.wantsCrouch;

    // --- entrada local: canales independientes y acotados (el giro nunca impulsa)
    const steer = deadzone(THREE.MathUtils.clamp(f.move.x, -1, 1), T.steerDead);
    const thr = deadzone(THREE.MathUtils.clamp(f.move.y, -1, 1), T.throttleDead);
    this.steer = steer; this.throttle = thr;
    this.wantsForward = thr > 0.3;

    if (this.loco === 'grind') { this.grindStep(dt, f); return; }
    // V8 R2: pared del vaso (enganche antes del paso normal: la pared no llega a dar golpe ni impacto)
    if (this.pool && (this.pool.active || this.pool.hookTry(this, dt, f) || this.pool.catchTry(this, dt, f))) { if (f.boardToggle) { this.boardDenied++; this.onDeny?.('bajar-pared'); }   // R11 (YY-04)
      this.poolWas = true; this.pool.step(this, dt, f); this.heading = angleWrap(this.heading); this.state = this.pool.active && this.pool.phase === 'air' ? 'air' : this.state; return; }

    // --- sondas de suelo: central = apoyo (corto); delantera/trasera = orientación de la tabla (pueden ser largas)
    const d = this.dir;
    const hc = this.probe(0, 0, T.radius + 0.4);
    const hf = this.probe(d.x * 0.3, d.z * 0.3, T.radius + 0.6);
    const hb = this.probe(-d.x * 0.3, -d.z * 0.3, T.radius + 0.6);
    this.supportGap = hc ? hc.timeOfImpact - 0.5 : 9;
    const supported = !!hc && this.supportGap <= T.supportDist + T.kccOffset && Math.abs(hc.normal.y) > 0.55;
    this.groundCollider = hc && supported ? hc.collider.handle : null;
    if (hc && supported) {
      this.groundNormal.set(hc.normal.x, hc.normal.y, hc.normal.z);
      if (this.groundNormal.y < 0) this.groundNormal.negate();
      if (hf && hb && hf.normal.y > 0.5 && hb.normal.y > 0.5) {
        const n2 = new THREE.Vector3(hf.normal.x + hb.normal.x, hf.normal.y + hb.normal.y, hf.normal.z + hb.normal.z).normalize();
        this.groundNormal.lerp(n2, 0.5).normalize();
        this.boardPitch = Math.atan2((hb.timeOfImpact - hf.timeOfImpact), 0.6);
      } else this.boardPitch *= 0.8;
    } else if (this.kccGrounded && this.contactNormal(this.tmpN) && this.tmpN.y > 0.3 && this.tmpN.y < 0.97) {
      // V5 T5-13 (heredado de V4): apoyada por el KCC en una pendiente empinada (curva alta de un quarter) sin suelo bajo la
      // sonda central: se usa la normal REAL del contacto de la semiesfera inferior, para que la gravedad de la pendiente la
      // devuelva rodando (V4 dejaba la normal plana y ANMI se quedaba clavada en la pared del quarter, también parada)
      this.groundNormal.copy(this.tmpN); this.boardPitch *= 0.9;
    } else { this.groundNormal.set(0, 1, 0); this.boardPitch *= 0.9; }
    const n = this.groundNormal;
    if (hf && hc && supported && hf.normal.y > 0.45 && hf.normal.y < n.y - 0.02 && this.grounded) n.lerp(new THREE.Vector3(hf.normal.x, hf.normal.y, hf.normal.z), 0.6).normalize();
    const tangent = d.clone().sub(n.clone().multiplyScalar(d.dot(n))).normalize();
    this.slopeTangentY = tangent.y;

    let turnRate = 0;
    this.braking = false; this.reversing = false;
    this.jumpLock = Math.max(0, this.jumpLock - dt);
    let fwd = this.vel.dot(d);
    let lat = this.vel.dot(this.right);

    if (this.loco === 'impact') {
      this.impactStep(dt);
      fwd = this.vel.dot(d); lat = this.vel.dot(this.right);
    } else if (this.loco === 'bail') {
      // caída suave: sin control, la inercia se apaga; al terminar se levanta a pie
      fwd = Math.sign(fwd) * Math.max(0, Math.abs(fwd) - 7 * dt); lat *= Math.exp(-6 * dt);
      if (this.grounded) this.vy = 0; else this.vy -= T.gravity * dt;
      if (this.modeT >= T.bailDur) this.recoverFromBail();
    } else if (this.onFoot || this.loco === 'mount' || this.loco === 'dismount') {
      // ------------------------------------------------ a pie (tabla en la mano)
      if (this.loco === 'walk' && f.aim !== undefined) {
        // R8 · modo ratón: W/S/A/D respecto a la VISTA (A/D = paso lateral, sin girar). Moviéndose, el frente se orienta a la
        // vista (≤ 14 rad/s); quieta, la cámara orbita libre alrededor de ANMI. La velocidad se lleva en el mundo y se expresa al
        // final en el frente nuevo (fwd/lat), así la recomposición común no la arrastra con el giro.
        const max = this.isCrouched ? T.crouchWalkMax : T.walkMax;
        let ix = steer, iy = thr; const im = Math.hypot(ix, iy); if (im > 1) { ix /= im; iy /= im; }
        // V10.1 P02: también con el ratón: adelante sin paso lateral durante 0,8 s → correr
        { const hv = Math.hypot(this.vel.x, this.vel.z); if (!this.isCrouched && iy >= 0.9 && Math.abs(ix) < 0.3 && hv > max * 0.85) { this.runHoldT += dt; if (this.runHoldT >= T.runHold) this.running = true; } else { this.runHoldT = 0; this.running = false; } }
        const tF = iy >= 0 ? (this.running ? T.runMax : iy * max) : iy * Math.min(max, T.mouseBackMax), tR = ix * max * T.mouseStrafe;
        const sa = Math.sin(f.aim), ca = Math.cos(f.aim);
        const vx = this.vel.x, vz = this.vel.z;
        let nx = vx, nz = vz;
        if (this.grounded) {
          const wx = sa * tF - ca * tR, wz = ca * tF + sa * tR;   // delante (sin, cos) · derecha (−cos, sin)
          const dx = wx - vx, dz = wz - vz, dl = Math.hypot(dx, dz);
          const up = Math.hypot(wx, wz) >= Math.hypot(vx, vz) && wx * vx + wz * vz >= 0, hv0 = Math.hypot(vx, vz);
          const rate = up ? (hv0 > T.walkMax ? T.runAccel : T.walkAccel) : (hv0 > T.walkMax + 0.05 ? T.runDecel : T.walkDecel);   // V10.1 P02
          const k = dl > 1e-6 ? Math.min(1, rate * dt / dl) : 0;
          nx = vx + dx * k; nz = vz + dz * k;
          // V10.1 R5c (ux-mouse): corriendo, la DIRECCIÓN sigue a la vista como andando (≤ 10 rad/s) y solo la rapidez cambia con la
          // aceleración de la carrera; antes toda la velocidad se reorientaba a 1,8 m/s² y, girando la vista a 5 m/s, ANMI derrapaba de lado
          const tm = Math.hypot(wx, wz);
          if (hv0 > T.walkMax + 0.05 && tm > 0.1 && wx * vx + wz * vz > 0) {
            const cur = Math.atan2(vx, vz), d = THREE.MathUtils.clamp(angleDiff(Math.atan2(wx, wz), cur), -10 * dt, 10 * dt), a2 = cur + d;
            const m2 = hv0 + THREE.MathUtils.clamp(tm - hv0, -T.runDecel * dt, T.runAccel * dt); nx = Math.sin(a2) * m2; nz = Math.cos(a2) * m2;
          }
          this.zeroT = 0;
        }
        if (im > 0.05) {
          const diff = angleDiff(f.aim, this.heading), dh = THREE.MathUtils.clamp(diff * (1 - Math.exp(-16 * dt)), -T.mouseFaceRate * dt, T.mouseFaceRate * dt);
          this.heading += dh; turnRate = dh / dt;
        }
        const d1 = this.dir, r1 = this.right;
        fwd = nx * d1.x + nz * d1.z; lat = nx * r1.x + nz * r1.z;
        this.mouseWalkT += dt;
      } else if (this.loco === 'walk') {
        // giro: A/D rotan el frente; quieto pivota en el sitio, en marcha algo más suave
        const hv0 = Math.hypot(this.vel.x, this.vel.z);
        // derecha (D, stick +X) = giro horario visto desde arriba = rumbo DECRECIENTE en la convención three (atan2(x, z))
        turnRate = -steer * T.walkTurnRate * (hv0 > 1.5 ? 0.8 : 1);
        this.heading += turnRate * dt;
        if (this.grounded) {
          const max = this.isCrouched ? T.crouchWalkMax : T.walkMax;
          // V10.1 P02: adelante a fondo (≥ 90 %) con poco giro durante 0,8 s → correr; ya corriendo, girar fuerte baja la meta hacia andar
          if (!this.isCrouched && thr >= 0.9 && fwd > max * 0.85 && (this.running || Math.abs(steer) < T.runSteer)) { this.runHoldT += dt; if (this.runHoldT >= T.runHold) this.running = true; } else { this.runHoldT = 0; if (thr < 0.9 || this.isCrouched) this.running = false; }
          let tgt = 0;
          if (thr > 0) { tgt = this.running ? T.runMax - (T.runMax - max) * Math.min(1, Math.abs(steer)) : max * thr; if (fwd < -T.zeroEps) { tgt = 0; } this.zeroT = fwd < -T.zeroEps ? 0 : this.zeroT; }
          else if (thr < 0) {
            if (fwd > T.zeroEps) { tgt = 0; this.braking = true; this.zeroT = 0; }
            else { this.zeroT += dt; tgt = this.zeroT >= T.reverseIntent ? -Math.min(max, T.walkBackMax) * -thr : 0; }
          } else {
            this.zeroT = 0;
            // V5 T5-16 (HUM-A5-007): solo giro → pasos cortos hacia el frente mientras se orienta (no gira «flotando» en el sitio)
            if (Math.abs(steer) > 0.5) tgt = T.walkTurnStep * Math.min(1, (Math.abs(steer) - 0.5) / 0.5 + 0.5) * (this.isCrouched ? 0.6 : 1);
          }
          let accel = Math.abs(tgt) > Math.abs(fwd) && Math.sign(tgt || 1) === Math.sign(fwd || tgt || 1) ? T.walkAccel : T.walkDecel;
          if (fwd > T.walkMax && tgt > fwd) accel = T.runAccel;                 // V10.1 P02: aceleración de carrera
          else if (fwd > T.walkMax + 0.05 && tgt < fwd && tgt >= 0) accel = T.runDecel;   // y frenada de carrera (no en seco)
          fwd = fwd < tgt ? Math.min(tgt, fwd + accel * dt) : Math.max(tgt, fwd - accel * dt);
          lat *= Math.exp(-14 * dt);
        }
      } else if (this.loco === 'dismount') {
        // V10.1 P02: por encima de andar se baja CORRIENDO (la marcha se conserva); por debajo, como antes (se frena al pisar)
        if (Math.abs(fwd) <= T.walkMax) fwd = Math.sign(fwd) * Math.max(0, Math.abs(fwd) - T.walkDecel * 0.6 * dt); lat *= Math.exp(-10 * dt);
      } else { // mount: conserva la velocidad peatonal (sin regalar impulso)
        lat *= Math.exp(-10 * dt);
      }
      if (this.grounded) {
        if (this.timeSinceGround > 0 && this.onFoot) { this.footLandT = 0; this.footLandAir = this.timeSinceGround; }   // V5 T5-19: recepción a pie
        else this.footLandT += dt;
        this.timeSinceGround = 0; this.vy = 0; this.hopAir = false;
        if (this.onFoot && this.popT < 0 && this.jumpBuffered()) { this.consumeJump(); this.hop();
          // V10.1 R5d: el tope del salto a pie (footJumpMax) también en fwd/lat, que recomponen la velocidad a pie en cada paso
          if (this.hopAir && !this.grounded) { const hv = Math.hypot(fwd, lat), cap = TUNING.footJumpMax; if (hv > cap) { fwd *= cap / hv; lat *= cap / hv; } } }
      } else { this.timeSinceGround += dt; this.vy -= T.gravity * this.gravityScale * dt; this.airTime += dt; this.footLandT += dt; }
      // tabla explícita
      if (this.onFoot && f.boardToggle) this.requestBoard(ctx);
      else if (this.loco === 'mount' && this.modeT >= T.mountDur) {
        this.setLoco('ride'); this.mounts++; this.pushT = 0; this.pushing = false;
        if (this.pendingJump && this.grounded) { this.pendingJump = false; this.jumpAt = this.now; } // salto pedido al montar: ollie ahora
        this.pendingJump = false;
      } else if (this.loco === 'dismount' && this.modeT >= T.dismountDur) {
        this.setLoco('walk'); this.dismounts++; this.running = Math.abs(fwd) > T.walkMax; this.runHoldT = this.running ? T.runHold : 0;   // V10.1 P02
        if (this.pendingJump && this.grounded) { this.pendingJump = false; this.jumpAt = this.now; }
        this.pendingJump = false;
      }
    } else if (this.grounded) {
      // ------------------------------------------------ montado en suelo
      this.timeSinceGround = 0;
      this.extraGround(f, fwd, ctx);
      if (this.loco !== 'revert') {
        // giro local: A/D/stick X solo rotan el frente (velocidad decide el máximo); quieto = pivote
        // V5 T5-07: 0–9 m/s idéntico a V4 (k sobre fastFrom, no sobre el crucero); por encima, tabla propia hasta turnTop a 20
        const af = Math.abs(fwd), k = THREE.MathUtils.clamp(af / T.fastFrom, 0, 1);
        let maxTurn = af < T.pivotSpeed ? T.pivotRate : af <= T.fastFrom ? THREE.MathUtils.lerp(T.turnSlow, T.turnFast, k)
          : THREE.MathUtils.lerp(T.turnFast, T.turnTop, THREE.MathUtils.clamp((af - T.fastFrom) / (T.topSpeed - T.fastFrom), 0, 1));
        if (this.isCrouched) maxTurn *= T.crouchTurn;
        if (this.loco === 'manual') maxTurn *= 0.6;
        // R8 · modo ratón: sin A/D, la tabla gira hacia la vista con su propio ritmo (el de A/D a esa velocidad). Parada y sin
        // propulsión no pivota (se puede mirar alrededor) y en marcha atrás no (girar hacia la vista yendo de espaldas confunde)
        let st = steer;
        if (f.aim !== undefined && steer === 0 && (fwd > 0.4 || (thr > 0 && fwd > -0.3))) {
          st = THREE.MathUtils.clamp(-angleDiff(f.aim, this.heading) * T.mouseSteerGain, -1, 1);
          if (Math.abs(st) < 0.02) st = 0;
          this.mouseSteerT += dt;
        }
        turnRate = -st * maxTurn;          // derecha = horario (rumbo decreciente)
        this.heading += turnRate * dt;
      }
      if (thr > -0.1) this.noReverseUntilRelease = false;   // R11 (TAC-01)
      // propulsión / freno / reversa respecto al frente (velocidad firmada)
      const cruise = cruiseFor(Math.max(0, thr));
      const canPush = !this.isCrouched && this.popT < 0 && this.slopeTangentY > -0.12 && this.slopeTangentY < T.pushMaxSlope && this.loco === 'ride';
      if (thr > 0) {
        if (fwd < -T.zeroEps) { this.braking = true; this.zeroT = 0; this.pushing = false; }          // W frena la marcha atrás
        else {
          // W nunca produce marcha atrás: desde parado empuja ya (la zona neutra solo protege el paso a reversa con S)
          this.zeroT = 0;
          if (canPush && this.pushT <= 0 && fwd < cruise - T.pushBand) { this.pushing = true; this.pushT = 1e-4; this.pushContactFired = false; }
          if (!canPush || fwd >= cruise + 0.2) this.pushing = false;
          const canScoot = this.isCrouched && this.popT < 0 && this.loco === 'ride' && fwd < T.scootMax && this.slopeTangentY > -0.12 && this.slopeTangentY < T.pushMaxSlope;
          if (canScoot && this.scootT <= 0) this.scootT = 1e-4;
        }
      } else if (thr < 0) {
        this.pushing = false;
        if (fwd > T.zeroEps) { this.braking = true; this.zeroT = 0; if (f.source === 'touch') this.noReverseUntilRelease = true; }   // S frena primero · R11 (TAC-01): en táctil, frenar hasta parar no pasa a marcha atrás sin soltar
        else {
          this.zeroT += dt;
          if (this.zeroT >= T.reverseIntent && this.loco === 'ride' && fwd > -T.reverseMax * -thr && !this.noReverseUntilRelease && !(this.pendingDismountT > 0)) { fwd -= T.reverseAccel * dt; this.reversing = true; }
          else if (fwd > -T.zeroEps) fwd = 0;                                                        // zona neutra: quieto
        }
      } else {
        // soltar = coast: sin aporte de fuerza; en llano frena poco a poco; en pendiente manda la gravedad
        this.pushing = false; this.zeroT = 0;
        if (Math.abs(this.slopeTangentY) < 0.06) fwd = Math.sign(fwd) * Math.max(0, Math.abs(fwd) - T.coastDecel * dt);
      }
      if (this.braking) fwd = Math.sign(fwd) * Math.max(0, Math.abs(fwd) - T.brakeDecel * dt);
      if (this.pushT > 0) {
        this.pushT += dt;
        // V5 T5-19: a alta velocidad el ciclo es más corto y vivo (0,85 s hasta 12 m/s → 0,60 s a 20); la fracción de contacto
        // es la misma, así que la aceleración media no cambia (curva de T5-07). Se fija al empezar cada ciclo.
        if (this.pushT < dt + 2e-4) this.pushCycleNow = T.pushCycle * (1 - 0.3 * THREE.MathUtils.clamp((Math.abs(fwd) - 12) / 8, 0, 1));
        const ph = this.pushT / this.pushCycleNow;
        // la fuerza solo existe mientras se mantiene la propulsión (soltar corta el aporte en el acto; el clip se funde solo)
        if (this.pushing && ph > T.pushContact[0] && ph < T.pushContact[1]) { fwd += (Math.abs(fwd) > T.fastFrom ? T.pushAccelFast : T.pushAccel) * dt * (fwd < 1.5 ? 1.35 : 1); if (!this.pushContactFired) { this.pushContactFired = true; this.onPushContact?.(); } }
        if (this.pushT >= this.pushCycleNow) { this.pushT = this.pushing ? 1e-4 : 0; this.pushContactFired = false; }
        if (!this.pushing && ph > T.pushContact[0]) this.pushT = 0;
      }
      if (this.scootT > 0) {
        this.scootT += dt;
        const ph = this.scootT / T.scootCycle;
        if (thr > 0 && ph > 0.25 && ph < 0.6) { fwd += T.scootAccel * dt; if (!this.scootContactFired) { this.scootContactFired = true; this.onScootContact?.(); } }
        if (this.scootT >= T.scootCycle || !this.isCrouched) { this.scootT = 0; this.scootContactFired = false; }
      }
      // R11 (TAC-01): bajada pendiente → frena hasta parar (cancelable acelerando; tope 2,5 s)
      if (this.pendingDismountT > 0) {
        this.pendingDismountT -= dt;
        if (thr > 0.5 || this.loco !== 'ride') this.pendingDismountT = 0;
        else { fwd = Math.sign(fwd) * Math.max(0, Math.abs(fwd) - 6 * dt); this.pushing = false; this.reversing = false; }
      }
      // final: kicker asistido. V5 T5-29 (DT-33, N5-04): la velocidad CONVERGE a la asistida desde abajo y desde arriba (a 20 m/s
      // el kicker la frena a 8,2: ningún despegue sale disparado hacia el anillo de coches)
      if (this.assistSpeed !== null) fwd = fwd < this.assistSpeed ? (this.assistBrakeOnly ? fwd : Math.min(this.assistSpeed, fwd + 30 * dt)) : Math.max(this.assistSpeed, fwd - 30 * dt);
      if (this.loco === 'manual') this.manualStep(dt, turnRate);
      // V5 T5-04: el revert gira el frente π; la marcha en el mundo se conserva (fwd/lat medidos con el frente previo
      // cambian de signo en el mismo paso; V4 recomponía vel = frente_nuevo·fwd e invertía la marcha)
      if (this.loco === 'revert' && this.modeT >= T.revertDur) { this.finishRevert(); fwd = -fwd; lat = -lat; }
      // rozamiento de rodadura (siempre) + aire; pendientes: la gravedad acelera bajando y frena subiendo (ambos sentidos)
      fwd = Math.sign(fwd) * Math.max(0, Math.abs(fwd) - T.rollFriction * dt);
      fwd -= T.gravity * 0.42 * this.slopeTangentY * T.slopeGain * dt;
      fwd -= dragAccel(fwd) * dt;
      fwd = THREE.MathUtils.clamp(fwd, -T.maxSpeed, T.maxSpeed);
      lat *= Math.exp(-(this.braking ? T.gripBrake : T.grip) * dt);
      // V5 T5-07: el tope es la magnitud HORIZONTAL (V4 solo acotaba la longitudinal)
      { const hm = Math.hypot(fwd, lat); if (hm > T.maxSpeed) { fwd *= T.maxSpeed / hm; lat *= T.maxSpeed / hm; } }
      this.vy = 0;
      // ollie (no durante manual: SALTO sale del manual con un ollie)
      if (this.popT < 0 && this.timeSinceGround < T.coyote && this.jumpBuffered() && this.loco !== 'revert') { this.consumeJump(); if (this.loco === 'manual') this.endManual('ollie'); this.startPop(); }
      // R11 (TAC-01): con stick (táctil/mando) BAJAR en marcha lenta (≤ 3 m/s, adelante o atrás) frena sola y baja al pararse
      // (antes «Frena para bajar» aunque se estuviera frenando, y el freno se convertía en marcha atrás). Con teclado, igual que siempre.
      // V10.1 P02 (D1-05): misma regla con teclado, táctil y mando: hasta 5 m/s se baja (corriendo si se va rápido); sin frenada automática
      if (f.boardToggle) this.requestBoard(ctx);
      if (this.pendingDismountT > 0 && Math.hypot(this.vel.x, this.vel.z) <= T.dismountSpeed) { this.pendingDismountT = 0; this.requestBoard(ctx); }
    } else {
      // ------------------------------------------------ montado en el aire
      this.timeSinceGround += dt;
      if (this.loco === 'manual' && (this.timeSinceGround >= T.coyote || this.jumpBuffered())) this.endManual('borde');   // R11 (MOV-12)
      if (this.popT < 0 && this.timeSinceGround < T.coyote && this.vy <= 0 && this.jumpBuffered() && this.loco === 'ride') { this.consumeJump(); this.startPop(); }
      // una pulsación justo tras despegar (antes de trickArm) queda en el búfer de salto y arma el truco al llegar a trickArm
      else if (this.airTime > T.trickArm && (f.jumpPressed || this.jumpBuffered() || this.trickQueued) && !this.trick && this.loco === 'ride') { this.consumeJump(); this.trickQueued = false; this.startDirTrick(f); }
      // V10.1 P22: el truco anterior ya acabó y queda aire → el siguiente (pedido durante el anterior o ahora)
      else if (this.trick && this.trick.done && this.trick.kind !== 'triple' && this.loco === 'ride' && (this.chainQueued || f.jumpPressed || this.jumpBuffered())) {
        const mv = this.chainQueued && !f.jumpPressed ? this.chainMove : f.move; this.chainQueued = false; this.consumeJump(); this.startDirTrick({ ...f, move: mv }); }
      this.extraAir(f, ctx);
      this.vy -= T.gravity * this.gravityScale * dt;
      const spinning = this.trick && (this.trick.kind === 'spin180' || this.trick.kind === 'spin360');
      if (steer && !spinning && this.gravityScale === 1) { turnRate = -steer * T.airTurn; this.heading += turnRate * dt; }
      this.airTime += dt;
      this.airPeak = Math.max(this.airPeak, this.footPos.y - this.airStartY);
      if (this.trick) this.advanceTrick(dt);
      if (this.grabHeld) { this.grabT += dt; if (!f.extraHeld || this.airTimeLeft() < 0.16) this.grabHeld = false; }
      if (f.boardToggle) { this.boardDenied++; this.onDeny?.('bajar-aire'); }   // R11 (SIS-20): antes «Sin aire suficiente para ese truco»
    }
    this.grab += ((this.grabHeld && this.grabT > 0.05 ? 1 : 0) - this.grab) * (1 - Math.exp(-14 * dt));
    if (this.popT >= 0) { this.popT += dt; if (this.popT >= T.popDelay) this.takeoff(); }
    this.heading = angleWrap(this.heading);
    this.turnRateActual = THREE.MathUtils.lerp(this.turnRateActual, turnRate, 1 - Math.exp(-8 * dt));
    this.spinVis *= Math.exp(-14 * dt);
    this.stepVis.multiplyScalar(Math.exp(-this.stepVisRate * dt)); if (this.stepVis.lengthSq() < 1e-6) { this.stepVis.set(0, 0, 0); this.stepVisRate = 28; }
    this.stepVisNow.copy(this.stepVis);

    // --- recomponer velocidad y mover con la cápsula
    const d2 = this.dir, r2 = this.right;
    if ((this.grounded || this.onFoot) && this.loco !== 'impact') this.vel.copy(d2).multiplyScalar(fwd).addScaledVector(r2, lat);
    if (this.vy < -VY_TERMINAL) this.vy = -VY_TERMINAL;   // R11 (MOV-04)
    let mx = this.vel.x * dt, mz = this.vel.z * dt, my = this.vy * dt;
    if (this.grounded && this.slopeTangentY !== 0 && !this.onFoot && this.loco !== 'impact') {
      const t2 = d2.clone().sub(n.clone().multiplyScalar(d2.dot(n))).normalize();
      const along = t2.multiplyScalar(fwd * dt);
      mx = along.x + r2.x * lat * dt; mz = along.z + r2.z * lat * dt; my = along.y;
    } else if (this.grounded && this.vy <= 0) my = 0; // en contacto: el snap mantiene el suelo (un empuje hacia abajo hacía que el KCC devolviera movimiento nulo)
    // R11 (F6b; YY-11/YY-21): en tabla, «apoyada» solo por la sonda (el KCC lleva ≥ 2 pasos sin contacto) con un hueco ESTABLE bajo el
    // pie: se cierra ese hueco bajando la cápsula (antes rodaba flotando hasta 8 cm). Nunca al despegar, al saltar ni al salir del vaso.
    { const board = this.loco === 'ride' || this.loco === 'manual' || this.loco === 'revert';
      const gap = this.supportGap - T.kccOffset;
      const ok = board && this.grounded && !this.kccGrounded && this.vy <= 0 && this.jumpLock <= 0 && this.popT < 0 && !this.poolWas && gap > 0.005 && gap < T.supportDist + 0.01;
      if (ok && this.floatGap >= 0 && Math.abs(gap - this.floatGap) < 0.003) this.floatT++; else this.floatT = 0;
      this.floatGap = ok ? gap : -1;
      if (ok && this.floatT >= 2) { my -= gap; this.floatSnaps++; } }
    this.poolWas = false;
    if (this.vy > 0.1) this.kcc.disableSnapToGround(); else this.kcc.enableSnapToGround(T.snap);
    this.kcc.computeColliderMovement(this.collider, { x: mx, y: my, z: mz }, RAPIER.QueryFilterFlags.EXCLUDE_SENSORS);
    const mv0 = this.kcc.computedMovement();
    const mv = this.stepAssist(mx, mz, { x: mv0.x, y: mv0.y, z: mv0.z });
    const wasGrounded = this.grounded;
    this.kccGrounded = this.kcc.computedGrounded();
    // V7 (TRA TRA TRA; reproducido en el hueco H y en el canto de la recepción): el KCC también da «en suelo» cuando la cápsula
    // solo ROZA una arista con el costado (canto a la altura del centro de la semiesfera inferior). Con eso `my` se anulaba y,
    // mientras se empujaba contra la cara, ANMI quedaba COLGADA bajo el canto sin poder caer, indefinidamente. Ese mismo
    // contacto de canto es el que permite encaramarse saltando a una plataforma de 0,7 m (se resuelve en uno o dos pasos con
    // el escalón asistido), así que NO se toca de entrada: el falso apoyo solo se suelta si PERSISTE 0,15 s seguidos con
    // (1) la sonda central sin suelo, (2) ningún contacto que sostenga (normal con componente vertical < 0,12) y (3) sitio para
    // la cápsula 12 cm más abajo. Apoyada en un borde, en pendiente, al aterrizar o al encaramarse nada cambia.
    // R11 (F6a; HOVER, YY-09, YY-11, NMG-15, NMG-08): además del roce casi horizontal de V7, NO sostiene el contacto de la semiesfera
    // (punto más cercano a su centro, no la lista de colisiones del KCC, que a veces viene vacía con el snap) cuando el centro está sobre
    // el vacío y (a) la normal es casi vertical-lateral (< 0,3: costado de un NPC, cara de una caja) o (b) es una ARISTA de verdad con
    // normal < EDGE_NY (la cara que hay en ese punto no tiene la normal del contacto; en la curva de un quarter o de la cápsula de un
    // NPC sí la tiene). Hace falta sitio para la cápsula 10 cm hacia fuera y 12 cm más abajo. Mismos 0,15 s: encaramarse no cambia.
    this.edgePush.set(0, 0, 0);
    { let hang = false, ex = 0, ez = 0, edge = false;
      if (this.kccGrounded && !supported && this.vy <= 0.5) {
        let ny = 0; for (let i = 0, k = this.kcc.numComputedCollisions(); i < k; i++) { const c = this.kcc.computedCollision(i, this.coll); if (c && c.normal1.y > ny) ny = c.normal1.y; }
        const b0 = this.body.translation();
        if (ny < 0.12) hang = this.fitsAt(this.tmpN.set(b0.x + mv.x, b0.y + mv.y - 0.12, b0.z + mv.z));   // V7
        if (!hang && this.contactNormal(this.tmpE)) {
          const n = this.tmpE, hl = Math.hypot(n.x, n.z);
          if (hl > 1e-3 && n.y < EDGE_NY && (n.y < 0.3 || this.isEdgeAt(n))) {
            ex = n.x / hl; ez = n.z / hl; edge = true;
            hang = this.fitsAt(this.tmpN.set(b0.x + mv.x + ex * 0.1, b0.y + mv.y - 0.12, b0.z + mv.z + ez * 0.1));
          }
        }
      }
      this.edgeHangT = hang ? this.edgeHangT + dt : 0;
      if (this.edgeHangT >= 0.15) { this.kccGrounded = false; this.edgeReleases++; if (edge) this.edgePush.set(ex, 0, ez); } }
    // R11 (YY-05): dentro del vaso, apoyada en la arista del labio sin suelo bajo la sonda: no sostiene; cae hacia dentro (catchTry la engancha)
    if (this.kccGrounded && this.vy <= 0.5 && this.pool) { const w = this.pool.lipHang(this, supported);
      if (w) { this.kccGrounded = false; this.edgePush.set(w.nx * w.push / 0.02, 0, w.nz * w.push / 0.02); this.lipReleases++; } }
    // R11 (MOV-04): ATASCADA sin bajar (en el aire con vy < −2, o soltada de una arista una y otra vez) en una ranura más estrecha que la
    // cápsula + la separación del KCC (0,03 por lado) pero donde la cápsula REAL cabe: se la baja directamente, sin el KCC
    // (tiempo «sin bajar» mientras se la sigue soltando de una arista o cae con vy < −2; una vez activo, sigue mientras la cápsula quepa)
    this.wedgeDrop.set(0, 0, 0);
    if (this.edgeHangT >= 0.15) this.lastRelAt = this.now;
    const stuck = !supported && this.loco !== 'impact' && !this.pool?.active && (this.vy < -2 || this.now - this.lastRelAt < 0.3);
    if (stuck) {
      if (this.wedgeT === 0) this.wedgeY = this.footPos.y;
      this.wedgeT += dt;
      if (!this.wedgeOn && this.footPos.y < this.wedgeY - 0.1) { this.wedgeT = dt; this.wedgeY = this.footPos.y; }   // sí baja: no es una cuña
      if (this.wedgeT >= 0.3) { const b0 = this.body.translation();
        for (const r of [0, 0.03, 0.06]) { let ok = false; for (let k = 0; k < (r ? 8 : 1); k++) { const a = k / 8 * Math.PI * 2, dx = Math.sin(a) * r, dz = Math.cos(a) * r;
            if (this.fitsAt(this.tmpN.set(b0.x + dx, b0.y - 0.06, b0.z + dz))) { this.wedgeDrop.set(dx, -0.06, dz); ok = true; break; } } if (ok) break; }
        this.wedgeOn = this.wedgeDrop.y < 0;
        if (this.wedgeOn) { this.kccGrounded = false; if (this.wedgeFrees++ % 30 === 0) this.ev('cuña'); } }
    } else { this.wedgeT = 0; this.wedgeOn = false; }
    // apoyo REAL: contacto del KCC o suelo bajo el pie dentro de la tolerancia de snap (no una sonda larga que «ve» el
    // suelo de abajo). V3: `hasGround && timeSinceGround < 0.05` con sonda de 1,2 m se autoalimentaba (HUM-A4-001).
    this.grounded = this.jumpLock <= 0 && this.vy <= 0.5 && (this.kccGrounded || (supported && this.popT < 0));
    const t = this.body.translation();
    let nx = t.x + mv.x, nz = t.z + mv.z;

    // paredes: solo superficies empinadas quitan velocidad (la componente que entra); la velocidad NORMAL de cierre decide
    // si hay impacto (un roce tangencial rápido no explota)
    let wallHit = 0, wallSrc = ''; const wallN = new THREE.Vector3();
    // R11 (F7): golpes «blandos» (NPC y props pequeños): sin estrella; golpe y, desde softFall, caída suave (los conos solo golpe)
    let softHit = 0, softKind = '';
    // V10 IT2: contacto en tabla con la parte empinada de una transición nueva (labio > 52°, que el KCC no sube): se guarda el más fuerte
    let vert: { v: number; wx: number; wz: number; cy: number; kind: 'vert' | 'kick' } | null = null;
    const soft = (h: number, v: number) => { if (v <= softHit) return; if (this.softBail?.has(h)) { softHit = v; softKind = 'npc'; } else if (this.noImpact?.has(h)) { softHit = v; softKind = this.cones?.has(h) ? 'cone' : 'prop'; } };
    this.kccFloorN.set(0, 0, 0);
    for (let i = 0, k = this.kcc.numComputedCollisions(); i < k; i++) { const c = this.kcc.computedCollision(i, this.coll); if (c && c.normal1.y > 0.3 && c.normal1.y > this.kccFloorN.y) this.kccFloorN.set(c.normal1.x, c.normal1.y, c.normal1.z); }
    const vIn = Math.hypot(this.vel.x, this.vel.z);   // |v| horizontal antes del contacto (envolvente D6 de la componente tangencial)
    for (let i = 0, k = this.kcc.numComputedCollisions(); i < k; i++) {
      const c = this.kcc.computedCollision(i, this.coll); if (!c) continue;
      const cx = c.normal1.x, cy = c.normal1.y, cz = c.normal1.z;
      // V4 (campaña VAL-02): si el contacto con el suelo llega en ESTE movimiento (el KCC ya está en suelo pero la sonda,
      // tomada antes de moverse, aún no), el collider de apoyo es el de esa colisión; si no, quedaba nulo justo en el paso
      // del aterrizaje y el final daba «fuera de la mesa» según en qué punto del paso cayera el contacto
      if (cy > 0.55 && this.kccGrounded && this.groundCollider === null && c.collider) this.groundCollider = c.collider.handle;
      if (cy > 0.45) continue;
      if (this.grounded && c.witness1.y - this.footPos.y < T.stepMax + 0.03) continue;
      const hn = Math.hypot(cx, cz); if (hn < 1e-3) continue;
      const wx = cx / hn, wz = cz / hn;
      const into = this.vel.x * wx + this.vel.z * wz;
      if (into < 0) {
        const ch = c.collider ? c.collider.handle : -1;
        if (ch >= 0 && (this.noImpact?.has(ch) || this.softBail?.has(ch))) soft(ch, -into);
        else if (ch >= 0 && cy >= 0.15 && this.transitions?.has(ch)) { /* R11 (RAMP-02/05): la cara inclinada de un quarter o de la U no es una pared */
          const vk = this.vertFaces?.get(ch);
          if (vk && (this.loco === 'ride' || this.loco === 'manual') && (this.grounded || wasGrounded) && -into > 2 && (!vert || -into > vert.v)) vert = { v: -into, wx, wz, cy, kind: vk }; }
        else if (-into > wallHit) { wallHit = -into; wallN.set(wx, 0, wz); wallSrc = 'kcc'; }
        const slide = this.vertAir && ch >= 0 && !!this.vertFaces?.has(ch);   // V10 IT2: en el vuelo «vert/kick» se resbala por la cara sin frenar
        if (this.loco !== 'impact' && !slide) {
          this.vel.x -= into * wx; this.vel.z -= into * wz; this.vel.multiplyScalar(0.97);
          const along = Math.hypot(this.vel.x, this.vel.z);
          if (along > 0.6 && this.grounded && this.riding) {
            // el frente se alinea con la marcha resultante (en marcha atrás, con la opuesta: no invierte el frente)
            const travel = Math.atan2(this.vel.x, this.vel.z), front = this.vLong < 0 ? travel + Math.PI : travel;
            this.heading = angleWrap(this.heading + angleDiff(front, this.heading) * 0.3);
          }
        } else if (!slide) { this.vel.x -= into * wx * 1.4; this.vel.z -= into * wz * 1.4; } // impacto: rebote acotado
        if (cy < -0.3 && this.vy > 0) this.vy = 0;
      }
    }
    // barrido de nose/tail (CTRL-05): media tabla no atraviesa paredes aunque la cápsula quepa
    if (this.riding) {
      const db = this.dir; // rumbo ya corregido por el contacto con la pared en este paso
      const ry = t.y + mv.y + TUNING.stepMax + 0.05; // por encima del escalón asistido: los bordillos rodables no cuentan
      for (const sgn of [1, -1]) {
        this.ray.origin = { x: nx, y: ry, z: nz };
        this.ray.dir = { x: db.x * sgn, y: 0, z: db.z * sgn };
        const h = this.world.castRayAndGetNormal(this.ray, 0.44, true, RAPIER.QueryFilterFlags.EXCLUDE_SENSORS, undefined, this.collider);
        this.ray.dir = { x: 0, y: -1, z: 0 };
        if (h && Math.abs(h.normal.y) < 0.45) {
          const pen = 0.42 - h.timeOfImpact;
          // V5 T5-09 (SOL-004): el barrido nose/tail también aporta su velocidad normal de cierre al decisor de impacto (V4
          // retenía la tabla a 0,42 m de una cara frontal sin que la cápsula llegara a tocarla y nunca había estrella)
          let toVert = false;
          if (pen > 0) {
            const hn = Math.hypot(h.normal.x, h.normal.z) || 1; let fx = h.normal.x / hn, fz = h.normal.z / hn;
            if (fx * db.x * sgn + fz * db.z * sgn > 0) { fx = -fx; fz = -fz; }   // normal de la cara hacia ANMI
            const intoN = -(this.vel.x * fx + this.vel.z * fz);
            const hh = h.collider.handle;
            if (this.noImpact?.has(hh) || this.softBail?.has(hh)) soft(hh, intoN);
            else if (Math.abs(h.normal.y) >= 0.15 && this.transitions?.has(hh)) { /* R11 (RAMP-02/05) */
              // V10 IT2: la punta de la tabla llega a la parte empinada de una transición nueva: «vert»/«kick» en vez de frenar en seco
              const vk = this.vertFaces?.get(hh);
              if (vk && this.vertAir) toVert = true;   // en el vuelo que salió de esa cara: la tabla no la «empuja» (frenaba en el aire)
              else if (vk && sgn === 1 && (this.loco === 'ride' || this.loco === 'manual') && (this.grounded || wasGrounded) && intoN > 2) {
                toVert = true; if (!vert || intoN > vert.v) vert = { v: intoN, wx: fx, wz: fz, cy: Math.abs(h.normal.y), kind: vk }; } }
            else if (intoN > wallHit) { wallHit = intoN; wallN.set(fx, 0, fz); wallSrc = 'ray'; }
          }
          if (pen > 0 && !toVert) { nx -= db.x * sgn * pen; nz -= db.z * sgn * pen; const into = (this.vel.x * db.x + this.vel.z * db.z) * sgn; if (into > 0) this.vel.addScaledVector(db, -into * sgn * 0.9); }
        }
      }
    }
    if (vert && this.loco !== 'impact') {
      // V10 IT2: antes se quitaba la componente contra la cara y ANMI frenaba en seco (de 11 a 0 m/s en 4 pasos) al llegar a ~55° en los
      // quarters del exterior, la curva del muro A y la rampa B. Ahora la marcha sigue por la cara: en un quarter sube en vertical y
      // vuelve por la misma cara; en un kicker sale por el labio con el ángulo de la cara. Velocidad de la marcha antes del contacto.
      const v = Math.min(Math.max(vIn, vert.v), T.maxSpeed), th = Math.acos(THREE.MathUtils.clamp(vert.cy, 0, 1));
      if (vert.kind === 'kick') { this.vy = v * Math.sin(th); this.vel.set(-vert.wx * v * Math.cos(th), 0, -vert.wz * v * Math.cos(th)); }
      else { this.vy = v * 0.92; this.vel.set(-vert.wx * 0.3, 0, -vert.wz * 0.3); }
      this.grounded = false; this.kccGrounded = false; this.timeSinceGround = 1e-4; this.airTime = 0; this.airPeak = 0; this.airStartY = this.footPos.y;
      this.vertLaunches++; this.vertAir = true; this.ev(`vert:${vert.kind}:${v.toFixed(1)}`);
    }
    if (this.edgePush.x !== 0 || this.edgePush.z !== 0) { nx += this.edgePush.x * 0.02; nz += this.edgePush.z * 0.02; }   // R11 (F6a/YY-05/MOV-04)
    if (this.pool) [nx, nz] = this.pool.contain(this, nx, t.y + mv.y, nz);   // V8 R2: del vaso solo se sale por E1
    if (this.wedgeDrop.y < 0) { nx = t.x + this.wedgeDrop.x; nz = t.z + this.wedgeDrop.z; mv.y = this.wedgeDrop.y; }   // R11 (MOV-04)
    this.body.setNextKinematicTranslation({ x: nx, y: t.y + mv.y, z: nz });

    if (wasGrounded && !this.grounded && this.vy <= 0) {
      // abandona el apoyo sin saltar: la caída empieza ya (sin vy=0 eterno); en rampa conserva la componente vertical
      this.vy = this.onFoot ? 0 : Math.max(0, fwd * this.slopeTangentY);
      this.timeSinceGround = 1e-4; this.airTime = 0; this.airPeak = 0; this.airStartY = this.footPos.y;
      this.ev('leave-support');
    }
    if (!wasGrounded && this.grounded) this.land();
    if (this.vy > 0 && mv.y < my * 0.5) this.vy = 0; // techo
    this.bumpT = Math.max(0, this.bumpT - dt);
    if (wallHit > T.bailWallSpeed && this.riding && this.loco !== 'bail') {
      // rebote contra la normal de la pared + parte de la velocidad tangencial que quedó tras el contacto.
      // V5 T5-09 (D6): envolvente congelada: el cierre y la componente tangencial se limitan a los de C_ref (V4 nunca superó
      // ese cierre en llano) → mismas alturas y caídas que V4 para todo cierre ≤ C_ref, y nunca mayores a 20 m/s
      const cl = Math.min(wallHit, T.impact.cRef), kt = Math.min(1, T.impact.cRef / Math.max(1e-3, vIn));
      const launch = wallN.clone().multiplyScalar(cl * 0.5).addScaledVector(new THREE.Vector3(this.vel.x, 0, this.vel.z), 0.3 * kt);
      launch.y = T.impact.minUp + cl * 0.12;
      if (this.startImpact('pared', launch, wallHit)) { const L = this.impactLog[this.impactLog.length - 1]; L.src = wallSrc; L.closingRaw = +wallHit.toFixed(2); }
    } else if (wallHit >= T.impact.bumpMin && this.riding && this.loco !== 'bail' && this.now - this.bumpAt > T.impact.bumpCool) {
      // V5 T5-09 (OPUS-003): contacto intermedio: reacción visible y audible sin cambio de estado ni de física
      this.bumpAt = this.now; this.bumpT = T.impact.bumpDur; this.bumpK = THREE.MathUtils.clamp((wallHit - T.impact.bumpMin) / (T.bailWallSpeed - T.impact.bumpMin), 0.3, 1);
      this.ev(`bump:${wallHit.toFixed(1)}:${wallSrc}`); this.onBump?.(wallHit);
    }
    if (softHit >= T.impact.bumpMin && this.riding && this.loco !== 'bail' && this.loco !== 'impact' && wallHit <= T.bailWallSpeed) {
      // R11 (NPC-03, MOV-13, NMG-19): antes frenazo en seco y en silencio (props pequeños) o estrella (NPC a > 8,5 m/s)
      const fall = softKind !== 'cone' && softHit >= T.impact.softFall;
      if (fall || this.now - this.bumpAt > T.impact.bumpCool) {
        this.bumpAt = this.now; this.bumpT = T.impact.bumpDur; this.bumpK = THREE.MathUtils.clamp((softHit - T.impact.bumpMin) / (T.bailWallSpeed - T.impact.bumpMin), 0.3, 1);
        this.ev(`bump:${softHit.toFixed(1)}:${softKind}`); this.onBump?.(softHit); this.softHits++;
      }
      if (fall) this.bail('golpe-' + softKind);
    }
    if (this.grounded && this.vy <= 0 && n.y > 0.94 && !this.isCrouched && this.loco !== 'bail' && this.loco !== 'impact' && this.supportGap <= T.supportDist + T.kccOffset + 0.02) {
      this.lastSafeT += dt;
      if (this.lastSafeT > 0.25 && (!this.safeOk || this.safeOk(this.footPos)) && this.standArea(this.footPos)) { this.lastSafe.copy(this.footPos); this.lastSafeHeading = this.heading; }   // R11 (MOV-11)
    } else this.lastSafeT = 0;

    this.landT = Math.max(0, this.landT - dt);
    this.state = this.computeState();
    if (TRACE) this.trace.push({ t: +this.now.toFixed(3), x: +this.footPos.x.toFixed(3), y: +this.footPos.y.toFixed(3), z: +this.footPos.z.toFixed(3), vy: +this.vy.toFixed(2), g: this.grounded ? 1 : 0, kcc: this.kccGrounded ? 1 : 0,
      sup: +this.supportGap.toFixed(3), ny: +n.y.toFixed(2), col: this.groundCollider ?? -1, loco: this.loco, vl: +this.vLong.toFixed(2) });
    if (this.trace.length > 600) this.trace.shift();
  }

  /**
   * V5 T5-05 (D4, DT-04 ampliada con datos de step-matrix): el autostep de Rapier por sí solo dejaba una banda de escalada
   * lenta (0,24–0,25 m lanzado, y cualquier bordillo en diagonal desde parado: ≈0,8 s con la cápsula pegada a la cara).
   * Si el movimiento horizontal pedido queda bloqueado por una cara casi vertical cuyo techo es plano:
   *   · techo ≤ stepMax sobre el pie y la cápsula de pie cabe encima → sube en ESTE paso (escalón inmediato);
   *   · techo > stepMax → se anula la subida (sin levitar pegado a la cara; bloqueo limpio).
   * No actúa en rampas ni bancos (sin cara vertical o techo inclinado), en el aire, en impacto ni en grind.
   */
  private stepAssist(mx: number, mz: number, mv: { x: number; y: number; z: number }) {
    const T = TUNING;
    if (!this.grounded || this.vy > 0 || this.loco === 'impact' || this.loco === 'grind' || this.loco === 'bail') return mv;
    const want = Math.hypot(mx, mz); if (want < 1e-3) return mv;
    const ux = mx / want, uz = mz / want, t = this.body.translation(), ground = t.y - T.kccOffset;
    // contactos reales del KCC en este movimiento: caras casi verticales (también aristas y esquinas) hacia las que se avanza
    let block = false, best: { rise: number; adv: number } | null = null;
    const y0 = ground + T.stepMax + 0.1;
    for (let i = 0, k = this.kcc.numComputedCollisions(); i < k; i++) {
      const c = this.kcc.computedCollision(i, this.coll); if (!c) continue;
      const nx = c.normal1.x, ny = c.normal1.y, nz = c.normal1.z, hn = Math.hypot(nx, nz);
      if (Math.abs(ny) >= 0.85 || hn < 1e-3) continue;          // caras y también aristas (normal inclinada)
      const wx = nx / hn, wz = nz / hn;                         // normal horizontal (de la cara hacia ANMI)
      if (ux * wx + uz * wz > -0.15) continue;                  // no se avanza hacia esa cara
      const wy = c.witness1.y; if (wy - ground > T.stepMax + 0.35) continue;   // contacto alto (pared): no es un escalón
      // ¿hay una cara VERTICAL bajo el contacto? (arista de caja/bordillo). En una curva de quarter/bank el rayo horizontal
      // encuentra la superficie inclinada: eso no es un escalón ni una cara que bloquear (lo resuelve el KCC)
      this.ray.origin = { x: t.x, y: Math.max(ground + 0.02, Math.min(wy - 0.03, ground + T.stepMax)), z: t.z }; this.ray.dir = { x: -wx, y: 0, z: -wz };
      const vf = this.world.castRayAndGetNormal(this.ray, 0.75, true, RAPIER.QueryFilterFlags.EXCLUDE_SENSORS, undefined, this.collider);
      this.ray.dir = { x: 0, y: -1, z: 0 };
      if (!vf || Math.abs(vf.normal.y) > 0.3) continue;
      // techo del obstáculo justo detrás del punto de contacto, desde stepMax + 0,10: si el rayo nace dentro de un sólido,
      // ese sólido es más alto que un escalón
      const px = c.witness1.x - wx * 0.06, pz = c.witness1.z - wz * 0.06;
      this.ray.origin = { x: px, y: y0, z: pz }; this.ray.dir = { x: 0, y: -1, z: 0 };
      const top = this.world.castRayAndGetNormal(this.ray, T.stepMax + 0.1, true, RAPIER.QueryFilterFlags.EXCLUDE_SENSORS, undefined, this.collider);
      if (!top) continue;                                        // sin techo bajo ahí
      if (top.timeOfImpact > 1e-4 && top.normal.y < 0.9) continue;   // techo inclinado (rampa, quarter, bank): lo resuelve el KCC
      const rise = y0 - top.timeOfImpact - ground;
      if (rise <= 0.03) continue;
      if (rise > T.stepMax) { block = true; continue; }
      const adv = (px - t.x) * ux + (pz - t.z) * uz + 0.04;      // avance hasta pasar el contacto
      if (adv > 0 && adv < 0.75 && (!best || rise > best.rise)) best = { rise, adv };
    }
    if (block) {   // anti-creep
      // R11 (MOV-05): subiendo una rampa pegada a un bordillo/pared lateral, la subida que explica el SUELO (contacto 0,5 < ny < 0,98)
      // se conserva: antes se anulaba y la cápsula se metía 15–20 cm en la rampa
      // (pendiente del suelo REAL bajo la sonda central: un contacto inclinado con la arista de la caja de delante no cuenta —step-matrix)
      const fy = this.groundCollider !== null && this.groundNormal.y > 0.5 && this.groundNormal.y < 0.98 ? this.groundNormal.y : 0;
      const rise = fy > 0 ? Math.hypot(mv.x, mv.z) * Math.sqrt(1 - fy * fy) / fy : 0;
      if (mv.y > rise) this.ev('step-block');
      return { x: mv.x, y: Math.min(Math.max(0, rise), mv.y), z: mv.z };
    }
    if (!best) return mv;
    // escalón: el pie (centro de la cápsula) pasa el contacto y queda sobre el techo; el salto físico (≤ ~0,45 m) se oculta en
    // la presentación con un desfase que decae (stepVis): la cámara y ANMI no «pegan un brinco»
    const adv = Math.max(best.adv, Math.hypot(mv.x, mv.z));
    const foot = new THREE.Vector3(t.x + ux * adv, ground + best.rise + T.kccOffset + 0.004, t.z + uz * adv);
    if (!this.fitsAt(foot)) return mv;                        // sin sitio arriba con la postura actual: el KCC decide
    this.ev('step-up:' + best.rise.toFixed(2));
    this.stepVis.set(t.x - foot.x, t.y - foot.y, t.z - foot.z);
    this.prevPos.sub(this.stepVis); this.stepVisNow.copy(this.stepVis);   // la interpolación de este paso no ve el salto
    return { x: foot.x - t.x, y: foot.y - t.y, z: foot.z - t.z };
  }

  private computeState(): MoveState {
    const v = this.vLong, sp = Math.abs(v);
    if (this.loco === 'impact') return 'impact';
    if (this.loco === 'bail') return 'bail';
    if (this.loco === 'mount') return 'mount';
    if (this.loco === 'dismount') return 'dismount';
    if (this.onFoot) return !this.grounded ? 'walk_air' : Math.hypot(this.vel.x, this.vel.z) > 0.15 ? (v < -0.1 ? 'walk_back' : 'walk') : 'walk_idle';
    if (this.popT >= 0) return 'pop';
    if (!this.grounded) return 'air';
    if (this.loco === 'manual') return 'manual';
    if (this.loco === 'revert') return 'revert';
    if (this.landT > 0) return 'land';
    if (this.braking) return 'brake';
    if (this.scootT > 0) return 'scoot';
    if (this.pushT > 0) return 'push';
    if (v < -0.4) return 'reverse';
    return sp > 0.4 ? 'ride' : 'idle';
  }

  private setLoco(l: Loco) { if (this.loco !== l) { this.loco = l; this.modeT = 0; this.ev('loco:' + l); this.onMode?.(l); } }
  /** Petición explícita de la tabla (una por pulsación): monta o baja si es seguro; si no, aviso y NO se encola. */
  requestBoard(ctx?: StepCtx) {
    const why = this.boardBlockReason(ctx);
    if (why) { this.boardDenied++; this.ev('board-denied:' + why); this.onDeny?.(this.loco === 'walk' ? 'subir-' + why : 'bajar-' + why); return false; }
    if (this.loco === 'walk') { this.setLoco('mount'); this.zeroT = 0; this.pushing = false; this.pushT = 0; this.running = false; this.runHoldT = 0; }
    else { this.pushing = false; this.pushT = 0; this.scootT = 0; this.setLoco('dismount'); }
    return true;
  }
  /** Bajarse de la tabla ya (solo actividades con teletransporte declarado, nunca a velocidad). */
  forceWalk() { if (this.loco !== 'walk') { this.setLoco('walk'); this.vel.set(0, 0, 0); this.pushT = 0; this.pushing = false; this.trick = null; } }
  /** Subir a la tabla ya (reintento del final, pruebas de interfaz). */
  forceRide() { if (this.loco === 'walk') this.setLoco('ride'); }

  // ------------------------------------------------------------------ salto
  private hop() {
    if (!this.ceilingClear(0.25)) { this.jumpsDenied++; this.onDeny?.('techo'); return; }
    // V10.1 R5c: saltar corriendo sale como mucho a footJumpMax (3 m/s, el andar de V10): el salto final de TT sigue siendo solo en tabla
    { const hv = Math.hypot(this.vel.x, this.vel.z), cap = TUNING.footJumpMax; if (hv > cap) { this.vel.x *= cap / hv; this.vel.z *= cap / hv; } }
    this.vy = TUNING.hopVel; this.grounded = false; this.jumpLock = 0.1; this.timeSinceGround = TUNING.coyote;
    this.airTime = 0; this.airStartY = this.footPos.y; this.kcc.disableSnapToGround(); this.ev('hop'); this.onJump?.('hop'); this.hopAir = true;
  }
  private startPop() {
    if (!this.ceilingClear(this.isCrouched ? 0.5 : 0.35)) { this.jumpsDenied++; this.onDeny?.('techo'); this.ev('jump-denied'); return; }
    this.popT = 0; this.pushT = 0; this.pushing = false; this.scootT = 0; this.ev('pop');
  }
  private takeoff() {
    this.popT = -1;
    this.jumpLock = 0.12;
    const fwd = this.speed;
    this.vy = TUNING.ollieVel + Math.max(0, fwd * this.slopeTangentY * TUNING.rampLaunch);
    if (this.wantsForward && fwd < TUNING.jumpMinSpeed && fwd > 1.0) this.speed = TUNING.jumpMinSpeed;
    this.grounded = false;
    this.timeSinceGround = TUNING.coyote;
    this.airTime = 0; this.airPeak = 0; this.airStartY = this.footPos.y;
    this.kcc.disableSnapToGround();
    this.ev('takeoff');
    this.onJump?.('ollie');
  }
  /** Lanzamiento explícito (asistencia declarada del final). Mantiene la cápsula y la colisión reales. */
  launch(vh: THREE.Vector3, vy: number, gravityScale: number) {
    this.vel.set(vh.x, 0, vh.z); this.vy = vy; this.gravityScale = gravityScale;
    this.grounded = false; this.jumpLock = 0.2; this.timeSinceGround = TUNING.coyote; this.popT = -1;
    this.airTime = 0; this.airPeak = 0; this.airStartY = this.footPos.y; this.kcc.disableSnapToGround(); this.ev('launch');
  }

  /** V8 R2: recepción del aire de pared en el labio (misma evaluación de trucos que cualquier aterrizaje). */
  wallLand() { this.land(); }
  get wallRiding() { return !!this.pool?.active && this.pool.phase === 'wall'; }
  /** V8 R2: trucos durante el aire de pared (SALTO + dirección, como en cualquier aire; `pend` = pedido en la subida). */
  wallAirTricks(dt: number, f: InputFrame, pend: { x: number; y: number } | null) {
    const T = TUNING;
    if (pend && !this.trick) this.pendWall = pend;
    if (this.airTime > T.trickArm && !this.trick && this.loco === 'ride' && (f.jumpPressed || this.jumpBuffered() || this.pendWall)) {
      const m = f.jumpPressed || this.jumpBuffered() ? f.move : this.pendWall!; this.consumeJump(); this.pendWall = null;
      this.startDirTrick({ ...f, move: m }, false);   // R12: en el vaso la dirección cuenta tal cual (↑ para subir + SALTO = frontflip)
    }
    // R11 (YY-03/TRK-02): EXTRA en el aire de pared hace grab (los giros chocarían con el giro de 180° del aire de pared: aviso)
    if (f.extraPressed && this.loco === 'ride' && !this.grabHeld) {
      const d = this.pickDir(f.move, false);
      if (d === 'left' || d === 'right') { this.ev('giro-pared-denegado'); this.onDeny?.('giro-pared'); }
      else if (this.trick && BODY_FLIPS.includes(this.trick.kind)) this.ev('grab-denied-flip');
      else if (this.airTimeLeft() >= TUNING.grabMin) { this.grabHeld = true; this.grabT = 0; this.ev('grab'); this.onGrab?.(); }
      else this.onDeny?.('aire');
    }
    if (this.grabHeld) { this.grabT += dt; if (!f.extraHeld || this.airTimeLeft() < 0.16) this.grabHeld = false; }
    this.grab += ((this.grabHeld && this.grabT > 0.05 ? 1 : 0) - this.grab) * (1 - Math.exp(-14 * dt));
    this.airTime += dt; this.airPeak = Math.max(this.airPeak, this.footPos.y - this.airStartY);
    if (this.trick) this.advanceTrick(dt);
  }
  private pendWall: { x: number; y: number } | null = null;

  // ------------------------------------------------------------------ trucos (D06 / D07)
  /** Dirección lógica elegida al pulsar (antes de rotar a mundo): eje dominante con umbral. R11 (MOV-01/06): un eje que ya estaba
   *  pulsado al despegar (W para empujar) es neutro hasta soltarlo; en empate gana el eje horizontal (antes repetía el truco anterior). */
  private pickDir(m: { x: number; y: number }, useMask = true) {
    // R12: la máscara es para el aire normal (W para empujar); en el aire de pared del vaso no se aplica (ahí ↑/↓ son la intención)
    const mx = useMask && this.axisMask.x !== 0 ? 0 : m.x, my = useMask && this.axisMask.y !== 0 ? 0 : m.y;
    const ax = Math.abs(mx), ay = Math.abs(my), th = TUNING.dirThreshold;
    if (ax < th && ay < th) return null;
    if (ax >= th && Math.abs(ax - ay) < 0.08) return mx > 0 ? 'right' : 'left';
    return ax > ay ? (mx > 0 ? 'right' : 'left') : (my > 0 ? 'up' : 'down');
  }
  private startDirTrick(f: InputFrame, useMask = true) {
    const T = TUNING;
    const d = this.pickDir(f.move, useMask);
    const kind: TrickKind = d === 'up' ? 'frontflip' : d === 'down' ? 'backflip' : d === 'right' ? 'heelflip' : 'kickflip';
    this.beginTrick(kind);
    void T;
  }
  /** Inicia un truco si cabe en el aire restante; si no cabe, lo rechaza con aviso leve (nunca lo completa al tocar). */
  beginTrick(kind: TrickKind, opts: { dur?: number; target?: number; tuck?: number; open?: number } = {}) {
    const T = TUNING;
    const left = this.airTimeLeft(kind !== 'triple' && this.gravityScale === 1 && this.airFloorY === null);   // R11 (TRK-01)
    let dur = 0, min = 0, target = 0;
    if (BOARD_TRICKS.includes(kind)) { dur = T.boardFlipDur; min = T.boardFlipMin; target = (kind === 'kickflip' ? -1 : 1) * Math.PI * 2; }
    else if (kind === 'frontflip' || kind === 'backflip') { dur = T.bodyFlipDur; min = T.bodyFlipMin; target = (kind === 'frontflip' ? 1 : -1) * Math.PI * 2; }
    else if (kind === 'spin180') { dur = T.spin180Dur; min = T.spinMin; target = -Math.PI; }
    else if (kind === 'spin360') { dur = T.spin360Dur; min = T.spinMin + 0.12; target = Math.PI * 2; }
    else if (kind === 'triple') { dur = opts.dur ?? 2.0; min = 1.4; target = -Math.PI * 2 * T.final.turns; }
    if (opts.dur) dur = opts.dur; if (opts.target !== undefined) target = opts.target;
    if (this.trick?.done && (kind === 'frontflip' || kind === 'backflip')) min = Math.min(min, 0.45);   // V10.1 P22: flip encadenado más rápido si hace falta
    if (left < min + 0.04) { this.ev(`trick-denied:${kind}:${left.toFixed(2)}`); if (!this.trick?.done) this.onDeny?.(BODY_FLIPS.includes(kind) ? 'aire-flip' : 'aire'); return false; }   // R11 (MOV-01) · V10.1: sin aviso si ya hay uno hecho (combo)
    // V10.1 P22: el truco anterior de este aire está completo: cuenta ya (y entra en el combo)
    if (this.trick && this.trick.done) { const pk = this.trick.kind; this.chain.push(pk); this.trickLog.push({ kind: pk, ok: true, err: 0, t: +this.now.toFixed(3) }); this.lastTrick = pk; this.tricksDone.push(pk); this.onTrick?.(pk, true); }
    dur = Math.max(min, Math.min(dur, left - 0.06));
    this.trick = { kind, t: 0, dur, target, angle: 0, dir: Math.sign(target) || 1, done: false, tuck: opts.tuck ?? 0.12, open: opts.open ?? 0.18 };
    this.prevAngle = 0;
    this.ev(`trick:${kind}:${dur.toFixed(2)}`);
    return true;
  }
  private advanceTrick(dt: number) {
    const tr = this.trick!;
    tr.t = Math.min(tr.dur, tr.t + dt);
    if (tr.rush) {   // V10.1 P22: acaba deprisa desde donde iba (se pidió el siguiente)
      const k = THREE.MathUtils.clamp((tr.t - tr.rush.t0) / tr.rush.d, 0, 1); tr.angle = tr.rush.a0 + (tr.target - tr.rush.a0) * ease(k);
      if (k >= 1) tr.t = tr.dur;
      if (tr.t >= tr.dur && !tr.done) { tr.done = true; this.ev(`trick-complete:${tr.kind}`); if (BOARD_TRICKS.includes(tr.kind)) this.onCatch?.(tr.kind); }
      return; }
    const p = tr.t / tr.dur;
    if (BODY_FLIPS.includes(tr.kind)) {
      // tuck → rotación casi constante → apertura (la apertura frena la rotación)
      const a = tr.tuck / tr.dur, b = 1 - tr.open / tr.dur;
      const prof = (x: number) => { // integral de una velocidad trapezoidal normalizada
        const ramp = (u: number) => u * u / 2;
        const total = (b - a) + a / 2 + (1 - b) / 2;
        let v = 0;
        if (x <= a) v = ramp(x / a) * a; else { v = a / 2; if (x <= b) v += x - a; else { v += b - a; const u = (x - b) / (1 - b); v += (u - u * u / 2) * (1 - b); } }
        return v / total;
      };
      tr.angle = tr.target * prof(p);
    } else tr.angle = tr.target * ease(p);
    if (tr.t >= tr.dur && !tr.done) { tr.done = true; this.ev(`trick-complete:${tr.kind}`); if (BOARD_TRICKS.includes(tr.kind)) this.onCatch?.(tr.kind); }
  }

  // ------------------------------------------------------------------ EXTRA (D07)
  private extraGround(f: InputFrame, fwd: number, ctx: StepCtx) {
    const T = TUNING;
    if (this.loco === 'manual') { if (!f.extraHeld || f.jumpPressed) { if (!f.jumpPressed) this.endManual('soltar'); } return; }
    if (this.loco !== 'ride') return;
    // doble toque en fakie lento = revert (el primer toque se difiere para distinguirlo del manual)
    if (f.extraPressed) {
      if (this.fakie && Math.abs(fwd) < T.revertSpeed) {
        if (this.now - this.extraAt <= T.doubleTap) { this.extraAt = -1e9; this.extraPending = -1e9; this.startRevert(); return; }
        this.extraAt = this.now; this.extraPending = this.now; return;
      }
      this.extraAt = this.now;
      if (!this.nearRail(ctx)) this.tryManual(fwd);
    }
    if (this.extraPending > 0 && this.now - this.extraPending > T.doubleTap) {
      this.extraPending = -1e9;
      if (f.extraHeld) this.tryManual(fwd);
    }
  }
  private tryManual(fwd: number) {
    if (Math.abs(fwd) < TUNING.manualMinSpeed || this.isCrouched || this.popT >= 0) { this.ev('manual-denied'); return; }
    this.setLoco('manual'); this.manualBal = 0; this.manualT = 0; this.pushing = false; this.pushT = 0;
  }
  private manualStep(dt: number, turnRate: number) {
    const T = TUNING;
    this.manualT += dt;
    // equilibrio arcade asistido: deriva suave + giro; se cae del manual (no es bail) si se sale del margen
    this.manualBal += (Math.sin(this.manualT * 2.3) * 0.35 + turnRate * 0.25) * T.manualBalanceRate * dt;
    this.manualBal *= Math.exp(-0.6 * dt);
    if (Math.abs(this.manualBal) > 1 || this.manualT > T.manualMaxTime || Math.abs(this.speed) < T.manualMinSpeed * 0.6) this.endManual('equilibrio');
  }
  endManual(why: string) { if (this.loco === 'manual') { this.setLoco('ride'); this.ev('manual-end:' + why); } }
  private startRevert() { this.setLoco('revert'); this.spinVis = 0; this.ev('revert'); this.onRevert?.(); }
  /** Fin del revert: el frente gira π (la marcha no cambia: pasa de atrás a adelante). Única conversión de yaw. El llamador
   *  invierte fwd/lat del paso (V5 T5-04). */
  private finishRevert() { this.heading = angleWrap(this.heading + Math.PI); this.prevHeading = angleWrap(this.prevHeading + Math.PI); this.setLoco('ride'); this.ev('revert-done'); }

  private extraAir(f: InputFrame, ctx: StepCtx) {
    if (this.loco !== 'ride') return;
    // V10.1 P03 (P-1): grind AUTOMÁTICO (sin EXTRA, en todos los dispositivos): cerca de un raíl, alineada y bajando, se engancha sola
    if (this.tryGrind(ctx)) return;
    if (!f.extraPressed) return;
    const d = this.pickDir(f.move);
    if (d === 'left' || d === 'right') { if (!this.trick) this.beginTrick(d === 'left' ? 'spin180' : 'spin360'); return; }
    // neutral / vertical mantenido = grab (rechazado si hay un flip en fase crítica)
    if (this.trick && BODY_FLIPS.includes(this.trick.kind)) { this.ev('grab-denied-flip'); return; }
    if (this.airTimeLeft() < TUNING.grabMin) { this.onDeny?.('aire'); return; }
    this.grabHeld = true; this.grabT = 0; this.ev('grab'); this.onGrab?.();
  }

  // ------------------------------------------------------------------ grind 50-50 (EXT-02)
  private nearRail(ctx: StepCtx) { return ctx.rails.some((r) => this.railFit(r, 0.8) !== null); }
  /** Proyección del cuerpo sobre un rail: {s (m a lo largo), lat, dy, along} o null si está lejos. */
  private railFit(r: Rail, latMax: number) {
    const ab = r.b.clone().sub(r.a); ab.y = 0; const L = ab.length(); const u = ab.clone().divideScalar(L);
    const ap = this.footPos.clone().sub(r.a); ap.y = 0;
    const s = ap.dot(u); if (s < 0.2 || s > L - 0.2) return null;
    const lat = Math.abs(ap.x * u.z - ap.z * u.x); if (lat > latMax) return null;
    return { s, lat, dy: this.footPos.y - r.top, u, L };
  }
  private tryGrind(ctx: StepCtx) {
    const T = TUNING;
    if (this.trick && !this.trick.done) return false;
    for (const r of ctx.rails) {
      const fit = this.railFit(r, T.grindCatchLat); if (!fit) continue;
      const along = this.vel.x * fit.u.x + this.vel.z * fit.u.z;
      if (fit.dy < -T.grindCatchDown) continue;
      if (this.vy > 1.5 || fit.dy > T.grindCatchUp) {
        if (this.vy > 0 && this.airTime < 0.12) continue;   // V10.1 P03: el imán automático no tira de un salto recién empezado (despega primero)
        // R11 (RAMP-01): «imán» de raíl con EXTRA mantenida. A ≥ 10 m/s el ollie pasa hasta 0,9 m por encima de todo el raíl (4 m) y
        // nunca entraba en la ventana de enganche: si la parábola no bajará a la ventana antes del final del raíl, se curva hacia abajo
        // para llegar a él (a ~70 % del tramo que queda); el enganche es luego el de siempre. Alineada, y con el pie a ≤ 1 m del raíl.
        const alignM = Math.abs(Math.cos(angleDiff(this.heading, Math.atan2(fit.u.x, fit.u.z))));
        if (fit.dy > 1.0 || alignM < T.grindAlign || Math.abs(along) < T.grindMinSpeed) continue;
        const g = T.gravity * this.gravityScale, h = fit.dy - T.grindCatchUp;
        const tDown = h > 0 ? (this.vy + Math.sqrt(Math.max(0, this.vy * this.vy + 2 * g * h))) / g : 0;
        const sLeft = along >= 0 ? fit.L - 0.2 - fit.s : fit.s - 0.2;
        if (sLeft <= 0.3 || Math.abs(along) * tDown < sLeft) continue;   // aún llegará a la ventana sobre el raíl: como siempre
        const tEnd = 0.7 * sLeft / Math.abs(along), dyT = T.grindCatchUp * 0.5 - fit.dy;
        const vNeed = (dyT + 0.5 * g * tEnd * tEnd) / tEnd;
        if (vNeed < this.vy) { this.vy = Math.max(vNeed, -9); if (!this.railMag) { this.railMag = true; this.ev('grind-iman'); } }
        continue;
      }
      const align = Math.abs(Math.cos(angleDiff(this.heading, Math.atan2(fit.u.x, fit.u.z))));
      if (align < T.grindAlign || Math.abs(along) < T.grindMinSpeed) continue;
      // bloqueo: nada sólido entre el cuerpo y el rail (el propio rail es una caja de 7 cm en su eje: el rayo puede
      // tocarlo en los últimos 12 cm; cualquier impacto anterior es un muro/objeto en medio y no hay enganche)
      const target = r.a.clone().addScaledVector(fit.u, fit.s); target.y = r.top;
      const from = this.footPos.clone(); from.y += 0.45;
      const dir = target.sub(from); const dist = dir.length(); dir.divideScalar(Math.max(dist, 1e-4));
      this.ray.origin = { x: from.x, y: from.y, z: from.z }; this.ray.dir = { x: dir.x, y: dir.y, z: dir.z };
      const hit = this.world.castRay(this.ray, dist, true, RAPIER.QueryFilterFlags.EXCLUDE_SENSORS, undefined, this.collider);
      this.ray.dir = { x: 0, y: -1, z: 0 };
      if (hit && hit.timeOfImpact < dist - 0.12) { this.ev('grind-blocked'); continue; }
      this.rail = r; this.railS = fit.s; this.railSign = Math.sign(along) || 1;
      this.vel.copy(fit.u).multiplyScalar(along); this.vy = 0; this.trick = null; this.grabHeld = false;
      this.heading = Math.atan2(fit.u.x * this.railSign, fit.u.z * this.railSign);
      this.setLoco('grind'); this.grounded = true; this.onGrind?.(true);
      return true;
    }
    return false;
  }
  private grindStep(dt: number, f: InputFrame) {
    const T = TUNING, r = this.rail!;
    const ab = r.b.clone().sub(r.a); ab.y = 0; const L = ab.length(); const u = ab.divideScalar(L);
    let sp = Math.abs(this.vel.x * u.x + this.vel.z * u.z) - T.grindLoss * dt;
    this.railS += sp * this.railSign * dt;
    const p = r.a.clone().addScaledVector(u, this.railS); p.y = r.top + TUNING.kccOffset;   // R11 (TRK-04): antes −0,05 (tabla hundida en el raíl)
    this.vel.copy(u).multiplyScalar(sp * this.railSign);
    this.heading = Math.atan2(u.x * this.railSign, u.z * this.railSign);
    this.body.setNextKinematicTranslation({ x: p.x, y: p.y, z: p.z });
    this.state = 'grind'; this.grounded = true; this.timeSinceGround = 0;
    const latIn = Math.abs(this.steer);   // V4: salida lateral con A/D a fondo (giro local), no con un vector de cámara
    const off = this.railS < 0 || this.railS > L;
    if (f.jumpPressed || this.jumpBuffered()) { this.consumeJump(); this.leaveGrind(TUNING.ollieVel * 0.8, 'ollie'); return; }
    if (off) { this.leaveGrind(0.6, 'fin'); return; }
    if (latIn > 0.8) { this.leaveGrind(2.4, 'lateral', Math.sign(this.steer)); return; }   // `right` es la derecha real
    if (sp < 1.0) { this.leaveGrind(2.0, 'lento'); return; }
  }
  private leaveGrind(vy: number, why: string, side = 0) {
    const r = this.rail!; this.rail = null;
    const t = this.body.translation();
    this.body.setNextKinematicTranslation({ x: t.x + this.right.x * side * 0.35, y: r.top + 0.03, z: t.z + this.right.z * side * 0.35 });
    this.vy = vy; this.grounded = false; this.jumpLock = 0.1; this.airTime = 0; this.airStartY = r.top; this.timeSinceGround = TUNING.coyote;
    if (side) this.vel.addScaledVector(this.right, side * 1.2);
    this.setLoco('ride'); this.ev('grind-out:' + why); this.onGrind?.(false);
    if (why === 'ollie') this.onJump?.('grindOut');
  }
  postStepGrind() { /* el grind mueve el cuerpo directamente; syncFoot en postStep */ }

  // ------------------------------------------------------------------ aterrizaje y caídas
  private land() {
    this.railMag = false;   // R11 (RAMP-01)
    this.vertAir = false;   // V10 IT2
    const T = TUNING;
    this.impact = Math.max(0, -this.vy);
    if (this.loco === 'impact') { this.vy = 0; this.airTime = 0; return; }   // el impacto gestiona su propia caída
    this.vy = 0;
    this.gravityScale = 1;
    if (this.onFoot || this.loco === 'mount' || this.loco === 'dismount') { if (this.airTime > 0.3) this.landT = 0.18; this.airTime = 0; this.onLand?.(this.impact * 0.5, false); return; }
    if (this.loco === 'bail') { this.airTime = 0; return; }
    const tr = this.trick; this.trick = null; this.grabHeld = false;
    const chainWas = this.chain; this.chain = []; this.chainQueued = false; void chainWas;
    let ok = true, err = 0;
    if (tr) {
      err = Math.abs(tr.target - tr.angle);
      const tol = tr.kind === 'spin180' || tr.kind === 'spin360' ? T.landTolSpin : tr.kind === 'triple' ? T.final.landTol : T.landTolFlip;
      ok = err <= tol;
      if (ok && (tr.kind === 'spin180' || tr.kind === 'spin360')) {
        // el frente corporal gira lo que se giró (una sola conversión): tras un 180 se sigue rodando, ahora hacia atrás
        const halfTurns = Math.round(tr.angle / Math.PI);
        if (Math.abs(halfTurns) % 2 === 1) { this.heading = angleWrap(this.heading + Math.PI); this.prevHeading = angleWrap(this.prevHeading + Math.PI); }
        this.spinVis = tr.angle - halfTurns * Math.PI; // residuo pequeño que la presentación absorbe
      }
      this.trickLog.push({ kind: tr.kind, ok, err: +err.toFixed(3), t: +this.now.toFixed(3) });
      if (ok) { this.lastTrick = tr.kind; this.tricksDone.push(tr.kind); }
      this.onTrick?.(tr.kind, ok);
      if (ok && chainWas.length) this.onCombo?.([...chainWas, tr.kind]);   // V10.1 P22
    }
    const sp = this.vel.length();
    const align = sp > 0.5 ? Math.abs(this.vel.clone().normalize().dot(this.dir)) : 1;
    if (!ok) { this.bail(`truco incompleto ${tr!.kind} (${err.toFixed(2)} rad)`); this.airTime = 0; return; }
    if (align < T.bailAlign && sp > 3) { this.bail('cruzado'); this.airTime = 0; return; }
    this.landHard = this.impact > 9 || align < 0.8;
    if (this.airTime > 0.16) { this.landT = this.landHard ? 0.55 : 0.32; this.onLand?.(this.impact, this.landHard); }
    // ayuda ligera: la marcha se alinea con la tabla y absorbe algo de velocidad
    // V5 T5-04 (OPUS-002, N5-01): el signo de la marcha respecto al frente se calcula ANTES de copiar el frente en `vel`
    // (V4 lo evaluaba tras `copy`: siempre +1, y el 180 y todo aterrizaje en marcha atrás invertían la marcha en el mundo)
    if (this.airTime > 0.35) { const sgn = Math.sign(this.vel.dot(this.dir)) || 1; this.vel.copy(this.dir).multiplyScalar(sgn * sp * align * (this.landHard ? 0.86 : 0.96)); }
    this.airTime = 0;
  }
  bail(why: string) {
    if (this.loco === 'bail') return;
    this.trick = null; this.grabHeld = false; this.pushing = false; this.pushT = 0; this.scootT = 0; this.popT = -1; this.rail = null;
    this.gravityScale = 1; this.assistSpeed = null; this.chain = []; this.chainQueued = false;   // V10.1 P22
    this.bailReason = why; this.bails++;
    this.setLoco('bail'); this.ev('bail:' + why);
    this.onBail?.(why);
  }
  settles = 0;
  /** ritmo con que se funde el desfase visual (escalón asistido 28/s; recolocación en el vaso 7/s: deslizamiento visible) */
  stepVisRate = 28;
  /** ¿Cabe la cápsula ACTUAL con el pie en `p`? (modo pared al soltarse: no dejarla dentro de la escalera ni de otra colisión) */
  fitsFoot(p: THREE.Vector3) { return this.fitsAt(p); }
  /** V8 R3 (pruebas de romper la pared): tras una caída o un golpe en la curva de la pared o en una rampa del vaso de YINYANG, el
   *  apoyo no es llano y antes se volvía al último punto seguro (a veces fuera del vaso). Dentro del vaso se busca el suelo llano
   *  más cercano (rayos en anillos de 0,35–1,8 m, prefiriendo lo cercano y lo bajo) y ANMI se desliza allí (desfase visual que
   *  se funde en ≈ 0,15 s). Fuera del vaso no cambia nada. */
  private settleInPool() {
    if (!this.pool?.inPool) return false;
    const f = this.footPos.clone(); let best: THREE.Vector3 | null = null, bs = 1e9;
    for (const r of [0.35, 0.7, 1.05, 1.4, 1.8]) for (let k = 0; k < 16; k++) {
      const a = k / 16 * Math.PI * 2, x = f.x + Math.sin(a) * r, z = f.z + Math.cos(a) * r;
      this.ray.origin = { x, y: f.y + 1.2, z }; this.ray.dir = { x: 0, y: -1, z: 0 };
      const h = this.world.castRayAndGetNormal(this.ray, 3.6, true, RAPIER.QueryFilterFlags.EXCLUDE_SENSORS, undefined, this.collider);
      if (!h || h.normal.y < 0.9) continue;
      const p = new THREE.Vector3(x, f.y + 1.2 - h.timeOfImpact + 0.02, z);
      if (p.y > f.y + 0.3 || p.y > -0.3 || !this.pool.inside(x, z) || !this.fitsAt(p) || !this.headroomFree(p)) continue;   // siempre dentro del vaso
      const sc = r + Math.max(0, p.y - f.y) * 2; if (sc < bs) { bs = sc; best = p; }
    }
    if (!best) return false;
    const from = this.footPos.clone(), hd = this.heading;
    this.teleport(best, hd, 'walk'); this.stepVis.copy(from).sub(this.footPos); this.stepVisNow.copy(this.stepVis); this.stepVisRate = 7;
    this.settles++; this.ev('asentar-vaso'); return true;
  }
  /** R11 (NMG-08): al levantarse sin apoyo llano (en una arista, en el aire), suelo llano libre bajo el pie a ≤ 2 m. */
  private settleBelow() {
    const f = this.footPos;
    this.ray.origin = { x: f.x, y: f.y + 0.1, z: f.z }; this.ray.dir = { x: 0, y: -1, z: 0 };
    const h = this.world.castRayAndGetNormal(this.ray, 2.1, true, RAPIER.QueryFilterFlags.EXCLUDE_SENSORS, undefined, this.collider);
    if (!h || h.normal.y < 0.85) return false;
    const p = new THREE.Vector3(f.x, f.y + 0.1 - h.timeOfImpact + 0.02, f.z);
    if (!this.fitsAt(p) || !this.headroomFree(p) || !this.standArea(p) || (this.safeOk && !this.safeOk(p))) return false;
    const from = this.footPos.clone();
    this.teleport(p, this.heading, 'walk'); this.stepVis.copy(from).sub(this.footPos); this.stepVisNow.copy(this.stepVis); this.stepVisRate = 7;
    this.settles++; this.ev('asentar-debajo'); return true;
  }
  /** R11 (MOV-11). */
  standArea(p: THREE.Vector3) { return standAreaOk(this.world, p, this.collider); }
  /** R11 (F6a): ¿el punto más cercano a la semiesfera (en la dirección −n desde su centro) es una ARISTA? La cara que hay allí no tiene la
   *  normal del contacto (en una superficie continua —curva de un quarter, cápsula de un NPC— coinciden). */
  private isEdgeAt(n: THREE.Vector3) {
    const b = this.body.translation(), cy = b.y + TUNING.radius;
    this.ray.origin = { x: b.x, y: cy, z: b.z }; this.ray.dir = { x: -n.x, y: -n.y, z: -n.z };
    const h = this.world.castRayAndGetNormal(this.ray, TUNING.radius + TUNING.kccOffset + 0.12, true, RAPIER.QueryFilterFlags.EXCLUDE_SENSORS, undefined, this.collider);
    this.ray.dir = { x: 0, y: -1, z: 0 };
    if (!h) return true;
    return Math.abs(h.normal.x * n.x + h.normal.y * n.y + h.normal.z * n.z) < 0.9;
  }
  private recoverFromBail() {
    const safe = this.grounded && this.groundNormal.y > 0.85 && this.headroomFree(this.footPos);
    this.spinVis = 0;
    if (safe) { this.setLoco('walk'); this.vel.set(0, 0, 0); }
    else if (this.settleInPool()) { /* V8 R3: dentro del vaso se levanta en el suelo llano más cercano */ }
    else if (this.settleBelow()) { /* R11 (NMG-08): suelo llano libre justo debajo (≤ 2 m): se levanta ahí */ }
    else { this.respawns++; this.teleport(this.lastSafe.clone(), this.lastSafeHeading, 'walk'); }
    this.ev('bail-recover:' + (safe ? 'sitio' : 'seguro'));
  }

  // ------------------------------------------------------------------ impacto arcade (V4 IMPACT-01, HUM-A4-007)
  /**
   * Choque fuerte: ANMI sale lanzada en estrella, cae, se queda un instante en el suelo y se levanta a pie con la tabla.
   * `launch` = velocidad de salida (mundo, m/s) ya acotada por quien la calcula; `closing` = velocidad normal de cierre.
   * Cápsula y colisión reales durante todo el vuelo; un solo dueño (este controlador). Protección acotada tras levantarse.
   */
  startImpact(why: string, launch: THREE.Vector3, closing: number, opts: { maxUp?: number; maxH?: number } = {}) {
    const T = TUNING.impact;
    if (this.loco === 'impact' || this.now < this.impactProtectUntil || this.loco === 'grind') return false;
    this.trick = null; this.grabHeld = false; this.pushing = false; this.pushT = 0; this.scootT = 0; this.popT = -1; this.rail = null;
    this.gravityScale = 1; this.assistSpeed = null; this.pendingJump = false; this.consumeJump();
    if (this.isCrouched && this.headroomFree(this.footPos)) this.setCrouched(false);
    const h = new THREE.Vector3(launch.x, 0, launch.z);
    const hs = THREE.MathUtils.clamp(h.length(), T.minH, opts.maxH ?? T.maxH);
    if (h.lengthSq() < 1e-6) h.copy(this.dir).multiplyScalar(-1); h.setLength(hs);
    this.vel.copy(h);
    this.vy = THREE.MathUtils.clamp(launch.y, T.minUp, opts.maxUp ?? T.maxUp);
    this.impactCause = why; this.impactFlight = 2 * this.vy / TUNING.gravity; this.impactAirT = 0; this.bandT = 0;
    this.grounded = false; this.jumpLock = 0.18; this.timeSinceGround = TUNING.coyote; this.airTime = 0; this.airStartY = this.footPos.y;
    this.kcc.disableSnapToGround();
    // el cuerpo vuela de espaldas al golpe: el frente mira contra la salida (pose de estrella hacia atrás)
    // R11 (ANIM-08): el giro a «de espaldas» se hace en 0,12 s (antes en un fotograma: 155–176° de golpe)
    { const to = Math.atan2(-h.x, -h.z); this.headTurn = { to, rate: Math.abs(angleDiff(to, this.heading)) / 0.12 }; }
    this.bailReason = why; this.bails++;
    this.impactPhase = 'launch'; this.impactT = 0;
    this.setLoco('impact'); this.ev(`impact:${why}:${closing.toFixed(1)}`);
    this.impactLog.push({ t: +this.now.toFixed(3), why, closing: +closing.toFixed(2), vx: +this.vel.x.toFixed(2), vy: +this.vy.toFixed(2), vz: +this.vel.z.toFixed(2) });
    if (this.impactLog.length > 50) this.impactLog.shift();
    this.onImpact?.('launch', { closing });
    return true;
  }
  /** R11 (ANIM-08): giro de presentación del golpe en curso. */
  private headTurn: { to: number; rate: number } | null = null;
  /** R11 (ANIM-08): rumbo que sigue la cámara: el final del giro del golpe (el cuerpo gira en 0,12 s; la cámara, como antes, al instante). */
  get camHeading() { return this.headTurn ? this.headTurn.to : this.heading; }
  private impactStep(dt: number) {
    if (this.headTurn) { const d = angleDiff(this.headTurn.to, this.heading), st = Math.min(Math.abs(d), this.headTurn.rate * dt);
      this.heading = angleWrap(this.heading + Math.sign(d) * st); if (Math.abs(d) - st < 1e-3) { this.heading = this.headTurn.to; this.headTurn = null; } }
    const T = TUNING.impact, g = TUNING.gravity;
    this.impactT += dt;
    const ph = this.impactPhase;
    if (ph === 'launch' || ph === 'air') {
      this.impactAirT += dt;
      if (ph === 'launch' && this.impactT > 0.06) { this.impactPhase = 'air'; this.impactT = 0; }
      this.vy -= g * dt;
      this.vel.multiplyScalar(Math.exp(-T.airDrag * dt));
      if (this.grounded && this.jumpLock <= 0 && (this.impactT > 0.08 || ph === 'air')) {
        this.impactPhase = 'land'; this.impactT = 0; this.vy = 0; this.vel.multiplyScalar(T.landKeep);
        this.onImpact?.('land', { closing: 0 });
      }
      if (this.impactT > T.maxAir && this.impactPhase === 'air') { this.impactPhase = 'land'; this.impactT = 0; } // red de seguridad: nunca vuela indefinidamente
    } else if (ph === 'land') {
      // V5 T5-10 (OPUS-004, DT-12): tumbada sobre la banda de coches activa → se desliza (por el KCC, colisiones reales) hacia
      // el lado libre más cercano hasta salir de la banda; la tumbada no termina en la pista (V4 levantaba y teletransportaba 2 m)
      const band = this.bandAt?.(this.footPos);
      if (band?.inBand && this.bandT < T.carSlideMax) {
        this.bandT += dt;
        this.vel.set(band.dir.x * T.carSlide, 0, band.dir.z * T.carSlide);
        if (this.impactT > T.lieDur - 0.2) this.impactT = T.lieDur - 0.2;   // la tumbada espera a salir de la banda
      } else {
        const sp = Math.hypot(this.vel.x, this.vel.z), ns = Math.max(0, sp - T.slideDecel * dt);
        if (sp > 1e-4) this.vel.multiplyScalar(ns / sp);
      }
      if (this.grounded) this.vy = 0; else this.vy -= g * dt;
      if (this.impactT >= T.lieDur) { this.impactPhase = 'getup'; this.impactT = 0; this.vel.set(0, 0, 0); this.onImpact?.('getup', { closing: 0 }); }
    } else if (ph === 'getup') {
      this.vel.set(0, 0, 0);
      if (this.grounded) this.vy = 0; else this.vy -= g * dt;
      if (this.impactT >= T.getupDur) this.finishImpact();
    }
  }
  private finishImpact() {
    const safe = this.grounded && this.groundNormal.y > 0.8 && this.headroomFree(this.footPos);
    this.impactPhase = null; this.impactT = 0; this.spinVis = 0;
    this.impactProtectUntil = this.now + TUNING.impact.protect;
    if (safe) { this.setLoco('walk'); this.vel.set(0, 0, 0); }
    else if (this.settleInPool()) { this.impactProtectUntil = this.now + TUNING.impact.protect; }
    else { this.respawns++; this.teleport(this.lastSafe.clone(), this.lastSafeHeading, 'walk'); this.impactProtectUntil = this.now + TUNING.impact.protect; }
    this.ev('impact-recover:' + (safe ? 'sitio' : 'seguro'));
  }
  /** Contacto con un cuerpo cinemático móvil (coche): `rel` = velocidad relativa del jugador respecto al coche en el punto
   *  de contacto (mundo), `n` = normal del coche hacia ANMI, `carVel` = velocidad del coche. Devuelve si hubo impacto. */
  hitByMover(why: string, rel: THREE.Vector3, n: THREE.Vector3, carVel: THREE.Vector3) {
    const T = TUNING.impact;
    const closing = -(rel.x * n.x + rel.z * n.z);           // >0 = se acercan
    if (closing < T.carClosing) return false;
    const launch = new THREE.Vector3(n.x, 0, n.z).normalize().multiplyScalar(THREE.MathUtils.clamp(closing * T.carGain, T.minH, T.maxH)).addScaledVector(new THREE.Vector3(carVel.x, 0, carVel.z), T.carCarry);
    // V5 T5-10: componente lateral mínima respecto a la marcha del coche (hacia el lado en que ya está ANMI), para salir de
    // su recorrido durante el vuelo alto (si no, el coche la alcanza y cae sobre el capó)
    { const cv = new THREE.Vector3(carVel.x, 0, carVel.z); const cs = cv.length();
      // lado de salida: SIEMPRE hacia fuera del anillo (radial), lejos de la superrampa del centro; aterriza fuera de la banda
      if (cs > 0.1) { cv.divideScalar(cs); let side = new THREE.Vector3(-cv.z, 0, cv.x); const out = new THREE.Vector3(this.footPos.x, 0, this.footPos.z); if (out.lengthSq() < 1e-6) out.set(1, 0, 0); if (side.dot(out) < 0) side.negate();
        const have = launch.dot(side); if (have < T.carSide) launch.addScaledVector(side, T.carSide - have);
        // delante del coche (golpe frontal): sale más rápido que él en su sentido, para que no la alcance durante el vuelo
        if (new THREE.Vector3(n.x, 0, n.z).normalize().dot(cv) > 0.2) { const along = launch.dot(cv), want = cs * T.carAhead; if (along < want) launch.addScaledVector(cv, want - along); } } }
    // V5 T5-10 (D7): misma vy que V4 (con su clamp) × carUpGain → altura 2,5× la comparable; tope propio coherente
    launch.y = THREE.MathUtils.clamp(T.minUp + closing * 0.18, T.minUp, T.maxUp) * T.carUpGain;
    return this.startImpact(why, launch, closing, { maxUp: T.maxUp * T.carUpGain, maxH: T.carMaxH });
  }

  /** Desplaza el cuerpo sin cambiar de estado (separación de un coche, recolocación fuera de la pista para levantarse). */
  nudge(p: THREE.Vector3) {
    this.body.setTranslation({ x: p.x, y: p.y, z: p.z }, true);
    this.body.setNextKinematicTranslation({ x: p.x, y: p.y, z: p.z });
    this.syncFoot(); this.prevPos.copy(this.footPos);
  }

  postStep() { this.syncFoot(); }
}

/** R11 (MOV-11): ¿hay suelo de verdad ALREDEDOR del pie? 4 rayos a ±0,22 m (suelo a ≤ 7 cm): el techo de una barandilla, un poste
 *  o una farola no vale como punto seguro ni como checkpoint. */
export function standAreaOk(world: RAPIER.World, foot: THREE.Vector3, exclude?: RAPIER.Collider) {
  const ray = new RAPIER.Ray({ x: 0, y: 0, z: 0 }, { x: 0, y: -1, z: 0 }); let n = 0;
  for (const [dx, dz] of [[0.22, 0], [-0.22, 0], [0, 0.22], [0, -0.22]]) {
    ray.origin = { x: foot.x + dx, y: foot.y + 0.25, z: foot.z + dz };
    const h = world.castRayAndGetNormal(ray, 0.32, true, RAPIER.QueryFilterFlags.EXCLUDE_SENSORS, undefined, exclude);
    if (h && h.normal.y > 0.8) n++;
  }
  return n >= 3;
}
/** R11 (F6a): en una ARISTA, un contacto de la semiesfera con normal más tumbada que esto (centro ≥ ≈ 0,13 m más allá del canto), sin
 *  suelo bajo la sonda central, no sostiene. */
const EDGE_NY = 0.9;
/** R11 (MOV-04): velocidad terminal de caída (m/s). */
const VY_TERMINAL = 30;

/** V5 T5-07: crucero objetivo por intensidad de propulsión. Hasta cruiseTopFrom = V4 (lerp cruiseMin→cruiseMax); el último
 *  tramo sube hasta topSpeed (W o el pulgar a fondo llegan a 20 m/s). */
export function cruiseFor(thr: number) {
  const T = TUNING, a = T.cruiseTopFrom;
  if (thr <= a) return THREE.MathUtils.lerp(T.cruiseMin, T.cruiseMax, thr);
  const v0 = THREE.MathUtils.lerp(T.cruiseMin, T.cruiseMax, a);
  return THREE.MathUtils.lerp(v0, T.topSpeed, (thr - a) / (1 - a));
}
/** V5 T5-07: arrastre aerodinámico (m/s², con signo). Hasta fastFrom idéntico a V4 (0,011·v²); por encima solo crece con
 *  dragFast, para que 20 m/s sea alcanzable sin cambiar la sensación de 0–9 m/s. */
export function dragAccel(v: number) {
  const T = TUNING, a = Math.abs(v), f = T.fastFrom;
  const m = a <= f ? T.drag * a * a : T.drag * f * f + T.dragFast * (a * a - f * f);
  return Math.sign(v) * m;
}

export function angleDiff(a: number, b: number) {
  return THREE.MathUtils.euclideanModulo(a - b + Math.PI, Math.PI * 2) - Math.PI;
}
export function angleWrap(a: number) { return THREE.MathUtils.euclideanModulo(a + Math.PI, Math.PI * 2) - Math.PI; }
export function ease(t: number) { t = THREE.MathUtils.clamp(t, 0, 1); return t * t * (3 - 2 * t); }
export { UP };

/** Figura provisional mientras no carga ANMI (cápsula rosa + tabla). */
export class PlaceholderVisual implements SkaterVisual {
  root = new THREE.Group();
  constructor() {
    const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.3, 1.1, 6, 12), new THREE.MeshStandardMaterial({ color: '#F6BDD0' }));
    body.position.y = 0.95; body.castShadow = true;
    const board = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.04, 0.8), new THREE.MeshStandardMaterial({ color: '#F18AAE' }));
    board.position.y = 0.09; board.castShadow = true;
    this.root.add(body, board);
  }
  update(_dt: number, s: Skater) {
    s.lerpPos(s.visualPos);
    this.root.position.copy(s.visualPos);
    this.root.rotation.set(0, s.headingVis, 0);
    this.root.scale.y = s.isCrouched ? 0.62 : 1;
  }
}
