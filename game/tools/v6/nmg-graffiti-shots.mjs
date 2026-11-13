// V6 R4 · capturas de los grafitis NMG (murales v6) en el juego: cada pieza con grafiti desde sus cuatro lados.
import { Report, runTest, launch, openGame, clickStart, sleep, directShot } from './lib.mjs';
const R = new Report('nmg-graffiti-shots');
const PIECES = ['nmg_quarter', 'nmg_box_small', 'nmg_box_medium', 'nmg_u', 'nmg_ledge_long'];
await runTest(R, async () => {
  const b = await launch();
  try {
    const page = await openGame(b, R); await clickStart(page); await sleep(4000);
    const info = await page.evaluate((names) => { const g = window.__bk, T = window.__bkTHREE, kit = g.park.root.getObjectByName('NMG_KIT'); const out = {};
      let swapped = false; kit?.traverse((m) => { if (m.isMesh && m.material?.name === 'M_nmg_mural' && /murals_v6/.test(m.material.map?.image?.src ?? '')) swapped = true; });
      for (const n of names) { const o = kit?.getObjectByName(`${n}_slot`); if (!o) continue; const bb = new T.Box3().setFromObject(o); const c = bb.getCenter(new T.Vector3()), sz = bb.getSize(new T.Vector3()); out[n] = { c: c.toArray(), sz: sz.toArray(), yaw: o.rotation.y }; }
      return { out, swapped }; }, PIECES);
    R.check(info.swapped, 'material de murales del kit NMG con el atlas v6 (cinco grafitis)', 'static', { swapped: info.swapped });
    const ov = await page.evaluate(() => window.__bk.park.nmgGraffiti);
    R.check(ov && ov.meshes >= 4 && ov.tris > 0, 'capa de grafitis NMG en alta resolución montada sobre las caras', 'static', ov);
    { const { c, yaw } = info.out.nmg_quarter;   // de cerca: trasera del quarter (gato y pantera), dos encuadres
      const dx = Math.sin(yaw), dz = Math.cos(yaw), rx = Math.cos(yaw), rz = -Math.sin(yaw);
      for (const [lab, sh] of [['cerca_pantera_a', 1.2], ['cerca_pantera_b', -1.2]]) await directShot(page, R, lab, [c[0] + dx * 4.4 + rx * sh, 1.1, c[2] + dz * 4.4 + rz * sh], [c[0] + rx * sh, 0.75, c[2] + rz * sh], 50); }
    for (const [n, { c, sz, yaw }] of Object.entries(info.out)) {
      const d = Math.max(sz[0], sz[2]) * 0.9 + 2.2;
      for (let k = 0; k < 4; k++) { const a = yaw + k * Math.PI / 2, dx = Math.sin(a) * d, dz = Math.cos(a) * d;
        await directShot(page, R, `${n}_${k}`, [c[0] + dx, Math.max(1.2, sz[1] * 0.7), c[2] + dz], [c[0], Math.max(0.4, sz[1] * 0.4), c[2]], 60); }
    }
  } finally { await b.close(); }
});
