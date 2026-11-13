// IT8 · G1 · guardián de la carga en redes malas (CDP: condiciones de red del navegador de pruebas; el servidor es local).
//  lenta  · 1,6 Mbit/s y 150 ms: JUGAR se activa en ≤ 6 min; la barra nunca retrocede y no se queda quieta > 20 s (se lee cada segundo).
//  corte  · al 30 % la red se corta 20 s y vuelve: en ≤ 3 min tras volver, o JUGAR está activo o hay un error visible con salida
//           (no una carga eterna).
//  404    · un recurso del arranque (`--falla`, por defecto el fondo de la Bola de Oro) da 404: en ≤ 90 s hay un error visible con salida o
//           el juego arranca igualmente (nunca carga eterna sin aviso).
//  cache  · segunda visita en el mismo perfil: medida de bytes transferidos y tiempo (sin criterio: depende de las cabeceras del servidor).
// Aparatos: ordenador 1280×720 e iPhone 12–15 vertical.
import { Report, runTest, launch, sleep, arg, withTimeout } from '../v8/lib.mjs';
import { prepPage } from '../v10_5/lib105.mjs';
import { dev, S20, saveJson } from './lib8.mjs';
const R = new Report('it8-carga-red', { task: arg('task', 'IT8') });
const URL0 = arg('url', 'http://127.0.0.1:5247/'); const BASE = URL0.startsWith('http') ? URL0 : 'http://127.0.0.1:5247/';
const CASOS = (arg('casos') ?? 'lenta,corte,404,cache').split(',');
const APARATOS = (arg('aparatos') ?? 'pc720:h,ip14:v').split(',').map((s) => s.split(':'));
const FALLA = arg('falla', 'assets/bola/bola_fondo.glb');
const estado = (page) => page.evaluate(() => { const b = document.getElementById('btn-start'), e = document.getElementById('start-error'), bar = document.getElementById('load-bar'), pct = document.getElementById('load-pct');
  const ev = (x) => !!x && !x.hidden && !x.closest('[hidden]') && x.getBoundingClientRect().height > 0 && getComputedStyle(x).visibility !== 'hidden';
  return { listo: !!b && !b.disabled, pct: +(bar?.getAttribute('aria-valuenow') ?? parseFloat(pct?.textContent ?? 'NaN')), texto: document.getElementById('load-text')?.textContent?.slice(0, 120) ?? '', error: ev(e) ? e.textContent.slice(0, 200) : null,
    salida: ev(e) && !!e.querySelector('button, a') || [...document.querySelectorAll('#start button')].some((x) => ev(x) && /reintentar|recargar|volver a intentar/i.test(x.textContent)) }; }).catch(() => ({ listo: false, pct: NaN, error: null, caido: true }));
