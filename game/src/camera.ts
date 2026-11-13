// Cámara de tercera persona (UX-02/03): órbita manual independiente del rumbo (ratón, toque, J/L/I/K, stick derecho),
// recentrado explícito, seguimiento suave solo en marcha y tras un retraso desde la ÚLTIMA intervención manual de
// cualquier fuente (marca común de input; el retraso se cuenta en tiempo de presentación, la pausa no lo consume), evitación de geometría (NPCs excluidos) y perfiles:
// fixed (charla/grafiti/baile/revelación), track (mira al jugador desde un punto) y chase (vuelo del final: lateral ¾
// que sigue el target interpolado sin cortes). Siempre sigue la posición PRESENTADA (interpolada), no la cápsula.
import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import { Skater, angleDiff } from './skater';
import { Input } from './input';
import { GESTURE_ON } from './gesture';

export function vfovFromH(hfovDeg: number, aspect: number, maxV = 78) {
  const h = THREE.MathUtils.degToRad(hfovDeg);
  const v = 2 * Math.atan(Math.tan(h / 2) / aspect);
  return THREE.MathUtils.clamp(THREE.MathUtils.radToDeg(v), 40, maxV);
}

export type CamMode = 'follow' | 'fixed' | 'track' | 'chase' | 'scripted';
export const CAM = {
  pitchMin: THREE.MathUtils.degToRad(6), pitchMax: THREE.MathUtils.degToRad(64), pitchDefault: THREE.MathUtils.degToRad(17),
  dist: 5.4, hfov: 66, sens: 0.0065, lockSens: 0.0032, keySens: 2.2, padSens: 2.6, autoDelay: 1.6, autoRate: 1.5,
  footDelay: 1.0, footRate: 1.2,                     // V5 T5-16: seguimiento a pie (solo perfiles táctil y mando)
  // R3 (usuario/clientes, 12 oct): cámara «Fortnite» en táctil y mando: siempre detrás de ANMI y girando CON ella cuando el
  // joystick la gira (a pie y en tabla), en vez de esperar 1–1,6 s y seguir despacio. El 2.º dedo sigue orbitando; al soltar,
  // vuelve detrás en `lockHold` s. R5 (usuario, 14 oct): IGUAL en teclado/ratón (antes órbita libre con seguimiento lento).
  lockRate: 22, lockHold: 0.7, lockPitchRate: 1.5,
  // R5 (usuario, 12 oct): MIENTRAS se mantiene la cámara (dedo/ratón/stick derecho) la inclinación es libre: hasta mirar al
  // cielo (−55°: la cámara baja a ras de ANMI y la mirada sube) y casi cenital (80°). Al soltar vuelve al rango normal.
  freePitchMin: THREE.MathUtils.degToRad(-55), freePitchMax: THREE.MathUtils.degToRad(80), pitchPosMin: THREE.MathUtils.degToRad(3), freeReturnRate: 5,   // 22/s: a giro sostenido (~3,4 rad/s) va ≈ 8° por detrás; 10 dejaba 14–16°
};

export class CameraRig {
  cam: THREE.PerspectiveCamera;
  mode: CamMode = 'follow';
  world: RAPIER.World | null = null;
  yaw = Math.PI;
  pitch = CAM.pitchDefault;
  dist = CAM.dist;
  sens = 1; invertY = false;
  private pos = new THREE.Vector3();
  private look = new THREE.Vector3();
  private fixed: { pos: THREE.Vector3; target: THREE.Vector3; hfov: number; fit?: THREE.Vector3[]; insetAware?: boolean } | null = null;
  private ball = new RAPIER.Ball(0.24);
  private lastTarget: THREE.Vector3 | null = null;
  /** Cortes deliberados por oclusión (contador de diagnóstico). */
  occlusionCuts = 0;
  /** V5 T5-22 (diagnóstico, DT-16): en este fotograma avoid() acorta la distancia deseada (restricción registrada). */
  avoidActive = false;
  private fitCam = new THREE.PerspectiveCamera();
  private chase: { side: number; up: number; back: number; ahead: number; hfov: number } | null = null;
  private blend = 1;
  /** V10.5 (E5-12): el fundido hacia el último encuadre ya terminó. */
  get blendDone() { return this.blend >= 1; }
  private from = { pos: new THREE.Vector3(), look: new THREE.Vector3() };
  private ray = new RAPIER.Ray({ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 1 });
  private recentering = false;
  get isRecentering() { return this.recentering; }
  private wallWas = false; wallRecenters = 0;
  /** V8 R10: dentro del vaso de YINYANG la vista se eleva un poco (como en un bowl): la cámara se coloca por encima del borde en vez de
   *  pegarse a la pared en los pasos estrechos */
  poolLift = 0;
  private freeLooked = false;   // R5: la mirada libre salió del rango normal (al soltar, vuelve a la inclinación por defecto)
  private distNow = CAM.dist;
  shake = 0;
  private orbitSign = 0;
  private prevLoco = 'walk';
  private prevHeadCam = 0;
  private tmpFwd = new THREE.Vector3();
  /** IG-006 (diagnóstico): recentrados al terminar de bajarse del skate. */
  dismountRecenters = 0;
  private carOpen = 0;
  lookAhead = 1.0;
  manual = false;
  orbitTotal = 0;          // giro manual acumulado (rad) de cualquier fuente — lo usa el tutorial
  /** Segundos de PRESENTACIÓN desde la última intervención manual (la pausa no cuenta: antes se medía en reloj de pared y,
   *  tras una pausa larga, el seguimiento automático recuperaba el rumbo nada más volver). */
  sinceManual = 99;
  private lastManualMark = -1e9;
  /** Predicado de colliders que SÍ cuentan para la oclusión (NPCs y follaje quedan fuera). */
  ignore: ((c: RAPIER.Collider) => boolean) | null = null;

