// Prepara public/ para el REMAKE (parque abierto). Solo derivados seleccionados: nada de ZIP, Blender, WAV ni conceptos PNG.
//   node tools/sync-assets.mjs           (meshopt + WebP)
//   node tools/sync-assets.mjs --raw     (sin comprimir, para depurar)
// Fuentes (no se modifican): game/.cache (ANMI y NPCs, generados por Blender), environments/assets_derived (cassette,
// patata), environments/textures + textures_remake, assets/derived/remake/audio (cortes M4A).
// La versión de plantas (escenas ENV_*) ya no se copia; su build se conserva en baseline_plantas_2026-10-07/.
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { dedup, prune, meshopt, textureCompress, weld, resample } from '@gltf-transform/functions';
import { MeshoptEncoder, MeshoptDecoder } from 'meshoptimizer';
import sharp from 'sharp';
import fs from 'node:fs';
import crypto from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const GAME = path.resolve(HERE, '..');
const ROOT = path.resolve(GAME, '..');
const ENV = path.join(ROOT, 'environments');
const PUB = path.join(GAME, 'public');
const OUT = path.join(PUB, 'assets');
const RAW = process.argv.includes('--raw');

await MeshoptEncoder.ready; await MeshoptDecoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.encoder': MeshoptEncoder, 'meshopt.decoder': MeshoptDecoder });
const report = [];
const rel = (p) => path.relative(ROOT, p);

// limpiar restos de la versión de plantas en public (siguen en el baseline)
for (const old of ['scenes', 'ui']) fs.rmSync(path.join(OUT, old), { recursive: true, force: true });
fs.rmSync(path.join(PUB, 'audio', '_e2e_test_tone.wav'), { force: true });

async function processGlb(src, dst, { maxTex = 1024, skinned = false, normalTex = 512, dropMR = false } = {}) {
  const doc = await io.read(src);
  if (dropMR) for (const m of doc.getRoot().listMaterials()) { m.setMetallicRoughnessTexture(null); m.setRoughnessFactor(0.8); m.setMetallicFactor(0); }
  const ops = [dedup(), prune({ keepLeaves: true, keepAttributes: false })];
  if (!RAW) {
    if (!skinned) ops.push(weld());
    if (skinned) ops.push(resample());
    ops.push(textureCompress({ encoder: sharp, targetFormat: 'webp', resize: [maxTex, maxTex], quality: 86, slots: /^(?!normal)/ }));
    ops.push(textureCompress({ encoder: sharp, targetFormat: 'webp', resize: [normalTex, normalTex], quality: 90, slots: /^normal/ }));
    ops.push(meshopt({ encoder: MeshoptEncoder, level: 'medium' }));
  }
  await doc.transform(...ops);
  fs.mkdirSync(path.dirname(dst), { recursive: true });
  await io.write(dst, doc);
  const tris = doc.getRoot().listMeshes().reduce((a, m) => a + m.listPrimitives().reduce((b, p) => b + (p.getIndices()?.getCount() ?? p.getAttribute('POSITION').getCount()) / 3, 0), 0);
  const before = fs.statSync(src).size, after = fs.statSync(dst).size;
  report.push({ kind: 'glb', src: rel(src), dst: path.relative(GAME, dst), before, after, tris, animations: doc.getRoot().listAnimations().map((a) => a.getName()) });
  console.log(`${path.basename(dst).padEnd(28)} ${(before / 1e6).toFixed(2)} MB -> ${(after / 1e6).toFixed(2)} MB  ${tris} tris`);
}

// personaje (un solo ANMI con todos los clips elegidos) + metadatos de fases
const character = path.join(GAME, '.cache', 'ANMI_GAME.glb');
if (fs.existsSync(character)) {
  await processGlb(character, path.join(OUT, 'character', 'anmi.glb'), { maxTex: 1024, skinned: true });
  fs.copyFileSync(path.join(GAME, '.cache', 'ANMI_GAME.clips.json'), path.join(OUT, 'character', 'anmi.clips.json'));
} else console.warn('AVISO: falta .cache/ANMI_GAME.glb (blender -b -P game/tools/build_character.py)');

