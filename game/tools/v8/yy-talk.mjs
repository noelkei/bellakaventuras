// V8 · yy-talk: la rana de YINYANG con ACCIÓN (E) real, «Vale», pausa (Esc) y recargas reales. Fixture declarada: ANMI colocada
// junto a la rana (la llegada andando la cubre yy-routes). Casos: dónde se ofrece HABLAR (a pie en su recuadro; no desde el fondo
// ni en tabla ni lejos) · las cuatro frases EXACTAS en orden con avance manual · doble pulsación · pausa con frase abierta ·
// recargar a mitad (no cuenta como escuchada) · tras escucharlas, PINTAR sin repetirlas (también tras recargar) · salir de la
// pintura repone modo, cámara, controles y tabla · carga fallida de la rana (sin charla fingida) y reintento · recargar durante el
// «Gracias»: el hito y la patata se conservan, sin duplicar.
import { Report, runTest, launch, openGame, clickStart, sleep } from './lib.mjs';
import { Pilot } from '../v4/pilot.mjs';
import { W, HD, yy } from './yy-lib.mjs';
import { maskStrokes, mouseStrokes, gstate } from './yy-paint.mjs';
const INTRO = ['Kroak...( Esta era mi casa antes...)', 'Kroak...( Ahora es un skatepark...)', 'Kroak...( El pago para usarlo es que me hagas un graffiti para mi colección...)', 'Kroak!( Más te vale que esté bien BELLAKO!!!)'];
const THANKS = 'Kroak!( Gracias!)';
const R = new Report('yy-talk');
const place = (page, p, h, loco = 'walk') => page.evaluate((p, h, loco) => { const g = window.__bk, T = window.__bkTHREE; g.skater.teleport(new T.Vector3(p[0], p[1], p[2]), h, loco); g.rig.snapBehind(g.skater); }, p, h, loco);
const ready = (page) => page.waitForFunction(() => window.__bk.npcs.get('rana')?.[0]?.actions.has('Dance'), { timeout: 40000 });
const reload = async (page) => { await page.reload({ waitUntil: 'load' }); await page.waitForFunction(() => window.__bk && !document.getElementById('btn-start').disabled, { timeout: 120000 }); await clickStart(page); await sleep(900); };
const FROG = W(2.0, 35.6), FH = HD(0.3, -1);
await runTest(R, async () => {
  const browser = await launch();
  try {
    const page = await openGame(browser, R, { save: null }); await clickStart(page); const P = new Pilot(page, R);
    // ---------------------------------------------------------------- dónde se ofrece
    await place(page, FROG, FH); R.fixture('ANMI a pie junto a la rana', FROG); await ready(page); await sleep(600);
    let s = await yy(page); R.check(/HABLAR/.test(s.prompt) && !/disabled/.test(s.prompt), 'a pie dentro del recuadro de la rana se ofrece HABLAR', 'input', { prompt: s.prompt });
    await place(page, W(-3.4, 34.0, -1.75), HD(0, 1)); await sleep(500); s = await yy(page);
    R.check(!/HABLAR/.test(s.prompt), 'desde el fondo del vaso (N2) no se ofrece HABLAR', 'input', { prompt: s.prompt, h: s.y });
    await place(page, W(5.0, 37.2), HD(0, -1)); await sleep(400); s = await yy(page);
    R.check(!/HABLAR/.test(s.prompt), 'lejos de la rana no se ofrece HABLAR', 'input', { prompt: s.prompt });
    await place(page, FROG, FH, 'ride'); await sleep(500);
    const off = await page.evaluate(() => ({ dis: document.getElementById('btn-action').classList.contains('off') || document.getElementById('btn-action').disabled, note: document.getElementById('prompt').textContent }));
    R.check(off.dis && /Bájate/.test(off.note), 'en tabla el botón se ve deshabilitado con «Bájate del skate…» (IG-005)', 'input', off);
    await place(page, FROG, FH); await sleep(500);
    // ---------------------------------------------------------------- cuatro frases exactas, doble pulsación y pausa
    await P.act(/HABLAR/, 4000); await page.keyboard.press('KeyE'); await sleep(500);   // doble pulsación
    // V10.5 (E5-12, cambio de diseño aprobado; copia previa en V10/backups/pruebas/V10_5-R2): el bocadillo sale cuando la cámara termina de llegar
    await page.waitForFunction(() => !document.getElementById('dialog').hidden, { timeout: 4000 }).catch(() => {});
    const seen = [];
    for (let i = 0; i < 4; i++) {
      s = await yy(page); seen.push(s.dialogText);
      if (i === 1) {
        const c0 = await page.evaluate(() => window.__bk.clock); await page.keyboard.press('Escape'); await sleep(1200);
        const pz = await page.evaluate(() => ({ paused: window.__bk.paused, clock: window.__bk.clock, t: document.getElementById('dialog-text').textContent }));
        R.check(pz.paused && Math.abs(pz.clock - c0) < 0.03, 'pausa con la frase abierta: el reloj de simulación se congela', 'input', { c0, c1: pz.clock });
        await page.click('#btn-resume'); await sleep(500); const t2 = (await yy(page)).dialogText;
        R.check(t2 === INTRO[1], 'al seguir, la misma frase sigue abierta', 'input', { t2 });
      }
      await page.click('#dialog-ok'); await sleep(400);
    }
    R.check(JSON.stringify(seen) === JSON.stringify(INTRO), 'las cuatro frases EXACTAS y en orden, con avance manual (doble E no salta ni duplica)', 'input', seen);
    await page.waitForFunction(() => document.getElementById('graffiti-canvas').dataset.ready === '1', { timeout: 15000 });
    s = await yy(page); R.check(s.partials.graffitiIntro && s.gfx.overlay, 'tras confirmar la cuarta se abre la pintura y queda guardado que se escucharon', 'input', { intro: s.partials.graffitiIntro });
    // pinta un poco, sale con «Salir»: modo, cámara, controles y tabla repuestos y el parcial guardado
    const strokes = await maskStrokes(page); await mouseStrokes(page, strokes.slice(0, 5));
    const g0 = await gstate(page); await page.click('#graffiti-exit'); await sleep(700);
    s = await yy(page); const rest = await page.evaluate(() => ({ frozen: window.__bk.skater.frozen, rig: window.__bk.rig.mode ?? null, board: window.__bk.visual?.boardVisible ?? null }));
    R.check(s.mode === 'explore' && !rest.frozen && !s.gfx.overlay && s.partials.graffitiMask && s.partials.graffitiCheck === g0.covered, 'Salir repone modo, controles y cámara, y guarda el parcial (con el error) sin perderlo', 'input', { mode: s.mode, rest, saved: s.partials.graffitiCheck, covered: g0.covered });
    await sleep(2500); s = await yy(page);
    R.check(s.rana && Math.hypot(s.rana.pos[0] - FROG[0], s.rana.pos[2] - FROG[2]) < 1.6, 'la rana vuelve a su sitio al salir', 'input', s.rana);
    // ---------------------------------------------------------------- recarga: no repite frases; SEGUIR PINTANDO con lo mismo
    await reload(page); await place(page, FROG, FH); await ready(page); await sleep(600); s = await yy(page);
    R.check(/SEGUIR PINTANDO/.test(s.prompt), 'tras recargar se ofrece SEGUIR PINTANDO (sin repetir las cuatro frases)', 'input', { prompt: s.prompt });
    await P.act(/SEGUIR/, 4000); await sleep(600); s = await yy(page);
    R.check(!s.dialog && s.gfx.overlay, 'SEGUIR PINTANDO abre la pintura directamente', 'input', { dialog: s.dialog });
    await page.waitForFunction(() => document.getElementById('graffiti-canvas').dataset.ready === '1', { timeout: 15000 });
    const g1 = await gstate(page); R.check(g1.covered === g0.covered && g1.painted === g0.painted && Math.abs(g1.errLen - g0.errLen) < 1e-3, 'el parcial recuperado tiene la misma cobertura y el mismo error', 'input', { antes: [g0.covered, g0.errLen], ahora: [g1.covered, g1.errLen] });
    // completar y recargar durante el «Gracias»
    await mouseStrokes(page, await maskStrokes(page)); await page.waitForFunction(() => !document.getElementById('dialog').hidden, { timeout: 8000 }); s = await yy(page);
    R.check(s.dialogText === THANKS && s.rana?.clip === 'Dance' && s.act, 'al terminar: «Kroak!( Gracias!)» con la rana bailando y el hito ya guardado', 'input', { t: s.dialogText, clip: s.rana?.clip, act: s.act });
    await reload(page); await place(page, FROG, FH); await sleep(1200); s = await yy(page);
    const cnt = await page.evaluate(() => window.__bk.pickups.filter((p) => p.id === 'yinyang.activity' && !p.collected && p.available).length);
    R.check(s.act && cnt === 1 && !s.col.includes('yinyang.activity') && !/HABLAR|PINTAR/.test(s.prompt), 'recargar durante el agradecimiento conserva el hito y UNA patata pendiente; la rana ya no ofrece la actividad', 'input', { act: s.act, cnt, prompt: s.prompt });
    await page.close();
    // ---------------------------------------------------------------- carga fallida de la rana
    { const p2 = await browser.newPage(); await p2.setViewport({ width: 1280, height: 800 }); await p2.setRequestInterception(true);
      let block = true; p2.on('request', (r) => { if (block && /npcs\/rana(_rosa)?\.glb/.test(r.url())) r.abort(); else r.continue(); });   // V10 IT3: la rana de YY es ya rana_rosa.glb (petición del usuario); se bloquean los dos nombres
      await p2.evaluateOnNewDocument(() => { if (!sessionStorage.getItem('x')) { sessionStorage.setItem('x', '1'); localStorage.removeItem('bellakaventuras.remake.save'); } });
      await p2.goto(R.data.url + '?bktest=1&narr=off', { waitUntil: 'load' }); await p2.waitForFunction(() => window.__bk && !document.getElementById('btn-start').disabled, { timeout: 120000 }); await clickStart(p2);
      await place(p2, FROG, FH); R.fixture('carga de npcs/rana.glb y npcs/rana_rosa.glb bloqueada (fallo de red simulado)'); await sleep(2500);
      let t = await yy(p2); const note = await p2.evaluate(() => document.getElementById('prompt').textContent);
      R.check(!t.rana && /llegando/.test(note) && !t.dialog, 'sin la rana cargada NO se ofrece la charla (botón gris «La rana está llegando…»)', 'input', { note, rana: t.rana });
      await p2.keyboard.press('KeyE'); await sleep(500); t = await yy(p2); R.check(!t.dialog && t.mode === 'explore', 'pulsar ACCIÓN sin rana no abre ninguna charla', 'input', { dialog: t.dialog });
      block = false; await p2.waitForFunction(() => window.__bk.npcs.has('rana'), { timeout: 30000 }).catch(() => {});
      t = await yy(p2); R.check(!!t.rana, 'al volver la red, la rana se carga sola (reintento) y aparece en su sitio', 'input', t.rana);
      await p2.close(); }
  } finally { await browser.close(); }
}, { timeoutMs: 600000 });
