// R11 · F8 · FPS-04: dos pulsaciones de SALTO entre dos fotogramas cuentan como dos (un flanco por paso fijo). BUCLE REAL: el rAF de la
// página se limita a 8 Hz (se saltan fotogramas) y las dos pulsaciones (KeyboardEvent en window) caen justo después de un fotograma
// pintado, separadas 60 y 90 ms → ambas antes del fotograma siguiente. Esperado: ollie + truco (kickflip). 3 intentos por caso.
// No empeorar: a ritmo normal (sin limitar) la doble pulsación de 90 ms sigue dando truco.
//   node tools/v8/r11/f8-fps.mjs --url pre --task R11 --label pre
import { Report, runTest, launch, clickStart, sleep, SAVE_20, argUrl } from '../lib.mjs';
const R = new Report('r11-f8-fps');
await runTest(R, async () => {
  const b = await launch();
  try {
    for (const hz of [8, 0]) {
      const page = await b.newPage(); await page.setViewport({ width: 1280, height: 800 });
      page.on('pageerror', (e) => R.error(new Error('pageerror ' + e.message)));
      await page.evaluateOnNewDocument((s, hz) => { sessionStorage.setItem('__bk6_fixture_done', '1'); localStorage.setItem('bellakaventuras.remake.save', JSON.stringify(s));
        if (!hz) return; const orig = window.requestAnimationFrame.bind(window); let last = -1e9;
        window.requestAnimationFrame = (cb) => { const wrap = (t) => { if (t === last || t - last >= 1000 / hz - 3) { last = t; cb(t); } else orig(wrap); }; return orig(wrap); }; }, SAVE_20, hz);
      R.fixture(`guardado 20/20 y rAF ${hz ? `limitado a ${hz} Hz` : 'normal'}`);
      await page.goto(argUrl() + '?bktest=1&narr=off', { waitUntil: 'load' }); await page.waitForFunction(() => window.__bk && !document.getElementById('btn-start').disabled, { timeout: 120000 });
      await clickStart(page); await sleep(1500); await page.evaluate(() => window.__bk.cars.setActive(false));
      for (const gap of hz ? [60, 90] : [90]) for (let i = 1; i <= 3; i++) {
        await page.evaluate(() => { const g = window.__bk, T = window.__bkTHREE, s = g.skater; g.input.clear(); s.teleport(new T.Vector3(20, 0.02, -38), 1.6, 'ride'); s.vel.set(Math.sin(1.6) * 6, 0, Math.cos(1.6) * 6); s.vLong = 6; g.rig.snapBehind(s); s.events.length = 0; });
        await sleep(400);
        const r = await page.evaluate((gap) => new Promise((res) => { const g = window.__bk; const sp = () => { window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Space', key: ' ' })); window.dispatchEvent(new KeyboardEvent('keyup', { code: 'Space', key: ' ' })); };
          requestAnimationFrame(() => setTimeout(() => { const s0 = g.stats.steps; sp(); setTimeout(() => { const s1 = g.stats.steps; sp(); setTimeout(() => res({ pasosEntre: s1 - s0, ev: g.skater.events.map((e) => e.e).filter((x) => /^trick|^pop$|takeoff/.test(x)) }), 1500); }, gap); }, 1)); }), gap);
        const truco = r.ev.some((x) => x.startsWith('trick:'));
        if (hz && r.pasosEntre !== 0) R.invalid(`${hz} Hz ${gap} ms #${i}: las dos pulsaciones no cayeron entre los mismos fotogramas (${r.pasosEntre} pasos)`, r);
        else R.check(truco, hz ? `FPS-04 a ${hz} Hz, dos SALTOS a ${gap} ms entre dos fotogramas (#${i}): ollie + truco (${r.ev.join(',')})` : `no empeorar: a ritmo normal, doble SALTO a ${gap} ms da truco (#${i})`, 'input', r);
      }
      await page.close();
    }
  } finally { await b.close(); }
}, { timeoutMs: 600000 });
