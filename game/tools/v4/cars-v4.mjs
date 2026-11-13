// V4-CAR-01…04 · Coches: ausencia 0–19, aparición a 20, oposición π, frente, pausa, no cesión, impacto y separación.
// Fixtures declaradas: guardados con 19 y 20 patatas (IDs reales, actividades hechas) y colocaciones de ANMI para provocar
// contactos concretos. La circulación y los contactos son simulación real del juego (pasos fijos del bucle RAF).
import { Report, runTest, launch, openGame, clickStart, sleep, snap } from './lib.mjs';

const ZONES = ['no_me_guillo', 'nosvamosdeaqui', 'yinyang', 'tratratra', 'fashion_girl'];
const KINDS = ['visible', 'medium', 'hidden', 'activity'];
const saveWith = (n, extra = {}) => {
  const ids = ZONES.flatMap((z) => KINDS.map((k) => `${z}.${k}`)).slice(0, n);
  return { version: 4, collected: ids, activities: { pantherTalk: true, skateTutorial: true, graffiti: true, bridgeTalk: true, danceCombo: true }, bridgeReached: true,
    finalDone: false, finalProof: null, revealSeen: false, checkpoint: null, checkpointRevision: 4, partials: { tutorialStep: 0, tutorialStarted: false, bridgeRest: 4, graffitiMask: null, graffitiCheck: 0, danceRounds: 0 }, hints: ['basic'], settings: {}, ...extra };
};
const carState = (page) => page.evaluate(() => {
  const g = window.__bk, C = g.cars, T = window.__bkTHREE;
  const cols = C.cars.map((c) => ({ enabled: c.col.isEnabled(), y: +c.body.translation().y.toFixed(2) }));
  const noses = C.cars.map((c) => {
    const inner = c.g.children[0]?.children?.[0];
    const nose = new T.Vector3(-1, 0, 0); if (inner) nose.transformDirection(inner.matrixWorld); else nose.set(Math.sin(c.yaw), 0, Math.cos(c.yaw));
    const v = c.vel.clone().normalize();
    const inward = new T.Vector3(-c.pos.x, 0, -c.pos.z).normalize();
    return { dot: +(nose.x * v.x + nose.z * v.z).toFixed(3), inwardDot: +(nose.x * inward.x + nose.z * inward.z).toFixed(3) };
  });
  return { active: C.active, visible: C.group.visible && C.cars.some((c) => c.g.visible), cols, smoke: C.smoke.length, marks: C.marks.count, phase: C.phase, steps: C.stepCount,
    sep: C.separation, noses, engine: g.audio.engineLevel ?? null, mode: g.mode, total: g.state.total, centerOpen: g.centerOpen, clock: g.clock, paused: g.paused };
});

