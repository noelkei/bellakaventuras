// V10.6.1 (usuario, 25 oct; V10/IT10/PLAN_CRONOMETRO.md) · cronómetro de speedrun: arranca al pulsar JUGAR en una partida NUEVA, cuenta el
// tiempo real mientras el juego corre (diálogos, cinemáticas y tutorial sí: saltarlos ahorra tiempo; pausa y pestaña oculta no: el juego está
// congelado y no dan ventaja) y para al conseguir el salto final de SECRETNOVIO. Al acabar el último diálogo sale el rótulo con el tiempo.
// Vive en su propia clave: no toca el guardado de la partida ni su formato. Va ligado al linaje de la partida (`saveEpoch`): una partida vieja
// (sin cronómetro) no lo enseña; «Borrar y empezar» abre una nueva. Recargar, otra pestaña o `?bktest` no lo paran, pero lo marcan
// (recargar devuelve al último punto seguro: podría usarse de atajo).
// Récord (usuario, 25 oct): el de todos, desde que se publica. Cada carrera terminada manda su tiempo como aviso anónimo (`crono`, décimas);
// las recargas cuentan (usuario, 25 oct: en el móvil pasan solas al cambiar de app; recargar es como pausar y volver un poco atrás: no da ventaja);
// el servidor (bk-record, cada 2 min) guarda los mejores y sirve en /e/record el top que el usuario decide enseñar: `{"n": 3, "top": [{"ds": 4612},
// …]}` (n = 0…5, lo cambia con record.sh sin republicar; solo tiempos, nunca nombres). Si se bate o se entra en el top: «mándasela a @desventurasdeanmi por TikTok» y
// el tiempo propio sale en la lista en otro color.
import type { GameState } from './state';
import * as avisos from './avisos';
import { hint } from './ui';

const KEY = 'bellakaventuras.crono';
const PRUEBA = import.meta.env.DEV || new URLSearchParams(location.search).has('bktest');   // con las herramientas de prueba abiertas
const CUENTA = '@desventurasdeanmi';   // usuario, 25 oct: solo TikTok
interface Run { v: 1; epoch: string; ms: number; fin: boolean; recargas: number; prueba: boolean; visto: boolean; batido?: boolean; entra?: boolean }
interface Puesto { ds: number; tu?: boolean }

let run: Run | null = null, st: GameState | null = null, sinGuardar = 0, pintado = '', cascos: HTMLElement | null = null;
/** Top de todos (décimas): lista (vacía = aún no hay ninguno) o `undefined` = no se sabe (sin conexión o sin servidor). */
let top: Puesto[] | undefined;
let mostrar = 3;   // cuántos enseña el juego (lo decide el usuario en el servidor); 0 = nada de récord
let leyendo: Promise<void> | null = null;
let ventana: { abrir: () => void; cerrar: () => void } | null = null;   // rótulo final como ventana (lo pone bootstrap)
const record = () => (mostrar > 0 ? top?.[0]?.ds : undefined);

/** Red de seguridad (V10.6.1, «blindado»): el cronómetro corre dentro del bucle del juego. Si cualquier parte suya fallase (un navegador raro,
 *  un caso no previsto), se apaga y se esconde para el resto de la visita y el juego sigue como si no existiera: nunca lo congela. */
let roto = false;
function seguro<A extends unknown[]>(que: string, fn: (...a: A) => void) {
  return (...a: A) => {
    if (roto) return;
    try { if (PRUEBA && (window as any).__bkCronoRomper === que) throw new Error(`prueba: rompe ${que}`); fn(...a); }
    catch (e) { roto = true; try { console.warn('cronómetro apagado:', que, e); try { ventana?.cerrar(); } catch { /* */ }   // primero la ventana: devuelve el control al juego
      for (const id of ['crono', 'crono-fin']) document.getElementById(id)?.setAttribute('hidden', ''); } catch { /* */ } }
  };
}

function leer(): Run | null {
  try { const r = JSON.parse(localStorage.getItem(KEY) ?? 'null');
    return r && r.v === 1 && typeof r.epoch === 'string' && Number.isFinite(r.ms) && r.ms >= 0 ? { ...r, recargas: Math.max(0, r.recargas | 0), prueba: !!r.prueba, fin: !!r.fin, visto: !!r.visto } : null; }
  catch { return null; }
}
/** Escribe (sin almacenamiento sigue en memoria). Otra pestaña con la misma carrera: se conservan sus marcas. */
function guardar() {
  if (!run) return; sinGuardar = 0;
  try { const d = leer(); if (d && d.epoch === run.epoch) { run.recargas = Math.max(run.recargas, d.recargas); run.prueba ||= d.prueba; run.visto ||= d.visto; }
    localStorage.setItem(KEY, JSON.stringify(run)); } catch { /* */ }
}
addEventListener('pagehide', guardar);
document.addEventListener('visibilitychange', () => { if (document.hidden) guardar(); });

