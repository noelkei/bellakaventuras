// V8 · yy-wallfuzz (R3 del usuario: «intenta romper la mecánica de la pared»). Pruebas aleatorias reproducibles (semilla) y
// dirigidas a esquinas, juntas pared–rampa, el borde de E1 y el cuello convexo de P1, a 6–15 m/s, con teclas reales
// despachadas en cada paso (W/S/A/D, salto, EXTRA, TABLA, agacharse) dentro de game.simulate (mismo paso fijo del juego).
// Invariantes por paso: sin NaN, sin saltos de posición > 1,2 m en un paso, nunca bajo el fondo, sin recuperaciones (respawn),
// modo pared ≤ 6 s seguidos, aire ≤ 3,5 s, cápsula nunca embebida en un sólido con el controlador normal (consulta de forma de
// Rapier), salida del vaso solo por E1 o por el aire con ↑. Al final de cada prueba: «¿puede seguir jugando?» → suelta todo y
// conduce hacia el centro del vaso: debe moverse ≥ 0,8 m (si no, está pillada).
//   node tools/v8/yy-wallfuzz.mjs [--url dev|v8] [--n 160] [--seed 7]
import { Report, runTest, launch, openGame, clickStart, arg } from './lib.mjs';
const R = new Report('yy-wallfuzz');
const N = +arg('n', '160'), SEED = +arg('seed', '7'), ONLY = arg('only') ? arg('only').split(',').map(Number) : null;
await runTest(R, async () => {
  const b = await launch();
  try {
    const page = await openGame(b, R); await clickStart(page);
    await page.evaluate(() => { document.getElementById('hint').hidden = true; window.__bk.autoMode = true; });
    // utilidades en la página
    await page.evaluate(async () => {
      const g = window.__bk, RA = window.__bkRapier, T = window.__bkTHREE, s = g.skater;
      const H = await fetch('assets/yy/yy_pool.json').then((r) => r.json()); const P = H.wallRide.pts; window.__P = P;
      const ray = (x, z, y0 = 1) => { const h = g.world.castRay(new RA.Ray({ x, y: y0, z }, { x: 0, y: -1, z: 0 }), 6, true, RA.QueryFilterFlags.EXCLUDE_SENSORS, undefined, s.collider); return h ? y0 - h.timeOfImpact : null; };
      window.__ray = ray;
      const cx = P.reduce((a, p) => a + p[0], 0) / P.length, cz = P.reduce((a, p) => a + p[1], 0) / P.length; window.__C = [cx, cz];
      let seed = 1; window.__seed = (k) => { seed = k >>> 0 || 1; }; window.__rnd = () => { seed ^= seed << 13; seed >>>= 0; seed ^= seed >>> 17; seed ^= seed << 5; seed >>>= 0; return seed / 4294967296; };
      const key = (c, d) => window.dispatchEvent(new KeyboardEvent(d ? 'keydown' : 'keyup', { code: c }));
      const KEYS = ['KeyW', 'KeyS', 'KeyA', 'KeyD', 'Space', 'KeyF', 'KeyQ', 'KeyC'];
      window.__release = () => { for (const k of KEYS) key(k, false); };
      // cápsula embebida: forma de la cápsula en su sitio (sin la propia), solo con el controlador normal
      // forma REAL de la cápsula (cambia al agacharse) encogida 4 cm, en la posición real del collider
      window.__embedded = (sk = 0.04) => { const c0 = s.collider, shape = new RA.Capsule(s.capsuleHeight / 2 - 0.3, Math.max(0.05, 0.3 - sk)); let hit = null;   // la forma en JS de Rapier no refleja setHalfHeight (agachada): altura real del patinador let hit = null;
        g.world.intersectionsWithShape(c0.translation(), c0.rotation(), shape, (c) => { if (c.handle !== c0.handle && !c.isSensor()) { const e = g.park.b.colliders.find((q) => q.c.handle === c.handle); hit = e ? `${e.name}/${e.kind}` : `?${c.shape.type}`; return false; } return true; }, RA.QueryFilterFlags.EXCLUDE_SENSORS);
        return hit; };
      // una prueba: colocación + guion de teclas aleatorio o fijo; devuelve invariantes
      window.__trial = async (o) => {
        s.teleport(new T.Vector3(o.p[0], o.p[1] + 0.02, o.p[2]), o.h, o.loco); s.vel.set(Math.sin(o.h) * o.v, 0, Math.cos(o.h) * o.v);
        const pool = s.pool, r0 = s.respawns, b0 = s.bails; const held = new Set(); const evs = [];
        let lastActive = -999, exitPos = null, steps = 0, worst = null, maxActive = 0, activeRun = 0, air = 0, maxAir = 0, embedded = 0, embedAt = null, maxJump = 0, minY = 9, nan = false, prev = s.footPos.clone(), outside = null, exitHow = null;
        const fail = (w) => { if (!worst) worst = w; };
        const st0 = s.settles; let settleSteps = 0;
        const n0 = { hooks: pool.hooks, airs: pool.airs, airOuts: pool.airOuts, exits: pool.exits, contains: pool.contains };
        await g.simulate(o.sec, () => {
          steps++;
          // guion
          if (o.script === 'random') {
            for (const k of KEYS) { const pOn = { KeyW: 0.05, KeyS: 0.015, KeyA: 0.03, KeyD: 0.03, Space: 0.04, KeyF: 0.015, KeyQ: 0.004, KeyC: 0.006 }[k], pOff = k === 'Space' || k === 'KeyQ' ? 0.5 : 0.04;
              if (held.has(k)) { if (window.__rnd() < pOff) { key(k, false); held.delete(k); } } else if (window.__rnd() < pOn) { key(k, true); held.add(k); evs.push(`${steps}:${k}`); } }
          } else if (o.script) { for (const [st, k, d] of o.script) if (st === steps) { key(k, d); if (d) held.add(k); else held.delete(k); } }
          const f = s.footPos;
          if (![f.x, f.y, f.z, s.vel.x, s.vel.z, s.vy, s.heading].every(Number.isFinite)) { nan = true; fail('NaN'); }
          const jmp = f.distanceTo(prev); maxJump = Math.max(maxJump, jmp); if (s.settles > st0 + settleSteps) { settleSteps = s.settles - st0; } else if (jmp > 1.2) fail(`salto de posición ${jmp.toFixed(2)} m en un paso`); prev.copy(f);
          minY = Math.min(minY, f.y); if (f.y < -1.85) fail(`bajo el fondo y=${f.y.toFixed(2)}`);
          if (pool.active) { lastActive = steps; activeRun++; maxActive = Math.max(maxActive, activeRun); if (activeRun > 360) fail('modo pared > 6 s'); } else activeRun = 0;
          if (!s.grounded) { air++; maxAir = Math.max(maxAir, air); if (air > 210) fail('en el aire > 3,5 s'); } else air = 0;
          if (!pool.active && s.loco !== 'grind' && steps > 12 && steps % 4 === 0) { const e = window.__embedded(); if (e !== null) { embedded++; if (!embedAt) { let dep = 0.04; for (const k of [0.08, 0.12, 0.16, 0.2]) if (window.__embedded(k) !== null) dep = k; embedAt = [f.x, f.y, f.z, e, s.loco, steps, dep, s.collider.shape.halfHeight, steps - lastActive, s.events.slice(-6).map((q) => q.e), pool.log.slice(-3).map((q) => q.e), s.isCrouched, +s.vy.toFixed(2), s.grounded, s.trace.slice(-8).map((q) => [q.x, q.y, q.z, q.g, q.loco, q.vl])]; } if (embedded > 6) fail('cápsula embebida en un sólido'); } else embedded = Math.max(0, embedded - 1); }
          // salida del vaso: por E1 (escalera) o por el aire con ↑ (airOuts)
          if (outside === null && steps > 3 && !pool.inPool && !pool.active && f.y > -0.05) { outside = steps; exitPos = [f.x, f.z]; window.__exitTrace = s.trace.slice(-14).map((q) => [q.x, q.y, q.z, q.g, q.loco]).concat([['nr', pool.nearest(f.x, f.z)]]); }
        });
        window.__release(); await g.simulate(0.2);
        if (s.respawns > r0) fail('recuperación (respawn)');
        if (outside !== null) exitHow = pool.airOuts > n0.airOuts ? 'aire' : 'otra';
        if (exitHow === 'otra') { if (pool.exitAt(exitPos[0], exitPos[1], 0.6)) exitHow = 'E1';   /* cruzó por la salida de E1 (también saltando a sus peldaños altos) */ else fail(`fuera del vaso sin E1 ni aire (por ${exitPos.map((v) => v.toFixed(2))})`); }
        // ¿puede seguir? hacia el centro del vaso (o, fuera, alejándose del borde) 3 s
        const p0 = s.footPos.clone(); let moved = 0;
        if (s.loco === 'bail' || s.loco === 'impact') await g.simulate(1.6);
        // cuatro rumbos (hacia el centro del vaso y giros de 90°): basta uno libre
        const a0 = Math.atan2(window.__C[0] - p0.x, window.__C[1] - p0.z);
        for (const da of [0, Math.PI / 2, -Math.PI / 2, Math.PI]) {
          const q0 = s.footPos.clone(), want = a0 + da;
          await g.simulate(1.6, () => { const e = Math.atan2(Math.sin(want - s.heading), Math.cos(want - s.heading)); key('KeyA', e > 0.15); key('KeyD', e < -0.15); key('KeyW', Math.abs(e) < 0.9); });
          window.__release(); await g.simulate(0.1); moved = Math.max(moved, s.footPos.distanceTo(q0)); if (moved >= 0.8) break;
        }
        if (moved < 0.8 && !pool.active) fail(`pillada: solo se movió ${moved.toFixed(2)} m al intentar seguir (${s.loco}, y=${s.footPos.y.toFixed(2)})`);
        void settleSteps;
        return { settles: s.settles - st0, st: { mode: g.mode, paused: g.paused, frozen: s.frozen, modal: g.input.modal, dlg: !document.getElementById('dialog').hidden, ov: [...document.querySelectorAll('.overlay:not([hidden]), [role=dialog]:not([hidden])')].map((e) => e.id).slice(0, 5) }, worst, steps, maxActive, maxAir, maxJump: +maxJump.toFixed(2), minY: +minY.toFixed(2), embedAt, nan, loco: s.loco, moved: +moved.toFixed(2), exitHow, bails: s.bails - b0,
          trace: o.trace ? s.trace.slice(-90).map((q) => [q.x, q.y, q.z, q.g, q.loco, q.vl]) : null, events: o.trace ? s.events.slice(-30) : null,
          d: Object.fromEntries(Object.entries(n0).map(([k, v]) => [k, pool[k] - v])), evs: evs.slice(0, 40), log: pool.log.slice(-8).map((q) => q.e), end: [s.footPos.x, s.footPos.y, s.footPos.z].map((v) => +v.toFixed(2)) };
      };
    });
    // casos: aleatorios + dirigidos a esquinas
    const plan = await page.evaluate((N, SEED) => {
      const P = window.__P, ray = window.__ray; window.__seed(SEED); const rnd = window.__rnd, out = [];
      // E1: centro de las muestras que no son pared
      const nw = P.filter((p) => !p[7]); const e1 = [nw.reduce((a, p) => a + p[0], 0) / nw.length, nw.reduce((a, p) => a + p[1], 0) / nw.length];
      const g = window.__bk, RA = window.__bkRapier;
      const floorAt = (x, z) => { const h = g.world.castRayAndGetNormal(new RA.Ray({ x, y: 1, z }, { x: 0, y: -1, z: 0 }), 6, true, RA.QueryFilterFlags.EXCLUDE_SENSORS, undefined, g.skater.collider);
        if (!h || h.normal.y < 0.97) return null; const y = 1 - h.timeOfImpact; return y < -0.9 && y > -1.8 ? y : null; };   // salida en suelo llano (no dentro de una rampa)
      let guard = 0;
      while (out.length < N && guard++ < N * 30) {
        const i = Math.floor(rnd() * P.length), p = P[i]; const d = p[6] + 0.4 + rnd() * 4.5; const x = p[0] + p[2] * d, z = p[1] + p[3] * d; const y = floorAt(x, z); if (y === null) continue;
        const toWall = Math.atan2(-p[2], -p[3]), h = rnd() < 0.65 ? toWall + (rnd() - 0.5) * 2.2 : rnd() * Math.PI * 2;
        out.push({ kind: 'aleatoria', p: [x, y, z], h, v: rnd() < 0.15 ? 0 : 3 + rnd() * 11, loco: rnd() < 0.1 ? 'walk' : 'ride', sec: 5, script: 'random', e1, i });
      }
      // dirigidos: muestras donde cambia la pared (E1), la cota del fondo (rampa contra pared) o la normal gira rápido (cuello de P1)
      const tgt = [];
      for (let i = 0; i < P.length; i++) { const a = P[i], b = P[(i + 1) % P.length], c = P[(i + 4) % P.length];
        const turn = Math.acos(Math.max(-1, Math.min(1, a[2] * c[2] + a[3] * c[3])));
        if (a[7] !== b[7]) tgt.push([i, 'borde E1']); else if (Math.abs(a[4] - b[4]) > 0.02 && a[7]) tgt.push([i, 'junta rampa']); else if (turn > 0.45 && a[7]) tgt.push([i, 'esquina']); }
      const seen = []; for (const [i, why] of tgt) { if (seen.some((j) => Math.abs(j - i) < 6)) continue; seen.push(i);
        const p = P[i];
        for (const v of [6, 9, 12, 15]) for (const off of [-0.6, 0.6]) {
          const d = p[6] + 3.2, tx = -p[3], tz = p[2], x = p[0] + p[2] * d + tx * off * 3, z = p[1] + p[3] * d + tz * off * 3, y = floorAt(x, z); if (y === null) continue;
          const h = Math.atan2(p[0] - x, p[1] - z);
          const script = v >= 12 ? [[2, 'KeyW', true], [40, 'Space', true], [43, 'Space', false], [70, 'KeyW', false]] : [[2, 'KeyW', true], [90, 'KeyW', false]];
          out.push({ kind: `${why} ${v} m/s`, p: [x, y, z], h, v, loco: 'ride', sec: 4, script, e1, i });
        } }
      return out;
    }, N, SEED);
    R.measure('plan', { total: plan.length, aleatorias: plan.filter((q) => q.kind === 'aleatoria').length, dirigidas: plan.filter((q) => q.kind !== 'aleatoria').length });
    const fails = [], stats = { hooks: 0, airs: 0, airOuts: 0, exits: 0, contains: 0, bails: 0, E1: 0, aire: 0 };
    for (let k = 0; k < plan.length; k++) {
      if (ONLY && !ONLY.includes(k)) continue;
      const o = plan[k]; if (o.kind === 'aleatoria') await page.evaluate((s0) => window.__seed(s0), SEED * 1000 + k);
      if (ONLY) o.trace = true;
      const r = await page.evaluate((o) => window.__trial(o), o); if (ONLY) console.log(JSON.stringify({ exitTrace: await page.evaluate(() => window.__exitTrace), st: r.st, k, kind: o.kind, worst: r.worst, end: r.end, moved: r.moved, loco: r.loco, log: r.log, events: r.events?.slice(-25), trace: r.trace?.filter((_, i) => i % 6 === 0) }));
      for (const kk of ['hooks', 'airs', 'airOuts', 'exits', 'contains']) stats[kk] += r.d[kk]; stats.bails += r.bails; if (r.exitHow === 'E1') stats.E1++; if (r.exitHow === 'aire') stats.aire++;
      if (r.worst) { fails.push({ k, kind: o.kind, at: o.p.map((v) => +v.toFixed(2)), h: +o.h.toFixed(2), v: +o.v.toFixed(1), loco: o.loco, ...r }); console.log(`✗ ${k} ${o.kind}: ${r.worst}`); }
    }
    R.measure('estadística', stats);
    R.measure('fallos', fails);
    R.check(fails.length === 0, `${plan.length} pruebas (aleatorias y dirigidas a esquinas/juntas/E1): sin pilladas, sin embebidas, sin NaN ni saltos, sin salidas indebidas`, 'input', { fallos: fails.length, primeros: fails.slice(0, 6).map((f) => `${f.k} ${f.kind}: ${f.worst}`) });
  } finally { await b.close(); }
}, { timeoutMs: 3600000 });
