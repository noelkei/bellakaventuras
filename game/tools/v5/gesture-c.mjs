// T5-17 · Variante C′ «dirección por gesto a pie» detrás de `?bkctl=gesto` (DT-15), en EMULACIÓN (CDP touch, sin WASD).
// Comprueba que la variante hace lo que dice el plan, NO su comodidad (eso es la sesión con teléfono, G8-T):
//  G1 «arriba» con la cámara girada (órbita real con un dedo) → ANMI se orienta a la vista del inicio del gesto y anda;
//  G2 lateral puro → se orienta a la derecha de la vista a pasos y, ya alineada, NO pasa de walkTurnStep (+0,05);
//  G3 órbita manual con 2º dedo durante el gesto → la intención no cambia (misma base, rumbo final = objetivo inicial);
//  G4 soltar y volver a tocar → base renovada con la vista nueva;  G5 recentrar (botón real) → base renovada;
//  G6 en tabla no actúa (frame intacto; E8 en tabla sin deriva);  G7 sin el parámetro no actúa (control negativo).
import { Report, runTest, launch, openGame, clickStart, sleep, place, VIEWPORTS, r3 } from './lib.mjs';
const R = new Report('gesture-c');
const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a)), deg = (a) => r3(a * 180 / Math.PI);
await runTest(R, async () => {
  const b = await launch();
  try {
    for (const withParam of [true, false]) {
      const vp = VIEWPORTS.phone;
      const page = await openGame(b, R, { viewport: vp, query: withParam ? '?bktest=1&bkctl=gesto' : '?bktest=1' }); await clickStart(page);
      const cdp = await page.target().createCDPSession();
      const touch = (type, pts) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts.map(([x, y, id]) => ({ x, y, id, radiusX: 8, radiusY: 8, force: 1 })) });
      const rect = await page.evaluate(() => { const r = document.getElementById('stick-zone').getBoundingClientRect(); return [r.x, r.y, r.width, r.height]; });
      const ox = Math.round(rect[0] + Math.min(80, rect[2] * 0.45)), oy = Math.round(rect[1] + rect[3] - 110), rad = 56;
      const cx = vp.width - 90, cy = Math.round(vp.height * 0.35);
      const st = () => page.evaluate(() => { const g = window.__bk, s = g.skater, f = g.rig.forward; return { h: s.heading, cam: Math.atan2(f.x, f.z), v: Math.hypot(s.vel.x, s.vel.z), p: [s.footPos.x, s.footPos.z], G: { ...g.gesture.last }, on: s.onFoot, owners: g.input.activeOwners }; });
      const orbit = async (px, keep) => { const n = 12; const base = keep ? [[ox, keep, 1]] : [];   // dedo de cámara (real); con pulgar opcional
        await touch('touchStart', [...base, [cx, cy, 2]]); for (let k = 1; k <= n; k++) { await touch('touchMove', [...base, [cx - px * k / n, cy, 2]]); await sleep(30); }
        await touch('touchEnd', keep ? [[cx - px, cy, 2]] : []); await sleep(200); };   // CDP: touchEnd con un punto suelta solo ese dedo
      const tag = withParam ? 'C′' : 'sin parámetro';
      if (withParam) {
        // ---------------------------------------------------------------- G1
        await place(page, R, [-14, 0, -2], 0, 'walk', 'G1'); await sleep(400); await orbit(160); await sleep(200);
        const a = await st(); const camYaw0 = a.cam;
        await touch('touchStart', [[ox, oy, 1]]); await sleep(50); await touch('touchMove', [[ox, oy - rad, 1]]); await sleep(2500);
        const b1 = await st(); await touch('touchEnd', []); await sleep(300);
        const e1 = Math.abs(wrap(b1.h - camYaw0)), turn1 = Math.abs(wrap(camYaw0 - a.h));
        R.check(turn1 > 0.5 && e1 < 5 * Math.PI / 180 && b1.v > 2.5, `G1 ${tag}: «arriba» con la vista girada ${deg(turn1)}° → ANMI se orienta a la vista (error ${deg(e1)}°) y anda (${r3(b1.v)} m/s)`, 'emulation', { camYaw0: deg(camYaw0), h0: deg(a.h), h1: deg(b1.h), v: r3(b1.v), G: b1.G });
        // ---------------------------------------------------------------- G2
        await place(page, R, [-14, 0, -2], 0, 'walk', 'G2'); await sleep(600);
        const a2 = await st(); const tgt2 = wrap(a2.cam - Math.PI / 2);
        await touch('touchStart', [[ox, oy, 1]]); await sleep(50); await touch('touchMove', [[ox + rad, oy, 1]]);
        let vmax = 0, vAligned = 0, stepping = false; const t0 = Date.now(); let last;
        while (Date.now() - t0 < 3000) { last = await st(); vmax = Math.max(vmax, last.v); if (Math.abs(wrap(last.h - tgt2)) < 5 * Math.PI / 180) vAligned = Math.max(vAligned, last.v); if (last.v > 0.15 && last.v <= 0.45) stepping = true; await sleep(50); }
        await touch('touchEnd', []); await sleep(300);
        const e2 = Math.abs(wrap(last.h - tgt2)), disp2 = Math.hypot(last.p[0] - a2.p[0], last.p[1] - a2.p[1]);
        R.check(e2 < 5 * Math.PI / 180 && stepping && vmax <= 0.45 && vAligned <= 0.45, `G2 ${tag}: lateral puro → se orienta a la derecha de la vista (error ${deg(e2)}°) a pasos y, alineada, ≤ walkTurnStep (máx ${r3(vmax)} m/s)`, 'emulation', { vmax: r3(vmax), vAligned: r3(vAligned), stepping, disp: r3(disp2), lateral: last.G.lateral });
        // ---------------------------------------------------------------- G3
        await place(page, R, [-14, 0, -2], 0, 'walk', 'G3'); await sleep(600);
        await touch('touchStart', [[ox, oy, 1]]); await sleep(50); await touch('touchMove', [[ox, oy - rad, 1]]); await sleep(300);
        const a3 = await st(); await orbit(200, oy - rad); await sleep(1500);
        const b3 = await st(); await touch('touchEnd', []); await sleep(300);
        R.check(Math.abs(wrap(b3.G.base - a3.G.base)) < 1e-6 && Math.abs(wrap(b3.cam - a3.cam)) > 0.3 && Math.abs(wrap(b3.h - a3.G.target)) < 5 * Math.PI / 180, `G3 ${tag}: órbita manual con 2º dedo durante el gesto (vista ${deg(Math.abs(wrap(b3.cam - a3.cam)))}°) → misma intención`, 'emulation', { base0: deg(a3.G.base), base1: deg(b3.G.base), h1: deg(b3.h), target: deg(a3.G.target), owners: b3.owners });
        // ---------------------------------------------------------------- G4
        const camBefore = (await st()).cam;
        await touch('touchStart', [[ox, oy, 1]]); await sleep(30); await touch('touchMove', [[ox, oy - rad, 1]]); await sleep(60);
        const b4 = await st(); await touch('touchEnd', []); await sleep(300);
        R.check(Math.abs(wrap(b4.G.base - camBefore)) < 3 * Math.PI / 180 && Math.abs(wrap(b4.G.base - b3.G.base)) > 0.2, `G4 ${tag}: soltar y volver a tocar → base renovada = vista al tocar (${deg(b4.G.base)}° vs ${deg(camBefore)}°; antes ${deg(b3.G.base)}°)`, 'emulation', { base: deg(b4.G.base), camBefore: deg(camBefore), prevBase: deg(b3.G.base) });
        // ---------------------------------------------------------------- G5 (gesto lateral: ANMI acaba a 90° de la base; al recentrar la
        // cámara se pone detrás de ANMI y la base nueva debe ser esa vista, ≈ 90° de la anterior)
        await place(page, R, [-14, 0, -2], 0, 'walk', 'G5'); await sleep(600);
        await touch('touchStart', [[ox, oy, 1]]); await sleep(50); await touch('touchMove', [[ox + rad, oy, 1]]); await sleep(1200);
        const a5 = await st();
        await page.evaluate(() => document.getElementById('btn-cam').click()); await sleep(1200);
        const b5 = await st(); await touch('touchEnd', []); await sleep(300);
        const d5 = Math.abs(wrap(b5.G.base - a5.G.base));
        R.check(d5 > 60 * Math.PI / 180, `G5 ${tag}: recentrar (botón real) durante el gesto → base renovada (${deg(d5)}°)`, 'emulation', { base0: deg(a5.G.base), base1: deg(b5.G.base), h: deg(a5.h), cam1: deg(b5.cam) });
        // ---------------------------------------------------------------- G6
        await place(page, R, [-14, 0, -2], 0, 'ride', 'G6'); await sleep(400);
        await touch('touchStart', [[ox, oy, 1]]); await sleep(50); await touch('touchMove', [[ox + 10, oy - rad, 1]]); const h6 = (await st()).h; await sleep(3000);
        const b6 = await st(); await touch('touchEnd', []); await sleep(300);
        R.check(!b6.G.active && Math.abs(wrap(b6.h - h6)) < 3 * Math.PI / 180, `G6 ${tag}: en tabla no actúa (T+; deriva ${deg(Math.abs(wrap(b6.h - h6)))}°)`, 'emulation', { G: b6.G });
      } else {
        // ---------------------------------------------------------------- G7 control negativo: T+ con la vista girada
        await place(page, R, [-14, 0, -2], 0, 'walk', 'G7'); await sleep(400); await orbit(160); await sleep(200);
        const a = await st();
        await touch('touchStart', [[ox, oy, 1]]); await sleep(50); await touch('touchMove', [[ox, oy - rad, 1]]); await sleep(1500);
        const b7 = await st(); await touch('touchEnd', []);
        R.check(!b7.G.active && Math.abs(wrap(b7.h - a.h)) < 3 * Math.PI / 180, `G7 ${tag}: T+ (arriba = adelante de ANMI, no de la vista)`, 'emulation', { h0: deg(a.h), h1: deg(b7.h), cam: deg(a.cam) });
      }
      await page.close();
    }
    R.pendingHuman('Ensayo T+ vs C′ en el teléfono del usuario (E1/E3/E4/E5/E6, dos órdenes, tiempo/intentos/valoración) — T5-17/G8-T');
  } finally { await b.close(); }
});
