// ACT-05: baile y recuperación transversal con ENTRADA REAL (teclado, clic, Enter/Espacio en botones, mando simulado por el
// adaptador real). Complementa dance.mjs (rondas completas, celebraciones enteras, salida en el baile final) y p0-time.mjs
// (pausa en celebración, recarga tras salir).
//   D  error a mitad → «¡Casi!» → misma ronda desde el principio sin perder las ganadas; tecla mantenida (autorepetición)
//      cuenta una vez; ▶ con clic de ratón; ▲ con Enter y ◀ con Espacio sobre el botón enfocado (una sola entrada cada uno);
//      cruceta del mando; pausa a mitad (la flecha no cuenta); giro a vertical a mitad (botones dentro y tocables);
//      pérdida de foco/segundo plano → pausa y estado intacto; recarga con 2 rondas → «SEGUIR BAILANDO (3/3)»;
//      salida durante la celebración final → premio conservado, tabla recuperada y control devuelto
//   F  fallo de carga de la textura del mural → aviso y control devuelto (sin modo congelado)
//   node tools/v3/act05.mjs [DF] → captures/v3/P3/ACT-05/act05.json + *.jpg
import path from 'node:path';
import { Report, launch, openGame, clickStart, sleep } from './lib.mjs';

const which = (process.argv[2] ?? 'DF').toUpperCase();
const R = new Report('P3/ACT-05', 'act05', { method: 'teclado/ratón reales, mando simulado por input.fakePad; fixtures: posición de salida, viewport, visibilidad emulada, red' });
const browser = await launch();
const VP = { width: 900, height: 620, deviceScaleFactor: 1 };
let page = await openGame(browser, R, { viewport: VP, save: null });
const st = () => page.evaluate(() => {
  const g = window.__bk, a = g.activities.find((x) => x.id === 'danceCombo');
  return { round: a.round, idx: a.idx, locked: a.locked, celebrating: !!a['celebration'], msg: document.getElementById('dance-msg').textContent, overlay: !document.getElementById('dance').hidden,
    partial: g.state.p.partials.danceRounds, done: !!g.state.p.activities.danceCombo, mode: g.mode, paused: g.paused, frozen: g.skater.frozen, busy: a.busy,
    boardProp: !!a.boardProp, prompt: document.getElementById('prompt').hidden ? '' : document.getElementById('btn-action').textContent };
});
const waitFor = async (fn, ms) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { const s = await st(); if (fn(s)) return s; await sleep(50); } return st(); };
const clickSel = async (sel) => { const h = await page.$(sel); const b = await h.boundingBox(); await page.mouse.click(b.x + b.width / 2, b.y + b.height / 2); };
const pad = (pressed = []) => page.evaluate((pressed) => { const buttons = Array.from({ length: 17 }, (_, i) => ({ pressed: pressed.includes(i), value: pressed.includes(i) ? 1 : 0 })); window.__bk.input.fakePad = { id: 'Mando estándar simulado', connected: true, axes: [0, 0, 0, 0], buttons }; }, pressed);
const toDance = async () => {
  await page.evaluate(() => { const g = window.__bk, T = window.__bkTHREE, c = g.manifest.get('dance.center'); const dir = new T.Vector3(Math.sin(c.heading), 0, Math.cos(c.heading)); g.skater.teleport(c.pos.clone().addScaledVector(dir, 3.0), c.heading + Math.PI, 'walk'); g.rig.snapBehind(g.skater); g.input.clear(); });
  await page.keyboard.down('KeyW'); await page.waitForFunction(() => /BAIL/.test(document.getElementById('btn-action').textContent) && !document.getElementById('prompt').hidden, { timeout: 6000 }).catch(() => {}); await page.keyboard.up('KeyW');
};

