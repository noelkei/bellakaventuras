// T5-26 · Publica la producción NMG V5 (puerta A1 aprobada 12 oct) sin regenerar el resto de public/: kit (receta
// assets/derived/v5/nmg/build_nmg_kit_v5.py), vegetación (build_nmg_veg_v5.py: rosetas, árboles, palmeras NMG) y texturas
// propias (make_nmg_textures_v5.py: suelos de 8 m, logos de suelo del Imaginario, caras del corazón/bordillo para el
// blockout de reserva). Misma tubería que tools/sync-assets.mjs (dedup, prune, weld, WebP, meshopt medium). Verifica cada
// derivado contra el informe de su receta y que receta y contrato no hayan cambiado desde el horneado; deja la cadena
// fuente → receta → derivado → public (y bytes antes/después) en V5/evidencias/T5-26/sync-nmg-v5.json.
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
const NMG = path.join(ROOT, 'assets', 'derived', 'v5', 'nmg'), PUB = path.join(GAME, 'public', 'assets');
const sha = (f) => (fs.existsSync(f) ? crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex') : null);
const size = (f) => (fs.existsSync(f) ? fs.statSync(f).size : 0);
const rel = (f) => path.relative(ROOT, f);
const J = (f) => JSON.parse(fs.readFileSync(path.join(NMG, f), 'utf8'));
const kit = J('kit_report.json'), veg = J('veg_report.json'), tex = J(path.join('tex', 'textures.json')), mur = J('murals.json');
const FLOOR_PX = Number(arg('floor', '1536'));   // suelos de 8 m: 1536 px = 19 px/dm (V4: 1024 px para 4 m)
const rows = [];
const check = (cond, msg) => { if (!cond) throw new Error(msg); };

check(sha(path.join(NMG, 'glb', 'nmg_kit.glb')) === kit.kit.sha256, 'nmg_kit.glb no coincide con kit_report.json');
check(kit.contract_sha256 === sha(path.join(GAME, 'src', 'world', 'nmg_kit.json')), 'el kit se horneó con otro contrato nmg_kit.json (rehornear)');
check(kit.recipe_sha256 === sha(path.join(NMG, 'build_nmg_kit_v5.py')), 'el kit se horneó con otra receta (rehornear)');
check(veg.recipe_sha256 === sha(path.join(NMG, 'build_nmg_veg_v5.py')), 'la vegetación se horneó con otra receta (rehornear)');
check(tex.recipe_sha256 === sha(path.join(NMG, 'make_nmg_textures_v5.py')), 'las texturas se generaron con otra receta (regenerar)');
for (const t of tex.textures) check(sha(path.join(NMG, t.file)) === t.sha256, `${t.file} no coincide con textures.json`);
check(mur.recipe_sha256 === sha(path.join(NMG, 'make_nmg_murals_v5.py')) && mur.layout_sha256 === sha(path.join(NMG, 'mural_layout.json')), 'murales generados con otra receta o reparto (regenerar)');
check(sha(path.join(NMG, mur.atlas.file)) === mur.atlas.sha256 && kit.murals_sha256 === mur.atlas.sha256, 'el kit no lleva el atlas de murales actual (rehornear)');

async function glb(src, dst, maxTex, extra) {
  const before = { sha256: sha(dst), bytes: size(dst) };
  const doc = await io.read(src);
  await doc.transform(dedup(), prune({ keepLeaves: true, keepAttributes: false }), weld(),
    textureCompress({ encoder: sharp, targetFormat: 'webp', resize: [maxTex, maxTex], quality: 86, slots: /^(?!normal)/ }),
    meshopt({ encoder: MeshoptEncoder, level: 'medium' }));
  fs.mkdirSync(path.dirname(dst), { recursive: true }); await io.write(dst, doc);
  rows.push({ kind: 'glb', derived: { file: rel(src), sha256: sha(src), bytes: size(src) }, public: { file: rel(dst), sha256: sha(dst), bytes: size(dst) }, before, ...extra });
}
async function webp(src, dst, w, opts, extra) {
  const before = { sha256: sha(dst), bytes: size(dst) };
  await sharp(src).resize({ width: w, withoutEnlargement: true }).webp(opts).toFile(dst);
  rows.push({ kind: 'tex', derived: { file: rel(src), sha256: sha(src), bytes: size(src) }, public: { file: rel(dst), sha256: sha(dst), bytes: size(dst) }, before, ...extra });
}

await glb(path.join(NMG, 'glb', 'nmg_kit.glb'), path.join(PUB, 'nmg', 'nmg_kit.glb'), 2048, { recipe: 'assets/derived/v5/nmg/build_nmg_kit_v5.py', recipe_sha256: kit.recipe_sha256, contract_sha256: kit.contract_sha256, nodes: kit.kit.nodes });   // atlas de murales 2048 (204 px/m)
for (const k of ['nmg_tree_round', 'nmg_tree_open']) {   // árboles (receta de vegetación V5)
  const src = path.join(NMG, 'glb', `${k}.glb`);
  check(sha(src) === veg.pieces[k]?.sha256, `${k} no coincide con veg_report.json`);
  await glb(src, path.join(PUB, 'props', `${k}.glb`), 256, { recipe: 'assets/derived/v5/nmg/build_nmg_veg_v5.py', recipe_sha256: veg.recipe_sha256, height: veg.pieces[k].height });
}
// R6: matas, arbusto floral y palmeras nuevas (assets/derived/v5/nmg_plants/build_nmg_plants.py); se retiran las rosetas viejas
const PLN = path.join(ROOT, 'assets', 'derived', 'v5', 'nmg_plants'), plants = JSON.parse(fs.readFileSync(path.join(PLN, 'plants_report.json'), 'utf8'));
check(plants.recipe_sha256 === sha(path.join(PLN, 'build_nmg_plants.py')), 'las plantas se hornearon con otra receta (rehornear)');
for (const f of ['nmg_shrub_low', 'nmg_shrub_mid', 'nmg_shrub_tall']) fs.rmSync(path.join(PUB, 'props', `${f}.glb`), { force: true });
for (const k of ['nmg_plant_a', 'nmg_plant_a_flor', 'nmg_plant_b', 'nmg_plant_c', 'nmg_shrub_flor', 'nmg_palm_straight', 'nmg_palm_lean']) {
  const src = path.join(PLN, 'glb', `${k}.glb`);
  check(sha(src) === plants.pieces[k]?.sha256, `${k} no coincide con plants_report.json`);
  await glb(src, path.join(PUB, 'props', `${k}.glb`), 256, { recipe: 'assets/derived/v5/nmg_plants/build_nmg_plants.py', recipe_sha256: plants.recipe_sha256, height: plants.pieces[k].height, tris: plants.pieces[k].tris });
}
const T = (f) => path.join(NMG, 'tex', f), O = (n) => path.join(PUB, 'tex', `${n}.webp`), tr = { recipe: 'assets/derived/v5/nmg/make_nmg_textures_v5.py', recipe_sha256: tex.recipe_sha256 };
await webp(T('T_nmg_floor.png'), O('T_nmg_floor'), FLOOR_PX, { quality: 82 }, tr);
await webp(T('T_nmg_floor_pink.png'), O('T_nmg_floor_pink'), FLOOR_PX, { quality: 82 }, tr);
await webp(T('T_nmg_heart_front_v5.png'), O('T_nmg_heart_front'), 1024, { quality: 86 }, tr);
await webp(T('T_nmg_ledge_front_v5.png'), O('T_nmg_ledge_front'), 768, { quality: 86 }, tr);
// V5 G8: pegatinas oficiales del Imaginario (con su borde blanco) SOLO en el paseo rosa exterior; sin logos en la plaza
for (const f of fs.readdirSync(path.join(PUB, 'tex')).filter((f) => /^G_nmg_floor_/.test(f))) fs.rmSync(path.join(PUB, 'tex', f));
for (const [n, file] of Object.entries({ G_nmg_rana: '01-rana-sapo.png', G_nmg_mano: '03-mano-con-gato.png', G_nmg_mona: '06-mona-lisa.png', G_nmg_patatas: '07-patatas-fritas.png' })) {
  const src = path.join(ROOT, 'Imaginario ANMI', '04_Frame_2147238616', 'PNG', file), dst = O(n), before = { sha256: sha(dst), bytes: size(dst) };
  await sharp(src).resize({ width: 512, height: 512, fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } }).webp({ quality: 88, alphaQuality: 95 }).toFile(dst);
  rows.push({ kind: 'tex', fuente: { file: rel(src), sha256: sha(src) }, derived: { file: rel(src), sha256: sha(src), bytes: size(src) }, public: { file: rel(dst), sha256: sha(dst), bytes: size(dst) }, before });
}

const out = { date: new Date().toISOString(), task: 'T5-26', floor_px: FLOOR_PX, rows,
  total: { before: rows.reduce((a, r) => a + r.before.bytes, 0), after: rows.reduce((a, r) => a + r.public.bytes, 0) } };
const task = arg('task', 'T5-26'); fs.mkdirSync(path.join(EVID, task), { recursive: true });
fs.writeFileSync(path.join(EVID, task, 'sync-nmg-v5.json'), JSON.stringify(out, null, 1));
for (const r of rows) console.log(path.basename(r.public.file).padEnd(30), String(r.before.bytes).padStart(9), '→', String(r.public.bytes).padStart(9));
console.log('TOTAL', out.total.before, '→', out.total.after, 'B');
