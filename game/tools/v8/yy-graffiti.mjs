// V8 · yy-graffiti: precisión del grafiti de T1 con eventos REALES de ratón (escritorio) y táctiles (teléfono emulado).
// Cada caso parte de un perfil nuevo y de una colocación declarada junto a la rana (fixture: la llegada andando la cubre
// yy-routes). Casos: completar con trazo válido · error pequeño tolerado · salida grande falla y reinicia TODO (pantalla, mundo y
// guardado) y exige soltar · garabatear el lienzo falla · un salto rápido por fuera (un solo evento) cuenta su recorrido · el
// puntero capturado fuera del lienzo cuenta · éxito y exceso en el mismo paso → gana el fallo · hover, segundo dedo, cancelación
// y pausa no producen error · mismas trazas normalizadas con DPR 1/2, tamaños y frecuencias distintas dan las mismas medidas ·
// completar con el dedo en teléfono. Trazas sintéticas: verifican la lógica, NO el tacto de un teléfono físico.
import { Report, runTest, launch, openGame, clickStart, sleep, VIEWPORTS } from './lib.mjs';
import { Pilot } from '../v4/pilot.mjs';
import { W, HD, yy, KIT } from './yy-lib.mjs';
import { canvasInfo, toClient, maskStrokes, mouseStrokes, touchStrokes, gstate, M } from './yy-paint.mjs';

const R = new Report('yy-graffiti');
const PREC = KIT.activity.precision;
const near = (a, b, tol) => Math.abs(a - b) <= tol;

async function openPaint(browser, { viewport = VIEWPORTS.desktop, label = '' } = {}) {
  const page = await openGame(browser, R, { viewport, save: null }); await clickStart(page);
  await page.evaluate((p, h) => { const g = window.__bk, T = window.__bkTHREE; g.skater.teleport(new T.Vector3(p[0], 0, p[2]), h, 'walk'); g.rig.snapBehind(g.skater); }, W(2.0, 35.6), HD(0.3, -1));
  R.fixture(`ANMI a pie junto a la rana (${label || viewport.width + '×' + viewport.height})`, W(2.0, 35.6));
  await page.waitForFunction(() => window.__bk.npcs.get('rana')?.[0]?.actions.has('Dance'), { timeout: 40000 });
  const P = new Pilot(page, R); await sleep(600);
  const touch = !!viewport.hasTouch;
  const act = async () => { if (touch) { const ok = await page.waitForFunction(() => !document.getElementById('prompt').hidden && !document.getElementById('btn-action').disabled, { timeout: 6000 }).then(() => true).catch(() => false); if (ok) await page.tap('#btn-action'); return ok; } return P.act(/HABLAR|PINTAR|SEGUIR/, 6000); };
  if (!(await act())) throw new Error('sin oferta HABLAR/PINTAR junto a la rana');
  await page.waitForFunction(() => !document.getElementById('dialog').hidden || document.getElementById('graffiti-canvas').dataset.ready === '1', { timeout: 8000 });
  for (let i = 0; i < 4; i++) { await sleep(150); const s = await yy(page); if (!s.dialog) break; if (touch) await page.tap('#dialog-ok'); else await page.click('#dialog-ok'); await sleep(350); }
  await page.waitForFunction(() => document.getElementById('graffiti-canvas').dataset.ready === '1', { timeout: 15000 });
  await sleep(200);
  return { page, P };
}
/** Punto (m) claramente FUERA de la máscara dilatada a una distancia dada del borde del disco. */
const DISC = { cx: M.w / 2, cy: KIT.activity.target.h1 - 2.3, r: 0.75 };

