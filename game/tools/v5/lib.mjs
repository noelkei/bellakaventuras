// Arnés V5 (T5-00, DT-36). Hereda el contrato de resultado de tools/v4/lib.mjs (exit ≠ 0 real; categorías de evidencia)
// y añade lo que V5 necesita:
//  · identidad de la build SERVIDA (sha del bundle que entrega el servidor, no el de src) → cada informe dice contra qué
//    build se midió (A = copia de dist-v4 en V5/baseline_A, dev = src en caliente, v5 = game/dist-v5);
//  · informes en V5/evidencias/<tarea>/ (no en game/captures);
//  · perfil temporal de Chrome por ejecución (puppeteer crea y borra su userDataDir: nunca el perfil del usuario);
//  · grabador por RAF y lectura de skater.trace (paso fijo) para medidas de ápice, rumbo y velocidad;
//  · `fixture()` declara y ejecuta toda preparación en página (teleport, guardado, mutaciones de prueba).
// Exit: 0 verde · 1 fallos · 2 error · 3 timeout · 4 vacío. Un intento que no llega al estado pedido se registra con
// `invalid()` (no es fallo del juego ni éxito) y, si deja la prueba sin datos válidos, termina en VACÍO.
// Uso típico: node game/tools/v5/<prueba>.mjs --url http://127.0.0.1:5197/ --task T5-00 [--label A]
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

export const HERE = path.dirname(fileURLToPath(import.meta.url));
export const GAME = path.resolve(HERE, '..', '..');
export const ROOT = path.resolve(GAME, '..');
export const EVID = path.join(ROOT, 'V5', 'evidencias');
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
export const flag = (name) => process.argv.includes(`--${name}`);
export const URLS = { A: 'http://127.0.0.1:5197/', dev: 'http://127.0.0.1:5198/', v5: 'http://127.0.0.1:5199/' };
export const argUrl = () => { const u = arg('url', process.env.BK_URL || 'v5'); return URLS[u] ?? u; };
export const median = (a) => { const s = [...a].sort((x, y) => x - y); const n = s.length; return n ? (n % 2 ? s[n >> 1] : (s[n / 2 - 1] + s[n / 2]) / 2) : NaN; };
export const r3 = (x) => (x == null || !Number.isFinite(x) ? x : +x.toFixed(3));
export const deg = (rad) => +(rad * 180 / Math.PI).toFixed(1);
export const wrapDeg = (d) => ((((d + 180) % 360) + 360) % 360) - 180;

export class TimeoutError extends Error { constructor(label, ms) { super(`timeout ${ms} ms: ${label}`); this.name = 'TimeoutError'; } }
export function withTimeout(p, ms, label) {
  let t; const timer = new Promise((_, rej) => { t = setTimeout(() => rej(new TimeoutError(label, ms)), ms); });
  return Promise.race([p, timer]).finally(() => clearTimeout(t));
}

/** Hash del árbol src (identifica el código fuente presente en disco, útil para dev). */
export function srcHash() {
  const files = [];
  const walk = (d) => { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, e.name); if (e.isDirectory()) walk(p); else files.push(p); } };
  walk(path.join(GAME, 'src')); files.sort();
  const h = crypto.createHash('sha256');
  for (const f of files) { h.update(path.relative(GAME, f)); h.update(fs.readFileSync(f)); }
  return h.digest('hex').slice(0, 16);
}

