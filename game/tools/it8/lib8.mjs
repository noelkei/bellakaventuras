// IT8 · ayudantes comunes de las pruebas de la auditoría final (V10/IT8/PLAN_DE_PRUEBAS.md). Se apoya en v8/lib.mjs, v10_2/lib102.mjs y
// v10_5/lib105.mjs; no los cambia.
import fs from 'node:fs';
import path from 'node:path';
import { sleep, withTimeout, ROOT, SAVE_20 } from '../v8/lib.mjs';
import { prepPage, dev, BASE_URL } from '../v10_5/lib105.mjs';
export { dev };
export const EV8 = path.join(ROOT, 'V10', 'IT8', 'evidencias');
export function saveJson(rel, data) { const f = path.join(EV8, rel); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, JSON.stringify(data, null, 1)); return f; }
export function mkdir(rel) { const d = path.join(EV8, rel); fs.mkdirSync(d, { recursive: true }); return d; }
/** Generador determinista (mulberry32). */
export function rng(seed) { let st = seed >>> 0; return () => { st = (st + 0x6D2B79F5) >>> 0; let t = st; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
export const N = (vistos, ayuda = 'no', estado = 'hecho') => ({ v: 1, estado, paso: '', practica: true, vistos, ayuda });
export const BASE_VISTOS = ['PLA-10', 'CIN-01', 'PAR', 'NMG', 'OBJ'];
export const TODO_VISTO = [...BASE_VISTOS, 'PAS-01', 'PAS-02', 'PAS-03', 'PAS-04', 'PAS-05', 'PAS-06', 'PAS-07', 'PAS-08', 'FIN'];
/** 20/20 con todo visto (sin narrativa pendiente) y el aviso del iPhone ya contestado. */
export const S20 = { ...SAVE_20, settings: { iosAppAsked: true }, narr: N(TODO_VISTO) };
/** 20/20 con el reto final hecho (la escena final se puede ver: previewUnlocked). */
export const S20F = { ...S20, finalDone: true, finalProof: { kind: 'secretnovio_v10', at: '2026-10-22T00:00:00.000Z' } };
/** Partida a 0 (tutorial y bienvenida vistos). */
export const S0 = { version: 5, migV10: 99, collected: [], activities: { pantherTalk: false, skateTutorial: false, graffiti: false, bridgeTalk: false, danceCombo: false }, bridgeReached: false,
  finalDone: false, finalProof: null, revealSeen: false, checkpoint: null, checkpointRevision: 4, hints: ['basic'], settings: { iosAppAsked: true }, narr: N(BASE_VISTOS) };

/** Abre el juego como open7 (pestaña preparada: aparato, orientación, modo app, zonas seguras) y además ejecuta `init` (funciones que van a
 *  la página ANTES que el juego: trampas de almacenamiento, audio, red…). `save: undefined` = no tocar el almacenamiento. */
export async function open8(browser, R, d, o, opts = {}) {
  // V10.6 (B0, verificación IT8): `save: undefined` = no tocar el guardado (antes el valor por defecto lo convertía en null y lo BORRABA)
  const { query = '?bktest=1&narr=off', app = false, safe = false, url = BASE_URL, errors = [], init = [], wait = true } = opts, save = 'save' in opts ? opts.save : null;
  const page = await browser.newPage();
  await prepPage(page, d, o, { app, safe });
  page.on('pageerror', (e) => { errors.push('pageerror ' + String(e?.message ?? e).slice(0, 300)); });
  page.on('console', (m) => { const t = m.text(); if (/BK_ENV_CONTEXT_LOST/.test(t)) { errors.push('CONTEXTO PERDIDO'); R.markEnvLost?.('contexto WebGL perdido'); } else if (m.type() === 'error' && !/favicon|Failed to load resource|Ignored attempt to cancel a touchmove/.test(t)) errors.push('console ' + t.slice(0, 300)); });   // el aviso de intervención de Chrome por toques sobre un desplazamiento no es del juego
  await page.evaluateOnNewDocument(() => { document.addEventListener('webglcontextlost', () => { if (!window.__bkExpectLost) console.log('BK_ENV_CONTEXT_LOST'); }, true); });
  if (save !== undefined) await page.evaluateOnNewDocument((s) => {
    try { if (!sessionStorage.getItem('__bk8_fixture_done')) { sessionStorage.setItem('__bk8_fixture_done', '1');
      if (s === null) localStorage.removeItem('bellakaventuras.remake.save'); else localStorage.setItem('bellakaventuras.remake.save', typeof s === 'string' ? s : JSON.stringify(s)); } } catch { /* almacenamiento bloqueado a propósito */ }
  }, save);
  for (const f of init) { if (Array.isArray(f)) await page.evaluateOnNewDocument(f[0], ...f.slice(1)); else await page.evaluateOnNewDocument(f); }
  await withTimeout(page.goto(url + query, { waitUntil: 'load' }), 90000, 'carga de página');
  if (wait) await withTimeout(page.waitForFunction(() => window.__bk && !document.getElementById('btn-start').disabled, { timeout: 150000 }), 155000, 'juego listo');
  return page;
}
export async function waitReady(page, ms = 150000) { await withTimeout(page.waitForFunction(() => window.__bk && !document.getElementById('btn-start').disabled, { timeout: ms }), ms + 5000, 'juego listo'); }
/** Pulsa JUGAR con dedo o ratón y espera a que empiece; contesta «Ahora no» al aviso del iPhone si sale. */
export async function start8(page, touch) {
  const b = await page.evaluate(() => { const r = document.getElementById('btn-start').getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; });
  if (touch) await page.touchscreen.tap(b.x, b.y); else await page.mouse.click(b.x, b.y);
  // H8-08: con la pantalla girada por el juego, el primer toque nada más activarse JUGAR puede perderse: se reintenta una vez y se anota
  if (!(await page.waitForFunction(() => window.__bk.started, { timeout: 3000 }).then(() => true).catch(() => false))) {
    page.__reintentoJugar = true; await sleep(600); const c = await page.evaluate(() => { const r = document.getElementById('btn-start').getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; });
    if (touch) await page.touchscreen.tap(c.x, c.y); else await page.mouse.click(c.x, c.y);
    await page.waitForFunction(() => window.__bk.started, { timeout: 10000 }); }
  await sleep(900);
  if (await page.evaluate(() => !document.getElementById('ios-app').hidden)) { await tapOrClick(page, '#btn-ios-no', touch); await sleep(500); }
}
/** Centro de un elemento visible (o null). */
export const center = (page, sel) => page.evaluate((q) => { const e = [...document.querySelectorAll(q)].find((x) => { const r = x.getBoundingClientRect(); return r.width > 0 && r.height > 0 && !x.closest('[hidden]'); }); if (!e) return null;
  const r = e.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2, w: r.width, h: r.height }; }, sel);
export async function tapOrClick(page, sel, touch = true) { const c = await center(page, sel); if (!c) return false; if (touch) await page.touchscreen.tap(c.x, c.y); else await page.mouse.click(c.x, c.y); await sleep(250); return true; }
/** ¿El elemento está visible y es lo de arriba en su centro (un toque le llegaría)? */
export const onTop = (page, sel) => page.evaluate((q) => { const e = document.querySelector(q); if (!e || e.closest('[hidden]')) return { ok: false, why: 'no existe u oculto' };
  const r = e.getBoundingClientRect(); if (r.width < 1 || r.height < 1) return { ok: false, why: 'tamaño 0' };
  const x = r.left + r.width / 2, y = r.top + r.height / 2; if (x < 0 || y < 0 || x > innerWidth || y > innerHeight) return { ok: false, why: 'fuera de pantalla', r: [r.left, r.top, r.width, r.height] };
  const t = document.elementFromPoint(x, y); const ok = !!t && (t === e || e.contains(t)); return { ok, why: ok ? '' : 'tapado por ' + (t ? (t.id ? '#' + t.id : t.tagName + '.' + (t.className?.toString?.() ?? '')) : 'nada'), r: [Math.round(r.left), Math.round(r.top), Math.round(r.width), Math.round(r.height)] }; }, sel);

/** Estado «limpio» (como v10_1/actividades-matriz): explorando, sin pausa, cámara de seguimiento, controles visibles si táctil, sin capas. */
export const cleanState = (page) => page.evaluate(() => { const g = window.__bk, s = g.skater, v = g.visual, B = document.body.classList, hid = (id) => document.getElementById(id)?.hidden !== false;
  const busy = g.activities.filter((a) => a.busy || a.seated || a.inAttempt || a.inRun || a.dancing >= 0).map((a) => a.id);
  const d2 = document.getElementById('d2'); const d2open = !!d2 && !d2.hidden;
  const r = { mode: g.mode, paused: g.paused, cam: g.rig.mode, capas: ['grind', 'actividad', 'reto-sn', 'cine', 'puntero-libre'].filter((c) => B.contains(c)),
    overlays: ['graffiti', 'dance', 'dialog', 'grind-hud', 'pause', 'settings', 'help', 'confirm', 'confirm-plaza', 'glost', 'final', 'ios-app'].filter((id) => !hid(id)), d2: d2open, narrBusy: !!g.narr?.busy,
    frozen: s.frozen, override: v.override ?? null, tabla: !v.boardHidden, busy, loco: s.loco, pos: [+s.footPos.x.toFixed(2), +s.footPos.y.toFixed(2), +s.footPos.z.toFixed(2)] };
  r.ok = r.mode === 'explore' && !r.paused && r.cam === 'follow' && !r.capas.length && !r.overlays.length && !r.d2 && !r.narrBusy && !r.frozen && !r.override && !r.busy.length;
  return r; });
/** ¿Responde al control? W (o S si hay pared delante) 0,8 s con teclas reales; devuelve metros recorridos. */
export async function walks(page) {
  const at = () => page.evaluate(() => [window.__bk.skater.footPos.x, window.__bk.skater.footPos.z]);
  let best = 0;
  for (const k of ['KeyW', 'KeyS']) { const p0 = await at(); await page.keyboard.down(k); await sleep(800); await page.keyboard.up(k); await sleep(200); const p1 = await at(); best = Math.max(best, Math.hypot(p1[0] - p0[0], p1[1] - p0[1])); if (best > 0.5) break; }
  return +best.toFixed(2);
}
/** Avanza el 2D (si lo hay) y cierra diálogos 3D hasta quedar limpio o agotar `ms`. Devuelve el estado final. */
export async function drainUI(page, touch, ms = 30000) {
  const t0 = Date.now(); let st;
  while (Date.now() - t0 < ms) {
    st = await cleanState(page); if (st.ok) return st;
    const act = await page.evaluate(() => { const d2 = document.getElementById('d2'); if (d2 && !d2.hidden) { const no = [...d2.querySelectorAll('.d2-btn')].find((b) => /no|ahora no/i.test(b.textContent)); return no ? 'no' : 'd2'; }
      if (!document.getElementById('dialog').hidden) return 'dialog'; if (!document.getElementById('ios-app').hidden) return 'ios'; if (!document.getElementById('pause').hidden) return 'pause'; return null; });
    if (act === 'd2') { await sleep(420); if (!(touch ? await tapOrClick(page, '#d2 .d2-btn.primary', true) : false)) await page.keyboard.press('KeyE'); }
    else if (act === 'no') { await sleep(420); await page.evaluate(() => { const b = [...document.querySelectorAll('#d2 .d2-btn')].find((x) => /no|ahora no/i.test(x.textContent)); b?.click(); }); }
    else if (act === 'dialog') { await sleep(300); if (!(touch && await tapOrClick(page, '#dialog-ok', true))) await page.keyboard.press('KeyE'); }
    else if (act === 'ios') await tapOrClick(page, '#btn-ios-no', touch);
    else if (act === 'pause') await tapOrClick(page, '#btn-resume', touch);
    await sleep(450);
  }
  return st;
}
/** Coloca a ANMI encima de una patata (teleporte declarado) y espera a que se recoja. */
export const collectFry = (page, id, ms = 1500) => page.evaluate(async (id, ms) => { const g = window.__bk, T = window.__bkTHREE, p = g.pickups.find((x) => x.id === id); if (!p) return { id, err: 'no existe' }; if (p.collected) return { id, got: true, ya: true };
  const sp = p.spawn; g.input.clear(); g.skater.teleport(new T.Vector3(sp.pos.x, sp.pos.y + 0.05, sp.pos.z), g.skater.heading, 'walk'); g.skater.vel.set(0, 0, 0);
  const t0 = performance.now(); while (performance.now() - t0 < ms && !p.collected) await new Promise((r) => setTimeout(r, 60)); return { id, got: p.collected, total: g.state.total }; }, id, ms);
/** Lo guardado en disco ahora mismo (o null). */
export const disk = (page) => page.evaluate(() => { try { return JSON.parse(localStorage.getItem('bellakaventuras.remake.save') || 'null'); } catch { return 'ERR'; } });
/** Recarga y espera a que JUGAR esté activo. */
export async function reload8(page) { await page.reload({ waitUntil: 'load' }); await waitReady(page); }

// ---------------------------------------------------------------- dedo (CDP, multitáctil)
/** Dedos reales por CDP: joystick (arrastre desde el centro de #stick-zone) y toques con otro dedo mientras se mantiene. */
export class Fingers {
  constructor(page) { this.page = page; this.pts = new Map(); this.cdp = null; }
  async init() { this.cdp = await this.page.target().createCDPSession(); return this; }
  async send(type) { await this.cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' && !this.pts.size ? [] : [...this.pts.entries()].map(([id, [x, y]]) => ({ x, y, id, radiusX: 6, radiusY: 6, force: 1 })) }); }
  async down(id, x, y) { this.pts.set(id, [x, y]); await this.send('touchStart'); }
  async move(id, x, y) { this.pts.set(id, [x, y]); await this.send('touchMove'); }
  async up(id) { const had = this.pts.get(id); if (!had) return; this.pts.delete(id); await this.cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [...this.pts.entries()].map(([i, [x, y]]) => ({ x, y, id: i })) }); }
  /** Joystick: dirección en grados (0 = arriba, 90 = derecha) y fuerza 0–1; queda apoyado hasta stickUp(). */
  async stick(deg, mag = 1) {
    const z = this.zone ?? (this.zone = await this.page.evaluate(() => { const e = document.getElementById('stick-zone'), s = document.getElementById('stick'), r = (s && s.getBoundingClientRect().width ? s : e).getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2, R: Math.max(40, r.width / 2) }; }));
    const a = deg * Math.PI / 180, R = z.R * 1.1 * mag, tx = z.x + Math.sin(a) * R, ty = z.y - Math.cos(a) * R;
    if (!this.pts.has(1)) { await this.down(1, z.x, z.y); await sleep(30); }
    for (let i = 1; i <= 4; i++) { await this.move(1, z.x + (tx - z.x) * i / 4, z.y + (ty - z.y) * i / 4); await sleep(16); }
  }
  async stickUp() { await this.up(1); }
  /** Toque con un segundo dedo en un elemento (con el joystick apoyado o no). */
  async tap(sel, hold = 70) { const c = await center(this.page, sel); if (!c) return false; await this.down(2, c.x, c.y); await sleep(hold); await this.up(2); await sleep(120); return true; }
  async close() { for (const id of [...this.pts.keys()]) await this.up(id); try { await this.cdp.detach(); } catch { /* */ } }
}

