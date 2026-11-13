// EXT-04: mando SIMULADO por el adaptador real (input.fakePad → pollPad → sample → controlador). Sin mando físico en
// esta máquina: la prueba física queda pendiente y declarada. Mapeo estándar W3C: 0 A SALTO · 1 B AGACHARSE · 2 X EXTRA ·
// 3 Y ACCIÓN · 9 Start pausa · 11 R3 recentrar · 12–15 cruceta · ejes 0/1 stick izq · 2/3 stick dcho.
//   node tools/v3/gamepad.mjs → captures/v3/P5/EXT-04/gamepad.json
import { Report, launch, openGame, clickStart, sleep } from './lib.mjs';

const R = new Report('P5/EXT-04', 'gamepad', { method: 'mando simulado (fakePad) por el adaptador real de input.ts; fixture: posición de salida; sin mando físico (pendiente declarado)' });
const browser = await launch();
const page = await openGame(browser, R, { viewport: { width: 900, height: 620, deviceScaleFactor: 1 }, save: null });
const pad = (axes = [0, 0, 0, 0], pressed = [], connected = true) => page.evaluate(({ axes, pressed, connected }) => {
  const buttons = Array.from({ length: 17 }, (_, i) => ({ pressed: pressed.includes(i), value: pressed.includes(i) ? 1 : 0 }));
  window.__bk.input.fakePad = { id: 'Mando estándar simulado', connected, axes, buttons };
}, { axes, pressed, connected });
const tap = async (btn, axes = [0, 0, 0, 0]) => { await pad(axes, [btn]); await sleep(80); await pad(axes, []); await sleep(60); };
const S = () => page.evaluate(() => { const g = window.__bk, s = g.skater; return { loco: s.loco, state: s.state, speed: +s.speed.toFixed(2), crouch: s.isCrouched, source: g.input.source, paused: g.paused, mode: g.mode, ev: s.events.slice(window.__e0 ?? -10).map((e) => e.e), camYaw: +g.rig.yaw?.toFixed?.(3), move: g.input.read(), log: g.input.log.slice(-4) }; });
const mark = () => page.evaluate(() => { window.__e0 = window.__bk.skater.events.length; });

