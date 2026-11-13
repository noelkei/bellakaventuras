// V10.4 R6 · capa de diálogo 2D de los anfitriones (dossier 02/03/04 §7; W-D12, W-D13): el mundo sigue viéndose detrás con una máscara negra
// semitransparente (misma opacidad y desenfoque que la pausa, color más oscuro), Bellakroak a la izquierda y Bellakat a la derecha (los PNG del
// usuario tal cual, solo escalados: assets/derived/v10_4/dialogo_2d), bocadillo blanco con el nombre de quien habla y la punta hacia él, y
// «Continuar» (o dos opciones). Una pose fija por frase (sin animar bocas ni parpadeos); al avanzar solo cambia la pose. Teclado (E, Espacio,
// Enter), toque (botón; tocar en otro sitio no avanza) y mando (A; en una pregunta A = primera opción, B = segunda). Las teclas se ignoran los
// primeros 250 ms (R11 MIX-03). «Reducir movimiento»: sin fundidos. En modo ayuda (W-D13) sale uno solo de los dos.
import { ASSET_BASE } from './assets';
import type { Token } from './sim';
import type { Quien, Pose } from './textos2d';
import { setExtraDialog, topModal } from './ui';
import { orient } from './orient';

const NAME: Record<Quien, string> = { kat: 'Bellakat', kroak: 'Bellakroak' };
const FILE: Record<Quien, string> = { kat: 'fennec', kroak: 'rana' };
/** Alto relativo de cada personaje con la escala del PNG original (dialogo_2d.json: la rana agachada es algo más baja). */
const ALTO: Record<Quien, number> = { kat: 1.0, kroak: 0.9192 };
/** V10.5 (E5-13): ancho/alto de los PNG (las tres poses de cada uno miden igual: fennec 526×768, rana 720×768); limita el alto por el ancho. */
const ASP: Record<Quien, number> = { kat: 526 / 768, kroak: 720 / 768 };
/** V10.5 (E5-14): sitio libre bajo el bocadillo (px lógicos): los personajes no suben por encima de su borde de abajo (ni de su punta). */
function fitHosts() {
  if (!root || root.hidden) return; const b = document.getElementById('d2-bubble'); if (!b) return;
  const host = imgs.kat ?? imgs.kroak, bottom = host ? parseFloat(getComputedStyle(host).bottom) || 0 : 0;
  const free = root.clientHeight - (b.offsetTop + b.offsetHeight) - 22 - bottom;
  root.style.setProperty('--d2-free', `${Math.max(60, Math.floor(free))}px`);
}
const GUARD_MS = 250;

export interface D2Line { habla: Quien; texto: string; kat?: Pose; kroak?: Pose }
export interface D2Opts { solo?: Quien; choices?: [string, string]; token?: Token; button?: string; /** V10.4 R12: imagen en el centro (ruta bajo assets/), p. ej. la patata 2D de PAR-03 */ img?: string;
  /** V10.5 (AM-08, E5-16, T11): botón secundario «Saltar tutorial» en la fila de Continuar. No es una opción del 2D: el mando (B) y las flechas no lo
   *  eligen y no recibe el foco; solo toque, clic o la tecla T. Al pulsarlo se llama a `fn` (que cierra la frase). */
  skip?: { label: string; fn: () => void } }

