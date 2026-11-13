// ACT-03: La Pantera y el circuito NOSVAMOSDEAQUI con TECLADO REAL. Un piloto elige cada ~30 ms la combinación de teclas
// (W, W+A, W+D, A, D) cuya dirección relativa a la cámara apunta mejor al siguiente punto de paso, como un jugador; pulsa
// SALTO ante la barra, mantiene C en el túnel y orbita la cámara con L en la plataforma final. Fixtures declaradas:
// posición de salida junto a Pantera y junto a la salida del circuito (llegar andando desde la llegada lo prueba ACT-02/NPC).
//   P  Pantera: HABLAR → «fuuuuck...» con pausa a mitad (no avanza) → premio único
//   T  circuito: pasos 1–2 → abandonar alejándose → recargar → «SEGUIR CIRCUITO (3/5)» → pasos 3–5 → premio → recogerlo
//   node tools/v3/tutorial.mjs → captures/v3/P3/ACT-03/tutorial.json + tutorial.jpg
import path from 'node:path';
import sharp from 'sharp';
import { Report, launch, openGame, clickStart, sleep } from './lib.mjs';

const R = new Report('P3/ACT-03', 'tutorial', { method: 'teclado real con piloto por puntos de paso (teclas relativas a la cámara); fixtures: posiciones de salida declaradas' });
const browser = await launch();
let page = await openGame(browser, R, { viewport: { width: 900, height: 620, deviceScaleFactor: 1 }, save: null });
const shots = [];
const held = new Set();
async function keys(want) { for (const k of [...held]) if (!want.includes(k)) { await page.keyboard.up(k); held.delete(k); } for (const k of want) if (!held.has(k)) { await page.keyboard.down(k); held.add(k); } }
const tut = () => page.evaluate(() => { const g = window.__bk, t = g.activities.find((a) => a.id === 'skateTutorial'); return { step: t.step, active: t.active, done: !!g.state.p.activities.skateTutorial, partial: g.state.p.partials.tutorialStep, started: g.state.p.partials.tutorialStarted, task: document.getElementById('task')?.textContent ?? '', prompt: document.getElementById('prompt').hidden ? '' : document.getElementById('btn-action').textContent }; });
/** Piloto: conduce hasta un punto (polar del sector NOSVAMOS) con teclas relativas a la cámara. */
async function driveTo(r, da, { tol = 1.2, extra = [], until = null, maxMs = 9000, jumpAtBar = false, noBrake = false } = {}) {
  const t0 = Date.now(); let jumped = false;
  while (Date.now() - t0 < maxMs) {
    const o = await page.evaluate(({ r, da, noBrake }) => {
      const g = window.__bk, S = g.park.sector('nosvamosdeaqui'), P = S.P(r, da), p = g.skater.footPos, f = g.rig.forward;
      const d = { x: P.x - p.x, z: P.z - p.z }, L = Math.hypot(d.x, d.z); const right = { x: -f.z, z: f.x };
      const combos = [['KeyW'], ['KeyW', 'KeyA'], ['KeyW', 'KeyD'], ['KeyA'], ['KeyD']].map((k) => { const y = k.includes('KeyW') ? 1 : 0, x = (k.includes('KeyD') ? 1 : 0) - (k.includes('KeyA') ? 1 : 0); const n = Math.hypot(x, y) || 1; const w = { x: (f.x * y + right.x * x) / n, z: (f.z * y + right.z * x) / n }; return { k, dot: (w.x * d.x + w.z * d.z) / (L || 1) }; });
      combos.sort((a, b) => b.dot - a.dot);
      // control de velocidad: con el punto de lado/detrás se gira sin empujar (y frena si va rápido); cerca, sin pasar de ~5 m/s
      // frenar es S sola (con A/D sería «ir hacia atrás‑lado» y el controlador gira en vez de frenar)
      let k = combos[0].k.slice(); const v = g.skater.speed, vmax = noBrake ? 99 : L < 5 ? 3.5 : 6;
      if (v > vmax + 0.5) k = ['KeyS'];
      else if (combos[0].dot < 0.75) { k = k.filter((x) => x !== 'KeyW'); if (!k.length) k = ['KeyA']; if (v < 0.8) k.push('KeyW'); }   // parado: girar avanzando (no en el sitio)
      else if (v > vmax) k = k.filter((x) => x !== 'KeyW');
      const bar = S.pl(35, -2); return { L, keys: k, barD: Math.hypot(bar.x - p.x, bar.z - p.z), speed: v };
    }, { r, da, noBrake });
    (globalThis.__pilot ??= []).push([+(Date.now() / 1000 % 1000).toFixed(2), r, da, +o.L.toFixed(2), o.keys.join('+'), +o.speed.toFixed(2)]);
    if (o.L < tol) break;
    if (until && (await until())) break;
    await keys([...o.keys, ...extra]);
    if (jumpAtBar && !jumped && o.barD < 1.5 && o.speed > 2.5) { await page.keyboard.press('Space'); jumped = true; }
    await sleep(30);
  }
}

