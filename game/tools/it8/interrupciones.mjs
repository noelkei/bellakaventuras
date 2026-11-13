// IT8 · B1 · guardián: interrupciones en cada estado. Estados: explorar, 2D (tutorial), cinemática del parque, grind de Bellakat, baile de
// FASHION GIRL, grafiti de YINYANG, reto de SN en el vuelo (cámara lenta), escena final, pausa abierta, ajustes abiertos. Sucesos: ocultar la
// pestaña 4 s (otra app, pantalla bloqueada), perder el foco 3 s, girar el móvil (v→h→v), perder el contexto gráfico, desconectar el mando.
// Comprueba, con el estado de antes y de después:
//  · mientras dura: el juego no avanza (reloj de simulación quieto ≤ 0,1 s; en la escena final, el audio suspendido);
//  · al volver: lo de arriba recibe el toque (la pausa, si se pausó; el 2D / la capa abierta, si no) y, al pulsar «Seguir», se sigue donde
//    estaba (misma actividad en marcha, misma frase, misma cinemática) y el reloj vuelve a correr; el audio vuelve a «running»;
//  · contexto perdido: «Se ha perdido la imagen» queda encima de todo; mando desconectado: pausa y aviso «Mando desconectado».
// Uso: node tools/it8/interrupciones.mjs --url <build> [--estados a,b] [--sucesos oculta,foco,giro,contexto,mando] [--aparatos ip14:v,pc720:h]
import { Report, runTest, launch, sleep, arg, flag } from '../v8/lib.mjs';
import { snRun } from '../v10/sn-lib.mjs';
import { open8, start8, dev, S0, S20, S20F, N, BASE_VISTOS, onTop, until, snUntil, toAct, actBusy, hideShow, blurFocus, tapOrClick, pad, PAD, saveJson } from './lib8.mjs';
import { rotate } from '../v10_5/lib105.mjs';
import { FRESH } from '../v10_2/lib102.mjs';
const R = new Report('it8-interrupciones', { task: arg('task', 'IT8') });
const ESTADOS = (arg('estados') ?? 'explorar,d2,cine,grind,baile,grafiti,sn-vuelo,escena,pausa,ajustes').split(',');
const SUCESOS = (arg('sucesos') ?? 'oculta,foco,giro,contexto,mando').split(',');
const APARATOS = (arg('aparatos') ?? 'ip14:v,pc720:h').split(',').map((s) => s.split(':'));
const S_YY = { ...S0, partials: { tutorialStep: 0, tutorialStarted: false, bridgeRest: -1, graffitiMask: null, graffitiCheck: 0, danceRounds: 0, graffitiIntro: true } };
const snap = (page) => page.evaluate(() => { const g = window.__bk, d = document.getElementById('d2');
  const busy = g.activities.filter((a) => a.busy || a.seated || a.inAttempt || a.inRun || a.dancing >= 0).map((a) => a.id + (a.phase ? ':' + a.phase : ''));
  const open = ['pause', 'settings', 'help', 'glost', 'final', 'dance', 'graffiti', 'grind-hud', 'dialog'].filter((id) => document.getElementById(id) && !document.getElementById(id).hidden);
  return { mode: g.mode, paused: g.paused, sim: +g.sim.now.toFixed(3), d2: d && !d.hidden ? d.querySelector('.d2-text').textContent.slice(0, 40) : null, cine: !!g.narr?.inCine, busy, open, audio: g.audio?.ctx?.state ?? null, src: g.input.source }; });
