// IT8 · cruce con la r3 de V10.5 (23 oct). Mide dos riesgos que dejó escritos el chat de V10.5 (V10/IT7/PROMPT_ARREGLOS_TRAS_IT8.md):
//  · REV (D5-27 × W-D06): con la música por zona «una canción y bache al cambiar», ¿la revelación de las 20 patatas (la valla se hunde y el
//    centro pasa a sonar distinto) provoca un bache justo en la revelación? Criterio (el del encargo): durante la revelación y 3 s después la
//    música no baja de la mitad (bache < 0,5) y nunca suenan dos canciones de zona a la vez. Dos casos: ANMI donde empieza y pegada a la valla
//    (r 22,8, donde con la valla de pie domina SN).
//  · CIN (D5-27 × cinemática del parque): la cinemática lleva su propia pista (cineAudio) y la música del parque se calla; con la música por
//    zona no debe colarse ninguna canción de zona (> 0,1) ni haber cambios de canción mientras la cámara sobrevuela las cinco zonas.
//  · ENT (D5-24): con el móvil sin fotogramas (CPU 6× más lenta, iPhone 12–15 vertical), la entrada de ANMI en la portada se ve deslizar:
//    ≥ 12 fotogramas con ANMI a medio camino (0,05 < entrada < 0,95) y llega a su sitio. En la r2 el deslizamiento pasaba en 1–2 fotogramas
//    en el iPhone de verdad; la emulación puede no reproducir el ahogo de la carga (si la r2 también sale verde aquí, queda «M»).
// Uso: node game/tools/it8/r3-riesgos.mjs --url http://127.0.0.1:5244/ --task IT8-r3 --label x [--casos REV,ENT]
import { Report, runTest, launch, sleep, withTimeout } from '../v8/lib.mjs';
import { dev, prepPage, BASE_URL } from '../v10_5/lib105.mjs';
import { open8, start8, S20, until } from './lib8.mjs';
import { FRESH } from '../v10_2/lib102.mjs';
const R = new Report('it8-r3-riesgos');
const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i > 0 ? process.argv[i + 1] : d; };
const CASOS = arg('casos', 'REV,CIN,ENT').split(',');

const muestreaRev = (page, ms) => page.evaluate(async (ms) => { const g = window.__bk, out = [], t0 = performance.now();
  while (performance.now() - t0 < ms) { const mu = g.audio.music, act = [...mu.tracks.values()].filter((t) => t.gain > 0.1).map((t) => t.id);
    out.push({ t: +((performance.now() - t0) / 1000).toFixed(2), rev: g.revealT, dip: +(mu.zoneDip ?? 1).toFixed(3), zona: g.zonaMus ?? null, act, vk: +g.vallaMusicK.toFixed(2) });
    await new Promise((r) => setTimeout(r, 50)); } return out; }, ms);

