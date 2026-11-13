// V10.6 · guardián del punto 1.6 (V10/IT9/B1_MOVIL.md; nota del verificador en H8-10): con un diálogo 2D abierto, el botón de pausa (II) se ve y se
// puede tocar con el dedo; la pausa sale ENCIMA del 2D (el 2D no recibe toques debajo) y al «Seguir» el 2D sigue y se contesta; II no tapa el
// bocadillo. Con la pregunta del modo ayuda (partida antigua), en iPhone 12–15 vertical y horizontal, diestro y zurdo, y en el SE 320.
// Uso: node tools/v10_6/pausa-2d.mjs --url <build> [--task V10-6] [--label r]
import { Report, runTest, launch, sleep, arg } from '../v8/lib.mjs';
import { open8, start8, dev, S0, tapOrClick, onTop, until } from '../it8/lib8.mjs';
const R = new Report('v106-pausa-2d', { task: arg('task', 'V10-6') });
const S_MODO = (zurdo) => ({ ...S0, collected: ['no_me_guillo.visible'], settings: { iosAppAsked: true, ...(zurdo ? { leftHanded: true } : {}) }, narr: { v: 1, estado: 'antigua', paso: '', practica: false, vistos: [], ayuda: null } });
const pregunta = (page) => until(page, () => { const d = document.getElementById('d2'); return d && !d.hidden && d.querySelectorAll('.d2-row .d2-btn:not(.d2-skip)').length >= 2; }, 30000);
const solape = (page) => page.evaluate(() => { const a = document.getElementById('btn-pause').getBoundingClientRect(), b = document.getElementById('d2-bubble').getBoundingClientRect();
  return { ii: [a.left, a.top, a.width, a.height].map(Math.round), bocadillo: [b.left, b.top, b.width, b.height].map(Math.round), solapa: a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom }; });
await runTest(R, async () => {
  const b = await launch(); const out = {};
  try {
    for (const [di, o, zurdo] of [['ip14', 'v', false], ['ip14', 'h', false], ['ip14', 'v', true], ['se1', 'v', false], ['se1', 'h', false]]) {
      const tag = `${di} ${o}${zurdo ? ' zurdo' : ''}`, errors = [];
      const page = await open8(b, R, dev(di), o, { save: S_MODO(zurdo), query: '?bktest=1', errors });
      try { await start8(page, true); await sleep(1000);
        // hasta la pregunta (con «Continuar» en las frases de antes)
        const t0 = Date.now(); let q = false; while (Date.now() - t0 < 30000) { const n = await page.evaluate(() => { const d = document.getElementById('d2'); return d && !d.hidden ? d.querySelectorAll('.d2-row .d2-btn:not(.d2-skip)').length : 0; });
          if (n >= 2) { q = true; break; } if (n === 1) { await sleep(450); await tapOrClick(page, '#d2 .d2-btn.primary', true); } await sleep(300); }
        if (!q) { R.invalid(`${tag}: no salió la pregunta del modo ayuda`); continue; }
        await sleep(600);
        const iiTop = await onTop(page, '#btn-pause'), sol = await solape(page);
        R.check(iiTop.ok, `${tag}: con el 2D abierto, II se ve y le llega el toque`, 'emulation', iiTop);
        R.check(!sol.solapa, `${tag}: II no tapa el bocadillo del 2D`, 'emulation', sol);
        await tapOrClick(page, '#btn-pause', true); await sleep(700);
        const p = await page.evaluate(() => ({ paused: window.__bk.paused, pausa: !document.getElementById('pause').hidden, d2: !document.getElementById('d2').hidden }));
        R.check(p.paused && p.pausa && p.d2, `${tag}: II abre la pausa encima del 2D (el 2D sigue debajo)`, 'input', p);
        if (p.pausa) {
          const d2Top = await onTop(page, '#d2 .d2-btn.primary'); R.check(!d2Top.ok, `${tag}: con la pausa encima, el 2D de debajo no recibe toques`, 'emulation', d2Top);
          await tapOrClick(page, '#btn-resume', true); await sleep(700);
          const s = await page.evaluate(() => ({ paused: window.__bk.paused, d2: !document.getElementById('d2').hidden, ayuda: window.__bk.state.p.narr.ayuda }));
          R.check(!s.paused && s.d2 && s.ayuda === null, `${tag}: «Seguir» vuelve al 2D sin contestarlo`, 'input', s);
          await tapOrClick(page, '#d2 .d2-row .d2-btn:not(.d2-skip):last-child', true); await sleep(900);
          const r2 = await page.evaluate(() => window.__bk.state.p.narr.ayuda); R.check(r2 === 'no', `${tag}: después se contesta con el dedo`, 'input', { ayuda: r2 });
        }
        out[tag] = { iiTop, sol, p };
        R.check(!errors.length, `${tag}: sin errores`, 'emulation', errors.slice(0, 3));
      } finally { await page.close(); }
    }
    R.measure('casos', out);
  } finally { await b.close(); }
}, { timeoutMs: 900000 });
