// V4-CAM-01/03 · Cámara finita y pausa por foco. Positivo: órbita con ratón y J/L, recentrar, 10 ciclos de pausa → 0
// inválidos. Negativos sensibles (inyección DECLARADA en el rig, no en el juego): yaw NaN, distancia Infinity y objetivo
// fijo NaN → recuperación finita en el mismo fotograma, cerca de ANMI, sin recargar ni perder progreso, con registro del
// primer inválido. Foco: blur de ventana con W mantenida → pausa (simulación y audio), teclas soltadas; al volver la W
// que «sigue pulsada» no actúa hasta volver a pulsarla.
import { Report, runTest, launch, openGame, clickStart, sleep } from './lib.mjs';
const R = new Report('CAM-01', 'cam-v4');
await runTest(R, async () => {
  const browser = await launch();
  try {
    const page = await openGame(browser, R, { save: null });
    await clickStart(page); await sleep(800);
    await page.evaluate(() => { window.__marker = 'sin-recarga'; document.getElementById('hint').hidden = true; });
    const cam = () => page.evaluate(() => { const g = window.__bk, c = g.rig.cam.position, f = g.skater.visualPos; return { p: c.toArray(), fin: [c.x, c.y, c.z, g.rig.cam.fov].every(Number.isFinite), d: Math.hypot(c.x - f.x, c.y - f.y, c.z - f.z), inv: { ...g.rig.invalid }, marker: window.__marker, collected: g.state.p.collected.length, paused: g.paused }; });
    // positivo: órbita/recentrado/pausas
    const box = await page.evaluate(() => { const r = document.getElementById('game').getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2]; });
    await page.mouse.move(box[0], box[1]); await page.mouse.down(); for (let i = 0; i < 20; i++) await page.mouse.move(box[0] + i * 15, box[1] + i * 4); await page.mouse.up();
    await page.keyboard.down('KeyJ'); await sleep(700); await page.keyboard.up('KeyJ'); await page.keyboard.down('KeyL'); await sleep(700); await page.keyboard.up('KeyL');
    await page.keyboard.press('KeyR'); await sleep(500);
    for (let i = 0; i < 10; i++) { await page.keyboard.press('Escape'); await sleep(120); await page.keyboard.press('Escape'); await sleep(120); }
    let c = await cam();
    R.check(c.fin && c.inv.count === 0 && !c.paused, 'órbita (ratón, J/L), recentrar y 10 pausas: cámara finita y 0 inválidos', 'input', c);
    // negativos: inyección declarada en el rig
    for (const [name, code] of [['yaw NaN', 'g.rig.yaw = NaN'], ['distNow Infinity', 'g.rig.distNow = Infinity'], ['objetivo fijo NaN', 'g.rig.toFixed({ pos: new T.Vector3(NaN, 2, 0), target: new T.Vector3(0, NaN, 0), hfov: 60 }, true)']]) {
      const before = await cam();
      R.fixture(`inyección en el rig: ${name}`, true);
      await page.evaluate((code) => { const g = window.__bk, T = window.__bkTHREE; eval(code); }, code);
      await sleep(120);
      c = await cam();
      R.check(c.fin && c.d < 12 && c.inv.count > before.inv.count && c.marker === 'sin-recarga' && c.collected === before.collected, `${name}: pose finita cerca de ANMI en el acto, inválido registrado, sin recarga ni pérdida de progreso`, 'unit', { d: +c.d.toFixed(2), count: c.inv.count, recoveries: c.inv.recoveries });
      await page.evaluate(() => { const g = window.__bk; if (g.rig.mode !== 'follow') g.rig.toFollow(g.skater, true); });
    }
    const first = (await cam()).inv;
    R.check(!!first.first && 'yaw' in first.first && 'target' in first.first, 'se conserva el contexto del PRIMER inválido (modo, yaw, objetivo, pose)', 'unit', first.first);
    // foco: blur con W mantenida → pausa; W «pegada» no actúa al volver
    await page.evaluate(() => { const g = window.__bk, T = window.__bkTHREE; g.skater.teleport(new T.Vector3(-8, 0, 8), Math.PI / 2, 'ride'); g.input.clear(); });
    await page.keyboard.down('KeyW'); await sleep(900);
    const s0 = await page.evaluate(() => ({ steps: window.__bk.stats.steps, v: window.__bk.skater.vLong }));
    await page.evaluate(() => window.dispatchEvent(new Event('blur')));
    await sleep(600);
    const s1 = await page.evaluate(() => ({ paused: window.__bk.paused, steps: window.__bk.stats.steps, audio: window.__bk.audio.ctx?.state, menu: !document.getElementById('pause').hidden }));
    await sleep(600);
    const s2 = await page.evaluate(() => window.__bk.stats.steps);
    R.check(s1.paused && s1.menu && s2 === s1.steps, 'blur de ventana: pausa con menú y la simulación no avanza', 'input', { s1, s2 });
    R.check(s1.audio === 'suspended' || s1.audio === 'suspending', 'blur: el audio se suspende', 'input', { audio: s1.audio });
    await page.evaluate(() => window.dispatchEvent(new Event('focus')));
    await page.keyboard.press('Escape'); await sleep(250);   // continuar (la W física sigue «pulsada» en el navegador)
    const va = await page.evaluate(() => window.__bk.skater.vLong); await sleep(1000); const vb = await page.evaluate(() => ({ v: window.__bk.skater.vLong, push: window.__bk.skater.pushing }));
    await page.keyboard.up('KeyW');
    R.check(!vb.push && vb.v <= va + 0.05, 'al continuar, la W que quedó pulsada no empuja hasta volver a pulsarla (sin entrada residual)', 'input', { s0, va, vb });
  } finally { await browser.close(); }
});
