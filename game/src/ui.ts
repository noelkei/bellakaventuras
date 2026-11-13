// Utilidades de interfaz DOM (HUD, avisos, diálogo, botón de acción, ayudas, modales accesibles).
// Los tiempos de diálogos y avisos ligados al juego van en reloj de SIMULACIÓN (pausa los congela); los toasts
// puramente informativos usan tiempo de pared porque no cambian el estado del juego.
import type { SimClock, Token } from './sim';

export const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;

let toastTimer = 0;
export function toast(text: string, ms = 2600) {
  const el = $('toast');
  el.textContent = text; el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => (el.hidden = true), ms);
}

let hintTimer = 0;
/** Tarjeta de ayuda breve (no tapa el centro ni los botones: pointer-events none). */
export function hint(html: string, ms = 5200) {
  const el = $('hint');
  el.innerHTML = html; el.hidden = false; el.classList.remove('out');
  clearTimeout(hintTimer);
  hintTimer = window.setTimeout(() => { el.classList.add('out'); setTimeout(() => (el.hidden = true), 400); }, ms);
}
export function clearHint() { clearTimeout(hintTimer); $('hint').hidden = true; }

export function setHud(zone: string, song: string, local: number, total: number, bump = false) {
  $('zone-name').textContent = zone;
  $('zone-song').textContent = song;
  $('count').textContent = String(total);
  $('local').textContent = zone ? `${local}/4` : '';
  $('counter').setAttribute('aria-label', `${total} de 20 patatas`);
  if (bump) { const c = $('counter'); c.classList.remove('bump'); void c.offsetWidth; c.classList.add('bump'); }
}

export function setTask(text: string | null, sub?: string) {
  const el = $('task');
  if (!text) { el.hidden = true; return; }
  el.innerHTML = sub ? `${escapeHtml(text)}<small>${escapeHtml(sub)}</small>` : escapeHtml(text); el.hidden = false;
}
export function setObjective(text: string | null) {
  const el = $('objective'); if (!el) return;
  if (!text) { el.hidden = true; return; }
  el.textContent = text; el.hidden = false;
}

let dialogResolve: (() => void) | null = null;
/**
 * Diálogo de charla. `auto`: se cierra solo tras `sec` de SIMULACIÓN (la pausa no lo consume). Con token, cancelar la
 * actividad lo cierra sin callbacks tardíos.
 */
/** V10.5 (regla de oro, E5-12): espera común antes de abrir el bocadillo de una charla: primero llega la cámara (su fundido) y después sale el
 *  bocadillo. La registra el juego. */
