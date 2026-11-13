// Entrada V4 (CTRL-01/02): un frame tipado por tick lógico, común a teclado, táctil y mando.
// Contrato V4: move.x = GIRO (A/D, stick X) y move.y = PROPULSIÓN/FRENO (W/S, stick Y) son canales independientes, sin
// normalizar el par (una diagonal no reduce la propulsión ni el giro impulsa); el signo del stick Y se normaliza una sola
// vez (arriba = +1) y la cámara no lo reinterpreta. boardToggle = Q / botón TABLA / LB (también Select): petición única.
// - Los eventos del navegador solo acumulan estado/bordes; `sample()` los convierte en un InputFrame una vez por paso
//   fijo: un fotograma de render que contiene tres pasos de física no genera tres saltos.
// - Táctil: un propietario por pointer (joystick, cámara, SALTO, AGACHARSE, EXTRA). La cámara solo toma pointers que
//   empiezan en zona libre (los botones del HUD están por encima en el DOM). Cancelar uno no borra los otros.
// - Teclado: WASD/flechas mover · Espacio SALTO · C/Shift AGACHARSE (mantener) · E ACCIÓN · F EXTRA · Q bajar/subir de la
//   tabla (petición explícita) · R recentrar · Escape pausa/cierre · J/L/I/K órbita. Enter/Espacio sobre un botón enfocado usan su clic nativo.
// - Mando (Gamepad API, mapeo estándar): stick izq. X giro / Y propulsión-freno (y dirección de truco) · stick der. cámara ·
//   A SALTO · B AGACHARSE · X EXTRA · Y ACCIÓN · LB (o Select) TABLA · Start pausa · R3 recentrar · cruceta = direcciones.
// - R8 · modo ratón (escritorio con ratón): JUGAR captura el puntero (Pointer Lock, sin clics extra). Con el puntero capturado,
//   mover el ratón gira la cámara sin pulsar nada y activa el MODO RATÓN (aviso «Cámara: ratón»): a pie W/S/A/D van respecto a
//   la vista (A/D = paso lateral, ANMI mira hacia la vista al moverse) y en tabla la tabla gira hacia la vista (A/D siguen
//   girando). Pulsar dirección tras ≥ 4 s sin ratón (o J/L/I/K, mando, táctil) vuelve al modo teclado («Cámara: teclado»), sin
//   reiniciar nada. Esc (regla del navegador) suelta el puntero y pausa; «Continuar» lo recaptura. Diálogos, actividades y menús
//   lo sueltan y, al volver al juego, se recaptura (si el navegador lo niega, un clic en el juego lo recupera).
import { orient } from './orient';
import { dialogOpen, pressDialog, topModal, onTap } from './ui';
type Owner = 'stick' | 'cam' | 'jump' | 'crouch' | 'extra' | 'board' | 'leanL' | 'leanR';
export type Source = 'keyboard' | 'touch' | 'gamepad' | 'mouse';
export type Dir = 'up' | 'down' | 'left' | 'right';

export interface InputFrame {
  move: { x: number; y: number };   // lógico: x = giro (derecha +), y = propulsión (adelante +, atrás = freno/reversa)
  jumpPressed: boolean; jumpHeld: boolean;
  crouchDesired: boolean;
  interactPressed: boolean;
  extraPressed: boolean; extraHeld: boolean;
  boardToggle: boolean;
  /** R2-G8: baile pedido con teclado (1–8; 0 = ninguno) y apertura del menú de bailes (B). */
  danceSlot?: number; danceMenu?: boolean;
  /** R8 (modo ratón): rumbo de la VISTA (rad, misma convención que el frente: (sin, 0, cos)). Solo existe en modo ratón con
   *  cámara de seguimiento; sin él, el controlador es el de siempre (A/D = giro). */
  aim?: number;
  source: Source;
}
export const EMPTY_FRAME: InputFrame = { move: { x: 0, y: 0 }, jumpPressed: false, jumpHeld: false, crouchDesired: false, interactPressed: false, extraPressed: false, extraHeld: false, boardToggle: false, source: 'keyboard' };

const GAME_KEYS = new Set(['Space', 'KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'KeyC', 'ShiftLeft', 'ShiftRight', 'KeyE', 'KeyF', 'KeyQ', 'KeyR', 'KeyJ', 'KeyL', 'KeyI', 'KeyK',
  'KeyB', 'Digit1', 'Digit2', 'Digit3', 'Digit4', 'Digit5', 'Digit6', 'Digit7', 'Digit8']);   // R2-G8: B = menú de bailes, 1–8 = bailar
const STRAIGHT = 12 * Math.PI / 180;   // V5 T5-16: sector recto del stick táctil
const DIR_KEYS = new Set(['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight']);
const CAM_KEYS = new Set(['KeyJ', 'KeyL', 'KeyI', 'KeyK']);
/** R8: segundos sin ratón tras los que una tecla de dirección devuelve el modo teclado. */
export const MOUSE_IDLE_MS = 4000;
const isField = (t: EventTarget | null) => t instanceof HTMLElement && (/^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName) || t.isContentEditable);