/** Preparación de cada estado; devuelve { ok, sel } (sel = lo que tiene que recibir el toque si el juego NO se pausa). */
const PREP = {
  explorar: { save: S20, prep: async () => ({ ok: true }) },
  d2: { save: { ...FRESH, settings: { iosAppAsked: true } }, query: '?bktest=1', prep: async (p) => ({ ok: !!(await until(p, () => { const d = document.getElementById('d2'); return d && !d.hidden; }, 15000)), sel: '#d2 .d2-btn.primary' }) },
  cine: { save: { ...FRESH, settings: { iosAppAsked: true } }, query: '?bktest=1', prep: async (p) => {
    await until(p, () => { const d = document.getElementById('d2'); return d && !d.hidden; }, 15000); await sleep(600); await p.keyboard.press('KeyT');
    const t0 = Date.now(); while (Date.now() - t0 < 60000) { if (await p.evaluate(() => window.__bk.narr.inCine)) break; const d = await p.evaluate(() => { const d = document.getElementById('d2'); return d && !d.hidden; }); if (d) { await sleep(450); await p.keyboard.press('KeyE'); } await sleep(250); }
    await sleep(2500); return { ok: await p.evaluate(() => window.__bk.narr.inCine), sel: '#btn-cine-skip' }; } },
  grind: { save: S20, prep: async (p) => { await toAct(p, 'act.skateTutorial'); await sleep(800); await p.keyboard.press('KeyE'); await sleep(1500); return { ok: await actBusy(p, 'skateTutorial') }; } },
  baile: { save: S20, prep: async (p) => { await toAct(p, 'act.danceCombo'); await sleep(800); await p.keyboard.press('KeyE'); await sleep(1200);
    for (let i = 0; i < 3 && await p.evaluate(() => !document.getElementById('dialog').hidden); i++) { await p.keyboard.press('KeyE'); await sleep(500); }
    await until(p, () => window.__bk.activities.find((a) => a.id === 'danceCombo').timer, 8000); return { ok: await actBusy(p, 'danceCombo'), sel: '#dance-pad button' }; } },
  grafiti: { save: S_YY, prep: async (p) => { await p.evaluate(async () => { await window.__bk.loadNpc('rana'); }); await toAct(p, 'act.graffiti'); await sleep(1500); await p.keyboard.press('KeyE'); await sleep(1500);
    return { ok: await actBusy(p, 'graffiti'), sel: '#graffiti-exit' }; } },
  'sn-vuelo': { save: S20, prep: async (p) => { const r = await snUntil(p, R, ['flight'], snRun); await sleep(500); return { ok: !!r.hit }; } },
  escena: { save: S20F, prep: async (p) => { await p.evaluate(async () => { await window.__bk.loadSnCast?.(); window.__bk.showPreview(); }); const ok = await until(p, () => window.__bk.mode === 'preview', 8000); await sleep(3000); return { ok: !!ok, preview: true }; } },
  pausa: { save: S20, prep: async (p, touch) => { if (touch) await tapOrClick(p, '#btn-pause', true); else await p.keyboard.press('Escape'); await sleep(700); return { ok: await p.evaluate(() => window.__bk.paused), sel: '#btn-resume' }; } },
  ajustes: { save: S20, prep: async (p, touch) => { if (touch) await tapOrClick(p, '#btn-pause', true); else await p.keyboard.press('Escape'); await sleep(600); await tapOrClick(p, '#btn-settings', touch); await sleep(700);
    return { ok: await p.evaluate(() => !document.getElementById('settings').hidden), sel: '#btn-settings-close' }; } },
};
await runTest(R, async () => {
  const b = await launch(); const filas = [];
  try {
    for (const [di, o] of APARATOS) for (const est of ESTADOS) for (const suc of SUCESOS) {
      const d = dev(di), touch = d.kind !== 'desktop';
      if (suc === 'giro' && !touch) continue; if (suc === 'mando' && (touch || !['explorar', 'grind', 'baile', 'sn-vuelo'].includes(est))) continue;
      const P = PREP[est], errors = [], tag = `${est} · ${suc} · ${di} ${o}`;
      const page = await open8(b, R, d, o, { save: P.save, query: P.query ?? '?bktest=1&narr=off', errors });
      try {
        await start8(page, touch); await sleep(1400);
        if (suc === 'mando') await pad(page, { buttons: { 0: 0 } });
        const pr = await P.prep(page, touch);
        if (!pr.ok) { R.invalid(`${tag}: no se llegó al estado`, pr); filas.push({ tag, invalido: true }); continue; }
        if (suc === 'mando') { await pad(page, { axes: [0, -0.6, 0, 0] }); await sleep(250); await pad(page, { axes: [0, 0, 0, 0] }); }
        const a = await snap(page); let mid = null, b2 = null;
        if (suc === 'oculta') mid = await hideShow(page, 4000, () => snap(page));
        else if (suc === 'foco') mid = await blurFocus(page, 3000, () => snap(page));
        else if (suc === 'giro') { await rotate(page, d, 'h'); await sleep(1500); mid = await snap(page); await rotate(page, d, 'v'); await sleep(1500); }
        else if (suc === 'contexto') { await page.evaluate(() => { window.__bkExpectLost = true; window.__bk.renderer.getContext().getExtension('WEBGL_lose_context')?.loseContext(); }); await sleep(1500); }
        else if (suc === 'mando') { await page.evaluate(() => { window.__bk.input.fakePad.connected = false; window.dispatchEvent(new Event('gamepaddisconnected')); }); await sleep(800); mid = await snap(page); }
        b2 = await snap(page);
        const fila = { tag, antes: a, durante: mid, despues: b2 };
        if (suc === 'contexto') {
          const g = await onTop(page, '#btn-glost'); fila.glost = g;
          R.check(g.ok, `${tag}: «Se ha perdido la imagen» queda encima de todo y su «Continuar» recibe el toque`, 'emulation', g);
          filas.push(fila); continue;
        }
        if (mid && (suc === 'oculta' || suc === 'foco') && !pr.preview && !a.paused) {
          const avanzo = +(b2.sim - a.sim).toFixed(3); fila.avanzo = avanzo;
          R.check(avanzo <= 0.1, `${tag}: mientras dura, el juego no avanza (reloj +${avanzo} s)`, 'emulation', { antes: a.sim, despues: b2.sim, durante: mid?.paused });
        }
        if (pr.preview && suc === 'oculta') R.check(mid?.audio === 'suspended' && b2.audio === 'running', `${tag}: escena final: el audio se suspende oculta y vuelve al volver`, 'emulation', { durante: mid?.audio, despues: b2.audio });
        if (suc === 'mando') R.check(b2.paused && await page.evaluate(() => /Mando desconectado/.test(document.getElementById('toast')?.textContent ?? '')), `${tag}: mando desconectado → pausa y aviso`, 'input', b2);
        // lo de arriba recibe el toque
        const sel = b2.open.includes('settings') ? '#btn-settings-close' : b2.paused ? '#btn-resume' : (pr.sel ?? null);
        if (sel) { const t = await onTop(page, sel); fila.encima = { sel, ...t }; R.check(t.ok, `${tag}: al volver, ${sel} está encima y recibe el toque`, 'emulation', t); }
        // seguir y comprobar que sigue donde estaba
        if (b2.paused && est !== 'pausa' && est !== 'ajustes') { await tapOrClick(page, '#btn-resume', touch); await sleep(1200); }
        else await sleep(1000);
        const c = await snap(page); fila.seguir = c;
        const mismo = (a.d2 ? c.d2 === a.d2 : true) && (a.cine ? c.cine : true) && a.busy.every((x) => c.busy.some((y) => y.split(':')[0] === x.split(':')[0])) && (a.mode === c.mode) && (est === 'ajustes' ? c.open.includes('settings') : true) && (est === 'pausa' ? c.paused : true);
        const corre = est === 'pausa' || est === 'ajustes' || a.d2 ? true : c.sim - b2.sim > 0.3;   // con un 2D abierto el reloj espera al jugador (diseño)
        // girar el móvil no pausa (diseño): en las actividades con tiempo o equilibrio (grind, baile, reto) el juego sigue durante el giro y
        // puede acabarse sola; se anota para el informe (decisión del usuario), no es criterio
        if (suc === 'giro' && ['grind', 'baile', 'sn-vuelo'].includes(est) && !(mismo && corre)) R.note(`${tag}: el giro no pausa y la actividad siguió sin entrada (${a.busy.join(',')} → ${c.busy.join(',') || 'nada'})`);
        else R.check(mismo && corre, `${tag}: al seguir, todo sigue donde estaba y el juego vuelve a correr`, 'input', { antes: a, despues: c });
        if (a.audio === 'running') R.check(c.audio === 'running', `${tag}: el audio vuelve a sonar`, 'listen', { antes: a.audio, despues: c.audio });
        R.check(!errors.filter((e) => !/CONTEXTO/.test(e)).length, `${tag}: sin errores`, 'emulation', errors.slice(0, 3));
        filas.push(fila);
      } finally { await page.close(); }
    }
    saveJson('B1-interrupciones/resultado.json', filas);
  } finally { await b.close(); }
}, { timeoutMs: 5400000 });
