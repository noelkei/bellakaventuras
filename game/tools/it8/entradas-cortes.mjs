// IT8 · guardián de entradas cortadas (candidatos de V10/IT8/borradores/codigo_entradas.md):
//  CE-01 · grind con el dedo: pausar (II con otro dedo) con el dedo apoyado en ◀, soltarlo en la pausa y seguir: el equilibrio NO queda
//          pulsado (input.read().x vuelve a 0) y, ya fuera del grind, ANMI no gira sola.
//  CE-05 · en la cinemática del parque con la pausa abierta, Esc cierra la pausa (no salta la cinemática de debajo) y «SALTAR ▸» no queda
//          encima de la pausa.
//  CE-06 · con la pausa abierta sobre la pregunta del modo ayuda, las flechas no llevan el foco al 2D de detrás y Intro no la contesta.
//  CE-07 · en el grafiti de la rana con mando, A no sale de la actividad.
//  CE-08 · «Pantalla: Horizontal» con el móvil en vertical (imagen girada por el juego): el lienzo del grafiti cabe en la pantalla.
//  CE-11 · un dedo apoyado en el joystick cuando se abre y se cierra una charla: al cerrarla, ANMI sigue respondiendo al dedo (anda).
//  CE-12 · cerrar el aviso de «Modo app» del iPhone con Esc lo da por contestado (no vuelve a salir al recargar).
import { Report, runTest, launch, sleep, arg } from '../v8/lib.mjs';
import { FRESH } from '../v10_2/lib102.mjs';
import { open8, start8, dev, S0, S20, toAct, actBusy, onTop, center, tapOrClick, Fingers, pad, padTap, PAD, until, reload8, saveJson } from './lib8.mjs';
const R = new Report('it8-entradas-cortes', { task: arg('task', 'IT8') });
const CASOS = (arg('casos') ?? 'CE-01,CE-05,CE-06,CE-07,CE-08,CE-11,CE-12').split(',');
const S_YY = { ...S0, partials: { tutorialStep: 0, tutorialStarted: false, bridgeRest: -1, graffitiMask: null, graffitiCheck: 0, danceRounds: 0, graffitiIntro: true } };
const readX = (page) => page.evaluate(() => { const f = window.__bk.input.read?.(); return f ? { x: f.x ?? f.move?.x, y: f.y ?? f.move?.y } : null; });
await runTest(R, async () => {
  const b = await launch(); const out = {};
  try {
    if (CASOS.includes('CE-01')) { const page = await open8(b, R, dev('ip14'), 'h', { save: S20 }); await start8(page, true); await sleep(1200);
      await toAct(page, 'act.skateTutorial'); await until(page, () => !document.getElementById('prompt').hidden, 4000); await tapOrClick(page, '#btn-action', true); await until(page, () => document.body.classList.contains('grind'), 6000); await sleep(1500);
      const F = await new Fingers(page).init(); const L = await center(page, '#btn-lean-l');
      if (!L) R.invalid('CE-01: sin botón ◀ visible'); else {
        await F.down(3, L.x, L.y); await sleep(300); const durante = await readX(page);
        await F.tap('#btn-pause'); await sleep(500); await F.up(3); await sleep(300);
        await tapOrClick(page, '#btn-resume', true); await sleep(500); const tras = await readX(page);
        // V10.6 (preparación, V10/IT9/REGISTRO_V10_6.md): tras una caída del grind el juego recoloca a ANMI en el reintento 0,6–0,9 s después (programado,
        // sin token): se espera a que el grind esté apagado y a esa recolocación antes de medir el giro (antes caía a veces dentro de la ventana)
        await page.evaluate(() => { const g = window.__bk; for (const a of g.activities) if (a.busy) a.cancel?.(); }); await sleep(800);
        await until(page, () => window.__bk.activities.find((x) => x.id === 'skateTutorial')?.phase === 'off', 3000); await sleep(1000);
        const h0 = await page.evaluate(() => window.__bk.skater.heading); await sleep(1500); const h1 = await page.evaluate(() => window.__bk.skater.heading);
        out['CE-01'] = { durante, tras, giroFuera: +(h1 - h0).toFixed(3) };
        R.check(tras && Math.abs(tras.x ?? 0) < 0.01 && Math.abs(h1 - h0) < 0.05, 'CE-01 · pausar con el dedo en ◀ del grind y soltarlo en la pausa: al seguir, el equilibrio no queda pulsado ni ANMI gira sola', 'input', out['CE-01']);
      } await F.close(); await page.close(); }
    if (CASOS.includes('CE-05')) { const page = await open8(b, R, dev('pc720'), 'h', { save: { ...FRESH, settings: { iosAppAsked: true } }, query: '?bktest=1' }); await start8(page, false);
      await until(page, () => { const d = document.getElementById('d2'); return d && !d.hidden; }, 15000); await sleep(600); await page.keyboard.press('KeyT');
      const t0 = Date.now(); while (Date.now() - t0 < 60000) { if (await page.evaluate(() => window.__bk.narr.inCine)) break; const dd = await page.evaluate(() => { const d = document.getElementById('d2'); return d && !d.hidden ? d.querySelectorAll('.d2-row .d2-btn:not(.d2-skip)').length : 0; }); if (dd >= 2) { await sleep(450); await page.evaluate(() => { const bs = [...document.querySelectorAll('#d2 .d2-row .d2-btn:not(.d2-skip)')]; bs.at(-1).click(); }); } else if (dd) { await sleep(450); await page.keyboard.press('KeyE'); } await sleep(250); }
      if (!(await page.evaluate(() => window.__bk.narr.inCine))) R.invalid('CE-05: no llegó la cinemática'); else {
        await sleep(1500); await page.evaluate(() => window.__bk.setPaused(true)); await sleep(500);
        const skipTop = await onTop(page, '#btn-cine-skip'); const resumeTop = await onTop(page, '#btn-resume');
        await page.keyboard.press('Escape'); await sleep(700);
        const r = await page.evaluate(() => ({ paused: window.__bk.paused, cine: window.__bk.narr.inCine }));
        out['CE-05'] = { skipTop, resumeTop, trasEsc: r };
        R.check(!r.paused && r.cine, 'CE-05 · en la cinemática con la pausa abierta, Esc cierra la pausa y la cinemática sigue', 'input', out['CE-05']);
        R.check(!skipTop.ok && resumeTop.ok, 'CE-05 · con la pausa abierta, «SALTAR ▸» no queda encima de la pausa', 'emulation', { skipTop, resumeTop });
      } await page.close(); }
    if (CASOS.includes('CE-06')) { const page = await open8(b, R, dev('pc720'), 'h', { save: { ...S0, collected: ['no_me_guillo.visible'], narr: { v: 1, estado: 'antigua', paso: '', practica: false, vistos: [], ayuda: null } }, query: '?bktest=1' }); await start8(page, false);
      let q = null; const t0 = Date.now(); while (Date.now() - t0 < 25000) { const n = await page.evaluate(() => { const d = document.getElementById('d2'); return d && !d.hidden ? d.querySelectorAll('.d2-row .d2-btn:not(.d2-skip)').length : 0; }); if (n >= 2) { q = n; break; } if (n === 1) { await sleep(450); await page.keyboard.press('KeyE'); } await sleep(250); }
      if (!q) R.invalid('CE-06: no salió la pregunta'); else {
        await sleep(500); await page.keyboard.press('Escape'); await sleep(600);
        const foc = []; for (const k of ['ArrowDown', 'ArrowRight', 'ArrowDown', 'ArrowLeft', 'KeyD', 'KeyA']) { await page.keyboard.press(k); await sleep(150); foc.push(await page.evaluate(() => { const a = document.activeElement; return { id: a?.id || a?.className, enPausa: !!a?.closest('#pause'), enD2: !!a?.closest('#d2') }; })); }
        const fuera = foc.filter((f) => f.enD2);
        await page.keyboard.press('Enter'); await sleep(500); const ay = await page.evaluate(() => ({ ayuda: window.__bk.state.p.narr.ayuda, paused: window.__bk.paused }));
        out['CE-06'] = { foc, ayuda: ay };
        R.check(!fuera.length && ay.ayuda === null, 'CE-06 · con la pausa sobre la pregunta del modo ayuda, las flechas no llevan el foco al 2D de detrás y Intro no la contesta', 'input', out['CE-06']);
      } await page.close(); }
    if (CASOS.includes('CE-07')) { const page = await open8(b, R, dev('pc1080'), 'h', { save: S_YY }); await pad(page, {}); await padTap(page, PAD.A); await sleep(1500);
      if (!(await page.evaluate(() => window.__bk.started))) await start8(page, false);
      await page.evaluate(async () => { await window.__bk.loadNpc('rana'); }); await toAct(page, 'act.graffiti'); await sleep(1500); await padTap(page, PAD.Y);
      const ok = await until(page, () => { const a = window.__bk.activities.find((x) => x.id === 'graffiti'); return a.busy && a.phase === 'paint'; }, 10000);
      if (!ok) R.invalid('CE-07: no llegó a pintar'); else {
        await sleep(600); const foco = await page.evaluate(() => document.activeElement?.id); await padTap(page, PAD.A); await sleep(700);
        const r = await page.evaluate(() => { const a = window.__bk.activities.find((x) => x.id === 'graffiti'); return { busy: a.busy, phase: a.phase }; });
        out['CE-07'] = { foco, trasA: r };
        R.check(r.busy && r.phase === 'paint', 'CE-07 · en el grafiti de la rana, A del mando no sale de la actividad', 'input', out['CE-07']);
      } await page.close(); }
    if (CASOS.includes('CE-08')) { const page = await open8(b, R, dev('ip14'), 'v', { save: { ...S_YY, settings: { iosAppAsked: true, orientation: 'horizontal' } } }); await start8(page, true); await sleep(1200);
      await page.evaluate(async () => { await window.__bk.loadNpc('rana'); }); await toAct(page, 'act.graffiti'); await sleep(1500); await tapOrClick(page, '#btn-action', true);
      const ok = await until(page, () => { const a = window.__bk.activities.find((x) => x.id === 'graffiti'); return a.busy && a.phase === 'paint'; }, 10000);
      if (!ok) R.invalid('CE-08: no llegó a pintar'); else { await sleep(800);
        const r = await page.evaluate(() => { const c = document.getElementById('graffiti-canvas').getBoundingClientRect(); return { rot: document.documentElement.className, c: [Math.round(c.left), Math.round(c.top), Math.round(c.right), Math.round(c.bottom)], W: innerWidth, H: innerHeight }; });
        const cabe = r.c[0] >= -1 && r.c[1] >= -1 && r.c[2] <= r.W + 1 && r.c[3] <= r.H + 1;
        out['CE-08'] = r; R.check(cabe, '«Pantalla: Horizontal» con el móvil en vertical: el lienzo del grafiti cabe entero en la pantalla', 'emulation', r);
        await page.screenshot({ path: R.file_('CE-08.png') });
      } await page.close(); }
    if (CASOS.includes('CE-11')) { const page = await open8(b, R, dev('ip14'), 'h', { save: S20 }); await start8(page, true); await sleep(1200);
      await toAct(page, 'act.pantherTalk'); await until(page, () => !document.getElementById('prompt').hidden, 4000);
      const F = await new Fingers(page).init(); await F.stick(180, 0.2); await sleep(100); await F.tap('#btn-action'); await sleep(1500);
      // V10.6 (preparación): la frase de La Pantera sale cuando llega la cámara (puede tardar más de 1,5 s): se espera a verla antes de cerrarla, y a
      // que la charla termine (explorando) antes de mover el dedo (antes se movía con la charla aún abierta y medía 0 m siempre)
      await until(page, () => !document.getElementById('dialog').hidden, 6000);
      // V10.6 (preparación, V10/IT9/REGISTRO_V10_6.md): en la emulación de Chrome el toque de un 2.º dedo con el pulgar apoyado no llega a «Vale»
      // (va a otro elemento aunque «Vale» esté debajo: medido con v10_6/sonda-ce11b) y la charla no se cerraba nunca; se cierra con su clic y el
      // pulgar sigue apoyado, que es lo que mide CE-11 (que ese dedo vuelva a mandar al cerrar la charla)
      for (let i = 0; i < 4 && await page.evaluate(() => !document.getElementById('dialog').hidden); i++) { await page.evaluate(() => document.getElementById('dialog-ok').click()); await sleep(700); }
      await until(page, () => window.__bk.mode === 'explore', 4000);
      const p0 = await page.evaluate(() => [window.__bk.skater.footPos.x, window.__bk.skater.footPos.z]); await F.stick(0, 1); await sleep(1500);
      const p1 = await page.evaluate(() => [window.__bk.skater.footPos.x, window.__bk.skater.footPos.z]); await F.close();
      const d = Math.hypot(p1[0] - p0[0], p1[1] - p0[1]); out['CE-11'] = { d: +d.toFixed(2) };
      R.check(d > 1, `CE-11 · con el dedo apoyado en el joystick durante una charla, al cerrarla ANMI sigue respondiendo al dedo (${d.toFixed(2)} m)`, 'input', out['CE-11']); await page.close(); }
    if (CASOS.includes('CE-12')) { const page = await open8(b, R, dev('ip14'), 'v', { save: { ...S0, settings: {} } });
      const bb = await center(page, '#btn-start'); await page.touchscreen.tap(bb.x, bb.y); await sleep(1500);
      const ios = await page.evaluate(() => !document.getElementById('ios-app').hidden);
      if (!ios) R.invalid('CE-12: no salió el aviso de Modo app'); else {
        await page.keyboard.press('Escape'); await sleep(500); const asked = await page.evaluate(() => window.__bk.state.p.settings.iosAppAsked);
        await reload8(page); const b2 = await center(page, '#btn-start'); await page.touchscreen.tap(b2.x, b2.y); await sleep(1500); const otra = await page.evaluate(() => !document.getElementById('ios-app').hidden);
        out['CE-12'] = { asked, otraVez: otra }; R.check(!otra, 'CE-12 · cerrar el aviso de «Modo app» con Esc lo da por contestado (no vuelve a salir)', 'input', out['CE-12']);
      } await page.close(); }
    saveJson('entradas-cortes/resultado.json', out);
  } finally { await b.close(); }
}, { timeoutMs: 1200000 });