/** V10.2 R-11: botón «Salir» del panel de actividad que se ve ahora (grafiti de la rana o baile de FG), o null. */
function panelExit(): HTMLButtonElement | null {
  for (const id of ['graffiti-exit', 'dance-exit']) { const b = document.getElementById(id) as HTMLButtonElement | null; if (b && !b.closest('[hidden]') && b.offsetParent !== null) return b; }
  return null;
}
export class Input {
  /** Controles del mundo activos (falso durante actividades con entrada propia, modales, final y preview). */
  world = true;
  /** Si hay una capa modal (pausa, preview, diálogo bloqueante) el teclado no llega al juego. */
  modal = false;
  move = { x: 0, y: 0 };              // joystick táctil
  crouchToggle = false;               // alternancia táctil (estado, no pulsación)
  camDelta = { x: 0, y: 0 };          // píxeles acumulados para la cámara (los consume CameraRig en presentación)
  lastCamInput = -1e9;                // tiempo de pared (ms) del último giro manual (ratón, toque, teclas, mando)
  recenter = false;
  /** V10.5 (AM-07, E5-19): la fuente inicial según el aparato (pantalla táctil → táctil); antes, teclado hasta el primer toque en el juego. */
  source: Source = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches ? 'touch' : 'keyboard';
  usedTouch = false;
  readonly radius = 56;
  private knobK = 1;
  /** V10.5 (E5-40): un toque en el contador de patatas (lo cuenta el juego: 5 seguidos encienden el contador de FPS). */
  onCounterTap: (() => void) | null = null;
  /** V5 T5-17 (C′, `?bkctl=gesto`): vector crudo del stick táctil (x derecha +, y arriba +, m tras zona muerta) y nº de gesto
   *  (cambia al apoyar y al soltar el pulgar). */
  stickRaw = { x: 0, y: 0, m: 0 }; gestureId = 0;
  log: string[] = [];
  /** V10.1 P09: abanico de SKILLS abierto: la cruceta/stick del mando eligen opción (direcciones discretas) en vez de mover a ANMI. */
  menuCapture = false;
  /** Callbacks de interfaz (los conecta bootstrap/game). */
  onPause: (() => void) | null = null;   // Escape / Start
  /** V10.5 ronda PORTADA: Start del mando en el inicio (true = usado: no abre la pausa). */
  onPadStart: (() => boolean) | null = null;
  onDir: ((d: Dir) => void) | null = null; // direcciones discretas (baile, menús)

  // ------------------------------------------------------------------ R8: modo ratón
  /** Preferencia detectada: el jugador usa el ratón para la cámara (se conserva al pausar; manda solo con el puntero capturado). */
  mouseMode = false;
  /** Puntero capturado (Pointer Lock) sobre el lienzo. */
  locked = false;
  /** El jugador juega con el puntero capturado (lo pide JUGAR; se mantiene al soltarlo por diálogos o pausa para recapturar). */
  lockWanted = false;
  /** Píxeles de ratón con el puntero capturado (los consume CameraRig con su propia sensibilidad). */
  lockDelta = { x: 0, y: 0 };
  /** Diagnóstico/pruebas: cambios de modo, capturas, recapturas negadas y última causa del cambio. */
  mouseStats = { toMouse: 0, toKeys: 0, locks: 0, lockFails: 0, lockLost: 0, why: '' };
  onMouseMode: ((on: boolean, why: string) => void) | null = null;
  /** Esc del navegador (o pérdida del bloqueo) jugando: la interfaz pausa. */
  onLockLost: (() => void) | null = null;
  /** No se pudo (re)capturar el puntero sin gesto: la interfaz indica «haz clic en el juego». */
  onLockHint: ((show: boolean) => void) | null = null;
  private lockEl: HTMLElement | null = null;
  private releasing = false; private lockLostAt = -1e9;
  private lastMouseAt = -1e9; private mouseAcc = 0; private mouseAccAt = -1e9;

  private keys = new Set<string>();
  private stickLive = false;
  /** V10.6 (H8-16): dedo que seguía apoyado en el joystick cuando una capa (charla, pausa, actividad) soltó los dedos: al volver al mundo se
   *  vuelve a tomar como joystick si no se ha levantado entre medias. `adopted` = el retomado que aún no se ha movido (si llega un dedo nuevo
   *  al joystick antes de que se mueva, manda el nuevo: nunca queda un joystick «fantasma»). */
  private heldStick: { id: number; origin: { x: number; y: number } } | null = null;
  private adoptedStick = -1;
  /** V5 T5-16: perfil de conducción = fuente que dio entrada de conducción en los últimos 0,3 s (sin parpadeo). */
  private driveSrc: Source = 'keyboard'; private driveAt = -1e9;
  get driveProfile(): Source { return this.driveSrc; }
  /** V5 T5-06 (DT-18): teclas FÍSICAMENTE pulsadas (keydown sin repetición / keyup), también con modal o sin mundo. Al
   *  cerrar un modal interno o volver al mundo, las DIRECCIONES aún pulsadas se reactivan (los bordes discretos —salto,
   *  tabla, acción, extra— no). La pérdida de foco (blur/oculto) lo limpia todo: una tecla que siga abajo al volver no
   *  actúa hasta pulsarla de nuevo (la autorrepetición no cuenta). */
  private phys = new Set<string>();
  private owners = new Map<number, Owner>();
  private stickOrigin = { x: 0, y: 0 };
  private camLast = new Map<number, { x: number; y: number }>();
  private edge = { jump: 0, interact: 0, extra: 0, board: 0 };
  private touchJump = false; private touchExtra = false;
  /** V10: botones táctiles ◀ ▶ del equilibrio del grind de RG1 (−1 izquierda, +1 derecha; solo visibles durante el grind). */
  private touchLean = 0;
  /** V10 IT3 (feedback: «en el grind, en el ordenador, no habrá modo de cámara con ratón: podrás mover el ratón por la pantalla y clicar a
   *  izquierda y derecha para corregir el balance»): puntero libre durante la actividad; clic izquierdo = −1, derecho = +1. */
  freePointer = false; private mouseLean = 0;
  setFreePointer(on: boolean) {
    if (this.freePointer === on) return; this.freePointer = on; this.mouseLean = 0;
    if (on) { this.release(); if (this.mouseMode) this.setMouseMode(false, 'actividad'); } else this.syncLock();
    document.body.classList.toggle('puntero-libre', on);
  }
  private pad = { buttons: [] as boolean[], dirs: { up: false, down: false, left: false, right: false } as Record<Dir, boolean>, connected: false, id: '' };
  private padMove = { x: 0, y: 0 }; private padCam = { x: 0, y: 0 }; private padJump = false; private padCrouch = false; private padExtra = false;
  private stickEl = document.getElementById('stick')!;
  private knobEl = this.stickEl.querySelector('i') as HTMLElement;
  private jumpEl = document.getElementById('btn-jump')!;
  private crouchEl = document.getElementById('btn-crouch')!;
  private extraEl = document.getElementById('btn-extra');
  private boardEl = document.getElementById('btn-board');
  private camBtn = document.getElementById('btn-cam')!;
  /** Estadística para pruebas: frames muestreados y bordes consumidos. */
  stats = { frames: 0, jumps: 0, extras: 0, interacts: 0 };
  /** Mando simulado (pruebas EXT-04): si existe, sustituye a navigator.getGamepads(). */
  fakePad: { axes: number[]; buttons: { pressed: boolean; value: number }[]; id: string; connected: boolean } | null = null;

