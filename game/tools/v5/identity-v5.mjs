// T5-32 · Identidad de la entrega V5 (COV-09): cadena SHA fuente → receta → derivado → publicado → servido (dist-v5) de los
// recursos que V5 ha tocado, más SHA del bootstrap servido y del árbol game/src. Solo lectura. Rojo si: falta un eslabón, el
// derivado no coincide con el informe de su receta, la receta cambió desde su informe o el publicado no está en dist-v5 con
// el mismo SHA (el build copia public tal cual). Un SHA no prueba alineación: la coherencia espacial es geo-coherence.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { Report, runTest, GAME, ROOT, servedIdentity, argUrl } from './lib.mjs';
const R = new Report('identity-v5');
const sha = (p) => (fs.existsSync(p) ? crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex') : null);
const rel = (p) => path.relative(ROOT, p);
const J = (p) => JSON.parse(fs.readFileSync(p, 'utf8'));
await runTest(R, async () => {
  const PUB = path.join(GAME, 'public', 'assets'), DIST = path.join(GAME, 'dist-v5', 'assets'), EV = path.join(ROOT, 'V5', 'evidencias');
  const rows = [];
  const add = (r) => { r.dist_sha = sha(path.join(DIST, path.relative(PUB, path.join(ROOT, r.publicado)))); r.ok = !!r.publicado_sha && r.publicado_sha === r.dist_sha && (r.receta_sha_informe == null || r.receta_sha === r.receta_sha_informe) && (r.raw_sha_informe == null || r.raw_sha === r.raw_sha_informe); rows.push(r); };
  // ANMI
  { const s = J(path.join(EV, 'T5-19', 'sync-anmi.json')); const pub = path.join(PUB, 'character', 'anmi.glb');
    add({ recurso: 'ANMI (personaje + clips)', receta: 'game/tools/build_character_v3.py', receta_sha: sha(path.join(GAME, 'tools', 'build_character_v3.py')), receta_sha_informe: s.recipe.sha256, raw: 'game/.cache/ANMI_GAME.glb', raw_sha: sha(path.join(GAME, '.cache', 'ANMI_GAME.glb')), raw_sha_informe: s.cache.glb, publicado: rel(pub), publicado_sha: sha(pub), publicado_sha_informe: s.public.glb.sha256 }); }
  // NPCs
  { const s = J(path.join(EV, 'T5-20', 'sync-npcs.json'));
    for (const [id, v] of Object.entries(s.npcs)) { const pub = path.join(PUB, 'npcs', `${id}.glb`); add({ recurso: `NPC ${id}`, receta: 'game/tools/build_npcs.py', receta_sha: sha(path.join(GAME, 'tools', 'build_npcs.py')), receta_sha_informe: s.recipe.sha256, raw: `game/.cache/npcs/${id}.glb`, raw_sha: sha(path.join(GAME, '.cache', 'npcs', `${id}.glb`)), raw_sha_informe: v.cache.sha256, publicado: rel(pub), publicado_sha: sha(pub), publicado_sha_informe: v.public.sha256 }); } }
  // kit NMG (V5 T5-26: receta y derivados en assets/derived/v5/nmg; publicación tools/v5/sync-nmg-v5.mjs)
  { const N = path.join(ROOT, 'assets', 'derived', 'v5', 'nmg'), k = J(path.join(N, 'kit_report.json')), vg = J(path.join(N, 'veg_report.json')), tx = J(path.join(N, 'tex', 'textures.json'));
    const s = J(path.join(EV, 'T5-26', 'sync-nmg-v5.json')), pubOf = (f) => s.rows.find((r) => r.derived.file === f)?.public.sha256;
    const kpub = path.join(PUB, 'nmg', 'nmg_kit.glb');
    add({ recurso: 'Kit NMG', fuente: 'game/src/world/nmg_kit.json', fuente_sha: sha(path.join(GAME, 'src', 'world', 'nmg_kit.json')), fuente_sha_informe: k.contract_sha256, receta: 'assets/derived/v5/nmg/build_nmg_kit_v5.py', receta_sha: sha(path.join(N, 'build_nmg_kit_v5.py')), receta_sha_informe: k.recipe_sha256,
      raw: 'assets/derived/v5/nmg/glb/nmg_kit.glb', raw_sha: sha(path.join(N, 'glb', 'nmg_kit.glb')), raw_sha_informe: k.kit?.sha256, publicado: rel(kpub), publicado_sha: sha(kpub), publicado_sha_informe: pubOf('assets/derived/v5/nmg/glb/nmg_kit.glb') });
    for (const v of ['nmg_tree_round', 'nmg_tree_open']) { const pub = path.join(PUB, 'props', `${v}.glb`), raw = `assets/derived/v5/nmg/glb/${v}.glb`;
      add({ recurso: `Vegetación ${v}`, receta: 'assets/derived/v5/nmg/build_nmg_veg_v5.py', receta_sha: sha(path.join(N, 'build_nmg_veg_v5.py')), receta_sha_informe: vg.recipe_sha256, raw, raw_sha: sha(path.join(ROOT, raw)), raw_sha_informe: vg.pieces[v].sha256, publicado: rel(pub), publicado_sha: sha(pub), publicado_sha_informe: pubOf(raw) }); }
    { const PLN = path.join(ROOT, 'assets', 'derived', 'v5', 'nmg_plants'), pr = J(path.join(PLN, 'plants_report.json'));   // R6
      for (const v of ['nmg_plant_a', 'nmg_plant_a_flor', 'nmg_plant_b', 'nmg_plant_c', 'nmg_shrub_flor', 'nmg_palm_straight', 'nmg_palm_lean']) { const pub = path.join(PUB, 'props', `${v}.glb`), raw = `assets/derived/v5/nmg_plants/glb/${v}.glb`;
        add({ recurso: `Planta NMG ${v}`, fuente: 'referencias/escenarios/NO ME GUILLO/vegetacion-mejora-2026-10-12', receta: 'assets/derived/v5/nmg_plants/build_nmg_plants.py', receta_sha: sha(path.join(PLN, 'build_nmg_plants.py')), receta_sha_informe: pr.recipe_sha256, raw, raw_sha: sha(path.join(ROOT, raw)), raw_sha_informe: pr.pieces[v].sha256, publicado: rel(pub), publicado_sha: sha(pub), publicado_sha_informe: pubOf(raw) }); } }
    { const mu = J(path.join(N, 'murals.json'));   // atlas de murales: receta + reparto → imagen embebida en el kit
      add({ recurso: 'Murales NMG (atlas en el kit)', fuente: 'assets/derived/v5/nmg/mural_layout.json', fuente_sha: sha(path.join(N, 'mural_layout.json')), fuente_sha_informe: mu.layout_sha256, receta: mu.recipe, receta_sha: sha(path.join(ROOT, mu.recipe)), receta_sha_informe: mu.recipe_sha256,
        raw: 'assets/derived/v5/nmg/tex/T_nmg_murals.png', raw_sha: sha(path.join(N, 'tex', 'T_nmg_murals.png')), raw_sha_informe: k.murals_sha256, publicado: rel(kpub), publicado_sha: sha(kpub), publicado_sha_informe: pubOf('assets/derived/v5/nmg/glb/nmg_kit.glb') }); }
    for (const [file, pubName] of [['T_nmg_floor.png', 'T_nmg_floor'], ['T_nmg_floor_pink.png', 'T_nmg_floor_pink']]) {
      const pub = path.join(PUB, 'tex', `${pubName}.webp`), raw = `assets/derived/v5/nmg/tex/${file}`;
      add({ recurso: `Textura ${pubName}`, receta: 'assets/derived/v5/nmg/make_nmg_textures_v5.py', receta_sha: sha(path.join(N, 'make_nmg_textures_v5.py')), receta_sha_informe: tx.recipe_sha256, raw, raw_sha: sha(path.join(ROOT, raw)), raw_sha_informe: tx.textures.find((t) => t.file === `tex/${file}`)?.sha256, publicado: rel(pub), publicado_sha: sha(pub), publicado_sha_informe: pubOf(raw) }); } }
  // lettering (R1-G8: cartel ROSA recoloreado por regiones del mismo maestro de forma)
  { const l = J(path.join(ROOT, 'assets', 'derived', 'v5', 'lettering', 'report_rosa.json')), pub = path.join(PUB, 'tex', 'T_nmg_lettering_v2_rosa.webp');
    add({ recurso: 'Lettering NMG rosa (maestro V2 recoloreado)', fuente: l.master.file, fuente_sha: sha(path.join(ROOT, l.master.file)), fuente_sha_informe: l.master.sha256, receta: l.recipe.file, receta_sha: sha(path.join(ROOT, l.recipe.file)), receta_sha_informe: l.recipe.sha256, raw: l.derived.file, raw_sha: sha(path.join(ROOT, l.derived.file)), raw_sha_informe: l.derived.sha256, publicado: rel(pub), publicado_sha: sha(pub), publicado_sha_informe: l.derived.sha256 }); }
  // R2-G8: sonido de La Pantera (fuente descargada a petición del usuario, publicada tal cual)
  { const a = J(path.join(ROOT, 'assets', 'derived', 'v5', 'audio', 'pantera_report.json')), pub = path.join(GAME, 'public', 'audio', 'pantera_ambiente.mp3');
    const r = { recurso: 'Audio La Pantera (TikTok, MP3 original)', fuente: a.source.file, fuente_sha: sha(path.join(ROOT, a.source.file)), fuente_sha_informe: a.source.sha256, receta: a.recipe.file, receta_sha: sha(path.join(ROOT, a.recipe.file)), receta_sha_informe: a.recipe.sha256,
      raw: a.derived.file, raw_sha: sha(path.join(ROOT, a.derived.file)), raw_sha_informe: a.derived.sha256, publicado: rel(pub), publicado_sha: sha(pub), publicado_sha_informe: a.public.sha256 };
    r.dist_sha = sha(path.join(GAME, 'dist-v5', 'audio', 'pantera_ambiente.mp3'));
    r.ok = !!r.publicado_sha && r.publicado_sha === r.dist_sha && r.receta_sha === r.receta_sha_informe && r.raw_sha === r.raw_sha_informe; rows.push(r); }
  // vehículos
  { const v = J(path.join(ROOT, 'assets', 'derived', 'v5', 'vehicles', 'report.json')), s = J(path.join(EV, 'T5-28', 'sync-vehicles.json'));
    for (const k of ['car', 'limo']) { const pub = path.join(PUB, 'props', `${k}.glb`); add({ recurso: `Vehículo ${k}`, fuente: v[k].source, fuente_sha: sha(path.join(ROOT, v[k].source)), fuente_sha_informe: v[k].source_sha256, receta: 'assets/derived/v5/vehicles/derive_vehicles_v5.py', receta_sha: sha(path.join(ROOT, 'assets', 'derived', 'v5', 'vehicles', 'derive_vehicles_v5.py')), receta_sha_informe: v.recipe_sha256, raw: v[k].glb, raw_sha: sha(path.join(ROOT, v[k].glb)), raw_sha_informe: v[k].glb_sha256, publicado: rel(pub), publicado_sha: sha(pub), publicado_sha_informe: s.vehicles[k].public.sha256 }); } }
  for (const r of rows) if (r.fuente_sha_informe && r.fuente_sha !== r.fuente_sha_informe) r.ok = false;
  for (const r of rows) if (r.publicado_sha_informe && r.publicado_sha !== r.publicado_sha_informe) r.ok = false;
  const served = await servedIdentity(argUrl()).catch((e) => ({ error: String(e) }));
  const srcTree = (() => { const h = crypto.createHash('sha256'); const walk = (d) => { for (const f of fs.readdirSync(d).sort()) { const p = path.join(d, f); if (fs.statSync(p).isDirectory()) walk(p); else { h.update(path.relative(GAME, p)); h.update(fs.readFileSync(p)); } } }; walk(path.join(GAME, 'src')); return h.digest('hex'); })();
  R.measure('cadena', rows); R.measure('servido', served); R.measure('src_tree_sha256', srcTree);
  const md = ['# Cadena SHA V5', '', `Servido: ${JSON.stringify(served)}`, `Árbol game/src: ${srcTree}`, '', '| Recurso | Fuente | Receta | Derivado | Publicado = dist-v5 | OK |', '|---|---|---|---|---|---|',
    ...rows.map((r) => `| ${r.recurso} | ${r.fuente_sha ? r.fuente_sha.slice(0, 12) + (r.fuente_sha_informe && r.fuente_sha !== r.fuente_sha_informe ? ' ≠ informe' : '') : '—'} | ${r.receta_sha?.slice(0, 12)}${r.receta_sha_informe && r.receta_sha !== r.receta_sha_informe ? ' ≠ informe' : ''} | ${r.raw_sha?.slice(0, 12)}${r.raw_sha_informe && r.raw_sha !== r.raw_sha_informe ? ' ≠ informe' : ''} | ${r.publicado_sha?.slice(0, 12)} ${r.publicado_sha === r.dist_sha ? '=' : '≠'} ${r.dist_sha?.slice(0, 12)} | ${r.ok ? 'sí' : 'NO'} |`)];
  fs.mkdirSync(path.join(EV, 'T5-32'), { recursive: true }); fs.writeFileSync(path.join(EV, 'T5-32', 'CADENA_SHA_V5.md'), md.join('\n') + '\n');
  R.check(rows.every((r) => r.ok), `cadena fuente → receta → derivado → publicado → dist-v5 íntegra (${rows.filter((r) => r.ok).length}/${rows.length})`, 'unit', rows.filter((r) => !r.ok).map((r) => r.recurso));
}, { timeoutMs: 120000 });
