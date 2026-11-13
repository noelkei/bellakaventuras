// Actividades V3. Completar un reto (persistente) y recoger su patata (objeto físico) son estados distintos; repetir una
// actividad ganada no crea otro premio. Ninguna bloquea el paso a otros sectores ni exige orden.
// Contrato común (BASE-03): cada sesión crea un Token; `end()` es idempotente y repone modo, cámara, tabla, ducking,
// listeners e input. Todos los tiempos (charla, celebración, reintentos) van en el reloj de SIMULACIÓN: la pausa no
// consume nada y un callback de una sesión cancelada nunca toca la siguiente.
// Las actividades de charla/grafiti/baile se ofrecen A PIE dentro de su recuadro discontinuo; el tutorial y el puente
// se juegan patinando.
import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import { orient } from './orient';
import type { Game } from './game';
import type { InputFrame, Dir } from './input';
import { inZone, inOBox } from './world/park';
import type { LadderDef, ZoneId } from './world/manifest';
import { ZONE_OF_ACTIVITY } from './world/manifest';
import { TT_KIT, ttFrame } from './world/tt';
import type { BridgeNpc } from './state';
import { $, say, toast, hint, setTask, openModal, closeModal, onTap } from './ui';
import { angleDiff, TUNING, standAreaOk } from './skater';
import { ASSET_BASE, tex } from './assets';
import { Token } from './sim';
import { SPRAY, zigzag, strokeK, type SprayJob } from './spray';
import { decodeMask, encodeMask, GRAFFITI_GRID } from './state';
import { YY_KIT } from './world/yy';
import { rg1, NV_KIT } from './world/nvda';
import { SN_KIT, snW, snL, snH } from './world/sn';
import { TUNING as TUN } from './tuning';
import * as avisos from './avisos';   // V10.6 (B5): métricas sin identificadores

export interface Activity {
  id: string; busy?: boolean;
  init?(): void;
  update(dt: number): void;           // paso fijo (lógica)
  preStep?(f: InputFrame): boolean;   // antes del controlador; true = consume el SALTO de este paso
  present?(dt: number): void;         // presentación
  onDir?(d: Dir): void;
  cancel?(): void;
  debugComplete?(): void;
}

const camAt = (g: Game, anchor: string, target: THREE.Vector3, hfov = 58) => g.rig.toFixed({ pos: g.manifest.get(anchor).pos, target, hfov });

/** Sesión de actividad con token y limpieza idempotente. */
abstract class Session implements Activity {
  abstract id: string;
  busy = false;
  token: Token | null = null;
  constructor(public g: Game) {}
  abstract update(dt: number): void;
  protected begin(label: string, mode: 'activity' | 'explore' = 'activity') {
    // R11 (F2: COD-01/02, FG-01/02, TT-01, NMG-01/02, ANIM-06): el baile libre se termina ANTES de que la sesión ponga su clip, su tabla
    // y sus NPC (antes se cortaba un paso después y deshacía la puesta en escena: dos tablas, chicas quietas, La Pantera sentada…)
    const fd = this.g.activities.find((a) => a.id === 'freeDance') as FreeDance | undefined;
    if (fd && fd.dancing >= 0) fd.stop(this.id);
    this.g.input.releaseMoveLatch();   // R11 (F4): una actividad nueva no hereda el bloqueo de dirección de la anterior
    if (fd?.menu) fd.toggleMenu(false);
    this.token?.cancel();
    const t = new Token(label); this.token = t; this.busy = true;
    const g = this.g;
    if (mode === 'activity') g.setMode('activity');
    t.onCancel(() => {
      this.busy = false;
      if (g.skater) g.skater.frozen = false;
      g.audio.duck(false);
      if (g.mode === 'activity') { g.setMode('explore'); g.rig.toFollow(g.skater!); }
    });
    return t;
  }
  end() { const t = this.token; this.token = null; t?.cancel(); }
  cancel() { this.end(); }
  /** Acción a pie dentro del recuadro. R5 (usuario, IG-005): yendo en skate el botón se VE pero deshabilitado, con el aviso
   *  «Bájate del skate para empezar»; al bajarse dentro del recuadro se habilita (antes, pulsarlo montado bajaba de la tabla). */
  protected offerOnFoot(zoneId: string, label: string, fn: () => void) {
    const g = this.g, s = g.skater!;
    const z = g.park.zones.get(zoneId)!;
    if (!inZone(z, s.footPos)) { g.withdrawAction(this.id); return; }
    // V10.4 (dossier 04 §8, W-D01, W-D36): las cinco actividades de zona necesitan sus 3 patatas de exploración (las completadas se repiten
    // siempre); el botón se ve, deshabilitado, con cuántas faltan. No afecta a bancos, escaleras ni skills
    { const zone = (ZONE_OF_ACTIVITY as Record<string, ZoneId | undefined>)[this.id];
      if (zone && g.narr && !g.narr.activityOpen(zone)) { if (s.onFoot && s.grounded) g.offerAction(label, () => {}, this.id, { off: true, note: g.narr.lockNote(zone) }); else g.withdrawAction(this.id); return; } }
    if (s.onFoot) { if (s.grounded) g.offerAction(label, fn, this.id); else g.withdrawAction(this.id); return; }
    if (s.riding) g.offerAction(label, () => {}, this.id, { off: true, note: g.input.source === 'touch' ? 'Bájate del skate (botón BAJAR) para empezar' : g.input.source === 'gamepad' ? 'Bájate del skate (LB) para empezar' : 'Bájate del skate (Q) para empezar' });
    else g.withdrawAction(this.id);
  }
}

// ================================================================== V10.2 · charlas: separarse y plano de charla
/** V10.2 Q01 (D2-01, usuario: «separarse un poco de Bellakat y Bellakroak al hablar para no estar pegado»): antes de una charla ANMI se
 *  aparta a ~1,4 m del NPC (1,4 / 1,55 / 1,3 m y girando hasta ±126° desde la dirección NPC→ANMI; si ya está a 1,25–1,65 m, no se mueve),
 *  solo donde cabe (`fitsFoot`, `headroomFree`), hay suelo a su misma altura alrededor del pie (en el puente de NVDA nunca queda en el aire) y
 *  el camino está libre (no atraviesa una barandilla). Si no hay sitio, se queda donde está. Se desliza 0,3 s; con «reducir movimiento», al
 *  instante. Devuelve dónde queda el pie (para encuadrar ya con la posición final). */
export function standOff(g: Game, npcPos: THREE.Vector3, token: Token | null = null) {
  const s = g.skater!, foot = s.footPos.clone(), d0 = Math.hypot(foot.x - npcPos.x, foot.z - npcPos.z);
  const face = (p: THREE.Vector3) => { s.heading = Math.atan2(npcPos.x - p.x, npcPos.z - p.z); s.prevHeading = s.heading; };
  if (d0 >= 1.25 && d0 <= 1.65) { face(foot); return foot; }
  const W = g.world, F = RAPIER.QueryFilterFlags.EXCLUDE_SENSORS, notNpc = (c: RAPIER.Collider) => !g.npcColliders.has(c.handle);
  const ground = foot.y - TUNING.kccOffset, base = d0 > 0.05 ? Math.atan2(foot.x - npcPos.x, foot.z - npcPos.z) : s.heading + Math.PI;
  const floorY = (x: number, z: number) => { const h = W?.castRay(new RAPIER.Ray({ x, y: ground + 0.5, z }, { x: 0, y: -1, z: 0 }), 1.0, true, F, undefined, s.collider, undefined, notNpc); return h ? ground + 0.5 - h.timeOfImpact : null; };
  const pathFree = (q: THREE.Vector3) => { const dx = q.x - foot.x, dz = q.z - foot.z, L = Math.hypot(dx, dz); if (L < 1e-3 || !W) return true;
    for (const hy of [0.35, 1.1]) { const h = W.castRay(new RAPIER.Ray({ x: foot.x, y: ground + hy, z: foot.z }, { x: dx / L, y: 0, z: dz / L }), L + 0.3, true, F, undefined, s.collider, undefined, notNpc); if (h) return false; }
    return true; };
  for (const d of [1.4, 1.55, 1.3]) for (const da of [0, 0.5, -0.5, 1, -1, 1.5, -1.5, 2.2, -2.2]) {
    const a = base + da, q = new THREE.Vector3(npcPos.x + Math.sin(a) * d, foot.y, npcPos.z + Math.cos(a) * d), y = floorY(q.x, q.z);
    if (y === null || Math.abs(y - ground) > 0.06 || !s.fitsFoot(q) || !s.headroomFree(q) || !W || !standAreaOk(W, new THREE.Vector3(q.x, ground, q.z), s.collider) || !pathFree(q)) continue;
    face(q);
    if (g.state.p.settings.reducedMotion) s.nudge(q);
    else for (let i = 1; i <= 18; i++) { const k = i / 18, e = k * k * (3 - 2 * k); g.sim.after(i / 60, () => s.nudge(foot.clone().lerp(q, e)), token); }
    g.log.push(`charla: ANMI se aparta a ${d} m`);
    return q;
  }
  face(foot); return foot;
}
/** V10.2 Q03 + R-03 (usuario: «que al hablar con ellos haya un posicionamiento de cámara para que se les vea bien hablando con nosotros»,
 *  como con Juseph y Aissa): el plano de TRA TRA TRA para TODAS las charlas: cámara detrás de ANMI y a un lado (1,1 m atrás, 1,55 m al lado),
 *  mirando la cara del NPC de frente; `fit` = cuerpo del NPC + cabeza de ANMI (en vertical se aleja por su eje). Prueba el lado preferido, el
 *  otro y luego más cerca, y se queda con el primero sin muros entre la cámara y las dos caras. R-03b: con «reducir movimiento», corte. */
export function talkCam(g: Game, npc: THREE.Object3D | null, opts: { foot?: THREE.Vector3; at?: THREE.Vector3; h?: number; side?: THREE.Vector3; hfov?: number } = {}) {
  const s = g.skater!, foot = (opts.foot ?? s.footPos).clone(), np = opts.at?.clone() ?? npc?.getWorldPosition(new THREE.Vector3()) ?? foot.clone();
  const bx = npc ? new THREE.Box3().setFromObject(npc) : new THREE.Box3(), h = opts.h ?? (bx.isEmpty() ? 1.7 : THREE.MathUtils.clamp(bx.max.y - np.y, 0.8, 2.1));
  const u = new THREE.Vector3(foot.x - np.x, 0, foot.z - np.z); if (u.lengthSq() < 1e-6) u.set(Math.sin(s.heading + Math.PI), 0, Math.cos(s.heading + Math.PI)); u.normalize();
  const sd0 = new THREE.Vector3(-u.z, 0, u.x); if (opts.side && sd0.dot(opts.side) < 0) sd0.negate();
  const up = (v: THREE.Vector3, y: number) => v.clone().add(new THREE.Vector3(0, y, 0)), head = up(np, 0.9 * h), aHead = up(foot, 1.6), camUp = 1.15 + 0.35 * h;
  const W = g.world, F = RAPIER.QueryFilterFlags.EXCLUDE_SENSORS;
  const free = (a: THREE.Vector3, b: THREE.Vector3) => { const d = b.clone().sub(a), L = d.length(); if (!W || L < 1e-3) return true; d.divideScalar(L);
    const hit = W.castRay(new RAPIER.Ray({ x: a.x, y: a.y, z: a.z }, { x: d.x, y: d.y, z: d.z }), L, true, F, undefined, s.collider, undefined, (c) => !g.npcColliders.has(c.handle)); return !hit || hit.timeOfImpact > L - 0.2; };
  let pos: THREE.Vector3 | null = null, sd = sd0;
  // un NPC más bajo (Bellakroak, Bellakat) se encuadra más de cerca en proporción a su altura; en vertical, la cámara más cerca del eje
  // ANMI→NPC (de lado no caben los dos sin alejarse mucho)
  const ks = THREE.MathUtils.clamp(h / 1.75, 0.75, 1), lat = g.rig.cam.aspect < 1 ? 0.5 : 1.3;
  busca: for (const k of [1, 0.75, 0.5]) for (const side of [sd0, sd0.clone().negate()]) {
    const p = up(foot, camUp).addScaledVector(u, 1.1 * k * ks).addScaledVector(side, lat * k * ks);
    // libre también si el encuadre (`fit`) la aleja hasta 1,5 m más por su eje (en vertical se aleja: la torre de YY tapaba a la rana)
    const back = p.clone().add(p.clone().sub(head).setY(0).normalize().multiplyScalar(1.5));
    if (free(p, head) && free(aHead, p) && free(back, head)) { pos = p; sd = side; break busca; } }
  if (!pos) pos = up(foot, camUp).addScaledVector(u, 1.1 * ks).addScaledVector(sd0, lat * ks);
  const box = [-1, 1].flatMap((a) => [-1, 1].flatMap((b) => [-0.15, h + 0.15].map((y) => np.clone().add(new THREE.Vector3(a * 0.35, y, b * 0.35)))));
  // (medido con una rejilla de cámaras en el juego, R3: el margen del recuadro de diálogo —`insetAware`— alejaba el plano y dejaba al NPC
  // pequeño; como en TT, sin él: la cara del NPC queda debajo del diálogo igualmente, lo comprueba `charlas`)
  g.rig.toFixed({ pos, target: up(np, 0.68 * h).lerp(up(foot, 1.45), 0.05), hfov: opts.hfov ?? 54, fit: [...box, up(foot, 1.85), ...[-1, 1].map((k) => up(foot, 1.6).addScaledVector(sd, 0.2 * k))] }, g.state.p.settings.reducedMotion);   // cabeza de ANMI entera
}

// ================================================================== NO ME GUILLO — La Pantera
/** R2-G8 (usuario, 12 oct): La Pantera alterna frases. Charlas impares (1.ª, 3.ª…): «Fuuuuck...» (la 1.ª da la patata);
 *  pares: estas dos, alternándose. Mientras habla no suenan ni la canción ni su sonido ambiente. */
export const PANTERA_LINES = ['Échate un novio samsung pa que yo no te lo note...', 'A mí también me sigue un shinigami...'];
export class PantherTalk extends Session {
  id = 'pantherTalk'; talks = 0;
  update() {
    const g = this.g; if (g.mode !== 'explore' || this.busy) return;
    this.offerOnFoot('act.pantherTalk', 'HABLAR', () => this.talk());
  }
  async talk() {
    const g = this.g; if (this.busy) return;
    const t = this.begin('pantera');
    avisos.actividad('pantherTalk', 'empieza', g.state.p.activities.pantherTalk);   // V10.6 (B5)
    const pan = g.npcs.get('la_pantera')?.[0];
    const npcPos = g.manifest.get('npc.la_pantera').pos;
    g.skater!.vel.set(0, 0, 0); g.skater!.frozen = true;
    // V10.2 Q01 + Q03: ANMI a ~1,4 m del sitio donde La Pantera se pone de pie (0,45 m delante del asiento; sustituye a `clearOfPantera`
    // aquí) y plano de charla como en TT (antes, ancla fija `cam.pantera`, que según desde dónde llegara ANMI la dejaba de lado)
    const stand = pan ? pan.root.position.clone().add(new THREE.Vector3(Math.sin(pan.yaw) * 0.45, 0, Math.cos(pan.yaw) * 0.45)) : npcPos;
    const q = standOff(g, stand, t);
    g.audio.duck(true); g.audio.music?.setDuck(0);   // R2-G8: sin canción mientras habla (el fin de la sesión la devuelve)
    // R7 (usuario, 12 oct): se LEVANTA y habla de pie (Talk, ambas manos) mientras dura la frase, mirando a ANMI; la frase no
    // desaparece sola: queda hasta pulsar «Vale»; al cerrar vuelve a sentarse
    if (pan && pan.standLoop('Talk', 0.45, 0.35, true)) pan.faceTo(q);
    else pan?.gesture(pan.seated && pan.actions.has('SitTalk') ? 'SitTalk' : 'Talk', 0.25, 1.0);
    t.onCancel(() => { if (pan?.standing) pan.sitBack(); else pan?.backToIdle(); });
    talkCam(g, null, { at: stand, h: 1.75, foot: q });   // de pie en `stand` (sentada, su caja aún mide la postura sentada)
    g.audio.sfx('talk');
    this.talks++;
    const line = this.talks % 2 === 1 ? 'Fuuuuck...' : PANTERA_LINES[(this.talks / 2 - 1) % PANTERA_LINES.length];
    g.log.push(`pantera charla ${this.talks}: ${line}`);
    await say('La Pantera', line, { token: t }); // frases exactas; sin cierre automático (R7)
    if (!t.alive) return;
    if (g.state.complete('pantherTalk')) g.revealReward('no_me_guillo');
    this.end();
  }
  debugComplete() { if (this.g.state.complete('pantherTalk')) this.g.revealReward('no_me_guillo'); }
}

// ================================================================== NO ME GUILLO — sentarse en el banco
/** V5 (usuario, 12 oct): cerca del banco de NO ME GUILLO aparece SENTARSE (botón en táctil, E/Y con teclado o mando);
 *  sentada, el mismo botón dice LEVANTARSE. Solo este banco por ahora. Sin premio ni cambio de modo: la cámara sigue. */
export class BenchSit extends Session {
  id = 'benchSit'; seated = false;
  update() {
    const g = this.g, s = g.skater!;
    if ((g as any).narr?.busy) { g.withdrawAction(this.id); return; }   // V10.4 R13: con la narrativa al mando (sentada antes de la cinemática) no se ofrece
    if (g.mode !== 'explore') return;
    if (this.seated) {
      if (!s.onFoot) { this.end(); return; }
      g.offerAction('LEVANTARSE', () => this.end(), this.id); return;
    }
    // R4 usuario: también los dos bancos de YINYANG (zona `act.benchSit.yyN` → ancla `yy.bench.sit.N`)
    // V10.1 P23: todos los bancos: NMG, YY (2), NVDA y los 16 del exterior (zonas y anclas generadas de sus colisiones)
    if (!this.spots) this.spots = [['act.benchSit', 'nmg.bench.sit'], ...[...g.park.zones.keys()].filter((k) => k.startsWith('act.benchSit.')).map((k) => [k,
      k.startsWith('act.benchSit.yy') ? `yy.bench.sit.${k.slice('act.benchSit.yy'.length)}` : k === 'act.benchSit.nv' ? 'nv.bench.sit' : `ext.bench.sit.${k.slice('act.benchSit.ext.'.length)}`] as [string, string]).filter(([, a]) => g.manifest.anchors.has(a))];
    const hit = this.spots.find(([z]) => { const zz = g.park.zones.get(z); return !!zz && inZone(zz, g.skater!.footPos); }) ?? this.spots[0];
    this.spotNow = hit[1];
    this.offerOnFoot(hit[0], 'SENTARSE', () => this.sit());
  }
  private spots: [string, string][] | null = null; spotNow = 'nmg.bench.sit';
  sit() {
    const g = this.g, s = g.skater!; if (!s.onFoot || this.seated) return;
    const a = g.manifest.get(this.spotNow);
    const t = this.begin('banco', 'explore');
    s.vel.set(0, 0, 0); s.frozen = true;
    g.faceSkater(a.pos.clone().add(new THREE.Vector3(Math.sin(a.heading), 0, Math.cos(a.heading)).multiplyScalar(3)));
    g.visual.sitAt?.(a.pos, a.heading); g.visual.play?.('SK_SitBench', { loop: true, fade: 0.6 });   // V10.5 (M2): fundidos más largos
    this.seated = true; g.withdrawAction(this.id);
    t.onCancel(() => { this.seated = false; g.visual.sitAt?.(null); g.visual.play?.('skate', { fade: 0.8 }); g.withdrawAction(this.id); });
  }
}

// ================================================================== FASHION GIRL — escalera vertical del deck (V6, D6-03)
/** ACCIÓN al pie (o arriba, en el hueco de la barandilla) para agarrarse; arriba/abajo suben y bajan; sin entrada se queda
 *  agarrada (clip congelado en su fase). El CONTROLADOR mueve la cápsula congelada por la curva de subida del propio clip
 *  (`anmi.clips.json → SK_LadderClimb.rise`): manos y pies no resbalan respecto a los peldaños y el clip no suma otra subida.
 *  Bajar = el mismo ciclo hacia atrás; el último tramo hasta el suelo es SK_LadderDown (climbing_down_wall) con su curva.
 *  Salida superior y entrada desde arriba: transiciones cortas con trayectoria de la raíz (sin teletransporte). La tabla va a
 *  la espalda mientras trepa. Pausa: el reloj de simulación congela todo; al soltar la escalera se restituyen controles. */
