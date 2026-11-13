// V7 T7-11 · Publicación PARCIAL de TRA TRA TRA: solo las texturas T_tt_* (receta assets/derived/v7/tratratra) y, si existen,
// los derivados sentados de Aissa y Juseph (npcs/aissa.glb, npcs/juseph.glb). Lista permitida explícita: cualquier otro
// archivo de public/ que cambie es un error (se comparan los SHA de TODO public/ antes y después). No ejecuta ni sustituye
// a tools/sync-assets.mjs (global, con vehículos V4).
// Cadena fuente (receta + contrato) → derivado → public en V7/evidencias/<tarea>/sync-tt.json.
import sharp from 'sharp';
import fs from 'node:fs';
import crypto from 'node:crypto';
import path from 'node:path';
import { GAME, ROOT, EVID, arg } from './lib.mjs';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { dedup, prune, meshopt, textureCompress, resample, weld, simplify } from '@gltf-transform/functions';
import { MeshoptEncoder, MeshoptDecoder, MeshoptSimplifier } from 'meshoptimizer';

const SRC = path.join(ROOT, 'assets/derived/v7/tratratra');
const PUB = path.join(GAME, 'public/assets');
const ALLOWED = (k) => /^tex\/T_tt_[a-z]+\.webp$/.test(k) || k === 'npcs/aissa.glb' || k === 'npcs/juseph.glb';
const sha = (f) => crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex');
const tree = (d) => { const o = {}; const w = (x) => { for (const e of fs.readdirSync(x, { withFileTypes: true })) { if (e.name === '.DS_Store') continue; const p = path.join(x, e.name); if (e.isDirectory()) w(p); else o[path.relative(PUB, p)] = sha(p); } }; w(d); return o; };
const before = tree(PUB);
const out = { date: new Date().toISOString(), allowed: 'tex/T_tt_*.webp, npcs/aissa.glb, npcs/juseph.glb', textures: [], untouched: 0, changed: [], added: [] };
const texMeta = JSON.parse(fs.readFileSync(path.join(SRC, 'textures.json'), 'utf8'));
out.recipe = texMeta.recipe; out.contract = texMeta.contract;
for (const t of texMeta.textures) {
  const src = path.join(SRC, t.file); if (sha(src) !== t.sha256) throw new Error(`${t.file} no coincide con textures.json`);
  const name = path.basename(t.file, '.png'), rel = `tex/${name}.webp`; if (!ALLOWED(rel)) throw new Error(`${rel} fuera de la lista permitida`);
  const dst = path.join(PUB, rel), alpha = /paint|graffiti/.test(name);
  await sharp(src).webp(alpha ? { quality: 90, alphaQuality: 92, effort: 6 } : { quality: 88, effort: 6 }).toFile(dst + '.tmp'); fs.renameSync(dst + '.tmp', dst);
  out.textures.push({ src: path.relative(ROOT, src), sha256: t.sha256, public: path.relative(ROOT, dst), public_sha256: sha(dst), bytes: fs.statSync(dst).size });
}
// NPC sentados (misma tubería que tools/v6/sync-npcs.mjs: dedup, prune, resample, WebP ≤1024 / normales ≤512, sin MR, meshopt medio)
out.npcs = {};
{ await MeshoptEncoder.ready; await MeshoptDecoder.ready; await MeshoptSimplifier.ready;
  const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.encoder': MeshoptEncoder, 'meshopt.decoder': MeshoptDecoder });
  const recipe = path.join(GAME, 'tools/v7/build_npcs_tt.py'); out.npcRecipe = { file: path.relative(ROOT, recipe), sha256: sha(recipe) };
  for (const id of ['aissa', 'juseph']) {
    const src = path.join(SRC, 'npcs', `${id}.glb`); if (!fs.existsSync(src)) continue;
    const dst = path.join(PUB, 'npcs', `${id}.glb`), doc = await io.read(src);
    // V7 R6 (usuario): caras con más detalle:
    // ver build_npcs_tt.py (FACE_KEEP)
    const tris = () => doc.getRoot().listMeshes().reduce((a, m) => a + m.listPrimitives().reduce((b, p) => b + (p.getIndices()?.getCount() ?? 0) / 3, 0), 0);
    const tris0 = tris();
    // (R6: probado simplificar aquí con meshoptimizer; dejaba astillas en los ojos. La reducción la hace build_npcs_tt.py con la
    //  cabeza intacta; esto queda solo como red por si llegara una malla sin reducir)
    if (tris0 > 60000 && !process.env.NO_SIMPLIFY) await doc.transform(weld(), simplify({ simplifier: MeshoptSimplifier, ratio: 40000 / tris0, error: 0.01, lockBorder: false }));
    const trisOut = tris();
    for (const m of doc.getRoot().listMaterials()) { m.setMetallicRoughnessTexture(null); m.setRoughnessFactor(0.8); m.setMetallicFactor(0); }
    await doc.transform(dedup(), prune({ keepLeaves: true, keepAttributes: false }), resample(),
      textureCompress({ encoder: sharp, targetFormat: 'webp', resize: [1024, 1024], quality: 86, slots: /^(?!normal)/ }),
      textureCompress({ encoder: sharp, targetFormat: 'webp', resize: [512, 512], quality: 90, slots: /^normal/ }),
      meshopt({ encoder: MeshoptEncoder, level: 'medium' }));
    const tmp = dst.replace(/\.glb$/, '.tmp.glb'); await io.write(tmp, doc); fs.renameSync(tmp, dst);   // la extensión .glb es la que hace que se escriba un GLB único
    out.npcs[id] = { src: path.relative(ROOT, src), sha256: sha(src), public: path.relative(ROOT, dst), public_sha256: sha(dst), bytes: fs.statSync(dst).size, tris: [tris0, trisOut], clips: doc.getRoot().listAnimations().map((a) => a.getName()) };
  } }
const after = tree(PUB);
for (const k of new Set([...Object.keys(before), ...Object.keys(after)])) {
  if (before[k] === after[k]) out.untouched++;
  else (before[k] ? out.changed : out.added).push(k);
}
out.foreignChanged = [...out.changed, ...out.added].filter((k) => !ALLOWED(k));
const task = arg('task', 'T7-11'); fs.mkdirSync(path.join(EVID, task), { recursive: true });
fs.writeFileSync(path.join(EVID, task, 'sync-tt.json'), JSON.stringify(out, null, 1));
console.log('TT publicado:', out.changed.length, 'cambiados', out.added.length, 'añadidos', out.untouched, 'intactos', out.foreignChanged.length ? 'AJENOS CAMBIADOS: ' + out.foreignChanged.join(',') : '· ningún archivo ajeno cambiado');
if (out.foreignChanged.length) process.exitCode = 1;
