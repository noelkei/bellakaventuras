// T5-20 · Brazos de NPCs (HUM-A5-015, REV04-009, DT-23), a partir de la sonda N1 de 04: con el juego en pausa y el mixer
// controlado (setTime, instrumentación en memoria), 8 instantes por clip de pie: abducción del brazo en el plano frontal
// (+ fuera / − dentro), codo respecto al hombro y cruce de la línea media por la mano; capturas frente/¾ de 4 instantes.
// Aceptación (pie: Idle/Talk de Aissa y Juseph, Idle de Pantera): brazos fuera del torso (abducción ≥ 0° en todo el
// ciclo; codo por fuera ≥ 0,8 del ancho de hombro) y manos sin cruzar la línea media (0/8). Controles negativos: Talk de
// Pantera y clips de Bella dentro de ±3° de A; sentados de Pantera sin cambio (asiento ya medido en build_npcs.py).
import fs from 'node:fs';
import { Report, runTest, launch, openGame, clickStart, sleep, baselineGet, baselineSet, isA, r3 } from './lib.mjs';
const R = new Report('npc-arms');
await runTest(R, async () => {
  const b = await launch();
  try {
    const page = await openGame(b, R); await clickStart(page);
    await page.waitForFunction(() => ['aissa', 'juseph', 'bella', 'la_pantera'].every((k) => window.__bk.npcs.has(k)), { timeout: 90000 });
    await page.evaluate(() => { window.__bk.setPaused(true); for (const id of ['hud', 'touch', 'pause']) { const e = document.getElementById(id); if (e) e.style.visibility = 'hidden'; } });
    R.fixture('juego en pausa; mixer de cada NPC conducido con setTime (solo lectura de poses)', {});
    const out = {};
    for (const id of ['aissa', 'juseph', 'la_pantera', 'bella']) {
      const clips = await page.evaluate((id) => [...window.__bk.npcs.get(id)[0].actions.keys()], id);
      out[id] = {};
      for (const c of clips) {
        const dur = await page.evaluate((id, c) => window.__bk.npcs.get(id)[0].actions.get(c).getClip().duration, id, c);
        const ps = [];
        for (let k = 0; k < 8; k++) {
          const t = dur * k / 8;
          const m = await page.evaluate((id, c, t) => {
            const g = window.__bk, T = window.__bkTHREE, a = g.npcs.get(id)[0];
            a.mixer.stopAllAction(); const act = a.actions.get(c); act.reset(); act.setEffectiveWeight(1); act.play(); a.mixer.setTime(t); a.root.updateMatrixWorld(true);
            let sk = null; a.model.traverse((o) => { if (o.isSkinnedMesh && !sk) sk = o.skeleton; });
            const bone = (n) => sk.bones.find((bb) => bb.name.replace(/[:_]/g, '') === 'mixamorig' + n);
            const loc = (n) => { const w = new T.Vector3(); bone(n).getWorldPosition(w); return a.root.worldToLocal(w); };
            const r = {};
            for (const side of ['Left', 'Right']) { const sh = loc(side + 'Arm'), el = loc(side + 'ForeArm'), ha = loc(side + 'Hand'), sp = loc('Spine2'); const o = Math.sign(sh.x - sp.x) || 1; const ua = el.clone().sub(sh);
              r[side] = { abd: Math.atan2(ua.x * o, -ua.y) * 180 / Math.PI, elbowRatio: (el.x - sp.x) / (sh.x - sp.x), cross: Math.sign(ha.x - sp.x) !== Math.sign(sh.x - sp.x) }; }
            return r;
          }, id, c, t);
          ps.push(m);
          if (k % 2 === 0) for (const [vn, deg] of [['frente', 0], ['tresc', 45]]) {
            const url = await page.evaluate((id, deg) => { const g = window.__bk, T = window.__bkTHREE, a = g.npcs.get(id)[0], cam = g.rig.cam; const base = new T.Vector3(); a.root.getWorldPosition(base); const yaw = a.root.rotation.y + deg * Math.PI / 180; const hy = a.seated ? 0.75 : 1.05;
              cam.position.set(base.x + Math.sin(yaw) * 2.3, base.y + hy + 0.1, base.z + Math.cos(yaw) * 2.3); cam.lookAt(base.x, base.y + hy, base.z); cam.fov = 40; cam.updateProjectionMatrix(); cam.updateMatrixWorld(); g.render(); return document.getElementById('game').toDataURL('image/png'); }, id, deg);
            fs.writeFileSync(R.file_(`${id}-${c}-${k}-${vn}.png`), Buffer.from(url.split(',')[1], 'base64'));
          }
        }
        const agg = (side, f) => ps.map((p) => p[side][f]);
        out[id][c] = { abdMin: r3(Math.min(...agg('Left', 'abd'), ...agg('Right', 'abd'))), abdMax: r3(Math.max(...agg('Left', 'abd'), ...agg('Right', 'abd'))), elbowMin: r3(Math.min(...agg('Left', 'elbowRatio'), ...agg('Right', 'elbowRatio'))),
          cross: ps.filter((p) => p.Left.cross || p.Right.cross).length };
        console.log(id, c, JSON.stringify(out[id][c]));
      }
    }
    R.measure('npcs', out);
    if (isA(R)) baselineSet(R, 'npc_arms', out, 'abducción/codo/cruce por clip (8 instantes)');
    const A = baselineGet('npc_arms');
    const stand = [['aissa', 'Idle'], ['aissa', 'Talk'], ['juseph', 'Idle'], ['juseph', 'Talk'], ['la_pantera', 'Idle']];
    for (const [id, c] of stand) { const v = out[id]?.[c]; if (!v) { R.nonEmpty([], `${id}/${c}`); continue; }
      R.check(v.abdMin >= 0 && v.elbowMin >= 0.8 && v.cross === 0, `${id}/${c}: brazos fuera del torso y manos sin cruzar (abd ≥ 0°, codo ≥ 0,8, 0/8 cruces)`, 'vision', v); }
    if (A) for (const [id, c] of [['la_pantera', 'Talk'], ['bella', 'Cheer'], ['bella', 'Jump'], ['bella', 'Sway'], ['la_pantera', 'SitIdle'], ['la_pantera', 'SitTalk']]) {
      const v = out[id]?.[c], a = A[id]?.[c]; if (!v || !a) continue;
      R.check(Math.abs(v.abdMin - a.abdMin) <= 3 && Math.abs(v.abdMax - a.abdMax) <= 3, `control negativo ${id}/${c}: sin cambio frente a A (±3°)`, 'unit', { v, A: a });
    }
    R.pendingHuman('Gestos legibles de los NPC (revisión visual de las capturas y vídeo de charla) — G8-V');
  } finally { await b.close(); }
}, { timeoutMs: 600000 });