export class LadderClimb extends Session {
  id = 'ladderClimb';
  phase: 'off' | 'grab' | 'climb' | 'down' | 'topout' | 'topin' | 'release' = 'off';
  u = 0;               // ciclos de subida desde el suelo (0 = pies en el suelo)
  td = 0;              // tiempo en SK_LadderDown (0 = arriba del tramo final)
  private inY = 0; private t = 0; private from = new THREE.Vector3(); private fromH = 0;
  /** Registro (pruebas): fase, u, altura del pie. */
  trace: { t: number; ph: string; u: number; y: number; id?: string }[] = [];
  static RATE = 1.0;   // ciclos/s (el donante es un ciclo de 0,75 s: «rápido»; aquí 0,43 m/s)
  private meta(n: string) { return ((this.g.visual as any).meta?.[n] ?? null) as any; }
  private rise(u: number) {
    const m = this.meta('SK_LadderClimb'), R: number[] = m?.rise ?? [0, 0.43], per = m?.rise_per_cycle ?? 0.43;
    const k = Math.floor(u), f = u - k, x = f * (R.length - 1), i = Math.min(R.length - 2, Math.floor(x));
    return k * per + R[i] + (R[i + 1] - R[i]) * (x - i);
  }
  private drop(td: number) {
    const m = this.meta('SK_LadderDown'), D: number[] = m?.drop ?? [0.56, 0], T = m?.seconds ?? 1.17;
    const x = THREE.MathUtils.clamp(td / T, 0, 1) * (D.length - 1), i = Math.min(D.length - 2, Math.floor(x));
    return D[i] + (D[i + 1] - D[i]) * (x - i);
  }
  /** V7: escalera en uso (manifest.ladders). Todas las alturas son base + recorrido: la base puede ser un camino elevado
   *  (EV1 de TRA TRA TRA, +1,20) o la recepción (EV2, +5,60); la de FASHION GIRL es la instancia `fg` con base 0. */
  L: LadderDef | null = null;
  private get fgLadder() { return this.g.manifest.ladders.find((l) => l.id === 'fg') ?? this.g.manifest.ladders[0]; }
  private get lad() { return this.L ?? this.fgLadder; }
  private get axis() { const l = this.lad; return { pos: l.axis, heading: l.heading }; }
  private get base() { return this.lad.bottom; }
  private get deckH() { return this.lad.top; }
  /** Pie de ANMI agarrada a la escalera a `y` m SOBRE LA BASE (0,40 m delante del plano de los peldaños, mirando a la pared). */
  private onLadder(y: number) { const a = this.axis, h = a.heading; return new THREE.Vector3(a.pos.x - Math.sin(h) * 0.4, this.base + y, a.pos.z - Math.cos(h) * 0.4); }
  private uTop() { const per = this.meta('SK_LadderClimb')?.rise_per_cycle ?? 0.43; return (this.deckH - this.base - 0.12) / per; }   // pies en el último peldaño
  private uDown() { const top = this.drop(0), per = this.meta('SK_LadderClimb')?.rise_per_cycle ?? 0.43; return top / per; }
  preStep(f: InputFrame) { this.inY = this.busy ? f.move.y : 0; return this.busy && f.jumpPressed; }
  private grips = new Map<string, { axis: THREE.Vector3; heading: number; width: number; rungs: number[] }>();
  /** Escalera en uso para el agarre de manos: eje del plano de peldaños, rumbo, ancho y alturas absolutas de los peldaños. */
  private gripCtx() {
    const l = this.lad; let c = this.grips.get(l.id);
    if (!c) { const step = l.rung ?? 0.22, rungs: number[] = []; for (let y = l.bottom + step; y < l.top - 0.02; y += step) rungs.push(y);
      c = { axis: l.axis.clone(), heading: l.heading, width: l.width ?? 0.6, rungs }; this.grips.set(l.id, c); }
    return c;
  }
  update(dt: number) {
    const g = this.g, s = g.skater!;
    if (!this.busy) {
      (g.visual as any)?.setLadderGrip?.(null);   // R6: fuera de la escalera, el agarre se funde a 0
      if (g.mode !== 'explore') return;
      // una escalera por oferta: la primera en cuya zona (arriba o al pie) está ANMI; ninguna se apropia de la sesión de otra
      for (const l of g.manifest.ladders) {
        const top = g.park.zones.get(l.topZone), foot = g.park.zones.get(l.footZone);
        if (top && inZone(top, s.footPos)) { this.offerOnFoot(l.topZone, 'BAJAR ESCALERA', () => this.startTop(l)); return; }
        if (foot && inZone(foot, s.footPos)) { this.offerOnFoot(l.footZone, 'TREPAR', () => this.startFoot(l)); return; }
      }
      g.withdrawAction(this.id);
      return;
    }
    this.t += dt;
    const a = this.axis, H = a.heading, V = g.visual;
    const dir = this.inY > 0.3 ? 1 : this.inY < -0.3 ? -1 : 0;
    // R6 (usuario): las manos agarran los peldaños de ESTA escalera (ancho y peldaños reales) mientras sube o baja por ella
    (V as any)?.setLadderGrip?.(this.phase === 'climb' || this.phase === 'down' ? this.gripCtx() : null);
    if (this.phase === 'grab') {   // del suelo a la escalera (0,35 s): la raíz se acerca, el cuerpo entra en la pose de fase 0
      const k = Math.min(1, this.t / 0.35), e = k * k * (3 - 2 * k);
      s.placeKinematic(this.from.clone().lerp(this.onLadder(this.rise(0)), e), this.fromH + angleDiff(H, this.fromH) * e);
      if (k >= 1) { this.phase = 'climb'; this.t = 0; }
    } else if (this.phase === 'climb') {
      this.u = Math.max(0, this.u + dir * (this.lad.rate ?? LadderClimb.RATE) * dt);   // V10.1 P20
      if (dir < 0 && this.u <= this.uDown()) {   // tramo final: entra en SK_LadderDown a la altura ACTUAL (sin salto)
        const y = this.rise(this.u), T = this.meta('SK_LadderDown')?.seconds ?? 1.17; let td = 0;   // alturas sobre la base
        for (let k = 0; k <= 80; k++) { const x = T * k / 80; if (this.drop(x) <= y) { td = x; break; } }
        this.phase = 'down'; this.td = td; V.play?.('SK_LadderDown', { loop: false, fade: 0.22, timeScale: 0 }); V.drive?.('SK_LadderDown', td);
      }
      // R6 (usuario): en cuanto una mano se iría por encima del último peldaño (agarraría aire), SALTA a la plataforma
      else if (dir > 0 && (this.handsPastTop() || this.u >= this.uTop())) { this.phase = 'topout'; this.t = 0; this.from.copy(s.footPos); this.from.y -= TUNING.kccOffset; V.play?.('SK_HopBoard', { loop: false, fade: 0.12, timeScale: 0 }); }
      s.placeKinematic(this.onLadder(this.rise(this.u)), H);
      V.drive?.('SK_LadderClimb', (this.u % 1) * (this.meta('SK_LadderClimb')?.seconds ?? 0.75));
    } else if (this.phase === 'down') {
      const T = this.meta('SK_LadderDown')?.seconds ?? 1.17;
      this.td = THREE.MathUtils.clamp(this.td - dir * dt, 0, T);
      s.placeKinematic(this.onLadder(this.drop(this.td)), H);
      V.drive?.('SK_LadderDown', this.td);
      if (dir > 0 && this.td <= 0) { this.phase = 'climb'; this.u = this.uDown() + 1e-3; V.play?.('SK_LadderClimb', { loop: true, fade: 0.22, timeScale: 0 }); }
      else if (this.td >= T - 1e-3) { this.phase = 'release'; this.t = 0; this.from.copy(s.footPos); V.play?.('skate', { fade: 0.35 }); }
    } else if (this.phase === 'topout') {   // R6: salto del último tramo a la plataforma (impulso, parábola sobre los asideros, recepción)
      const D = 0.85, k = Math.min(1, this.t / D), top = this.lad.topPos;
      const e = THREE.MathUtils.clamp((k - 0.15) / 0.6, 0, 1), arc = (this.deckH - this.from.y) / 2 + 0.45;
      const p = this.from.clone().lerp(top, e * e * (3 - 2 * e)); p.y = THREE.MathUtils.lerp(this.from.y, this.deckH, e) + arc * 4 * e * (1 - e);
      s.placeKinematic(p, H);
      this.hop(k < 0.15 ? ['prep', 'push', k / 0.15] : k < 0.75 ? (e < 0.5 ? ['push', 'apex', e / 0.5] : ['apex', 'contact', (e - 0.5) / 0.5]) : ['contact', 'end', (k - 0.75) / 0.25]);
      if (k >= 1) this.finish();
    } else if (this.phase === 'topin') {    // R6: desde la plataforma, de espaldas al vacío, salto atrás y queda agarrada al último peldaño
      const D = 1.05, k = Math.min(1, this.t / D), tgt = this.onLadder(this.rise(this.u));
      const turn = Math.min(1, k / 0.28), e = THREE.MathUtils.clamp((k - 0.42) / 0.42, 0, 1), arc = Math.max(0, this.from.y - tgt.y) / 2 + 0.25;
      const p = this.from.clone().lerp(tgt, e * e * (3 - 2 * e)); p.y = THREE.MathUtils.lerp(this.from.y, tgt.y, e) + arc * 4 * e * (1 - e);
      s.placeKinematic(p, this.fromH + angleDiff(H, this.fromH) * turn);
      if (k < 0.84) this.hop(k < 0.28 ? ['prep', 'prep', 0] : k < 0.42 ? ['prep', 'push', (k - 0.28) / 0.14] : e < 0.5 ? ['push', 'apex', e / 0.5] : ['apex', 'contact', (e - 0.5) / 0.5]);
      else { if (k - dt / D < 0.84) V.play?.('SK_LadderClimb', { loop: true, fade: 0.14, timeScale: 0 }); V.drive?.('SK_LadderClimb', (this.u % 1) * (this.meta('SK_LadderClimb')?.seconds ?? 0.75)); }
      if (k >= 1) { this.phase = 'climb'; this.t = 0; }
    } else if (this.phase === 'release') {  // pie en el suelo: un paso atrás, de vuelta al árbol de marcha
      const k = Math.min(1, this.t / 0.3), p = this.from.clone(); p.y = this.base;   // V7: el pie queda en la BASE de esta escalera (no en 0)
      p.x -= Math.sin(H) * 0.15 * k; p.z -= Math.cos(H) * 0.15 * k;
      s.placeKinematic(p, H);
      if (k >= 1) this.finish();
    }
    this.trace.push({ t: +g.sim.now.toFixed(3), ph: this.phase, u: +this.u.toFixed(3), y: +s.footPos.y.toFixed(3), id: this.lad.id }); if (this.trace.length > 2000) this.trace.shift();
  }
  private enter() {
    const g = this.g, s = g.skater!;
    const t = this.begin('escalera', 'explore');
    // R11 (MIX-01): las manos del clip de la subida ANTERIOR no cuentan (antes la 2.ª subida con ↑ pulsada saltaba al último tramo)
    const V = g.visual as any; if (V?.clipHandY) V.clipHandY = { Left: -1e9, Right: -1e9 };
    s.vel.set(0, 0, 0); s.frozen = true; this.t = 0; this.trace = [];
    this.from.copy(s.footPos); this.from.y -= TUNING.kccOffset; this.fromH = s.heading;
    g.visual.setBackBoard?.(true); g.withdrawAction(this.id);
    t.onCancel(() => {
      this.phase = 'off'; this.L = null; g.visual.setBackBoard?.(false);
      if (g.skater) { g.skater.frozen = false; g.skater.forceWalk(); }
      g.visual.play?.('skate', { fade: 0.3 });
    });
  }
  startFoot(l: LadderDef = this.fgLadder) {
    const g = this.g; if (this.busy || !g.skater!.onFoot) return;
    this.enter(); this.L = l; this.phase = 'grab'; this.u = 0;
    g.visual.play?.('SK_LadderClimb', { loop: true, fade: 0.3, timeScale: 0 }); g.visual.drive?.('SK_LadderClimb', 0);
    if (this.g.state.hintOnce('fg-ladder')) hint(matchMedia('(pointer: coarse)').matches ? 'Joystick <b>arriba</b> sube, <b>abajo</b> baja' : '<b>W</b> sube · <b>S</b> baja · suelta para quedarte agarrada', 3600);
  }
  startTop(l: LadderDef = this.fgLadder) {
    const g = this.g; if (this.busy || !g.skater!.onFoot) return;
    this.enter(); this.L = l; this.phase = 'topin';
    // R6: aterriza con las manos en el último peldaño (muñeca ≈ 1,25 m sobre los pies en el agarre del clip)
    const rungs = this.gripCtx().rungs, y0 = Math.max(0.2, (rungs[rungs.length - 1] ?? this.deckH) - 1.25 - this.base);
    let u = 0; while (u < this.uTop() && this.rise(u) < y0) u += 0.01; this.u = Math.min(u, this.uTop());
    g.visual.play?.('SK_HopBoard', { loop: false, fade: 0.15, timeScale: 0 });
  }
  /** ¿Alguna mano del clip pasaría ya por encima del último peldaño? (agarraría aire: toca saltar a la plataforma) */
  private handsPastTop() {
    const hy = (this.g.visual as any)?.clipHandY as { Left: number; Right: number } | undefined; if (!hy) return false;
    const rungs = this.gripCtx().rungs; return Math.max(hy.Left, hy.Right) > (rungs[rungs.length - 1] ?? this.deckH) + 0.1;
  }
  /** Pose del salto de ANMI (SK_HopBoard, conducido por sus fases): [fase inicial, fase final, avance 0–1]. */
  private hop([a, b, f]: [string, string, number]) {
    const P = this.meta('SK_HopBoard')?.phases, T = this.meta('SK_HopBoard')?.seconds ?? 0.867; if (!P) return;
    const x = P[a] + (P[b] - P[a]) * THREE.MathUtils.clamp(f, 0, 1); this.g.visual.drive?.('SK_HopBoard', x * T * 0.999);
  }
  /** Fin normal (arriba en el deck o abajo en el suelo): ANMI de pie y libre. */
  private finish() {
    const g = this.g, s = g.skater!;
    const p = s.footPos.clone(); p.y -= TUNING.kccOffset;
    this.end();
    s.teleport(p, s.heading, 'walk');   // reinicia el estado de marcha en el sitio exacto (sin salto: misma posición)
    g.rig.toFollow(s);
    g.input.holdMoveUntilNeutral();     // R11 (F4): la dirección con la que se subía/bajaba no la saca andando del techo/deck/camino
  }
}

/** R11 (NMG-17): La Pantera se levanta 0,45 m hacia delante; si ANMI está a < 1 m de ese sitio, se aparta hacia atrás (solo si cabe):
 *  antes las manos de La Pantera le atravesaban el cuerpo. No se toca la raíz de La Pantera (pantera-npc). */
function clearOfPantera(g: Game, pan: { root: THREE.Object3D; yaw: number }) {
  const s = g.skater; if (!s) return;
  const st = pan.root.position.clone().add(new THREE.Vector3(Math.sin(pan.yaw) * 0.45, 0, Math.cos(pan.yaw) * 0.45));
  const dx = s.footPos.x - st.x, dz = s.footPos.z - st.z, d = Math.hypot(dx, dz);
  if (d >= 1.0) return;
  const ux = d > 1e-3 ? dx / d : Math.sin(pan.yaw), uz = d > 1e-3 ? dz / d : Math.cos(pan.yaw);
  const to = new THREE.Vector3(st.x + ux * 1.0, s.footPos.y, st.z + uz * 1.0);
  if (s.fitsFoot(to) && s.headroomFree(to)) { s.nudge(to); g.log.push('ANMI apartada de La Pantera'); }
}

// ================================================================== bailes libres (R2-G8)
/** V10.1 P09 (D10): los 4 bailes de SKILLS (los más distintos de los 8 de ANMI), en el orden de los botones 1–4. */
export const FREE_DANCES = ['Breakdance_1990', 'Hip_Hop_Dance_1', 'FunnyDancing_03', 'Step_Hip_Hop_Dance'];
/** V10.1 P09 (D11): los 4 grafitis del usuario (Imaginario ANMI/04_Frame_2147238616/PNG 01–04) con el tratamiento de espray (receta
 *  assets/derived/v10_1/arte/skills_grafitis), con su proporción ancho/alto. */
export const SKILL_GRAFFITI = [{ tex: 'G_skill_01_rana', a: 0.6855 }, { tex: 'G_skill_02_ai', a: 1.0354 }, { tex: 'G_skill_03_mano_gato', a: 0.8809 }, { tex: 'G_skill_04_bellakaciones', a: 2.3011 }];
/** V10.2 R-07b: puntos del dibujo (fracciones de ancho y alto) que tienen que caer sobre la misma superficie: centro, contorno cada 25 % y esquinas. */
const FLAT_PTS: [number, number][] = [[0, 0], [-0.25, 0], [0.25, 0], [0, -0.25], [0, 0.25], ...[-0.5, -0.25, 0, 0.25, 0.5].flatMap((a) => [[a, -0.5], [a, 0.5]] as [number, number][]), [-0.5, -0.25], [-0.5, 0], [-0.5, 0.25], [0.5, -0.25], [0.5, 0], [0.5, 0.25]];
/** R2-G8 (usuario, 12 oct): botón BAILAR que despliega a su alrededor 8 botones (1–8); con teclado, B abre el abanico y 1–8
 *  bailan directamente. Solo a pie, en el suelo y explorando (no sentada ni en otra actividad). El baile se repite hasta que
 *  ANMI se mueve, salta (el salto se consume), sube a la tabla o se vuelve a pulsar su número / BAILAR. La tabla se deja en el
 *  suelo a su lado mientras baila. */