/** Lee el récord del servidor (máx. 5 s; nunca lanza). Una lectura a la vez. */
function leerRecord() {
  return (leyendo ??= (async () => {
    try {
      const ac = new AbortController(), to = setTimeout(() => ac.abort(), 5000);
      const r = await fetch(new URL('/e/record', location.origin), { cache: 'no-store', credentials: 'omit', signal: ac.signal }).finally(() => clearTimeout(to));
      const j = r.ok ? await r.json() : undefined;
      const valido = (ds: unknown): ds is number => Number.isInteger(ds) && (ds as number) > 0 && (ds as number) <= 864000;
      if (j && Array.isArray(j.top) && Number.isInteger(j.n) && j.n >= 0 && j.n <= 5) {
        mostrar = j.n;
        top = j.top.filter((p: any) => p && valido(p.ds)).slice(0, j.n).map((p: any) => ({ ds: p.ds }));   // solo el tiempo: cualquier otra cosa se ignora
      } else if (j && (j.ds === null || valido(j.ds))) { mostrar = 1; top = j.ds === null ? [] : [{ ds: j.ds }]; }   // formato antiguo: solo el récord

      pintar(true);
    } catch { /* sin conexión o sin servidor: se queda como estaba (y un fallo al pintar nunca sale de aquí) */ }
  })().finally(() => { leyendo = null; }));
}

/** 12:34.5 · 1:02:03.4 */
export function formato(ms: number) {
  const d = Math.floor(ms / 100), s = Math.floor(d / 10), h = Math.floor(s / 3600), m = Math.floor(s / 60) % 60;
  const t = `${String(s % 60).padStart(2, '0')}.${d % 10}`;
  return h ? `${h}:${String(m).padStart(2, '0')}:${t}` : `${m}:${t}`;
}

function pintar(forzar = false) {
  const el = document.getElementById('crono'); if (!el) return;
  if (!run) { el.hidden = true; return; }
  const t = formato(run.ms);   // terminado: en rosa (sin más texto: en 320 px no cabe junto al chip de modo)
  if (!forzar && t + run.fin === pintado && !el.hidden) return;
  pintado = t + run.fin; el.textContent = t; el.hidden = false; el.classList.toggle('fin', run.fin);
  const rec = record(); if (rec !== undefined) el.dataset.rec = `Récord ${formato(rec * 100)}`; else delete el.dataset.rec;   // debajo, en pequeño
}

/** JUGAR / CONTINUAR. `nueva` = no había progreso guardado (empieza de cero); si no, se retoma la carrera de esta partida, si la hay. */
export const empezar = seguro('empezar', (state: GameState, nueva: boolean) => {
  st = state;
  if (nueva) run = { v: 1, epoch: state.p.saveEpoch, ms: 0, fin: false, recargas: 0, prueba: PRUEBA, visto: false };
  else { const d = leer(); run = d && d.epoch && d.epoch === state.p.saveEpoch ? d : null; if (run && !run.fin) { run.recargas++; run.prueba ||= PRUEBA; } }
  if (!run) { avisarReinicio(state); return; }
  guardar(); pintar(); void leerRecord();
  // terminó sin ver el rótulo (cerró antes): sale ahora, salvo que la despedida siga pendiente (lo saca ella al acabar)
  if (run.fin && !run.visto && !state.p.narr.pend?.includes('DES')) setTimeout(resultado, 1500);
});

/** Partida que ya existía (sin carrera; usuario, 25 oct: «la gente es tonta»): una vez por visita, cuando ya se puede jugar (sin ventanas, ni
 *  diálogos, ni «cascos»), cómo empezar una que cuente. El botón de pausa está arriba a la derecha (a la izquierda en modo zurdo). */
function avisarReinicio(state: GameState) {
  const lado = state.p.settings.leftHanded ? 'izquierda' : 'derecha', tactil = matchMedia('(pointer: coarse)').matches;
  const donde = tactil ? `toca <b>II</b> (arriba a la ${lado})` : `pulsa <b>Esc</b> o <b>II</b> (arriba a la ${lado})`;
  const texto = `⏱ <b>Speedrun</b>: para que cuente tu tiempo, empieza de cero: ${donde} → <b>Reiniciar partida</b>`;
  let intentos = 0;
  const intentar = seguro('aviso-reinicio', () => {
    const libre = document.getElementById('cascos')?.hidden !== false && !document.getElementById('hud')?.hasAttribute('inert')
      && document.getElementById('d2')?.hidden !== false && document.getElementById('dialog')?.hidden !== false && !document.getElementById('hud')?.hidden;
    if (libre) hint(texto, 10000); else if (++intentos < 120) setTimeout(intentar, 1000);
  });
  setTimeout(intentar, 2500);
}

/** Cada fotograma con el juego en marcha (mismas exclusiones que el reloj de juego): `ms` reales desde el anterior, como mucho 1 s
 *  (un portátil que se duerme sin pasar por la pausa no suma horas; un tirón largo tampoco da ventaja: el juego avanza 0,1 s por fotograma). */
