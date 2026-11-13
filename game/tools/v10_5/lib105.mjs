// V10.5 · utilidades de los guardianes (copia de V10/IT7/tools/lib7.mjs de la auditoría de móvil, con la URL de --url / BK_URL).
//  · DEVICES: matriz de dispositivos (viewport + isMobile + hasTouch + deviceScaleFactor + agente de usuario).
//  · prepPage(): antes de cargar, modo app (navigator.standalone / display-mode: standalone) y zonas seguras simuladas (--sat/--sab/--sal/--sar).
//  · scanUI(): en la página, rectángulos de todo lo visible del HUD, botones, 2D y avisos → solapes, fuera de pantalla, < 44 px, tapados.
import fs from 'node:fs';
import path from 'node:path';
import { sleep, withTimeout, argUrl } from '../v8/lib.mjs';

export const IT7 = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..', '..', '..', 'V10', 'IT7');
export const EV = path.join(IT7, 'evidencias', 'v105');
export const BASE_URL = argUrl();

const UA_IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1';
const UA_IPAD = 'Mozilla/5.0 (iPad; CPU OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1';
const UA_ANDROID = 'Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36';
const UA_ANDROID_TAB = 'Mozilla/5.0 (Linux; Android 14; SM-X710) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';
/** Lado corto × lado largo (vertical); la horizontal se obtiene girando. `notch` = zonas seguras típicas en vertical. */
export const DEVICES = [
  { id: 'se1', name: 'iPhone SE 1.ª (320×568)', w: 320, h: 568, dpr: 2, ua: UA_IPHONE, kind: 'phone', notch: null },
  { id: 'se', name: 'iPhone SE / 8 (375×667)', w: 375, h: 667, dpr: 2, ua: UA_IPHONE, kind: 'phone', notch: null },
  { id: 'ip14', name: 'iPhone 12–15 (390×844)', w: 390, h: 844, dpr: 3, ua: UA_IPHONE, kind: 'phone', notch: { t: 47, b: 34, side: 47, bl: 21 } },
  { id: 'pmax', name: 'iPhone Pro Max (430×932)', w: 430, h: 932, dpr: 3, ua: UA_IPHONE, kind: 'phone', notch: { t: 59, b: 34, side: 59, bl: 21 } },
  { id: 'and360', name: 'Android pequeño (360×740)', w: 360, h: 740, dpr: 3, ua: UA_ANDROID, kind: 'phone', notch: { t: 24, b: 0, side: 24, bl: 0 } },
  { id: 'and360b', name: 'Android pequeño (360×800)', w: 360, h: 800, dpr: 3, ua: UA_ANDROID, kind: 'phone', notch: { t: 24, b: 0, side: 24, bl: 0 } },
  { id: 'and412', name: 'Android grande (412×915)', w: 412, h: 915, dpr: 2.625, ua: UA_ANDROID, kind: 'phone', notch: { t: 24, b: 0, side: 24, bl: 0 } },
  { id: 'ipad', name: 'iPad (768×1024)', w: 768, h: 1024, dpr: 2, ua: UA_IPAD, kind: 'tablet', notch: null },
  { id: 'ipadair', name: 'iPad Air (820×1180)', w: 820, h: 1180, dpr: 2, ua: UA_IPAD, kind: 'tablet', notch: { t: 24, b: 20, side: 0, bl: 20 } },
  { id: 'ipadpro', name: 'iPad Pro 12,9 (1024×1366)', w: 1024, h: 1366, dpr: 2, ua: UA_ANDROID_TAB, kind: 'tablet', notch: null },
  { id: 'pc720', name: 'Ordenador 1280×720', w: 720, h: 1280, dpr: 1, ua: null, kind: 'desktop', notch: null },
  { id: 'pc900', name: 'Ordenador 1440×900', w: 900, h: 1440, dpr: 2, ua: null, kind: 'desktop', notch: null },
  { id: 'pc1080', name: 'Ordenador 1920×1080', w: 1080, h: 1920, dpr: 1, ua: null, kind: 'desktop', notch: null },
];
export const dev = (id) => DEVICES.find((d) => d.id === id);
/** Viewport de Puppeteer para un dispositivo y orientación ('v' vertical, 'h' horizontal). Los ordenadores solo tienen sentido en horizontal. */
export function viewportOf(d, o) {
  const land = o === 'h', touch = d.kind !== 'desktop';
  return { width: land ? d.h : d.w, height: land ? d.w : d.h, deviceScaleFactor: d.dpr, isMobile: touch, hasTouch: touch, isLandscape: land };
}
/** Zonas seguras físicas (px) de un dispositivo en una orientación (notch a la izquierda en horizontal). */
export function insetsOf(d, o) {
  if (!d.notch) return { t: 0, r: 0, b: 0, l: 0 };
  return o === 'h' ? { t: 0, r: d.notch.side, b: d.notch.bl, l: d.notch.side } : { t: d.notch.t, r: 0, b: d.notch.b, l: 0 };
}