  constructor() {
    const stickZone = document.getElementById('stick-zone')!;
    const camZone = document.getElementById('cam-zone')!;
    stickZone.addEventListener('pointerdown', (e) => this.down(e, 'stick'));
    camZone.addEventListener('pointerdown', (e) => this.down(e, 'cam'));
    this.jumpEl.addEventListener('pointerdown', (e) => this.down(e, 'jump'));
    this.crouchEl.addEventListener('pointerdown', (e) => this.down(e, 'crouch'));
    this.extraEl?.addEventListener('pointerdown', (e) => this.down(e, 'extra'));
    this.boardEl?.addEventListener('pointerdown', (e) => this.down(e, 'board'));
    document.getElementById('btn-lean-l')?.addEventListener('pointerdown', (e) => this.down(e, 'leanL'));   // V10
    document.getElementById('btn-lean-r')?.addEventListener('pointerdown', (e) => this.down(e, 'leanR'));
    onTap(this.camBtn, (e) => { e.stopPropagation(); this.recenter = true; this.camBtn.blur(); });   // R11 (SIS-27)
    window.addEventListener('pointermove', (e) => this.moveEv(e), { passive: true });
    window.addEventListener('pointerup', (e) => this.up(e));
    window.addEventListener('pointercancel', (e) => this.up(e));
    window.addEventListener('keydown', (e) => this.keyDown(e));
    window.addEventListener('keyup', (e) => this.keyUp(e));
    window.addEventListener('blur', () => this.clear(true));
    document.addEventListener('visibilitychange', () => { if (document.hidden) this.clear(true); });
    window.addEventListener('contextmenu', (e) => e.preventDefault());
    window.addEventListener('gamepaddisconnected', () => { if (this.pad.connected) this.padLost(); });
  }

  // ------------------------------------------------------------------ teclado
  private keyDown(e: KeyboardEvent) {
    if (!e.repeat && !isField(e.target)) this.phys.add(e.code);
    // R11: la autorrepetición de Enter/Espacio no va pasando las frases de una charla
    if (e.repeat && (e.code === 'Enter' || e.code === 'Space') && dialogOpen()) { e.preventDefault(); return; }
    // R8: con el puntero capturado, Esc lo suelta el navegador y la pausa llega por pointerlockchange (no se alterna dos veces)
    // (si el navegador entrega la tecla sin soltar el puntero, se suelta aquí y la pausa llega igual por pointerlockchange)
    if (e.code === 'Escape' && (this.locked || performance.now() - this.lockLostAt < 400)) { e.preventDefault(); if (this.locked && !e.repeat) document.exitPointerLock?.(); return; }
    // R11 (SIS-06): P también cierra la pausa (antes solo la abría)
    if (e.code === 'Escape' || e.code === 'KeyP') { if (!e.repeat && (e.code === 'Escape' || !this.modal || topModal()?.id === 'pause')) { e.preventDefault(); this.onPause?.(); } return; }
    // V10.2 R-11: X = «Salir» del panel de actividad visible (grafiti de la rana, baile de FG), la tecla que enseña su botón
    if (e.code === 'KeyX' && !e.repeat && !topModal() && !(e.ctrlKey || e.altKey || e.metaKey)) { const ex = panelExit(); if (ex) { e.preventDefault(); ex.click(); return; } }
    // R11 (MIX-02): una tecla de juego con Ctrl/Alt/⌘ es un atajo del sistema o del navegador, no una acción del juego
    if ((e.ctrlKey || e.altKey || e.metaKey) && GAME_KEYS.has(e.code)) return;
    if (isField(e.target)) return;
    const t = e.target as HTMLElement | null;
    const onButton = t instanceof HTMLButtonElement || t instanceof HTMLAnchorElement;
    // V10.4: un diálogo abierto (también la capa 2D del modo ayuda, que sale explorando) se avanza con E/Enter/Espacio antes que el mundo
    if (this.world && !this.modal && !e.repeat && dialogOpen() && !topModal() && (e.code === 'KeyE' || e.code === 'Enter' || e.code === 'Space')) { e.preventDefault(); this.keys.delete(e.code); pressDialog(); return; }
    if (this.modal || !this.world) {
      // R11 (SIS-05, NMG-13): charla abierta sin modal encima → E (pulsación nueva) cierra/avanza; Enter/Espacio también si «Vale» perdió el foco
      if (!e.repeat && dialogOpen() && !topModal() && (e.code === 'KeyE' || ((e.code === 'Enter' || e.code === 'Space') && (document.activeElement as HTMLElement | null)?.id !== 'dialog-ok'))) {
        e.preventDefault(); this.keys.delete(e.code); pressDialog(); return;
      }
      // modales: Enter/Espacio usan el clic nativo del botón enfocado; flechas → direcciones discretas (baile/menús)
      if (!e.repeat) { const d = keyDir(e.code); if (d && this.onDir) { e.preventDefault(); this.emitDir(d); } }
      this.keys.delete(e.code);
      return;
    }
    if (onButton && (e.code === 'Space' || e.code === 'Enter')) {
      // R11 (MIX-04): un botón del HUD enfocado CON TECLADO (Tab) se activa con Enter como cualquier botón
      if (e.code === 'Enter' && t!.closest('#touch, #hud') && t!.matches(':focus-visible')) return;
      // un botón del HUD enfocado tras un clic no debe robar SALTO: se devuelve el foco al juego
      if (t!.closest('#touch, #hud')) t!.blur(); else return;
    }
    if (!GAME_KEYS.has(e.code) && e.code !== 'Enter') return;
    if (e.code === 'Space' || e.code.startsWith('Arrow')) e.preventDefault();
    if (e.repeat) return;
    this.keys.add(e.code);
    this.source = 'keyboard';
    // R8: J/L/I/K = cámara con teclado (modo teclado al momento); una dirección tras ≥ 4 s sin ratón, también
    if (this.mouseMode && (CAM_KEYS.has(e.code) || (DIR_KEYS.has(e.code) && performance.now() - this.lastMouseAt >= MOUSE_IDLE_MS))) this.setMouseMode(false, CAM_KEYS.has(e.code) ? 'teclas-camara' : 'teclado-sin-raton');
    if (e.code === 'Space') this.edge.jump++;
    if (e.code === 'KeyE' || e.code === 'Enter') this.edge.interact++;
    if (e.code === 'KeyF') this.edge.extra++;
    if (e.code === 'KeyQ') this.edge.board++;
    if (e.code === 'KeyR') this.recenter = true;
    if (e.code === 'KeyB') this.danceMenuEdge = true;
    if (/^Digit[1-8]$/.test(e.code)) this.danceEdge = +e.code.slice(5);
  }
  private danceEdge = 0; private danceMenuEdge = false;
  private keyUp(e: KeyboardEvent) {
    this.keys.delete(e.code); this.phys.delete(e.code);
    // R11 (SIS-25): en macOS, con ⌘ pulsada no llega el keyup de las demás teclas; al soltar ⌘ se sueltan todas
    if (e.code === 'MetaLeft' || e.code === 'MetaRight') { this.keys.clear(); this.phys.clear(); }
  }
  /** R11 (MIX-03): la misma dirección discreta llegando a la vez por teclado y cruceta cuenta una sola vez. */
  private lastDirEmit: { d: Dir | null; t: number; src: string } = { d: null, t: -1e9, src: '' };
  private emitDir(d: Dir, src: 'key' | 'pad' = 'key') {
    const now = performance.now();
    // solo se descarta el duplicado que llega por la OTRA vía (teclado + cruceta a la vez); dos pulsaciones de la misma vía cuentan
    if (this.lastDirEmit.d === d && this.lastDirEmit.src !== src && now - this.lastDirEmit.t < 70) return;
    this.lastDirEmit = { d, t: now, src }; this.onDir?.(d);
  }

