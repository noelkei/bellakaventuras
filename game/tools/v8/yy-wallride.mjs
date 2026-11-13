// V8 · yy-wallride (R2 del usuario): mecánica de pared del vaso. Simulación determinista (game.simulate, el mismo paso fijo
// del juego) con teclas reales despachadas en el paso exacto (keydown/keyup en window). Paredes elegidas de la tabla del
// borde (N1 y N2) con suelo comprobado por rayo. Casos: de frente a 6,5 m/s con frontflip, backflip y sin truco (sube, sale
// vertical, aire suficiente, se reengancha y vuelve al vaso sin caída); en diagonal (talla y vuelve, nunca pasa del labio);
// por debajo del umbral (no engancha); empujando con W desde parado (dos empujones bastan); ollie contra la pared por debajo
// del umbral (no sale del vaso); fuera del vaso no engancha nunca.
import fs from 'node:fs';
import path from 'node:path';
import { Report, runTest, launch, openGame, clickStart, flag, GAME } from './lib.mjs';
import { loc } from './yy-lib.mjs';
const R = new Report('yy-wallride');
const KIT_W = (await import('./yy-lib.mjs')).KIT.wallRide;
await runTest(R, async () => {
  const b = await launch();
  try {
    const page = await openGame(b, R); await clickStart(page); await page.evaluate(() => { document.getElementById('hint').hidden = true; });
    // paredes de prueba: muestras del borde con suelo llano delante (rayo a 1,6 / 2,6 / 3,6 m) a la cota zf
    const walls = await page.evaluate(async () => {
      const g = window.__bk, RA = window.__bkRapier, pool = g.skater.pool, out = [];
      const pts = (await fetch('assets/yy/yy_pool.json').then((r) => r.json())).wallRide.pts;
      const ray = (x, z) => { const h = g.world.castRay(new RA.Ray({ x, y: 2, z }, { x: 0, y: -1, z: 0 }), 8, true, RA.QueryFilterFlags.EXCLUDE_SENSORS, undefined, g.skater.collider); return h ? 2 - h.timeOfImpact : null; };
      for (let i = 0; i < pts.length; i += 7) {
        const [X, Z, nx, nz, zf, D, Rc, w] = pts[i]; if (!w) continue;
        let room = 0; for (const d of [0.8, 1.2, 1.6, 2.0, 2.4, 2.8, 3.2, 3.6]) { const y = ray(X + nx * (Rc + d), Z + nz * (Rc + d)); if (y !== null && Math.abs(y - zf) < 0.03) room = d; else break; }
        const ok = room >= 1.6 && [0.8].every((d) => { const y = ray(X + nx * (Rc + d), Z + nz * (Rc + d)); return y !== null && Math.abs(y - zf) < 0.03; });
        const far = [3.6, 4.6, 5.6].every((d) => { const y = ray(X + nx * (Rc + d), Z + nz * (Rc + d)); return y !== null && Math.abs(y - zf) < 0.03; });
        const nearE1 = pts.some((q, j) => !q[8] ? false : Math.hypot(q[0] - (X - nx * 0.6), q[1] - (Z - nz * 0.6)) < 1.8);
        if (ok) out.push({ i, X, Z, nx, nz, zf, D, Rc, far, room, nearE1 });
      }
      void pool; return out;
    });
    const pick = (lv) => { const c = walls.filter((w) => Math.abs(w.zf - lv) < 0.02); return [c[0], c[Math.floor(c.length / 2)], c[c.length - 1]].filter(Boolean); };
    const W1 = pick(-1.0), W2 = pick(-1.75);
    R.measure('paredes', { candidatas: walls.length, N1: W1.map((w) => w.i), N2: W2.map((w) => w.i) });
    R.check(W1.length >= 2 && W2.length >= 2, 'hay paredes de prueba en N1 y en N2 con suelo llano delante', 'fixture', { N1: W1.length, N2: W2.length });

    async function run(w, { dist = 3.0, ang = 0, speed = 6.5, sec = 4.5, script = 'none', push = false }) {
      return page.evaluate(async (w, o) => {
        const g = window.__bk, T = window.__bkTHREE, s = g.skater, pool = s.pool;
        // dirección de llegada: −n girada `ang` grados hacia la tangente
        const a = o.ang * Math.PI / 180, tx = -w.nz, tz = w.nx; // tangente horizontal
        const dx = -w.nx * Math.cos(a) + tx * Math.sin(a), dz = -w.nz * Math.cos(a) + tz * Math.sin(a);
        const sx = w.X + w.nx * (w.Rc + o.dist) - tx * Math.sin(a) * o.dist, sz = w.Z + w.nz * (w.Rc + o.dist) - tz * Math.sin(a) * o.dist;
        { const RA = window.__bkRapier, h = g.world.castRay(new RA.Ray({ x: sx, y: 2, z: sz }, { x: 0, y: -1, z: 0 }), 8, true, RA.QueryFilterFlags.EXCLUDE_SENSORS, undefined, s.collider);
          if (!h || Math.abs(2 - h.timeOfImpact - w.zf) > 0.03) return { invalid: `salida sin suelo a la cota ${w.zf}` }; }
        s.teleport(new T.Vector3(sx, w.zf + 0.02, sz), Math.atan2(dx, dz), 'ride');
        if (!o.push) s.vel.set(dx * o.speed, 0, dz * o.speed);
        const key = (code, down) => window.dispatchEvent(new KeyboardEvent(down ? 'keydown' : 'keyup', { code, key: code === 'Space' ? ' ' : code }));
        const h0 = { airOuts: pool.airOuts, hooks: pool.hooks, airs: pool.airs, rehooks: pool.rehooks, exits: pool.exits, carves: pool.carves, contains: pool.contains }, tl0 = s.trickLog.length, b0 = s.bails, r0 = s.respawns, l0 = pool.log.length;
        let held = 0, released = false, braking = false, maxY = -9, minY = 9, pressed = 0, maxSp = 0, airMaxY = -9, steps = 0, hookAt = null;
        if (o.push) key('KeyW', true);
        await g.simulate(o.sec, () => {
          steps++; const y = s.footPos.y; maxY = Math.max(maxY, y); minY = Math.min(minY, y); maxSp = Math.max(maxSp, Math.hypot(s.vel.x, s.vel.z));
          if (pool.active && pool.phase === 'air') airMaxY = Math.max(airMaxY, y);
          if (pool.active && hookAt === null) { hookAt = steps; if (o.push) key('KeyW', false); }
          if (hookAt !== null && !braking && pool.exits > h0.exits) { braking = true; key('KeyS', true); }   // tras volver al fondo, frena (como quien juega)
          if (o.script === 'front' || o.script === 'back') {
            const k = o.script === 'front' ? 'KeyW' : 'KeyS';
            if (!pressed && pool.active && pool.phase === 'air' && pool.airT > 0.12) { key(k, true); key('Space', true); pressed = steps; }
            if (pressed && steps === pressed + 3) { key('Space', false); key(k, false); }
          }
          if (o.script === 'out' || o.script === 'outflip') {
            if (pool.active && pool.phase === 'air' && !held) { held = steps; key('KeyW', true); }
            if (o.script === 'outflip' && held && !pressed && pool.active && pool.airT > 0.12) { key('Space', true); pressed = steps; }
            if (pressed && steps === pressed + 3) key('Space', false);
            if (held && !pool.active && s.grounded && !released) { released = true; key('KeyW', false); key('KeyS', true); }
          }
          if (o.script === 'ollie' && !pressed) { const dh = (s.footPos.x - w.X) * w.nx + (s.footPos.z - w.Z) * w.nz; if (dh < w.Rc + 0.9) { key('Space', true); pressed = steps; } }
          if (o.script === 'ollie' && pressed && steps === pressed + 3) key('Space', false);
          if (o.script === 'ollie' && pressed) key('KeyW', true);
        });
        for (const c of ['KeyW', 'KeyS', 'Space']) key(c, false);
        const f = s.footPos;
        return { maxY: +maxY.toFixed(3), minY: +minY.toFixed(3), airAboveLip: +airMaxY.toFixed(3), maxSp: +maxSp.toFixed(2), end: [f.x, f.y, f.z].map((v) => +v.toFixed(3)), loco: s.loco, grounded: s.grounded, active: pool.active,
          d: Object.fromEntries(Object.entries(h0).map(([k, v]) => [k, pool[k] - v])), tricks: s.trickLog.slice(tl0), bails: s.bails - b0, respawns: s.respawns - r0, inPool: pool.inPool, log: pool.log.slice(l0).map((e) => e.e), hookAt };
      }, w, { dist, ang, speed, sec, script, push });
    }
    const rows = [];
    for (const [lv, set] of [['N1', W1], ['N2', W2]]) for (const w of set) {
      const tag = `${lv}#${w.i}`;
      for (const sc of ['front', 'back', 'none']) {
        const r = await run(w, { script: sc, dist: Math.min(3.0, w.room - 0.2) }); rows.push({ tag, caso: `frente ${sc}`, ...r }); if (r.invalid) { R.invalid(`${tag} frente ${sc}`, r.invalid); continue; }
        const flipOk = sc === 'none' ? r.tricks.length === 0 : r.tricks.length === 1 && r.tricks[0].ok && r.tricks[0].kind === (sc === 'front' ? 'frontflip' : 'backflip');
        R.check(r.d.hooks === 1 && r.d.airs === 1 && r.d.rehooks === 1 && r.d.exits === 1 && r.airAboveLip > 1.2 && flipOk && r.bails === 0 && r.respawns === 0 && r.end[1] < -0.5 && r.inPool && r.loco === 'ride' && !r.active,
          `${tag} de frente a 6,5 m/s (${sc}): engancha, sale vertical > 1,2 m sobre el labio, ${sc === 'none' ? 'sin truco' : sc + 'flip completo'}, se reengancha y vuelve al fondo en tabla`, 'input', r);
      }
      for (const sg of [1, -1]) { let r = await run(w, { ang: 65 * sg, speed: 7.0, dist: 0.55 });
        // en los extremos del tramo (junto a E1/rampa) la salida en diagonal cae fuera del fondo: misma pared, hasta 1,5 m hacia dentro
        if (r.invalid) { const NP = JSON.parse(fs.readFileSync(path.join(GAME, 'public/assets/yy/yy_pool.json'), 'utf8')).wallRide.pts.length;   // tabla cerrada (vuelta)
          const di = (c) => { const d = Math.abs(c.i - w.i) % NP; return Math.min(d, NP - d); };
          const mid = walls.filter((c) => Math.abs(c.zf - w.zf) < 0.02 && c.i !== w.i && di(c) <= 25).sort((a, b) => di(a) - di(b));
          for (const c of mid) { const r2 = await run(c, { ang: 65 * sg, speed: 7.0, dist: 0.55 }); if (!r2.invalid) { r = { ...r2, desplazada: c.i }; break; } } }
        if (r.invalid) {   // ¿tramo de pared a esa cota más corto que la llegada en diagonal (≈ 1 m de recorrido tangente)? → el caso no existe
          const P = JSON.parse(fs.readFileSync(path.join(GAME, 'public/assets/yy/yy_pool.json'), 'utf8')).wallRide.pts, NP = P.length, same = (k) => { const q = P[((k % NP) + NP) % NP]; return q[7] && Math.abs(q[4] - w.zf) < 0.02; };
          let lo = w.i, hi = w.i; while (same(lo - 1) && w.i - lo < NP) lo--; while (same(hi + 1) && hi - w.i < NP) hi++;
          const len = (hi - lo) * 0.06;
          if (len < 1.0) { rows.push({ tag, caso: `diagonal ${sg}`, noAplica: `tramo de pared a ${w.zf} de ${len.toFixed(2)} m entre E1 y la rampa`, ...r }); R.note(`${tag} diagonal ${sg}: no aplica, el tramo de pared a la cota ${w.zf} mide ${len.toFixed(2)} m (entre la escalera E1 y la rampa a N2); en diagonal se llega a la rampa, no a la pared`); continue; } }
        rows.push({ tag, caso: `diagonal ${sg}`, ...r }); if (r.invalid) { R.invalid(`${tag} diagonal ${sg}`, r.invalid); continue; }
        R.check(r.d.hooks === 1 && r.d.carves === 1 && r.d.airs === 0 && r.maxY < -0.05 && r.d.exits === 1 && r.bails === 0 && r.end[1] < -0.5 && r.inPool && r.loco === 'ride', `${tag} en diagonal (${65 * sg}° de la normal, 7 m/s): talla la pared y vuelve al vaso sin pasar del labio`, 'input', r); }
      for (const sc of (w.nearE1 ? [] : ['out', 'outflip'])) {
        const r = await run(w, { script: sc, dist: Math.min(3.0, w.room - 0.2), sec: 3.5 }); rows.push({ tag, caso: `fuera ${sc}`, ...r }); if (r.invalid) { R.invalid(`${tag} ${sc}`, r.invalid); continue; }
        const ok = sc === 'out' ? r.tricks.length === 0 : r.tricks.length === 1 && r.tricks[0].ok && r.tricks[0].kind === 'frontflip';
        R.check(r.d.airOuts === 1 && r.d.rehooks === 0 && ok && r.bails === 0 && r.respawns === 0 && r.end[1] > -0.3 && !r.inPool && r.loco === 'ride' && r.grounded,   /* deck (0) o peldaños altos de E1 (−0,2) junto a la escalera */
          `${tag} manteniendo ↑ en el aire${sc === 'outflip' ? ' con frontflip' : ''}: avanza, sale del vaso y aterriza en el deck en tabla`, 'input', r);
      }
      { const r = await run(w, { speed: 4.5, dist: Math.min(3.0, w.room - 0.2) }); rows.push({ tag, caso: 'lento', ...r }); if (r.invalid) { R.invalid(`${tag} lento`, r.invalid); } else
        R.check(r.d.hooks === 0 && r.end[1] < -0.9 && r.respawns === 0, `${tag} de frente a 4,5 m/s (por debajo del umbral): no engancha`, 'input', r); }
      { const r = await run(w, { speed: 4.2, dist: Math.min(2.0, w.room - 0.2), script: 'ollie', sec: 3.5 }); rows.push({ tag, caso: 'ollie', ...r }); if (r.invalid) { R.invalid(`${tag} ollie`, r.invalid); } else
        R.check(r.d.hooks === 0 && r.end[1] < -0.5 && r.inPool && r.respawns === 0, `${tag} ollie contra la pared a 4,2 m/s: no sale del vaso`, 'input', r); }
    }
    // dos empujones desde parado con W real bastan para engancharse
    { const w = walls.find((q) => q.far && Math.abs(q.zf + 1.75) < 0.02) ?? W2[0]; const r = await run(w, { dist: 5.0, push: true, sec: 5 }); rows.push({ tag: `N2#${w.i}`, caso: 'empujando', ...r }); if (r.invalid) R.invalid('empujando', r.invalid); else
      R.check(r.d.hooks >= 1 && r.d.airs >= 1, `N2#${w.i}: desde parado a 5 m, con W (empujones reales) llega al umbral y sube por la pared`, 'input', r); }
    // R4 usuario: entrar desde FUERA enganchada (rodando por el borde, saltando con truco); andando se cae sin engancharse
    async function dropIn(w, { loco = 'ride', speed = 3, dist = 1.6, script = 'none' }) {
      return page.evaluate(async (w, o) => {
        const g = window.__bk, T = window.__bkTHREE, s = g.skater, pool = s.pool;
        const key = (c, d) => window.dispatchEvent(new KeyboardEvent(d ? 'keydown' : 'keyup', { code: c }));
        const sx = w.X - w.nx * o.dist, sz = w.Z - w.nz * o.dist, h = Math.atan2(w.nx, w.nz);
        s.teleport(new T.Vector3(sx, 0.02, sz), h, o.loco); s.vel.set(w.nx * o.speed, 0, w.nz * o.speed);
        window.__fl = 0; const d0 = pool.drops, b0 = s.bails, r0 = s.respawns, tl0 = s.trickLog.length, l0 = pool.log.length; let steps = 0, jumped = 0, minY = 9, braking = false;
        if (o.loco === 'walk') key('KeyW', true);
        await g.simulate(3.5, () => { steps++; minY = Math.min(minY, s.footPos.y);
          const dh = (s.footPos.x - w.X) * w.nx + (s.footPos.z - w.Z) * w.nz;
          if (o.script === 'ollie' && !jumped && dh > -0.55) { key('Space', true); jumped = steps; }
          if (jumped && steps === jumped + 3) key('Space', false);
          if (o.script === 'ollie' && jumped && steps >= jumped + 7 && !window.__fl) { window.__fl = steps; key('KeyW', true); key('Space', true); }
          if (window.__fl && steps === window.__fl + 3) { key('KeyW', false); key('Space', false); }
          if (pool.drops > d0 && !pool.active && !braking && o.loco === 'ride') { braking = true; key('KeyS', true); }
        });
        for (const c of ['KeyW', 'KeyS', 'Space']) key(c, false);
        return { drops: pool.drops - d0, bails: s.bails - b0, respawns: s.respawns - r0, tricks: s.trickLog.slice(tl0), loco: s.loco, y: +s.footPos.y.toFixed(2), minY: +minY.toFixed(2), inPool: pool.inPool, log: pool.log.slice(l0).map((q) => q.e), ev: s.events.slice(-12).map((q) => q.e), fl: window.__fl, jumped };
      }, w, { loco, speed, dist, script });
    }
    for (const w of [...W2.slice(0, 2), ...W1.slice(0, 1)]) {
      const tag = `${Math.abs(w.zf + 1) < 0.05 ? 'N1' : 'N2'}#${w.i}`;
      const a = await dropIn(w, {}); rows.push({ tag, caso: 'entra rodando', ...a });
      R.check(a.drops === 1 && a.bails === 0 && a.respawns === 0 && a.loco === 'ride' && a.y < -0.9 && a.inPool, `${tag} desde el deck rodando a 3 m/s por el borde: se engancha, baja por la pared y sigue en tabla en el fondo`, 'input', a);
      const b2 = await dropIn(w, { speed: 3.2, dist: 1.8, script: 'ollie' }); rows.push({ tag, caso: 'entra con ollie y frontflip', ...b2 });
      R.check(b2.bails === 0 && b2.respawns === 0 && b2.loco === 'ride' && b2.y < -0.9 && b2.tricks.some((q) => q.ok && q.kind === 'frontflip'), `${tag} desde el deck con ollie y frontflip (pulsado al despegar): el truco se completa y sigue en tabla dentro del vaso`, 'input', b2);
      const c2 = await dropIn(w, { loco: 'walk', speed: 0, dist: 0.9 }); rows.push({ tag, caso: 'entra andando', ...c2 });
      R.check(c2.drops === 0 && c2.respawns === 0 && c2.y < -0.9, `${tag} andando por el borde: cae al vaso sin engancharse (solo en tabla)`, 'input', c2);
    }
    R.measure('casos', rows);
    R.note(`Parámetros: ${JSON.stringify(KIT_W)}`);
    if (flag('verbose')) console.log(JSON.stringify(rows.map((r) => [r.tag, r.caso, r.d, r.airAboveLip, r.maxY, r.end, r.loco, (r.tricks ?? []).map((t) => t.kind + (t.ok ? '✓' : '✗')), (r.log ?? []).slice(0, 6)]), null, 0));
    void loc;
  } finally { await b.close(); }
}, { timeoutMs: 600000 });
