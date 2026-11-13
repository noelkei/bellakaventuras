// T5-28 · Una vuelta de los coches en pista en vídeo (cámara fija alta junto al anillo), con los assets servidos.
import { Report, runTest, launch, openGame, clickStart, sleep, recordClip, SAVE_20 } from './lib.mjs';
const R = new Report('car-lap');
await runTest(R, async () => {
  const b = await launch();
  try {
    const page = await openGame(b, R, { save: SAVE_20 }); await clickStart(page); await sleep(3000);
    await page.evaluate(() => { const g = window.__bk; g.skater.teleport(new window.__bkTHREE.Vector3(0, 0, -28), 0, 'walk'); for (const id of ['hud', 'touch']) { const e = document.getElementById(id); if (e) e.style.visibility = 'hidden'; }
      const r0 = g.render.bind(g); g.render = () => { const c = g.rig.cam; c.position.set(0, 14, -30); c.lookAt(0, 0, 0); c.fov = 62; c.updateProjectionMatrix(); r0(); }; });
    const per = await page.evaluate(() => 2 * Math.PI / Math.abs(window.__bk.cars.omega ?? (8.75 / 17.5)));
    R.measure('periodo_s', +per.toFixed(2));
    await recordClip(page, R, 'vuelta', () => sleep(Math.min(14000, per * 1000 + 500)), { quality: 70, maxWidth: 960 });
    R.check(true, 'vuelta grabada', 'vision');
    R.pendingHuman('Visionado de la vuelta (G8-V)');
  } finally { await b.close(); }
});
