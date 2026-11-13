// V10.6.1 · cronómetro en navegadores REALES de ordenador (Chrome, Safari, Firefox; el ordenador es la última prioridad del usuario: un tamaño).
// Mismo método que v10_6/cascos-navegadores (Safari con safaridriver en 4444: `safaridriver -p 4444 &`). En cada uno: JUGAR → con la pantalla de
// cascos no cuenta → al cerrarla cuenta tiempo real → en pausa no → final (atajo de pruebas) → para y sale el rótulo con el tiempo fijo.
// Uso: node tools/v10_6_1/navegadores.mjs --url http://127.0.0.1:5249/ [--solo chrome|safari|firefox] [--task V10-6-1] [--label r]
import puppeteer from 'puppeteer-core';
import { Report, runTest, sleep, arg, argUrl, CHROME, SAVE_20 } from '../v8/lib.mjs';
import * as WD from '../../../V10/IT7/tools/safari-wd.mjs';
const R = new Report('v1061-navegadores', { task: arg('task', 'V10-6-1') });
const U = argUrl().replace(/\/?$/, '/') + '?bktest=1&narr=off&cascos=1', SOLO = arg('solo');
const LISTO = `return !!window.__bk && !document.getElementById('btn-start').disabled;`;
const EST = `const g = window.__bk, r = window.__bkCrono && window.__bkCrono.run; return { ms: r ? r.ms : null, fin: r ? r.fin : null, recargas: r ? r.recargas : null, t: performance.now(), fm: g.frameMs, paused: g.paused,
  cascos: !document.getElementById('cascos').hidden, visible: !document.getElementById('crono').hidden, txt: document.getElementById('crono').textContent,
  ban: !document.getElementById('crono-fin').hidden && getComputedStyle(document.getElementById('crono-fin')).opacity === '1' ? document.getElementById('crono-fin').innerText : null,
  cine: !!(g.cine && g.cine.active), listoSN: !!(g.activities && g.activities.some((a) => a.id === 'secretJump')) && g.mode === 'explore' };`;
const FIN = `const s = window.__bk.state; for (const id of arguments[0]) if (!s.p.collected.includes(id)) s.p.collected.push(id); window.__bk.activities.find((x) => x.id === 'secretJump').debugComplete(); return true;`;

/** Mismo recorrido con un «driver» mínimo: js(código, args) y clic(selector). */
async function recorrido(tag, D) {
  await D.clic('#btn-start'); await sleep(1500);
  const a = await D.js(EST);
  R.check(a.visible && a.cascos && a.ms !== null && a.ms < 100 && a.recargas === 0, `${tag}: JUGAR arranca una carrera desde 0 y con «cascos» abierto no cuenta (${Math.round(a.ms)} ms)`, 'input', a);
  await D.clic('#btn-cascos'); await sleep(2500);
  const b = await D.js(EST); await sleep(3000); const c = await D.js(EST);
  const cont = c.ms - b.ms, real = c.t - b.t, tol = Math.max(real * 0.1, 2 * c.fm);
  R.check(!b.cascos && Math.abs(cont - real) <= tol, `${tag}: al cerrar «cascos» cuenta tiempo real (${Math.round(cont)}/${Math.round(real)} ms, fotograma ${Math.round(c.fm)} ms)`, 'emulation', { cont, real, tol });
  await D.clic('#btn-pause'); await sleep(700); const p0 = await D.js(EST); await sleep(2000); const p1 = await D.js(EST);
  R.check(p0.paused && p1.ms - p0.ms < 50, `${tag}: en pausa no cuenta`, 'input', { d: p1.ms - p0.ms, paused: p0.paused });
  await D.clic('#btn-resume'); await sleep(1500);
  let ok = false; for (let i = 0; i < 60 && !ok; i++) { ok = (await D.js(EST)).listoSN; if (!ok) await sleep(1000); }
  if (!ok) { R.invalid(`${tag}: el reto final no llegó a cargar`); return; }
  await D.js(FIN, [SAVE_20.collected]); await sleep(500); const f0 = await D.js(EST);
  for (let i = 0; i < 20 && !(await D.js(EST)).cine; i++) await sleep(500);
  await sleep(1500); await D.js(`window.__bk.closePreview(); return true;`);
  let ban = null; for (let i = 0; i < 40 && !ban; i++) { ban = (await D.js(EST)).ban; if (!ban) await sleep(500); }
  const f1 = await D.js(EST), esperado = await D.js(`return window.__bkCrono.formato(arguments[0]);`, [f0.ms]);
  R.check(f0.fin && f1.ms === f0.ms && !!ban && ban.includes(esperado), `${tag}: el final para el tiempo (${esperado}) y sale el rótulo con él`, 'emulation', { f0: f0.ms, f1: f1.ms, ban });
  await D.foto(`${tag.split(' ')[0].toLowerCase()}_rotulo.png`);
  await sleep(800); await D.clic('#btn-crono-ok'); await sleep(800);   // V10.6.2: el rótulo se queda hasta «CONTINUAR»
  const g = await D.js(`return { abierto: !document.getElementById('crono-fin').hidden, modal: window.__bk.input.modal };`);
  if ((await D.js(`return !!document.getElementById('btn-crono-ok');`))) R.check(!g.abierto && !g.modal, `${tag}: «CONTINUAR» cierra el rótulo y devuelve los controles`, 'input', g);
}

