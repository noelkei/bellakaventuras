// V10.6 (B5, V10/IT9/B5_METRICAS.md) · avisos del juego al servidor SIN identificar a nadie (alojamiento de juego/ionos-2026-10/ESPEC_AVISOS_JUEGO.md).
// Reglas (no negociables, §1 de la especificación):
//  · ningún identificador (ni id, ni número aleatorio, ni huella, ni pantalla): cada aviso es suelto y el servidor solo suma totales;
//  · solo campos de un esquema CERRADO (nombres de la lista, enteros pequeños, palabras cortas `[a-z0-9_-]`): nunca texto libre ni errores;
//  · una vez por visita cada hito, en memoria (nada en localStorage, sessionStorage ni cookies);
//  · sin efecto en el juego: se dispara y se olvida (sin await, sin reintentos, todo en try/catch);
//  · solo salen en https://bellakaventuras.com (y www.); con ?bktest se apuntan en memoria para las pruebas y NO se mandan.
// Módulo SIN dependencias: lo importa también la entrada ligera de la portada (main.ts).
type Campos = Record<string, string | number | undefined>;
type Fase = 'carga' | 'portada' | 'partida';

const QS = typeof location !== 'undefined' ? new URLSearchParams(location.search) : new URLSearchParams();
const PRUEBA = QS.has('bktest') || (typeof navigator !== 'undefined' && (navigator as any).webdriver === true);
const HOSTS = ['bellakaventuras.com', 'www.bellakaventuras.com'];
/** Se envía de verdad (si no, nada sale del aparato). */
export const puedeEnviar = () => { try { return !PRUEBA && location.protocol === 'https:' && HOSTS.includes(location.hostname); } catch { return false; } };

// ------------------------------------------------------------------ esquema cerrado
const ZONAS = ['no_me_guillo', 'nosvamosdeaqui', 'yinyang', 'tratratra', 'fashion_girl'];
const ACT = ['pantherTalk', 'skateTutorial', 'graffiti', 'bridgeTalk', 'danceCombo', 'secretnovio'];
const ent = (max: number) => (v: unknown) => typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= max;
const dec = (v: unknown) => typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= 86400;
const de = (...xs: string[]) => (v: unknown) => typeof v === 'string' && xs.includes(v);
const T = ent(86400), P = de('n', 'c');
const ESQ: Record<string, Record<string, (v: unknown) => boolean>> = {
  'carga-portada': { s: dec }, 'carga-lista': { s: dec }, 'carga-sale': { s: dec, pct: de('0', '25', '50', '75') },
  jugar: { p: P, red: de('wifi', 'datos', 'otro', '?'), calidad: de('4g', '3g', '2g', '?') },
  tutorial: { t: T, p: P, modo: de('visto', 'saltado') },
  secretnovio: { t: T, p: P }, 'animacion-final': { t: T, p: P, modo: de('vista', 'saltada') }, 'dialogo-final': { t: T, p: P },
  crono: { ds: ent(864000) },   // V10.6.1: tiempo del cronómetro de speedrun en décimas (solo carreras sin recargas); con él, el servidor lleva el récord
  'act-empieza': { a: de(...ACT), t: T, p: P }, 'act-falla': { a: de(...ACT), intento: ent(20), t: T, p: P },
  'act-completa': { a: de(...ACT), t: T, dur: T, intentos: ent(99), p: P },
  error: { c: de('E01', 'E02', 'E03', 'E04', 'E05', 'E06', 'E07', 'E99'), fase: de('carga', 'portada', 'partida'), m: de('portada', 'motor', 'externo', 'promesa') },
  control: { c: de('tactil', 'raton', 'mando', 'teclado') }, orientacion: { o: de('vertical', 'horizontal') }, 'orientacion-cambia': { o: de('vertical', 'horizontal') },
  sonido: { s: de('on', 'off') }, 'sonido-cambia': { s: de('on', 'off') }, eficiente: { modo: de('guardado', 'manual') },
  fps: { tramo: de('fluido', 'justo', 'lento'), f: ent(240) }, ayuda: { t: T, tipo: de('auto', 'pedida') },
  saltar: { que: de('tutorial', 'cinematica', 'escena-final'), t: T },
};
for (const z of ZONAS) { ESQ[`patata-${z}`] = { n: ent(20), tipo: de('visible', 'medium', 'hidden', 'activity'), t: T, d: T, p: P }; ESQ[`zona-${z}`] = { t: T, orden: ent(5), p: P }; }
for (const m of [2, 5, 10, 20, 30, 45, 60]) ESQ[`min-${m}`] = { p: P };
/** Pruebas: el esquema (para comprobar que no sale nada fuera de él). */
export const ESQUEMA = ESQ;

