// IT8 · A3 · guardián: recargar (o cerrar y volver) en los momentos que no cubren actividades-matriz, recarga-narrativa, yy-persist,
// tt-talks ni persist-matrix. Por cada caso: se lleva el juego al estado, se lee el guardado del disco, se recarga, se pulsa CONTINUAR (dedo
// en táctil) y se avanzan los 2D con su botón. Comprueba:
//  · nada de lo hecho se pierde (patatas, actividades, finalDone, revealSeen, frases vistas del recorrido);
//  · en ≤ 40 s el juego queda limpio (explorando, sin capas) y ANMI anda; aparece con suelo debajo y fuera del centro si sigue cerrado;
//  · lo que quedó a medias del recorrido se vuelve a ofrecer y se termina (FIN tras la revelación, la pregunta del modo ayuda, la despedida).
// Casos: patata (recargar justo al recogerla), sn-trepando, sn-bajada, sn-vuelo (reto final en la escalera, bajando, en el vuelo a cámara
// lenta), fin-antes (FIN-01 en pantalla, antes de la revelación), fin-despues (revelación vista, antes de FIN-04), modo (pregunta del modo
// ayuda en pantalla), escena (escena final en marcha), des (despedida tras la escena final).
// Uso: node tools/it8/recarga-todo.mjs --url <build> [--casos a,b] [--aparatos pc720:h,ip14:h]
import { Report, runTest, launch, sleep, arg, SAVE_20 } from '../v8/lib.mjs';
import { snRun } from '../v10/sn-lib.mjs';
import { open8, start8, dev, S0, S20, S20F, N, BASE_VISTOS, TODO_VISTO, collectFry, cleanState, walks, drainUI, disk, reload8, saveJson } from './lib8.mjs';
const R = new Report('it8-recarga-todo', { task: arg('task', 'IT8') });
const CASOS = (arg('casos') ?? 'patata,sn-trepando,sn-bajada,sn-vuelo,fin-antes,fin-despues,modo,escena,des').split(',');
const APARATOS = (arg('aparatos') ?? 'pc720:h,ip14:h').split(',').map((s) => s.split(':'));
const SOLO_PC = new Set(['sn-trepando', 'sn-bajada']);   // en el móvil solo los que cambian con el dedo (CONTINUAR, 2D)
const IDS19 = SAVE_20.collected.filter((x) => x !== 'fashion_girl.hidden');
const S19 = { ...SAVE_20, collected: IDS19, finalDone: false, finalProof: null, revealSeen: false, settings: { iosAppAsked: true }, narr: N(TODO_VISTO.filter((x) => x !== 'FIN')) };
const narr = (page) => page.evaluate(() => { const g = window.__bk, n = g.state.p.narr, d = document.getElementById('d2'); return { estado: n.estado, vistos: n.vistos.slice(), ayuda: n.ayuda, busy: g.narr.busy, d2: d && !d.hidden ? d.querySelector('.d2-text').textContent.slice(0, 50) : null, mode: g.mode, reveal: g.state.p.revealSeen }; });
async function until(page, fn, ms, ...a) { const t0 = Date.now(); while (Date.now() - t0 < ms) { let v; try { v = await page.evaluate(fn, ...a); } catch { v = null; } if (v) return v; await sleep(150); } return null; }
/** Página «abortable»: tras abort(), cualquier evaluate/teclado del piloto lanza (para cortar snRun al recargar). */
function abortable(page) { let ab = false; const p = new Proxy(page, { get(t, k) { if (ab && ['evaluate', 'keyboard', 'mouse'].includes(k)) throw new Error('abortado por recarga'); const v = t[k]; return typeof v === 'function' ? v.bind(t) : v; } }); return { p, abort: () => { ab = true; } }; }
async function snUntil(page, phases) {
  const { p, abort } = abortable(page); const run = snRun(p, R, { jump: 'hot', circles: 'none' }).catch((e) => ({ err: String(e.message) }));
  const hit = await until(page, (ph) => { const a = window.__bk.activities.find((x) => x.id === 'secretJump'); return a && ph.includes(a.phase) ? a.phase : null; }, 60000, phases);
  abort(); for (const k of ['KeyW', 'KeyE', 'Space']) await page.keyboard.up(k).catch(() => {});
  return { hit, run };
}
const CASE = {
  patata: { save: S0, prep: async (page) => { const id = 'no_me_guillo.visible'; const c = await collectFry(page, id, 2500); return { ok: c.got, nota: c, espera: { collected: [id] } }; } },
  'sn-trepando': { save: S20, prep: async (page) => { const { p, abort } = abortable(page); void snRun(p, R, { jump: 'hot', circles: 'none' }).catch(() => {});
    const hit = await until(page, () => { const g = window.__bk, l = g.activities.find((x) => x.id === 'ladderClimb'); return l && l.busy && g.skater.footPos.y > 2 ? +g.skater.footPos.y.toFixed(2) : null; }, 40000);
    abort(); for (const k of ['KeyW', 'KeyE']) await page.keyboard.up(k).catch(() => {}); await sleep(500); return { ok: !!hit, nota: hit }; } },
  'sn-bajada': { save: S20, prep: async (page) => { const r = await snUntil(page, ['down', 'ride', 'edge']); await sleep(300); return { ok: !!r.hit, nota: r.hit }; } },
  'sn-vuelo': { save: S20, prep: async (page) => { const r = await snUntil(page, ['flight']); await sleep(600); return { ok: !!r.hit, nota: r.hit }; } },
  'fin-antes': { save: S19, query: '?bktest=1', prep: async (page) => { await collectFry(page, 'fashion_girl.hidden', 2500); const d = await until(page, () => { const d = document.getElementById('d2'); return d && !d.hidden && !window.__bk.state.p.revealSeen ? d.querySelector('.d2-text').textContent.slice(0, 50) : null; }, 15000); return { ok: !!d, nota: d }; },
    final: (n) => n.vistos.includes('FIN') && n.reveal },
  'fin-despues': { save: S19, query: '?bktest=1', prep: async (page) => {
      await collectFry(page, 'fashion_girl.hidden', 2500);
      const t0 = Date.now(); let ok = false;
      while (Date.now() - t0 < 90000) { const n = await narr(page); if (n.reveal && !n.vistos.includes('FIN')) { ok = true; break; } if (n.d2) { await sleep(450); await page.keyboard.press('KeyE'); } await sleep(300); }
      await sleep(1500); return { ok, nota: await narr(page) }; },
    final: (n) => n.vistos.includes('FIN') },
  modo: { save: { ...S0, collected: ['no_me_guillo.visible'], narr: { v: 1, estado: 'antigua', paso: '', practica: false, vistos: [], ayuda: null } }, query: '?bktest=1',
    prep: async (page) => { const d = await until(page, () => { const d = document.getElementById('d2'); return d && !d.hidden && d.querySelectorAll('.d2-row .d2-btn:not(.d2-skip)').length >= 2 ? d.querySelector('.d2-text').textContent.slice(0, 50) : null; }, 25000, null);
      if (!d) { const d1 = await until(page, () => { const d = document.getElementById('d2'); return d && !d.hidden; }, 5000); if (d1) { await sleep(450); await page.keyboard.press('KeyE'); } }
      const q = d ?? await until(page, () => { const d = document.getElementById('d2'); return d && !d.hidden && d.querySelectorAll('.d2-row .d2-btn:not(.d2-skip)').length >= 2 ? d.querySelector('.d2-text').textContent.slice(0, 50) : null; }, 15000);
      return { ok: !!q, nota: q }; },
    final: (n) => n.ayuda !== null },
  escena: { save: { ...S20F }, query: '?bktest=1', prep: async (page) => { await page.evaluate(async () => { await window.__bk.loadSnCast?.(); window.__bk.showPreview(); }); const m = await until(page, () => window.__bk.mode === 'preview', 8000); await sleep(4000); return { ok: !!m, nota: await page.evaluate(() => window.__bk.mode) }; } },
  des: { save: { ...S20F, narr: N(TODO_VISTO) }, query: '?bktest=1', prep: async (page) => {
      await page.evaluate(async () => { await window.__bk.loadSnCast?.(); window.__bk.showPreview(); }); await until(page, () => window.__bk.mode === 'preview', 8000); await sleep(2500);
      await page.evaluate(() => { const b = document.getElementById('btn-cine-skip'); if (b && !b.hidden) b.click(); else window.__bk.closePreview(); });
      const d = await until(page, () => { const d = document.getElementById('d2'); return d && !d.hidden ? d.querySelector('.d2-text').textContent.slice(0, 50) : null; }, 15000);
      return { ok: !!d, nota: d }; },
    final: (n) => n.vistos.includes('DES') },
};
const progreso = (p) => ({ collected: [...(p?.collected ?? [])].sort(), activities: Object.entries(p?.activities ?? {}).filter(([, v]) => v).map(([k]) => k).sort(), finalDone: !!p?.finalDone, revealSeen: !!p?.revealSeen, vistos: [...(p?.narr?.vistos ?? [])] });
const perdido = (a, b) => ({ patatas: a.collected.filter((x) => !b.collected.includes(x)), actividades: a.activities.filter((x) => !b.activities.includes(x)), finalDone: a.finalDone && !b.finalDone, revealSeen: a.revealSeen && !b.revealSeen, vistos: a.vistos.filter((x) => !b.vistos.includes(x)) });
const suelo = (page) => page.evaluate(() => { const g = window.__bk, s = g.skater, RA = window.__bkRapier, f = s.footPos;
  const h = g.world.castRay(new RA.Ray({ x: f.x, y: f.y + 0.6, z: f.z }, { x: 0, y: -1, z: 0 }), 3, true, RA.QueryFilterFlags.EXCLUDE_SENSORS, undefined, s.collider);
  const r = Math.hypot(f.x, f.z), cerrado = !(g.state.centerUnlocked && g.state.p.revealSeen);
  return { y: +f.y.toFixed(2), sueloA: h ? +(h.timeOfImpact - 0.6).toFixed(2) : null, r: +r.toFixed(2), cerrado, dentroCerrado: cerrado && r < 22 }; });

