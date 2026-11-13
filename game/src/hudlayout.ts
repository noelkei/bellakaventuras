import { orient } from './orient';
// V5 T5-23 (SOL-008, OPUS-011): sin texto sobre texto en el HUD. Los avisos anclados ARRIBA (#hint en vertical/horizontal y
// #toast) se centran; si invaden la columna superior izquierda (contador, zona, objetivo, tarea) bajan justo por debajo de
// ella. Coordenadas de maquetación (offset*): lógicas, también con el contenedor girado (T5-18). Se recalcula solo cuando
// cambia algo (MutationObserver + tamaño), no en cada fotograma.
const COLUMN = ['counter', 'zone', 'objective', 'task'];
const FLOATING = ['toast', 'hint'];

type Box = { x: number; y: number; w: number; h: number };
function box(el: HTMLElement): Box {
  // rectángulo real (incluye transformaciones como translateX(-50%)) pasado a coordenadas lógicas
  const r = el.getBoundingClientRect(), a = orient.toLogical(r.left, r.top), b = orient.toLogical(r.right, r.bottom);
  const x = Math.min(a.x, b.x), y = Math.min(a.y, b.y);
  return { x, y, w: Math.abs(b.x - a.x), h: Math.abs(b.y - a.y) };
}
/** Left de maquetación (px dentro del padre) que deja el borde izquierdo del elemento en la x lógica `xWant`. */
function leftFor(el: HTMLElement, xWant: number) { return parseFloat(getComputedStyle(el).left) + (xWant - box(el).x); }
/** Top de maquetación (px lógicos dentro del padre) que deja el borde superior del elemento en la y lógica `yWant`. */
function topFor(el: HTMLElement, yWant: number) { return parseFloat(getComputedStyle(el).top) + (yWant - box(el).y); }
const shown = (el: HTMLElement | null): el is HTMLElement => !!el && !el.hidden && el.offsetWidth > 0 && getComputedStyle(el).visibility !== 'hidden';

/** R11 (SIS-07): el botón de acción (HABLAR…) no se monta sobre los botones táctiles (BAILAR, TABLA…): si se cruzan, sube justo
 *  por encima de ellos (en 320–375 px de ancho tocar BAILAR iniciaba la charla). */
function layoutPrompt() {
  const pw = document.getElementById('prompt'); if (!pw) return;
  pw.style.top = ''; pw.style.bottom = '';
  if (!shown(pw) || !document.body.classList.contains('touch')) return;
  const p = box(pw);
  const btns = [...document.querySelectorAll<HTMLElement>('#touch button')].filter((e) => shown(e) && !e.closest('#dance-ring') && !e.closest('#prompt') && !e.closest('[hidden]')).map(box);
  const hit = btns.filter((c) => c.x < p.x + p.w && p.x < c.x + c.w && c.y < p.y + p.h && p.y < c.y + c.h);
  if (!hit.length) return;
  const above = Math.min(...hit.map((c) => c.y)) - 8, t = topFor(pw, above - p.h);   // calculado con la posición del CSS (bottom)
  pw.style.bottom = 'auto'; pw.style.top = `${t}px`;
}

export function layoutHud() {
  layoutPrompt();
  const W = orient.width, H = orient.height, land = W > H;
  const taken = COLUMN.map((id) => document.getElementById(id)).filter(shown).map(box);
  const hits = (b: Box) => taken.filter((c) => c.x < b.x + b.w && b.x < c.x + c.w && c.y < b.y + b.h && b.y < c.y + c.h);
  for (const id of ['toast', 'hint']) {   // orden: el toast primero; el aviso evita también al toast
    const el = document.getElementById(id); if (!el) continue;
    el.style.top = el.style.left = el.style.transform = el.style.maxWidth = '';   // posición del CSS
    if (!shown(el) || getComputedStyle(el).top === 'auto') continue;
    let b = box(el);
    if (hits(b).length && land) {
      // apaisado: a la derecha de lo que estorba, antes de los botones de la esquina derecha (≈ 100 px) · V10.5 (E5-24): con zurdo la columna va a
      // la derecha y el aviso se pone a su izquierda
      if (!zurdo()) { const right = Math.max(...hits(b).map((c) => c.x + c.w)) + 12, avail = W - right - 100;
        if (avail >= 220) { el.style.transform = 'none'; el.style.maxWidth = `${avail}px`; el.style.left = `${leftFor(el, right)}px`; b = box(el); } }
      else { const lft = Math.min(...hits(b).map((c) => c.x)) - 12, avail = lft - 100;
        if (avail >= 220) { el.style.transform = 'none'; el.style.maxWidth = `${avail}px`; const w = Math.min(avail, b.w); el.style.left = `${leftFor(el, lft - w)}px`; b = box(el); } }
    }
    if (hits(b).length) {
      const below = Math.max(...taken.filter((c) => c.x < b.x + b.w && b.x < c.x + c.w).map((c) => c.y + c.h)) + 8;
      el.style.top = `${topFor(el, below)}px`; b = box(el);
    }
    taken.push(b);
  }
}