async function abrir(b, d, o) { const page = await b.newPage(); await prepPage(page, d, o, {}); await page.evaluateOnNewDocument((s) => { try { if (!sessionStorage.getItem('__f')) { sessionStorage.setItem('__f', '1'); localStorage.setItem('bellakaventuras.remake.save', JSON.stringify(s)); } } catch { /* */ } }, S20); return page; }
await runTest(R, async () => {
  const out = {};
  for (const [di, o] of APARATOS) for (const caso of CASOS) {
    const b = await launch(); const d = dev(di), tag = `${caso} · ${di} ${o}`;
    try {
      const page = await abrir(b, d, o); const cdp = await page.target().createCDPSession(); await cdp.send('Network.enable');
      let bytes = 0; cdp.on('Network.loadingFinished', (e) => { bytes += e.encodedDataLength || 0; });
      const fila = out[tag] = { muestras: [] };
      if (caso === 'lenta' || caso === 'corte') await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 150, downloadThroughput: 1.6e6 / 8, uploadThroughput: 0.75e6 / 8 });   // corte: con red lenta, para llegar al 30 % a mitad de carga
      if (caso === '404') { await page.setRequestInterception(true); page.on('request', (r) => { if (r.url().includes(FALLA)) r.respond({ status: 404, contentType: 'text/plain', body: 'no' }); else r.continue(); }); }
      const t0 = Date.now(); void page.goto(BASE + '?bktest=1&narr=off', { waitUntil: 'load', timeout: 0 }).catch(() => {});
      const LIM = caso === 'lenta' ? 360000 : caso === 'corte' ? 300000 : caso === '404' ? 90000 : 120000;
      let cortado = false, vuelto = 0, last = null, quieto = 0, maxQuieto = 0, retro = 0, s = null;
      while (Date.now() - t0 < LIM) {
        await sleep(1000); s = await estado(page); fila.muestras.push([Math.round((Date.now() - t0) / 1000), s.pct, s.listo ? 1 : 0, s.error ? 1 : 0]);
        if (Number.isFinite(s.pct) && last !== null && Number.isFinite(last)) { if (s.pct < last - 0.5) retro++; if (Math.abs(s.pct - last) < 0.05) { quieto++; maxQuieto = Math.max(maxQuieto, quieto); } else quieto = 0; }
        if (Number.isFinite(s.pct)) last = s.pct;
        if (caso === 'corte' && !cortado && s.pct >= 30) { cortado = true; await cdp.send('Network.emulateNetworkConditions', { offline: true, latency: 0, downloadThroughput: -1, uploadThroughput: -1 }); fila.corteEn = s.pct; await sleep(20000);
          await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 }); vuelto = Date.now(); }
        if (s.listo || (s.error && caso !== 'lenta')) break;
        if (caso === 'corte' && vuelto && Date.now() - vuelto > 180000) break;
      }
      fila.fin = s; fila.seg = Math.round((Date.now() - t0) / 1000); fila.bytes = bytes; fila.maxQuieto = maxQuieto; fila.retrocesos = retro;
      if (caso === 'lenta') {
        R.check(s.listo, `${tag}: con 1,6 Mbit/s JUGAR se activa en ≤ 6 min (${fila.seg} s)`, 'emulation', { seg: fila.seg, fin: s });
        R.check(!retro && maxQuieto <= 20, `${tag}: la barra nunca retrocede y no se queda quieta más de 20 s (máx. ${maxQuieto} s)`, 'emulation', { retro, maxQuieto });
      } else if (caso === 'corte') {
        if (!cortado || fila.corteEn > 60) R.invalid(`${tag}: no se pudo cortar a mitad de carga`, { corteEn: fila.corteEn });
        R.check(s.listo || (s.error && s.salida), `${tag}: tras cortar la red al ${Math.round(fila.corteEn ?? 0)} % y volver, arranca o enseña un error con salida (no carga eterna)`, 'emulation', s);
        fila.enRecuperar = vuelto ? Math.round((Date.now() - vuelto) / 1000) : null;
      } else if (caso === '404') {
        R.check(s.listo || (s.error && s.salida), `${tag}: si falla ${FALLA}, arranca igual o enseña un error con salida en ≤ 90 s`, 'emulation', s);
      } else if (caso === 'cache') {
        const t1 = fila.seg, b1 = bytes; bytes = 0; const t2 = Date.now();
        await page.reload({ waitUntil: 'load' }); await withTimeout(page.waitForFunction(() => window.__bk && !document.getElementById('btn-start').disabled, { timeout: 120000 }), 125000, 'listo');
        fila.segunda = { seg: Math.round((Date.now() - t2) / 1000), bytes }; fila.primera = { seg: t1, bytes: b1 };
        R.measure(`${tag}_cache`, { primera: fila.primera, segunda: fila.segunda });
        R.check(fila.segunda.seg <= Math.max(5, t1 * 1.5), `${tag}: la segunda visita no tarda más que la primera (${fila.primera.seg} → ${fila.segunda.seg} s)`, 'emulation', fila);
      }
      await cdp.detach().catch(() => {});
    } catch (e) { R.error(e); } finally { await b.close(); }
  }
  saveJson('G1-carga/resultado.json', out);
}, { timeoutMs: 5400000 });
