// V10.4 · recorrido con los anfitriones 2D (dossier «Diálogos 2D» v1.5 + decisiones W-D01…W-D37): UN solo dueño de las secuencias que toman
// cámara y control (dossier 04 §4). Tutorial en la plaza blanca (PLA), cinemática del parque (CIN-01, saltable), bienvenida (PAR), camino a la
// primera patata (NMG), recordatorio (OBJ), bloqueo de 3 patatas por actividad, transiciones entre zonas (PAS), 20/20 con la revelación y la
// guía de SECRETNOVIO (FIN, SN-GUIDE-01) y despedida tras la escena final (DES). El modo ayuda y el aviso de fuera están en ayuda.ts.
// Estado guardado en `Progress.narr` (state.ts), con migración: las partidas que ya existían no ven el tutorial ni la bienvenida (W-D36).
import * as THREE from 'three';
import type { Game } from './game';
import { Token } from './sim';
import { DOSSIER, CONTROLES, DESBLOQUEO, TEXTOS, PISTAS, type Quien } from './textos2d';
import { d2Say, d2Close, preloadD2 } from './dialogo2d';
import { SECTORS, SECTOR_BY_ID, type ZoneId, TOTAL_FRIES } from './world/manifest';
import { BOLA } from './world/bola';
import { snW } from './world/sn';
import { hint, clearHint, toast, $, dialogOpen } from './ui';
import { FryPickup } from './fx';
import * as avisos from './avisos';   // V10.6 (B5): métricas sin identificadores
import * as crono from './crono';   // V10.6.1: cronómetro de speedrun

/** V10.5 (regla de oro, E5-08/E5-09): segundos de «plano limpio» (cámara quieta en lo que se enseña, sin 2D) tras cada viaje de cámara. */
const CLEAN_SHOT = 2.0;
/** Orden del recorrido guiado (dossier 01 §6). */
export const RUTA: ZoneId[] = ['no_me_guillo', 'nosvamosdeaqui', 'yinyang', 'tratratra', 'fashion_girl'];
const PAS: Record<string, [string, string]> = { nosvamosdeaqui: ['PAS-01', 'PAS-02'], yinyang: ['PAS-03', 'PAS-04'], tratratra: ['PAS-05', 'PAS-06'], fashion_girl: ['PAS-07', 'PAS-08'] };
const EXPLO = ['visible', 'medium', 'hidden'] as const;
/** V10.4 R12 (usuario): imagen en el centro de algunas frases: la patata 2D cuando dicen «Las patatas nos ayudarán a arreglarla» (PAR-03). */
const IMG: Record<string, string> = { 'PAR-03': 'dialogo_2d/patata_2d.webp' };

export class Narrativa {
  busy = false;                 // hay una secuencia con la cámara y el control
  private token: Token | null = null;
  private queue: string[] = [];
  private shell: THREE.Mesh | null = null;          // cerramiento blanco de la plaza
  private marks: THREE.Mesh[] = [];
  private practice: FryPickup | null = null;
  private exercise: { id: string; check: () => boolean; t: number; rolled?: boolean; still?: number } | null = null;
  skipReq = false;              // «Saltar tutorial» / SALTAR de la cinemática
  inCine = false;
  get inTutorial() { return !!this.shell && this.N.estado === 'nuevo'; }
  /** V10.6 (2.6): se puede «Saltar tutorial» (no en la pregunta del modo ayuda: ya no queda nada que saltar y la dejaba sin respuesta). */
  get puedeSaltar() { return this.inTutorial && this.N.paso !== 'MODO'; }
  /** V10.6 (resto de H8-10): bloque de la cola que corre ahora (null = tutorial, bienvenida o nada). */
  actual: string | null = null; private runK = 0;
  /** V10.6 (B5): el tutorial de esta visita se saltó (para el aviso `tutorial`). */
  private tutoSaltado = false;
  /** V10.6: secuencia del tutorial o de la bienvenida en marcha (no se corta con «Volver a la plaza»: ANMI ya está en la plaza y quieta). */
  get enGuion() { return this.busy && !this.actual; }
  /** Punto que sustituye a ANMI para la mezcla de música (la cinemática del parque suena por donde pasa la cámara). */
  musicProbe: THREE.Vector3 | null = null;

  constructor(private g: Game) {}
  get N() { return this.g.state.p.narr; }
  get off() { return this.N.estado === 'off'; }
  private save() { this.g.state.save(); }
  private seen(id: string) { return this.N.vistos.includes(id); }
  private mark(id: string) { if (!this.seen(id)) { this.N.vistos.push(id); this.save(); }
    // V10.6: el bloque terminado deja de estar pendiente (PAS: su 2.ª frase; FIN y DES: su marca)
    if (id === 'FIN' || id === 'DES') this.pendSet(id, false); else for (const [z, b] of Object.entries(PAS)) if (b[1] === id) this.pendSet(`PAS:${z}`, false); }
  /** V10.6 (H8-02, H8-03, H8-11): apunta en la partida guardada los bloques ofrecidos y sin terminar (se vuelven a ofrecer al recargar). */
  private pendSet(id: string, on: boolean) {
    if (!/^(FIN|DES|PAS:)/.test(id)) return;
    const N = this.N, P = N.pend ?? [], has = P.includes(id);
    if (on && !has) { N.pend = [...P, id].slice(-8); this.save(); }
    else if (!on && has) { const r = P.filter((x) => x !== id); if (r.length) N.pend = r; else delete N.pend; this.save(); }
  }
  /** V10.6 (H8-12): punto seguro para parar el juego con un 2D (como la narrativa): en el suelo, sin golpe ni caída, fuera de la pared del
   *  vaso y casi parada. */
  puntoSeguro() { const s = this.g.skater; return !!s && s.grounded && s.loco !== 'impact' && s.loco !== 'bail' && !s.pool?.active && Math.hypot(s.vel.x, s.vel.z) < 1; }

  /** Espera (iPhone: la pregunta del modo app sale al empezar y quedaba DEBAJO del 2D, sin poder pulsarse): la narrativa no arranca hasta `release()`. */
  hold = false; private startPending = false;
  release() { this.hold = false; if (this.startPending) { this.startPending = false; this.start(); } }

