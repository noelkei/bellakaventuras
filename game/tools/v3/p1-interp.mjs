// CTRL-07: misma física (60 Hz) presentada a 30/60/120/144 Hz. Se conduce el bucle `tick(dt)` del juego con tiempos
// sintéticos (emulación de tasa de refresco; NO es la frecuencia real de un teléfono). Para cada tasa se mide el paso
// de la posición presentada por fotograma y su irregularidad, con y sin interpolación, y el resultado del salto.
import { Report, launch, openGame, clickStart, VIEWPORTS } from './lib.mjs';

const R = new Report('P1/CTRL-07', 'interp', { method: 'tick(dt) sintético a 30/60/120/144 Hz; misma física; entrada por autoWish (simulación aislada declarada)' });
const browser = await launch();
const page = await openGame(browser, R, { viewport: VIEWPORTS.desktop, save: null });
await clickStart(page);
try {
  const res = await page.evaluate(async () => {
    const g = window.__bk, T = window.__bkTHREE; g.autoMode = true;
    const S = g.park.sector('no_me_guillo'); const p0 = S.P(44, -10); const h = S.ccw(-10) + Math.PI;
    const out = [];
    for (const hz of [30, 60, 120, 144]) for (const interp of [true, false]) {
      g.skater.teleport(p0.clone(), h, 'ride'); g.acc = 0; g.rig.snapBehind(g.skater);
      const dt = 1 / hz; const steps = []; const errs = []; let last = null; const cams = [];
      let jumpAt = null, peak = 0, y0 = null;
      for (let i = 0; i < Math.round(hz * 4.5); i++) {
        g.autoWish = new T.Vector2(Math.sin(h), Math.cos(h));
        if (i === Math.round(hz * 3)) { g.input.pressJump(); jumpAt = g.clock; }
        g.tick(dt, interp);
        const v = g.skater.visualPos.clone();
        if (last && i > hz * 2 && i < hz * 3) { const exp = Math.hypot(g.skater.vel.x, g.skater.vel.z) * dt; steps.push(v.distanceTo(last)); errs.push(Math.abs(v.distanceTo(last) - exp) / exp); }
        if (i > hz * 2 && i < hz * 3) cams.push(g.rig.cam.position.clone());
        if (jumpAt !== null && !g.skater.grounded) peak = Math.max(peak, g.skater.airPeak);
        last = v;
      }
      g.autoWish = null;
      const mean = steps.reduce((a, b) => a + b, 0) / steps.length;
      const sd = Math.sqrt(steps.reduce((a, b) => a + (b - mean) ** 2, 0) / steps.length);
      const zeros = steps.filter((s) => s < mean * 0.25).length;
      let camJ = 0; for (let k = 2; k < cams.length; k++) camJ = Math.max(camJ, cams[k].clone().sub(cams[k - 1]).sub(cams[k - 1].clone().sub(cams[k - 2])).length());
      errs.sort((a, b) => a - b); out.push({ hz, interp, meanStep: +mean.toFixed(4), cv: +(sd / mean).toFixed(3), errMed: +errs[errs.length >> 1].toFixed(3), errMax: +errs[errs.length - 1].toFixed(3), stalls: zeros, camAccelMax: +camJ.toFixed(4), jumpPeak: +peak.toFixed(3), speed: +g.skater.speed.toFixed(2) });
    }
    g.autoMode = false;
    return out;
  });
  for (const r of res) R.note(r);
  for (const hz of [30, 60, 120, 144]) {
    const a = res.find((r) => r.hz === hz && r.interp), b = res.find((r) => r.hz === hz && !r.interp);
    R.check(a.errMax < 0.25 && a.stalls === 0, `${hz} Hz con interpolación: avance presentado = velocidad·dt (error máx <25%, sin fotogramas parados)`, 'sim', { interp: a, raw: b });
  }
  const peaks = res.filter((r) => r.interp).map((r) => r.jumpPeak);
  R.check(Math.max(...peaks) - Math.min(...peaks) < 0.03, 'mismo resultado de salto a 30/60/120/144 Hz (física fija)', 'sim', { peaks });
} catch (e) { R.data.errors.push('HARNESS ' + (e?.stack ?? e)); }
finally { await browser.close(); R.finish(); }
