// V10.5 R0 · guardián (AM-01, AM-29; E5-18, T1): en táctil, el «clic de compatibilidad» que el navegador manda al levantar el dedo no llega a
// otro control. Con el dedo de verdad (touchscreen.tap: pointerdown → pointerup → click), en iPhone 12–15 vertical y horizontal:
//  · tocar II abre la pausa y NO cambia «Pantalla» (sigue «Automática», sin giro del contenedor);
//  · en el tutorial, 1 toque en «Continuar» = 1 frase (PLA-02 se enseña, no se salta);
//  · en una partida antigua, el toque en «¡Has vuelto!…» enseña la pregunta del modo ayuda y no la contesta sola;
//  · barrido de 17 estados (todos sus botones, cada uno desde el estado recién preparado): ningún clic cae en otro control (sale de
//    V10/IT7/tools/fantasma.mjs). `--rapido` deja el barrido en 6 estados (rondas intermedias); la batería lo pasa entero.
import { Report, runTest, launch, sleep, arg, flag, SAVE_20 } from '../v8/lib.mjs';
import { FRESH, toZone } from '../v10_2/lib102.mjs';
import { dev, open7, start7 } from './lib105.mjs';
const R = new Report('toque-fantasma');
const OS = (arg('os') ?? 'v,h').split(','), RAPIDO = flag('rapido');
const N = (vistos, ayuda = 'no') => ({ v: 1, estado: 'hecho', paso: '', practica: true, vistos, ayuda });
const BASE = ['PLA-10', 'CIN-01', 'PAR', 'NMG', 'OBJ'];
const S20 = { ...SAVE_20, settings: { iosAppAsked: true }, narr: N([...BASE, 'PAS-01', 'PAS-02', 'PAS-03', 'PAS-04', 'PAS-05', 'PAS-06', 'PAS-07', 'PAS-08', 'FIN']) };
const INSTR = () => {
  const nm = (e) => !e ? 'nada' : (e.id ? '#' + e.id : e.tagName.toLowerCase() + (typeof e.className === 'string' && e.className ? '.' + e.className.trim().split(/\s+/)[0] : '')) + (e.tagName === 'BUTTON' ? `«${(e.textContent || '').trim().slice(0, 16)}»` : '');
  const ctl = (e) => e && e.closest && e.closest('button, a, input, select, label, [role=button]');
  window.__gh = { down: null, log: [] };
  document.addEventListener('pointerdown', (e) => { window.__gh.down = e.target; }, true);
  // en fase de captura en window (lo primero del recorrido) se apunta adónde va el clic; un oyente puesto en ese momento en el propio destino
  // dice si el clic llegó a él (si el juego lo anula antes —filtro en document—, no llega y no cuenta como fantasma)
  window.addEventListener('click', (e) => { const d = window.__gh.down, c = ctl(e.target); const row = { down: nm(ctl(d) || d), click: nm(c || e.target), same: !!d && (d === e.target || d.contains(e.target) || e.target.contains(d) || (c && c.contains(d))), ctl: !!c, reached: false };
    window.__gh.log.push(row); const t = e.target, mark = () => { row.reached = true; t.removeEventListener('click', mark, true); }; t.addEventListener('click', mark, true); setTimeout(() => t.removeEventListener('click', mark, true), 50); }, true);
};
const ghostsOf = (page) => page.evaluate(() => (window.__gh?.log ?? []).map((r) => ({ ...r, blocked: !r.reached })));
const d2 = (page) => page.evaluate(() => { const d = document.getElementById('d2'); return d && !d.hidden ? { t: d.querySelector('.d2-text').textContent.slice(0, 60), n: d.querySelectorAll('.d2-row .d2-btn:not(.d2-skip)').length } : null; });
async function tapC(page, sel) { const b = await page.evaluate((q) => { const e = [...document.querySelectorAll(q)].find((x) => { const r = x.getBoundingClientRect(); return r.width > 0 && !x.closest('[hidden]'); }); if (!e) return null; const r = e.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; }, sel); if (!b) return false; await page.touchscreen.tap(b.x, b.y); return true; }
async function waitD2(page, ms = 15000) { const t0 = Date.now(); while (Date.now() - t0 < ms) { const s = await d2(page); if (s) return s; await sleep(120); } return null; }

