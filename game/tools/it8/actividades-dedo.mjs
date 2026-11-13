// IT8 · copia de V10/IT7/tools/actividades.mjs (sin tocarla) con --url (lib105) y salida en V10/IT8/evidencias/actividades. Medida.
// V10 IT7 · actividades con el dedo (puntos 2 y 3): en cada dispositivo se entra en cada actividad TOCANDO (HABLAR/BAILAR/EMPEZAR, «Vale»,
// «Continuar») y se juega con sus controles táctiles: grafiti con trazos de dedo, baile con la cruceta, grind con ◀ ▶ y AGACHARSE, reto de
// SECRETNOVIO con TREPAR (joystick arriba), ¡BAJAR!, SALTO y los círculos, y la pantalla final. En cada fase se pasa el detector de solapes y se
// captura. El desplazamiento entre sitios se hace colocando a ANMI (fixture) o con el piloto: lo que se mide es la interfaz táctil. Solo mide.
// Uso: node V10/IT7/tools/actividades.mjs [--devs ip14,se1] [--os v,h] [--acts pantera,grafiti,baile,grind,tt,sn]
import fs from 'node:fs';
import path from 'node:path';
import { launch, sleep, arg, SAVE_20 } from '../v8/lib.mjs';
import { FRESH, toZone } from '../v10_2/lib102.mjs';
import { maskStrokes, touchStrokes } from '../v8/yy-paint.mjs';
import { nvState } from '../v10/nv-lib.mjs';
import { snState, snFrame } from '../v10/sn-lib.mjs';
import { Pilot } from '../../../game/tools/v4/pilot.mjs';
import { dev, open7, start7, scan, saveJson } from '../v10_5/lib105.mjs';
import { EV8 as EV } from './lib8.mjs';

const DEVS = (arg('devs') ?? 'ip14,se1').split(','), OS = (arg('os') ?? 'v,h').split(','), ACTS = (arg('acts') ?? 'pantera,grafiti,baile,grind,tt,sn').split(',');
const OUT = path.join(EV, 'actividades'); fs.mkdirSync(OUT, { recursive: true });
const N = { v: 1, estado: 'hecho', paso: '', practica: true, vistos: ['PLA-10', 'CIN-01', 'PAR', 'NMG', 'OBJ', 'PAS-01', 'PAS-03', 'PAS-05', 'PAS-07', 'FIN'], ayuda: 'no' };
const R0 = { data: {}, save() {}, fixture() {}, note() {}, invalid() {}, check() {} };   // Pilot pide un informe: uno mudo
const res = [];
/** Toque en el centro de un elemento visible. */
async function tap(page, sel) { const b = await page.evaluate((q) => { const e = document.querySelector(q); if (!e || e.closest('[hidden]')) return null; const r = e.getBoundingClientRect(); return r.width ? { x: r.left + r.width / 2, y: r.top + r.height / 2, on: document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2) === e || e.contains(document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2)) } : null; }, sel);
  if (!b) return { ok: false, why: 'no visible' }; await page.touchscreen.tap(b.x, b.y); await sleep(260); return { ok: true, alcanzable: b.on }; }
const visible = (page, sel) => page.evaluate((q) => { const e = document.querySelector(q); return !!e && !e.closest('[hidden]') && e.getBoundingClientRect().width > 0; }, sel);
const dlg = (page) => page.evaluate(() => !document.getElementById('dialog').hidden ? document.getElementById('dialog-text').textContent : null);
/** Cierra con el dedo las frases de charla que vayan saliendo (hasta `max`). */
async function vales(page, max = 8, wait = 3000) { const lines = []; for (let i = 0; i < max; i++) { const t0 = Date.now(); let t = null; while (Date.now() - t0 < wait && !(t = await dlg(page))) await sleep(120); if (!t) break; lines.push(t); await sleep(400); await tap(page, '#dialog-ok'); await sleep(300); } return lines; }
/** Toca el botón de acción si su texto encaja. */
async function act(page, re, ms = 6000) { const t0 = Date.now(); while (Date.now() - t0 < ms) { const a = await page.evaluate(() => !document.getElementById('prompt').hidden ? document.getElementById('btn-action').textContent : null); if (a && re.test(a)) { const r = await tap(page, '#btn-action'); return { label: a, ...r }; } await sleep(150); } return null; }
/** Dedo mantenido (CDP) en un punto: devuelve funciones para mover y soltar. */
async function finger(page, x, y, id = 5) { const cdp = await page.createCDPSession(); await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y, id }] });
  return { move: (nx, ny) => cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: nx, y: ny, id }] }), up: async () => { await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); await cdp.detach(); } }; }
