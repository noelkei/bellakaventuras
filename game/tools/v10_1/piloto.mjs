// V10.1 R5 · partida piloto de las funciones nuevas, desde una partida NUEVA (0 patatas) y con entrada real de teclado (piloto asistido
// declarado: tools/v4/pilot.mjs solo lee estado y geometría y pulsa teclas; sin teletransportes en la ruta). Completa a la campaña
// (0 → 20 → reto con círculos, campaign-v8) con lo que esa ruta no usa:
//  1 · por la recta del paseo exterior CORRIENDO (W mantenida): llega a 5 m/s;
//  2 · subir a la tabla corriendo (sale con esa velocidad) y bajar en marcha a ~4 m/s (sigue corriendo);
//  3 · entrar al parque (la música entra al cruzar r 45 → 42), SKILLS → GRAFITEAR en la pared lisa de SN; recoger la patata del suelo más
//      cercana andando/corriendo (las metas del piloto se comprueban libres en su rejilla);
//  4 · sentarse en un banco del exterior; la pausa ofrece «Levantarse del banco»; «Volver a la plaza» con confirmación;
//  5 · salir del parque: la música se apaga y el aviso sale una vez; recargar: la patata y el grafiti siguen.
import { Report, runTest, launch, openGame, clickStart, sleep, fixture } from '../v8/lib.mjs';
import { Pilot } from '../v4/pilot.mjs';
const R = new Report('piloto-v10-1');
const S = (page) => page.evaluate(() => { const g = window.__bk, s = g.skater, p = s.footPos, f = g.activities.find((a) => a.id === 'freeDance'), t = document.getElementById('toast');
  return { x: +p.x.toFixed(2), z: +p.z.toFixed(2), r: +Math.hypot(p.x, p.z).toFixed(1), v: +Math.hypot(s.vel.x, s.vel.z).toFixed(2), loco: s.loco, run: s.running, mode: g.mode, paused: g.paused,
    total: g.state.total, mus: +g.musicOutside.toFixed(2), paints: f.paints, decals: f.decals.length, saved: (g.state.p.skillGraffiti ?? []).length, toast: t.hidden ? '' : t.textContent, seated: g.activities.find((a) => a.id === 'benchSit').seated }; });
