// V10.6 · guardián del punto 2.6 (V10/IT9/B2_RECORRIDO.md): con la pregunta del modo ayuda del tutorial en pantalla, «Saltar tutorial» (tecla T) no hace
// nada (antes la cerraba sin respuesta y esa sesión quedaba sin modo ayuda) y la pausa no ofrece «Saltar tutorial»; contestarla funciona.
// Ordenador, teclado, partida nueva. Uso: node tools/v10_6/saltar-pregunta.mjs --url <build> [--task V10-6] [--label r]
import { Report, runTest, launch, sleep, arg } from '../v8/lib.mjs';
import { FRESH } from '../v10_2/lib102.mjs';
import { open8, start8, dev } from '../it8/lib8.mjs';
const R = new Report('v106-saltar-pregunta', { task: arg('task', 'V10-6') });
const d2 = (page) => page.evaluate(() => { const d = document.getElementById('d2'); return d && !d.hidden ? d.querySelectorAll('.d2-row .d2-btn:not(.d2-skip)').length : 0; });
await runTest(R, async () => {
  const b = await launch(); const out = {};
  try { const errors = [], page = await open8(b, R, dev('pc720'), 'h', { save: { ...FRESH, settings: { iosAppAsked: true } }, query: '?bktest=1', errors });
    try { await start8(page, false);
      let q = false; const t0 = Date.now();
      while (Date.now() - t0 < 120000) { const n = await d2(page); if (n >= 2) { q = true; break; }
        if (await page.evaluate(() => { const ex = window.__bk.narr.exercise; if (ex) ex.check = () => true; return !!ex; })) { await sleep(800); continue; }
        if (n === 1) { await sleep(450); await page.keyboard.press('KeyE'); } await sleep(300); }
      if (!q) R.invalid('no llegó la pregunta del modo ayuda'); else {
        await sleep(500); await page.keyboard.press('KeyT'); await sleep(1500);
        const a = { botones: await d2(page), ayuda: await page.evaluate(() => window.__bk.state.p.narr.ayuda) };
        out.trasT = a; R.check(a.botones >= 2 && a.ayuda === null, 'con la pregunta en pantalla, T no la cierra (sigue esperando respuesta)', 'input', a);
        await page.keyboard.press('Escape'); await sleep(700);
        const p = await page.evaluate(() => ({ pausa: !document.getElementById('pause').hidden, saltar: !document.getElementById('btn-tuto-skip2').hidden }));
        out.pausa = p; R.check(p.pausa && !p.saltar, 'la pausa no ofrece «Saltar tutorial» durante la pregunta', 'input', p);
        await page.keyboard.press('Escape'); await sleep(700);
        await page.evaluate(() => { const bs = [...document.querySelectorAll('#d2 .d2-row .d2-btn:not(.d2-skip)')]; bs.at(-1)?.click(); }); await sleep(900);
        const r = await page.evaluate(() => window.__bk.state.p.narr.ayuda); out.respuesta = r; R.check(r === 'no', 'la pregunta se contesta con normalidad', 'input', { ayuda: r });
      }
      R.check(!errors.length, 'sin errores', 'emulation', errors.slice(0, 3));
    } finally { await page.close(); }
    R.measure('casos', out);
  } finally { await b.close(); }
}, { timeoutMs: 400000 });
