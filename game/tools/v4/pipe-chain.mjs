// V4-PIPE-01/02 · Cadena SHA fuente → receta → derivado (raw) → publicado (servido) de los recursos V4 obligatorios.
// Solo lectura. Escribe V4/evidencias/PIPE/cadena_sha.json y CADENA_SHA.md. Rojo si: falta un eslabón obligatorio, el
// derivado no coincide con el informe de su receta, la receta cambió desde el último build (SHA del informe ≠ actual) o el
// publicado no existe. El publicado se reprocesa (gltf-transform/WebP), así que su SHA se registra (no se compara con el raw).
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { Report, runTest, GAME, ROOT } from './lib.mjs';
const R = new Report('PIPE-02', 'pipe-chain');
const sha = (p) => fs.existsSync(p) ? crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex') : null;
const rel = (p) => path.relative(ROOT, p);
await runTest(R, async () => {
  const D = (...a) => path.join(ROOT, 'assets', 'derived', 'v4', ...a), PUB = path.join(GAME, 'public');
  const rows = [];
  const add = (r) => { rows.push(r); return r; };
  // NMG kit
  const kit = JSON.parse(fs.readFileSync(D('nmg', 'kit_report.json'), 'utf8'));
  add({ recurso: 'Kit NMG (12 piezas)', fuente: 'game/src/world/nmg_kit.json (contrato) + texturas propias', fuente_sha: sha(path.join(GAME, 'src', 'world', 'nmg_kit.json')), fuente_sha_informe: kit.contract_sha256,
    receta: rel(D('nmg', 'build_nmg_kit.py')), receta_sha: sha(D('nmg', 'build_nmg_kit.py')), receta_sha_informe: kit.recipe_sha256, editable: rel(D('nmg', 'nmg_kit.blend')), editable_ok: fs.existsSync(D('nmg', 'nmg_kit.blend')),
    raw: rel(D('nmg', 'glb', 'nmg_kit.glb')), raw_sha: sha(D('nmg', 'glb', 'nmg_kit.glb')), raw_sha_informe: kit.kit.sha256, publicado: rel(path.join(PUB, 'assets', 'nmg', 'nmg_kit.glb')), publicado_sha: sha(path.join(PUB, 'assets', 'nmg', 'nmg_kit.glb')) });
  // vegetación NMG
  const veg = JSON.parse(fs.readFileSync(D('nmg', 'veg_report.json'), 'utf8'));
  for (const [k, v] of Object.entries(veg.pieces)) add({ recurso: `Vegetación ${k}`, fuente: 'receta procedural (sin fuente externa)', fuente_sha: null, receta: rel(D('nmg', 'build_nmg_veg.py')), receta_sha: sha(D('nmg', 'build_nmg_veg.py')), receta_sha_informe: veg.recipe_sha256,
    editable: rel(D('nmg', 'nmg_veg.blend')), editable_ok: fs.existsSync(D('nmg', 'nmg_veg.blend')), raw: rel(D('nmg', 'glb', v.glb)), raw_sha: sha(D('nmg', 'glb', v.glb)), raw_sha_informe: v.sha256, publicado: rel(path.join(PUB, 'assets', 'props', v.glb)), publicado_sha: sha(path.join(PUB, 'assets', 'props', v.glb)) });
  // vehículos V4
  const veh = JSON.parse(fs.readFileSync(D('vehicles', 'report.json'), 'utf8'));
  for (const k of ['car', 'limo']) add({ recurso: `Vehículo ${k}`, fuente: veh[k].source, fuente_sha: sha(path.join(ROOT, veh[k].source)), fuente_sha_informe: veh[k].source_sha256, receta: rel(D('vehicles', 'derive_vehicles_v4.py')), receta_sha: sha(D('vehicles', 'derive_vehicles_v4.py')), receta_sha_informe: veh.recipe_sha256,
    editable: rel(D('vehicles', k, `${k}.blend`)), editable_ok: fs.existsSync(D('vehicles', k, `${k}.blend`)), raw: veh[k].glb, raw_sha: sha(path.join(ROOT, veh[k].glb)), raw_sha_informe: veh[k].glb_sha256, publicado: rel(path.join(PUB, 'assets', 'props', `${k}.glb`)), publicado_sha: sha(path.join(PUB, 'assets', 'props', `${k}.glb`)) });
  // audio: seis cortes
  const cuts = JSON.parse(fs.readFileSync(D('audio', 'cuts_v4.json'), 'utf8'));
  for (const c of cuts.cuts) add({ recurso: `Corte ${c.nombre_usuario} ${c.in_seconds}–${c.out_seconds} s`, fuente: c.source, fuente_sha: sha(path.join(ROOT, c.source)), fuente_sha_informe: c.source_sha256, receta: cuts.recipe, receta_sha: sha(path.join(ROOT, cuts.recipe)), receta_sha_informe: cuts.recipe_sha256,
    editable: '(el master WAV es el editable; no se modifica)', editable_ok: fs.existsSync(path.join(ROOT, c.source)), raw: rel(D('audio', c.file)), raw_sha: sha(D('audio', c.file)), raw_sha_informe: c.sha256, publicado: rel(path.join(PUB, 'audio', c.file)), publicado_sha: sha(path.join(PUB, 'audio', c.file)), publicado_igual_raw: true });
  // ANMI y NPC (recetas del juego; raw en .cache)
  add({ recurso: 'ANMI (rig + clips V4)', fuente: 'assets/source/character (Meshy, ver receta) + donantes de skate declarados', fuente_sha: null, receta: 'game/tools/build_character_v3.py', receta_sha: sha(path.join(GAME, 'tools', 'build_character_v3.py')), receta_sha_informe: null,
    editable: 'game/.cache/ANMI_RIG_EDIT.blend', editable_ok: fs.existsSync(path.join(GAME, '.cache', 'ANMI_RIG_EDIT.blend')), raw: 'game/.cache/ANMI_GAME.glb', raw_sha: sha(path.join(GAME, '.cache', 'ANMI_GAME.glb')), raw_sha_informe: null, publicado: 'game/public/assets/character/anmi.glb', publicado_sha: sha(path.join(PUB, 'assets', 'character', 'anmi.glb')) });
  for (const id of ['la_pantera', 'aissa', 'juseph', 'bella']) add({ recurso: `NPC ${id}`, fuente: `assets/source/npcs (${id})`, fuente_sha: null, receta: 'game/tools/build_npcs.py', receta_sha: sha(path.join(GAME, 'tools', 'build_npcs.py')), receta_sha_informe: null,
    editable: `game/.cache/npcs/${id}.glb (derivado; la fuente ZIP no se modifica)`, editable_ok: true, raw: `game/.cache/npcs/${id}.glb`, raw_sha: sha(path.join(GAME, '.cache', 'npcs', `${id}.glb`)), raw_sha_informe: null, publicado: `game/public/assets/npcs/${id}.glb`, publicado_sha: sha(path.join(PUB, 'assets', 'npcs', `${id}.glb`)) });
  // comprobaciones
  for (const r of rows) {
    r.estado = [];
    if (r.fuente_sha_informe && r.fuente_sha !== r.fuente_sha_informe) r.estado.push('fuente distinta a la del informe');
    if (r.receta_sha_informe && r.receta_sha !== r.receta_sha_informe) r.estado.push('receta cambiada desde el último build');
    if (r.raw_sha_informe && r.raw_sha !== r.raw_sha_informe) r.estado.push('derivado distinto al informe');
    if (!r.raw_sha) r.estado.push('falta el derivado');
    if (!r.publicado_sha) r.estado.push('falta el publicado');
    if (r.publicado_igual_raw && r.publicado_sha !== r.raw_sha) r.estado.push('publicado ≠ derivado');
    if (!r.editable_ok) r.estado.push('falta el editable');
  }
  const bad = rows.filter((r) => r.estado.length);
  const out = path.join(ROOT, 'V4', 'evidencias', 'PIPE'); fs.mkdirSync(out, { recursive: true });
  fs.writeFileSync(path.join(out, 'cadena_sha.json'), JSON.stringify(rows, null, 1));
  const s8 = (x) => (x ? x.slice(0, 12) : '—');
  fs.writeFileSync(path.join(out, 'CADENA_SHA.md'), ['# Cadena SHA de recursos V4 (PIPE-02)', '', `Generado por \`game/tools/v4/pipe-chain.mjs\` (${new Date().toISOString()}). SHA-256 abreviados (12); completos en \`cadena_sha.json\`. El publicado de GLB se reprocesa en \`sync-assets\` (texturas WebP, poda), por eso su SHA se registra y no se compara con el raw; el audio se publica tal cual.`, '',
    '| Recurso | Fuente | Receta | Derivado (raw) | Publicado | Estado |', '|---|---|---|---|---|---|',
    ...rows.map((r) => `| ${r.recurso} | ${s8(r.fuente_sha)} | ${s8(r.receta_sha)} | ${s8(r.raw_sha)} | ${s8(r.publicado_sha)} | ${r.estado.length ? r.estado.join('; ') : 'coherente'} |`), ''].join('\n'));
  R.check(rows.length === 19, 'cadena inventariada: kit (1) + vegetación (5) + vehículos (2) + cortes (6) + ANMI (1) + NPC (4) = 19', 'static', { n: rows.length });
  R.check(bad.length === 0, 'todos los eslabones coherentes (fuente/receta/derivado del informe, editable y publicado presentes)', 'static', bad.map((r) => ({ recurso: r.recurso, estado: r.estado })));
});
