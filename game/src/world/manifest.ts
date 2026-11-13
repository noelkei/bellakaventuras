// Manifiesto tipado del remake: autoridad única de coordenadas, sectores, IDs de patatas, actividades y audio.
// Convención (auditoría 06): metros; glTF/three Y arriba; origen en el centro de SECRETNOVIO; θ = 0° hacia el norte (−Z),
// θ creciente en sentido horario visto desde arriba: pos = (r·sinθ, h, −r·cosθ).
// Las medidas son de greybox ajustadas jugando (ver CONTINUE.md): el centro se amplió de r 18 a r 22 para que quepan
// el circuito de drifting y el corredor del backflip sin encoger el aterrizaje. V4 (HUM-A4-008, decisión final del
// usuario): radio exterior 46 → 42 m, centro 22 m constante → corona de 24 → 20 m; paseo exterior r 38–42; banda
// edificable entre paseos r 25–38 (13 m). El cuadrado ±52 y su espacio común se conservan.
import * as THREE from 'three';

export const WORLD = {
  half: 52,          // cuadrado exterior: X/Z en [−52, 52]
  rCenter: 22,       // disco central de SECRETNOVIO
  rOuter: 42,        // borde exterior de la corona (V4: 46 → 42)
  innerPath: [22, 25] as const,   // paseo interior (anillo)
  outerPath: [38, 42] as const,   // paseo exterior (V4: 42–46 → 38–42)
  sectorDeg: 72,
};

/** Reubicación radial orientativa del plan V4 (cap. 07): r' = 25 + (r − 25)·13/17 para la banda 25–42 (V3) → 25–38, y el
 *  paseo exterior V3 42–46 → 38–42. Solo POSICIONES (nunca alturas, anchos ni escalas). Los módulos que no caben se
 *  recolocan a mano en su sector (TRATRATRA, NOSVAMOSDEAQUI) y NO ME GUILLO tiene planta propia. */
export function remapV3Radius(r: number) {
  if (r <= 25) return r;
  if (r <= 42) return 25 + (r - 25) * 13 / 17;
  if (r <= 46) return 38 + (r - 42);
  return r;
}

export type ZoneId = 'no_me_guillo' | 'nosvamosdeaqui' | 'yinyang' | 'tratratra' | 'fashion_girl';
export type CenterId = 'secretnovio';   // V10: renombrado integral (dossier SECRETNOVIO §7); el guardado antiguo no guarda este id
export type ActivityId = 'pantherTalk' | 'skateTutorial' | 'graffiti' | 'bridgeTalk' | 'danceCombo';
export type FryKind = 'visible' | 'medium' | 'hidden' | 'activity';

export interface SectorDef {
  id: ZoneId;
  name: string;           // rótulo del HUD
  song: string;           // título
  axis: number;           // θ del eje central (grados)
  activity: ActivityId;
  activityLabel: string;
}

/** V10 (Bola de Oro §07, decisión humana): giro HORARIO de la corona de 9° respecto a V3–V9. En polar suma 9° (θ' = θ + 9°); en un
 *  rumbo/yaw three (atan2(dx, dz), rotation.y) RESTA 9°. Se aplica UNA sola vez, en el origen de cada marco: ejes de SECTORS, marcos de
 *  NMG/FG/TT/YY y θ literales de los kits (ver V10/plan/_diag/corona-consumidores.md). El centro y el exterior NO giran. */
export const CORONA_ROT_DEG = 9;
const CR = CORONA_ROT_DEG * Math.PI / 180;
/** θ polar (grados) de un dato de la corona escrito con la orientación de V3–V9 → orientación V10. */
export const coronaTh = (th: number) => th + CORONA_ROT_DEG;
/** Rumbo/yaw three (radianes) de un dato de la corona escrito con la orientación de V3–V9 → V10. */
export const coronaYaw = (yaw: number) => yaw - CR;
/** Punto de mundo (x, z) de la corona escrito con la orientación de V3–V9 → V10 (rotación three −9° alrededor del origen). */
export function coronaXZ(x: number, z: number): [number, number] { const c = Math.cos(CR), s = Math.sin(CR); return [c * x - s * z, s * x + c * z]; }

