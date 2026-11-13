// V10.6 · sonda (no es guardián): H8-08. Con el juego girado (rot90), tamaño y posición de JUGAR y qué hay en su centro durante 2 s desde que se activa.
import { Report, runTest, launch, sleep, arg } from '../v8/lib.mjs';
import { FRESH } from '../v10_2/lib102.mjs';
import { dev, open7 } from '../v10_5/lib105.mjs';
const R = new Report('v106-sonda-jugar-giro2', { task: arg('task', 'V10-6') });
await runTest(R, async () => { const b = await launch();
  try { const page = await open7(b, R, dev('ip14'), 'v', { save: { ...FRESH, settings: { iosAppAsked: true, orientation: 'horizontal' } }, query: '?bktest=1' });
    const serie = [];
    for (const ms of [0, 150, 300, 600, 1000, 1500, 2500]) { await sleep(ms - (serie.at(-1)?.ms ?? 0));
      serie.push(await page.evaluate((ms) => { const b = document.getElementById('btn-start'), r = b.getBoundingClientRect(), x = r.left + r.width / 2, y = r.top + r.height / 2, e = document.elementFromPoint(x, y);
        const st = document.getElementById('start'), rs = st.getBoundingClientRect();
        return { ms, r: [r.left, r.top, r.width, r.height].map(Math.round), en: e ? (e.id || e.tagName + '.' + e.className) : null, dentro: !!e && b.contains(e), start: [rs.width, rs.height].map(Math.round), orient: st.dataset.orient }; }, ms)); }
    R.note(serie); R.check(true, 'sonda', 'unit'); await page.close();
  } finally { await b.close(); } }, { timeoutMs: 120000 });