  constructor(aspect: number) { this.cam = new THREE.PerspectiveCamera(60, aspect, 0.12, 700); }

  snapBehind(s: Skater) {
    this.yaw = s.camHeading; this.pitch = CAM.pitchDefault; this.manual = false;
    const target = this.targetOf(s);
    this.pos.copy(this.desired(target)); this.look.copy(target); this.blend = 1; this.distNow = this.dist;
    this.mode = 'follow'; this.fixed = null; this.chase = null; this.scripted = null;
  }
  /** Cámara fija desde un ancla. `fit`: puntos que deben caber en cuadro; la distancia se ajusta al aspecto actual (vertical/
   *  horizontal) alejándose por la misma dirección ancla→objetivo, en vez de fijar una coordenada que solo sirve en 16:9. */
  toFixed(def: { pos: THREE.Vector3; target: THREE.Vector3; hfov: number; fit?: THREE.Vector3[]; insetAware?: boolean }, instant = false) {
    this.from.pos.copy(this.cam.position); this.from.look.copy(this.look);
    this.fixed = { pos: def.pos.clone(), target: def.target.clone(), hfov: def.hfov, fit: def.fit?.map((v) => v.clone()), insetAware: def.insetAware };
    this.mode = 'fixed'; this.blend = instant ? 1 : 0; this.chase = null; this.scripted = null;
  }
  toTrack(pos: THREE.Vector3, hfov: number) {
    this.from.pos.copy(this.cam.position); this.from.look.copy(this.look);
    this.fixed = { pos: pos.clone(), target: new THREE.Vector3(), hfov };
    this.mode = 'track'; this.blend = 0; this.chase = null; this.scripted = null;
  }
  /** Cámara lateral ¾ que acompaña el vuelo (final): `side` m al costado (+Z del corredor), `ahead` mira por delante. */
  toChase(c: { side: number; up: number; back: number; ahead: number; hfov: number }) {
    this.from.pos.copy(this.cam.position); this.from.look.copy(this.look);
    this.chase = { ...c }; this.fixed = null; this.mode = 'chase'; this.blend = 0; this.scripted = null;
  }
  /** V10: cámara guionizada por una actividad (grind de RG1, reto de SECRETNOVIO): la actividad da cada fotograma posición, mirada y campo;
   *  el rig suaviza y evita la geometría (nunca dentro de un sólido). */
  scripted: (() => { pos: THREE.Vector3; look: THREE.Vector3; hfov: number; free?: boolean }) | null = null;
  toScripted(get: () => { pos: THREE.Vector3; look: THREE.Vector3; hfov: number; free?: boolean }, instant = false) {
    this.from.pos.copy(this.cam.position); this.from.look.copy(this.look);
    this.scripted = get; this.fixed = null; this.chase = null; this.mode = 'scripted'; this.blend = instant ? 1 : 0;
  }
  /** Vuelve al seguimiento sin salto: conserva el azimut actual de la cámara. */
  toFollow(s: Skater, instant = false) {
    this.from.pos.copy(this.cam.position); this.from.look.copy(this.look);
    const d = this.look.clone().sub(this.cam.position); d.y = 0;
    if (d.lengthSq() > 1e-4) this.yaw = Math.atan2(d.x, d.z);
    this.mode = 'follow'; this.fixed = null; this.chase = null; this.scripted = null; this.blend = instant ? 1 : 0;
    if (instant) this.snapBehind(s);
  }
  /** V5 T5-17: nº de recentrados (C′ renueva su base al recentrar). */
  recenterCount = 0;
  recenter() { this.recentering = true; this.manual = false; this.recenterCount++; }
  /** V5 T5-16: perfil de pulgares (táctil o mando) según la última fuente de conducción. */
  private thumbProfile(input: Input | null) { return !!input && (input.driveProfile === 'touch' || input.driveProfile === 'gamepad'); }

  private portrait() { return this.cam.aspect < 0.9; }
  private targetOf(s: Skater) {
    const crouch = s.isCrouched ? 0.38 : 0;
    // V8 R2: en la pared del vaso el cuerpo sale de la pared (normal): el objetivo es su centro, no un punto sobre los pies
    // R11 (YY-07): durante la CAÍDA de entrada desde el deck no: ese punto (a ras del pie, 0,95 m por la normal) quedaba dentro del deck o
    // del vaso, todos los barridos de la cámara daban 0 y se pegaba a ANMI o se metía bajo el deck
    if (s.wallRiding && !s.pool?.dropping) return s.visualPos.clone().addScaledVector(s.groundNormal, 0.95).add(new THREE.Vector3(0, 0.25, 0));
    return s.visualPos.clone().add(new THREE.Vector3(0, 1.15 - crouch, 0));
  }
  private desired(target: THREE.Vector3, dist = this.dist) {
    const d = dist * (this.portrait() ? 1.12 : 1);
    // R5: la POSICIÓN no baja de pitchPosMin (nunca bajo el suelo); la mirada hacia arriba la pone `lookUp` en el objetivo
    const pitch = THREE.MathUtils.clamp(this.pitch + (this.portrait() && this.pitch > 0 ? 0.14 : 0) + this.poolLift, CAM.pitchPosMin, CAM.freePitchMax);
    const back = new THREE.Vector3(-Math.sin(this.yaw) * Math.cos(pitch), Math.sin(pitch), -Math.cos(this.yaw) * Math.cos(pitch));
    return target.clone().addScaledVector(back, d);
  }