/** Identidad de lo que SIRVE el servidor: index.html + bundle principal (build) o src (dev, módulos sueltos). */
export async function servedIdentity(url) {
  try {
    const html = await (await fetch(url)).text();
    const m = html.match(/src="\.?\/?(build\/bootstrap-[^"]+\.js)"/) || html.match(/src="\.?\/?(build\/index-[^"]+\.js)"/);
    const idx = crypto.createHash('sha256').update(html).digest('hex').slice(0, 16);
    if (m) {
      const js = Buffer.from(await (await fetch(new URL(m[1], url))).arrayBuffer());
      // el bundle grande puede no ser el de entrada: se busca también el import del bootstrap
      let boot = null; const mm = js.toString('utf8', 0, 4000).match(/bootstrap-[\w-]+\.js/);
      if (mm) { const b = Buffer.from(await (await fetch(new URL('build/' + mm[0], url))).arrayBuffer()); boot = { file: mm[0], sha16: crypto.createHash('sha256').update(b).digest('hex').slice(0, 16), bytes: b.length }; }
      return { kind: 'build', url, index16: idx, entry: m[1], entrySha16: crypto.createHash('sha256').update(js).digest('hex').slice(0, 16), bootstrap: boot };
    }
    return { kind: 'dev', url, index16: idx, src16: srcHash() };
  } catch (e) { return { kind: 'desconocida', url, error: String(e) }; }
}

/** Informe de una prueba V5. `task` = carpeta de evidencias (p. ej. 'T5-04'); `label` distingue A/V5/variantes. */
export class Report {
  constructor(name, { task = arg('task', 'T5-XX'), label = arg('label', ''), meta = {} } = {}) {
    this.dir = path.join(EVID, task, 'runs'); fs.mkdirSync(this.dir, { recursive: true });
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    this.base = `${name}${label ? '_' + label : ''}_${stamp}`;
    this.file = path.join(this.dir, `${this.base}.json`);
    this.t0 = Date.now();
    this.data = { name, task, label, date: new Date().toISOString(), cmd: process.argv.slice(1).join(' '), url: argUrl(), identity: null, chrome: null, ...meta,
      status: 'running', exit: null, checks: [], fixtures: [], invalid: [], measures: {}, notes: [], errors: [], pending: [], timeouts: [], empties: [] };
    this.save();
  }
  async identify() { this.data.identity = await servedIdentity(this.data.url); this.save(); return this.data.identity; }
  check(ok, label, kind, extra) {
    if (!KINDS.has(kind)) throw new Error(`categoría de evidencia desconocida: ${kind}`);
    this.data.checks.push({ ok: !!ok, label, kind, ...(extra !== undefined ? { extra } : {}) });
    console.log(`${ok ? 'OK   ' : 'FALLO'} [${kind}] ${label}${extra !== undefined ? ' ' + JSON.stringify(extra).slice(0, 500) : ''}`);
    this.save(); return !!ok;
  }
  /** Medida bruta con nombre (siempre se guarda, pase o no). */
  measure(key, value) { this.data.measures[key] = value; this.save(); return value; }
  fixture(label, detail) { this.data.fixtures.push({ label, detail }); console.log(`FIXT  ${label}`); this.save(); }
  /** Intento de la sonda que no llegó al estado pedido: ni fallo del juego ni éxito. */
  invalid(label, detail) { this.data.invalid.push({ label, detail }); console.log(`INVÁL ${label} ${detail ? JSON.stringify(detail).slice(0, 300) : ''}`); this.save(); }
  nonEmpty(list, label) { if (!Array.isArray(list) || list.length === 0) { this.data.empties.push(label); console.log(`VACÍO ${label}`); this.save(); return false; } return true; }
  note(n) { this.data.notes.push(n); console.log('NOTA ', typeof n === 'string' ? n : JSON.stringify(n).slice(0, 400)); this.save(); }
  pendingHuman(label) { this.data.pending.push(label); this.save(); }
  error(e) {
    const msg = String(e?.stack ?? e).split('\n').slice(0, 5).join(' | ');
    if (e instanceof TimeoutError || e?.name === 'TimeoutError') this.data.timeouts.push(msg); else this.data.errors.push(msg);
    console.log(`ERROR ${msg}`); this.save();
  }
  save() { fs.writeFileSync(this.file, JSON.stringify(this.data, null, 1)); }
  get failed() { return this.data.checks.filter((c) => !c.ok).length; }
  finish() {
    const d = this.data; let exit = EXIT.OK;
    if (d.empties.length || d.checks.length === 0) exit = EXIT.EMPTY;
    if (this.failed) exit = EXIT.FAILED;
    if (d.errors.length) exit = EXIT.ERROR;
    if (d.timeouts.length) exit = EXIT.TIMEOUT;
    d.exit = exit; d.status = ['verde', 'fallos', 'error', 'timeout', 'vacio'][exit];
    d.durationMs = Date.now() - this.t0;
    d.summary = { checks: d.checks.length, failed: this.failed, invalid: d.invalid.length, errors: d.errors.length, timeouts: d.timeouts.length, fixtures: d.fixtures.length, pending: d.pending.length };
    this.save();
    console.log(`${d.name}: ${d.status.toUpperCase()} (exit ${exit}) checks=${d.checks.length} fallos=${this.failed} inválidos=${d.invalid.length} errores=${d.errors.length} → ${path.relative(ROOT, this.file)}`);
    process.exitCode = exit; return exit;
  }
  file_(name) { return path.join(this.dir, `${this.base}_${name}`); }
  shot(page, name) { const f = this.file_(`${name}.png`); return page.screenshot({ path: f }).then(() => f); }
}

