// Harness V4 (V4-BASE-02/03). Contrato de resultado: una prueba solo termina en verde si tiene al menos una comprobación,
// ninguna falla, no hubo errores de página/consola/excepción y no se agotó un tiempo. Cualquier otro caso devuelve un
// código de salida distinto de cero que el runner (run.mjs) registra:
//   0 = verde · 1 = comprobaciones fallidas · 2 = excepción/error · 3 = timeout · 4 = selección vacía/desconocida (sin checks)
// Cada informe es JSON con categoría de evidencia por comprobación: unit (numérica dirigida), fixture (preparación
// explícita), input (entrada normal por eventos reales del navegador), vision (captura/vídeo), listen (escucha),
// human/physical (solo se registran como pendientes; nunca los marca verdes una máquina).
// Herencia V3: tools/v3/lib.mjs se conserva tal cual como histórico; su finish() no fijaba exit code (META-A4-003).
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

export const HERE = path.dirname(fileURLToPath(import.meta.url));
export const GAME = path.resolve(HERE, '..', '..');
export const ROOT = path.resolve(GAME, '..');
export const CHROME = process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
export const VIEWPORTS = {
  desktop: { width: 1280, height: 800, deviceScaleFactor: 1 },
  phone: { width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
  phoneLand: { width: 844, height: 390, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
};
export const KINDS = new Set(['unit', 'fixture', 'input', 'vision', 'listen', 'static', 'emulation']);
export const EXIT = { OK: 0, FAILED: 1, ERROR: 2, TIMEOUT: 3, EMPTY: 4 };
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
export const arg = (name, def = null) => { const a = process.argv; const i = a.indexOf(`--${name}`); return i >= 0 ? a[i + 1] : def; };
export const argUrl = () => arg('url', process.env.BK_URL || 'http://127.0.0.1:5190/');

export class TimeoutError extends Error { constructor(label, ms) { super(`timeout ${ms} ms: ${label}`); this.name = 'TimeoutError'; } }
export class EmptySelectionError extends Error { constructor(label) { super(`selección vacía: ${label}`); this.name = 'EmptySelectionError'; } }

/** Rechaza con TimeoutError si `p` no termina en `ms`. */
export function withTimeout(p, ms, label) {
  let t; const timer = new Promise((_, rej) => { t = setTimeout(() => rej(new TimeoutError(label, ms)), ms); });
  return Promise.race([p, timer]).finally(() => clearTimeout(t));
}

/** Hash del código fuente servido (src + config + index): identifica la versión que se prueba. */
export function buildHash() {
  const files = [];
  const walk = (d) => { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, e.name); if (e.isDirectory()) walk(p); else files.push(p); } };
  walk(path.join(GAME, 'src'));
  files.push(path.join(GAME, 'public', 'game-config.json'), path.join(GAME, 'index.html'));
  files.sort();
  const h = crypto.createHash('sha256');
  for (const f of files) { h.update(path.relative(GAME, f)); h.update(fs.readFileSync(f)); }
  return h.digest('hex').slice(0, 16);
}