  /** Al empezar a jugar (tras JUGAR). */
  start() {
    if (this.off) return;
    if (this.hold) { this.startPending = true; return; }
    void preloadD2();
    if (this.N.estado === 'nuevo') { void this.g.audio.music?.loadFinal(new URL('./audio/nmg-cine-v104.m4a', document.baseURI).href); void this.runTutorial(); return; }   // R12: el corte de la cinemática, ya cargado
    // V10.5 (AM-31, E5-29): recargar durante la cinemática o la bienvenida dejaba «tutorial-hecho» para siempre (sin bienvenida, sin guía y sin modo
    // ayuda): se retoma desde la cinemática entera (banco → cinemática, saltable → bienvenida → guía) y se acaba en «hecho»
    if (this.N.estado === 'tutorial-hecho') { void this.g.audio.music?.loadFinal(new URL('./audio/nmg-cine-v104.m4a', document.baseURI).href); void this.runResume(); return; }
    // W-D36: partida que ya existía (o tutorial hecho sin haber contestado): una pregunta del modo ayuda, una vez
    if (this.N.ayuda === null && !this.g.state.p.finalDone) this.enqueue('MODO');
    this.reconcile();
    // V10.5 (AM-32, E5-30): una presentación de zona cortada (se vio su primera frase y no la segunda) se vuelve a ofrecer al explorar
    { const nz = this.nextZone(), blk = nz ? PAS[nz] : undefined; if (blk && this.seen(blk[0]) && !this.seen(blk[1]) && !this.g.state.centerUnlocked) this.enqueue(`PAS:${nz}`); }
    // V10.6 (H8-02, H8-03, H8-11): lo que se ofreció y no se terminó antes de recargar (o cerrar), si sigue teniendo sentido; si no, se olvida
    const st = this.g.state;
    for (const id of [...(this.N.pend ?? [])]) {
      if (id === 'FIN') { if (st.centerUnlocked && !this.seen('FIN')) this.enqueue('FIN'); else this.pendSet('FIN', false); }
      else if (id === 'DES') { if (st.p.finalDone && !this.seen('DES')) this.enqueue('DES'); else this.pendSet('DES', false); }
      else { const z = id.slice(4) as ZoneId, blk = PAS[z]; if (blk && this.nextZone() === z && !this.seen(blk[1]) && !st.centerUnlocked) this.enqueue(id); else this.pendSet(id, false); }
    }
  }

  // ------------------------------------------------------------------ cola de bloques (un solo intento activo)
  enqueue(id: string) { if (this.off || this.queue.includes(id)) return; this.queue.push(id); this.pendSet(id, true); }
  /** Prioridad (dossier 04 §9): DES > FIN > tutorial > PAS > OBJ. */
  private next() { const P = ['DES', 'FIN', 'MODO', 'PAS', 'OBJ']; this.queue.sort((a, b) => P.findIndex((p) => a.startsWith(p)) - P.findIndex((p) => b.startsWith(p))); return this.queue[0]; }
  /** Cada paso fijo: sirve la cola cuando ANMI está en un punto seguro y nada más tiene el control. */
  update(dt: number) {
    if (this.off) return;
    if (this.exercise) this.stepExercise(dt);
    if (this.shell) this.plazaBound();
    if (this.parkOff && (this.hideT += dt) > 1) { this.hideT = 0; this.hidePark(); }   // lo cargado después (personajes) también fuera
    if (this.practice && !this.practice.collected) this.practice.update?.(dt);
    if (this.marks.length) { const k = this.g.state.p.settings.reducedMotion ? 1 : 1 + 0.14 * Math.sin(this.g.sim.now * 4.2); for (const m of this.marks) m.scale.setScalar(k); }   // V10.4 R12: las marcas laten
    if (this.busy || !this.queue.length) return;
    const g = this.g, s = g.skater!;
    if (g.mode !== 'explore' || g.paused || dialogOpen() || g.rewardShotOn || g.activities.some((a: any) => a.busy || a.inAttempt || a.painting || a.seated)) return;
    if (!s.grounded || s.loco === 'impact' || s.loco === 'bail' || s.pool?.active || g.revealT >= 0) return;
    const id = this.next(); this.queue.shift();
    void this.run(id);
  }
  private async run(id: string) {
    const k = ++this.runK; this.actual = id;   // V10.6 (resto de H8-10)
    try {
    if (id === 'MODO') return await this.seq(() => this.askHelp(true));
    if (id === 'OBJ') return await this.seq(async (t) => { await this.lines(['OBJ-01', 'OBJ-02', 'OBJ-03'], t); this.mark('OBJ'); });
    if (id.startsWith('PAS:')) return await this.seq((t) => this.pas(id.slice(4) as ZoneId, t));
    if (id === 'FIN') return await this.seq((t) => this.fin(t));
    if (id === 'DES') return await this.seq(async (t) => { await this.lines(['DES-01', 'DES-02', 'DES-03'], t); this.mark('DES'); if (t.alive) { avisos.dialogoFinal(); crono.resultado(); } });   // V10.6.1: tiempo final
    } finally { if (this.runK === k) this.actual = null; }
  }
  /** V10.6 (resto de H8-10): «Volver a la plaza» corta el bloque de la cola en marcha (su limpieza devuelve cámara y control) y lo deja otra vez
   *  en cola para el siguiente punto seguro (no se pierde). El tutorial y la bienvenida no se cortan (durante ellos no se ofrece). */
  cortarParaPlaza() { const id = this.actual; if (!id || !this.busy) return false; this.actual = null; this.cancel(); this.queue = this.queue.filter((q) => q !== id);
    // se vuelve a ofrecer pasados 3 s de juego en la plaza (no en el mismo instante de llegar); si se recarga antes, lo guarda `pend`
    this.g.sim.after(3, () => this.enqueue(id)); return true; }
  /** Envoltorio de secuencia: punto seguro, control y cámara tomados, limpieza idempotente al acabar o cancelar. */
  private async seq(fn: (t: Token) => Promise<void>) {
    const g = this.g, s = g.skater!;
    this.token?.cancel(); const t = new Token('narrativa'); this.token = t; this.busy = true;
    s.vel.set(0, 0, 0); const froze = !s.frozen; s.frozen = true; g.input.clear(); g.setMode('narr');   // R19: la música baja solo con el diálogo abierto (game.ts, DIALOG_DUCK), no en los viajes de cámara
    t.onCancel(() => { this.busy = false; d2Close(); this.musicProbe = null; if (froze) s.frozen = false; g.audio.duck(false); if (g.mode === 'narr') { g.setMode('explore'); g.rig.toFollow(s); }
      // V10.5 (blindaje): al acabar una secuencia explorando, la cámara nunca se queda en un plano guionizado ni ANMI congelada
      else if (g.mode === 'explore' && g.rig.mode === 'scripted') { g.rig.toFollow(s); s.frozen = false; }
      g.input.clear(); g.updateObjective(); });
    try { await fn(t); } catch (e) { console.warn('narrativa', e); } finally { if (this.token === t) { this.token = null; t.cancel(); } }
  }
  cancel() { this.token?.cancel(); }

  /** Una o varias frases del dossier, literales; cada una se marca vista al avanzarla (dossier 04 §11). */
  /** V10.5 (E5-16): `skippable` = frase del tutorial con «Saltar tutorial» dentro del 2D (hasta la pregunta del modo ayuda). */
  private async lines(ids: string[], t: Token, skippable = false) {
    for (const id of ids) { if (!t.alive || (skippable && this.skipReq)) return; const L = DOSSIER[id];
      const skip = skippable && this.inTutorial && !this.skipReq ? { label: TEXTOS.saltarTutorial, fn: () => this.skipTutorial() } : undefined;
      const r = await d2Say(L, { token: t, img: IMG[id], skip }); if (r < 0 || !t.alive) return; this.mark(id); }
  }