export class FreeDance implements Activity {
  id = 'freeDance'; dancing = -1; menu = false; panDancing = false; fgDancing = false;
  /** V10.1 P09: nivel del abanico de SKILLS y grafiti en curso (2,4 s de espray). */
  level: 'root' | 'dance' | 'graffiti' = 'root';
  painting: { i: number; t: number; mesh: THREE.Mesh; mat: THREE.MeshStandardMaterial; entry: import('./state').SkillGraffiti; sprayT: number; job: SprayJob; mask: HTMLCanvasElement; maskTex: THREE.CanvasTexture; lastK: number } | null = null;
  decals: THREE.Mesh[] = []; private gMats: THREE.MeshStandardMaterial[] = []; paints = 0; denies: string[] = []; private signBoxes: THREE.Box3[] | null = null; private artBoxes: THREE.Box3[] | null = null; private chosenAt = -9;
  private fgRest() { this.fgDancing = false; (this.g.npcs.get('bella') ?? []).forEach((girl, k) => girl.setLoop('Sway', 0.4, 0.92 + k * 0.07)); }
  private prop: THREE.Object3D | null = null;
  private btn = document.getElementById('btn-dance') as HTMLButtonElement | null;
  private ring = document.getElementById('dance-ring');
  constructor(public g: Game) {
    // R11 (SIS-27): BAILAR y el abanico responden también a un 2.º dedo
    if (this.btn) onTap(this.btn, (e) => { e.stopPropagation(); this.btn!.blur(); if (this.dancing >= 0) this.stop(); else this.toggleMenu(); });
    this.ring?.querySelectorAll<HTMLButtonElement>('.dance-opt').forEach((b) => onTap(b, (e) => { e.stopPropagation(); b.blur(); this.request(+b.dataset.n!); }));
    this.ring?.querySelectorAll<HTMLButtonElement>('.skill-root').forEach((b) => onTap(b, (e) => { e.stopPropagation(); b.blur(); this.toggleMenu(true, b.dataset.l as 'dance' | 'graffiti'); }));
    this.ring?.querySelectorAll<HTMLButtonElement>('.graf-opt').forEach((b) => onTap(b, (e) => { e.stopPropagation(); b.blur(); this.paint(+b.dataset.g! - 1); }));
  }
  private available() {
    const g = this.g, s = g.skater;
    return g.mode === 'explore' && !g.paused && !!s && s.onFoot && s.grounded && !s.frozen && s.loco !== 'bail' && s.loco !== 'impact' && !g.activities.some((a) => a !== this && a.busy) && !this.painting
      && !s.isCrouched && this.roomToDance();   // R11 (FG-04): ni agachada ni bajo techo bajo (el baile atravesaba muros y techos)
  }
  /** R11 (FG-04): 2,3 m libres sobre el pie en el centro y a ±0,45 m (alcance de los brazos). R13: solo cuenta un TECHO de verdad
   *  (cara que mira hacia abajo, por encima de la rodilla); los rayos salen a 0,5 m del pie para no chocar con el escalón, la rampa o
   *  la pared de al lado (antes bloqueaba junto a la U, el escenario, el rack, el quarter de NMG o la piscina). Usa Rapier importado:
   *  el atajo de pruebas `__bkRapier` solo existe con ?bktest y en el juego publicado la comprobación no hacía nada. */
  private roomToDance() {
    const g = this.g, s = g.skater!, W = g.world; if (!W) return true;
    const flags = RAPIER.QueryFilterFlags.EXCLUDE_SENSORS | RAPIER.QueryFilterFlags.EXCLUDE_KINEMATIC, h = s.heading, cx = Math.cos(h), sx = Math.sin(h);
    for (const [dx, dz] of [[0, 0], [0.45 * cx, -0.45 * sx], [-0.45 * cx, 0.45 * sx], [0.45 * sx, 0.45 * cx], [-0.45 * sx, -0.45 * cx]]) {
      const o = { x: s.footPos.x + dx, y: s.footPos.y + 0.5, z: s.footPos.z + dz };
      const hit = W.castRayAndGetNormal(new RAPIER.Ray(o, { x: 0, y: 1, z: 0 }), 1.8, true, flags, undefined, s.collider);
      if (hit && hit.timeOfImpact > 0.02 && hit.normal.y < -0.5) return false;   // dentro de un sólido (toi 0) no es techo
    }
    return true;
  }
  update(dt = 0) {
    const ok = this.dancing >= 0 || this.available();
    if (this.btn) { if (this.btn.hidden !== !ok) this.btn.hidden = !ok; this.btn.classList.toggle('on', this.dancing >= 0 || this.menu); }   // V10.5 (O-03): solo si cambia
    if (!ok && this.menu) this.toggleMenu(false);
    if (this.dancing >= 0 && (this.g.mode !== 'explore' || !this.g.skater?.onFoot || this.g.skater?.frozen)) this.stop();
    this.g.input.menuCapture = this.menu;   // V10.1 P09
    if (this.painting) this.stepPaint(dt);
  }
  init() { for (const q of this.g.state.p.skillGraffiti ?? []) this.addDecal(q, 1, this.wornMat(q)); }   // V10.1 P09: los grafitis guardados vuelven al cargar (V10.3: con su desgaste)
  /** V10.1 P09: con el mando, la cruceta elige en el abanico (← BAILAR / → GRAFITEAR; luego ↑ → ↓ ← = 1–4). */
  onDir(d: Dir) {
    if (!this.menu || this.g.paused) return;
    if (this.level === 'root') { this.toggleMenu(true, d === 'left' || d === 'up' ? 'dance' : 'graffiti'); return; }
    const n = ({ up: 1, right: 2, down: 3, left: 4 } as Record<Dir, number>)[d];
    if (this.level === 'dance') this.request(n); else this.paint(n - 1);
  }
  private denyT = -1e9;
  private denyWhy() {
    const g = this.g, s = g.skater; if (!s || g.mode !== 'explore' || g.paused || g.activities.some((a) => a !== this && a.busy)) return null;
    if (!s.onFoot) return 'Bájate de la tabla para bailar';
    if (s.grounded && !s.frozen && (s.isCrouched || !this.roomToDance())) return 'Aquí no hay sitio para bailar';
    return null;
  }
  preStep(f: InputFrame) {
    // R11 (SIS-21, FG-04): pedir un baile donde no se puede explica por qué (antes no pasaba nada)
    if ((f.danceMenu || f.danceSlot) && this.dancing < 0 && !this.available()) {
      const why = this.denyWhy(); if (why && performance.now() - this.denyT > 1500) { this.denyT = performance.now(); toast(why, 1400); }
    }
    if (f.danceMenu) { if (this.dancing >= 0) this.stop(); else if (this.menu && this.level !== 'root') this.toggleMenu(true, 'root'); else this.toggleMenu(); }
    // V10.1 P09: teclado. Abanico abierto: 1 = BAILAR / 2 = GRAFITEAR y luego 1–4; cerrado: 1–4 bailan y 5–8 grafitean directamente
    if (f.danceSlot) { const n = f.danceSlot;
      if (this.menu && this.level === 'root') { if (n <= 2) this.toggleMenu(true, n === 1 ? 'dance' : 'graffiti'); }
      else if (this.menu && this.level === 'graffiti') { if (n <= 4) this.paint(n - 1); }
      else if (n <= 4) this.request(n); else this.paint(n - 5); }
    // V10.1 P09: 0,35 s de gracia al empezar (la cruceta del mando con la que se eligió sigue pulsada un instante)
    const grace = this.g.clock - this.chosenAt < 0.35, moving = !grace && Math.hypot(f.move.x, f.move.y) > 0.25;
    if (this.dancing >= 0 && (moving || f.boardToggle || f.jumpPressed)) { this.stop(); return f.jumpPressed; }
    if (this.painting && (moving || f.boardToggle || f.jumpPressed)) { this.cancelPaint('mover'); return f.jumpPressed; }
    return false;
  }
  toggleMenu(open = !this.menu, level: 'root' | 'dance' | 'graffiti' = 'root') {
    if (open && !this.available() && !(this.dancing >= 0 && level === 'dance')) return;
    this.menu = open; this.level = open ? level : 'root'; if (!this.ring || !this.btn) return;
    this.btn.setAttribute('aria-expanded', String(open));
    const sel = this.level === 'root' ? '.skill-root' : this.level === 'dance' ? '.dance-opt' : '.graf-opt';
    const opts = [...this.ring.querySelectorAll<HTMLElement>(sel)], N = opts.length;
    this.ring.querySelectorAll<HTMLElement>('button').forEach((b) => b.classList.toggle('lvl', opts.includes(b)));
    if (open) {   // abanico alrededor del botón (coordenadas LÓGICAS del contenedor: válidas también con la rotación CSS de orient.ts),
      // desplazado lo justo para caber en pantalla. V10.1 P09: 2 (raíz) o 4 opciones, con el tamaño de botón elegido (P05)
      const k = this.g.state.p.settings.btnScale ?? 1, par = this.ring.parentElement!, W = par.clientWidth, H = par.clientHeight, R = (N <= 2 ? 64 : 80) * Math.max(0.8, Math.min(1.5, k)), m = 34;
      // V10.1 P05: centro del botón TAL COMO SE VE (con su tamaño y desplazamiento de «Tamaño de los botones»), en coordenadas lógicas
      const bq = this.btn.getBoundingClientRect(), bc = orient.toLogical(bq.left + bq.width / 2, bq.top + bq.height / 2), pq = par.getBoundingClientRect(), pc = orient.toLogical(pq.left, pq.top);
      const cx0 = Math.min(Math.max(bc.x - pc.x, R + m), W - R - m);
      const cy0 = Math.min(Math.max(bc.y - pc.y, R + m), H - R - m);
      // R11 (SIS-08): el abanico no se monta sobre TABLA, EXTRA, SALTO… (tocar TABLA elegía el baile 3): de los centros candidatos
      // (el del botón y desplazados hacia arriba/los lados) se elige el primero cuyos 8 botones no pisan ningún otro botón visible
      const pr = par.getBoundingClientRect(), sx = pr.width / Math.max(1, W), sy = pr.height / Math.max(1, H);
      const others = [...document.querySelectorAll<HTMLElement>('#touch button, #prompt button')].filter((e) => !e.closest('#dance-ring') && !e.closest('[hidden]') && e.offsetParent !== null)   // R5: también el propio SKILLS (un abanico desplazado lo tapaba)
        .map((e) => { const r = e.getBoundingClientRect(); return { x: (r.left - pr.left) / sx, y: (r.top - pr.top) / sy, w: r.width / sx, h: r.height / sy }; });
      const ang = (i: number) => (N <= 2 ? -Math.PI / 2 + (i ? 1 : -1) * Math.PI / 4 : -Math.PI / 2 + i * Math.PI * 2 / N);   // raíz: arriba-izquierda y arriba-derecha
      const half = (this.level === 'dance' ? 23 : 29) + 6;   // R5 (QA B6): mitad real del botón del abanico + margen (antes ±30 fijos)
      const hitsAt = (cx: number, cy: number) => { let n = 0; for (let i = 0; i < N; i++) { const a = ang(i), x = cx + Math.cos(a) * R, y = cy + Math.sin(a) * R;
        for (const o of others) if (x + half > o.x && x - half < o.x + o.w && y + half > o.y && y - half < o.y + o.h) n++; } return n; };
      let best = { cx: cx0, cy: cy0, n: hitsAt(cx0, cy0) };
      for (const dy of [0, -40, -80, -120, -160, -200, -240]) for (const dx of [0, -50, 50, -100, 100, -150, -200]) { if (best.n === 0) break;
        const cx = Math.min(Math.max(cx0 + dx, R + m), W - R - m), cy = Math.min(Math.max(cy0 + dy, R + m), H - R - m), n = hitsAt(cx, cy);
        if (n < best.n) best = { cx, cy, n }; }
      const { cx, cy } = best;
      opts.forEach((b, i) => {
        b.dataset.pad = N <= 2 ? ['←', '→'][i] : ['↑', '→', '↓', '←'][i];   // R5 (QA C11): se ve con mando (P10, `body.pad`)
        b.dataset.key = String(i + 1);   // V10.2 Q11: y su número con teclado (raíz 1 = BAILAR, 2 = GRAFITEAR; dentro 1–4)
        const a = ang(i);   // 1 arriba y en sentido horario (raíz: BAILAR a la izquierda, GRAFITEAR arriba)
        b.style.left = `${cx + Math.cos(a) * R}px`; b.style.top = `${cy + Math.sin(a) * R}px`;
      });
      this.ring.hidden = false; requestAnimationFrame(() => this.ring!.classList.add('open'));
    } else { this.ring.classList.remove('open'); this.ring.hidden = true; }
    this.g.input.menuCapture = this.menu;
  }
  // ---------------------------------------------------------------- V10.1 P09 · grafitear
  private gMat(i: number) {
    if (!this.gMats[i]) { const t = tex(`tex/${SKILL_GRAFFITI[i].tex}.webp`); t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping; t.anisotropy = 8;
      this.gMats[i] = new THREE.MeshStandardMaterial({ map: t, transparent: true, alphaTest: 0.03, depthWrite: false, roughness: 0.92, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 }); this.gMats[i].name = `M_skill_${i + 1}`; }
    return this.gMats[i];
  }
  /** V10.3 (U-13, usuario: «opacidad y desgaste algo distintos al azar cada vez que se pinta»): copia del material del dibujo con opacidad
   *  0,80–0,97 y desconchones (máscara de ruido con su propio desplazamiento y escala y un corte de 0,03–0,25). Sale de un hash de la
   *  posición guardada: el mismo grafiti se ve igual al recargar sin guardar campos nuevos (el saneado de state.ts los borraría). */
  private wearTex: THREE.Texture | null = null;
  private wornMat(q: import('./state').SkillGraffiti) {
    if (!this.wearTex) {
      const S = 128, c = document.createElement('canvas'); c.width = c.height = S; const x = c.getContext('2d')!, im = x.createImageData(S, S);
      const h = (i: number, j: number) => { const v = Math.sin(((i % S + S) % S) * 127.1 + ((j % S + S) % S) * 311.7) * 43758.5453; return v - Math.floor(v); };
      const vn = (u: number, v: number, f: number) => { const X = u * f, Y = v * f, i = Math.floor(X), j = Math.floor(Y), a = X - i, b = Y - j, sa = a * a * (3 - 2 * a), sb = b * b * (3 - 2 * b), F = (k: number) => ((k % f) + f) % f;
        return (h(F(i), F(j)) * (1 - sa) + h(F(i + 1), F(j)) * sa) * (1 - sb) + (h(F(i), F(j + 1)) * (1 - sa) + h(F(i + 1), F(j + 1)) * sa) * sb; };
      for (let j = 0; j < S; j++) for (let i = 0; i < S; i++) { const u = i / S, v = j / S, n = 0.55 * vn(u, v, 6) + 0.3 * vn(u, v, 14) + 0.15 * vn(u, v, 32), w = Math.max(0, Math.min(1, (n - 0.22) * 2.6)), o = (j * S + i) * 4;
        im.data[o] = im.data[o + 1] = im.data[o + 2] = Math.round(w * 255); im.data[o + 3] = 255; }
      x.putImageData(im, 0, 0); this.wearTex = new THREE.CanvasTexture(c); this.wearTex.wrapS = this.wearTex.wrapT = THREE.RepeatWrapping;
    }
    let hsh = 2166136261; for (const v of q.p) { hsh ^= Math.round(v * 1000) + 0x9e3779b9; hsh = Math.imul(hsh, 16777619) >>> 0; }
    const r = (k: number) => { const v = Math.sin(hsh * 0.0001 + k * 12.9898) * 43758.5453; return v - Math.floor(v); };
    const m = this.gMat(q.i).clone(), am = this.wearTex.clone(); am.needsUpdate = true;
    am.offset.set(r(1), r(2)); const sc = 0.7 + 0.8 * r(3); am.repeat.set(sc, sc);
    m.alphaMap = am; m.opacity = 0.8 + 0.17 * r(4); m.alphaTest = 0.03 + 0.22 * r(5); m.userData.worn = { opacity: m.opacity, cut: m.alphaTest }; m.needsUpdate = true;
    return m;
  }
  /** Malla del grafiti: plano de s m de ALTO (ancho por su proporción) en p, mirando a n, con «arriba» u. */
  private addDecal(q: import('./state').SkillGraffiti, opacity: number, mat?: THREE.MeshStandardMaterial) {
    const A = SKILL_GRAFFITI[q.i].a, h = q.s, w = h * A, m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat ?? this.gMat(q.i));
    const n = new THREE.Vector3(...q.n).normalize(), u = new THREE.Vector3(...q.u).normalize(), r = new THREE.Vector3().crossVectors(u, n).normalize(), u2 = new THREE.Vector3().crossVectors(n, r);
    m.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(r, u2, n)); m.position.set(...q.p); m.renderOrder = 2; m.receiveShadow = true; m.name = `SKILL_GRAFFITI_${q.i + 1}`;
    if (opacity < 1) (m.material as THREE.MeshStandardMaterial).opacity = opacity;
    this.g.scene.add(m); this.decals.push(m); while (this.decals.length > 12) { const o = this.decals.shift()!; o.removeFromParent(); o.geometry.dispose(); const om = o.material as THREE.MeshStandardMaterial; if (om.userData.worn) { om.alphaMap?.dispose(); om.dispose(); } }
    return m;
  }
  /** Sitio para pintar: pared lisa delante (≤ 2,2 m, a la altura del pecho) o, si no, el suelo delante. Nunca sobre personajes, coches,
   *  carteles, letras ni el radiocasete. Devuelve centro, normal, «arriba» y alto del dibujo, o el motivo si no se puede. */
  findSpot(i: number): import('./state').SkillGraffiti | string {
    const g = this.g, s = g.skater!, W = g.world, A = SKILL_GRAFFITI[i].a, F = RAPIER.QueryFilterFlags.EXCLUDE_SENSORS | RAPIER.QueryFilterFlags.EXCLUDE_KINEMATIC;
    const bad = (c: RAPIER.Collider) => g.npcColliders.has(c.handle) || /sign|letra|letter|boombox|plinth|lettering|car|rail|guard|lamp|bollard|post/i.test(g.park.colliderName(c.handle) ?? '');
    const fwd = new THREE.Vector3(Math.sin(s.heading), 0, Math.cos(s.heading)), foot = s.footPos.clone();
    const cast = (o: THREE.Vector3, d: THREE.Vector3, max: number) => W.castRayAndGetNormal(new RAPIER.Ray({ x: o.x, y: o.y, z: o.z }, { x: d.x, y: d.y, z: d.z }), max, true, F, undefined, s.collider, undefined, (c) => !g.npcColliders.has(c.handle));
    const flat = (c: THREE.Vector3, n: THREE.Vector3, u: THREE.Vector3, w: number, h: number) => { const r = new THREE.Vector3().crossVectors(u, n).normalize();
      // V10.2 R-07b: el borde y las esquinas del dibujo (antes solo hasta el 45 %: asomaba hasta 21 cm por el canto de un muro o un bordillo)
      for (const [a, b] of FLAT_PTS) { const p = c.clone().addScaledVector(r, a * w).addScaledVector(u, b * h).addScaledVector(n, 0.3);
        const hit = cast(p, n.clone().negate(), 0.42); if (!hit || Math.abs(hit.timeOfImpact - 0.3) > 0.03 || hit.normal.x * n.x + hit.normal.y * n.y + hit.normal.z * n.z < 0.88 || bad(hit.collider)) return false; } return true; };
    // carteles (paneles con su lettering) y las letras BELLAKACIONES (caja de su malla + 0,4 m): nunca se pintan encima
    if (!this.signBoxes) { this.signBoxes = []; g.scene.traverse((o) => { if (o.name === 'BOLA_LETRAS') this.signBoxes!.push(new THREE.Box3().setFromObject(o, true).expandByScalar(0.4)); }); }
    const nearSign = (p: THREE.Vector3) => g.park.signs.some((m) => m.getWorldPosition(new THREE.Vector3()).distanceTo(p) < 1.6) || this.signBoxes!.some((bx) => bx.containsPoint(p));
    // R5 (QA B2): ni encima de los murales y grafitis del parque (mallas *GRAFITI* / *GRAFFITI* / *MURAL* / la diana de la rana; caja + 8 cm)
    if (!this.artBoxes) { this.artBoxes = []; g.scene.traverse((o) => { if (/GRAF+ITI|MURAL|GraffitiTarget/i.test(o.name) && !o.name.startsWith('SKILL_GRAFFITI') && !/_WALL$/.test(o.name)) { const bx = new THREE.Box3().setFromObject(o, true); if (!bx.isEmpty()) this.artBoxes!.push(bx.expandByScalar(0.08)); } }); }
    const decalBox = (c: THREE.Vector3, n: THREE.Vector3, u: THREE.Vector3, w: number, h: number) => { const r = new THREE.Vector3().crossVectors(u, n).normalize(), bx = new THREE.Box3();
      for (const [a, b] of [[-0.5, -0.5], [0.5, -0.5], [-0.5, 0.5], [0.5, 0.5]]) bx.expandByPoint(c.clone().addScaledVector(r, a * w).addScaledVector(u, b * h)); return bx.expandByScalar(0.03); };
    const onArt = (c: THREE.Vector3, n: THREE.Vector3, u: THREE.Vector3, w: number, h: number) => { const bx = decalBox(c, n, u, w, h); return this.artBoxes!.some((a) => a.intersectsBox(bx)); };
    // R5 (QA B3): ni debajo ni detrás de un personaje (el rayo ignora sus cápsulas): nadie a menos de 0,6 m del dibujo
    const npcAt: THREE.Vector3[] = []; for (const L of g.npcs.values()) for (const a of L) if (a.root.visible !== false) npcAt.push(a.root.getWorldPosition(new THREE.Vector3()));
    const nearNpc = (c: THREE.Vector3, w: number, h: number) => npcAt.some((p) => Math.hypot(p.x - c.x, p.z - c.z) < 0.6 + Math.max(w, h) / 2 && c.y > p.y - 0.5 && c.y < p.y + 2.4);
    const free = (c: THREE.Vector3, n: THREE.Vector3, u: THREE.Vector3, w: number, h: number) => !nearSign(c) && !onArt(c, n, u, w, h) && !nearNpc(c, w, h);
    // pared
    const chest = foot.clone().add(new THREE.Vector3(0, 1.15, 0)), wh = cast(chest, fwd, 2.2);
    if (wh && Math.abs(wh.normal.y) < 0.35 && !bad(wh.collider)) {
      const n = new THREE.Vector3(wh.normal.x, wh.normal.y, wh.normal.z).normalize(); if (n.dot(fwd) > 0) n.negate();
      const u = new THREE.Vector3(0, 1, 0).addScaledVector(n, -n.y).normalize();
      for (const hgt of [1.25, 0.9, 0.65]) { const w = hgt * A > 1.9 ? 1.9 : hgt * A, h = w / A, c = chest.clone().addScaledVector(fwd, wh.timeOfImpact).addScaledVector(n, 0.012);
        c.y = Math.max(c.y, foot.y + h / 2 + 0.12);
        if (flat(c, n, u, w, h) && free(c, n, u, w, h)) return { i, p: [c.x, c.y, c.z], n: [n.x, n.y, n.z], u: [u.x, u.y, u.z], s: h }; }
      return 'Esa pared no es lisa o ya tiene dibujo: busca otra o pinta en el suelo';
    }
    // suelo delante (el dibujo se lee desde donde está ANMI: «arriba» hacia delante)
    const ahead = foot.clone().addScaledVector(fwd, 1.15).add(new THREE.Vector3(0, 0.6, 0)), fh = cast(ahead, new THREE.Vector3(0, -1, 0), 1.4);
    if (fh && fh.normal.y > 0.85 && !bad(fh.collider)) {
      const n = new THREE.Vector3(fh.normal.x, fh.normal.y, fh.normal.z).normalize(), u = fwd.clone().addScaledVector(n, -fwd.dot(n)).normalize();
      for (const wid of [1.4, 1.0]) { const w = wid, h = w / A > 1.4 ? 1.4 : w / A, c = ahead.clone().add(new THREE.Vector3(0, -fh.timeOfImpact, 0)).addScaledVector(n, 0.008);
        if (flat(c, n, u, h * A, h) && free(c, n, u, h * A, h)) return { i, p: [c.x, c.y, c.z], n: [n.x, n.y, n.z], u: [u.x, u.y, u.z], s: h }; }
    }
    return 'Aquí no se puede pintar: ponte delante de una pared lisa o de suelo libre';
  }
  paint(i: number) {
    const g = this.g, s = g.skater!;
    if (i < 0 || i > 3) return;
    if (!this.available()) { const why = this.denyWhy(); if (why) toast(why.replace('bailar', 'grafitear'), 1400); return; }
    const spot = this.findSpot(i);
    if (typeof spot === 'string') { this.denies.push(spot); toast(spot, 1800); g.audio.sfx('deny'); return; }
    this.toggleMenu(false);
    s.vel.set(0, 0, 0);
    const n = new THREE.Vector3(...spot.n); if (Math.abs(n.y) < 0.5) { s.heading = Math.atan2(-n.x, -n.z); s.prevHeading = s.heading; }
    // V10.2 Q13: el dibujo se revela con una máscara que sigue el mismo zigzag que la boquilla (antes aparecía entero por opacidad)
    const mask = document.createElement('canvas'); mask.width = mask.height = 128; const mx = mask.getContext('2d')!; mx.fillStyle = '#000'; mx.fillRect(0, 0, 128, 128);
    const maskTex = new THREE.CanvasTexture(mask); maskTex.flipY = true;
    const mat = this.gMat(i).clone(); mat.opacity = 1; mat.alphaMap = maskTex; mat.needsUpdate = true; const mesh = this.addDecal(spot, 1, mat);
    const A = SKILL_GRAFFITI[i].a, job: SprayJob = { p: new THREE.Vector3(...spot.p), n: new THREE.Vector3(...spot.n).normalize(), u: new THREE.Vector3(...spot.u).normalize(), w: spot.s * A, h: spot.s, t: 0 };
    this.painting = { i, t: 0, mesh, mat, entry: spot, sprayT: 0, job, mask, maskTex, lastK: 0 }; this.chosenAt = g.clock;   // la dirección que eligió el grafiti no lo cancela
    g.visual.setBoardVisible?.(false);
    (g.visual as any).setSpray?.(job);
    g.log.push(`grafiti de SKILLS ${i + 1} en (${spot.p.map((v) => v.toFixed(1)).join(', ')})`);
  }
  private stepPaint(dt: number) {
    const P = this.painting!, g = this.g;
    P.t += dt; P.sprayT -= dt; P.job.t = P.t;
    // máscara: trazo grueso por el zigzag hasta donde va la boquilla (el mismo de anmi.ts: spray.ts)
    { const k = strokeK(P.t), reduced = g.state.p.settings.reducedMotion, amp = reduced ? 0.3 : 0.42, c = P.mask.getContext('2d')!;
      if (k > P.lastK) { c.strokeStyle = '#fff'; c.lineCap = 'round'; c.lineJoin = 'round'; c.lineWidth = 128 * 0.42; c.beginPath();
        const toPx = (q: [number, number]) => [64 + q[0] / (amp / 0.5) * 128 * 0.5 * (0.5 / 0.5), 64 - q[1] / 0.34 * 128 * 0.36] as [number, number];
        for (let s = P.lastK; s <= k + 1e-6; s += 0.01) { const [x, y] = toPx(zigzag(Math.min(k, s), amp)); if (s === P.lastK) c.moveTo(x, y); else c.lineTo(x, y); }
        c.stroke(); P.lastK = k; P.maskTex.needsUpdate = true; } }
    if (P.sprayT <= 0 && P.t > SPRAY.grab && P.t < SPRAY.sec - SPRAY.stow) { P.sprayT = 0.12; g.audio.sfx('spray'); }
    if (P.t >= SPRAY.sec) {
      P.mesh.material = this.wornMat(P.entry); P.mat.dispose(); P.maskTex.dispose(); this.painting = null; this.paints++;   // V10.3 (U-13): desgaste al acabar
      g.state.addSkillGraffiti(P.entry); (g.visual as any).setSpray?.(null); g.visual.setBoardVisible?.(true);
      toast('¡Grafiti! Se queda pintado (se guardan los 12 últimos)', 1800);
    }
  }
  cancelPaint(why: string) {
    const P = this.painting; if (!P) return;
    P.mesh.removeFromParent(); this.decals = this.decals.filter((m) => m !== P.mesh); P.mat.dispose(); P.maskTex.dispose(); P.mesh.geometry.dispose(); this.painting = null;
    (this.g.visual as any).setSpray?.(null); this.g.visual.setBoardVisible?.(true); this.g.log.push(`grafiti cancelado (${why})`);
  }
  request(n: number) {
    if (n < 1 || n > FREE_DANCES.length) return;
    if (this.dancing === n - 1) { this.stop(); return; }
    if (!this.available() && !(this.dancing >= 0 && this.availableWhileDancing())) return;   // R11 (NMG-02): no se cambia de baile sentada
    this.start(n - 1);
  }
  /** Con un baile en curso, `available()` ve el propio estado de baile como válido; solo se exige que nada más esté en marcha. */
  private availableWhileDancing() { const g = this.g, s = g.skater; return g.mode === 'explore' && !g.paused && !!s && s.onFoot && !s.frozen && !g.activities.some((a) => a !== this && a.busy); }
  private start(i: number) {
    const g = this.g, s = g.skater!;
    s.vel.set(0, 0, 0); this.chosenAt = g.clock;   // V10.1 P09: la dirección de la cruceta que eligió el baile no lo corta
    g.visual.play?.(FREE_DANCES[i], { loop: true, fade: 0.3 });
    if (!this.prop) {   // la tabla, tumbada en el suelo a su derecha
      g.visual.setBoardVisible?.(false);
      const prop = (g.visual as any).makeBoardProp?.() ?? new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.04, 0.8), new THREE.MeshStandardMaterial({ color: '#F18AAE' }));
      const h = s.heading;
      // R11 (FG-06): a la derecha si hay suelo a la altura del pie; si no, a la izquierda; si tampoco, se queda en la mano
      // R13: con Rapier importado (antes el atajo de pruebas `__bkRapier`, que solo existe con ?bktest: en el juego publicado no miraba el suelo)
      const W = g.world;
      const floorAt = (x: number, z: number) => { if (!W) return s.footPos.y; const hit = W.castRay(new RAPIER.Ray({ x, y: s.footPos.y + 0.5, z }, { x: 0, y: -1, z: 0 }), 0.7, true, RAPIER.QueryFilterFlags.EXCLUDE_SENSORS, undefined, s.collider); return hit ? s.footPos.y + 0.5 - hit.timeOfImpact : null; };
      let spot: [number, number] | null = null;
      for (const sg of [1, -1]) { const x = s.footPos.x - Math.cos(h) * 0.85 * sg, z = s.footPos.z + Math.sin(h) * 0.85 * sg, y = floorAt(x, z); if (y !== null && Math.abs(y - s.footPos.y) < 0.15) { spot = [x, z]; break; } }
      if (spot) { prop.position.set(spot[0], s.footPos.y, spot[1]); prop.rotation.set(0, h, 0); g.scene.add(prop); this.prop = prop; }
      else g.visual.setBoardVisible?.(true);
    }
    // R7 (usuario, 12 oct): dentro del recuadro de charla, La Pantera se levanta y baila el MISMO baile, sincronizada (ambas
    // acciones arrancan en t = 0 en este mismo paso y tienen la misma duración: mismas fuentes Meshy)
    const pan = g.npcs.get('la_pantera')?.[0], z = g.park.zones.get('act.pantherTalk');
    if (pan && z && (inZone(z, s.footPos) || this.panDancing) && !this.panDancing) clearOfPantera(this.g, pan);   // R11 (NMG-17)
    if (pan && z && (inZone(z, s.footPos) || this.panDancing) && pan.standLoop(`Dance_${FREE_DANCES[i]}`, 0.45, 0.3)) { pan.faceTo(s.footPos); this.panDancing = true; }
    // V6 (D6-06): sobre la pista de FASHION GIRL las cinco chicas bailan el mismo baile, sincronizadas
    const fz = g.park.zones.get('act.danceCombo');
    if (fz && inZone(fz, s.footPos)) { for (const girl of g.npcs.get('bella') ?? []) if (!girl.playSync(`Dance_${FREE_DANCES[i]}`, true, 0.3)) girl.setLoop('Sway', 0.3, 1.05); this.fgDancing = true; }
    else if (this.fgDancing) this.fgRest();
    this.dancing = i; this.toggleMenu(false);
    this.ring?.querySelectorAll('.dance-opt').forEach((b, k) => b.classList.toggle('on', k === i));
    g.log.push(`baile libre ${i + 1}: ${FREE_DANCES[i]}`);
  }
  stop(next?: string) {
    if (this.dancing < 0) return;
    const g = this.g;
    // R11 (NMG-01): si lo que empieza es la charla con La Pantera, se queda de pie (la charla la mantiene de pie)
    if (this.panDancing) { this.panDancing = false; if (next !== 'pantherTalk') g.npcs.get('la_pantera')?.[0]?.sitBack(); }
    if (this.fgDancing) this.fgRest();
    g.visual.play?.('skate', { fade: 0.3 });
    g.visual.setBoardVisible?.(true);
    this.prop?.removeFromParent(); this.prop = null;
    this.dancing = -1; this.ring?.querySelectorAll('.dance-opt').forEach((b) => b.classList.remove('on'));
  }
  cancel() { this.stop(); this.toggleMenu(false); this.cancelPaint('cancelar'); }
}

