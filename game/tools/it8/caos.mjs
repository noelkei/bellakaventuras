// IT8 · C3/C4 · guardián de caos. Por cada punto de partida (las zonas de actividad del juego + la plaza + 4 puntos del exterior), `--seg`
// segundos de:
//  · `--tipo mono`: teclas al azar (ordenador) o toques al azar en toda la pantalla + arrastres de joystick (táctil);
//  · `--tipo despistado`: jugador con intención pero sin saber: elige algo que ve (patata, personaje, rampa) y va hacia ello girando, salta,
//    sube y baja de la tabla, habla si le ofrecen algo, abre SKILLS, pausa y sigue, mira con la cámara.
// Detectores (cada uno es una comprobación por punto): errores de página; NaN en posición/velocidad; caer fuera del mundo (y < −4 o fuera
// del cuadrado ±53 m); ATASCO (10 s sin moverse > 0,3 m y la sonda de escape —W, S, giros, salto, tabla— tampoco la mueve); BLOQUEO (modo ≠
// explorar sin pausa ni nada en pantalla > 20 s, o una capa abierta > 15 s que no se cierra con su botón ni con Esc).
// `--rojo`: congela a ANMI al empezar (skater.frozen) → el detector de atasco tiene que saltar.
// Uso: node tools/it8/caos.mjs --url <build> [--tipo mono|despistado] [--seed 5] [--seg 60] [--aparato pc720:h] [--puntos act.graffiti,plaza]
import { Report, runTest, launch, sleep, arg, flag } from '../v8/lib.mjs';
import { open8, start8, dev, S20, S0, rng, Fingers, drainUI, saveJson } from './lib8.mjs';
const TIPO = arg('tipo', 'mono'), SEED = +arg('seed', '5'), SEG = +arg('seg', '60'), ROJO = flag('rojo');
const [DI, O] = (arg('aparato') ?? 'pc720:h').split(':');
const R = new Report(`it8-caos-${TIPO}`, { task: arg('task', 'IT8'), label: `${DI}${O}_s${SEED}${ROJO ? '_rojo' : ''}` });
const EXTRA = { plaza: null, 'ext-n': [0, 0.05, -47], 'ext-e': [47, 0.05, 0], 'ext-s': [0, 0.05, 47], 'ext-o': [-47, 0.05, 0] };
const KEYS = ['KeyW', 'KeyW', 'KeyW', 'KeyA', 'KeyD', 'KeyS', 'Space', 'Space', 'KeyC', 'KeyE', 'KeyE', 'KeyQ', 'KeyF', 'KeyB', 'Digit1', 'Digit3', 'Digit5', 'Digit8', 'KeyR', 'KeyJ', 'KeyL', 'ArrowUp', 'ArrowLeft', 'KeyX', 'Enter', 'KeyT', 'KeyI', 'KeyK'];
const look = (page) => page.evaluate(() => { const g = window.__bk, s = g.skater, vis = (id) => { const e = document.getElementById(id); return !!e && !e.hidden && !e.closest('[hidden]'); }, d2 = document.getElementById('d2');
  const f = s.footPos, v = s.vel; const open = ['dialog', 'pause', 'help', 'settings', 'confirm', 'confirm-plaza', 'glost', 'final', 'ios-app', 'btn-size', 'dance', 'graffiti'].filter(vis);
  return { mode: g.mode, paused: g.paused, loco: s.loco, p: [f.x, f.y, f.z], nan: !Number.isFinite(f.x + f.y + f.z + v.x + v.y + v.z), open, d2: !!d2 && !d2.hidden, busy: g.activities.filter((a) => a.busy || a.seated || a.inAttempt || a.inRun || a.dancing >= 0).map((a) => a.id),
    narr: !!g.narr?.busy, frozen: s.frozen, prompt: vis('prompt') ? document.getElementById('btn-action').textContent : null }; });