const STATES = [
  { id: 'inicio', save: S20, query: '?bktest=1&narr=off', prep: async () => true, started: false, sel: '#start button:not([hidden])' },
  { id: 'explorar', save: S20, query: '?bktest=1&narr=off', prep: async () => true, sel: '#touch > button, #btn-pause', quick: true },
  { id: 'accion', save: { ...FRESH, narr: N(BASE), settings: { iosAppAsked: true } }, query: '?bktest=1&narr=off', prep: async (p) => { await toZone(p, 'act.pantherTalk'); await sleep(900); return p.evaluate(() => !document.getElementById('prompt').hidden); }, sel: '#btn-action' },
  { id: 'charla', save: { ...FRESH, narr: N(BASE), settings: { iosAppAsked: true } }, query: '?bktest=1&narr=off', prep: async (p) => { await toZone(p, 'act.pantherTalk'); await sleep(900); await tapC(p, '#btn-action'); for (let i = 0; i < 20; i++) { await sleep(200); if (await p.evaluate(() => !document.getElementById('dialog').hidden)) break; } await sleep(500); return p.evaluate(() => !document.getElementById('dialog').hidden); }, sel: '#dialog-ok', quick: true },
  { id: 'skills', save: S20, query: '?bktest=1&narr=off', prep: async (p) => { await tapC(p, '#btn-dance'); await sleep(450); return p.evaluate(() => !!document.querySelector('#dance-ring.open')); }, sel: '#dance-ring > button.lvl' },
  { id: 'skills-bailar', save: S20, query: '?bktest=1&narr=off', prep: async (p) => { await tapC(p, '#btn-dance'); await sleep(450); await tapC(p, '#dance-ring .skill-root[data-l=dance]'); await sleep(450); return p.evaluate(() => !!document.querySelector('#dance-ring .dance-opt.lvl')); }, sel: '#dance-ring > button.lvl' },
  { id: 'pausa', save: S20, query: '?bktest=1&narr=off', prep: async (p) => { await p.keyboard.press('Escape'); await sleep(600); return p.evaluate(() => !document.getElementById('pause').hidden); }, sel: '#pause button:not([hidden]), #pause input', quick: true },
  { id: 'ajustes', save: S20, query: '?bktest=1&narr=off', prep: async (p) => { await p.keyboard.press('Escape'); await sleep(500); await p.evaluate(() => document.getElementById('btn-settings').click()); await sleep(600); return p.evaluate(() => !document.getElementById('settings').hidden); }, sel: '#settings button:not([hidden]), #settings input', quick: true },
  { id: 'editor', save: S20, query: '?bktest=1&narr=off', prep: async (p) => { await p.keyboard.press('Escape'); await sleep(500); await p.evaluate(() => document.getElementById('btn-settings').click()); await sleep(400); await p.evaluate(() => document.getElementById('btn-size-open').click()); await sleep(600); return p.evaluate(() => !document.getElementById('btn-size').hidden); }, sel: '#btn-size button' },
  { id: 'controles', save: S20, query: '?bktest=1&narr=off', prep: async (p) => { await p.keyboard.press('Escape'); await sleep(500); await p.evaluate(() => document.getElementById('btn-help').click()); await sleep(600); return p.evaluate(() => !document.getElementById('help').hidden); }, sel: '#help button' },
  { id: 'plaza?', save: S20, query: '?bktest=1&narr=off', prep: async (p) => { await p.keyboard.press('Escape'); await sleep(500); await p.evaluate(() => document.getElementById('btn-plaza').click()); await sleep(600); return p.evaluate(() => !document.getElementById('confirm-plaza').hidden); }, sel: '#confirm-plaza button' },
  { id: 'reiniciar?', save: S20, query: '?bktest=1&narr=off', prep: async (p) => { await p.keyboard.press('Escape'); await sleep(500); await p.evaluate(() => document.getElementById('btn-restart').click()); await sleep(600); return p.evaluate(() => !document.getElementById('confirm').hidden); }, sel: '#confirm button' },
  { id: 'd2', save: { ...FRESH, settings: { iosAppAsked: true } }, query: '?bktest=1', prep: async (p) => { await waitD2(p); await sleep(600); return !!(await d2(p)); }, sel: '#d2 button, #btn-tuto-skip', quick: true },
  { id: 'd2-pregunta', save: { ...FRESH, narr: { v: 1, estado: 'antigua', paso: '', practica: false, vistos: [], ayuda: null }, settings: { iosAppAsked: true } }, query: '?bktest=1', prep: async (p) => { for (let i = 0; i < 5; i++) { await sleep(900); const s = await d2(p); if (s?.n === 2) return true; await p.evaluate(() => document.querySelector('#d2 .d2-btn.primary')?.click()); } return false; }, sel: '#d2 button', quick: true },
  { id: 'ios', save: { ...SAVE_20, settings: {} }, query: '?bktest=1&narr=off', prep: async (p) => p.evaluate(() => !document.getElementById('ios-app').hidden), sel: '#ios-app button', ios: true },
  { id: 'final', save: { ...SAVE_20, finalDone: true, finalProof: { kind: 'secretnovio_v10', at: 'x' }, settings: { iosAppAsked: true } }, query: '?bktest=1&narr=off', prep: async (p) => { await p.evaluate(() => window.__bk.showPreview()); await sleep(2500); await p.keyboard.press('Escape'); await sleep(2500); return p.evaluate(() => !document.getElementById('final').hidden || window.__bk.mode === 'explore'); }, sel: '#final button:not([hidden]), #btn-cine-skip' },
  { id: 'escena', save: { ...SAVE_20, finalDone: true, finalProof: { kind: 'secretnovio_v10', at: 'x' }, settings: { iosAppAsked: true } }, query: '?bktest=1&narr=off', prep: async (p) => { await p.evaluate(() => window.__bk.showPreview()); await sleep(3000); return p.evaluate(() => window.__bk.mode === 'preview'); }, sel: '#btn-cine-skip' },
];
const listBtns = (page, sel) => page.evaluate((sel) => [...document.querySelectorAll(sel)].map((e, i) => { const r = e.getBoundingClientRect(); let vis = r.width > 2 && r.height > 2; for (let n = e; n && vis; n = n.parentElement) { const cs = getComputedStyle(n); if (cs.display === 'none' || cs.visibility === 'hidden' || n.hidden || +cs.opacity < 0.05) vis = false; }
  const cx = Math.min(innerWidth - 2, Math.max(2, r.left + r.width / 2)), cy = Math.min(innerHeight - 2, Math.max(2, r.top + r.height / 2));
  return { i, id: e.id || '', txt: (e.textContent || e.getAttribute('aria-label') || e.type || '').trim().slice(0, 22), x: cx, y: cy, vis, onscreen: r.top < innerHeight && r.bottom > 0 }; }).filter((b) => b.vis && b.onscreen), sel);