// ---------------------------------------------------------------- mando falso
export async function pad(page, { buttons = {}, axes = null } = {}) { await page.evaluate((buttons, axes) => { const I = window.__bk.input; if (!I.fakePad) I.fakePad = { axes: [0, 0, 0, 0], buttons: Array.from({ length: 17 }, () => ({ pressed: false, value: 0 })), id: 'prueba', connected: true };
  for (const [k, v] of Object.entries(buttons)) I.fakePad.buttons[+k] = { pressed: !!v, value: v ? 1 : 0 }; if (axes) I.fakePad.axes = axes; }, buttons, axes); }
export async function padTap(page, idx, hold = 120) { await pad(page, { buttons: { [idx]: 1 } }); await sleep(hold); await pad(page, { buttons: { [idx]: 0 } }); await sleep(160); }
export const PAD = { A: 0, B: 1, X: 2, Y: 3, LB: 4, RB: 5, SELECT: 8, START: 9, R3: 11, UP: 12, DOWN: 13, LEFT: 14, RIGHT: 15 };

// ---------------------------------------------------------------- llevar el juego a un estado
export async function until(page, fn, ms, ...a) { const t0 = Date.now(); while (Date.now() - t0 < ms) { let v; try { v = await page.evaluate(fn, ...a); } catch { v = null; } if (v) return v; await sleep(150); } return null; }
/** Página «abortable»: tras abort(), evaluate/teclado/ratón lanzan (para cortar un piloto en marcha antes de recargar o interrumpir). */
export function abortable(page) { let ab = false; const p = new Proxy(page, { get(t, k) { if (ab && ['evaluate', 'keyboard', 'mouse'].includes(k)) throw new Error('abortado'); const v = t[k]; return typeof v === 'function' ? v.bind(t) : v; } }); return { p, abort: () => { ab = true; } }; }
/** Reto final de SN (teclado, con snRun de v10/sn-lib) hasta una de `phases`; corta el piloto ahí. Necesita partida 20/20 con revelación. */
export async function snUntil(page, R, phases, snRun) {
  const { p, abort } = abortable(page); const run = snRun(p, R, { jump: 'hot', circles: 'none' }).catch((e) => ({ err: String(e.message) }));
  const hit = await until(page, (ph) => { const a = window.__bk.activities.find((x) => x.id === 'secretJump'); return a && ph.includes(a.phase) ? a.phase : null; }, 70000, phases);
  abort(); for (const k of ['KeyW', 'KeyE', 'Space']) await page.keyboard.up(k).catch(() => {});
  return { hit, run };
}
/** ANMI a pie en una zona de actividad (suelo real dentro de su ventana de altura), como v10_1/actividades-matriz. */
export const toAct = (page, zone) => page.evaluate((zone) => { const g = window.__bk, T = window.__bkTHREE, s = g.skater, RA = window.__bkRapier, z = g.park.zones.get(zone); if (!z) return { ok: false };
  const p = z.pos.clone(); const h = g.world.castRay(new RA.Ray({ x: p.x, y: z.yMax + 0.3, z: p.z }, { x: 0, y: -1, z: 0 }), z.yMax - z.yMin + 1.5, true, RA.QueryFilterFlags.EXCLUDE_SENSORS, undefined, s.collider, undefined, (c) => !g.npcColliders.has(c.handle));
  if (h) p.y = z.yMax + 0.3 - h.timeOfImpact; g.input.clear(); s.teleport(new T.Vector3(p.x, p.y, p.z), s.heading, 'walk'); g.rig.snapBehind(s); return { ok: true, p: [p.x, p.y, p.z] }; }, zone);
