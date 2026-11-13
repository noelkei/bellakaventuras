// Guardado del parque (clave propia). Versión INTERNA 4 (= juego V3); la 3 era la del parque V2. El save de plantas
// ('bellakaventuras.save') no se toca: solo se importan volumen/silencio. Contadores derivados del conjunto de IDs.
// Migración explícita 3→4: conserva IDs, actividades, ajustes, checkpoint y el derecho al preview ya ganado (prueba
// 'legacy_single'); nunca convierte el backflip simple V2 en evidencia de tres vueltas.
// Parciales (D10): tutorial por paso, puente por último descanso, grafiti por máscara compacta, baile por rondas.
import { ALL_FRY_IDS, ActivityId, SECTORS, ZoneId, ZONE_OF_ACTIVITY, TOTAL_FRIES, FRY_KINDS, coronaXZ, coronaYaw, WORLD, zoneAt } from './world/manifest';
import * as avisos from './avisos';   // V10.6 (B5)
const zoneOf = (c: { x: number; z: number }) => zoneAt(c);

export const SAVE_KEY = 'bellakaventuras.remake.save';
export const OLD_SAVE_KEY = 'bellakaventuras.save';
export const SAVE_VERSION = 5;   // V10: 4 → 5 (migrate4to5: giro de corona del checkpoint; …)
/** V8: rejilla lógica de la diana del grafiti en el frente de T1 (arco 120° × 2,40 m; celdas ≈ 1,75 cm). V3–V7: 160 × 100 del muro
 *  antiguo: un parcial de esa diana no es compatible (se reinicia SOLO ese intento, con aviso). */
export const GRAFFITI_GRID = { w: 120, h: 138 };
export const GRAFFITI_TARGET_REV = 8;
const ACTIVITIES: ActivityId[] = ['pantherTalk', 'skateTutorial', 'graffiti', 'bridgeTalk', 'danceCombo'];

export interface Settings {
  volume: number; muted: boolean;
  // V4: «giro clásico» y «montaje automático» retirados (conducción local única y tabla explícita, HUM-A4-002/003);
  // los guardados antiguos que los traen se aceptan y se ignoran (validSettings no los copia).
  advancedControls: boolean; // botón EXTRA visible en táctil
  camSens: number;           // 0.5..1.6
  invertY: boolean;
  reducedMotion: boolean;
  /** R11 (SIS-09): el jugador eligió el ajuste a mano; si no, manda la preferencia del sistema «reducir movimiento». */
  reducedMotionSet?: boolean;
  /** V5 T5-18: orientación preferida (aditivo, sin subir SAVE_VERSION: los guardados v4 cargan con 'auto'). */
  orientation: 'auto' | 'vertical' | 'horizontal';
  /** V7 R8: en escritorio con ratón, JUGAR captura el puntero (cámara con el ratón sin clic). Aditivo: los guardados previos cargan con sí. */
  mouseLock: boolean;
  /** V10.1 P05 (D07): tamaño de los botones en pantalla, 0,5–2 (50–200 %). Aditivo: los guardados previos cargan con 1. */
  btnScale: number;
  /** V10.1 P01 (D01): en iPhone ya se preguntó por el modo app (pantalla de inicio). Aditivo. */
  iosAppAsked: boolean;
  /** V10.4 R20 (usuario): controles táctiles para zurdos (botones a la izquierda, joystick a la derecha). Aditivo: los guardados previos cargan con no. */
  leftHanded: boolean;
  /** V10.5 (E5-33): «Modo eficiente» (solo táctil): sombras más cortas y repartidas, personajes lejanos a menos ritmo, tope de pasos de física y
   *  limitador de audio más ligero. Aditivo: los guardados previos cargan con no. */
  eficiente: boolean;
  /** V10.5 ronda PORTADA: música de la radio de ANMI en la pantalla de inicio (se pulsa la radio). Ausente = sí (no va en DEFAULT_SETTINGS). */
  radioPortada?: boolean;
}
export interface SafePoint { x: number; y: number; z: number; heading: number }
export interface Partials {
  tutorialStep: number;          // 0..4 paso pendiente (0 sin empezar)
  tutorialStarted: boolean;
  bridgeRest: number;            // V3–V6: último descanso del puente antiguo. V7 lo acepta al leer y ya no gobierna nada
  /** V7 (aditivo, sin subir SAVE_VERSION): charlas individuales TERMINADAS en TRA TRA TRA. Hacen falta las dos (en cualquier
   *  orden) para completar `bridgeTalk`; repetir a uno no sustituye al otro. Los guardados anteriores cargan con ambos en false. */
  bridgeHeard: { aissa: boolean; juseph: boolean };
  graffitiMask: string | null;   // máscara GRAFFITI_GRID en bits, base64 (TODAS las celdas pintadas, dentro y fuera del dibujo)
  graffitiCheck: number;         // nº de celdas pintadas (comprobación de integridad)
  /** V8 (aditivos, sin subir SAVE_VERSION): diana del parcial, recorrido exterior acumulado (m) del intento en curso y si ya se
   *  escucharon las cuatro frases de la rana. El error de área se recalcula de la máscara: recargar no borra el error. */
  graffitiRev: number;
  graffitiErrRun: number;
  graffitiIntro: boolean;
  danceRounds: number;           // 0..3 rondas completas
}
export type FinalProof = { kind: 'legacy_single'; migratedAt: string } | { kind: 'triple_v3'; at: string; turns: number } | { kind: 'secretnovio_v10'; at: string };   // V10: reto de SECRETNOVIO (D-SN-08: las antiguas se conservan)
export interface Progress {
  version: number;
  collected: string[];
  activities: Record<ActivityId, boolean>;
  bridgeReached: boolean;
  finalDone: boolean;            // derecho al preview
  finalProof: FinalProof | null;
  revealSeen: boolean;
  checkpoint: SafePoint | null;
  checkpointRevision: number;    // revisión de geometría en la que se guardó el checkpoint
  /** R11 (SIS-01, aditivo sin subir SAVE_VERSION): linaje de la partida. «Reiniciar» crea uno nuevo; dos pestañas solo fusionan su
   *  progreso dentro del mismo linaje (una pestaña vieja no resucita una partida reiniciada en otra). Guardados previos: ''. */
  saveEpoch: string;
  /** V10 (D-SV-01): pasos de migración V10 aplicados dentro de la versión 5 (1 = giro de corona del checkpoint). Aditivo. */
  migV10: number;
  partials: Partials;
  hints: string[];
  settings: Settings;
  /** V10.1 P09 (D11): los 12 últimos grafitis de SKILLS (cuál, centro, normal de la superficie, «arriba» del dibujo, tamaño en m). Aditivo. */
  skillGraffiti: SkillGraffiti[];
  /** V10.4: recorrido 2D (aditivo). */
  narr: Narr;
}
/** V10.4 (dossier 04 §11, W-D36): estado del recorrido con los anfitriones 2D. `estado`: 'nuevo' (partida nueva: tutorial en la plaza),
 *  'tutorial-hecho' (falta la bienvenida), 'hecho', 'antigua' (partida de antes de V10.4: sin tutorial ni bienvenida; se le pregunta una vez
 *  por el modo ayuda) u 'off' (solo pruebas con ?bktest&narr=off). `vistos`: frases y bloques confirmados (se marcan al avanzar).
 *  `ayuda`: respuesta a «¿quieres que te echemos una mano?» (null = aún no se ha preguntado). */