  // ------------------------------------------------------------------ táctil / ratón
  private down(e: PointerEvent, owner: Owner) {
    if (!this.world || this.modal) return;
    if (this.owners.has(e.pointerId)) return;
    // V10.6 (H8-16): un joystick retomado que aún no se ha movido cede su sitio a un dedo nuevo (pudo levantarse sin que llegara su `pointerup`)
    if (owner === 'stick' && this.adoptedStick >= 0 && this.owners.get(this.adoptedStick) === 'stick') { this.owners.delete(this.adoptedStick); this.adoptedStick = -1; }
    if (owner === 'stick' && [...this.owners.values()].includes('stick')) owner = 'cam'; // segundo dedo en la zona izquierda: cámara
    e.preventDefault();
    // IT3: en el grind con puntero libre, el clic del ratón equilibra (izquierdo −1, derecho +1) y no mueve la cámara
    if (e.pointerType === 'mouse' && this.freePointer) { this.mouseLean = e.button === 2 ? 1 : e.button === 0 ? -1 : 0; this.source = 'keyboard'; return; }
    // R8: clic con ratón en el juego sin el puntero capturado (recaptura negada sin gesto): este clic lo recaptura
    if (e.pointerType === 'mouse' && owner === 'cam' && this.lockWanted && !this.locked) { this.requestLock(); return; }
    this.usedTouch = e.pointerType === 'touch';
    this.source = e.pointerType === 'touch' ? 'touch' : 'mouse';
    if (e.pointerType === 'touch' && this.mouseMode) this.setMouseMode(false, 'tactil');
    this.owners.set(e.pointerId, owner);
    this.log.push(`+${owner}:${e.pointerId}`);
    try { (e.target as HTMLElement).setPointerCapture?.(e.pointerId); } catch { /* sin captura */ }
    const L = orient.toLogical(e.clientX, e.clientY);   // V5 T5-18: coordenadas lógicas (contenedor girado o no)
    if (owner === 'stick') {
      this.gestureId++; this.stickRaw = { x: 0, y: 0, m: 0 };
      this.stickOrigin = { x: L.x, y: L.y };
      // V10.4 R20 (usuario): el joystick se ve SIEMPRE en el mismo sitio (CSS); se maneja desde donde se toque de su zona: el dibujo no se mueve
      this.stickEl.classList.add('on'); this.knobEl.style.transform = 'translate(0,0)';
      this.knobK = Math.min(1, (this.stickEl.offsetWidth || 130) / 130);   // V10.5 (E5-23): el aro de 110 px en pantallas estrechas: el pomo recorre menos
    } else if (owner === 'cam') {
      this.camLast.set(e.pointerId, { x: L.x, y: L.y });
      // V10.5 (E5-40, T4): toques en el contador de patatas (que no recibe toques: la cámara sigue funcionando desde ahí) para el contador de FPS
      if (e.pointerType === 'touch' && this.onCounterTap) { const c = document.getElementById('counter')?.getBoundingClientRect(); if (c && e.clientX >= c.left && e.clientX <= c.right && e.clientY >= c.top && e.clientY <= c.bottom) this.onCounterTap(); }
    } else if (owner === 'jump') {
      this.edge.jump++; this.touchJump = true; this.jumpEl.classList.add('on');
    } else if (owner === 'extra') {
      this.edge.extra++; this.touchExtra = true; this.extraEl?.classList.add('on');
    } else if (owner === 'crouch') {
      this.crouchToggle = !this.crouchToggle;
    } else if (owner === 'board') {
      this.edge.board++; this.boardEl?.classList.add('on');
    } else if (owner === 'leanL' || owner === 'leanR') {
      this.touchLean = owner === 'leanL' ? -1 : 1; (e.target as HTMLElement).classList.add('on'); this.driveSrc = 'touch'; this.driveAt = performance.now();
    }
  }

