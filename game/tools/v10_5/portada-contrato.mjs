// V10.5 ronda PORTADA · guardián del contrato de la pantalla de inicio (PROMPT_V10_5_PORTADA §4, §12):
//  · la portada nueva está (escena + lettering en imagen) y #btn-start es un <button> desactivado mientras carga;
//  · su textContent es exactamente «JUGAR» sin partida y «CONTINUAR» con partida (y vuelve a «JUGAR» tras «Borrar y empezar»), y lleva el
//    lettering de su palabra;
//  · el centro de #btn-start recibe el clic (ratón) y el toque (dedo); #start se oculta en el mismo clic;
//  · #btn-sound-start dice «Sonido: no» con silencio y #btn-fs-start conserva su texto («Modo app» en iPhone) con icono.
import { Report, runTest, launch, sleep, SAVE_20, withTimeout } from '../v8/lib.mjs';
import { dev, prepPage, open7, BASE_URL } from './lib105.mjs';
const R = new Report('portada-contrato');
const KEY = 'bellakaventuras.remake.save';
const S20 = { ...SAVE_20, settings: { iosAppAsked: true } };
const centro = (page) => page.evaluate(() => { const b = document.getElementById('btn-start'), r = b.getBoundingClientRect(), x = r.left + r.width / 2, y = r.top + r.height / 2, at = document.elementFromPoint(x, y);
  return { x, y, recibe: !!at && (at === b || b.contains(at)), en: at ? (at.id || at.className || at.tagName) : null }; });

await runTest(R, async () => {
  const b = await launch(), errors = [];
  try {
    // 1 · mientras carga (primeros instantes): botón desactivado y portada ya visible
    { const page = await b.newPage(); await prepPage(page, dev('pc720'), 'h');
      page.on('pageerror', (e) => errors.push('pageerror ' + e.message));
      await page.evaluateOnNewDocument((k) => { if (!sessionStorage.getItem('__f')) { sessionStorage.setItem('__f', '1'); localStorage.removeItem(k); } }, KEY);
      await withTimeout(page.goto(BASE_URL + '?bktest=1&narr=off', { waitUntil: 'domcontentloaded' }), 60000, 'carga');
      await sleep(400);
      const c = await page.evaluate(() => { const b = document.getElementById('btn-start'), esc = document.getElementById('portada-escena');
        return { tag: b?.tagName, disabled: !!b?.disabled, txt: b?.textContent, img: !!b?.querySelector('img'), escena: !!esc && !esc.hidden && esc.getBoundingClientRect().width > 0,
          lettering: !!document.querySelector('#start img.pt-titulo-img') }; });
      R.check(c.tag === 'BUTTON' && c.disabled && c.txt === 'JUGAR', 'mientras carga, #btn-start es un botón desactivado con el texto exacto «JUGAR»', 'static', c);
      R.check(c.escena && c.lettering && c.img, 'mientras carga ya se ve la portada nueva (escena, título en imagen y lettering de JUGAR)', 'static', c);
      await withTimeout(page.waitForFunction(() => window.__bk && !document.getElementById('btn-start').disabled, { timeout: 120000 }), 125000, 'listo');
      const t = await page.evaluate(() => ({ txt: document.getElementById('btn-start').textContent, src: document.querySelector('#btn-start img')?.getAttribute('src') ?? '' }));
      R.check(t.txt === 'JUGAR' && /jugar/.test(t.src), 'sin partida: textContent exacto «JUGAR» y lettering de JUGAR', 'static', t);
      const p = await centro(page);
      await page.mouse.click(p.x, p.y);
      const hid = await page.evaluate(() => document.getElementById('start').hidden && window.__bk.started);
      R.check(p.recibe && hid, 'con ratón: el centro de JUGAR recibe el clic y la pantalla de inicio se oculta', 'input', { ...p, oculta: hid });
      await page.close(); }
    // 2 · con partida (iPhone, toque): CONTINUAR, toque en el centro, mismo clic oculta #start; textos de sonido y pantalla completa
    { const page = await open7(b, R, dev('ip14'), 'v', { save: { ...S20, settings: { iosAppAsked: true, muted: true } }, query: '?bktest=1&narr=off', errors });
      const t = await page.evaluate(() => ({ txt: document.getElementById('btn-start').textContent, src: document.querySelector('#btn-start img')?.getAttribute('src') ?? '',
        snd: document.getElementById('btn-sound-start').textContent, sndIco: !!document.querySelector('#btn-sound-start svg'),
        fs: document.getElementById('btn-fs-start').textContent, fsHidden: document.getElementById('btn-fs-start').hidden, fsIco: !!document.querySelector('#btn-fs-start svg'),
        reset: !document.getElementById('btn-reset-start').hidden }));
      R.check(t.txt === 'CONTINUAR' && /continuar/.test(t.src), 'con partida: textContent exacto «CONTINUAR» y lettering de CONTINUAR', 'static', t);
      R.check(/Sonido: no/.test(t.snd) && t.sndIco, 'con silencio guardado: «Sonido: no» (con icono)', 'static', t);
      R.check(!t.fsHidden && /Modo app/.test(t.fs) && t.fsIco && t.reset, 'iPhone: el botón de pantalla completa dice «Modo app» (con icono) y se ofrece «Empezar de cero»', 'static', t);
      /* el oyente va DESPUÉS del del juego (se añade ahora): ve el estado al terminar el clic del juego */
      await page.evaluate(() => { window.__oc = null; document.getElementById('btn-start').addEventListener('click', () => { window.__oc = document.getElementById('start').hidden; }, { once: true }); });
      const p = await centro(page);
      await page.touchscreen.tap(p.x, p.y); await sleep(300);
      const r = await page.evaluate(() => ({ oculta: window.__oc, started: window.__bk.started }));
      R.check(p.recibe && r.oculta === true && r.started, 'con el dedo: el centro de CONTINUAR recibe el toque y #start ya está oculta en ese mismo clic', 'input', { ...p, ...r });
      await page.close(); }
    // 3 · «Borrar y empezar» desde el inicio: tras recargar, «JUGAR»
    { const page = await open7(b, R, dev('pc720'), 'h', { save: S20, query: '?bktest=1&narr=off', errors });
      await page.evaluate(() => document.getElementById('btn-reset-start').click()); await sleep(300);
      const conf = await page.evaluate(() => !document.getElementById('confirm').hidden);
      await Promise.all([page.waitForNavigation({ waitUntil: 'load' }), page.evaluate(() => document.getElementById('btn-confirm-yes').click())]);
      await withTimeout(page.waitForFunction(() => window.__bk && !document.getElementById('btn-start').disabled, { timeout: 120000 }), 125000, 'listo');
      const t = await page.evaluate(() => ({ txt: document.getElementById('btn-start').textContent, src: document.querySelector('#btn-start img')?.getAttribute('src') ?? '' }));
      R.check(conf && t.txt === 'JUGAR' && /jugar/.test(t.src), 'tras «Borrar y empezar»: «JUGAR» otra vez (texto exacto y lettering)', 'input', { confirm: conf, ...t });
      await page.close(); }
    R.check(!errors.length, 'sin errores de página', 'input', errors.slice(0, 5));
  } finally { await b.close(); }
}, { timeoutMs: 600000 });
