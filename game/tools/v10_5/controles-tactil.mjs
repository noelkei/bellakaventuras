// V10.5 R0 · guardián de los textos de controles (AM-07, AM-20, AM-23, AM-35; E5-19…E5-22):
//  · en táctil (iPhone vertical) el aviso del 1.er ejercicio del tutorial no habla de teclas desde el principio (fuente inicial táctil), y el chip
//    de modo tampoco; al conectar un mando se reescribe con el stick y al pulsar una tecla, con las teclas;
//  · Ajustes en táctil no dice «(Q · TABLA · LB)» ni teclas;
//  · pistas del modo ayuda: ninguna con teclas en táctil;
//  · pista del vaso de YINYANG en táctil: los dos avisos literales de E5-21, uno tras otro y nunca a la vez que el aviso de patata;
//  · «Controles» enseña solo la columna del aparato (táctil en el móvil; teclado en el ordenador; + mando si hay uno), con pestañas para las otras.
import { Report, runTest, launch, sleep } from '../v8/lib.mjs';
import { FRESH, padPress } from '../v10_2/lib102.mjs';
import { dev, open7, start7, tapEl } from './lib105.mjs';
const R = new Report('controles-tactil');
const BAD_TOUCH = /\bW\b|W A S D|WASD|flechas|←|→|\bQ\b|Espacio|\bE\b|ratón|clic|\bEsc\b|teclado|\bLB\b|\bstick\b/i;
const YY1 = 'Coge velocidad hacia la pared y súbela. De frente sales por arriba: SALTO + joystick ↑/↓ = flip.';
const YY2 = 'Para salir del vaso: joystick ↑ en el aire o la escalera.';
const N = (vistos, ayuda = 'no') => ({ v: 1, estado: 'hecho', paso: '', practica: true, vistos, ayuda });
const read = (page) => page.evaluate(() => { const h = document.getElementById('hint'), c = document.getElementById('mode-chip');
  return { src: window.__bk.input.source, hint: h.hidden ? null : h.textContent, chip: c.hidden ? null : (c.title || c.textContent) }; });
async function until(page, fn, ms, ...a) { const t0 = Date.now(); while (Date.now() - t0 < ms) { const v = await page.evaluate(fn, ...a); if (v) return v; await sleep(120); } return null; }

