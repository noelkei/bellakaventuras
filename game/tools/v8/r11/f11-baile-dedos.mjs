// R11 · F11 · copia de la sonda de la auditoría AUD-JUG/SIS/touch4.mjs (mismas comprobaciones; solo cambian las rutas de import).
// AUD-JUG/SIS · baile de FASHION GIRL en táctil con dos pulgares que se SOLAPAN (el 2.º toca antes de que el 1.º suelte, como en
// cualquier juego de ritmo) frente a toques de un solo dedo: flechas registradas (trace «ok/error») del stage 1. CDP touch
// (reconocedor de gestos de Chrome; emulación declarada). 2 repeticiones de cada modo.
import { Report, runTest, launch, sleep, SAVE_20, VIEWPORTS } from '../lib.mjs';
import { openSis, start } from './f11-sis-lib.mjs';
const R = new Report('r11-f11-baile-dedos');
const SAVE = { ...SAVE_20, activities: { ...SAVE_20.activities, danceCombo: false }, collected: SAVE_20.collected.filter((x) => x !== 'fashion_girl.activity') };
await runTest(R, async () => {
  const b = await launch();
  try {
    for (const mode of ['un_dedo', 'dos_pulgares']) for (let rep = 1; rep <= 2; rep++) {
      const page = await openSis(b, R, { viewport: VIEWPORTS.phone, save: SAVE, label: `${mode}#${rep}` }); await start(page); await sleep(800);
      const cdp = await page.target().createCDPSession();
      const touch = (type, pts) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts.map(([x, y, id]) => ({ x, y, id, radiusX: 6, radiusY: 6, force: 1 })) });
      await page.evaluate(() => { const g = window.__bk, T = window.__bkTHREE, z = g.park.zones.get('act.danceCombo'); g.input.clear(); g.skater.teleport(new T.Vector3(z.pos.x, z.pos.y ?? 0, z.pos.z), 0, 'walk'); });
      await page.waitForFunction(() => !document.getElementById('prompt').hidden && !document.getElementById('btn-action').classList.contains('off'), { timeout: 10000 });
      await page.evaluate(() => document.getElementById('btn-action').click());
      await page.waitForFunction(() => !document.getElementById('dance').hidden && window.__bk.activities[4].timer, { timeout: 10000 });
      await sleep(300);
      const seq = await page.evaluate(() => window.__bk.activities[4].seq);
      const btn = await page.evaluate(() => Object.fromEntries([...document.querySelectorAll('#dance-pad button')].map((b) => { const r = b.getBoundingClientRect(); return [b.dataset.k, [r.x + r.width / 2, r.y + r.height / 2]]; })));
      let prev = null, id = 10;
      for (const k of seq) {
        const [x, y] = btn[k];
        if (mode === 'un_dedo') { await touch('touchStart', [[x, y, id]]); await sleep(60); await touch('touchEnd', []); await sleep(120); }
        else { // el dedo anterior sigue abajo 60 ms después de que el nuevo toque
          const pts = prev ? [[prev[0], prev[1], prev[2]], [x, y, id]] : [[x, y, id]];
          await touch('touchStart', pts); await sleep(60);
          await touch('touchMove', [[x, y, id]]);  // suelta el anterior
          prev = [x, y, id]; await sleep(80);
        }
        id++;
      }
      if (mode === 'dos_pulgares') await touch('touchEnd', []);
      await sleep(500);
      const tr = await page.evaluate(() => window.__bk.activities[4].trace.map((t) => t.e));
      const oks = tr.filter((e) => e.startsWith('ok')).length, errs = tr.filter((e) => e.startsWith('error')).length;
      R.check(oks === seq.length, `${mode}#${rep}: las ${seq.length} flechas del stage 1 tocadas en orden se registran (ok ${oks}, error ${errs})`, 'emulation', { seq, trace: tr.slice(0, 14) });
      await page.close();
    }
  } finally { await b.close(); }
}, { timeoutMs: 600000 });