/** Orden recomendado antihorario (guía y precarga; NO concede ni bloquea nada). Ejes V3–V9 + CORONA_ROT_DEG (V10). */
export const SECTORS: SectorDef[] = [
  { id: 'no_me_guillo', name: 'NO ME GUILLO', song: 'NO ME GUILLO', axis: coronaTh(36), activity: 'pantherTalk', activityLabel: 'Habla con La Pantera' },
  { id: 'nosvamosdeaqui', name: 'NOSVAMOSDEAQUI', song: 'NOSVAMOSDEAQUI', axis: coronaTh(324), activity: 'skateTutorial', activityLabel: 'Sube al puente y habla con Bellakat' },   // V10: grind de RG1 (clave interna conservada, D-NV-01)
  // R11 (GUIA-03, GUIA-02): el objetivo dice dónde (frente al muro no pasaba nada; Aissa y Juseph no se ven desde la plaza)
  { id: 'yinyang', name: 'YINYANG', song: 'YINYANG', axis: coronaTh(252), activity: 'graffiti', activityLabel: 'Habla con Bellakroak para pintar el muro' },
  { id: 'tratratra', name: 'TRATRATRA', song: 'TRATRATRA', axis: coronaTh(180), activity: 'bridgeTalk', activityLabel: 'Sube a la limo y habla con Aissa y Juseph' },
  { id: 'fashion_girl', name: 'FASHION GIRL', song: 'FASHION GIRL', axis: coronaTh(108), activity: 'danceCombo', activityLabel: 'Sube a pie a la pista de baile y pulsa BAILAR' },   // R11 (ING-01, partida ingenua B11)
];
export const SECTOR_BY_ID = Object.fromEntries(SECTORS.map((s) => [s.id, s])) as Record<ZoneId, SectorDef>;
export const START_ZONE: ZoneId = 'no_me_guillo';
export const RECOMMENDED_ORDER: ZoneId[] = SECTORS.map((s) => s.id);
export const RECOMMENDED_DIRECTION = 'counterclockwise';
export const FRY_KINDS: FryKind[] = ['visible', 'medium', 'hidden', 'activity'];
export const ALL_FRY_IDS: string[] = SECTORS.flatMap((s) => FRY_KINDS.map((k) => `${s.id}.${k}`));
export const ACTIVITY_OF_ZONE = Object.fromEntries(SECTORS.map((s) => [s.id, s.activity])) as Record<ZoneId, ActivityId>;
export const ZONE_OF_ACTIVITY = Object.fromEntries(SECTORS.map((s) => [s.activity, s.id])) as Record<ActivityId, ZoneId>;
export const TOTAL_FRIES = ALL_FRY_IDS.length; // 20

export function polar(r: number, thetaDeg: number, h = 0, out = new THREE.Vector3()) {
  const t = THREE.MathUtils.degToRad(thetaDeg);
  return out.set(r * Math.sin(t), h, -r * Math.cos(t));
}
/** θ (grados, 0..360) y radio de un punto del suelo. */
export function toPolar(p: { x: number; z: number }) {
  const r = Math.hypot(p.x, p.z);
  let th = THREE.MathUtils.radToDeg(Math.atan2(p.x, -p.z));
  if (th < 0) th += 360;
  return { r, th };
}
/** Rumbo three (atan2(dx, dz)) que mira desde a hacia b. */
export function headingTo(a: THREE.Vector3, b: THREE.Vector3) { return Math.atan2(b.x - a.x, b.z - a.z); }

export function angleDelta(a: number, b: number) { return ((a - b + 540) % 360) - 180; }

/** Sector exterior que contiene θ (corona o perímetro); null si está en el centro. */
export function zoneAt(p: { x: number; z: number }): ZoneId | null {
  const { r, th } = toPolar(p);
  if (r < WORLD.rCenter) return null;
  let best: SectorDef = SECTORS[0], bd = 999;
  for (const s of SECTORS) { const d = Math.abs(angleDelta(th, s.axis)); if (d < bd) { bd = d; best = s; } }
  return best.id;
}

export interface FrySpawn {
  id: string; zone: ZoneId; kind: FryKind;
  pos: THREE.Vector3;           // punto del suelo/superficie donde se apoya
  hover: number;                // altura de la malla sobre el apoyo
  trigger: THREE.Vector3;       // semiextensiones del volumen de recogida (acotado, 3D)
  availability: 'initial' | ActivityId;
  access: 'roll' | 'ollie' | 'crouch' | 'camera' | 'ramp';
  hint: string;                 // pista de diseño (no se muestra como coordenada)
  /** V6: ventana ABSOLUTA de altura del pie [min, max] para recoger (patata suspendida o en el túnel hundido). Sin ella rige la
   *  ventana estándar relativa al apoyo. */
  reach?: [number, number];
  returnRoute: string;
}