export const paso = seguro('paso', (ms: number) => {
  if (!run || run.fin) return;
  // «Recomendamos usar cascos» sale tras JUGAR / CONTINUAR con el juego sin entrada (sin pausa): hasta cerrarlo no se puede jugar y no cuenta
  if ((cascos ??= document.getElementById('cascos')) && !cascos.hidden) return;
  const d = Math.min(1000, Math.max(0, ms)); run.ms += d; sinGuardar += d;
  if (st && st.p.saveEpoch !== run.epoch) { run.epoch = st.p.saveEpoch; run.recargas++; }   // otra pestaña cambió el linaje de esta partida
  if (sinGuardar >= 1000) guardar();
  pintar();
});

/** Salto final conseguido: el tiempo queda fijo, se compara con el top (leído antes de mandar el propio) y se manda. */
export const terminar = seguro('terminar', () => {
  if (!run || run.fin) return;
  const r = run; r.fin = true; guardar(); pintar();
  const ds = Math.floor(r.ms / 100);
  void leerRecord().then(seguro('terminar-record', () => {
    if (top !== undefined && mostrar > 0) {   // sin saber el top (o si no se enseña) no se presume de nada
      r.batido = !top.length || ds < top[0].ds;
      r.entra = !r.batido && (top.length < mostrar || ds < top[top.length - 1].ds);
      guardar();
    }
    avisos.aviso('crono', { ds });   // en pruebas y fuera de la web no sale del aparato (avisos.puedeEnviar)
  }));
});

/** Rótulo del tiempo final (una vez por carrera): al acabar el último diálogo o, si no llega, al terminar la escena final. */
export const resultado = seguro('resultado', () => {
  if (!run || !run.fin || run.visto) return;
  run.visto = true; guardar();
  const r = run;
  // si aún se está leyendo el récord (conexión lenta), espera a saber si se ha batido (como mucho 5 s)
  void (leyendo ?? Promise.resolve()).then(() => rotulo(r));
});
const rotulo = seguro('rotulo', (r: Run) => {
  const el = document.getElementById('crono-fin'); if (!el) return;
  const nuevo = r.batido === true, entra = !nuevo && r.entra === true, premio = nuevo || entra;
  el.querySelector('small')!.textContent = nuevo ? '¡NUEVO RÉCORD!' : entra ? `¡ENTRAS EN EL TOP ${mostrar}!` : '¡JUEGO COMPLETADO!';
  el.querySelector('b')!.textContent = formato(r.ms);
  el.querySelector('em')!.textContent = premio ? `Haz captura y mándasela a ${CUENTA} por TikTok`
    : 'Haz captura y compártela en TikTok';
  // el top que decide el usuario, con este tiempo ya colocado en su puesto y en otro color (si cuenta); solo texto (nunca HTML)
  const ol = el.querySelector('ol')!; ol.replaceChildren();
  if (top !== undefined && mostrar > 0) {
    const ds = Math.floor(r.ms / 100), lista: Puesto[] = [...top];
    if (r.batido || r.entra) lista.splice(lista.findIndex((p) => ds < p.ds) < 0 ? lista.length : lista.findIndex((p) => ds < p.ds), 0, { ds, tu: true });
    const filas = lista.slice(0, mostrar);
    // usuario (25 oct): el top siempre con sus 3 puestos; los que faltan repiten el último tiempo (1 tiempo → los 3; 2 → el 2.º dos veces)
    while (filas.length && filas.length < mostrar) filas.push({ ...filas[filas.length - 1] });
    if (filas.length) {
      const cab = document.createElement('li'); cab.className = 'cab'; cab.textContent = mostrar === 1 ? 'RÉCORD' : `TOP ${mostrar}`; ol.append(cab);
      filas.forEach((p, i) => { const li = document.createElement('li'); li.classList.toggle('tu', !!p.tu);
        li.textContent = `${mostrar > 1 ? `${i + 1}. ` : ''}${formato(p.ds * 100)}${p.tu ? ' · tú' : ''}`; ol.append(li); });
    }
  }
  el.querySelector('i')!.textContent = r.prueba ? 'Modo prueba: no vale como récord' : '';
  el.classList.toggle('record', premio);
  // ventana con «CONTINUAR» (usuario, 25 oct): se queda hasta que se cierra (tiempo para la captura). La abre bootstrap como «cascos»
  setTimeout(seguro('rotulo-abrir', () => { if (ventana) ventana.abrir(); else el.hidden = false; }), 400);
});

/** La pone bootstrap: abrir/cerrar el rótulo como ventana (foco, mando, Esc / B y el juego sin entrada mientras está abierto). */
export function usarVentana(v: { abrir: () => void; cerrar: () => void }) { ventana = v; }

/** Pruebas (?bktest): estado de la carrera. */
if (PRUEBA) try { (window as any).__bkCrono = { get run() { return run && { ...run }; }, get record() { return record(); }, get top() { return top; }, get mostrar() { return mostrar; }, get roto() { return roto; }, formato }; } catch { /* */ }
