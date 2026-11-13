// V10.5 R0 · guardián (AM-02, AM-03, AM-08; E5-16, E5-17, T2, T11): los tres «SALTAR» responden al dedo y al ratón (no solo a T / Esc / B).
// En iPhone 12–15 vertical y horizontal (toque de verdad) y en ordenador 1280×720 (clic de ratón):
//  · «Saltar tutorial» con el 2D abierto: se ve, recibe el toque (elementFromPoint) y lleva a la pregunta del modo ayuda;
//  · «Saltar tutorial» durante un ejercicio (solo táctil vertical): igual, y no está encima de la pausa;
//  · «SALTAR ▸» de la cinemática del parque: la corta;
//  · «SALTAR ▸» de la escena final: la corta.
import { Report, runTest, launch, sleep, SAVE_20 } from '../v8/lib.mjs';
import { FRESH } from '../v10_2/lib102.mjs';
import { dev, open7, start7 } from './lib105.mjs';
const R = new Report('saltar-tactil');
const d2 = (page) => page.evaluate(() => { const d = document.getElementById('d2'); return d && !d.hidden ? { t: d.querySelector('.d2-text').textContent.slice(0, 50), n: d.querySelectorAll('.d2-row .d2-btn:not(.d2-skip)').length } : null; });
async function until(page, fn, ms, ...a) { const t0 = Date.now(); while (Date.now() - t0 < ms) { const v = await page.evaluate(fn, ...a); if (v) return v; await sleep(120); } return null; }
/** El control visible con ese texto: centro, si recibe el punto central y si pisa la pausa. */
const find = (page, re) => page.evaluate((src) => { const re = new RegExp(src, 'i');
  const e = [...document.querySelectorAll('#ui button, #d2 button')].find((x) => { const r = x.getBoundingClientRect(); if (r.width < 2 || x.closest('[hidden]')) return false; let o = 1; for (let n = x; n; n = n.parentElement) { const cs = getComputedStyle(n); if (cs.visibility === 'hidden' || cs.display === 'none') return false; o *= +cs.opacity; } return o > 0.3 && re.test(x.textContent); });
  if (!e) return null; const r = e.getBoundingClientRect(), cx = r.left + r.width / 2, cy = r.top + r.height / 2, at = document.elementFromPoint(cx, cy), p = document.getElementById('btn-pause').getBoundingClientRect();
  const pv = !document.getElementById('hud').hidden && p.width > 0, over = pv && r.left < p.right && p.left < r.right && r.top < p.bottom && p.top < r.bottom;
  return { x: cx, y: cy, w: r.width, h: r.height, id: e.id || e.className, recibe: !!at && (at === e || e.contains(at)), pisaPausa: over }; }, re.source);
const tap = async (page, touch, x, y) => { if (touch) await page.touchscreen.tap(x, y); else await page.mouse.click(x, y); };