await runTest(R, async () => {
  const b = await launch(), errors = [];
  try {
    // 1 · tutorial en el móvil: aviso del ejercicio y chip, y cambio de entrada
    { const page = await open7(b, R, dev('ip14'), 'v', { save: { ...FRESH, settings: { iosAppAsked: true } }, query: '?bktest=1', errors }); await start7(page, true);
      const ex = await until(page, () => { const n = window.__bk.narr; if (n.exercise) return n.exercise.id; return null; }, 2000);
      void ex;
      for (let i = 0; i < 30 && !(await page.evaluate(() => !!window.__bk.narr.exercise)); i++) { await sleep(500); await tapEl(page, '#d2 .d2-row .d2-btn.primary', true); }
      await sleep(900); const r0 = await read(page);
      R.check(!!r0.hint && !BAD_TOUCH.test(r0.hint) && /joystick/i.test(r0.hint), 'táctil: el aviso del primer ejercicio habla del joystick y no de teclas (sin haber tocado el juego)', 'input', r0);
      R.check(!r0.chip || !BAD_TOUCH.test(r0.chip), 'táctil: el chip de modo no habla de teclas', 'input', r0);
      await padPress(page, 12); await sleep(700); const r1 = await read(page);
      R.check(r1.src === 'gamepad' && !!r1.hint && /stick/i.test(r1.hint) && !/joystick|\bW\b|flechas/i.test(r1.hint), 'al usar un mando, el aviso del ejercicio se reescribe con el stick', 'input', r1);
      await page.keyboard.press('KeyR'); await sleep(700); const r2 = await read(page);
      R.check(r2.src === 'keyboard' && !!r2.hint && /W A S D|flechas/.test(r2.hint), 'al pulsar una tecla, el aviso se reescribe con las teclas', 'input', r2);
      await page.close(); }
    // 2 · Ajustes y Controles en táctil y en ordenador
    for (const [id, o] of [['ip14', 'v'], ['pc720', 'h']]) {
      const D = dev(id), touch = D.kind !== 'desktop';
      const page = await open7(b, R, D, o, { save: { ...FRESH, narr: N(['PLA-10', 'CIN-01', 'PAR', 'NMG', 'OBJ']), settings: { iosAppAsked: true } }, query: '?bktest=1&narr=off', errors }); await start7(page, touch); await sleep(1000);
      if (touch) await page.touchscreen.tap(300, 300);
      await page.keyboard.press('Escape'); await sleep(500);
      if (!touch) { /* en ordenador la fuente es el teclado */ }
      await page.evaluate(() => document.getElementById('btn-settings').click()); await sleep(500);
      const aj = await page.evaluate(() => [...document.querySelectorAll('#settings .tiny, #settings label')].filter((e) => e.offsetParent !== null).map((e) => e.textContent).join(' | '));
      if (touch) R.check(!/\(Q · TABLA · LB\)|\bQ\b|\bLB\b|Esc\b/.test(aj.replace(/Ratón:[^|]*/g, '')), 'táctil: el texto de Ajustes no habla de teclas ni del mando', 'input', aj.slice(0, 300));
      await page.evaluate(() => document.getElementById('btn-settings-close').click()); await sleep(300);
      await page.evaluate(() => document.getElementById('btn-help').click()); await sleep(500);
      const h = await page.evaluate(() => { const vis = (e) => { for (let n = e; n; n = n.parentElement) { if (n.hidden) return false; const cs = getComputedStyle(n); if (cs.display === 'none' || cs.visibility === 'hidden') return false; } return e.getBoundingClientRect().width > 0; };
        const th = [...document.querySelectorAll('#help-body th')].filter(vis).map((e) => e.textContent.trim());
        const tabs = [...document.querySelectorAll('#help button, #help [role=tab]')].filter(vis).map((e) => e.textContent.trim());
        const body = document.getElementById('help-body'); return { th, tabs, sw: body.scrollWidth, cw: body.clientWidth }; });
      const want = touch ? 'Táctil' : 'Teclado';
      R.check(h.th.includes(want) && h.th.filter((x) => /Teclado|Táctil|Mando/.test(x)).length === 1 && h.tabs.some((t) => /Teclado|Táctil|Mando/.test(t)) && h.sw <= h.cw + 2,
        `${id}: «Controles» enseña solo la columna ${want}, con pestañas para las otras y sin salirse de lado`, 'input', h);
      if (touch) { await padPress(page, 0, 60); await sleep(200);
        await page.evaluate(() => { document.getElementById('btn-help-close').click(); }); await sleep(300); await page.evaluate(() => document.getElementById('btn-help').click()); await sleep(500);
        const h2 = await page.evaluate(() => [...document.querySelectorAll('#help-body th')].filter((e) => e.getBoundingClientRect().width > 0).map((e) => e.textContent.trim()));
        R.check(h2.includes('Táctil') && h2.includes('Mando'), 'táctil con mando: «Controles» enseña Táctil y Mando', 'input', h2); }
      await page.close();
    }
    // 3 · pistas del modo ayuda en táctil
    { const page = await open7(b, R, dev('ip14'), 'v', { save: { ...FRESH, narr: N(['PLA-10', 'CIN-01', 'PAR', 'NMG', 'OBJ'], 'si'), settings: { iosAppAsked: true } }, query: '?bktest=1', errors }); await start7(page, true); await sleep(1500);
      await page.touchscreen.tap(300, 300); await sleep(300);
      const Z = ['NMG', 'NVDA', 'YY', 'TT', 'FG'], ids = [];
      for (const z of Z) { for (const k of ['visible', 'medium', 'hidden', 'activity']) for (const n of [1, 2, 3]) ids.push(`HLP-${z}-${k}-${n}`); ids.push(`HLP-${z}-ACT-1`, `HLP-${z}-ACT-2`, `HLP-SIG-${z}-1`, `HLP-SIG-${z}-2`); }
      ids.push('HLP-SN-1', 'HLP-SN-2', 'HLP-SN-3', 'HLP-SN-4', 'HLP-TT-ACT-falta', 'HLP-FUERA-2d-1', 'HLP-FUERA-2d-2', 'HLP-FUERA-2d-SN');
      const bad = []; let seen = 0;
      for (const id of ids) {
        await page.evaluate((id) => { const g = window.__bk; void g.ayuda.dice(id, { key: 'x', pos: g.skater.footPos.clone(), pistas: [], zona: 'NMG' }); }, id);
        const t = await until(page, () => { const d = document.getElementById('d2'); return d && !d.hidden ? d.querySelector('.d2-text').textContent : null; }, 1500);
        if (t) { seen++; if (BAD_TOUCH.test(t)) bad.push(`${id}: ${t}`); }
        await page.evaluate(() => window.__bk.d2.close()); await sleep(150);
      }
      R.check(seen > 40 && bad.length === 0, `táctil: ninguna de las ${seen} pistas del modo ayuda habla de teclas`, 'input', bad);
      await page.close(); }
    // 4 · pista del vaso de YINYANG en táctil (dos avisos, nunca a la vez que el aviso de patata)
    { const page = await open7(b, R, dev('ip14'), 'v', { save: { ...FRESH, narr: N(['PLA-10', 'CIN-01', 'PAR', 'NMG', 'OBJ']), hints: ['basic'], settings: { iosAppAsked: true } }, query: '?bktest=1&narr=off', errors }); await start7(page, true); await sleep(1200);
      await page.touchscreen.tap(300, 300); await sleep(300);
      await page.evaluate(() => { const g = window.__bk, p = g.pickups.find((x) => x.id === 'yinyang.hidden'); g.skater.teleport(p.spawn.pos.clone(), 0, 'ride'); g.rig.snapBehind(g.skater); });
      const seenH = new Set(); let clash = 0, toastPatata = 0;
      for (let i = 0; i < 110; i++) { const s = await page.evaluate(() => { const h = document.getElementById('hint'), t = document.getElementById('toast'); return { h: !h.hidden && !h.classList.contains('out') ? h.textContent : null, t: !t.hidden ? t.textContent : null }; });
        if (s.h) seenH.add(s.h); if (s.t && /Patata/.test(s.t)) toastPatata++; if (s.h && s.t && /Patata/.test(s.t) && /pared|vaso/.test(s.h)) clash++; await sleep(150); }
      const H = [...seenH];
      R.check(H.includes(YY1) && H.includes(YY2) && clash === 0, 'táctil: la pista del vaso de YY sale en dos avisos literales y nunca a la vez que el aviso de patata', 'input', { avisos: H, aLaVez: clash, toastPatata });
      await page.close(); }
    R.check(!errors.length, 'sin errores de página', 'input', errors.slice(0, 5));
  } finally { await b.close(); }
}, { timeoutMs: 900000 });