export const actBusy = (page, id) => page.evaluate((id) => { const x = window.__bk.activities.find((q) => q.id === id); return !!(x && (x.busy || x.seated || x.inAttempt || x.inRun)); }, id);
/** Simula ocultar la pestaña (otra app, pantalla bloqueada) `ms` y volver. */
export async function hideShow(page, ms = 4000, mid = null) {
  const set = (h) => page.evaluate((h) => { Object.defineProperty(document, 'hidden', { get: () => h, configurable: true }); Object.defineProperty(document, 'visibilityState', { get: () => (h ? 'hidden' : 'visible'), configurable: true }); document.dispatchEvent(new Event('visibilitychange')); }, h);
  await set(true); await sleep(ms / 2); const m = mid ? await mid() : null; await sleep(ms / 2); await set(false); await sleep(600); return m;
}
export async function blurFocus(page, ms = 3000, mid = null) { await page.evaluate(() => window.dispatchEvent(new Event('blur'))); await sleep(ms / 2); const m = mid ? await mid() : null; await sleep(ms / 2); await page.evaluate(() => window.dispatchEvent(new Event('focus'))); await sleep(500); return m; }

// ---------------------------------------------------------------- adaptador de entradas (partidas enteras con dedo o mando)
/** Envuelve `page` para que un piloto escrito para TECLADO juegue con el DEDO (modo 'tactil') o con el MANDO ('mando'): cada tecla se
 *  traduce a lo que haría el jugador con esa entrada (joystick, SALTO, TABLA, botón de acción, ◀ ▶ del grind, flechas del baile, círculos del
 *  reto…) y `page.click(sel)` a un toque o a llevar el foco con la cruceta y pulsar A. Lo que no tiene equivalente se apunta en `log`
 *  (sinEquivalente). `page.mouse` en táctil = un dedo (pintar el grafiti); con mando no hay equivalente (H8-01): se apunta y se usa el ratón. */
