// T5-00/T5-01/T5-22 · Cámara real por fotograma (OPUS-010, DT-16). Escritorio 1280×800.
// Casos (entrada real): (1) a pie, cámara llevada al FRENTE de ANMI con J (≈180°) y recentrado con R; (2) en tabla parada,
// igual; (3) en tabla a ~7 m/s con la cámara al frente y sin tocar nada (el seguimiento automático la devuelve detrás).
// Métricas sobre la cámara REAL (rig.cam): distancia horizontal cámara→objetivo frente a la deseada, distancia mínima a la
// cápsula de ANMI, pitch real, nº de cruces por el plano lateral (la cámara pasa de delante a detrás).
// Aceptación DT-16: distancia horizontal ≥ 50 % de la deseada (salvo avoid registrado), nunca dentro de cápsula + 0,5 m,
// pitch ∈ [6°, 72°], ≤ 1 cruce por el frente.
import { Report, runTest, launch, openGame, clickStart, sleep, place, r3 } from '../lib.mjs';

const R = new Report('cam-orbit');
await runTest(R, async () => {
  const b = await launch();
  try {
    const page = await openGame(b, R); await clickStart(page);
    await page.evaluate(() => {
      window.__camrec = { on: false, rows: [] };
      const loop = () => { const r = window.__camrec, g = window.__bk; if (r.on) { const c = g.rig.cam.position, s = g.skater, v = s.visualPos, f = new window.__bkTHREE.Vector3(); g.rig.cam.getWorldDirection(f);
        const dx = c.x - v.x, dz = c.z - v.z, fx = Math.sin(s.heading), fz = Math.cos(s.heading);
        r.rows.push({ hd: Math.hypot(dx, dz), front: dx * fx + dz * fz, cy: c.y - v.y, pitch: Math.asin(-f.y), capD: Math.max(0, Math.hypot(dx, dz) - 0.3) , dy: c.y - v.y, yaw: g.rig.yaw, h: s.heading, sp: Math.hypot(s.vel.x, s.vel.z), onFoot: s.onFoot }); }
        requestAnimationFrame(loop); };
      requestAnimationFrame(loop);
    });
    const cases = [];
    for (const [name, loco, moving] of [['pie-recentrado', 'walk', false], ['tabla-recentrado', 'ride', false], ['tabla-en-marcha-auto', 'ride', true]]) {
      await place(page, R, [-14, 0, -2], 0, loco, name); await sleep(500);
      if (moving) { await page.keyboard.down('KeyW'); await sleep(1500); await page.keyboard.up('KeyW'); }
      await page.keyboard.down('KeyJ'); await sleep(1430); await page.keyboard.up('KeyJ');   // ≈ 180° (keySens 2,2 rad/s)
      await page.evaluate(() => { window.__camrec.rows = []; window.__camrec.on = true; });
      if (!moving) { await page.keyboard.press('KeyR'); await sleep(1500); } else { await page.keyboard.down('KeyW'); await sleep(3500); await page.keyboard.up('KeyW'); }
      const rows = await page.evaluate(() => { window.__camrec.on = false; return window.__camrec.rows; });
      if (!rows.length || rows[0].front < 0) { R.invalid(`${name}: la cámara no quedó al frente antes del caso`, rows[0]); continue; }
      const want = loco === 'walk' ? 5.4 * 0.86 : 5.4;
      const desiredH = want * Math.cos(0.30);   // pitch por defecto 17°
      let crossings = 0; for (let i = 1; i < rows.length; i++) if (Math.sign(rows[i].front) !== Math.sign(rows[i - 1].front) && Math.abs(rows[i].front - rows[i - 1].front) > 0.01) crossings++;
      const minH = Math.min(...rows.map((r) => r.hd)), minCap = Math.min(...rows.map((r) => Math.hypot(r.hd, Math.max(0, r.dy - 1.8)) - 0.3));
      const pitches = rows.map((r) => r.pitch * 180 / Math.PI);
      const row = { name, frames: rows.length, minHoriz: r3(minH), desiredH: r3(desiredH), ratio: r3(minH / desiredH), minToCapsule: r3(minCap), pitchMin: r3(Math.min(...pitches)), pitchMax: r3(Math.max(...pitches)), crossings };
      cases.push(row); console.log(JSON.stringify(row));
      R.check(row.ratio >= 0.5, `${name}: distancia horizontal real ≥ 50 % de la deseada`, 'input', row);
      R.check(row.minToCapsule >= 0.5, `${name}: nunca dentro de la cápsula de ANMI + 0,5 m`, 'input', row);
      R.check(row.pitchMin >= 6 - 0.5 && row.pitchMax <= 72, `${name}: pitch real ∈ [6°, 72°]`, 'input', row);
      R.check(row.crossings <= 1, `${name}: ≤ 1 cruce por el frente`, 'input', row);
    }
    R.measure('casos', cases);
  } finally { await b.close(); }
});