const R = new Report('CAR', 'cars-v4');
await runTest(R, async () => {
  const browser = await launch();
  try {
    // ------------------------------------------------ 0 patatas
    // V10.3 R1 (W04, cambio de diseño aprobado; copia previa en V10/backups/pruebas/V10_3-R1): los coches derrapan desde el principio detrás de
    // la valla del centro (antes: ausentes y el centro se recorría). Se comprueba lo nuevo: presentes y la valla no deja cruzar a pie
    let page = await openGame(browser, R, { save: null });
    await clickStart(page);
    let cs = await carState(page);
    R.check(cs.active && cs.visible && cs.cols.every((c) => c.enabled), '0/20: coches presentes detrás de la valla (malla visible, colliders activos)', 'input', cs);
    R.fixture('0/20: ANMI en el paseo interior (−24,5; 3) mirando al centro, intenta cruzar a pie hacia la pista', await page.evaluate(() => { const g = window.__bk, T = window.__bkTHREE; g.skater.teleport(new T.Vector3(-24.5, 0, 3), Math.PI / 2, 'walk'); g.rig.snapBehind(g.skater); return true; }));
    await page.keyboard.down('KeyW'); await sleep(2600); await page.keyboard.up('KeyW');
    const crossed = await snap(page);
    R.check(Math.hypot(crossed.x, crossed.z) > 22.0 && crossed.loco === 'walk', '0/20: la valla no deja cruzar a la pista de coches a pie', 'input', { x: crossed.x, z: crossed.z, loco: crossed.loco });
    await page.close();
    // ------------------------------------------------ 19 patatas: coches presentes (V10.3)
    page = await openGame(browser, R, { save: saveWith(19) });
    await clickStart(page); await sleep(800);
    cs = await carState(page);
    R.check(cs.total === 19 && cs.active && cs.cols.every((c) => c.enabled), '19/20: coches presentes detrás de la valla', 'input', { total: cs.total, active: cs.active });
    await page.close();
    // ------------------------------------------------ 20 patatas: revelación → aparecen juntos en π sin solape
    page = await openGame(browser, R, { save: saveWith(20) });
    // V10.3: ANMI ya no puede estar sobre la pista antes de la revelación (valla): la fase inicial segura se comprueba con la función del
    // juego para un jugador en (0; −17,5) (los dos coches ≥ 8 m), y la revelación con ANMI donde aparece
    R.fixture('20/20 sin revelar (V10.3: sin teletransporte a la pista; la valla lo impide)', null);
    await clickStart(page);
    for (let i = 0; i < 80; i++) { cs = await carState(page); if (cs.active) break; await sleep(100); }
    const pl = await snap(page);
    const dmin = await page.evaluate(() => { const g = window.__bk, T = window.__bkTHREE, p = new T.Vector3(0, 0, -17.5), ph = g.cars.constructor.safePhase(p);
      return Math.min(...g.cars.cars.map((c) => { const q = window.__bkCarPose(ph + c.offset).pos; return Math.hypot(q.x - p.x, q.z - p.z); })); });
    R.check(cs.active && cs.visible && cs.cols.every((c) => c.enabled), '20/20: tras la revelación aparecen los dos coches con collider', 'input', { active: cs.active, cols: cs.cols });
    R.check(dmin > 8, 'aparecen lejos de ANMI (fase inicial segura, sin instanciar dentro de ella; V10.3: con un jugador en la pista r 17,5)', 'unit', { dmin: +dmin.toFixed(2), player: [0, -17.5], spawn: [pl.x, pl.z] });
    // ------------------------------------------------ dos vueltas: separación π, velocidad constante, frente
    R.fixture('ANMI apartada fuera de la pista para observar dos vueltas', await page.evaluate(() => { const g = window.__bk, T = window.__bkTHREE; g.skater.teleport(new T.Vector3(-9, 0, 9), 0, 'walk'); return true; }));
    const laps = []; const t0 = Date.now();
    while (Date.now() - t0 < 27000) { laps.push(await carState(page)); await sleep(150); }
    const sepErr = Math.max(...laps.map((q) => Math.abs(q.sep - Math.PI)));
    const swept = laps[0].phase - laps.at(-1).phase;
    R.check(sepErr < 1e-6, 'separación angular = π durante dos vueltas (error numérico)', 'unit', { maxErr: sepErr, samples: laps.length });
    R.check(swept > 2 * Math.PI * 1.8, 'la pareja completa ~2 vueltas en sentido antihorario (fase decreciente)', 'unit', { sweptRad: +swept.toFixed(2), laps: +(swept / (2 * Math.PI)).toFixed(2) });
    const rates = []; for (let i = 1; i < laps.length; i++) if (laps[i].steps > laps[i - 1].steps) rates.push((laps[i - 1].phase - laps[i].phase) / ((laps[i].steps - laps[i - 1].steps) / 60));
    R.check(Math.max(...rates) - Math.min(...rates) < 1e-6, 'velocidad angular constante (sin frenazos)', 'unit', { min: Math.min(...rates), max: Math.max(...rates) });
    const ly = await page.evaluate(() => { const L = window.__bk.cars.constructor.lerpYaw; return [L(Math.PI - 0.02, -Math.PI + 0.02, 0.5), L(-Math.PI + 0.02, Math.PI - 0.02, 0.5), L(0.1, 0.3, 0.5)]; });
    R.check(Math.abs(Math.abs(ly[0]) - Math.PI) < 1e-9 && Math.abs(Math.abs(ly[1]) - Math.PI) < 1e-9 && Math.abs(ly[2] - 0.2) < 1e-12, 'interpolación de yaw por el camino corto al cruzar ±π (presentación y barrido)', 'unit', { ly });
    R.check(laps.every((q) => q.noses.every((n) => n.dot > 0.8 && n.inwardDot > 0.2)), 'morro (−X del GLB) hacia la marcha (cos ≥ 0,8) con derrape hacia dentro', 'unit', { muestra: laps[5].noses, malas: laps.map((q, i) => ({ i, steps: q.steps, noses: q.noses })).filter((q) => !q.noses.every((n) => n.dot > 0.8 && n.inwardDot > 0.2)).slice(0, 6), n: laps.length });
    await page.evaluate(() => { const g = window.__bk, T = window.__bkTHREE; for (const c of g.cars.cars) { const a = new T.ArrowHelper(new T.Vector3(0, 0, 1), new T.Vector3(0, 2.2, 0), 3, 0xff0066); a.name = 'DBG_ARROW_NOSE'; c.g.add(a); const v = new T.ArrowHelper(c.vel.clone().normalize(), c.pos.clone().setY(2.6), 3, 0x00ccff); v.name = 'DBG_ARROW_VEL'; g.scene.add(v); } g.rig.toFixed({ pos: new T.Vector3(0, 24, 16), target: new T.Vector3(0, 0, 0), hfov: 70 }, true); });
    await sleep(500);
    await R.shot(page, 'car01_flechas_morro_rosa_velocidad_azul');
    await page.evaluate(() => { const g = window.__bk; g.scene.traverse((o) => { if (o.name?.startsWith('DBG_ARROW')) o.visible = false; }); g.rig.toFollow(g.skater, true); });
    // ------------------------------------------------ pausa congela la fase; reanudar sin salto
    await page.keyboard.press('Escape'); await sleep(300);
    const pa = await carState(page); await sleep(1500); const pb = await carState(page);
    await page.keyboard.press('Escape'); await sleep(500); const pc = await carState(page);
    R.check(pa.paused && pb.paused && pb.phase === pa.phase && pb.steps === pa.steps && pc.phase < pb.phase && Math.abs(pc.sep - Math.PI) < 1e-6, 'pausa: la pareja no avanza (fase y pasos idénticos 1,5 s); al reanudar sigue en π', 'input', { duringPaused: pa.phase - pb.phase, afterResume: +(pb.phase - pc.phase).toFixed(4), stepsPaused: pb.steps - pa.steps });
    // ------------------------------------------------ sin cesión + impacto: ANMI quieta delante de un coche
    const setup = await page.evaluate(() => {
      const g = window.__bk, T = window.__bkTHREE, C = g.cars, c = C.cars[0];
      // 1,6 s por delante del coche A sobre su trayectoria
      const p = window.__bkCarPose(C.phase + c.offset - 0.5 * 1.6).pos;
      g.skater.teleport(new T.Vector3(p.x, 0, p.z), 0, 'walk'); g.skater.impactLog.length = 0;
      return { p: [p.x, p.z], phase: C.phase };
    });
    R.fixture('ANMI quieta sobre la trayectoria del coche A, 1,6 s por delante', setup);
    const imp = []; const ti = Date.now();
    while (Date.now() - ti < 5500) { imp.push(await page.evaluate(() => { const g = window.__bk, s = g.skater; return { phase: g.cars.phase, steps: g.cars.stepCount, loco: s.loco, ph: s.impactPhase, x: +s.footPos.x.toFixed(2), y: +s.footPos.y.toFixed(2), z: +s.footPos.z.toFixed(2), r: +Math.hypot(s.footPos.x, s.footPos.z).toFixed(2), sep: g.cars.separation, log: s.impactLog.slice(-1)[0] ?? null }; })); await sleep(60); }
    const phases = [...new Set(imp.map((q) => q.ph).filter(Boolean))];
    const r2 = []; for (let i = 1; i < imp.length; i++) if (imp[i].steps > imp[i - 1].steps) r2.push((imp[i - 1].phase - imp[i].phase) / ((imp[i].steps - imp[i - 1].steps) / 60));
    R.check(imp.some((q) => q.loco === 'impact') && phases.includes('air') && phases.includes('land') && phases.includes('getup'), 'coche golpea a ANMI: estrella (vuelo) → suelo → levantarse', 'input', { phases, launch: imp.find((q) => q.log)?.log });
    R.check(Math.max(...r2) - Math.min(...r2) < 1e-6 && imp.every((q) => Math.abs(q.sep - Math.PI) < 1e-6), 'el coche NO cede ni frena antes, durante ni después del golpe; la pareja sigue en π', 'unit', { minRate: Math.min(...r2), maxRate: Math.max(...r2) });
    const endImp = imp.at(-1);
    R.check(endImp.loco === 'walk' && Math.abs(endImp.r - 17.5) > 3.2, 'se levanta a pie FUERA de la banda de la pista (los coches siguen)', 'input', { r: endImp.r, loco: endImp.loco });
    // ------------------------------------------------ protección acotada: justo tras levantarse, un contacto separa sin nuevo impacto
    const prot = await page.evaluate(() => {
      const g = window.__bk, T = window.__bkTHREE, C = g.cars, c = C.cars[1], s = g.skater;
      const ahead = window.__bkCarPose(C.phase + c.offset - 0.5 * 0.8).pos;
      s.teleport(new T.Vector3(ahead.x, 0, ahead.z), 0, 'walk'); s.impactProtectUntil = g.clock + 1.4;
      return { h0: g.carHits, s0: g.carSeparations, until: s.impactProtectUntil, p: [ahead.x, ahead.z] };
    });
    R.fixture('ANMI recién levantada (protección 1,4 s) sobre la trayectoria del coche B', prot);
    const pr = []; for (let i = 0; i < 25; i++) { pr.push(await page.evaluate(() => { const g = window.__bk, s = g.skater, C = g.cars; const c = C.contact(s.footPos, s.footPos, 0.3, 1.8); return { hits: g.carHits, seps: g.carSeparations, loco: s.loco, inside: !!c && c.depth > 0.05 }; })); await sleep(60); }
    R.check(pr.at(-1).hits === prot.h0 && pr.at(-1).seps > prot.s0 && pr.every((q) => !q.inside), 'protección acotada: el contacto separa a ANMI sin otro impacto y nunca queda dentro del coche', 'input', { last: pr.at(-1), insideAny: pr.some((q) => q.inside) });
    await sleep(1600);
    R.check(await page.evaluate(() => window.__bk.clock > window.__bk.skater.impactProtectUntil), 'la protección termina (fin definido, no inmunidad)', 'unit', null);
  } finally { await browser.close(); }
});
