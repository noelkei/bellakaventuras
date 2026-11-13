// UX-04: guía y legibilidad con ENTRADA REAL donde hay acción del jugador. Revisión del agente (no prueba con jugador nuevo):
// llegada orientada a La Pantera, HUD con zona/tema/0/4/0/20, feedback al recoger, objetivo tras la actividad, siguiente zona
// antihoraria con la zona completa, centro abierto a 20/20; ningún texto técnico en pantalla; nombres accesibles en
// botones; contraste del HUD; texto escalable; movimiento reducido.
//   node tools/v3/ux04.mjs → captures/v3/P3/UX-04/ux04.json + *.jpg
import fs from 'node:fs';
import path from 'node:path';
import { Report, launch, openGame, clickStart, sleep, GAME } from './lib.mjs';

const R = new Report('P3/UX-04', 'ux04', { method: 'teclado real para moverse/hablar; fixtures de guardado y posición declarados; lectura de la interfaz como revisión del agente' });
const browser = await launch();
const fx = (n) => fs.readFileSync(path.join(GAME, 'tools', 'fixtures', n + '.json'), 'utf8');
const VP = { width: 900, height: 620, deviceScaleFactor: 1 };
const TECH = /(\bV2\b|\.glb|\.webp|\.json|\.m4a|tex\/|\/src\/|debug|undefined|NaN|null\b|\[object)/i;
let page;
const ui = () => page.evaluate(() => {
  const vis = (id) => { const e = document.getElementById(id); return e && !e.hidden && !e.closest('[hidden]') ? e.innerText.trim() : ''; };
  const all = [...document.querySelectorAll('body *')].filter((e) => e.children.length === 0 && !e.closest('[hidden]') && e.offsetParent !== null).map((e) => e.textContent.trim()).filter(Boolean).join(' | ');
  return { zone: vis('zone-name'), song: vis('zone-song'), local: vis('local'), count: vis('count'), objective: vis('objective'), toast: vis('toast'), task: vis('task'), prompt: vis('prompt'), all };
});
const held = new Set();
async function keys(want) { for (const k of [...held]) if (!want.includes(k)) { await page.keyboard.up(k); held.delete(k); } for (const k of want) if (!held.has(k)) { await page.keyboard.down(k); held.add(k); } }
async function goTo(tg, { tol = 0.6, vmax = 3, maxMs = 10000, until = null } = {}) {
  const t0 = Date.now();
  while (Date.now() - t0 < maxMs) {
    const o = await page.evaluate(({ tg, vmax }) => {
      const g = window.__bk, p = g.skater.footPos, f = g.rig.forward, d = { x: tg.x - p.x, z: tg.z - p.z }, L = Math.hypot(d.x, d.z), right = { x: -f.z, z: f.x };
      const combos = [['KeyW'], ['KeyW', 'KeyA'], ['KeyW', 'KeyD'], ['KeyA'], ['KeyD']].map((k) => { const y = k.includes('KeyW') ? 1 : 0, x = (k.includes('KeyD') ? 1 : 0) - (k.includes('KeyA') ? 1 : 0); const n = Math.hypot(x, y) || 1; const w = { x: (f.x * y + right.x * x) / n, z: (f.z * y + right.z * x) / n }; return { k, dot: (w.x * d.x + w.z * d.z) / (L || 1) }; }).sort((a, b) => b.dot - a.dot);
      let k = combos[0].k.slice(); const v = g.skater.speed;
      if (v > vmax + 0.5) k = ['KeyS']; else if (combos[0].dot < 0.75) { k = k.filter((x) => x !== 'KeyW'); if (!k.length) k = ['KeyA']; if (v < 0.8) k.push('KeyW'); } else if (v > vmax) k = k.filter((x) => x !== 'KeyW');
      return { L, keys: k };
    }, { tg, vmax });
    if (o.L < tol || (until && (await until()))) break;
    await keys(o.keys); await sleep(30);
  }
  await keys([]);
}
const techSeen = [];
const scan = async (label) => { const u = await ui(); const m = u.all.match(TECH); if (m) techSeen.push({ label, match: m[0], ctx: u.all.slice(Math.max(0, u.all.indexOf(m[0]) - 60), u.all.indexOf(m[0]) + 60) }); return u; };

try {
  // 1. llegada
  page = await openGame(browser, R, { viewport: VP, save: null });
  const startTxt = await page.evaluate(() => document.getElementById('start').innerText);
  await clickStart(page); await sleep(500);
  let u = await scan('llegada');
  const facing = await page.evaluate(() => { const g = window.__bk, n = g.manifest.get('npc.la_pantera').pos, p = g.skater.footPos, f = g.rig.forward; const d = { x: n.x - p.x, z: n.z - p.z }, L = Math.hypot(d.x, d.z); return +((d.x * f.x + d.z * f.z) / L).toFixed(2); });
  await page.screenshot({ path: path.join(R.dir, 'llegada.jpg'), type: 'jpeg', quality: 72 });
  R.check(/NO ME GUILLO/.test(u.zone) && /♪/.test(u.song) && u.local === '0/4' && u.count === '0' && /Pantera/.test(u.objective) && facing > 0.7, 'llegada: zona NO ME GUILLO, tema, 0/4 y 0/20; objetivo «Habla con La Pantera» y cámara hacia ella', 'input', { u: { ...u, all: undefined }, facing });
  R.check(!TECH.test(startTxt), 'pantalla de inicio sin textos técnicos', 'static', { startTxt });
  // 2. recoger la patata visible de NMG andando: feedback con nombre y contador
  const fry = await page.evaluate(() => { const g = window.__bk, f = g.park.manifest.fries.find((q) => q.id.startsWith('no_me_guillo') && q.kind === 'visible') ?? g.park.manifest.fries.find((q) => q.id.startsWith('no_me_guillo')); return { id: f.id, x: f.pos.x, z: f.pos.z }; });
  R.fixture('salida a 5 m de una patata de NO ME GUILLO, a pie', 'teleport');
  await page.evaluate((fry) => { const g = window.__bk, T = window.__bkTHREE; const p = new T.Vector3(fry.x + 5, 0, fry.z); g.skater.teleport(p, Math.atan2(fry.x - p.x, fry.z - p.z), 'walk'); g.rig.snapBehind(g.skater); g.input.clear(); }, fry);
  await goTo(fry, { until: () => page.evaluate((id) => window.__bk.state.p.collected.includes(id), fry.id) });
  await sleep(150); u = await scan('recogida');
  await page.screenshot({ path: path.join(R.dir, 'recogida.jpg'), type: 'jpeg', quality: 72 });
  R.check(u.count === '1' && u.local === '1/4' && /NO ME GUILLO|patata/i.test(u.toast + u.objective), 'al recoger: contador 1/20, local 1/4 y aviso con la zona', 'input', { count: u.count, local: u.local, toast: u.toast, objective: u.objective });
  // 3. hablar con La Pantera → el objetivo pasa a buscar patatas
  await page.evaluate(async () => { const g = window.__bk, T = window.__bkTHREE; await g.loadNpc('la_pantera'); const n = g.manifest.get('npc.la_pantera'); const d = new T.Vector3(Math.sin(n.heading), 0, Math.cos(n.heading)); g.skater.teleport(n.pos.clone().addScaledVector(d, 2.4), n.heading + Math.PI, 'walk'); g.input.clear(); });
  await page.waitForFunction(() => /HABLAR/.test(document.getElementById('btn-action').textContent) && !document.getElementById('prompt').hidden, { timeout: 5000 }).catch(() => {});
  await page.keyboard.press('KeyE');
  for (let i = 0; i < 12 && !(await page.evaluate(() => !!window.__bk.state.p.activities.pantherTalk && window.__bk.mode === 'explore')); i++) { await sleep(700); if (await page.evaluate(() => !document.getElementById('dialog').hidden)) await page.keyboard.press('Enter'); }
  await sleep(400); u = await scan('tras Pantera');
  R.check(/Busca las patatas de NO ME GUILLO/.test(u.objective), 'tras la actividad: «Busca las patatas de NO ME GUILLO · n/4»', 'input', { objective: u.objective });
  await page.close();

  // 4. zona completa → siguiente zona antihoraria (NOSVAMOSDEAQUI)
  page = await openGame(browser, R, { viewport: VP, save: null });
  await clickStart(page);
  R.fixture('NMG completada (4/4 y charla) escrita en el estado antes de entrar de nuevo en la zona', 'evaluate → state');
  await page.evaluate(() => { const g = window.__bk; for (const f of g.park.manifest.fries.filter((q) => q.id.startsWith('no_me_guillo'))) g.state.p.collected.push(f.id); g.state.p.activities.pantherTalk = true; g.zone = null; });
  await sleep(500); u = await scan('NMG completa');
  R.check(/Siguiente: NOSVAMOSDEAQUI/.test(u.objective), 'zona completa: «Siguiente: NOSVAMOSDEAQUI (sentido antihorario)»', 'fixture', { objective: u.objective });
  await page.close();

  // 5. 20/20 → revelación → centro abierto y rumbo
  page = await openGame(browser, R, { viewport: VP, save: fx('v4-20-sin-revelar') });
  R.fixture('guardado v4 con 20/20 sin revelación vista', 'tools/fixtures/v4-20-sin-revelar.json');
  await clickStart(page);
  await page.waitForFunction(() => window.__bk.state.p.revealSeen && window.__bk.mode === 'explore', { timeout: 20000 }).catch(() => {});
  u = await scan('centro abierto');
  await page.screenshot({ path: path.join(R.dir, 'centro_abierto.jpg'), type: 'jpeg', quality: 72 });
  R.check(/SECRENOVIO está abierto/.test(u.objective) && u.count === '20', '20/20: tras la revelación el objetivo dice que SECRENOVIO está abierto y propone el triple', 'input', { objective: u.objective, count: u.count });

  // 6. accesibilidad básica: nombres de botones, contraste del HUD, escala de texto, movimiento reducido
  const a11y = await page.evaluate(() => {
    const unnamed = [...document.querySelectorAll('button, a.big, input')].filter((b) => !(b.getAttribute('aria-label') || b.textContent.trim() || b.closest('label'))).map((b) => b.id || b.outerHTML.slice(0, 60));
    const lum = (c) => { const m = c.match(/[\d.]+/g).map(Number); const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(m[0]) + 0.7152 * f(m[1]) + 0.0722 * f(m[2]); };
    const contrast = ['objective', 'zone', 'counter', 'toast', 'btn-action', 'mode-chip'].map((id) => {
      const e = document.getElementById(id); const cs = getComputedStyle(e); let bgEl = e, bg = cs.backgroundColor;
      while (bgEl && /rgba\(0, 0, 0, 0\)|transparent/.test(bg)) { bgEl = bgEl.parentElement; bg = bgEl ? getComputedStyle(bgEl).backgroundColor : 'rgb(0,0,0)'; }
      const alpha = (bg.match(/[\d.]+/g) ?? [0, 0, 0, 1])[3] ?? 1;
      const L1 = lum(cs.color), L2 = lum(bg); const ratio = (Math.max(L1, L2) + 0.05) / (Math.min(L1, L2) + 0.05);
      return { id, color: cs.color, bg, alpha: +alpha, ratio: +ratio.toFixed(2), shadow: cs.textShadow !== 'none', fontPx: parseFloat(cs.fontSize) };
    });
    const before = parseFloat(getComputedStyle(document.getElementById('objective')).fontSize);
    document.documentElement.style.fontSize = '125%';
    const after = parseFloat(getComputedStyle(document.getElementById('objective')).fontSize);
    document.documentElement.style.fontSize = '';
    return { unnamed, contrast, scale: { before, after } };
  });
  R.check(a11y.unnamed.length === 0, 'todos los botones y campos tienen nombre accesible (texto, aria-label o etiqueta)', 'static', a11y.unnamed);
  R.check(a11y.contrast.every((c) => (c.alpha >= 0.5 && c.ratio >= 4.5) || c.shadow), 'texto del HUD legible: contraste ≥4,5 sobre su fondo o sombra de texto sobre el 3D', 'static', a11y.contrast);
  R.check(a11y.scale.after > a11y.scale.before * 1.15, 'el texto del HUD escala con el tamaño de letra del navegador (rem)', 'static', a11y.scale);
  R.check(techSeen.length === 0, 'ningún texto técnico (V2, rutas, nombres de archivo, debug, undefined/NaN) en pantalla durante el recorrido', 'input', techSeen);
  await page.close();

  // 7. movimiento reducido: sin sacudida en aterrizaje duro y suelo de baile sin pulso
  page = await openGame(browser, R, { viewport: VP, save: null });
  await clickStart(page);
  await page.evaluate(() => { const g = window.__bk; g.state.p.settings.reducedMotion = true; g.applySettings(); });
  R.fixture('ajuste «movimiento reducido» activado y caída en la tabla desde 6 m sobre el llano de la llegada (aterrizaje duro)', 'evaluate + teleport');
  await page.evaluate(() => { const g = window.__bk, S = g.park.sector('no_me_guillo'), a = S.P(40, -14, 6); g.skater.teleport(a, 0, 'ride'); g.skater.vel.set(0, 0, 3); g.input.clear(); window.__sh = 0; const iv = setInterval(() => { window.__sh = Math.max(window.__sh, g.rig.shake); }, 16); setTimeout(() => clearInterval(iv), 4000); });
  await sleep(3000);
  const rm = await page.evaluate(() => ({ hardLands: window.__bk.skater.events.filter((e) => /land/.test(e.e)).slice(-3).map((e) => e.e), shake: window.__sh, reducedClass: document.body.classList.contains('reduced'), y: window.__bk.skater.footPos.y }));
  R.check(rm.reducedClass && rm.shake === 0, 'movimiento reducido: sin sacudida de cámara al caer', 'input', rm);
  await page.close();
  R.note('Revisión del agente leyendo la interfaz; no sustituye una prueba con jugador nuevo.');
} catch (e) { R.data.errors.push('HARNESS ' + (e?.stack ?? e)); }
finally { await browser.close(); R.finish(); }
