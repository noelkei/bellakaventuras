// T5-28 · Vehículos servidos (SOL-007, OPUS-023): los dos coches en la pista (20/20) y la limo, con cámara directa de frente,
// lado y trasera a la distancia de juego (6 m) y de cerca (3 m); materiales servidos (nombres, color de la llanta, cristal
// propio) y diferenciación de pintura (coche 2 ≠ rosa). Fixture: guardado 20/20 con la revelación vista; coches parados
// (pausa) para la captura.
import { Report, runTest, launch, openGame, clickStart, sleep, directShot, SAVE_20 } from '../lib.mjs';
const R = new Report('vehicles-v5');
await runTest(R, async () => {
  const b = await launch();
  try {
    const page = await openGame(b, R, { save: SAVE_20 }); await clickStart(page); await sleep(3500);
    await page.evaluate(() => window.__bk.setPaused(true));
    const cars = await page.evaluate(() => window.__bk.cars.cars.map((c) => { const yaw = c.g.rotation.y; const mats = new Set(); c.g.traverse((o) => { if (o.isMesh) mats.add(o.material.name); });
      let rim = null, glass = null; c.g.traverse((o) => { if (o.isMesh && o.material.name === 'M_rim') rim = '#' + o.material.color.getHexString(); if (o.isMesh && o.material.name === 'M_glass') glass = { color: '#' + o.material.color.getHexString(), rough: o.material.roughness }; });
      return { pos: [c.g.position.x, c.g.position.y, c.g.position.z], yaw, mats: [...mats], rim, glass }; }));
    R.measure('coches', cars);
    for (const [i, c] of cars.entries()) {
      const f = [Math.sin(c.yaw), Math.cos(c.yaw)], side = [Math.cos(c.yaw), -Math.sin(c.yaw)], P = c.pos;
      for (const [n, d, dir] of [['frente', 6, f], ['lado', 6, side], ['trasera', 6, [-f[0], -f[1]]], ['lado_cerca', 3, side]])
        await directShot(page, R, `coche${i + 1}_${n}`, [P[0] + dir[0] * d, 1.4, P[2] + dir[1] * d], [P[0], 0.7, P[2]], 55);
    }
    R.check(cars.length === 2 && cars[1].mats.some((m) => /repaint/.test(m)), 'el segundo coche usa su propia pintura (paints[1])', 'unit', cars.map((c) => c.mats));
    R.pendingHuman('Aprobación de los vehículos (chapa, cristal, llantas, colores) — G8-V');
  } finally { await b.close(); }
});