export function sha256File(f) { return crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex'); }

/** Informe de una prueba. `dir` relativo a captures/v4. */
export class Report {
  constructor(dir, name, meta = {}) {
    this.dir = path.join(GAME, 'captures', 'v4', dir); fs.mkdirSync(this.dir, { recursive: true });
    this.file = path.join(this.dir, `${name}.json`);
    this.t0 = Date.now();
    this.data = { name, date: new Date().toISOString(), build: buildHash(), cmd: process.argv.slice(1).join(' '), cwd: process.cwd(), url: argUrl(), ...meta,
      status: 'running', exit: null, checks: [], fixtures: [], notes: [], errors: [], pending: [], timeouts: [], empties: [] };
    this.save();
  }
  /** Comprobación con categoría obligatoria. `extra` = datos medidos (se guardan siempre, también en verde). */
  check(ok, label, kind, extra) {
    if (!KINDS.has(kind)) throw new Error(`categoría de evidencia desconocida: ${kind}`);
    this.data.checks.push({ ok: !!ok, label, kind, ...(extra !== undefined ? { extra } : {}) });
    console.log(`${ok ? 'OK   ' : 'FALLO'} [${kind}] ${label}${extra !== undefined ? ' ' + JSON.stringify(extra).slice(0, 400) : ''}`);
    this.save(); return !!ok;
  }
  /** Una lista que debe tener elementos: vacía = error inequívoco (no un verde por no comprobar nada). */
  nonEmpty(list, label) {
    if (!Array.isArray(list) || list.length === 0) { this.data.empties.push(label); console.log(`VACÍO ${label}`); this.save(); return false; }
    return true;
  }
  fixture(label, detail) { this.data.fixtures.push({ label, detail }); console.log(`FIXT  ${label}`); this.save(); }
  note(n) { this.data.notes.push(n); this.save(); }
  /** Lo que una máquina no puede cerrar (escucha humana, dispositivo físico, aprobación artística). Nunca cuenta como verde. */
  pendingHuman(label) { this.data.pending.push(label); this.save(); }
  error(e) {
    const msg = String(e?.stack ?? e).split('\n').slice(0, 4).join(' | ');
    if (e instanceof TimeoutError || e?.name === 'TimeoutError') this.data.timeouts.push(msg); else this.data.errors.push(msg);
    console.log(`ERROR ${msg}`); this.save();
  }
  save() { fs.writeFileSync(this.file, JSON.stringify(this.data, null, 1)); }
  get failed() { return this.data.checks.filter((c) => !c.ok).length; }
  /** Decide el código de salida (y lo fija en process.exitCode). No imprime «OK» si no hubo comprobaciones. */
  finish() {
    const d = this.data;
    let exit = EXIT.OK;
    if (d.empties.length || d.checks.length === 0) exit = EXIT.EMPTY;
    if (this.failed) exit = EXIT.FAILED;
    if (d.errors.length) exit = EXIT.ERROR;
    if (d.timeouts.length) exit = EXIT.TIMEOUT;
    d.exit = exit; d.status = ['verde', 'fallos', 'error', 'timeout', 'vacio'][exit];
    d.durationMs = Date.now() - this.t0;
    d.summary = { checks: d.checks.length, failed: this.failed, errors: d.errors.length, timeouts: d.timeouts.length, fixtures: d.fixtures.length, pending: d.pending.length };
    this.save();
    console.log(`${d.name}: ${d.status.toUpperCase()} (exit ${exit}) checks=${d.checks.length} fallos=${this.failed} errores=${d.errors.length} timeouts=${d.timeouts.length}${d.pending.length ? ` pendientes-humanos=${d.pending.length}` : ''}`);
    process.exitCode = exit;
    return exit;
  }
  shot(page, name) { const f = path.join(this.dir, `${name}.png`); return page.screenshot({ path: f }).then(() => f); }
}

/** Envoltorio estándar de prueba: excepción → error registrado; timeout global → TIMEOUT; siempre fija exit code. */
export async function runTest(R, fn, { timeoutMs = 240000 } = {}) {
  try { await withTimeout(Promise.resolve().then(fn), timeoutMs, `${R.data.name} (global)`); }
  catch (e) { R.error(e); }
  finally { R.finish(); }
}

export async function launch() {
  return puppeteer.launch({ executablePath: CHROME, headless: true,
    args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required', '--no-first-run'] });
}

/**
 * Abre el juego. `save`: null = partida nueva (borra el guardado del perfil de prueba), objeto = fixture declarada.
 * Página lista en la pantalla de inicio. Errores de página y consola entran como errores del informe.
 */
export async function openGame(browser, R, { viewport = VIEWPORTS.desktop, url = argUrl(), save = null, query = '' } = {}) {
  const page = await browser.newPage();
  await page.setViewport(viewport);
  page.on('pageerror', (e) => R.error(new Error('pageerror ' + String(e?.message ?? e))));
  page.on('console', (m) => { if (m.type() === 'error' && !/favicon/.test(m.text())) R.error(new Error('console ' + m.text())); });
  if (save !== null && save !== undefined) R.fixture('guardado de partida preparado', typeof save === 'string' ? save.slice(0, 200) : { total: save.collected?.length, keys: Object.keys(save) });
  await page.evaluateOnNewDocument((s) => {
    if (!sessionStorage.getItem('__bk_fixture_done')) {
      sessionStorage.setItem('__bk_fixture_done', '1');
      if (s === null) localStorage.removeItem('bellakaventuras.remake.save');
      else if (s !== undefined) localStorage.setItem('bellakaventuras.remake.save', typeof s === 'string' ? s : JSON.stringify(s));
    }
  }, save);
  await withTimeout(page.goto(url + query, { waitUntil: 'load' }), 60000, 'carga de página');
  await withTimeout(page.waitForFunction(() => window.__bk && !document.getElementById('btn-start').disabled, { timeout: 90000 }), 95000, 'juego listo');
  return page;
}

export async function clickStart(page) {
  await page.click('#btn-start');
  await page.waitForFunction(() => window.__bk.started, { timeout: 5000 });
  await sleep(300);
}

/** Captura de REVISIÓN desde una cámara fija (no un recorrido): oculta HUD/táctil solo para la toma y comprueba que
 *  se ve el mundo (pantalla de inicio oculta y una imagen no uniforme). Devuelve la ruta o lanza si no se ve nada. */
export async function reviewShot(page, R, name, pos, target, hfov = 70) {
  const ok = await page.evaluate((pos, target, hfov) => {
    const g = window.__bk, T = window.__bkTHREE;
    if (!g.started || !document.getElementById('start').hidden) return { err: 'pantalla de inicio visible' };
    for (const id of ['hud', 'touch']) document.getElementById(id).style.visibility = 'hidden';
    g.rig.toFixed({ pos: new T.Vector3(...pos), target: new T.Vector3(...target), hfov }, true); g.rig.update(0.016, g.skater, null);
    return { err: null };
  }, pos, target, hfov);
  if (ok.err) throw new Error(`captura ${name}: ${ok.err}`);
  await sleep(350);
  // medir en la MISMA tarea en que se dibuja (el lienzo WebGL no conserva el búfer)
  const stats = await page.evaluate(() => {
    const g = window.__bk; g.rig.update(0.016, g.skater, null); g.render();
    const c = document.getElementById('game'), w = 64, h = 40, t = document.createElement('canvas'); t.width = w; t.height = h;
    const x = t.getContext('2d'); x.drawImage(c, 0, 0, w, h); const d = x.getImageData(0, 0, w, h).data;
    let s = 0, s2 = 0; for (let i = 0; i < d.length; i += 4) { const l = (d[i] + d[i + 1] + d[i + 2]) / 3; s += l; s2 += l * l; } const n = d.length / 4;
    return { mean: s / n, sd: Math.sqrt(Math.max(0, s2 / n - (s / n) ** 2)) };
  });
  const file = await R.shot(page, name);
  await page.evaluate(() => { for (const id of ['hud', 'touch']) document.getElementById(id).style.visibility = ''; });
  if (stats.sd < 6) throw new Error(`captura ${name}: imagen casi uniforme (sd ${stats.sd.toFixed(1)})`);
  return { file, ...stats };
}

/** Captura con cámara DIRECTA (sin el rig: su modo fijo evita sólidos y desplaza la cámara). Renderiza y lee el lienzo
 *  en la misma tarea; HUD oculto; falla si la imagen es casi uniforme. Para revisión visual (pares), no para jugabilidad. */
export async function directShot(page, R, name, pos, target, hfov = 60) {
  const r = await page.evaluate((pos, target, hfov) => {
    const g = window.__bk, T = window.__bkTHREE, cam = g.rig.cam;
    if (!g.started || !document.getElementById('start').hidden) return { err: 'pantalla de inicio visible' };
    const fov0 = cam.fov; cam.position.set(...pos); cam.lookAt(new T.Vector3(...target));
    cam.fov = 2 * Math.atan(Math.tan(hfov * Math.PI / 360) / cam.aspect) * 180 / Math.PI; cam.updateProjectionMatrix(); cam.updateMatrixWorld();
    g.render(); const url = document.getElementById('game').toDataURL('image/png');
    const c = document.getElementById('game'), t = document.createElement('canvas'); t.width = 64; t.height = 40; const x = t.getContext('2d'); x.drawImage(c, 0, 0, 64, 40); const d = x.getImageData(0, 0, 64, 40).data;
    let s = 0, s2 = 0; for (let i = 0; i < d.length; i += 4) { const l = (d[i] + d[i + 1] + d[i + 2]) / 3; s += l; s2 += l * l; } const n = d.length / 4;
    cam.fov = fov0; cam.updateProjectionMatrix();
    return { err: null, url, sd: Math.sqrt(Math.max(0, s2 / n - (s / n) ** 2)) };
  }, pos, target, hfov);
  if (r.err) throw new Error(`captura ${name}: ${r.err}`);
  const file = path.join(R.dir, `${name}.png`); fs.writeFileSync(file, Buffer.from(r.url.split(',')[1], 'base64'));
  if (r.sd < 6) throw new Error(`captura ${name}: imagen casi uniforme (sd ${r.sd.toFixed(1)})`);
  return { file, sd: r.sd };
}

/** Estado observable del jugador (solo lectura). */
export async function snap(page) {
  return page.evaluate(() => {
    const g = window.__bk, s = g.skater;
    return { clock: +g.clock.toFixed(3), mode: g.mode, paused: g.paused, x: +s.footPos.x.toFixed(3), y: +s.footPos.y.toFixed(3), z: +s.footPos.z.toFixed(3),
      vx: +s.vel.x.toFixed(3), vz: +s.vel.z.toFixed(3), vy: +s.vy.toFixed(3), speed: +s.speed.toFixed(3), heading: +s.heading.toFixed(4), facing: +(s.facing ?? s.heading).toFixed(4),
      vLong: +(s.vLong ?? s.speed).toFixed(3), state: s.state, loco: s.loco, grounded: s.grounded, crouched: s.isCrouched, fakie: s.fakie, total: g.state.total,
      camYaw: +g.rig.yaw.toFixed(4) };
  });
}

/** Mantiene teclas `ms` con muestreo periódico (bucle RAF real). */
export async function holdKeys(page, keys, ms, { every = 100, onSample } = {}) {
  for (const k of keys) await page.keyboard.down(k);
  const t0 = Date.now(), samples = [];
  try { while (Date.now() - t0 < ms) { const s = await snap(page); samples.push(s); onSample?.(s); await sleep(every); } }
  finally { for (const k of keys) await page.keyboard.up(k); }
  return samples;
}

/** Elemento DOM que debe existir: si no, error de selección (no se ignora). */
export async function mustSelect(page, R, selector) {
  const ok = await page.$(selector);
  if (!ok) { R.data.empties.push(selector); console.log(`VACÍO selector ${selector}`); R.save(); return null; }
  return ok;
}
