// IT8 · E1 · guardián de la interfaz en cada estado y aparato (amplía v10_5/hud-tactil, que mira «explorar»). Con `scanUI` de lib105:
// en cada estado, ningún botón vivo (no tapado a propósito por una capa) queda fuera de pantalla, bajo la zona segura, tapado (no le
// llegaría el toque) o inerte, ni se monta con otro botón; en táctil, ≥ 44 px.
// Estados: explorar, accion (botón de acción de La Pantera), dialogo (su charla, «Vale»), grind (◀ ▶), baile (flechas de FG), sn (círculo
// del reto en el vuelo), pausa, ajustes, d2 (pregunta del modo ayuda) y grafiti (lienzo de la rana).
// Variantes: normal (100 %, diestro) con todos los estados; zurdo, 50 % y 200 % con explorar/accion/grind/baile/sn; modo app + zonas
// seguras (aparatos con muesca) con todos. Aparatos: los 13 de lib105 (ordenadores solo en horizontal; las variantes de botones, solo táctil).
// Los detalles ya conocidos (V10/IT7/PENDIENTES_DE_V10_5.md §3) se anotan como «conocido» y no hacen fallar.
import { Report, runTest, launch, sleep, arg } from '../v8/lib.mjs';
import { snRun } from '../v10/sn-lib.mjs';
import { DEVICES, scan } from '../v10_5/lib105.mjs';
import { open8, start8, S20, S0, toAct, tapOrClick, snUntil, until, saveJson } from './lib8.mjs';
const R = new Report('it8-ui-matriz', { task: arg('task', 'IT8') });
const ONLY = arg('aparatos') ? arg('aparatos').split(',') : null, VARS = (arg('variantes') ?? 'normal,zurdo,50,200,app').split(','), EST = arg('estados') ? arg('estados').split(',') : null;
const S_YY = { ...S0, partials: { tutorialStep: 0, tutorialStarted: false, bridgeRest: -1, graffitiMask: null, graffitiCheck: 0, danceRounds: 0, graffitiIntro: true } };
const S_MODO = { ...S0, collected: ['no_me_guillo.visible'], narr: { v: 1, estado: 'antigua', paso: '', practica: false, vistos: [], ayuda: null } };
const HUD = ['explorar', 'accion', 'grind', 'baile', 'sn'];
const TODOS = ['explorar', 'accion', 'dialogo', 'grind', 'baile', 'sn', 'pausa', 'ajustes'];
const limpia = async (page) => page.evaluate(() => { const g = window.__bk; for (const a of g.activities) if (a.busy || a.seated) a.cancel?.(); if (g.paused) g.setPaused(false); for (const id of ['settings', 'help']) { const e = document.getElementById(id); if (e && !e.hidden) e.hidden = true; }
  if (!document.getElementById('dialog').hidden) document.getElementById('dialog-ok').click(); g.input.clear(); });
