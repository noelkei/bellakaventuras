// T5-19 · Publica SOLO el personaje ANMI (misma tubería que tools/sync-assets.mjs para el personaje: dedup, prune, resample,
// WebP ≤1024 (normales ≤512), meshopt medium; sin tocar materiales) + clips.json. Cadena trazable receta → .cache → public en
// V5/evidencias/<tarea>/sync-anmi.json. Uso: node tools/v5/sync-anmi.mjs [--task T5-19]
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { dedup, prune, meshopt, textureCompress, resample } from '@gltf-transform/functions';
import { MeshoptEncoder, MeshoptDecoder } from 'meshoptimizer';
import sharp from 'sharp';
import fs from 'node:fs';
import crypto from 'node:crypto';
import path from 'node:path';
import { GAME, ROOT, EVID, arg } from './lib.mjs';
await MeshoptEncoder.ready; await MeshoptDecoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.encoder': MeshoptEncoder, 'meshopt.decoder': MeshoptDecoder });
const sha = (f) => crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex');
const src = path.join(GAME, '.cache', 'ANMI_GAME.glb'), dst = path.join(GAME, 'public', 'assets', 'character', 'anmi.glb');
const csrc = path.join(GAME, '.cache', 'ANMI_GAME.clips.json'), cdst = path.join(GAME, 'public', 'assets', 'character', 'anmi.clips.json');
const doc = await io.read(src);
await doc.transform(dedup(), prune({ keepLeaves: true, keepAttributes: false }), resample(),
  textureCompress({ encoder: sharp, targetFormat: 'webp', resize: [1024, 1024], quality: 86, slots: /^(?!normal)/ }),
  textureCompress({ encoder: sharp, targetFormat: 'webp', resize: [512, 512], quality: 90, slots: /^normal/ }),
  meshopt({ encoder: MeshoptEncoder, level: 'medium' }));
await io.write(dst, doc); fs.copyFileSync(csrc, cdst);
const out = { date: new Date().toISOString(), recipe: { file: 'game/tools/build_character_v3.py', sha256: sha(path.join(GAME, 'tools', 'build_character_v3.py')) },
  cache: { glb: sha(src), clips: sha(csrc), bytes: fs.statSync(src).size }, public: { glb: { file: path.relative(ROOT, dst), sha256: sha(dst), bytes: fs.statSync(dst).size }, clips: { file: path.relative(ROOT, cdst), sha256: sha(cdst) } },
  clips: doc.getRoot().listAnimations().map((a) => a.getName()) };
const task = arg('task', 'T5-19'); fs.mkdirSync(path.join(EVID, task), { recursive: true });
fs.writeFileSync(path.join(EVID, task, 'sync-anmi.json'), JSON.stringify(out, null, 1));
console.log('ANMI publicado', out.public.glb.sha256.slice(0, 16), out.clips.length, 'clips');
