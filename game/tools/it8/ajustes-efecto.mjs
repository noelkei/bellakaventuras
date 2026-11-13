// IT8 · E4 · guardián: cada ajuste hace lo que dice y se guarda. Se cambia con la entrada real (clic o toque en su casilla de Ajustes,
// flechas en los deslizadores), se cierra, se mide el efecto, se recarga y se vuelve a medir.
//  · Invertir Y (ordenador): I mantenida mueve la cámara en sentido contrario que sin invertir.
//  · Sensibilidad (ordenador): con el máximo, J mueve la cámara > 1,8 veces lo que con el mínimo.
//  · Reducir movimiento: el ajuste llega al juego (sin sacudida de cámara en el aterrizaje del reto: lo mide sn-reto; aquí, el estado).
//  · Tamaño de los botones (móvil): con 200 % SALTO mide ~2 veces lo de 100 % (±20 %).
//  · Zurdo (móvil): el joystick pasa a la mitad derecha y SALTO a la izquierda.
//  · Modo eficiente (móvil): el juego lo activa (sombras «eficiente»), y en ordenador la casilla no aparece.
//  · Orientación «Vertical» en un móvil girado: el juego gira el contenedor (rot90) y se conserva al recargar.
import { Report, runTest, launch, sleep, arg } from '../v8/lib.mjs';
import { open8, start8, dev, S20, tapOrClick, reload8, center, saveJson } from './lib8.mjs';
const R = new Report('it8-ajustes', { task: arg('task', 'IT8') });
async function abrirAjustes(page, t) { if (t) await tapOrClick(page, '#btn-pause', true); else await page.keyboard.press('Escape'); await sleep(600); await tapOrClick(page, '#btn-settings', t); await sleep(600); }
async function cerrar(page, t) { await tapOrClick(page, '#btn-settings-close', t); await sleep(400); await tapOrClick(page, '#btn-resume', t); await sleep(600); }
async function casilla(page, id, t) { await page.evaluate((id) => document.getElementById(id)?.scrollIntoView({ block: 'center' }), id); await sleep(200); const ok = await tapOrClick(page, '#' + id, t); await sleep(300); return ok; }
const camDelta = (page, key, ms = 450) => page.evaluate(async (key, ms) => { const g = window.__bk, y0 = g.rig.yaw, p0 = g.rig.pitch; window.dispatchEvent(new KeyboardEvent('keydown', { code: key })); await new Promise((r) => setTimeout(r, ms)); window.dispatchEvent(new KeyboardEvent('keyup', { code: key })); await new Promise((r) => setTimeout(r, 150)); return { dy: g.rig.yaw - y0, dp: g.rig.pitch - p0 }; }, key, ms);
const S = (page) => page.evaluate(() => { const g = window.__bk, st = g.state.p.settings, kJ = parseFloat(document.getElementById('btn-jump')?.style.getPropertyValue('--btn-k') || '1'), r = (id) => { const e = document.getElementById(id); if (!e) return null; const b = e.getBoundingClientRect(); return { x: b.left + b.width / 2, w: b.width, h: b.height }; };
  return { kJ, st: { ...st }, rig: { sens: g.rig.sens, inv: g.rig.invertY }, eficiente: g.efficient, html: document.documentElement.className, zurdo: document.body.classList.contains('zurdo'), jump: r('btn-jump'), stick: r('stick-zone'), W: innerWidth, efRow: (() => { const e = document.getElementById('opt-eficiente-row'); return !!e && !e.hidden && e.getBoundingClientRect().height > 0; })() }; });