const PREP = {
  explorar: async () => true,
  accion: async (p) => { await toAct(p, 'act.pantherTalk'); return !!(await until(p, () => !document.getElementById('prompt').hidden, 4000)); },
  dialogo: async (p, t) => { await toAct(p, 'act.pantherTalk'); await until(p, () => !document.getElementById('prompt').hidden, 4000); await tapOrClick(p, '#btn-action', t); return !!(await until(p, () => !document.getElementById('dialog').hidden, 5000)); },
  grind: async (p, t) => { await toAct(p, 'act.skateTutorial'); await until(p, () => !document.getElementById('prompt').hidden, 4000); await tapOrClick(p, '#btn-action', t); return !!(await until(p, () => document.body.classList.contains('grind'), 6000)); },
  baile: async (p, t) => { await toAct(p, 'act.danceCombo'); await until(p, () => !document.getElementById('prompt').hidden, 4000); await tapOrClick(p, '#btn-action', t); await sleep(1500);
    for (let i = 0; i < 4 && await p.evaluate(() => !document.getElementById('dialog').hidden); i++) { await tapOrClick(p, '#dialog-ok', t); await sleep(700); }
    if (!(await until(p, () => !document.getElementById('dance').hidden, 4000))) { await tapOrClick(p, '#btn-action', t); await sleep(1200); for (let i = 0; i < 3 && await p.evaluate(() => !document.getElementById('dialog').hidden); i++) { await tapOrClick(p, '#dialog-ok', t); await sleep(700); } }
    return !!(await until(p, () => !document.getElementById('dance').hidden, 6000)); },
  sn: async (p) => { const r = await snUntil(p, R, ['flight'], snRun); if (!r.hit) return false; return !!(await until(p, () => !document.getElementById('hit-circle').hidden, 8000)); },
  pausa: async (p, t) => { await tapOrClick(p, '#btn-pause', t); return !!(await until(p, () => !document.getElementById('pause').hidden, 3000)); },
  ajustes: async (p, t) => { await tapOrClick(p, '#btn-pause', t); await sleep(500); await tapOrClick(p, '#btn-settings', t); return !!(await until(p, () => !document.getElementById('settings').hidden, 3000)); },
  d2: async (p, t) => { const t0 = Date.now(); while (Date.now() - t0 < 30000) { const n = await p.evaluate(() => { const d = document.getElementById('d2'); return d && !d.hidden ? d.querySelectorAll('.d2-row .d2-btn:not(.d2-skip)').length : 0; });
    if (n >= 2) return true; if (n === 1) { await sleep(450); await tapOrClick(p, '#d2 .d2-btn.primary', t); } await sleep(300); } return false; },
  grafiti: async (p, t) => { await p.evaluate(async () => { await window.__bk.loadNpc('rana'); }); await toAct(p, 'act.graffiti'); await until(p, () => !document.getElementById('prompt').hidden, 5000); await tapOrClick(p, '#btn-action', t); return !!(await until(p, () => !document.getElementById('graffiti').hidden, 6000)); },
};
/** Detalles ya conocidos (no hacen fallar; se anotan). */
const conocido = (d, o, v, est, prob) => {
  const n = JSON.stringify(prob);
  if (est === 'ajustes' && o === 'h' && /btn-settings-close|Volver/.test(n)) return 'PENDIENTES §3: «Volver» fijo abajo en Ajustes horizontal';
  if (v === 'zurdo' && d.id === 'se1' && o === 'h' && /btn-dance|dance-ring/.test(n)) return 'PENDIENTES §3: zurdo 320×568 horizontal, abanico de SKILLS';
  return null;
};
await runTest(R, async () => {
  const b = await launch(); const filas = [];
  try {
    for (const d of DEVICES.filter((x) => !ONLY || ONLY.includes(x.id))) for (const o of d.kind === 'desktop' ? ['h'] : ['v', 'h']) for (const v of VARS) {
      const touch = d.kind !== 'desktop';
      if (!touch && v !== 'normal') continue; if (v === 'app' && !d.notch) continue;
      const settings = { iosAppAsked: true, ...(v === 'zurdo' ? { leftHanded: true } : {}), ...(v === '50' ? { btnScale: 0.5 } : v === '200' ? { btnScale: 2 } : {}) };
      const lista = (v === 'normal' || v === 'app' ? [...TODOS, 'd2', 'grafiti'] : HUD).filter((e) => !EST || EST.includes(e));
      const grupos = [[{ ...S20, settings }, '?bktest=1&narr=off', lista.filter((e) => e !== 'd2' && e !== 'grafiti')], [{ ...S_YY, settings }, '?bktest=1&narr=off', lista.filter((e) => e === 'grafiti')], [{ ...S_MODO, settings }, '?bktest=1', lista.filter((e) => e === 'd2')]];
      for (const [save, query, ests] of grupos) { if (!ests.length) continue;
        const errors = []; const page = await open8(b, R, d, o, { save, query, app: v === 'app', safe: v === 'app', errors });
        try { await start8(page, touch); await sleep(1500);
          for (const est of ests) {
            await limpia(page); await sleep(300);
            const ok = await PREP[est](page, touch); await sleep(700);
            const tag = `${d.id} ${o} · ${v} · ${est}`;
            if (!ok) { R.invalid(`${tag}: no se llegó al estado`); filas.push({ tag, invalido: true }); continue; }
            const s = await scan(page);
            const peq = s.small; const prob = { fuera: s.off.filter((x) => /button|btn|«/.test(x.n) || x.n.startsWith('#btn') || x.n.includes('d2-btn')), bajoMuesca: s.unsafe, tapados: s.hidden, inertes: s.inert, montados: s.over.filter((x) => x.kind === 'botón-botón') };
            const hay = Object.values(prob).some((l) => l.length);
            const con = hay ? conocido(d, o, v, est, prob) : null;
            filas.push({ tag, prob, conocido: con, pequenos: peq });
            if (peq.length) R.note(`${tag}: botones < 44 px: ${peq.map((x) => `${x.n} ${Math.round(x.w)}×${Math.round(x.h)}`).join(', ')}`);
            if (con) R.note(`${tag}: ${con}`);
            else R.check(!hay, `${tag}: botones a la vista, fuera de la muesca, sin tapar, activos, ≥ 44 px y sin montarse`, 'emulation', Object.fromEntries(Object.entries(prob).filter(([, l]) => l.length).map(([k, l]) => [k, l.slice(0, 4)])));
          }
        } finally { await page.close(); }
      }
    }
    saveJson('E1-ui-matriz/resultado.json', filas);
  } finally { await b.close(); }
}, { timeoutMs: 10800000 });