  private moveEv(e: PointerEvent) {
    const o = this.owners.get(e.pointerId);
    if (!o) return;
    const L = orient.toLogical(e.clientX, e.clientY);
    if (o === 'stick' && e.pointerId === this.adoptedStick) this.adoptedStick = -1;   // V10.6 (H8-16): el retomado se mueve: es un dedo real
    if (o === 'stick') {
      let dx = L.x - this.stickOrigin.x, dy = L.y - this.stickOrigin.y;
      const d = Math.hypot(dx, dy);
      if (d > this.radius * 1.6) { // el origen sigue al dedo si se aleja mucho
        const k = (d - this.radius * 1.6) / d;
        this.stickOrigin.x += dx * k; this.stickOrigin.y += dy * k;
        dx = L.x - this.stickOrigin.x; dy = L.y - this.stickOrigin.y;
      }
      const len = Math.min(Math.hypot(dx, dy), this.radius);
      const a = Math.atan2(dy, dx);
      this.knobEl.style.transform = `translate(${Math.cos(a) * len * this.knobK}px, ${Math.sin(a) * len * this.knobK}px)`;
      // V5 T5-16 (DT-15, perfil táctil «tanque asistido» T+): la misma semántica que el teclado, pensada para pulgares.
      //  · zona muerta radial 0,12 con histéresis (sale a 0,08);
      //  · α = ángulo respecto al eje vertical (arriba/abajo). Sector recto |α| ≤ 12°: giro 0 (una deriva de 10 px ya no gira);
      //  · giro: curva expo ((α − 12°)/(45° − 12°))^1,6, saturada a partir de 45° (la diagonal = W+D: giro completo);
      //  · propulsión «cuadrada»: |cos|/max(|cos|,|sin|) → la diagonal da propulsión completa y el lateral puro, 0.
      const mag = len / this.radius, dead = this.stickLive ? 0.08 : 0.12;
      this.stickLive = mag >= dead;
      const m = mag < dead ? 0 : Math.min(1, (mag - dead) / (1 - dead));
      const sx = Math.cos(a), sy = -Math.sin(a), alpha = Math.atan2(Math.abs(sx), Math.abs(sy));   // 0 = vertical, π/2 = lateral
      const turn = alpha <= STRAIGHT ? 0 : Math.min(1, Math.pow((alpha - STRAIGHT) / (Math.PI / 4 - STRAIGHT), 1.6));
      const thrust = Math.min(1, Math.abs(sy) / Math.max(1e-6, Math.abs(sx)));
      this.move = { x: Math.sign(sx) * turn * m, y: Math.sign(sy) * thrust * m };
      this.stickRaw = { x: sx, y: sy, m };
      if (m > 0) { this.driveSrc = 'touch'; this.driveAt = performance.now(); }
    } else if (o === 'cam') {
      const l = this.camLast.get(e.pointerId)!;
      this.camDelta.x += L.x - l.x; this.camDelta.y += L.y - l.y;
      l.x = L.x; l.y = L.y;
      this.lastCamInput = performance.now();
    }
  }

  private up(e: PointerEvent) {
    if (e.pointerType === 'mouse' && this.freePointer) this.mouseLean = 0;   // IT3
    if (this.heldStick?.id === e.pointerId) this.heldStick = null;   // V10.6 (H8-16): se levantó con la capa abierta: ya no se retoma
    if (this.adoptedStick === e.pointerId) this.adoptedStick = -1;
    const o = this.owners.get(e.pointerId);
    if (!o) return;
    this.owners.delete(e.pointerId);
    this.log.push(`-${o}:${e.pointerId}${e.type === 'pointercancel' ? '(cancel)' : ''}`);
    if (o === 'stick') { this.stickEl.classList.remove('on'); this.knobEl.style.transform = 'translate(0,0)'; this.move = { x: 0, y: 0 }; this.stickLive = false; this.stickRaw = { x: 0, y: 0, m: 0 }; this.gestureId++; }
    else if (o === 'cam') this.camLast.delete(e.pointerId);
    else if (o === 'jump') { this.touchJump = false; this.jumpEl.classList.remove('on'); }
    else if (o === 'extra') { this.touchExtra = false; this.extraEl?.classList.remove('on'); }
    else if (o === 'board') this.boardEl?.classList.remove('on');
    else if (o === 'leanL' || o === 'leanR') { if ((this.touchLean < 0) === (o === 'leanL')) this.touchLean = 0; document.getElementById(o === 'leanL' ? 'btn-lean-l' : 'btn-lean-r')?.classList.remove('on'); }
  }

