// Utilidades comunes de las comprobaciones V3 (Chrome sin interfaz vía puppeteer-core; EMULACIÓN, no móvil físico).
// Regla: las entradas que se presentan como «jugadas» pasan por eventos reales del navegador (teclado, ratón, toques) y
// el bucle RAF del juego. Lo que prepara un escenario (posición inicial, guardado de fixture) se registra como fixture
// en el informe; nunca se usa para ejecutar la condición que se comprueba.
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const HERE = path.dirname(fileURLToPath(import.meta.url));
export const GAME = path.resolve(HERE, '..', '..');
export const CHROME = process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
export const VIEWPORTS = {
  desktop: { width: 1280, height: 800, deviceScaleFactor: 1 },
  phone: { width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
  phoneLand: { width: 844, height: 390, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
  narrow: { width: 360, height: 740, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
};
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
export const argUrl = () => { const a = process.argv; const i = a.indexOf('--url'); return i >= 0 ? a[i + 1] : 'http://127.0.0.1:5190/'; };

/** Informe JSON con evidencias etiquetadas por tipo (static/sim/fixture/input/emulation). */
export class Report {
  constructor(dir, name, meta = {}) {
    this.dir = path.join(GAME, 'captures', 'v3', dir); fs.mkdirSync(this.dir, { recursive: true });
    this.file = path.join(this.dir, `${name}.json`);
    this.data = { name, date: new Date().toISOString(), ...meta, checks: [], fixtures: [], notes: [], errors: [] };
  }
  check(ok, label, kind, extra) { this.data.checks.push({ ok: !!ok, label, kind, ...(extra !== undefined ? { extra } : {}) }); console.log(`${ok ? 'OK   ' : 'FALLO'} [${kind}] ${label}${extra !== undefined ? ' ' + JSON.stringify(extra) : ''}`); this.save(); return ok; }
  fixture(label, detail) { this.data.fixtures.push({ label, detail }); this.save(); }
  note(n) { this.data.notes.push(n); this.save(); }
  save() { fs.writeFileSync(this.file, JSON.stringify(this.data, null, 1)); }
  get failed() { return this.data.checks.filter((c) => !c.ok).length + this.data.errors.length; }
  finish() { this.data.failed = this.failed; this.save(); console.log(this.failed ? `${this.data.name}: ${this.failed} FALLOS` : `${this.data.name}: OK`); return this.failed === 0; }
  shot(page, name) { return page.screenshot({ path: path.join(this.dir, `${name}.png`) }); }
}

export async function launch() {
  return puppeteer.launch({ executablePath: CHROME, headless: true,
    args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required', '--no-first-run'] });
}

/**
 * Abre el juego. `save`: objeto de guardado de fixture (se escribe antes de cargar) o null para partida nueva.
 * Devuelve la página lista en la pantalla de inicio (sin pulsar JUGAR).
 */
export async function openGame(browser, report, { viewport = VIEWPORTS.desktop, url = argUrl(), save = null, query = '', storageBroken = false } = {}) {
  const page = await browser.newPage();
  await page.setViewport(viewport);
  if (viewport.isMobile) await page.setUserAgent('Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1');
  page.on('pageerror', (e) => report.data.errors.push('pageerror ' + String(e?.stack ?? e).split('\n').slice(0, 3).join(' | ')));
  page.on('console', (m) => { if (m.type() === 'error' && !/favicon/.test(m.text())) report.data.errors.push('console ' + m.text()); });
  await page.evaluateOnNewDocument((s, broken) => {
    if (broken) {
      const thrower = () => { throw new DOMException('QuotaExceededError', 'QuotaExceededError'); };
      Object.defineProperty(window, 'localStorage', { get() { return { getItem: () => null, setItem: thrower, removeItem: () => {}, clear: () => {}, key: () => null, length: 0 }; } });
    } else if (!sessionStorage.getItem('__bk_fixture_done')) {
      sessionStorage.setItem('__bk_fixture_done', '1');
      if (s === null) localStorage.removeItem('bellakaventuras.remake.save');
      else if (s !== undefined) localStorage.setItem('bellakaventuras.remake.save', typeof s === 'string' ? s : JSON.stringify(s));
    }
  }, save, storageBroken);
  await page.goto(url + query, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__bk && !document.getElementById('btn-start').disabled, { timeout: 90000 });
  return page;
}

/** Pulsa JUGAR/CONTINUAR con un clic real. */
export async function clickStart(page) {
  await page.click('#btn-start');
  await page.waitForFunction(() => window.__bk.started, { timeout: 5000 });
  await sleep(300);
}

/** Estado observable del jugador (solo lectura). */
export async function snap(page) {
  return page.evaluate(() => {
    const g = window.__bk, s = g.skater;
    return { clock: +g.clock.toFixed(3), mode: g.mode, paused: g.paused, x: +s.footPos.x.toFixed(3), y: +s.footPos.y.toFixed(3), z: +s.footPos.z.toFixed(3),
      speed: +s.speed.toFixed(3), heading: +s.heading.toFixed(3), state: s.state, grounded: s.grounded, crouched: s.isCrouched,
      loco: s.loco ?? null, total: g.state.total };
  });
}

/** Mantiene teclas pulsadas `ms` con muestreo periódico (bucle RAF real del juego). */
export async function holdKeys(page, keys, ms, { every = 100, onSample } = {}) {
  for (const k of keys) await page.keyboard.down(k);
  const t0 = Date.now(), samples = [];
  while (Date.now() - t0 < ms) { const s = await snap(page); samples.push(s); onSample?.(s); await sleep(every); }
  for (const k of keys) await page.keyboard.up(k);
  return samples;
}

/** ¿Qué elemento recibe un toque en el centro de `selector`? (hit testing real del navegador) */
export async function hitTest(page, selector) {
  return page.evaluate((sel) => {
    const el = document.querySelector(sel); if (!el) return { sel, missing: true };
    const r = el.getBoundingClientRect(); const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
    const top = document.elementFromPoint(cx, cy);
    const visible = !el.closest('[hidden]') && r.width > 0 && r.height > 0;
    return { sel, visible, rect: [Math.round(r.left), Math.round(r.top), Math.round(r.width), Math.round(r.height)], topId: top?.id || top?.tagName, receives: top === el || el.contains(top) };
  }, selector);
}

/** Toque real (CDP touch) en el centro de un elemento. */
export async function tapEl(page, selector) {
  const r = await page.evaluate((sel) => { const b = document.querySelector(sel).getBoundingClientRect(); return { x: b.left + b.width / 2, y: b.top + b.height / 2 }; }, selector);
  await page.touchscreen.tap(r.x, r.y);
  return r;
}