// NPCs derivados (tools/build_npcs.py)
for (const id of ['la_pantera', 'aissa', 'juseph', 'bella']) {
  const src = path.join(GAME, '.cache', 'npcs', `${id}.glb`);
  if (fs.existsSync(src)) await processGlb(src, path.join(OUT, 'npcs', `${id}.glb`), { maxTex: 1024, skinned: true, normalTex: 512, dropMR: true });
  else console.warn('AVISO: falta', rel(src), '(blender -b -P game/tools/build_npcs.py -- build)');
}

// props compartidos
await processGlb(path.join(ENV, 'assets_derived', 'boombox', 'BOOMBOX_LOD0.glb'), path.join(OUT, 'props', 'boombox.glb'), { maxTex: 1024 });
await processGlb(path.join(ENV, 'assets_derived', 'fry', 'FRY_GAME.glb'), path.join(OUT, 'props', 'fry.glb'), { maxTex: 512 });

// derivados V3 de vegetación y mobiliario (assets/derived/v3/props; masters Meshy fuera de public)
for (const k of ['palm_straight', 'palm_lean', 'tree_compact', 'tree_open', 'shrub', 'lamp_double', 'speaker', 'planter_rect']) {   // planter_corner preparada, sin uso: no se publica
  const src = path.join(ROOT, 'assets', 'derived', 'v3', 'props', k, `${k}.glb`);
  if (!fs.existsSync(src)) throw new Error(`falta el derivado seleccionado ${src}`);
  await processGlb(src, path.join(OUT, 'props', `${k}.glb`), { maxTex: 512 });
}
// V4-CAR-05: vehículos rehechos (assets/derived/v4/vehicles, receta derive_vehicles_v4.py); obligatorios y con SHA del informe
const vehReport = JSON.parse(fs.readFileSync(path.join(ROOT, 'assets', 'derived', 'v4', 'vehicles', 'report.json'), 'utf8'));
for (const k of ['limo', 'car']) {
  const src = path.join(ROOT, 'assets', 'derived', 'v4', 'vehicles', k, `${k}.glb`);
  if (!fs.existsSync(src)) throw new Error(`falta el derivado seleccionado ${src}`);
  const sha = crypto.createHash('sha256').update(fs.readFileSync(src)).digest('hex');
  if (sha !== vehReport[k]?.glb_sha256) throw new Error(`${k}.glb no coincide con assets/derived/v4/vehicles/report.json (reconstruir con derive_vehicles_v4.py)`);
  await processGlb(src, path.join(OUT, 'props', `${k}.glb`), { maxTex: 1024 });
}