await runTest(R, async () => {
  const b = await launch();
  try {
    let page = await openGame(b, R, { save: null }); await clickStart(page); await sleep(1500);
    const P = new Pilot(page, R); await P.buildNav();
    // celda libre (y sus 8 vecinas) en la rejilla del piloto: las metas no pueden caer dentro de una jardinera o un banco
    const free = (x, z) => page.evaluate((x, z) => { const { free, S, H, N } = window.__nav, i = Math.floor((x + H) / S), j = Math.floor((z + H) / S); for (let a = -1; a <= 1; a++) for (let c = -1; c <= 1; c++) if (!free[(i + a) * N + j + c]) return false; return true; }, x, z);
    const s0 = await S(page); R.measure('inicio', s0);
    R.check(s0.total === 0 && s0.r > 45 && s0.mus === 0, `partida nueva en la plaza exterior (r ${s0.r}), sin música fuera del parque`, 'input', s0);
    // ---------------------------------------------------------------- 1 · correr por la recta del paseo exterior (z −46,5, de x +30 a −28)
    let maxV = 0, ran = false;
    const r1 = await P.walkTo([28, -46.5], { tol: 0.6, maxMs: 40000, until: async () => { const q = await S(page); maxV = Math.max(maxV, q.v); ran ||= q.run; return false; } });
    const s1 = await S(page); R.measure('a_la_recta', { maxV, ran, r1: r1.why, s1 });
    R.check(r1.ok && ran && maxV >= 4.6 && maxV <= 5.2, `1 · con W mantenida corre por el paseo exterior (máx ${maxV} m/s) y llega a la recta (${r1.why})`, 'input', { maxV, ran, s1 });
    // ---------------------------------------------------------------- 2 · subir corriendo y bajar en marcha (hacia el oeste por la recta)
    await P.face(-Math.PI / 2, 0.06); await P.keys(['KeyW']); await sleep(2200);
    const pre = await S(page); await page.keyboard.press('KeyQ'); await sleep(500); const up = await S(page);
    R.check(pre.run && up.loco === 'ride' && up.v > 3.8, `2 · corriendo (${pre.v} m/s) sube a la tabla y sale rodando (${up.v} m/s)`, 'input', { pre, up });
    // en tabla, W empuja (a los 0,5 s ya pasa de 5 m/s y el juego no deja bajar, con aviso): se suelta, se frena con S hasta ~4 m/s y,
    // con W otra vez, BAJAR en marcha
    await sleep(500); await P.keys([]); for (let i = 0; i < 60 && (await S(page)).v > 4.2; i++) { await P.keys(['KeyS']); await sleep(50); }
    await P.keys(['KeyW']); await page.keyboard.press('KeyQ'); await sleep(600); const dn = await S(page); await P.release(); await sleep(1500);
    R.check(dn.loco === 'walk' && dn.v > 2.5, `2 · en marcha (W mantenida) baja de la tabla CORRIENDO (${dn.v} m/s)`, 'input', dn);
    // ---------------------------------------------------------------- 3 · grafiti y patata
    // IT8 paso 2 (cambio de diseño aprobado W04/V10.3, copia previa en V10/backups/pruebas/IT8-paso2/): la pared lisa de SN queda tras la valla del
    // centro hasta las 20 patatas; con la partida nueva se entra al parque hasta la plaza de NMG (r 30, eje 45°) y se grafitea allí (suelo liso)
    const track = []; const r3 = await P.walkTo([21.2, -21.2], { tol: 0.35, maxMs: 60000, until: async () => { track.push(await S(page)); return false; } }); await sleep(300);
    const inMus = track.filter((q) => q.r < 41.5).map((q) => q.mus), outMus = track.filter((q) => q.r > 45.2).map((q) => q.mus);
    R.check(outMus.length > 0 && outMus.every((m) => m === 0) && inMus.length > 0 && inMus.at(-1) === 1, '3 · la música entra al cruzar al parque (0 fuera de r 45, 1 dentro de r 42)', 'input', { out: outMus.slice(-3), in: inMus.slice(-3) });
    await page.keyboard.press('KeyB'); await sleep(250); await page.keyboard.press('Digit2'); await sleep(250); await page.keyboard.press('Digit4'); await sleep(3200);
    const g3 = await S(page); R.check(r3.ok && g3.paints === 1 && g3.saved === 1, `3 · SKILLS → GRAFITEAR pinta dentro del parque (plaza de NMG) tras llegar andando (${r3.why})`, 'input', g3);
    const fries = await page.evaluate(() => { const g = window.__bk, p = g.skater.footPos; return g.pickups.filter((q) => q.available && !q.collected && !/hidden/.test(q.id) && q.group.position.y < 0.9).map((q) => ({ id: q.id, x: q.group.position.x, z: q.group.position.z, d: Math.hypot(q.group.position.x - p.x, q.group.position.z - p.z) })).sort((a, b2) => a.d - b2.d); });
    let fry = null; for (const f of fries) if (await free(f.x, f.z)) { fry = f; break; }
    const rf = fry ? await P.walkTo([fry.x, fry.z], { tol: 0.4, maxMs: 60000, until: async () => (await S(page)).total >= 1 }) : { ok: false, why: 'sin patata' };
    await sleep(800); const f3 = await S(page);
    R.check(f3.total === 1, `3 · recoge la patata más cercana (${fry?.id}, ${fry?.d?.toFixed(1)} m) yendo andando/corriendo (${rf.why})`, 'input', { fry, f3 });
    // ---------------------------------------------------------------- 4 · banco del exterior, pausa y volver a la plaza
    const bench = await page.evaluate(() => { const g = window.__bk, p = g.skater.footPos; return [...g.park.zones.entries()].filter(([k]) => k.startsWith('act.benchSit.ext.')).map(([k, z]) => ({ k, x: z.pos.x, z: z.pos.z, d: Math.hypot(z.pos.x - p.x, z.pos.z - p.z) })).sort((a, b2) => a.d - b2.d)[0]; });
    const rb = await P.walkTo([bench.x, bench.z], { tol: 0.4, maxMs: 60000 }); const sat = await P.act(/SENTARSE/i, 5000); await sleep(1600);
    const b4 = await S(page);
    await page.keyboard.press('Escape'); await sleep(400);
    const exitTxt = await page.evaluate(() => { const e = document.getElementById('btn-exit-act'); return e.hidden ? '' : e.textContent; });
    R.check(rb.ok && sat && b4.seated && /Levantarse/i.test(exitTxt), `4 · se sienta en el banco del exterior (${bench.k}) y la pausa ofrece «${exitTxt}»`, 'input', { bench, b4, exitTxt });
    await page.click('#btn-plaza'); await sleep(300); await page.click('#btn-plaza-yes'); await sleep(900);
    const p4 = await S(page);
    R.check(!p4.seated && p4.loco === 'walk' && !p4.paused && p4.r > 50 && p4.total === 1, `4 · «Volver a la plaza» (confirmado) deja a ANMI de pie en la plaza exterior con su patata`, 'input', p4);
    // ---------------------------------------------------------------- 5 · salir del parque, aviso una vez, recargar
    { let ok = false; for (const c of [[28, -26], [26, -28], [30, -22], [22, -30], [32, -18], [18, -32]]) if (await free(...c)) { await P.walkTo(c, { tol: 0.8, maxMs: 30000 }); ok = true; break; } R.measure('vuelta_dentro', { ok, r: (await S(page)).r }); }
    await page.evaluate(() => { document.getElementById('toast').hidden = true; });
    const seen = []; await P.walkTo([44, -44], { tol: 0.8, maxMs: 30000, until: async () => { const q = await S(page); if (/Vuelve al parque/.test(q.toast) && !seen.includes(q.toast)) seen.push(q.toast); return false; } });
    const o5 = await S(page);
    R.check(seen.length === 1 && o5.mus === 0, `5 · al salir del parque la música se apaga y sale «Vuelve al parque…» una vez`, 'input', { seen, o5 });
    await page.reload({ waitUntil: 'load' }); await page.waitForFunction(() => window.__bk && !document.getElementById('btn-start').disabled, { timeout: 120000 }); await clickStart(page); await sleep(1500);
    const rl = await S(page);
    R.check(rl.total === 1 && rl.decals === 1 && rl.saved === 1, '5 · al recargar siguen la patata y el grafiti', 'input', rl);
    R.measure('piloto_log', P.log.slice(-20));
  } finally { await b.close(); }
}, { timeoutMs: 600000 });
