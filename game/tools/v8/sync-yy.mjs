// V8 · Publicación PARCIAL de YINYANG: solo tex/T_yy_*.webp (receta assets/derived/v8/yinyang/make_yy_textures.py),
// yy/yy_pool.{bin,json} (build_yy_pool.py, ya escritos por la receta), yy/yy_props.glb (Blender, M01) y npcs/rana.glb (derivado V8 con
// Dance). Lista permitida explícita: se comparan los SHA de TODO public/ antes y después; cualquier otro cambio es error.
// No ejecuta ni sustituye a tools/sync-assets.mjs. Uso: node tools/v8/sync-yy.mjs [--task YY8-11]
import sharp from 'sharp';
import fs from 'node:fs';
import crypto from 'node:crypto';
import path from 'node:path';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { dedup, prune, meshopt, textureCompress, resample } from '@gltf-transform/functions';
import { MeshoptEncoder, MeshoptDecoder } from 'meshoptimizer';

const GAME = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..');
const ROOT = path.resolve(GAME, '..');
const SRC = path.join(ROOT, 'assets/derived/v8/yinyang');
const PUB = path.join(GAME, 'public/assets');
const EVID = path.join(ROOT, 'V8/evidencias');
const task = process.argv.includes('--task') ? process.argv[process.argv.indexOf('--task') + 1] : 'YY8-11';
const ALLOWED = (k) => /^tex\/T_yy_[a-z0-9_]+\.webp$/.test(k) || /^yy\/yy_(pool\.bin|pool\.json|props\.glb)$/.test(k) || k === 'npcs/rana.glb';
const sha = (f) => crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex');
const tree = (d) => { const o = {}; const w = (x) => { for (const e of fs.readdirSync(x, { withFileTypes: true })) { if (e.name === '.DS_Store') continue; const p = path.join(x, e.name); if (e.isDirectory()) w(p); else o[path.relative(PUB, p)] = sha(p); } }; w(d); return o; };
const before = tree(PUB);
const out = { date: new Date().toISOString(), allowed: 'tex/T_yy_*.webp, yy/yy_pool.*, yy/yy_props.glb, npcs/rana.glb', textures: [], changed: [], added: [], untouched: 0 };
const meta = JSON.parse(fs.readFileSync(path.join(SRC, 'textures.json'), 'utf8')); out.recipe = meta.recipe; out.recipe_sha256 = meta.recipe_sha256;
fs.mkdirSync(path.join(PUB, 'yy'), { recursive: true });
for (const t of meta.textures) {
  const src = path.join(SRC, t.file); if (sha(src) !== t.sha256) throw new Error(`${t.file} no coincide con textures.json`);
  const name = path.basename(t.file, '.png'), rel = `tex/${name}.webp`; if (!ALLOWED(rel)) throw new Error(`${rel} fuera de la lista`);
  const dst = path.join(PUB, rel), alpha = /mural|logo|final|stencil/.test(name);
  await sharp(src).webp(alpha ? { quality: 88, alphaQuality: 90, effort: 6 } : { quality: 86, effort: 6 }).toFile(dst + '.tmp'); fs.renameSync(dst + '.tmp', dst);
  out.textures.push({ src: t.file, sha256: t.sha256, public: rel, public_sha256: sha(dst), bytes: fs.statSync(dst).size });
}
await MeshoptEncoder.ready; await MeshoptDecoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.encoder': MeshoptEncoder, 'meshopt.decoder': MeshoptDecoder });
const glb = async (src, rel, opts = {}) => {
  if (!fs.existsSync(src)) { out[rel] = 'sin fuente (no se publica)'; return; }
  const doc = await io.read(src);
  if (opts.npc) for (const m of doc.getRoot().listMaterials()) { m.setMetallicRoughnessTexture(null); m.setRoughnessFactor(0.8); m.setMetallicFactor(0); }
  await doc.transform(dedup(), prune({ keepLeaves: true, keepAttributes: false }), ...(opts.npc ? [resample()] : []),
    textureCompress({ encoder: sharp, targetFormat: 'webp', resize: [1024, 1024], quality: 86, slots: /^(?!normal)/ }),
    textureCompress({ encoder: sharp, targetFormat: 'webp', resize: [512, 512], quality: 90, slots: /^normal/ }),
    meshopt({ encoder: MeshoptEncoder, level: 'medium' }));
  const dst = path.join(PUB, rel), tmp = dst.replace(/\.glb$/, '.tmp.glb'); await io.write(tmp, doc); fs.renameSync(tmp, dst);
  out[rel] = { src: path.relative(ROOT, src), sha256: sha(src), public_sha256: sha(dst), bytes: fs.statSync(dst).size, clips: doc.getRoot().listAnimations().map((a) => a.getName()) };
};
await glb(path.join(SRC, 'props/yy_props.glb'), 'yy/yy_props.glb');
await glb(path.join(SRC, 'rana/rana_v8.glb'), 'npcs/rana.glb', { npc: true });
for (const k of ['yy/yy_pool.bin', 'yy/yy_pool.json']) out[k] = { public_sha256: sha(path.join(PUB, k)), bytes: fs.statSync(path.join(PUB, k)).size };
const after = tree(PUB);
for (const k of new Set([...Object.keys(before), ...Object.keys(after)])) { if (before[k] === after[k]) out.untouched++; else (before[k] ? out.changed : out.added).push(k); }
const bad = [...out.changed, ...out.added].filter((k) => !ALLOWED(k));
fs.mkdirSync(path.join(EVID, task), { recursive: true }); fs.writeFileSync(path.join(EVID, task, 'sync-yy.json'), JSON.stringify(out, null, 1));
if (bad.length) { console.error('CAMBIOS FUERA DE LA LISTA', bad); process.exit(1); }
console.log('sync-yy ok', out.textures.length, 'texturas; cambiados', out.changed.length, 'nuevos', out.added.length, 'intactos', out.untouched);
