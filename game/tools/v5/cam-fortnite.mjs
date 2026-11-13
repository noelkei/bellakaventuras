// R3 (usuario y clientes, 12 oct) · Cámara «Fortnite» en el móvil: siempre detrás de ANMI y girando CON ella cuando el
// joystick la gira (a pie y en tabla). Entrada real en EMULACIÓN (toques CDP; emulación ≠ teléfono):
//  · pulgar arriba-derecha 2 s (gira y avanza): desfase cámara–frente medido cada 50 ms → mediana ≤ 12°, máximo ≤ 30°, y
//    a 0,4 s de soltar ≤ 5° (antes: la cámara esperaba 1–1,6 s y seguía despacio);
//  · 2.º dedo orbita ≥ 40° mientras el pulgar conduce; al soltar el 2.º dedo vuelve detrás (≤ 8° a 1,3 s);
//  · control: con TECLADO (D + W) no se fija (comportamiento V5 conservado: desfase > 15° a 0,6 s de girar).
import { Report, runTest, launch, openGame, clickStart, sleep, place, VIEWPORTS, r3 } from './lib.mjs';
const R = new Report('cam-fortnite');
const deg = (a) => Math.abs(Math.atan2(Math.sin(a), Math.cos(a))) * 180 / Math.PI;
await runTest(R, async () => {
  const b = await launch();
  try {
    for (const [vpName, vp] of [['vertical', VIEWPORTS.phone], ['horizontal', VIEWPORTS.phoneLand]]) {
      const page = await openGame(b, R, { viewport: vp }); await clickStart(page); await sleep(800);
      const cdp = await page.target().createCDPSession();
      const touch = (type, pts) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts.map(([x, y, id]) => ({ x, y, id, radiusX: 8, radiusY: 8, force: 1 })) });
      const rect = await page.evaluate(() => { const r = document.getElementById('stick-zone').getBoundingClientRect(); return [r.x, r.y, r.width, r.height]; });
      const ox = Math.round(rect[0] + Math.min(80, rect[2] * 0.45)), oy = Math.round(rect[1] + rect[3] - 110), rad = 56;
      const cz = await page.evaluate(() => { const W = innerWidth, H = innerHeight; return [Math.round(W * 0.62), Math.round(H * 0.35)]; });
      const st = () => page.evaluate(() => { const g = window.__bk, s = g.skater; return { h: s.heading, cam: g.rig.yaw, v: Math.hypot(s.vel.x, s.vel.z) }; });
      for (const loco of ['walk', 'ride']) {
        await place(page, R, [-30, 0, 30], Math.PI / 2, loco, `${vpName} ${loco}`); await sleep(600);
        // pulgar arriba-derecha (giro completo + avance)
        await touch('touchStart', [[ox, oy, 1]]); await sleep(60); await touch('touchMove', [[ox + rad * 0.75, oy - rad * 0.75, 1]]);
        const lag = []; const t0 = Date.now(); let hp = null, turned = 0;
        while (Date.now() - t0 < 2000) { const q = await st(); if (hp != null) turned += deg(q.h - hp); hp = q.h; lag.push(deg(q.cam - q.h)); await sleep(50); }   // giro acumulado (sin enrollar)
        await touch('touchEnd', []); await sleep(400);
        const end = await st();
        lag.sort((a, c) => a - c);
        const m = { turnedDeg: r3(turned), lagMedDeg: r3(lag[Math.floor(lag.length / 2)]), lagMaxDeg: r3(lag.at(-1)), endLagDeg: r3(deg(end.cam - end.h)) };
        R.measure(`${vpName} ${loco}: giro con el pulgar`, m);
        R.check(turned > 60 && m.lagMedDeg <= 12 && m.lagMaxDeg <= 30 && m.endLagDeg <= 5, `${vpName} ${loco}: la cámara gira con ANMI (giro ${m.turnedDeg}°, desfase mediano ${m.lagMedDeg}°, máx ${m.lagMaxDeg}°, al soltar ${m.endLagDeg}°)`, 'emulation', m);
      }
      // 2.º dedo orbita mientras el pulgar conduce, y al soltar vuelve detrás
      await place(page, R, [-30, 0, 30], Math.PI / 2, 'walk', `${vpName} órbita`); await sleep(600);
      await touch('touchStart', [[ox, oy, 1]]); await sleep(60); await touch('touchMove', [[ox, oy - rad, 1]]); await sleep(300);
      await touch('touchStart', [[ox, oy - rad, 1], [cz[0], cz[1], 2]]); await sleep(40);
      for (let i = 1; i <= 10; i++) { await touch('touchMove', [[ox, oy - rad, 1], [cz[0] + i * 22, cz[1], 2]]); await sleep(30); }
      const orb = await st(); const orbDeg = deg(orb.cam - orb.h);
      await touch('touchEnd', [[cz[0] + 220, cz[1], 2]]); await sleep(1300);
      const back = await st(); await touch('touchEnd', []); await sleep(200);
      R.check(orbDeg >= 40 && deg(back.cam - back.h) <= 8, `${vpName}: el 2.º dedo orbita (${r3(orbDeg)}°) y al soltarlo vuelve detrás (${r3(deg(back.cam - back.h))}° a 1,3 s)`, 'emulation', { orbDeg, back: deg(back.cam - back.h) });
      if (vpName === 'vertical') {
        // control: teclado sin bloqueo
        await place(page, R, [-30, 0, 30], Math.PI / 2, 'walk', 'teclado'); await sleep(600);
        await page.keyboard.down('KeyW'); await page.keyboard.down('KeyD'); await sleep(600);
        const kq = await st(); await page.keyboard.up('KeyD'); await page.keyboard.up('KeyW');
        R.check(deg(kq.cam - kq.h) > 15, `teclado: sin bloqueo (desfase ${r3(deg(kq.cam - kq.h))}° a 0,6 s de girar, como en V5)`, 'emulation', kq);
      }
      await page.close();
    }
  } finally { await b.close(); }
}, { timeoutMs: 240000 });
