// Arranque: configuración, fuentes, carga con progreso, pantalla de inicio (JUGAR + sonido), pausa, ajustes, ayuda,
// confirmación de reinicio y preview. Las capas modales son accesibles (foco inicial, Tab atrapado, Escape, foco
// restaurado) y bloquean el juego (input modal); los botones son botones reales (click/Enter/Espacio/mando).
import { TUNING } from './tuning';
import { CAM_FADE, camFadeUniform } from './world/camfade';
import RAPIER from '@dimforge/rapier3d-compat';
import * as THREE from 'three';
import { Game, GameConfig } from './game';
import { GameState, SAVE_KEY } from './state';
import { ASSET_BASE } from './assets';
import { $, openModal, closeModal, topModal, moveFocus, toast, onTap } from './ui';
import { TEXTOS, TEXTOS105 } from './textos2d';
import { createAnmiVisual } from './anmi';
import { TOTAL_FRIES, WORLD, SECTORS } from './world/manifest';
import { renderState } from './music';
import { DriftCars } from './vehicles';
/** V10.2 Q10: cierra la vista de «Tamaño de los botones» (true = guardar; false = deshacer). La rellena el arranque. */
let sizeClose: (save: boolean) => void = () => {};
import { orient, OrientPref } from './orient';
import { btnScaleUsed } from './hudlayout';
import { portada } from './portada/portada';   // V10.5 ronda PORTADA: la crea main.ts (sale antes que el motor)
import { carga } from './portada/carga';
import * as avisos from './avisos';   // V10.6 (B5): métricas sin identificadores
import * as crono from './crono';   // V10.6.1: cronómetro de speedrun

async function registerFonts() {
  const fonts: [string, string][] = [['Bungee', 'Bungee-Regular.ttf'], ['Lucky', 'LuckiestGuy-Regular.ttf']];
  await Promise.all(fonts.map(async ([fam, file]) => {
    try { const f = new FontFace(fam, `url(${ASSET_BASE}fonts/${file})`); await f.load(); document.fonts.add(f); } catch { /* fuente del sistema */ }
  }));
}

/** Ganchos de pruebas: en desarrollo siempre; en la build solo con ?bktest=1 (no hay botones de pruebas en el producto). */
const TEST_HOOKS = import.meta.env.DEV || new URLSearchParams(location.search).has('bktest');

const HELP = `
<table>
<tr><th>Acción</th><th>Teclado</th><th>Táctil</th><th>Mando</th></tr>
<tr><td>Avanzar · empujar (hacia donde mira ANMI)</td><td>W / ↑ (mantener)</td><td>Joystick arriba</td><td>Stick izq. arriba</td></tr>
<tr><td>Frenar y, parado, retroceder</td><td>S / ↓</td><td>Joystick abajo</td><td>Stick izq. abajo</td></tr>
<tr><td>Girar (solo gira, no avanza)</td><td>A / D · ← / →</td><td>Joystick a los lados</td><td>Stick izq. a los lados</td></tr>
<tr><td>Soltar = rodar</td><td>Soltar W</td><td>Soltar el joystick</td><td>Soltar el stick</td></tr>
<tr><td>Correr a pie (mantén adelante; girar fuerte vuelve a andar)</td><td>W mantenida</td><td>Joystick arriba a fondo</td><td>Stick izq. arriba a fondo</td></tr>
<tr><td>Subir / bajar de la tabla (hasta 5 m/s; más rápido, frena un poco antes)</td><td>Q</td><td>TABLA (SUBIR/BAJAR)</td><td>LB (o Select)</td></tr>
<tr><td>Saltar (ollie) · a pie: saltito</td><td>Espacio</td><td>SALTO</td><td>A</td></tr>
<tr><td>Truco en el aire (se encadenan mientras quede aire: combo)</td><td>Espacio otra vez + dirección: ↑ frontflip · ↓ backflip · ← kickflip · → heelflip (sin dirección: kickflip)</td><td>SALTO + joystick</td><td>A + stick</td></tr>
<tr><td>Agacharse / scoot</td><td>Mantener C o Shift</td><td>AGACHARSE (se queda activo)</td><td>B</td></tr>
<tr><td>Trucos extra</td><td>F · en suelo: manual · aire ←: 180 · aire →: 360 · aire mantenido: grab · fakie lento doble toque: revert</td><td>—</td><td>X (igual que F)</td></tr>
<tr><td>Grind en los raíles del exterior</td><td colspan="3">Automático: cae encima del raíl alineada con él (salto para salir)</td></tr>
<tr><td>Skills: bailar (4 bailes) o grafitear (4 grafitis, en una pared lisa delante o en el suelo; se guardan los 12 últimos)</td><td>B → 1 bailar / 2 grafitear → 1–4 · directo: 1–4 bailan, 5–8 grafitean</td><td>SKILLS → BAILAR / GRAFITEAR</td><td>RB → cruceta (← bailar · → grafitear; ↑ → ↓ ← elige)</td></tr>
<tr><td>Hablar / acción</td><td>E</td><td>Botón de acción</td><td>Y</td></tr>
<tr><td>Grind de Bellakat: equilibrio · agacharse en la vuelta</td><td>A / D o clic izq./der. · C en el aviso</td><td>◀ ▶ · AGACHARSE</td><td>Stick izq. · B</td></tr>
<tr><td>Reto del centro: trepar, ¡BAJAR!, saltar en el aviso y, en el vuelo, pulsar los 3 círculos (backflip, giro, grab) cuando el anillo llegue</td><td>E y W · E · Espacio · Espacio o clic</td><td>Acción y joystick ↑ · acción · SALTO · toca el círculo</td><td>Y y stick ↑ · Y · A · A</td></tr>
<tr><td>Cámara</td><td>Ratón (sin clic) · J/L/I/K · R recentrar</td><td>Arrastrar en zona libre · ◎</td><td>Stick derecho · R3</td></tr>
<tr><td>Con ratón (modo ratón)</td><td>A pie: W/S hacia delante/atrás de la vista, A/D pasos laterales y ANMI mira hacia la cámara · en tabla: la tabla gira hacia donde miras (A/D también giran)</td><td>—</td><td>—</td></tr>
<tr><td>Pausa</td><td>Esc o P</td><td>II</td><td>Start</td></tr>
<tr><td>Pantalla completa</td><td>Pausa → «Pantalla completa» (Esc sale)</td><td>Al pulsar JUGAR (Android) · en iPhone, «Modo app» de la pausa</td><td>Pausa → «Pantalla completa»</td></tr>
<tr><td>Atascada o perdida: volver a la plaza de salida (sin perder nada)</td><td>Pausa → «Volver a la plaza»</td><td>II → «Volver a la plaza»</td><td>Start → «Volver a la plaza»</td></tr>
<tr><td>Salir de una actividad larga (grind, grafiti, baile, reto, escalera, banco)</td><td>Pausa → «Salir…»</td><td>II → «Salir…»</td><td>Start → «Salir…»</td></tr>
</table>
<p>Con teclado, táctil o mando la cámara solo mira: girarla no cambia lo que hacen W/A/S/D ni el joystick (arriba siempre es «hacia donde mira ANMI»). En ordenador, al mover el ratón se activa el <b>modo ratón</b> (aviso «Cámara: ratón»): la cámara sigue al ratón sin hacer clic y W/A/S/D van respecto a la vista; si juegas solo con teclado unos segundos, vuelve al modo teclado. Esc suelta el ratón y pausa. Los trucos libres necesitan aire: lánzate desde una rampa o un kicker. El reto final de SECRETNOVIO: sube por la escalera del muro, pulsa ¡BAJAR! y, cuando se marque el botón, SALTO.</p>`;

