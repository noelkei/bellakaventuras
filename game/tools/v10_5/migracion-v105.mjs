// V10.5 R0 · guardián de la migración única de V10.5 (E5-06, E5-07, T5): partidas guardadas por V10.4 (migV10 3).
//  · «Pantalla: Vertical» (fijada sin querer por AM-01) vuelve a «Automática» al cargar, se guarda, y si después se vuelve a fijar, se respeta;
//  · en táctil, una partida con el modo ayuda en «No» vuelve a ver la pregunta UNA vez, en su versión corta («¡Has vuelto!…»), sin tutorial;
//  · en ordenador, esa partida no ve la pregunta; con «Sí», tampoco en táctil.
import { Report, runTest, launch, sleep, SAVE_20 } from '../v8/lib.mjs';
import { dev, open7, start7 } from './lib105.mjs';
const R = new Report('migracion-v105');
const KEY = 'bellakaventuras.remake.save';
const N = (ayuda) => ({ v: 1, estado: 'hecho', paso: '', practica: true, vistos: ['PLA-10', 'CIN-01', 'PAR', 'NMG', 'OBJ'], ayuda });
const OLD = (orientation, ayuda) => ({ ...SAVE_20, version: 5, migV10: 3, collected: SAVE_20.collected.slice(0, 6), activities: { ...SAVE_20.activities, bridgeTalk: false, danceCombo: false, graffiti: false }, finalDone: false, revealSeen: false, narr: N(ayuda), settings: { iosAppAsked: true, orientation } });
const disk = (page) => page.evaluate((k) => { try { const p = JSON.parse(localStorage.getItem(k)); return { orientation: p.settings.orientation, ayuda: p.narr?.ayuda ?? null, migV10: p.migV10 }; } catch { return null; } }, KEY);
async function until(page, fn, ms) { const t0 = Date.now(); while (Date.now() - t0 < ms) { const v = await page.evaluate(fn); if (v) return v; await sleep(150); } return null; }
const d2text = () => { const d = document.getElementById('d2'); return d && !d.hidden ? d.querySelector('.d2-text').textContent : null; };

await runTest(R, async () => {
  const b = await launch(), errors = [];
  try {
    // 1 · orientación (ordenador): vuelve a Automática una vez
    { const page = await open7(b, R, dev('pc720'), 'h', { save: OLD('vertical', 'no'), query: '?bktest=1', errors }); await sleep(500);
      const a = await page.evaluate(() => window.__bk.state.p.settings.orientation), dk = await disk(page);
      R.check(a === 'auto' && dk?.orientation === 'auto', 'una partida de V10.4 con «Vertical» pasa a «Automática» al cargar y queda guardada', 'unit', { memoria: a, disco: dk });
      await page.evaluate(() => { const g = window.__bk; g.state.p.settings.orientation = 'vertical'; g.state.save(); });
      await page.reload({ waitUntil: 'load' }); await page.waitForFunction(() => window.__bk && !document.getElementById('btn-start').disabled, { timeout: 90000 });
      const c = await page.evaluate(() => window.__bk.state.p.settings.orientation);
      R.check(c === 'vertical', 'la migración es una sola vez: si después se vuelve a fijar «Vertical», se respeta al recargar', 'unit', { tras: c });
      // ordenador: la partida con ayuda «No» no ve la pregunta
      await start7(page, false); const q = await until(page, d2text, 5000), ay = await page.evaluate(() => window.__bk.state.p.narr.ayuda);
      R.check(!q && ay === 'no', 'en ordenador, la partida con el modo ayuda en «No» no vuelve a ver la pregunta', 'input', { d2: q, ayuda: ay });
      await page.close(); }
    // 2 · táctil: ayuda «No» → la pregunta corta una vez
    { const page = await open7(b, R, dev('ip14'), 'v', { save: OLD('auto', 'no'), query: '?bktest=1', errors }); await start7(page, true);
      const q = await until(page, d2text, 12000), st = await page.evaluate(() => ({ estado: window.__bk.state.p.narr.estado, tuto: window.__bk.narr.inTutorial }));
      R.check(!!q && /vuelto/i.test(q) && st.estado === 'hecho' && !st.tuto, 'en táctil, la partida con «No» ve la pregunta corta («¡Has vuelto!…») sin tutorial', 'input', { d2: q, ...st });
      // se contesta «No» otra vez; al recargar ya no sale
      for (let i = 0; i < 6; i++) { const n = await page.evaluate(() => document.querySelectorAll('#d2:not([hidden]) .d2-row .d2-btn:not(.d2-skip)').length); if (n === 2) { await page.evaluate(() => document.querySelectorAll('#d2 .d2-row .d2-btn:not(.d2-skip)')[1].click()); break; } await page.evaluate(() => document.querySelector('#d2 .d2-btn.primary')?.click()); await sleep(800); }
      await sleep(1500); await page.evaluate(() => document.querySelector('#d2:not([hidden]) .d2-btn.primary')?.click()); await sleep(600);
      await page.reload({ waitUntil: 'load' }); await page.waitForFunction(() => window.__bk && !document.getElementById('btn-start').disabled, { timeout: 90000 }); await start7(page, true);
      const q2 = await until(page, d2text, 5000), ay = await page.evaluate(() => window.__bk.state.p.narr.ayuda);
      R.check(!q2 && ay === 'no', 'tras contestarla, al recargar ya no vuelve a salir (una sola vez)', 'input', { d2: q2, ayuda: ay });
      await page.close(); }
    // 3 · táctil con «Sí»: nada
    { const page = await open7(b, R, dev('ip14'), 'v', { save: OLD('auto', 'si'), query: '?bktest=1', errors }); await start7(page, true);
      const q = await until(page, d2text, 5000);
      R.check(!q, 'en táctil, la partida con el modo ayuda en «Sí» no ve la pregunta', 'input', { d2: q });
      await page.close(); }
    R.check(!errors.length, 'sin errores de página', 'input', errors.slice(0, 5));
  } finally { await b.close(); }
}, { timeoutMs: 600000 });