await runTest(R, async () => {
  const b = await launch(); const errors = [];
  try {
    if (CASOS.includes('REV')) for (const [nom, r] of [['donde empieza', null], ['pegada a la valla (r 22,8)', 22.8]]) {
      // con 19 patatas (sin revelación aún): ANMI en su sitio, 4 s para que la música se asiente, y la 20.ª con `g.collect` (fixture declarada:
      // recogerla en su sitio movería a ANMI) → la revelación empieza con ANMI donde la queremos
      const ultima = S20.collected.at(-1);
      const page = await open8(b, R, dev('pc720'), 'h', { save: { ...S20, revealSeen: false, collected: S20.collected.slice(0, -1) }, query: '?bktest=1&narr=off', errors });
      await start8(page, false); await sleep(1500);
      if (r) await page.evaluate((r) => { const g = window.__bk, T = window.__bkTHREE; g.input.clear(); g.skater.teleport(new T.Vector3(r * Math.cos(1.0), 0, r * Math.sin(1.0)), 0, 'walk'); }, r);
      await sleep(4000);
      const antes = await page.evaluate(() => ({ zona: window.__bk.zonaMus, dip: window.__bk.audio.music.zoneDip, total: window.__bk.state.total }));
      const mp = muestreaRev(page, 14000);
      await page.evaluate((id) => { const g = window.__bk, p = g.pickups.find((x) => x.id === id); if (p) g.collect(p); }, ultima);
      const m = await mp; R.measure(`rev_antes_${r ?? 'inicio'}`, antes);
      const iRev = m.findIndex((x) => x.rev >= 0), iFin = m.findLastIndex((x) => x.rev >= 0);
      if (iRev < 0) { R.invalid(`REV ${nom}: no empezó la revelación`); await page.close(); continue; }
      const tramo = m.filter((x, i) => i >= iRev && x.t <= m[iFin].t + 3), minDip = Math.min(...tramo.map((x) => x.dip)), dos = tramo.filter((x) => x.act.filter((a) => a !== 'secretnovio').length > 1);
      const cambios = tramo.filter((x, i) => i > 0 && x.zona !== tramo[i - 1].zona).map((x) => ({ t: x.t, zona: x.zona }));
      R.measure(`rev_${r ?? 'inicio'}`, { inicio: m[iRev], fin: m[iFin], minDip, cambios, muestras: m.filter((_, i) => i % 10 === 0) });
      R.check(minDip >= 0.5, `REV ${nom}: la música no hace bache en la revelación (mínimo ${minDip}; cambios de canción ${JSON.stringify(cambios)})`, 'listen', { minDip, cambios });
      R.check(!dos.length, `REV ${nom}: nunca dos canciones de zona a la vez`, 'listen', dos.slice(0, 3));
      await page.close();
    }
    if (CASOS.includes('CIN')) { const page = await open8(b, R, dev('pc720'), 'h', { save: { ...FRESH, settings: { iosAppAsked: true } }, query: '?bktest=1', errors }); await start8(page, false);
      await until(page, () => { const d = document.getElementById('d2'); return d && !d.hidden; }, 15000); await sleep(600); await page.keyboard.press('KeyT');
      const t0 = Date.now(); while (Date.now() - t0 < 60000) { if (await page.evaluate(() => window.__bk.narr.inCine)) break; const dd = await page.evaluate(() => { const d = document.getElementById('d2'); return d && !d.hidden ? d.querySelectorAll('.d2-row .d2-btn:not(.d2-skip)').length : 0; }); if (dd >= 2) { await sleep(450); await page.evaluate(() => { const bs = [...document.querySelectorAll('#d2 .d2-row .d2-btn:not(.d2-skip)')]; bs.at(-1).click(); }); } else if (dd) { await sleep(450); await page.keyboard.press('KeyE'); } await sleep(250); }
      if (!(await page.evaluate(() => window.__bk.narr.inCine))) R.invalid('CIN: no llegó la cinemática'); else {
        const m = await page.evaluate(async () => { const g = window.__bk, out = []; while (g.narr.inCine && out.length < 900) { const mu = g.audio.music;
          out.push({ zona: g.zonaMus ?? null, dip: +(mu.zoneDip ?? 1).toFixed(3), zonas: [...mu.tracks.values()].filter((t) => t.id !== 'secretnovio' && t.gain > 0.1).map((t) => t.id) }); await new Promise((r) => setTimeout(r, 50)); } return out; });
        const colada = m.filter((x) => x.zonas.length), cambios = m.filter((x, i) => i > 0 && x.zona !== m[i - 1].zona).map((x) => x.zona);
        R.measure('cin', { n: m.length, colada: colada.slice(0, 5), cambios, minDip: Math.min(...m.map((x) => x.dip)) });
        R.check(m.length > 100 && !colada.length, `CIN: durante la cinemática (${(m.length * 0.05).toFixed(0)} s) no se cuela ninguna canción de zona (cambios internos de zona: ${cambios.length})`, 'listen', { colada: colada.slice(0, 5), cambios });
      } await page.close(); }
    if (CASOS.includes('ENT')) for (const cpu of [4, 6]) {
      const page = await b.newPage(); await prepPage(page, dev('ip14'), 'v');
      page.on('pageerror', (e) => errors.push('pageerror ' + String(e?.message ?? e).slice(0, 200)));
      const cdp = await page.target().createCDPSession(); await cdp.send('Emulation.setCPUThrottlingRate', { rate: cpu });
      await page.evaluateOnNewDocument(() => { try { localStorage.setItem('bellakaventuras.remake.save', JSON.stringify({ version: 5, settings: { iosAppAsked: true } })); } catch { /* */ }
        window.__ent = []; const t0 = performance.now(); const f = () => { const P = window.__bkPortada; if (P) window.__ent.push([+(performance.now() - t0).toFixed(0), +P.entrada.toFixed(3), +P.sombra.toFixed(3)]); if (performance.now() - t0 < 30000) requestAnimationFrame(f); }; requestAnimationFrame(f); });
      await withTimeout(page.goto(BASE_URL + '?bktest=1&narr=off&portada=viva', { waitUntil: 'load' }), 120000, 'carga de página');
      await sleep(30000);
      const e = await page.evaluate(() => window.__ent);
      const medio = e.filter((x) => x[1] > 0.05 && x[1] < 0.95), llega = e.some((x) => x[1] === 0 && x[0] > 500);
      const empieza = medio[0]?.[0] ?? null, acaba = medio.at(-1)?.[0] ?? null;
      R.measure(`ent_cpu${cpu}`, { fotogramas: e.length, medio: medio.length, empieza, acaba, llega, saltos: medio.slice(0, 40) });
      R.check(medio.length >= 12 && llega, `ENT CPU ${cpu}× (iPhone vertical): ANMI se ve deslizar (${medio.length} fotogramas a medio camino, de ${empieza} a ${acaba} ms) y llega a su sitio`, 'emulation', { medio: medio.length, empieza, acaba, llega });
      await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 }); await page.close();
    }
    R.check(!errors.length, 'sin errores de página', 'listen', errors.slice(0, 5));
  } finally { await b.close(); }
}, { timeoutMs: 420000 });