let sayGate: (() => Promise<void>) | null = null;
export function setSayGate(f: typeof sayGate) { sayGate = f; }
let sayClosedAt = -1e9;
let okTouchAt = -1e9;   // V10.6 (H8-16): último cierre de «Vale» con el dedo
export function say(name: string, text: string, opts: { auto?: { clock: SimClock; sec: number }; button?: string; token?: Token } = {}): Promise<void> {
  // la espera es solo para la PRIMERA frase de una charla (la cámara acaba de cambiar); las siguientes salen seguidas
  if (!sayGate || performance.now() - sayClosedAt < 600 || !$('dialog').hidden) return sayNow(name, text, opts);
  dialogResolve?.();
  return sayGate().then(() => (opts.token && !opts.token.alive ? undefined : sayNow(name, text, opts)));
}
function sayNow(name: string, text: string, opts: { auto?: { clock: SimClock; sec: number }; button?: string; token?: Token }): Promise<void> {
  const box = $('dialog');
  dialogResolve?.();
  $('dialog-name').textContent = name;
  $('dialog-text').textContent = text;
  const btn = $('dialog-ok') as HTMLButtonElement;
  btn.textContent = opts.button ?? 'Vale';
  box.hidden = false;
  // R11 (ACC-01): la charla es una capa con rol y nombre (sin entrar en la pila de modales: Esc sigue siendo PAUSA)
  box.setAttribute('role', 'dialog'); box.setAttribute('aria-labelledby', 'dialog-name');
  dialogOpenedAt = performance.now();
  return new Promise((res) => {
    let closed = false;
    const done = () => { if (closed) return; closed = true; box.hidden = true; dialogResolve = null; sayClosedAt = performance.now(); res(); };
    dialogResolve = done;
    // R11 (MIX-03): una pulsación que llega a la vez por dos vías (Enter + A del mando) no salta la frase siguiente
    // (solo para la activación por teclado —`detail === 0`—: un clic o toque de verdad siempre cierra)
    // R11: solo se descarta una activación por TECLADO (Enter/Espacio recientes) que empezó antes de abrirse esta frase o llega en sus
    // primeros 250 ms (A del mando + Enter a la vez); un clic programático sin tecla reciente siempre cierra
    // V10.6 (H8-16, medido con v10_6/sonda-ce11): con el pulgar en el joystick el navegador no manda `click` al 2.º dedo (SIS-27) y «Vale» no
    // respondía: la charla no se cerraba. Con el dedo se cierra al LEVANTARLO sobre el botón (como los botones del 2D); el `click` de después se ignora
    let downId = -1;
    btn.onpointerdown = (e) => { if (e.pointerType !== 'touch') return; e.preventDefault(); downId = e.pointerId; };
    btn.onpointerup = (e) => { if (e.pointerType !== 'touch' || e.pointerId !== downId) return; downId = -1; e.preventDefault(); e.stopPropagation(); okTouchAt = performance.now(); done(); };
    btn.onpointercancel = () => { downId = -1; };
    btn.onclick = (e) => { e.stopPropagation(); const now = performance.now(); if (now - okTouchAt < 800) return;
      if (e.detail === 0 && now - actKeyDownAt < 1000 && (actKeyDownAt < dialogOpenedAt || now - dialogOpenedAt < DIALOG_GUARD_MS)) return; done(); };
    if (opts.auto) opts.auto.clock.after(opts.auto.sec, done, opts.token ?? null);
    opts.token?.onCancel(done);
    // foco al botón para teclado/mando sin robar el juego (Enter lo pulsa de forma nativa)
    try { btn.focus({ preventScroll: true }); } catch { /* */ }
  });
}
export function closeDialog() { dialogResolve?.(); }
/** R11 (SIS-27): pulsación robusta para botones táctiles. Con un dedo ya apoyado (el pulgar en el joystick) el navegador no genera
 *  `click` para el 2.º dedo: en táctil la acción va en `pointerdown` y se ignora el `click` sintético que llegue después; con ratón y
 *  teclado, `click` como siempre (también un `.click()` programático). */
export function onTap(el: HTMLElement, fn: (e: Event) => void) {
  let touchAt = -1e9;
  el.addEventListener('pointerdown', (e) => { if (e.pointerType !== 'touch') return; e.preventDefault(); e.stopPropagation(); touchAt = performance.now(); fn(e); });
  el.addEventListener('click', (e) => { if (performance.now() - touchAt < 800) { e.preventDefault(); e.stopPropagation(); return; } fn(e); });
}
/** V10.5 (AM-01, AM-29; E5-18, T1): filtro común contra el «clic de compatibilidad» del dedo. El navegador manda un `click` al punto donde se
 *  levantó el dedo; si el toque ya abrió algo (la pausa, la frase siguiente del 2D…), ese clic caía en el control que aparece debajo (II →
 *  «Pantalla», «Continuar» → «Continuar» de la frase siguiente o «No, gracias»). Si hubo un `pointerdown` táctil hace menos de 500 ms y el
 *  `click` llega a un control que no contiene lo que se tocó, se anula. Excepción: el clic que una `label` reenvía a su propia casilla. */
let touchDownEl: Element | null = null, touchDownAt = -1e9;
if (typeof document !== 'undefined') {
  document.addEventListener('pointerdown', (e) => { if (e.pointerType === 'touch') { touchDownEl = e.target as Element; touchDownAt = performance.now(); } }, true);
  document.addEventListener('click', (e) => {
    if (!e.isTrusted || !touchDownEl || performance.now() - touchDownAt > 500) return;   // los clics del propio juego (`.click()`) no se tocan
    const t = e.target as Element | null, ctl = t?.closest?.('button, a, input, select, label, [role=button]');
    if (!ctl || ctl.contains(touchDownEl)) return;
    if (ctl instanceof HTMLInputElement && [...(ctl.labels ?? [])].some((l) => l.contains(touchDownEl))) return;
    e.preventDefault(); e.stopImmediatePropagation();
  }, true);
}

