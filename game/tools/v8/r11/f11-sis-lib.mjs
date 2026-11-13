// R11 · F11 · copia de la sonda de la auditoría AUD-JUG/SIS/sis-lib.mjs (mismas comprobaciones; solo cambian las rutas de import).
// AUD-JUG/SIS · utilidades propias del frente (solo lectura del juego; no toca game/).
import { withTimeout, argUrl, VIEWPORTS, sleep } from '../lib.mjs';
export const KEY = 'bellakaventuras.remake.save';

/** Abre el juego con perfil del navegador dado. `save`: undefined = no tocar, null = borrar, objeto/cadena = escribir.
 *  `init`: función que se inyecta ANTES de cualquier script de la página (p. ej. simular almacenamiento lleno).
 *  Registra errores de consola, pageerror, peticiones fallidas y respuestas >= 400 en `page.__errs`. */
export async function openSis(browser, R, { viewport = VIEWPORTS.desktop, save, init = null, initArg = null, query = '?bktest=1&narr=off', label = '' } = {}) {
  const page = await browser.newPage();
  await page.setViewport(viewport);
  const errs = []; page.__errs = errs;
  page.on('pageerror', (e) => errs.push({ k: 'pageerror', t: String(e?.message ?? e).slice(0, 300) }));
  page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errs.push({ k: 'console.' + m.type(), t: m.text().slice(0, 300) }); });
  page.on('requestfailed', (r) => errs.push({ k: 'requestfailed', t: r.url() + ' ' + (r.failure()?.errorText ?? '') }));
  page.on('response', (r) => { if (r.status() >= 400) errs.push({ k: 'http' + r.status(), t: r.url() }); });
  await page.evaluateOnNewDocument((s, key) => {
    if (!sessionStorage.getItem('__sis_fixture_done')) {
      sessionStorage.setItem('__sis_fixture_done', '1');
      if (s === null) localStorage.removeItem(key);
      else if (s !== undefined && s !== '__keep__') localStorage.setItem(key, typeof s === 'string' ? s : JSON.stringify(s));
    }
  }, save === undefined ? '__keep__' : save, KEY);
  if (init) await page.evaluateOnNewDocument(init, initArg);
  if (save !== undefined && R) R.fixture(`guardado preparado ${label}`, typeof save === 'string' ? save.slice(0, 160) : save === null ? null : { total: save.collected?.length, version: save.version });
  await withTimeout(page.goto(argUrl() + query, { waitUntil: 'load' }), 60000, 'carga');
  await withTimeout(page.waitForFunction(() => window.__bk && !document.getElementById('btn-start').disabled, { timeout: 120000 }), 125000, 'listo');
  return page;
}
export async function start(page) {
  await page.click('#btn-start');
  await page.waitForFunction(() => window.__bk.started, { timeout: 8000 });
  await sleep(300);
}
export const ls = (page, k = KEY) => page.evaluate((k) => { try { return localStorage.getItem(k); } catch (e) { return 'THROW ' + e; } }, k);
export const hudText = (page) => page.evaluate(() => ({ count: document.getElementById('count')?.textContent, local: document.getElementById('local')?.textContent, zone: document.getElementById('zone-name')?.textContent, objective: document.getElementById('objective')?.textContent, badge: document.getElementById('save-badge')?.hidden ? null : document.getElementById('save-badge')?.textContent }));