  // ------------------------------------------------------------------ mando
  /** Lectura del mando cuando no hay pasos de simulación (pantalla inicial, pausa): solo menús/pausa. */
  pollIdle() { this.pollPad(); }
  private pollPad() {
    const pads = this.fakePad ? [this.fakePad] : (navigator.getGamepads?.() ?? []);
    const gp = [...pads].find((p) => p && p.connected) as any;
    if (!gp) { if (this.pad.connected) { this.pad.connected = false; this.clearPad(); } return; }   // R11: el aviso de mando perdido solo con el evento del navegador
    if (!this.pad.connected) { this.pad.connected = true; this.pad.id = gp.id; this.log.push(`pad:${gp.id}`); }
    const b = (i: number) => !!gp.buttons[i] && (gp.buttons[i].pressed || gp.buttons[i].value > 0.5);
    const prev = this.pad.buttons;
    const now: boolean[] = []; for (let i = 0; i < 17; i++) now[i] = b(i);
    const pressed = (i: number) => now[i] && !prev[i];
    const radial = (x: number, y: number, dead = 0.18) => { const m = Math.hypot(x, y); if (m < dead) return { x: 0, y: 0 }; const k = Math.min(1, (m - dead) / (1 - dead)) / m; return { x: x * k, y: y * k }; };
    const ls = radial(gp.axes[0] ?? 0, gp.axes[1] ?? 0), rs = radial(gp.axes[2] ?? 0, gp.axes[3] ?? 0, 0.2);
    const dpad = { x: (now[15] ? 1 : 0) - (now[14] ? 1 : 0), y: (now[12] ? 1 : 0) - (now[13] ? 1 : 0) };
    this.padMove = dpad.x || dpad.y ? { x: dpad.x, y: dpad.y } : { x: ls.x, y: -ls.y };
    if (this.padMove.x || this.padMove.y) { this.driveSrc = 'gamepad'; this.driveAt = performance.now(); }
    this.padCam = { x: rs.x, y: rs.y };
    const any = now.some(Boolean) || Math.hypot(ls.x, ls.y) > 0 || Math.hypot(rs.x, rs.y) > 0;
    if (any) { this.source = 'gamepad'; if (this.mouseMode) this.setMouseMode(false, 'mando'); }
    if (pressed(9) && !this.onPadStart?.()) this.onPause?.();   // V10.5 ronda PORTADA: en el inicio, Start = JUGAR
    // V10.2 R-11: B = «Salir» del panel de actividad visible (grafiti de la rana, baile de FG); no llega a pausa ni a agacharse
    const padExit = pressed(1) && !topModal() && !dialogOpen() ? panelExit() : null;
    if (padExit) { padExit.click(); prev[1] = true; }
    // direcciones discretas (baile/menús) con borde: cruceta o stick empujado
    const dirNow: Record<Dir, boolean> = { up: now[12] || ls.y < -0.6, down: now[13] || ls.y > 0.6, left: now[14] || ls.x < -0.6, right: now[15] || ls.x > 0.6 };
    const cap = this.menuCapture;   // V10.1 P09: con el abanico de SKILLS abierto la cruceta elige (estado ANTES de elegir: al elegir se cierra)
    for (const d of ['up', 'down', 'left', 'right'] as Dir[]) if (dirNow[d] && !this.pad.dirs[d] && (this.modal || !this.world || cap)) this.emitDir(d, 'pad');
    if (cap && !this.modal && this.world) this.padMove = { x: 0, y: 0 };
    this.pad.dirs = dirNow;
    if (this.world && !this.modal && dialogOpen() && !topModal()) { if (pressed(0) || pressed(3)) pressDialog(); else if (pressed(1)) pressDialog(true); }   // V10.4: igual con el mando
    else if (this.modal || !this.world) {
      // R11 (PADX-02, SIS-05): charla abierta sin modal encima → A, B o Y cierran/avanzan (B ya no abre la pausa)
      if (dialogOpen() && !topModal()) { if (pressed(0) || pressed(3)) pressDialog(); else if (pressed(1)) pressDialog(true); }   // V10.4: B = segunda opción de una pregunta 2D
      else {
        // menús con mando: A = clic del foco, B = atrás
        if (pressed(0)) (document.activeElement as HTMLElement | null)?.click?.();
        if (pressed(1)) this.onPause?.();
      }
    } else {
      if (pressed(0)) this.edge.jump++;
      if (pressed(2)) this.edge.extra++;
      if (pressed(3)) this.edge.interact++;
      if (pressed(11)) this.recenter = true;
      if (pressed(4) || pressed(8)) this.edge.board++;   // LB (preferente) o Select
      if (pressed(5)) this.danceMenuEdge = true;   // V10.1 P09: RB = SKILLS
      if (this.padCam.x || this.padCam.y) this.lastCamInput = performance.now();
    }
    this.padJump = now[0]; this.padCrouch = now[1]; this.padExtra = now[2];
    this.pad.buttons = now;
  }
  /** R11 (SIS-18): mando perdido. Si era la fuente activa, el juego se pausa y avisa (antes ANMI seguía como estaba). */
  onPadLost: (() => void) | null = null;
  private padLost() {
    const wasActive = this.source === 'gamepad';
    this.pad.connected = false; this.clearPad();
    if (wasActive) this.onPadLost?.();
  }
  private clearPad(keepHistory = false) { this.padMove = { x: 0, y: 0 }; this.padCam = { x: 0, y: 0 }; this.padJump = this.padCrouch = this.padExtra = false; if (!keepHistory) this.pad.buttons = []; }
  get padConnected() { return this.pad.connected; }
  /** Giro de cámara por mando (rad/s normalizado), lo consume la cámara en presentación. */
  padOrbit() { return this.world && !this.modal ? this.padCam : { x: 0, y: 0 }; }