// ================================================================== NOSVAMOSDEAQUÍ — grind automático de RG1 con Fennec (V10)
/** Diálogos LITERALES del usuario (dossier NVDA v4 §8; contratos/dialogos-exactos.txt). No se normalizan (frases 1–2 acaban en «...)»; la 3 y
 *  la final no cierran el paréntesis). */
export const FENNEC_START = (NV_KIT as any).dialogs.start as string[];
export const FENNEC_FINISH = (NV_KIT as any).dialogs.finish as string;
/** Parámetros del grind (D-NV-03). Velocidad base del dossier: 42,89 m ≈ 8,58 s a 5 m/s sin ralentización. */
export const GRIND = {
  speed: 5.0, mountT: 0.55, exitT: 0.45,
  // equilibrio: péndulo inestable θ'' = k·sinθ + ruido − c·θ' + u·F (u = −1 izquierda / +1 derecha); dificultad suave por progreso p ∈ [0,1]
  k: 2.6, noise: 1.5, damp: 2.0, force: 10.5, failLean: 0.95, ramp: 0.35, forceRamp: -0.12,
  // aviso de la vuelta: cámara lenta ×0,4 desde `warnBefore` m antes del cruce inferior hasta `warnAfter` después; agacharse exigido en ±`crouchHalf`
  slow: 0.4, warnBefore: 3.2, warnAfter: 0.6, crouchHalf: 0.45, reducedWarnBefore: 5.0, reducedSpeed: 3.0,
  boardUp: 0.07,   // cara superior del tubo + tabla
};
export class RailGrind extends Session {
  id = 'skateTutorial';   // D-NV-01: clave interna de la actividad de NVDA (guardado), el reto visible es el grind de Fennec
  phase: 'off' | 'talk' | 'ready' | 'mount' | 'ride' | 'exit' | 'fail' | 'done' = 'off';
  s = 0; lean = 0; leanV = 0; crouched = false; crouchMissed = false; warned = false; slowK = 1; u = 0; t = 0;
  attempts = 0; successes = 0; failures: string[] = [];
  /** Traza de pruebas: s, posición, rumbo, ángulo tabla↔tangente, inclinación, agachada, factor de tiempo. */
  trace: { t: number; s: number; x: number; y: number; z: number; h: number; dh: number; lean: number; cr: boolean; k: number }[] = [];
  private R = rg1(); private from = new THREE.Vector3(); private fromH = 0; private noiseT = 0; private noiseA = 0; private noiseB = 0;
  private fennecAt: 'top' | 'bottom' = 'top';
  init() { this.placeFennec(this.g.state.p.activities.skateTutorial ? 'bottom' : 'top'); }
  /** Fennec: UN solo actor; arriba antes del reto, abajo tras superarlo (también al recargar). */
  placeFennec(where: 'top' | 'bottom') {
    this.fennecAt = where;
    const a = this.g.npcs.get('fennec')?.[0], an = this.g.manifest.get(where === 'top' ? 'nv.fennec.top' : 'nv.fennec.bottom');
    if (a) { a.place(an.pos, an.heading); const h = this.g.npcHomes.find((x) => x.actor === a); if (h) { h.root0.copy(a.root.position); h.col.setTranslation({ x: an.pos.x, y: an.pos.y + h.col.halfHeight() + h.col.radius() + 0.013, z: an.pos.z }); } }   // V10.1: cápsula apoyada en el suelo a su escala
  }
  get inRun() { return this.phase === 'mount' || this.phase === 'ride' || this.phase === 'exit'; }
  preStep(f: InputFrame) {
    if (!this.inRun) return false;
    this.u = THREE.MathUtils.clamp(f.move.x, -1, 1);
    this.wantCrouch = f.crouchDesired;
    return f.jumpPressed;   // el SALTO no hace nada durante el grind automático
  }
  private wantCrouch = false; private crossOff = false;
  private bodyGrind = false; private bodyAct = false; private ghMsgUntil = 0;
  /** V10 IT3: panel del modo actividad (progreso, barra de equilibrio, aviso). */
  private gh(id: string) { return document.getElementById(id); }
  private updateHud() {
    const L = this.R.length, s = this.phase === 'exit' ? L : this.s, fill = this.gh('gh-prog-fill'), left = this.gh('gh-left'), nd = this.gh('gh-needle');
    if (fill) fill.style.width = `${(100 * s / L).toFixed(1)}%`;
    if (left) left.textContent = this.phase === 'exit' ? '¡Meta!' : `Quedan ${Math.max(0, Math.ceil(L - s))} m`;
    // aguja: desequilibrio respecto al de caída (±failLean) → 0–100 % de la barra; roja cerca del borde
    const k = THREE.MathUtils.clamp(this.lean / GRIND.failLean, -1, 1);
    // escala en raíz: los desequilibrios pequeños también se ven (con escala lineal la aguja parecía quieta), el borde sigue siendo la caída
    if (nd) { nd.style.left = `${(50 + 50 * Math.sign(k) * Math.sqrt(Math.abs(k))).toFixed(1)}%`; nd.classList.toggle('danger', Math.abs(k) > 0.62); }
    if (this.ghMsgUntil && this.g.clock > this.ghMsgUntil) this.ghMsg(null);
  }
  private ghMsg(html: string | null, warn = false, sec = 0) { const m = this.gh('gh-msg'); if (!m) return; m.innerHTML = html ?? ''; m.classList.toggle('warn', warn); this.ghMsgUntil = sec ? this.g.clock + sec : 0; }
  update(dt: number) {
    const g = this.g, s = g.skater!;
    // V10 IT2: `body.grind` muestra los botones táctiles ◀ ▶ (y recoloca AGACHARSE) mientras dura el grind; faltaba y en táctil no se podía
    // equilibrar (la ayuda ya decía «Botones ◀ ▶»)
    { const on = this.phase === 'mount' || this.phase === 'ride'; if (on !== this.bodyGrind) { this.bodyGrind = on; document.body.classList.toggle('grind', on); } }
    // V10 IT3 (feedback «modo concreto» de la actividad): viñeta + panel mientras dura la carrera (subida, grind y salida)
    { const on = this.inRun; if (on !== this.bodyAct) { this.bodyAct = on; document.body.classList.toggle('actividad', on); g.input.setFreePointer(on && !matchMedia('(pointer: coarse)').matches); const h = this.gh('grind-hud'); if (h) h.hidden = !on; if (!on) this.ghMsg(null); } }
    if (this.inRun) this.updateHud();
    if (!this.busy) {
      if (g.mode !== 'explore') return;
      // V10.2 Q12 (D-12): con el grind HECHO se repite directo, sin hablar con nadie (Bellakat ya está abajo: antes se le hablaba al sitio vacío
      // de arriba si faltaba la pista, como en partidas antiguas o la de `?escena`)
      const done = g.state.p.activities.skateTutorial, intro = g.state.p.hints.includes('nv-fennec-intro');
      this.offerOnFoot('act.skateTutorial', done ? 'REPETIR GRIND' : intro ? 'EMPEZAR GRIND' : 'HABLAR', () => (done || intro ? this.startRun() : this.talk()));
      return;
    }
    if (!this.inRun) return;
    this.t += dt;
    const R = this.R, G = GRIND, reduced = g.state.p.settings.reducedMotion;
    if (this.phase === 'mount') {
      const k = Math.min(1, this.t / G.mountT), e = k * k * (3 - 2 * k), p0 = this.railPos(0), h0 = this.boardHeading(0);
      const p = this.from.clone().lerp(p0, e); p.y += Math.sin(Math.PI * k) * 0.45;
      s.placeKinematic(p, this.fromH + angleDiff(h0, this.fromH) * e);
      if (k >= 1) { this.phase = 'ride'; this.t = 0; g.audio.setGrind(true); g.audio.sfx('grindIn'); }
      return;
    }
    if (this.phase === 'ride') {
      const L = R.length, p = this.s / L, X = R.crossing.lower_s;
      // aviso de la vuelta: cámara lenta (o, con «reducir movimiento», aviso antes y velocidad menor sin ralentizar la imagen)
      const wb = reduced ? G.reducedWarnBefore : G.warnBefore, inWarn = this.s > X - wb && this.s < X + G.warnAfter;
      if (inWarn && !this.warned) { this.warned = true; g.audio.sfx('arm'); this.g.input.setHot(true); this.ghMsg(this.crouchText(), true); (g.visual as any).setGrindWarn?.(true); }
      if (!inWarn && this.warned && this.s >= X + G.warnAfter) { this.g.input.setHot(false); (g.visual as any).setGrindWarn?.(false); if (this.gh('gh-msg')?.classList.contains('warn')) this.ghMsg('¡Bien! Sigue equilibrando', false, 1.5); }
      const kWant = inWarn ? (reduced ? 1 : G.slow) : 1;
      this.slowK += (kWant - this.slowK) * (1 - Math.exp(-8 * dt));
      const v = inWarn && reduced ? G.reducedSpeed : G.speed;
      const dts = dt * this.slowK;   // tiempo «de grind» (ralentizado)
      this.s = Math.min(L, this.s + v * dts);
      // agacharse: V10.1 P16 (usuario) en TODO el raíl, mientras se pulse (o con la alternancia táctil); sigue siendo obligatorio bajo el cruce
      this.crouched = this.wantCrouch;
      if (Math.abs(this.s - X) < G.crouchHalf && !this.crouched) { this.fail('cruce'); return; }
      // H-18: la alternancia táctil se apaga UNA vez al pasar el cruce (después se puede volver a agachar cuando se quiera)
      if (!this.crossOff && this.s > X + G.warnAfter + 0.4) { this.crossOff = true; if (g.input.crouchToggle) g.input.setCrouchToggle(false); }
      // equilibrio
      this.noiseT -= dts; if (this.noiseT <= 0) { this.noiseT = 0.35 + Math.random() * 0.4; this.noiseA = this.noiseB; this.noiseB = (Math.random() * 2 - 1); }
      const nz = THREE.MathUtils.lerp(this.noiseB, this.noiseA, Math.max(0, this.noiseT) / 0.75);
      const dif = 1 + G.ramp * p, force = G.force * (1 + G.forceRamp * p);
      const acc = G.k * dif * Math.sin(this.lean) + G.noise * dif * nz - G.damp * this.leanV + this.u * force;
      this.leanV += acc * dts; this.lean += this.leanV * dts;
      if (Math.abs(this.lean) > G.failLean) { this.fail('equilibrio'); return; }
      const pos = this.railPos(this.s), h = this.boardHeading(this.s);
      s.placeKinematic(pos, h);
      (g.visual as any).setGrindPose?.({ lean: this.lean * 0.7, crouch: this.crouched });
      const tg = R.tangent(this.s), th = Math.atan2(tg.x, tg.z);
      this.trace.push({ t: +g.clock.toFixed(3), s: +this.s.toFixed(3), x: +pos.x.toFixed(3), y: +pos.y.toFixed(3), z: +pos.z.toFixed(3), h: +h.toFixed(4), dh: +Math.abs(angleDiff(h, th)).toFixed(4), lean: +this.lean.toFixed(4), cr: this.crouched, k: +this.slowK.toFixed(3) });
      if (this.trace.length > 4000) this.trace.shift();
      g.audio.setGrind(true);
      if (this.s >= L - 1e-4) { this.phase = 'exit'; this.t = 0; this.from.copy(pos); this.fromH = h; g.input.setHot(false); }
      return;
    }
    if (this.phase === 'exit') {   // salto suave del final del tubo al suelo, por delante, ya rodando
      const k = Math.min(1, this.t / G.exitT), tg = R.tangent(R.length), end = this.R.at(R.length).clone().addScaledVector(tg.setY(0).normalize(), 1.1); end.y = 0;
      const p = this.from.clone().lerp(end, k); p.y = THREE.MathUtils.lerp(this.from.y, 0, k) + Math.sin(Math.PI * k) * 0.35;
      s.placeKinematic(p, this.fromH + angleDiff(Math.atan2(tg.x, tg.z), this.fromH) * k);
      if (k >= 1) this.success();
    }
  }
  private crouchText() { const src = this.g.input.source; return `¡Vuelta! <b>AGÁCHATE</b>${src === 'gamepad' ? ' (mantén B)' : matchMedia('(pointer: coarse)').matches ? ' (toca AGACHARSE)' : ' (mantén C)'} para pasar bajo el rail`; }
  private railPos(s: number) { return this.R.at(s).clone().add(new THREE.Vector3(0, NV_KIT.rail.tube_d / 2 + GRIND.boardUp, 0)); }
  /** Rumbo del controlador = eje largo de la TABLA, perpendicular a la tangente horizontal del tubo (boardslide). */
  private boardHeading(s: number) { const t = this.R.tangent(s); return Math.atan2(t.x, t.z) + Math.PI / 2; }
  async talk() {
    const g = this.g; if (this.busy) return;
    const t = this.begin('fennec');
    avisos.actividad('skateTutorial', 'empieza', g.state.p.activities.skateTutorial);   // V10.6 (B5)
    const fen = g.npcs.get('fennec')?.[0], at = g.manifest.get('nv.fennec.top').pos;
    g.skater!.vel.set(0, 0, 0); g.skater!.frozen = true;
    // V10.2 Q01 + Q03: ANMI a ~1,4 m (sin salirse del tablero del puente) y plano de charla como en TT (antes, ancla fija `cam.nv.talk`)
    const q = standOff(g, at, t);
    if (fen) talkCam(g, fen.root, { foot: q }); else talkCam(g, null, { at, h: 1.5, foot: q });
    g.audio.duck(true); fen?.faceTo(q);
    for (const line of FENNEC_START) {
      fen?.gesture('Talk', 0.25, 1.0); g.audio.sfx('talk');
      await say('Bellakat', line, { token: t }); if (!t.alive) return;
    }
    g.state.hintOnce('nv-fennec-intro');
    this.end();
    // tras la explicación, un botón inicia el reto (dossier §7 «Inicio»)
    this.g.sim.after(0.1, () => { if (this.g.mode === 'explore') this.g.offerAction('EMPEZAR GRIND', () => this.startRun(), this.id); });
  }
  startRun() {
    const g = this.g, s = g.skater!; if (this.busy) return;
    const t = this.begin('grind', 'explore');
    avisos.actividad('skateTutorial', 'empieza', g.state.p.activities.skateTutorial);   // V10.6 (B5): si no hubo charla en esta visita
    this.attempts++; this.crossOff = false; this.s = 0; this.lean = (Math.random() < 0.5 ? -1 : 1) * 0.04; this.leanV = 0; this.slowK = 1; this.warned = false; this.crouched = false; this.t = 0; this.trace = [];
    this.phase = 'mount'; this.from.copy(s.footPos); this.from.y -= TUNING.kccOffset; this.fromH = s.heading;
    s.vel.set(0, 0, 0); s.frozen = true; g.withdrawAction(this.id);
    g.setMode('activity'); g.input.setWorld(true);
    document.getElementById('touch')!.hidden = false;   // V10 IT2: setMode('activity') oculta el panel táctil; el grind lo necesita (◀ ▶ y AGACHARSE)
    (g.visual as any).setGrindPose?.({ lean: 0, crouch: false }); g.visual.play?.('SK_Grind', { loop: true, fade: 0.2 });
    g.rig.toScripted?.(() => this.camPose());
    this.ghMsg(this.balanceText(), false, 4);   // IT3: las instrucciones van en el panel (la tarjeta tapaba a ANMI en el teléfono horizontal)
    t.onCancel(() => { this.phase = this.phase === 'done' ? 'done' : 'off'; (g.visual as any).setGrindPose?.(null); (g.visual as any).setGrindWarn?.(false); g.audio.setGrind(false); g.input.setHot(false); setTask(null);
      if (g.skater) { g.skater.frozen = false; } g.visual.play?.('skate', { fade: 0.3 }); });
    g.state.hintOnce('nv-grind-help');   // IT3: la ayuda va en el panel del grind (ghMsg), no en la pista flotante
  }
  private balanceText() { const src = this.g.input.source; return src === 'gamepad' ? 'Stick izquierdo ◀ ▶ para equilibrar · B para agacharte (cuando quieras; en la vuelta, obligatorio)' : matchMedia('(pointer: coarse)').matches ? 'Botones ◀ ▶ para equilibrar · AGACHARSE cuando quieras (en la vuelta, obligatorio)' : '<b>Clic izquierdo/derecho</b> o <b>A/D</b> (←/→) para equilibrar · <b>C</b> para agacharte (en la vuelta, obligatorio)'; }
  /** Cámara del grind: detrás y a un lado del avance, algo elevada, mirando por delante; legible en la vuelta y el cruce. */
  private camPose() {
    const R = this.R, sNow = this.s, p = this.railPos(sNow), tg = R.tangent(sNow).setY(0).normalize(), side = new THREE.Vector3(-tg.z, 0, tg.x);
    const ahead = R.at(Math.min(R.length, sNow + 2.0));
    const pos = p.clone().addScaledVector(tg, -4.2).addScaledVector(side, 1.6).add(new THREE.Vector3(0, 2.1, 0));
    const look = p.clone().lerp(ahead, 0.4).add(new THREE.Vector3(0, 0.9, 0));
    return { pos, look, hfov: 64 };
  }
  private fail(why: string) {
    const g = this.g, s = g.skater!;
    this.phase = 'fail'; this.failures.push(why); g.audio.sfx('fail'); g.audio.setGrind(false);
    avisos.actividad('skateTutorial', 'falla', g.state.p.activities.skateTutorial);   // V10.6 (B5): intento perdido
    toast(why === 'cruce' ? '¡Había que agacharse en la vuelta! Otra vez desde arriba' : '¡Uy! Perdiste el equilibrio. Otra vez desde arriba', 2600);
    // reintento desde el inicio de RG1 (arriba en P1), a pie; sin tocar patatas ni progreso (dossier §12, propuesta técnica)
    g.sim.after(reducedOr(g, 0.9, 0.6), () => { const a = g.manifest.get('nv.retry'); s.frozen = false; this.end(); s.teleport(a.pos, a.heading, 'walk'); g.rig.toFollow(s, true); this.phase = 'off'; });
  }
  private success() {
    const g = this.g, s = g.skater!;
    this.phase = 'done'; this.successes++; g.audio.setGrind(false); g.audio.sfx('success');
    s.frozen = false; this.end();
    const first = g.state.complete('skateTutorial');
    this.placeFennec('bottom');
    // IT3 (QA-2): ANMI se colocaba en la salida de RG1, a 0,63 m del ancla de Fennec abajo (cuerpos atravesados en la frase final). Ahora
    // queda delante de Fennec, a 1,5–1,9 m y mirándolo, en el primer sitio donde cabe (si ninguno cabe, en la salida de RG1 como antes)
    { const an = g.manifest.get('nv.fennec.bottom'), out = s.footPos.clone().setY(0.0); let pos = out;
      busca: for (const d of [1.5, 1.9]) for (const da of [0, 0.5, -0.5, 1.0, -1.0]) { const h = an.heading + da, q = new THREE.Vector3(an.pos.x + Math.sin(h) * d, an.pos.y, an.pos.z + Math.cos(h) * d);
        if (s.fitsFoot(q.clone().setY(q.y + 0.03))) { pos = q; break busca; } }
      s.teleport(pos, Math.atan2(an.pos.x - pos.x, an.pos.z - pos.z), 'ride'); g.rig.toFollow(s); }
    const fen = g.npcs.get('fennec')?.[0];
    // V10.2 Q12 (D-12): al repetir, Bellakat no dice nada: solo el aviso
    if (!first) { toast('¡Grind completo otra vez!', 2200); return; }
    // Fennec abajo dice su frase final y aparece la patata premio (recogida física; sin entrega automática)
    this.g.sim.after(0.5, async () => {
      const t = this.begin('fennec-fin'); s.frozen = true;
      if (fen) talkCam(g, fen.root);   // V10.2 Q03: plano de charla también en la frase final (antes, la cámara de seguir)
      fen?.faceTo(s.footPos); fen?.gesture('Wave', 0.25, 1.0); g.audio.sfx('talk');
      await say('Bellakat', FENNEC_FINISH, { token: t }); if (!t.alive) return;
      this.end();
      g.revealReward('nosvamosdeaqui');
    });
  }
  debugComplete() { if (this.g.state.complete('skateTutorial')) { this.placeFennec('bottom'); this.g.revealReward('nosvamosdeaqui'); } }
}
const reducedOr = (g: Game, a: number, b: number) => (g.state.p.settings.reducedMotion ? b : a);