export interface Narr { v: 1; estado: 'nuevo' | 'tutorial-hecho' | 'hecho' | 'antigua' | 'off'; paso: string; practica: boolean; vistos: string[]; ayuda: 'si' | 'no' | null;
  /** V10.6 (H8-02, H8-03, H8-11): bloques del recorrido ofrecidos y aún sin terminar (`PAS:<zona>`, `FIN`, `DES`): se vuelven a ofrecer al
   *  recargar. Opcional: los guardados de antes no lo tienen y se comportan como siempre. */
  pend?: string[] }
export const freshNarr = (): Narr => ({ v: 1, estado: 'nuevo', paso: '', practica: false, vistos: [], ayuda: null });
export interface SkillGraffiti { i: number; p: [number, number, number]; n: [number, number, number]; u: [number, number, number]; s: number }
/** V10 (D-SV-01): último paso de migración V10 (cada ronda que cambia geometría o claves añade uno, idempotente y en orden). */
export const MIG_V10 = 4;   // 2 = NVDA (V10 R5) · 3 = SECRETNOVIO (V10 R7) · 4 = V10.5 (orientación a «Automática»; en táctil, otra vez la pregunta del modo ayuda)
export const GEOMETRY_REVISION = 7; // subir al mover piezas: los checkpoints se revalidan contra el suelo actual (V7: TRA TRA TRA nuevo; V8: piscina YINYANG; V10: giro de corona, exterior, NVDA, SECRETNOVIO)

export const DEFAULT_SETTINGS: Settings = { volume: 0.8, muted: false, advancedControls: true, camSens: 1, invertY: false, reducedMotion: false, orientation: 'auto', mouseLock: true, btnScale: 1, iosAppAsked: false, leftHanded: false, eficiente: false };
const freshPartials = (): Partials => ({ tutorialStep: 0, tutorialStarted: false, bridgeRest: -1, bridgeHeard: { aissa: false, juseph: false }, graffitiMask: null, graffitiCheck: 0, graffitiRev: GRAFFITI_TARGET_REV, graffitiErrRun: 0, graffitiIntro: false, danceRounds: 0 });
export type BridgeNpc = 'aissa' | 'juseph';

/** V10.2 Q14 + R-14: ¿hay algo jugado? Cualquier campo de progreso cuenta (también solo grafitis de SKILLS): decide CONTINUAR y «Borrar y
 *  empezar» en el inicio y si una pestaña puede adoptar el linaje de otra sin perder nada. Los avisos (`hints`) y los ajustes no cuentan. */
