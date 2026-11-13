// V10.5 ronda PORTADA · guardián de la barra de carga con porcentaje (PROMPT_V10_5_PORTADA §5.3, §12):
//  · red lenta emulada (CDP, 16 Mbit/s, caché vacía): aria-valuenow y #load-bar > i crecen sin retroceder, con ≥ 20 valores distintos, nunca
//    100 antes de que JUGAR se active, y al activarse marca 100; el número visible («47 %») coincide con aria-valuenow;
//  · caché caliente (recarga): llega a 100 sin retroceder;
//  · sin carga.json (petición cortada): sigue avanzando (≥ 5 valores distintos) y llega a 100.
import { Report, runTest, launch, sleep, withTimeout } from '../v8/lib.mjs';
import { dev, prepPage, BASE_URL } from './lib105.mjs';
const R = new Report('portada-carga');

/** Antes de cargar: muestrea cada cambio de la barra (valor ARIA, anchura del relleno, número visible) y si JUGAR está activo. */
const SONDA = () => {
  window.__carga = [];
  const tick = () => {
    const bar = document.getElementById('load-bar'), i = bar?.firstElementChild, b = document.getElementById('btn-start'), pct = document.getElementById('load-pct');
    if (bar) { const s = { v: bar.getAttribute('aria-valuenow'), w: i?.style.width ?? null, n: pct ? pct.textContent : null, on: !!b && !b.disabled }, l = window.__carga.at(-1);
      if (!l || l.v !== s.v || l.w !== s.w || l.on !== s.on || l.n !== s.n) window.__carga.push(s); }
    if (!(b && !b.disabled && window.__carga.length > 1 && (window.__carga.at(-1).on))) setTimeout(tick, 30);
  };
  document.addEventListener('DOMContentLoaded', tick);
};
function analiza(rows) {
  const vals = rows.map((r) => (r.v == null ? null : Number(r.v))), nums = vals.filter((v) => v != null && Number.isFinite(v));
  let retro = 0; for (let k = 1; k < nums.length; k++) if (nums[k] < nums[k - 1]) retro++;
  const antes100 = rows.some((r) => Number(r.v) >= 100 && !r.on), fin = rows.find((r) => r.on);
  const wNum = rows.map((r) => parseFloat(r.w ?? '')), wRetro = wNum.filter((w, k) => k && Number.isFinite(w) && Number.isFinite(wNum[k - 1]) && w < wNum[k - 1]).length;
  const numOk = rows.filter((r) => r.v != null && r.n != null && !r.on).every((r) => r.n.replace(/\s/g, '') === `${r.v}%`);
  return { muestras: rows.length, distintos: new Set(nums).size, retrocesos: retro, anchoRetrocesos: wRetro, cienAntes: antes100, alActivarse: fin ? Number(fin.v) : null, numeroCoincide: numOk, primeros: rows.slice(0, 4), ultimos: rows.slice(-3) };
}

await runTest(R, async () => {
  const b = await launch(), errors = [];
  try {
    // 1 · red lenta, caché vacía
    const page = await b.newPage(); await prepPage(page, dev('pc720'), 'h');
    page.on('pageerror', (e) => errors.push('pageerror ' + e.message));
    const cdp = await page.createCDPSession();
    await cdp.send('Network.enable'); await cdp.send('Network.clearBrowserCache');
    await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 40, downloadThroughput: 16e6 / 8, uploadThroughput: 2e6 / 8 });
    await page.evaluateOnNewDocument(SONDA);
    await withTimeout(page.goto(BASE_URL + '?bktest=1&narr=off', { waitUntil: 'domcontentloaded' }), 90000, 'carga');
    await withTimeout(page.waitForFunction(() => window.__bk && !document.getElementById('btn-start').disabled, { timeout: 240000 }), 245000, 'listo con red lenta');
    await sleep(300);
    const a = analiza(await page.evaluate(() => window.__carga));
    R.check(a.distintos >= 20 && a.retrocesos === 0 && a.anchoRetrocesos === 0, `red lenta: la barra crece sin retroceder (${a.distintos} valores distintos, ≥ 20)`, 'input', a);
    R.check(!a.cienAntes && a.alActivarse === 100, 'red lenta: nunca marca 100 antes de que JUGAR se active, y marca 100 al activarse', 'input', a);
    R.check(a.numeroCoincide, 'el número visible («NN %») coincide con aria-valuenow', 'input', a);
    // 2 · caché caliente
    await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
    await page.reload({ waitUntil: 'domcontentloaded' });
    await withTimeout(page.waitForFunction(() => window.__bk && !document.getElementById('btn-start').disabled, { timeout: 120000 }), 125000, 'listo con caché');
    await sleep(300);
    const c = analiza(await page.evaluate(() => window.__carga));
    R.check(c.retrocesos === 0 && c.anchoRetrocesos === 0 && !c.cienAntes && c.alActivarse === 100, `caché caliente: llega a 100 sin retroceder (${c.distintos} valores)`, 'input', c);
    await cdp.detach(); await page.close();
    // 3 · sin carga.json
    const p3 = await b.newPage(); await prepPage(p3, dev('pc720'), 'h');
    p3.on('pageerror', (e) => errors.push('pageerror ' + e.message));
    await p3.setRequestInterception(true); let cortada = false;
    p3.on('request', (rq) => { if (/carga\.json/.test(rq.url())) { cortada = true; rq.respond({ status: 404, body: '' }); } else rq.continue(); });
    await p3.evaluateOnNewDocument(SONDA);
    await withTimeout(p3.goto(BASE_URL + '?bktest=1&narr=off', { waitUntil: 'domcontentloaded' }), 90000, 'carga');
    await withTimeout(p3.waitForFunction(() => window.__bk && !document.getElementById('btn-start').disabled, { timeout: 120000 }), 125000, 'listo sin carga.json');
    await sleep(300);
    const d = analiza(await p3.evaluate(() => window.__carga));
    R.check(cortada && d.distintos >= 5 && d.retrocesos === 0 && d.alActivarse === 100, `sin carga.json: sigue avanzando (${d.distintos} valores) y llega a 100`, 'input', { cortada, ...d });
    await p3.close();
    R.check(!errors.length, 'sin errores de página', 'input', errors.slice(0, 5));
  } finally { await b.close(); }
}, { timeoutMs: 900000 });