// ================================================================== YINYANG — la rana y el grafiti del frente de T1 (V8)
/** Frases EXACTAS del usuario (Auditoría 8/plan-v8/04): cuatro de presentación, en orden y con avance manual, y el agradecimiento
 *  con la rana bailando. Ningún otro texto se pone en boca de la rana; los avisos de fallo o carga son de interfaz. */
export const RANA_INTRO = [
  'Kroak...( Esta era mi casa antes...)',
  'Kroak...( Ahora es un skatepark...)',
  'Kroak...( El pago para usarlo es que me hagas un graffiti para mi colección...)',
  'Kroak!( Más te vale que esté bien BELLAKO!!!)',
];
export const RANA_THANKS = 'Kroak!( Gracias!)';
/** V10.1 P21: velocidad de paso de la rana (m/s): 0,75 a la escala anterior × 1,3 (la zancada crece con ella: los pies no patinan). */
export const RANA_WALK = 0.75 * 1.3;
const PREC = YY_KIT.activity.precision, TGT = YY_KIT.activity.target;
/** Diana en metros (arco desarrollado × alto): el lienzo de la interfaz y la textura del mundo tienen ESTA proporción. */
export const GRAFFITI_TARGET_M = { w: TGT.arcDeg * Math.PI / 180 * TGT.r, h: TGT.h1 - TGT.h0 };
/** V8 (D YY-12…14 + 04): hablar con la rana a pie (las cuatro frases solo la primera vez), pintar el yin-yang y ANMI en el frente
 *  de T1 con precisión tolerante (salirse demasiado borra el intento entero y se empieza de 0) y, al acertar, la rana baila y
 *  dice su agradecimiento. Completar guarda el hito ANTES de celebrar y revela UNA patata física (recogerla es aparte). */
export class Graffiti extends Session {
  id = 'graffiti';
  covered: Uint8Array | null = null; maskGrid: Uint8Array | null = null; tolArea: Uint8Array | null = null; tolCenter: Uint8Array | null = null;
  maskCount = 0; paintedCount = 0; errCells = 0; errLen = 0; fails = 0;
  phase: 'idle' | 'talk' | 'paint' | 'failed' | 'celebrate' = 'idle';
  GW = GRAFFITI_GRID.w; GH = GRAFFITI_GRID.h;
  imgs: Record<string, HTMLImageElement> = {};
  reveal: HTMLCanvasElement | null = null; comp: HTMLCanvasElement | null = null;
  wallCanvas: HTMLCanvasElement | null = null; wallTex: THREE.CanvasTexture | null = null;
  sprayT = 0;
  /** Registro (pruebas): frases mostradas, fallos, éxitos y cancelaciones en orden. */
  log: { t: number; ev: string; info?: unknown }[] = [];
  private finalTex: THREE.Texture | null = null;
  private walkTurn = 0;
  private ev(ev: string, info?: unknown) { this.log.push({ t: +this.g.sim.now.toFixed(3), ev, info }); }
  get rana() { return this.g.npcs.get('rana')?.[0] ?? null; }
  init() {
    const p = this.g.state.p;
    if (p.activities.graffiti) this.showFinal();
    else { const m = decodeMask(p.partials.graffitiMask, p.partials.graffitiCheck); if (m) { this.covered = m; this.errLen = p.partials.graffitiErrRun; void this.loadImages().then(() => this.drawWorld()).catch(() => {}); } }
  }
  update() {
    const g = this.g; if (g.mode !== 'explore' || this.busy) return;
    if (g.state.p.activities.graffiti) { g.withdrawAction(this.id); return; }
    const z = g.park.zones.get('act.graffiti')!, s = g.skater!;
    if (!inZone(z, s.footPos)) { g.withdrawAction(this.id); return; }
    // sin la rana cargada NO se ofrece la charla (no se finge con el actor ausente): se pide su carga y se avisa
    if (!this.rana || !this.rana.actions.has('Dance')) { void g.loadNpc('rana'); if (s.onFoot) g.offerAction('HABLAR', () => {}, this.id, { off: true, note: 'Bellakroak está llegando…' }); else g.withdrawAction(this.id); return; }
    const intro = g.state.p.partials.graffitiIntro;
    this.offerOnFoot('act.graffiti', !intro ? 'HABLAR' : this.covered ? 'SEGUIR PINTANDO' : 'PINTAR', () => void this.start());
  }
  /** La textura del frente de T1 con el grafiti terminado. */
  showFinal() {
    const mm = this.g.park.muralMesh.material as THREE.MeshStandardMaterial;
    if (!this.finalTex) { this.finalTex = new THREE.TextureLoader().load(`${ASSET_BASE}tex/T_yy_final.webp`); this.finalTex.colorSpace = THREE.SRGBColorSpace; this.finalTex.anisotropy = 8; }
    mm.map = this.finalTex; mm.needsUpdate = true;
  }
  async loadImages() {
    const load = (n: string) => new Promise<HTMLImageElement>((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = `${ASSET_BASE}tex/${n}.webp`; });
    if (!this.imgs.stencil) [this.imgs.stencil, this.imgs.final, this.imgs.mask] = await Promise.all([load('T_yy_stencil'), load('T_yy_final'), load('T_yy_mask')]);
    if (!this.maskGrid) {
      const c = document.createElement('canvas'); c.width = this.GW; c.height = this.GH;
      const x = c.getContext('2d', { willReadFrequently: true })!; x.drawImage(this.imgs.mask, 0, 0, this.GW, this.GH);
      const d = x.getImageData(0, 0, this.GW, this.GH).data, n = this.GW * this.GH;
      this.maskGrid = new Uint8Array(n); this.maskCount = 0;
      for (let i = 0; i < n; i++) if (d[i * 4] > 127) { this.maskGrid[i] = 1; this.maskCount++; }
      // tolerancias en METROS de la diana (independientes del tamaño del lienzo en pantalla)
      this.tolArea = this.dilate(this.maskGrid, PREC.brushR_m + PREC.tolMargin_m);
      this.tolCenter = this.dilate(this.maskGrid, PREC.brushR_m * PREC.centerTolFrac + PREC.tolMargin_m);
    }
    if (!this.covered) this.covered = new Uint8Array(this.GW * this.GH);
    this.recount();
  }
  private get cw() { return GRAFFITI_TARGET_M.w / this.GW; }
  private get ch() { return GRAFFITI_TARGET_M.h / this.GH; }
  private dilate(src: Uint8Array, r: number) {
    const out = new Uint8Array(src.length), rx = Math.ceil(r / this.cw), ry = Math.ceil(r / this.ch), offs: number[][] = [];
    for (let dy = -ry; dy <= ry; dy++) for (let dx = -rx; dx <= rx; dx++) if ((dx * this.cw) ** 2 + (dy * this.ch) ** 2 <= r * r) offs.push([dx, dy]);
    for (let y = 0; y < this.GH; y++) for (let x = 0; x < this.GW; x++) if (src[y * this.GW + x])
      for (const [dx, dy] of offs) { const X = x + dx, Y = y + dy; if (X >= 0 && Y >= 0 && X < this.GW && Y < this.GH) out[Y * this.GW + X] = 1; }
    return out;
  }
  /** Cobertura válida y error de área DERIVADOS de la máscara pintada (recargar no puede borrar el error y quedarse lo pintado). */
  private recount() {
    this.paintedCount = 0; this.errCells = 0; const c = this.covered!;
    for (let i = 0; i < c.length; i++) if (c[i]) { if (this.maskGrid![i]) this.paintedCount++; else if (!this.tolArea![i]) this.errCells++; }
  }
  get errLimitCells() { return PREC.errAreaFrac * this.maskCount; }
  private persist() {
    if (!this.covered || this.g.state.p.activities.graffiti) return;
    let any = false; for (let i = 0; i < this.covered.length; i++) if (this.covered[i]) { any = true; break; }
    if (!any) { this.g.state.setGraffitiAttempt(null); return; }
    const e = encodeMask(this.covered); this.g.state.setGraffitiAttempt({ b64: e.b64, count: e.count, errRun: this.errLen });
  }
  /** Compone estarcido + final revelado en `comp` (transparente) y lo copia al frente de T1. */
  private compose() {
    if (!this.comp || !this.reveal) return;
    const W = this.comp.width, H = this.comp.height, c = this.comp.getContext('2d')!;
    c.globalCompositeOperation = 'source-over'; c.clearRect(0, 0, W, H);
    c.drawImage(this.imgs.final, 0, 0, W, H); c.globalCompositeOperation = 'destination-in'; c.drawImage(this.reveal, 0, 0, W, H);
    c.globalCompositeOperation = 'destination-over'; c.drawImage(this.imgs.stencil, 0, 0, W, H); c.globalCompositeOperation = 'source-over';
    if (!this.wallCanvas) { this.wallCanvas = document.createElement('canvas'); this.wallCanvas.width = 1024; this.wallCanvas.height = Math.round(1024 * GRAFFITI_TARGET_M.h / GRAFFITI_TARGET_M.w); this.wallTex = new THREE.CanvasTexture(this.wallCanvas); this.wallTex.colorSpace = THREE.SRGBColorSpace; this.wallTex.anisotropy = 8; }
    const w = this.wallCanvas.getContext('2d')!; w.clearRect(0, 0, this.wallCanvas.width, this.wallCanvas.height); w.drawImage(this.comp, 0, 0, this.wallCanvas.width, this.wallCanvas.height); this.wallTex!.needsUpdate = true;
    const mm = this.g.park.muralMesh.material as THREE.MeshStandardMaterial; if (mm.map !== this.wallTex) { mm.map = this.wallTex; mm.needsUpdate = true; }
  }
  private ensureCanvases(W: number, H: number) {
    if (!this.reveal || this.reveal.width !== W || this.reveal.height !== H) { this.reveal = document.createElement('canvas'); this.reveal.width = W; this.reveal.height = H; }
    if (!this.comp || this.comp.width !== W || this.comp.height !== H) { this.comp = document.createElement('canvas'); this.comp.width = W; this.comp.height = H; }
    const r = this.reveal.getContext('2d')!; r.clearRect(0, 0, W, H); r.fillStyle = '#fff';
    const cwp = W / this.GW, chp = H / this.GH;
    for (let gy = 0; gy < this.GH; gy++) for (let gx = 0; gx < this.GW; gx++) if (this.covered![gy * this.GW + gx]) r.fillRect(gx * cwp, gy * chp, cwp + 1, chp + 1);
  }
  /** Pinta el estado guardado en el mundo (al cargar un parcial). */
  drawWorld() { if (!this.covered || this.g.state.p.activities.graffiti) return; this.ensureCanvases(512, Math.round(512 * GRAFFITI_TARGET_M.h / GRAFFITI_TARGET_M.w)); this.compose(); }

  async start() {
    const g = this.g; if (this.busy || !this.rana) return;
    const t = this.begin('rana-grafiti'), s = g.skater!, rana = this.rana;
    avisos.actividad('graffiti', 'empieza', g.state.p.activities.graffiti);   // V10.6 (B5)
    s.vel.set(0, 0, 0); s.frozen = true;
    t.onCancel(() => { if (this.phase === 'talk') { this.ev('cancel-talk'); this.phase = 'idle'; } this.ranaHome(); });
    if (!g.state.p.partials.graffitiIntro) {
      this.phase = 'talk';
      // V10.2 Q01 + Q03: ANMI se aparta a ~1,4 m de la rana (antes podía quedar pegada o encima) y el mismo plano de charla que el resto
      const rp = rana.root.position.clone(), foot = standOff(g, rp, t);
      rana.glide(rana.root.position, Math.atan2(foot.x - rp.x, foot.z - rp.z), 0.35); rana.play('Talk', 0.35);
      talkCam(g, rana.root, { foot });
      g.audio.duck(true);
      for (let i = 0; i < RANA_INTRO.length; i++) {
        g.audio.sfx('talk'); this.ev('line', i + 1); g.log.push(`rana frase ${i + 1}`);
        await say('Bellakroak', RANA_INTRO[i], { token: t });
        if (!t.alive) return;                 // cancelada: no cuenta como escuchada y no se pinta
      }
      g.state.setGraffitiIntro(); this.ev('intro-heard');
      rana.play('Idle', 0.4);
    }
    await this.paint(t);
  }

  private async paint(t: Token) {
    const g = this.g, s = g.skater!;
    this.phase = 'paint'; this.ev('paint-open');
    const paint = g.manifest.get('mural.paint');
    s.teleport(paint.pos, paint.heading, 'walk'); s.frozen = true;
    g.visual.setBoardVisible?.(false);
    camAt(g, 'cam.mural', g.manifest.get('mural.center').pos, 62);
    this.ranaToWatch();
    t.onCancel(() => { $('graffiti').hidden = true; g.visual.setBoardVisible?.(true); if (this.phase === 'paint' || this.phase === 'failed') { this.persist(); this.ev('cancel-paint'); } this.phase = 'idle'; });
    try { await this.loadImages(); } catch { if (t.alive) { toast('No se pudo cargar el grafiti. Inténtalo de nuevo.'); this.end(); } return; }
    if (!t.alive) return;
    const ov = $('graffiti'); ov.hidden = false;
    const canvas = $('graffiti-canvas') as HTMLCanvasElement, msg = $('graffiti-msg'), errEl = $('graffiti-err') as HTMLElement;
    const rect = $('graffiti-wrap').getBoundingClientRect();
    const W = Math.round(Math.min(1400, Math.max(rect.width, rect.height * GRAFFITI_TARGET_M.w / GRAFFITI_TARGET_M.h) * Math.min(2, devicePixelRatio))), H = Math.round(W * GRAFFITI_TARGET_M.h / GRAFFITI_TARGET_M.w);
    canvas.width = W; canvas.height = H;
    this.ensureCanvases(W, H);
    const ctx = canvas.getContext('2d')!, rctx = this.reveal!.getContext('2d')!;
    const pxm = W / GRAFFITI_TARGET_M.w, R = PREC.brushR_m;
    const draw = () => { this.compose(); ctx.fillStyle = '#e9e4d8'; ctx.fillRect(0, 0, W, H); ctx.drawImage(this.comp!, 0, 0); };
    const showPct = () => {
      $('graffiti-pct').textContent = `${Math.min(100, Math.round(this.paintedCount / this.maskCount / PREC.coverGoal * 100))}%`;
      const e = Math.max(this.errCells / this.errLimitCells, this.errLen / PREC.errRun_m); errEl.style.setProperty('--err', `${Math.min(1, e) * 100}%`); errEl.classList.toggle('warn', e > 0.6);
    };
    draw(); showPct(); msg.textContent = this.covered!.some((v) => v) ? 'Sigue donde lo dejaste. Pinta dentro del dibujo: salirte mucho lo borra todo.' : 'Pinta dentro del dibujo. Un poco fuera no pasa nada; salirte mucho lo borra todo.';
    // ---- trazo en METROS de la diana; cada subsegmento interpolado cuenta (también fuera del lienzo con el puntero capturado)
    const stamp = (x: number, y: number) => {
      rctx.beginPath(); rctx.arc(x * pxm, y * pxm, R * pxm, 0, Math.PI * 2); rctx.fill();
      const gx0 = Math.max(0, Math.floor((x - R) / this.cw)), gx1 = Math.min(this.GW - 1, Math.ceil((x + R) / this.cw)), gy0 = Math.max(0, Math.floor((y - R) / this.ch)), gy1 = Math.min(this.GH - 1, Math.ceil((y + R) / this.ch));
      for (let gy = gy0; gy <= gy1; gy++) for (let gx = gx0; gx <= gx1; gx++) {
        const i = gy * this.GW + gx; if (this.covered![i]) continue;
        if (((gx + 0.5) * this.cw - x) ** 2 + ((gy + 0.5) * this.ch - y) ** 2 > R * R) continue;
        this.covered![i] = 1; if (this.maskGrid![i]) this.paintedCount++; else if (!this.tolArea![i]) this.errCells++;
      }
    };
    const centerOk = (x: number, y: number) => { if (x < 0 || y < 0 || x > GRAFFITI_TARGET_M.w || y > GRAFFITI_TARGET_M.h) return false; const gx = Math.min(this.GW - 1, Math.floor(x / this.cw)), gy = Math.min(this.GH - 1, Math.floor(y / this.ch)); return !!this.tolCenter![gy * this.GW + gx]; };
    const inCanvas = (x: number, y: number) => x >= -R && y >= -R && x <= GRAFFITI_TARGET_M.w + R && y <= GRAFFITI_TARGET_M.h + R;
    const segment = (a: { x: number; y: number } | null, b: { x: number; y: number }) => {
      if (!a) { if (inCanvas(b.x, b.y)) stamp(b.x, b.y); return; }
      const L = Math.hypot(b.x - a.x, b.y - a.y), n = Math.max(1, Math.ceil(L / PREC.step_m)), dl = L / n;
      for (let i = 1; i <= n; i++) { const x = a.x + (b.x - a.x) * i / n, y = a.y + (b.y - a.y) * i / n; if (inCanvas(x, y)) stamp(x, y); if (!centerOk(x, y)) this.errLen += dl; }
    };
    let last: { x: number; y: number } | null = null, pid: number | null = null, locked = false, cleaned = false;
    const toLocal = (e: PointerEvent) => { const r = orient.relPoint(canvas, e.clientX, e.clientY); return { x: r.u * GRAFFITI_TARGET_M.w, y: r.v * GRAFFITI_TARGET_M.h }; };   // sin recortar: fuera del lienzo cuenta como fuera
    const evaluate = () => {
      const failed = this.errCells > this.errLimitCells || this.errLen > PREC.errRun_m;
      if (failed) { fail(); return; }   // si en el mismo paso se alcanza también la cobertura, PREVALECE el fallo
      if (this.paintedCount / this.maskCount >= PREC.coverGoal) succeed();
    };
    const stroke = (e: PointerEvent) => {
      if (g.paused) { pid = null; last = null; return; }   // la pausa corta el trazo: hace falta volver a pulsar (sin segmentos ocultos)
      const p = toLocal(e); segment(last, p); last = p; draw(); showPct();
      if (performance.now() - this.sprayT > 70) { this.sprayT = performance.now(); g.audio.sfx('spray'); }
      evaluate();
    };
    const fail = () => {
      this.fails++; avisos.actividad('graffiti', 'falla', g.state.p.activities.graffiti); this.ev('fail', { errCells: this.errCells, errLimit: Math.round(this.errLimitCells), errLen: +this.errLen.toFixed(3), painted: this.paintedCount, mask: this.maskCount });
      g.log.push(`grafiti fallo ${this.fails}: área ${this.errCells}/${Math.round(this.errLimitCells)} recorrido ${this.errLen.toFixed(2)}`);
      // reinicio ATÓMICO: celdas, contadores, error, lienzo, textura del mundo y parcial guardado; ningún premio
      this.covered!.fill(0); this.paintedCount = 0; this.errCells = 0; this.errLen = 0;
      rctx.clearRect(0, 0, W, H); this.g.state.setGraffitiAttempt(null);
      this.phase = 'failed'; locked = true; last = null;
      draw(); showPct(); g.audio.sfx('fail');
      msg.textContent = 'Te has salido demasiado: el grafiti se ha borrado. Suelta y vuelve a pintar desde cero.';
      ov.classList.add('failed'); g.sim.after(0.6, () => ov.classList.remove('failed'), t);
    };
    const succeed = () => {
      cleanup(); this.phase = 'celebrate'; this.ev('success', { painted: this.paintedCount, mask: this.maskCount, errCells: this.errCells, errLen: +this.errLen.toFixed(3) });
      rctx.fillStyle = '#fff'; rctx.fillRect(0, 0, W, H); draw(); $('graffiti-pct').textContent = '100%';
      g.audio.sfx('success');
      if (g.state.complete('graffiti')) g.revealReward('yinyang');   // hito guardado al acertar, ANTES de la celebración
      this.covered = null; this.errLen = 0;
      g.sim.after(0.7, () => { if (!t.alive) return; void this.celebrate(t); }, t);
    };
    const down = (e: PointerEvent) => {
      if (pid !== null || g.paused || this.phase === 'celebrate') return;   // segundo dedo: se ignora (sin error)
      e.preventDefault(); pid = e.pointerId; try { canvas.setPointerCapture(e.pointerId); } catch { /* */ }
      if (locked) { locked = false; this.phase = 'paint'; msg.textContent = 'Desde cero. Pinta dentro del dibujo.'; }
      last = null; stroke(e);
    };
    const move = (e: PointerEvent) => { if (e.pointerId === pid && !locked) stroke(e); };   // hover sin pulsar: no pinta ni cuenta
    const up = (e: PointerEvent) => { if (e.pointerId === pid) { pid = null; last = null; if (!locked) this.persist(); } };
    canvas.addEventListener('pointerdown', down); canvas.addEventListener('pointermove', move);
    canvas.addEventListener('pointerup', up); canvas.addEventListener('pointercancel', up);
    canvas.dataset.ready = '1';
    const cleanup = () => {
      if (cleaned) return; cleaned = true; canvas.dataset.ready = '';
      canvas.removeEventListener('pointerdown', down); canvas.removeEventListener('pointermove', move);
      canvas.removeEventListener('pointerup', up); canvas.removeEventListener('pointercancel', up);
    };
    t.onCancel(cleanup);
    const exit = $('graffiti-exit') as HTMLButtonElement;
    exit.onclick = () => { if (!g.state.p.activities.graffiti && this.covered?.some((v) => v)) toast('Lo pintado se guarda: puedes seguir cuando vuelvas', 2400); this.ev('exit'); this.end(); };
    try { exit.focus({ preventScroll: true }); } catch { /* */ }
  }

