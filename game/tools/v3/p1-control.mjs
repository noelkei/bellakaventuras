// P1 — comprobaciones de control con TECLADO REAL y bucle RAF del juego (Chrome sin interfaz, emulación).
//   node tools/v3/p1-control.mjs [--url http://127.0.0.1:5190/] [--only name,name]
// Cada caso parte de una colocación de fixture registrada (posición inicial); la condición comprobada se ejecuta con
// entradas normales. Resultado: captures/v3/P1/control.json (+ PNG).
import { Report, launch, openGame, clickStart, snap, sleep, VIEWPORTS } from './lib.mjs';

const only = process.argv.includes('--only') ? process.argv[process.argv.indexOf('--only') + 1].split(',') : null;
const R = new Report('P1', 'control', { method: 'teclado real (page.keyboard) + RAF real; fixtures de posición declaradas' });
const browser = await launch();
const page = await openGame(browser, R, { viewport: VIEWPORTS.desktop, save: null });
await clickStart(page);
await page.evaluate(() => { document.getElementById('hint').hidden = true; });

/** Fixture: coloca al jugador (a pie o montado) en una posición de mundo y orienta la cámara detrás. */
async function place(label, x, z, heading, loco = 'walk', y = null) {
  const r = await page.evaluate(({ x, z, heading, loco, y }) => {
    const g = window.__bk, T = window.__bkTHREE, R = window.__bkRapier;
    let yy = y;
    if (yy === null) { const hit = g.world.castRay(new R.Ray({ x, y: 12, z }, { x: 0, y: -1, z: 0 }), 30, true, R.QueryFilterFlags.EXCLUDE_SENSORS, undefined, g.skater.collider); yy = hit ? 12 - hit.timeOfImpact : 0; }
    g.skater.teleport(new T.Vector3(x, yy, z), heading, loco); g.skater.walkLock = false; g.rig.snapBehind(g.skater); g.input.clear();
    return { x, y: yy, z, heading, loco };
  }, { x, z, heading, loco, y });
  R.fixture(label, r); await sleep(250); return r;
}
const events = () => page.evaluate(() => window.__bk.skater.events.slice());
const clearEvents = () => page.evaluate(() => { window.__bk.skater.events.length = 0; });
async function hold(keys, ms, every = 50) { for (const k of keys) await page.keyboard.down(k); const t0 = Date.now(), out = []; while (Date.now() - t0 < ms) { out.push(await snap(page)); await sleep(every); } for (const k of keys) await page.keyboard.up(k); return out; }
const want = (n) => !only || only.includes(n);
const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);

