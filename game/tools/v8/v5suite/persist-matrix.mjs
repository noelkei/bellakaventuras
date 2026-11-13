// T5-31 · Persistencia y recuperación en todos los estados (OPUS-005, COV-06, HUM-A5-005). Perfil temporal; para cada caso se
// lleva el juego al estado (entrada real donde la hay; fixtures declaradas donde no), se LEE el guardado, se RECARGA la página
// (el guardado se conserva: la fixture de partida solo se inyecta una vez por pestaña) y se pulsa CONTINUAR. Se comprueba:
//  · progreso (patatas, actividades, finalProof, revealSeen) idéntico antes/después;
//  · estado reconstruido seguro: modo explore, en el suelo en ≤ 2 s, sin impacto en curso, fuera de la banda de coches
//    (|r − R| ≥ 3,3; V10: R = radio real de la pista, 19) y no dentro de un sólido;
//  · 0 golpes de coche en los 10 s siguientes con los coches activos;
//  · settings.orientation persistido; guardado v4 sin el campo → 'auto' (cubierto también en orient-emu).
import { Report, runTest, launch, openGame, clickStart, sleep, fixture, place, SAVE_20, arg } from '../lib.mjs';
import { snState } from '../../v10/sn-lib.mjs';
const R = new Report('persist-matrix');
const CASES = arg('cases', 'reposo,marcha20,aire,coche_air,coche_land,coche_getup,pared_air,final_approach,final_armed,final_flight,final_landed,preview,hoyo_u,orientacion,progreso_19_20').split(',');
const KEY = 'bellakaventuras.remake.save';
await runTest(R, async () => {
  const b = await launch();
  try {
    const rows = [];
    for (const name of CASES) {
      const base = name === 'progreso_19_20' ? { ...SAVE_20, collected: SAVE_20.collected.filter((x) => x !== 'no_me_guillo.visible'), revealSeen: false } : SAVE_20;
      const page = await openGame(b, R, { save: base }); await clickStart(page); await sleep(1500);
      await page.evaluate(() => { document.getElementById('hint').hidden = true; window.__bkFinalLog = []; });
      const waitPh = async (pred, ms = 6000, a) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (await page.evaluate(pred, a)) return true; await sleep(20); } return false; };
      const carHit = () => page.evaluate(() => { const g = window.__bk, T = window.__bkTHREE, C = g.cars, c = C.cars[0]; const a = C.phase + c.offset - 12 / 17.5, pose = window.__bkCarPose(a), p = pose.pos; g.skater.teleport(new T.Vector3(p.x, 0, p.z), Math.atan2(-pose.vel.x, -pose.vel.z), 'walk'); g.rig.snapBehind(g.skater); g.skater.impactProtectUntil = -1; });
      let reached = true, note = '';
      // ---------------------------------------------------------------- llevar al estado
      if (name === 'reposo') { await place(page, R, [7.67, 0, -32.93], 0, 'walk', name); await sleep(2500); }
      else if (name === 'marcha20') { /* V10: recta libre (scan-rectas, R4: 114,5 m a 45°) */ await place(page, R, [-38.18, 0, -29.7], 45 * Math.PI / 180, 'ride', name); await page.evaluate(() => { const s = window.__bk.skater; s.vel.set(Math.sin(s.heading) * 18, 0, Math.cos(s.heading) * 18); }); await page.keyboard.down('KeyW'); await sleep(1800); reached = await page.evaluate(() => Math.hypot(window.__bk.skater.vel.x, window.__bk.skater.vel.z) > 17); }
      else if (name === 'aire') { /* V10: recta libre (scan-rectas, R4: 114,5 m a 45°) */ await place(page, R, [-38.18, 0, -29.7], 45 * Math.PI / 180, 'ride', name); await page.evaluate(() => { const s = window.__bk.skater; s.vel.set(Math.sin(s.heading) * 9, 0, Math.cos(s.heading) * 9); }); await sleep(300); await page.keyboard.press('Space'); reached = await waitPh(() => !window.__bk.skater.grounded && window.__bk.skater.airTime > 0.15, 2000); }
      else if (name.startsWith('coche_')) { const ph = name.split('_')[1]; await carHit(); reached = await waitPh((ph) => window.__bk.skater.impactPhase === ph, 9000, ph); }
      else if (name === 'pared_air') { await place(page, R, [-14, 0, -2], 0, 'ride', name); await page.evaluate(() => { const s = window.__bk.skater; s.vel.set(0, 0, 9.3); }); await page.keyboard.down('KeyW'); reached = await waitPh(() => window.__bk.skater.impactPhase === 'air' || window.__bk.skater.impactPhase === 'launch', 9000); await page.keyboard.up('KeyW'); note = reached ? '' : 'sin muro en la recta (se busca otro impacto)'; }
      // V10 R6 (cambio de diseño aprobado: la superrampa y el triple se sustituyen por el reto de SECRETNOVIO): los estados equivalentes del
      // reto, con entrada real desde el carril de bajada de la coronación (fixture declarada): approach → bajando (edge), armed → carrerilla
      // con la ventana de SALTO (run), flight → vuelo, landed → frenado en D (brake); preview → reto completado
      else if (name.startsWith('final_') || name === 'preview') {
        const want = { approach: 'edge', armed: 'run', flight: 'flight', landed: 'brake' }[name.split('_')[1]] ?? 'preview';
        await fixture(page, R, 'carril de bajada de la coronación de A', () => { const g = window.__bk, T = window.__bkTHREE; g.input.clear(); const th = g.park.sn.group.rotation.y; g.skater.teleport(new T.Vector3(0, 7, -12.5).applyAxisAngle(new T.Vector3(0, 1, 0), th), th, 'walk'); g.rig.snapBehind(g.skater); return {}; });   /* V10.1: marco girado del reto */
        await sleep(600); await page.keyboard.press('KeyE'); let pressed = false, hitKey = ''; const t0 = Date.now();
        while (Date.now() - t0 < 12000) { const q = await snState(page);
          if ((want === 'flight' || want === 'brake' || want === 'preview') && !pressed && q.hot) { await page.keyboard.press('Space'); pressed = true; }
          // V10.1 P04 (cambio de diseño aprobado): en el vuelo hay tres círculos; se pulsan (Espacio) al llegar el anillo, como sn-lib
          // (copia previa en V10/backups/pruebas/V10_1-R5/v5suite-persist-matrix.mjs)
          if (q.circle && want !== 'flight' && q.circle.p >= 0.88 && q.circle.p <= 1.12 && hitKey !== `${q.circle.i}:${q.circle.misses}`) { hitKey = `${q.circle.i}:${q.circle.misses}`; await page.keyboard.press('Space'); }
          if (q.phase === want || (want === 'preview' && q.mode === 'preview')) break; await sleep(q.circle ? 12 : 8); }
        reached = want === 'preview' ? await waitPh(() => window.__bk.mode === 'preview', 15000) : await page.evaluate((w) => window.__bk.activities.find((a) => a.id === 'secretJump').phase === w, want);
      }
      else if (name === 'hoyo_u') { /* V10: hoyo de la U girado 9° con NMG */ await place(page, R, [25.197, -0.45, -13.376], 0, 'walk', name); await sleep(2500); reached = await page.evaluate(() => window.__bk.skater.footPos.y < -0.3); }
      else if (name === 'orientacion') { await page.evaluate(() => document.getElementById('btn-pause').click()); await sleep(300); for (let i = 0; i < 3; i++) { const t = await page.$eval('#btn-orient', (e) => e.textContent); if (/Horizontal/.test(t)) break; await page.click('#btn-orient'); await sleep(500); } await page.click('#btn-resume'); await sleep(500); reached = await page.evaluate(() => window.__bk.state.p.settings.orientation === 'horizontal'); }
      else if (name === 'progreso_19_20') {
        const fp = await page.evaluate(() => { const f = window.__bk.park.manifest.fries.find((x) => x.id === 'no_me_guillo.visible'); return [f.pos.x, f.pos.y, f.pos.z]; });
        await place(page, R, [fp[0] - 2, 0, fp[2]], Math.PI / 2, 'walk', 'junto a la patata visible de NMG'); await page.keyboard.down('KeyW'); reached = await waitPh(() => window.__bk.state.p.collected.length === 20, 5000); await page.keyboard.up('KeyW');
        await sleep(1500); note = await page.evaluate(() => `modo ${window.__bk.mode}`);
      }
      const ctx = await page.evaluate(() => { const g = window.__bk, s = g.skater; return { mode: g.mode, loco: s.loco, ph: s.impactPhase, final: g.activities[5].phase, pos: [s.footPos.x, s.footPos.y, s.footPos.z].map((v) => +v.toFixed(2)) }; });
      if (!reached) { R.invalid(`${name}: no se llegó al estado pedido ${note}`, ctx); await page.close(); continue; }
      const before = await page.evaluate((k) => JSON.parse(localStorage.getItem(k)), KEY);
      // ---------------------------------------------------------------- recargar y CONTINUAR
      await page.reload({ waitUntil: 'load' }); await page.waitForFunction(() => window.__bk && !document.getElementById('btn-start').disabled, { timeout: 120000 });
      const label = await page.$eval('#btn-start', (e) => e.textContent);
      await clickStart(page);
      const grounded = await waitPh(() => window.__bk.skater.grounded, 2000);
      const after = await page.evaluate((k) => JSON.parse(localStorage.getItem(k)), KEY);
      const st = await page.evaluate(() => { const g = window.__bk, s = g.skater, R = window.__bkRapier; const p = s.footPos;
        const inside = !!g.world.intersectionWithShape({ x: p.x, y: p.y + 0.95, z: p.z }, { x: 0, y: 0, z: 0, w: 1 }, new R.Capsule(0.55, 0.27), R.QueryFilterFlags.EXCLUDE_SENSORS, undefined, s.collider);
        return { mode: g.mode, loco: s.loco, ph: s.impactPhase, r: +Math.hypot(p.x, p.z).toFixed(2), y: +p.y.toFixed(2), inside, cars: g.cars.cars.length, carR: g.cars.R ?? 17.5, active: g.state.centerUnlocked, ori: g.state.p.settings.orientation, impacts0: s.impactLog.length }; });
      let revealReplayed = null;
      if (name === 'progreso_19_20') revealReplayed = await waitPh(() => window.__bk.mode === 'reveal', 4000);
      await sleep(10000);
      if (name === 'progreso_19_20') { for (let i = 0; i < 60 && (await page.evaluate(() => window.__bk.mode)) !== 'explore'; i++) await sleep(500); }
      const hits = await page.evaluate((n0) => window.__bk.skater.impactLog.length - n0, st.impacts0);
      const same = (k) => JSON.stringify(before?.[k]) === JSON.stringify(after?.[k]);
      const row = { name, label, ctx, after: st, grounded, hits10s: hits, progressSame: ['collected', 'activities', 'finalProof', 'finalDone'].every(same), revealBefore: before?.revealSeen, revealAfter: after?.revealSeen, cp: after?.checkpoint };
      rows.push(row); console.log(JSON.stringify(row));
      const safe = st.mode === 'explore' && st.loco !== 'impact' && !st.inside && grounded && (!st.active || Math.abs(st.r - st.carR) >= 3.3);   // V10: radio real de la pista (19)
      R.check(label === 'CONTINUAR' && row.progressSame && safe && hits === 0, `${name}: CONTINUAR reconstruye un estado seguro (explore, en el suelo, fuera de la banda y de sólidos), progreso intacto y 0 golpes en 10 s`, 'input', row);
      if (name === 'orientacion') R.check(st.ori === 'horizontal', 'orientación persistida tras recargar', 'input', st);
      if (name === 'progreso_19_20') { const fin = await page.evaluate((k) => JSON.parse(localStorage.getItem(k)).revealSeen, KEY);
        R.check(after.collected.length === 20 && revealReplayed && fin === true, `progreso 19 → 20 persistido (${after.collected.length}); la revelación interrumpida se repite al continuar y queda vista`, 'input', { revealBefore: before?.revealSeen, revealReplayed, revealSeenFinal: fin }); }
      await page.close();
    }
    R.measure('casos', rows);
  } finally { await b.close(); }
}, { timeoutMs: 1800000 });