  /** Éxito: el frente queda pintado; la rana BAILA (clip Dance real del derivado V8) y da las gracias con la frase exacta. */
  private async celebrate(t: Token) {
    const g = this.g, s = g.skater!, rana = this.rana;
    $('graffiti').hidden = true; this.showFinal(); g.visual.setBoardVisible?.(true);
    const w = g.manifest.get('rana.watch'), t1 = g.manifest.get('yy.t1').pos;
    this.walkTurn++;   // corta cualquier paseo pendiente
    if (rana) { rana.glide(w.pos, Math.atan2(s.footPos.x - w.pos.x, s.footPos.z - w.pos.z), 0.3); rana.playSync('Dance', true, 0.25); }
    const front = new THREE.Vector3(Math.sin(g.manifest.get('yy.t1').heading), 0, Math.cos(g.manifest.get('yy.t1').heading));
    const look = w.pos.clone().lerp(t1.clone().addScaledVector(front, 1.0), 0.5).add(new THREE.Vector3(0, 1.45, 0));
    const ks = (YY_KIT.frog.scale ?? 1) * 1.3;   // V10.1 P21
    g.rig.toFixed({ pos: g.manifest.get('cam.rana.celebrate').pos, target: look, hfov: 56, fit: [w.pos.clone().add(new THREE.Vector3(0, 1.6 * ks + 0.35, 0)), w.pos.clone().add(new THREE.Vector3(0, -0.35, 0)), s.footPos.clone().add(new THREE.Vector3(0, 1.6, 0)), t1.clone().addScaledVector(front, 1).add(new THREE.Vector3(0, 3.0, 0))], insetAware: true });
    g.audio.duck(true); g.audio.sfx('talk'); this.ev('thanks'); g.log.push('rana: gracias');
    await say('Bellakroak', RANA_THANKS, { token: t });
    if (!t.alive) return;
    this.ev('celebrate-closed'); this.end();
  }
  /** La rana va por el anillo de P1 (lado derecho) hasta su sitio de mirar. */
  private ranaToWatch() {
    const m = this.g.manifest, pts = [0, 1, 2, 3, 4].map((i) => m.get(`rana.route.${i}`).pos).concat([m.get('rana.watch').pos]);
    // R11 (ANIM-09): desde el punto de la ruta más cercano (antes siempre desde el primero, aunque no estuviera en casa)
    const rana = this.rana; let from = 0;
    if (rana) { let best = Infinity; pts.forEach((p, i) => { const d = p.distanceTo(rana.root.position); if (d < best) { best = d; from = i; } }); }
    this.walkRana(pts.slice(from), m.get('rana.watch').heading);
  }
  /** Vuelta a su sitio (deshace el camino desde el punto más cercano) y a su reposo. */
  ranaHome() {
    const rana = this.rana; if (!rana) return; const m = this.g.manifest;
    const back = [m.get('rana.watch').pos, ...[4, 3, 2, 1, 0].map((i) => m.get(`rana.route.${i}`).pos), m.get('npc.rana').pos];
    let from = 0, best = Infinity; back.forEach((p, i) => { const d = p.distanceTo(rana.root.position); if (d < best) { best = d; from = i; } });
    if (rana.root.position.distanceTo(m.get('npc.rana').pos) < 0.05) { rana.play('Idle', 0.4); this.walkTurn++; rana.glide(rana.root.position, m.get('npc.rana').heading, 0.4); return; }
    this.walkRana(back.slice(from), m.get('npc.rana').heading);
  }
  private walkRana(pts: THREE.Vector3[], endYaw: number) {
    const rana = this.rana; if (!rana) return; const my = ++this.walkTurn, g = this.g;
    const step = (i: number) => {
      if (my !== this.walkTurn) return;
      if (i >= pts.length) { rana.play('Idle', 0.35); rana.glide(rana.root.position, endYaw, 0.4); return; }
      const p = pts[i], d = rana.root.position.distanceTo(p);
      if (d < 0.04) { step(i + 1); return; }
      const yaw = Math.atan2(p.x - rana.root.position.x, p.z - rana.root.position.z);
      // R11 (ANIM-09): primero gira en el sitio y luego anda con el rumbo ya fijado (antes giraba durante todo el tramo: andaba de lado
      // y hacia atrás, hasta 136° entre la cara y la marcha)
      const turnT = Math.min(0.5, Math.abs(THREE.MathUtils.euclideanModulo(yaw - rana.yaw + Math.PI, Math.PI * 2) - Math.PI) / Math.PI * 0.7);
      const go = () => { if (my !== this.walkTurn) return; rana.play('Walk', 0.2); rana.glide(p, yaw, d / RANA_WALK, true); g.sim.after(d / RANA_WALK, () => step(i + 1)); };
      if (turnT > 0.06) { rana.play('Idle', 0.2); rana.glide(rana.root.position, yaw, turnT); g.sim.after(turnT, go); } else go();
    };
    step(0);
  }
  /** Solo pruebas (gancho ?bktest): da el reto por completado y revela el premio. No existe en el juego normal. */
  debugComplete() { if (this.g.state.complete('graffiti')) this.g.revealReward('yinyang'); this.showFinal(); }
}

// ================================================================== TRATRATRA — dos charlas sobre la limo (V7)
/** Textos PROVISIONALES (Auditoría 7/plan-v7/04): no hay frases individuales definitivas; se reparte en dos la frase conjunta
 *  que el juego traía («Ni idea de cómo hemos llegado aquí. Ni nosotros ni la limo.»). Pendiente de revisión del usuario. */
/** R1 (usuario, 14 oct): cada NPC ALTERNA sus dos frases (1.ª, 2.ª, 1.ª…), sin el esquema impar/par de La Pantera. Sustituyen a
 *  las provisionales de V7 («Ni idea de cómo hemos llegado aquí.» / «Ni nosotros ni la limo.»). */
export const BRIDGE_LINES: Record<BridgeNpc, { name: string; texts: string[] }> = {
  aissa: { name: 'Aissa', texts: ['Oa-oa, deja que te coja...', "Posa pa' la Kodak, tú naciste pa' posar..."] },
  juseph: { name: 'Juseph', texts: ['Le di tabla y no se llama Sofía ni es surfer...', 'El diablo ya no viste de Prada, ahora viste Shein...'] },
};
/** V7 (Auditoría 7, D7-08/D7-11): Aissa y Juseph están sentados en los extremos de la limo. A cada uno se le habla A PIE,
 *  subida al techo y junto a su extremo (una zona por NPC, con ventana de altura: ni desde la recepción ni desde el suelo).
 *  Cada uno dice UNA frase; se marca escuchado al CERRARLA (no al abrirla): cancelar, pausar o salir antes no cuenta. Con las
 *  dos frases (cualquier orden; repetir a uno no vale por el otro) se completa `bridgeTalk` y aparece UNA patata física en el
 *  centro del techo: el contador solo sube al recogerla. El subestado por NPC se guarda (caer por H o recargar no lo borra). */
export class BridgeTalk extends Session {
  id = 'bridgeTalk';
  talking: BridgeNpc | null = null;
  /** Registro (pruebas): charlas abiertas y terminadas en orden. */
  log: { t: number; who: BridgeNpc; ev: 'open' | 'heard' | 'cancel' }[] = [];
  update() {
    const g = this.g, s = g.skater!; if (g.mode !== 'explore' || this.busy) return;
    for (const who of ['aissa', 'juseph'] as const) {
      const z = g.park.zones.get(`act.bridgeTalk.${who}`);
      if (z && inZone(z, s.footPos)) { this.offerOnFoot(`act.bridgeTalk.${who}`, 'HABLAR', () => this.talk(who)); return; }
    }
    g.withdrawAction(this.id);
  }
  /** Turno de cada NPC: una vuelta al asiento pendiente se descarta si empieza otra charla con él. */
  private turn: Record<BridgeNpc, number> = { aissa: 0, juseph: 0 };
  /** Camino de pie que ha recorrido cada NPC en su última charla (para deshacerlo al volver al asiento). */
  private route: Record<BridgeNpc, THREE.Vector3[]> = { aissa: [], juseph: [] };
  /** Frases ya dichas por cada NPC en esta sesión de juego (alternancia). */
  said: Record<BridgeNpc, number> = { aissa: 0, juseph: 0 };
  /** V7 R1 (usuario, 14 oct): al hablarle, el NPC se LEVANTA, se gira, anda por su camino hasta el TECHO (Aissa sube del morro
   *  por el parabrisas, como por una escalera; Juseph ya está en el techo), se acerca un poco a ANMI, dice su frase y, al
   *  cerrarla o cancelarla, deshace el camino y se sienta como estaba. Si ANMI está a menos de 0,9 m del sitio donde va a hablar
   *  el NPC, se la aparta hacia el centro del techo (en el corte de cámara). */
  async talk(who: BridgeNpc) {
    const g = this.g; if (this.busy) return;
    const t = this.begin('puente'), my = ++this.turn[who], alive = () => t.alive && this.turn[who] === my;
    avisos.actividad('bridgeTalk', 'empieza', g.state.p.activities.bridgeTalk);   // V10.6 (B5)
    const npc = g.npcs.get(who)?.[0], n = TT_KIT.npcs[who], s = g.skater!, { V } = ttFrame();
    this.talking = who; this.log.push({ t: +g.sim.now.toFixed(3), who, ev: 'open' });
    s.vel.set(0, 0, 0); s.frozen = true;
    const flat = (v: THREE.Vector3) => new THREE.Vector3(v.x, 0, v.z), up = (v: THREE.Vector3, h: number) => v.clone().add(new THREE.Vector3(0, h, 0));
    if (npc && !npc.home) npc.home = { pos: npc.root.position.clone(), yaw: npc.yaw };
    const home = npc?.home ?? { pos: g.manifest.get(`npc.${who}`).pos, yaw: 0 };
    const route = [V(n.stand[0], n.stand[1], n.stand[2]), ...(n.path as number[][]).map((p) => V(p[0], p[1], p[2]))];
    // ANMI a ≥ 0,9 m del sitio de charla: si no, se la aparta hacia el centro del techo, mirando al NPC
    const spot = route[route.length - 1], center = V(TT_KIT.limo.center[0], TT_KIT.limo.center[1], TT_KIT.limo.roof);
    if (flat(s.footPos).distanceTo(flat(spot)) < 0.9) {
      const to = flat(center).sub(flat(spot)).normalize(), p = new THREE.Vector3(spot.x + to.x * 0.95, TT_KIT.limo.roof + 0.03, spot.z + to.z * 0.95);
      s.teleport(p, Math.atan2(spot.x - p.x, spot.z - p.z)); s.frozen = true; g.log.push(`TT charla ${who}: ANMI apartada a 0,95 m`);
    }
    const foot = s.footPos.clone();
    const dir = flat(foot).sub(flat(spot)), dist = dir.length(); dir.normalize();
    const k = THREE.MathUtils.clamp(Math.min(n.approach, dist - 0.9), 0, n.approach);
    if (k > 0.05) route.push(spot.clone().addScaledVector(dir, k));
    const near = route[route.length - 1]; this.route[who] = route;
    g.faceSkater(near);
    // encuadre individual del NPC DE PIE y ANMI, con margen para el cuadro de diálogo (también en vertical)
    // R3 (usuario): protagonismo del NPC. Plano por encima del hombro de ANMI: cámara detrás de ella y a un lado (el de la
    // recepción), mirando la cara del NPC de frente; ANMI queda de espaldas en primer término. `fit` = cuerpo entero del NPC y
    // la cabeza de ANMI (la cámara solo se aleja por su eje si no caben, p. ej. en vertical)
    const box = (v: THREE.Vector3, r: number, h0: number, h1: number) => [-1, 1].flatMap((sx) => [-1, 1].flatMap((sz) => [h0, h1].map((h) => v.clone().add(new THREE.Vector3(sx * r, h, sz * r)))));   // cuerpo con brazos
    { const u = flat(foot).sub(flat(near)).normalize(), { V: LV } = ttFrame(), toRec = LV(1, 0, 0).sub(LV(0, 0, 0)).setY(0).normalize();
      const sd = new THREE.Vector3(-u.z, 0, u.x); if (sd.dot(toRec) < 0) sd.negate();
      const pos = foot.clone().addScaledVector(u, 1.1).addScaledVector(sd, 1.55).add(new THREE.Vector3(0, 1.75, 0));
      g.rig.toFixed({ pos, target: up(near, 1.2).addScaledVector(sd, 0.25), hfov: 54, fit: [...box(near, 0.35, -0.15, 1.95), up(foot, 1.65)] }); }
    g.audio.duck(true);
    let heard = false;
    t.onCancel(() => { if (!heard) this.log.push({ t: +g.sim.now.toFixed(3), who, ev: 'cancel' }); if (this.talking === who) this.talking = null; this.sitDown(who, my); });
    if (npc) {
      npc.play('Idle', 0.5); npc.glide(route[0], home.yaw, 0.6);                    // se levanta (sobre la carrocería)
      await g.sim.wait(0.6, t);
      await this.walk(npc, route, alive);                                            // se gira y anda (sube al techo) hasta ANMI
      npc.glide(near, Math.atan2(foot.x - near.x, foot.z - near.z), 0.35); await g.sim.wait(0.35, t);   // la mira
      npc.play(npc.actions.has('Talk') ? 'Talk' : 'Idle', 0.3);
    }
    if (!t.alive) return;
    g.audio.sfx('talk');
    const line = BRIDGE_LINES[who], text = line.texts[this.said[who]++ % line.texts.length];
    g.log.push(`TT charla ${who}: ${text}`);
    await say(line.name, text, { token: t });   // sin cierre automático: queda hasta pulsar «Vale»
    if (!t.alive) return;                             // cancelada (pausa → salir, otra sesión…): NO cuenta como escuchada
    heard = true; this.log.push({ t: +g.sim.now.toFixed(3), who, ev: 'heard' });
    const both = g.state.setBridgeHeard(who);
    g.log.push(`TT charla ${who} terminada (${both ? 'las dos' : 'falta ' + (who === 'aissa' ? 'Juseph' : 'Aissa')})`);
    if (both) { if (g.state.complete('bridgeTalk')) g.revealReward('tratratra'); }
    else if (!g.state.p.activities.bridgeTalk) toast(who === 'aissa' ? 'Ahora habla con Juseph, al otro extremo de la limo' : 'Ahora habla con Aissa, al otro extremo de la limo', 2600);
    g.updateObjective();
    this.end();
  }
  /** Recorre `pts` desde donde esté el NPC (punto a punto, a 0,55 m/s, girándose hacia cada tramo). Se corta si `alive()` deja de cumplirse. */
  private walk(npc: NonNullable<ReturnType<Game['npcs']['get']>>[number], pts: THREE.Vector3[], alive: () => boolean) {
    const g = this.g;
    return new Promise<void>((res) => {
      const next = (i: number) => {
        if (!alive()) return;
        if (i >= pts.length) { res(); return; }
        const p = pts[i], d = npc.root.position.distanceTo(p);
        if (d < 0.03) { next(i + 1); return; }
        const yaw = Math.atan2(p.x - npc.root.position.x, p.z - npc.root.position.z);
        const turnT = Math.min(0.45, Math.abs(THREE.MathUtils.euclideanModulo(yaw - npc.yaw + Math.PI, Math.PI * 2) - Math.PI) / Math.PI * 0.6);
        if (turnT > 0.06) { npc.play('Idle', 0.2); npc.glide(npc.root.position, yaw, turnT); }
        const dh = p.y - npc.root.position.y;
        g.sim.after(turnT > 0.06 ? turnT : 0, () => {
          if (!alive()) return;
          if (Math.abs(dh) > 0.25) {
            // R3/R6 (usuario): desnivel (morro ↔ techo) = SALTO, sincronizado con los clips medidos (UAL): Jump_Start empieza
            // agachada (fotograma 0) y despega a los ~0,07 s con las piernas recogidas que luego estira; Jump_Land toca a los
            // ~0,07 s y amortigua (cadera de 0,95 a 0,47 m y vuelta en ~0,6 s)
            const air = 0.48, a = npc.actions.get('JumpStart');
            npc.playOnce('JumpStart', 0.18, 0);                                                            // se agacha
            g.sim.after(0.22, () => { if (!alive()) return; if (a) a.timeScale = 1.6;                      // impulso
              g.sim.after(0.05, () => { if (!alive()) return; npc.glide(p, yaw, air, true, Math.abs(dh) / 2 + 0.25);   // vuelo: vértice 0,25 m sobre el punto alto
                g.sim.after(air, () => { if (!alive()) return; npc.playOnce('JumpLand', 0.06, 1.25, 0.07); g.sim.after(0.45, () => next(i + 1)); }); }); });
          } else { npc.play('Walk', 0.2); npc.glide(p, yaw, d / 0.55, true); g.sim.after(d / 0.55, () => next(i + 1)); }
        });
      };
      next(1);   // el punto 0 es donde se ha levantado
    });
  }
  /** Vuelta al asiento tras la charla: deshace el camino, se gira como estaba y se sienta (no bloquea a ANMI). */
  private sitDown(who: BridgeNpc, my: number) {
    const g = this.g, npc = g.npcs.get(who)?.[0], home = npc?.home; if (!npc || !home) return;
    const alive = () => this.turn[who] === my, back = this.route[who].slice().reverse();
    // desde donde esté (puede no haber terminado de subir): el tramo de vuelta empieza en el punto del camino más cercano
    let from = 0, best = Infinity; back.forEach((p, i) => { const d = p.distanceTo(npc.root.position); if (d < best) { best = d; from = i; } });
    const path = [npc.root.position.clone(), ...back.slice(from)];
    void this.walk(npc, path, alive).then(() => {
      if (!alive()) return; npc.play('Idle', 0.3); npc.glide(npc.root.position, home.yaw, 0.45);
      g.sim.after(0.45, () => { if (!alive()) return; npc.play(npc.idle, 0.5); npc.glide(home.pos, home.yaw, 0.6); });
    });
  }
  /** Solo pruebas (gancho ?bktest): da por escuchadas las dos frases y revela el premio. No existe en el juego normal. */
  debugComplete() { const st = this.g.state; st.setBridgeHeard('aissa'); st.setBridgeHeard('juseph'); if (st.complete('bridgeTalk')) this.g.revealReward('tratratra'); }
}