// NO ME GUILLO: kit nativo de Blender. V5 T5-26 (A1): fuentes en assets/derived/v5/nmg (receta build_nmg_kit_v5.py, vegetación
// build_nmg_veg_v5.py, texturas make_nmg_textures_v5.py; la V4 queda intacta en assets/derived/v4/nmg). Publicación parcial
// equivalente: tools/v5/sync-nmg-v5.mjs (misma tubería). Contrato: game/src/world/nmg_kit.json.
// Las nueve piezas son OBLIGATORIAS: si falta una, el sync falla. Se registra la cadena SHA fuente→publicado.
const NMG = path.join(ROOT, 'assets', 'derived', 'v5', 'nmg');
const kitReport = JSON.parse(fs.readFileSync(path.join(NMG, 'kit_report.json'), 'utf8'));
{
  const src = path.join(NMG, 'glb', 'nmg_kit.glb');
  if (!fs.existsSync(src)) throw new Error(`falta el kit NMG ${src}`);
  const sha = crypto.createHash('sha256').update(fs.readFileSync(src)).digest('hex');
  if (sha !== kitReport.kit?.sha256) throw new Error('nmg_kit.glb no coincide con kit_report.json (reconstruir el kit)');
  const REQUIRED_NODES = ['nmg_platform', 'nmg_heart', 'nmg_box_small', 'nmg_box_medium', 'nmg_ledge_long', 'nmg_u', 'nmg_quarter', 'nmg_bed', 'nmg_bench'];
  for (const n of REQUIRED_NODES) if (!kitReport.kit.nodes.includes(n)) throw new Error(`falta la pieza obligatoria ${n} en el kit NMG`);
  await processGlb(src, path.join(OUT, 'nmg', 'nmg_kit.glb'), { maxTex: 2048 });   // V5: atlas de murales 2048
  Object.assign(report[report.length - 1], { sourceSha256: sha, recipeSha256: kitReport.recipe_sha256, contractSha256: kitReport.contract_sha256, nodes: kitReport.kit.nodes });
}
const vegReport = JSON.parse(fs.readFileSync(path.join(NMG, 'veg_report.json'), 'utf8'));
for (const k of ['nmg_tree_round', 'nmg_tree_open']) {   // VEG-01 nativas (árboles), obligatorias
  const src = path.join(NMG, 'glb', `${k}.glb`);
  if (!fs.existsSync(src)) throw new Error(`falta la vegetación obligatoria ${src}`);
  const sha = crypto.createHash('sha256').update(fs.readFileSync(src)).digest('hex');
  if (sha !== vegReport.pieces[k]?.sha256) throw new Error(`${k} no coincide con veg_report.json`);
  await processGlb(src, path.join(OUT, 'props', `${k}.glb`), { maxTex: 256 });
  Object.assign(report[report.length - 1], { sourceSha256: sha, recipeSha256: vegReport.recipe_sha256 });
}
// R6: matas, arbusto floral y palmeras NMG nuevas (assets/derived/v5/nmg_plants), obligatorias
{ const PLN = path.join(ROOT, 'assets', 'derived', 'v5', 'nmg_plants'), plantsRep = JSON.parse(fs.readFileSync(path.join(PLN, 'plants_report.json'), 'utf8'));
  for (const k of ['nmg_plant_a', 'nmg_plant_a_flor', 'nmg_plant_b', 'nmg_plant_c', 'nmg_shrub_flor', 'nmg_palm_straight', 'nmg_palm_lean']) {
    const src = path.join(PLN, 'glb', `${k}.glb`);
    if (!fs.existsSync(src)) throw new Error(`falta la planta obligatoria ${src}`);
    const sha = crypto.createHash('sha256').update(fs.readFileSync(src)).digest('hex');
    if (sha !== plantsRep.pieces[k]?.sha256) throw new Error(`${k} no coincide con plants_report.json`);
    await processGlb(src, path.join(OUT, 'props', `${k}.glb`), { maxTex: 256 });
    Object.assign(report[report.length - 1], { sourceSha256: sha, recipeSha256: plantsRep.recipe_sha256 });
  } }
// pegatinas oficiales del Imaginario para el suelo NMG (fuente intacta; se conserva el borde blanco y la proporción)
for (const [n, file] of Object.entries({ G_nmg_rana: '01-rana-sapo.png', G_nmg_mano: '03-mano-con-gato.png', G_nmg_mona: '06-mona-lisa.png', G_nmg_patatas: '07-patatas-fritas.png' })) {
  const src = path.join(ROOT, 'Imaginario ANMI', '04_Frame_2147238616', 'PNG', file), dst = path.join(OUT, 'tex', `${n}.webp`);
  if (!fs.existsSync(src)) throw new Error(`falta el grafismo oficial ${src}`);
  await sharp(src).resize({ width: 512, height: 512, fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } }).webp({ quality: 88, alphaQuality: 95 }).toFile(dst);
  report.push({ kind: 'tex', src: rel(src), dst: path.relative(GAME, dst), before: fs.statSync(src).size, after: fs.statSync(dst).size, sourceSha256: crypto.createHash('sha256').update(fs.readFileSync(src)).digest('hex') });
}
for (const [n, size] of Object.entries({ T_nmg_floor: 1536, T_nmg_floor_pink: 1536 })) {
  const src = path.join(NMG, 'tex', `${n}.png`), dst = path.join(OUT, 'tex', `${n}.webp`);
  if (!fs.existsSync(src)) throw new Error(`falta la textura obligatoria ${src}`);
  await sharp(src).resize({ width: size, withoutEnlargement: true }).webp(n.startsWith('G_') ? { quality: 86, alphaQuality: 90 } : { quality: 82 }).toFile(dst);
  report.push({ kind: 'tex', src: rel(src), dst: path.relative(GAME, dst), before: fs.statSync(src).size, after: fs.statSync(dst).size, sourceSha256: crypto.createHash('sha256').update(fs.readFileSync(src)).digest('hex') });
}

