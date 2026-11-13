// V4-AUD-03 · Efectos por evento con TECLADO REAL, leídos del registro del audio (sfxLog: petición → sonó/descartado y
// por qué). Un efecto por hecho físico; empuje solo en la fase de contacto mientras se mantiene W (nada al soltar ni en
// el aire); recepción del truco, manual, scoot; rodadura que cae al parar; sin ráfagas al machacar teclas.
import { Report, runTest, launch, openGame, clickStart, sleep } from './lib.mjs';
const R = new Report('AUD-03', 'sfx-v4');
await runTest(R, async () => {
  const browser = await launch();
  try {
    const page = await openGame(browser, R, { save: null });
    await clickStart(page); await sleep(800);
    const ok = await page.evaluate(() => { const g = window.__bk, T = window.__bkTHREE; document.getElementById('hint').hidden = true; g.skater.teleport(new T.Vector3(-8, 0, 8), Math.PI / 2, 'walk'); g.input.clear(); return g.audio.ctx?.state; });
    R.check(ok === 'running', 'contexto de audio activo tras JUGAR', 'static', { state: ok });
    const mark = () => page.evaluate(() => window.__bk.audio.sfxLog.length);
    const since = (i) => page.evaluate((i) => window.__bk.audio.sfxLog.slice(i).filter((e) => e.ok).map((e) => e.n), i);
    const count = (arr, n) => arr.filter((x) => x === n).length;
    // montar
    let m = await mark(); await page.keyboard.press('KeyQ'); await sleep(700);
    let ev = await since(m); R.check(count(ev, 'mount') === 1, 'Q: un «mount»', 'input', ev);
    // empujar 2,6 s: empujes ≈ ciclos de empuje (0,87 s) y ninguno tras soltar
    m = await mark(); await page.keyboard.down('KeyW'); await sleep(2600); await page.keyboard.up('KeyW');
    const pushHeld = count(await since(m), 'push');
    const m2 = await mark(); await sleep(1400); const after = await since(m2);
    R.check(pushHeld >= 2 && pushHeld <= 4 && count(after, 'push') === 0, 'W mantenida: un «push» por contacto del pie (2–4 en 2,6 s) y ninguno al soltar', 'input', { pushHeld, tras_soltar: after });
    // ollie + machacar Espacio en el aire: un solo «jump», sin empujes en el aire, un «land»
    m = await mark(); await page.keyboard.press('Space'); await sleep(90);
    for (let i = 0; i < 6; i++) { await page.keyboard.down('KeyW'); await page.keyboard.press('KeyK'); await sleep(25); }
    await page.keyboard.up('KeyW'); await sleep(1200);
    ev = await since(m); R.check(count(ev, 'jump') === 1 && count(ev, 'land') >= 1 && count(ev, 'land') <= 2, 'ollie: un «jump» y su «land» (sin duplicados)', 'input', ev);
    // kickflip: recepción (catch) y truco, una vez
    await page.keyboard.down('KeyW'); await sleep(1200); await page.keyboard.up('KeyW');
    m = await mark(); await page.keyboard.press('Space'); await sleep(110); await page.keyboard.press('Space'); await sleep(1400);
    ev = await since(m); R.check(count(ev, 'jump') === 1 && count(ev, 'catch') === 1 && count(ev, 'trick') === 1, 'kickflip: «jump», «catch» al recoger la tabla y «trick» al aterrizar, una vez cada uno', 'input', ev);
    // manual
    await page.keyboard.down('KeyW'); await sleep(1000); await page.keyboard.up('KeyW');
    m = await mark(); await page.keyboard.down('KeyF'); await sleep(900); await page.keyboard.up('KeyF'); await sleep(300);
    ev = await since(m); const manual = await page.evaluate(() => window.__bk.skater.log?.slice?.(-1) ?? null);
    R.check(count(ev, 'manualIn') === 1, 'manual (F mantenida rodando): un «manualIn» al levantar el morro', 'input', { ev, manual });
    // agachado + W = scoot: «scoot», nunca «push»
    m = await mark(); await page.keyboard.down('KeyC'); await sleep(300); await page.keyboard.down('KeyW'); await sleep(1800); await page.keyboard.up('KeyW'); await page.keyboard.up('KeyC'); await sleep(300);
    ev = await since(m); R.check(count(ev, 'scoot') >= 1 && count(ev, 'push') === 0, 'agachado + W: «scoot» y ningún «push»', 'input', ev);
    // frenar hasta parar: la rodadura cae a ~0
    await page.keyboard.down('KeyW'); await sleep(1500); await page.keyboard.up('KeyW');
    const rollMoving = await page.evaluate(() => window.__bk.audio.roll?.gain.gain.value ?? null);
    await page.keyboard.down('KeyS'); for (let i = 0; i < 60; i++) { if (Math.abs(await page.evaluate(() => window.__bk.skater.vLong)) < 0.15) break; await sleep(40); } await page.keyboard.up('KeyS'); await sleep(500);   // S hasta parar (mantenerla más entra en reversa)
    const rollStopped = await page.evaluate(() => ({ g: window.__bk.audio.roll?.gain.gain.value ?? null, v: window.__bk.skater.vLong }));
    R.check(rollMoving > 0.04 && rollStopped.g < 0.01, 'rodadura audible en marcha y que cae al frenar hasta parar', 'input', { rollMoving, rollStopped });
    // negativas: denegaciones repetidas no apilan (bajar a velocidad, machacando Q)
    await page.evaluate(() => { const g = window.__bk, T = window.__bkTHREE; g.skater.teleport(new T.Vector3(-8, 0, 8), Math.PI / 2, 'ride'); g.input.clear(); });   // fixture: colocación en zona abierta, montada
    await page.keyboard.down('KeyW'); await sleep(1600);
    const vq = await page.evaluate(() => window.__bk.skater.vLong);
    m = await mark(); for (let i = 0; i < 8; i++) { await page.keyboard.press('KeyQ'); await sleep(30); } await page.keyboard.up('KeyW'); await sleep(200);
    R.note({ velocidad_al_machacar_Q: vq });
    const all = await page.evaluate((i) => window.__bk.audio.sfxLog.slice(i), m);
    R.check(all.filter((e) => e.n === 'deny' && e.ok).length <= 2 && all.some((e) => e.n === 'deny' && !e.ok && e.why === 'enfriamiento'), 'Q repetida a velocidad: «deny» con enfriamiento (no se apila)', 'input', all.map((e) => `${e.n}:${e.ok ? 'ok' : e.why}`));
    R.pendingHuman('Escucha de la mezcla de efectos (volumen bajo, altavoz y auriculares) por el usuario');
  } finally { await browser.close(); }
});