await runTest(R, async () => {
  const b = await launch(); const D = dev('ip14'), errors = [];
  try {
    for (const o of OS) {
      // A · II no cambia la orientación
      { const page = await open7(b, R, D, o, { save: S20, query: '?bktest=1&narr=off', errors }); await start7(page, true); await sleep(1200);
        await page.evaluate(INSTR);
        await tapC(page, '#btn-pause'); await sleep(900);
        const s = await page.evaluate(() => ({ pref: window.__bk.state.p.settings.orientation, rot: /rot(m)?90/.test(document.documentElement.className), pausa: !document.getElementById('pause').hidden }));
        const gh = (await ghostsOf(page)).filter((l) => !l.same && l.ctl && !l.blocked);
        R.check(s.pausa && s.pref === 'auto' && !s.rot && !gh.length, `${o}: tocar II abre la pausa y «Pantalla» sigue en Automática (sin girar el juego)`, 'input', { ...s, fantasmas: gh.map((g) => g.click) });
        await page.close(); }
      // B · 1 toque en Continuar = 1 frase
      { const page = await open7(b, R, D, o, { save: { ...FRESH, settings: { iosAppAsked: true } }, query: '?bktest=1', errors }); await start7(page, true);
        const a = await waitD2(page); await sleep(700);
        await tapC(page, '#d2 .d2-btn.primary'); await sleep(1100);
        const c = await d2(page), v = await page.evaluate(() => window.__bk.state.p.narr.vistos.slice());
        R.check(!!a && !!c && v.includes('PLA-01') && !v.includes('PLA-02'), `${o}: en el tutorial, 1 toque en «Continuar» = 1 frase (se ve la siguiente, no se salta)`, 'input', { antes: a?.t, despues: c?.t, vistos: v });
        await page.close(); }
      // C · la pregunta del modo ayuda no se contesta sola
      { const page = await open7(b, R, D, o, { save: { ...FRESH, narr: { v: 1, estado: 'antigua', paso: '', practica: false, vistos: [], ayuda: null }, settings: { iosAppAsked: true } }, query: '?bktest=1', errors }); await start7(page, true);
        const a = await waitD2(page); await sleep(700);
        await tapC(page, '#d2 .d2-btn.primary'); await sleep(1100);
        const c = await d2(page), ay = await page.evaluate(() => window.__bk.state.p.narr.ayuda);
        R.check(!!a && c?.n === 2 && ay === null, `${o}: partida antigua: tras «¡Has vuelto!…» se ve la pregunta (Sí / No) y no se contesta sola`, 'input', { antes: a?.t, despues: c, ayuda: ay });
        await page.close(); }
      // D · barrido
      for (const S of STATES.filter((x) => !RAPIDO || x.quick)) {
        let page = await open7(b, R, D, o, { save: S.save, query: S.query, errors }); await page.evaluate(INSTR);
        if (S.started !== false) { await start7(page, true); await sleep(1200); }
        const ok = await S.prep(page); const btns = ok ? await listBtns(page, S.sel) : []; await page.close();
        if (!ok) { R.invalid(`${o} ${S.id}: estado no alcanzado`); continue; }
        const bad = [];
        for (const bt of btns) {
          page = await open7(b, R, D, o, { save: S.save, query: S.query, errors }); await page.evaluate(INSTR);
          if (S.started !== false) { await start7(page, true); await sleep(1200); }
          if (!(await S.prep(page))) { await page.close(); continue; }
          const cur = (await listBtns(page, S.sel)).find((x) => x.i === bt.i) ?? bt;
          await page.evaluate(() => { window.__gh.log = []; });
          await page.touchscreen.tap(cur.x, cur.y); await sleep(700);
          let gh = [];
          try { await page.waitForFunction(() => window.__bk, { timeout: 15000 }); gh = (await ghostsOf(page)).filter((l) => !l.same && l.ctl && !l.blocked); } catch { /* recarga: sin fantasma medible */ }
          if (gh.length) bad.push(`${bt.id ? '#' + bt.id : bt.txt} → ${gh.map((g) => g.click).join(', ')}`);
          await page.close();
        }
        R.check(bad.length === 0, `${o} barrido «${S.id}» (${btns.length} botones): ningún clic de compatibilidad cae en otro control`, 'input', bad);
      }
    }
    R.check(!errors.length, 'sin errores de página', 'input', errors.slice(0, 5));
  } finally { await b.close(); }
}, { timeoutMs: 3600000 });
