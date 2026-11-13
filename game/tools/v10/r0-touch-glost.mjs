// V10 R0 · sonda: touch-tasks con pérdida de contexto WebGL provocada a mitad (confirma o descarta la hipótesis del cuelgue).
// T5-01/T5-16 · Tareas táctiles en EMULACIÓN (CDP Input.dispatchTouchEvent; sin WASD). Emulación ≠ teléfono: estas tareas
// miden capacidad y regresión (¿hay deriva?, ¿se puede en un gesto?), no comodidad. Viewport 390×844 (y 844×390).
//  · E8: pulgar «arriba» con desviación lateral constante de +10 px durante 5 s, a pie y en skate → deriva de rumbo ≤ 3°.
//  · E11: lateral puro (pulgar a la derecha) 1,2 s a pie → desplazamiento ≤ 0,6 m Y ciclo de pasos activo (estado «walk»
//    con 0,2 < |v| ≤ 0,7 m/s en algún momento): HUM-A5-007 «gira con pasos y avance leve».
//  · E11-kb: lo mismo con D (teclado), aserción HUM-007 para todas las fuentes.
//  · E3/E4/E9/E10 se añaden en T5-16 (vuelta al anillo, U-turn, órbita con 2º dedo, TABLA a mitad de gesto).
// Al terminar cada tarea: propietarios de dedos vacíos.
import { Report, runTest, launch, openGame, clickStart, sleep, place, VIEWPORTS, recStart, recStop, r3, arg } from '/Users/TU_USUARIO/Desktop/Bellakaventuras/game/tools/v8/lib.mjs';

const R = new Report('touch-tasks-glost');
const LOSE_AT = +arg('loseAt', '25');   // V10 R0: segundos tras JUGAR en que se pierde el contexto a propósito (solo en vertical)
const TASKS = arg('tasks', 'E1,E3,E4,E8,E9,E10,E11').split(',');