export function hasProgress(p: Progress) {
  const q = p.partials, bh = q.bridgeHeard;
  return p.collected.length > 0 || Object.values(p.activities).some(Boolean) || p.bridgeReached || p.finalDone || p.revealSeen || !!p.checkpoint
    || q.tutorialStarted || bh.aissa || bh.juseph || !!q.graffitiMask || q.graffitiIntro || (p.skillGraffiti?.length ?? 0) > 0
    || (!!p.narr && ((p.narr.estado !== 'nuevo' && p.narr.estado !== 'off') || p.narr.vistos.length > 0 || p.narr.practica));   // V10.4: un tutorial empezado también es partida (el «off» de las pruebas no)
}

export function freshProgress(settings?: Partial<Settings>): Progress {
  return {
    version: SAVE_VERSION, collected: [],
    activities: { pantherTalk: false, skateTutorial: false, graffiti: false, bridgeTalk: false, danceCombo: false },
    bridgeReached: false, finalDone: false, finalProof: null, revealSeen: false, checkpoint: null, checkpointRevision: GEOMETRY_REVISION,
    partials: freshPartials(), hints: [], settings: { ...DEFAULT_SETTINGS, ...(settings ?? {}) },
    saveEpoch: newEpoch(), migV10: MIG_V10, skillGraffiti: [], narr: freshNarr(),
  };
}

const newEpoch = () => `${Date.now().toString(36)}-${Math.floor(Math.random() * 1e9).toString(36)}`;
const num = (v: unknown) => typeof v === 'number' && Number.isFinite(v);
const int = (v: unknown, lo: number, hi: number, def: number) => (num(v) && Number.isInteger(v) && (v as number) >= lo && (v as number) <= hi ? (v as number) : def);

function validSettings(s: any): Settings {
  const o = { ...DEFAULT_SETTINGS };
  if (!s || typeof s !== 'object') return o;
  if (num(s.volume)) o.volume = Math.min(1, Math.max(0, s.volume));
  if (typeof s.muted === 'boolean') o.muted = s.muted;   // R11 (SIS-04): «no»/«false» en texto no valen como verdadero
  if (typeof s.advancedControls === 'boolean') o.advancedControls = s.advancedControls;
  if (num(s.camSens)) o.camSens = Math.min(1.6, Math.max(0.5, s.camSens));
  if (typeof s.invertY === 'boolean') o.invertY = s.invertY; if (typeof s.reducedMotion === 'boolean') o.reducedMotion = s.reducedMotion;
  if (s.reducedMotionSet === true) o.reducedMotionSet = true;
  if (s.orientation === 'vertical' || s.orientation === 'horizontal' || s.orientation === 'auto') o.orientation = s.orientation;
  if (typeof s.mouseLock === 'boolean') o.mouseLock = s.mouseLock;
  if (num(s.btnScale)) o.btnScale = Math.min(2, Math.max(0.5, Math.round(s.btnScale * 10) / 10));   // V10.1 P05
  if (typeof s.iosAppAsked === 'boolean') o.iosAppAsked = s.iosAppAsked;   // V10.1 P01
  if (typeof s.leftHanded === 'boolean') o.leftHanded = s.leftHanded;   // V10.4 R20
  if (typeof s.eficiente === 'boolean') o.eficiente = s.eficiente;   // V10.5 (E5-33)
  if (s.radioPortada === false) o.radioPortada = false;   // V10.5 ronda PORTADA (ausente = sí)
  return o;
}

/** Máscara de grafiti: base64 de 160×100 bits; inválida → null (solo se reinicia el mural parcial). */
export function decodeMask(b64: string | null, check: number): Uint8Array | null {
  if (!b64 || typeof b64 !== 'string') return null;
  try {
    const bin = atob(b64); const n = GRAFFITI_GRID.w * GRAFFITI_GRID.h;
    if (bin.length !== Math.ceil(n / 8)) return null;
    const out = new Uint8Array(n); let c = 0;
    for (let i = 0; i < n; i++) if (bin.charCodeAt(i >> 3) & (1 << (i & 7))) { out[i] = 1; c++; }
    return c === check ? out : null;
  } catch { return null; }
}
export function encodeMask(m: Uint8Array) {
  const bytes = new Uint8Array(Math.ceil(m.length / 8)); let c = 0;
  for (let i = 0; i < m.length; i++) if (m[i]) { bytes[i >> 3] |= 1 << (i & 7); c++; }
  let s = ''; for (const b of bytes) s += String.fromCharCode(b);
  return { b64: btoa(s), count: c };
}

/** Migración 3→4 (V2 → V3). Devuelve el objeto en forma v4 (sin validar todavía). */
export function migrate3to4(p: any) {
  const out: any = { ...p, version: 4 };
  out.finalProof = p.finalDone === true ? { kind: 'legacy_single', migratedAt: new Date().toISOString() } : null;
  out.partials = freshPartials();
  if (p.bridgeReached === true) out.partials.bridgeRest = 4;
  out.checkpointRevision = 3;
  out.settings = { ...DEFAULT_SETTINGS, ...(p.settings ?? {}) };
  return out;
}

/** V10 · migración 4 → 5 (UNA vez: tras ella el guardado es versión 5 y no se vuelve a migrar). Giro de corona (Bola de Oro §07): un
 *  checkpoint guardado en la corona (r 22–42, salvo el corredor del centro de V3–V9, x < 0 y |z| < 3) se gira con su sector: posición
 *  rotación three −9° y rumbo −9°. Su `checkpointRevision` antigua se conserva (las migraciones por revisión de game.ts siguen valiendo
 *  sobre el punto ya girado); al recargar, game.ts lo revalida contra el suelo nuevo. Nada más cambia (patatas, actividades, ajustes). */
