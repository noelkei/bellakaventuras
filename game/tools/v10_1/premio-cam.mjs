// V10.1 · P07 (guardián): al aparecer la patata premio de una actividad la cámara la ENSEÑA (plano corto que vuelve solo), lleva una marca
// pulsante encima y, mientras no se ve, una flecha en el borde apunta hacia ella; al recogerla desaparecen. Las cinco actividades con premio
// (se completan con su gancho de pruebas `debugComplete`, que llama a `revealReward` como la actividad real). Con «reducir movimiento», el
// plano es un corte (sin recorrido).
import { Report, runTest, launch, openGame, clickStart, sleep, fixture } from '../v8/lib.mjs';
const R = new Report('premio-cam');
const ACTS = [['pantherTalk', 'no_me_guillo'], ['skateTutorial', 'nosvamosdeaqui'], ['graffiti', 'yinyang'], ['bridgeTalk', 'tratratra'], ['danceCombo', 'fashion_girl']];
await runTest(R, async () => {
  const b = await launch();
  try {
    for (const reduced of [false, true]) {
      const page = await openGame(b, R, { save: { version: 4, collected: [], activities: {}, hints: ['basic'], settings: { reducedMotion: reduced, reducedMotionSet: true } } });
      await clickStart(page); await sleep(1200);
      for (const [act, zone] of ACTS) {
        // ANMI a 9 m de la patata, de espaldas a ella (fuera de cuadro)
        const at = await fixture(page, R, `${act}: ANMI a 9 m de su patata premio, de espaldas`, (zone) => { const g = window.__bk, T = window.__bkTHREE, f = g.park.manifest.fries.find((q) => q.id === `${zone}.activity`);
          const away = new T.Vector3(f.pos.x, 0, f.pos.z).normalize().multiplyScalar(-1); const p = f.pos.clone().addScaledVector(away, 9); p.y = 0;
          const RA = window.__bkRapier, h = g.world.castRay(new RA.Ray({ x: p.x, y: 12, z: p.z }, { x: 0, y: -1, z: 0 }), 20, true, RA.QueryFilterFlags.EXCLUDE_SENSORS); if (h) p.y = 12 - h.timeOfImpact;
          g.skater.teleport(p, Math.atan2(away.x, away.z), 'walk'); g.rig.snapBehind(g.skater); return { fry: [f.pos.x, f.pos.y, f.pos.z] }; }, zone);
        await sleep(600);
        await page.evaluate((act) => window.__bk.activities.find((a) => a.id === act).debugComplete(), act);
        const samples = []; const t0 = Date.now();
        while (Date.now() - t0 < 4200) { samples.push(await page.evaluate((zone) => { const g = window.__bk, T = window.__bkTHREE, p = g.pickups.find((q) => q.id === `${zone}.activity`), cam = g.rig.cam;
            const d = new T.Vector3(); cam.getWorldDirection(d); const to = p.group.position.clone().sub(cam.position).normalize();
            const ar = document.getElementById('reward-arrow'); return { t: Date.now(), mode: g.rig.mode, ang: +(Math.acos(Math.min(1, d.dot(to))) * 180 / Math.PI).toFixed(1), arrow: !ar.hidden, avail: p.available, ring: !!g.rewardPending }; }, zone)); await sleep(100); }
        const looked = samples.some((s) => s.mode === 'scripted' && s.ang < 12), back = samples.at(-1).mode === 'follow', arrow = samples.at(-1).arrow;
        R.check(looked && back, `${act}${reduced ? ' (reducido)' : ''}: la cámara enseña la patata (< 12°) y vuelve al seguimiento`, 'input', { min: Math.min(...samples.map((s) => s.ang)), modes: [...new Set(samples.map((s) => s.mode))], last: samples.at(-1) });
        R.check(arrow && samples.at(-1).ring, `${act}${reduced ? ' (reducido)' : ''}: de espaldas, la flecha del borde apunta a la patata y la marca sigue puesta`, 'static', samples.at(-1));
        // recogerla: marca y flecha fuera
        await page.evaluate((zone) => { const g = window.__bk, p = g.pickups.find((q) => q.id === `${zone}.activity`); g.collect(p); }, zone); await sleep(400);
        const after = await page.evaluate(() => ({ arrow: !document.getElementById('reward-arrow').hidden, ring: window.__bk.rewardPending?.collected === false }));
        R.check(!after.arrow && !after.ring, `${act}: recogida, sin flecha ni marca`, 'static', after);
      }
      await page.close();
    }
  } finally { await b.close(); }
}, { timeoutMs: 400000 });