/** Seguimiento de línea radial (da fijo) de r0 a r1: apunta a un punto 1,8 m por delante sobre la recta, como un jugador
 *  que sigue el carril (saltar de punto en punto dejaba hasta 1 m de desvío y chocaba con la boca del túnel). */
async function driveLine(r0, r1, da, { crouchFrom = null, jumpAtBar = false, until = null, maxMs = 9000, brakeAbove = 99 } = {}) {
  const t0 = Date.now(); let jumped = false;
  while (Date.now() - t0 < maxMs) {
    const o = await page.evaluate(({ r1, da }) => {
      const g = window.__bk, S = g.park.sector('nosvamosdeaqui'), p = g.skater.footPos, f = g.rig.forward;
      const ahead = Math.max(2.5, Math.abs(g.skater.speed) * 0.6);   // mirada proporcional a la velocidad (1,8 fijo oscilaba)
      const r = Math.hypot(p.x, p.z), dir = r1 < r ? -1 : 1, look = S.P(r + dir * ahead, da);
      const d = { x: look.x - p.x, z: look.z - p.z }, L = Math.hypot(d.x, d.z) || 1, right = { x: -f.z, z: f.x };
      const lat = (d.x * right.x + d.z * right.z) / L, fw = (d.x * f.x + d.z * f.z) / L;
      const bar = S.pl(35, -2);
      return { r, lat, fw, barD: Math.hypot(bar.x - p.x, bar.z - p.z), speed: g.skater.speed, air: !g.skater.grounded };
    }, { r1, da });
    if ((r1 < r0 && o.r <= r1) || (r1 > r0 && o.r >= r1)) break;
    if (until && (await until())) break;
    let k = o.fw < 0.5 ? (o.lat > 0 ? ['KeyD'] : ['KeyA']) : o.lat > 0.1 ? ['KeyW', 'KeyD'] : o.lat < -0.1 ? ['KeyW', 'KeyA'] : ['KeyW'];
    if (o.speed > brakeAbove) k = ['KeyS'];   // frenar (S sola) antes del túnel: llegar a 8 m/s lo dejaba en ángulo junto a la boca
    else if (o.speed > 4.5) k = k.filter((x) => x !== 'KeyW');
    if (o.speed < 0.8 && !k.includes('KeyW')) k.push('KeyW');
    if (o.air) k = [];   // en el aire no se gira (aterrizar cruzado es caída) ni se cambia de postura
    await keys([...k, ...(crouchFrom !== null && o.r <= crouchFrom && !o.air ? ['KeyC'] : [])]);
    if (jumpAtBar && !jumped && o.barD < 1.5 && o.speed > 2.5) { await page.keyboard.press('Space'); jumped = true; }
    await sleep(30);
  }
}