let prop: HTMLImageElement | null = null;
let touchUpAt = -1e9;
let root: HTMLElement | null = null, openAt = -1e9, keyAt = -1e9, current: { done: (v: number) => void; buttons: HTMLButtonElement[]; focus: number } | null = null;
const imgs: Record<string, HTMLImageElement> = {};

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls = '', parent?: HTMLElement) { const e = document.createElement(tag); if (cls) e.className = cls; parent?.appendChild(e); return e; }
function build() {
  if (root) return root;
  root = el('section', '', document.getElementById('ui') ?? document.body); root.id = 'd2'; root.hidden = true; root.setAttribute('role', 'dialog'); root.setAttribute('aria-modal', 'false');
  el('div', 'd2-mask', root);
  for (const q of ['kroak', 'kat'] as Quien[]) { const im = el('img', `d2-host d2-${q}`, root); im.alt = NAME[q]; im.draggable = false; im.style.setProperty('--alto', String(ALTO[q])); im.style.setProperty('--asp', String(ASP[q])); imgs[q] = im; }
  prop = el('img', 'd2-prop', root); prop.alt = ''; prop.draggable = false; prop.hidden = true;
  const b = el('div', 'd2-bubble', root); b.id = 'd2-bubble';
  const n = el('b', 'd2-name', b); n.id = 'd2-name';
  const p = el('p', 'd2-text', b); p.id = 'd2-text';
  const row = el('div', 'd2-row', b); row.id = 'd2-row';
  root.setAttribute('aria-labelledby', 'd2-name'); root.setAttribute('aria-describedby', 'd2-text');
  addEventListener('resize', () => requestAnimationFrame(fitHosts)); orient.onChange(() => requestAnimationFrame(fitHosts));
  window.addEventListener('keydown', (e) => {
    if (!e.repeat && (e.code === 'Enter' || e.code === 'NumpadEnter' || e.code === 'Space' || e.code === 'KeyE')) keyAt = performance.now();
    if (!current || root!.hidden) return;
    if (topModal()) return;   // V10.6 (H8-15): con una capa encima (la pausa) las flechas son de esa capa, no del 2D de detrás
    if (current.buttons.length > 1 && (e.code === 'ArrowLeft' || e.code === 'ArrowRight' || e.code === 'KeyA' || e.code === 'KeyD')) { e.preventDefault(); e.stopPropagation();
      current.focus = (current.focus + (e.code === 'ArrowLeft' || e.code === 'KeyA' ? current.buttons.length - 1 : 1)) % current.buttons.length; current.buttons[current.focus].focus({ preventScroll: true }); }
  }, true);
  return root;
}
const src = (q: Quien, p: Pose) => `${ASSET_BASE}dialogo_2d/d2_${FILE[q]}_${p}.webp`;
/** Precarga y decodifica las seis poses (antes de la primera frase). */
export function preloadD2() { const ps: Promise<unknown>[] = []; for (const q of ['kat', 'kroak'] as Quien[]) for (const p of ['espera', 'saludo', 'habla'] as Pose[]) { const im = new Image(); im.src = src(q, p); ps.push(im.decode().catch(() => null)); }
  { const im = new Image(); im.src = `${ASSET_BASE}dialogo_2d/patata_2d.webp`; ps.push(im.decode().catch(() => null)); } return Promise.all(ps); }
export const d2Open = () => !!root && !root.hidden;

/** V10.5 (regla de oro, E5-11): espera común antes de abrir cualquier frase (la cámara quieta); la registra el juego. */
let gate: (() => Promise<void>) | null = null;
export function setD2Gate(f: typeof gate) { gate = f; }
/** Muestra una frase y espera a que se avance (devuelve el índice de la opción elegida; 0 si solo hay «Continuar»; −1 si se cancela). La frase no
 *  se abre hasta que la cámara está quieta (V10.5, E5-11). */