const center = (page, sel) => page.evaluate((q) => { const r = document.querySelector(q).getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; }, sel);
const shot = (page, name) => page.screenshot({ path: path.join(OUT, `${name}.png`) }).catch(() => null);
const sum = (s) => ({ over: s.over.filter((o) => o.kind !== 'otro-otro').map((o) => `${o.a}~${o.b}`), hidden: s.hidden.map((h) => `${h.n}<${h.by}`), off: s.off.map((o) => o.n), small: s.small.map((o) => o.n), inert: s.inert.map((o) => o.n) });

const b = await launch();
try {
  for (const di of DEVS) for (const o of OS) { const D = dev(di), id = `${di}_${o}`;
    const open = async (save, q = '?bktest=1&narr=off') => { const p = await open7(b, null, D, o, { save: { ...save, settings: { iosAppAsked: true } }, query: q }); await start7(p, true); await sleep(1500); await p.touchscreen.tap(Math.round((await p.evaluate(() => innerWidth)) * 0.6), 140); await sleep(200); return p; };
    const row = (a, data) => { const r = { dev: id, act: a, ...data }; res.push(r); console.log(id, a, JSON.stringify(data).slice(0, 700)); };
    // ------------------------------------------------ NMG: La Pantera (charla clásica)
    if (ACTS.includes('pantera')) { const p = await open({ ...FRESH, narr: N });
      try { await toZone(p, 'act.pantherTalk'); await sleep(900); const a = await act(p, /HABLAR/); await sleep(500); const l0 = await dlg(p);
        const s = sum(await scan(p)); await shot(p, `${id}_pantera_charla`); const lines = await vales(p);
        row('pantera', { accion: a, primera: l0, frases: lines.length, hecha: await p.evaluate(() => window.__bk.state.p.activities.pantherTalk), layout: s });
      } catch (e) { row('pantera', { error: String(e).slice(0, 200) }); } await p.close(); }
    // ------------------------------------------------ YY: grafiti con el dedo
    if (ACTS.includes('grafiti')) { const p = await open({ ...FRESH, narr: N });
      try { await toZone(p, 'act.graffiti'); await p.waitForFunction(() => window.__bk.npcs.get('rana')?.[0]?.actions.has('Dance'), { timeout: 40000 }).catch(() => {}); await sleep(600);
        const a = await act(p, /HABLAR|PINTAR/, 8000); const lines = await vales(p, 6);
        await p.waitForFunction(() => document.getElementById('graffiti-canvas').dataset.ready === '1', { timeout: 15000 }).catch(() => {});
        const lay = await p.evaluate(() => { const w = document.getElementById('graffiti-wrap').getBoundingClientRect(), x = document.getElementById('graffiti-exit').getBoundingClientRect(); return { lienzo: [Math.round(w.left), Math.round(w.top), Math.round(w.width), Math.round(w.height)], dentro: w.left >= 0 && w.top >= 0 && w.right <= innerWidth && w.bottom <= innerHeight, salir: [Math.round(x.left), Math.round(x.top), Math.round(x.width), Math.round(x.height)] }; });
        const s = sum(await scan(p)); await shot(p, `${id}_grafiti`);
        const strokes = await maskStrokes(p); await touchStrokes(p, strokes); await sleep(1200);
        const pct = await p.evaluate(() => document.getElementById('graffiti-pct')?.textContent); const fin = await vales(p, 3, 8000);
        row('grafiti', { accion: a, frases: lines.length, lay, pct, fin, hecha: await p.evaluate(() => window.__bk.state.p.activities.graffiti), layout: s });
      } catch (e) { row('grafiti', { error: String(e).slice(0, 200) }); } await p.close(); }
    // ------------------------------------------------ FG: baile con la cruceta táctil
    if (ACTS.includes('baile')) { const p = await open({ ...FRESH, narr: N });
      try { await toZone(p, 'act.danceCombo'); await sleep(1200);
        let a = await act(p, /BAILAR/, 5000);
        if (!a) { const P = new Pilot(p, R0); await P.buildNav(); const F = await p.evaluate(() => { const S = window.__bk.park.sector('fashion_girl'); return null; }); void F; }
        const reto = await vales(p, 2, 4000);
        const rounds = []; const sOpen = sum(await scan(p)); await shot(p, `${id}_baile`);
        for (let r = 0; r < 3; r++) {
          await p.waitForFunction((r) => document.getElementById('dance-round')?.textContent === String(r + 1) && !document.getElementById('dance-timer').classList.contains('frozen') && document.querySelectorAll('#dance-seq span').length >= 3, { timeout: 20000 }, r).catch(() => {});
          const seq = await p.evaluate(() => [...document.querySelectorAll('#dance-seq span')].map((s) => s.getAttribute('aria-label')));
          const taps = []; for (const k of seq) { taps.push(await tap(p, `#dance-pad [data-k=${k}]`)); await sleep(180); } rounds.push({ seq, alcanzables: taps.every((t) => t.alcanzable) }); await sleep(600); }
        await p.waitForFunction(() => window.__bk.state.p.activities.danceCombo, { timeout: 20000 }).catch(() => {});
        const fin = await vales(p, 3, 8000);
        row('baile', { accion: a, reto, rounds, hecha: await p.evaluate(() => window.__bk.state.p.activities.danceCombo), layout: sOpen });
      } catch (e) { row('baile', { error: String(e).slice(0, 200) }); } await p.close(); }
    // ------------------------------------------------ NVDA: grind con ◀ ▶ y AGACHARSE
    if (ACTS.includes('grind')) { const p = await open({ ...FRESH, narr: N });
      try { await toZone(p, 'act.skateTutorial'); await sleep(1000);
        const a = await act(p, /HABLAR/, 6000); const lines = await vales(p, 8); const e = await act(p, /EMPEZAR|REPETIR/, 6000);
        await sleep(1200); const sGr = sum(await scan(p)); await shot(p, `${id}_grind`);
        const L = await center(p, '#btn-lean-l'), Rr = await center(p, '#btn-lean-r'), C = await center(p, '#btn-crouch');
        let held = null, fg = null, ch = false; const t0 = Date.now(), log = { maxLean: 0, holds: 0 };
        while (Date.now() - t0 < 45000) { const s = await nvState(p); log.maxLean = Math.max(log.maxLean, Math.abs(s.lean ?? 0));
          if (s.phase !== 'ride' && s.phase !== 'mount') { if (s.phase === 'exit') { await sleep(40); continue; } break; }
          const pred = (s.lean ?? 0) + (s.leanV ?? 0) * 0.18, want = pred > 0.03 ? 'L' : pred < -0.03 ? 'R' : null;
          if (want !== held) { if (fg) { await fg.up(); fg = null; } held = want; if (want) { const q = want === 'L' ? L : Rr; fg = await finger(p, q.x, q.y, 9); log.holds++; } }
          if (s.warned && !ch) { ch = true; await p.touchscreen.tap(C.x, C.y); }
          await sleep(25); }
        if (fg) await fg.up();
        const fin = await vales(p, 3, 6000); const st = await nvState(p);
        row('grind', { hablar: a, frases: lines.length, empezar: e, log, fases: st.phase, fallos: st.fails, hecha: st.done, fin, layout: sGr });
      } catch (e) { row('grind', { error: String(e).slice(0, 200) }); } await p.close(); }
    // ------------------------------------------------ TT: Aissa y Juseph en la limo
    if (ACTS.includes('tt')) { const p = await open({ ...FRESH, narr: N });
      try { await toZone(p, 'act.bridgeTalk'); await sleep(1000); const a = await act(p, /HABLAR/, 6000); await sleep(400); const s = sum(await scan(p)); await shot(p, `${id}_tt_charla`); const lines = await vales(p, 10);
        row('tt', { accion: a, frases: lines.length, ultima: lines.at(-1), hecha: await p.evaluate(() => window.__bk.state.p.activities.bridgeTalk), layout: s });
      } catch (e) { row('tt', { error: String(e).slice(0, 200) }); } await p.close(); }
    // ------------------------------------------------ SECRETNOVIO: TREPAR, ¡BAJAR!, SALTO, círculos y pantalla final
    if (ACTS.includes('sn')) { const p = await open({ ...SAVE_20, revealSeen: true, narr: N });
      try { const P = new Pilot(p, R0); await P.buildNav();
        await p.evaluate(() => { const g = window.__bk, a = g.manifest.get('sn.retry'); g.input.clear(); g.skater.teleport(a.pos.clone(), a.heading, 'walk'); g.rig.snapBehind(g.skater); }); await sleep(600);
        const F = await snFrame(p); await P.walkTo(F.W(5.65, -12.7), { tol: 0.35, maxMs: 20000 }); await p.touchscreen.tap(300, 140); await sleep(300);
        const trepar = await act(p, /TREPAR/, 4000); await sleep(400);
        const z = await p.evaluate(() => { const r = document.getElementById('stick-zone').getBoundingClientRect(); return { x: r.left + Math.min(r.width * 0.5, 70), y: r.top + r.height * 0.8 }; });
        const fg = await finger(p, z.x, z.y, 4); for (let i = 1; i <= 6; i++) { await fg.move(z.x, z.y - i * 10); await sleep(16); }
        const t0 = Date.now(); let s = await snState(p), maxY = 0; while (Date.now() - t0 < 25000) { s = await snState(p); maxY = Math.max(maxY, s.foot[1]); if (s.ladder === 'off' && s.foot[1] > 6.5) break; await sleep(80); } await fg.up(); await sleep(400);
        await P.follow([F.W(1.5, -12.6), F.W(0, -12.5)], { tol: 0.35, maxMs: 12000 }); await p.touchscreen.tap(300, 140); await sleep(300);
        const sTop = sum(await scan(p)); await shot(p, `${id}_sn_arriba`);
        const bajar = await act(p, /BAJAR/, 4000); const log = { jumped: false, circles: [], shots: 0 };
        const t1 = Date.now();
        while (Date.now() - t1 < 30000) { s = await snState(p);
          if (s.hot && !log.jumped) { log.jumped = true; log.jump = await tap(p, '#btn-jump'); }
          if (s.circle && s.circle.p >= 0.88 && s.circle.p <= 1.12 && !log.circles.some((c) => c.i === s.circle.i && c.m === s.circle.misses)) { if (log.shots < 1) { log.shots++; const sc = sum(await scan(p)); log.layoutCirculo = sc; await shot(p, `${id}_sn_circulo`); } const t = await tap(p, '#hit-circle .hc-core'); log.circles.push({ i: s.circle.i, m: s.circle.misses, ...t }); }
          if (s.mode === 'preview' || s.done || (s.phase === 'idle' && Date.now() - t1 > 2500)) break; await sleep(s.circle ? 10 : 30); }
        await sleep(2500); const end = await snState(p);
        // escena final: SALTAR con el dedo (AM-03), si no sigue, Escape; luego la pantalla final
        let saltar = null; if (end.mode === 'preview') { await sleep(3000); saltar = await tap(p, '#btn-cine-skip'); await sleep(1500); saltar.sigue = await p.evaluate(() => window.__bk.mode === 'preview'); if (saltar.sigue) await p.keyboard.press('Escape'); }
        await sleep(3000); const fin = await visible(p, '#final'); let sFin = null; if (fin) { sFin = sum(await scan(p)); await shot(p, `${id}_final`); }
        const volver = fin ? await tap(p, '#btn-close-final') : null; await sleep(800);
        row('sn', { trepar, maxY, bajar, log: { jumped: log.jumped, jump: log.jump, circles: log.circles }, hecho: end.done, prueba: end.proof, saltar, pantallaFinal: fin, volver, modo: await p.evaluate(() => window.__bk.mode), layoutArriba: sTop, layoutCirculo: log.layoutCirculo, layoutFinal: sFin });
      } catch (e) { row('sn', { error: String(e).slice(0, 300) }); } await p.close(); }
  }
} finally { await b.close(); }
saveJson(path.join(OUT, 'actividades.json'), res);
process.exit(0);