await runTest(R, async () => {
  const b = await launch(); const filas = [];
  try {
    for (const [di, o] of APARATOS) for (const caso of CASOS) {
      const d = dev(di), touch = d.kind !== 'desktop', C = CASE[caso]; if (!C) continue; if (touch && SOLO_PC.has(caso)) continue;
      const errors = [], tag = `${caso} · ${di} ${o}`;
      const page = await open8(b, R, d, o, { save: C.save, query: C.query ?? '?bktest=1&narr=off', errors });
      await start8(page, touch); await sleep(1500);
      if (C.query === '?bktest=1' && caso !== 'modo') await drainUI(page, touch, 8000);
      const pr = await C.prep(page);
      if (!pr.ok) { R.invalid(`${tag}: no se llegó al estado pedido`, pr.nota); filas.push({ caso, aparato: `${di} ${o}`, invalido: pr.nota }); await page.close(); continue; }
      const antes = progreso(await disk(page)); const nAntes = await narr(page);
      await reload8(page); await start8(page, touch);
      const fin = await drainUI(page, touch, 40000);
      const nDesp = await narr(page);
      // lo pendiente del recorrido: se sigue avanzando el 2D hasta 60 s más si hay algo en marcha
      let final = null; if (C.final) { const t0 = Date.now(); while (Date.now() - t0 < 60000) { const n = await narr(page); if (C.final(n)) { final = n; break; } await drainUI(page, touch, 3000); } }
      const despues = progreso(await disk(page)), lost = perdido(antes, despues), sl = await suelo(page), st = await cleanState(page), w = st.ok ? await walks(page) : null;
      const fila = { caso, aparato: `${di} ${o}`, prep: pr.nota, antes: { n: antes.collected.length, act: antes.activities.length, finalDone: antes.finalDone, reveal: antes.revealSeen, narr: nAntes }, despues: { narr: nDesp, limpio: st, suelo: sl, anda: w }, perdido: lost, finalPendiente: C.final ? !!final : null, errores: errors.slice(0, 4) };
      filas.push(fila);
      const nada = !lost.patatas.length && !lost.actividades.length && !lost.finalDone && !lost.revealSeen && !lost.vistos.length;
      R.check(nada, `${tag}: al recargar no se pierde nada (patatas, actividades, final, frases vistas)`, 'input', lost);
      R.check(fin?.ok && w > 0.5, `${tag}: en ≤ 40 s queda limpio y ANMI anda (${w} m)`, 'input', st);
      R.check(sl.sueloA !== null && Math.abs(sl.sueloA) < 0.35 && !sl.dentroCerrado && sl.y > -1, `${tag}: aparece con suelo debajo y fuera del centro cerrado`, 'input', sl);
      if (C.final) R.check(!!final, `${tag}: lo que quedó a medias del recorrido se vuelve a ofrecer y se termina`, 'input', { antes: nAntes.vistos.slice(-4), despues: (await narr(page)).vistos.slice(-4), reveal: nDesp.reveal, ayuda: nDesp.ayuda });
      R.check(!errors.length, `${tag}: sin errores`, 'emulation', errors.slice(0, 4));
      await page.close();
    }
    saveJson('A3-recarga-todo/resultado.json', filas);
  } finally { await b.close(); }
}, { timeoutMs: 3600000 });
