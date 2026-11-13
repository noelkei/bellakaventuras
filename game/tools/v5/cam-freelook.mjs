// R5 (usuario, 12 oct) · Mirada libre MIENTRAS se mantiene la cámara (toque en el móvil emulado y arrastre de ratón en
// escritorio): se puede mirar al cielo (la cámara apunta hacia arriba: componente vertical de la vista > 0,4) y casi cenital;
// la cámara nunca baja del suelo (≥ 0,25 m); al soltar, la inclinación vuelve al rango normal en ≤ 1,5 s (y en el móvil la
// cámara vuelve detrás de ANMI). Emulación ≠ teléfono.
import { Report, runTest, launch, openGame, clickStart, sleep, place, VIEWPORTS, r3 } from './lib.mjs';
const R = new Report('cam-freelook');
const st = (page) => page.evaluate(() => { const g = window.__bk, c = g.rig.cam, T = window.__bkTHREE, f = new T.Vector3(); c.getWorldDirection(f);
  return { pitch: g.rig.pitch, yaw: g.rig.yaw, h: g.skater.heading, camY: c.position.y, lookUp: f.y, held: g.input.camHeld }; });
await runTest(R, async () => {
  const b = await launch();
  try {
    for (const [name, vp, kind] of [['móvil vertical', VIEWPORTS.phone, 'touch'], ['escritorio', VIEWPORTS.desktop, 'mouse']]) {
      const page = await openGame(b, R, { viewport: vp }); await clickStart(page); await sleep(800);
      await place(page, R, [-30, 0, 30], Math.PI / 2, 'walk', name); await sleep(700);
      const W = vp.width, H = vp.height, x0 = Math.round(W * 0.6), y0 = Math.round(H * 0.3);
      const cdp = await page.target().createCDPSession();
      const touch = (type, pts) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts.map(([x, y, id]) => ({ x, y, id, radiusX: 8, radiusY: 8, force: 1 })) });
      const down = async () => { if (kind === 'touch') await touch('touchStart', [[x0, y0, 1]]); else { await page.mouse.move(x0, y0); await page.mouse.down(); } };
      const move = async (x, y) => { if (kind === 'touch') await touch('touchMove', [[x, y, 1]]); else await page.mouse.move(x, y); };
      const up = async (x, y) => { if (kind === 'touch') await touch('touchEnd', []); else await page.mouse.up(); };
      for (const dir of [1, -1]) {   // arrastre hacia abajo y hacia arriba: uno de los dos mira al cielo
        await down(); let y = y0, minP = 9, maxP = -9, maxUp = -9, minCamY = 9;
        for (let i = 1; i <= 18; i++) { y = y0 + dir * i * 22; await move(x0, Math.max(5, Math.min(H - 5, y))); await sleep(40);
          const q = await st(page); minP = Math.min(minP, q.pitch); maxP = Math.max(maxP, q.pitch); maxUp = Math.max(maxUp, q.lookUp); minCamY = Math.min(minCamY, q.camY); }
        await sleep(300); const held = await st(page);
        if (maxUp > 0.4) await R.shot(page, `${name.replace(/ /g, '_')}_mirando_cielo`);
        await up(); await sleep(1500); const rel = await st(page);
        R.measure(`${name} arrastre ${dir > 0 ? 'abajo' : 'arriba'}`, { minPitchDeg: r3(minP * 57.3), maxPitchDeg: r3(maxP * 57.3), maxLookUp: r3(maxUp), minCamY: r3(minCamY), heldFlag: held.held, afterPitchDeg: r3(rel.pitch * 57.3), afterYawLagDeg: r3(Math.abs(Math.atan2(Math.sin(rel.yaw - rel.h), Math.cos(rel.yaw - rel.h))) * 57.3) });
        R.check(minCamY >= 0.25, `${name} (${dir > 0 ? 'abajo' : 'arriba'}): la cámara no baja del suelo (mín ${r3(minCamY)} m)`, 'emulation');
        R.check(Math.abs(rel.pitch * 57.3 - 17) <= 2, `${name} (${dir > 0 ? 'abajo' : 'arriba'}): al soltar vuelve a la vista de siempre (inclinación ${r3(rel.pitch * 57.3)}°, por defecto 17°)`, 'emulation', rel);
        if (dir === 1) var up1 = maxUp, p1 = { minP, maxP }; else { const best = Math.max(up1, maxUp);
          R.check(best > 0.4, `${name}: manteniendo, se puede mirar al cielo (vista hacia arriba ${r3(best)})`, 'emulation', { up1, up2: maxUp });
          R.check(Math.max(p1.maxP, maxP) > 1.15, `${name}: manteniendo, se puede mirar casi desde arriba (${r3(Math.max(p1.maxP, maxP) * 57.3)}° > 66°)`, 'emulation'); }
        await place(page, R, [-30, 0, 30], Math.PI / 2, 'walk', `${name} reinicio`); await sleep(1600);
      }
      await page.close();
    }
  } finally { await b.close(); }
}, { timeoutMs: 180000 });