// ================================================================== FASHION GIRL — baile por stages con cuenta atrás (V6)
// D6-01: tres stages de 10 / 5 / 3 s con secuencias de 3 / 4 / 5 pulsaciones (cuatro flechas). D6-04: una flecha errónea
// reinicia la secuencia del stage SIN devolver tiempo (respuesta breve, sin bloqueo). D6-05: salir, recargar o agotar el tiempo
// descartan el intento (siempre se empieza en el stage 1; nada parcial se guarda); pausa/segundo plano congelan el timer (reloj
// de simulación); las celebraciones no consumen tiempo. D6-06: las cinco chicas bailan el MISMO clip que ANMI cuando ella
// baila y animan en las demás fases. D6-07: al superar el stage 3 aparece la patata física junto a la salida lateral.
// V10.1 P25 (usuario, 19 oct): 15 / 10 / 5 s y 4 flechas en las tres rondas, con secuencias FIJAS (las mismas cada vez), de fácil a difícil
export const DANCE_STAGES = [{ secs: 15, presses: 4 }, { secs: 10, presses: 4 }, { secs: 5, presses: 4 }];
/** V10.1 P25 (D1-12): 1) vuelta completa · 2) pares · 3) cruce (sin tres iguales seguidas). */
export const DANCE_SEQS: Dir[][] = [['up', 'right', 'down', 'left'], ['up', 'up', 'down', 'down'], ['left', 'right', 'up', 'left']];
const ARROW: Record<string, string> = { up: '▲', down: '▼', left: '◀', right: '▶' };
const DIRS: Dir[] = ['up', 'right', 'down', 'left'];
export const DANCE_CLIPS = { loop: 'Step_Hip_Hop_Dance', rounds: ['Hip_Hop_Dance_1', 'Hip_Hop_Dance_2', 'Hip_Hop_Dance_3'], final: 'FunnyDancing_02' };
/** Secuencia de `n` flechas sin tres iguales seguidas (aleatoria por intento; la misma tras un error). */
export function danceSequence(n: number, rnd = Math.random): Dir[] {
  const out: Dir[] = [];
  while (out.length < n) { const d = DIRS[Math.floor(rnd() * 4)]; if (out.length >= 2 && out[out.length - 1] === d && out[out.length - 2] === d) continue; out.push(d); }
  return out;
}
/** V10.2 Q05 (usuario, literal): lo que dicen las chicas de FASHION GIRL al retar y al perder. */
export const FG_START = '¡Gánanos a una batalla de baile y te daremos un regalo!', FG_END = 'Bueno, ahí lo tienes, pero nosotras siempre seremos mejores haciendo trends!';
export class DanceCombo extends Session {
  id = 'danceCombo';
  stage = 0; idx = 0; seq: Dir[] = []; pulse = 0;
  /** Cuenta atrás del stage en curso (reloj de simulación): activa solo mientras se reciben flechas. */
  timer: { deadline: number; secs: number } | null = null;
  ending = false;
  /** Registro del intento (pruebas): eventos con tiempo de simulación. */
  trace: { t: number; e: string }[] = [];
  private celebration: { id: number; next: () => void; t0: number } | null = null;
  private cheerT = 0;
  boardProp: THREE.Object3D | null = null;
  constructor(g: Game) {
    super(g);
    // R11 (SIS-27): con dos pulgares que se solapan (el nuevo toca antes de que suelte el anterior) no había `click`: no contaba nada
    document.querySelectorAll<HTMLButtonElement>('#dance-pad button').forEach((b) => { if (b.dataset.tap) return; b.dataset.tap = '1'; onTap(b, (e) => { e.preventDefault(); b.blur(); this.press(b.dataset.k as Dir); }); });
    ($('dance-exit') as HTMLButtonElement).onclick = () => { this.log('salir'); this.end(); };
  }
  private log(e: string) { this.trace.push({ t: +this.g.sim.now.toFixed(3), e }); if (this.trace.length > 300) this.trace.shift(); }
  private girls() { return this.g.npcs.get('bella') ?? []; }
  /** Las chicas acompañan a ANMI con su mismo clip (si el derivado lo trae; si no, su bucle de ánimo). */
  girlsDance(clip: string, loop: boolean) {
    for (const girl of this.girls()) if (!girl.playSync(`Dance_${clip}`, loop, 0.3) && loop) girl.setLoop('Sway', 0.3, 1.05);
  }
  /** Las chicas animan (gestos escalonados) y vuelven a su reposo de ánimo. */
  girlsCheer(rest = true) {
    const t = this.token;
    this.girls().forEach((girl, i) => {
      if (rest) girl.setLoop('Sway', 0.35, 0.95 + i * 0.03);
      this.g.sim.after(i * 0.16, () => girl.gesture(i % 3 === 1 ? 'Jump' : 'Cheer', 0.25, 1.1, i % 3 === 1 ? 2.6 : 0), t);
    });
  }
  onDir(d: Dir) { if (this.busy && !this.g.paused && !$('dance').hidden) this.press(d); }
  update(dt: number) {
    const g = this.g;
    if (this.busy) {
      // timeout: se evalúa en el paso fijo; una pulsación posterior al plazo no cuenta (press() compara con el mismo reloj)
      if (this.timer && g.sim.now >= this.timer.deadline) this.timeout();
      return;
    }
    if (g.mode !== 'explore') return;
    this.offerOnFoot('act.danceCombo', g.state.p.activities.danceCombo ? 'BAILAR OTRA VEZ' : 'BAILAR', () => this.start());
    // fuera del baile, si ANMI se acerca a la pista, las chicas la animan de vez en cuando
    const c = g.manifest.get('dance.center').pos, s = g.skater!;
    this.cheerT -= dt;
    if (this.cheerT <= 0 && Math.hypot(s.footPos.x - c.x, s.footPos.z - c.z) < 9 && !(g.activities.find((a) => a.id === 'freeDance') as any)?.fgDancing) {
      this.cheerT = 4 + Math.random() * 2.5;
      const list = this.girls(); if (list.length) list[Math.floor(Math.random() * list.length)].gesture('Cheer', 0.3, 1.0);
    }
  }
  present(dt: number) {
    const g = this.g;
    if (g.park.danceFloorMat) g.park.danceFloorMat.emissiveIntensity = 1.2 + (g.state.p.settings.reducedMotion ? 0 : Math.sin(g.clock * 6.3) * 0.25) + this.pulse * 1.6;
    this.pulse = Math.max(0, this.pulse - dt * 1.4);
    for (const h of g.park.fgSpotHalos) { h.material.opacity = 0.55 + this.pulse * 0.45; h.scale.setScalar(0.9 + this.pulse * 0.5); }
    if (!this.busy) return;
    const el = $('dance-timer'), bar = el.querySelector('i') as HTMLElement, txt = $('dance-time');
    const st = DANCE_STAGES[this.stage]; if (!st) return;   // V10.2 Q05: ganado, mientras Bella dice su frase final (no hay stage 4)
    const left = this.timer ? Math.max(0, this.timer.deadline - g.sim.now) : (this.celebration ? st.secs : 0);
    bar.style.transform = `scaleX(${(left / st.secs).toFixed(4)})`;
    txt.textContent = this.timer ? left.toFixed(1) + ' s' : this.celebration ? '¡Bien!' : '0.0 s';
    el.classList.toggle('low', !!this.timer && left < Math.min(1.5, st.secs * 0.34));
    el.classList.toggle('frozen', !this.timer);
  }
  setBoardParked(parked: boolean) {
    const g = this.g;
    g.visual.setBoardVisible?.(!parked);
    if (parked && !this.boardProp) {
      const a = g.manifest.get('board.park');
      const prop = (g.visual as any).makeBoardProp?.() ?? new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.04, 0.8), new THREE.MeshStandardMaterial({ color: '#F18AAE' }));
      prop.position.copy(a.pos); prop.rotation.set(0, a.heading, 0);
      g.scene.add(prop); this.boardProp = prop;
    } else if (!parked && this.boardProp) { this.boardProp.removeFromParent(); this.boardProp = null; }
  }
  start() {
    const g = this.g; if (this.busy) return;
    const t = this.begin('baile');
    avisos.actividad('danceCombo', 'empieza', g.state.p.activities.danceCombo);   // V10.6 (B5)
    this.trace = []; this.stage = 0; this.ending = false; this.timer = null; this.celebration = null; this.firstWin = false;
    g.state.setPartial('danceRounds', 0);   // D6-05: no hay parciales de baile (compatibilidad del campo V5)
    t.onCancel(() => { $('dance').hidden = true; this.setBoardParked(false); this.timer = null; this.celebration = null; this.ending = false;
      g.visual.play?.('skate', { fade: 0.3 }); for (const [i, girl] of this.girls().entries()) girl.setLoop('Sway', 0.4, 0.92 + i * 0.07); this.log('fin'); });
    // V10.2 Q05 (D-05a, D-12): mientras el baile NO esté ganado, Bella reta a ANMI antes de cada intento; ganado, BAILAR OTRA VEZ va directo
    if (!g.state.p.activities.danceCombo) void this.bellaSays(t, FG_START).then(() => { if (t.alive) this.go(); });
    else this.go();
  }
  /** V10.2 Q05: la chica más cercana a ANMI habla (las demás siguen bailando): ANMI se aparta a ~1,4 m y plano de charla (Q01, Q03). */
  private async bellaSays(t: Token, line: string) {
    const g = this.g, s = g.skater!, girls = this.girls(); if (!girls.length) return;
    s.vel.set(0, 0, 0); s.frozen = true;
    const girl = girls.reduce((m, x) => (x.root.position.distanceTo(s.footPos) < m.root.position.distanceTo(s.footPos) ? x : m), girls[0]);
    const q = standOff(g, girl.root.position, t);
    girl.faceTo(q); girl.gesture('Cheer', 0.3, 1.0);
    talkCam(g, girl.root, { foot: q });
    g.audio.sfx('talk'); this.log(`bella: ${line}`);
    await say('Bella', line, { token: t });   // frases literales del usuario (D-05a)
  }
  private firstWin = false;
  /** El baile en sí (antes `start` entero): pista, cámara y primer stage. */
  private go() {
    const g = this.g, t = this.token!;
    this.setBoardParked(true);
    const c = g.manifest.get('dance.center');
    g.skater!.teleport(c.pos, c.heading, 'walk'); g.skater!.frozen = true;
    g.visual.play?.(DANCE_CLIPS.loop, { loop: true, fade: 0.3 });
    this.girlsDance(DANCE_CLIPS.loop, true);
    // encuadre por volúmenes: ANMI de pies a cabeza, las cinco chicas y la tabla aparcada (vertical y horizontal)
    const up = (v: THREE.Vector3, h: number) => v.clone().add(new THREE.Vector3(0, h, 0));
    // (la tabla aparcada queda fuera del encuadre obligatorio: en vertical ensanchaba el plano y empequeñecía a ANMI)
    const fit = [up(c.pos, 0), up(c.pos, 1.85), ...this.girls().flatMap((n) => [up(n.root.position, 0), up(n.root.position, 1.75)])];
    g.rig.toFixed({ pos: g.manifest.get('cam.dance').pos, target: up(c.pos, 1.0), hfov: 66, fit });
    $('dance').hidden = false;
    // R11 (SIS-32, PADX-03): el foco va al panel, no al botón ▲ (Espacio/Enter o A del mando lo pulsaban y contaban como «↑»)
    try { const d = $('dance'); d.tabIndex = -1; d.focus({ preventScroll: true }); } catch { /* */ }
    void t;
    this.log('inicio');
    this.showStage();
  }
  showStage() {
    const st = DANCE_STAGES[this.stage];
    this.idx = 0; this.seq = (DANCE_SEQS[this.stage] ?? danceSequence(st.presses)).slice();   // V10.1 P25: fija
    $('dance-round').textContent = String(this.stage + 1);
    this.renderSeq();
    $('dance-msg').textContent = 'Repite la secuencia antes de que acabe el tiempo';
    this.timer = { deadline: this.g.sim.now + st.secs, secs: st.secs };
    this.log(`stage ${this.stage + 1} ${st.secs}s ${this.seq.join(',')}`);
  }
  private renderSeq() { $('dance-seq').innerHTML = this.seq.map((k) => `<span aria-label="${k}">${ARROW[k]}</span>`).join(''); }
  press(k: Dir) {
    const g = this.g;
    if (!this.busy || g.paused || this.ending) return;
    if (this.celebration) { this.skipCelebration(); return; }
    if (!this.timer || g.sim.now >= this.timer.deadline) return;   // después del plazo no cuenta ningún acierto
    const spans = $('dance-seq').querySelectorAll('span');
    if (k === this.seq[this.idx]) {
      spans[this.idx]?.classList.add('ok'); g.audio.sfx('step', this.idx * 4 + this.stage * 2);
      this.idx++; this.pulse = Math.min(1, this.pulse + 0.35);
      this.log(`ok ${k}`);
      if (this.idx === this.seq.length) this.stageWon();
    } else {
      // D6-04: vuelve al principio de la MISMA secuencia, el tiempo sigue corriendo; aviso breve sin bloquear la entrada
      g.audio.sfx('fail'); this.log(`error ${k}`);
      this.idx = 0; this.renderSeq();
      const sp = $('dance-seq').querySelectorAll('span'); sp[0]?.classList.add('bad');
      g.sim.after(0.3, () => sp[0]?.classList.remove('bad'), this.token);
      $('dance-msg').textContent = '¡Casi! Desde el principio';
    }
  }
  stageWon() {
    const g = this.g, t = this.token!;
    const left = this.timer ? this.timer.deadline - g.sim.now : 0;
    this.timer = null;   // la celebración no consume tiempo del siguiente stage
    const won = this.stage + 1;
    this.log(`stage ${won} superado (${left.toFixed(2)} s restantes)`);
    $('dance-msg').textContent = ['¡Bien!', '¡Fuego!', '¡BRUTAL!'][this.stage];
    g.audio.sfx('success'); this.pulse = 1;
    if (won >= 3 && g.state.complete('danceCombo')) { this.firstWin = true; g.revealReward('fashion_girl'); }
    if (!g.state.p.settings.reducedMotion) g.bursts.emit(g.skater!.footPos.clone().add(new THREE.Vector3(0, 1.6, 0)), ['#F18AAE', '#9A6BFF', '#4FB8FF'][this.stage], 24, 3.5, 0.22);
    const clip = won >= 3 ? DANCE_CLIPS.final : DANCE_CLIPS.rounds[this.stage];
    g.visual.play?.(clip, { loop: false, fade: 0.25 });
    this.girlsDance(clip, false);   // mismo clip, mismo instante
    const secs = (g.visual as any).meta?.[clip]?.seconds ?? 3;
    const next = () => {
      this.celebration = null; this.stage = won;
      if (this.stage >= 3) { toast('¡Combo completo!', 2200); this.log('completo');
        // V10.2 Q05 (D-05a): la primera vez que se gana, Bella contesta; las siguientes, nada
        const after = () => { if (!t.alive) return; if (this.firstWin) { $('dance').hidden = true; void this.bellaSays(t, FG_END).then(() => { if (t.alive) this.end(); }); } else this.end(); };
        // V10.4 R17 (usuario: «al acabar la actividad de FG, antes del diálogo, bailen las chicas y ANMI haciendo el break 1990»): todos a la vez, entero
        const B = 'Breakdance_1990', bs = (g.visual as any).meta?.[B]?.seconds ?? 6;
        $('dance').hidden = true; g.visual.play?.(B, { loop: false, fade: 0.3 }); this.girlsDance(B, false); this.log('break final');
        g.sim.after(Math.max(1, bs - 0.3), after, t); }
      else { g.visual.play?.(DANCE_CLIPS.loop, { loop: true, fade: 0.3 }); this.girlsDance(DANCE_CLIPS.loop, true); this.showStage(); }
    };
    g.sim.after(0.6, () => { if (this.celebration) $('dance-msg').textContent += ' · pulsa para seguir'; }, t);
    this.celebration = { id: g.sim.after(Math.max(0.5, secs - 0.25), next, t), next, t0: g.sim.now };
  }
  /** D6-01/05: se acabó el tiempo → sale del baile; el siguiente intento empieza en el stage 1. */
  timeout() {
    const g = this.g, t = this.token!;
    this.timer = null; this.ending = true;
    this.log(`timeout stage ${this.stage + 1}`);
    avisos.actividad('danceCombo', 'falla', g.state.p.activities.danceCombo);   // V10.6 (B5): se acabó el tiempo
    g.audio.sfx('fail');
    $('dance-msg').textContent = '¡Se acabó el tiempo! Vuelve a empezar desde el stage 1';
    g.visual.play?.('skate', { fade: 0.3 });
    this.girlsCheer(true);   // animan a volver a intentarlo
    g.sim.after(1.4, () => { if (this.token === t) this.end(); }, t);
  }
  skipCelebration() {
    const c = this.celebration; if (!c || this.g.sim.now - c.t0 < 0.4) return;  // no saltar con la propia pulsación final
    this.g.sim.clear(c.id); this.log('celebración saltada'); c.next();
  }
  debugComplete() { if (this.g.state.complete('danceCombo')) this.g.revealReward('fashion_girl'); }
}

// ================================================================== SECRETNOVIO — reto final V10 (sustituye al triple V3–V9)
/** Recorrido (dossier §3/§6): escalera (LadderClimb, escalera `sn`) → coronación de A → ¡BAJAR! en el carril → descenso PEGADO a la pared
 *  vertical → curva inferior continua → llano 5 m → B → SALTO (una pulsación en ventana generosa, D-SN-06) → vuelo asistido del contrato
 *  (g 8, cima 8 m, 2,55 s) con TRUCAZO automático (3 backflips + giro 360° + grab, D-SN-02) → recepción en D → frenado dentro de D → libre.
 *  Sin SALTO, B lanza como rampa normal con la física del juego: no llega a D (cae en hormigón) → reintento al pie de la escalera.
 *  Todo el recorrido está en hormigón (|x| ≤ 6, Z −13,8…12,75 < r 16): los coches del anillo no lo cruzan. */
/** Registro de intentos para las pruebas: SOLO con ?bktest (fuera de las pruebas el juego no consulta los ganchos de prueba). */
const SJ_TEST = import.meta.env.DEV || new URLSearchParams(location.search).has('bktest');
export const SNJ = {
  edgeRoll: 0.45,        // s: del carril al borde de la coronación
  v0: 1.8,               // m/s al dejar el borde
  g: 9.81,               // descenso asistido por la pared y la curva (energía de caída libre)
  flatZ: -8.6, footZ: -3.6, lipZ: 0, lipY: 2, wallZ: -11.8, deckY: 7, R: 3.2,
  jumpFromZ: -8.0,       // ventana de SALTO: desde poco después de la curva hasta el labio (+0,15 s de gracia tras despegar)
  vLip: Math.hypot(9.797958971132712, 3.92523136562825),
  flight: { vy: 9.797958971132712, vz: 3.92523136562825, g: 8, y0: 2, land: { y: 1, z: 10 } },
  // V10.2 Q08 (D-08, usuario: «que vuelvan a ser 5… más ágil… que los trucos se vean conectados»): cinco círculos ENCADENADOS (el primero al
  // 4 % del vuelo; cada uno sale al acertar el anterior, D2-04), anillo de 0,5 s (antes 0,9), ventana ±25 %, 3 fallos = automático. Cada
  // truco dura `trick` s de vuelo: lo que tarda en cerrarse el anillo siguiente (se ven seguidos, sin huecos)
  circles: [{ kind: 'backflip', label: 'BACKFLIP' }, { kind: 'spin', label: 'GIRO 360' }, { kind: 'backflip', label: 'BACKFLIP' }, { kind: 'grab', label: 'GRAB' }, { kind: 'backflip', label: 'BACKFLIP' }] as { kind: 'backflip' | 'spin' | 'grab'; label: string }[],
  firstAt: 0.04, gap: 0.04, ring: 0.5, window: 0.25, autoAfter: 3, slow: 0.5, trick: 0.24,
  brake: 4.2,            // m/s² en D (de 3,9 m/s se para en ~1,8 m: dentro de los 5,5 m libres)
};
/** V10.2 Q08: dónde sale cada uno de los cinco círculos (% de la pantalla). */
const SN_SPOTS: [number, number][] = [[70, 46], [58, 34], [78, 34], [62, 56], [76, 52]];
/** V10.5 (AM-33, E5-28): en vertical (lógico), en la parte de abajo y repartidos a lo ancho (antes, a la derecha: en 320 px el aviso se cortaba y el
 *  círculo tapaba a ANMI, que va en el centro de la pantalla). El primero, centrado (lleva el aviso). */
