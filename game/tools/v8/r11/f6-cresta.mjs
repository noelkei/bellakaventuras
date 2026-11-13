// R11 · F6 · YY-21 (= YY-11): «flotar sin contacto» tras pasar una cresta en tabla (grounded, sin contacto del KCC y el pie > 5 cm
// sobre un suelo llano bajo la sonda central). Simulación determinista, 2 repeticiones. Esperado tras el arreglo: ≤ 0,3 s seguidos así.
// Casos: subir E1 del vaso al deck a 5/6/9 m/s (YY-11), cresta de TT E2, bajar TT E1 al camino, cresta del escenario de FG (6 m/s).
// No empeorar (deben quedar como en la base): altura y duración del ollie en llano, y el ollie justo después de la cresta de FG y de TT E2;
// las rampas se siguen subiendo (cota final).
//   node tools/v8/r11/f6-cresta.mjs --url pre --task R11 --label pre
import { Report, runTest } from '../lib.mjs';
import { launch, abrir, run, racha, corona, giro } from './f5-lib.mjs';
const R = new Report('r11-f6-cresta');
const FLOTA = racha('flota', "s.grounded && !s.kccGrounded && s.loco !== 'grind' && !(s.pool && s.pool.active) && (() => { const f = s.footPos, r = R.ray(f.x, f.z, f.y + 0.4, 1.4); return r && r.ny > 0.9 && f.y - r.y > 0.05; })()")
  + "{ const f = s.footPos, r = R.ray(f.x, f.z, f.y + 0.4, 1.4); if (r && s.grounded) M.gapMax = Math.max(M.gapMax || 0, +(f.y - r.y).toFixed(3)); }";
// ollie: altura máxima sobre el despegue y duración del aire (en pasos)
const OLLIE = (at) => `if (st === ${at}) key('Space', true); if (st === ${at} + 3) key('Space', false); if (st >= ${at}) { if (!s.grounded && !M.desp) { M.desp = st; M.y0 = s.footPos.y; } if (M.desp && !M.ater) { M.ymax = Math.max(M.ymax ?? -99, s.footPos.y); if (s.grounded && st > M.desp + 3) M.ater = st; } }`;
await runTest(R, async () => {
  const b = await launch();
  try {
    const page = await abrir(b, R);
    const yAt = (x, z) => page.evaluate((x, z) => window.__R11.ray(x, z, 9, 14)?.y, x, z);
    const CASOS = [
      { tag: 'YY-11 E1 del vaso al deck 5 m/s', p: [-28.34, -0.98, 16.30], h: Math.atan2(0.3701, 0.929), v: 5 },
      { tag: 'YY-11 E1 del vaso al deck 6 m/s', p: [-28.34, -0.98, 16.30], h: Math.atan2(0.3701, 0.929), v: 6 },
      { tag: 'YY-11 E1 del vaso al deck 9 m/s', p: [-28.34, -0.98, 16.30], h: Math.atan2(0.3701, 0.929), v: 9 },
      { tag: 'YY-21 cresta TT E2 (tt_rear)', p: [-8, null, 30.975], h: 0, v: 6 },
      { tag: 'YY-21 TT E1 bajando al camino', p: [2, null, 25.275], h: 0, v: 6 },
      { tag: 'YY-21 cresta del escenario de FG', p: [24.725, null, 4.5], h: Math.PI / 2, v: 6 },
    ];
    // V10 (preparación): posiciones y rumbos literales de V9 girados con la corona (+9°)
    const G = giro(await corona(page)); for (const c of CASOS) { c.p = G.P(c.p); c.h = G.H(c.h); }
    for (const c of CASOS) if (c.p[1] === null) c.p[1] = (await yAt(c.p[0], c.p[2])) + 0.02;
    const base = {};
    for (let k = 1; k <= 2; k++) {
      for (const c of CASOS) {
        const r = await run(page, { p: c.p, h: c.h, v: c.v, sec: 2.5, script: FLOTA });
        const s = +((r.flota ?? 0) / 60).toFixed(2);
        R.check(s <= 0.3, `#${k} ${c.tag}: tras la cresta no rueda flotando sin contacto (racha ${s} s ≤ 0,3; hueco máx. ${r.gapMax ?? 0} m)`, 'input', { end: r.end, flota: r.flota });
        if (k === 1) base[c.tag] = r.end[1]; else R.check(Math.abs(r.end[1] - base[c.tag]) < 0.15, `#${k} no empeorar ${c.tag}: llega a la misma cota que en la otra repetición (${r.end[1]})`, 'input', {});
      }
      let llano = { alto: 1.108, aire: 40 };
      // no empeorar: ollie en llano (NMG) — mismas cifras que la base (alto 1,108 m medido desde el primer paso en el aire, aire 40 pasos)
      { const r = await run(page, { p: G.P([20, 0.02, -38]), h: G.H(1.6), v: 6, sec: 2, script: OLLIE(20) });
        const alto = +(r.ymax - r.y0).toFixed(3), aire = r.ater - r.desp;
        llano = { alto, aire };
        R.check(Math.abs(alto - 1.108) <= 0.02 && Math.abs(aire - 40) <= 1, `#${k} no empeorar: ollie en llano igual que en la base (alto ${alto} m ≈ 1,108 desde el primer paso de aire; aire ${aire} pasos ≈ 40)`, 'input', { alto, aire }); }
      // no empeorar: ollie justo después de las crestas (FG escenario, TT E2): el aire no se acorta respecto al ollie en llano
      for (const c of [CASOS[3], CASOS[5]]) {
        const r = await run(page, { p: c.p, h: c.h, v: c.v, sec: 2.5, script: OLLIE(45) });
        const alto = +(r.ymax - r.y0).toFixed(3), aire = r.ater - r.desp;
        // R11: «completos» = al menos los del ollie en llano de esta misma ejecución (antes ≥ 1,15 m, calibrado en una base que despegaba desde
        // la flotación de YY-21 y ganaba 0,12 m de más)
        R.check(alto >= llano.alto - 0.01 && aire >= llano.aire - 2, `#${k} no empeorar ${c.tag}: ollie tras la cresta con altura y aire completos (alto ${alto} m, aire ${aire} pasos; llano ${llano.alto} m, ${llano.aire})`, 'input', { alto, aire });
      }
    }
  } finally { await b.close(); }
}, { timeoutMs: 600000 });
