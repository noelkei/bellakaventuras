// V10.4 R10 · guardián: en el iPhone (Safari, sin modo app) la pregunta del modo app sale al empezar y el diálogo 2D (tutorial de una
// partida nueva o la pregunta del modo ayuda de una antigua) NO se abre encima: espera a que se conteste o se cierre. Antes el 2D
// (z-index 30) quedaba encima de la pregunta (z-index 8) y no se podía pulsar.
//  · partida nueva: al empezar sale la pregunta del iPhone y no hay 2D; tras «Ahora no» empieza el tutorial (2D de PLA-01);
//  · partida antigua (con progreso, sin narr): igual con la pregunta del modo ayuda; con Esc también se suelta;
//  · al cerrarla no queda debajo el menú de pausa que abrió la pregunta (el 2D no sale con el juego parado).
import { Report, runTest, launch, sleep, SAVE_20, VIEWPORTS } from '../v8/lib.mjs';
import { FRESH } from '../v10_2/lib102.mjs';
const R = new Report('iphone-2d');
const IPHONE_UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1';
const look = (page) => page.evaluate(() => { const d = document.getElementById('d2'), i = document.getElementById('ios-app');
  const r = i.getBoundingClientRect(), top = !i.hidden ? document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2) : null;
  return { ios: !i.hidden, d2: !!d && !d.hidden, paused: window.__bk.paused, pauseMenu: !document.getElementById('pause').hidden, d2text: d && !d.hidden ? d.querySelector('.d2-text')?.textContent?.slice(0, 60) : null, topIsIos: !!top && i.contains(top) }; });
await runTest(R, async () => {
  const b = await launch();
  try {
    for (const [name, save, close] of [['nueva', FRESH, 'no'], ['antigua', SAVE_20, 'no'], ['antigua-esc', SAVE_20, 'esc']]) {
      const page = await b.newPage(); await page.setUserAgent(IPHONE_UA); await page.setViewport(VIEWPORTS.phone);
      await page.evaluateOnNewDocument((s) => { if (!sessionStorage.getItem('__ios')) { sessionStorage.setItem('__ios', '1'); localStorage.setItem('bellakaventuras.remake.save', JSON.stringify(s)); } }, save);
      await page.goto(R.data.url + '?bktest=1', { waitUntil: 'load' }); await page.waitForFunction(() => window.__bk && !document.getElementById('btn-start').disabled, { timeout: 120000 });
      await page.tap('#btn-start'); await sleep(1500);
      const a = await look(page);
      R.check(a.ios && !a.d2 && a.topIsIos, `${name}: al empezar sale la pregunta del iPhone, se puede pulsar y no hay 2D encima`, 'input', a);
      if (close === 'no') await page.tap('#btn-ios-no'); else await page.keyboard.press('Escape');
      await sleep(400);
      let c = null; for (let k = 0; k < 40; k++) { c = await look(page); if (c.d2) break; await sleep(150); }
      R.check(!c.ios && c.d2 && !c.pauseMenu, `${name}: tras cerrarla (${close === 'no' ? '«Ahora no»' : 'Esc'}) se abre el 2D (${c.d2text ?? '—'}) sin el menú de pausa debajo`, 'input', c);
      await page.close();
    }
  } finally { await b.close(); }
}, { timeoutMs: 300000 });
