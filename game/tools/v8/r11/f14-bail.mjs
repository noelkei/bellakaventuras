// R11 · F14 · copia de la sonda AUD-JUG/ANIM/bail.mjs (mismas comprobaciones; solo cambian rutas y nombre del informe).
// AUD-JUG/ANIM · caída suave (bail) rodando en llano: vértice más bajo del CUERPO frente al suelo (la guarda de suelo solo actúa en impacto,
// bailes y agachada), saltos de pose y capturas en secuencia. Fixture declarada: `skater.bail('prueba')` en marcha (el mismo método que
// llama el juego al aterrizar un truco incompleto o cruzado).
import { Report, runTest, launch, openGame, clickStart, sleep, place, installHelpers, sim, FV, FH } from './f14-anim-lib.mjs';
const R = new Report('r11-f14-bail');
await runTest(R, async () => {
  const b = await launch();
  try {
    const page = await openGame(b, R); await clickStart(page); await sleep(2000); await installHelpers(page);
    await page.evaluate(() => window.__bkCamFadeUniform?.value.set(0, 0.01));
    for (let rep = 1; rep <= 2; rep++) {
      await place(page, R, FV(12, 11.0), FH(-1, 0), 'ride', `bail #${rep}`); await sim(page, 0.3);
      const r = await page.evaluate(async () => { const g = window.__bk, s = g.skater, V = g.visual, T = window.__bkTHREE, RA = window.__bkRapier; const v = new T.Vector3(); window.__K('KeyW', true); await window.__sim(1.2); window.__K('KeyW', false);
        s.bail('prueba'); const rows = []; let prevRel = null; const hips = V.body.skeleton.bones.find((b) => /Hips$/.test(b.name));
        for (let i = 0; i < 150; i++) { await window.__sim(1 / 60); V.root.updateMatrixWorld(true); V.body.skeleton.update(); let lo = 9; const P = V.body.geometry.attributes.position; for (let k = 0; k < P.count; k += 6) { V.body.getVertexPosition(k, v).applyMatrix4(V.body.matrixWorld); if (v.y < lo) lo = v.y; }
          const hit = g.world.castRay(new RA.Ray({ x: s.footPos.x, y: s.footPos.y + 1, z: s.footPos.z }, { x: 0, y: -1, z: 0 }), 3, true, RA.QueryFilterFlags.EXCLUDE_SENSORS, undefined, s.collider); const gy = hit ? s.footPos.y + 1 - hit.timeOfImpact : 0;
          const rel = hips.getWorldPosition(new T.Vector3()).sub(V.root.position); const j = prevRel ? rel.distanceTo(prevRel) : 0; prevRel = rel;
          rows.push([+(i / 60).toFixed(3), s.loco, V.currentName, +(lo - gy).toFixed(3), +j.toFixed(3)]); if (s.loco !== 'bail' && i > 30) break; }
        return rows; });
      const minBody = Math.min(...r.map((x) => x[3])), maxJ = Math.max(...r.map((x) => x[4]));
      R.note({ caso: `bail #${rep}`, frames: r.length, cuerpoMin: minBody, caderaMax: maxJ, clips: [...new Set(r.map((x) => x[2]))], muestra: r.filter((_, i) => i % 10 === 0) });
      R.check(minBody > -0.05, `bail #${rep}: ninguna parte del cuerpo se hunde > 5 cm en el suelo`, 'vision', { minBody });
      R.check(maxJ < 0.12, `bail #${rep}: sin saltos de pose > 12 cm/fotograma`, 'vision', { maxJ });
      if (rep === 1) for (const tt of [0.2, 0.5, 0.9]) { await place(page, R, FV(12, 11.0), FH(-1, 0), 'ride', `bail captura ${tt}`); await sim(page, 0.3);
        await page.evaluate(async (tt) => { const s = window.__bk.skater; window.__K('KeyW', true); await window.__sim(1.2); window.__K('KeyW', false); s.bail('prueba'); await window.__sim(tt); }, tt);
        await page.evaluate(() => window.__bk.render()); await R.shot(page, `bail_${tt}s`); }
    }
  } finally { await b.close(); }
});