  // ------------------------------------------------------------------ muestreo por tick lógico
  /** Construye el frame del paso fijo actual y consume los bordes. */
  sample(): InputFrame {
    this.pollPad();
    this.stats.frames++;
    if (!this.world || this.modal) { this.edge = { jump: 0, interact: 0, extra: 0, board: 0 }; this.danceEdge = 0; this.danceMenuEdge = false; return { ...EMPTY_FRAME, move: { x: 0, y: 0 }, source: this.source, crouchDesired: this.world && this.crouchToggle && !this.modal }; }
    const f: InputFrame = {
      move: this.latchedMove(this.readMove()),
      jumpPressed: this.edge.jump > 0, jumpHeld: this.keys.has('Space') || this.touchJump || this.padJump,
      crouchDesired: this.crouchToggle || this.keys.has('KeyC') || this.keys.has('ShiftLeft') || this.keys.has('ShiftRight') || this.padCrouch,
      interactPressed: this.edge.interact > 0,
      extraPressed: this.edge.extra > 0, extraHeld: this.keys.has('KeyF') || this.touchExtra || this.padExtra,
      boardToggle: this.edge.board > 0,
      danceSlot: this.danceEdge, danceMenu: this.danceMenuEdge,
      source: this.source,
    };
    this.danceEdge = 0; this.danceMenuEdge = false;
    if (f.jumpPressed) this.stats.jumps++;
    if (f.extraPressed) this.stats.extras++;
    if (f.interactPressed) this.stats.interacts++;
    // R11 (FPS-04): un flanco de SALTO/EXTRA por paso fijo (dos pulsaciones entre dos fotogramas a 8–30 Hz cuentan como dos)
    this.edge = { jump: Math.min(1, Math.max(0, this.edge.jump - 1)), interact: 0, extra: Math.min(1, Math.max(0, this.edge.extra - 1)), board: 0 };
    return f;
  }
  /** Canales de conducción. Teclado: giro = D−A, propulsión = W−S, cada uno ±1 sin normalizar (W+S = neutro, A+D = sin
   *  giro). Prioridad documentada: si una fuente tiene entrada, sustituye a las anteriores (táctil < mando < teclado);
   *  nunca se suman dos aceleraciones. */
  /** R11 (F4: TT-03, FG-09, TT-02): tras desembarcar de una escalera, la dirección que ya estaba pulsada no cuenta hasta soltarla
   *  (antes ANMI seguía andando y caía del techo de la limo / del deck). Con teclado basta soltar o pulsar otra dirección; con mando o
   *  táctil hay además un tope de 3 s (deriva del stick). Sobrevive a la pausa (`clear`) y se libera al empezar otra actividad. */
  private moveLatch: { since: number; dir: { x: number; y: number }; capped: boolean } | null = null;
  holdMoveUntilNeutral() {
    const m = this.readMove(), n = Math.hypot(m.x, m.y);
    this.moveLatch = n < 0.2 ? null : { since: performance.now(), dir: { x: m.x / n, y: m.y / n }, capped: this.source !== 'keyboard' };
  }
  releaseMoveLatch() { this.moveLatch = null; }
  get moveLatched() { return !!this.moveLatch; }
  private latchedMove(m: { x: number; y: number }) {
    const L = this.moveLatch; if (!L) return m;
    const n = Math.hypot(m.x, m.y);
    if (n < 0.2 || (n > 0 && (m.x * L.dir.x + m.y * L.dir.y) / n < 0.5) || (L.capped && performance.now() - L.since > 3000)) { this.moveLatch = null; return n < 0.2 ? m : m; }
    return { x: 0, y: 0 };
  }
  /** R11 (TAC-02): apagar la alternancia de agachado (sin pulsar el botón). */
  setCrouchToggle(on: boolean) { if (this.crouchToggle !== on) { this.crouchToggle = on; } }
  private readMove() {
    let x = this.move.x, y = this.move.y;
    if (this.padMove.x || this.padMove.y) { x = this.padMove.x; y = this.padMove.y; }
    if (this.touchLean) x = this.touchLean;   // V10: equilibrio del grind con los botones ◀ ▶
    if (this.mouseLean) x = this.mouseLean;   // IT3: clic izquierdo/derecho en el grind
    if (this.keys.size) {
      const k = this.keys;
      const kx = (k.has('KeyD') || k.has('ArrowRight') ? 1 : 0) - (k.has('KeyA') || k.has('ArrowLeft') ? 1 : 0);
      const ky = (k.has('KeyW') || k.has('ArrowUp') ? 1 : 0) - (k.has('KeyS') || k.has('ArrowDown') ? 1 : 0);
      const anyDrive = ['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].some((c) => k.has(c));
      if (anyDrive) { x = kx; y = ky; if (performance.now() - this.driveAt > 300 || this.driveSrc === 'keyboard') { this.driveSrc = 'keyboard'; this.driveAt = performance.now(); } }
    }
    return { x, y };
  }
  /** Lectura instantánea (presentación/HUD); no consume bordes. */
  read() { return this.world && !this.modal ? this.readMove() : { x: 0, y: 0 }; }
  /** Teclas de cámara J/L e I/K. */
  keyCam() {
    if (!this.world || this.modal) return { x: 0, y: 0 };
    const k = this.keys;
    const v = { x: (k.has('KeyL') ? 1 : 0) - (k.has('KeyJ') ? 1 : 0), y: (k.has('KeyK') ? 1 : 0) - (k.has('KeyI') ? 1 : 0) };
    if (v.x || v.y) this.lastCamInput = performance.now();
    return v;
  }

  /** Pruebas: pulsación de salto como la del botón. */
  pressJump() { this.edge.jump++; }
  /** Pruebas (fixture de interfaz): solicitar acción. */
  set actionQueued(v: boolean) { if (v) this.edge.interact++; }

  /** Estado real de la postura (el botón no miente: sigue AGACHADO bajo un techo aunque se haya pedido levantarse). */
  private crouchKey = '';
  showCrouch(isCrouched: boolean, wants: boolean) {
    const k = `${+isCrouched}${+wants}`; if (k === this.crouchKey) return; this.crouchKey = k;   // V10.5 (O-03): solo si cambia (antes, en cada fotograma: el HUD se recolocaba entero)
    this.crouchEl.classList.toggle('on', isCrouched);
    this.crouchEl.classList.toggle('pending', isCrouched && !wants);
    this.crouchEl.textContent = isCrouched ? (wants ? 'AGACHADO' : 'TECHO…') : 'AGACHARSE';
    this.crouchEl.setAttribute('aria-pressed', String(isCrouched));
  }
  get crouchWanted() { return this.world && !this.modal && (this.crouchToggle || this.keys.has('KeyC') || this.keys.has('ShiftLeft') || this.keys.has('ShiftRight') || this.padCrouch); }

  /** Suelta todo (pausa, blur, cambio de modo). La alternancia de agachado se conserva: es estado, no pulsación.
   *  `focusLost` (blur/oculto): también olvida el estado físico de teclas (V5 T5-06). */
  clear(focusLost = false) {
    if (focusLost) this.phys.clear();
    // V10.6 (H8-16): el dedo del joystick se recuerda para retomarlo al volver al mundo (no si se pierde el foco o se oculta la pestaña)
    if (focusLost) { this.heldStick = null; this.adoptedStick = -1; }
    else for (const [id, o] of this.owners) if (o === 'stick') this.heldStick = { id, origin: { ...this.stickOrigin } };
    // V10.6 (H8-13): también el equilibrio del grind (◀ ▶ táctiles y clic del ratón). Antes se quedaba: al vaciar los dueños, el `pointerup`
    // posterior ya no encontraba a quién soltar y ANMI giraba sola para siempre
    this.touchLean = 0; this.mouseLean = 0;
    for (const id of ['btn-lean-l', 'btn-lean-r']) document.getElementById(id)?.classList.remove('on');
    this.move = { x: 0, y: 0 }; this.keys.clear(); this.owners.clear(); this.camLast.clear(); this.stickRaw = { x: 0, y: 0, m: 0 }; this.gestureId++;
    this.stickEl.classList.remove('on'); this.knobEl.style.transform = 'translate(0,0)'; this.camDelta = { x: 0, y: 0 }; this.lockDelta = { x: 0, y: 0 };
    this.touchJump = this.touchExtra = false; this.jumpEl.classList.remove('on'); this.extraEl?.classList.remove('on'); this.boardEl?.classList.remove('on');
    this.edge = { jump: 0, interact: 0, extra: 0, board: 0 }; this.recenter = false;
    this.clearPad(true);   // R11: conserva el historial de botones: un botón mantenido al cambiar de modo no es una pulsación nueva
  }
  setWorld(on: boolean) { if (this.world !== on) { this.world = on; this.clear(); this.restoreHeld(); this.syncLock(); } }
  setModal(on: boolean) { if (this.modal !== on) { this.modal = on; this.clear(); this.restoreHeld(); this.syncLock(); } }
  /** V5 T5-06: al volver al juego (sin modal y con mundo), reactivar solo las direcciones que siguen físicamente pulsadas. */
  private restoreHeld() {
    if (this.modal || !this.world) return;
    for (const c of this.phys) if (DIR_KEYS.has(c)) this.keys.add(c);
    // V10.6 (H8-16): el dedo que seguía en el joystick vuelve a mandar (su siguiente movimiento da la dirección, como al apoyarlo)
    const h = this.heldStick; this.heldStick = null;
    if (h && !this.owners.has(h.id) && ![...this.owners.values()].includes('stick')) {
      this.owners.set(h.id, 'stick'); this.adoptedStick = h.id; this.stickOrigin = h.origin; this.stickLive = false; this.gestureId++;
      this.stickEl.classList.add('on'); this.log.push(`=stick:${h.id}`);
    }
  }
  // ------------------------------------------------------------------ R8: puntero capturado y modo ratón
  /** Conecta el lienzo que captura el puntero. Sin soporte (táctil, navegador sin Pointer Lock) no hace nada. */
  initMouse(el: HTMLElement) {
    if (typeof el.requestPointerLock !== 'function') return;
    this.lockEl = el;
    document.addEventListener('pointerlockchange', () => this.lockChanged());
    document.addEventListener('pointerlockerror', () => this.lockFailed());
    document.addEventListener('mousemove', (e) => this.mouseMoved(e));
  }
  /** Modo ratón EFECTIVO: preferencia detectada + puntero capturado + jugando en el mundo. */
  get mouseLook() { return this.mouseMode && this.locked && this.world && !this.modal; }
  /** Pide capturar el puntero (JUGAR, «Continuar», clic en el juego). Debe llamarse dentro de un gesto del jugador. */
  requestLock() {
    const el = this.lockEl; if (!el) return;
    this.lockWanted = true;
    if (this.locked || this.modal || !this.world) return;
    try { const r: any = el.requestPointerLock(); if (r && typeof r.catch === 'function') r.catch(() => this.lockFailed()); }
    catch { this.lockFailed(); }
  }
  /** El jugador deja el modo con puntero (no se recapturará hasta volver a pedirlo). */
  dropLock() { this.lockWanted = false; this.release(); }
  private release() { if (this.locked && document.exitPointerLock) { this.releasing = true; document.exitPointerLock(); } }
  /** Al abrir una capa (pausa, diálogo, actividad) se suelta; al volver al juego se recaptura si había gesto activo. */
  private syncLock() {
    if (this.freePointer) { this.release(); return; }   // IT3: puntero libre en el grind
    if (!this.lockEl || !this.lockWanted) return;
    if (this.modal || !this.world) { this.release(); return; }
    if (!this.locked) {
      const act = (navigator as any).userActivation;
      if (!act || act.isActive) this.requestLock(); else this.onLockHint?.(true);
    }
  }
  private lockChanged() {
    const was = this.locked;
    this.locked = !!this.lockEl && document.pointerLockElement === this.lockEl;
    if (this.locked) { this.mouseStats.locks++; this.onLockHint?.(false); this.lockDelta = { x: 0, y: 0 }; this.log.push('lock'); return; }
    if (!was) return;
    this.lockDelta = { x: 0, y: 0 }; this.log.push('unlock');
    if (this.releasing) { this.releasing = false; return; }
    // soltado por el navegador (Esc, cambio de ventana): pausa; «Continuar» lo recaptura
    this.mouseStats.lockLost++; this.lockLostAt = performance.now();
    if (this.world && !this.modal) this.onLockLost?.();
  }
  private lockFailed() { this.mouseStats.lockFails++; this.log.push('lock-fail'); if (this.lockWanted && this.world && !this.modal) this.onLockHint?.(true); }
  private mouseMoved(e: MouseEvent) {
    if (this.freePointer) return;   // IT3: en el grind el ratón no mueve la cámara
    if (!this.locked || !this.world || this.modal) return;
    const mx = e.movementX || 0, my = e.movementY || 0;
    if (!mx && !my) return;
    // los navegadores dan a veces un salto espurio enorme al capturar: se descarta
    if (Math.abs(mx) > 400 || Math.abs(my) > 400) return;
    const now = performance.now();
    this.lockDelta.x += mx; this.lockDelta.y += my;
    this.lastCamInput = now; this.lastMouseAt = now;
    // detección: ≥ 8 px de movimiento acumulado en 0,4 s (un roce del ratón en la mesa no cambia el modo)
    if (now - this.mouseAccAt > 400) this.mouseAcc = 0;
    this.mouseAcc += Math.abs(mx) + Math.abs(my); this.mouseAccAt = now;
    if (!this.mouseMode && this.mouseAcc >= 8) { this.source = 'mouse'; this.setMouseMode(true, 'raton'); }
  }
  setMouseMode(on: boolean, why: string) {
    if (this.mouseMode === on) return;
    this.mouseMode = on; this.mouseStats.why = why;
    if (on) this.mouseStats.toMouse++; else this.mouseStats.toKeys++;
    this.log.push(`mouseMode:${on ? 1 : 0}:${why}`);
    this.onMouseMode?.(on, why);
  }

  setHot(on: boolean) { this.jumpEl.classList.toggle('hot', on); }
  /** El stick táctil manda en la conducción (sin teclas de dirección ni stick de mando que lo sustituyan). */
  get stickDriving() {
    const kb = ['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].some((c) => this.keys.has(c));
    return [...this.owners.values()].includes('stick') && this.stickRaw.m > 0 && !kb && !this.padMove.x && !this.padMove.y;
  }
  get activeOwners() { return [...this.owners.values()]; }
  /** R5: el jugador está MANTENIENDO la cámara (dedo o ratón arrastrando en la zona de cámara, stick derecho, teclas J/L/I/K). */
  get camHeld() { const k = this.keyCam(); return [...this.owners.values()].includes('cam') || !!(this.padCam.x || this.padCam.y) || !!(k.x || k.y); }
}

function keyDir(code: string): Dir | null {
  return ({ ArrowUp: 'up', KeyW: 'up', ArrowDown: 'down', KeyS: 'down', ArrowLeft: 'left', KeyA: 'left', ArrowRight: 'right', KeyD: 'right' } as Record<string, Dir>)[code] ?? null;
}