  // ------------------------------------------------------------------ V4-CAM-01: finitud
  /** Última pose publicada válida (posición, mirada, fov) y diagnóstico del PRIMER inválido (con su contexto). */
  private good = { pos: new THREE.Vector3(), look: new THREE.Vector3(1, 0, 0), fov: 60, ok: false };
  invalid = { count: 0, first: null as null | Record<string, unknown>, last: null as null | Record<string, unknown>, recoveries: 0 };
  private static fin(v: THREE.Vector3) { return Number.isFinite(v.x) && Number.isFinite(v.y) && Number.isFinite(v.z); }
  /** Entrada: el objetivo (ANMI) y el estado de órbita deben ser finitos; si no, no se actualiza y se conserva la pose. */
  update(dt: number, s: Skater, input: Input | null) {
    this.avoidActive = false;
    const inOk = Number.isFinite(dt) && CameraRig.fin(s.visualPos) && Number.isFinite(this.yaw) && Number.isFinite(this.pitch) && Number.isFinite(this.distNow);
    if (inOk) this.updateInner(dt, s, input);
    const c = this.cam, outOk = inOk && CameraRig.fin(c.position) && CameraRig.fin(this.look) && Number.isFinite(c.fov) && c.fov > 1 && c.fov < 179
      && c.position.distanceToSquared(this.look) > 1e-6 && Number.isFinite(c.quaternion.x + c.quaternion.y + c.quaternion.z + c.quaternion.w);
    if (outOk) { this.good.pos.copy(c.position); this.good.look.copy(this.look); this.good.fov = c.fov; this.good.ok = true; return; }
    // inválido: registrar (primer y último) y recuperar la última pose válida o, sin ella, una pose segura tras ANMI
    const ctx = { mode: this.mode, dt, yaw: this.yaw, pitch: this.pitch, distNow: this.distNow, blend: this.blend, target: s.visualPos.toArray(), heading: s.camHeading,
      pos: c.position.toArray(), look: this.look.toArray(), fov: c.fov, input: inOk };
    this.invalid.count++; this.invalid.last = ctx; if (!this.invalid.first) this.invalid.first = ctx;
    if (!Number.isFinite(this.yaw)) this.yaw = Number.isFinite(s.camHeading) ? s.camHeading : 0;
    if (!Number.isFinite(this.pitch)) this.pitch = CAM.pitchDefault;
    if (!Number.isFinite(this.distNow)) this.distNow = this.dist;
    // un plano fijo/seguimiento con datos no finitos no se reintenta en cada fotograma: vuelta al seguimiento de ANMI
    if (this.fixed && (!CameraRig.fin(this.fixed.pos) || !CameraRig.fin(this.fixed.target))) { this.fixed = null; this.mode = 'follow'; }
    if (this.chase && !Object.values(this.chase).every(Number.isFinite)) { this.chase = null; this.mode = 'follow'; }
    if (this.good.ok && (!CameraRig.fin(s.visualPos) || this.good.look.distanceTo(s.visualPos) < 12)) { this.pos.copy(this.good.pos); this.look.copy(this.good.look); c.fov = this.good.fov; }
    else if (CameraRig.fin(s.visualPos)) { const t = this.targetOf(s); this.yaw = s.camHeading; this.pitch = CAM.pitchDefault; this.pos.copy(this.avoid(t, this.desired(t))); this.look.copy(t); c.fov = 60; }
    this.blend = 1; this.invalid.recoveries++;
    c.position.copy(this.pos); c.updateProjectionMatrix(); c.lookAt(this.look);
  }
  private updateInner(dt: number, s: Skater, input: Input | null) {
    let desiredPos: THREE.Vector3, desiredLook: THREE.Vector3, hfov = CAM.hfov;
    if (this.mode === 'fixed' && this.fixed) {
      desiredPos = this.fixed.fit?.length ? this.fitPos(this.fixed) : this.fixed.pos; desiredLook = this.fixed.target; hfov = this.fixed.hfov;
      // V10.4 R10: el encuadre aleja la cámara por su eje y podía meterla en un muro (charla de Bellakat junto a la valla del centro): se para 0,3 m antes
      if (this.fixed.fit?.length && this.world) { const d = desiredPos.clone().sub(desiredLook), L = d.length(); d.divideScalar(Math.max(L, 1e-6));
        const hit = L > 0.6 ? this.world.castRay(new RAPIER.Ray({ x: desiredLook.x, y: desiredLook.y, z: desiredLook.z }, { x: d.x, y: d.y, z: d.z }), L, true,
          RAPIER.QueryFilterFlags.EXCLUDE_SENSORS | RAPIER.QueryFilterFlags.EXCLUDE_KINEMATIC, undefined, undefined, undefined, this.ignore ?? undefined) : null;
        if (hit && hit.timeOfImpact > 0.05) desiredPos = desiredLook.clone().addScaledVector(d, Math.max(0.5, hit.timeOfImpact - 0.3)); }
    } else if (this.mode === 'track' && this.fixed) {
      desiredPos = this.fixed.pos; hfov = this.fixed.hfov;
      desiredLook = s.visualPos.clone().add(new THREE.Vector3(0, 1.0, 0));
    } else if (this.mode === 'scripted' && this.scripted) {
      const d = this.scripted(); desiredLook = d.look; hfov = d.hfov;
      desiredPos = d.free ? d.pos : this.avoid(d.look, d.pos);   // V10: nunca dentro de geometría (V10.4: salvo los planos del recorrido 2D, que van en arco por encima)
    } else if (this.mode === 'chase' && this.chase) {
      const c = this.chase, p = s.visualPos;
      // en vertical el campo se fija en vertical (58°): con hfov fijo salía ~92° y el cuerpo quedaba diminuto sobre asfalto vacío
      const side = this.portrait() ? c.side * 1.05 : c.side;
      // adelanto según la velocidad (≈0,12 s): a ~10 m/s verticales el retraso del seguimiento dejaba el cuerpo descentrado
      // en vertical (campo horizontal ~32°) se apunta al cuerpo sin adelanto horizontal: si no, quedaba cortado por el borde
      const lead = s.vel.clone().setY(s.vy).multiplyScalar(0.12);
      if (this.portrait()) { lead.x *= 0.25; lead.z *= 0.25; }
      const ahead = this.portrait() ? 0.2 : c.ahead;
      desiredPos = new THREE.Vector3(p.x - c.back + lead.x, p.y + c.up + lead.y, p.z + side);
      desiredLook = new THREE.Vector3(p.x + ahead + lead.x, p.y + 0.9 + lead.y, p.z);
      hfov = this.portrait() ? THREE.MathUtils.radToDeg(2 * Math.atan(Math.tan(THREE.MathUtils.degToRad(58) / 2) * this.cam.aspect)) : c.hfov;
    } else {
      // R8: modo ratón (puntero capturado): el ratón ES la cámara; la mirada libre no vuelve sola y el seguimiento no tira
      const ml = !!input?.mouseLook;
      const held = !!input?.camHeld || ml;
      if (input && input.world && !input.modal) {
        const d = input.camDelta, k = input.keyCam(), gp = input.padOrbit(), m = input.lockDelta;
        const sens = CAM.sens * this.sens, inv = this.invertY ? -1 : 1, ms = CAM.lockSens * this.sens;
        const dx = d.x * sens + m.x * ms + (k.x * CAM.keySens + gp.x * CAM.padSens) * this.sens * dt;
        const dy = (d.y * sens * 0.8 + m.y * ms * 0.85 + (k.y * CAM.keySens * 0.6 + gp.y * CAM.padSens * 0.6) * this.sens * dt) * inv;
        if (dx || dy) {
          this.yaw -= dx; this.pitch = THREE.MathUtils.clamp(this.pitch + dy, held ? CAM.freePitchMin : CAM.pitchMin, held ? CAM.freePitchMax : CAM.pitchMax);
          this.orbitTotal += Math.abs(dx); this.manual = true; this.recentering = false;
        }
        input.camDelta.x = 0; input.camDelta.y = 0; m.x = 0; m.y = 0;
        if (input.recenter) { input.recenter = false; this.recenter(); }
      }
      // R8: en tabla, girar con A/D en modo ratón arrastra la vista con el frente (al soltar, la tabla no vuelve hacia la vista vieja)
      // V8 R2: en la pared del vaso y en su aire la vista se QUEDA (mirando a la pared desde el vaso, como en vert): el frente
      // apunta a la pared y gira 180° en el aire; seguirlo metía la cámara contra el muro. Al volver al fondo se recoloca detrás.
      // R11 (YY-07): durante la caída de la entrada desde fuera la cámara sigue a ANMI (congelada en el borde se metía en ella o bajo el deck)
      const wallHold = !!s.pool?.active && !s.pool.dropping;
      this.shoulderOk = s.onFoot && Math.hypot(s.vel.x, s.vel.z) < 1.2 && !held && !this.recentering;   // R11 (CAM-04)
      // R11 (YY-19): en modo ratón también se recoloca al volver al fondo (mover el ratón lo cancela); antes la vista se quedaba en el muro
      if (this.wallWas && !wallHold && (!held || ml) && !s.pool?.active) { this.recentering = true; this.wallRecenters++; }
      this.wallWas = wallHold;
      if (ml && s.riding && Math.abs(input!.read().x) > 0.1 && !this.recentering && !wallHold) this.yaw += angleDiff(s.camHeading, this.prevHeadCam);
      this.prevHeadCam = s.camHeading;
      // R5: al soltar, la inclinación libre vuelve al rango normal (suave)
      // (si se salió del rango normal mirando libre, vuelve a la inclinación por defecto: la vista «de siempre»)
      if (held && (this.pitch < CAM.pitchMin || this.pitch > CAM.pitchMax)) this.freeLooked = true;
      if (!held && this.freeLooked) {
        this.pitch += (CAM.pitchDefault - this.pitch) * (1 - Math.exp(-CAM.freeReturnRate * dt));
        if (Math.abs(CAM.pitchDefault - this.pitch) < 0.01) { this.pitch = CAM.pitchDefault; this.freeLooked = false; }
      }
      if (held) this.lastManualMark = -2;   // mantener cuenta como manual continuo (el seguimiento no tira mientras se mira)
      if (input && input.lastCamInput !== this.lastManualMark) { this.lastManualMark = input.lastCamInput; this.sinceManual = 0; }
      else this.sinceManual += dt;
      const sinceManual = this.sinceManual;
      const sp = Math.abs(s.speed);
      // V4: el seguimiento automático se coloca detrás del FRENTE de ANMI (no de la marcha): en marcha atrás no da la vuelta
      const travel = s.camHeading;
      // R5 (usuario, 14 oct): la cámara «Fortnite» (detrás de ANMI y girando con ella) vale para TODAS las fuentes, no solo
      // táctil y mando. IG-006: al terminar de bajarse del skate la cámara vuelve detrás del frente aunque se acabara de tocar
      // la cámara (salvo que se esté sujetando en ese momento)
      if (this.prevLoco !== 'walk' && s.loco === 'walk' && this.prevLoco === 'dismount' && !held) { this.recentering = true; this.dismountRecenters++; }
      this.prevLoco = s.loco;
      const chaseLock = !GESTURE_ON && !ml && s.loco !== 'impact' && s.loco !== 'bail';
      if (wallHold) {
        // V8 R2: vista quieta en la pared y en el aire (ver arriba)
      } else if (chaseLock && !this.recentering && sinceManual > CAM.lockHold) {
        const k = 1 - Math.exp(-CAM.lockRate * dt);
        this.yaw += angleDiff(s.camHeading, this.yaw) * k;
        if (sinceManual > CAM.lockHold + 1.5) this.pitch += (CAM.pitchDefault - this.pitch) * (1 - Math.exp(-CAM.lockPitchRate * dt));
        if (Math.abs(angleDiff(s.camHeading, this.yaw)) < 0.2) this.manual = false;
      } else if (this.recentering) {
        const diff = angleDiff(s.camHeading, this.yaw);
        this.yaw += diff * (1 - Math.exp(-6 * dt));
        this.pitch += (CAM.pitchDefault - this.pitch) * (1 - Math.exp(-6 * dt));
        if (Math.abs(diff) < 0.02) this.recentering = false;
      } else if (ml) {
        // R8: modo ratón: sin seguimiento automático (a pie ANMI se orienta a la vista; en tabla, la tabla gira hacia ella)
      } else if (sp > 1.6 && sinceManual > CAM.autoDelay && !s.trick && s.riding && !(this.thumbProfile(input) && Math.abs(input!.read().x) > 0.6)) {
        // V5 T5-16: con el pulgar girando fuerte (táctil/mando) el seguimiento espera (no «tira» de la vista en una curva cerrada)
        const k = 1 - Math.exp(-CAM.autoRate * Math.min(1, (sp - 1.6) / 3) * dt);
        this.yaw += angleDiff(travel, this.yaw) * k;
        this.pitch += (CAM.pitchDefault - this.pitch) * k * 0.6;
        if (Math.abs(angleDiff(travel, this.yaw)) < 0.2) this.manual = false;
      } else if (this.thumbProfile(input) && s.onFoot && sinceManual > CAM.footDelay && (Math.hypot(s.vel.x, s.vel.z) > 0.3 || Math.abs(s.turnRateActual) > 0.5)) {
        // V5 T5-16 (DT-16, REV04-007): a pie, en los perfiles TÁCTIL y MANDO, la cámara se coloca detrás del frente (suave): el
        // «arriba» del stick deja de derivar respecto a la vista. Teclado/ratón: sin cambio (el usuario está conforme)
        const k = 1 - Math.exp(-CAM.footRate * dt);
        this.yaw += angleDiff(s.camHeading, this.yaw) * k;
        if (Math.abs(angleDiff(s.camHeading, this.yaw)) < 0.2) this.manual = false;
      }
      this.poolLift += ((s.pool?.inPool && s.footPos.y < -0.3 ? 0.3 : 0) - this.poolLift) * (1 - Math.exp(-3 * dt));
      const target = this.targetOf(s);
      // mirada adelantada, pero sin meter el objetivo dentro de un muro (si no, los barridos empezaban dentro del sólido)
      // V5 T5-22: la mirada adelantada sigue creciendo hasta 20 m/s (antes saturaba a 6 m/s)
      const la = wallHold ? 0 : this.lookAhead * (Math.min(1, sp / 6) + Math.max(0, Math.min(1, (sp - 9) / 11)) * 0.9);
      // R7: con la cámara pegada detrás (chaseLock, desde R5 también con teclado) la mirada se adelanta en la dirección del FRENTE,
      // no de la marcha: en curvas cerradas a toda velocidad la marcha se separa del frente y sacaba a ANMI hacia un lado del cuadro
      // (cam-cases curva20 en horizontal: 98,6 % < 99 % en el 80 % central)
      const laDir = ml ? this.tmpFwd.set(Math.sin(this.yaw), 0, Math.cos(this.yaw))
        : chaseLock && !this.recentering && sinceManual > CAM.lockHold ? this.tmpFwd.set(Math.sin(s.camHeading), 0, Math.cos(s.camHeading)) : s.loco === 'impact' ? this.tmpFwd.set(Math.sin(s.camHeading), 0, Math.cos(s.camHeading)) : s.dir;   // R11 (ANIM-08)
      let ahead = 0;
      if (la > 0.01) { const fa = this.sweep(target, laDir, la); ahead = Math.max(0, fa - 0.05); target.addScaledVector(laDir, ahead); }
      desiredLook = target;
      // distancia según el modo: a pie algo más cerca; tras oclusión, vuelve a alejarse suave (sin saltos)
      // V5 T5-22: en el vuelo alto del choque de COCHE la cámara se abre (más distancia) para mantener a ANMI en cuadro
      const carFlight = s.loco === 'impact' && s.impactCause === 'coche' && (s.impactPhase === 'launch' || s.impactPhase === 'air');
      this.carOpen += ((carFlight ? 1 : 0) - this.carOpen) * (1 - Math.exp(-(carFlight ? 6 : 2) * dt));
      // R7: la mirada adelantada (hasta ≈ 1,9 m a 20 m/s) acercaba la cámara a ANMI otro tanto y, en horizontal, los pies rozaban el
      // borde inferior (cam-cases curva20): se compensa el 60 % del adelanto en la distancia
      const want = (s.onFoot ? this.dist * 0.86 : this.dist) * (1 + 0.35 * this.carOpen) + ahead * 0.6;
      const free = this.avoid(target, this.desired(target, want));
      const fd = free.distanceTo(target);
      this.avoidActive = fd < want - 0.05 || this.distNow < want - 0.05;   // acortada por avoid o aún recuperándose de ello
      // acercarse rápido pero sin corte (un objeto que cruza ya no teletransporta la cámara); alejarse despacio
      this.distNow = fd < this.distNow ? Math.max(fd, this.distNow + (fd - this.distNow) * (1 - Math.exp(-22 * dt))) : this.distNow + (fd - this.distNow) * (1 - Math.exp(-3 * dt));
      if (this.distNow > fd + 0.05 && this.blocked(target, free.clone().sub(target).normalize(), this.distNow)) this.distNow = fd;   // nunca dentro de un sólido
      desiredPos = target.clone().add(free.sub(target).normalize().multiplyScalar(this.distNow));
      // R5: mirar hacia arriba (inclinación < pitchPosMin): la cámara queda a ras y la mirada sube sobre ANMI
      if (this.pitch < CAM.pitchPosMin) desiredLook = target.clone().setY(target.y + Math.tan(Math.min(1.35, CAM.pitchPosMin - this.pitch)) * this.distNow);
      hfov = CAM.hfov + Math.min(7, Math.max(0, sp - 3) * 1.2) + Math.min(4, Math.max(0, sp - 9) * 0.36);   // V5 T5-22: hasta 20 m/s
    }
    if (this.blend < 1) {
      this.blend = Math.min(1, this.blend + dt / 0.6);
      const e = this.blend * this.blend * (3 - 2 * this.blend);
      this.pos.lerpVectors(this.from.pos, desiredPos, e);
      this.look.lerpVectors(this.from.look, desiredLook, e);
    } else if (this.mode === 'follow') {
      // sin saltos: además del suavizado, la cámara no se desplaza más de lo que se mueve el objetivo + 12 m/s
      const prev = this.pos.clone();
      // V5 T5-22 (OPUS-010, DT-16): interpolación ORBITAL alrededor del objetivo (yaw, pitch, distancia), no cartesiana: al
      // recentrar desde el frente la cuerda pasaba por encima/a través de ANMI (distancia horizontal 1,4 m, cenital). El sentido
      // de giro se fija mientras la diferencia ronda π (no se re-decide cada fotograma).
      { const o = this.pos.clone().sub(desiredLook), od = desiredPos.clone().sub(desiredLook);
        const dc = Math.max(0.3, o.length()), dd = Math.max(0.3, od.length());
        const yc = Math.atan2(o.x, o.z), yd = Math.atan2(od.x, od.z), pc = Math.asin(THREE.MathUtils.clamp(o.y / dc, -1, 1)), pd = Math.asin(THREE.MathUtils.clamp(od.y / dd, -1, 1));
        let dy = angleDiff(yd, yc);
        if (Math.abs(dy) > 2.6) { if (this.orbitSign === 0) this.orbitSign = Math.sign(dy) || 1; if (Math.sign(dy) !== this.orbitSign) dy += this.orbitSign * Math.PI * 2; }
        else this.orbitSign = 0;
        const k = 1 - Math.exp(-14 * dt), y = yc + dy * k, pt = pc + (pd - pc) * k, dist = dc + (dd - dc) * k;
        this.pos.set(desiredLook.x + Math.sin(y) * Math.cos(pt) * dist, desiredLook.y + Math.sin(pt) * dist, desiredLook.z + Math.cos(y) * Math.cos(pt) * dist); }
      const tgtMove = this.lastTarget ? this.lastTarget.distanceTo(desiredLook) : 0, step = this.pos.distanceTo(prev), cap = tgtMove + 12 * dt;
      if (step > cap) this.pos.lerpVectors(prev, this.pos, cap / step);
      // si el tramo limitado deja la cámara tras un sólido (entrada al túnel, esquina del muro), se acepta el salto
      { const d = this.pos.clone().sub(desiredLook), L = d.length(); if (L > 0.05 && this.blocked(desiredLook, d.divideScalar(L), L)) { if (this.pos.distanceTo(desiredPos) > 0.5) this.occlusionCuts++; this.pos.copy(desiredPos); } }
      this.look.lerp(desiredLook, 1 - Math.exp(-16 * dt));
    } else if (this.mode === 'chase' || this.mode === 'scripted') {
      this.pos.lerp(desiredPos, 1 - Math.exp(-12 * dt));
      this.look.lerp(desiredLook, 1 - Math.exp(-14 * dt));
    } else {
      this.pos.lerp(desiredPos, 1 - Math.exp(-10 * dt));
      this.look.lerp(desiredLook, 1 - Math.exp(-12 * dt));
    }
    this.lastTarget = (this.lastTarget ?? new THREE.Vector3()).copy(desiredLook);
    this.cam.position.copy(this.pos);
    if (this.shake > 0) {
      this.shake = Math.max(0, this.shake - dt * 2.5);
      this.cam.position.add(new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, 0).multiplyScalar(this.shake * 0.08));
    }
    this.cam.lookAt(this.look);
    // cámaras con encuadre por volúmenes: campo vertical ≤62° (en vertical se aleja en vez de abrir a 92° y empequeñecer)
    const v = vfovFromH(hfov, this.cam.aspect, this.mode === 'fixed' && this.fixed?.fit?.length ? 62 : this.mode !== 'follow' ? 92 : 80);
    if (Math.abs(this.cam.fov - v) > 0.01) { this.cam.fov = v; this.cam.updateProjectionMatrix(); }
  }

  /** Longitud libre barriendo una esfera de 0,24 m desde `from` (la cámara no queda pegada ni dentro de un muro). */
  /** R11: barridos que empezaron solapando (diagnóstico). */
  startPen = 0;
  /** R11 (NMG-03): la cabeza está dentro del túnel del circuito (lo decide el juego cada fotograma). */
  inTunnel = false;
  /** R11 (CAM-04): solo a pie, casi parada y sin girar ni recentrar la cámara (en marcha o en una órbita no se abre de lado). */
  private shoulderOk = false;
  /** R11 (CAM-04): lado preferido al abrir «por encima del hombro» (histéresis). */
  private shoulder = 1;
  private sweep(from: THREE.Vector3, dir: THREE.Vector3, len: number) {
    const w = this.world; if (!w) return len;
    const cast = (stop: boolean) => w.castShape({ x: from.x, y: from.y, z: from.z }, { x: 0, y: 0, z: 0, w: 1 }, { x: dir.x * len, y: dir.y * len, z: dir.z * len }, this.ball, 0, 1, stop,
      RAPIER.QueryFilterFlags.EXCLUDE_SENSORS | RAPIER.QueryFilterFlags.EXCLUDE_KINEMATIC, undefined, undefined, undefined, this.ignore ?? undefined);
    let hit = cast(true);
    // R11 (YY-07): si la bola ya EMPIEZA solapando algo (el pecho de ANMI a la altura del remate del vaso, pegada a la pared), todas las
    // direcciones daban 0 y la cámara se pegaba a ella; se repite dejando salir del solape (solo cuenta lo que hay al alejarse)
    if (hit && hit.time_of_impact < 1e-4) { this.startPen++; hit = cast(false); }
    return hit ? hit.time_of_impact * len : len;
  }
  private blocked(target: THREE.Vector3, dir: THREE.Vector3, len: number) { return this.sweep(target, dir, len) < len - 0.02; }
  /** Acercar la cámara si hay geometría relevante entre el objetivo y la posición deseada. Si el hueco es estrecho (detrás
   *  de un muro, dentro del túnel), primero se prueba subirla por encima antes de pegarla a la cabeza; nunca dentro de un
   *  sólido (V3: el mínimo fijo de 0,9 m la metía dentro del muro de YINYANG). */
  private avoid(target: THREE.Vector3, desired: THREE.Vector3) {
    const dir = desired.clone().sub(target);
    const len = dir.length(); if (len < 0.01 || !this.world) return desired;
    dir.divideScalar(len);
    const free = this.sweep(target, dir, len);
    if (free >= len - 1e-3) return desired;
    if (free >= 1.6) return target.clone().addScaledVector(dir, free);
    const yaw = Math.atan2(dir.x, dir.z), pitch0 = Math.asin(THREE.MathUtils.clamp(dir.y, -1, 1));
    // R11 (CAM-04): de espaldas a una pared (hueco < 1 m) y sin techo encima, primero «por encima del hombro» (girada 35–57°, con
    // histéresis de lado) en vez de subirla casi cenital sobre la cabeza
    if (this.shoulderOk && free < 1.0 && this.sweep(target, new THREE.Vector3(0, 1, 0), 1.5) >= 1.49) {
      for (const sd of [this.shoulder, -this.shoulder]) for (const [dy, dp] of [[0.6, 0.3], [1.0, 0.35]]) {
        const p = Math.min(1.3, pitch0 + dp), y2 = yaw + dy * sd, d2 = new THREE.Vector3(Math.sin(y2) * Math.cos(p), Math.sin(p), Math.cos(y2) * Math.cos(p));
        const f2 = this.sweep(target, d2, len);
        if (f2 >= 1.4) { this.shoulder = sd; return target.clone().addScaledVector(d2, f2); }
      }
    }
    // hueco estrecho: subir por encima y, si un muro alto lo impide, abrir de lado (como al pegarse a una pared)
    const tries: [number, number][] = [[0, 0.26], [0, 0.52], [0, 0.78], [0, 1.05], [0.5, 0.3], [-0.5, 0.3], [1.0, 0.35], [-1.0, 0.35], [0, 1.3], [0.6, 0.9], [-0.6, 0.9], [1.6, 0.4], [-1.6, 0.4], [1.6, 1.0], [-1.6, 1.0]];
    for (const [dy, dp] of tries) {
      const p = Math.min(1.3, pitch0 + dp), y2 = yaw + dy, d2 = new THREE.Vector3(Math.sin(y2) * Math.cos(p), Math.sin(p), Math.cos(y2) * Math.cos(p));
      const f2 = this.sweep(target, d2, len);
      if (f2 >= 1.2) return target.clone().addScaledVector(d2, f2);
    }
    // R11 (NMG-03): dentro del túnel del circuito, antes de pegarla, candidatos casi horizontales (inclinación 6–12°) por el eje
    if (this.inTunnel) for (const [dy, p] of [[0, 0.105], [0, 0.2], [0.3, 0.105], [-0.3, 0.105]]) {
      const y2 = yaw + dy, d2 = new THREE.Vector3(Math.sin(y2) * Math.cos(p), Math.sin(p), Math.cos(y2) * Math.cos(p));
      const f2 = this.sweep(target, d2, len);
      if (f2 >= 1.5) return target.clone().addScaledVector(d2, f2);
    }
    return target.clone().addScaledVector(dir, Math.max(0.3, free));
  }
  /** Distancia mínima (por la dirección ancla→objetivo, nunca más cerca que el ancla) para que los puntos `fit` quepan. */
  private fitPos(f: { pos: THREE.Vector3; target: THREE.Vector3; hfov: number; fit?: THREE.Vector3[]; insetAware?: boolean }) {
    const c = this.fitCam, dir = f.pos.clone().sub(f.target), d0 = dir.length(); dir.divideScalar(d0);
    c.aspect = this.cam.aspect; c.fov = vfovFromH(f.hfov, c.aspect, 62); c.near = 0.1; c.far = 500; c.updateProjectionMatrix();
    // V6: con franja libre (interfaz arriba/abajo, setFrameInset) el encuadre debe caber en su alto, no en el de la pantalla
    const band = Math.max(0.3, 1 - (this.insetWant.top + this.insetWant.bottom) / Math.max(1, this.vh)), ylim = 0.86 * band;
    // V8 R10 (charla y baile de la rana): `insetAware` aplica al cálculo el MISMO desplazamiento de imagen que pone el diálogo
    // (setViewOffset) y exige caber en la franja libre real; el resto de encuadres conserva el cálculo anterior
    let yc = 0, yh = ylim;
    if (f.insetAware) {
      const t = this.insetWant.top, b = this.insetWant.bottom, d = b - t, vh = Math.max(1, this.vh);
      if (Math.abs(d) >= 0.5) c.setViewOffset(this.vw, vh + Math.abs(d), 0, d > 0 ? d : 0, this.vw, vh); else c.clearViewOffset();
      c.updateProjectionMatrix();
      const lo_ = -1 + 2 * b / vh, hi_ = 1 - 2 * t / vh; yc = (lo_ + hi_) / 2; yh = (hi_ - lo_) / 2 * 0.86;
    }
    const fits = (d: number) => { c.position.copy(f.target).addScaledVector(dir, d); c.lookAt(f.target); c.updateMatrixWorld(); return f.fit!.every((p) => { const n = p.clone().project(c); return Math.abs(n.x) <= 0.86 && Math.abs(n.y - yc) <= yh && n.z < 1; }); };
    let lo = d0, hi = d0 * 5;
    const done = (p: THREE.Vector3) => { if (f.insetAware) { c.clearViewOffset(); c.updateProjectionMatrix(); } return p; };
    if (fits(lo)) return done(f.pos);
    if (!fits(hi)) return done(f.target.clone().addScaledVector(dir, hi));
    for (let i = 0; i < 14; i++) { const m = (lo + hi) / 2; if (fits(m)) hi = m; else lo = m; }
    if (f.insetAware) { c.clearViewOffset(); c.updateProjectionMatrix(); }
    return f.target.clone().addScaledVector(dir, hi);
  }
  /** Azimut horizontal real de la cámara (para orientar el joystick). */
  get forward() { const f = new THREE.Vector3(); this.cam.getWorldDirection(f); f.y = 0; return f.normalize(); }
  resize(w: number, h: number) { this.vw = w; this.vh = h; this.cam.aspect = this.letterbox ? 16 / 9 : w / h; this.applyInset(); }
  /** V10.5 (AM-13, E5-26, E5-38): con el móvil en vertical, la cinemática del parque y la escena final se dibujan en una franja 16:9 (el juego pone
   *  el viewport): la cámara usa el aspecto de la franja, así salen los encuadres de horizontal (sin el tope de 92° que la dejaba «pocha»). */
  letterbox = false;
  setLetterbox(on: boolean) { if (on === this.letterbox) return; this.letterbox = on; this.cam.aspect = on ? 16 / 9 : this.vw / this.vh; this.applyInset(); }
  // V5 T5-23 (SOL-008, plan 15 §3): con el diálogo de una actividad abierto, la escena se centra en la región LIBRE de la
  // pantalla (desplazamiento de la proyección con setViewOffset: no se mueve la cámara ni se escalan personajes). top/bottom =
  // px lógicos tapados arriba/abajo; transición suave.
  private vw = 1; private vh = 1;
  private inset = { top: 0, bottom: 0 }; private insetWant = { top: 0, bottom: 0 };
  setFrameInset(top: number, bottom: number) { this.insetWant.top = Math.max(0, top); this.insetWant.bottom = Math.max(0, bottom); }
  /** Desplazamiento vertical actual del centro de la imagen (px lógicos, + = hacia arriba). Pruebas. */
  get insetShift() { return (this.inset.bottom - this.inset.top) / 2; }
  stepInset(dt: number) {
    const k = 1 - Math.exp(-8 * dt), a = this.inset, w = this.insetWant;
    const nt = Math.abs(w.top - a.top) < 0.5 ? w.top : a.top + (w.top - a.top) * k, nb = Math.abs(w.bottom - a.bottom) < 0.5 ? w.bottom : a.bottom + (w.bottom - a.bottom) * k;
    if (nt !== a.top || nb !== a.bottom) { a.top = nt; a.bottom = nb; this.applyInset(); }
  }
  private applyInset() {
    const d = this.inset.bottom - this.inset.top;   // + : el centro sube (tapa abajo); − : baja (tapa arriba)
    if (Math.abs(d) < 0.5 || this.letterbox) this.cam.clearViewOffset();
    else this.cam.setViewOffset(this.vw, this.vh + Math.abs(d), 0, d > 0 ? d : 0, this.vw, this.vh);
    this.cam.updateProjectionMatrix();
  }
}