export function migrate4to5(p: any) {
  const out: any = { ...p, version: 5, migV10: 1 };   // paso 1 (solo desde V9: sus coordenadas son las de antes del giro)
  const c = p.checkpoint;
  if (c && num(c.x) && num(c.z) && num(c.heading)) {
    const r = Math.hypot(c.x, c.z), corridor = c.x < 0 && Math.abs(c.z) < 3 && r < WORLD.rCenter + 1.5;
    if (r >= WORLD.rCenter && r <= WORLD.rOuter && !corridor) {
      const [x, z] = coronaXZ(c.x, c.z);
      out.checkpoint = { ...c, x: +x.toFixed(2), z: +z.toFixed(2), heading: +coronaYaw(c.heading).toFixed(3) };
      out.__coronaRotated = true;
    }
  }
  return out;
}

/** Valida y repara: tipos, IDs, duplicados, coherencia actividad↔premio, puente↔charla, final↔20/20, rangos de parciales. */
export function validate(raw: any): { p: Progress; migratedFrom: number | null } | null {
  if (!raw || typeof raw !== 'object') return null;
  let migratedFrom: number | null = null;
  let p = raw;
  if (p.version === 3) { p = migrate3to4(p); migratedFrom = 3; }
  if (p.version === 4) { p = migrate4to5(p); migratedFrom = migratedFrom ?? 4; }   // V10
  if (p.version !== SAVE_VERSION) return null;
  const out = freshProgress(validSettings(p.settings));
  for (const a of ACTIVITIES) out.activities[a] = p.activities?.[a] === true;
  out.bridgeReached = p.bridgeReached === true || out.activities.bridgeTalk;
  const ids: string[] = Array.isArray(p.collected) ? p.collected.filter((id: unknown) => typeof id === 'string' && ALL_FRY_IDS.includes(id as string)) : [];
  out.collected = [...new Set(ids)].filter((id) => {
    if (!id.endsWith('.activity')) return true;
    const zone = id.split('.')[0] as ZoneId;
    return out.activities[SECTORS.find((x) => x.id === zone)!.activity];
  });
  const full = out.collected.length === TOTAL_FRIES;
  const fp = p.finalProof;
  const proofOk = fp && (fp.kind === 'legacy_single' || fp.kind === 'secretnovio_v10' || (fp.kind === 'triple_v3' && fp.turns >= 3));
  out.finalDone = p.finalDone === true && full && !!proofOk;
  out.finalProof = out.finalDone ? (fp.kind === 'triple_v3' ? { kind: 'triple_v3', at: String(fp.at ?? ''), turns: fp.turns } : fp.kind === 'secretnovio_v10' ? { kind: 'secretnovio_v10', at: String(fp.at ?? '') } : { kind: 'legacy_single', migratedAt: String(fp.migratedAt ?? '') }) : null;
  out.revealSeen = p.revealSeen === true && full;
  const c = p.checkpoint;
  out.checkpoint = c && num(c.x) && num(c.y) && num(c.z) && num(c.heading) && Math.abs(c.x) < 60 && Math.abs(c.z) < 60 && c.y > -3 && c.y < 12   // V8: el fondo N3 de YINYANG está a −2,50
    ? { x: c.x, y: c.y, z: c.z, heading: c.heading } : null;
  out.checkpointRevision = int(p.checkpointRevision, 0, 999, 0);
  const pp = p.partials ?? {};
  out.partials.tutorialStep = out.activities.skateTutorial ? 0 : int(pp.tutorialStep, 0, 4, 0);
  out.partials.tutorialStarted = !out.activities.skateTutorial && pp.tutorialStarted === true;
  out.partials.bridgeRest = out.bridgeReached ? 4 : int(pp.bridgeRest, -1, 4, -1);
  // V7: charla completada (también la conjunta de V3–V6) = los dos escuchados; si no, solo lo que diga el parcial (malformado → false).
  // `bridgeReached`/`bridgeRest` antiguos NO equivalen a haber hablado con nadie.
  { const bh = pp.bridgeHeard && typeof pp.bridgeHeard === 'object' ? pp.bridgeHeard : {};
    out.partials.bridgeHeard = out.activities.bridgeTalk ? { aissa: true, juseph: true } : { aissa: bh.aissa === true, juseph: bh.juseph === true }; }
  // V8: solo un parcial de la diana actual (rev 8) vale; uno de la diana anterior (muro V3–V7) se descarta CON aviso y sin tocar nada más
  const revOk = pp.graffitiRev === GRAFFITI_TARGET_REV;
  const mask = out.activities.graffiti || !revOk ? null : decodeMask(pp.graffitiMask ?? null, int(pp.graffitiCheck, 0, GRAFFITI_GRID.w * GRAFFITI_GRID.h, -1));
  out.partials.graffitiMask = mask ? pp.graffitiMask : null; out.partials.graffitiCheck = mask ? pp.graffitiCheck : 0;
  out.partials.graffitiErrRun = mask && num(pp.graffitiErrRun) && pp.graffitiErrRun >= 0 ? Math.min(pp.graffitiErrRun, 99) : 0;
  out.partials.graffitiIntro = pp.graffitiIntro === true || out.activities.graffiti;
  if (!out.activities.graffiti && !revOk && typeof pp.graffitiMask === 'string' && pp.graffitiMask) (out as any).__graffitiReset = true;
  out.partials.danceRounds = 0;   // V6 (D6-05): el baile ya no guarda rondas parciales; un parcial V5 incompleto vuelve al stage 1 (el éxito se conserva en activities)
  out.hints = Array.isArray(p.hints) ? p.hints.filter((h: unknown) => typeof h === 'string').slice(0, 100) : [];
  // V10.1 P09: grafitis de SKILLS (cada uno validado; los que no cuadran se descartan)
  { const v3 = (a: any) => Array.isArray(a) && a.length === 3 && a.every((x: unknown) => num(x) && Math.abs(x as number) < 200);
    out.skillGraffiti = Array.isArray(p.skillGraffiti) ? p.skillGraffiti.filter((q: any) => q && int(q.i, 0, 3, -1) >= 0 && v3(q.p) && v3(q.n) && v3(q.u) && num(q.s) && q.s > 0.2 && q.s < 4).slice(-12).map((q: any) => ({ i: q.i, p: q.p, n: q.n, u: q.u, s: q.s })) : []; }
  out.saveEpoch = typeof p.saveEpoch === 'string' ? p.saveEpoch.slice(0, 40) : '';
  // V10.4 (W-D36): sin `narr` y con progreso → partida antigua (ni tutorial ni bienvenida); sin progreso → partida nueva
  { const n = p.narr, E = ['nuevo', 'tutorial-hecho', 'hecho', 'antigua', 'off'];
    if (n && typeof n === 'object' && E.includes(n.estado)) out.narr = { v: 1, estado: n.estado, paso: typeof n.paso === 'string' ? n.paso.slice(0, 12) : '', practica: n.practica === true,
      vistos: Array.isArray(n.vistos) ? [...new Set(n.vistos.filter((x: unknown) => typeof x === 'string' && (x as string).length < 16))].slice(0, 120) as string[] : [], ayuda: n.ayuda === 'si' || n.ayuda === 'no' ? n.ayuda : null };
    else { out.narr = freshNarr(); if (hasProgress(out)) out.narr.estado = 'antigua'; }
    // V10.6: bloques pendientes del recorrido, solo valores de la lista cerrada (los de otra forma se descartan)
    if (n && typeof n === 'object' && Array.isArray(n.pend) && out.narr.estado !== 'off') {
      const P = [...new Set(n.pend.filter((x: unknown) => typeof x === 'string' && /^(FIN|DES|PAS:(nosvamosdeaqui|yinyang|tratratra|fashion_girl))$/.test(x)))].slice(0, 8) as string[];
      if (P.length) out.narr.pend = P; } }
  // V10 (D-SV-01): pasos pendientes (guardados v5 anteriores al último paso). Hoy solo existe el 1, que se aplica en migrate4to5.
  const steps = int(p.migV10, 0, 99, 0);
  out.migV10 = Math.max(steps, MIG_V10);
  if (steps < MIG_V10 && migratedFrom === null) migratedFrom = 5;
  // paso 2 (NVDA): el circuito tutorial ya no existe: su parcial se descarta con aviso (la actividad completada se conserva: D-NV-01) y un
  // checkpoint dentro del sector (geometría nueva) va al punto seguro del sector
  if (steps < 2) {
    if (!out.activities.skateTutorial && (pp.tutorialStarted === true || int(pp.tutorialStep, 0, 4, 0) > 0)) (out as any).__nvReset = true;
    out.partials.tutorialStep = 0; out.partials.tutorialStarted = false;
    const c = out.checkpoint; if (c && Math.hypot(c.x, c.z) >= 22 && Math.hypot(c.x, c.z) <= 42.5 && zoneOf(c) === 'nosvamosdeaqui') (out as any).__relocate = 'nosvamosdeaqui';
  }
  // paso 3 (SECRETNOVIO): el centro es nuevo (A, B, D, montículos): un checkpoint guardado en el disco (r < 22,5) va al punto seguro del centro
  if (steps < 3) { const c = out.checkpoint; if (c && Math.hypot(c.x, c.z) < 22.5) (out as any).__relocate = 'secretnovio'; }
  // paso 4 (V10.5, E5-06/E5-07, una sola vez): casi todas las orientaciones fijadas lo fueron sin querer (AM-01: tocar II cambiaba «Pantalla»),
  // así que vuelven a «Automática»; y en táctil, quien contestó «No» al modo ayuda (a menudo sin verla: AM-29) vuelve a ver la pregunta, en su
  // versión corta de partida que ya existía (sin repetir el tutorial). Vale también para la partida propia del modo app del iPhone.
  if (steps < 4) {
    out.settings.orientation = 'auto';
    let touch = false; try { touch = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches; } catch { /* */ }
    if (touch && out.narr.ayuda === 'no' && !out.finalDone) out.narr.ayuda = null;
  }
  return { p: out, migratedFrom };
}

