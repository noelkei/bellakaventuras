// V10.5 ronda PORTADA · guardián del sonido de la portada (PROMPT_V10_5_PORTADA §5.6, §12). Con ?bktest&portada=viva (sin ese parámetro la
// portada de las pruebas no crea audio). V10.5 r2 (pedido del usuario: «no suena nada; tengo que quitar el sonido y volverlo a poner»; copia
// previa en V10/backups/pruebas/V10_5-portada-R2): la portada suena en cuanto el navegador lo deja, y si no, con el PRIMER toque en cualquier
// sitio, y el botón de sonido no lo quita mientras el navegador aún no dejaba sonar.
//  · navegador que exige un gesto (lo normal en móvil): antes de tocar, la portada lo pide («Toca para oír»: #start.pt-sin-audio) y no suena;
//    tocar el botón de sonido ARRANCA el sonido (no lo quita: sigue «Sonido: sí»); en otra pestaña, el primer toque en cualquier sitio también;
//  · navegador que deja sonar sin gesto: suena «No me guillo» sin tocar nada y no pide el toque;
//  · pulsar la radio la apaga y se guarda (settings.radioPortada = false); al recargar sigue apagada; volver a pulsarla la enciende;
//  · con «Sonido: no»: ni suena ni pide el toque;
//  · al pulsar JUGAR la radio se funde (≤ 0,7 s), no coincide con la música del juego y el contexto de la portada se cierra (≤ 1,5 s).
import { Report, runTest, launch, sleep, SAVE_20, withTimeout } from '../v8/lib.mjs';
import { dev, open7, prepPage, BASE_URL } from './lib105.mjs';
const R = new Report('portada-audio');
const KEY = 'bellakaventuras.remake.save';
const S20 = { ...SAVE_20, settings: { iosAppAsked: true } };
const Q = '?bktest=1&narr=off&portada=viva';
const A = (page) => page.evaluate(() => window.__bkPortada?.audio?.() ?? null);
const B = (page) => page.evaluate(() => ({ bloqueado: window.__bkPortada?.bloqueado ?? null, clase: document.getElementById('start').classList.contains('pt-sin-audio'), txt: document.getElementById('btn-sound-start').textContent, muted: (() => { try { return JSON.parse(localStorage.getItem('bellakaventuras.remake.save')).settings.muted === true; } catch { return null; } })() }));
/** Un gesto que no pulsa nada: clic en el pie («20 patatas · 6 canciones»). */
const gesto = async (page) => { const c = await page.evaluate(() => { const r = document.querySelector('#start .pt-pie').getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; }); await page.mouse.click(c.x, c.y); };
const centro = (page, sel) => page.evaluate((s) => { const r = document.querySelector(s).getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2, w: r.width }; }, sel);
const radioCentro = (page) => centro(page, '#btn-radio');
async function hasta(page, fn, ms) { const t0 = Date.now(); let v; while (Date.now() - t0 < ms) { v = await page.evaluate(fn); if (v) return v; await sleep(100); } return v; }
const suena = () => { const a = window.__bkPortada.audio(); return a.ctx === 'running' && a.radio && a.radioGain > 0.2 ? a : null; };

