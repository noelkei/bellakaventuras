// V10.1 R2 · guardián de interfaz: P01 (pantalla completa / modo app), P03 (sin EXTRA), P05 (tamaño de botones), P08 (nombres), P10 (teclas en
// los botones), P12 (volver a la plaza), P16 (AGACHARSE en su sitio en el grind), P25 (baile de FG). Cada bloque usa la interfaz real (clics,
// toques, teclas) salvo las fixtures declaradas.
import { Report, runTest, launch, openGame, clickStart, sleep, fixture, SAVE_20, VIEWPORTS } from '../v8/lib.mjs';
const R = new Report('interfaz-v10-1');
const IPHONE_UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1';
const rects = (page, sel) => page.evaluate((sel) => [...document.querySelectorAll(sel)].filter((e) => e.offsetParent !== null && getComputedStyle(e).display !== 'none' && !e.closest('[hidden]'))
  .map((e) => { const r = e.getBoundingClientRect(); return { id: e.id, x0: r.left, y0: r.top, x1: r.right, y1: r.bottom }; }), sel);
const overlaps = (L) => { const o = []; for (let i = 0; i < L.length; i++) for (let j = i + 1; j < L.length; j++) { const a = L[i], b = L[j]; if (a.x0 < b.x1 - 1 && b.x0 < a.x1 - 1 && a.y0 < b.y1 - 1 && b.y0 < a.y1 - 1) o.push(`${a.id}×${b.id}`); } return o; };
await runTest(R, async () => {
  const b = await launch();
  try {
    // ---------------------------------------------------------------- ordenador
    { const page = await openGame(b, R, { save: SAVE_20 });
      R.check(await page.evaluate(() => !!document.querySelector('link[rel=manifest]') && !!document.querySelector('link[rel=apple-touch-icon]')), 'P01 · manifiesto de app y icono de iPhone enlazados', 'static');
      const man = await page.evaluate(async () => { const r = await fetch(document.querySelector('link[rel=manifest]').href); const j = await r.json(); const ic = await Promise.all(j.icons.map(async (i) => (await fetch(new URL(i.src, location.href))).status)); return { display: j.display, icons: j.icons.length, status: ic }; });
      R.check(man.display === 'fullscreen' && man.icons >= 3 && man.status.every((s) => s === 200), 'P01 · manifiesto válido: pantalla completa y sus iconos se sirven', 'static', man);
      R.check(await page.evaluate(() => !document.getElementById('btn-fs-start').hidden), 'P01 · botón de pantalla completa en el inicio (ordenador)', 'static');
      await clickStart(page); await sleep(800);
      R.check(await page.evaluate(() => !document.getElementById('btn-extra')), 'P03 · no existe el botón EXTRA', 'static');
      R.check(await page.evaluate(() => !document.getElementById('opt-advanced')), 'P03 · sin el ajuste «Mostrar botón EXTRA»', 'static');
      // P10: tecla en cada botón visible
      const keys = await page.evaluate(() => [...document.querySelectorAll('#touch > button, #btn-pause')].filter((e) => e.offsetParent !== null && getComputedStyle(e).display !== 'none').map((e) => ({ id: e.id, k: getComputedStyle(e, '::after').content })));
      const want = { 'btn-jump': 'Espacio', 'btn-crouch': 'C', 'btn-board': 'Q', 'btn-cam': 'R', 'btn-pause': 'Esc' };
      R.check(Object.entries(want).every(([id, k]) => keys.find((x) => x.id === id)?.k === `"${k}"`), 'P10 · en ordenador cada botón muestra su tecla (Espacio, C, Q, R, Esc)', 'static', keys);
      // P10: con el mando, su botón
      await page.evaluate(() => { const I = window.__bk.input; I.fakePad = { axes: [0, 0, 0, 0], buttons: Array.from({ length: 17 }, () => ({ pressed: false, value: 0 })), id: 'prueba', connected: true }; I.fakePad.buttons[0] = { pressed: true, value: 1 }; });
      await sleep(250); await page.evaluate(() => { window.__bk.input.fakePad.buttons[0] = { pressed: false, value: 0 }; }); await sleep(250);
      const pk = await page.evaluate(() => getComputedStyle(document.getElementById('btn-jump'), '::after').content);
      R.check(pk === '"A"', 'P10 · jugando con mando, los botones muestran el botón del mando (SALTO → A)', 'static', pk);
      await page.keyboard.press('KeyW');   // vuelve el teclado
      // P05: 50 %, 100 %, 200 % en 1280×800: el editor deja ver el HUD y avisa si se tocan
      await page.keyboard.press('Escape'); await sleep(300); await page.click('#btn-settings'); await sleep(300);
      // V10.2 Q10 (cambio de diseño aprobado): el tamaño se edita en su propia vista («Tamaño de los botones…») y solo Guardar guarda
      await page.click('#btn-size-open'); await sleep(300);
      const sizes = [];
      for (const k of [0.5, 1, 2]) {
        await page.evaluate((k) => { const i = document.getElementById('opt-btn'); i.focus(); i.value = String(k); i.dispatchEvent(new Event('input')); i.dispatchEvent(new Event('change')); }, k); await sleep(250);
        const r = await page.evaluate(() => ({ edit: document.body.classList.contains('edit-btns'), warn: !document.getElementById('opt-btn-warn').hidden, val: document.getElementById('opt-btn-val').textContent, k: getComputedStyle(document.documentElement).getPropertyValue('--btn-k').trim(),
          w: document.getElementById('btn-jump').getBoundingClientRect().width, touchVis: getComputedStyle(document.getElementById('touch')).visibility, saved: JSON.parse(localStorage.getItem('bellakaventuras.remake.save')).settings.btnScale }));
        const ov = overlaps(await rects(page, '#touch > button, #btn-pause'));
        sizes.push({ k, ...r, ov });
      }
      R.measure('tamanos_escritorio', sizes);
      R.check(sizes.every((s) => s.edit && s.touchVis === 'visible' && s.val === `${Math.round(s.k * 100)} %`), 'P05 · al editar el tamaño se ve el HUD real con su valor (50/100/200 %)', 'input', sizes);
      R.check(Math.abs(sizes[2].w / sizes[1].w - 2) < 0.05 && Math.abs(sizes[0].w / sizes[1].w - 0.5) < 0.05, 'P05 · SALTO mide la mitad a 50 % y el doble a 200 %', 'static', sizes.map((s) => s.w));
      R.check(sizes.every((s) => s.warn === (s.ov.length > 0)), 'P05 · el aviso «se tocan» sale solo cuando hay botones que se tocan', 'static', sizes.map((s) => ({ k: s.k, warn: s.warn, ov: s.ov })));
      await page.evaluate(() => { const i = document.getElementById('opt-btn'); i.value = '1'; i.dispatchEvent(new Event('input')); i.dispatchEvent(new Event('change')); i.blur(); });
      await page.click('#btn-size-save'); await sleep(200);
      R.check(await page.evaluate(() => JSON.parse(localStorage.getItem('bellakaventuras.remake.save')).settings.btnScale === 1), 'P05 · Guardar guarda el tamaño (V10.2 Q10)', 'input');
      await page.click('#btn-settings-close'); await sleep(200);
      R.check(await page.evaluate(() => !document.body.classList.contains('edit-btns')), 'P05 · al volver de los ajustes el HUD vuelve a su sitio', 'static');
      // P12: volver a la plaza desde la pausa
      await page.click('#btn-resume'); await sleep(200);
      await fixture(page, R, 'P12: ANMI en tabla sobre el puente de NVDA', () => { const g = window.__bk, a = g.manifest.get('nv.retry'); g.skater.teleport(a.pos.clone(), a.heading, 'ride'); g.rig.snapBehind(g.skater); });
      await sleep(400); await page.keyboard.press('Escape'); await sleep(300); await page.click('#btn-plaza'); await sleep(250);
      const conf = await page.evaluate(() => !document.getElementById('confirm-plaza').hidden);
      await page.click('#btn-plaza-yes'); await sleep(700);
      const pl = await page.evaluate(() => { const g = window.__bk, s = g.skater, sp = g.manifest.spawn.pos; return { d: Math.hypot(s.footPos.x - sp.x, s.footPos.z - sp.z), loco: s.loco, paused: g.paused, mode: g.mode, total: g.state.total, cam: g.rig.mode, cp: g.state.p.checkpoint }; });
      R.check(conf && pl.d < 0.3 && pl.loco === 'walk' && !pl.paused && pl.mode === 'explore' && pl.total === 20, 'P12 · «Volver a la plaza» (con confirmación) deja a ANMI a pie en la plaza con todo el progreso', 'input', pl);
      R.check(!!pl.cp && Math.hypot(pl.cp.x - 40, pl.cp.z + 40) < 0.5, 'P12 · el punto seguro queda en la plaza (al recargar se sigue allí)', 'static', pl.cp);
      // P08: ningún texto visible dice Rana/Fennec
      const txt = await page.evaluate(() => { const g = window.__bk; const bad = []; const scan = (s, where) => { if (/\b(Rana|rana|Fennec|FENNEC)\b/.test(s)) bad.push(`${where}: ${s.slice(0, 80)}`); };
        scan(document.body.innerText, 'DOM'); scan(document.getElementById('help-body').innerText, 'ayuda'); for (const s of window.__bkSectors) scan(s.activityLabel, 'objetivo');
        return bad; });
      R.check(txt.length === 0, 'P08 · ningún texto visible dice «Rana» ni «Fennec» (Bellakroak y Bellakat)', 'static', txt);
      await page.close(); }
    // ---------------------------------------------------------------- teléfono horizontal: tamaños y grind de NVDA
    for (const vp of ['phoneLand', 'phone']) {
      const page = await openGame(b, R, { save: { ...SAVE_20, hints: ['basic', 'nv-fennec-intro'], settings: { btnScale: 1 } }, viewport: VIEWPORTS[vp] });
      await clickStart(page); await sleep(800);
      const at = {}; for (const k of [0.5, 1, 1.3, 2]) { await page.evaluate((k) => { window.__bk.state.p.settings.btnScale = k; window.__bk.applySettings(); }, k); await sleep(200); at[k] = overlaps(await rects(page, '#touch > button, #btn-pause')); }
      R.measure(`solapes_${vp}`, at);
      R.check(at[0.5].length === 0 && at[1].length === 0 && at[1.3].length === 0, `P05 · ${vp}: sin botones que se toquen a 50 %, 100 % y 130 %`, 'static', at);
      // R5 (capturas: al 200 % BAJAR se salía por arriba sobre la pausa y AGACHARSE por la izquierda): a pie y en tabla, al 200 % todos los
      // botones quedan dentro de la pantalla y ninguno pisa la pausa; los ajustes dicen hasta cuánto llegan en esta pantalla
      const big = {}; for (const loco of ['walk', 'ride']) { await page.evaluate((loco) => { const g = window.__bk, a = g.manifest.get('nmg.llegada'); g.skater.teleport(a.pos.clone(), a.heading, loco); g.state.p.settings.btnScale = 2; g.applySettings(); }, loco); await sleep(400);
        const L = await rects(page, '#touch > button, #btn-pause'), W = await page.evaluate(() => [innerWidth, innerHeight]);
        big[loco] = { out: L.filter((r) => r.x0 < 0 || r.y0 < 0 || r.x1 > W[0] || r.y1 > W[1]).map((r) => r.id), pause: overlaps(L).filter((o) => o.includes('btn-pause')), n: L.length }; }
      await page.evaluate(() => document.getElementById('btn-settings')?.click()); await sleep(300);
      await page.evaluate(() => document.getElementById('btn-size-open')?.click()); await sleep(300);   // V10.2 Q10: el aviso está en la vista de tamaño
      const lim = await page.evaluate(() => { const w = document.getElementById('opt-btn-warn'); return { hidden: w.hidden, t: w.textContent }; });
      await page.keyboard.press('Escape'); await sleep(200); await page.keyboard.press('Escape'); await sleep(200);
      R.check(['walk', 'ride'].every((l) => big[l].n >= 3 && big[l].out.length === 0 && big[l].pause.length === 0), `P05 · ${vp}: al 200 % (a pie y en tabla) ningún botón se sale de la pantalla ni pisa la pausa`, 'static', big);
      R.measure(`limite_200_${vp}`, lim);
      await page.evaluate(() => { window.__bk.state.p.settings.btnScale = 1; window.__bk.applySettings(); });
      // P16: AGACHARSE en su sitio durante el grind, sin tocar ◀ ▶
      const before = await rects(page, '#btn-crouch');
      await fixture(page, R, `P16 ${vp}: grind de NVDA empezado por código (startRun)`, () => { const g = window.__bk, a = g.manifest.get('nv.retry'); g.skater.teleport(a.pos.clone(), a.heading, 'walk'); g.activities.find((x) => x.id === 'skateTutorial').startRun(); });
      await sleep(1200);
      const during = await rects(page, '#btn-crouch, #btn-lean-l, #btn-lean-r');
      const cr = during.find((x) => x.id === 'btn-crouch');
      R.check(!!cr && Math.abs(cr.x0 - before[0].x0) < 2 && Math.abs(cr.y0 - before[0].y0) < 2 && overlaps(during).length === 0 && during.length === 3, `P16 · ${vp}: en el grind AGACHARSE está en su sitio normal y no toca ◀ ▶`, 'static', { before, during });
      // agacharse lejos del cruce: la pose cambia
      await page.tap('#btn-crouch'); await sleep(500);
      const crouch = await page.evaluate(() => { const a = window.__bk.activities.find((x) => x.id === 'skateTutorial'); return { s: a.s, cruce: a.R.crossing.lower_s, crouched: a.crouched }; });
      R.check(crouch.crouched && crouch.s < crouch.cruce - 4, `P16 · ${vp}: se puede agachar en cualquier tramo del raíl (s ${crouch.s?.toFixed?.(1)} m, cruce en ${crouch.cruce})`, 'input', crouch);
      await page.close();
    }
    // ---------------------------------------------------------------- iPhone (Safari): pregunta una vez por el modo app
    { const page = await b.newPage(); await page.setUserAgent(IPHONE_UA); await page.setViewport(VIEWPORTS.phone);
      await page.evaluateOnNewDocument((s) => { if (!sessionStorage.getItem('__ios')) { sessionStorage.setItem('__ios', '1'); localStorage.setItem('bellakaventuras.remake.save', JSON.stringify(s)); } }, SAVE_20);
      await page.goto('http://127.0.0.1:' + new URL(R.data.url).port + '/?bktest=1', { waitUntil: 'load' }); await page.waitForFunction(() => window.__bk && !document.getElementById('btn-start').disabled, { timeout: 120000 });
      const env = await page.evaluate(() => window.__bkEnv);
      const btnStart = await page.evaluate(() => ({ hidden: document.getElementById('btn-fs-start').hidden, t: document.getElementById('btn-fs-start').textContent }));
      await page.tap('#btn-start'); await sleep(1300);
      const asked = await page.evaluate(() => !document.getElementById('ios-app').hidden);
      await page.tap('#btn-ios-no'); await sleep(300);
      await page.reload({ waitUntil: 'load' }); await page.waitForFunction(() => window.__bk && !document.getElementById('btn-start').disabled, { timeout: 120000 });
      await page.tap('#btn-start'); await sleep(1300);
      const again = await page.evaluate(() => !document.getElementById('ios-app').hidden);
      // V10.4 (cambio de diseño aprobado, W-D36; copia previa en V10/backups/pruebas/V10_4-R10): la partida antigua pregunta por el modo ayuda
      // en 2D al empezar; se contesta (último botón) antes de ir a la pausa
      for (let k = 0; k < 12; k++) { const open = await page.evaluate(() => { const d = document.getElementById('d2'); if (!d || d.hidden) return false; const bs = d.querySelectorAll('.d2-btn'); bs[bs.length - 1]?.click(); return true; }); if (!open) break; await sleep(450); }
      await page.tap('#btn-pause'); await sleep(300);
      const inPause = await page.evaluate(() => ({ hidden: document.getElementById('btn-fs').hidden, t: document.getElementById('btn-fs').textContent }));
      await page.tap('#btn-fs'); await sleep(300);
      const reopened = await page.evaluate(() => !document.getElementById('ios-app').hidden && /pantalla de inicio/i.test(document.getElementById('ios-app').innerText) && /propia partida/i.test(document.getElementById('ios-app').innerText));
      R.check(env?.IOS && asked && !again, 'P01 · iPhone: pregunta UNA vez por el modo app al empezar («Ahora no» → no vuelve a preguntar)', 'input', { env, asked, again });
      R.check(!inPause.hidden && /Modo app/.test(inPause.t) && reopened && /Modo app/.test(btnStart.t), 'P01 · iPhone: desde la pausa se puede volver a ver cómo poner el modo app (y avisa de que guarda aparte)', 'input', { inPause, btnStart, reopened });
      await page.close(); }
  } finally { await b.close(); }
}, { timeoutMs: 400000 });
