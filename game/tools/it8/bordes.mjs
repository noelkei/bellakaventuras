// IT8 · D2 · guardián de bordes del mapa (sim, controlador real con teclas despachadas en cada paso fijo, como v8/yy-wallfuzz).
// 1 · Rejilla de rayos (0,75 m) sobre el cuadrado ±52: superficie más alta pisable (normal.y > 0,7). Borde = celda pisable con una vecina
//     sin suelo, con caída > 1 m o con pared > 1 m. Se eligen hasta `--n` (250) bordes repartidos por sector y altura (incluye cubiertas,
//     techos, puentes, muros y el vaso).
// 2 · Por borde: ANMI ahí mirando hacia fuera, a pie o en tabla, 2,5 s de W (la mitad con salto al segundo 1).
// 3 · Comprobaciones: no cae fuera del mundo (y < −4 o fuera de ±53 m); no queda atascada: con 4 s de volver hacia el punto de partida (W +
//     giro + salto) se mueve > 0,5 m; si no, 8 rumbos × 1,5 s y TABLA: si nada la mueve > 0,5 m, ATASCO (con su posición para verlo).
// Medida (sin criterio): bordes donde acaba en otra altura (cae de un techo, sube a algo), para el informe.
// `--rojo`: congela a ANMI → todos los casos dan ATASCO (demuestra que el detector salta).
import { Report, runTest, launch, sleep, arg, flag } from '../v8/lib.mjs';
import { open8, start8, dev, S20, saveJson } from './lib8.mjs';
const R = new Report('it8-bordes', { task: arg('task', 'IT8'), label: flag('rojo') ? 'rojo' : '' });
const NMAX = +arg('n', '250'), SEED = +arg('seed', '3');
await runTest(R, async () => {
  const b = await launch();
  try {
    const page = await open8(b, R, dev('pc720'), 'h', { save: S20 });
    await start8(page, false); await sleep(1500);
    await page.evaluate((rojo) => { const g = window.__bk; document.getElementById('hint').hidden = true; g.autoMode = true; if (rojo) g.skater.frozen = true; }, flag('rojo'));
    // 1 · bordes
    const bordes = await page.evaluate((NMAX, SEED) => {
      const g = window.__bk, RA = window.__bkRapier, F = RA.QueryFilterFlags.EXCLUDE_SENSORS, s = g.skater, STEP = 0.75, H = 52;
      let st = SEED >>> 0; const rnd = () => { st = (st + 0x6D2B79F5) >>> 0; let t = st; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
      const top = (x, z) => { const h = g.world.castRayAndGetNormal(new RA.Ray({ x, y: 25, z }, { x: 0, y: -1, z: 0 }), 40, true, F, undefined, s.collider, undefined, (c) => !g.npcColliders?.has?.(c.handle)); return h ? { y: 25 - h.timeOfImpact, ny: h.normal.y } : null; };
      const N = Math.floor(2 * H / STEP) + 1, grid = new Array(N * N);
      for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) grid[i * N + j] = top(-H + i * STEP, -H + j * STEP);
      const out = [];
      const D8 = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];
      for (let i = 1; i < N - 1; i++) for (let j = 1; j < N - 1; j++) { const c = grid[i * N + j]; if (!c || c.ny < 0.7) continue;
        for (const [di, dj] of D8) { const n = grid[(i + di) * N + j + dj]; const bad = !n || n.y < c.y - 1.0 || n.y > c.y + 1.0;
          if (bad) { out.push({ x: -H + i * STEP, z: -H + j * STEP, y: c.y, h: Math.atan2(di, dj), kind: !n ? 'sin suelo' : n.y < c.y ? 'caida' : 'pared' }); break; } } }
      // reparto: por sector (16 × 4 bandas de altura), al azar con semilla
      const cubo = new Map(); for (const p of out) { const k = Math.floor((Math.atan2(p.x, p.z) + Math.PI) / (Math.PI / 8)) + ':' + Math.min(3, Math.floor(Math.max(0, p.y + 1) / 1.5)); if (!cubo.has(k)) cubo.set(k, []); cubo.get(k).push(p); }
      const pick = []; const keys = [...cubo.keys()]; let k = 0; while (pick.length < NMAX && keys.some((q) => cubo.get(q).length)) { const l = cubo.get(keys[k++ % keys.length]); if (l.length) pick.push(l.splice(Math.floor(rnd() * l.length), 1)[0]); }
      return { total: out.length, pick };
    }, NMAX, SEED);
    R.measure('bordes_total', bordes.total);
    R.check(bordes.pick.length >= Math.min(NMAX, 100), `se encuentran bordes de lo pisable (${bordes.total}; se prueban ${bordes.pick.length})`, 'unit', { total: bordes.total });
    // 2 · empujar hacia fuera y volver
    const res = [];
    for (let i = 0; i < bordes.pick.length; i++) {
      const p = bordes.pick[i], loco = i % 2 ? 'ride' : 'walk', salto = i % 4 >= 2;
      const r = await page.evaluate(async (p, loco, salto) => {
        const g = window.__bk, T = window.__bkTHREE, s = g.skater, key = (c, d) => window.dispatchEvent(new KeyboardEvent(d ? 'keydown' : 'keyup', { code: c }));
        const rel = () => { for (const c of ['KeyW', 'KeyA', 'KeyD', 'KeyS', 'Space', 'KeyQ']) key(c, false); };
        if (g.paused) g.setPaused(false); for (const a of g.activities) if (a.busy) a.cancel?.(); rel(); g.input.clear();
        const back = 0.3, x0 = p.x - Math.sin(p.h) * back, z0 = p.z - Math.cos(p.h) * back;
        s.teleport(new T.Vector3(x0, p.y + 0.05, z0), p.h, loco); s.vel.set(0, 0, 0); g.rig.snapBehind(s);
        await g.simulate(0.3);
        if (loco === 'ride') { s.vel.set(Math.sin(p.h) * 4, 0, Math.cos(p.h) * 4); }
        await g.simulate(2.5, (t) => { key('KeyW', true); if (salto) key('Space', t > 1 && t < 1.1); });
        rel(); await g.simulate(0.3);
        if (s.loco === 'bail' || s.loco === 'impact') await g.simulate(2.0);
        const f = s.footPos, after = [f.x, f.y, f.z]; const fuera = f.y < -4 || Math.abs(f.x) > 53 || Math.abs(f.z) > 53 || !Number.isFinite(f.x + f.y + f.z);
        if (fuera) return { fuera, after };
        // volver hacia el punto de partida
        const q0 = f.clone(); let moved = 0;
        await g.simulate(4.0, (t) => { const want = Math.atan2(x0 - s.footPos.x, z0 - s.footPos.z), e = Math.atan2(Math.sin(want - s.heading), Math.cos(want - s.heading)); key('KeyA', e > 0.15); key('KeyD', e < -0.15); key('KeyW', Math.abs(e) < 1.2); key('Space', (t % 1) < 0.05); });
        rel(); await g.simulate(0.2); moved = s.footPos.distanceTo(q0);
        let atasco = false;
        if (moved < 0.5) { for (let k = 0; k < 8 && moved < 0.5; k++) { s.heading = k * Math.PI / 4; await g.simulate(1.5, (t) => { key('KeyW', true); key('Space', t > 0.5 && t < 0.55); }); rel(); await g.simulate(0.2); moved = Math.max(moved, s.footPos.distanceTo(q0)); }
          if (moved < 0.5) { key('KeyQ', true); await g.simulate(0.1); key('KeyQ', false); await g.simulate(1.0, () => key('KeyW', true)); rel(); await g.simulate(0.2); moved = Math.max(moved, s.footPos.distanceTo(q0)); }
          atasco = moved < 0.5; }
        return { fuera: false, atasco, after: after.map((v) => +v.toFixed(2)), dy: +(after[1] - p.y).toFixed(2), moved: +moved.toFixed(2), loco: s.loco };
      }, p, loco, salto);
      res.push({ ...p, loco, salto, ...r });
      if ((i + 1) % 50 === 0) console.log(`bordes ${i + 1}/${bordes.pick.length}`);
    }
    const fuera = res.filter((r) => r.fuera), atasco = res.filter((r) => r.atasco);
    R.check(!fuera.length, `ningún borde deja caer fuera del mundo (${res.length} empujones)`, 'input', fuera.slice(0, 10));
    R.check(!atasco.length, `ningún borde deja a ANMI atascada (${res.length} empujones; sonda de escape con 8 rumbos y tabla)`, 'input', atasco.slice(0, 10));
    R.measure('cambios_altura', res.filter((r) => !r.fuera && Math.abs(r.dy) > 1).map((r) => ({ x: r.x, z: r.z, y: r.y, dy: r.dy, kind: r.kind })).slice(0, 80));
    saveJson(`D2-bordes/resultado${flag('rojo') ? '_rojo' : ''}.json`, { total: bordes.total, res });
  } finally { await b.close(); }
}, { timeoutMs: 3600000 });