// texturas del parque (repetibles, WebP)
const TEX = {
  textures: { T_concrete_cream: 512, T_concrete_pink: 512, T_concrete_urbex: 512, T_concrete_rooftop: 512, T_wall_plaster_warm: 512, T_wood_planks_painted: 256,
    T_speaker_grille: 256, T_led_floor: 512, T_edge_stripes: 256, T_facade_a: 256, T_facade_b: 256, T_facade_c: 256,
    G_nomeguillo: 1024, G_tratratra: 1024, G_splat_pink: 512, G_sticker_star: 256, G_takeoff_chevrons: 512, G_landing_zone: 512, G_floor_ring: 512, G_sticker_heart: 256 },
  textures_remake: { T_dirt: 512, T_bola_ground: 512, T_bola_box: 512, T_asphalt: 512, T_grass: 256, T_yy_final: 1600, T_yy_stencil: 1600, T_yy_mask: 512, T_graffiti_wall: 1024, T_concrete_light: 512 },
};
fs.mkdirSync(path.join(OUT, 'tex'), { recursive: true });
for (const [dir, list] of Object.entries(TEX)) for (const [n, size] of Object.entries(list)) {
  const src = path.join(ENV, dir, `${n}.png`), dst = path.join(OUT, 'tex', `${n}.webp`);
  const lossless = n.includes('mask');
  await sharp(src).resize({ width: size, withoutEnlargement: true }).webp(lossless ? { lossless: true } : { quality: 86, alphaQuality: 90 }).toFile(dst);
  report.push({ kind: 'tex', src: rel(src), dst: path.relative(GAME, dst), before: fs.statSync(src).size, after: fs.statSync(dst).size });
}

// NMG: caras pintadas del corazón/bordillo (las usa el blockout de reserva si el kit no carga). V4/EXT-01: se publican las
// texturas PROPIAS generadas por código (assets/derived/v4/nmg/make_nmg_textures.py, *_v4.png), las mismas que lleva el
// kit; las V3 eran recortes de una referencia generada con IA y dejan de servirse. Plataforma: procedural V3 (propia).
const NMG_TEX_SRC = { T_nmg_heart_front: ['v5', 'T_nmg_heart_front_v5.png'], T_nmg_ledge_front: ['v5', 'T_nmg_ledge_front_v5.png'], T_nmg_plat_side: ['v3', 'T_nmg_plat_side.png'] };
for (const [n, size] of Object.entries({ T_nmg_heart_front: 1024, T_nmg_ledge_front: 768, T_nmg_plat_side: 1024 })) {
  const [ver, file] = NMG_TEX_SRC[n];
  const src = path.join(ROOT, 'assets', 'derived', ver, 'nmg', 'tex', file), dst = path.join(OUT, 'tex', `${n}.webp`);
  if (!fs.existsSync(src)) throw new Error(`falta la textura NMG ${src}`);
  await sharp(src).resize({ width: size, withoutEnlargement: true }).webp({ quality: 86 }).toFile(dst);
  report.push({ kind: 'tex', src: rel(src), dst: path.relative(GAME, dst), before: fs.statSync(src).size, after: fs.statSync(dst).size });
}