/** V10.4: capa de diálogo 2D de los anfitriones (dialogo2d.ts) registrada aquí para que cuente como diálogo abierto y la avancen las mismas
 *  teclas y botones del mando que «Vale» (sin importar dialogo2d desde ui: evita el ciclo de imports). */
let extraDialog: { open: () => boolean; press: (b?: boolean) => boolean; refocus: () => boolean } | null = null;
export function setExtraDialog(d: typeof extraDialog) { extraDialog = d; }
export const dialogOpen = () => !$('dialog').hidden || !!extraDialog?.open();
let dialogOpenedAt = -1e9;
/** R11 (MIX-03): última pulsación (no autorepetida) de Enter/Espacio, las teclas que activan «Vale» de forma nativa. */
let actKeyDownAt = -1e9;
if (typeof window !== 'undefined') window.addEventListener('keydown', (e) => { if (!e.repeat && (e.code === 'Enter' || e.code === 'NumpadEnter' || e.code === 'Space')) actKeyDownAt = performance.now(); }, true);
const DIALOG_GUARD_MS = 250;   // R11: margen tras abrir/avanzar una frase (yy-talk:34 pulsa E justo después de abrir)
/** R11 (SIS-05, PADX-02, NMG-13): «Vale» desde teclado/mando aunque el botón haya perdido el foco (tras una pausa o un blur), siempre
 *  que no haya una capa modal encima (pausa, ajustes…). Devuelve true si la pulsación se usó. */
export function pressDialog(b = false) {
  if (extraDialog?.open() && !topModal()) return extraDialog.press(b);
  if (!dialogOpen() || topModal()) return false;
  if (performance.now() - dialogOpenedAt < DIALOG_GUARD_MS) return true;   // misma pulsación que abrió/avanzó la frase
  closeDialog(); return true;
}
/** R11: devuelve el foco a «Vale» si la charla sigue abierta (al cerrar la pausa, al volver a la ventana). */
export function refocusDialog() {
  if (extraDialog?.open() && !topModal()) return extraDialog.refocus();
  if (!dialogOpen() || topModal()) return false;
  try { ($('dialog-ok') as HTMLButtonElement).focus({ preventScroll: true }); } catch { /* */ }
  return true;
}

let actionHandler: (() => void) | null = null;
let actionLabel: string | null = null;
/** Botón de acción. R5 (usuario, IG-005): `off` = visible pero deshabilitado (gris, sin efecto al pulsarlo ni con E/Y) con
 *  `note` encima; p. ej. dentro del recuadro de una actividad yendo en skate: «Bájate del skate para empezar». */
export function showAction(label: string | null, fn?: () => void, keyHint = 'E', opts: { off?: boolean; note?: string } = {}) {
  const wrap = $('prompt'); const b = $('btn-action') as HTMLButtonElement;
  if (!label) { wrap.hidden = true; actionHandler = null; actionLabel = null; return; }
  const key = `${label}|${opts.off ? 'off' : 'on'}|${opts.note ?? ''}|${keyHint}`;   // R11 (PADX-05): al cambiar de teclado a mando, E → Y
  if (key === actionLabel && !wrap.hidden) { actionHandler = opts.off ? null : fn ?? null; return; }
  actionLabel = key;
  b.innerHTML = `${escapeHtml(label)}<kbd>${keyHint}</kbd>`; b.setAttribute('aria-label', opts.off && opts.note ? `${label}: ${opts.note}` : label); wrap.hidden = false;
  b.classList.toggle('off', !!opts.off); b.setAttribute('aria-disabled', opts.off ? 'true' : 'false');
  const note = $('prompt-note'); note.textContent = opts.note ?? ''; note.hidden = !opts.note;
  actionHandler = opts.off ? null : fn ?? null;
  if (!b.dataset.tap) { b.dataset.tap = '1'; onTap(b, (e) => { e.stopPropagation(); b.blur(); triggerAction(); }); }   // R11 (SIS-27)
}
export function triggerAction() {
  const h = actionHandler; if (!h) return false;
  $('prompt').hidden = true; actionHandler = null; actionLabel = null; h(); return true;
}
export const actionVisible = () => !$('prompt').hidden;
/** El botón de acción está a la vista pero deshabilitado (R5, IG-005). */
export const actionDisabled = () => !$('prompt').hidden && $('btn-action').classList.contains('off');

