// V10.5 ronda PORTADA · guardián del movimiento de la portada (PROMPT_V10_5_PORTADA §5.8, §7.6):
//  · referencia (?bktest&portada=viva): el tiempo de la escena avanza, salen notas de la radio y JUGAR «llama» antes de 10 s;
//  · con «prefers-reduced-motion», con «Reducir movimiento» en Ajustes o con el Modo eficiente (móvil): escena quieta (tiempo y movimiento 0),
//    sin notas y sin llamada; al quitar «Reducir movimiento» desde los Ajustes del inicio, vuelve a moverse;
//  · con ?bktest (sin portada=viva): quieta y sin notas (pruebas deterministas y menos GPU en la batería).
import { Report, runTest, launch, sleep, SAVE_20 } from '../v8/lib.mjs';
import { dev, open7 } from './lib105.mjs';
const R = new Report('portada-movimiento');
const S = (extra = {}) => ({ ...SAVE_20, settings: { iosAppAsked: true, ...extra } });
async function mira(page, ms) {
  await page.evaluate(() => { window.__llamadas = 0; const m = document.querySelector('#start .pt-jugar-marco');
    if (m) new MutationObserver(() => { if (m.classList.contains('llamada')) window.__llamadas++; }).observe(m, { attributes: true, attributeFilter: ['class'] }); });
  const t0 = await page.evaluate(() => window.__bkPortada ? { time: window.__bkPortada.time, motion: window.__bkPortada.motion } : null);
  let notas = 0; const fin = Date.now() + ms; while (Date.now() < fin) { notas = Math.max(notas, await page.evaluate(() => document.querySelectorAll('#portada-escena .nota-musical').length)); await sleep(250); }
  const t1 = await page.evaluate(() => window.__bkPortada ? { time: window.__bkPortada.time, motion: window.__bkPortada.motion } : null);
  return { t0, t1, avance: t1 && t0 ? +(t1.time - t0.time).toFixed(3) : null, notas, llamadas: await page.evaluate(() => window.__llamadas) };
}
const quieta = (m) => !!m.t1 && m.t1.motion === 0 && m.avance === 0 && m.notas === 0 && m.llamadas === 0;

await runTest(R, async () => {
  const b = await launch(), errors = [];
  try {
    { const page = await open7(b, R, dev('pc720'), 'h', { save: S(), query: '?bktest=1&narr=off&portada=viva', errors }); const m = await mira(page, 10000);
      R.check(!!m.t1 && m.t1.motion > 0.9 && m.avance > 5 && m.notas > 0 && m.llamadas > 0, 'referencia: la escena se mueve, salen notas de la radio y JUGAR llama', 'unit', m); await page.close(); }
    { const page = await open7(b, R, dev('pc720'), 'h', { save: S(), query: '?bktest=1&narr=off', errors }); const m = await mira(page, 4000);
      R.check(quieta(m), 'con ?bktest (sin portada=viva): quieta y sin notas', 'unit', m); await page.close(); }
    { const p2 = await open7(b, R, dev('pc720'), 'h', { save: S(), query: '?bktest=1&narr=off&portada=viva', errors });
      await p2.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }]); await p2.reload({ waitUntil: 'load' });
      await p2.waitForFunction(() => window.__bk && !document.getElementById('btn-start').disabled, { timeout: 120000 }); await sleep(1500);
      const m = await mira(p2, 9000);
      R.check(quieta(m), 'con «prefers-reduced-motion» del sistema: quieta, sin notas ni llamada', 'unit', m); await p2.close(); }
    { const page = await open7(b, R, dev('pc720'), 'h', { save: S({ reducedMotion: true, reducedMotionSet: true }), query: '?bktest=1&narr=off&portada=viva', errors }); await sleep(1500);
      const m = await mira(page, 9000);
      R.check(quieta(m), 'con «Reducir movimiento» de Ajustes: quieta, sin notas ni llamada', 'unit', m);
      // quitarlo desde los Ajustes del inicio (el engranaje): vuelve a moverse
      await page.evaluate(() => document.getElementById('btn-settings-start').click()); await sleep(400);
      const vis = await page.evaluate(() => { const s = document.getElementById('settings'); return !s.hidden && getComputedStyle(s).zIndex; });
      await page.evaluate(() => { const c = document.getElementById('opt-reduced'); c.click(); }); await sleep(200);
      await page.evaluate(() => document.getElementById('btn-settings-close').click()); await sleep(1800);
      const m2 = await mira(page, 3000);
      R.check(!!vis && Number(vis) > 7 && m2.t1.motion > 0.9 && m2.avance > 1, 'el engranaje del inicio abre los Ajustes del juego por encima; al quitar «Reducir movimiento» la escena vuelve a moverse', 'input', { zIndex: vis, m2 });
      await page.close(); }
    { const page = await open7(b, R, dev('ip14'), 'v', { save: S({ eficiente: true }), query: '?bktest=1&narr=off&portada=viva', errors }); await sleep(1500);
      const m = await mira(page, 9000);
      R.check(quieta(m), 'con el Modo eficiente (móvil): quieta, sin notas ni llamada', 'unit', m); await page.close(); }
    R.check(!errors.length, 'sin errores de página', 'input', errors.slice(0, 5));
  } finally { await b.close(); }
}, { timeoutMs: 600000 });