await runTest(R, async () => {
  const b = await launch();
  try {
    for (const [vpName, vp] of [['vertical', VIEWPORTS.phone], ['horizontal', VIEWPORTS.phoneLand]]) {
      const page = await openGame(b, R, { viewport: vp }); await clickStart(page);
      page.on('console', (m) => { const t = m.text(); if (/context lost|contexto|CONTEXT_LOST/i.test(t)) console.log('CHIVATO consola ' + vpName + ': ' + t.slice(0, 120)); });
      const chiv = setInterval(() => page.evaluate(() => !document.getElementById('glost')?.hidden).then((v) => { if (v) console.log('CHIVATO aviso visible en ' + vpName); }).catch(() => {}), 2000); chiv.unref?.();
      page.once('close', () => clearInterval(chiv));
      if (vpName === 'vertical' && LOSE_AT > 0) await page.evaluate((s) => setTimeout(() => { const e = window.__bk.renderer.getContext().getExtension('WEBGL_lose_context'); e?.loseContext(); console.log('R0: contexto perdido a propósito'); }, s * 1000), LOSE_AT);
      const cdp = await page.target().createCDPSession();
      const touch = (type, pts) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts.map(([x, y, id]) => ({ x, y, id, radiusX: 8, radiusY: 8, force: 1 })) });
      const rect = await page.evaluate(() => { const r = document.getElementById('stick-zone').getBoundingClientRect(); return [r.x, r.y, r.width, r.height]; });
      const ox = Math.round(rect[0] + Math.min(80, rect[2] * 0.45)), oy = Math.round(rect[1] + rect[3] - 110);
      R.note({ vp: vpName, stickZone: rect, origin: [ox, oy] });
      const rad = 56;
      const res = {};
      // ------------------------------------------------ E8
      if (TASKS.includes('E8')) for (const loco of ['walk', 'ride']) {
        await place(page, R, [-14, 0, -2], 0, loco, `E8 ${loco}`); await sleep(400);
        await touch('touchStart', [[ox, oy, 1]]); await sleep(60);
        await touch('touchMove', [[ox + 10, oy - rad, 1]]);
        const h0 = await page.evaluate(() => { window.__bk.skater.impactLog.length = 0; return window.__bk.skater.heading; });
        // V5: en tabla 3,5 s (a 20 m/s, 5 s salen de la recta libre desde (−14, −2) y chocan a z ≈ 26: intento inválido)
        await sleep(loco === 'ride' ? 3500 : 5000);
        const [h1, imp, v] = await page.evaluate(() => [window.__bk.skater.heading, window.__bk.skater.impactLog.length, window.__bk.skater.vLong]);
        await touch('touchEnd', []); await sleep(200);
        const owners = await page.evaluate(() => window.__bk.input.activeOwners);
        const drift = Math.abs(Math.atan2(Math.sin(h1 - h0), Math.cos(h1 - h0))) * 180 / Math.PI;
        if (imp) { R.invalid(`${vpName} E8-${loco}: impacto durante la recta (no mide deriva del stick)`, { drift, imp }); continue; }
        res[`E8-${loco}`] = { driftDeg: r3(drift), v: r3(v), owners, ok: drift <= 3 && owners.length === 0 };
      }
      // ------------------------------------------------ E11 táctil y teclado
      if (TASKS.includes('E11')) for (const src of ['touch', 'kb']) {
        await place(page, R, [-14, 0, -2], 0, 'walk', `E11 ${src}`); await sleep(400);
        await recStart(page);
        if (src === 'touch') { await touch('touchStart', [[ox, oy, 1]]); await sleep(60); await touch('touchMove', [[ox + rad, oy, 1]]); await sleep(1200); await touch('touchEnd', []); }
        else { await page.keyboard.down('KeyD'); await sleep(1200); await page.keyboard.up('KeyD'); }
        await sleep(150);
        const rows = await recStop(page);
        const owners = await page.evaluate(() => window.__bk.input.activeOwners);
        const p0 = rows[0], p1 = rows.at(-1);
        const disp = Math.hypot(p1.x - p0.x, p1.z - p0.z);
        const speeds = rows.map((r) => Math.hypot(r.vx, r.vz));
        const stepping = rows.some((r) => r.st === 'walk' && Math.hypot(r.vx, r.vz) > 0.2);
        const vmax = Math.max(...speeds);
        const turned = Math.abs(Math.atan2(Math.sin(p1.h - p0.h), Math.cos(p1.h - p0.h))) * 180 / Math.PI;
        res[`E11-${src}`] = { disp: r3(disp), vmax: r3(vmax), stepping, turnedDeg: r3(turned), owners, ok: disp <= 0.6 && stepping && vmax <= 0.7 && owners.length === 0 };
      }
      // pulgar guionizado en lazo cerrado: un SOLO gesto (touchStart al principio, touchEnd al final), solo touchMove entre medias
      const thumb = async (fn, ms, every = 50) => { await touch('touchStart', [[ox, oy, 1]]); let starts = 1; const t0 = Date.now();
        while (Date.now() - t0 < ms) { const st = await page.evaluate(() => { const g = window.__bk, s = g.skater; return { x: s.footPos.x, z: s.footPos.z, h: s.heading, v: Math.hypot(s.vel.x, s.vel.z), cam: g.rig.yaw, loco: s.loco }; });
          const [dx, dy, stop] = fn(st, Date.now() - t0); if (stop) break; await touch('touchMove', [[ox + dx, oy + dy, 1]]); await sleep(every); }
        await touch('touchEnd', []); return starts; };
      const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));
      // ------------------------------------------------ E1: ir a un punto a 8 m situado a 0/60/120/180° de la vista inicial (pie)
      if (TASKS.includes('E1')) for (const ang of [0, 60, 120, 180]) {
        await place(page, R, [-14, 0, -2], 0, 'walk', `E1 ${ang}°`); await sleep(300);
        const tgt = [-14 + Math.sin(ang * Math.PI / 180) * 8, -2 + Math.cos(ang * Math.PI / 180) * 8];
        let path = 0, last = null, camTot = 0, lastCam = null, done = false; const t0 = Date.now();
        await thumb((st, t) => { if (last) path += Math.hypot(st.x - last[0], st.z - last[1]); last = [st.x, st.z]; if (lastCam !== null) camTot += Math.abs(wrap(st.cam - lastCam)); lastCam = st.cam;
          const d = Math.hypot(tgt[0] - st.x, tgt[1] - st.z); if (d < 0.8) { done = true; return [0, 0, true]; } if (t > 9000) return [0, 0, true];
          const err = wrap(Math.atan2(tgt[0] - st.x, tgt[1] - st.z) - st.h);   // >0 = el objetivo queda a la izquierda (rumbo creciente)
          if (Math.abs(err) > 0.35) return [-Math.sign(err) * rad, 0];          // gira con pasos (lateral)
          return [-Math.sign(err) * Math.min(rad * 0.4, Math.abs(err) * 60), -rad]; }, 9500);
        res[`E1-${ang}`] = { ok: done, t: (Date.now() - t0) / 1000, ratio: +(path / 8).toFixed(2), camTurnDeg: +(camTot * 180 / Math.PI).toFixed(0) };
      }
      // ------------------------------------------------ E3: vuelta al anillo r ≈ 20 en un gesto (skate) a 9/14/20 m/s
      if (TASKS.includes('E3')) for (const vT of [9, 14, 20]) {
        await place(page, R, [0, 0, -20], -Math.PI / 2, 'ride', `E3 ${vT}`);
        await page.evaluate((v) => { const s = window.__bk.skater; s.vel.set(Math.sin(s.heading) * v, 0, Math.cos(s.heading) * v); }, vT * 0.9);
        R.fixture(`E3: velocidad inicial declarada ${vT * 0.9} m/s en el anillo`, {});
        let sweep = 0, lastTh = Math.atan2(0, 20), rmin = 99, rmax = 0, done = false;
        const starts = await thumb((st, t) => { const r = Math.hypot(st.x, st.z), th = Math.atan2(st.x, -st.z); sweep += wrap(th - lastTh); lastTh = th; rmin = Math.min(rmin, r); rmax = Math.max(rmax, r);
          if (Math.abs(sweep) > 2 * Math.PI * 0.95) { done = true; return [0, 0, true]; } if (t > 25000) return [0, 0, true];
          // rumbo deseado = tangente antihoraria + corrección radial
          const tang = Math.atan2(-st.z, st.x) + Math.PI, want = tang + (r - 20) * 0.12, err = wrap(want - st.h);
          const push = st.v < vT ? -rad : -rad * 0.15;  // empuja hasta la velocidad objetivo
          return [-Math.max(-1, Math.min(1, err * 2.5)) * rad, push]; }, 26000, 40);
        res[`E3-${vT}`] = { ok: done && rmin > 14 && rmax < 26, sweepDeg: +(sweep * 180 / Math.PI).toFixed(0), rmin: +rmin.toFixed(1), rmax: +rmax.toFixed(1), gestures: starts };
      }
      // ------------------------------------------------ E4: media vuelta (180°) en un pasillo de 4 m, en un gesto (pie y skate)
      if (TASKS.includes('E4')) for (const loco of ['walk', 'ride']) {
        await place(page, R, [-14, 0, -6], 0, loco, `E4 ${loco}`); await sleep(300);
        const h0 = 0; let lat = 0, turned = 0, done = false;
        await thumb((st, t) => { lat = Math.max(lat, Math.abs(st.x + 14)); turned = Math.abs(wrap(st.h - h0));
          if (turned > 170 * Math.PI / 180) { done = true; return [0, 0, true]; } if (t > 6000) return [0, 0, true];
          if (t < 700) return [0, -rad]; return [rad * 0.85, -rad * 0.6]; }, 6500);
        res[`E4-${loco}`] = { ok: done && lat <= 4, turnedDeg: +(turned * 180 / Math.PI).toFixed(0), lateralM: +lat.toFixed(2) };
      }
      // ------------------------------------------------ E9: órbita con el 2º dedo mientras se camina: el rumbo no cambia
      if (TASKS.includes('E9')) {
        await place(page, R, [-14, 0, -2], 0, 'walk', 'E9'); await sleep(300);
        const cx = vp.width - 90, cy = Math.round(vp.height * 0.35);
        await touch('touchStart', [[ox, oy, 1]]); await touch('touchMove', [[ox, oy - rad, 1]]); await sleep(500);
        const h0 = await page.evaluate(() => window.__bk.skater.heading);
        await touch('touchStart', [[ox, oy - rad, 1], [cx, cy, 2]]);
        for (let k = 1; k <= 14; k++) { await touch('touchMove', [[ox, oy - rad, 1], [cx - 12 * k, cy, 2]]); await sleep(40); }
        await touch('touchEnd', [[cx - 12 * 14, cy, 2]]); await sleep(300);   // CDP: touchEnd con un punto suelta SOLO ese dedo (el 2º); el pulgar sigue arriba
        const [h1, own] = await page.evaluate(() => [window.__bk.skater.heading, window.__bk.input.activeOwners]); await touch('touchEnd', []);
        const d = Math.abs(wrap(h1 - h0)) * 180 / Math.PI; res['E9'] = { ok: d <= 3 && own.length === 1 && own[0] === 'stick', headingChangeDeg: +d.toFixed(1), ownersAfterCamRelease: own };
      }
      // ------------------------------------------------ E10: TABLA a mitad de gesto: el pulgar sigue significando «adelante»
      if (TASKS.includes('E10')) {
        await place(page, R, [-14, 0, -2], 0, 'walk', 'E10'); await sleep(300);
        const br = await page.evaluate(() => { const r = document.getElementById('btn-board').getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2]; });
        await touch('touchStart', [[ox, oy, 1]]); await touch('touchMove', [[ox, oy - rad * 0.3, 1]]); await sleep(300);   // paso lento (< 3,2 m/s para poder subir)
        await touch('touchStart', [[ox, oy - rad * 0.3, 1], [br[0], br[1], 2]]); await sleep(80); await touch('touchEnd', [[br[0], br[1], 2]]);   // CDP: touchEnd con un punto suelta SOLO ese dedo (TABLA); el pulgar sigue
        await touch('touchMove', [[ox, oy - rad, 1]]); await sleep(1500);
        const st = await page.evaluate(() => ({ loco: window.__bk.skater.loco, thr: window.__bk.skater.throttle, vl: window.__bk.skater.vLong, h: window.__bk.skater.heading })); await touch('touchEnd', []);
        res['E10'] = { ok: st.loco === 'ride' && st.thr > 0.5 && st.vl > 1 && Math.abs(wrap(st.h)) < 0.1, ...st };
      }
      for (const [k, v] of Object.entries(res)) R.check(v.ok, `${vpName} ${k}`, k.endsWith('kb') ? 'input' : 'emulation', v);
      R.measure(vpName, res);
      await page.close();
    }
    R.pendingHuman('Sensación táctil en el teléfono del usuario (G8-T, T5-17)');
  } finally { await b.close(); }
});
