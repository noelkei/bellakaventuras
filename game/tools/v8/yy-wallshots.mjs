// V8 · capturas de la mecánica de pared (R2) con la cámara NORMAL de juego: subida, labio, aire con frontflip, reenganche y
// vuelta al fondo; y una talla en diagonal. Solo revisión visual (no es una prueba de arte).
import path from 'node:path'; import fs from 'node:fs';
import { Report, runTest, launch, openGame, clickStart, EVID, arg } from './lib.mjs';
const R = new Report('yy-wallshots');
const OUT = path.join(EVID, 'YY8-R2', 'pared'); fs.mkdirSync(OUT, { recursive: true });
await runTest(R, async () => {
  const b = await launch();
  try {
    const page = await openGame(b, R); await clickStart(page);
    await page.evaluate(() => { document.getElementById('hint').hidden = true; window.__bk.state.hintOnce?.('yy-pared'); window.__bk.autoMode = true; });
    const seq = async (idx, ang, script, marks, tag) => {
      const e0 = await page.evaluate(async (idx, ang) => { try {
        const H = await fetch('assets/yy/yy_pool.json').then((r) => r.json()); const [X, Z, nx, nz, zf, D, Rc] = H.wallRide.pts[idx];
        const g = window.__bk, T = window.__bkTHREE, s = g.skater, a = ang * Math.PI / 180, tx = -nz, tz = nx;
        const dx = -nx * Math.cos(a) + tx * Math.sin(a), dz = -nz * Math.cos(a) + tz * Math.sin(a), d0 = ang ? 0.6 : 3;
        s.teleport(new T.Vector3(X + nx * (Rc + d0) - tx * Math.sin(a) * d0, zf + 0.02, Z + nz * (Rc + d0) - tz * Math.sin(a) * d0), Math.atan2(dx, dz), 'ride');
        s.vel.set(dx * (ang ? 7 : 6.5), 0, dz * (ang ? 7 : 6.5)); g.rig.yaw = s.heading; await g.simulate(0.02); return null; } catch (e) { return e.stack; }
      }, idx, ang); if (e0) throw new Error(e0);
      let t = 0;
      for (const [label, until] of marks) {
        const info = await page.evaluate(async (until, script) => {
          const g = window.__bk, s = g.skater, p = s.pool, key = (c, d) => window.dispatchEvent(new KeyboardEvent(d ? 'keydown' : 'keyup', { code: c }));
          let n = 0; const ok = new Function('s', 'p', `return ${until}`);
          while (!ok(s, p) && n < 400) { await g.simulate(1 / 60); n++; if (script === 'front' && p.active && p.phase === 'air' && p.airT > 0.12 && !window.__pressed) { window.__pressed = 1; key('KeyW', true); key('Space', true); setTimeout(() => { key('KeyW', false); key('Space', false); }, 60); } }
          return { n, y: +s.footPos.y.toFixed(2), phase: p.active ? p.phase : 'suelo', q: +p.q.toFixed(2), trick: s.trick ? `${s.trick.kind} ${(s.trick.angle * 57.3).toFixed(0)}°` : null };
        }, until, script);
        await new Promise((r) => setTimeout(r, 120));
        const f = path.join(OUT, `${tag}_${String(++t).padStart(2, '0')}_${label}.png`); await page.screenshot({ path: f });
        R.measure(`${tag}_${label}`, info);
      }
      await page.evaluate(() => { window.__pressed = 0; });
    };
    const idx = +arg('i', '77');
    await seq(idx, 0, 'front', [['curva', 'p.active && p.q > 0.5'], ['vertical', 'p.active && p.q > 1.4'], ['aire_sube', "p.phase === 'air' && p.airT > 0.2"], ['aire_flip', "p.phase === 'air' && p.airT > 0.5"], ['aire_baja', "p.phase === 'air' && p.airT > 0.85"], ['reengancha', "p.active && p.phase === 'wall' && p.vu < 0 && p.q < 1.5"], ['fondo', '!p.active && s.footPos.y < -1.6'], ['fondo_luego', '(window.__t8 = (window.__t8 || 0) + 1) > 50']], 'frente');
    await seq(idx, 65, 'none', [['talla1', 'p.active && p.q > 0.6'], ['talla2', 'p.active && p.vu < 0'], ['vuelve', '!p.active']], 'talla');
  } finally { await b.close(); }
}, { timeoutMs: 300000 });