export type SaveStatus = 'ok' | 'session' | 'failed';

export class GameState {
  p: Progress;
  persistent = true;             // false si localStorage no está disponible (modo privado / bloqueado)
  status: SaveStatus = 'ok';     // resultado REAL del último intento de escritura
  lastError = '';
  listeners: ((st: SaveStatus) => void)[] = [];
  loadNote = '';
  migratedFrom: number | null = null;
  writes = 0;
  /** V8: se descartó un grafiti a medias de la diana anterior (aviso una vez). */
  graffitiReset = false;

  constructor(private storage: Storage | null = safeStorage()) {
    let loaded: Progress | null = null;
    let raw: string | null = null;
    try { raw = this.storage?.getItem(SAVE_KEY) ?? null; } catch { this.persistent = false; }
    this.diskSeen = raw;
    if (!this.storage) { this.persistent = false; this.status = 'session'; }
    if (raw) {
      let parsed: any = null;
      try { parsed = JSON.parse(raw); } catch { parsed = null; }
      const v = validate(parsed);
      if (v) { loaded = v.p; this.migratedFrom = v.migratedFrom; }
      else if (parsed && typeof parsed === 'object' && typeof parsed.version === 'number' && parsed.version > SAVE_VERSION) {
        // R11 (SIS-03): una partida de una versión MÁS NUEVA del juego no se pisa nunca: se juega en modo sesión
        this.readOnly = true; this.status = 'session';
        this.loadNote = 'Tu partida es de una versión más nueva del juego: aquí se juega sin guardar para no estropearla.';
      } else {
        this.loadNote = 'Guardado ilegible o de otra versión: se empieza una partida nueva (el anterior se conserva aparte).';
        try { this.storage?.setItem(SAVE_KEY + '.corrupt.' + Date.now(), raw); } catch { /* sin espacio */ }
      }
    }
    this.p = loaded ?? freshProgress(importOldSettings(this.storage));
    // R11 (SIS-09): sin elección explícita, «reducir movimiento» del sistema activa el ajuste (no se guarda: si cambia, se sigue)
    try { if (!this.p.settings.reducedMotionSet && typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches) this.p.settings.reducedMotion = true; } catch { /* */ }
    if ((this.p as any).__nvReset) { delete (this.p as any).__nvReset; this.loadNote = 'NOSVAMOSDEAQUÍ ha cambiado: el circuito ya no está; ahora Bellakat te espera en lo alto del puente. El resto de tu partida se conserva.'; }
    if ((this.p as any).__graffitiReset) {   // V8: el mural a medias de la versión anterior no encaja en la torre nueva
      delete (this.p as any).__graffitiReset;
      this.graffitiReset = true; this.loadNote = 'YINYANG ha cambiado: tu grafiti a medias empieza de cero en la torre nueva. El resto de tu partida se conserva.'; this.save();
    }
    if (this.migratedFrom === 3) { this.loadNote = 'Partida del parque anterior importada.'; this.save(); }
    else if (this.migratedFrom === 4 || this.migratedFrom === 5) this.save();   // V10: el guardado migrado se escribe ya en versión 5 con todos los pasos (una sola vez)
  }
  get hasSave() { return hasProgress(this.p); }
  /** Escribe y comunica el resultado real (no afirma «guardado» si la escritura falla). */
  save(opts: { replace?: boolean } = {}) {
    if (!this.storage || this.readOnly) { this.status = 'session'; this.listeners.forEach((l) => l(this.status)); return false; }
    // R11 (SIS-01): otra pestaña puede haber guardado: se fusiona su progreso (mismo linaje) antes de escribir; si reinició, esta pestaña
    // deja de escribir (sería resucitar la partida borrada) y avisa
    if (!opts.replace && !this.stale) this.mergeFromDisk();
    if (this.stale) { this.status = 'failed'; this.lastError = 'stale'; this.listeners.forEach((l) => l(this.status)); return false; }
    try { const out = JSON.stringify(this.p); this.storage.setItem(SAVE_KEY, out); this.diskSeen = out; this.status = 'ok'; this.persistent = true; this.writes++; }
    catch (e: any) { this.status = 'failed'; this.persistent = false; this.lastError = String(e?.name ?? e); }
    this.listeners.forEach((l) => l(this.status));
    return this.status === 'ok';
  }
  /** Reintento manual tras un fallo de almacenamiento. */
  retrySave() { return this.save(); }
  reset() { this.p = freshProgress(this.p.settings); this.stale = false; this.readOnly = false; this.save({ replace: true }); }   // R11: «Reiniciar» es la salida explícita del modo solo lectura
  /** R11 (SIS-01). Solo lectura (partida de versión futura). */
  readOnly = false;
  /** R11 (SIS-01): otra pestaña reinició la partida; esta ya no escribe. */
  stale = false;
  /** R11 (SIS-01): avisos al juego. `onExternal` = llegó progreso de otra pestaña (aplicar en el mundo); `onStale` = reiniciada en otra. */
  onExternal: (() => void) | null = null;
  onStale: (() => void) | null = null;
  /** R11 (SIS-01): último contenido del disco que esta pestaña leyó o escribió. Si el disco no ha cambiado desde entonces no hay
   *  nada de otra pestaña que fusionar (y no se «resucita» en memoria lo que esta pestaña quitó a propósito). */
  private diskSeen: string | null = null;
  /** Lee el disco y fusiona el progreso monótono de otra pestaña del MISMO linaje. Devuelve true si cambió algo en memoria. */
  mergeFromDisk(): boolean {
    let raw: string | null = null;
    try { raw = this.storage?.getItem(SAVE_KEY) ?? null; } catch { return false; }
    if (!raw || raw === this.diskSeen) return false;
    this.diskSeen = raw;
    let parsed: any = null; try { parsed = JSON.parse(raw); } catch { return false; }
    const v = validate(parsed); if (!v) return false;
    const d = v.p, m = this.p;
    if (d.saveEpoch !== m.saveEpoch) {
      // el disco tiene otro linaje. Si esta pestaña aún no tiene progreso (dos pestañas abiertas antes de jugar), adopta el del disco;
      // si lo tiene, es que en otra se reinició (o empezó otra partida): esta queda obsoleta y no escribe (no resucita lo borrado)
      const empty = !hasProgress(m);   // V10.2 R-14: los mismos campos que «hay partida» (antes faltaban grafitis, checkpoint, puente, revelación…)
      if (!empty) { if (!this.stale) { this.stale = true; this.onStale?.(); } return false; }
      m.saveEpoch = d.saveEpoch;
    }
    let changed = false;
    for (const id of d.collected) if (!m.collected.includes(id)) { m.collected.push(id); changed = true; }
    for (const a of ACTIVITIES) if (d.activities[a] && !m.activities[a]) { m.activities[a] = true; changed = true; }
    if (d.bridgeReached && !m.bridgeReached) { m.bridgeReached = true; changed = true; }
    if (d.revealSeen && !m.revealSeen) { m.revealSeen = true; changed = true; }
    if (d.finalDone && !m.finalDone) { m.finalDone = true; changed = true; }
    if (d.finalProof && (d.finalProof.kind === 'secretnovio_v10' || d.finalProof.kind === 'triple_v3') && m.finalProof?.kind !== d.finalProof.kind && m.finalProof?.kind !== 'secretnovio_v10') { m.finalProof = d.finalProof; changed = true; }
    const bh = m.partials.bridgeHeard;
    if (d.partials.bridgeHeard.aissa && !bh.aissa) { bh.aissa = true; changed = true; }
    if (d.partials.bridgeHeard.juseph && !bh.juseph) { bh.juseph = true; changed = true; }
    if (d.partials.graffitiIntro && !m.partials.graffitiIntro) { m.partials.graffitiIntro = true; changed = true; }
    // V10.4: el recorrido 2D solo avanza (frases vistas, práctica, estado, respuesta del modo ayuda)
    { const R = { off: -1, nuevo: 0, antigua: 1, 'tutorial-hecho': 2, hecho: 3 } as Record<string, number>, a = m.narr, b = d.narr;
      for (const v of b.vistos) if (!a.vistos.includes(v)) { a.vistos.push(v); changed = true; }
      if (b.practica && !a.practica) { a.practica = true; changed = true; }
      if ((R[b.estado] ?? 0) > (R[a.estado] ?? 0)) { a.estado = b.estado; changed = true; }
      if (b.ayuda && !a.ayuda) { a.ayuda = b.ayuda; changed = true; } }
    for (const h of d.hints) if (!m.hints.includes(h)) m.hints.push(h);
    // V10.2 R-14b: grafitis de SKILLS de la otra pestaña (mismo linaje): se suman los que aquí no están (los 12 últimos)
    { const key = (q: SkillGraffiti) => `${q.i}|${q.p.map((v) => v.toFixed(2)).join(',')}`, have = new Set((m.skillGraffiti ?? []).map(key));
      const add = (d.skillGraffiti ?? []).filter((q) => !have.has(key(q)));
      if (add.length) { m.skillGraffiti = [...(m.skillGraffiti ?? []), ...add].slice(-12); changed = true; } }
    // una actividad completada en la otra pestaña limpia su parcial aquí
    if (m.activities.skateTutorial) { m.partials.tutorialStep = 0; m.partials.tutorialStarted = false; }
    if (m.activities.graffiti) { m.partials.graffitiMask = null; m.partials.graffitiCheck = 0; }
    if (changed) this.onExternal?.();
    return changed;
  }