/** Prepara una pestaña ANTES de cargar el juego: agente de usuario, modo app y zonas seguras simuladas. */
export async function prepPage(page, d, o, { app = false, safe = false } = {}) {
  if (d.ua) await page.setUserAgent(d.ua);
  await page.setViewport(viewportOf(d, o));
  const ins = safe ? insetsOf(d, o) : { t: 0, r: 0, b: 0, l: 0 };
  await page.evaluateOnNewDocument((app, ins) => {
    window.__bk7 = { app, ins };
    if (app) {
      try { Object.defineProperty(navigator, 'standalone', { get: () => true, configurable: true }); } catch { /* */ }
      const mm = window.matchMedia.bind(window);
      window.matchMedia = (q) => { if (/display-mode:\s*standalone/.test(q)) { const r = mm('(min-width: 0px)'); return Object.assign(Object.create(Object.getPrototypeOf(r)), { matches: true, media: q, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, onchange: null }); } return mm(q); };
    }
    // zonas seguras: los env() de Chrome sin pantalla con muesca valen 0; se fijan las variables del juego (también con el contenedor girado,
    // donde style.css las reasigna: rot90 → arriba = derecha física, etc.)
    const apply = () => {
      const i = window.__bk7.ins; let st = document.getElementById('__bk7safe'); if (!st) { st = document.createElement('style'); st.id = '__bk7safe'; (document.head || document.documentElement).appendChild(st); }
      st.textContent = `html:root { --sat: ${i.t}px !important; --sar: ${i.r}px !important; --sab: ${i.b}px !important; --sal: ${i.l}px !important; }
html.rot90:root { --sat: ${i.r}px !important; --sar: ${i.b}px !important; --sab: ${i.l}px !important; --sal: ${i.t}px !important; }
html.rotm90:root { --sat: ${i.l}px !important; --sar: ${i.t}px !important; --sab: ${i.r}px !important; --sal: ${i.b}px !important; }`;
    };
    window.__bk7.setInsets = (ins) => { window.__bk7.ins = ins; apply(); };
    if (ins.t || ins.r || ins.b || ins.l) document.addEventListener('DOMContentLoaded', apply);
  }, app, ins);
}
/** Cambia la orientación en caliente (rotación del teléfono): viewport girado + zonas seguras giradas + evento de orientación. */
export async function rotate(page, d, o, { safe = false } = {}) {
  await page.setViewport(viewportOf(d, o));
  const ins = safe ? insetsOf(d, o) : { t: 0, r: 0, b: 0, l: 0 };
  await page.evaluate((ins) => { window.__bk7?.setInsets?.(ins); try { screen.orientation?.dispatchEvent?.(new Event('change')); } catch { /* */ } }, ins);
}

