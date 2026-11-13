// V10.5 ronda PORTADA · guardián del ciclo de vida de la escena de la portada (PROMPT_V10_5_PORTADA §5.4):
//  · antes de JUGAR la escena viva dibuja (cuenta fotogramas) con su propio contexto WebGL2;
//  · tras JUGAR, en ≤ 1,5 s: ningún lienzo de la portada en el DOM, su contexto liberado (loseContext), su bucle parado (los fotogramas no
//    suben) y sus nodos de notas quitados; el juego ha empezado y su contexto sigue vivo;
//  · con la pestaña oculta la escena deja de dibujar.
import { Report, runTest, launch, sleep, SAVE_20 } from '../v8/lib.mjs';
import { dev, open7 } from './lib105.mjs';
const R = new Report('portada-ciclo');
const S20 = { ...SAVE_20, settings: { iosAppAsked: true } };
const P = (page) => page.evaluate(() => { const p = window.__bkPortada; return p ? { alive: p.alive, frames: p.frames, gl: p.webgl, lost: p.lost, liberado: p.liberado,
  lienzos: document.querySelectorAll('#portada-escena canvas').length, notas: document.querySelectorAll('#portada-escena .nota-musical').length, escena: !!document.getElementById('portada-escena') } : null; });

await runTest(R, async () => {
  const b = await launch(), errors = [];
  try {
    for (const [id, o, touch] of [['pc720', 'h', false], ['ip14', 'v', true]]) {
      const page = await open7(b, R, dev(id), o, { save: S20, query: '?bktest=1&narr=off&portada=viva', errors });
      const p0 = await P(page); await sleep(1000); const p1 = await P(page);
      R.check(!!p0 && p0.alive && p0.gl === 'gl' && p1.frames > p0.frames + 20, `${id}: antes de JUGAR la escena viva dibuja con su WebGL2 (${p1 ? p1.frames - p0.frames : 0} fotogramas en 1 s)`, 'unit', { p0, p1 });
      // pestaña oculta: no dibuja
      await page.evaluate(() => { Object.defineProperty(document, 'hidden', { configurable: true, get: () => true }); Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' }); document.dispatchEvent(new Event('visibilitychange')); });
      const h0 = await P(page); await sleep(800); const h1 = await P(page);
      await page.evaluate(() => { delete document.hidden; delete document.visibilityState; document.dispatchEvent(new Event('visibilitychange')); });
      R.check(!!h0 && h1.frames - h0.frames <= 1, `${id}: con la pestaña oculta la escena no dibuja`, 'unit', { h0, h1 });
      await sleep(300);
      const c = await page.evaluate(() => { const r = document.getElementById('btn-start').getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; });
      if (touch) await page.touchscreen.tap(c.x, c.y); else await page.mouse.click(c.x, c.y);
      await sleep(1500);
      const a = await P(page); await sleep(800); const a2 = await P(page);
      const g = await page.evaluate(() => ({ started: window.__bk.started, juegoVivo: !window.__bk.renderer.getContext().isContextLost() }));
      R.check(!!a && !a.alive && a.lienzos === 0 && a.liberado && a.notas === 0 && a2.frames === a.frames, `${id}: a 1,5 s de JUGAR no queda nada de la portada (lienzo, contexto, bucle, notas)`, 'unit', { a, a2 });
      R.check(g.started && g.juegoVivo, `${id}: la partida empieza y el contexto del juego sigue vivo`, 'unit', g);
      await page.close();
    }
    R.check(!errors.length, 'sin errores de página', 'input', errors.slice(0, 5));
  } finally { await b.close(); }
}, { timeoutMs: 600000 });
