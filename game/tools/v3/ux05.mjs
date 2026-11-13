// UX-05: modales con TECLADO real. Pausa, Controles, Ajustes, Reiniciar (confirmación) y preview: foco inicial dentro,
// Tab/Shift+Tab atrapados, Escape cierra la capa superior, foco restaurado, role/aria-modal/etiqueta, fondo inerte;
// Enter/Espacio en botones no se propaga al juego (no salta al volver); resize con el modal abierto; preview: proporción
// del hueco visual, cabe o se desplaza DENTRO del modal en vertical sin mover la página, sin textos técnicos ni CTA sin URL.
// (Carga lenta/fallida del preview y guardado fallido: p0-time.mjs y audio-runtime.mjs P.)
//   node tools/v3/ux05.mjs → captures/v3/P3/UX-05/ux05.json + *.jpg
import fs from 'node:fs';
import path from 'node:path';
import { Report, launch, openGame, clickStart, sleep, VIEWPORTS, GAME } from './lib.mjs';

const R = new Report('P3/UX-05', 'ux05', { method: 'teclado real (Tab, Shift+Tab, Enter, Espacio, Escape) y clics; fixture de guardado con el triple ganado para el preview' });
const browser = await launch();
const fx = (n) => fs.readFileSync(path.join(GAME, 'tools', 'fixtures', n + '.json'), 'utf8');
let page = await openGame(browser, R, { viewport: { width: 900, height: 620, deviceScaleFactor: 1 }, save: fx('v4-triple-ganado') });
R.fixture('guardado v4 con triple ganado (preview desbloqueado)', 'tools/fixtures/v4-triple-ganado.json');
const focusInfo = (id) => page.evaluate((id) => { const m = document.getElementById(id), a = document.activeElement; return { open: !m.hidden, inside: !!a && m.contains(a), active: a?.id || a?.tagName, role: m.getAttribute('role'), modal: m.getAttribute('aria-modal'), label: !!(m.getAttribute('aria-labelledby') && document.getElementById(m.getAttribute('aria-labelledby'))?.textContent.trim()), hudInert: document.getElementById('hud').hasAttribute('inert') }; }, id);
async function shiftTab() { await page.keyboard.down('Shift'); await page.keyboard.press('Tab'); await page.keyboard.up('Shift'); }