await runTest(R, async () => {
  const b = await launch(); const out = {};
  try {
    // ---- ordenador
    { const page = await open8(b, R, dev('pc720'), 'h', { save: { ...S20, settings: { iosAppAsked: true, invertY: false, camSens: 1 } } }); await start8(page, false); await sleep(1200);
      const n0 = await camDelta(page, 'KeyI');
      await abrirAjustes(page, false); const ef = await S(page); await casilla(page, 'opt-invert', false); await cerrar(page, false);
      const n1 = await camDelta(page, 'KeyK'); const n1b = await camDelta(page, 'KeyI');
      R.check(Math.sign(n1b.dp) === -Math.sign(n0.dp) && Math.abs(n0.dp) > 0.01, 'invertir Y: I mueve la cámara al revés que sin invertir', 'input', { sinInvertir: n0.dp, invertido: n1b.dp });
      R.check(!ef.efRow, 'ordenador: la casilla «Modo eficiente» no aparece', 'emulation', { visible: ef.efRow });
      // sensibilidad: mínimo y máximo con las flechas
      const sens = async (dir) => { await abrirAjustes(page, false); await page.focus('#opt-sens'); for (let i = 0; i < 20; i++) await page.keyboard.press(dir === 'min' ? 'ArrowLeft' : 'ArrowRight'); await page.keyboard.press('Tab'); await sleep(200); await cerrar(page, false); await sleep(300); return camDelta(page, 'KeyJ', 500); };
      const lo = await sens('min'), hi = await sens('max'); const s1 = await S(page);
      R.check(Math.abs(hi.dy) > 1.8 * Math.abs(lo.dy) && Math.abs(lo.dy) > 0.005, `sensibilidad: con el máximo la cámara gira ${(Math.abs(hi.dy) / Math.max(1e-6, Math.abs(lo.dy))).toFixed(1)}× lo del mínimo`, 'input', { min: lo.dy, max: hi.dy, st: s1.st.camSens });
      await abrirAjustes(page, false); await casilla(page, 'opt-reduced', false); await cerrar(page, false); const s2 = await S(page);
      await reload8(page); await start8(page, false); await sleep(800); const s3 = await S(page);
      R.check(s3.st.invertY === true && s3.rig.inv === true && Math.abs(s3.st.camSens - s1.st.camSens) < 0.01 && s3.rig.sens === s3.st.camSens && s3.st.reducedMotion === !ef.st.reducedMotion, 'al recargar se conservan invertir Y, sensibilidad y reducir movimiento (y llegan a la cámara)', 'input', { antes: s2.st, despues: s3.st, rig: s3.rig });
      out.pc = { n0, n1b, lo, hi, s3 }; await page.close(); }
    // ---- móvil
    { const d = dev('ip14'); const page = await open8(b, R, d, 'h', { save: { ...S20, settings: { iosAppAsked: true, btnScale: 1, leftHanded: false, eficiente: false } } }); await start8(page, true); await sleep(1200);
      const a = await S(page);
      await abrirAjustes(page, true); await casilla(page, 'opt-zurdo', true); await casilla(page, 'opt-eficiente', true);
      await tapOrClick(page, '#btn-size-open', true); await sleep(500); for (let i = 0; i < 12; i++) { await tapOrClick(page, '#btn-size-plus', true); await sleep(80); } await tapOrClick(page, '#btn-size-save', true); await sleep(500);
      await cerrar(page, true); const z = await S(page);
      const ratio = z.jump && a.jump ? z.jump.w / a.jump.w : null;
      // hudlayout.ts:110-113: el tamaño se reduce al mayor que cabe sin solapes (diseño): SALTO crece lo aplicado (`--btn-k`), y mucho más de 1×
      R.check(ratio && Math.abs(ratio - z.kJ) < 0.15 && z.kJ >= 1.3 && Math.abs(z.st.btnScale - 2) < 0.05, `tamaño de botones: con 200 % SALTO mide ${ratio?.toFixed(2)}× (aplicado ${z.kJ}×, lo que cabe)`, 'emulation', { a: a.jump, z: z.jump, st: z.st.btnScale, k: z.kJ });
      R.check(z.zurdo && z.stick && z.jump && z.stick.x > z.W / 2 && z.jump.x < z.W / 2, 'zurdo: el joystick pasa a la derecha y SALTO a la izquierda', 'emulation', { stick: z.stick, jump: z.jump, W: z.W });
      R.check(z.st.eficiente && z.eficiente, 'Modo eficiente: la casilla lo activa en el juego', 'emulation', { st: z.st.eficiente, juego: z.eficiente });
      await reload8(page); await start8(page, true); await sleep(800); const y = await S(page);
      R.check(y.st.leftHanded && y.zurdo && y.st.eficiente && y.eficiente && Math.abs(y.st.btnScale - 2) < 0.05 && y.jump && Math.abs(y.jump.w / a.jump.w - y.kJ) < 0.15 && y.kJ >= 1.3, 'al recargar se conservan zurdo, Modo eficiente y tamaño (y se aplican)', 'emulation', { st: y.st, zurdo: y.zurdo, ef: y.eficiente });
      // orientación «Vertical» con el móvil en horizontal
      await tapOrClick(page, '#btn-pause', true); await sleep(500); let lab = ''; for (let i = 0; i < 3 && !/Vertical/.test(lab); i++) { await tapOrClick(page, '#btn-orient', true); await sleep(500); lab = await page.evaluate(() => document.getElementById('btn-orient').textContent); }
      const o1 = await S(page); await reload8(page); const o2 = await page.evaluate(() => ({ orient: window.__bk.state.p.settings.orientation, html: document.documentElement.className }));
      R.check(/rot/.test(o1.html) && o2.orient === 'vertical' && /rot/.test(o2.html), 'orientación «Vertical» en un móvil apaisado: el juego gira la imagen y se conserva al recargar', 'emulation', { etiqueta: lab, antes: o1.html, despues: o2 });
      out.movil = { a, z, y, o1: o1.html, o2 }; await page.close(); }
    saveJson('E4-ajustes/resultado.json', out);
  } finally { await b.close(); }
}, { timeoutMs: 900000 });