/** `lift`: altura del radiocasete sobre `pos` (por defecto 0,3 m: el de su zócalo; V5 ART-15 NMG = 0, en el suelo). */
export interface CassetteSpawn { zone: ZoneId | CenterId; pos: THREE.Vector3; heading: number; lift?: number }
export interface Checkpoint { id: string; zone: ZoneId | CenterId; pos: THREE.Vector3; heading: number }
/** V7: escalera de mano trepable (activities.LadderClimb). `axis` = punto del plano de los peldaños a la cota `bottom`;
 *  `heading` = rumbo de quien trepa (de cara a la pared); `top` = cota de desembarco y `topPos` el punto donde queda de pie;
 *  `footZone`/`topZone` = zonas (Park.zones) donde se ofrece agarrarse. Alturas ABSOLUTAS (la base puede no ser el suelo). */
export interface LadderDef { id: string; axis: THREE.Vector3; heading: number; bottom: number; top: number; topPos: THREE.Vector3; footZone: string; topZone: string;
  /** V7 R6: ancho entre largueros y paso de peldaños (m) para el agarre de las manos; por defecto los de FG (0,60 / 0,22). */
  width?: number; rung?: number;
  /** V10.1 P20: ciclos de trepa por segundo de ESTA escalera (por defecto LadderClimb.RATE = 1). */
  rate?: number }

/** Contenedor que rellenan los constructores de sector (world/park.ts). El validador comprueba el resultado. */
export class WorldManifest {
  fries: FrySpawn[] = [];
  cassettes: CassetteSpawn[] = [];
  checkpoints: Checkpoint[] = [];
  ladders: LadderDef[] = [];
  anchors = new Map<string, { pos: THREE.Vector3; heading: number }>();
  spawn = { pos: new THREE.Vector3(), heading: 0 };

  anchor(id: string, pos: THREE.Vector3, heading = 0) { this.anchors.set(id, { pos: pos.clone(), heading }); }
  get(id: string) { const a = this.anchors.get(id); if (!a) throw new Error(`anchor ${id}`); return a; }

  /** Barrera del contrato 09: veinte IDs únicos, cuatro por exterior, dentro de su sector y del cuadrado; nada en el centro. */
  validate(): string[] {
    const errs: string[] = [];
    const ids = this.fries.map((f) => f.id);
    if (new Set(ids).size !== ids.length) errs.push('IDs de patata duplicados');
    if (ids.length !== TOTAL_FRIES) errs.push(`hay ${ids.length} patatas, se esperan ${TOTAL_FRIES}`);
    for (const id of ALL_FRY_IDS) if (!ids.includes(id)) errs.push(`falta ${id}`);
    for (const f of this.fries) {
      const z = zoneAt(f.pos);
      if (z !== f.zone) errs.push(`${f.id} está en ${z}, no en su sector`);
      if (Math.abs(f.pos.x) > WORLD.half - 1 || Math.abs(f.pos.z) > WORLD.half - 1) errs.push(`${f.id} fuera del cuadrado`);
      if (toPolar(f.pos).r < WORLD.rCenter + 0.5) errs.push(`${f.id} dentro del centro`);
      if (f.kind === 'activity' && f.availability !== SECTOR_BY_ID[f.zone].activity) errs.push(`${f.id}: premio sin su actividad`);
      if (f.kind !== 'activity' && f.availability !== 'initial') errs.push(`${f.id}: explorable no inicial`);
      if (f.trigger.x > 1.2 || f.trigger.y > 1.4 || f.trigger.z > 1.2) errs.push(`${f.id}: trigger demasiado grande`);
    }
    for (const s of SECTORS) if (!this.cassettes.find((c) => c.zone === s.id)) errs.push(`sin cassette en ${s.id}`);
    if (!this.cassettes.find((c) => c.zone === 'secretnovio')) errs.push('sin cassette central');
    if (this.cassettes.length !== 6) errs.push(`${this.cassettes.length} cassettes (se esperan 6)`);
    // V10 (Bola de Oro §05, §16): la partida nueva empieza en la plaza exterior (40, 0, −40), que por ángulo pertenece a NO ME GUILLO
    if (Math.hypot(this.spawn.pos.x - 40, this.spawn.pos.z + 40) > 0.01 || zoneAt(this.spawn.pos) !== START_ZONE) errs.push('la partida nueva no empieza en la plaza exterior');
    return errs;
  }
}
