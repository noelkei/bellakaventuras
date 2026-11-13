// T5-31 · Persistencia y recuperación en todos los estados (OPUS-005, COV-06, HUM-A5-005). Perfil temporal; para cada caso se
// lleva el juego al estado (entrada real donde la hay; fixtures declaradas donde no), se LEE el guardado, se RECARGA la página
// (el guardado se conserva: la fixture de partida solo se inyecta una vez por pestaña) y se pulsa CONTINUAR. Se comprueba:
//  · progreso (patatas, actividades, finalProof, revealSeen) idéntico antes/después;
//  · estado reconstruido seguro: modo explore, en el suelo en ≤ 2 s, sin impacto en curso, fuera de la banda de coches
//    (|r − 17,5| ≥ 3,3) y no dentro de un sólido;
//  · 0 golpes de coche en los 10 s siguientes con los coches activos;
//  · settings.orientation persistido; guardado v4 sin el campo → 'auto' (cubierto también en orient-emu).
import { Report, runTest, launch, openGame, clickStart, sleep, fixture, place, SAVE_20, arg } from '../lib.mjs';
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
      else if (name === 'marcha20') { await place(page, R, [-43.2, 0, -50], 39 * Math.PI / 180, 'ride', name); await page.evaluate(() => { const s = window.__bk.skater; s.vel.set(Math.sin(s.heading) * 18, 0, Math.cos(s.heading) * 18); }); await page.keyboard.down('KeyW'); await sleep(1800); reached = await page.evaluate(() => Math.hypot(window.__bk.skater.vel.x, window.__bk.skater.vel.z) > 17); }
      else if (name === 'aire') { await place(page, R, [-43.2, 0, -50], 39 * Math.PI / 180, 'ride', name); await page.evaluate(() => { const s = window.__bk.skater; s.vel.set(Math.sin(s.heading) * 9, 0, Math.cos(s.heading) * 9); }); await sleep(300); await page.keyboard.press('Space'); reached = await waitPh(() => !window.__bk.skater.grounded && window.__bk.skater.airTime > 0.15, 2000); }
      else if (name.startsWith('coche_')) { const ph = name.split('_')[1]; await carHit(); reached = await waitPh((ph) => window.__bk.skater.impactPhase === ph, 9000, ph); }
      else if (name === 'pared_air') { await place(page, R, [-14, 0, -2], 0, 'ride', name); await page.evaluate(() => { const s = window.__bk.skater; s.vel.set(0, 0, 9.3); }); await page.keyboard.down('KeyW'); reached = await waitPh(() => window.__bk.skater.impactPhase === 'air' || window.__bk.skater.impactPhase === 'launch', 9000); await page.keyboard.up('KeyW'); note = reached ? '' : 'sin muro en la recta (se busca otro impacto)'; }
      else if (name.startsWith('final_')) {
        const want = name.split('_')[1];
        await fixture(page, R, 'final.approach a 9 m/s', () => { const g = window.__bk, a = g.manifest.get('final.approach'); g.input.clear(); g.skater.teleport(a.pos.clone(), a.heading, 'ride'); g.skater.vel.set(Math.sin(a.heading) * 9, 0, Math.cos(a.heading) * 9); g.rig.snapBehind(g.skater); return {}; });
        await page.keyboard.down('KeyW'); let pressed = false; const t0 = Date.now();
        while (Date.now() - t0 < 8000) { const q = await page.evaluate(() => { const ft = window.__bk.activities[5]; return { ph: ft.phase, inW: ft.inWindow() }; });
          if (want !== 'approach' && !pressed && q.inW) { await page.keyboard.press('Space'); pressed = true; }
          if (q.ph === want || (want === 'landed' && q.ph === 'landed')) break; await sleep(8); }
        await page.keyboard.up('KeyW'); reached = await page.evaluate((w) => window.__bk.activities[5].phase === w, want);
      }
      else if (name === 'preview') {
        await fixture(page, R, 'final.approach a 9 m/s', () => { const g = window.__bk, a = g.manifest.get('final.approach'); g.input.clear(); g.skater.teleport(a.pos.clone(), a.heading, 'ride'); g.skater.vel.set(Math.sin(a.heading) * 9, 0, Math.cos(a.heading) * 9); g.rig.snapBehind(g.skater); return {}; });
        await page.keyboard.down('KeyW'); let pressed = false; const t0 = Date.now();
        while (Date.now() - t0 < 8000) { const q = await page.evaluate(() => { const ft = window.__bk.activities[5]; return { ph: ft.phase, inW: ft.inWindow() }; }); if (!pressed && q.inW) { await page.keyboard.press('Space'); pressed = true; } if (q.ph === 'flight') break; await sleep(8); }
        await page.keyboard.up('KeyW'); reached = await waitPh(() => window.__bk.mode === 'preview', 15000);
      }
      else if (name === 'hoyo_u') { await place(page, R, [22.794, -0.45, -17.153], 0, 'walk', name); await sleep(2500); reached = await page.evaluate(() => window.__bk.skater.footPos.y < -0.3); }
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
        return { mode: g.mode, loco: s.loco, ph: s.impactPhase, r: +Math.hypot(p.x, p.z).toFixed(2), y: +p.y.toFixed(2), inside, cars: g.cars.cars.length, active: g.state.centerUnlocked, ori: g.state.p.settings.orientation, impacts0: s.impactLog.length }; });
      let revealReplayed = null;
      if (name === 'progreso_19_20') revealReplayed = await waitPh(() => window.__bk.mode === 'reveal', 4000);
      await sleep(10000);
      if (name === 'progreso_19_20') { for (let i = 0; i < 60 && (await page.evaluate(() => window.__bk.mode)) !== 'explore'; i++) await sleep(500); }
      const hits = await page.evaluate((n0) => window.__bk.skater.impactLog.length - n0, st.impacts0);
      const same = (k) => JSON.stringify(before?.[k]) === JSON.stringify(after?.[k]);
      const row = { name, label, ctx, after: st, grounded, hits10s: hits, progressSame: ['collected', 'activities', 'finalProof', 'finalDone'].every(same), revealBefore: before?.revealSeen, revealAfter: after?.revealSeen, cp: after?.checkpoint };
      rows.push(row); console.log(JSON.stringify(row));
      const safe = st.mode === 'explore' && st.loco !== 'impact' && !st.inside && grounded && (!st.active || Math.abs(st.r - 17.5) >= 3.3);
      R.check(label === 'CONTINUAR' && row.progressSame && safe && hits === 0, `${name}: CONTINUAR reconstruye un estado seguro (explore, en el suelo, fuera de la banda y de sólidos), progreso intacto y 0 golpes en 10 s`, 'input', row);
      if (name === 'orientacion') R.check(st.ori === 'horizontal', 'orientación persistida tras recargar', 'input', st);
      if (name === 'progreso_19_20') { const fin = await page.evaluate((k) => JSON.parse(localStorage.getItem(k)).revealSeen, KEY);
        R.check(after.collected.length === 20 && revealReplayed && fin === true, `progreso 19 → 20 persistido (${after.collected.length}); la revelación interrumpida se repite al continuar y queda vista`, 'input', { revealBefore: before?.revealSeen, revealReplayed, revealSeenFinal: fin }); }
      await page.close();
    }
    R.measure('casos', rows);
  } finally { await b.close(); }
}, { timeoutMs: 1800000 });
