// V10.1 · P11 + P06 (guardián): la ANIMACIÓN de ANMI vuelve siempre al árbol (sin clip forzado de una actividad) y sigue al estado real.
// Causa real de P11 (Fase C, p11-faseC): el reto de SECRETNOVIO dejaba puesto `SK_CrouchRide` (fallo) o `SK_Land` (éxito) para siempre: a pie
// se veía agachada en la tabla, Q «no hacía nada» (subía y bajaba de verdad) y los trucos no se veían. Con TECLADO real (como el usuario):
//  A · golpe de coche en tabla → levantarse a pie → Q monta → W > 6 m/s → kickflip en llano con aterrizaje correcto; override nulo en cada paso
//  B · reto de SN fallado (sin SALTO) → override nulo → golpe de coche → Q monta → W → animación del árbol
//  C · reto de SN superado (SALTO en el aviso) → al cerrar el preview, override nulo
import { Report, runTest, launch, openGame, clickStart, sleep, fixture, SAVE_20 } from '../v8/lib.mjs';
import { snRun } from '../v10/sn-lib.mjs';
const R = new Report('animacion-limpia');
const look = (page) => page.evaluate(() => { const g = window.__bk, s = g.skater, v = g.visual;
  return { loco: s.loco, state: s.state, hv: +Math.hypot(s.vel.x, s.vel.z).toFixed(2), override: v.override, cur: v.currentName, mode: g.mode }; });
async function carHit(page, label) {
  await fixture(page, R, `${label}: ANMI en tabla delante del coche A`, () => {
    const g = window.__bk, T = window.__bkTHREE, C = g.cars, c = C.cars[0], R0 = C.R ?? 17.5; g.input.clear();
    const a = C.phase + c.offset - 16 / R0, pose = window.__bkCarPose(a), p = pose.pos.clone(), meet = window.__bkCarPose(a + 4 / R0).pos;
    g.skater.teleport(new T.Vector3(p.x, 0, p.z), Math.atan2(meet.x - p.x, meet.z - p.z), 'ride'); g.skater.impactProtectUntil = -1; g.skater.impactLog.length = 0; g.rig.snapBehind(g.skater);
  });
  await page.keyboard.down('KeyW'); const t0 = Date.now(); let hit = false;
  while (Date.now() - t0 < 5000) { if (await page.evaluate(() => window.__bk.skater.impactLog.length)) { hit = true; break; } await sleep(16); }
  await page.keyboard.up('KeyW');
  if (!hit) { R.invalid(`${label}: el coche no golpeó`); return null; }
  const t1 = Date.now(); while (Date.now() - t1 < 7000) { if ((await look(page)).loco === 'walk') break; await sleep(50); }
  await sleep(1600);
  const after = await look(page);
  await fixture(page, R, `${label}: fuera de la pista (−7, 8: carril libre entre los montículos y D), mismo estado (nudge), mirando a −Z`, () => { const g = window.__bk, T = window.__bkTHREE, s = g.skater; s.nudge(new T.Vector3(-7, s.footPos.y, 8)); s.heading = Math.PI; s.prevHeading = Math.PI; g.rig.snapBehind(s); });
  await sleep(300); await page.keyboard.press('KeyQ'); await sleep(900);
  const afterQ = await look(page);
  await page.keyboard.down('KeyW'); await sleep(2300); const ride = await look(page);
  // kickflip en llano: ollie y SALTO + ← en el aire
  await page.evaluate(() => { window.__bk.skater.trickLog.length = 0; });
  await page.keyboard.press('Space'); await sleep(170); await page.keyboard.down('KeyA'); await page.keyboard.press('Space'); await sleep(120); await page.keyboard.up('KeyA'); await page.keyboard.up('KeyW');
  await sleep(1300);
  const trick = await page.evaluate(() => ({ log: window.__bk.skater.trickLog.slice(), loco: window.__bk.skater.loco, override: window.__bk.visual.override }));
  return { after, afterQ, ride, trick };
}
await runTest(R, async () => {
  const b = await launch();
  try {
    const page = await openGame(b, R, { save: SAVE_20 }); await clickStart(page); await sleep(800);
    const a = await carHit(page, 'A');
    R.check(!!a && a.after.loco === 'walk' && !a.after.override, 'A · tras el golpe de coche: a pie y animación del árbol', 'input', a?.after);
    R.check(!!a && a.afterQ.loco === 'ride' && !a.afterQ.override && a.ride.hv > 6 && !a.ride.override, 'A · Q monta y W pasa de 6 m/s, con la animación de patinar', 'input', a && { q: a.afterQ, ride: a.ride });
    R.check(!!a && a.trick.log.some((t) => t.kind === 'kickflip' && t.ok) && !a.trick.override, 'A · kickflip en llano después del golpe (aterrizado)', 'input', a?.trick);
    // B · reto fallado
    const run = await snRun(page, R, { jump: false });
    await sleep(2500);
    const fallo = await look(page);
    R.check(run.end.fails >= 1 && !fallo.override, 'B · tras FALLAR el reto de SN (sin SALTO): sin clip forzado', 'input', fallo);
    const b2 = await carHit(page, 'B');
    R.check(!!b2 && b2.afterQ.loco === 'ride' && !b2.afterQ.override && !b2.ride.override && b2.ride.hv > 6, 'B · reto fallado + golpe: Q monta, W acelera y la animación sigue al estado', 'input', b2 && { q: b2.afterQ, ride: b2.ride });
    // C · reto superado
    const ok = await snRun(page, R, { jump: 'hot' });
    await sleep(800);
    await page.evaluate(() => { const g = window.__bk; if (g.mode === 'preview') g.closePreview(); });
    await sleep(1200);
    const exito = await look(page);
    R.check(ok.end.ok >= 1 && !exito.override, 'C · tras SUPERAR el reto y cerrar el preview: sin clip forzado', 'input', { exito, fin: ok.end });
  } finally { await b.close(); }
}, { timeoutMs: 300000 });
