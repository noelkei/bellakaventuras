// NPC-03/04: reproducir el EXPORT COMPRIMIDO de rana/Fennec con el loader del juego SIN publicarlos ni colocarlos en el
// parque. 1) Comprime assets/derived/v3/npcs/<id>/<id>.glb con las mismas operaciones que sync-assets usa para NPCs
// (dedup, prune, resample, WebP 1024/512, meshopt, sin metal-rugosidad) → game/.cache/preview/<id>.glb (fuera de public y
// del build). 2) En el juego (servidor de desarrollo) lo carga el GLTFLoader+Meshopt de src/assets.ts y lo anima NpcActor
// en un hueco libre junto al jugador; mide suelo y saltos de pose por clip y monta lámina frente/lado.
//   node tools/v3/npc-preview.mjs rana,fennec → captures/v3/P2/NPC/preview_<id>.jpg + preview.json
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { dedup, prune, meshopt, textureCompress, resample } from '@gltf-transform/functions';
import { MeshoptEncoder, MeshoptDecoder } from 'meshoptimizer';
import { Report, launch, openGame, clickStart, GAME } from './lib.mjs';

const ids = (process.argv[2] ?? 'rana,fennec').split(',');
const R = new Report('P2/NPC', 'preview', { ids, method: 'compresión idéntica a sync-assets (NPC) en .cache/preview; GLTFLoader+Meshopt del juego; NpcActor; 30 muestras/s' });
await MeshoptEncoder.ready; await MeshoptDecoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.encoder': MeshoptEncoder, 'meshopt.decoder': MeshoptDecoder });
const PREV = path.join(GAME, '.cache', 'preview'); fs.mkdirSync(PREV, { recursive: true });
for (const id of ids) {
  const src = path.resolve(GAME, '..', 'assets', 'derived', 'v3', 'npcs', id, `${id}.glb`);
  const doc = await io.read(src);
  for (const m of doc.getRoot().listMaterials()) { m.setMetallicRoughnessTexture(null); m.setRoughnessFactor(0.8); m.setMetallicFactor(0); }
  await doc.transform(dedup(), prune({ keepLeaves: true, keepAttributes: false }), resample(),
    textureCompress({ encoder: sharp, targetFormat: 'webp', resize: [1024, 1024], quality: 86, slots: /^(?!normal)/ }),
    textureCompress({ encoder: sharp, targetFormat: 'webp', resize: [512, 512], quality: 90, slots: /^normal/ }),
    meshopt({ encoder: MeshoptEncoder, level: 'medium' }));
  await io.write(path.join(PREV, `${id}.glb`), doc);
  R.note({ id, bytesRaw: fs.statSync(src).size, bytesCompressed: fs.statSync(path.join(PREV, `${id}.glb`)).size });
}
const browser = await launch();
const page = await openGame(browser, R, { viewport: { width: 420, height: 520, deviceScaleFactor: 1 }, save: null });
try {
  await clickStart(page);
  const meas = await page.evaluate(async (ids) => {
    const g = window.__bk, T = window.__bkTHREE;
    for (const id of ['hud', 'touch', 'hint']) document.getElementById(id).hidden = true;
    g.autoMode = true; g.skater.frozen = true;
    const { loader } = await import('/src/assets.ts'); const { NpcActor } = await import('/src/npc.ts');
    const out = {}; window.__prev = {};
    let k = 0;
    for (const id of ids) {
      const gltf = await loader.loadAsync(`/.cache/preview/${id}.glb`);
      const a = new NpcActor(gltf, { idle: 'Idle', phase: 0 });
      const p = g.skater.footPos.clone().add(new T.Vector3(3 + 3 * k++, 0, 0)); a.place(p, 0); g.scene.add(a.root); window.__prev[id] = a;
      let body = null; a.model.traverse((o) => { if (o.isSkinnedMesh && (!body || o.geometry.attributes.position.count > body.geometry.attributes.position.count)) body = o; });
      const bones = {}; a.model.traverse((o) => { if (o.isBone) bones[o.name.replace(/^mixamorig:?/, '')] = o; });
      const watch = ['RightArm', 'RightForeArm', 'LeftArm', 'LeftForeArm', 'Head', 'Spine2', 'RightUpLeg', 'RightLeg', 'Tail_0'].filter((n) => bones[n]);
      out[id] = {};
      for (const [name, act] of a.actions) {
        for (const y of a.actions.values()) y.stop();
        const mixer = new T.AnimationMixer(a.model); const x = mixer.clipAction(act.getClip()); x.play();
        const d = act.getClip().duration; let low = Infinity, jump = { v: 0 }, prev = null; const P = new T.Vector3(), q = new T.Quaternion();
        for (let t = 0; t <= d + 1e-6; t += 1 / 30) {
          mixer.setTime(Math.min(t, d - 1e-4)); a.root.updateMatrixWorld(true); body.skeleton.update();
          const n = body.geometry.attributes.position.count;
          for (let i = 0; i < n; i += 3) { body.getVertexPosition(i, P); P.applyMatrix4(body.matrixWorld); low = Math.min(low, P.y - a.root.position.y); }
          const cur = {}; for (const w of watch) { bones[w].getWorldQuaternion(q); cur[w] = q.clone(); }
          if (prev) for (const w of watch) { const v = cur[w].angleTo(prev[w]) * 180 / Math.PI / 2; if (v > jump.v) jump = { v: +v.toFixed(1), bone: w, t: +t.toFixed(2) }; }
          prev = cur;
        }
        x.stop(); mixer.uncacheRoot(a.model);
        out[id][name] = { seconds: +d.toFixed(2), lowMm: +(low * 1000).toFixed(0), jumpDegPer60: jump };
      }
    }
    return out;
  }, ids);
  R.data.measures = meas;
  for (const [id, clips] of Object.entries(meas)) for (const [c, m] of Object.entries(clips)) {
    R.check(m.lowMm >= -15, `${id} ${c}: GLB comprimido sobre el suelo (≥ −15 mm)`, 'static', m);
    R.check(m.jumpDegPer60.v <= 30, `${id} ${c}: sin saltos de pose (≤30°/fotograma a 60 Hz)`, 'static', m);
  }
  for (const id of ids) {
    const frames = [];
    for (const c of Object.keys(meas[id])) for (const vw of ['front', 'side']) for (let i = 0; i < 6; i++) {
      await page.evaluate(({ id, c, vw, i }) => {
        const g = window.__bk, T = window.__bkTHREE, a = window.__prev[id];
        for (const [k, b] of Object.entries(window.__prev)) b.root.visible = k === id;
        for (const y of a.actions.values()) y.stop();
        const x = a.actions.get(c); x.reset(); x.play(); x.setEffectiveWeight(1); x.time = x.getClip().duration * (i / 5) * 0.999; x.paused = true; a.mixer.update(0);
        const p = a.root.position, h = a.root.rotation.y;
        const dir = vw === 'front' ? new T.Vector3(Math.sin(h), 0, Math.cos(h)) : new T.Vector3(Math.cos(h), 0, -Math.sin(h));
        g.rig.mode = 'fixed'; g.rig.cam.position.set(p.x + dir.x * 3.4, p.y + 1.0, p.z + dir.z * 3.4); g.rig.cam.lookAt(p.x, p.y + 0.85, p.z);
        g.rig.cam.fov = 42; g.rig.cam.updateProjectionMatrix(); g.skater && (g.visual.root.visible = false);
      }, { id, c, vw, i });
      await new Promise((r) => setTimeout(r, 60));
      frames.push(await page.screenshot({ type: 'png' }));
    }
    const W = 200, H = 248; const tiles = await Promise.all(frames.map((f) => sharp(f).resize(W, H).toBuffer()));
    await sharp({ create: { width: W * 6, height: H * Math.ceil(tiles.length / 6), channels: 3, background: '#fff' } })
      .composite(tiles.map((t, k) => ({ input: t, left: (k % 6) * W, top: Math.floor(k / 6) * H }))).jpeg({ quality: 80 }).toFile(path.join(R.dir, `preview_${id}.jpg`));
  }
} catch (e) { R.data.errors.push('HARNESS ' + (e?.stack ?? e)); }
finally { await browser.close(); R.finish(); }
