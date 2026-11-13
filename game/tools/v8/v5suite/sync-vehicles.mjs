// T5-28 · Publica SOLO los vehículos V5 (assets/derived/v5/vehicles, receta derive_vehicles_v5.py) con la misma tubería que
// tools/sync-assets.mjs para vehículos (dedup, prune, weld, WebP ≤1024, meshopt medium). Comprueba el SHA del derivado contra
// el informe de la receta y registra la cadena receta → derivado → public en V5/evidencias/T5-28/sync-vehicles.json.
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { dedup, prune, meshopt, textureCompress, weld } from '@gltf-transform/functions';
import { MeshoptEncoder, MeshoptDecoder } from 'meshoptimizer';
import sharp from 'sharp';
import fs from 'node:fs';
import crypto from 'node:crypto';
import path from 'node:path';
import { GAME, ROOT, EVID } from '../lib.mjs';
await MeshoptEncoder.ready; await MeshoptDecoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.encoder': MeshoptEncoder, 'meshopt.decoder': MeshoptDecoder });
const sha = (f) => crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex');
const DIR = path.join(ROOT, 'assets', 'derived', 'v5', 'vehicles'), rep = JSON.parse(fs.readFileSync(path.join(DIR, 'report.json'), 'utf8'));
const out = { date: new Date().toISOString(), recipe: { file: 'assets/derived/v5/vehicles/derive_vehicles_v5.py', sha256: sha(path.join(DIR, 'derive_vehicles_v5.py')), report_recipe_sha256: rep.recipe_sha256 }, vehicles: {} };
for (const k of ['car', 'limo']) {
  const src = path.join(DIR, k, `${k}.glb`), dst = path.join(GAME, 'public', 'assets', 'props', `${k}.glb`);
  if (sha(src) !== rep[k].glb_sha256) throw new Error(`${k}.glb no coincide con el informe de la receta`);
  const doc = await io.read(src);
  await doc.transform(dedup(), prune({ keepLeaves: true, keepAttributes: false }), weld(),
    textureCompress({ encoder: sharp, targetFormat: 'webp', resize: [1024, 1024], quality: 86, slots: /^(?!normal)/ }),
    meshopt({ encoder: MeshoptEncoder, level: 'medium' }));
  await io.write(dst, doc);
  out.vehicles[k] = { derived: { sha256: sha(src), bytes: fs.statSync(src).size }, public: { file: path.relative(ROOT, dst), sha256: sha(dst), bytes: fs.statSync(dst).size }, materials: doc.getRoot().listMaterials().map((m) => m.getName()) };
  console.log('publicado', k, out.vehicles[k].public.sha256.slice(0, 16), out.vehicles[k].materials.join(','));
}
fs.writeFileSync(path.join(EVID, 'T5-28', 'sync-vehicles.json'), JSON.stringify(out, null, 1));
