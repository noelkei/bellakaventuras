// T5-20 · Publica SOLO los NPC indicados (misma tubería que tools/sync-assets.mjs para NPCs: dedup, prune, resample,
// WebP ≤1024 (normales ≤512), sin texturas MR, meshopt medium). Cadena trazable receta → .cache → public en
// V5/evidencias/<tarea>/sync-npcs.json. Uso: node tools/v5/sync-npcs.mjs aissa juseph la_pantera [--task T5-20]
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { dedup, prune, meshopt, textureCompress, resample } from '@gltf-transform/functions';
import { MeshoptEncoder, MeshoptDecoder } from 'meshoptimizer';
import sharp from 'sharp';
import fs from 'node:fs';
import crypto from 'node:crypto';
import path from 'node:path';
import { GAME, ROOT, EVID, arg } from '../lib.mjs';
await MeshoptEncoder.ready; await MeshoptDecoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.encoder': MeshoptEncoder, 'meshopt.decoder': MeshoptDecoder });
const sha = (f) => crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex');
const ids = process.argv.slice(2).filter((a) => !a.startsWith('--') && a !== arg('task'));
const out = { date: new Date().toISOString(), recipe: { file: 'game/tools/build_npcs.py', sha256: sha(path.join(GAME, 'tools', 'build_npcs.py')) }, npcs: {} };
for (const id of ids) {
  const src = path.join(GAME, '.cache', 'npcs', `${id}.glb`), dst = path.join(GAME, 'public', 'assets', 'npcs', `${id}.glb`);
  const doc = await io.read(src);
  for (const m of doc.getRoot().listMaterials()) { m.setMetallicRoughnessTexture(null); m.setRoughnessFactor(0.8); m.setMetallicFactor(0); }
  await doc.transform(dedup(), prune({ keepLeaves: true, keepAttributes: false }), resample(),
    textureCompress({ encoder: sharp, targetFormat: 'webp', resize: [1024, 1024], quality: 86, slots: /^(?!normal)/ }),
    textureCompress({ encoder: sharp, targetFormat: 'webp', resize: [512, 512], quality: 90, slots: /^normal/ }),
    meshopt({ encoder: MeshoptEncoder, level: 'medium' }));
  await io.write(dst, doc);
  out.npcs[id] = { cache: { sha256: sha(src), bytes: fs.statSync(src).size }, public: { file: path.relative(ROOT, dst), sha256: sha(dst), bytes: fs.statSync(dst).size }, clips: doc.getRoot().listAnimations().map((a) => a.getName()) };
  console.log('NPC publicado', id, out.npcs[id].public.sha256.slice(0, 16));
}
const task = arg('task', 'T5-20'); fs.mkdirSync(path.join(EVID, task), { recursive: true });
fs.writeFileSync(path.join(EVID, task, 'sync-npcs.json'), JSON.stringify(out, null, 1));