/** V10.1 P05: con el tamaño de botones k, cada botón crece desde su esquina (CSS `scale` + `transform-origin`) y además se DESPLAZA como si
 *  todo su grupo se escalara desde la esquina de la pantalla: su distancia al borde también se multiplica por k (`translate`). */
const BTN_ANCHOR: Record<string, 'rb' | 'lb' | 'rt' | 'lt'> = { 'btn-jump': 'rb', 'btn-crouch': 'rb', 'btn-board': 'rb', 'btn-cam': 'rb', 'btn-dance': 'rb', 'btn-lean-r': 'rb', 'btn-lean-l': 'lb', 'btn-pause': 'rt' };
/** V10.4 R20 (usuario: «poder cambiar el lado de los botones, para zurdos y diestros»): con `body.zurdo` los botones de acción del lado derecho
 *  pasan al izquierdo a la MISMA distancia del borde (se mide la que pone el CSS para cada orientación y giro, y se cambia de lado con su zona
 *  segura) y el joystick va a la derecha (CSS). Los botones de equilibrio del grind (◀ ▶) y la pausa no cambian. */
const HAND_BTNS = ['btn-jump', 'btn-crouch', 'btn-board', 'btn-cam', 'btn-dance'];
const zurdo = () => document.body.classList.contains('zurdo');
let safeProbe: HTMLElement | null = null;
function safeLR() {
  if (!safeProbe) { safeProbe = document.createElement('div'); safeProbe.style.cssText = 'position:fixed;visibility:hidden;pointer-events:none;padding-left:var(--sal);padding-right:var(--sar)'; document.body.appendChild(safeProbe); }
  const cs = getComputedStyle(safeProbe); return { l: parseFloat(cs.paddingLeft) || 0, r: parseFloat(cs.paddingRight) || 0 };
}
export function layoutHand() {
  const z = zurdo(), sa = z ? safeLR() : { l: 0, r: 0 };
  for (const id of HAND_BTNS) { const el = document.getElementById(id); if (!el) continue;
    el.style.left = ''; el.style.right = ''; if (!z) continue;
    const r = parseFloat(getComputedStyle(el).right); if (!Number.isFinite(r)) continue;
    el.style.right = 'auto'; el.style.left = `${(r - sa.r + sa.l).toFixed(1)}px`; }
}
/** Ancla de escalado de cada botón (con zurdo, los de abajo a la derecha crecen desde la esquina de abajo a la izquierda). */
const anchorOf = (id: string) => { const a = BTN_ANCHOR[id]; return zurdo() && a === 'rb' && HAND_BTNS.includes(id) ? 'lb' : zurdo() && id === 'btn-pause' ? 'lt' : a; };   // V10.5 (E5-24): con zurdo, la pausa arriba a la izquierda
function scaleOne(el: HTMLElement, an: 'rb' | 'lb' | 'rt' | 'lt' | 'pc', k: number) {
  el.style.translate = ''; el.style.removeProperty('--btn-k'); if (Math.abs(k - 1) < 1e-3) { el.style.setProperty('--btn-k', '1'); return; }
  el.style.setProperty('--btn-k', String(k)); if (an === 'pc') return;   // botón de acción: crece desde su centro de abajo (CSS), sin desplazarse
  const cs = getComputedStyle(el), r = parseFloat(cs.right), l = parseFloat(cs.left), b = parseFloat(cs.bottom), t = parseFloat(cs.top);
  const dx = an === 'lb' || an === 'lt' ? (k - 1) * (Number.isFinite(l) ? l : 0) : (1 - k) * (Number.isFinite(r) ? r : 0);
  const dy = an === 'rt' || an === 'lt' ? (k - 1) * (Number.isFinite(t) ? t : 0) : (1 - k) * (Number.isFinite(b) ? b : 0);
  el.style.translate = `${dx.toFixed(1)}px ${dy.toFixed(1)}px`;
}
/** Factor que de verdad se usa en esta pantalla (el elegido o menos si no cabe): lo enseñan los ajustes. */
export let btnScaleUsed = 1;
export function layoutButtonScale() {
  const k = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--btn-k')) || 1;
  // R5 (capturas al 200 % en teléfono y QA B4/B5): un único factor ≤ k para TODOS los botones (pausa arriba a la derecha, ◀ abajo a la
  // izquierda, el resto abajo a la derecha y el botón de acción abajo al centro) con el que todos los visibles quedan DENTRO de la pantalla
  // y ningún grupo pisa a otro (salvo lo que ya se pisaba a ×1); si ni con ×1 cabe, ×1 (como antes de P05). Un factor por grupo dejaba
  // ◀ al 200 % y AGACHARSE/▶ al 100 % en el grind, y no veía el botón de acción.
  const W = innerWidth, H = innerHeight, M = 4;
  const groups: { an: 'rt' | 'lt' | 'lb' | 'rb' | 'pc' | 'fijo'; els: HTMLElement[] }[] = (['rt', 'lt', 'lb', 'rb', 'pc'] as const).map((an) => ({ an, els: an === 'pc' ? [...document.querySelectorAll<HTMLElement>('#prompt .big')]
    : Object.keys(BTN_ANCHOR).filter((id) => anchorOf(id) === an).map((id) => document.getElementById(id)).filter((e): e is HTMLElement => !!e) }));
  // V10.5 (AM-11, E5-23): el aro del joystick cuenta en el cálculo (no crece: es un obstáculo fijo para los demás)
  { const st = document.getElementById('stick'); if (st) groups.push({ an: 'fijo', els: [st] }); }
  const apply = (kk: number) => { for (const g of groups) if (g.an !== 'fijo') for (const e of g.els) scaleOne(e, g.an, kk); };
  const rects = () => groups.map((g) => g.els.map((e) => ({ e, r: e.getBoundingClientRect() })).filter((q) => q.r.width > 0 && q.r.height > 0));
  const over = (a: DOMRect, b: DOMRect) => a.left < b.right - 1 && b.left < a.right - 1 && a.top < b.bottom - 1 && b.top < a.bottom - 1;
  const pairs = (R: ReturnType<typeof rects>) => { const o = new Set<string>(); for (let i = 0; i < R.length; i++) for (let j = i + 1; j < R.length; j++) for (const a of R[i]) for (const b of R[j]) if (over(a.r, b.r)) o.add(`${a.e.id || a.e.textContent}|${b.e.id || b.e.textContent}`); return o; };
  apply(1); const base = pairs(rects());
  const fits = (kk: number) => { apply(kk); const R = rects(); return R.every((L) => L.every(({ r }) => r.left >= M && r.top >= M && r.right <= W - M && r.bottom <= H - M)) && [...pairs(R)].every((p) => base.has(p)); };
  let kk = k;
  if (Math.abs(k - 1) > 1e-3 && !fits(k)) { if (k > 1) { let lo = 1, hi = k; for (let i = 0; i < 7; i++) { const mid = (lo + hi) / 2; if (fits(mid)) lo = mid; else hi = mid; } kk = Math.floor(lo * 20) / 20; } fits(kk); }
  btnScaleUsed = kk;
  // V10.5 (AM-18, E5-28): el icono de modo (arriba, junto a la pausa) se aparta de la pausa ya escalada (al 200 % la pisaba)
  { const p = document.getElementById('btn-pause'), root = document.documentElement.style;
    if (p && p.offsetWidth > 0) { const b = box(p), W2 = orient.width; root.setProperty('--chip-r', `${Math.round(W2 - b.x + 8)}px`); root.setProperty('--chip-l', `${Math.round(b.x + b.w + 8)}px`); } }
}
export function watchHud() {
  let queued = false;
  const run = () => { if (queued) return; queued = true; requestAnimationFrame(() => { queued = false; layoutHand(); layoutButtonScale(); layoutHud(); }); };   // V10.1 P05 · V10.4 R20: lado de los botones
  const mo = new MutationObserver(run);
  // V10.5 (O-03): en los botones solo cuentan `hidden` y `class` (AGACHARSE reescribía su texto en cada fotograma y despertaba todo esto)
  for (const id of [...COLUMN, ...FLOATING, 'dialog', 'prompt', 'btn-dance', 'btn-board', 'btn-extra', 'btn-lean-l', 'btn-lean-r', 'btn-crouch', 'mode-chip', 'btn-pause']) { const el = document.getElementById(id); if (el) mo.observe(el, id.startsWith('btn-') || id === 'mode-chip' ? { attributes: true, attributeFilter: ['hidden', 'class'] } : { attributes: true, attributeFilter: ['hidden', 'class'], childList: true, subtree: true, characterData: true }); }
  mo.observe(document.documentElement, { attributes: true, attributeFilter: ['class', 'style'] });
  mo.observe(document.body, { attributes: true, attributeFilter: ['class'] });   // V10.1 P05: grind/actividad cambian posiciones
  addEventListener('resize', run); run();
}
