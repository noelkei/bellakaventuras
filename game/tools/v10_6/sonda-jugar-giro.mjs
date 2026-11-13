// V10.6 · sonda (no es guardián): H8-08. Con «Horizontal» fijada y el móvil en vertical (rot90), qué elemento recibe el toque en JUGAR nada más
// activarse y qué eventos llegan (pointerdown/up/click y su destino).
import { Report, runTest, launch, sleep, arg } from '../v8/lib.mjs';
import { FRESH } from '../v10_2/lib102.mjs';
import { dev, open7 } from '../v10_5/lib105.mjs';
const R = new Report('v106-sonda-jugar-giro', { task: arg('task', 'V10-6') });
await runTest(R, async () => { const b = await launch();
  try { for (const o of ['v', 'h']) { const page = await open7(b, R, dev('ip14'), o, { save: { ...FRESH, settings: { iosAppAsked: true, orientation: o === 'v' ? 'horizontal' : 'vertical' } }, query: '?bktest=1' });
      await page.evaluate(() => { window.__ev = []; for (const t of ['pointerdown', 'pointerup', 'pointercancel', 'click', 'touchstart', 'touchend']) document.addEventListener(t, (e) => window.__ev.push(`${t}:${e.target?.id || e.target?.className || e.target?.tagName}:${e.isTrusted ? 'T' : 'p'}`), true); });
      const bx = await page.evaluate(() => { const r = document.getElementById('btn-start').getBoundingClientRect(), x = r.left + r.width / 2, y = r.top + r.height / 2, e = document.elementFromPoint(x, y);
        return { x, y, w: r.width, h: r.height, en: e ? (e.id || e.className) : null, html: document.documentElement.className, dis: document.getElementById('btn-start').disabled }; });
      await page.touchscreen.tap(bx.x, bx.y); await sleep(1500);
      const r = await page.evaluate(() => ({ started: window.__bk.started, ev: window.__ev, hidden: document.getElementById('start').hidden }));
      R.note({ o, bx, ...r }); await page.close(); }
    R.check(true, 'sonda', 'unit');
  } finally { await b.close(); } }, { timeoutMs: 200000 });
