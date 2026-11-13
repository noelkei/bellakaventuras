// R11 · F1 · SIS-01: dos pestañas no se borran el progreso; «Reiniciar» en una no lo deshace la otra.
import { Report, runTest, URLS, argUrl } from '../lib.mjs';
import { launch, openGame, clickStart, sleep, SAVE_NUEVA } from './lib-r11.mjs';
const R = new Report('r11-f1-pestanas');
const KEY = 'bellakaventuras.remake.save';
await runTest(R, async () => {
  for (let k = 1; k <= 2; k++) { const b = await launch(); try {
    const A = await openGame(b, R, { save: SAVE_NUEVA }); await clickStart(A); await sleep(800);
    const B = await b.newPage(); await B.setViewport({ width: 1280, height: 720 }); await B.goto(argUrl() + '?bktest=1&narr=off', { waitUntil: 'load' });
    await B.waitForFunction(() => window.__bk && !document.getElementById('btn-start').disabled, { timeout: 120000 }); await B.click('#btn-start'); await B.waitForFunction(() => window.__bk.started); await sleep(800);
    const col = (page, id) => page.evaluate((id) => { const g = window.__bk, p = g.pickups.find((q) => q.id === id); p.available = true; g.collect(p); return g.state.total; }, id);
    await col(A, 'no_me_guillo.visible'); await sleep(400); await col(B, 'nosvamosdeaqui.visible'); await sleep(400);
    const disk = await A.evaluate((K) => JSON.parse(localStorage.getItem(K)).collected, KEY);
    const bVeA = await B.evaluate(() => window.__bk.state.isCollected('no_me_guillo.visible'));
    R.check(disk.includes('no_me_guillo.visible') && disk.includes('nosvamosdeaqui.visible'), `#${k} SIS-01: el guardado conserva las patatas de las dos pestañas (${JSON.stringify(disk)})`, 'input', { disk });
    R.check(bVeA, `#${k} SIS-01: la pestaña B sabe que A ya recogió su patata`, 'input', { bVeA });
    // Reiniciar en A y luego B se mueve/guarda: el disco sigue reiniciado
    await A.evaluate(() => { window.__bk.state.reset(); }); await sleep(300);
    await B.evaluate(() => { window.__bk.state.save(); }); await sleep(300);
    const disk2 = await A.evaluate((K) => JSON.parse(localStorage.getItem(K)).collected, KEY);
    R.check(disk2.length === 0, `#${k} SIS-01: «Reiniciar» en una pestaña no lo deshace la otra al guardar (${JSON.stringify(disk2)})`, 'input', { disk2 });
  } finally { await b.close(); } }
}, { timeoutMs: 600000 });
