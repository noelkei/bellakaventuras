// V6 T6-12 · Publicación PARCIAL de FASHION GIRL: solo los derivados FG (texturas T_fg_*, atrezzo fg_props.glb si existe).
// No toca ningún otro archivo de public/ (comprueba los hashes de todo public/ antes y después: solo cambian los FG).
// Cadena fuente (receta + contrato) → derivado → public en V6/evidencias/<tarea>/sync-fg.json.
import sharp from 'sharp';
import fs from 'node:fs';
import crypto from 'node:crypto';
import path from 'node:path';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { dedup, prune, meshopt, textureCompress, weld } from '@gltf-transform/functions';
import { MeshoptEncoder, MeshoptDecoder } from 'meshoptimizer';
import { GAME, ROOT, EVID, arg } from './lib.mjs';

const SRC = path.join(ROOT, 'assets/derived/v6/fashion_girl');
const PUB = path.join(GAME, 'public/assets');
const sha = (f) => crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex');
const tree = (d) => { const o = {}; const w = (x) => { for (const e of fs.readdirSync(x, { withFileTypes: true })) { const p = path.join(x, e.name); if (e.isDirectory()) w(p); else o[path.relative(PUB, p)] = sha(p); } }; w(d); return o; };
const before = tree(PUB);
const out = { date: new Date().toISOString(), textures: [], props: null, untouched: 0, changed: [] };
const texMeta = JSON.parse(fs.readFileSync(path.join(SRC, 'textures.json'), 'utf8'));
for (const t of texMeta.textures) {
  const src = path.join(SRC, t.file); if (sha(src) !== t.sha256) throw new Error(`${t.file} no coincide con textures.json`);
  const name = path.basename(t.file, '.png'), dst = path.join(PUB, 'tex', `${name}.webp`);
  await sharp(src).webp({ quality: 88, effort: 6 }).toFile(dst + '.tmp'); fs.renameSync(dst + '.tmp', dst);
  out.textures.push({ src: path.relative(ROOT, src), sha256: t.sha256, public: path.relative(ROOT, dst), public_sha256: sha(dst), bytes: fs.statSync(dst).size });
}
const propsGlb = path.join(SRC, 'glb', 'fg_props.glb');
if (fs.existsSync(propsGlb)) {
  await MeshoptEncoder.ready; await MeshoptDecoder.ready;
  const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.encoder': MeshoptEncoder, 'meshopt.decoder': MeshoptDecoder });
  const doc = await io.read(propsGlb);
  await doc.transform(dedup(), prune({ keepLeaves: true, keepAttributes: false }), weld(), textureCompress({ encoder: sharp, targetFormat: 'webp', resize: [1024, 1024], quality: 86 }), meshopt({ encoder: MeshoptEncoder, level: 'medium' }));
  fs.mkdirSync(path.join(PUB, 'fg'), { recursive: true });
  const dst = path.join(PUB, 'fg', 'fg_props.glb'); await io.write(dst, doc);
  out.props = { src: path.relative(ROOT, propsGlb), sha256: sha(propsGlb), public: path.relative(ROOT, dst), public_sha256: sha(dst), bytes: fs.statSync(dst).size };
}
const after = tree(PUB);
for (const k of new Set([...Object.keys(before), ...Object.keys(after)])) {
  if (before[k] === after[k]) out.untouched++;
  else out.changed.push(k);
}
const bad = out.changed.filter((k) => !/^tex\/T_fg_|^fg\//.test(k));
out.foreignChanged = bad;
const task = arg('task', 'T6-12'); fs.mkdirSync(path.join(EVID, task), { recursive: true });
fs.writeFileSync(path.join(EVID, task, 'sync-fg.json'), JSON.stringify(out, null, 1));
console.log('FG publicado:', out.changed.length, 'cambiados', out.untouched, 'intactos', bad.length ? 'AJENOS CAMBIADOS: ' + bad.join(',') : 'ningún archivo ajeno cambiado');
if (bad.length) process.exitCode = 1;
