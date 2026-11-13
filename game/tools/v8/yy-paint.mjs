// V8 · trazas de pintura para las pruebas del grafiti de YINYANG. Se generan en METROS de la diana y se envían como eventos
// REALES de ratón (page.mouse) o táctiles (CDP Input.dispatchTouchEvent): el juego recibe pointerdown/move/up como con una persona.
// Una traza sintética verifica la lógica de precisión, no el tacto de un teléfono físico.
import { sleep } from './lib.mjs';
/** Diana en metros y caja del lienzo en pantalla (CSS px). */
export async function canvasInfo(page) {
  return page.evaluate(() => { const c = document.getElementById('graffiti-canvas'), r = c.getBoundingClientRect(), a = window.__bk.activities[2];
    return { left: r.left, top: r.top, width: r.width, height: r.height, ready: c.dataset.ready === '1', tw: a.constructor.name && window.__bkGraffitiM?.w, GW: a.GW, GH: a.GH }; });
}
export const M = { w: 120 * Math.PI / 180 * 1.006, h: 2.4 };
export const toClient = (ci, x, y) => [ci.left + x / M.w * ci.width, ci.top + y / M.h * ci.height];
/** Trazas que cubren la máscara: filas cada `dy` m; cada tramo continuo de máscara es un trazo (se levanta el dedo entre tramos). */
export async function maskStrokes(page, dy = 0.12, inset = 0.0) {
  return page.evaluate((dy, inset, MW, MH) => { const a = window.__bk.activities[2], GW = a.GW, GH = a.GH, cw = MW / GW, ch = MH / GH, out = [];
    for (let y = dy / 2; y < MH; y += dy) { const gy = Math.min(GH - 1, Math.floor(y / ch)); let run = null;
      for (let gx = 0; gx <= GW; gx++) { const on = gx < GW && a.maskGrid[gy * GW + gx];
        if (on && run === null) run = gx; if (!on && run !== null) { const x0 = run * cw + inset, x1 = gx * cw - inset; if (x1 > x0) out.push([[x0, y], [x1, y]]); run = null; } } }
    return out; }, dy, inset, M.w, M.h);
}
/** Dibuja trazos [[x, y], …] (metros) con el ratón; `steps` = eventos intermedios por tramo (simula frecuencias distintas). */
export async function mouseStrokes(page, strokes, { steps = 8, hold = 0 } = {}) {
  const ci = await canvasInfo(page);
  for (const s of strokes) {
    await page.mouse.move(...toClient(ci, ...s[0])); await page.mouse.down();
    for (let i = 1; i < s.length; i++) await page.mouse.move(...toClient(ci, ...s[i]), { steps });
    if (hold) await sleep(hold);
    await page.mouse.up();
  }
}
/** Igual con el dedo (CDP: touchStart/touchMove/touchEnd). */
export async function touchStrokes(page, strokes, { steps = 8 } = {}) {
  const ci = await canvasInfo(page), cdp = await page.createCDPSession();
  for (const s of strokes) {
    const p0 = toClient(ci, ...s[0]);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: p0[0], y: p0[1], id: 1 }] });
    let prev = p0;
    for (let i = 1; i < s.length; i++) { const p = toClient(ci, ...s[i]); for (let k = 1; k <= steps; k++) { const q = [prev[0] + (p[0] - prev[0]) * k / steps, prev[1] + (p[1] - prev[1]) * k / steps]; await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: q[0], y: q[1], id: 1 }] }); } prev = p; }
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  }
  await cdp.detach();
}
export const gstate = (page) => page.evaluate(() => { const a = window.__bk.activities[2], g = window.__bk;
  return { phase: a.phase, painted: a.paintedCount, mask: a.maskCount, cover: a.maskCount ? a.paintedCount / a.maskCount : 0, errCells: a.errCells, errLimit: a.errLimitCells, errLen: a.errLen, fails: a.fails,
    covered: a.covered ? a.covered.reduce((s, v) => s + v, 0) : null, act: g.state.p.activities.graffiti, partial: g.state.p.partials.graffitiMask ? g.state.p.partials.graffitiCheck : 0, errRunSaved: g.state.p.partials.graffitiErrRun,
    overlay: !document.getElementById('graffiti').hidden, msg: document.getElementById('graffiti-msg').textContent, pct: document.getElementById('graffiti-pct').textContent, log: a.log.slice(-6) }; });
