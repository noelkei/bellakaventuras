// V10.6 · sonda (no es guardián): último tramo de campaign-v8 (19/20 con el grafiti hecho → andar desde la valla del centro hasta el premio de
// YINYANG) en la build dada, con el estado del juego cada segundo, para aislar por qué en la V10.6 no se recoge (en la r3 sí).
import { Report, runTest, launch, sleep, arg, SAVE_20 } from '../v8/lib.mjs';
import { openGame, clickStart } from '../v4/lib.mjs';
import { Pilot } from '../v4/pilot.mjs';
import { N, TODO_VISTO } from '../it8/lib8.mjs';
const R = new Report('v106-sonda-yy-premio', { task: arg('task', 'V10-6') });
const S19 = { ...SAVE_20, collected: SAVE_20.collected.filter((x) => x !== 'yinyang.activity'), finalDone: false, finalProof: null, revealSeen: false, settings: { iosAppAsked: true }, narr: N(TODO_VISTO.filter((x) => x !== 'FIN')) };
await runTest(R, async () => { const b = await launch();
  try { const page = await openGame(b, R, { save: S19, query: '?bktest=1' }); await clickStart(page); await sleep(2000);
    const P = new Pilot(page, R); await P.buildNav({ cars: true });
    const f = await page.evaluate(() => window.__bk.manifest.fries.find((x) => x.id === 'yinyang.activity').pos.toArray());
    await page.evaluate(() => { const g = window.__bk, T = window.__bkTHREE; g.skater.teleport(new T.Vector3(-16.5, 0.05, 16.5), 0, 'walk'); g.rig.snapBehind(g.skater); }); await sleep(800);
    const serie = []; const tick = setInterval(async () => { try { serie.push(await page.evaluate(() => { const g = window.__bk, s = g.skater; return { t: Math.round(performance.now() / 100) / 10, mode: g.mode, paused: g.paused, world: g.input.world, modal: g.input.modal, p: s.footPos.toArray().map((v) => +v.toFixed(2)), loco: s.loco, frozen: s.frozen, narr: g.narr.busy, act: g.narr.actual, d2: !document.getElementById('d2').hidden, dlg: !document.getElementById('dialog').hidden }; })); } catch { /* */ } }, 1000);
    const r = await P.walkTo([f[0], f[2]], { tol: 0.35, until: async () => page.evaluate(() => window.__bk.state.p.collected.includes('yinyang.activity')), maxMs: 60000 });
    clearInterval(tick); const got = await page.evaluate(() => window.__bk.state.p.collected.includes('yinyang.activity'));
    R.note({ r, got, f, ultimos: serie.slice(-12), primeros: serie.slice(0, 4) }); R.check(got, 'premio de YY recogido andando', 'input', { r: r?.why });
  } finally { await b.close(); } }, { timeoutMs: 200000 });
