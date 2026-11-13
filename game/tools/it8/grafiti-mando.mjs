// IT8 · H8-01 · guardián: el grafiti de YINYANG se puede pintar con cada entrada que el juego admite. En la tele 1920×1080 con SOLO el mando
// (sin ratón ni teclado): Y para hablar con Bellakroak, y luego 8 s de sticks (los dos, en círculos), cruceta, A, X y gatillos sobre el lienzo.
// Control: lo mismo con el ratón (trazos reales sobre el lienzo) tiene que pintar (así la prueba puede salir verde).
// Criterio: tras la entrada, el porcentaje pintado > 0 % (cualquier pintura cuenta).
import { Report, runTest, launch, sleep, arg } from '../v8/lib.mjs';
import { mouseStrokes, maskStrokes } from '../v8/yy-paint.mjs';
import { open8, start8, dev, S0, toAct, pad, padTap, PAD, until, saveJson } from './lib8.mjs';
const R = new Report('it8-grafiti-mando', { task: arg('task', 'IT8') });
const S_YY = { ...S0, partials: { tutorialStep: 0, tutorialStarted: false, bridgeRest: -1, graffitiMask: null, graffitiCheck: 0, danceRounds: 0, graffitiIntro: true } };
const pct = (page) => page.evaluate(() => { const a = window.__bk.activities.find((x) => x.id === 'graffiti');
  let cov = 0; if (a.covered) for (const v of a.covered) if (v) cov++; return { phase: a.phase, busy: a.busy, txt: document.getElementById('graffiti-pct')?.textContent ?? '', painted: cov, enMascara: a.paintedCount }; });
await runTest(R, async () => {
  const b = await launch(); const out = {};
  try {
    for (const via of ['mando', 'raton']) {
      const page = await open8(b, R, dev('pc1080'), 'h', { save: S_YY });
      await page.evaluate(async () => { await window.__bk.loadNpc('rana'); });
      if (via === 'mando') { await pad(page, {}); await padTap(page, PAD.A); await page.waitForFunction(() => window.__bk.started, { timeout: 10000 }).catch(() => {}); }
      if (!(await page.evaluate(() => window.__bk.started))) await start8(page, false);
      await sleep(1200); await toAct(page, 'act.graffiti'); await sleep(1500);
      if (via === 'mando') await padTap(page, PAD.Y); else await page.keyboard.press('KeyE');
      const enPintura = await until(page, () => { const a = window.__bk.activities.find((x) => x.id === 'graffiti'); return a.busy && a.phase === 'paint'; }, 10000);
      const a0 = await pct(page);
      if (!enPintura) { R.invalid(`${via}: la actividad no llegó a la fase de pintar`, a0); await page.close(); continue; }
      await sleep(600);
      if (via === 'mando') {
        const t0 = Date.now(); let k = 0;
        while (Date.now() - t0 < 8000) { const t = k * 0.35, x = Math.cos(t), y = Math.sin(t);
          await pad(page, { axes: [x, y, x, y], buttons: { 2: k % 3 === 0 ? 1 : 0, 6: 1, 7: 1, [12 + (k % 4)]: 1 } }); await sleep(90);   // sin A: A pulsa «Salir» (CE-07, aparte)
          await pad(page, { buttons: { 12: 0, 13: 0, 14: 0, 15: 0 } }); k++; }
        await pad(page, { axes: [0, 0, 0, 0], buttons: { 2: 0, 6: 0, 7: 0 } });
      } else { const st = (await maskStrokes(page, 0.3)).slice(0, 6); await mouseStrokes(page, st); }
      await sleep(800); const a1 = await pct(page);
      if (via === 'mando') { await padTap(page, PAD.A); await sleep(600); out.trasA = await pct(page);
        R.check(out.trasA.busy && out.trasA.phase === 'paint', 'CE-07 · con mando, A en el lienzo no sale de la actividad', 'input', out.trasA); }
      out[via] = { antes: a0, despues: a1 };
      const pintado = a1.painted > a0.painted;   // (antes de pulsar A)
      R.check(pintado, `${via === 'mando' ? 'solo mando (tele)' : 'ratón (control)'}: se puede pintar el muro de Bellakroak`, via === 'mando' ? 'input' : 'input', out[via]);
      await page.close();
    }
    saveJson('H8-01-grafiti-mando/resultado.json', out);
  } finally { await b.close(); }
}, { timeoutMs: 400000 });
