// V6 R3 · captura del cartel de FASHION GIRL (lettering principal) por sus dos caras, calculada desde la malla FG_LETTERING.
import { Report, runTest, launch, openGame, clickStart, sleep, directShot } from './lib.mjs';
const R = new Report('fg-cartel');
await runTest(R, async () => {
  const b = await launch();
  try {
    const page = await openGame(b, R); await clickStart(page); await sleep(3000);
    const m = await page.evaluate(() => { const g = window.__bk, o = g.park.root.getObjectByName('FG_LETTERING'); if (!o) return null;
      const n = new window.__bkTHREE.Vector3(0, 0, 1).applyQuaternion(o.quaternion); return { p: o.position.toArray(), n: n.toArray(), tex: !!o.material.map?.image }; });
    R.check(!!m && m.tex, 'cartel FG con la textura del lettering cargada', 'static', m);
    for (const [lab, sg] of [['delante', 1], ['detras', -1]]) {
      const [x, y, z] = m.p, [nx, , nz] = m.n;
      await directShot(page, R, `cartel_${lab}`, [x + sg * nx * 4.2 + nz * 0.8, 1.7, z + sg * nz * 4.2 - nx * 0.8], [x, y - 0.1, z], 55);
    }
  } finally { await b.close(); }
});