// ------------------------------------------------------------------ estado de la visita (solo memoria)
const vistos = new Set<string>();
let enviados = 0;
const MAX = 150;
const memoria: { n: string; q: Record<string, string> }[] = [];
if (PRUEBA && QS.has('bktest')) try { (window as any).__bkAvisos = memoria; } catch { /* */ }
export let fase: Fase = 'carga';
let partida: 'n' | 'c' = 'n';
let reloj = 0, ultimaPatata = 0, zonas = 0;
const minutos = [2, 5, 10, 20, 30, 45, 60];

/** Transporte: sendBeacon y, si no hay o lo rechaza, fetch con keepalive. Nunca lanza ni espera. */
export function transporte(url: string) {
  try { if (typeof navigator.sendBeacon === 'function' && navigator.sendBeacon(url)) return 'beacon'; } catch { /* */ }
  try { void fetch(url, { method: 'POST', keepalive: true, credentials: 'same-origin', cache: 'no-store' }).catch(() => {}); return 'fetch'; } catch { return 'nada'; }
}

/** Manda (o apunta) un aviso. `clave` = una vez por visita (por defecto, el propio nombre). Los campos que no encajan en el esquema se descartan. */
export function aviso(nombre: string, campos: Campos = {}, clave: string | null = nombre) {
  try {
    const esq = ESQ[nombre]; if (!esq) return;
    if (clave !== null) { if (vistos.has(clave)) return; vistos.add(clave); }
    if (enviados >= MAX) return; enviados++;
    const q: Record<string, string> = {};
    for (const [k, v] of Object.entries(campos)) { const ok = esq[k]; if (!ok || v === undefined) continue;
      const val = typeof v === 'number' ? (k === 's' ? Math.round(v * 10) / 10 : Math.round(v)) : v; if (!ok(val)) continue; q[k] = String(val); }
    if (!puedeEnviar()) { if (PRUEBA) memoria.push({ n: nombre, q }); return; }
    const u = new URL(`/e/${nombre}`, location.origin); for (const [k, v] of Object.entries(q)) u.searchParams.set(k, v);
    transporte(u.pathname + u.search);
  } catch { /* nunca afecta al juego */ }
}
const t = () => Math.floor(reloj);

// ------------------------------------------------------------------ carga y portada
const seg = () => { try { return performance.now() / 1000; } catch { return 0; } };
export function cargaPortada() { aviso('carga-portada', { s: seg() }); }
let pctCarga = () => 0;
export function cargaSigue(f: () => number) { pctCarga = f; }
export function cargaLista() { aviso('carga-lista', { s: seg() }); if (fase === 'carga') fase = 'portada'; }
try {
  const sale = () => { if (fase !== 'carga') return; const p = Math.max(0, Math.min(0.999, pctCarga())); aviso('carga-sale', { s: seg(), pct: String(Math.floor(p * 4) * 25) }); };
  addEventListener('pagehide', sale); document.addEventListener('visibilitychange', () => { if (document.hidden) sale(); });
} catch { /* */ }