/** Abre el juego con la pestaña preparada (perfil temporal del lanzador). `save`: null = sin partida; objeto = guardado declarado. */
export async function open7(browser, R, d, o, { save = null, query = '?bktest=1', app = false, safe = false, url = BASE_URL, errors = [] } = {}) {
  const page = await browser.newPage();
  await prepPage(page, d, o, { app, safe });
  page.on('pageerror', (e) => { errors.push('pageerror ' + String(e?.message ?? e)); });
  page.on('console', (m) => { const t = m.text(); if (/BK_ENV_CONTEXT_LOST/.test(t)) errors.push('CONTEXTO PERDIDO'); else if (m.type() === 'error' && !/favicon|Failed to load resource/.test(t)) errors.push('console ' + t.slice(0, 300)); });
  await page.evaluateOnNewDocument(() => { document.addEventListener('webglcontextlost', () => console.log('BK_ENV_CONTEXT_LOST'), true); });
  await page.evaluateOnNewDocument((s) => {
    if (!sessionStorage.getItem('__bk7_fixture_done')) { sessionStorage.setItem('__bk7_fixture_done', '1');
      if (s === null) localStorage.removeItem('bellakaventuras.remake.save'); else if (s !== undefined) localStorage.setItem('bellakaventuras.remake.save', typeof s === 'string' ? s : JSON.stringify(s)); }
  }, save);
  await withTimeout(page.goto(url + query, { waitUntil: 'load' }), 60000, 'carga de página');
  await withTimeout(page.waitForFunction(() => window.__bk && !document.getElementById('btn-start').disabled, { timeout: 120000 }), 125000, 'juego listo');
  return page;
}
/** Pulsa JUGAR/CONTINUAR con el tipo de entrada del dispositivo (toque en táctil) y cierra el aviso del iPhone si sale. */
export async function start7(page, touch, { iosAnswer = 'no' } = {}) {
  const b = await page.evaluate(() => { const r = document.getElementById('btn-start').getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; });
  if (touch) await page.touchscreen.tap(b.x, b.y); else await page.mouse.click(b.x, b.y);
  await page.waitForFunction(() => window.__bk.started, { timeout: 8000 });
  await sleep(900);
  const ios = await page.evaluate(() => !document.getElementById('ios-app').hidden);
  return { ios };
}
export async function tapEl(page, sel, touch = true) {
  const box = await page.evaluate((q) => { const e = document.querySelector(q); if (!e) return null; const r = e.getBoundingClientRect(); return r.width > 0 ? { x: r.left + r.width / 2, y: r.top + r.height / 2 } : null; }, sel);
  if (!box) return false; if (touch) await page.touchscreen.tap(box.x, box.y); else await page.mouse.click(box.x, box.y); await sleep(250); return true;
}
export const d2State = (page) => page.evaluate(() => { const d = document.getElementById('d2'); return d && !d.hidden ? { text: d.querySelector('.d2-text').textContent, n: d.querySelectorAll('.d2-btn').length } : null; });
export async function waitD2(page, re, ms = 15000) { const t0 = Date.now(); while (Date.now() - t0 < ms) { const d = await d2State(page); if (d && (!re || re.test(d.text))) return d; await sleep(100); } return null; }
/** Avanza el 2D tocando su botón principal (como en el móvil) o con E. */
export async function adv(page, touch = true) { await sleep(420); if (touch) { const ok = await tapEl(page, '#d2 .d2-btn.primary', true); if (!ok) await page.keyboard.press('KeyE'); } else await page.keyboard.press('KeyE'); await sleep(260); }