try {
  await clickStart(page);
  await page.evaluate(() => { document.getElementById('hint').hidden = true; });

  // ---------------------------------------------------------------- P: Pantera con pausa
  await page.evaluate(async () => { const g = window.__bk, T = window.__bkTHREE; await g.loadNpc('la_pantera'); const n = g.manifest.get('npc.la_pantera'); const d = new T.Vector3(Math.sin(n.heading), 0, Math.cos(n.heading)); g.skater.teleport(n.pos.clone().addScaledVector(d, 2.2), n.heading + Math.PI, 'walk'); g.input.clear(); });
  await page.waitForFunction(() => /HABLAR/.test(document.getElementById('btn-action').textContent) && !document.getElementById('prompt').hidden, { timeout: 5000 });
  await page.keyboard.press('KeyE'); await sleep(700);
  await page.keyboard.press('Escape'); await sleep(3500);
  const midPause = await page.evaluate(() => ({ dialog: !document.getElementById('dialog').hidden, paused: window.__bk.paused, done: !!window.__bk.state.p.activities.pantherTalk }));
  await page.keyboard.press('Escape');
  await page.waitForFunction(() => window.__bk.mode === 'explore' && document.getElementById('dialog').hidden, { timeout: 6000 }).catch(() => {});
  const after = await page.evaluate(() => { const g = window.__bk; return { done: !!g.state.p.activities.pantherTalk, avail: g.pickups.filter((p) => p.id === 'no_me_guillo.activity' && p.available && !p.collected).length, mode: g.mode, frozen: g.skater.frozen, decks: (() => { let n = 0; g.scene.traverse((o) => { if (o.name === 'DECK' && o.visible) n++; }); return n; })() }; });
  R.check(midPause.dialog && midPause.paused && !midPause.done, 'P: con la charla en pausa 3,5 s la frase sigue (el reloj de la charla no avanza)', 'input', midPause);
  R.check(after.done && after.avail === 1 && after.mode === 'explore' && !after.frozen && after.decks <= 1, 'P: al terminar, un único premio visible y control devuelto (sin tabla duplicada)', 'input', after);

  // ---------------------------------------------------------------- T: circuito pasos 1–2 y abandono
  await page.evaluate(() => { const g = window.__bk, a = g.manifest.get('tut.start'); g.skater.teleport(a.pos.clone(), a.heading, 'walk'); g.rig.snapBehind(g.skater); g.input.clear(); });
  await page.waitForFunction(() => /CIRCUITO/.test(document.getElementById('btn-action').textContent) && !document.getElementById('prompt').hidden, { timeout: 5000 });
  await page.keyboard.press('KeyE'); await sleep(400);
  let t = await tut(); R.check(t.active && t.step === 0 && t.started, 'T: E en la salida empieza el circuito en el paso 1/5', 'input', t);
  await driveTo(33.5, 15, { tol: 1.0 }); shots.push(await page.screenshot({ type: 'jpeg', quality: 70 }));
  t = await tut(); R.check(t.step === 1, 'T paso 1: impulsar y cruzar la puerta rosa', 'input', t);
  for (const [r, da] of [[37.5, 13], [39.2, 9.5], [38.8, 6.5]]) await driveTo(r, da, { tol: 1.1 });
  await driveTo(38.0, 3.5, { tol: 1.1, until: async () => (await tut()).step >= 2 });
  t = await tut(); R.check(t.step === 2 && t.partial === 2, 'T paso 2: girar por los conos (paso guardado)', 'input', t);
  // abandonar: alejarse >26 m de la salida durante 2 s
  const farFromStart = () => page.evaluate(() => { const g = window.__bk, a = g.manifest.get('tut.start').pos; return g.skater.footPos.distanceTo(a); });
  for (const [r, da] of [[46, 12], [47, 32], [47, 52]]) { if (!(await tut()).active) break; await driveTo(r, da, { tol: 2, maxMs: 9000, until: async () => !(await tut()).active }); }
  await keys([]); await sleep(2600);   // el circuito se pausa tras 2 s lejos de la salida
  R.note({ abandonDist: +(await farFromStart()).toFixed(1) });
  await keys([]); t = await tut();
  R.check(!t.active && t.partial === 2, 'T: alejarse pausa el circuito sin perder el paso', 'input', t);

  // recarga y reanudación
  await page.reload({ waitUntil: 'load' }); await page.waitForFunction(() => window.__bk && !document.getElementById('btn-start').disabled, { timeout: 90000 });
  await clickStart(page); await page.evaluate(() => { document.getElementById('hint').hidden = true; });
  await page.evaluate(() => { const g = window.__bk, a = g.manifest.get('tut.start'); g.skater.teleport(a.pos.clone(), a.heading, 'walk'); g.rig.snapBehind(g.skater); g.input.clear(); });
  await page.waitForFunction(() => /SEGUIR CIRCUITO/.test(document.getElementById('btn-action').textContent) && !document.getElementById('prompt').hidden, { timeout: 5000 }).catch(() => {});
  t = await tut(); R.check(/SEGUIR CIRCUITO \(3\/5\)/.test(t.prompt), 'T: tras recargar la salida ofrece «SEGUIR CIRCUITO (3/5)»', 'input', t);
  await page.keyboard.press('KeyE'); await sleep(300); globalThis.__pilot = [];
  // pasos 3–4: volver a la recta de la barra y entrar hacia dentro
  await page.evaluate(() => { const g = window.__bk, S = g.park.sector('nosvamosdeaqui'); window.__tr = []; window.__e0 = g.skater.events.length; clearInterval(window.__trIv); window.__trIv = setInterval(() => { const p = g.skater.footPos, c = S.toLocal ? S.toLocal(p) : null; window.__tr.push([+g.clock.toFixed(2), +Math.hypot(p.x, p.z).toFixed(2), +(Math.atan2(p.x, -p.z) * 180 / Math.PI).toFixed(1), +g.skater.speed.toFixed(2), g.skater.loco, g.skater.grounded ? 1 : 0, +p.y.toFixed(2)]); }, 120); });
  // abrirse por fuera tras la curva, alinearse en la recta de la barra y entrar recto hacia dentro
  // reintentos de jugador (sin teletransporte): volver a alinearse por fuera y repetir el salto
  let barTries = 0;
  for (; barTries < 3 && (await tut()).step < 3; barTries++) {
    for (const [r, da, tol] of [[41, 6, 1.6], [41, -2, 1.4]]) await driveTo(r, da, { tol });
    await driveLine(41, 33.4, -2, { jumpAtBar: true, until: async () => (await tut()).step >= 3 });
  }
  R.note({ barTries });
  shots.push(await page.screenshot({ type: 'jpeg', quality: 70 }));
  R.note({ pilot: (globalThis.__pilot ?? []).filter((x, i, a) => i % 4 === 0 || i === a.length - 1).slice(-120) }); globalThis.__pilot = [];
  R.note({ barTrace: await page.evaluate(() => { clearInterval(window.__trIv); return { tr: window.__tr, ev: window.__bk.skater.events.slice(window.__e0).map((e) => `${e.t}:${e.e}`), sectorAxis: window.__bk.park.sector('nosvamosdeaqui').th ?? null }; }) });
  t = await tut(); R.check(t.step === 3, 'T paso 3: ollie sobre la barra (no vale rodearla andando)', 'input', t);
  await page.evaluate(() => { const g = window.__bk, gate = g.park.tutorialGates[3]; window.__tt = []; window.__te0 = g.skater.events.length; clearInterval(window.__ttIv); window.__ttIv = setInterval(() => { const s = g.skater, p = s.footPos; const ax = { x: Math.sin(gate.yaw), z: Math.cos(gate.yaw) }; const dx = p.x - gate.c.x, dz = p.z - gate.c.z; window.__tt.push([+g.clock.toFixed(2), +Math.hypot(dx, dz).toFixed(2), 'lat', +(dx * ax.z - dz * ax.x).toFixed(2), +(dx * ax.x + dz * ax.z).toFixed(2), +(((s.heading - gate.yaw) * 180 / Math.PI + 540) % 360 - 180).toFixed(0), +p.y.toFixed(2), +s.speed.toFixed(2), s.loco, s.isCrouched ? 'C' : '-', s.riding ? 'R' : '-']); }, 100); });
  // agachado empujando (scoot) ya va despacio: sin frenar, que casi parado bajaba de la tabla
  let tunnelTries = 0;
  for (; tunnelTries < 3 && (await tut()).step === 3; tunnelTries++) {
    if (tunnelTries === 0) await driveLine(33.7, 27.8, -2, { crouchFrom: 33.2, brakeAbove: 4.2, until: async () => (await tut()).step >= 4 });
    else {
      // como un jugador atascado: rodear el túnel y cruzarlo desde dentro, con recta larga para alinearse (la puerta no tiene sentido)
      await keys([]);
      for (const [r, da, tol] of [[33.6, -7.5, 1.2], [25.5, -7.5, 1.2], [24, -2, 1.0]]) await driveTo(r, da, { tol, maxMs: 9000 });
      await driveLine(24, 33.0, -2, { crouchFrom: 27.4, brakeAbove: 4.2, until: async () => (await tut()).step >= 4 });
    }
  }
  R.note({ tunnelTries });
  shots.push(await page.screenshot({ type: 'jpeg', quality: 70 }));
  R.note({ tunnelTrace: await page.evaluate(() => { clearInterval(window.__ttIv); return { tr: window.__tt, ev: window.__bk.skater.events.slice(window.__te0).map((e) => `${e.t}:${e.e}`) }; }) });
  t = await tut(); R.check(t.step === 4, 'T paso 4: agachado por el túnel', 'input', t);
  // paso 5: parar en la plataforma y orbitar la cámara
  await driveTo(26.6, -10, { tol: 1.2, maxMs: 12000 }); await keys(['KeyS']); await sleep(1000); await keys([]);
  // llegada final en toques cortos hasta quedar parado dentro del círculo (r 1,8)
  for (let i = 0; i < 45; i++) {
    const o = await page.evaluate(() => { const g = window.__bk, z = g.park.zones.get('tut.campad'), p = g.skater.footPos; return { d: Math.hypot(p.x - z.pos.x, p.z - z.pos.z), v: Math.abs(g.skater.speed) }; });
    if (o.d < 1.0 && o.v < 0.6) break;
    if (o.v > 0.8) { await keys(['KeyS']); await sleep(200); await keys([]); continue; }
    await driveTo(26.6, -10, { tol: 0.6, maxMs: 280 }); await keys([]); await sleep(300);
  }
  R.note({ pad: await page.evaluate(() => { const g = window.__bk, z = g.park.zones.get('tut.campad'), p = g.skater.footPos; return { d: +Math.hypot(p.x - z.pos.x, p.z - z.pos.z).toFixed(2), v: +g.skater.speed.toFixed(2), loco: g.skater.loco, orbit: +g.rig.orbitTotal.toFixed(2), world: g.input.world, mode: g.mode }; }) });
  const pcts = [];
  await keys(['KeyL']);
  for (let i = 0; i < 40; i++) { const x = await tut(); const m = /(\d+)%/.exec(x.task); if (m) pcts.push(+m[1]); if (x.done) break; await sleep(150); }
  R.note({ padAfter: await page.evaluate(() => ({ orbit: +window.__bk.rig.orbitTotal.toFixed(2), keyCam: window.__bk.input.keyCam() })) });
  await keys([]); shots.push(await page.screenshot({ type: 'jpeg', quality: 70 }));
  t = await tut();
  R.check(t.done && pcts.length >= 3 && pcts.some((p) => p > 0 && p < 100), 'T paso 5: frenar en la plataforma y girar la cámara con progreso visible hasta completar', 'input', { t, pcts });
  // premio
  const prize = await page.evaluate(() => window.__bk.pickups.filter((p) => p.id === 'nosvamosdeaqui.activity' && p.available && !p.collected).length);
  await driveTo(26, -17.5, { tol: 0.4, maxMs: 6000, until: async () => page.evaluate(() => window.__bk.state.p.collected.includes('nosvamosdeaqui.activity')) });
  await keys([]);
  const got = await page.evaluate(() => window.__bk.state.p.collected.includes('nosvamosdeaqui.activity'));
  R.check(prize === 1 && got, 'T: el premio aparece en la salida y se recoge rodando', 'input', { prize, got });
  const W = 300, H = 207, tiles = await Promise.all(shots.map((b) => sharp(b).resize(W, H).toBuffer()));
  await sharp({ create: { width: W * tiles.length, height: H, channels: 3, background: '#fff' } }).composite(tiles.map((x, i) => ({ input: x, left: i * W, top: 0 }))).jpeg({ quality: 78 }).toFile(path.join(R.dir, 'tutorial.jpg'));
} catch (e) { R.data.errors.push('HARNESS ' + (e?.stack ?? e)); }
finally { await browser.close(); R.finish(); }
