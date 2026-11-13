// NPC-01/02: clips de NPC sobre el GLB COMPRIMIDO con el loader y la luz del juego. Para cada personaje y clip: N
// fotogramas frontal/lateral en una lámina, y medidas del cuerpo skinned por muestra (vértice más bajo respecto al apoyo,
// salto angular máximo por fotograma de brazos/cabeza, altura de manos). Las instancias del parque se aíslan en el sitio.
//   node tools/v3/npc-sheet.mjs [la_pantera,aissa,juseph,bella] [--n 8]  → captures/v3/P2/NPC/<id>.jpg + npc.json
import path from 'node:path';
import sharp from 'sharp';
import { Report, launch, openGame, clickStart, sleep } from './lib.mjs';

const ids = (process.argv[2] && !process.argv[2].startsWith('--') ? process.argv[2] : 'la_pantera,aissa,juseph').split(',');
const N = process.argv.includes('--n') ? +process.argv[process.argv.indexOf('--n') + 1] : 8;
const R = new Report('P2/NPC', 'npc', { ids, n: N, method: 'GLB servido por el juego (sync-assets), NpcActor real; mixer aislado por clip; 30 muestras/s para medidas' });
const browser = await launch();
const page = await openGame(browser, R, { viewport: { width: 420, height: 520, deviceScaleFactor: 1 }, save: null });
try {
  await clickStart(page);
  await page.evaluate(async (ids) => {
    const g = window.__bk;
    document.getElementById('hud').hidden = true; document.getElementById('touch').hidden = true; document.getElementById('hint').hidden = true;
    for (const id of ids) await g.loadNpc(id);
    g.autoMode = true; g.skater.frozen = true;
  }, ids);
  const meas = await page.evaluate((ids) => {
    const g = window.__bk, T = window.__bkTHREE, out = {};
    for (const id of ids) {
      const a = g.npcs.get(id)?.[0]; if (!a) { out[id] = { missing: true }; continue; }
      let body = null; a.model.traverse((o) => { if (o.isSkinnedMesh && (!body || o.geometry.attributes.position.count > body.geometry.attributes.position.count)) body = o; });
      const bones = {}; a.model.traverse((o) => { if (o.isBone) bones[o.name.replace(/^mixamorig:?/, '')] = o; });
      const watch = ['RightArm', 'RightForeArm', 'LeftArm', 'LeftForeArm', 'Head', 'Spine2'].filter((n) => bones[n]);
      out[id] = {};
      for (const [name, act] of a.actions) {
        const mixer = new T.AnimationMixer(a.model); const x = mixer.clipAction(act.getClip()); x.play();
        for (const y of a.actions.values()) y.stop();
        const d = act.getClip().duration; let low = Infinity, jump = { v: 0 }, prev = null, handMax = 0; const P = new T.Vector3(), q = new T.Quaternion();
        for (let t = 0; t <= d + 1e-6; t += 1 / 30) {
          mixer.setTime(Math.min(t, d - 1e-4)); a.root.updateMatrixWorld(true); body.skeleton.update();
          const n = body.geometry.attributes.position.count;
          for (let i = 0; i < n; i += 3) { body.getVertexPosition(i, P); P.applyMatrix4(body.matrixWorld); low = Math.min(low, P.y - a.root.position.y); }
          const cur = {}; for (const w of watch) { bones[w].getWorldQuaternion(q); cur[w] = q.clone(); }
          if (prev) for (const w of watch) { const v = cur[w].angleTo(prev[w]) * 180 / Math.PI / 2; /* muestras a 30 Hz → grados por fotograma de 60 Hz */ if (v > jump.v) jump = { v: +v.toFixed(1), bone: w, t: +t.toFixed(2) }; }
          prev = cur;
          for (const h of ['RightHand', 'LeftHand']) if (bones[h]) { bones[h].getWorldPosition(P); handMax = Math.max(handMax, P.y - a.root.position.y); }
        }
        x.stop(); mixer.uncacheRoot(a.model);
        out[id][name] = { seconds: +d.toFixed(2), lowMm: +(low * 1000).toFixed(0), jumpDegPer60: jump, handMaxM: +handMax.toFixed(2) };
      }
      a.backToIdle?.();
    }
    return out;
  }, ids);
  R.data.measures = meas;
  for (const [id, clips] of Object.entries(meas)) {
    if (clips.missing) { R.check(false, `${id}: cargado`, 'static'); continue; }
    for (const [c, m] of Object.entries(clips)) {
      R.check(m.lowMm >= -15, `${id} ${c}: no atraviesa el suelo (≥ −15 mm)`, 'static', m);
      R.check(m.jumpDegPer60.v <= 30, `${id} ${c}: sin saltos de pose (≤30°/fotograma a 60 Hz)`, 'static', m);
    }
  }
  // láminas
  for (const id of ids) {
    const clips = Object.keys(meas[id] ?? {}); const frames = [];
    for (const c of clips) for (const vw of ['front', 'side']) for (let i = 0; i < N; i++) {
      await page.evaluate(({ id, c, vw, i, N }) => {
        const g = window.__bk, T = window.__bkTHREE, a = g.npcs.get(id)[0];
        for (const y of a.actions.values()) y.stop();
        const x = a.actions.get(c); x.reset(); x.play(); x.setEffectiveWeight(1); x.time = x.getClip().duration * (i / Math.max(1, N - 1)) * 0.999; x.paused = true; a.mixer.update(0);
        const p = a.root.position, h = a.root.rotation.y;
        const fwd = new T.Vector3(Math.sin(h), 0, Math.cos(h)), side = new T.Vector3(Math.cos(h), 0, -Math.sin(h));
        const off = (vw === 'front' ? fwd : side).clone().multiplyScalar(3.2);
        g.rig.mode = 'fixed'; g.rig.cam.position.set(p.x + off.x, p.y + 1.0, p.z + off.z); g.rig.cam.lookAt(p.x, p.y + 0.9, p.z);
        g.rig.cam.fov = 42; g.rig.cam.updateProjectionMatrix();
        a.root.visible = true;   // el juego oculta NPC a >70 m de la cámara del fotograma anterior
        g.renderer.render(g.scene, g.rig.cam);
      }, { id, c, vw, i, N });
      frames.push(await page.screenshot({ type: 'png' }));
    }
    const W = 210, H = 260, cols = N;
    const tiles = await Promise.all(frames.map((f) => sharp(f).resize(W, H).toBuffer()));
    await sharp({ create: { width: W * cols, height: H * Math.ceil(tiles.length / cols), channels: 3, background: '#fff' } })
      .composite(tiles.map((t, k) => ({ input: t, left: (k % cols) * W, top: Math.floor(k / cols) * H }))).jpeg({ quality: 80 }).toFile(path.join(R.dir, `${id}.jpg`));
    R.note(`${id}.jpg: filas = ${clips.map((c) => `${c} frontal, ${c} lateral`).join('; ')}`);
  }
} catch (e) { R.data.errors.push('HARNESS ' + (e?.stack ?? e)); }
finally { await browser.close(); R.finish(); }
