// V10.1 · escena final (guardián de D1-23…D1-29): al ganar el reto de SN, escena (V10.3: 47 s, W-D09; ventanas reescaladas con copia previa en
// V10/backups/pruebas/V10_3-R2) en lugar del preview. Vigila el guion del tramo de
// grupo (Bellakat y Bellakroak saludan con la cámara cerca de cada uno; ANMI hace la paz con los dedos modelados, la pierna derecha adelante,
// la izquierda atrás y los pies sin hundirse), que al acabar la canción de SN sigue en el parque LIMPIA (sin la cadena de radio, a la ganancia
// de la escena) justo donde iba la escena (0:32, pista de 0:32–0:59), y que SALTAR (Esc) corta la canción. También con «reducir movimiento».
import { Report, runTest, launch, openGame, clickStart, sleep, fixture, SAVE_20, VIEWPORTS } from '../v8/lib.mjs';
const R = new Report('escena-final');
const save = (reduced) => ({ ...SAVE_20, finalDone: true, finalProof: { kind: 'secretnovio_v10', at: new Date().toISOString() }, settings: { reducedMotion: reduced, reducedMotionSet: true, iosAppAsked: true } });
const startScene = async (page, label) => fixture(page, R, `${label}: ANMI en la recepción del reto y la escena lanzada como al aterrizar`, async () => {
  const g = window.__bk; await g.loadSnCast(); const a = g.manifest.get('sn.landing');
  g.skater.teleport(a.pos.clone().add(new window.__bkTHREE.Vector3(0, 0.05, 0)), a.heading, 'ride'); g.rig.snapBehind(g.skater);
  await new Promise((r) => setTimeout(r, 1200)); g.showPreview(); return { ok: true }; });
// muestra del estado de la escena (ligera: cada ~50 ms)
const sample = (page) => page.evaluate(() => {
  const g = window.__bk, T = window.__bkTHREE, c = g.cine, cast = g.snCast, cam = g.rig.cam.position, v = g.visual;
  const wave = (a) => { const w = a?.actions?.get('Wave'); return !!w && w.isRunning() && w.getEffectiveWeight() > 0.3; };
  const dist = (a) => a ? +a.root.getWorldPosition(new T.Vector3()).setY(0).distanceTo(cam.clone().setY(0)).toFixed(2) : 99;
  let paz = false; g.scene.traverse((o) => { if (o.name === 'ANMI_PAZ' && o.visible) paz = true; });
  return { t: c ? +c.t.toFixed(2) : -1, mode: g.mode, peace: +(v.peace ?? 0).toFixed(2), paz, catWave: wave(cast[1]), frogWave: wave(cast[0]), dCat: dist(cast[1]), dFrog: dist(cast[0]), prev: g.audio.music.previewPlaying };
});
// pose de ANMI: manos, pies respecto a la cadera y vértice más bajo del cuerpo
const pose = (page) => page.evaluate(() => {
  const g = window.__bk, T = window.__bkTHREE, v = g.visual, s = g.skater, h = s.heading, fwd = new T.Vector3(Math.sin(h), 0, Math.cos(h)), bones = {};
  v.body.skeleton.bones.forEach((b) => { bones[b.name.replace('mixamorig', '')] = b; }); const W = (n) => bones[n].getWorldPosition(new T.Vector3()), hp = W('Hips');
  v.model.updateMatrixWorld(true); v.body.skeleton.update(); let low = 9; const n = v.body.geometry.attributes.position.count, tv = new T.Vector3();
  for (let i = 0; i < n; i += 5) { v.body.getVertexPosition(i, tv).applyMatrix4(v.body.matrixWorld); if (tv.y < low) low = tv.y; }
  return { t: +(g.cine?.t ?? -1).toFixed(2), handUp: +(W('RightHand').y - W('RightArm').y).toFixed(3), leftHandToHip: +W('LeftHand').distanceTo(W('LeftUpLeg')).toFixed(3),
    fR: +W('RightFoot').sub(hp).dot(fwd).toFixed(3), fL: +W('LeftFoot').sub(hp).dot(fwd).toFixed(3), low: +low.toFixed(4) };
});
const snTrack = (page) => page.evaluate(() => { const g = window.__bk, M = g.audio.music, t = [...M.tracks.values()].find((x) => x.id === 'secretnovio');
  return { mode: g.mode, playing: !!t?.playing, clean: !!t?.isClean, cg: +(t?.clean?.gain.value ?? -1).toFixed(3), og: +(t?.out?.gain.value ?? -1).toFixed(3), off: t ? +(g.audio.ctx.currentTime - t.t0).toFixed(3) : null,
    dur: +(t?.buffer?.duration ?? 0).toFixed(3), prev: M.previewPlaying }; });

