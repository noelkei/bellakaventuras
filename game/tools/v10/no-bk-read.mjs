// V10 · no-bk-read · el juego nunca lee ni crea `window.__bk*` fuera de las pruebas (encargo V10, regla fija; plan 50 H-21b).
//  · estático: nombres `__bk…` del bundle servido (JS) (se listan; la bandera minificada puede quedar lejos de su uso);
//  · dinámico: el juego SIN `?bktest`, con trampas (getter/setter) en `window` para todos esos nombres puestas ANTES de cargar el juego:
//    arrancar, pulsar EMPEZAR, andar 4 s con W y girar: 0 lecturas y 0 escrituras.
// Uso: node tools/v10/no-bk-read.mjs --url v10 --task V10-R6 --label final
import fs from 'node:fs';
import path from 'node:path';
import { Report, runTest, launch, sleep, argUrl, arg } from '../v8/lib.mjs';
const R = new Report('no-bk-read');
await runTest(R, async () => {
  // todos los .js de la build servida (el bundle principal se carga por importación dinámica: no basta con los <script> del HTML)
  const url = argUrl(), DIST = arg('dist', '/Users/TU_USUARIO/Desktop/Bellakaventuras/game/dist-v10');
  const js = fs.readdirSync(path.join(DIST, 'build')).filter((f) => f.endsWith('.js')).map((f) => path.join(DIST, 'build', f));
  const names = new Set(), far = [];
  for (const j of js) { const t = fs.readFileSync(j, 'utf8');
    for (const m of t.matchAll(/__bk[A-Za-z_]*/g)) { names.add(m[0]); const ctx = t.slice(Math.max(0, m.index - 400), m.index + 40); if (!/bktest|__bk_probe/.test(ctx) && m[0] !== '__bk_probe') far.push(ctx.slice(-160)); } }
  names.delete('__bk_probe');   // clave de localStorage para probar el almacenamiento, no es `window`
  R.measure('nombres', [...names]);
  R.check(names.size > 0, `el bundle contiene los ganchos de prueba esperados (${[...names].join(', ')})`, 'static');
  // (en el bundle minificado la bandera de pruebas puede quedar lejos de su uso: la prueba que manda es la dinámica de abajo)
  R.note({ usos_sin_bktest_cerca: far.length });
  const b = await launch();
  try {
    const page = await b.newPage();
    await page.evaluateOnNewDocument((names) => { window.__trap = { reads: [], writes: [] };
      for (const n of names) Object.defineProperty(window, n, { configurable: true, get() { window.__trap.reads.push(n); return undefined; }, set() { window.__trap.writes.push(n); } }); }, [...names]);
    await page.goto(url, { waitUntil: 'load' });   // SIN ?bktest
    await page.waitForFunction(() => !document.getElementById('btn-start').disabled, { timeout: 120000 });
    await page.click('#btn-start'); await sleep(2500);
    await page.keyboard.down('KeyW'); await sleep(2500); await page.keyboard.down('KeyD'); await sleep(1500); await page.keyboard.up('KeyD'); await page.keyboard.up('KeyW'); await sleep(1000);
    const trap = await page.evaluate(() => window.__trap);
    R.measure('trampas', trap);
    R.check(trap.reads.length === 0 && trap.writes.length === 0, `sin ?bktest el juego no lee ni crea window.__bk* (lecturas ${trap.reads.length}, escrituras ${trap.writes.length})`, 'input', trap);
  } finally { await b.close(); }
}, { timeoutMs: 300000 });