  // ------------------------------------------------------------------ cámara: viajes y planos (reloj de simulación; pausa los congela)
  private pose = { pos: new THREE.Vector3(), look: new THREE.Vector3(), hfov: 60, free: true };
  private camFrom() { const c = this.g.rig.cam; const d = new THREE.Vector3(); c.getWorldDirection(d); return { pos: c.position.clone(), look: c.position.clone().addScaledVector(d, 10), hfov: THREE.MathUtils.radToDeg(2 * Math.atan(Math.tan(THREE.MathUtils.degToRad(c.fov) / 2) * c.aspect)) }; }
  /** Viaja de la pose actual a `to` en `sec` (suave); con «reducir movimiento», corte. */
  private async camTo(to: { pos: THREE.Vector3; look: THREE.Vector3; hfov?: number }, sec: number, t: Token, arc = 1) {
    const g = this.g, A = { ...this.camFrom() }, reduced = g.state.p.settings.reducedMotion, hf = to.hfov ?? 55;
    g.rig.toScripted(() => this.pose, true);
    if (reduced || sec <= 0) { this.pose.pos.copy(to.pos); this.pose.look.copy(to.look); this.pose.hfov = hf; await g.sim.wait(reduced ? 0.25 : 0, t); return; }
    const t0 = g.sim.now; const ease = (x: number) => x * x * (3 - 2 * x);
    // V10.4: el viaje es un ARCO (curva con el punto de control alto): pasa por encima de vallas, palmeras, muros y edificios en vez de atravesarlos
    const dist = A.pos.distanceTo(to.pos), C = A.pos.clone().add(to.pos).multiplyScalar(0.5); C.y = Math.max(A.pos.y, to.pos.y, C.y) + THREE.MathUtils.clamp(dist * 0.4 * arc, 0, 16 * arc);
    while (t.alive && !this.skipReq) { const k = Math.min(1, (g.sim.now - t0) / sec), e = ease(k), u = 1 - e;
      this.pose.pos.set(0, 0, 0).addScaledVector(A.pos, u * u).addScaledVector(C, 2 * u * e).addScaledVector(to.pos, e * e); this.pose.look.lerpVectors(A.look, to.look, e); this.pose.hfov = A.hfov + (hf - A.hfov) * e;
      this.musicProbe = this.musicProbe ? this.pose.look.clone().setY(0) : null;
      if (k >= 1) break; await g.sim.wait(1 / 60, t); }
  }
  /** V10.5 (regla de oro, E5-08/E5-09): plano limpio. La cámara guionizada sigue a su pose con algo de suavizado: primero se espera a que esté
   *  quieta de verdad (como mucho 1,5 s) y desde ahí cuentan los 2 s sin diálogo. */
  private async cleanShot(t: Token) {
    const g = this.g, t0 = g.sim.now;
    while (t.alive && !this.skipReq && performance.now() - g.camStillSince < 250 && g.sim.now - t0 < 1.5) await g.sim.wait(1 / 60, t);
    if (t.alive && !this.skipReq) await g.sim.wait(CLEAN_SHOT, t);
  }
  private behind() { const s = this.g.skater!, h = s.heading, f = new THREE.Vector3(Math.sin(h), 0, Math.cos(h)); return { pos: s.footPos.clone().addScaledVector(f, -4.2).add(new THREE.Vector3(0, 2.4, 0)), look: s.footPos.clone().add(new THREE.Vector3(0, 1.2, 0)), hfov: 60 }; }
  /** Vista alta oblicua («axonométrica», dossier 04 §6.4) de una zona: desde el paseo interior, 40° hacia abajo, mirando a su centro. */
  private axo(z: ZoneId) { const S = this.g.park.sector(z), c = S.P(31, 0), e = S.P(16, 0); return { pos: new THREE.Vector3(e.x, 19, e.z), look: new THREE.Vector3(c.x, 0.5, c.z), hfov: 55 }; }