await runTest(R, async () => {
  const b = await launch();
  try {
    for (const reduced of [false, true]) {
      const L = reduced ? 'reducido' : 'normal', errs = [];
      const page = await openGame(b, R, { viewport: VIEWPORTS.desktop, save: save(reduced) });
      page.on('pageerror', (e) => errs.push(String(e).slice(0, 160)));
      await clickStart(page); await sleep(2500);
      await startScene(page, L);
      const rows = [], poses = []; let base = null, lastT = 0, after = null; const t0 = Date.now();
      while (Date.now() - t0 < 80000) {
        const r = await sample(page); rows.push(r);
        if (r.t > 0) lastT = r.t;
        if (!base && r.t > 12 && r.t < 15) base = await pose(page);
        if (r.t > 21.0 && r.t < 22.4 && poses.length < 3 && (!poses.length || r.t - poses.at(-1).t > 0.5)) poses.push(await pose(page));
        if (r.t < 0 && lastT > 45) { await sleep(150); after = await snTrack(page); await sleep(400); after.prevLuego = (await snTrack(page)).prev; break; }   // la pista arranca 10 ms después (su ganancia se fija para ese instante) y la escena se funde en 60 ms
        await sleep(40);
      }
      const win = (a, z) => rows.filter((r) => r.t >= a && r.t <= z);
      R.check(lastT >= 46.4 && lastT <= 47.6 && after?.mode === 'explore', `${L}: la escena dura 47 s y vuelve al juego`, 'input', { lastT, mode: after?.mode });
      const cat = win(16.3, 17.3), frog = win(18.4, 19.4);
      R.check(cat.length > 3 && cat.every((r) => r.dCat < 2.6) && cat.some((r) => r.catWave), `${L}: 16–17,5 s, la cámara cerca de Bellakat (< 2,6 m) y ella saluda`, 'input', { n: cat.length, maxD: Math.max(...cat.map((r) => r.dCat)), wave: cat.some((r) => r.catWave) });
      R.check(frog.length > 3 && frog.every((r) => r.dFrog < 2.9) && frog.some((r) => r.frogWave), `${L}: 18,2–19,5 s, la cámara cerca de Bellakroak (< 2,9 m) y saluda`, 'input', { n: frog.length, maxD: Math.max(...frog.map((r) => r.dFrog)), wave: frog.some((r) => r.frogWave) });
      const pz = win(20.9, 22.6), before = win(16, 20.2);
      R.check(pz.length > 3 && pz.every((r) => r.peace > 0.97 && r.paz) && before.every((r) => !r.paz), `${L}: 20,9–22,6 s, ANMI hace la paz con los dedos modelados (y no antes de que la cámara llegue a ella, 20,3 s)`, 'input', { n: pz.length, peace: Math.min(...pz.map((r) => r.peace)), paz: pz.every((r) => r.paz) });
      R.check(!!base && poses.length >= 2 && poses.every((p) => p.handUp > 0.05 && p.leftHandToHip < 0.32 && p.fR - p.fL > 0.15 && p.low >= base.low - 0.004),
        `${L}: la paz arriba, la otra mano en la cadera, pierna derecha adelante y la izquierda atrás, sin hundir los pies (± 4 mm)`, 'input', { base, poses });
      // V10.4 R13 (usuario: 1 s más con el grupo; la paz se recoge de 24,4 a 24,9 s; copia previa en V10/backups/pruebas/V10_4-R10)
      const sky = win(25.2, 45); R.check(sky.length > 3 && sky.every((r) => !r.paz), `${L}: en el cielo ya no hay dedos de la paz`, 'static', { n: sky.length });
      R.check(after && after.playing && after.clean && after.cg > 0.95 && after.og < 0.01 && after.off > 14.8 && after.off < 15.6 && Math.abs(after.dur - 19.91) < 0.02 && !after.prevLuego,
        `${L}: al acabar, la canción de SN sigue limpia (ganancia de la escena, sin cadena de radio) desde el 0:47 (15 s dentro de la pista 0:32–0:52) y la de la escena calla`, 'input', after);
      const pAfter = await page.evaluate(() => window.__bk.visual.peace ?? 0); R.check(pAfter === 0, `${L}: ANMI vuelve sin la pose`, 'static', { peace: pAfter });
      R.check(errs.length === 0, `${L}: sin errores en la página`, 'static', errs);
      // SALTAR con Esc a los 5 s: la canción de la escena se corta y no hay empalme
      if (!reduced) {
        await sleep(1500); await startScene(page, `${L} (saltar)`);
        for (let i = 0; i < 300; i++) { const t = await page.evaluate(() => window.__bk.cine?.t ?? -1); if (t > 5) break; await sleep(50); }
        await page.keyboard.press('Escape'); await sleep(1400);
        const sk = await snTrack(page); R.check(sk.mode === 'explore' && !sk.prev, `${L}: SALTAR (Esc) a los 5 s corta la canción de la escena y vuelve al juego`, 'input', sk);
        // V10.3 (W-D10, R3-10): tras SALTAR la pista del parque empieza en el 0:32 (su reloj se pone a cero al saltar: ~1,4 s después)
        R.check(sk.playing && sk.off > 0.8 && sk.off < 2.2, `${L}: tras SALTAR la canción del parque empieza en el 0:32 (lleva ${sk.off} s)`, 'input', sk);
      }
      await page.close();
    }
  } finally { await b.close(); }
}, { timeoutMs: 500000 });
