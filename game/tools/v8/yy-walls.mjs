// V8 · yy-walls: comportamiento del controlador NORMAL (sin tocar física) contra los perfiles del vaso, con teclado real. Cada caso
// parte de una colocación declarada en tabla o a pie y empuja/rueda con W hacia el objetivo. Mide: llegada a la cota de destino,
// recuperaciones (respawns), bails/impactos y si queda colgada (en el aire o sin apoyo más de 1,5 s). Bajadas por R1, R2, R3a y R3b
// a 2–6 m/s, perpendiculares y oblicuas (35°); caída desde el labio (2,50 m) a pie y en tabla; carrera contra la pared curva de N3
// (sube y vuelve, sin quedarse pegada); intento de subir R2 rodando (no se sube, no atraviesa).
import { Report, runTest, launch, openGame, clickStart, sleep } from './lib.mjs';
import { Pilot, angleDiff } from '../v4/pilot.mjs';
import { W, XZ, HD, loc, yy } from './yy-lib.mjs';
const R = new Report('yy-walls');
async function run(page, P, { from, to, loco = 'ride', speed = 4, ms = 4000, z = null }) {
  // fixture: colocación SOBRE la superficie real (rayo vertical), nunca dentro de una curva
  await page.evaluate((p, h, loco) => { const g = window.__bk, T = window.__bkTHREE, RA = window.__bkRapier; const hit = g.world.castRay(new RA.Ray({ x: p[0], y: p[1] + 1.5, z: p[2] }, { x: 0, y: -1, z: 0 }), 4, true, RA.QueryFilterFlags.EXCLUDE_SENSORS);
    const y = hit ? p[1] + 1.5 - hit.timeOfImpact : p[1]; g.skater.teleport(new T.Vector3(p[0], y, p[2]), h, loco); g.skater.vel.set(0, 0, 0); window.__imp0 = g.skater.impactLog.length; }, W(...from), HD(to[0] - from[0], to[1] - from[1]), loco);
  await sleep(400); const t0 = Date.now(); let maxSp = 0, ungroundedSince = null, hang = 0, minH = 9, maxH = -9; const track = [];
  while (Date.now() - t0 < ms) {
    const s = await yy(page), l = loc(s); maxSp = Math.max(maxSp, s.sp); minH = Math.min(minH, l.h); maxH = Math.max(maxH, l.h); track.push([l.x, l.v, l.h, s.loco]);
    if (!s.grounded) { ungroundedSince ??= Date.now(); hang = Math.max(hang, Date.now() - ungroundedSince); } else ungroundedSince = null;
    const a = XZ(to[0], to[1]), e = angleDiff(Math.atan2(a[0] - s.x, a[1] - s.z), s.h), d = Math.hypot(l.x - to[0], l.v - to[1]);
    const arrived = z !== null && s.grounded && Math.abs(l.h - z) < 0.06;   // ya abajo: frenar como haría quien juega (no estrellarse contra la pared de enfrente)
    const k = []; if (arrived) { if (s.sp > 0.6) k.push('KeyS'); } else if (d > 0.8) { if (s.sp < speed) k.push('KeyW'); if (Math.abs(e) > 0.06 && d > 1.5) k.push(e > 0 ? 'KeyA' : 'KeyD'); }
    await P.keys(k); await sleep(40);
  }
  await P.release(); await sleep(600);
  const s = await yy(page), l = loc(s); const imp = await page.evaluate(() => window.__bk.skater.impactLog.slice(window.__imp0).map((q) => q.why));
  return { end: [l.x, l.v, l.h], loco: s.loco, grounded: s.grounded, resp: s.respawns, maxSp: +maxSp.toFixed(1), hangMs: hang, minH, maxH, imp };
}
await runTest(R, async () => {
  const b = await launch();
  try {
    const page = await openGame(b, R); await clickStart(page); await page.evaluate(() => { document.getElementById('hint').hidden = true; });
    const P = new Pilot(page, R); const rows = [];
    // R2 usuario: dos niveles (N1 −1,00 / N2 −1,75); R1, R2 y R3b de 0,70 m entre N1 y N2 (R3a ya no existe: mismo nivel)
    const drops = [
      ['R1', [-6.4, 31.6, -1.0], [-3.0, 34.4], -1.75], ['R1 oblicua', [-6.6, 31.3, -1.0], [-2.4, 33.4], -1.75],
      ['R2', [-7.0, 30.9, -1.0], [-1.0, 30.2], -1.75], ['R2 oblicua', [-7.0, 31.4, -1.0], [-1.6, 29.0], -1.75],
      ['R3b', [6.0, 34.0, -1.0], [6.0, 28.6], -1.75], ['R3b oblicua', [5.6, 33.2, -1.0], [7.4, 28.8], -1.75],
    ];
    for (const [name, from, to, z] of drops) for (const sp of [2, 4, 6]) {
      const r = await run(page, P, { from, to, speed: sp, ms: 3600, z }); rows.push({ name, sp, ...r });
      R.check(r.minH < z + 0.06 && r.end[2] < z + 0.35 && r.resp === 0 && r.hangMs < 1500 && r.loco !== 'bail', `${name} a ${sp} m/s: baja a ${z.toFixed(2)} sin recuperación, sin quedarse colgada ni embebida y sin caída`, 'input', r);
    }
    // subir de N2 a N1 por cada rampa: andando siempre; en tabla con carrerilla (≈ 6,5 m/s)
    const ups = [['R1', [-3.0, 34.4, -1.75], [-6.6, 31.2]], ['R2', [-1.0, 30.2, -1.75], [-7.2, 30.9]], ['R3b', [6.0, 27.0, -1.75], [6.0, 34.2]]];
    for (const [name, from, to] of ups) {
      const w = await run(page, P, { from, to, loco: 'walk', speed: 3, ms: 5000, z: -1.0 }); rows.push({ name: `${name} subir a pie`, sp: 3, ...w });
      R.check(Math.abs(w.end[2] + 1.0) < 0.12 && w.resp === 0, `${name}: de N2 a N1 andando`, 'input', w);
      const k = await run(page, P, { from, to, loco: 'ride', speed: 6.5, ms: 4000, z: -1.0 }); rows.push({ name: `${name} subir en tabla`, sp: 6.5, ...k });
      R.check(k.maxH > -1.1 && k.resp === 0 && k.loco !== 'bail', `${name}: de N2 a N1 en tabla con carrerilla`, 'input', k);
    }
    // caída desde el labio a pie y en tabla (el deck no es parte del vaso: se entra cayendo; se sale solo por E1)
    for (const [loco, sp] of [['walk', 3], ['ride', 3], ['ride', 6]]) {
      const r = await run(page, P, { from: [3.0, 24.4, 0], to: [3.0, 28.8], loco, speed: sp, ms: 4200, z: -1.75 }); rows.push({ name: `labio ${loco}`, sp, ...r });
      R.check(Math.abs(r.end[2] + 1.75) < 0.12 && r.resp === 0 && r.hangMs < 1600, `desde el deck por el labio a N2 (${loco} ${sp} m/s): cae al fondo sin recuperación ni quedarse en la pared`, 'input', r);
    }
    // contra la curva de N2 por debajo del umbral de enganche: remonta un poco y vuelve
    { const r = await run(page, P, { from: [4.0, 29.4, -1.75], to: [4.6, 24.0], speed: 4, ms: 4500 }); rows.push({ name: 'pared N2', sp: 4, ...r });
      R.check(r.maxH > -1.65 && r.maxH < -0.5 && Math.abs(r.end[2] + 1.75) < 0.12 && r.resp === 0 && r.hangMs < 1500, 'contra la curva de N2 a 4 m/s (sin enganche): remonta la curva y vuelve al fondo', 'input', r); }
    R.measure('casos', rows);
    R.note('R2 usuario: el enganche a la pared (≥ 5,4 m/s) se prueba en yy-wallride; aquí, el controlador normal en rampas y caídas. Sin cambios de física global.');
  } finally { await b.close(); }
}, { timeoutMs: 900000 });