const SN_SPOTS_PORT: [number, number][] = [[50, 72], [28, 64], [72, 64], [32, 80], [68, 80]];
export class SecretJump implements Activity {
  id = 'secretJump'; busy = false;
  phase: 'idle' | 'edge' | 'run' | 'flight' | 'brake' | 'fall' | 'done' = 'idle';
  attempts = 0; successes = 0; failures: string[] = [];
  armed = false; s = 0; v = 0; t = 0; apex = 0; telemetry: any = null;
  /** V10.1 P04: círculo en curso (índice, progreso del anillo 0…1,25 en tiempo real, fallos de ESTE truco) y momento (tiempo de vuelo) de cada acierto. */
  circle: { i: number; p: number; misses: number; looping: boolean } | null = null; cStage = 0; hits: (number | null)[] = SNJ.circles.map(() => null); autoDone = 0; circleLog: { i: number; ok: boolean; p: number; auto?: boolean }[] = [];
  private tok: Token | null = null; private from = new THREE.Vector3(); private fromH = 0; private landZ = 0;
  constructor(public g: Game) { addEventListener('mousedown', (e) => { if (this.circle && this.phase === 'flight' && !(e.target as HTMLElement)?.closest?.('.hc-core, #pause, .screen, button')) this.tryHit(); }); }   // R5 (QA C9): ni los botones del HUD (pausa)
  get inAttempt() { return this.phase === 'edge' || this.phase === 'run' || this.phase === 'flight' || this.phase === 'brake'; }
  /** Trayectoria del recorrido en el plano (z, y) por longitud de arco s: borde → pared vertical → cuarto → llano → B (muestras del contrato). */
  private path = (() => {
    const P: [number, number][] = [], K = (SN_KIT as any), W = K.wall, R = W.quarter_radius, off = 0.08;   // la tabla, 8 cm fuera de la superficie
    P.push([W.face_z - 0.4, W.deck_height]); P.push([W.face_z + off, W.deck_height - 0.05]);
    for (let y = W.deck_height - 0.2; y > W.base_height; y -= 0.2) P.push([W.face_z + off, y]);
    for (let i = 0; i <= 24; i++) { const a = Math.PI + (i / 24) * Math.PI / 2; P.push([W.quarter_ground_z + (R - off) * Math.cos(a), W.base_height + (R - off) * Math.sin(a)]); }
    for (let z = W.quarter_ground_z + 0.5; z < K.kicker.start_z; z += 0.5) P.push([z, off]);
    for (const [z, y] of K.kicker.profile_samples_world_z_y as [number, number][]) P.push([z, y + off * 0.6]);
    const S = [0]; for (let i = 1; i < P.length; i++) S.push(S[i - 1] + Math.hypot(P[i][0] - P[i - 1][0], P[i][1] - P[i - 1][1]));
    const at = (s: number) => { s = THREE.MathUtils.clamp(s, 0, S[S.length - 1]); let i = 1; while (i < S.length - 1 && S[i] < s) i++; const k = (s - S[i - 1]) / Math.max(1e-6, S[i] - S[i - 1]);
      const z = P[i - 1][0] + (P[i][0] - P[i - 1][0]) * k, y = P[i - 1][1] + (P[i][1] - P[i - 1][1]) * k, dz = P[i][0] - P[i - 1][0], dy = P[i][1] - P[i - 1][1], L = Math.hypot(dz, dy) || 1;
      return { z, y, tz: dz / L, ty: dy / L }; };
    return { at, length: S[S.length - 1] };
  })();
  preStep(f: InputFrame) {
    if (this.phase === 'flight' && this.circle && f.jumpPressed) { this.tryHit(); return true; }   // V10.1 P04: Espacio / A / SALTO
    if (this.phase === 'run' && f.jumpPressed && !this.armed) {
      const p = snL(this.g.skater!.footPos);   // V10.1: marco del reto
      if (p.z >= SNJ.jumpFromZ) { this.armed = true; this.g.audio.sfx('arm'); this.telemetry.armZ = +p.z.toFixed(2); this.g.input.setHot(false); return true; }
    }
    return this.inAttempt && f.jumpPressed;
  }
  update(dt: number) {
    const g = this.g, s = g.skater!;
    if (!g.centerOpen) { if (this.busy) this.cancel(); return; }
    document.body.classList.toggle('reto-sn', this.inAttempt);   // IT3: durante el reto solo queda SALTO (chip y botones no hacen nada)
    if (this.phase === 'idle' || this.phase === 'done') {
      // IT3: el plano de celebración dura hasta que se cierra el preview (o 6 s si no llega a abrirse); después, seguimiento normal
      if (this.heroCam === 1 && (g.mode === 'preview' || g.clock - this.heroT > 6)) this.heroCam = g.mode === 'preview' ? 2 : 0;
      if (this.heroCam !== 1 && this.heroCam !== 0 && g.mode === 'explore') { this.heroCam = 0; g.rig.toFollow(s); }
      if (this.heroCam === 0 && this.heroWas) { this.heroWas = false; if (g.mode === 'explore') g.rig.toFollow(s); }
      if (g.mode !== 'explore') return;
      const z = g.park.zones.get('sn.drop'); if (z && inZone(z, s.footPos)) g.offerAction('¡BAJAR!', () => this.start(), this.id); else g.withdrawAction(this.id);
      return;
    }
    this.t += dt * this.timeScale();
    if (this.phase === 'edge' || this.phase === 'run') {
      const start = this.phase === 'edge';
      if (start) { const k = Math.min(1, this.t / SNJ.edgeRoll), p0 = this.path.at(0); const p = this.from.clone().lerp(new THREE.Vector3(0, p0.y, p0.z), k * k * (3 - 2 * k)); s.placeKinematic(snW(p), snH(0)); if (k >= 1) { this.phase = 'run'; this.t = 0; this.s = 0; this.v = SNJ.v0; g.visual.play?.('SK_CrouchRide', { loop: true, fade: 0.25 }); } return; }   // IT3 (H2): al tirarse, agachada patinando (antes pose en A)
      // velocidad: energía de caída (asistida) por la pared y la curva; en B se asiste a la velocidad de lanzamiento del contrato
      const cur = this.path.at(this.s), dyStep = -cur.ty;   // bajando, ty < 0
      this.v = Math.sqrt(Math.max(SNJ.v0 * SNJ.v0, this.v * this.v + 2 * SNJ.g * dyStep * Math.max(0, this.v) * dt));
      if (cur.z > SNJ.footZ) this.v += (SNJ.vLip - this.v) * Math.min(1, 6 * dt);
      this.s += this.v * dt;
      const p = this.path.at(this.s);
      s.placeKinematic(snW(new THREE.Vector3(0, p.y, p.z)), snH(0));
      (g.visual as any).setExtPose?.({ up: snW(new THREE.Vector3(0, p.tz, -p.ty).normalize()), flip: 0, spin: 0 });   // tabla apoyada en la superficie: normal = tangente (z, y) girada +90° = (0, tz, −ty)
      this.telemetry.samples.push([+g.clock.toFixed(3), 0, +p.y.toFixed(2), +p.z.toFixed(2), +this.v.toFixed(2)]);
      if (!this.armed && p.z >= SNJ.jumpFromZ && !this.hot) { this.hot = true; g.input.setHot(true); hint(`¡<b>SALTA</b>${g.input.source === 'gamepad' ? ' (A)' : matchMedia('(pointer: coarse)').matches ? '' : ' (Espacio)'}!`, 1200); }
      if (this.s >= this.path.length - 1e-3) this.launch();
      return;
    }
    if (this.phase === 'flight') {
      const F = SNJ.flight, T = this.armed ? this.tFlight : 0;
      if (this.armed) {
        const t = Math.min(this.t, T), y = F.y0 + F.vy * t - F.g / 2 * t * t, z = SNJ.lipZ + F.vz * t;
        s.placeKinematic(snW(new THREE.Vector3(0, y, z)), snH(0)); this.apex = Math.max(this.apex, y);
        const k = t / T;
        // V10.1 P04 (D05 a): cada truco se hace al ACERTAR su círculo; V10.2 Q08: cinco, encadenados (el siguiente sale `gap` s de vuelo
        // después de acertar el anterior, mientras ese truco aún se está haciendo)
        const N = SNJ.circles.length, prevHit = this.cStage > 0 ? this.hits[this.cStage - 1] : null;
        if (!this.circle && this.cStage < N && (this.cStage === 0 ? k >= SNJ.firstAt : prevHit !== null && t - prevHit >= SNJ.gap)) this.openCircle(this.cStage);
        if (this.circle) this.stepCircle(dt);
        const e = (x: number) => { x = THREE.MathUtils.clamp(x, 0, 1); return x * x * (3 - 2 * x); };
        let flip = 0, spin = 0, grabAt: number | null = null;
        SNJ.circles.forEach((C, i) => { const h = this.hits[i]; if (h === null) return; const q = e((t - h) / SNJ.trick);
          if (C.kind === 'backflip') flip -= Math.PI * 2 * q; else if (C.kind === 'spin') spin += Math.PI * 2 * q; else grabAt = h; });
        (g.visual as any).setExtPose?.({ up: null, flip, spin });
        const inGrab = grabAt !== null && t - grabAt < SNJ.trick + 0.06;
        if (inGrab !== this.grabbing) { this.grabbing = inGrab; g.visual.play?.(inGrab ? 'SK_Grab' : 'SK_FlipOpen', { loop: inGrab, fade: 0.12 }); }
        this.telemetry.samples.push([+g.clock.toFixed(3), 0, +y.toFixed(2), +z.toFixed(2), this.hits.filter((h) => h !== null).length]);
        if (this.t >= T && !this.circle && this.cStage >= SNJ.circles.length) this.land();
      }
      return;
    }
    if (this.phase === 'brake') {
      const vz = Math.max(0, SNJ.flight.vz - SNJ.brake * this.t), z = this.landZ + SNJ.flight.vz * this.t - SNJ.brake * this.t * this.t / 2;
      if (vz <= 0) { this.success(); return; }
      s.placeKinematic(snW(new THREE.Vector3(0, SNJ.flight.land.y, z)), snH(0));
      return;
    }
    if (this.phase === 'fall') {   // sin SALTO: física real del juego tras el labio; se resuelve al tocar suelo
      if (s.grounded && this.t > 0.15) this.fail('Sin SALTO no hay trucazo: vuelve a la escalera y pulsa SALTO al llegar a la rampa');
    }
  }
  private hot = false; private grabbing = false; private tFlight = 0; private heroCam: 0 | 1 | 2 = 0; private heroT = 0; private heroWas = false;
  /** V10 IT3 (feedback: «al saltar, más épica, como una animación cinematográfica»): cámara lenta en el centro del vuelo (×0,45 entre el
   *  25 % y el 70 %, con rampas suaves), nunca con «reducir movimiento». El vuelo sigue el mismo modelo de tiempo (cima, recepción). */
  private timeScale() {
    if (this.phase !== 'flight' || !this.armed || !this.tFlight) return 1;
    const reduced = this.g.state.p.settings.reducedMotion;
    // V10.1 P04: con un círculo esperando, el vuelo va a cámara lenta (×0,45) y, tras un fallo, casi congelado (×0,12) con el anillo en
    // bucle; con «reducir movimiento», sin cámara lenta: el vuelo se detiene mientras haya un círculo
    if (this.circle) return reduced ? 0 : this.circle.looping ? 0.12 : SNJ.slow;
    if (reduced || this.cStage >= SNJ.circles.length) return 1;   // V10.2 Q08: hechos los cinco, sin cámara lenta (el vuelo cabe en < 4 s)
    const k = this.t / this.tFlight, sm = (a: number, b: number, x: number) => THREE.MathUtils.smoothstep(x, a, b);
    return 1 - 0.55 * sm(0.18, 0.3, k) * (1 - sm(0.66, 0.78, k));
  }
  /** V10.1 P04: círculos del vuelo (interfaz DOM: núcleo pulsable + anillo que se cierra; tiempo REAL, no el del vuelo). */
  private hcEl() { return document.getElementById('hit-circle'); }
  private openCircle(i: number) {
    const C = SNJ.circles[i]; this.circle = { i, p: 0, misses: 0, looping: false };
    const el = this.hcEl(); if (!el) return;
    el.hidden = false; el.classList.remove('hit', 'miss', 'good'); (el.querySelector('.hc-name') as HTMLElement).textContent = C.label;
    { const SP = orient.height > orient.width ? SN_SPOTS_PORT : SN_SPOTS, [x, y] = SP[i % SP.length]; el.style.left = `${x}%`; el.style.top = `${y}%`; }   // V10.2 Q08 · V10.5: vertical
    (el.querySelector('.hc-key') as HTMLElement).textContent = this.g.input.source === 'gamepad' ? 'A' : 'Espacio';
    (el.querySelector('.hc-msg') as HTMLElement).textContent = i === 0 ? '¡Pulsa cuando el anillo llegue al círculo!' : '';
    const core = el.querySelector('.hc-core') as HTMLButtonElement;
    if (!core.dataset.tap) { core.dataset.tap = '1'; onTap(core, (e) => { e.preventDefault(); e.stopPropagation(); core.blur(); this.tryHit(); }); }
    this.g.audio.sfx('arm');
  }
  private stepCircle(dt: number) {
    const c = this.circle!, el = this.hcEl();
    c.p += dt / SNJ.ring;
    if (c.p > 1 + SNJ.window) {   // fallo: el anillo vuelve a empezar y el vuelo casi se para; al 3.er fallo el truco se hace solo (D06 b)
      c.misses++; this.circleLog.push({ i: c.i, ok: false, p: +c.p.toFixed(2) }); this.g.audio.sfx('deny');
      if (c.misses >= SNJ.autoAfter) { this.autoDone++; this.hitNow(true); return; }
      c.p = 0; c.looping = true;
      if (el) { el.classList.add('miss'); (el.querySelector('.hc-msg') as HTMLElement).textContent = c.misses === 1 ? '¡Otra vez! Pulsa cuando coincidan' : '¡Casi! Una más y lo hace sola'; setTimeout(() => el.classList.remove('miss'), 250); }
    }
    if (el) { const sc = 1 + 1.2 * Math.max(0, 1 - c.p); el.style.setProperty('--hc', String(sc)); el.style.setProperty('--hcp', `${Math.min(100, c.p * 100).toFixed(0)}%`);
      el.classList.toggle('good', c.p >= 1 - SNJ.window && c.p <= 1 + SNJ.window); }
  }
  /** Pulsación (toque en el círculo, Espacio, A, SALTO o clic): cuenta si el anillo está a ±25 % del círculo; antes de tiempo no penaliza. */
  tryHit() {
    const c = this.circle; if (!c || this.phase !== 'flight') return false;
    if (c.p < 1 - SNJ.window) { const el = this.hcEl(); if (el) (el.querySelector('.hc-msg') as HTMLElement).textContent = 'Aún no… espera al anillo'; return false; }
    this.circleLog.push({ i: c.i, ok: true, p: +c.p.toFixed(2) }); this.hitNow(false); return true;
  }
  private hitNow(auto: boolean) {
    const c = this.circle!, el = this.hcEl(), C = SNJ.circles[c.i];
    this.hits[c.i] = Math.min(this.t, this.tFlight); this.circle = null; this.cStage = c.i + 1;
    if (auto) this.circleLog.push({ i: c.i, ok: true, p: 1, auto: true });
    this.g.audio.sfx('trick'); toast(`¡${C.label}!`, 900);
    if (el) { el.classList.add('hit'); (el.querySelector('.hc-msg') as HTMLElement).textContent = auto ? 'Te ayudo con este' : '¡Bien!'; setTimeout(() => { if (!this.circle) el.hidden = true; el.classList.remove('hit'); }, 260); }
  }
  private closeCircles() { this.circle = null; const el = this.hcEl(); if (el) el.hidden = true; }
  private setCine(on: boolean) { document.body.classList.toggle('cine', on && !this.g.state.p.settings.reducedMotion); }
  start() {
    const g = this.g, s = g.skater!; if (this.inAttempt) return;
    avisos.actividad('secretnovio', 'empieza', g.state.p.finalDone);   // V10.6 (B5)
    this.attempts++; this.phase = 'edge'; this.t = 0; this.armed = false; this.hot = false; this.grabbing = false; this.apex = 0;
    this.circle = null; this.cStage = 0; this.hits = SNJ.circles.map(() => null); this.circleLog = [];   // V10.1 P04 · V10.2: cinco
    this.telemetry = { start: g.clock, samples: [] as number[][] };
    this.tok = new Token('secretnovio'); this.busy = true;
    g.withdrawAction(this.id); g.setMode('final');
    this.from.copy(snL(s.footPos)); this.from.y -= TUNING.kccOffset; this.fromH = s.heading;   // V10.1: en el marco del reto
    if (!s.riding) s.teleport(s.footPos.clone().setY(s.footPos.y - TUNING.kccOffset), s.heading, 'ride');   // la bajada se hace en tabla
    s.vel.set(0, 0, 0); s.frozen = true;
    g.visual.play?.('SK_Ride', { loop: true, fade: 0.2 });
    // cámara (IT3): persecución por detrás en la bajada; plano cinematográfico en el vuelo (ver camPose)
    g.rig.toScripted?.(() => this.camPose());
    g.audio.sfx('whoosh', 0.6);
  }
  /** V10.1: la cámara se calcula en el marco del reto y se lleva al mundo. */
  private camPose() { const c = this.camPoseL(); return { pos: snW(c.pos), look: snW(c.look), hfov: c.hfov }; }
  private camPoseL() {
    const p = snL(this.g.skater!.visualPos), ph = this.phase, reduced = this.g.state.p.settings.reducedMotion, W = (SN_KIT as any).wall;
    if ((ph === 'flight' && this.armed) || ph === 'brake') {
      if (reduced) return { pos: new THREE.Vector3(9.5, p.y + 1.2, p.z - 1.5), look: new THREE.Vector3(0, p.y + 0.6, p.z + 1.0), hfov: 62 };
      if (ph === 'brake') return { pos: new THREE.Vector3(5.5, p.y + 2.0, p.z - 3.0), look: new THREE.Vector3(0, p.y + 0.8, p.z + 1.5), hfov: 64 };   // abierto: D, montículos y anillo
      // V10 IT3 · plano cinematográfico del trucazo: la cámara gira alrededor de ANMI de detrás (θ = π) a su lado (π/2) y a tres cuartos de
      // frente (π/6), en contrapicado en la cima y con un leve acercamiento; al final se abre para ver la recepción en D
      const k = THREE.MathUtils.clamp(this.t / Math.max(1e-3, this.tFlight), 0, 1), e = k * k * (3 - 2 * k);
      const th = Math.PI - e * (5 * Math.PI / 6), r = 6.8 - 1.6 * Math.sin(Math.PI * k), h = 0.2 + 1.4 * k;
      const c = new THREE.Vector3(0, p.y + 0.7, p.z);
      return { pos: new THREE.Vector3(c.x + Math.sin(th) * r, c.y + h - 0.9 * Math.sin(Math.PI * k), c.z + Math.cos(th) * r), look: c, hfov: 62 - 10 * Math.sin(Math.PI * k) };
    }
    // V10 IT3 (feedback: «la bajada desde la rampa verse desde atrás como normal»): persecución por detrás y por encima, como el seguimiento
    // del juego (5,5 m detrás, 2,6 m arriba, mirando a ANMI); pegada a la pared vertical la cámara queda 2,4 m delante del muro mirándola desde arriba
    if (p.y > W.deck_height - 0.4) return { pos: new THREE.Vector3(0.7, p.y + 2.4, p.z - 4.8), look: new THREE.Vector3(0, p.y + 0.6, p.z + 2.5), hfov: 64 };   // arriba: detrás, sobre la coronación
    // bajando por la pared y por el llano: detrás y a un lado (tres cuartos), mirando por delante de ANMI. Justo detrás no cabe (el muro de
    // 7 m queda detrás): la cámara se pegaba encima de ANMI y la pantalla se llenaba de suelo (cam-cases, fotogramas planos)
    return { pos: new THREE.Vector3(5.0, p.y + 2.4, Math.max(p.z - 4.0, W.face_z + 2.0)), look: new THREE.Vector3(0, p.y + 0.9, p.z + 0.6), hfov: 62 };   // siempre centrada en ANMI, fuera de la anchura de la curva
  }
  private launch() {
    const g = this.g, s = g.skater!, F = SNJ.flight;
    g.input.setHot(false);
    this.telemetry.launch = { at: g.clock, armed: this.armed, v: +this.v.toFixed(2) };
    if (this.armed) {
      // vuelo asistido del contrato: v (0; 9,798; 3,925) m/s, g 8 → cima 8 m en 1,22 s, aterrizaje (0; 1; 10) en 2,548 s
      this.phase = 'flight'; this.t = 0;
      this.tFlight = (F.vy + Math.sqrt(F.vy * F.vy - 2 * F.g * (F.land.y - F.y0))) / F.g;
      g.audio.sfx('whoosh', 1); g.visual.play?.('SK_Air', { loop: false, fade: 0.1 });
      // IT3: arranque épico: franjas de cine, estallido rosa en el labio y un golpe de cámara (sin él con «reducir movimiento»)
      this.setCine(true); g.bursts.emit(snW(new THREE.Vector3(0, SNJ.lipY + 0.2, SNJ.lipZ)), '#F18AAE', 26, 3.2, 0.35);
      if (!g.state.p.settings.reducedMotion) g.rig.shake = 0.25;
    } else {
      // sin SALTO: B lanza como una rampa normal con la física del juego (gravedad común): no llega a D
      this.phase = 'fall'; this.t = 0; this.failures.push('sin-salto');
      (g.visual as any).setExtPose?.(null); s.frozen = false; g.visual.play?.('skate', { fade: 0.2 });   // V10.1 P11: la caída con la física del juego
      const a = Math.atan2(F.vy, F.vz), v = this.v;
      s.teleport(snW(new THREE.Vector3(0, SNJ.lipY + 0.02, SNJ.lipZ)), snH(0), 'ride'); s.launch(snW(new THREE.Vector3(0, 0, v * Math.cos(a))), v * Math.sin(a), 1);
    }
  }
  private land() {
    const g = this.g, s = g.skater!;
    (g.visual as any).setExtPose?.(null); g.visual.play?.('SK_Land', { loop: false, fade: 0.08 }); this.setCine(false);
    g.audio.sfx('land', 6); if (!g.state.p.settings.reducedMotion) g.rig.shake = 0.35;
    g.bursts.emit(s.footPos.clone().add(new THREE.Vector3(0, 0.1, 0)), '#F18AAE', 18, 2.2, 0.3);
    this.telemetry.land = { at: g.clock, apex: +this.apex.toFixed(2), z: +snL(s.footPos).z.toFixed(2), circles: this.circleLog.slice(), hits: this.hits.filter((h) => h !== null).length };
    this.closeCircles();
    this.phase = 'brake'; this.t = 0; this.landZ = snL(s.footPos).z;
  }
  private success() {
    const g = this.g, s = g.skater!;
    this.phase = 'done'; this.successes++;
    if (SJ_TEST) (window as any).__bkFinalLog = [...((window as any).__bkFinalLog ?? []), { ...this.telemetry, samples: undefined, ok: true }];
    this.cleanup();
    s.teleport(s.footPos.clone(), snH(0), 'ride');
    const first = g.state.setFinalJump();
    // IT3: plano de celebración mientras se abre el preview: ANMI de frente sobre D con el mural de A detrás (antes, el seguimiento
    // normal enfocaba suelo y asfalto y, oscurecido tras el preview, quedaba un gris casi uniforme)
    { const f = snL(s.footPos); this.heroCam = 1; this.heroT = g.clock; this.heroWas = true; g.rig.toScripted?.(() => ({ pos: snW(new THREE.Vector3(f.x + 2.2, f.y + 1.9, f.z + 4.6)), look: snW(new THREE.Vector3(f.x, f.y + 1.3, f.z - 1.5)), hfov: 58 })); }
    g.bursts.emit(s.footPos.clone().add(new THREE.Vector3(0, 1.5, 0)), '#F18AAE', 30, 4, 0.3);
    g.audio.sfx('reward');
    g.onFinalSuccess(first);
  }
  private fail(msg: string) {
    const g = this.g, s = g.skater!;
    this.phase = 'idle'; g.audio.sfx('fail'); toast(msg, 3200);
    avisos.actividad('secretnovio', 'falla', g.state.p.finalDone);   // V10.6 (B5): intento sin trucazo
    if (SJ_TEST) (window as any).__bkFinalLog = [...((window as any).__bkFinalLog ?? []), { ...this.telemetry, samples: undefined, ok: false, why: msg }];
    this.cleanup();
    g.sim.after(1.4, () => { if (g.mode !== 'explore') return; const a = g.manifest.get('sn.retry'); s.teleport(a.pos, a.heading, 'walk'); g.rig.toFollow(s, true); toast('Sube por la escalera del muro para intentarlo otra vez', 2400); });
  }
  private cleanup() {
    const g = this.g, s = g.skater!;
    this.busy = false; this.armed = false; this.tok?.cancel(); this.tok = null; this.setCine(false); document.body.classList.remove('reto-sn'); this.closeCircles();   // V10.1 P04
    (g.visual as any).setExtPose?.(null); s.frozen = false; s.gravityScale = 1;
    g.visual.play?.('skate', { fade: 0.3 });   // V10.1 P11: el clip forzado del reto (SK_CrouchRide / SK_Land) se quedaba puesto para siempre
    if (g.mode === 'final') g.setMode('explore');
    g.rig.toFollow(s); g.input.setHot(false);
  }
  cancel() { if (this.inAttempt || this.phase === 'fall') { this.phase = 'idle'; this.cleanup(); } }
  debugComplete() { this.g.state.setFinalJump(); this.g.onFinalSuccess(true); }
}
