// V10 · sn-nombre · renombrado integral SECRENOVIO → SECRETNOVIO (dossier SECRETNOVIO §7; plan 30 S-30…S-32, 40 §4).
//  · estático: el código fuente del juego, la configuración, index.html y los nombres de archivo servidos no contienen «secrenovio» (en
//    cualquier mayúscula) salvo los alias documentados (lectura de guardados antiguos en state.ts y procedencia en comentarios `// alias`);
//  · bundle servido (--url): el JS no contiene la grafía antigua fuera del alias de migración;
//  · en el juego: HUD, objetivos, avisos, preview y rótulos del DOM nunca muestran «SECRENOVIO»; el nombre vigente aparece donde toca;
//  · originales y dossieres históricos (referencias/escenarios/SECRENOVIO) intactos (no se renombran rutas archivadas).
// Uso: node tools/v10/sn-nombre.mjs --url v10 --task V10-R6 --label final   (contra v9: ROJO)
import fs from 'node:fs';
import path from 'node:path';
import { Report, runTest, launch, openGame, clickStart, sleep, argUrl, arg } from '../v8/lib.mjs';
const R = new Report('sn-nombre');
const GAME = '/Users/TU_USUARIO/Desktop/Bellakaventuras/game';
const OLD = /secrenovio/i;
const ALIAS = /alias|OLD_CENTER|legacy|V9 →|v9→|SECRENOVIO\/|referencias\//i;   // líneas de compatibilidad documentada o rutas de procedencia
await runTest(R, async () => {
  // ---- estático: src, configuración, index.html, nombres de archivo de public
  const hits = [];
  const walk = (d) => { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, e.name); if (e.isDirectory()) walk(p); else if (/\.(ts|json|css|html)$/.test(e.name)) {
    fs.readFileSync(p, 'utf8').split('\n').forEach((l, i) => { if (OLD.test(l) && !ALIAS.test(l)) hits.push(`${path.relative(GAME, p)}:${i + 1}: ${l.trim().slice(0, 140)}`); }); } } };
  // `--src <carpeta>`: comprobar una copia de trabajo antes de integrarla (src + index.html; public es el del juego)
  const SRC = arg('src', GAME); walk(path.join(SRC, 'src'));
  for (const f of ['index.html', 'public/game-config.json']) fs.readFileSync(path.join(f === 'index.html' ? SRC : GAME, f), 'utf8').split('\n').forEach((l, i) => { if (OLD.test(l) && !ALIAS.test(l)) hits.push(`${f}:${i + 1}: ${l.trim().slice(0, 140)}`); });
  const files = []; const walkF = (d) => { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, e.name); if (e.isDirectory()) walkF(p); else if (OLD.test(e.name)) files.push(path.relative(GAME, p)); } };
  walkF(path.join(GAME, 'public'));
  R.check(hits.length === 0, `código, configuración e index sin la grafía antigua salvo alias documentados (${hits.length})`, 'static', hits.slice(0, 20));
  R.check(files.length === 0, `ningún archivo servido con el nombre antiguo (${files.length})`, 'static', files);
  R.check(fs.existsSync('/Users/TU_USUARIO/Desktop/Bellakaventuras/referencias/escenarios/SECRENOVIO/geometria-aprobada-2026-10-17/geometria-aprobada.json'), 'dossieres históricos intactos (rutas archivadas sin renombrar)', 'static');
  // ---- bundle servido
  const url = argUrl(), html = await (await fetch(url)).text(), js = [...html.matchAll(/src="\.?\/?(build\/[^"]+\.js)"/g)].map((m) => m[1]);
  let bundleHits = 0, ctx = [];
  for (const j of js) { const t = await (await fetch(new URL(j, url))).text(); for (const m of t.matchAll(/.{0,60}secrenovio.{0,60}/gi)) { if (/alias|legacy|OLD_CENTER/i.test(m[0])) continue; bundleHits++; if (ctx.length < 6) ctx.push(m[0]); } }
  R.check(bundleHits === 0, `el bundle servido no contiene la grafía antigua fuera del alias de migración (${bundleHits})`, 'static', ctx);
  // ---- DOM del juego: centro abierto y preview
  const b = await launch();
  try {
    const page = await openGame(b, R); await clickStart(page); await sleep(500);
    const txt = await page.evaluate(async () => { const g = window.__bk, T = window.__bkTHREE; g.autoMode = true;
      g.skater.teleport(new T.Vector3(3, 0, 3), 0); await g.simulate(0.5); g.updateHud(); g.updateObjective();
      const a = document.body.innerText; g.debugCollectAll(20); await g.simulate(6); g.updateHud(); g.updateObjective(); const b2 = document.body.innerText;
      return { a, b: b2, cfg: JSON.stringify(g.cfg) }; });
    R.check(!OLD.test(txt.a + txt.b), 'HUD, objetivos y avisos (antes y después de las 20) sin «SECRENOVIO»', 'emulation', { a: txt.a.slice(0, 300), b: txt.b.slice(0, 300) });
    R.check(/SECRETNOVIO/.test(txt.a + txt.b), 'el nombre vigente SECRETNOVIO aparece en el HUD/objetivo del centro', 'emulation');
    R.check(!OLD.test(txt.cfg), 'configuración cargada (pistas, preview) sin la grafía antigua', 'static');
  } finally { await b.close(); }
}, { timeoutMs: 300000 });
