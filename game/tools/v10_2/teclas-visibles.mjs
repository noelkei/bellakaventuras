// V10.2 · Q11 + R-11 (usuario: «en el botón de SKILLS, luego cuando aparecen los otros dos botones y luego los otros 4, no tienen letra o
// número a usar»): todo botón VISIBLE del HUD, del abanico de SKILLS (raíz, bailes, grafitis) y de los paneles de actividad (diálogo,
// baile de FG, grafiti de la rana) muestra su tecla en ordenador y su botón en mando (etiqueta `::after` con contenido y estilo). En el
// abanico la etiqueta va DENTRO del círculo (no por debajo: pisaría al vecino). Y la tecla que se enseña en el abanico funciona.
import { Report, runTest, launch, openGame, clickStart, sleep, SAVE_20, VIEWPORTS } from '../v8/lib.mjs';
import { FRESH, toZone, ui, waitDialog, padPress, setPad } from './lib102.mjs';
const R = new Report('teclas-visibles');
const S_YY = { ...FRESH, partials: { ...FRESH.partials, graffitiIntro: true } };
const labels = (page, sel) => page.evaluate((sel) => [...document.querySelectorAll(sel)].filter((b) => b.offsetParent !== null && !b.closest('[hidden]') && b.getBoundingClientRect().width > 0).map((b) => {
  const cs = getComputedStyle(b, '::after'), c = cs.content, inner = b.querySelector('.hc-key, kbd');
  return { b: b.id || b.dataset.n || b.dataset.g || b.dataset.l || b.dataset.k || b.textContent.trim().slice(0, 10), c: c === 'none' || c === 'normal' ? '' : c.replace(/"/g, ''), pos: cs.position, bottom: parseFloat(cs.bottom), top: parseFloat(cs.top), inner: inner?.textContent ?? '' }; }), sel);
const has = (l) => !!(l.c || l.inner) && (l.inner || l.pos === 'absolute');
async function checkSet(page, what, sel, dev, { inside = false, min = 1 } = {}) {
  const L = await labels(page, sel);
  R.check(L.length >= min && L.every(has), `${dev} · ${what}: ${L.length} botones visibles con su ${dev === 'mando' ? 'botón' : 'tecla'} (${L.map((l) => `${l.b}=«${l.c || l.inner}»`).join(' ')})`, 'emulation', L.filter((l) => !has(l)));
  if (inside) R.check(L.length > 0 && L.every((l) => has(l) && (Number.isFinite(l.bottom) ? l.bottom >= 0 : true) && (Number.isFinite(l.top) ? l.top >= 0 : true)), `${dev} · ${what}: la etiqueta queda dentro del botón`, 'emulation', L.map((l) => [l.b, l.top, l.bottom]));
}
await runTest(R, async () => {
  const b = await launch();
  for (const dev of ['teclado', 'mando']) {
    const page = await openGame(b, R, { save: SAVE_20, viewport: VIEWPORTS.desktop }); await clickStart(page);
    const pad = dev === 'mando'; if (pad) { await padPress(page, 10); await sleep(300); }
    const isPad = await page.evaluate(() => document.body.classList.contains('pad'));
    if (pad) R.check(isPad, 'mando: el juego pasa a mando (`body.pad`)', 'emulation');
    // explorando
    await page.evaluate(() => { const g = window.__bk, an = g.manifest.get('nmg.llegada') ?? g.manifest.spawn; g.skater.teleport(an.pos.clone(), an.heading, 'walk'); g.rig.snapBehind(g.skater); }); await sleep(700);
    await checkSet(page, 'HUD explorando', '#touch button, #hud button, #prompt button', dev);
    // abanico: raíz, bailes, grafitis
    for (const [lvl, open] of [['raíz', []], ['bailes', ['1']], ['grafitis', ['2']]]) {
      if (pad) { await padPress(page, 5); if (open[0]) await padPress(page, open[0] === '1' ? 14 : 15); } else { await page.keyboard.press('KeyB'); for (const k of open) await page.keyboard.press(`Digit${k}`); }
      await sleep(400);
      const lv = await page.evaluate(() => window.__bk.activities.find((a) => a.id === 'freeDance').level);
      await checkSet(page, `abanico ${lvl} (${lv})`, '#dance-ring button.lvl', dev, { inside: true, min: lvl === 'raíz' ? 2 : 4 });
      await R.shot(page, `abanico_${lvl}_${dev}`);
      await page.keyboard.press('Escape'); await sleep(300); await page.evaluate(() => { const f = window.__bk.activities.find((a) => a.id === 'freeDance'); if (f.menu) f.toggleMenu(false); window.__bk.setPaused?.(false); }); await sleep(200);
    }
    // diálogo (La Pantera)
    await toZone(page, 'act.pantherTalk'); await sleep(600);
    if (pad) await padPress(page, 3); else await page.keyboard.press('KeyE');
    await waitDialog(page); await sleep(300);   /* V10.5 (E5-12): la frase sale al llegar la cámara; los 250 ms de guarda de R11 cuentan desde ahí */
    await checkSet(page, 'diálogo', '#dialog button', dev);
    if (pad) await padPress(page, 0); else await page.keyboard.press('KeyE'); await sleep(600);
    // baile de FG (hecho: va directo)
    await toZone(page, 'act.danceCombo'); await sleep(600);
    if (pad) await padPress(page, 3); else await page.keyboard.press('KeyE'); await sleep(900);
    if ((await ui(page)).dialog) { if (pad) await padPress(page, 0); else await page.keyboard.press('KeyE'); await sleep(600); }
    await checkSet(page, 'baile de FG', '#dance button', dev, { min: dev === 'mando' ? 1 : 0 });
    await page.evaluate(() => { const a = window.__bk.activities.find((x) => x.id === 'danceCombo'); a.cancel?.(); }); await sleep(400);
    await page.close();
    // grafiti de la rana (presentación ya oída)
    const p2 = await openGame(b, R, { save: S_YY, viewport: VIEWPORTS.desktop }); await clickStart(p2); if (pad) { await padPress(p2, 10); await sleep(200); }
    await p2.evaluate(() => window.__bk.loadNpc('rana'));
    for (let i = 0; i < 30; i++) { await toZone(p2, 'act.graffiti', 0, 1.0, Math.PI); await sleep(500); const s = await ui(p2); if (s.action && /PINTAR/.test(s.action) && !s.actionOff) break; }
    if (pad) await padPress(p2, 3); else await p2.keyboard.press('KeyE'); await sleep(1500);
    await checkSet(p2, 'grafiti de la rana', '#graffiti button', dev);
    await p2.close();
  }
  // las teclas del abanico funcionan (teclado: B, 2, 1 → pinta el grafiti 1 delante de una pared o en el suelo)
  { const page = await openGame(b, R, { save: SAVE_20 }); await clickStart(page);
    await page.evaluate(() => { const g = window.__bk, an = g.manifest.get('nmg.llegada') ?? g.manifest.spawn; g.skater.teleport(an.pos.clone(), an.heading, 'walk'); g.rig.snapBehind(g.skater); }); await sleep(600);
    await page.keyboard.press('KeyB'); await sleep(250); await page.keyboard.press('Digit2'); await sleep(250); await page.keyboard.press('Digit1'); await sleep(500);
    const p = await page.evaluate(() => { const f = window.__bk.activities.find((a) => a.id === 'freeDance'); return { painting: !!f.painting, denies: f.denies.slice(-1) }; });
    R.check(p.painting || p.denies.length > 0, `teclado B → 2 → 1 elige GRAFITEAR → grafiti 1 (${JSON.stringify(p)})`, 'input');
    await page.close(); }
  await b.close();
}, { timeoutMs: 600000 });