await runTest(R, async () => {
  const browser = await launch();
  try {
    // ---------------------------------------------------------------- A · completar con ratón (trazo válido)
    { const { page } = await openPaint(browser, { label: 'A ratón' });
      const strokes = await maskStrokes(page); await mouseStrokes(page, strokes, { steps: 10 }); await sleep(1500);
      const g = await gstate(page), s = await yy(page);
      R.check(g.act && g.phase === 'celebrate' && g.errCells === 0 && g.fails === 0, 'A · ratón: pintar dentro del dibujo completa el grafiti sin error', 'input', { cover: g.cover, errCells: g.errCells, errLen: g.errLen, fails: g.fails });
      R.check(s.dialog && s.dialogText === 'Kroak!( Gracias!)' && s.rana?.clip === 'Dance', 'A · al acertar la rana BAILA (clip Dance) y dice EXACTAMENTE «Kroak!( Gracias!)»', 'input', { text: s.dialogText, clip: s.rana?.clip });
      R.check(s.fry?.available && !s.fry?.collected && !s.col.includes('yinyang.activity'), 'A · completar revela la patata pero NO la recoge (éxito y recogida separados)', 'input', s.fry);
      await page.close(); }
    // ---------------------------------------------------------------- B · error pequeño tolerado
    { const { page } = await openPaint(browser, { label: 'B pequeño' });
      const slips = [-0.6, 0, 0.6].map((dy) => { const y = DISC.cy + dy * 0.5; const x0 = DISC.cx + Math.sqrt(DISC.r ** 2 - (y - DISC.cy) ** 2) - 0.2; return [[x0, y], [x0 + 0.42, y]]; });
      await mouseStrokes(page, slips, { steps: 8 }); const g = await gstate(page);
      R.check(g.fails === 0 && g.phase === 'paint' && g.errCells > 0 && g.errCells < g.errLimit, 'B · tres pequeñas salidas del borde (≈0,22 m fuera cada una) se toleran: hay error medido pero no reinicio', 'input', { errCells: g.errCells, errLimit: Math.round(g.errLimit), errLen: g.errLen });
      // C · salida grande: desde el centro hacia fuera 1,6 m sin soltar
      const ci = await canvasInfo(page); await page.mouse.move(...toClient(ci, DISC.cx, DISC.cy)); await page.mouse.down();
      await page.mouse.move(...toClient(ci, DISC.cx - 0.2, DISC.cy + 0.1), { steps: 6 }); await page.mouse.move(...toClient(ci, 0.05, 2.35), { steps: 30 });
      let c = await gstate(page);
      R.check(c.fails === 1 && c.phase === 'failed' && c.painted === 0 && c.covered === 0 && c.partial === 0 && c.errCells === 0 && c.errLen === 0 && c.pct === '0%', 'C · salirse mucho FALLA y reinicia todo a 0 (celdas, contadores, error, porcentaje y parcial guardado)', 'input', c);
      const world = await page.evaluate(() => { const a = window.__bk.activities[2], cv = a.wallCanvas, x = cv.getContext('2d').getImageData(0, 0, cv.width, cv.height).data; let n = 0; const fin = new Set(); for (let i = 3; i < x.length; i += 4 * 97) if (x[i] > 0) n++; return { n, saved: window.__bk.state.p.partials.graffitiMask }; });
      R.check(world.saved === null, 'C · tras el fallo el guardado no conserva el intento (parcial borrado)', 'input', world);
      await page.mouse.move(...toClient(ci, DISC.cx, DISC.cy), { steps: 10 }); c = await gstate(page);
      R.check(c.covered === 0, 'C · sin soltar el botón no se sigue pintando: hace falta soltar y volver a pulsar', 'input', { covered: c.covered });
      await page.mouse.up(); await mouseStrokes(page, [[[DISC.cx - 0.2, DISC.cy], [DISC.cx + 0.2, DISC.cy]]]); c = await gstate(page);
      R.check(c.covered > 0 && c.phase === 'paint' && c.errCells === 0, 'C · al soltar y pulsar de nuevo se pinta desde cero (sin repetir la charla)', 'input', { covered: c.covered, phase: c.phase });
      await page.close(); }
    // ---------------------------------------------------------------- D · garabatear todo el lienzo
    { const { page } = await openPaint(browser, { label: 'D garabato' });
      const rows = []; for (let y = 0.1; y < M.h; y += 0.18) rows.push([[0.04, y], [M.w - 0.04, y]]);
      let failed = false, act = false;
      for (const r0 of rows) { await mouseStrokes(page, [r0], { steps: 14 }); const g = await gstate(page); if (g.fails > 0) { failed = true; break; } if (g.act) { act = true; break; } }
      const g = await gstate(page);
      R.check(failed && !act && !g.act, 'D · garabatear el lienzo entero FALLA antes de completar (no basta con cubrirlo todo)', 'input', { fails: g.fails, act: g.act });
      // E · salto rápido de un punto bueno a otro cruzando por fuera con UN solo evento: el subsegmento cuenta
      await mouseStrokes(page, [[[DISC.cx - 0.1, DISC.cy], [DISC.cx - 0.1, DISC.cy]]]); const e0 = await gstate(page);
      const ci = await canvasInfo(page); await page.mouse.move(...toClient(ci, DISC.cx - 0.6, DISC.cy - 0.1)); await page.mouse.down();
      await page.mouse.move(...toClient(ci, 0.12, 1.95), { steps: 1 });   // UN solo evento de dentro a fuera
      const e1 = await gstate(page); await page.mouse.up();
      R.check(e1.errLen - e0.errLen > 0.3 && e1.fails === e0.fails, 'E · un salto rápido de dentro a fuera con un único evento (sin eventos intermedios) cuenta el recorrido exterior interpolado', 'input', { antes: e0.errLen, despues: e1.errLen });
      await page.close(); }
    // ---------------------------------------------------------------- F · puntero capturado fuera del lienzo / H · hover, pausa, cancelación
    { const { page } = await openPaint(browser, { label: 'F/H' });
      const ci = await canvasInfo(page);
      // hover sin pulsar por dentro y por fuera
      await page.mouse.move(...toClient(ci, DISC.cx, DISC.cy)); await page.mouse.move(ci.left - 80, ci.top + 40, { steps: 12 }); await page.mouse.move(...toClient(ci, DISC.cx, DISC.cy), { steps: 12 });
      let g = await gstate(page); R.check(g.covered === 0 && g.errLen === 0, 'H · mover el ratón sin pulsar (hover) no pinta ni cuenta error', 'input', { covered: g.covered, errLen: g.errLen });
      // capturado: pulsar dentro y salir del lienzo 0,5 m de anchura de lienzo hacia la izquierda y volver
      await page.mouse.down(); await page.mouse.move(ci.left - ci.width * 0.25, ci.top + ci.height * 0.4, { steps: 10 }); g = await gstate(page);
      R.check(g.errLen > 0.4 && g.fails === 0, 'F · con el puntero capturado FUERA del lienzo el recorrido cuenta como fuera (sin recortar al borde)', 'input', { errLen: g.errLen });
      await page.mouse.up();
      // pausa con el botón pulsado: lo que se mueva en pausa no cuenta y el trazo termina
      await page.mouse.move(...toClient(ci, DISC.cx, DISC.cy + 0.2)); await page.mouse.down();
      const before = await gstate(page);
      await page.keyboard.press('Escape'); await sleep(300);
      const paused = await page.evaluate(() => window.__bk.paused);
      await page.mouse.move(ci.left - 60, ci.top + 30, { steps: 10 }); await page.mouse.up();
      g = await gstate(page);
      R.check(paused && g.errLen === before.errLen && g.covered === before.covered, 'H · en pausa (Esc) los movimientos no pintan ni suman error', 'input', { paused, antes: [before.covered, before.errLen], despues: [g.covered, g.errLen] });
      await page.keyboard.press('Escape'); await sleep(400);
      await page.close(); }
    // ---------------------------------------------------------------- G · éxito y exceso en el MISMO paso → gana el fallo
    { const { page } = await openPaint(browser, { label: 'G simultáneo' });
      const strokes = await maskStrokes(page, 0.10);
      // se dejan sin pintar dos filas del centro del disco; un ÚNICO evento las cruza enteras y sigue 1,6 m fuera del lienzo:
      // en esa misma evaluación la cobertura llega a la meta y el recorrido exterior supera el presupuesto
      const yc = DISC.cy + 0.05, skip = (st) => Math.abs(st[0][1] - yc) < 0.11;
      let g = await gstate(page);
      for (const st of strokes.filter((q) => !skip(q))) { await mouseStrokes(page, [st], { steps: 10 }); g = await gstate(page); if (g.cover >= PREC.coverGoal - 0.025 || g.act) break; }
      R.measure('G_previo', { cover: g.cover, errLen: g.errLen, fails: g.fails });
      if (g.act || g.cover >= PREC.coverGoal || g.fails) R.invalid('G · la preparación ya alcanzó la meta o falló', { cover: g.cover, fails: g.fails });
      else {
        const ci = await canvasInfo(page); await page.mouse.move(...toClient(ci, DISC.cx - DISC.r + 0.05, yc)); await page.mouse.down();
        await page.mouse.move(...toClient(ci, M.w + 1.6, yc), { steps: 1 });
        g = await gstate(page); await page.mouse.up();
        const reached = await page.evaluate(() => window.__bk.activities[2].log.filter((q) => q.ev === 'fail').slice(-1)[0]?.info ?? null);
        R.check(g.fails === 1 && !g.act && reached && reached.painted / reached.mask >= PREC.coverGoal, 'G · si en el mismo evento se alcanza la cobertura (≥ 92 %) y se supera el error, PREVALECE el fallo (sin éxito ni premio)', 'input', { fails: g.fails, act: g.act, enElFallo: reached });
      }
      await page.close(); }
    // ---------------------------------------------------------------- I · invariancia (DPR, tamaño, frecuencia de eventos)
    { const trace = [[[DISC.cx - 0.5, DISC.cy - 0.2], [DISC.cx + 0.5, DISC.cy - 0.2], [DISC.cx + 0.95, DISC.cy + 0.3], [DISC.cx - 0.3, DISC.cy + 0.55]]];
      const res = [];
      for (const [vp, steps, lab] of [[{ width: 1280, height: 800, deviceScaleFactor: 1 }, 6, 'dpr1 1280×800 6 ev'], [{ width: 1280, height: 800, deviceScaleFactor: 2 }, 30, 'dpr2 1280×800 30 ev'], [{ width: 900, height: 1000, deviceScaleFactor: 1 }, 2, 'dpr1 900×1000 2 ev']]) {
        const { page } = await openPaint(browser, { viewport: vp, label: lab }); await mouseStrokes(page, trace, { steps }); const g = await gstate(page);
        res.push({ lab, covered: g.covered, painted: g.painted, errCells: g.errCells, errLen: +g.errLen.toFixed(3), canvasCss: (await canvasInfo(page)).width }); await page.close();
      }
      R.measure('invariancia', res);
      const ok = res.every((r) => near(r.covered, res[0].covered, res[0].covered * 0.03) && near(r.errCells, res[0].errCells, Math.max(4, res[0].errCells * 0.05)) && near(r.errLen, res[0].errLen, 0.04));
      R.check(ok, 'I · la misma traza normalizada da la misma cobertura y el mismo error con DPR 1 y 2, otro tamaño de lienzo y 2–30 eventos por tramo', 'input', res); }
    // ---------------------------------------------------------------- J · completar con el dedo (teléfono emulado) y segundo dedo
    { const { page } = await openPaint(browser, { viewport: VIEWPORTS.phone, label: 'J táctil' });
      const ci = await canvasInfo(page), cdp = await page.createCDPSession();
      const p0 = toClient(ci, DISC.cx - 0.3, DISC.cy), p1 = toClient(ci, 0.05, 0.1);
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: p0[0], y: p0[1], id: 1 }] });
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: p0[0], y: p0[1], id: 1 }, { x: p1[0], y: p1[1], id: 2 }] });
      for (let k = 1; k <= 8; k++) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: p0[0], y: p0[1], id: 1 }, { x: p1[0] + k * 3, y: p1[1] + k * 6, id: 2 }] });
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); await cdp.detach();
      let g = await gstate(page); R.check(g.errLen === 0 && g.errCells === 0 && g.fails === 0, 'J · un segundo dedo fuera del dibujo se ignora (sin error)', 'input', { errLen: g.errLen, errCells: g.errCells });
      const strokes = await maskStrokes(page); await touchStrokes(page, strokes, { steps: 6 }); await sleep(1500);
      g = await gstate(page); const s = await yy(page);
      R.check(g.act && g.errCells === 0 && s.dialogText === 'Kroak!( Gracias!)', 'J · con el dedo (táctil emulado, 390×844) se completa con el mismo umbral y la rana da las gracias', 'emulation', { act: g.act, cover: g.cover, text: s.dialogText });
      await page.close(); }
    R.pendingHuman('tacto y precisión con dedo y ratón FÍSICOS en teléfono real (aquí eventos sintéticos)');
    R.pendingHuman('calibración final del umbral por el usuario (propuesta técnica yy8-p1)');
  } finally { await browser.close(); }
}, { timeoutMs: 900000 });