export function wrapInput(raw, modo, { log = [] } = {}) {
  const F = new Fingers(raw); let ready = F.init();
  const held = new Set(); const st = { lean: null, crouch: false, mouseDown: false, mx: 0, my: 0 };
  const ui = () => raw.evaluate(() => { const vis = (id) => { const e = document.getElementById(id); return !!e && !e.hidden && !e.closest('[hidden]'); }; const d2 = document.getElementById('d2');
    return { d2: !!d2 && !d2.hidden, dialog: vis('dialog'), cine: vis('btn-cine-skip'), tuto: vis('btn-tuto-skip'), d2skip: !!document.querySelector('#d2:not([hidden]) .d2-skip'), pause: vis('pause'), settings: vis('settings'), help: vis('help'),
      dance: vis('dance'), circle: vis('hit-circle'), grind: document.body.classList.contains('grind'), action: vis('prompt'), ios: vis('ios-app'), crouch: document.getElementById('btn-crouch')?.getAttribute('aria-pressed') === 'true' }; });
  const note = (k, why) => { log.push({ t: Date.now(), k, why }); };
  const DIRK = { KeyW: 'up', ArrowUp: 'up', KeyS: 'down', ArrowDown: 'down', KeyA: 'left', ArrowLeft: 'left', KeyD: 'right', ArrowRight: 'right' };
  async function applyMove() {
    const u = ['KeyW', 'ArrowUp'].some((k) => held.has(k)) ? 1 : 0, dn = ['KeyS', 'ArrowDown'].some((k) => held.has(k)) ? 1 : 0, l = ['KeyA', 'ArrowLeft'].some((k) => held.has(k)) ? 1 : 0, r = ['KeyD', 'ArrowRight'].some((k) => held.has(k)) ? 1 : 0;
    const y = u - dn, x = r - l, s = await ui();
    if (s.grind) {   // grind de Bellakat: equilibrio con ◀ ▶ (táctil) o el stick (mando)
      if (modo === 'tactil') { const want = x < 0 ? '#btn-lean-l' : x > 0 ? '#btn-lean-r' : null; if (want !== st.lean) { if (st.lean) await F.up(3); if (want) { const c = await center(raw, want); if (c) await F.down(3, c.x, c.y); } st.lean = want; } return; }
    }
    if (modo === 'tactil') { if (!x && !y) { if (F.pts.has(1)) await F.stickUp(); return; } await F.stick(Math.atan2(x, y) * 180 / Math.PI, 1); }
    else await pad(raw, { axes: [x, -y, 0, 0] });
  }
  async function tapT(sel) { const ok = await F.tap(sel); if (!ok) note(sel, 'no visible'); return ok; }
  async function padFocusClick(sel) {
    for (const dir of [PAD.DOWN, PAD.UP]) for (let i = 0; i < 18; i++) { if (await raw.evaluate((q) => { const e = document.querySelector(q); return !!e && (document.activeElement === e || e.contains(document.activeElement)); }, sel)) { await padTap(raw, PAD.A); return true; } await padTap(raw, dir); }
    note(sel, 'la cruceta no llega'); return false;
  }
  async function press(k) {
    await ready; const s = await ui();
    if (modo === 'tactil') {
      if (k === 'Space') return s.circle ? tapT('#hit-circle .hc-core') : tapT('#btn-jump');
      if (k === 'KeyE' || k === 'Enter') return s.d2 ? tapT('#d2 .d2-btn.primary') : s.dialog ? tapT('#dialog-ok') : s.action ? tapT('#btn-action') : note(k, 'nada que pulsar');
      if (k === 'KeyQ') return tapT('#btn-board');
      if (k === 'KeyC' || k === 'ShiftLeft') { await tapT('#btn-crouch'); await sleep(250); return tapT('#btn-crouch'); }
      if (k === 'KeyR') return tapT('#btn-cam');
      if (k === 'KeyT') return s.d2skip ? tapT('#d2 .d2-skip') : s.tuto ? tapT('#btn-tuto-skip') : note(k, 'sin saltar visible');
      if (k === 'Escape') return s.cine ? tapT('#btn-cine-skip') : s.settings ? tapT('#btn-settings-close') : s.help ? tapT('#btn-help-close') : s.pause ? tapT('#btn-resume') : tapT('#btn-pause');
      if (DIRK[k] && s.dance) return tapT(`#dance-pad button[data-k="${DIRK[k]}"]`);
      if (DIRK[k]) { held.add(k); await applyMove(); await sleep(120); held.delete(k); return applyMove(); }
      if (/^Digit[1-8]$/.test(k)) { const n = +k.slice(5); await tapT('#btn-dance'); await sleep(300); if (await raw.evaluate(() => !!document.querySelector('#dance-ring .skill-root'))) { await tapT(`#dance-ring .skill-root[data-l="${n <= 4 ? 'dance' : 'graffiti'}"]`); await sleep(250); } return tapT(n <= 4 ? `.dance-opt[data-n="${n}"]` : `.graf-opt[data-g="${n - 4}"]`); }
      if (k === 'KeyB') return tapT('#btn-dance');
      if (k === 'KeyX') return s.dance ? tapT('#dance-exit') : tapT('#graffiti-exit');
      return note(k, 'sin equivalente táctil');
    }
    // mando
    if (k === 'Space') return padTap(raw, PAD.A);
    if (k === 'KeyE' || k === 'Enter') return padTap(raw, s.d2 || s.dialog ? PAD.A : PAD.Y);
    if (k === 'KeyQ') return padTap(raw, PAD.LB);
    if (k === 'KeyC' || k === 'ShiftLeft') return padTap(raw, PAD.B, 300);
    if (k === 'KeyR') return padTap(raw, PAD.R3);
    if (k === 'Escape') return padTap(raw, s.cine ? PAD.B : s.settings || s.help ? PAD.B : PAD.START);
    if (k === 'KeyT') { if (s.d2skip && await raw.evaluate(() => { const b = document.querySelector('#d2 .d2-skip'); b?.focus(); return document.activeElement === b; })) return padTap(raw, PAD.A);
      await padTap(raw, PAD.START); await sleep(500); return padFocusClick('#btn-tuto-skip2'); }
    if (DIRK[k] && s.dance) return padTap(raw, { up: PAD.UP, down: PAD.DOWN, left: PAD.LEFT, right: PAD.RIGHT }[DIRK[k]]);
    if (DIRK[k]) { held.add(k); await applyMove(); await sleep(120); held.delete(k); return applyMove(); }
    if (/^Digit[1-8]$/.test(k)) { const n = +k.slice(5); await padTap(raw, PAD.RB); await sleep(250); await padTap(raw, n <= 4 ? PAD.LEFT : PAD.RIGHT); await sleep(250); return padTap(raw, [PAD.UP, PAD.RIGHT, PAD.DOWN, PAD.LEFT][(n - 1) % 4]); }
    if (k === 'KeyB') return padTap(raw, PAD.RB);
    if (k === 'KeyX') return padTap(raw, PAD.B);
    if (k === 'KeyF') return padTap(raw, PAD.X);
    return note(k, 'sin equivalente en el mando');
  }
  const keyboard = {
    async down(k) { await ready; if (DIRK[k] && !(await ui()).dance) { held.add(k); return applyMove(); }
      if (k === 'KeyC' || k === 'ShiftLeft') { if (modo === 'tactil') { const s = await ui(); if (!s.crouch) await tapT('#btn-crouch'); } else await pad(raw, { buttons: { [PAD.B]: 1 } }); st.crouch = true; return; }
      if (k === 'KeyF' && modo === 'mando') return pad(raw, { buttons: { [PAD.X]: 1 } });
      return press(k); },
    async up(k) { await ready; if (DIRK[k]) { if (held.delete(k)) return applyMove(); return; }
      if (k === 'KeyC' || k === 'ShiftLeft') { if (modo === 'tactil') { const s = await ui(); if (s.crouch) await tapT('#btn-crouch'); } else await pad(raw, { buttons: { [PAD.B]: 0 } }); st.crouch = false; }
      if (k === 'KeyF' && modo === 'mando') await pad(raw, { buttons: { [PAD.X]: 0 } }); },
    async press(k, o = {}) { if (DIRK[k] && !(await ui()).dance) { await keyboard.down(k); await sleep(o.delay ?? 80); return keyboard.up(k); } return press(k); },
    async type(t) { note(t, 'type ignorado'); },
  };
  const mouse = modo === 'tactil' ? {
    async move(x, y, o = {}) { const n = o.steps ?? 1; const x0 = st.mx, y0 = st.my; for (let i = 1; i <= n; i++) { const px = x0 + (x - x0) * i / n, py = y0 + (y - y0) * i / n; if (st.mouseDown) { await F.move(3, px, py); await sleep(8); } } st.mx = x; st.my = y; },
    async down() { await ready; await F.down(3, st.mx, st.my); st.mouseDown = true; },
    async up() { await F.up(3); st.mouseDown = false; },
    async click(x, y) { await raw.touchscreen.tap(x, y); },
  } : { async move(...a) { note('mouse', 'ratón usado con mando (sin equivalente)'); return raw.mouse.move(...a); }, async down(...a) { return raw.mouse.down(...a); }, async up(...a) { return raw.mouse.up(...a); }, async click(...a) { note('mouse', 'clic de ratón con mando'); return raw.mouse.click(...a); } };
  async function click(sel) {
    await ready;
    if (modo === 'tactil') { const ok = await F.tap(sel, 60); if (!ok) throw new Error(`no se puede tocar ${sel} (no visible)`); }
    else { if (sel === '#dialog-ok') await padTap(raw, PAD.A); else if (sel === '#graffiti-exit' || sel === '#dance-exit') await padTap(raw, PAD.B); else if (sel === '#btn-start') { await pad(raw, {}); await padTap(raw, PAD.A); } else await padFocusClick(sel); }
    if (sel === '#btn-start') { await sleep(1200); const s = await ui(); if (s.ios) { if (modo === 'tactil') await F.tap('#btn-ios-no'); else await padFocusClick('#btn-ios-no'); } }
  }
  return new Proxy(raw, { get(t, k) { if (k === 'keyboard') return keyboard; if (k === 'mouse') return mouse; if (k === 'click') return click; if (k === '__raw') return raw; if (k === '__inputLog') return log; const v = t[k]; return typeof v === 'function' ? v.bind(t) : v; } });
}
