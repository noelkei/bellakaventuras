// T5-01/T5-06 · Pausa interna y entrada mantenida (SOL-006, OPUS-019, DT-18). Teclado real (keydown/keyup de puppeteer;
// no hay autorrepetición: una tecla mantenida emite un solo keydown, como un teclado físico sin repeat al reanudar).
// Casos (a pie y en tabla donde aplica):
//  1. W mantenida durante la pausa → al reanudar sigue empujando/andando (V4: se pierde).
//  2. W soltada durante la pausa → al reanudar no hay propulsión.
//  3. Espacio mantenido durante la pausa → al reanudar NO salta (los bordes discretos se descartan; control negativo).
//  4. A mantenida durante la pausa → al reanudar sigue girando.
//  5. W mantenida, pausa → Ajustes → cerrar Ajustes → reanudar → sigue empujando (modales internos encadenados).
//  6. Pérdida de foco de la ventana (blur, emulado con un evento declarado) → todo se suelta y no vuelve solo.
import { Report, runTest, launch, openGame, clickStart, sleep, place, snap } from './lib.mjs';

const R = new Report('pause-input');

await runTest(R, async () => {
  const b = await launch();
  try {
    const page = await openGame(b, R); await clickStart(page);
    const kb = page.keyboard;
    const thr = () => page.evaluate(() => ({ thr: window.__bk.skater.throttle, steer: window.__bk.skater.steer, paused: window.__bk.paused, v: Math.hypot(window.__bk.skater.vel.x, window.__bk.skater.vel.z), jumps: window.__bk.input.stats.jumps, g: window.__bk.skater.grounded }));
    const pauseToggle = async () => { await kb.press('Escape'); await sleep(350); };
    const res = {};
    for (const loco of ['walk', 'ride']) {
      // 1
      await place(page, R, [-14, 0, -2], 0, loco, `caso1 ${loco}`); await sleep(300);
      await kb.down('KeyW'); await sleep(600); await pauseToggle();
      const p1 = await thr(); await pauseToggle(); await sleep(500); const a1 = await thr(); await kb.up('KeyW');
      res[`1-W-mantenida-${loco}`] = { pausedSeen: p1.paused, after: a1, ok: a1.thr > 0.5 };
      // 2
      await place(page, R, [-14, 0, -2], 0, loco, `caso2 ${loco}`); await sleep(300);
      await kb.down('KeyW'); await sleep(600); await pauseToggle(); await kb.up('KeyW'); await sleep(200); await pauseToggle(); await sleep(500);
      const a2 = await thr(); res[`2-W-soltada-${loco}`] = { after: a2, ok: a2.thr === 0 };
      // 3
      await place(page, R, [-14, 0, -2], 0, loco, `caso3 ${loco}`); await sleep(300);
      const j0 = (await thr()).jumps;
      await kb.down('Space'); await sleep(30); await pauseToggle(); await sleep(200); await pauseToggle(); await sleep(400);
      const a3 = await thr(); await kb.up('Space');
      res[`3-Espacio-mantenido-${loco}`] = { jumpsDelta: a3.jumps - j0, ok: a3.jumps - j0 <= 1 };
      // 4
      await place(page, R, [-14, 0, -2], 0, loco, `caso4 ${loco}`); await sleep(300);
      await kb.down('KeyA'); await sleep(300); await pauseToggle(); await pauseToggle(); await sleep(400);
      const a4 = await thr(); await kb.up('KeyA');
      res[`4-A-mantenida-${loco}`] = { after: a4, ok: a4.steer < -0.5 };
    }
    // 5 (en tabla)
    await place(page, R, [-14, 0, -2], 0, 'ride', 'caso5'); await sleep(300);
    await kb.down('KeyW'); await sleep(500); await pauseToggle();
    await page.click('#btn-settings'); await sleep(300); await page.click('#btn-settings-close'); await sleep(300);
    await page.click('#btn-resume'); await sleep(500);
    const a5 = await thr(); await kb.up('KeyW');
    res['5-W-ajustes-encadenados'] = { after: a5, ok: a5.thr > 0.5 && !a5.paused };
    // 6 blur (emulado)
    await place(page, R, [-14, 0, -2], 0, 'ride', 'caso6'); await sleep(300);
    await kb.down('KeyW'); await sleep(400);
    await page.evaluate(() => window.dispatchEvent(new Event('blur')));
    R.fixture('blur de ventana emulado con window.dispatchEvent(new Event("blur"))', {});
    await sleep(300); const p6 = await thr(); await pauseToggle(); await sleep(400); const a6 = await thr(); await kb.up('KeyW');
    res['6-blur-suelta-todo'] = { pausedSeen: p6.paused, after: a6, ok: p6.paused && a6.thr === 0 };
    R.measure('casos', res);
    for (const [k, v] of Object.entries(res)) R.check(v.ok, k, k.startsWith('6') ? 'emulation' : 'input', v);
  } finally { await b.close(); }
});