  // ------------------------------------------------------------------ tutorial en la plaza blanca (dossier 04 §5; W-D23, W-D24, W-D37)
  private plazaC() { return new THREE.Vector3(BOLA.plaza.x, 0, BOLA.plaza.z); }
  // V10.5 (O-11, AM-14, E5-32): dentro de la esfera blanca del tutorial no se dibuja el parque (antes, 1,1–1,4 M triángulos y 300–400 llamadas detrás
  // de la esfera): lo que no toca la esfera pasa a la capa 3 (ni la cámara ni la sombra la dibujan; la física no cambia). Se enciende otra vez
  // antes de la pregunta del modo ayuda, con el 2D delante, y se dibuja una vez debajo del velo para que suba a la GPU sin tirón.
  private hidden: { o: THREE.Object3D; mask: number }[] = []; private parkOff = false; private hideT = 0;
  private hidePark() {
    const c = this.plazaC(), keep = new Set<THREE.Object3D>(); this.parkOff = true;
    if (this.shell) keep.add(this.shell); this.g.visual.root.traverse((o) => keep.add(o)); for (const m of this.marks) keep.add(m); if (this.practice) this.practice.group.traverse((o) => keep.add(o));
    const sph = new THREE.Sphere();
    this.g.scene.traverse((o: any) => {
      if (!(o.isMesh || o.isPoints || o.isLine || o.isSprite) || o.layers.mask !== 1 || keep.has(o)) return;
      if (o.isInstancedMesh) { if (!o.boundingSphere) o.computeBoundingSphere(); sph.copy(o.boundingSphere); }
      else { const gm = o.geometry; if (!gm) return; if (!gm.boundingSphere) gm.computeBoundingSphere(); if (!gm.boundingSphere) return; sph.copy(gm.boundingSphere); }
      o.updateWorldMatrix(true, false); sph.applyMatrix4(o.matrixWorld);
      if (!Number.isFinite(sph.radius) || sph.center.distanceTo(c) < 17 + sph.radius) return;   // toca la esfera (suelo grande, cielo…): se queda
      this.hidden.push({ o, mask: o.layers.mask }); o.layers.set(3);
    });
  }
  private showPark() {
    if (!this.parkOff) return; this.parkOff = false;
    for (const h of this.hidden) h.o.layers.mask = h.mask; this.hidden = [];
    this.g.redrawFrozen();
  }
  private buildShell() {
    const m = new THREE.Mesh(new THREE.SphereGeometry(16, 48, 24), new THREE.MeshBasicMaterial({ color: '#ffffff', side: THREE.BackSide, transparent: true, opacity: 1, depthWrite: true, fog: false }));
    m.position.copy(this.plazaC()); m.name = 'TUTORIAL_PLAZA_BLANCA'; m.renderOrder = -1; this.g.scene.add(m); this.shell = m;
    document.body.classList.add('tutorial');   // V10.5 (AM-22, E5-28): sin zona, objetivo ni SKILLS en la plaza blanca
    this.hidePark();
  }
  /** Límite suave: ANMI no sale de un radio de 7 m alrededor del centro de la plaza (sin golpes: se la devuelve al borde). */
  private plazaBound() { const s = this.g.skater!, c = this.plazaC(), d = s.footPos.clone().sub(c).setY(0), r = d.length(), R = 7.0;
    if (r > R) { const p = c.clone().addScaledVector(d.normalize(), R); p.y = s.footPos.y; s.nudge(p); const out = s.vel.x * d.x + s.vel.z * d.z; if (out > 0) s.vel.addScaledVector(new THREE.Vector3(d.x, 0, d.z), -out); } }
  private markAt(p: THREE.Vector3, color = '#ffd93b') {
    const g = new THREE.RingGeometry(0.62, 0.86, 40); g.rotateX(-Math.PI / 2);
    const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.9, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4 })); m.position.copy(p).setY(p.y + 0.03); m.name = 'TUTORIAL_MARCA'; this.g.scene.add(m); this.marks.push(m); return m;
  }
  private clearMarks() { for (const m of this.marks) { m.removeFromParent(); m.geometry.dispose(); } this.marks = []; }
  private ctrlKey = '';
  private controls(key: string) {
    const src = this.g.input.source, row = CONTROLES[key]; if (!row) return; this.ctrlKey = key;
    hint(src === 'touch' ? row.tactil : src === 'gamepad' ? row.mando : row.teclado, 60000);
  }
  /** V10.5 (AM-07, E5-19): al cambiar de entrada (teclado, táctil, mando) se reescribe el aviso del ejercicio en curso. */
  onSource() { if (this.exercise && this.ctrlKey) this.controls(this.ctrlKey); }
  /** Ejercicio: devuelve el control y espera a que se cumpla la condición real (no por cronómetro). */
  /** V10.4 R13 (usuario): si en 15 s no se ha hecho, se repite la frase (con su plano del objetivo si lo tiene) por si se olvidó qué había que hacer. */
  private async exerciseUntil(id: string, ctrl: string, check: () => boolean, t: Token, target?: THREE.Vector3) {
    const g = this.g, s = g.skater!; d2Close();
    const play = () => { s.frozen = false; g.setMode('explore'); g.rig.toFollow(s); this.controls(ctrl); this.showSkip(true); };
    play();
    this.exercise = { id, check, t: 0 };
    while (t.alive && this.exercise && !this.skipReq) {
      await g.sim.wait(0.1, t);
      if (this.exercise && this.exercise.t >= 15 && t.alive && !this.skipReq && this.puntoSeguro()) {   // V10.6 (H8-12): la repetición espera al suelo
        const ex: NonNullable<typeof this.exercise> = this.exercise; this.exercise = null; clearHint(); this.showSkip(false); s.vel.set(0, 0, 0); s.frozen = true; g.input.clear(); g.setMode('narr');
        if (target) await this.stepFocus([id], target, t); else await this.lines([id], t);
        if (!t.alive || this.skipReq) break;
        ex.t = 0; this.exercise = ex; d2Close(); play(); }
    }
    clearHint(); this.exercise = null; this.showSkip(false);
    if (!t.alive) return;
    // V10.5 (usuario: «si le das a saltar tutorial… la cámara se me ha quedado en el banco y no me ha seguido»): también al SALTAR a mitad del
    // ejercicio se vuelve a «narración» con ANMI quieta. Antes se salía antes de esto: la pregunta, el banco, la cinemática y la guía corrían
    // en modo «explorar» y, al acabar, la cámara se quedaba en su último plano guionizado (sin seguir a ANMI ni moverse con el ratón)
    s.vel.set(0, 0, 0); s.frozen = true; g.input.clear(); g.setMode('narr');
    if (this.skipReq) return;
    await g.sim.wait(0.4, t);   // V10.5 (AM-28, E5-11): tras cumplir un ejercicio, un respiro antes de la frase (ANMI ya parada y la cámara asentándose)
  }
  private stepExercise(dt: number) { const e = this.exercise!; e.t += dt; if (e.check()) this.exercise = null; }

  /** V10.5 (AM-32, E5-30): paso del tutorial en el que está la partida (se guarda al EMPEZAR cada paso, antes de su frase): al recargar se
   *  retoma ahí (su frase y su ejercicio) en vez de volver a la primera frase. */
  private setPaso(id: string) { if (this.N.paso !== id) { this.N.paso = id; this.save(); } }
  private async runTutorial() {
    const g = this.g, s = g.skater!;
    this.buildShell();
    const ORDER = ['PLA-03', 'PLA-05', 'PLA-06', 'PLA-08', 'PLA-09', 'MODO'];
    const from = this.N.practica ? 5 : Math.max(0, ORDER.indexOf(this.N.paso));
    await this.seq(async (t) => {
      const c = this.plazaC(), h = BOLA.spawn.heading, f = new THREE.Vector3(Math.sin(h), 0, Math.cos(h)), r = new THREE.Vector3(f.z, 0, -f.x);
      const A = c.clone().addScaledVector(f, 3.2).addScaledVector(r, 1.4), B = c.clone().addScaledVector(f, -2.6).addScaledVector(r, -3.0), P = c.clone().addScaledVector(r, 2.6).addScaledVector(f, 0.6);
      const near = (p: THREE.Vector3, d: number) => Math.hypot(s.footPos.x - p.x, s.footPos.z - p.z) < d;
      const step = async (ids: string[]) => { if (!this.skipReq) await this.lines(ids, t, true); };
      const at = (k: number) => from <= k && !this.skipReq && t.alive;
      if (from === 0 && !this.N.paso) await step(['PLA-01', 'PLA-02']);
      if (at(0)) { this.setPaso('PLA-03'); this.markAt(A); await this.stepFocus(['PLA-03'], A, t);
        if (!this.skipReq) await this.exerciseUntil('PLA-03', 'Caminar hasta la marca', () => near(A, 0.9) && s.onFoot, t, A); this.clearMarks(); }
      if (at(1)) { this.setPaso('PLA-05'); await step(['PLA-05']);
        if (!this.skipReq) await this.exerciseUntil('PLA-05', 'Subir al skate', () => s.riding && s.loco !== 'mount', t); }
      if (at(2)) { this.setPaso('PLA-06'); if (!s.riding && !this.skipReq) { s.requestBoard?.({ rails: g.park.rails, now: g.sim.now }); await g.sim.wait(0.8, t); }   // retomado aquí sin tabla: se sube sola
        this.markAt(B); await this.stepFocus(['PLA-06'], B, t);
        if (!this.skipReq) await this.exerciseUntil('PLA-06', 'Impulsarse y girar', () => s.riding && near(B, 1.0), t, B); this.clearMarks(); }
      // V10.4 R13 (usuario): sin el paso de frenar (PLA-07)
      if (at(3)) { this.setPaso('PLA-08'); await step(['PLA-08']);
        if (!this.skipReq) await this.exerciseUntil('PLA-08', 'Bajar del skate', () => s.onFoot && s.loco === 'walk', t); }
      if (at(4)) { this.setPaso('PLA-09'); if (!this.skipReq) this.practice = this.spawnPractice(P);
        await this.stepFocus(['PLA-09'], P, t);
        if (!this.skipReq) {
          await this.exerciseUntil('PLA-09', 'Recoger la patata de práctica', () => { if (this.practice && near(this.practice.base, 0.9)) { this.collectPractice(); return true; } return false; }, t, P); } }
      // W-D24: la pregunta del modo ayuda, tras la patata de práctica y antes de PLA-10 (también si se salta el tutorial)
      const skipped = this.skipReq; this.tutoSaltado = skipped; this.skipReq = false; this.showSkip(false); this.clearMarks(); clearHint();
      this.showPark();   // V10.5 (O-11): el parque vuelve antes de la pregunta (se sube a la GPU con el 2D delante)
      this.setPaso('MODO');
      if (this.N.ayuda === null) await this.askHelp(false, t);
      if (!t.alive) return;
      if (!skipped) await this.lines(['PLA-10'], t);   // W-D23: al saltar, de la pregunta directo a la cinemática
      this.N.estado = 'tutorial-hecho'; this.N.paso = ''; this.save();
      await this.afterTutorial(t);
    });
    this.standUp(); this.removeShell(true); this.showSkip(false); this.clearMarks(); if (this.practice && !this.practice.collected) this.practice.group.removeFromParent();
  }
  /** Banco → cinemática del parque (saltable) → bienvenida (PAR) → guía a la primera patata (NMG) → «hecho». */
  private async afterTutorial(t: Token) {
    await this.sitForCine(t);
    await this.cin01(t);
    await this.lines(['PAR-01', 'PAR-02', 'PAR-03', 'PAR-04', 'PAR-05'], t); this.mark('PAR');
    this.standUp();
    await this.nmgGuide(t);
    if (t.alive) { this.N.estado = 'hecho'; this.save(); avisos.tutorial(this.tutoSaltado); }   // V10.6 (B5): el jugador queda libre
  }
  /** V10.5 (AM-31, E5-29): partida recargada con «tutorial-hecho»: se retoma desde la cinemática entera. Si ANMI está lejos de la plaza (punto
   *  guardado), se la deja junto al banco antes. */
  private async runResume() {
    const g = this.g, s = g.skater!;
    await this.seq(async (t) => {
      const B = this.benchForCine();
      if (B && Math.hypot(s.footPos.x - B.a.pos.x, s.footPos.z - B.a.pos.z) > 12) { const bd = new THREE.Vector3(Math.sin(B.a.heading), 0, Math.cos(B.a.heading)), p = B.a.pos.clone().addScaledVector(bd, 2.2);
        s.teleport(p.setY(B.a.pos.y), B.a.heading + Math.PI, 'walk'); g.rig.snapBehind(s); await g.sim.wait(0.3, t); }
      if (this.N.ayuda === null) await this.askHelp(false, t);
      if (!t.alive) return;
      await this.afterTutorial(t);
    });
    this.standUp();
  }
  /** V10.4 R12 (usuario: «cuando dicen que vaya a por una marca o a coger la patata, no hay enfoque de cámara en esas cosas») · V10.5 (regla de oro,
   *  AM-05, E5-08): primero la frase con la cámara quieta en ANMI; al pulsar Continuar, viaje al objetivo (1,1 s), plano limpio de 2 s (sin 2D),
   *  vuelta a ANMI (1 s) y se juega. La repetición a los 15 s sigue el mismo orden. */
  private async stepFocus(ids: string[], target: THREE.Vector3, t: Token) {
    if (this.skipReq) return;
    const foot = this.g.skater!.footPos, d = target.clone().sub(foot).setY(0); if (d.lengthSq() < 0.01) d.set(0, 0, 1); d.normalize();
    const side = new THREE.Vector3(d.z, 0, -d.x);
    const view = { pos: foot.clone().addScaledVector(d, -4.6).addScaledVector(side, 1.2).add(new THREE.Vector3(0, 3.4, 0)), look: foot.clone().lerp(target, 0.62).add(new THREE.Vector3(0, 0.3, 0)), hfov: 62 };
    await this.lines(ids, t, true); if (!t.alive || this.skipReq) return;
    await this.camTo(view, 1.1, t); if (!t.alive || this.skipReq) return;
    await this.cleanShot(t); if (!t.alive || this.skipReq) return;
    await this.camTo(this.behind(), 1.0, t);
  }
  // V10.4 R13 (usuario: «antes de enseñarte el parque… que te diga algo así como Siéntate y disfruta, y que te haga sentarte en el banco del medio
  // de la plaza y luego te enseñe la animación»): el banco de la plaza más alineado con su eje (el de enfrente del camino al parque); ANMI va
  // andando hasta él, se sienta (como en BenchSit) y se queda sentada durante la cinemática y la bienvenida
  private seatedCine = false; private benchView: { pos: THREE.Vector3; look: THREE.Vector3; hfov: number } | null = null;
  /** Plano de vuelta tras la cinemática: de frente al banco si está sentada; si no, detrás de ANMI. */
  private homeView() { return this.seatedCine && this.benchView ? this.benchView : this.behind(); }
  private benchForCine() {
    const c = this.plazaC(), out = new THREE.Vector2(c.x, c.z).normalize(); let best: { id: string; a: { pos: THREE.Vector3; heading: number } } | null = null, bd = -9;
    for (const [k, a] of this.g.manifest.anchors) { if (!k.startsWith('ext.bench.sit.')) continue; const dx = a.pos.x - c.x, dz = a.pos.z - c.z, r = Math.hypot(dx, dz);
      if (r > 10 || r < 1) continue; const d = (dx * out.x + dz * out.y) / r; if (d > bd) { bd = d; best = { id: k.slice('ext.bench.sit.'.length), a }; } }
    return best;
  }
  private async sitForCine(t: Token) {
    const g = this.g, s = g.skater!, P = PISTAS['HLP-PLAZA-CINE'];
    this.removeShell(true); this.clearMarks();
    if (P) { const r = await d2Say({ habla: P.habla as Quien, texto: P.texto, kat: P.habla === 'kat' ? P.pose : 'espera', kroak: P.habla === 'kroak' ? P.pose : 'espera' }, { token: t }); if (r < 0 || !t.alive) return; }
    const B = this.benchForCine(); if (!B || !t.alive) return;
    const z = g.park.zones.get(`act.benchSit.ext.${B.id}`), q = (z ? z.pos.clone() : B.a.pos.clone()).setY(s.footPos.y), from = s.footPos.clone();
    const bd = new THREE.Vector3(Math.sin(B.a.heading), 0, Math.cos(B.a.heading));
    // plano: de frente al banco, algo alto, con ANMI entrando en cuadro
    this.benchView = { pos: B.a.pos.clone().addScaledVector(bd, 5.2).add(new THREE.Vector3(0, 2.6, 0)), look: B.a.pos.clone().addScaledVector(bd, 0.6).add(new THREE.Vector3(0, 0.7, 0)), hfov: 60 };
    const cam = this.camTo(this.benchView, 1.4, t);
    const L = Math.hypot(q.x - from.x, q.z - from.z);
    if (L > 0.2) { s.heading = Math.atan2(q.x - from.x, q.z - from.z); s.prevHeading = s.heading; g.visual.play?.('SK_WalkBoard', { loop: true, fade: 0.25 });
      const dur = g.state.p.settings.reducedMotion ? 0 : L / 1.4, t0 = g.sim.now;
      while (t.alive && dur > 0) { const k = Math.min(1, (g.sim.now - t0) / dur); s.nudge(from.clone().lerp(q, k)); if (k >= 1) break; await g.sim.wait(1 / 60, t); }
      if (dur === 0) s.nudge(q); }
    if (!t.alive) return;
    g.faceSkater(B.a.pos.clone().addScaledVector(bd, 3)); g.visual.sitAt?.(B.a.pos, B.a.heading); g.visual.play?.('SK_SitBench', { loop: true, fade: 0.6 }); this.seatedCine = true;
    await cam; await g.sim.wait(1.2, t);
  }
  private standUp() { if (!this.seatedCine) return; this.seatedCine = false; this.g.visual.sitAt?.(null); this.g.visual.play?.('skate', { fade: 0.8 }); }
  private showSkip(on: boolean) { const b = $('btn-tuto-skip'); if (b) b.hidden = !on; }
  /** W-D23: «Saltar tutorial» (botón, T, Select del mando) → pregunta del modo ayuda → CIN-01. */
  skipTutorial() { if (!this.puedeSaltar) return; avisos.saltar('tutorial'); this.skipReq = true; d2Close(); this.exercise = null; clearHint(); }
  private spawnPractice(p: THREE.Vector3) {
    const g = this.g, model = g.fryModel; if (!model) return null;
    const k = new FryPickup('practica', p, 0.55, model); g.scene.add(k.group); return k;
  }
  private collectPractice() {
    const p = this.practice; if (!p || p.collected) return; p.collected = true; p.group.removeFromParent();
    this.g.bursts.emit(p.base, '#F4BD48', 18, 3.4); this.g.audio.sfx('pickup', 0); toast(TEXTOS.practica, 2200);
    this.N.practica = true; this.save();   // fuera de collected / total / audio (dossier 04 §5.2)
  }
  private removeShell(fade: boolean) {
    const m = this.shell; if (!m) return; this.shell = null; document.body.classList.remove('tutorial'); this.showPark();
    const mat = m.material as THREE.MeshBasicMaterial;
    if (!fade || this.g.state.p.settings.reducedMotion) { m.removeFromParent(); mat.dispose(); m.geometry.dispose(); return; }
    let k = 1; const step = () => { k -= 1 / 50; mat.opacity = Math.max(0, k); if (k > 0) requestAnimationFrame(step); else { m.removeFromParent(); mat.dispose(); m.geometry.dispose(); } }; step();
  }

  // ------------------------------------------------------------------ pregunta del modo ayuda (W-D02, W-D24, W-D36)
  private async askHelp(vieja: boolean, tk?: Token) {
    const t = tk ?? this.token!; if (!t?.alive) return;
    const ids = vieja ? ['HLP-MODO-vuelta-1', 'HLP-MODO-vuelta-2'] : ['HLP-MODO-1', 'HLP-MODO-2', 'HLP-MODO-3'];
    for (let i = 0; i < ids.length; i++) { const P = PISTAS[ids[i]], last = i === ids.length - 1;
      const r = await d2Say({ habla: P.habla as Quien, texto: P.texto, kat: P.habla === 'kat' ? P.pose : 'espera', kroak: P.habla === 'kroak' ? P.pose : 'espera' }, { token: t, choices: last ? [TEXTOS.modoSi, TEXTOS.modoNo] : undefined });
      if (r < 0 || !t.alive) return;
      if (last) { this.N.ayuda = r === 0 ? 'si' : 'no'; this.save(); const A = PISTAS[r === 0 ? 'HLP-MODO-si' : 'HLP-MODO-no'];
        await d2Say({ habla: A.habla as Quien, texto: A.texto, kat: A.habla === 'kat' ? A.pose : 'espera', kroak: A.habla === 'kroak' ? A.pose : 'espera' }, { token: t }); } }
  }

  // ------------------------------------------------------------------ CIN-01 · el parque sin diálogo (dossier 04 §6.2; W-D35, W-D37)
  // V10.4 R12–R13 (usuario, 20 oct): ~39 s con NO ME GUILLO del 0:00 al 0:39 con fundido (corte propio, `audio/nmg-cine-v104.m4a`); con bandas de cine hasta antes
  // de volver: despegue desde la plaza, vuelo «de pájaro» por encima de los cinco escenarios uno a uno (avanzando y visto desde arriba), frontal
  // de Bellakat gigante en su esquina, de Bellakroak, del muro de BELLAKACIONES, el parque entero desde arriba (vista alta desde el lado de la
  // plaza, donde estás) y la vuelta a ANMI, que se ve llegar. Sin la música del parque ni el ambiente mientras suena el corte.
  cineAudio = false;
  private async cin01(t: Token) {
    const g = this.g; this.skipReq = false;
    const sk = $('btn-cine-skip'); if (sk) sk.hidden = false; document.body.classList.add('cine'); this.inCine = true;
    this.removeShell(true); this.musicProbe = null;
    this.cineAudio = true; void g.audio.music?.playFinal(new URL('./audio/nmg-cine-v104.m4a', document.baseURI).href);
    const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
    const P = (r: number, th: number, y: number) => V(r * Math.sin(th * Math.PI / 180), y, -r * Math.cos(th * Math.PI / 180));
    // figuras y letras: su sitio real en la escena (si no han cargado, el medido en V10.4)
    const fig = (name: string, cx: number, cz: number, top: number) => { const o = g.scene.getObjectByName(name); if (!o) return { c: V(cx, 0, cz), top };
      const b = new THREE.Box3().setFromObject(o); return { c: V((b.min.x + b.max.x) / 2, 0, (b.min.z + b.max.z) / 2), top: b.max.y }; };
    const front = (c: THREE.Vector3, top: number, dist: number, k = 0.55) => { const n = c.clone().setY(0).negate().normalize();
      return { pos: c.clone().addScaledVector(n, dist).setY(top * k), look: c.clone().setY(top * 0.55), hfov: 58 }; };
    const fen = fig('BG-FEN', -56.1, -56.1, 25.1), ran = fig('BG-RAN', 56.1, 56.1, 20), let_ = fig('BOLA_LETRAS', -42.6, 42.5, 9.1);
    // R13 (usuario): ~39 s; vuelo más lento y SIEMPRE en el mismo sentido: empieza en NVDA (333°) y pasa por NMG, FG, TT y YY; sin parar sigue
    // girando (más deprisa) y se abre hasta el frontal de Bellakat, que queda justo después (esquina de 315° + 360°); antes acababa en NVDA y daba
    // media vuelta hacia atrás para ir a ella
    const TH0 = 325, TH1 = 628;
    const bird = (k: number) => { const th = TH0 + (TH1 - TH0) * k, w = Math.sin(k * Math.PI * 5);
      return { pos: P(27 + 2.0 * w, th, 24 + 1.8 * Math.sin(k * Math.PI * 9)), look: P(33, th + 30, 0), hfov: 68 }; };
    const fenA = front(fen.c, fen.top, 40, 0.5), fenB = front(fen.c, fen.top, 35, 0.5);
    const polarOf = (v: THREE.Vector3) => ({ r: Math.hypot(v.x, v.z), th: Math.atan2(v.x, -v.z) * 180 / Math.PI });
    const toFen = (k: number) => { const e = k * k * (3 - 2 * k), A = bird(1), a = polarOf(A.pos), b = polarOf(fenA.pos);
      let thB = b.th; while (thB < TH1) thB += 360; while (thB - TH1 > 360) thB -= 360;
      // R13 (usuario: «no debe ser igual de rápida que el pájaro… mucho más rápida»): sale a la velocidad del vuelo y acelera (Hermite)
      const m0 = ((TH1 - TH0) / 16) * 1.1 / Math.max(1, thB - TH1), hk = (k * k * k - 2 * k * k + k) * m0 + (3 * k * k - 2 * k * k * k);
      const th = TH1 + (thB - TH1) * hk, r = a.r + (b.r - a.r) * e, y = A.pos.y + (fenA.pos.y - A.pos.y) * e;
      return { pos: P(r, th, y), look: A.look.clone().lerp(fenA.look, e), hfov: A.hfov + (fenA.hfov - A.hfov) * e }; };
    const shots: (() => Promise<void>)[] = [
      () => this.camTo(bird(0), 2.0, t),                                                                         // despegue desde la plaza
      () => this.camPath(bird, 16, t),                                                                           // los cinco escenarios
      async () => { await this.camPath(toFen, 1.1, t); await this.camLine(fenA, fenB, 3.3, t); },               // sigue girando, rápido, hasta Bellakat
      async () => { const a = front(ran.c, ran.top, 40, 0.5), b = front(ran.c, ran.top, 35, 0.5); await this.camTo(a, 1.8, t); await this.camLine(a, b, 2.4, t); },   // Bellakroak
      async () => { const a = { ...front(let_.c, 11, 28, 0.62), hfov: 66 }, b = { ...front(let_.c, 11, 21, 0.62), hfov: 64 }; await this.camTo(a, 1.6, t); await this.camLine(a, b, 4.2, t); },   // BELLAKACIONES
      async () => { const pl = this.plazaC(), d = pl.clone().setY(0).normalize(), a = { pos: d.clone().multiplyScalar(78).setY(60), look: V(0, 0, 0), hfov: 52 }, b = { ...a, pos: d.clone().multiplyScalar(71).setY(54) };
        await this.camTo(a, 1.6, t); await this.camLine(a, b, 3.0, t); },                                       // el parque entero desde tu lado
    ];
    for (const sh of shots) { if (!t.alive || this.skipReq) break; await sh(); }
    const skipped = this.skipReq;
    document.body.classList.remove('cine'); if (sk) sk.hidden = true;
    g.audio.music?.stopFinal(skipped ? 0.4 : 2.4); this.cineAudio = false;   // el corte se funde (ya lo hace solo de 37,5 a 39,5 s) y entra el ambiente
    this.skipReq = false;
    if (t.alive && !skipped) await this.camTo(this.homeView(), 2.4, t);                                          // vuelta a ANMI (se ve llegar)
    this.inCine = false; this.musicProbe = null; this.skipReq = false; this.mark('CIN-01');
    g.rig.toScripted(() => this.pose, true); const B = this.homeView(); this.pose.pos.copy(B.pos); this.pose.look.copy(B.look); this.pose.hfov = B.hfov;
  }
  /** Recorrido de cámara por una función k ∈ [0, 1] → pose (vuelo de la cinemática); con «reducir movimiento», 5 planos fijos. */
  private async camPath(f: (k: number) => { pos: THREE.Vector3; look: THREE.Vector3; hfov?: number }, sec: number, t: Token) {
    const g = this.g; g.rig.toScripted(() => this.pose, true);
    const set = (k: number) => { const q = f(k); this.pose.pos.copy(q.pos); this.pose.look.copy(q.look); this.pose.hfov = q.hfov ?? 60; };
    if (g.state.p.settings.reducedMotion) { for (let i = 0; i < 5 && t.alive && !this.skipReq; i++) { set((i + 0.5) / 5); await g.sim.wait(sec / 5, t); } return; }
    const t0 = g.sim.now;
    while (t.alive && !this.skipReq) { const k = Math.min(1, (g.sim.now - t0) / sec); set(k); if (k >= 1) break; await g.sim.wait(1 / 60, t); }
  }
  /** Travelling recto y suave entre dos poses (acercamiento lento en los planos fijos). */
  private camLine(A: { pos: THREE.Vector3; look: THREE.Vector3; hfov?: number }, B: { pos: THREE.Vector3; look: THREE.Vector3; hfov?: number }, sec: number, t: Token) {
    const e = (x: number) => x * x * (3 - 2 * x);
    return this.camPath((k) => ({ pos: A.pos.clone().lerp(B.pos, e(k)), look: A.look.clone().lerp(B.look, e(k)), hfov: (A.hfov ?? 60) + ((B.hfov ?? 60) - (A.hfov ?? 60)) * e(k) }), sec, t);
  }
  /** SALTAR de la cinemática (Esc / B / toque, W-D35): misma tecla que la escena final. */
  skipCine() { if (this.busy) { if (this.inCine) avisos.saltar('cinematica'); this.skipReq = true; } }   // V10.6 (B5)

  // ------------------------------------------------------------------ NMG-01/02: camino a la primera patata (dossier 04 §6.3)
  private async nmgGuide(t: Token) {
    const g = this.g, st = g.state;
    await this.lines(['NMG-01'], t); if (!t.alive) return;
    const f = g.park.manifest.fries.find((x) => x.id === 'no_me_guillo.visible' && !st.isCollected(x.id)) ?? g.park.manifest.fries.find((x) => x.zone === 'no_me_guillo' && x.kind !== 'activity' && !st.isCollected(x.id));
    // V10.5 (regla de oro, E5-09; pendiente 7 de V10.4): viaje con el arco más alto (rozaba 0,3 s la copa de una palmera) → plano limpio de 2 s → NMG-02
    if (f) { const p = f.pos.clone(), s = g.skater!.footPos, d = p.clone().sub(s).setY(0).normalize();
      await this.camTo({ pos: p.clone().addScaledVector(d, -5.5).add(new THREE.Vector3(0, 3.6, 0)), look: p.clone().add(new THREE.Vector3(0, 0.6, 0)), hfov: 55 }, 3.0, t, 1.7); if (!t.alive) return;
      await this.cleanShot(t); if (!t.alive) return; }
    await this.lines(['NMG-02'], t); this.mark('NMG');
    if (t.alive) await this.camTo(this.behind(), 2.0, t);
  }

  // ------------------------------------------------------------------ recogidas: OBJ, desbloqueos, PAS y FIN
  /** Tras una recogida aceptada (Game.collect). */
  onCollect(id: string) {
    if (this.off) return;
    const g = this.g, st = g.state, zone = id.split('.')[0] as ZoneId, kind = id.split('.')[1];
    if (st.total === TOTAL_FRIES) { this.queue = this.queue.filter((q) => !q.startsWith('PAS')); for (const q of (this.N.pend ?? []).filter((x) => x.startsWith('PAS:'))) this.pendSet(q, false); if (!this.seen('FIN')) this.enqueue('FIN'); return; }
    if (zone === 'no_me_guillo' && kind !== 'activity' && !this.seen('OBJ') && this.N.estado !== 'antigua') this.enqueue('OBJ');
    // 3/3 de exploración → aviso de actividad disponible (sin charla 2D: dossier 02)
    if (kind !== 'activity' && this.explo(zone) === 3 && !st.p.activities[SECTOR_BY_ID[zone].activity]) toast(DESBLOQUEO[zone], 3600);
    if (st.zoneCount(zone) === 4) this.reconcile(zone);
  }
  explo(z: ZoneId) { return EXPLO.filter((k) => this.g.state.isCollected(`${z}.${k}`)).length; }
  /** Bloqueo de 3 (dossier 04 §8, W-D36): actividad completada → se repite siempre; si no, hacen falta sus 3 patatas de exploración. */
  activityOpen(z: ZoneId) { if (this.off) return true; return this.g.state.p.activities[SECTOR_BY_ID[z].activity] || this.explo(z) >= 3; }
  lockNote(z: ZoneId) { const n = 3 - this.explo(z); return n === 1 ? TEXTOS.bloqueo1 : TEXTOS.bloqueoN.replace('{n}', String(n)); }
  /** Siguiente zona del recorrido sin terminar (cursor de la guía). */
  nextZone(): ZoneId | null { return RUTA.find((z) => this.g.state.zoneCount(z) < 4) ?? null; }
  /** Al cerrar una zona: la transición solo si encaja con el orden (origen inmediatamente anterior al destino pendiente); si no, se omite. */
  reconcile(closed?: ZoneId) {
    if (this.off || !closed) return;
    const nz = this.nextZone(); if (!nz) return;
    const i = RUTA.indexOf(closed), j = RUTA.indexOf(nz), blk = PAS[nz];
    if (blk && j === i + 1 && !this.seen(blk[0])) this.enqueue(`PAS:${nz}`);
  }
  private async pas(to: ZoneId, t: Token) {
    // V10.5 (regla de oro, AM-06, E5-09): frase A → viaje → plano limpio de 2 s → frase B con el plano quieto detrás → vuelta
    const [a, b] = PAS[to];
    await this.lines([a], t); if (!t.alive) return;
    await this.camTo(this.axo(to), 2.2, t); if (!t.alive) return;
    await this.cleanShot(t); if (!t.alive) return;
    await this.lines([b], t);
    if (t.alive) await this.camTo(this.behind(), 1.8, t);
  }
  private async fin(t: Token) {
    const g = this.g;
    // V10.6 (H8-02): retomada tras recargar con la revelación ya vista: no se repiten sus dos frases, se sigue en el plano del reto
    if (!(g.state.p.revealSeen && this.seen('FIN-01') && this.seen('FIN-02'))) { await this.lines(['FIN-01', 'FIN-02'], t); if (!t.alive) return; }
    if (!g.state.p.revealSeen) await g.runReveal(t);   // la revelación de siempre (una sola), dentro de la secuencia
    if (!t.alive) return;
    const L = g.park.manifest.ladders.find((l) => l.id === 'sn'), w = (x: number, y: number, z: number) => snW(new THREE.Vector3(x, y, z));
    // FIN-03 en plano fijo del reto: de lado y alto, se ven A (muro), B (rampa) y D (recepción)
    await this.camTo({ pos: w(-16, 9, 1), look: w(0, 2.5, -2), hfov: 62 }, 1.4, t); if (!t.alive) return;
    await this.cleanShot(t); if (!t.alive) return;   // V10.5 (regla de oro, E5-09): plano limpio del reto antes de FIN-03
    await this.lines(['FIN-03'], t); if (!t.alive) return;
    // SN-GUIDE-01: escaleras → ascenso → rampa desde lejos → vista axonométrica (sin diálogo)
    if (L) { const foot = L.axis.clone().setY(L.bottom ?? 0), top = L.topPos.clone(), back = new THREE.Vector3(-Math.sin(L.heading), 0, -Math.cos(L.heading));   // de frente a la escalera
      await this.camTo({ pos: foot.clone().addScaledVector(back, 5).add(new THREE.Vector3(0, 2.0, 0)), look: foot.clone().add(new THREE.Vector3(0, 1.4, 0)), hfov: 55 }, 1.3, t);   // el pie
      await g.sim.wait(1.0, t);
      await this.camTo({ pos: top.clone().addScaledVector(back, 5).add(new THREE.Vector3(0, 1.2, 0)), look: top.clone().add(new THREE.Vector3(0, 0.8, 0)), hfov: 55 }, 1.8, t); }   // subida junto a ella
    await this.camTo({ pos: w(-14, 7, 9), look: w(0, 3, -6), hfov: 62 }, 1.8, t);   // la rampa desde lejos, con la parte alta
    await this.camTo({ pos: w(14, 24, 16), look: w(0, 1, -2), hfov: 60 }, 1.4, t); if (!t.alive) return;   // vista alta oblicua: coronación, bajada, despegue y recepción
    await this.cleanShot(t); if (!t.alive) return;   // V10.5: plano limpio antes de FIN-04
    await this.lines(['FIN-04'], t); this.mark('FIN');
    if (t.alive) await this.camTo(this.behind(), 1.8, t);
  }
  /** La escena final terminó de verdad (fin natural o SALTAR), no por una cancelación técnica (dossier 04 §10). R18 (usuario: «hay que separar
   *  animación de diálogo… primero una cosa y luego otra»): la despedida espera 3 s tras volver a ANMI. */
  onFinaleEnd(natural: boolean) { if (this.off || !natural || this.seen('DES')) return; this.pendSet('DES', true); this.g.sim.after(3, () => this.enqueue('DES')); }   // V10.6 (H8-03): pendiente desde ya
}