await runTest(R, async () => {
  const b = await launch(); const errors = [];
  try {
    for (const [id, o] of [['ip14', 'v'], ['ip14', 'h'], ['pc720', 'h']]) {
      const D = dev(id), touch = D.kind !== 'desktop', tag = `${id} ${o}`;
      // 1 · Saltar tutorial con el 2D abierto
      { const page = await open7(b, R, D, o, { save: { ...FRESH, settings: { iosAppAsked: true } }, query: '?bktest=1', errors }); await start7(page, touch);
        await until(page, () => { const d = document.getElementById('d2'); return d && !d.hidden; }, 15000); await sleep(700);
        const s = await find(page, /saltar tutorial/);
        if (s) await tap(page, touch, s.x, s.y);
        const q = await until(page, () => { const n = window.__bk.narr; return !n.inTutorial || window.__bk.state.p.narr.paso === 'MODO' || (!!document.querySelector('#d2:not([hidden])') && n.skipReq === false && !n.exercise && n.N.ayuda === null && /mano|ayud/i.test(document.querySelector('#d2 .d2-text')?.textContent ?? '')); }, 6000);
        R.check(!!s && s.recibe && s.h >= 44 && !!q, `${tag}: «Saltar tutorial» con el 2D abierto recibe el ${touch ? 'toque' : 'clic'}, mide ≥ 44 px y lleva a la pregunta del modo ayuda`, 'input', { boton: s, pregunta: !!q });
        await page.close(); }
      // 2 · Saltar tutorial durante un ejercicio (táctil vertical)
      if (touch && o === 'v') { const page = await open7(b, R, D, o, { save: { ...FRESH, settings: { iosAppAsked: true } }, query: '?bktest=1', errors }); await start7(page, touch);
        const ex = await until(page, () => { const n = window.__bk.narr; if (n.exercise) return n.exercise.id; const d = document.getElementById('d2'); if (d && !d.hidden) document.querySelector('#d2 .d2-btn.primary')?.click(); return null; }, 40000);
        await sleep(1500); const s = await find(page, /saltar tutorial/);
        if (s) await tap(page, touch, s.x, s.y);
        const q = await until(page, () => { const n = window.__bk.narr; return !n.inTutorial || window.__bk.state.p.narr.paso === 'MODO' || (!!document.querySelector('#d2:not([hidden])') && n.skipReq === false && !n.exercise && n.N.ayuda === null && /mano|ayud/i.test(document.querySelector('#d2 .d2-text')?.textContent ?? '')); }, 8000);
        R.check(!!ex && !!s && s.recibe && !s.pisaPausa && s.h >= 44 && !!q, `${tag}: «Saltar tutorial» durante el ejercicio ${ex ?? '—'} recibe el toque, no pisa la pausa y lleva a la pregunta`, 'input', { boton: s, pregunta: !!q });
        await page.close(); }
      // 3 · SALTAR de la cinemática del parque
      { const page = await open7(b, R, D, o, { save: { ...FRESH, settings: { iosAppAsked: true } }, query: '?bktest=1', errors }); await start7(page, touch);
        await until(page, () => { const d = document.getElementById('d2'); return d && !d.hidden; }, 15000); await sleep(500);
        await page.keyboard.press('KeyT');   // preparación: el tutorial se salta con T (lo que se mide es el SALTAR de la cinemática)
        const cine = await until(page, () => { if (window.__bk.narr.inCine) return true; const d = document.getElementById('d2'); if (d && !d.hidden) { const bs = [...d.querySelectorAll('.d2-row .d2-btn:not(.d2-skip)')]; (bs[1] ?? bs[0])?.click(); } return false; }, 60000);
        await sleep(2500); const s = await find(page, /^\s*saltar\s*▸?\s*$/);
        if (s) await tap(page, touch, s.x, s.y);
        const off = await until(page, () => !window.__bk.narr.inCine, 4000);
        R.check(!!cine && !!s && s.recibe && !!off, `${tag}: «SALTAR ▸» de la cinemática del parque recibe el ${touch ? 'toque' : 'clic'} y la corta`, 'input', { cine: !!cine, boton: s, cortada: !!off });
        await page.close(); }
      // 4 · SALTAR de la escena final
      { const page = await open7(b, R, D, o, { save: { ...SAVE_20, finalDone: true, finalProof: { kind: 'secretnovio_v10', at: 'x' }, settings: { iosAppAsked: true } }, query: '?bktest=1&narr=off', errors }); await start7(page, touch); await sleep(1200);
        await page.evaluate(() => window.__bk.showPreview()); await sleep(4000);
        const on = await page.evaluate(() => window.__bk.mode === 'preview' && !!window.__bk.cine?.active);
        const s = await find(page, /^\s*saltar\s*▸?\s*$/);
        if (s) await tap(page, touch, s.x, s.y);
        const off = await until(page, () => !window.__bk.cine?.active || window.__bk.mode !== 'preview', 5000);
        R.check(on && !!s && s.recibe && !!off, `${tag}: «SALTAR ▸» de la escena final recibe el ${touch ? 'toque' : 'clic'} y la corta`, 'input', { escena: on, boton: s, cortada: !!off });
        await page.close(); }
    }
    R.check(!errors.length, 'sin errores de página', 'input', errors.slice(0, 5));
  } finally { await b.close(); }
}, { timeoutMs: 900000 });
