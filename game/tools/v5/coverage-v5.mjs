// T5-21 · Matriz de cobertura de acciones y animaciones (OPUS-022, COV-01/02/08). Cada fila: familia, fixture de partida
// declarada, ENTRADA REAL (teclado) y lo esperado (estado del controlador y/o clip dominante). Por fila: vídeo continuo
// (screencast → clip.webp + hoja.jpg con marcas de tiempo) y registro por fotograma (estado, loco, truco, fase de impacto, los 3
// clips de mayor peso, override). Resultado: alcanzado (lo esperado aparece) + clips vistos. La revisión VISUAL que hace el
// agente es sobre la hoja de contacto (no visionado continuo); el visionado continuo queda para el usuario (G8-V).
// Uso: --rows a,b,c (por defecto todas) · salida V5/evidencias/T5-21/runs/coverage-v5_<label>_*
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { Report, runTest, launch, openGame, clickStart, sleep, fixture, recordClip, SAVE_20, arg, r3 } from './lib.mjs';
const R = new Report('coverage-v5');
const ONLY = arg('rows', '') ? arg('rows', '').split(',') : null;
const HERE = path.dirname(new URL(import.meta.url).pathname);
const k = (page) => ({ down: (c) => page.keyboard.down(c), up: (c) => page.keyboard.up(c), press: (c) => page.keyboard.press(c) });
const hold = async (page, keys, ms) => { for (const c of keys) await page.keyboard.down(c); await sleep(ms); for (const c of keys) await page.keyboard.up(c); };
// fixtures
const FOOT = [-14, 0, -2, 0], LINE = [-43.2, 0, -50, 39 * Math.PI / 180];
const put = (page, p, loco, v = 0) => page.evaluate((p, loco, v) => { const g = window.__bk, T = window.__bkTHREE; g.input.clear(); g.skater.teleport(new T.Vector3(p[0], p[1], p[2]), p[3], loco); if (v) g.skater.vel.set(Math.sin(p[3]) * v, 0, Math.cos(p[3]) * v); g.rig.snapBehind(g.skater); }, p, loco, v);
const anchor = (page, id) => page.evaluate((id) => { const a = window.__bk.manifest.get(id); return [a.pos.x, a.pos.y, a.pos.z, a.heading]; }, id);
const kicker = async (page, v = 7) => { const a = await anchor(page, 'trick.approach'); await put(page, a, 'ride', v); };
// la ventana de aire en el kicker: SALTO cerca del labio y el truco en el aire
const atLip = async (page) => { const lip = await anchor(page, 'trick.lip'); for (let i = 0; i < 300; i++) { const d = await page.evaluate((l) => { const s = window.__bk.skater; return Math.hypot(s.footPos.x - l[0], s.footPos.z - l[2]); }, lip); if (d < 1.2) return true; await sleep(8); } return false; };
const air = async (page, ms = 3000) => { for (let i = 0; i < ms / 10; i++) { if (await page.evaluate(() => !window.__bk.skater.grounded && window.__bk.skater.airTime > 0.12)) return true; await sleep(10); } return false; };
const ROWS = [
  // ---------------------------------------------------------------- a pie
  ['pie', 'reposo_con_tabla', async (p) => { await put(p, FOOT, 'walk'); await sleep(1800); }, { clips: ['SK_IdleBoard'] }],
  // R2-G8 (usuario): sin trote; a W (3 m/s) la marcha de V4 acelerada
  ['pie', 'marcha_a_velocidad', async (p) => { await put(p, FOOT, 'walk'); await hold(p, ['KeyW'], 2600); await sleep(800); }, { clips: ['SK_WalkBoard'], all: true }],
  ['pie', 'parada', async (p) => { await put(p, FOOT, 'walk'); await hold(p, ['KeyW'], 1500); await sleep(1500); }, { clips: ['SK_IdleBoard'] }],
  ['pie', 'atras', async (p) => { await put(p, FOOT, 'walk'); await hold(p, ['KeyS'], 2500); }, { states: ['walk_back'] }],
  ['pie', 'agachado_delante', async (p) => { await put(p, FOOT, 'walk'); await hold(p, ['KeyC', 'KeyW'], 2200); }, { clips: ['SK_CrouchWalk'] }],
  ['pie', 'agachado_atras', async (p) => { await put(p, FOOT, 'walk'); await hold(p, ['KeyC', 'KeyS'], 2500); }, { clips: ['SK_CrouchWalk'] }],
  ['pie', 'agachado_quieto', async (p) => { await put(p, FOOT, 'walk'); await hold(p, ['KeyC'], 2200); }, { clips: ['SK_CrouchIdle'] }],
  ['pie', 'giro_con_pasos', async (p) => { await put(p, FOOT, 'walk'); await hold(p, ['KeyD'], 2000); }, { clips: ['SK_WalkBoard'] }],
  ['pie', 'salto_y_recepcion', async (p) => { await put(p, FOOT, 'walk'); await sleep(400); await k(p).press('Space'); await sleep(1500); }, { clips: ['SK_HopBoard'], states: ['walk_air'] }],
  ['pie', 'caida_sin_salto', async (p) => { const t = await p.evaluate(() => { let o = null; window.__bk.world.forEachCollider((c) => { if (window.__bk.park.colliderName(c.handle) === 'tut_platform' && !o) { const t = c.translation(); o = [t.x, t.y + c.shape.halfExtents.y, t.z]; } }); return o; }); await put(p, [t[0], t[1] + 0.05, t[2], Math.PI / 2], 'walk'); await sleep(400); await hold(p, ['KeyW'], 1600); await sleep(800); }, { states: ['walk_air'], clips: ['SK_HopBoard'] }],
  // ---------------------------------------------------------------- tabla
  ['tabla', 'montar', async (p) => { await put(p, FOOT, 'walk'); await sleep(400); await k(p).press('KeyQ'); await sleep(1500); }, { clips: ['SK_Mount'] }],
  ['tabla', 'bajar', async (p) => { await put(p, FOOT, 'ride'); await sleep(500); await k(p).press('KeyQ'); await sleep(1500); }, { clips: ['SK_Dismount'] }],
  ['tabla', 'pausa_durante_montar', async (p) => { await put(p, FOOT, 'walk'); await sleep(400); await k(p).press('KeyQ'); await sleep(120); await k(p).press('Escape'); await sleep(900); await k(p).press('Escape'); await sleep(1500); }, { clips: ['SK_Mount'], states: ['idle'] }],
  // ---------------------------------------------------------------- suelo en tabla
  ['skate', 'idle', async (p) => { await put(p, LINE, 'ride'); await sleep(1500); }, { clips: ['SK_Idle'] }],
  ['skate', 'push_sostenido_hasta_20', async (p) => { await put(p, LINE, 'ride'); await hold(p, ['KeyW'], 6000); }, { clips: ['SK_Push'], speed: 17 }],
  ['skate', 'coast', async (p) => { await put(p, LINE, 'ride', 9); await sleep(2000); }, { clips: ['SK_Ride'] }],
  ['skate', 'freno', async (p) => { await put(p, LINE, 'ride', 9); await sleep(300); await hold(p, ['KeyS'], 1300); }, { clips: ['SK_Brake'] }],
  ['skate', 'reversa', async (p) => { await put(p, LINE, 'ride'); await hold(p, ['KeyS'], 3000); }, { states: ['reverse'] }],
  ['skate', 'carve_izq', async (p) => { await put(p, LINE, 'ride', 8); await hold(p, ['KeyA'], 1500); }, { clips: ['SK_CarveL'] }],
  ['skate', 'carve_der', async (p) => { await put(p, LINE, 'ride', 8); await hold(p, ['KeyD'], 1500); }, { clips: ['SK_CarveR'] }],
  ['skate', 'carve_en_reversa', async (p) => { await put(p, LINE, 'ride'); await k(p).down('KeyS'); await sleep(1800); await hold(p, ['KeyA'], 1200); await k(p).up('KeyS'); }, { states: ['reverse'], clips: ['SK_CarveL', 'SK_CarveR'] }],
  ['skate', 'agachado', async (p) => { await put(p, LINE, 'ride', 6); await hold(p, ['KeyC'], 1600); }, { clips: ['SK_CrouchRide'] }],
  ['skate', 'scoot', async (p) => { await put(p, LINE, 'ride'); await hold(p, ['KeyC', 'KeyW'], 2200); }, { clips: ['SK_Scoot'] }],
  // ---------------------------------------------------------------- aire
  ['aire', 'ollie_aire_recepcion', async (p) => { await put(p, LINE, 'ride', 7); await sleep(300); await k(p).press('Space'); await sleep(1600); }, { clips: ['SK_Pop', 'SK_Air', 'SK_Land', 'SK_Catch'] }],
  ['aire', 'kickflip', async (p) => { await kicker(p); await atLip(p); await k(p).press('Space'); await air(p); await k(p).down('KeyA'); await k(p).press('Space'); await sleep(250); await k(p).up('KeyA'); await sleep(1600); }, { tricks: ['kickflip'], clips: ['SK_FlipKick'] }],
  ['aire', 'heelflip', async (p) => { await kicker(p); await atLip(p); await k(p).press('Space'); await air(p); await k(p).down('KeyD'); await k(p).press('Space'); await sleep(250); await k(p).up('KeyD'); await sleep(1600); }, { tricks: ['heelflip'], clips: ['SK_FlipHeel'] }],
  ['aire', 'frontflip', async (p) => { await kicker(p, 8); await atLip(p); await k(p).press('Space'); await air(p); await k(p).down('KeyW'); await k(p).press('Space'); await sleep(250); await k(p).up('KeyW'); await sleep(1800); }, { tricks: ['frontflip'] }],
  ['aire', 'backflip', async (p) => { await kicker(p, 8); await atLip(p); await k(p).press('Space'); await air(p); await k(p).down('KeyS'); await k(p).press('Space'); await sleep(250); await k(p).up('KeyS'); await sleep(1800); }, { tricks: ['backflip'] }],
  ['aire', 'land_hard', async (p) => { await put(p, [LINE[0], 3.2, LINE[2], LINE[3]], 'ride', 4); await sleep(1500); }, { clips: ['SK_LandHard'] }],
  // ---------------------------------------------------------------- trucos
  ['trucos', 'giro_180', async (p) => { await kicker(p); await atLip(p); await k(p).press('Space'); await air(p); await k(p).down('KeyA'); await k(p).press('KeyF'); await sleep(250); await k(p).up('KeyA'); await sleep(1600); }, { tricks: ['spin180'] }],
  ['trucos', 'giro_360', async (p) => { await kicker(p, 8); await atLip(p); await k(p).press('Space'); await air(p); await k(p).down('KeyD'); await k(p).press('KeyF'); await sleep(250); await k(p).up('KeyD'); await sleep(1800); }, { tricks: ['spin360'] }],
  ['trucos', 'revert', async (p) => { await put(p, LINE, 'ride'); await hold(p, ['KeyS'], 1600); await k(p).press('KeyF'); await sleep(120); await k(p).press('KeyF'); await sleep(1500); }, { states: ['revert'], locos: ['revert'] }],
  ['trucos', 'fakie_ollie', async (p) => { await put(p, LINE, 'ride'); await k(p).down('KeyS'); await sleep(1800); await k(p).press('Space'); await sleep(1200); await k(p).up('KeyS'); }, { clips: ['SK_Pop', 'SK_Air'] }],
  ['trucos', 'manual', async (p) => { await put(p, LINE, 'ride', 6); await sleep(200); await hold(p, ['KeyF'], 1800); await sleep(800); }, { clips: ['SK_Manual'] }],
  ['trucos', 'grab', async (p) => { await kicker(p, 8); await atLip(p); await k(p).press('Space'); await air(p); await hold(p, ['KeyF'], 700); await sleep(1200); }, { clips: ['SK_Grab'] }],
  ['trucos', 'grind', async (p) => { const a = await anchor(p, 'rail.approach'); await put(p, a, 'ride', 6);
    for (let i = 0; i < 400; i++) { const d = await p.evaluate(() => { const g = window.__bk, s = g.skater, P = s.footPos; let best = 9; for (const r of g.park.rails) { const ax = r.a.x, az = r.a.z, bx = r.b.x, bz = r.b.z, vx = bx - ax, vz = bz - az, L2 = vx * vx + vz * vz; const t = Math.max(0, Math.min(1, ((P.x - ax) * vx + (P.z - az) * vz) / L2)); best = Math.min(best, Math.hypot(P.x - ax - vx * t, P.z - az - vz * t)); } return best; }); if (d < 1.1) break; await sleep(8); }
    await k(p).press('Space'); await sleep(100); await hold(p, ['KeyF'], 2500); }, { clips: ['SK_Grind'], locos: ['grind'] }],
  // ---------------------------------------------------------------- recuperación
  ['recuperacion', 'impacto_estrella_pared', async (p) => { await put(p, [-14, 0, -2, 0], 'ride', 9.3); await k(p).down('KeyW'); for (let i = 0; i < 300; i++) { if (await p.evaluate(() => window.__bk.skater.loco === 'impact')) break; await sleep(15); } await k(p).up('KeyW'); await sleep(4500); }, { clips: ['SK_ImpactStar', 'SK_ImpactLand', 'SK_GetUp'], all: true }],
  ['recuperacion', 'reaccion_intermedia', async (p) => { await put(p, [-14, 0, 22, 0], 'ride', 6.5); await sleep(3000); }, { bump: true }],   // misma pared que la estrella (z≈26) por debajo del umbral
  ['recuperacion', 'coche_con_vueltas', async (p) => { await p.evaluate((sv) => { const st = window.__bk.state; st.p.collected = sv.collected.slice(); st.p.revealSeen = true; window.__bk.park.setCenter?.(1); window.__bk.cars.setActive(true, 0); }, SAVE_20); await sleep(500); await p.evaluate(() => { const g = window.__bk, T = window.__bkTHREE, C = g.cars, c = C.cars[0]; const a = C.phase + c.offset - 12 / 17.5, pose = window.__bkCarPose(a), q = pose.pos; g.skater.teleport(new T.Vector3(q.x, 0, q.z), Math.atan2(-pose.vel.x, -pose.vel.z), 'walk'); g.rig.snapBehind(g.skater); g.skater.impactProtectUntil = -1; }); await sleep(6000); }, { phases: ['air', 'land', 'getup'], carSpin: true }],
  ['recuperacion', 'bail', async (p) => { await kicker(p, 8); await atLip(p); await k(p).down('KeyA'); await k(p).press('Space'); await air(p, 2000); for (let i = 0; i < 200; i++) { if (await p.evaluate(() => window.__bk.skater.grounded)) break; await sleep(10); } await k(p).up('KeyA'); await sleep(2500); }, { locos: ['bail'], clips: ['SK_Bail'] }],   // aterrizaje cruzado (cuerpo girado en el aire)
  // ---------------------------------------------------------------- actividad
  ['actividad', 'charla_pantera', async (p) => { await p.evaluate(() => { const g = window.__bk, z = g.park.zones.get('act.pantherTalk'), pan = g.manifest.get('npc.la_pantera'); g.skater.teleport(z.pos.clone(), Math.atan2(pan.pos.x - z.pos.x, pan.pos.z - z.pos.z), 'walk'); g.rig.snapBehind(g.skater); }); await sleep(600); await k(p).press('KeyE'); await sleep(3500); }, { modes: ['activity'] }],
  ['actividad', 'baile_3_rondas_tabla_aparcada', async (p) => { await p.evaluate(() => { const g = window.__bk, z = g.park.zones.get('act.danceCombo'); g.skater.teleport(z.pos.clone(), 0, 'walk'); g.rig.snapBehind(g.skater); }); await sleep(600); await k(p).press('KeyE'); await sleep(1500);
    const KEY = { up: 'ArrowUp', down: 'ArrowDown', left: 'ArrowLeft', right: 'ArrowRight' };
    for (let r = 0; r < 3; r++) { const seq = await p.evaluate(() => [...document.querySelectorAll('#dance-seq span')].map((s) => s.getAttribute('aria-label'))); for (const d of seq) { await k(p).press(KEY[d]); await sleep(170); } await sleep(3000); if (r < 2) { await k(p).press('ArrowUp'); await sleep(800); } } }, { overrides: true, modes: ['activity'] }],
  ['actividad', 'baile_pausa_y_salir', async (p) => { await p.evaluate(() => { const g = window.__bk, z = g.park.zones.get('act.danceCombo'); g.skater.teleport(z.pos.clone(), 0, 'walk'); g.rig.snapBehind(g.skater); }); await sleep(600); await k(p).press('KeyE'); await sleep(1500); await k(p).press('Escape'); await sleep(1000); await k(p).press('Escape'); await sleep(800); await p.evaluate(() => document.querySelector('#dance button[data-k="exit"], #dance-exit, #btn-dance-exit')?.click()); await sleep(1500); }, { modes: ['activity', 'explore'] }],
];
await runTest(R, async () => {
  const b = await launch();
  try {
    const page = await openGame(b, R, { save: { ...SAVE_20, activities: { ...SAVE_20.activities, danceCombo: false, pantherTalk: false }, partials: { ...SAVE_20.partials, danceRounds: 0 } } }); await clickStart(page); await sleep(2000);
    await page.evaluate(() => {
      const g = window.__bk, V = g.visual; document.getElementById('hint').hidden = true;
      window.__cov = { on: false, rows: [] }; const r0 = g.render.bind(g);
      g.render = () => { r0(); const C = window.__cov; if (!C.on) return; const s = g.skater; const ws = []; for (const [n, a] of V.actions) { if (!a.isScheduled() || !a.enabled) continue; const w = a.getEffectiveWeight(); if (w > 0.05) ws.push([n, +w.toFixed(2)]); }   // solo acciones en reproducción ws.sort((x, y) => y[1] - x[1]);
        C.rows.push({ t: +g.clock.toFixed(3), st: s.state, loco: s.loco, tr: s.trick?.kind ?? null, ph: s.impactPhase, mode: g.mode, v: +Math.hypot(s.vel.x, s.vel.z).toFixed(1), bump: s.bumpT > 0, spin: V.impactSpin ?? 0, ov: V.override ?? null, top: ws.slice(0, 3) }); };
    });
    const out = [];
    for (const [fam, name, act, exp] of ROWS) {
      if (ONLY && !ONLY.includes(name)) continue;
      await page.evaluate(() => { window.__cov.rows = []; window.__cov.on = true; });
      let err = null;
      const dir = await recordClip(page, R, `${fam}_${name}`, async () => { try { await act(page); } catch (e) { err = String(e); } }, { quality: 62, maxWidth: 720, everyNthFrame: 1 });
      const rows = await page.evaluate(() => { window.__cov.on = false; return window.__cov.rows; });
      for (const c of ['KeyW', 'KeyA', 'KeyS', 'KeyD', 'KeyC', 'KeyF']) await page.keyboard.up(c);
      try { execFileSync('python3', [path.join(HERE, 'frames2webp.py'), dir, '6', '24']); } catch { /* sin hoja */ }
      const seen = (n) => rows.some((r) => r.top.some(([c, w]) => c === n && w > 0.4) || r.ov === n);
      const clipsSeen = [...new Set(rows.flatMap((r) => r.top.filter(([, w]) => w > 0.4).map(([c]) => c)).concat(rows.map((r) => r.ov).filter(Boolean)))];
      const okClips = !exp.clips || (exp.all ? exp.clips.every(seen) : exp.clips.some(seen));
      const okStates = !exp.states || exp.states.some((s) => rows.some((r) => r.st === s));
      const okLocos = !exp.locos || exp.locos.some((s) => rows.some((r) => r.loco === s));
      const okTricks = !exp.tricks || exp.tricks.some((s) => rows.some((r) => r.tr === s));
      const okPh = !exp.phases || exp.phases.every((s) => rows.some((r) => r.ph === s));
      const okSpeed = !exp.speed || rows.some((r) => r.v >= exp.speed);
      const okBump = !exp.bump || rows.some((r) => r.bump);
      const okSpin = !exp.carSpin || rows.some((r) => r.spin > 5);
      const okModes = !exp.modes || exp.modes.every((m) => rows.some((r) => r.mode === m));
      const okOv = !exp.overrides || rows.some((r) => r.ov);
      const ok = !err && okClips && okStates && okLocos && okTricks && okPh && okSpeed && okBump && okSpin && okModes && okOv;
      const row = { fam, name, ok, err, frames: rows.length, clipsSeen, states: [...new Set(rows.map((r) => r.st))], locos: [...new Set(rows.map((r) => r.loco))], tricks: [...new Set(rows.map((r) => r.tr).filter(Boolean))], phases: [...new Set(rows.map((r) => r.ph).filter(Boolean))], vmax: Math.max(0, ...rows.map((r) => r.v)), video: path.relative(path.resolve(HERE, '../../..'), path.join(dir, 'clip.webp')), hoja: path.relative(path.resolve(HERE, '../../..'), path.join(dir, 'hoja.jpg')), duracion: rows.length ? r3(rows.at(-1).t - rows[0].t) : 0 };
      out.push(row); console.log(JSON.stringify({ fam, name, ok, clipsSeen: row.clipsSeen.slice(0, 8), states: row.states, tricks: row.tricks, phases: row.phases, vmax: row.vmax }));
      // limpieza entre filas: salir de actividad/preview/pausa y volver a explorar a pie
      for (let i = 0; i < 6; i++) { const md = await page.evaluate(() => window.__bk.mode); if (md === 'explore') break; await page.keyboard.press('Escape'); await sleep(500); }
      await page.evaluate(() => { const g = window.__bk; if (g.paused) g.setPaused(false); });
      await sleep(400);
    }
    R.measure('matriz', out);
    fs.writeFileSync(R.file_('matriz.json'), JSON.stringify(out, null, 1));
    R.check(out.every((x) => x.ok), `todas las filas alcanzan su estado/clip esperado con entrada real (${out.filter((x) => x.ok).length}/${out.length})`, 'input', out.filter((x) => !x.ok).map((x) => ({ name: x.name, clipsSeen: x.clipsSeen, states: x.states, err: x.err })));
    R.pendingHuman('Visionado continuo de cada vídeo de la matriz con registro literal de intervalos (G8-V)');
  } finally { await b.close(); }
}, { timeoutMs: 3600000 });