await runTest(R, async () => {
  const PUP = [['chrome', 'Chrome', { executablePath: CHROME, headless: true, protocolTimeout: 120000,
      args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required', '--no-first-run'] }],
    ['firefox', 'Firefox', { browser: 'firefox', executablePath: '/Applications/Firefox.app/Contents/MacOS/firefox', headless: true, protocolTimeout: 120000, timeout: 120000 }]];   // arrancar Firefox puede tardar
  for (const [clave, nom, opc] of PUP) if (!SOLO || SOLO === clave) {
    let br = null;
    try { br = await puppeteer.launch(opc); } catch (e) { R.invalid(`${nom}: no se pudo lanzar con puppeteer`, String(e).slice(0, 200)); }
    if (br) { const page = await br.newPage(), errores = []; page.on('pageerror', (e) => errores.push(String(e?.message ?? e).slice(0, 200)));
      try { await page.setViewport({ width: 1280, height: 720 }); await page.goto(U, { waitUntil: 'load', timeout: 90000 });
        await page.waitForFunction(() => !!window.__bk && !document.getElementById('btn-start').disabled, { timeout: 150000 });
        await recorrido(`${nom} 1280×720`, { js: (code, args = []) => page.evaluate((c, a) => new Function(c).apply(null, a), code, args), clic: (s) => page.click(s).catch(() => {}),
          foto: (f) => page.screenshot({ path: R.file_(f) }).catch(() => {}) });
        R.check(!errores.length, `${nom}: sin errores de página`, 'emulation', errores.slice(0, 3));
      } catch (e) { R.invalid(`${nom}: ${String(e?.message ?? e).slice(0, 160)}`); } finally { await br.close(); } }
  }
  if (!SOLO || SOLO === 'safari') {
    let id = null;
    try { id = await WD.abrir(); } catch (e) { R.invalid('Safari: no hay safaridriver en 4444 (o falta «Permitir automatización remota»)', String(e).slice(0, 200)); }
    if (id) try {
      await WD.tam(id, 1280, 720); await WD.ir(id, U);
      let ok = false; for (let i = 0; i < 150 && !ok; i++) { ok = await WD.js(id, LISTO).catch(() => false); if (!ok) await WD.espera(1000); }
      if (!ok) R.invalid('Safari 1280×720: el juego no llegó a estar listo');
      else await recorrido('Safari 1280×720', { js: (code, args = []) => WD.js(id, code, args), clic: (s) => WD.js(id, `const e = document.querySelector(arguments[0]); if (e) e.click(); return !!e;`, [s]),
        foto: (f) => WD.foto(id, R.file_(f)).catch(() => {}) });
    } finally { await WD.cerrar(id).catch(() => {}); }
  }
}, { timeoutMs: 1200000 });
