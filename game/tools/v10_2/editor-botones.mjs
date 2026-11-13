// V10.2 · Q10 + R-10 (usuario: «no tiene que ser una barrita en ajustes, tiene que ser un botón… entras en lo que se ve el HUD y tienes la
// barrita ahí arriba, y un botón de guardar y otro de salir, porque ahora si dejas de pulsar y mover la barra sales directamente»):
// · Ajustes tiene el botón «Tamaño de los botones…» (`#btn-size-open`) y ya no la barra;
// · la vista `#btn-size` enseña el HUD real (`body.edit-btns`) con la barra arriba, − y +, Guardar y Salir;
// · soltar la barra (también en táctil) NO sale ni guarda; Salir, Esc y B deshacen; Guardar guarda (también tras recargar);
// · R-10: con mando, ←/→ de la cruceta mueven la barra con el foco (también la de sensibilidad de cámara).
import { Report, runTest, launch, openGame, clickStart, sleep, SAVE_20, VIEWPORTS } from '../v8/lib.mjs';
import { PHONE_H, padPress, tapSel } from './lib102.mjs';
const R = new Report('editor-botones');
const S = (page) => page.evaluate(() => { const vis = (id) => { const e = document.getElementById(id); return !!e && !e.hidden && e.offsetParent !== null; };
  let disk = null; try { disk = JSON.parse(localStorage.getItem('bellakaventuras.remake.save')).settings.btnScale; } catch { /* */ }
  return { open: vis('btn-size'), settings: vis('settings') && getComputedStyle(document.getElementById('btn-settings-close')).visibility !== 'hidden', edit: document.body.classList.contains('edit-btns'), val: window.__bk.state.p.settings.btnScale, disk, k: getComputedStyle(document.documentElement).getPropertyValue('--btn-k').trim() || getComputedStyle(document.body).getPropertyValue('--btn-k').trim(),
    rangeInSettings: (() => { const r = document.getElementById('opt-btn'); return !!r && !!r.closest('#settings') && r.offsetParent !== null; })(), openBtn: vis('btn-size-open'), pauseBtn: vis('btn-pause') }; });