// ------------------------------------------------------------------ errores (índice de códigos; nunca el texto)
let errores = 0;
export function error(c: 'E01' | 'E02' | 'E03' | 'E04' | 'E05' | 'E06' | 'E07' | 'E99', m?: 'portada' | 'motor' | 'externo' | 'promesa') {
  try { if (errores >= 5) return; const clave = `error-${c}${m ? '-' + m : ''}`; if (vistos.has(clave)) return; errores++; aviso('error', { c, fase, m }, clave); } catch { /* */ }
}
const memoriaAgotada = (s: string) => /out of memory|allocation|memoria/i.test(s);
const deRed = (s: string) => /failed to fetch|networkerror|load failed|network/i.test(s);
try {
  addEventListener('error', (e: Event) => {
    try {
      const tg = e.target as Element | null;
      if (tg && tg !== (window as any) && /^(IMG|SCRIPT|LINK|AUDIO|VIDEO|SOURCE)$/.test(tg.tagName ?? '')) { error('E04'); return; }   // recurso que no carga
      const ev = e as ErrorEvent, msg = String(ev.message ?? ''), f = String(ev.filename ?? '');
      if (memoriaAgotada(msg)) { error('E03'); return; }
      const propio = f.startsWith(location.origin), m = !propio ? 'externo' : /\/build\/index-/.test(f) ? 'portada' : 'motor';
      error('E99', m);
    } catch { /* */ }
  }, true);
  addEventListener('unhandledrejection', (e: PromiseRejectionEvent) => {
    try { const r = e.reason, s = String(r?.message ?? r ?? ''); if (/AbortError|NotAllowedError/.test(String(r?.name ?? ''))) return;   // audio o vídeo interrumpido: no es un fallo
      if (memoriaAgotada(s)) error('E03'); else if (deRed(s)) error('E04'); else error('E99', 'promesa'); } catch { /* */ }
  });
} catch { /* */ }

// ------------------------------------------------------------------ partida
/** JUGAR / CONTINUAR. `p` = había partida guardada. */
export function jugar(sigue: boolean, extra: { sonido: boolean; tactil: boolean; horizontal: boolean; eficiente: boolean }) {
  try {
    partida = sigue ? 'c' : 'n'; fase = 'partida'; reloj = 0; ultimaPatata = 0;
    const c: any = (navigator as any).connection;
    const red = !c ? '?' : c.type === 'wifi' || c.type === 'ethernet' ? 'wifi' : c.type === 'cellular' ? 'datos' : c.type ? 'otro' : '?';
    const calidad = c && /^(4g|3g|2g)$/.test(c.effectiveType) ? c.effectiveType : c?.effectiveType === 'slow-2g' ? '2g' : '?';
    aviso('jugar', { p: partida, red, calidad });
    aviso('sonido', { s: extra.sonido ? 'on' : 'off' }); sonidoIni = extra.sonido;
    if (extra.tactil) { aviso('orientacion', { o: extra.horizontal ? 'horizontal' : 'vertical' }); orientIni = extra.horizontal; }
    if (extra.eficiente) aviso('eficiente', { modo: 'guardado' }); eficienteIni = extra.eficiente;
    // controles: la primera vez que se usa cada uno desde JUGAR
    addEventListener('pointerdown', (e) => aviso('control', { c: e.pointerType === 'mouse' ? 'raton' : 'tactil' }, `control-${e.pointerType === 'mouse' ? 'raton' : 'tactil'}`), { capture: true, passive: true });
    addEventListener('keydown', (e) => { if (!/^(Shift|Control|Alt|Meta)/.test(e.key)) aviso('control', { c: 'teclado' }, 'control-teclado'); }, { capture: true, passive: true });
  } catch { /* */ }
}
let sonidoIni = true, orientIni: boolean | null = null, eficienteIni = false;
const p = () => partida;
export const tutorial = (saltado: boolean) => aviso('tutorial', { t: t(), p: p(), modo: saltado ? 'saltado' : 'visto' });
export function patata(id: string, total: number) {
  try { const [z, tipo] = id.split('.'), d = t() - ultimaPatata; ultimaPatata = t(); aviso(`patata-${z}`, { n: total, tipo, t: t(), d, p: p() }, `patata-${id}`); } catch { /* */ }
}
export function zona(z: string) { if (vistos.has(`zona-${z}`) || !ESQ[`zona-${z}`]) return; zonas++; aviso(`zona-${z}`, { t: t(), orden: zonas, p: p() }); }
export const secretnovio = () => aviso('secretnovio', { t: t(), p: p() });
export const animacionFinal = (saltada: boolean) => aviso('animacion-final', { t: t(), p: p(), modo: saltada ? 'saltada' : 'vista' });
export const dialogoFinal = () => aviso('dialogo-final', { t: t(), p: p() });
export const ayuda = (pedida: boolean) => aviso('ayuda', { t: t(), tipo: pedida ? 'pedida' : 'auto' });
export const saltar = (que: 'tutorial' | 'cinematica' | 'escena-final') => aviso('saltar', { que, t: t() }, `saltar-${que}`);