// ------------------------------------------------------------------ modales accesibles (UX-05)
const focusables = (root: HTMLElement) => [...root.querySelectorAll<HTMLElement>('button:not([hidden]):not([disabled]), a[href]:not([hidden]), input:not([disabled])')]
  .filter((el) => !el.closest('[hidden]') && el.offsetParent !== null);
let lastFocus: HTMLElement | null = null;
const openModals: HTMLElement[] = [];
const openers = new Map<HTMLElement, HTMLElement | null>();   // foco previo de cada capa (se devuelve al cerrarla)
/** Abre una capa modal: foco inicial, Tab atrapado dentro, fondo inerte; al cerrar restaura el foco anterior. */
export function openModal(el: HTMLElement, initial?: HTMLElement | null) {
  if (!openModals.includes(el)) { if (!openModals.length) lastFocus = document.activeElement as HTMLElement | null; else openers.set(el, document.activeElement as HTMLElement | null); openModals.push(el); }
  el.hidden = false; el.setAttribute('role', 'dialog'); el.setAttribute('aria-modal', 'true');
  for (const id of ['hud', 'touch']) $(id)?.setAttribute('inert', '');
  const f = initial ?? focusables(el)[0];
  requestAnimationFrame(() => { try { f?.focus({ preventScroll: true }); } catch { /* */ } });
}
export function closeModal(el: HTMLElement) {
  el.hidden = true;
  const i = openModals.indexOf(el); if (i >= 0) openModals.splice(i, 1);
  if (!openModals.length) {
    for (const id of ['hud', 'touch']) $(id)?.removeAttribute('inert');
    // R11 (SIS-05): con una charla abierta debajo, el foco vuelve a su «Vale» (antes se perdía con el blur y la charla quedaba sin salida)
    if (!refocusDialog()) {
      try { (lastFocus && document.contains(lastFocus) && !lastFocus.closest('[hidden]') ? lastFocus : null)?.focus({ preventScroll: true }); } catch { /* */ }
      (document.activeElement as HTMLElement | null)?.blur?.();
    }
  } else {
    const top = openModals[openModals.length - 1], back = openers.get(el); openers.delete(el);
    (back && top.contains(back) && !back.closest('[hidden]') ? back : focusables(top)[0])?.focus({ preventScroll: true });
  }
}
export const topModal = () => openModals[openModals.length - 1] ?? null;
addEventListener('keydown', (e) => {
  if (e.key !== 'Tab') return;
  // R11 (ACC-01): con una charla abierta y sin modal encima, Tab se queda en «Vale» (antes sacaba el foco de la página y pausaba)
  if (!topModal() && dialogOpen()) { e.preventDefault(); refocusDialog(); return; }
  const m = topModal(); if (!m) return;
  const f = focusables(m); if (!f.length) return;
  const i = f.indexOf(document.activeElement as HTMLElement);
  e.preventDefault();
  const n = e.shiftKey ? (i <= 0 ? f.length - 1 : i - 1) : (i + 1) % f.length;
  f[n].focus();
}, true);
/** Mover el foco dentro del modal superior (cruceta del mando / flechas en menús). */
export function moveFocus(delta: number) {
  const m = topModal(); if (!m) return false;
  const f = focusables(m); if (!f.length) return false;
  const i = f.indexOf(document.activeElement as HTMLElement);
  f[(i + delta + f.length) % f.length].focus(); return true;
}

export function escapeHtml(s: string) { return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!)); }
