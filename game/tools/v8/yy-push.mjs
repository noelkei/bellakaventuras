// V8 · medida auxiliar: velocidad tras N empujones desde parado en llano (umbral del enganche a la pared del vaso). Simulación
// determinista (game.simulate) con W pulsada de verdad; registra la velocidad en cada paso y los contactos de empuje.
import { Report, runTest, launch, openGame, clickStart, sleep } from './lib.mjs';
import { W, HD } from './yy-lib.mjs';
const R = new Report('yy-push');
await runTest(R, async () => {
  const b = await launch();
  try {
    const page = await openGame(b, R); await clickStart(page);
    // llano: deck junto al paseo interior (cota 0), rumbo a lo largo del deck
    await page.evaluate((p, h) => { const g = window.__bk, T = window.__bkTHREE; g.skater.teleport(new T.Vector3(p[0], 0.02, p[2]), h, 'ride'); g.skater.vel.set(0, 0, 0); }, W(-9.0, 26.2), HD(1, 0));
    await page.evaluate(() => window.__bk.simulate(0.5));
    await page.keyboard.down('KeyW');
    const out = await page.evaluate(async () => { const g = window.__bk, s = g.skater, rows = []; let n = 0; s.onPushContact = ((f) => () => { n++; f?.(); })(s.onPushContact);
      await g.simulate(2.6, (t) => rows.push([+t.toFixed(3), +Math.hypot(s.vel.x, s.vel.z).toFixed(3), n, s.pushT > 0 ? +(s.pushT / s.pushCycleNow).toFixed(2) : 0])); return rows; });
    await page.keyboard.up('KeyW');
    // fin del contacto del 2.º empujón: primera muestra con 2 contactos y fase > 0,69
    const end2 = out.find((r) => r[2] >= 2 && r[3] >= 0.69) ?? out.at(-1), end1 = out.find((r) => r[2] >= 1 && r[3] >= 0.69);
    R.measure('tras1', end1); R.measure('tras2', end2); R.measure('serie', out.filter((_, i) => i % 6 === 0));
    console.log('tras 1 empujón', end1, 'tras 2', end2);
  } finally { await b.close(); }
});