  get total() { return this.p.collected.length; }
  isCollected(id: string) { return this.p.collected.includes(id); }
  zoneCount(z: ZoneId) { return FRY_KINDS.filter((k) => this.isCollected(`${z}.${k}`)).length; }
  get centerUnlocked() { return this.total === TOTAL_FRIES; }
  get previewUnlocked() { return this.centerUnlocked && this.p.finalDone; }
  /** V10: el reto nuevo de SECRETNOVIO superado en ESTA versión (las pruebas antiguas conservan el preview, D-SN-08). */
  get jumpDone() { return this.p.finalProof?.kind === 'secretnovio_v10'; }
  rewardPending(a: ActivityId) { return this.p.activities[a] && !this.isCollected(`${ZONE_OF_ACTIVITY[a]}.activity`); }

  collect(id: string): boolean {
    if (!ALL_FRY_IDS.includes(id) || this.isCollected(id)) return false;
    if (id.endsWith('.activity')) {
      const zone = id.split('.')[0] as ZoneId;
      if (!this.p.activities[SECTORS.find((s) => s.id === zone)!.activity]) return false;
    }
    this.p.collected.push(id); this.save(); return true;
  }
  /** Completar un reto: true solo la primera vez (repetir no crea otro premio). Limpia su parcial. */
  complete(a: ActivityId): boolean {
    if (this.p.activities[a]) return false;
    // V7: la charla del puente solo se completa con las DOS frases terminadas (una de Aissa y una de Juseph)
    if (a === 'bridgeTalk' && !(this.p.partials.bridgeHeard.aissa && this.p.partials.bridgeHeard.juseph)) return false;
    this.p.activities[a] = true;
    if (a === 'bridgeTalk') this.p.bridgeReached = true;   // compatibilidad con lectores antiguos del guardado
    const pp = this.p.partials;
    if (a === 'skateTutorial') { pp.tutorialStep = 0; pp.tutorialStarted = false; }
    if (a === 'graffiti') { pp.graffitiMask = null; pp.graffitiCheck = 0; pp.graffitiErrRun = 0; pp.graffitiIntro = true; }
    if (a === 'danceCombo') pp.danceRounds = 0;
    avisos.actividad(a, 'completa');   // V10.6 (B5): el mismo instante que guarda el hito
    this.save(); return true;
  }
  setPartial<K extends keyof Partials>(k: K, v: Partials[K]) { if (this.p.partials[k] !== v) { this.p.partials[k] = v; this.save(); } }
  setBridgeReached() { if (!this.p.bridgeReached) { this.p.bridgeReached = true; this.p.partials.bridgeRest = 4; this.save(); } }
  /** V7: marca a un NPC de TRA TRA TRA como escuchado (frase terminada). Devuelve true si con él ya están los dos. */
  setBridgeHeard(who: BridgeNpc) {
    const bh = this.p.partials.bridgeHeard;
    if (!bh[who]) { bh[who] = true; this.save(); }
    return bh.aissa && bh.juseph;
  }
  /** V10: éxito del reto de SECRETNOVIO: conserva o mejora el derecho al preview. Devuelve true la primera vez que se gana el preview. */
  setFinalJump() {
    if (!this.centerUnlocked) return false;
    const first = !this.p.finalDone;
    this.p.finalDone = true; this.p.finalProof = { kind: 'secretnovio_v10', at: new Date().toISOString() };
    this.save(); return first;
  }
  setRevealSeen() { if (!this.p.revealSeen) { this.p.revealSeen = true; this.save(); } }
  setCheckpoint(c: SafePoint) {
    const o = this.p.checkpoint;
    if (o && Math.hypot(o.x - c.x, o.z - c.z) < 0.5 && Math.abs(o.y - c.y) < 0.2) return;
    this.p.checkpoint = { x: +c.x.toFixed(2), y: +c.y.toFixed(2), z: +c.z.toFixed(2), heading: +c.heading.toFixed(3) };
    this.p.checkpointRevision = GEOMETRY_REVISION; this.save();
  }
  /** V8: las cuatro frases de la rana ya se escucharon (se puede volver a pintar sin repetirlas). */
  setGraffitiIntro() { if (!this.p.partials.graffitiIntro) { this.p.partials.graffitiIntro = true; this.save(); } }
  /** V8: intento de grafiti en curso (máscara completa + recorrido exterior) o null = intento borrado. Guardado atómico. */
  setGraffitiAttempt(a: { b64: string; count: number; errRun: number } | null) {
    const pp = this.p.partials; if (this.p.activities.graffiti) return;
    pp.graffitiMask = a ? a.b64 : null; pp.graffitiCheck = a ? a.count : 0; pp.graffitiErrRun = a ? +a.errRun.toFixed(4) : 0; pp.graffitiRev = GRAFFITI_TARGET_REV; this.save();
  }
  /** V10.1 P09: guarda un grafiti de SKILLS (como mucho 12: el más antiguo sale). */
  addSkillGraffiti(g: SkillGraffiti) { this.p.skillGraffiti = [...(this.p.skillGraffiti ?? []), g].slice(-12); this.save(); }
  hintOnce(id: string) { if (this.p.hints.includes(id)) return false; this.p.hints.push(id); this.save(); return true; }
  saveSettings() { this.save(); }
}

function safeStorage(): Storage | null {
  try { const s = window.localStorage; const k = '__bk_probe'; s.setItem(k, '1'); s.removeItem(k); return s; } catch { return null; }
}

function importOldSettings(storage: Storage | null): Partial<Settings> | undefined {
  try {
    const old = JSON.parse(storage?.getItem(OLD_SAVE_KEY) || 'null');
    if (old?.settings && num(old.settings.volume)) return { volume: Math.min(1, Math.max(0, old.settings.volume)), muted: !!old.settings.muted };
  } catch { /* save antiguo ilegible: ignorar */ }
  return undefined;
}
