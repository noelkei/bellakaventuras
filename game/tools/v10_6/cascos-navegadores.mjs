// V10.6 · pantalla de cascos en navegadores REALES de ordenador (petición del usuario: «para todos los navegadores», y Chrome SIEMPRE incluido):
// Chrome (Google Chrome instalado, el mismo con el que corre toda la batería, aquí sin emular móvil), Safari (safaridriver, puerto 4444; hay que
// lanzarlo antes: `safaridriver -p 4444 &`) y Firefox (puppeteer con WebDriver BiDi), a 3 tamaños de ventana. En cada uno: JUGAR → sale la
// pantalla con todo dentro de la ventana y sin montarse → «Continuar» la cierra → el juego queda jugable. Los móviles se cubren con v10_6/cascos (emulación)
// y en el iPhone del usuario.
// Uso: node tools/v10_6/cascos-navegadores.mjs --url <build> [--solo chrome|safari|firefox] [--task V10-6] [--label r]
import puppeteer from 'puppeteer-core';
import { Report, runTest, sleep, arg, argUrl, CHROME } from '../v8/lib.mjs';
import * as WD from '../../../V10/IT7/tools/safari-wd.mjs';
const R = new Report('v106-cascos-navegadores', { task: arg('task', 'V10-6') });
const U = argUrl().replace(/\/?$/, '/') + '?bktest=1&cascos=1', SOLO = arg('solo');
const TAM = [[1280, 720], [1440, 900], [900, 600]];
const GEO = `const c = document.getElementById('cascos'); if (!c || c.hidden) return { abierta: false };
  const W = innerWidth, H = innerHeight, R = (s) => { const e = c.querySelector(s); if (!e) return null; const r = e.getBoundingClientRect(); return { x: r.left, y: r.top, r: r.right, b: r.bottom, w: r.width }; };
  const it = { img: R('.cascos-img'), h2: R('h2'), p: R('p'), btn: R('#btn-cascos') }, dentro = (q) => !!q && q.w > 1 && q.x >= -1 && q.y >= -1 && q.r <= W + 1 && q.b <= H + 1;
  const ov = (a, b) => !!a && !!b && Math.min(a.r, b.r) - Math.max(a.x, b.x) > 1 && Math.min(a.b, b.b) - Math.max(a.y, b.y) > 1;
  const b = it.btn, e = b ? document.elementFromPoint((b.x + b.r) / 2, (b.y + b.b) / 2) : null;
  return { abierta: true, W, H, fuera: Object.keys(it).filter((k) => !dentro(it[k])), mont: [['img','h2'],['h2','p'],['p','btn']].filter(([x, y]) => ov(it[x], it[y])).map((x) => x.join('-')), arriba: !!e && (e.id === 'btn-cascos' || !!e.closest?.('#btn-cascos')), img: !!c.querySelector('.cascos-img')?.naturalWidth };`;
const JUG = `const g = window.__bk; return { cascos: !document.getElementById('cascos').hidden, modal: g.input.modal, mode: g.mode, paused: g.paused, started: g.started, narr: !!g.narr.busy };`;
const LISTO = `return !!window.__bk && !document.getElementById('btn-start').disabled;`;
function revisar(tag, g, j) {
  R.check(g.abierta && g.img && !g.fuera.length && !g.mont.length && g.arriba, `${tag}: al pulsar JUGAR sale la pantalla de cascos con todo a la vista y «Continuar» encima`, 'emulation', g);
  // partida nueva: tras cerrarla empieza el tutorial (narrativa en marcha), que es el juego (mismo criterio que v10_6/cascos)
  R.check(!j.cascos && !j.modal && !j.paused && j.started && (j.mode === 'explore' || (j.mode === 'narr' && j.narr)), `${tag}: «Continuar» la cierra y el juego queda jugable`, 'input', j);
}
await runTest(R, async () => {
  if (!SOLO || SOLO === 'safari') {
    let id = null;
    try { id = await WD.abrir(); } catch (e) { R.invalid('Safari: no hay safaridriver en 4444 (o falta «Permitir automatización remota»)', String(e).slice(0, 200)); }
    if (id) try {
      for (const [w, h] of TAM) { const tag = `Safari ${w}×${h}`;
        await WD.tam(id, w, h); await WD.ir(id, U + `&t=${w}`);
        let ok = false; for (let i = 0; i < 120 && !ok; i++) { ok = await WD.js(id, LISTO).catch(() => false); if (!ok) await WD.espera(1000); }
        if (!ok) { R.invalid(`${tag}: el juego no llegó a estar listo`); continue; }
        await WD.js(id, `document.getElementById('btn-start').click(); return true;`); await WD.espera(1500);
        const g = await WD.js(id, GEO); await WD.foto(id, R.file_(`safari_${w}x${h}.png`)).catch(() => {});
        await WD.js(id, `document.getElementById('btn-cascos').click(); return true;`); await WD.espera(900);
        revisar(tag, g, await WD.js(id, JUG));
      }
    } finally { await WD.cerrar(id).catch(() => {}); }
  }
  const PUP = [['chrome', 'Chrome', { executablePath: CHROME, headless: true, protocolTimeout: 120000,
      args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required', '--no-first-run'] }],
    ['firefox', 'Firefox', { browser: 'firefox', executablePath: '/Applications/Firefox.app/Contents/MacOS/firefox', headless: true, protocolTimeout: 120000 }]];
  for (const [clave, nom, opc] of PUP) if (!SOLO || SOLO === clave) {
    let br = null;
    try { br = await puppeteer.launch(opc); }
    catch (e) { R.invalid(`${nom}: no se pudo lanzar con puppeteer`, String(e).slice(0, 200)); }
    if (br) try {
      for (const [w, h] of TAM) { const tag = `${nom} ${w}×${h}`, page = await br.newPage();
        try { await page.setViewport({ width: w, height: h }); await page.goto(U + `&t=${w}`, { waitUntil: 'load', timeout: 90000 });
          await page.waitForFunction(() => !!window.__bk && !document.getElementById('btn-start').disabled, { timeout: 150000 });
          await page.click('#btn-start'); await sleep(1500);
          const g = await page.evaluate(new Function(GEO)); await page.screenshot({ path: R.file_(`${clave}_${w}x${h}.png`) }).catch(() => {});
          await page.click('#btn-cascos'); await sleep(900);
          revisar(tag, g, await page.evaluate(new Function(JUG)));
        } catch (e) { R.invalid(`${tag}: ${String(e?.message ?? e).slice(0, 160)}`); } finally { await page.close(); }
      }
    } finally { await br.close(); }
  }
}, { timeoutMs: 1200000 });