export async function d2Say(line: D2Line, opts: D2Opts = {}): Promise<number> {
  if (gate) { await gate(); if (opts.token && !opts.token.alive) return -1; }
  return show(line, opts);
}
function show(line: D2Line, opts: D2Opts): Promise<number> {
  const r = build(); current?.done(-1);
  const solo = opts.solo;
  for (const q of ['kat', 'kroak'] as Quien[]) { const im = imgs[q], show = !solo || solo === q, pose = (q === 'kat' ? line.kat : line.kroak) ?? (q === line.habla ? 'habla' : 'espera');
    im.hidden = !show; if (show && !im.src.endsWith(src(q, pose))) im.src = src(q, pose); }
  r.classList.toggle('solo', !!solo); r.dataset.habla = line.habla; r.dataset.solo = solo ?? '';
  // R13 (usuario: «no aparece centrada, se bugea y luego va al centro»): sin decodificar mide 0 de ancho y el centrado (−50 %) fallaba el primer
  // fotograma; se muestra solo cuando ya tiene su tamaño
  if (prop) { const im = prop, want = opts.img ? ASSET_BASE + opts.img : ''; im.hidden = true; im.classList.remove('pop'); im.dataset.want = want;
    if (want) { if (!im.src.endsWith(want)) im.src = want; void im.decode().catch(() => null).then(() => { if (im.dataset.want !== want || !root || root.hidden) return; im.hidden = false; void im.offsetWidth; im.classList.add('pop'); }); } }
  (document.getElementById('d2-name') as HTMLElement).textContent = NAME[line.habla];
  (document.getElementById('d2-text') as HTMLElement).textContent = line.texto;
  const row = document.getElementById('d2-row') as HTMLElement; row.textContent = '';
  const labels = opts.choices ?? [opts.button ?? 'Continuar'];
  if (opts.skip) { const sk = opts.skip, b = el('button', 'd2-btn d2-skip', row); b.type = 'button'; b.id = 'd2-skip'; b.textContent = sk.label; b.tabIndex = -1; b.dataset.key = 'T';
    let downId = -1;
    b.addEventListener('pointerdown', (e) => { if (e.pointerType !== 'touch') return; e.preventDefault(); e.stopPropagation(); downId = e.pointerId; });
    b.addEventListener('pointerup', (e) => { if (e.pointerType !== 'touch' || e.pointerId !== downId) return; downId = -1; e.preventDefault(); e.stopPropagation(); touchUpAt = performance.now(); sk.fn(); });
    b.addEventListener('click', (e) => { e.stopPropagation(); if (performance.now() - touchUpAt < 800 || e.detail === 0) return; sk.fn(); }); }
  const buttons = labels.map((t, i) => { const b = el('button', i === 0 ? 'd2-btn primary' : 'd2-btn', row); b.type = 'button'; b.textContent = t; b.dataset.pad = labels.length > 1 ? (i === 0 ? 'A' : 'B') : 'A'; return b; });
  r.hidden = false; fitHosts(); requestAnimationFrame(() => { fitHosts(); r.classList.add('in'); }); openAt = performance.now();
  return new Promise((res) => {
    let closed = false;
    const done = (v: number) => { if (closed) return; closed = true; current = null; r.classList.remove('in'); r.hidden = true; res(v); };
    current = { done, buttons, focus: 0 };
    buttons.forEach((b, i) => {
      // V10.5 (AM-29, E5-18): con el dedo se decide al LEVANTARLO sobre el mismo botón (antes, al apoyarlo: la frase siguiente se abría con su
      // botón en el mismo sitio y el clic de compatibilidad la cerraba también). `pointerup` llega aunque otro dedo siga en el joystick (con un
      // dedo apoyado el navegador no manda `click` al segundo, SIS-27); el `click` que viene detrás del toque se ignora
      let downId = -1;
      b.addEventListener('pointerdown', (e) => { if (e.pointerType !== 'touch') return; e.preventDefault(); e.stopPropagation(); downId = e.pointerId; });
      b.addEventListener('pointerup', (e) => { if (e.pointerType !== 'touch' || e.pointerId !== downId) return; downId = -1; e.preventDefault(); e.stopPropagation(); touchUpAt = performance.now(); done(i); });
      b.addEventListener('pointercancel', () => { downId = -1; });
      // una activación por teclado que empezó antes de abrir la frase o en sus primeros 250 ms, no
      b.addEventListener('click', (e) => { e.stopPropagation(); const now = performance.now(); if (now - touchUpAt < 800) return; if (e.detail === 0 && now - keyAt < 1000 && (keyAt < openAt || now - openAt < GUARD_MS)) return; done(i); });
    });
    opts.token?.onCancel(() => done(-1));
    try { buttons[0].focus({ preventScroll: true }); } catch { /* */ }
  });
}
export function d2Close() { current?.done(-1); }
/** Pulsación de avance desde teclado/mando (input.ts → ui.pressDialog). `b` = botón B del mando (segunda opción de una pregunta). */
function press(b = false) {
  if (!current) return false;
  if (performance.now() - openAt < GUARD_MS) return true;
  const i = current.buttons.length > 1 ? (b ? 1 : current.focus) : 0; current.done(i); return true;
}
setExtraDialog({ open: d2Open, press, refocus: () => { if (!current) return false; try { current.buttons[current.focus].focus({ preventScroll: true }); } catch { /* */ } return true; } });