try {
  // zona llana amplia: paseo exterior de NO ME GUILLO hacia el horario
  const flat = await page.evaluate(() => { const S = window.__bk.park.sector('no_me_guillo'); const p = S.P(44, -10); return { x: p.x, z: p.z, h: S.ccw(-10) + Math.PI }; });

  if (want('walk')) {
    await place('llano: a pie', flat.x, flat.z, flat.h, 'walk');
    const tap = await hold(['KeyW'], 160);
    await sleep(500);
    const s = await snap(page);
    R.check(s.loco === 'walk' || s.loco === null, 'toque corto de W: sigue a pie (no monta)', 'input', { loco: s.loco, maxV: Math.max(...tap.map((x) => Math.abs(x.speed))) });
    // andar un poco: con teclado 0,2 s < mountHold → a pie
    await clearEvents();
    const run = await hold(['KeyW'], 1600);
    const ev = await events();
    const mountAt = ev.find((e) => e.e === 'loco:mount');
    const rideAt = ev.find((e) => e.e === 'loco:ride');
    const walkV = Math.max(...run.filter((x) => x.loco === 'walk').map((x) => Math.abs(x.speed)), 0);
    R.check(walkV <= 2.3, 'a pie la velocidad no supera ~2,2 m/s', 'input', { walkV });
    R.check(!!mountAt && !!rideAt, 'mantener W monta en la tabla (intención sostenida)', 'input', { mountAt, rideAt, t0: run[0].clock });
    if (mountAt) R.note({ mountDelay: +(mountAt.t - run[0].clock).toFixed(3) });
    await R.shot(page, 'walk-mount');
  }

  if (want('coast')) {
    await place('llano: montado parado', flat.x, flat.z, flat.h, 'ride');
    await hold(['KeyW'], 3200);
    const a = await snap(page);
    const after = await hold([], 3000, 60);
    const stopI = after.findIndex((x) => Math.abs(x.speed) < 0.05);
    const stop = stopI >= 0 ? after[stopI] : after.at(-1);
    R.check(a.speed > 6.2, 'empuje hasta crucero ≥6,2 m/s', 'input', { v: a.speed });
    const d = dist(a, stop);
    R.check(d > 4.5 && d < 9.5, 'soltar: se para en llano en ~6–8 m (no indefinido)', 'input', { from: a.speed, dist: +d.toFixed(2), t: +(stop.clock - a.clock).toFixed(2) });
    await sleep(700);
    const s2 = await snap(page);
    R.check(s2.loco === 'walk', 'parado y sin intención: baja de la tabla y queda a pie', 'input', { loco: s2.loco });
  }

  if (want('brake')) {
    await place('llano: montado', flat.x, flat.z, flat.h, 'ride');
    await hold(['KeyW'], 3200);
    const a = await snap(page);
    const br = await hold(['KeyS'], 1500, 40);
    const stopI = br.findIndex((x) => Math.abs(x.speed) < 0.1);
    const st = stopI >= 0 ? br[stopI] : br.at(-1);
    const d = dist(a, st);
    R.check(d > 1.5 && d < 4.0, 'frenar (atrás): se detiene en ~2–3 m sin girar ni acelerar hacia atrás', 'input', { from: a.speed, dist: +d.toFixed(2), headingChange: +(Math.abs(st.heading - a.heading)).toFixed(3), maxBackSpeed: Math.min(...br.map((x) => x.speed)) });
  }

  if (want('pivot')) {
    await place('llano: montado parado', flat.x, flat.z, flat.h, 'ride');
    const p0 = await snap(page);
    const tr = await hold(['KeyS'], 900, 40);   // atrás estando parado = kickturn hacia la cámara
    const p1 = await snap(page);
    const turned = Math.abs(((p1.heading - p0.heading + Math.PI * 3) % (Math.PI * 2)) - Math.PI);
    R.check(turned > 2.2 && dist(p0, p1) < 1.6, 'cerca de cero, atrás gira sobre sí (kickturn) sin hacer un círculo grande', 'input', { turned: +turned.toFixed(2), moved: +dist(p0, p1).toFixed(2), states: [...new Set(tr.map((x) => x.state))] });
  }

  if (want('ollie')) {
    await place('llano: montado', flat.x, flat.z, flat.h, 'ride');
    await page.keyboard.down('KeyW'); await sleep(2200);
    await clearEvents();
    const t0 = await page.evaluate(() => window.__bk.clock);
    await page.keyboard.press('Space');
    const air = []; for (let i = 0; i < 16; i++) { air.push(await snap(page)); await sleep(40); }
    await page.keyboard.up('KeyW');
    const ev = await events();
    const pop = ev.find((e) => e.e === 'pop'), take = ev.find((e) => e.e === 'takeoff');
    R.check(!!take, 'ESPACIO montado = ollie (despegue)', 'input', { pop, take });
    if (take) R.check(take.t - t0 <= 0.09, 'latencia tecla→despegue en simulación ≤ 90 ms (incluye hasta 1 frame de render de espera)', 'input', { simMs: Math.round((take.t - t0) * 1000), popMs: pop ? Math.round((pop.t - t0) * 1000) : null });
    const peak = Math.max(...air.map((x) => x.y)) - air[0].y;
    R.check(peak > 0.9, 'altura útil del ollie conservada (>0,9 m)', 'input', { peak: +peak.toFixed(2) });
    await sleep(800);
    // salto a pie: pequeño
    await place('llano: a pie', flat.x, flat.z, flat.h, 'walk');
    const y0 = (await snap(page)).y;
    await page.keyboard.press('Space');
    const hop = []; for (let i = 0; i < 12; i++) { hop.push(await snap(page)); await sleep(30); }
    const hp = Math.max(...hop.map((x) => x.y)) - y0;
    R.check(hp > 0.12 && hp < 0.33, 'a pie, ESPACIO = saltito peatonal ~0,25 m (no alcanza plataformas de ollie)', 'input', { peak: +hp.toFixed(3), loco: hop.at(-1).loco });
  }

  if (want('tunnel')) {
    // túnel del tutorial (techo 1,30): de pie bloquea; agachado pasa; levantarse dentro se pospone
    const t = await page.evaluate(() => { const g = window.__bk, S = g.park.sector('nosvamosdeaqui'); const a = S.P(34.4, -2), b = S.P(30.2, -2); return { ax: a.x, az: a.z, bx: b.x, bz: b.z, h: S.inward(-2) }; });
    await place('antes del túnel NOSVAMOS (rumbo hacia dentro)', t.ax, t.az, t.h, 'ride');
    await hold(['KeyW'], 1800);
    const stand = await snap(page);
    const distTo = Math.hypot(stand.x - t.bx, stand.z - t.bz);
    R.check(distTo > 1.4 && !stand.crouched, 'de pie no cabe en el túnel (se queda en la boca)', 'input', { distToCenter: +distTo.toFixed(2) });
    await place('antes del túnel NOSVAMOS', t.ax, t.az, t.h, 'ride');
    await page.keyboard.down('KeyC'); await sleep(150);
    await hold(['KeyW'], 2300);
    const inside = await snap(page);
    await page.keyboard.up('KeyC'); await sleep(300);
    const still = await page.evaluate(() => ({ crouched: window.__bk.skater.isCrouched, blocked: window.__bk.skater.standBlocked, y: window.__bk.skater.footPos.y }));
    R.check(inside.crouched && Math.hypot(inside.x - t.bx, inside.z - t.bz) < 1.8, 'agachado entra rodando (scoot) en el túnel', 'input', { inside });
    R.check(still.crouched, 'soltar C dentro: sigue agachado bajo el techo (no atraviesa)', 'input', still);
    await clearEvents();
    await page.keyboard.press('Space'); await sleep(200);
    const ev = await events();
    R.check(ev.some((e) => e.e === 'jump-denied') && !ev.some((e) => e.e === 'takeoff'), 'SALTO bajo el techo se deniega', 'input', ev.slice(-3));
    await hold(['KeyW'], 3200);
    await sleep(400);
    const out = await snap(page);
    R.check(!out.crouched, 'al salir del túnel recupera la altura de pie', 'input', { crouched: out.crouched });
  }

  if (want('tthidden')) {
    // ID38: patata bajo el descanso hueco de TRATRATRA, agachado y rodando, sin retirar techo
    const t = await page.evaluate(() => { const g = window.__bk, f = g.manifest.fries.find((x) => x.id === 'tratratra.hidden'), T = window.__bkTHREE; const out = new T.Vector3(f.pos.x, 0, f.pos.z).normalize(); const s = new T.Vector3(f.pos.x, 0, f.pos.z).addScaledVector(out, -4.2); return { x: s.x, z: s.z, h: Math.atan2(out.x, out.z) }; });
    await place('TT hidden: 4,2 m antes, rumbo radial', t.x, t.z, t.h, 'ride');
    await page.keyboard.down('KeyC'); await sleep(150);
    await hold(['KeyW'], 4200);
    await page.keyboard.up('KeyC');
    const got = await page.evaluate(() => window.__bk.state.isCollected('tratratra.hidden'));
    R.check(got, 'ID38: TT hidden se recoge agachado rodando', 'input', await snap(page));
    await R.shot(page, 'tt-hidden');
    await hold(['KeyW'], 1500);
    await sleep(400);
    R.check(!(await snap(page)).crouched, 'ID38: sale por el otro lado y se levanta', 'input');
  }

  if (want('ramps')) {
    // ID54: bank y quarter de las tres esquinas, aproximación rodando desde el suelo por la ruta visible
    for (const th of [45, 135, 225]) {
      const r = await page.evaluate((th) => {
        const a = th * Math.PI / 180, c = { x: 58 * Math.sin(a), z: -58 * Math.cos(a) }, yaw = Math.PI - a;
        const at = (lx, lz) => ({ x: c.x + lx * Math.cos(yaw) + lz * Math.sin(yaw), z: c.z - lx * Math.sin(yaw) + lz * Math.cos(yaw) });
        return { bank: { s: at(0, 10.5), h: yaw + Math.PI }, quarter: { s: at(-3.8, -13), h: yaw } };
      }, th);
      for (const [name, def, peakMin] of [['bank', r.bank, 0.6], ['quarter', r.quarter, 1.1]]) {
        await place(`esquina ${th}° ${name}: salida en suelo`, def.s.x, def.s.z, def.h, 'ride');
        const sm = await hold(['KeyW'], 3400, 60);
        const peak = Math.max(...sm.map((x) => x.y));
        R.check(peak >= peakMin, `ID54 esquina ${th}°: el ${name} se sube rodando desde el suelo (sin choque previo)`, 'input', { peak: +peak.toFixed(2), path: sm.filter((_, i) => i % 6 === 0).map((x) => [x.x.toFixed(1), x.y.toFixed(2), x.z.toFixed(1), x.speed.toFixed(1), x.state, x.loco]) });
      }
    }
  }

  if (want('npc')) {
    // NPC sólido (CTRL-05) + zona a pie: llegar patinando a La Pantera → baja de la tabla y ofrece HABLAR
    const p = await page.evaluate(() => { const a = window.__bk.manifest.get('npc.la_pantera'); return { x: a.pos.x, z: a.pos.z, h: a.heading }; });
    const sx = p.x + Math.sin(p.h) * 7, sz = p.z + Math.cos(p.h) * 7;
    await place('7 m frente a La Pantera, mirando hacia ella', sx, sz, p.h + Math.PI, 'ride');
    await hold(['KeyW'], 2600);
    const s = await snap(page);
    const d = Math.hypot(s.x - p.x, s.z - p.z);
    R.check(d > 0.5, 'no atraviesa a La Pantera (colisión simple)', 'input', { dist: +d.toFixed(2) });
    await sleep(600);
    const st = await page.evaluate(() => ({ loco: window.__bk.skater.loco, action: !document.getElementById('prompt').hidden, label: document.getElementById('btn-action').getAttribute('aria-label') }));
    R.check(st.loco === 'walk' && st.action && st.label === 'HABLAR', 'en el recuadro de actividad baja de la tabla y ofrece HABLAR a pie', 'input', st);
    await R.shot(page, 'npc-area');
  }

  if (want('wall')) {
    // nose/tail contra pared: muro del mural de YINYANG, aproximación oblicua montado
    const w = { x: 44.5, z: -18, h: Math.PI / 2 - 0.35 };
    await place('perímetro este: muro del cuadrado (x=52), rumbo oblicuo', w.x, w.z, w.h, 'ride');
    await hold(['KeyW'], 2600, 60);
    const nose = await page.evaluate(() => {
      const g = window.__bk, s = g.skater, R = window.__bkRapier, d = s.dir;
      const o = { x: s.footPos.x, y: s.footPos.y + 0.27, z: s.footPos.z };
      const h = g.world.castRay(new R.Ray(o, { x: d.x, y: 0, z: d.z }), 2, true, R.QueryFilterFlags.EXCLUDE_SENSORS, undefined, s.collider);
      return { wallAhead: h ? +h.timeOfImpact.toFixed(3) : null, name: h ? g.park.colliderName(h.collider.handle) : null, loco: s.loco, heading: s.heading, pos: s.footPos.toArray() };
    });
    R.check(nose.loco !== 'walk' && (nose.wallAhead === null || nose.wallAhead >= 0.38), 'la nariz de la tabla no atraviesa la pared (≥0,38 m del centro)', 'input', nose);
  }
} catch (e) { R.data.errors.push('HARNESS ' + (e?.stack ?? e)); }
finally { await browser.close(); R.finish(); }
