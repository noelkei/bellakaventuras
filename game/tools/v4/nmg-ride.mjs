// V4-NMG-06 · Recorrido continuo por NMG con entrada real (Q monta, W empuja, A/D giran) desde el spawn y la cámara de
// juego normal: 24 fotogramas cada 0,35 s → hoja de contacto (captures/v4/NMG/ride_hoja.png). No sustituye a un vídeo
// humano; demuestra lectura del cluster en movimiento, sin oclusiones de cámara ni tirones de cámara (salto de pose).
import fs from 'node:fs';
import path from 'node:path';
import { Report, runTest, launch, openGame, clickStart, sleep } from './lib.mjs';
const R = new Report('NMG-06', 'nmg-ride');
await runTest(R, async () => {
  const browser = await launch();
  try {
    const page = await openGame(browser, R, { save: null });
    await clickStart(page); await sleep(800);
    await page.evaluate(() => { document.getElementById('hint').hidden = true; for (const id of ['touch']) document.getElementById(id).style.visibility = 'hidden'; });
    await page.keyboard.press('KeyQ'); await sleep(700);
    const plan = [[0, 'KeyW'], [2.2, 'KeyW+KeyD'], [3.4, 'KeyW'], [5.0, 'KeyW+KeyA'], [6.6, 'KeyW'], [8.4, null]];
    const frames = [], cams = []; const t0 = Date.now(); let held = [];
    const setKeys = async (spec) => { const want = spec ? spec.split('+') : []; for (const k of held) if (!want.includes(k)) await page.keyboard.up(k); for (const k of want) if (!held.includes(k)) await page.keyboard.down(k); held = want; };
    let pi = 0;
    for (let i = 0; i < 24; i++) {
      const t = (Date.now() - t0) / 1000;
      while (pi < plan.length && plan[pi][0] <= t) { await setKeys(plan[pi][1]); pi++; }
      const c = await page.evaluate(() => {
        const g = window.__bk, T = window.__bkTHREE, c = g.rig.cam.position, s = g.skater;
        // oclusión de ANMI por geometría del parque: primer impacto en el rayo cámara→pecho. Por debajo de near1 se tramará
        const chest = s.footPos.clone().add(new T.Vector3(0, 1.0, 0)), d = chest.clone().sub(c), L = d.length();
        const rc = new T.Raycaster(c.clone(), d.normalize(), 0.05, L - 0.4);
        const hit = rc.intersectObject(g.park.root, true).find((h) => h.object.visible && !/^AREA_/.test(h.object.name));
        const pan = g.manifest.get('npc.la_pantera').pos;
        const want = s.onFoot ? g.rig.dist * 0.86 : g.rig.dist;
        return { avoid: g.rig.distNow < want - 0.3, distNow: +g.rig.distNow.toFixed(2), cam: [c.x, c.y, c.z], p: [s.footPos.x, s.footPos.y, s.footPos.z], loco: s.loco, v: s.vLong, finite: [c.x, c.y, c.z].every(Number.isFinite),
          occ: hit ? { d: +hit.distance.toFixed(2), by: hit.object.name, dithered: hit.distance < window.__bkCamFade.near1 } : null, dPan: +Math.hypot(s.footPos.x - pan.x, s.footPos.z - pan.z).toFixed(2) };
      });
      cams.push(c); frames.push(await R.shot(page, `ride_${String(i).padStart(2, '0')}`));
      await sleep(350);
    }
    await setKeys(null);
    // salto de pose = cambio del DESFASE cámara−ANMI entre fotogramas (el avance del jugador no cuenta: a 9 m/s y ~0,7 s
    // por fotograma la cámara recorre ~6 m siguiendo); se registran ambos
    // en los giros el desfase ROTA con ANMI (cuerda de varios metros): un salto de pose es un cambio brusco de DISTANCIA o
    // ALTURA de la cámara respecto a ANMI, no de dirección
    const off = (c) => [c.cam[0] - c.p[0], c.cam[1] - c.p[1], c.cam[2] - c.p[2]];
    const jumps = cams.slice(1).map((c, i) => { const a = off(c), b = off(cams[i]); return Math.max(Math.abs(Math.hypot(a[0], a[2]) - Math.hypot(b[0], b[2])), Math.abs(a[1] - b[1])); });
    R.data.absCamStep = cams.slice(1).map((c, i) => +Math.hypot(c.cam[0] - cams[i].cam[0], c.cam[2] - cams[i].cam[2]).toFixed(2));
    const travel = Math.hypot(cams.at(-1).p[0] - cams[0].p[0], cams.at(-1).p[2] - cams[0].p[2]);
    // un acercamiento por evitación (muro/sólido detrás: rig.distNow < distancia deseada) es correcto y se informa aparte
    const unexplained = jumps.filter((j, i) => j >= 1.5 && !cams[i].avoid && !cams[i + 1].avoid);
    R.note({ acercamientos_por_evitacion: cams.map((c, i) => c.avoid ? { i, distNow: c.distNow, p: c.p.map((v) => +v.toFixed(1)) } : null).filter(Boolean) });
    R.check(cams.every((c) => c.finite) && unexplained.length === 0, 'cámara finita y sin saltos de pose sin causa (distancia/altura respecto a ANMI; los acercamientos por evitación de sólidos se informan aparte)', 'vision', { maxOffsetJump: +Math.max(...jumps).toFixed(2), offsetJumps: jumps.map((j) => +j.toFixed(2)) });
    R.check(cams.some((c) => c.loco === 'ride') && travel > 8, 'recorrido real en tabla por el sector (Q + W + A/D)', 'input', { travel: +travel.toFixed(1), locos: [...new Set(cams.map((c) => c.loco))] });
    const occluded = cams.filter((c) => c.occ && !c.occ.dithered);
    R.check(occluded.length === 0, 'ANMI no queda tapada por geometría del parque fuera de la franja tramada junto a la cámara', 'vision', { occluded: occluded.map((c) => c.occ), dithered: cams.filter((c) => c.occ?.dithered).map((c) => c.occ) });
    R.note({ minDistPantera: Math.min(...cams.map((c) => c.dPan)) });
    R.data.cams = cams; R.data.frames = frames;
    R.pendingHuman('Vídeo continuo con jugador humano y aceptación artística NMG');
  } finally { await browser.close(); }
});