// actividades: inicio (en esta visita), fallos y duración
const act = new Map<string, { t0: number; fallos: number; hecha: boolean }>();
/** `yaHecha` = la actividad ya estaba completada en la partida (no cuenta para el embudo: no se avisa de su inicio). */
export function actividad(a: string, que: 'empieza' | 'falla' | 'completa', yaHecha = false) {
  try {
    let s = act.get(a);
    if (que === 'empieza') { if (yaHecha || s) return; s = { t0: t(), fallos: 0, hecha: false }; act.set(a, s); aviso('act-empieza', { a, t: t(), p: p() }, `act-empieza-${a}`); return; }
    if (!s) { if (yaHecha) return; s = { t0: t(), fallos: 0, hecha: false }; act.set(a, s); }   // empezada antes de recargar: cuenta desde aquí
    if (s.hecha) return;
    if (que === 'falla') { s.fallos++; if (s.fallos <= 20) aviso('act-falla', { a, intento: s.fallos, t: t(), p: p() }, `act-falla-${a}-${s.fallos}`); return; }
    s.hecha = true; const habla = a === 'pantherTalk' || a === 'bridgeTalk';
    aviso('act-completa', { a, t: t(), dur: t() - s.t0, intentos: habla ? undefined : s.fallos + 1, p: p() }, `act-completa-${a}`);
  } catch { /* */ }
}

// ------------------------------------------------------------------ reloj de juego, minutos, fluidez y cambios de ajustes
const dts: number[] = []; let fpsHecho = false;
/** Cada fotograma con la partida empezada, la página visible y sin la pausa abierta (los diálogos cuentan: D106-05). */
export function tick(dt: number) {
  try {
    if (fase !== 'partida' || !(dt > 0)) return;
    reloj = Math.min(86400, reloj + Math.min(dt, 0.25));
    for (const m of minutos) if (reloj >= m * 60) aviso(`min-${m}`, { p: p() });
    if (!fpsHecho) { if (dts.length < 4000) dts.push(dt); if (reloj >= 60) { fpsHecho = true; const s = dts.sort((a, b) => a - b), med = s[s.length >> 1] || 1 / 60, f = Math.round(1 / med);
      aviso('fps', { tramo: f >= 50 ? 'fluido' : f >= 30 ? 'justo' : 'lento', f: Math.min(240, f) }); dts.length = 0; } }
  } catch { /* */ }
}
/** Cada medio segundo (desde el juego): cambios de mando, orientación, sonido y Modo eficiente. */
export function estado(e: { mando: boolean; horizontal: boolean | null; sonido: boolean; eficiente: boolean; audioParado: boolean }) {
  try {
    if (fase !== 'partida') return;
    if (e.mando) aviso('control', { c: 'mando' }, 'control-mando');
    if (orientIni !== null && e.horizontal !== null && e.horizontal !== orientIni) aviso('orientacion-cambia', { o: e.horizontal ? 'horizontal' : 'vertical' });
    if (e.sonido !== sonidoIni) aviso('sonido-cambia', { s: e.sonido ? 'on' : 'off' });
    if (e.eficiente && !eficienteIni) aviso('eficiente', { modo: 'manual' });
    if (reloj >= 3 && e.sonido && e.audioParado) error('E06');
  } catch { /* */ }
}
/** Pruebas (?bktest): adelantar el reloj de juego. */
if (PRUEBA && QS.has('bktest')) try { (window as any).__bkAvisosDebug = { avanzar: (s: number) => { reloj += s; tick(0.016); }, puedeEnviar, transporte, get reloj() { return reloj; } }; } catch { /* */ }