/** Cierra lo que haya abierto con su propio botón (o Esc) y dice si lo consiguió. */
async function closeAll(page, touch) {
  for (let i = 0; i < 6; i++) { const s = await look(page); if (!s.open.length && !s.paused && !s.d2) return true;
    const sel = await page.evaluate(() => { const vis = (id) => { const e = document.getElementById(id); return !!e && !e.hidden && !e.closest('[hidden]'); };
      if (vis('confirm')) return '#btn-confirm-no'; if (vis('confirm-plaza')) return '#btn-plaza-no'; if (vis('btn-size')) return '#btn-size-exit'; if (vis('settings')) return '#btn-settings-close'; if (vis('help')) return '#btn-help-close';
      if (vis('ios-app')) return '#btn-ios-no'; if (vis('pause')) return '#btn-resume'; if (vis('dialog')) return '#dialog-ok'; if (vis('dance')) return '#dance-exit'; if (vis('graffiti')) return '#graffiti-exit'; const d = document.getElementById('d2'); if (d && !d.hidden) return '#d2 .d2-btn:last-of-type'; if (vis('final')) return '#btn-close-final'; return null; });
    if (sel) { const c = await page.evaluate((q) => { const e = document.querySelector(q); if (!e) return null; const r = e.getBoundingClientRect(); return r.width ? { x: r.left + r.width / 2, y: r.top + r.height / 2 } : null; }, sel);
      if (c) { if (touch) await page.touchscreen.tap(c.x, c.y); else await page.mouse.click(c.x, c.y); } else await page.keyboard.press('Escape'); }
    else await page.keyboard.press('Escape');
    await sleep(500); }
  const s = await look(page); return !s.open.length && !s.paused && !s.d2;
}
/** Sonda de escape: ¿algún control mueve a ANMI > 0,3 m? */
async function escapes(page) {
  const at = async () => (await look(page)).p;
  const p0 = await at();
  for (const ks of [['KeyW'], ['KeyS'], ['KeyA', 'KeyW'], ['KeyD', 'KeyW'], ['Space', 'KeyW'], ['KeyQ'], ['KeyW']]) {
    for (const k of ks) await page.keyboard.down(k); await sleep(900); for (const k of ks) await page.keyboard.up(k); await sleep(250);
    const p = await at(); if (Math.hypot(p[0] - p0[0], p[2] - p0[2]) > 0.3 || Math.abs(p[1] - p0[1]) > 0.5) return true;
  }
  return false;
}
await runTest(R, async () => {
  const b = await launch(); const report = [];
  const d = dev(DI), touch = d.kind !== 'desktop', rnd = rng(SEED), errors = [];
  try {
    const page = await open8(b, R, d, O, { save: S20, errors });
    await start8(page, touch); await sleep(1500);
    const F = touch ? await new Fingers(page).init() : null;
    const acts = await page.evaluate(() => [...window.__bk.park.zones.entries()].filter(([k]) => k.startsWith('act.') || k === 'sn.drop').map(([k, z]) => [k, [z.pos.x, z.pos.y, z.pos.z]]));
    const want = arg('puntos') ? arg('puntos').split(',') : null;
    const PTS = [...acts, ...Object.entries(EXTRA)].filter(([k]) => !want || want.includes(k));
    for (const [zone, p] of PTS) {
      await closeAll(page, touch);
      await page.evaluate((p) => { const g = window.__bk, T = window.__bkTHREE; if (g.paused) g.setPaused(false); for (const a of g.activities) if (a.busy) a.cancel?.(); if (g.mode !== 'explore') g.setMode?.('explore'); g.input.clear();
        if (p) { // V10.6 (B0, verificación IT8: caos.mjs:57 colocaba a la altura de la zona sin buscar el suelo y en las escaleras empezaba DEBAJO del camino):
          // suelo real con un rayo desde 6 m por encima, como toAct
          const RA = window.__bkRapier, s = g.skater, h = g.world.castRay(new RA.Ray({ x: p[0], y: p[1] + 6, z: p[2] }, { x: 0, y: -1, z: 0 }), 12, true, RA.QueryFilterFlags.EXCLUDE_SENSORS, undefined, s.collider, undefined, (c) => !g.npcColliders.has(c.handle));
          const y = h ? p[1] + 6 - h.timeOfImpact : p[1]; g.skater.teleport(new T.Vector3(p[0], y + 0.05, p[2]), Math.random() * 6.28, 'walk'); } else { const sp = g.manifest.spawn; g.skater.teleport(sp.pos.clone(), sp.heading, 'walk'); } g.rig.snapBehind(g.skater); }, p);
      if (ROJO) await page.evaluate(() => { window.__bk.skater.frozen = true; });
      await sleep(600);
      const ev = []; const held = new Set(); const t0 = Date.now(); let lastMove = { t: Date.now(), p: (await look(page)).p }, stuckChecked = 0, blockSince = null, modalSince = null, out = false, nan = false, atasco = false, bloqueo = false;
      let goal = null, goalT = 0;
      while (Date.now() - t0 < SEG * 1000) {
        // ---- entrada
        if (TIPO === 'mono') {
          if (touch) { const r = rnd();
            if (r < 0.45) { const x = rnd() * page.viewport().width, y = rnd() * page.viewport().height; await page.touchscreen.tap(x, y); }
            else if (r < 0.8) { await F.stick(rnd() * 360, 0.4 + rnd() * 0.6); await sleep(200 + rnd() * 900); if (rnd() < 0.5) { const bt = ['#btn-jump', '#btn-board', '#btn-crouch', '#btn-action', '#btn-dance', '#btn-cam'][Math.floor(rnd() * 6)]; await F.tap(bt); } if (rnd() < 0.6) await F.stickUp(); }
            else { const bt = ['#btn-jump', '#btn-board', '#btn-crouch', '#btn-action', '#btn-dance', '#btn-pause', '#btn-cam', '#btn-lean-l', '#btn-lean-r', '#d2 .d2-btn'][Math.floor(rnd() * 10)]; await F.tap(bt); }
          } else { const k = KEYS[Math.floor(rnd() * KEYS.length)];
            if (['KeyW', 'KeyA', 'KeyD', 'KeyS', 'KeyC'].includes(k) && rnd() < 0.6) { if (held.has(k)) { await page.keyboard.up(k); held.delete(k); } else { await page.keyboard.down(k); held.add(k); } }
            else if (rnd() < 0.03) { await page.keyboard.press('Escape'); await sleep(150 + rnd() * 400); await page.keyboard.press('Escape'); }
            else if (rnd() < 0.04) { const vp = page.viewport(); await page.mouse.move(rnd() * vp.width, rnd() * vp.height, { steps: 4 }); }
            else await page.keyboard.press(k); }
          await sleep(40 + rnd() * 260);
        } else {   // despistado
          const s = await look(page);
          if (!goal || Date.now() > goalT) { goal = await page.evaluate((r) => { const g = window.__bk, f = g.skater.footPos; const c = [];
              for (const p of g.pickups) if (!p.collected && p.spawn) c.push(p.spawn.pos); for (const [, z] of g.park.zones) if (z.pos) c.push(z.pos);
              const near = c.filter((q) => Math.hypot(q.x - f.x, q.z - f.z) < 25); const q = near.length ? near[Math.floor(r * near.length)] : null; return q ? [q.x, q.y, q.z] : null; }, rnd());
            goalT = Date.now() + 4000 + rnd() * 5000; }
          if (s.prompt && rnd() < 0.5) await page.keyboard.press('KeyE');
          else if (s.d2 || s.open.includes('dialog')) { await sleep(400); await page.keyboard.press('KeyE'); }
          else if (goal) { const turn = await page.evaluate((q) => { const s = window.__bk.skater, f = s.footPos, h = Math.atan2(q[0] - f.x, q[2] - f.z); let d = h - s.heading; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI; return d; }, goal);
            const keys = ['KeyW', ...(turn > 0.25 ? ['KeyA'] : turn < -0.25 ? ['KeyD'] : [])];
            for (const k of [...held]) if (!keys.includes(k)) { await page.keyboard.up(k); held.delete(k); } for (const k of keys) if (!held.has(k)) { await page.keyboard.down(k); held.add(k); }
            const r = rnd(); if (r < 0.06) await page.keyboard.press('Space'); else if (r < 0.08) await page.keyboard.press('KeyQ'); else if (r < 0.09) await page.keyboard.press('Digit' + (1 + Math.floor(rnd() * 8))); else if (r < 0.095) { await page.keyboard.press('Escape'); await sleep(700); await page.keyboard.press('Escape'); }
            else if (r < 0.11) { await page.keyboard.down('KeyC'); await sleep(500); await page.keyboard.up('KeyC'); } else if (r < 0.12) await page.keyboard.press('KeyF'); }
          await sleep(120 + rnd() * 200);
        }
        // ---- detectores
        const s = await look(page);
        if (s.nan && !nan) { nan = true; ev.push({ t: Date.now() - t0, k: 'NaN', s }); }
        if (!out && (s.p[1] < -4 || Math.abs(s.p[0]) > 53 || Math.abs(s.p[2]) > 53)) { out = true; ev.push({ t: Date.now() - t0, k: 'FUERA DEL MUNDO', s }); }
        if (s.open.includes('confirm')) { ev.push({ t: Date.now() - t0, k: 'confirmación de borrado abierta' }); await page.evaluate(() => document.getElementById('btn-confirm-no').click()); }
        const quiet = s.mode === 'explore' && !s.paused && !s.open.length && !s.d2 && !s.busy.length && !s.narr;
        if (Math.hypot(s.p[0] - lastMove.p[0], s.p[2] - lastMove.p[2]) > 0.3 || Math.abs(s.p[1] - lastMove.p[1]) > 0.5 || !quiet) lastMove = { t: Date.now(), p: s.p };
        else if (Date.now() - lastMove.t > 10000 && Date.now() - stuckChecked > 10000) { stuckChecked = Date.now(); for (const k of [...held]) { await page.keyboard.up(k); held.delete(k); } if (F) await F.stickUp();
          if (!(await escapes(page))) { atasco = true; ev.push({ t: Date.now() - t0, k: 'ATASCO', s }); } lastMove = { t: Date.now(), p: (await look(page)).p }; }
        const nothing = s.mode !== 'explore' && !s.paused && !s.open.length && !s.d2 && !s.narr && !s.busy.length;
        if (nothing) { blockSince ??= Date.now(); if (Date.now() - blockSince > 20000 && !bloqueo) { bloqueo = true; ev.push({ t: Date.now() - t0, k: 'BLOQUEO (modo sin nada en pantalla)', s }); } } else blockSince = null;
        if (s.open.length && !s.open.includes('dance') && !s.open.includes('graffiti')) { modalSince ??= Date.now(); if (Date.now() - modalSince > 15000) { if (!(await closeAll(page, touch)) && !bloqueo) { bloqueo = true; ev.push({ t: Date.now() - t0, k: 'BLOQUEO (capa que no se cierra)', s }); } modalSince = null; } } else modalSince = null;
      }
      for (const k of held) await page.keyboard.up(k); if (F) await F.stickUp();
      const end = await look(page), fila = { zone, ev, end: { mode: end.mode, loco: end.loco, p: end.p.map((v) => +v.toFixed(2)), busy: end.busy }, errores: errors.splice(0) };
      report.push(fila);
      R.check(!nan && !out && !atasco && !bloqueo && !fila.errores.length, `${TIPO} · ${DI} ${O} · ${zone}: sin NaN, sin caer fuera, sin atasco, sin bloqueo y sin errores (${SEG} s, semilla ${SEED})`, 'input', { ev: ev.slice(0, 4), errores: fila.errores.slice(0, 3) });
      if (ROJO) await page.evaluate(() => { window.__bk.skater.frozen = false; });
    }
    saveJson(`C-caos/${TIPO}_${DI}${O}_s${SEED}${ROJO ? '_rojo' : ''}.json`, report);
  } finally { await b.close(); }
}, { timeoutMs: 7200000 });