try {
  await clickStart(page);
  await page.evaluate(() => { document.getElementById('hint').hidden = true; const g = window.__bk, S = g.park.sector('no_me_guillo'); g.skater.teleport(S.P(44, -10), S.ccw(-10) + Math.PI, 'walk'); g.rig.snapBehind(g.skater); g.input.clear(); });
  await mark();

  // 1. stick izquierdo adelante: anda → monta → rueda; la fuente activa pasa a mando
  await pad([0, -1, 0, 0]); await sleep(2200);
  let s = await S();
  R.check(s.source === 'gamepad' && s.loco === 'ride' && s.speed > 2.5 && s.log.some((l) => l.startsWith('pad:')), 'stick izq adelante: conecta, la fuente activa es el mando y monta/rueda', 'input', s);
  // 2. deriva pequeña bajo la zona muerta: no mueve
  await pad([0.1, 0.08, 0.12, -0.1]); await sleep(1500);
  s = await S();
  R.check(Math.hypot(s.move.x, s.move.y) === 0, 'deriva de 0,1–0,12 en ambos sticks queda dentro de la zona muerta (sin movimiento ni cámara)', 'input', s);
  // 3. teclado prioritario sobre deriva del mando
  await page.keyboard.down('KeyW'); await sleep(300); s = await S(); await page.keyboard.up('KeyW');
  R.check(s.move.y > 0.9, 'el teclado no queda tapado por la deriva del mando', 'input', s);
  // 4. diagonal radial
  await pad([0.7, -0.7, 0, 0]); await sleep(200); s = await S();
  const mag = Math.hypot(s.move.x, s.move.y), ang = Math.atan2(s.move.x, s.move.y) * 180 / Math.PI;
  R.check(mag > 0.9 && mag <= 1.0001 && Math.abs(ang - 45) < 3, 'diagonal: magnitud radial ≤1 y dirección 45° conservadas', 'input', { mag: +mag.toFixed(3), ang: +ang.toFixed(1) });
  // 5. A = SALTO (ollie rodando), X mantenido = EXTRA (manual), B mantenido = agacharse
  await pad([0, -1, 0, 0]); await sleep(1500); await mark();
  await tap(0, [0, -1, 0, 0]); await sleep(900);
  s = await S(); R.check(s.ev.includes('pop') && s.ev.includes('takeoff'), 'A pulsado rodando = ollie (flanco una vez)', 'input', s);
  // ruta fija para el manual (tras el ollie podía llegar a un obstáculo y pararse en seco)
  await pad(); await page.evaluate(() => { const g = window.__bk, S = g.park.sector('no_me_guillo'); g.skater.teleport(S.P(44, -10), S.ccw(-10) + Math.PI, 'ride'); g.input.clear(); });
  await pad([0, -1, 0, 0]); await sleep(1600); await mark();
  const trace = []; const tr = async () => { const x = await S(); trace.push([x.loco, x.speed]); };
  await tr(); await pad([0, 0, 0, 0], [2]); for (let i = 0; i < 10; i++) { await sleep(50); await tr(); } s = await S(); await pad([0, 0, 0, 0], []); await sleep(300);
  R.note({ manualTrace: trace });
  R.check(trace.filter((t) => t[0] === 'manual').length >= 5, 'X mantenido rodando = EXTRA (manual sostenido hasta agotar velocidad)', 'input', { trace });
  await pad([0, 0, 0, 0], [1]); await sleep(400); s = await S(); await pad(); await sleep(400);
  R.check(s.crouch, 'B mantenido = agacharse', 'input', s);
  // 6. cámara con stick derecho y R3 recentra
  const y0 = (await S()).camYaw; await pad([0, 0, 1, 0]); await sleep(600); await pad(); const y1 = (await S()).camYaw;
  R.check(Number.isFinite(y0) && Math.abs(y1 - y0) > 0.3, 'stick derecho orbita la cámara', 'input', { y0, y1 });
  await tap(11); await sleep(700); const y2 = (await S()).camYaw;
  R.check(Math.abs(y2 - y0) < Math.abs(y1 - y0), 'R3 recentra la cámara detrás', 'input', { y0, y1, y2 });
  // 7. Start pausa; con pausa el stick no mueve; B cierra
  await pad(); await sleep(300); await tap(9); s = await S();
  const p0 = await page.evaluate(() => window.__bk.skater.footPos.toArray());
  await pad([0, -1, 0, 0]); await sleep(700); const p1 = await page.evaluate(() => window.__bk.skater.footPos.toArray()); await pad(); await sleep(100);
  R.check(s.paused && Math.hypot(p1[0] - p0[0], p1[2] - p0[2]) < 0.01, 'Start pausa y el juego no recibe el stick mientras tanto', 'input', { paused: s.paused, moved: +Math.hypot(p1[0] - p0[0], p1[2] - p0[2]).toFixed(3) });
  await tap(1); await sleep(300); s = await S();
  R.check(!s.paused, 'B (atrás) cierra la pausa', 'input', s);
  // 8. baile con cruceta (Y para empezar) y ronda guardada
  await page.evaluate(() => { const g = window.__bk, c = g.manifest.get('dance.center'); g.skater.teleport(c.pos.clone(), c.heading, 'walk'); g.input.clear(); });
  await sleep(600); await tap(3); await sleep(700);
  s = await S(); const danceOpen = await page.evaluate(() => !document.getElementById('dance').hidden);
  for (const b of [12, 15, 12]) await tap(b);
  await sleep(300);
  const partial = await page.evaluate(() => window.__bk.state.p.partials.danceRounds);
  R.check(danceOpen && partial === 1, 'Y empieza el baile y la cruceta (▲▶▲) gana la ronda 1, guardada', 'input', { danceOpen, partial });
  await page.evaluate(() => document.getElementById('dance-exit').click()); await sleep(400);
  // 9. desconexión a mitad de movimiento: sin entrada atascada
  await page.evaluate(() => { const g = window.__bk, S = g.park.sector('no_me_guillo'); g.skater.teleport(S.P(44, -10), S.ccw(-10) + Math.PI, 'ride'); g.input.clear(); });
  await pad([0, -1, 0, 0]); await sleep(1500);
  await pad([0, -1, 0, 0], [], false); await sleep(2500); s = await S();
  R.check(Math.hypot(s.move.x, s.move.y) === 0 && s.speed < 1.5 && s.log.some((l) => l.startsWith('pad:')), 'desconectar con el stick empujado limpia la entrada (frena, sin movimiento atascado)', 'input', s);
  R.note('Mando físico: no disponible en esta máquina → prueba física pendiente (registrar modelo cuando se pruebe).');
} catch (e) { R.data.errors.push('HARNESS ' + (e?.stack ?? e)); }
finally { await browser.close(); R.finish(); }
