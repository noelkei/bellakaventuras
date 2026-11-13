// IT8 · sonda (medida): ANMI colocada en un punto (rodando o a pie) con varios rumbos; 11 intentos de salir con TECLAS REALES; captura.
// Uso: node tools/it8/sonda-punto.mjs --url <build> --p x,y,z --loco ride [--rumbos 8]
import { Report, runTest, launch, sleep, arg } from '../v8/lib.mjs';
import { open8, start8, dev, S20, saveJson, mkdir } from './lib8.mjs';
const [x, y, z] = (arg('p') ?? '-11.55,0,27.95').split(',').map(Number), LOCO = arg('loco', 'ride'), NR = +arg('rumbos', '8');
const R = new Report('it8-sonda-punto', { task: arg('task', 'IT8'), label: `${x}_${z}` });
await runTest(R, async () => {
  const b = await launch(); const filas = [];
  try {
    const page = await open8(b, R, dev('pc720'), 'h', { save: S20 }); await start8(page, false); await sleep(1200); mkdir('sondas');
    for (let k = 0; k < NR; k++) { const h = k * 2 * Math.PI / NR;
      const r = await page.evaluate(async (x, y, z, h, loco) => { const g = window.__bk, T = window.__bkTHREE, s = g.skater; g.input.clear(); s.teleport(new T.Vector3(x, y + 0.05, z), h, loco); s.vel.set(0, 0, 0); g.rig.snapBehind(s);
        await new Promise((r) => setTimeout(r, 700)); const f = s.footPos, toca = []; g.world.intersectionsWithShape(s.collider.translation(), s.collider.rotation(), s.collider.shape, (c) => { if (c !== s.collider && !c.isSensor()) toca.push(g.park.colliderName(c.handle)); return true; });
        return { pos: [f.x, f.y, f.z].map((v) => +v.toFixed(2)), loco: s.loco, toca }; }, x, y, z, h, LOCO);
      const p0 = r.pos; let moved = 0;
      for (const ks of [['KeyW'], ['KeyS'], ['KeyA', 'KeyW'], ['KeyD', 'KeyW'], ['KeyW', 'Space'], ['KeyQ'], ['KeyW'], ['KeyS', 'Space'], ['KeyA'], ['KeyW', 'Space']]) {
        for (const k2 of ks) await page.keyboard.down(k2); await sleep(900); for (const k2 of ks) await page.keyboard.up(k2); await sleep(150);
        const q = await page.evaluate(() => [window.__bk.skater.footPos.x, window.__bk.skater.footPos.y, window.__bk.skater.footPos.z]); moved = Math.max(moved, Math.hypot(q[0] - p0[0], q[2] - p0[2]), Math.abs(q[1] - p0[1])); if (moved > 1.5) break; }
      if (moved < 0.5) await page.screenshot({ path: `/Users/TU_USUARIO/Desktop/Bellakaventuras/V10/IT8/evidencias/sondas/punto_${x}_${z}_r${k}.png` });
      filas.push({ rumbo: +h.toFixed(2), ...r, salida: +moved.toFixed(2) }); console.log('rumbo', h.toFixed(2), JSON.stringify(r), 'se movió', moved.toFixed(2), 'm');
    }
    R.measure('punto', filas); R.check(true, `sonda en (${x}, ${z})`, 'unit', filas); saveJson(`sondas/punto_${x}_${z}.json`, filas);
  } finally { await b.close(); }
});
