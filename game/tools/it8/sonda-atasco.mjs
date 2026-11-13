// IT8 · sonda (medida) de atascos que encuentra bordes.mjs: reproduce el empujón en simulación (mismo punto, rumbo, loco y salto) y luego
// intenta salir con TECLAS REALES 12 s (W, S, giros, salto, tabla, agacharse); captura y colliders que tocan a ANMI.
// Uso: node tools/it8/sonda-atasco.mjs --url <build> --p x,y,z,h,loco,salto [--rep 2]
import { Report, runTest, launch, sleep, arg } from '../v8/lib.mjs';
import { open8, start8, dev, S20, saveJson, mkdir } from './lib8.mjs';
const R = new Report('it8-sonda-atasco', { task: arg('task', 'IT8'), label: (arg('p') ?? '').replace(/[^0-9a-z.-]/gi, '_') });
const [x, y, z, h, loco, salto] = (arg('p') ?? '-35.5,-1,2,1.5708,walk,1').split(','); const REP = +arg('rep', '2');
await runTest(R, async () => {
  const b = await launch(); const filas = [];
  try {
    const page = await open8(b, R, dev('pc720'), 'h', { save: S20 }); await start8(page, false); await sleep(1200);
    for (let k = 0; k < REP; k++) {
      const r = await page.evaluate(async (p) => { const g = window.__bk, T = window.__bkTHREE, s = g.skater, key = (c, d) => window.dispatchEvent(new KeyboardEvent(d ? 'keydown' : 'keyup', { code: c }));
        g.autoMode = true; const [x, y, z, h] = p.slice(0, 4).map(Number), back = 0.3, x0 = x - Math.sin(h) * back, z0 = z - Math.cos(h) * back;
        s.teleport(new T.Vector3(x0, y + 0.05, z0), h, p[4]); s.vel.set(0, 0, 0); g.rig.snapBehind(s); await g.simulate(0.3); if (p[4] === 'ride') s.vel.set(Math.sin(h) * 4, 0, Math.cos(h) * 4);
        await g.simulate(2.5, (t) => { key('KeyW', true); if (p[5] === '1') key('Space', t > 1 && t < 1.1); }); for (const c of ['KeyW', 'Space']) key(c, false); await g.simulate(0.5); g.autoMode = false;
        const f = s.footPos, RA = window.__bkRapier; const toca = []; g.world.intersectionsWithShape(s.collider.translation(), s.collider.rotation(), s.collider.shape, (c) => { if (c !== s.collider && !c.isSensor()) toca.push(g.park.colliderName(c.handle)); return true; });
        return { pos: [f.x, f.y, f.z].map((v) => +v.toFixed(2)), loco: s.loco, toca }; }, [x, y, z, h, loco, salto]);
      const p0 = r.pos; let moved = 0;
      for (const ks of [['KeyW'], ['KeyS'], ['KeyA', 'KeyW'], ['KeyD', 'KeyW'], ['KeyW', 'Space'], ['KeyS', 'Space'], ['KeyQ'], ['KeyW'], ['KeyC', 'KeyW'], ['KeyA'], ['KeyW', 'Space']]) {
        for (const k2 of ks) await page.keyboard.down(k2); await sleep(1000); for (const k2 of ks) await page.keyboard.up(k2); await sleep(150);
        const q = await page.evaluate(() => [window.__bk.skater.footPos.x, window.__bk.skater.footPos.y, window.__bk.skater.footPos.z]); moved = Math.max(moved, Math.hypot(q[0] - p0[0], q[2] - p0[2]), Math.abs(q[1] - p0[1])); }
      mkdir('sondas'); await page.screenshot({ path: `/Users/TU_USUARIO/Desktop/Bellakaventuras/V10/IT8/evidencias/sondas/atasco_${x}_${z}_${k}.png` });
      filas.push({ ...r, salida: +moved.toFixed(2) }); console.log('rep', k, JSON.stringify(r), 'se movió con teclas reales:', moved.toFixed(2), 'm');
      await page.evaluate(() => { const g = window.__bk, sp = g.manifest.spawn; g.skater.teleport(sp.pos.clone(), sp.heading, 'walk'); });
    }
    R.measure('atasco', filas); R.check(true, `sonda en (${x}, ${z})`, 'unit', filas);
    saveJson(`sondas/atasco_${x}_${z}.json`, filas);
  } finally { await b.close(); }
});