try {
  if (which.includes('D')) {
    await clickStart(page); await page.evaluate(() => { document.getElementById('hint').hidden = true; });
    R.fixture('posición a pie 3 m antes de la pista de baile; W real hasta que aparece BAILAR', 'teleport');
    await toDance(); await page.keyboard.press('KeyE');
    let s = await waitFor((x) => x.overlay, 4000);
    R.check(s.overlay && s.round === 0, 'E abre el baile en la ronda 1', 'input', s);
    // ronda 1 = ▲ ▶ ▲ — error a mitad
    await page.keyboard.press('ArrowUp'); await sleep(200); await page.keyboard.press('ArrowDown'); await sleep(150);
    const e1 = await st(); s = await waitFor((x) => !x.locked && x.idx === 0, 2500);
    R.check(/Casi/.test(e1.msg) && e1.locked && s.round === 0 && s.idx === 0 && s.partial === 0, 'error a mitad: «¡Casi!», breve bloqueo y la MISMA ronda desde el principio', 'input', { e1, s });
    // autorepetición: mantener ▲ (eventos repeat) cuenta una vez
    await page.keyboard.down('ArrowUp'); for (let i = 0; i < 4; i++) { await sleep(60); await page.keyboard.down('ArrowUp'); } await page.keyboard.up('ArrowUp'); await sleep(150);
    s = await st();
    R.check(s.idx === 1 && !s.locked, 'mantener ▲ con autorepetición cuenta UNA entrada (sin error por repetición)', 'input', s);
    // ▶ con clic de ratón en el botón
    await clickSel('#dance-pad button[data-k="right"]'); await sleep(200);
    s = await st(); R.check(s.idx === 2, '▶ con clic real en el botón cuenta una entrada', 'input', s);
    // ▲ con Enter sobre el botón enfocado (botón real: click nativo; Enter no es dirección del juego)
    await page.focus('#dance-pad button[data-k="up"]'); await page.keyboard.press('Enter'); await sleep(250);
    s = await st(); R.check(s.round === 0 && s.celebrating && s.partial === 1, '▲ con Enter en el botón enfocado completa la ronda 1 (una sola entrada) y la guarda', 'input', s);
    s = await waitFor((x) => x.round === 1 && !x.celebrating, 6000);
    // ronda 2 = ◀ ▼ ▶: ◀ con Espacio en el botón enfocado
    await page.focus('#dance-pad button[data-k="left"]'); await page.keyboard.press('Space'); await sleep(250);
    s = await st(); R.check(s.round === 1 && s.idx === 1 && !s.locked, '◀ con Espacio en el botón enfocado: una entrada (sin salto ni doble acción)', 'input', s);
    // ▼ con la cruceta del mando (botón 13)
    await pad([13]); await sleep(120); await pad([]); await sleep(150);
    s = await st(); R.check(s.idx === 2, '▼ con la cruceta del mando simulado cuenta una entrada', 'input', s);
    await page.evaluate(() => { window.__bk.input.fakePad = null; });
    // pausa a mitad: ▶ no cuenta
    await page.keyboard.press('Escape'); await sleep(250); await page.keyboard.press('ArrowRight'); await sleep(250);
    const p1 = await st();
    await clickSel('#btn-resume'); await sleep(300);
    const p2 = await st();
    R.check(p1.paused && p1.idx === 2 && !p2.paused && p2.idx === 2 && p2.overlay, 'en pausa la flecha mueve el foco del menú, no cuenta en el combo; al reanudar sigue en el mismo paso', 'input', { p1, p2 });
    // giro a vertical a mitad: botones dentro de la pantalla y tocables (hit test real)
    // mismo modo de dispositivo (cambiar isMobile recarga la página en puppeteer): solo cambia el tamaño/orientación
    await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 1 }); await sleep(600);
    const hit = await page.evaluate(() => [...document.querySelectorAll('#dance-pad button, #dance-exit')].map((b) => { const r = b.getBoundingClientRect(), x = r.left + r.width / 2, y = r.top + r.height / 2; const el = document.elementFromPoint(x, y); return { k: b.dataset.k ?? b.id, w: Math.round(r.width), h: Math.round(r.height), inside: r.left >= 0 && r.right <= innerWidth && r.top >= 0 && r.bottom <= innerHeight, hit: el === b || b.contains(el) }; }));
    await page.screenshot({ path: path.join(R.dir, 'D_vertical.jpg'), type: 'jpeg', quality: 75 });
    R.check(hit.every((h) => h.inside && h.hit && h.w >= 44 && h.h >= 44), 'cambio a 390×844 a mitad de ronda: los cuatro botones y «Salir» dentro, ≥44 px y reciben el puntero (hit test)', 'input', hit);
    await clickSel('#dance-pad button[data-k="right"]');
    s = await waitFor((x) => x.celebrating || x.round === 2, 1500);
    R.check(s.partial === 2, '▶ pulsado en 390×844 completa la ronda 2 y la guarda', 'input', s);
    await page.setViewport(VP); await sleep(400);
    // segundo plano: pausa y estado intacto
    s = await waitFor((x) => x.round === 2 && !x.celebrating, 8000);
    await page.evaluate(() => { Object.defineProperty(document, 'hidden', { value: true, configurable: true }); document.dispatchEvent(new Event('visibilitychange')); });
    await sleep(300);
    const v1 = await st();
    await page.evaluate(() => { Object.defineProperty(document, 'hidden', { value: false, configurable: true }); document.dispatchEvent(new Event('visibilitychange')); });
    R.fixture('visibilitychange emulado (document.hidden)', 'evaluate');
    await clickSel('#btn-resume'); await sleep(300);
    const v2 = await st();
    R.check(v1.paused && v1.round === 2 && v1.overlay && !v2.paused && v2.round === 2 && v2.overlay, 'pasar a segundo plano pausa; al volver y reanudar el baile sigue en la ronda 3', 'input', { v1, v2 });
    // recarga con dos rondas ganadas
    await page.reload({ waitUntil: 'load' }); await page.waitForFunction(() => window.__bk && !document.getElementById('btn-start').disabled, { timeout: 90000 });
    await clickStart(page); await page.evaluate(() => { document.getElementById('hint').hidden = true; });
    await toDance(); s = await st();
    R.check(s.partial === 2 && /SEGUIR BAILANDO \(3\/3\)/.test(s.prompt), 'recarga tras dos rondas: «SEGUIR BAILANDO (3/3)»', 'input', s);
    await page.keyboard.press('KeyE'); s = await waitFor((x) => x.overlay, 4000);
    for (const k of ['ArrowUp', 'ArrowLeft', 'ArrowDown']) { await page.keyboard.press(k); await sleep(220); }
    s = await waitFor((x) => x.celebrating, 1500);
    const c0 = await st();
    await sleep(800); await clickSel('#dance-exit'); await sleep(500);
    const c1 = await page.evaluate(() => { const g = window.__bk; return { mode: g.mode, frozen: g.skater.frozen, overlay: !document.getElementById('dance').hidden, done: !!g.state.p.activities.danceCombo, avail: g.pickups.filter((p) => p.id === 'fashion_girl.activity' && p.available && !p.collected).length, boardHidden: g.visual.boardHidden, boardProp: !!g.activities.find((x) => x.id === "danceCombo").boardProp, clip: g.visual.currentName }; });
    await page.keyboard.down('KeyW'); await sleep(1500); await page.keyboard.up('KeyW');
    const c2 = await page.evaluate(() => { const s = window.__bk.skater; return { loco: s.loco, speed: +s.speed.toFixed(2), moved: true }; });
    await page.keyboard.press('ArrowUp'); await sleep(200);
    const c3 = await st();
    R.check(c0.done && c0.celebrating && c1.mode === 'explore' && !c1.frozen && !c1.overlay && c1.done && c1.avail === 1 && !c1.boardHidden && !c1.boardProp && c3.round === c0.round && !c3.overlay, 'salir durante la celebración final: premio conservado, interfaz cerrada, control devuelto y las flechas ya no actúan', 'input', { c0, c1, c2, c3 });
    R.check(['walk', 'ride', 'mount'].includes(c2.loco) && c2.speed > 0.5, 'tras salir se mueve con la tabla recuperada', 'input', c2);
    await page.close();
  }

  if (which.includes('F')) {
    page = await openGame(browser, R, { viewport: VP, save: null });
    await page.setRequestInterception(true);
    let block = false;
    page.on('request', (rq) => { if (block && /T_yy_(stencil|final|mask)/.test(rq.url())) rq.abort('failed'); else rq.continue(); });
    await clickStart(page); await page.evaluate(() => { document.getElementById('hint').hidden = true; });
    R.fixture('red: las imágenes del mural fallan al abrir la actividad (la textura del muro ya estaba cargada)', 'interceptación');
    block = true;
    await page.evaluate(() => { const g = window.__bk, a = g.manifest.get('mural.paint'); g.skater.teleport(a.pos.clone(), a.heading, 'walk'); g.input.clear(); });
    await page.waitForFunction(() => /PINTAR/.test(document.getElementById('btn-action').textContent) && !document.getElementById('prompt').hidden, { timeout: 5000 }).catch(() => {});
    await page.keyboard.press('KeyE'); await sleep(1500);
    const f1 = await page.evaluate(() => { const g = window.__bk, a = g.activities.find((x) => x.id === 'graffiti'); return { mode: g.mode, busy: a.busy, frozen: g.skater.frozen, overlay: !document.getElementById('graffiti').hidden, toast: document.getElementById('toast')?.textContent ?? '' }; });
    await page.keyboard.down('KeyW'); await sleep(800); await page.keyboard.up('KeyW');
    const f2 = await page.evaluate(() => ({ speed: window.__bk.skater.speed }));
    R.check(f1.mode === 'explore' && !f1.busy && !f1.frozen && !f1.overlay && /No se pudo cargar/.test(f1.toast), 'fallo de carga del mural: aviso «No se pudo cargar…», sin interfaz a medias y control devuelto', 'input', { f1, f2 });
    block = false;
    R.data.errors = R.data.errors.filter((e) => !/T_yy_|ERR_FAILED/.test(e));
    await page.close();
  }
} catch (e) { R.data.errors.push('HARNESS ' + (e?.stack ?? e)); }
finally { await browser.close(); R.finish(); }