await runTest(R, async () => {
  const b = await launch(), errors = [];
  try {
    // 0 · navegador que exige un gesto para sonar. Chrome automatizado deja sonar igualmente (aunque se le pida lo contrario), así que se
    //     simula el de los móviles: el contexto de audio nace suspendido y `resume()` solo funciona con un gesto real del usuario
    //     (navigator.userActivation.isActive, que solo dan los clics y toques de verdad)
    { const b2 = b;
      const abrir = async (save) => { const page = await b2.newPage(); await prepPage(page, dev('pc720'), 'h');
        page.on('pageerror', (e) => errors.push('pageerror ' + e.message));
        await page.evaluateOnNewDocument(() => { const Real = window.AudioContext;
          window.AudioContext = class extends Real { constructor(o) { super(o); this.__ok = false; void super.suspend(); }
            get state() { const s = super.state; return this.__ok || s === 'closed' ? s : 'suspended'; }
            resume() { if (navigator.userActivation?.isActive) { this.__ok = true; return super.resume(); } return Promise.resolve(); } }; });
        await page.evaluateOnNewDocument((s, k) => { if (!sessionStorage.getItem('__f')) { sessionStorage.setItem('__f', '1'); localStorage.setItem(k, JSON.stringify(s)); } }, save, KEY);
        await withTimeout(page.goto(BASE_URL + Q, { waitUntil: 'load' }), 60000, 'carga');
        await withTimeout(page.waitForFunction(() => window.__bk && !document.getElementById('btn-start').disabled, { timeout: 120000 }), 125000, 'listo');
        return page; };
      try {
        const page = await abrir(S20); await sleep(1500);
        const a0 = await A(page), b0 = await B(page);
        R.check(!!a0 && a0.radioGain < 0.01 && b0.bloqueado === true && b0.clase && /Sonido: sí/.test(b0.txt), 'navegador que exige un gesto: antes de tocar no suena y la portada lo pide («Toca para oír»)', 'unit', { a0, b0 });
        const sb = await centro(page, '#btn-sound-start'); await page.mouse.click(sb.x, sb.y);
        const ok = await hasta(page, suena, 8000), b1 = await B(page);
        R.check(!!ok && !b1.bloqueado && !b1.clase && /Sonido: sí/.test(b1.txt) && b1.muted !== true, 'tocar el botón de sonido ARRANCA el sonido (no lo quita) y deja de pedir el toque', 'input', { suena: ok ?? await A(page), b1 });
        await page.close();
        const p2 = await abrir(S20); await sleep(800);
        await gesto(p2); const ok2 = await hasta(p2, suena, 8000);
        R.check(!!ok2, 'navegador que exige un gesto: el primer toque en cualquier sitio arranca la radio', 'input', ok2 ?? await A(p2));
        await p2.close();
        const p3 = await abrir({ ...S20, settings: { iosAppAsked: true, muted: true } }); await sleep(800);
        const b3 = await B(p3); await gesto(p3); await sleep(1500); const a3 = await A(p3);
        R.check(b3.bloqueado === false && !b3.clase && !!a3 && a3.radioGain < 0.01, 'con «Sonido: no»: ni pide el toque ni suena al tocar', 'unit', { b3, a3 });
        await p3.close();
      } finally { /* mismo navegador */ } }
    // 1 · navegador que deja sonar sin gesto
    { const page = await open7(b, R, dev('pc720'), 'h', { save: S20, query: Q, errors });
      const ok = await hasta(page, suena, 8000), b0 = await B(page);
      R.check(!!ok && !b0.bloqueado && !b0.clase, 'navegador que deja sonar sin gesto: suena la radio sin tocar nada y no pide el toque', 'unit', { suena: ok ?? await A(page), b0 });
      const rc = await radioCentro(page); await page.mouse.click(rc.x, rc.y);
      const off = await hasta(page, () => { const a = window.__bkPortada.audio(); return !a.radio && a.radioGain < 0.05 ? a : null; }, 3000);
      const saved = await page.evaluate((k) => { try { return JSON.parse(localStorage.getItem(k)).settings.radioPortada; } catch { return 'error'; } }, KEY);
      const pressed = await page.evaluate(() => document.getElementById('btn-radio').getAttribute('aria-pressed'));
      R.check(rc.w > 20 && !!off && saved === false && pressed === 'false', 'pulsar la radio la apaga y queda guardado', 'input', { boton: rc, off, saved, pressed });
      await page.reload({ waitUntil: 'load' }); await withTimeout(page.waitForFunction(() => window.__bk && !document.getElementById('btn-start').disabled, { timeout: 120000 }), 125000, 'listo');
      await sleep(1500);
      const r1 = await A(page), p1 = await page.evaluate(() => document.getElementById('btn-radio').getAttribute('aria-pressed'));
      const rc2 = await radioCentro(page); await page.mouse.click(rc2.x, rc2.y);
      const on = await hasta(page, () => { const a = window.__bkPortada.audio(); return a.radio && a.radioGain > 0.2 ? a : null; }, 6000);
      R.check(!r1.radio && p1 === 'false' && !!on, 'al recargar la radio sigue apagada; pulsarla otra vez la enciende', 'input', { r1, p1, on });
      // JUGAR: fundido, sin solaparse con la música del juego, y contexto cerrado
      const c = await page.evaluate(() => { const r = document.getElementById('btn-start').getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; });
      await page.evaluate(() => { window.__mix = []; const t0 = performance.now(); const s = () => { const p = window.__bkPortada?.audio?.() ?? null, g = window.__bk?.audio?.music;
        const juego = g ? [...g.tracks.values()].some((t) => t.out.gain.value > 0.01) : false; window.__mix.push({ t: Math.round(performance.now() - t0), radio: p ? p.radioGain : 0, ctx: p ? p.ctx : 'none', juego });
        if (performance.now() - t0 < 2200) setTimeout(s, 50); }; window.__startMix = s; });
      await page.evaluate(() => window.__startMix()); await page.mouse.click(c.x, c.y); await sleep(2300);
      const mix = await page.evaluate(() => window.__mix);
      const tras = (ms) => mix.filter((m) => m.t >= ms);
      const fundida = tras(700).every((m) => m.radio < 0.05), cerrada = tras(1500).every((m) => m.ctx === 'closed' || m.ctx === 'none'), solapes = mix.filter((m) => m.juego && m.radio > 0.05).length;
      R.check(fundida && cerrada && solapes === 0, 'al pulsar JUGAR la radio se funde (≤ 0,7 s), no suena a la vez que la música del juego y su contexto se cierra (≤ 1,5 s)', 'unit', { fundida, cerrada, solapes, muestra: mix.filter((m, i) => i % 6 === 0) });
      await page.close(); }
    // 2 · sonido no (navegador que deja sonar)
    { const page = await open7(b, R, dev('pc720'), 'h', { save: { ...S20, settings: { iosAppAsked: true, muted: true } }, query: Q, errors });
      await gesto(page); await sleep(2000); const a = await A(page);
      R.check(!!a && !a.radio && a.radioGain < 0.01, 'con «Sonido: no», tras un gesto la radio no suena', 'unit', a);
      await page.close(); }
    R.check(!errors.length, 'sin errores de página', 'input', errors.slice(0, 5));
  } finally { await b.close(); }
}, { timeoutMs: 600000 });
