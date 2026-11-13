// V10.6 · guardián del punto 1.5 (V10/IT9/B1_MOVIL.md; nota de IT8): en pantalla táctil, girar el móvil en mitad de una actividad larga (grind de
// Bellakat, baile de FG) abre la pausa; explorando, girar NO pausa. iPhone 12–15, de vertical a horizontal y al revés.
// Uso: node tools/v10_6/girar-pausa.mjs --url <build> [--task V10-6] [--label r]
import { Report, runTest, launch, sleep, arg } from '../v8/lib.mjs';
import { rotate } from '../v10_5/lib105.mjs';
import { open8, start8, dev, S20, tapOrClick, toAct, until } from '../it8/lib8.mjs';
const R = new Report('v106-girar-pausa', { task: arg('task', 'V10-6') });
const d = dev('ip14');
const estado = (page) => page.evaluate(() => { const g = window.__bk; return { paused: g.paused, pausa: !document.getElementById('pause').hidden, act: g.exitableActivity()?.id ?? null, mode: g.mode }; });
async function grind(page) { await toAct(page, 'act.skateTutorial'); await until(page, () => !document.getElementById('prompt').hidden, 4000); await tapOrClick(page, '#btn-action', true);
  return !!(await until(page, () => document.body.classList.contains('grind'), 8000)); }
async function baile(page) { await toAct(page, 'act.danceCombo'); await until(page, () => !document.getElementById('prompt').hidden, 4000); await tapOrClick(page, '#btn-action', true); await sleep(1500);
  for (let i = 0; i < 4 && await page.evaluate(() => !document.getElementById('dialog').hidden); i++) { await tapOrClick(page, '#dialog-ok', true); await sleep(700); }
  return !!(await until(page, () => !document.getElementById('dance').hidden, 6000)); }
await runTest(R, async () => {
  const b = await launch(); const out = {};
  try {
    for (const [caso, prep] of [['grind', grind], ['baile', baile], ['explorando', null]]) for (const [o1, o2] of [['v', 'h'], ['h', 'v']]) {
      const errors = [], page = await open8(b, R, d, o1, { save: S20, errors }), tag = `${caso} ${o1}→${o2}`;
      try { await start8(page, true); await sleep(1200);
        if (prep && !(await prep(page))) { R.invalid(`${tag}: no empezó la actividad`); continue; }
        await sleep(800); const antes = await estado(page);
        await rotate(page, d, o2); await sleep(1200); const tras = await estado(page);
        out[tag] = { antes, tras };
        if (prep) R.check(!antes.paused && tras.paused && tras.pausa, `${tag}: al girar el móvil en la actividad se abre la pausa`, 'input', out[tag]);
        else R.check(!tras.paused && !tras.pausa, `${tag}: explorando, girar el móvil no pausa`, 'input', out[tag]);
        if (tras.pausa) { await tapOrClick(page, '#btn-resume', true); await sleep(600); const s = await estado(page); R.check(!s.paused, `${tag}: «Seguir» quita la pausa y sigue`, 'input', s); }
        R.check(!errors.length, `${tag}: sin errores`, 'emulation', errors.slice(0, 3));
      } finally { await page.close(); }
    }
    R.measure('casos', out);
  } finally { await b.close(); }
}, { timeoutMs: 900000 });
