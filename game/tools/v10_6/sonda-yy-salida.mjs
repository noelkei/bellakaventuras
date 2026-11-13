// V10.6 · sonda (no es guardián): tramo de campaign-v8 que falla a ratos: desde la rana de YY (grafiti hecho) andar con el piloto hasta la cassette
// de NVDA. N intentos por build; apunta si llega y dónde se queda (y < -1 = dentro del vaso).
import { Report, runTest, launch, sleep, arg, SAVE_20 } from '../v8/lib.mjs';
import { openGame, clickStart } from '../v4/lib.mjs';
import { Pilot } from '../v4/pilot.mjs';
import { N, TODO_VISTO } from '../it8/lib8.mjs';
const R = new Report('v106-sonda-yy-salida', { task: arg('task', 'V10-6') });
const NV = +arg('n', '5');
const S = { ...SAVE_20, collected: SAVE_20.collected.filter((x) => !x.startsWith('nosvamosdeaqui') && x !== 'yinyang.activity'), activities: { ...SAVE_20.activities, skateTutorial: false }, finalDone: false, finalProof: null, revealSeen: false, settings: { iosAppAsked: true }, narr: N(TODO_VISTO.filter((x) => !/^(PAS-0[3-8]|FIN)$/.test(x))) };
await runTest(R, async () => { const b = await launch(); const res = [];
  try { for (let k = 0; k < NV; k++) { const page = await openGame(b, R, { save: S, query: '?bktest=1' }); await clickStart(page); await sleep(2000);
      const P = new Pilot(page, R); await P.buildNav({ cars: true });
      const { gz, cas } = await page.evaluate(() => { const g = window.__bk, z = g.park.zones.get('act.graffiti'), c = g.manifest.cassettes.find((x) => x.zone === 'nosvamosdeaqui').pos; return { gz: [z.pos.x, z.pos.y, z.pos.z], cas: [c.x, c.y, c.z] }; });
      await page.evaluate((p) => { const g = window.__bk, T = window.__bkTHREE, RA = window.__bkRapier, s = g.skater; const h = g.world.castRay(new RA.Ray({ x: p[0], y: p[1] + 3, z: p[2] }, { x: 0, y: -1, z: 0 }), 6, true, RA.QueryFilterFlags.EXCLUDE_SENSORS, undefined, s.collider);
        s.teleport(new T.Vector3(p[0], (h ? p[1] + 3 - h.timeOfImpact : p[1]) + 0.05, p[2]), 0, 'walk'); g.rig.snapBehind(s); }, gz); await sleep(800);
      const r = await P.walkTo([cas[0] + 1.2, cas[2] + 1.2], { tol: 0.8 });
      const fin = await page.evaluate(() => { const g = window.__bk, s = g.skater; return { y: +s.footPos.y.toFixed(2), zona: g.zone, p: s.footPos.toArray().map((v) => +v.toFixed(1)) }; });
      res.push({ k, why: r?.why, ...fin }); await page.close(); }
    R.note(res); const ok = res.filter((x) => x.zona === 'nosvamosdeaqui').length; R.measure('llegan', `${ok}/${NV}`); R.check(true, `sonda: llegan ${ok}/${NV}`, 'unit', res);
  } finally { await b.close(); } }, { timeoutMs: 1500000 });
