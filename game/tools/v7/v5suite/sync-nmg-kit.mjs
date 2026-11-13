// T5-12/T5-26 · Publica SOLO el kit NMG (misma tubería que tools/sync-assets.mjs: dedup, prune, weld, WebP ≤1024, meshopt
// medium) sin regenerar el resto de public/. Verifica el SHA del derivado contra kit_report.json y deja la cadena trazable
// fuente(contrato+receta) → derivado → public en V5/evidencias/<tarea>/sync-nmg-kit.json.
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { dedup, prune, meshopt, textureCompress, weld } from '@gltf-transform/functions';
import { MeshoptEncoder, MeshoptDecoder } from 'meshoptimizer';
import sharp from 'sharp';
import fs from 'node:fs';
import crypto from 'node:crypto';
import path from 'node:path';
import { GAME, ROOT, EVID, arg } from '../lib.mjs';

await MeshoptEncoder.ready; await MeshoptDecoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.encoder': MeshoptEncoder, 'meshopt.decoder': MeshoptDecoder });
const NMG = path.join(ROOT, 'assets', 'derived', 'v4', 'nmg');
const sha = (f) => crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex');
const rep = JSON.parse(fs.readFileSync(path.join(NMG, 'kit_report.json'), 'utf8'));
const src = path.join(NMG, 'glb', 'nmg_kit.glb'), dst = path.join(GAME, 'public', 'assets', 'nmg', 'nmg_kit.glb');
if (sha(src) !== rep.kit.sha256) throw new Error('nmg_kit.glb no coincide con kit_report.json');
if (rep.contract_sha256 !== sha(path.join(GAME, 'src', 'world', 'nmg_kit.json'))) throw new Error('el kit se construyó con otro contrato nmg_kit.json');
if (rep.recipe_sha256 !== sha(path.join(NMG, 'build_nmg_kit.py'))) throw new Error('el kit se construyó con otra receta');
const doc = await io.read(src);
await doc.transform(dedup(), prune({ keepLeaves: true, keepAttributes: false }), weld(),
  textureCompress({ encoder: sharp, targetFormat: 'webp', resize: [1024, 1024], quality: 86, slots: /^(?!normal)/ }),
  textureCompress({ encoder: sharp, targetFormat: 'webp', resize: [512, 512], quality: 90, slots: /^normal/ }),
  meshopt({ encoder: MeshoptEncoder, level: 'medium' }));
await io.write(dst, doc);
const out = { date: new Date().toISOString(), contract: { file: 'game/src/world/nmg_kit.json', sha256: rep.contract_sha256 }, recipe: { file: 'assets/derived/v4/nmg/build_nmg_kit.py', sha256: rep.recipe_sha256 },
  derived: { file: path.relative(ROOT, src), sha256: sha(src), bytes: fs.statSync(src).size }, public: { file: path.relative(ROOT, dst), sha256: sha(dst), bytes: fs.statSync(dst).size }, nodes: rep.kit.nodes, pieces: rep.pieces };
const task = arg('task', 'T5-12'); fs.mkdirSync(path.join(EVID, task), { recursive: true });
fs.writeFileSync(path.join(EVID, task, 'sync-nmg-kit.json'), JSON.stringify(out, null, 1));
console.log('NMG KIT publicado', out.public.sha256.slice(0, 16), out.public.bytes, 'B');