export async function boot() {
  const err = $('start-error');
  // V10.5 ronda PORTADA: la barra con porcentaje real (portada/carga.ts) recibe las etapas de siempre; sin ella, la barra de antes
  const setProgress = (f: number, label: string) => { if (carga) carga.progreso(f); else ($('load-bar').firstElementChild as HTMLElement).style.width = `${Math.round(f * 100)}%`; $('load-text').textContent = label; };
  try {
    registerFonts();
    setProgress(0.02, 'Motor…');
    const cfg: GameConfig = await (await fetch(new URL('./game-config.json', document.baseURI))).json();
    for (const k of Object.keys(cfg.audio.tracks)) cfg.audio.tracks[k] = new URL(cfg.audio.tracks[k], document.baseURI).href;
    try { await RAPIER.init(); } catch (e: any) { avisos.error('E05'); if (e && typeof e === 'object') e.bkAviso = true; throw e; }   // V10.6 (B5)
    // V10.1 (para revisar la escena final; SOLO con ?bktest&escena): partida con las 20 patatas y el reto hecho; al pulsar JUGAR/CONTINUAR
    // se lanza la escena final (con el sonido que desbloquea ese toque)
    const ESCENA = TEST_HOOKS && new URLSearchParams(location.search).has('escena');
    if (ESCENA) { const ids = ['no_me_guillo', 'nosvamosdeaqui', 'yinyang', 'tratratra', 'fashion_girl'].flatMap((z) => ['visible', 'medium', 'hidden', 'activity'].map((k) => `${z}.${k}`));
      try { localStorage.setItem(SAVE_KEY, JSON.stringify({ version: 4, collected: ids, activities: { pantherTalk: true, skateTutorial: true, graffiti: true, bridgeTalk: true, danceCombo: true }, bridgeReached: true,
        finalDone: true, finalProof: { kind: 'secretnovio_v10', at: new Date().toISOString() }, revealSeen: true, hints: ['basic'], settings: { iosAppAsked: true } })); } catch { /* */ } }
    const state = new GameState();
    // V10.5 ronda PORTADA: desde aquí manda el estado del juego (silencio, volumen, radio, reducir movimiento, modo eficiente)
    const syncPortada = () => portada?.sync(state.p.settings);
    syncPortada();
    // V10.4 (R4-03): las pruebas antiguas abren partidas nuevas: con ?bktest&narr=off no hay tutorial ni recorrido 2D (solo con ?bktest)
    if (TEST_HOOKS && new URLSearchParams(location.search).get('narr') === 'off') state.p.narr.estado = 'off';
    const game = new Game($('game') as HTMLCanvasElement, state, cfg);
    game.makeVisual = () => createAnmiVisual();
    if (TEST_HOOKS) {
      (window as any).__bk = game; (window as any).__bkTHREE = THREE; (window as any).__bkRapier = RAPIER; (window as any).__bkRenderState = renderState; (window as any).__bkWORLD = WORLD; (window as any).__bkSectors = SECTORS; (window as any).__bkCarPose = DriftCars.poseAt; (window as any).__bkCamFade = CAM_FADE; (window as any).__bkTuning = TUNING; (window as any).__bkCamFadeUniform = camFadeUniform;
    }
    if (game.debug) (window as any).THREE = THREE;
    // R13: si el navegador quita el contexto gráfico (móvil al volver de otra app, poca memoria, reinicio de la GPU) la imagen se quedaba
    // negra o congelada sin salida. Ahora se congela la partida, se guarda y se avisa; «Continuar» recarga desde la partida guardada.
    game.canvas.addEventListener('webglcontextlost', (e) => {
      e.preventDefault();
      avisos.error('E02');   // V10.6 (B5)
      if (!$('glost').hidden) return;
      game.paused = true; game.input.setModal(true);
      try { state.save(); } catch { /* sin almacenamiento: la recarga empieza de la última partida guardada */ }
      game.log.push('contexto gráfico perdido');
      $('btn-glost').onclick = () => location.reload();
      openModal($('glost'), $('btn-glost'));
    }, false);
    await game.preload(setProgress);
    await carga?.terminar();   // V10.5 ronda PORTADA: 100 % justo antes de activar JUGAR (nunca antes)
    const note = state.status === 'session' ? 'Este navegador no guarda el progreso (modo privado o bloqueado): partida de esta sesión.' : state.loadNote;
    setProgress(1, state.hasSave ? `Partida guardada: ${state.total}/${TOTAL_FRIES}` : '¡Listo!');
    if (note) $('load-text').textContent += ` · ${note}`;
    $('help-body').innerHTML = HELP;
    $('opt-eficiente-label').textContent = TEXTOS105.eficienteLabel;
    game.input.onCounterTap = () => game.counterTap();   // V10.5 (E5-40): 5 toques en el contador = contador de FPS
    // V10.5 (AM-20, E5-22): «Controles» enseña solo la columna del aparato (táctil en móvil y tablet; teclado en ordenador) y la del mando si hay
    // uno, con pestañas para ver las otras (antes las tres columnas: en el móvil la tabla se salía de lado y medía 2700 px)
    type Col = 'teclado' | 'tactil' | 'mando'; const COLS: Col[] = ['teclado', 'tactil', 'mando'];
    const tabs = document.createElement('div'); tabs.className = 'help-tabs'; tabs.setAttribute('role', 'tablist'); tabs.setAttribute('aria-label', TEXTOS105.controlesVer);
    const tabBtns = COLS.map((c) => { const b = document.createElement('button'); b.className = 'small ghost'; b.type = 'button'; b.setAttribute('role', 'tab'); b.dataset.col = c; b.textContent = TEXTOS105.controlesTab[c]; tabs.appendChild(b); return b; });
    $('help-body').before(tabs);
    const showCols = (cols: Col[]) => {
      for (const tr of $('help-body').querySelectorAll('tr')) { const cells = [...tr.children] as HTMLElement[];
        if (cells.length === 2 && (cells[1] as HTMLTableCellElement).colSpan === 3) continue;
        cells.slice(1).forEach((c, i) => { c.hidden = !cols.includes(COLS[i]); }); }
      for (const td of $('help-body').querySelectorAll<HTMLTableCellElement>('td[colspan]')) td.colSpan = cols.length;
      const pz = $('help-body').querySelector('p'); if (pz) pz.hidden = !cols.includes('teclado');
      for (const b of tabBtns) { const on = cols.length === 1 && cols[0] === b.dataset.col; b.setAttribute('aria-selected', String(on)); b.classList.toggle('on', on); }
    };
    for (const b of tabBtns) b.onclick = () => showCols([b.dataset.col as Col]);
    const deviceCols = (): Col[] => { const touch = matchMedia('(pointer: coarse)').matches, pad = game.input.padConnected || game.input.source === 'gamepad';
      return touch ? (pad ? ['tactil', 'mando'] : ['tactil']) : pad && game.input.source === 'gamepad' ? ['mando'] : ['teclado']; };
    // V7 R8: modo ratón. Solo escritorio con ratón (puntero fino y hover). En las pruebas (?bktest) no se captura el puntero salvo
    // con ?bkmouse=1 (las suites de teclado siguen idénticas)
    const qs = new URLSearchParams(location.search);
    const MOUSE_OK = matchMedia('(pointer: fine)').matches && matchMedia('(hover: hover)').matches && (!qs.has('bktest') || qs.has('bkmouse'));
    const canvasEl = $('game');
    if (MOUSE_OK) game.input.initMouse(canvasEl);
    $('opt-mouse-row').hidden = !MOUSE_OK;
    game.input.onMouseMode = (on) => toast(on ? 'Cámara: ratón' : 'Cámara: teclado', 1600);
    game.input.onLockHint = (show) => { if (show) toast('Haz clic en el juego para mover la cámara con el ratón', 3200); };
    // V10.1 P01 (D01): pantalla completa donde el navegador la permite (botón en el inicio y en la pausa; en móvil, también al pulsar JUGAR);
    // en iPhone, modo app (pantalla de inicio): se pregunta una vez al empezar y desde la pausa se puede volver a ver
    const IOS = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    const APP = (navigator as any).standalone === true || matchMedia('(display-mode: standalone)').matches || matchMedia('(display-mode: fullscreen)').matches;
    const FS_OK = !!document.documentElement.requestFullscreen && document.fullscreenEnabled !== false && !IOS;
    const fsBtns = [$('btn-fs'), $('btn-fs-start')];
    const syncFs = () => { for (const b of fsBtns) { b.hidden = !(FS_OK || (IOS && !APP));
      // V10.5 ronda PORTADA: el del inicio lleva icono + texto (solo cambia su texto; en iPhone, «Modo app»); el de la pausa, como antes
      const t = b.querySelector('.pt-txt');
      if (t) { t.textContent = IOS ? 'Modo app' : document.fullscreenElement ? 'Salir de pantalla completa' : 'Pantalla completa'; b.setAttribute('aria-pressed', String(!!document.fullscreenElement)); b.title = IOS ? 'Modo app (pantalla completa)' : ''; }
      else b.textContent = IOS ? '⛶ Modo app (pantalla completa)' : document.fullscreenElement ? '⛶ Salir de pantalla completa' : '⛶ Pantalla completa'; } };
    const toggleFs = async () => { if (IOS) { openModal($('ios-app'), $('btn-ios-ok')); return; }
      try { if (document.fullscreenElement) await document.exitFullscreen(); else await document.documentElement.requestFullscreen({ navigationUI: 'hide' } as any); } catch { toast('Este navegador no deja poner la pantalla completa', 2400); }
      syncFs(); setTimeout(() => game.resize(), 120); };
    for (const b of fsBtns) b.onclick = () => void toggleFs();
    document.addEventListener('fullscreenchange', () => { syncFs(); setTimeout(() => { orient.evaluate(); game.resize(); portada?.recomponer(); }, 120); });
    const iosDone = () => { state.p.settings.iosAppAsked = true; state.save(); closeModal($('ios-app')); iosClosed(); };
    // V10.4 R10: la pregunta del empezar pausa el juego (y con ello abre la pausa debajo); al cerrarla se quitan las dos, sigue el juego y empieza
    // la narrativa que esperaba (antes quedaba el menú de pausa y el 2D del tutorial salía encima con el juego parado)
    let iosPaused = false;
    const iosClosed = () => { if (iosPaused) { iosPaused = false; if (!$('pause').hidden) closeModal($('pause')); game.setPaused(false); } game.narr?.release(); };
    $('btn-ios-ok').onclick = iosDone; $('btn-ios-no').onclick = iosDone;
    if (TEST_HOOKS) (window as any).__bkEnv = { IOS, APP, FS_OK };   // R5c (no-bk-read): sin ?bktest ni se crea
    syncFs();
    const startBtn = $('btn-start') as HTMLButtonElement;
    // V10.6 (petición del usuario): al pulsar JUGAR / CONTINUAR, antes de empezar, «Recomendamos usar cascos» con «Continuar». La narrativa espera
    // (como con el aviso del iPhone) y el juego queda sin entrada debajo, sin pausa. En las pruebas automáticas no sale (salvo ?bktest&cascos)
    const CASCOS = !TEST_HOOKS || new URLSearchParams(location.search).has('cascos');
    // V10.6: el «click» que el móvil manda tras el toque de JUGAR cae en «Continuar» (en vertical está debajo del dedo) y la cerraba al
    // instante (v10_6/cascos, 24 oct): se ignoran los clics de los primeros 500 ms (Esc y B del mando no pasan por aquí)
    let cascosDesde = 0;
    const abrirCascos = () => { cascosDesde = performance.now(); game.input.setModal(true); openModal($('cascos'), $('btn-cascos')); };
    const cerrarCascos = () => { if ($('cascos').hidden) return; closeModal($('cascos')); game.input.setModal(game.paused);
      if (IOS && !APP && !state.p.settings.iosAppAsked) setTimeout(abrirIos, 300); else game.narr.release(); };
    $('btn-cascos').onclick = () => { if (performance.now() - cascosDesde >= 500) cerrarCascos(); };
    // V10.6.2 (usuario, 25 oct): el rótulo del tiempo final, como ventana igual que «cascos»: se queda hasta «CONTINUAR» (o Esc / B), con el juego
    // sin entrada debajo (el cronómetro ya está parado). Los clics de los primeros 500 ms se ignoran (el toque que cierra la despedida 2D)
    let finDesde = 0;
    const cerrarFin = () => { if ($('crono-fin').hidden) return; closeModal($('crono-fin')); game.input.setModal(game.paused); };
    crono.usarVentana({ abrir: () => { finDesde = performance.now(); game.input.setModal(true); openModal($('crono-fin'), $('btn-crono-ok')); }, cerrar: cerrarFin });
    $('btn-crono-ok').onclick = () => { if (performance.now() - finDesde >= 500) cerrarFin(); };
    // V10.5 ronda PORTADA: el texto de JUGAR/CONTINUAR va en un span (textContent exacto) junto a su lettering
    const setStartLabel = (l: 'JUGAR' | 'CONTINUAR') => { if (portada) portada.setStartLabel(l); else { const vh = startBtn.querySelector('.pt-vh'); (vh ?? startBtn).textContent = l; } };
    setStartLabel(state.hasSave ? 'CONTINUAR' : 'JUGAR');
    // V10.6 (H8-08, causa medida con v10_6/sonda-jugar-giro2): con la orientación fijada en Ajustes, el giro se aplicaba DESPUÉS de activar JUGAR y la
    // portada se recolocaba ~150 ms más tarde: el botón cambiaba de sitio justo cuando se podía tocar y el primer toque caía en el fondo. Ahora se
    // aplica antes y la portada se recoloca en el acto (componer() fija su orientación al momento)
    orient.set(state.p.settings.orientation, false); portada?.recomponer();
    startBtn.disabled = false;
    portada?.listo();
    avisos.cargaLista();   // V10.6 (B5)
    try { startBtn.focus({ preventScroll: true }); } catch { /* */ }
    $('btn-reset-start').hidden = !state.hasSave;
    $('btn-reset-start').onclick = () => openConfirm();
    const soundBtn = $('btn-sound-start');
    const syncSound = () => { const t = soundBtn.querySelector('.pt-txt'), m = state.p.settings.muted;   // V10.5 ronda PORTADA: icono + texto
      if (t) { t.textContent = m ? 'Sonido: no' : 'Sonido: sí'; soundBtn.setAttribute('aria-pressed', String(!m)); } else soundBtn.textContent = m ? '🔇 Sonido: no' : '🔊 Sonido: sí'; };
    syncSound();
    soundBtn.onclick = () => {
      // V10.5: si el sonido está en «sí» pero el navegador aún no dejaba sonar, este toque lo ARRANCA (lo hace la portada en el propio gesto)
      // en vez de quitarlo: antes ponía «Sonido: sí» sin sonar y había que quitarlo y volver a ponerlo
      if (portada?.bloqueado) { syncPortada(); return; }
      state.p.settings.muted = !state.p.settings.muted; game.audio.setMuted(state.p.settings.muted); state.save(); syncSound(); syncMute(); syncPortada(); };
    // V5 T5-18: orientación preferida; JUGAR/CONTINUAR es un gesto: si no es «auto», se intenta fijar ya
    // (V10.6: el giro guardado se aplica antes de activar JUGAR, más arriba)
    startBtn.onclick = () => { if (game.started || $('start').hidden) return;   // V10.6 (H8-08): una sola vez (el toque y su clic de después)
      game.flushPending();   // R13: texturas que aún no se habían subido en la portada
      crono.empezar(state, !state.hasSave);   // V10.6.1: antes de que la partida pueda guardar nada
      $('start').hidden = true; startBtn.blur(); game.input.setModal(false);
      document.body.classList.remove('desde-inicio'); portada?.salir();   // V10.5 ronda PORTADA: zoom y fundido sobre el juego; después se libera entera
      // V10.1 P01: en móvil con pantalla completa disponible (Android), JUGAR la pide (dentro del gesto); en ordenador, solo con el botón
      if (FS_OK && matchMedia('(pointer: coarse)').matches && !document.fullscreenElement) void document.documentElement.requestFullscreen({ navigationUI: 'hide' } as any).catch(() => {});
      if (state.p.settings.orientation !== 'auto') orient.set(state.p.settings.orientation, true); if (CASCOS || (IOS && !APP && !state.p.settings.iosAppAsked)) game.narr.hold = true; game.start();
      avisos.jugar(state.hasSave, { sonido: !state.p.settings.muted && state.p.settings.volume > 0, tactil: game.touchUI, horizontal: orient.width > orient.height, eficiente: game.efficient });   // V10.6 (B5)
      if (MOUSE_OK && state.p.settings.mouseLock) game.input.requestLock();
      if (ESCENA) void (async () => { await game.loadSnCast(); const an = game.manifest.get('sn.landing'); game.skater?.teleport(an.pos.clone().setY(an.pos.y + 0.05), an.heading, 'ride'); await new Promise((r) => setTimeout(r, 1500)); game.showPreview(); })();
      // V10.6 (pantalla de cascos): primero «Recomendamos usar cascos»; el aviso del iPhone, si toca, sale al cerrarla
      if (CASCOS) abrirCascos(); else if (IOS && !APP && !state.p.settings.iosAppAsked) setTimeout(abrirIos, 600); };
    function abrirIos() { iosPaused = !game.paused; game.setPaused(true); openModal($('ios-app'), $('btn-ios-ok')); }
    // V10.6 (H8-08): con la pantalla girada por el juego, JUGAR crece y se desplaza al apoyar el dedo; si se levantaba fuera del botón el navegador
    // no mandaba `click` y el primer toque no hacía nada. En táctil también arranca al LEVANTAR el mismo dedo que se apoyó en él (con captura, aunque
    // el botón se haya movido), si no se ha arrastrado. Con ratón, teclado y mando, como siempre (`click`)
    { let tapId = -1, x0 = 0, y0 = 0;
      startBtn.addEventListener('pointerdown', (e) => { if (e.pointerType === 'mouse' || startBtn.disabled) return; tapId = e.pointerId; x0 = e.clientX; y0 = e.clientY; try { startBtn.setPointerCapture(e.pointerId); } catch { /* */ } });
      startBtn.addEventListener('pointerup', (e) => { if (e.pointerId !== tapId) return; tapId = -1;
        if (Math.hypot(e.clientX - x0, e.clientY - y0) > 32 || startBtn.disabled || game.started || $('start').hidden) return; startBtn.click(); });
      startBtn.addEventListener('pointercancel', (e) => { if (e.pointerId === tapId) tapId = -1; }); }
    // R11 (PAD-01): en la portada se lee el mando (A = clic del foco, cruceta = mover el foco); antes el bucle de lectura solo
    // arrancaba con JUGAR y el mando no podía empezar la partida
    game.input.setModal(true);
    { const idle = () => { if (game.started) return; game.input.pollIdle(); game.uploadPending();   /* R11 (SIS-23): texturas pendientes durante la pantalla de inicio */
        document.body.classList.toggle('pad', game.input.source === 'gamepad');   // V10.5 ronda PORTADA: foco visible con mando también en el inicio
        requestAnimationFrame(idle); }; requestAnimationFrame(idle); }
    // V10.5 ronda PORTADA (D5-16): en el inicio, Start del mando = JUGAR (si está activo y no hay una capa encima); antes no hacía nada
    game.input.onPadStart = () => { if (game.started || $('start').hidden || topModal() || startBtn.disabled) return false; startBtn.click(); return true; };
    const orientBtn = $('btn-orient') as HTMLButtonElement;
    const syncOrient = () => { orientBtn.textContent = `Pantalla: ${orient.label}${orient.mode ? ' (girada)' : ''}`; orientBtn.setAttribute('aria-label', `Orientación de pantalla: ${orient.label}. Pulsa para cambiar`); };
    syncOrient(); orient.onChange(syncOrient);
    orientBtn.onclick = async () => {
      const order: OrientPref[] = ['auto', 'vertical', 'horizontal'];
      const next = order[(order.indexOf(state.p.settings.orientation) + 1) % 3];
      state.p.settings.orientation = next; state.save();
      await orient.set(next, true); syncOrient();
      if (next !== 'auto' && orient.locked === 'failed' && orient.mode === 0 && ((next === 'horizontal') !== (innerWidth > innerHeight))) toast('Tu navegador no permite fijar la orientación: gira el teléfono o desbloquea la rotación', 3200);
    };

    // ---------------------------------------------------------------- guardado: estado real
    const badge = $('save-badge'); const saveNote = $('save-note'); const retry = $('btn-save-retry') as HTMLButtonElement;
    const syncSave = () => {
      const st = state.status;
      if (st === 'ok') { badge.hidden = true; saveNote.textContent = 'Progreso guardado en este navegador.'; retry.hidden = true; }
      else if (st === 'session') { badge.hidden = false; badge.textContent = 'Partida de esta sesión: no se puede guardar'; saveNote.textContent = 'Este navegador no permite guardar (modo privado o bloqueado). Puedes jugar igualmente.'; retry.hidden = true; }
      else { badge.hidden = false; badge.textContent = 'No se pudo guardar · partida de esta sesión'; saveNote.textContent = 'No se pudo guardar (almacenamiento lleno o bloqueado). El progreso sigue en esta sesión.'; retry.hidden = false; }
    };
    state.listeners.push(syncSave); syncSave();
    { const e7 = () => { if (state.status !== 'ok') avisos.error('E07'); }; state.listeners.push(e7); e7(); }   // V10.6 (B5): no se puede guardar
    retry.onclick = () => { if (state.retrySave()) toast('Guardado'); };

    // ---------------------------------------------------------------- sonido que no arranca (AUD-01)
    const fix = $('btn-sound-fix') as HTMLButtonElement;
    game.audio.onNeedsGesture = (need) => { fix.hidden = !need || !game.started || state.p.settings.muted; };
    fix.onclick = () => { game.audio.unlock(); fix.blur(); };

    // ---------------------------------------------------------------- pausa y modales
    const vol = $('vol') as HTMLInputElement; vol.value = String(state.p.settings.volume);
    const muteBtn = $('btn-mute');
    const syncMute = () => { muteBtn.textContent = state.p.settings.muted ? 'Quitar silencio' : 'Silenciar'; muteBtn.setAttribute('aria-pressed', String(state.p.settings.muted)); };
    syncMute();
    // V10.5 ronda PORTADA: pulsar la radio guarda `radioPortada` (ausente = sí); encenderla con el sonido en «no» activa el sonido (como en el
    // prototipo). Lo que se tocó mientras cargaba el juego se aplica ahora
    const radioGuardar = (on: boolean) => {
      if (on) { delete state.p.settings.radioPortada; if (state.p.settings.muted) { state.p.settings.muted = false; game.audio.setMuted(false); syncSound(); syncMute(); } }
      else state.p.settings.radioPortada = false;
      state.save(); syncPortada();
    };
    if (portada) { if (portada.radioTocada) radioGuardar(portada.radioEncendida); portada.onRadio = radioGuardar; }
    game.onPauseChange = (on) => {
      if (on) $('btn-plaza').hidden = game.mode === 'reveal' || game.mode === 'preview' || game.narr.enGuion;   // V10.1 P12 · V10.6: no en el tutorial ni la bienvenida (D106-03)
      // R11 (COD-03): «Ver preview» solo desde el parque; en mitad de una actividad dejaba la charla/el reto sin salida al volver
      if (on) { const fd = game.activities.find((a) => a.id === 'freeDance') as any; if (fd?.menu) fd.toggleMenu(false);   // R11 (ONB-01): también con el puntero capturado
        $('btn-preview-again').hidden = !state.previewUnlocked || game.mode !== 'explore';
        { const ex = game.exitableActivity(), b = $('btn-exit-act'); b.hidden = !ex; if (ex) b.textContent = ex.label; }   // V10.1 P06
        // V10.4: «Dame una pista» (dossier 05: ayudas a petición) explorando con misión pendiente; «Saltar tutorial» durante la plaza blanca
        $('btn-pista').hidden = !(game.mode === 'explore' && game.ayuda.disponible && !game.narr.off && (state.p.narr.estado === 'hecho' || state.p.narr.estado === 'antigua'));
        $('btn-tuto-skip2').hidden = !game.narr.puedeSaltar;   // V10.6 (2.6): no con la pregunta del modo ayuda
        openModal($('pause'), $('btn-resume')); }
      else { for (const id of ['creditos', 'settings', 'help', 'confirm', 'confirm-plaza', 'ios-app', 'pause']) if (!$(id).hidden) { closeModal($(id)); if (id === 'ios-app') iosClosed(); } }
    };
    const pause = (on: boolean) => { if (!game.started) return; if (on && game.mode === 'preview') return; game.setPaused(on); };
    // R8: Esc con el puntero capturado (lo suelta el navegador) = pausa; «Continuar» lo recaptura
    game.input.onLockLost = () => pause(true);
    onTap($('btn-pause'), () => { ($('btn-pause') as HTMLButtonElement).blur(); pause(true); });   // R11 (SIS-27)
    $('btn-resume').onclick = () => pause(false);
    vol.oninput = () => { state.p.settings.volume = Number(vol.value); game.audio.setVolume(state.p.settings.volume); };
    vol.onchange = () => state.save();
    // quitar el silencio es un gesto: si el contexto no llegó a arrancar, se reintenta aquí (AUD-01)
    muteBtn.onclick = () => { state.p.settings.muted = !state.p.settings.muted; game.audio.setMuted(state.p.settings.muted); if (!state.p.settings.muted && game.started) game.audio.unlock(); state.save(); syncMute(); syncSound(); };
    $('btn-preview-again').onclick = () => { pause(false); game.showPreview(); };
    // V10.5 (AM-02, AM-03): con onTap (como II): con el pulgar apoyado en el joystick el navegador no manda `click` al segundo dedo
    onTap($('btn-cine-skip'), () => { ($('btn-cine-skip') as HTMLButtonElement).blur(); if (game.narr.inCine) game.narr.skipCine(); else game.closePreview(); });   // V10.1 escena final · V10.4 CIN-01 (W-D35)
    onTap($('btn-tuto-skip'), () => { ($('btn-tuto-skip') as HTMLButtonElement).blur(); game.narr.skipTutorial(); });   // V10.4 (W-D23)
    $('btn-tuto-skip2').onclick = () => { pause(false); game.narr.skipTutorial(); };
    $('btn-pista').onclick = () => { pause(false); void game.ayuda.aPeticion(); };
    // V10.5: T salta el tutorial también con el 2D abierto (ahí el botón va dentro del 2D y #btn-tuto-skip está oculto)
    window.addEventListener('keydown', (e) => { if (e.code === 'KeyT' && !e.repeat && game.started && game.narr.puedeSaltar && !game.narr.skipReq && !topModal()) { e.preventDefault(); game.narr.skipTutorial(); } });
    $('btn-exit-act').onclick = () => { pause(false); game.exitActivity(); };   // V10.1 P06 (D08)
    $('btn-help').onclick = () => { showCols(deviceCols()); openModal($('help'), $('btn-help-close')); };
    $('btn-help-close').onclick = () => closeModal($('help'));
    // ajustes
    const opts: [string, keyof typeof state.p.settings][] = [['opt-invert', 'invertY'], ['opt-reduced', 'reducedMotion'], ['opt-zurdo', 'leftHanded'], ['opt-eficiente', 'eficiente']];   // V10.5 (E5-33): Modo eficiente   // V10.4 R20: zurdo   // V10.1 P03: sin «Mostrar EXTRA»
    const openSettings = () => {
      // V10.5 (AM-23, E5-20): el texto de conducción según la entrada (antes decía «(Q · TABLA · LB)» también en el móvil)
      { const src = game.input.source, k = src === 'gamepad' ? 'mando' : src === 'touch' ? 'tactil' : 'teclado'; $('opt-drive-note').textContent = TEXTOS105.conduccion[k]; }
      for (const [id, k] of opts) ($(id) as HTMLInputElement).checked = !!state.p.settings[k];
      ($('opt-sens') as HTMLInputElement).value = String(state.p.settings.camSens);
      ($('opt-mouse') as HTMLInputElement).checked = state.p.settings.mouseLock;
      // V10.4 (W-D02, W-D16): el modo ayuda se cambia aquí; con el final hecho no queda misión y no está disponible
      { const c = $('opt-ayuda') as HTMLInputElement, off = !game.ayuda.disponible || game.narr.off; c.checked = state.p.narr.ayuda === 'si' && !off; c.disabled = off;
        $('opt-ayuda-note').textContent = off ? TEXTOS.ajustesOff : TEXTOS.ajustesDesc; $('opt-ayuda-label').textContent = TEXTOS.ajustesLabel; }
      openModal($('settings'), $('opt-invert'));
    };
    $('btn-settings').onclick = openSettings;
    // V10.5 ronda PORTADA: el engranaje del inicio abre los mismos Ajustes, por encima del inicio y sin el editor de tamaño de botones
    { const g = $('btn-settings-start') as HTMLButtonElement; g.disabled = false; g.onclick = () => { document.body.classList.add('desde-inicio'); openSettings(); }; }
    ($('opt-mouse') as HTMLInputElement).checked = state.p.settings.mouseLock;
    ($('opt-ayuda') as HTMLInputElement).onchange = (e) => { state.p.narr.ayuda = (e.target as HTMLInputElement).checked ? 'si' : 'no'; state.save(); };
    ($('opt-mouse') as HTMLInputElement).onchange = (e) => {
      state.p.settings.mouseLock = (e.target as HTMLInputElement).checked; state.save();
      // se aplica al cerrar los ajustes y volver al juego (desde un menú no se puede capturar el puntero)
      if (!state.p.settings.mouseLock) { game.input.dropLock(); game.input.setMouseMode(false, 'ajustes'); } else if (MOUSE_OK) game.input.lockWanted = true;
    };
    for (const [id, k] of opts) ($(id) as HTMLInputElement).onchange = (e) => { (state.p.settings as any)[k] = (e.target as HTMLInputElement).checked; if (k === 'reducedMotion') state.p.settings.reducedMotionSet = true; state.save(); game.applySettings(); game.updateModeChip(); syncPortada(); };
    ($('opt-sens') as HTMLInputElement).oninput = (e) => { state.p.settings.camSens = Number((e.target as HTMLInputElement).value); game.applySettings(); };
    ($('opt-sens') as HTMLInputElement).onchange = () => state.save();
    // V10.1 P05 (D07): tamaño de los botones; mientras se edita se ve el HUD real (fondo liso de los ajustes) y se avisa si se tocan
    { const inp = $('opt-btn') as HTMLInputElement, val = $('opt-btn-val'), warn = $('opt-btn-warn'), view = $('btn-size'), now = $('opt-btn-now');
      const overlap = () => { const els = [...document.querySelectorAll<HTMLElement>('#touch > button, #btn-pause, #prompt .big')].filter((e) => e.offsetParent !== null && getComputedStyle(e).display !== 'none');
        const R = els.map((e) => e.getBoundingClientRect()); let n = 0;
        for (let i = 0; i < R.length; i++) for (let j = i + 1; j < R.length; j++) { const a = R[i], b = R[j]; if (a.left < b.right - 1 && b.left < a.right - 1 && a.top < b.bottom - 1 && b.top < a.bottom - 1) n++; }
        for (const r of R) if (r.left < -1 || r.top < -1 || r.right > innerWidth + 1 || r.bottom > innerHeight + 1) n++;
        return n; };
      const show = () => { val.textContent = `${Math.round(state.p.settings.btnScale * 100)} %`; requestAnimationFrame(() => {
        // R5: si en esta pantalla no cabe el tamaño elegido, se dice hasta cuánto llega (los botones se limitan para no salirse)
        const lim = btnScaleUsed < state.p.settings.btnScale - 0.01;
        warn.textContent = lim ? `En esta pantalla los botones llegan hasta el ${Math.round(btnScaleUsed * 100)} %` : 'A este tamaño hay botones que se tocan';
        warn.hidden = !lim && overlap() === 0; }); };
      (game as any).btnOverlap = overlap;
      const edit = (on: boolean) => document.body.classList.toggle('edit-btns', on);
      // V10.2 Q10: vista propia. Al abrir se recuerda el tamaño; la barra, − y + lo cambian EN VIVO sin guardar; Guardar guarda y vuelve a
      // Ajustes; Salir, Esc y B lo devuelven como estaba (antes soltar la barra —o perder el foco en táctil— sacaba de la vista y ya había guardado)
      let before = 1;
      const pct = () => (now.textContent = `${Math.round(state.p.settings.btnScale * 100)} %`);
      const apply = (v: number) => { v = Math.round(THREE.MathUtils.clamp(v, 0.5, 2) * 10) / 10; state.p.settings.btnScale = v; inp.value = String(v); game.applySettings(); show(); };
      const close = (save: boolean) => { if (view.hidden) return; if (save) state.save(); else apply(before); edit(false); closeModal(view); pct(); };
      sizeClose = close;
      inp.oninput = () => apply(Number(inp.value));
      $('btn-size-minus').onclick = () => apply(state.p.settings.btnScale - 0.1);
      $('btn-size-plus').onclick = () => apply(state.p.settings.btnScale + 0.1);
      $('btn-size-save').onclick = () => close(true);
      $('btn-size-exit').onclick = () => close(false);
      $('btn-size-open').onclick = () => { before = state.p.settings.btnScale; inp.value = String(before); edit(true); openModal(view, inp); show(); };
      $('btn-settings').addEventListener('click', pct); pct(); }
    // V10.6 (B6): créditos (desde Ajustes; también desde la portada, por encima del inicio). Esc / B / «Volver» los cierran y el foco vuelve
    $('btn-creditos').onclick = () => openModal($('creditos'), $('btn-creditos-close'));
    $('btn-creditos-close').onclick = () => { closeModal($('creditos')); if ($('settings').hidden) document.body.classList.remove('desde-inicio'); };
    { const c = $('btn-creditos-start') as HTMLButtonElement; c.disabled = false; c.onclick = () => { document.body.classList.add('desde-inicio'); openModal($('creditos'), $('btn-creditos-close')); }; }
    $('btn-settings-close').onclick = () => { document.body.classList.remove('edit-btns'); closeModal($('settings')); document.body.classList.remove('desde-inicio'); };
    // reinicio con confirmación propia (sin confirm() bloqueante)
    const openConfirm = () => openModal($('confirm'), $('btn-confirm-no'));
    $('btn-restart').onclick = openConfirm;
    $('btn-confirm-no').onclick = () => closeModal($('confirm'));
    // V10.1 P12: volver a la plaza (confirmación propia; se cierra la pausa y se ejecuta con la simulación en marcha)
    $('btn-plaza').onclick = () => openModal($('confirm-plaza'), $('btn-plaza-yes'));
    $('btn-plaza-no').onclick = () => closeModal($('confirm-plaza'));
    $('btn-plaza-yes').onclick = () => { closeModal($('confirm-plaza')); pause(false); game.goToPlaza(); };
    $('btn-confirm-yes').onclick = () => { state.reset(); location.reload(); };

    // Escape / Start / P: cierra la capa superior o alterna la pausa
    game.input.onPause = () => {
      if (!$('glost').hidden) return;   // R13: el aviso de pérdida de la imagen solo se cierra con «Continuar» (recarga)
      // R11 (ONB-01): con el abanico de bailes abierto, Esc lo cierra (antes abría la pausa y el abanico quedaba debajo)
      const fdance = game.activities.find((a) => a.id === 'freeDance') as any;
      if (fdance?.menu && !topModal() && !game.paused) { fdance.toggleMenu(false); return; }
      const top = topModal();
      if (top && top.id === 'btn-size') { sizeClose(false); return; }   // V10.2 Q10: Esc / B deshacen el tamaño
      if (top && top.id === 'ios-app') { iosDone(); return; }   // V10.6 (H8-17): Esc / B lo cierran como sus botones (queda contestado)
      if (top && top.id === 'cascos') { cerrarCascos(); return; }   // V10.6: Esc / B = «Continuar»
      if (top && top.id === 'crono-fin') { cerrarFin(); return; }   // V10.6.2: Esc / B = «CONTINUAR» (sin dejar el juego sin entrada)
      if (top && top.id !== 'pause' && top.id !== 'final') { closeModal(top); if (top.id === 'settings' || (top.id === 'creditos' && $('settings').hidden)) document.body.classList.remove('desde-inicio'); return; }
      // V10.6 (H8-14): con la pausa abierta, Esc / B / Start la cierran ANTES de mirar lo que hay debajo (antes, con la cinemática del parque
      // debajo, pedían saltarla y la pausa seguía abierta: al «Seguir» la cinemática se perdía)
      if (top && top.id === 'pause') { pause(false); return; }
      if (game.mode === 'preview') { game.closePreview(); return; }
      if (game.narr.inCine) { game.narr.skipCine(); return; }   // V10.4 (W-D35): Esc / B saltan la cinemática del parque
      if (!game.started) return;
      pause(!game.paused);
    };
    // flechas/cruceta en menús: mover el foco (el baile recibe las suyas cuando no hay modal)
    const prevDir = game.input.onDir;
    game.input.onDir = (d) => {
      if (topModal()) {
        // V10.2 R-10: con el mando, ←/→ mueven la barra que tiene el foco (volumen, sensibilidad, tamaño de botones); antes solo movían el foco
        const a = document.activeElement as HTMLInputElement | null;
        if (a?.matches?.('input[type=range]') && (d === 'left' || d === 'right')) { if (d === 'right') a.stepUp(); else a.stepDown(); a.dispatchEvent(new Event('input', { bubbles: true })); a.dispatchEvent(new Event('change', { bubbles: true })); return; }
        moveFocus(d === 'up' || d === 'left' ? -1 : 1); return; }
      // R11 (PAD-01): en la portada la cruceta recorre sus botones
      if (!game.started && !$('start').hidden) {
        const bs = [...$('start').querySelectorAll<HTMLButtonElement>('button')].filter((b) => !b.hidden && !b.disabled && b.offsetParent !== null);
        if (bs.length) { const i = bs.indexOf(document.activeElement as HTMLButtonElement); bs[(i + (d === 'up' || d === 'left' ? -1 : 1) + bs.length) % bs.length].focus(); }
        return;
      }
      prevDir?.(d);
    };
    document.addEventListener('visibilitychange', () => {
      if (document.hidden && game.started) { if (game.mode === 'preview') game.audio.suspend(); else pause(true); }
      else if (!document.hidden && game.mode === 'preview') game.audio.resume();
    });
    // R11 (SIS-01): otra pestaña del juego guardó → se fusiona su progreso (o, si reinició, esta deja de guardar y avisa)
    state.onExternal = () => { game.externalPending = true; };
    state.onStale = () => toast('La partida ha cambiado en otra pestaña: recarga esta para seguir guardando', 5000);
    addEventListener('storage', (e) => { if (e.key === SAVE_KEY) state.mergeFromDisk(); });
    // R11 (SIS-18): si el mando con el que se estaba jugando se desconecta, pausa y aviso
    game.input.onPadLost = () => { if (game.started && !game.paused && game.mode !== 'preview') { pause(true); toast('Mando desconectado', 2400); } };
    // V4-CAM-03: perder el foco de la ventana (otra app, barra del sistema) también pausa simulación y audio; al volver se
    // ve el menú de pausa (las teclas se sueltan en input.clear y una tecla aún pulsada no cuenta hasta volver a pulsarla)
    // V10.6: con la pantalla de cascos abierta, no (el juego aún no ha empezado y la pausa quedaba debajo de ella)
    window.addEventListener('blur', () => { if (game.started && !game.paused && game.mode !== 'preview' && $('start').hidden && $('cascos').hidden) pause(true); });
    // V10.6 (1.5, nota de IT8): girar el móvil en mitad de una actividad larga (grind, baile, reto, grafiti…) la pausa, como cambiar de pestaña
    // (antes seguía sin entrada y podía acabarse sola). Explorando, en menús o en la portada no cambia nada; en ordenador, tampoco
    { let land = innerWidth > innerHeight;
      addEventListener('resize', () => { const l = innerWidth > innerHeight; if (l === land) return; land = l;
        if (!game.touchUI || !game.started || game.paused || game.mode === 'preview' || !$('start').hidden) return;
        if (game.exitableActivity()) pause(true); }); }

    // ---------------------------------------------------------------- preview final (cancelable)
    game.onModal = (id, open) => { if (open) { openModal($(id), $('btn-play-preview')); game.input.setModal(true); } else { closeModal($(id)); game.input.setModal(game.paused); } };
    $('btn-play-preview').onclick = () => { game.audio.unlock(); if (game.previewToken?.alive) game.playPreviewAudio(game.previewToken); };
    $('btn-close-final').onclick = () => game.closePreview();
    $('btn-share').onclick = async () => {
      const url = cfg.cta.url; if (!url) return;
      const data = { title: 'Bellakaventuras', text: cfg.share.text, url };
      try { if (navigator.share) await navigator.share(data); else { await navigator.clipboard.writeText(`${data.text} ${data.url}`); $('final-status').textContent = 'Enlace copiado'; } } catch { /* cancelado */ }
    };
  } catch (e: any) {
    console.error(e);
    // V10.6 (B5): sin WebGL (E01) u otro fallo del arranque (E99); la física ya avisó (E05)
    try { if (!e?.bkAviso) { const c = document.createElement('canvas'); avisos.error(c.getContext('webgl2') || c.getContext('webgl') ? 'E99' : 'E01', 'motor'); } } catch { /* */ }
    err.hidden = false;
    err.textContent = `No se pudo cargar el juego: ${e?.message ?? e}. Recarga la página.`;
    carga?.error();   // V10.5 ronda PORTADA: la píldora dice «Error»
  }
}