/** Detector de solapes (en la página). Devuelve los elementos visibles con su rectángulo FÍSICO y los problemas. */
export function scanUI(opts = {}) {
  const W = innerWidth, H = innerHeight, ins = (window.__bk7 && window.__bk7.ins) || { t: 0, r: 0, b: 0, l: 0 };
  const touch = document.body.classList.contains('touch');
  const visible = (e) => {
    if (!e || !e.isConnected) return false; const r = e.getBoundingClientRect(); if (r.width < 1 || r.height < 1) return false;
    let o = 1; for (let n = e; n && n !== document.documentElement; n = n.parentElement) { const cs = getComputedStyle(n); if (cs.display === 'none' || cs.visibility === 'hidden' || n.hidden) return false; o *= parseFloat(cs.opacity); }
    return o > 0.05;
  };
  const name = (e) => e.id ? '#' + e.id : (e.className && typeof e.className === 'string' ? e.tagName.toLowerCase() + '.' + e.className.trim().split(/\s+/).join('.') : e.tagName.toLowerCase()) + (e.textContent && e.tagName === 'BUTTON' ? `«${e.textContent.trim().slice(0, 18)}»` : '');
  const SEL = ['#counter', '#zone', '#objective', '#task', '#toast', '#hint', '#mode-chip', '#reward-arrow', '#save-badge', '#prompt-note', '#grind-hud', '#stick', '#btn-sound-fix',
    '#d2 .d2-bubble', '#d2 .d2-kat', '#d2 .d2-kroak', '#d2 .d2-prop', '#dialog .bubble', '#hit-circle .hc-core', '#btn-tuto-skip', '#btn-cine-skip',
    '#ui button', '#ui a.big', '#ui input', '#d2 button', '#start .pt-titulo-img', '#start .pt-subtitulo-img', '#load-bar', '#btn-size .bs-bar', '#dance-seq', '#dance-timer', '#graffiti-wrap', '.screen h2', '#final #visual-slot'];
  const seen = new Set(), items = [];
  for (const q of SEL) for (const e of document.querySelectorAll(q)) { if (seen.has(e) || !visible(e)) continue; seen.add(e);
    const r = e.getBoundingClientRect(); const btn = e.matches('button, a.big, input');
    items.push({ e, n: name(e), btn, r: { x: +r.left.toFixed(1), y: +r.top.toFixed(1), w: +r.width.toFixed(1), h: +r.height.toFixed(1) } }); }
  // capas: z de la sección de primer nivel de #ui a la que pertenece cada elemento; lo que queda DEBAJO de una capa modal visible (2D, pausa,
  // ajustes, avisos…) no cuenta como solape ni como botón tapado (está tapado a propósito)
  const top = (e) => { let n = e; while (n.parentElement && n.parentElement.id !== 'ui') n = n.parentElement; return n; };
  const zOf = (e) => { const z = parseInt(getComputedStyle(top(e)).zIndex, 10); return Number.isFinite(z) ? z : 0; };
  const MODALS = ['#d2', '#start', '#pause', '#settings', '#help', '#final', '#confirm', '#confirm-plaza', '#ios-app', '#glost', '#graffiti'].map((q) => document.querySelector(q)).filter((m) => m && visible(m));
  for (const it of items) { const zi = zOf(it.e); it.z = zi; it.under = MODALS.some((m) => !m.contains(it.e) && (zOf(m) > zi || (zOf(m) === zi && top(it.e) !== m && (top(it.e).compareDocumentPosition(m) & Node.DOCUMENT_POSITION_FOLLOWING)))); it.pe = getComputedStyle(it.e).pointerEvents; }
  const live = items.filter((i) => !i.under);
  const off = [], small = [], hidden = [], over = [], unsafe = [], inert = [];
  for (const it of live) { const { x, y, w, h } = it.r;
    if (it.btn && it.pe === 'none' && !it.e.disabled) inert.push({ n: it.n, z: it.z });
    if (x < -1 || y < -1 || x + w > W + 1 || y + h > H + 1) off.push({ n: it.n, r: it.r });
    else if (it.btn && (x < ins.l - 1 || y < ins.t - 1 || x + w > W - ins.r + 1 || y + h > H - ins.b + 1)) unsafe.push({ n: it.n, r: it.r, ins });
    if (it.btn && touch && (w < 44 || h < 44) && !it.e.matches('input[type=checkbox]')) small.push({ n: it.n, w, h });
    if (it.btn) { // tapado: el punto central (y 4 interiores) no es el propio botón ni algo dentro de él
      const pts = [[0.5, 0.5], [0.25, 0.3], [0.75, 0.3], [0.25, 0.7], [0.75, 0.7]]; let bad = 0, by = null;
      for (const [u, v] of pts) { const px = x + w * u, py = y + h * v; if (px < 0 || py < 0 || px >= W || py >= H) { bad++; continue; } const t = document.elementFromPoint(px, py); if (!t || !(t === it.e || it.e.contains(t) || t.contains(it.e) && t.tagName === 'BUTTON')) { bad++; by = by || (t ? name(t) : 'nada'); } }
      if (bad >= 3) hidden.push({ n: it.n, by, bad }); }
  }
  const rel = (a, b) => a.contains(b) || b.contains(a);
  for (let i = 0; i < live.length; i++) for (let j = i + 1; j < live.length; j++) { const A = live[i], B = live[j]; if (rel(A.e, B.e)) continue;
    const ix = Math.min(A.r.x + A.r.w, B.r.x + B.r.w) - Math.max(A.r.x, B.r.x), iy = Math.min(A.r.y + A.r.h, B.r.y + B.r.h) - Math.max(A.r.y, B.r.y);
    if (ix > 2 && iy > 2) over.push({ a: A.n, b: B.n, kind: A.btn && B.btn ? 'botón-botón' : A.btn || B.btn ? 'botón-otro' : 'otro-otro', px: [+ix.toFixed(0), +iy.toFixed(0)] }); }
  const html = document.documentElement.className;
  const cv = document.getElementById('game'); const g = window.__bk;
  const canvas = cv ? { css: [cv.clientWidth, cv.clientHeight], buf: [cv.width, cv.height], pr: g?.renderer?.getPixelRatio?.(), aspect: g?.rig?.cam?.aspect } : null;
  return { W, H, html, touch, zurdo: document.body.classList.contains('zurdo'), btnK: getComputedStyle(document.documentElement).getPropertyValue('--btn-k').trim(),
    items: items.map((i) => ({ n: i.n, r: i.r, z: i.z, under: i.under })), modals: MODALS.map((m) => m.id), off, small, hidden, over, unsafe, inert, canvas };
}
/** Ejecuta scanUI en la página. */
export const scan = (page) => page.evaluate(scanUI);
/** Guarda JSON. */
export function saveJson(file, data) { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, JSON.stringify(data, null, 1)); return file; }