async function toSettings(page, touch) { if (touch) { await tapSel(page, '#btn-pause'); await sleep(300); await tapSel(page, '#btn-settings'); } else { await page.keyboard.press('Escape'); await sleep(300); await page.click('#btn-settings'); } await sleep(400); }
await runTest(R, async () => {
  const b = await launch();
  // escritorio (teclado y ratón)
  { const page = await openGame(b, R, { save: SAVE_20, viewport: VIEWPORTS.desktop }); await clickStart(page);
    await toSettings(page, false); let s = await S(page);
    R.check(s.openBtn && !s.rangeInSettings, `Ajustes: botón «Tamaño de los botones…» ${s.openBtn ? 'visible' : 'NO está'} y sin barra en Ajustes (${s.rangeInSettings ? 'la barra sigue ahí' : 'ok'})`, 'input', s);
    if (s.openBtn) {
      const v0 = s.val; await page.click('#btn-size-open'); await sleep(400); s = await S(page);
      R.check(s.open && s.edit && !s.settings && s.pauseBtn, 'al pulsarlo: vista propia con el HUD real (botones visibles) y Ajustes oculto', 'input', s);
      await page.focus('#opt-btn'); for (let i = 0; i < 3; i++) await page.keyboard.press('ArrowRight'); await sleep(300); s = await S(page);
      R.check(s.open && Math.abs(s.val - (v0 + 0.3)) < 0.01 && s.disk === v0, `mover la barra cambia el tamaño en vivo (${v0} → ${s.val}) sin guardar (guardado ${s.disk})`, 'input', s);
      await page.click('#btn-size-exit'); await sleep(400); s = await S(page);
      R.check(!s.open && s.settings && !s.edit && s.val === v0 && s.disk === v0, `Salir deshace (${s.val}) y vuelve a Ajustes`, 'input', s);
      await page.click('#btn-size-open'); await sleep(300); await page.click('#btn-size-plus'); await page.click('#btn-size-plus'); await sleep(200); s = await S(page);
      R.check(Math.abs(s.val - (v0 + 0.2)) < 0.01, `+ dos veces: ${v0} → ${s.val}`, 'input', s);
      await page.click('#btn-size-minus'); await sleep(200); s = await S(page);
      R.check(Math.abs(s.val - (v0 + 0.1)) < 0.01, `− una vez: ${s.val}`, 'input', s);
      await page.click('#btn-size-save'); await sleep(400); s = await S(page);
      R.check(!s.open && s.settings && Math.abs(s.disk - (v0 + 0.1)) < 0.01, `Guardar guarda (${s.disk}) y vuelve a Ajustes`, 'input', s);
      await page.reload({ waitUntil: 'load' }); await page.waitForFunction(() => window.__bk && !document.getElementById('btn-start').disabled, { timeout: 120000 });
      const v1 = await page.evaluate(() => window.__bk.state.p.settings.btnScale);
      R.check(Math.abs(v1 - (v0 + 0.1)) < 0.01, `tras recargar sigue en ${v1}`, 'input', { v1 });
      await clickStart(page); await toSettings(page, false); await page.click('#btn-size-open'); await sleep(300); await page.click('#btn-size-plus'); await sleep(200);
      await page.keyboard.press('Escape'); await sleep(400); s = await S(page);
      R.check(!s.open && Math.abs(s.val - v1) < 0.01, `Esc deshace (${s.val}) y cierra la vista`, 'input', s);
    }
    await page.close(); }
  // táctil: arrastrar y soltar no sale
  { const page = await openGame(b, R, { save: SAVE_20, viewport: PHONE_H }); await clickStart(page);
    // V10.5 (E5-33: Ajustes tiene una fila más, «Modo eficiente»; copia previa en V10/backups/pruebas/V10_5-R2): en 844×390 el botón puede quedar bajo
    // el borde: se desplaza hasta él, como haría el jugador, antes de tocarlo
    await toSettings(page, true); await page.evaluate(() => document.getElementById('btn-size-open')?.scrollIntoView({ block: 'center' })); await sleep(200); const ok = await tapSel(page, '#btn-size-open'); await sleep(400); let s = await S(page); const v0 = s.val;
    if (ok && s.open) {
      const r = await page.evaluate(() => { const e = document.getElementById('opt-btn'); const r = e.getBoundingClientRect(); return { x: r.left, y: r.top + r.height / 2, w: r.width }; });
      await page.touchscreen.touchStart(r.x + r.w * 0.33, r.y); await sleep(120); await page.touchscreen.touchMove(r.x + r.w * 0.6, r.y); await sleep(200); await page.touchscreen.touchEnd(); await sleep(500); s = await S(page);
      await R.shot(page, 'tactil_soltado');
      R.check(s.open && s.edit && s.val !== v0 && s.disk === v0, `táctil: arrastrar y SOLTAR la barra no sale ni guarda (abierta ${s.open}, ${v0} → ${s.val}, guardado ${s.disk})`, 'input', s);
      await tapSel(page, '#btn-size-exit'); await sleep(400); s = await S(page);
      R.check(!s.open && s.val === v0, `táctil: Salir deshace (${s.val})`, 'input', s);
    } else R.check(false, 'táctil: la vista de tamaño de botones se abre con su botón', 'input', s);
    await page.close(); }
  // mando: ←/→ en las barras y B deshace
  { const page = await openGame(b, R, { save: SAVE_20, viewport: VIEWPORTS.desktop }); await clickStart(page); await padPress(page, 10);
    await toSettings(page, false); await page.focus('#opt-sens'); const a0 = await page.evaluate(() => window.__bk.state.p.settings.camSens);
    await padPress(page, 15); await padPress(page, 15); const a1 = await page.evaluate(() => window.__bk.state.p.settings.camSens);
    R.check(a1 > a0 + 0.15, `mando: → dos veces en «Sensibilidad de cámara» la sube (${a0} → ${a1})`, 'input', { a0, a1 });
    const has = await page.evaluate(() => !!document.getElementById('btn-size-open'));
    if (has) { await page.click('#btn-size-open'); await sleep(300); await page.focus('#opt-btn'); const v0 = await page.evaluate(() => window.__bk.state.p.settings.btnScale);
      await padPress(page, 15); const v1 = await page.evaluate(() => window.__bk.state.p.settings.btnScale);
      await padPress(page, 1); await sleep(300); const s = await S(page);
      R.check(v1 > v0 + 0.05 && !s.open && s.val === v0, `mando: → sube el tamaño (${v0} → ${v1}) y B deshace y sale (${s.val})`, 'input', { v0, v1, s }); }
    else R.check(false, 'mando: vista de tamaño de botones', 'input');
    await page.close(); }
  await b.close();
}, { timeoutMs: 400000 });
