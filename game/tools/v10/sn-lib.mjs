// V10 · utilidades de SECRETNOVIO para pruebas y campaña (estado del reto y recorrido con TECLADO REAL: TREPAR, W, ¡BAJAR!, SALTO).
import { sleep } from '../v8/lib.mjs';
import { Pilot } from '../v4/pilot.mjs';
// V10.1 (usuario, 19 oct: el interior de SECRETNOVIO gira −45° hacia la esquina de la plaza; cambio de diseño aprobado): los puntos del recorrido están en el marco del reto (sn_kit.json); `snFrame` los lleva al mundo con el giro real del grupo.
export async function snFrame(page) { const th = await page.evaluate(() => window.__bk.park.sn.group.rotation.y), c = Math.cos(th), s = Math.sin(th);
  return { th, W: (x, z) => [x * c + z * s, -x * s + z * c], L: (x, z) => [x * c - z * s, x * s + z * c], H: (h) => h + th }; }
export const snState = (page) => page.evaluate(() => { const g = window.__bk, a = g.activities.find((x) => x.id === 'secretJump'), s = g.skater, c = g.rig.cam.position, RA = window.__bkRapier;
  const camHit = g.world.intersectionWithShape({ x: c.x, y: c.y, z: c.z }, { x: 0, y: 0, z: 0, w: 1 }, new RA.Ball(0.1), RA.QueryFilterFlags.EXCLUDE_SENSORS, undefined, s.collider, undefined, (cc) => !g.npcColliders.has(cc.handle) && !g.park.cameraIgnore.has(cc.handle) && !g.park.b.thin.has(cc.handle));
  const dCar = Math.min(...g.cars.cars.map((k) => Math.hypot(k.pos.x - s.footPos.x, k.pos.z - s.footPos.z)));
  return { phase: a.phase, armed: a.armed, apex: a.apex, fails: a.failures.length, ok: a.successes, mode: g.mode, foot: [s.footPos.x, s.footPos.y, s.footPos.z], hot: document.getElementById('btn-jump').classList.contains('hot'),
    camIn: camHit ? g.park.colliderName(camHit.handle) : null, dCar, action: !document.getElementById('btn-action')?.hidden ? document.getElementById('btn-action')?.textContent : null,
    ladder: (g.activities.find((x) => x.id === 'ladderClimb') || {}).phase, shake: g.rig.shake ?? 0, done: g.state.p.finalDone, proof: g.state.p.finalProof?.kind ?? null, open: g.centerOpen, flip: g.visual.extPose?.flip ?? 0,
    circle: a.circle ? { i: a.circle.i, p: +a.circle.p.toFixed(3), misses: a.circle.misses } : null, hits: (a.hits ?? []).filter((h) => h !== null).length }; });

/** Recorrido completo desde el pie de la escalera. `jump`: 'hot' (SALTO cuando el botón se marca), 'early' (una pulsación al empezar la
 *  bajada, antes de la ventana) o false. `place`: colocar a ANMI en `sn.retry` (fixture) o llegar andando desde donde esté. */
export async function snRun(page, R, { jump = 'hot', place = true, circles = 'hit' } = {}) {   // V10.1 P04: circles 'hit' | 'miss' | 'none'
  const st = snState;
  const P = new Pilot(page, R); await P.buildNav();
  if (place) {
  await page.evaluate(() => { const g = window.__bk, a = g.manifest.get('sn.retry'); g.input.clear(); g.skater.teleport(a.pos.clone(), a.heading, 'walk'); g.rig.snapBehind(g.skater); });
  R.fixture('ANMI al pie de la escalera de A (centro abierto, 20 patatas)', {}); await sleep(600); }
  const F = await snFrame(page);
  await P.walkTo(F.W(5.65, -12.7), { tol: 0.35, maxMs: 20000 });
  // trepar: E al pie y W hasta desembarcar
  let s = await st(page); for (let i = 0; i < 10 && !(s.action && /TREPAR/.test(s.action)); i++) { await sleep(200); s = await st(page); }
  const climbOffer = !!(s.action && /TREPAR/.test(s.action)); await page.keyboard.press('KeyE'); await sleep(400); await page.keyboard.down('KeyW');
  const t0 = Date.now(); let maxY = 0; while (Date.now() - t0 < 25000) { s = await st(page); maxY = Math.max(maxY, s.foot[1]); if (s.ladder === 'off' && s.foot[1] > 6.5) break; await sleep(80); }
  await page.keyboard.up('KeyW'); await sleep(500);
  const top = await st(page);
  // al carril de bajada (centro de la coronación, mirando a +Z) y ¡BAJAR!
  await P.follow([F.W(1.5, -12.6), F.W(0, -12.5)], { tol: 0.35, maxMs: 12000 }); await sleep(300);
  s = await st(page); const dropOffer = !!(s.action && /BAJAR/.test(s.action)); await page.keyboard.press('KeyE');
  const log = { camIn: [], minCar: 99, apex: 0, maxFlip: 0, samples: 0, jumped: false };
  const t1 = Date.now();
  while (Date.now() - t1 < 30000) { s = await st(page); log.samples++; if (s.camIn && log.camIn.length < 5) log.camIn.push(s.camIn); log.minCar = Math.min(log.minCar, s.dCar); log.apex = Math.max(log.apex, s.apex ?? 0); log.maxFlip = Math.max(log.maxFlip, Math.abs(s.flip)); log.maxShake = Math.max(log.maxShake ?? 0, s.shake);
    if (jump === 'hot' && s.hot && !log.jumped) { log.jumped = true; await page.keyboard.press('Space'); }
    // V10.1 P04: en el vuelo, cada círculo se pulsa (Espacio) cuando el anillo llega a él; `circles: 'miss'` deja pasar el primero dos veces
    if (s.circle && circles !== 'none') { const c = s.circle, key = `${c.i}:${c.misses}`;
      if (!(circles === 'miss' && c.i === 0 && c.misses < 2) && c.p >= 0.88 && c.p <= 1.12 && log.pressed !== key) { log.pressed = key; await page.keyboard.press('Space'); log.presses = (log.presses ?? 0) + 1; } }
    if (jump === 'early' && !log.jumped && Date.now() - t1 > 150) { log.jumped = true; await page.keyboard.press('Space'); }
    if (s.mode === 'preview' || (s.phase === 'idle' && Date.now() - t1 > 2500) || s.done) break; await sleep(s.circle ? 12 : 30); }
  await sleep(1500); const end = await st(page);
  const fin = await page.evaluate(() => (window.__bkFinalLog ?? []).slice(-1)[0] ?? null);
  return { climbOffer, maxY, top, dropOffer, log, end, fin };
}