export async function runTest(R, fn, { timeoutMs = 300000 } = {}) {
  try { await R.identify(); await withTimeout(Promise.resolve().then(fn), timeoutMs, `${R.data.name} (global)`); }
  catch (e) { R.error(e); }
  finally { R.finish(); }
}

export async function launch(extra = []) {
  return puppeteer.launch({ executablePath: CHROME, headless: true,
    args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required', '--no-first-run', ...extra] });
}

/** Abre el juego (perfil temporal). `save`: null = partida nueva; objeto/cadena = guardado declarado (fixture). */
export async function openGame(browser, R, { viewport = VIEWPORTS.desktop, url = argUrl(), save = null, query = '?bktest=1' } = {}) {
  const page = await browser.newPage();
  await page.setViewport(viewport);
  R.data.chrome = await browser.version(); R.data.viewport = viewport; R.save();
  page.on('pageerror', (e) => R.error(new Error('pageerror ' + String(e?.message ?? e))));
  page.on('console', (m) => { if (m.type() === 'error' && !/favicon|Failed to load resource/.test(m.text())) R.error(new Error('console ' + m.text())); });
  if (save) R.fixture('guardado de partida preparado', typeof save === 'string' ? save.slice(0, 200) : { total: save.collected?.length, keys: Object.keys(save) });
  await page.evaluateOnNewDocument((s) => {
    if (!sessionStorage.getItem('__bk5_fixture_done')) {
      sessionStorage.setItem('__bk5_fixture_done', '1');
      if (s === null) localStorage.removeItem('bellakaventuras.remake.save');
      else if (s !== undefined) localStorage.setItem('bellakaventuras.remake.save', typeof s === 'string' ? s : JSON.stringify(s));
    }
  }, save);
  await withTimeout(page.goto(url + query, { waitUntil: 'load' }), 60000, 'carga de página');
  await withTimeout(page.waitForFunction(() => window.__bk && !document.getElementById('btn-start').disabled, { timeout: 120000 }), 125000, 'juego listo');
  return page;
}
export async function clickStart(page) {
  await page.click('#btn-start');
  await page.waitForFunction(() => window.__bk.started, { timeout: 8000 });
  await sleep(400);
}

/** Fixture declarada: ejecuta `fn(args)` en la página y lo registra con su resultado. */
export async function fixture(page, R, label, fn, ...args) {
  const out = await page.evaluate(fn, ...args);
  R.fixture(label, out ?? args);
  return out;
}

/** Coloca a ANMI (fixture): posición, rumbo y loco; suelta entradas y recoloca la cámara detrás. */
export async function place(page, R, p, heading, loco = 'walk', label = '') {
  return fixture(page, R, `teleport ${label} (${p.join(',')}) rumbo ${heading.toFixed(3)} ${loco}`, (p, h, l) => {
    const g = window.__bk, T = window.__bkTHREE; g.input.clear();
    g.skater.teleport(new T.Vector3(p[0], p[1] ?? 0, p[2]), h, l); g.rig.snapBehind(g.skater); g.skater.trace.length = 0;
    return { ok: true };
  }, p, heading, loco);
}

/** Estado observable del jugador (solo lectura). */
export async function snap(page) {
  return page.evaluate(() => {
    const g = window.__bk, s = g.skater;
    return { clock: +g.clock.toFixed(3), mode: g.mode, paused: g.paused, x: +s.footPos.x.toFixed(3), y: +s.footPos.y.toFixed(3), z: +s.footPos.z.toFixed(3),
      vx: +s.vel.x.toFixed(3), vz: +s.vel.z.toFixed(3), vy: +s.vy.toFixed(3), hv: +Math.hypot(s.vel.x, s.vel.z).toFixed(3), vLong: +s.vLong.toFixed(3),
      heading: +s.heading.toFixed(4), state: s.state, loco: s.loco, grounded: s.grounded, crouched: s.isCrouched, phase: s.impactPhase, total: g.state.total, camYaw: +g.rig.yaw.toFixed(4) };
  });
}

/** Grabador por RAF (presentación): una fila por fotograma de render con el estado físico. */
export async function recStart(page) {
  await page.evaluate(() => {
    if (!window.__rec5) {
      window.__rec5 = { on: false, rows: [] };
      const loop = () => {
        const r = window.__rec5, g = window.__bk, s = g?.skater;
        if (r.on && s) r.rows.push({ t: +performance.now().toFixed(1), clock: +g.clock.toFixed(3), x: +s.footPos.x.toFixed(3), y: +s.footPos.y.toFixed(3), z: +s.footPos.z.toFixed(3),
          vx: +s.vel.x.toFixed(3), vz: +s.vel.z.toFixed(3), vy: +s.vy.toFixed(3), h: +s.heading.toFixed(4), vl: +s.vLong.toFixed(3), g: s.grounded ? 1 : 0, st: s.state, loco: s.loco,
          ph: s.impactPhase, tr: s.trick ? s.trick.kind : null, air: +s.airTime.toFixed(3) });
        requestAnimationFrame(loop);
      };
      requestAnimationFrame(loop);
    }
    window.__rec5.rows = []; window.__rec5.on = true;
  });
}
export async function recStop(page) { return page.evaluate(() => { window.__rec5.on = false; return window.__rec5.rows; }); }
/** Traza por paso fijo (skater.trace: anillo de 600 pasos = 10 s). */
export async function traceRead(page, clear = false) { return page.evaluate((c) => { const t = window.__bk.skater.trace.slice(); if (c) window.__bk.skater.trace.length = 0; return t; }, clear); }

/** Mantiene teclas `ms` con muestreo periódico (bucle RAF real). */
export async function holdKeys(page, keys, ms, { every = 100, onSample } = {}) {
  for (const k of keys) await page.keyboard.down(k);
  const t0 = Date.now(), samples = [];
  try { while (Date.now() - t0 < ms) { const s = await snap(page); samples.push(s); await onSample?.(s); await sleep(every); } }
  finally { for (const k of keys) await page.keyboard.up(k); }
  return samples;
}

/** Guardado 20/20 (fixture declarada) con la revelación vista: coches activos. */
export const ZONES = ['no_me_guillo', 'nosvamosdeaqui', 'yinyang', 'tratratra', 'fashion_girl'];
export const SAVE_20 = { version: 4, collected: ZONES.flatMap((z) => ['visible', 'medium', 'hidden', 'activity'].map((k) => `${z}.${k}`)), activities: { pantherTalk: true, skateTutorial: true, graffiti: true, bridgeTalk: true, danceCombo: true },
  bridgeReached: true, finalDone: false, finalProof: null, revealSeen: true, checkpoint: null, checkpointRevision: 4, partials: { tutorialStep: 0, tutorialStarted: false, bridgeRest: 4, graffitiMask: null, graffitiCheck: 0, danceRounds: 0 }, hints: ['basic'], settings: {} };

/** Escribe un resumen legible junto al JSON. */
export function writeMd(R, md) { const f = R.file_('resumen.md'); fs.writeFileSync(f, md); return f; }

// ---------------------------------------------------------------------------------------------- medidas A (baseline V4)
/** SHA16 del bootstrap de la baseline A (copia de dist-v4); solo una ejecución contra esta build puede fijar medidas A. */
export const A_BOOT16 = '4d997393f6357371';
export const A_FILE = path.join(EVID, 'T5-00', 'A_medidas.json');
export function isA(R) { return R.data.identity?.bootstrap?.sha16 === A_BOOT16; }
export function baselineAll() { try { return JSON.parse(fs.readFileSync(A_FILE, 'utf8')); } catch { return {}; } }
export function baselineGet(key) { return baselineAll()[key]?.value; }
/** Guarda una medida A (solo si la build servida ES la A; si no, no hace nada y lo anota). */
export function baselineSet(R, key, value, how) {
  if (!isA(R)) { R.note(`medida A «${key}» no guardada: la build servida no es la A`); return false; }
  const all = baselineAll(); all[key] = { value, how, run: path.relative(ROOT, R.file), date: new Date().toISOString(), identity: R.data.identity?.bootstrap };
  fs.mkdirSync(path.dirname(A_FILE), { recursive: true }); fs.writeFileSync(A_FILE, JSON.stringify(all, null, 1)); R.note(`medida A «${key}» guardada`);
  return true;
}

/** Caras laterales de colliders caja con nombre en `names`, con suelo llano y cápsula libre a lo largo de `runway` m
 *  delante de la cara (para acercamientos con carrerilla). Devuelve {name, top, n:[x,z], face:[x,z], width, runwayOk}. */
export async function findFaces(page, names, { runway = 2, minWidth = 0.8, minTop = 0, maxPer = 1 } = {}) {
  return page.evaluate((names, runway, minWidth, minTop, maxPer) => {
    const g = window.__bk, P = g.park, RA = window.__bkRapier, out = [], cnt = {};
    const cap = new RA.Capsule(0.6, 0.34);
    g.world.forEachCollider((c) => {
      if (c.isSensor()) return; const nm = P.colliderName(c.handle); if (!names.includes(nm) || !c.shape.halfExtents) return;
      const t = c.translation(), q = c.rotation(), h = c.shape.halfExtents, yaw = 2 * Math.atan2(q.y, q.w), top = t.y + h.y;
      if (top < minTop) return;
      for (const [lx, lz, d] of [[1, 0, h.x], [-1, 0, h.x], [0, 1, h.z], [0, -1, h.z]]) {
        if ((cnt[nm] || 0) >= maxPer) return;
        const nx = lx * Math.cos(yaw) + lz * Math.sin(yaw), nz = -lx * Math.sin(yaw) + lz * Math.cos(yaw);
        const face = [t.x + nx * d, t.z + nz * d], width = 2 * (lx ? h.z : h.x);
        if (width < minWidth) continue;
        let ok = true;
        for (let k = 0.6; k <= runway; k += 0.5) {
          const x = face[0] + nx * k, z = face[1] + nz * k;
          if (Math.abs(x) > 51 || Math.abs(z) > 51) { ok = false; break; }
          const hit = g.world.castRay(new RA.Ray({ x, y: 2, z }, { x: 0, y: -1, z: 0 }), 3, true, RA.QueryFilterFlags.EXCLUDE_SENSORS);
          if (!hit || Math.abs(2 - hit.timeOfImpact) > 0.03) { ok = false; break; }
          if (g.world.intersectionWithShape({ x, y: 0.98, z }, { x: 0, y: 0, z: 0, w: 1 }, cap, RA.QueryFilterFlags.EXCLUDE_SENSORS)) { ok = false; break; }
        }
        if (ok) { cnt[nm] = (cnt[nm] || 0) + 1; out.push({ name: nm, top: +top.toFixed(3), n: [+nx.toFixed(4), +nz.toFixed(4)], face: [+face[0].toFixed(3), +face[1].toFixed(3)], width: +width.toFixed(2) }); }
      }
    });
    return out;
  }, names, runway, minWidth, minTop, maxPer);
}

// ---------------------------------------------------------------------------------------------- vídeo (screencast CDP)
/** Graba fotogramas JPEG del lienzo visible por CDP (Page.startScreencast) durante el bloque `fn`. Devuelve la carpeta.
 *  Después `node`→`python3 game/tools/v5/frames2webp.py <carpeta>` monta un WebP animado y una hoja de contacto. No hay
 *  ffmpeg en la máquina: el «vídeo» es un WebP animado con las marcas de tiempo reales de cada fotograma. */
export async function recordClip(page, R, name, fn, { quality = 70, maxWidth = 960, everyNthFrame = 1 } = {}) {
  const dir = R.file_('clip_' + name); fs.mkdirSync(dir, { recursive: true });
  const cdp = await page.createCDPSession();
  const frames = [];
  cdp.on('Page.screencastFrame', async (e) => {
    frames.push({ t: e.metadata.timestamp, data: e.data });
    try { await cdp.send('Page.screencastFrameAck', { sessionId: e.sessionId }); } catch { /* */ }
  });
  await cdp.send('Page.startScreencast', { format: 'jpeg', quality, maxWidth, everyNthFrame });
  try { await fn(); } finally { await cdp.send('Page.stopScreencast').catch(() => {}); await sleep(150); }
  const t0 = frames[0]?.t ?? 0;
  frames.forEach((f, i) => fs.writeFileSync(path.join(dir, `f${String(i).padStart(4, '0')}_${Math.round((f.t - t0) * 1000)}ms.jpg`), Buffer.from(f.data, 'base64')));
  fs.writeFileSync(path.join(dir, 'index.json'), JSON.stringify({ name, frames: frames.length, durationS: frames.length ? +(frames.at(-1).t - t0).toFixed(3) : 0 }, null, 1));
  R.note(`clip ${name}: ${frames.length} fotogramas en ${path.relative(ROOT, dir)}`);
  return dir;
}

/** Captura con cámara DIRECTA (sin rig): renderiza y lee el lienzo en la misma tarea; HUD oculto; falla si la imagen es
 *  casi uniforme. Para revisión visual (pares), no para jugabilidad. `debugCols`: superpone colliders en alambre rojo. */
export async function directShot(page, R, name, pos, target, hfov = 60, { debugCols = false } = {}) {
  const r = await page.evaluate((pos, target, hfov, debugCols) => {
    const g = window.__bk, T = window.__bkTHREE, cam = g.rig.cam;
    for (const id of ['hud', 'touch']) { const e = document.getElementById(id); if (e) e.style.visibility = 'hidden'; }
    let dbg = null;
    if (debugCols) {
      const { vertices } = g.world.debugRender(); const geo = new T.BufferGeometry(); geo.setAttribute('position', new T.Float32BufferAttribute(vertices, 3));
      dbg = new T.LineSegments(geo, new T.LineBasicMaterial({ color: 0xff0033, depthTest: false })); dbg.renderOrder = 999; g.scene.add(dbg);
    }
    const fov0 = cam.fov; cam.position.set(...pos); cam.lookAt(new T.Vector3(...target));
    cam.fov = 2 * Math.atan(Math.tan(hfov * Math.PI / 360) / cam.aspect) * 180 / Math.PI; cam.updateProjectionMatrix(); cam.updateMatrixWorld();
    g.renderer.render(g.scene, cam); const url = document.getElementById('game').toDataURL('image/png');
    if (dbg) { g.scene.remove(dbg); dbg.geometry.dispose(); }
    cam.fov = fov0; cam.updateProjectionMatrix();
    for (const id of ['hud', 'touch']) { const e = document.getElementById(id); if (e) e.style.visibility = ''; }
    return { url };
  }, pos, target, hfov, debugCols);
  const file = R.file_(`${name}.png`); fs.writeFileSync(file, Buffer.from(r.url.split(',')[1], 'base64'));
  return file;
}
