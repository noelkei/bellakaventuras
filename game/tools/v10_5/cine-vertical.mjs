// V10.5 R0 · guardián de la franja 16:9 (AM-13; E5-26, E5-38, E5-39, T6): con el móvil en vertical, la cinemática del parque y la escena final se
// dibujan en una franja 16:9 centrada (cámara con aspecto 16:9; negro arriba y abajo; sin las bandas de cine de 11 vh encima) y «SALTAR ▸» sigue a
// la vista; en horizontal, a pantalla completa; fuera de ellas (explorando), el aspecto es el de la pantalla.
import { Report, runTest, launch, sleep, SAVE_20 } from '../v8/lib.mjs';
import { FRESH } from '../v10_2/lib102.mjs';
import { dev, open7, start7 } from './lib105.mjs';
const R = new Report('cine-vertical');
async function until(page, fn, ms) { const t0 = Date.now(); while (Date.now() - t0 < ms) { const v = await page.evaluate(fn); if (v) return v; await sleep(150); } return null; }
/** Brillo medio de franjas horizontales de la captura (filas a 3 %, 50 % y 97 % del alto, x del 20 al 80 %). */
async function bands(page) {
  const png = await page.screenshot({ encoding: 'base64' });
  return page.evaluate(async (src) => { const im = new Image(); im.src = 'data:image/png;base64,' + src; await im.decode(); const c = document.createElement('canvas'); c.width = im.width; c.height = im.height; const x = c.getContext('2d'); x.drawImage(im, 0, 0);
    const row = (f) => { const y = Math.round(im.height * f), d = x.getImageData(Math.round(im.width * 0.2), y, Math.round(im.width * 0.6), 1).data; let s = 0; for (let i = 0; i < d.length; i += 4) s += d[i] + d[i + 1] + d[i + 2]; return +(s / (d.length / 4) / 3).toFixed(1); };
    return { top: row(0.03), mid: row(0.5), bottom: row(0.97) }; }, png);
}
const look = (page) => page.evaluate(() => { const g = window.__bk, sk = document.getElementById('btn-cine-skip'), r = sk.getBoundingClientRect(), at = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
  return { aspect: +g.rig.cam.aspect.toFixed(3), screen: +(innerWidth / innerHeight).toFixed(3), skip: !sk.hidden && r.width > 0, skipRecibe: at === sk, bandas: getComputedStyle(document.body, '::before').height }; });

await runTest(R, async () => {
  const b = await launch(), errors = [];
  try {
    for (const o of ['v', 'h']) {
      // cinemática del parque
      { const page = await open7(b, R, dev('ip14'), o, { save: { ...FRESH, settings: { iosAppAsked: true } }, query: '?bktest=1', errors }); await start7(page, true);
        await until(page, () => { const d = document.getElementById('d2'); return d && !d.hidden; }, 15000); await sleep(500); await page.keyboard.press('KeyT');
        const t0 = Date.now(); while (Date.now() - t0 < 60000 && !(await page.evaluate(() => window.__bk.narr.inCine))) { await page.evaluate(() => { const d = document.getElementById('d2'); if (d && !d.hidden) { const bs = [...d.querySelectorAll('.d2-row .d2-btn:not(.d2-skip)')]; (bs[1] ?? bs[0])?.click(); } }); await sleep(400); }
        await sleep(4000); const l = await look(page), bb = await bands(page);
        if (o === 'v') R.check(Math.abs(l.aspect - 16 / 9) < 0.02 && bb.top < 8 && bb.bottom < 8 && bb.mid > 20 && l.skip && l.skipRecibe, 'vertical: la cinemática del parque va en una franja 16:9 con negro arriba y abajo, y SALTAR se puede tocar', 'vision', { ...l, brillo: bb });
        else R.check(Math.abs(l.aspect - l.screen) < 0.02 && bb.mid > 20, 'horizontal: la cinemática del parque a pantalla completa', 'vision', { ...l, brillo: bb });
        await page.keyboard.press('Escape'); await sleep(3500);
        const e = await page.evaluate(() => ({ aspect: +window.__bk.rig.cam.aspect.toFixed(3), screen: +(innerWidth / innerHeight).toFixed(3) }));
        R.check(Math.abs(e.aspect - e.screen) < 0.02, `${o}: al acabar la cinemática el aspecto vuelve a ser el de la pantalla`, 'vision', e);
        await page.close(); }
      // escena final
      { const page = await open7(b, R, dev('ip14'), o, { save: { ...SAVE_20, finalDone: true, finalProof: { kind: 'secretnovio_v10', at: 'x' }, settings: { iosAppAsked: true } }, query: '?bktest=1&narr=off', errors }); await start7(page, true); await sleep(1200);
        await page.evaluate(() => window.__bk.showPreview()); await sleep(6000);
        const l = await look(page), bb = await bands(page);
        if (o === 'v') R.check(Math.abs(l.aspect - 16 / 9) < 0.02 && bb.top < 8 && bb.bottom < 8 && bb.mid > 20 && l.skip && l.skipRecibe, 'vertical: la escena final va en la franja 16:9 (encuadres de horizontal) y SALTAR se puede tocar', 'vision', { ...l, brillo: bb });
        else R.check(Math.abs(l.aspect - l.screen) < 0.02, 'horizontal: la escena final a pantalla completa', 'vision', l);
        await page.close(); }
    }
    R.check(!errors.length, 'sin errores de página', 'input', errors.slice(0, 5));
  } finally { await b.close(); }
}, { timeoutMs: 900000 });