// V4 (AUD-02/PIPE-02): seis cortes EXACTOS de HUM-A4-014 (manifiesto assets/derived/v4/audio/cuts_v4.json). Los seis son
// obligatorios: si falta uno, si su SHA no coincide con el manifiesto o si game-config no apunta a él, el sync falla.
// Los cortes V3 (`*-test-v1.m4a`) se retiran de public (quedan en la baseline) para que ninguna caché/URL vieja suene.
const AUD = path.join(ROOT, 'assets', 'derived', 'v4', 'audio');
fs.mkdirSync(path.join(PUB, 'audio'), { recursive: true });
for (const f of fs.readdirSync(path.join(PUB, 'audio'))) if (/-test-v1\.m4a$/.test(f)) fs.rmSync(path.join(PUB, 'audio', f));
const cuts = JSON.parse(fs.readFileSync(path.join(AUD, 'cuts_v4.json'), 'utf8')).cuts;
const REQUIRED_AUDIO = ['yinyang', 'fashion_girl', 'no_me_guillo', 'tratratra', 'secrenovio', 'nosvamosdeaqui'];
const gameCfg = JSON.parse(fs.readFileSync(path.join(PUB, 'game-config.json'), 'utf8'));
for (const id of REQUIRED_AUDIO) {
  const c = cuts.find((x) => x.id === id);
  if (!c) throw new Error(`falta el corte obligatorio ${id} en cuts_v4.json`);
  if (gameCfg.audio.tracks[id] !== `audio/${c.file}`) throw new Error(`game-config no apunta al corte V4 de ${id}: ${gameCfg.audio.tracks[id]}`);
  if (gameCfg.audio.cuts?.[id]?.samples !== c.samples) throw new Error(`game-config declara otras muestras para ${id}`);
  const sha = crypto.createHash('sha256').update(fs.readFileSync(path.join(AUD, c.file))).digest('hex');
  if (sha !== c.sha256) throw new Error(`SHA del corte ${id} no coincide con el manifiesto`);
}
for (const c of cuts) {
  fs.copyFileSync(path.join(AUD, c.file), path.join(PUB, 'audio', c.file));
  report.push({ kind: 'audio', src: rel(path.join(AUD, c.file)), dst: `public/audio/${c.file}`, before: c.bytes, after: fs.statSync(path.join(PUB, 'audio', c.file)).size, seconds: [c.in_seconds, c.out_seconds], samples: c.samples, sha256: c.sha256, sourceSha256: c.source_sha256 });
}

// fuentes de interfaz (OFL/Apache, licencias en environments/third_party)
fs.mkdirSync(path.join(OUT, 'fonts'), { recursive: true });
for (const [dir, file] of [['bungee', 'Bungee-Regular.ttf'], ['luckiestguy', 'LuckiestGuy-Regular.ttf']]) fs.copyFileSync(path.join(ENV, 'third_party', 'fonts', dir, file), path.join(OUT, 'fonts', file));
// V4-EXT-02: las licencias viajan con las fuentes (SIL OFL 1.1 y Apache 2.0 exigen incluirlas al redistribuir)
for (const [dir, lic, out] of [['bungee', 'OFL.txt', 'Bungee-OFL.txt'], ['luckiestguy', 'LICENSE.txt', 'LuckiestGuy-LICENSE.txt']]) fs.copyFileSync(path.join(ENV, 'third_party', 'fonts', dir, lic), path.join(OUT, 'fonts', out));

const sum = (k) => report.filter((r) => !k || r.kind === k).reduce((a, r) => a + r.after, 0);
fs.writeFileSync(path.join(OUT, 'asset-report.json'), JSON.stringify({ compressed: !RAW, totals: { all: sum(), glb: sum('glb'), tex: sum('tex'), audio: sum('audio') }, files: report }, null, 2));
console.log('total', (sum() / 1e6).toFixed(2), 'MB  (glb', (sum('glb') / 1e6).toFixed(2), '· tex', (sum('tex') / 1e6).toFixed(2), '· audio', (sum('audio') / 1e6).toFixed(2), ')');