try {
  await clickStart(page); await page.evaluate(() => { document.getElementById('hint').hidden = true; });
  // PAUSA con Escape
  await page.keyboard.press('Escape'); await sleep(250);
  let f = await focusInfo('pause');
  R.check(f.open && f.inside && f.active === 'btn-resume' && f.role === 'dialog' && f.modal === 'true' && f.label && f.hudInert, 'Escape abre la pausa con el foco en «Seguir», role=dialog, aria-modal, título y HUD inerte', 'input', f);
  const cyc = [];
  for (let i = 0; i < 12; i++) { if (i % 4 === 3) await shiftTab(); else await page.keyboard.press('Tab'); cyc.push(await focusInfo('pause')); }
  R.check(cyc.every((c) => c.inside), 'Tab y Shift+Tab recorren la pausa sin salir de ella', 'input', cyc.map((c) => c.active));
  // Controles: abrir con Enter, Escape cierra y devuelve el foco
  await page.focus('#btn-help'); await page.keyboard.press('Enter'); await sleep(250);
  const h1 = await focusInfo('help');
  await page.keyboard.press('Escape'); await sleep(250);
  const h2 = { help: await focusInfo('help'), pause: await focusInfo('pause') };
  R.check(h1.open && h1.inside && !h2.help.open && h2.pause.open && h2.pause.active === 'btn-help', 'Enter en «Controles» abre la ayuda con el foco dentro; Escape la cierra y el foco vuelve a «Controles»', 'input', { h1, h2 });
  const helpText = await page.evaluate(() => document.getElementById('help-body').innerText);
  R.check(/teclado/i.test(helpText) && /(táctil|pantalla)/i.test(helpText) && /mando/i.test(helpText) && /fren/i.test(helpText) && /c[aá]mara/i.test(helpText) && /truco/i.test(helpText), 'la ayuda cubre teclado, táctil, mando, freno, cámara y trucos', 'static', { len: helpText.length });
  // Ajustes: Espacio sobre la casilla la alterna (no salta); Escape cierra
  await page.focus('#btn-settings'); await page.keyboard.press('Space'); await sleep(250);
  const s1 = await focusInfo('settings');
  const before = await page.evaluate(() => document.getElementById('opt-reduced').checked);
  await page.focus('#opt-reduced'); await page.keyboard.press('Space'); await sleep(150);
  const after = await page.evaluate(() => ({ checked: document.getElementById('opt-reduced').checked, saved: JSON.parse(localStorage.getItem('bellakaventuras.remake.save')).settings.reducedMotion }));
  await page.focus('#opt-reduced'); await page.keyboard.press('Space'); await sleep(150);
  // resize con el modal abierto
  await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 1 }); await sleep(500);   // sin cambiar isMobile (recargaría)
  const rs = await page.evaluate(() => { const m = document.getElementById('settings'), r = m.getBoundingClientRect(), b = document.getElementById('btn-settings-close').getBoundingClientRect(); return { fitsOrScrolls: (r.height <= innerHeight + 1) || m.scrollHeight > m.clientHeight, closeVisible: b.bottom <= innerHeight && b.top >= 0 || getComputedStyle(m).overflowY !== 'visible', pageScroll: document.scrollingElement.scrollTop, inside: m.contains(document.activeElement) }; });
  await page.screenshot({ path: path.join(R.dir, 'ajustes_vertical.jpg'), type: 'jpeg', quality: 72 });
  await page.setViewport({ width: 900, height: 620, deviceScaleFactor: 1 }); await sleep(400);
  await page.keyboard.press('Escape'); await sleep(250);
  const s2 = await focusInfo('pause');
  R.check(s1.open && s1.inside && after.checked !== before && after.saved === after.checked && rs.inside && rs.pageScroll === 0 && s2.open && s2.active === 'btn-settings', 'Ajustes: Espacio abre y alterna casillas (se guarda); resize a vertical con el modal abierto conserva el foco y no desplaza la página; Escape vuelve a la pausa', 'input', { s1, before, after, rs, s2 });
  // Reiniciar: confirmación con «Cancelar» enfocado; Escape cancela sin borrar
  await page.focus('#btn-restart'); await page.keyboard.press('Enter'); await sleep(250);
  const c1 = await focusInfo('confirm');
  await page.keyboard.press('Escape'); await sleep(250);
  const c2 = await page.evaluate(() => ({ confirmOpen: !document.getElementById('confirm').hidden, collected: JSON.parse(localStorage.getItem('bellakaventuras.remake.save')).collected.length }));
  R.check(c1.open && c1.active === 'btn-confirm-no' && !c2.confirmOpen && c2.collected > 0, 'Reiniciar: confirmación con el foco en «Cancelar»; Escape cancela y no borra nada', 'input', { c1, c2 });
  // Enter en «Seguir» no se propaga al juego (sin salto al reanudar)
  await page.evaluate(() => { window.__e0 = window.__bk.skater.events.length; });
  await page.focus('#btn-resume'); await page.keyboard.press('Enter'); await sleep(500);
  const r1 = await page.evaluate(() => ({ paused: window.__bk.paused, ev: window.__bk.skater.events.slice(window.__e0).map((e) => e.e), active: document.activeElement?.id || document.activeElement?.tagName }));
  R.check(!r1.paused && !r1.ev.some((e) => /jump|hop|ollie/.test(e)), 'Enter en «Seguir» reanuda sin disparar acciones del juego', 'input', r1);
  await page.keyboard.press('Escape'); await sleep(250); await page.focus('#btn-resume'); await page.keyboard.press('Space'); await sleep(500);
  const r2 = await page.evaluate(() => ({ paused: window.__bk.paused, ev: window.__bk.skater.events.slice(window.__e0).map((e) => e.e) }));
  R.check(!r2.paused && !r2.ev.some((e) => /jump|hop|ollie/.test(e)), 'Espacio en «Seguir» reanuda y NO salta (la tecla del botón no llega al juego)', 'input', r2);

  // preview desde la pausa: foco, proporción del hueco visual, sin textos técnicos, CTA oculto sin URL
  for (const [name, vp] of [['900x620', { width: 900, height: 620, deviceScaleFactor: 1 }], ['390x844', { width: 390, height: 844, deviceScaleFactor: 1 }], ['844x390', { width: 844, height: 390, deviceScaleFactor: 1 }]]) {
    await page.setViewport(vp); await sleep(400);
    await page.keyboard.press('Escape'); await sleep(250); await page.focus('#btn-preview-again'); await page.keyboard.press('Enter'); await sleep(900);
    const pv = await page.evaluate(() => {
      const m = document.getElementById('final'), vs = document.getElementById('visual-slot').getBoundingClientRect(), mr = m.getBoundingClientRect();
      const btns = ['btn-play-preview', 'btn-close-final'].map((id) => { const r = document.getElementById(id).getBoundingClientRect(); return { id, w: r.width, h: r.height, reachable: (r.bottom <= innerHeight && r.top >= 0) || m.scrollHeight > m.clientHeight }; });
      const txt = m.innerText;
      return { open: !m.hidden, inside: m.contains(document.activeElement), active: document.activeElement?.id, slot: { w: Math.round(vs.width), h: Math.round(vs.height), ratio: +(vs.width / vs.height).toFixed(2) }, modal: { h: Math.round(mr.height), scrolls: m.scrollHeight > m.clientHeight, overflowY: getComputedStyle(m).overflowY }, btns, pageScroll: document.scrollingElement.scrollTop,
        technical: /(\.json|\.m4a|\/src\/|V2|slot|debug|stack|Error:|undefined)/i.test(txt), cta: { hidden: document.getElementById('btn-cta').hidden, href: document.getElementById('btn-cta').getAttribute('href') }, share: document.getElementById('btn-share').hidden };
    });
    await page.screenshot({ path: path.join(R.dir, `preview_${name}.jpg`), type: 'jpeg', quality: 72 });
    R.check(pv.open && pv.inside && Math.abs(pv.slot.ratio - 16 / 9) < 0.12 && pv.slot.h >= 120 && pv.btns.every((b) => b.reachable && b.w >= 44 && b.h >= 44) && pv.pageScroll === 0 && !pv.technical && pv.cta.hidden && pv.share,
      `preview ${name}: foco dentro, hueco visual 16:9 (≥120 px de alto), botones alcanzables dentro del modal, página quieta, sin textos técnicos y sin CTA/compartir sin URL`, 'input', pv);
    await page.keyboard.press('Escape'); await sleep(400);
    const back = await page.evaluate(() => ({ mode: window.__bk.mode, finalHidden: document.getElementById('final').hidden, hudInert: document.getElementById('hud').hasAttribute('inert') }));
    R.check(back.mode === 'explore' && back.finalHidden && !back.hudInert, `preview ${name}: Escape vuelve al parque con el HUD activo`, 'input', back);
  }
} catch (e) { R.data.errors.push('HARNESS ' + (e?.stack ?? e)); }
finally { await browser.close(); R.finish(); }
