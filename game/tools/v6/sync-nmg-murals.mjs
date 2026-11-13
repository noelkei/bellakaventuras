// V6 R4 · Publicación PARCIAL del mural de NO ME GUILLO con los cinco grafitis NMG (receta assets/derived/v6/nmg/make_nmg_murals_v6.py).
// Solo escribe public/assets/tex/T_nmg_murals_v6.webp y la capa de grafitis T_nmg_graffiti_v6.webp/.json; el kit nmg_kit.glb de V5 NO se toca (el juego cambia el mapa del material
// de murales al cargarlo). Comprueba los hashes de todo public/ antes y después: solo puede cambiar ese archivo.
import sharp from 'sharp';
import fs from 'node:fs';
import crypto from 'node:crypto';
import path from 'node:path';
import { GAME, ROOT, EVID, arg } from './lib.mjs';

const SRC = path.join(ROOT, 'assets/derived/v6/nmg');
const PUB = path.join(GAME, 'public/assets');
const sha = (f) => crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex');
const tree = (d) => { const o = {}; const w = (x) => { for (const e of fs.readdirSync(x, { withFileTypes: true })) { const p = path.join(x, e.name); if (e.isDirectory()) w(p); else o[path.relative(PUB, p)] = sha(p); } }; w(d); return o; };
const meta = JSON.parse(fs.readFileSync(path.join(SRC, 'murals_v6.json'), 'utf8'));
const src = path.join(SRC, meta.atlas.file);
if (sha(src) !== meta.atlas.sha256) throw new Error('el atlas no coincide con murals_v6.json');
const before = tree(PUB);
const dst = path.join(PUB, 'tex', 'T_nmg_murals_v6.webp');
await sharp(src).webp({ quality: 88, effort: 6 }).toFile(dst + '.tmp'); fs.renameSync(dst + '.tmp', dst);
// R5: capa de grafitis en alta resolución + regiones (mural → capa)
const gl = meta.graffiti_layer, gsrc = path.join(SRC, gl.file), rsrc = path.join(SRC, gl.regions);
if (sha(gsrc) !== gl.sha256 || sha(rsrc) !== gl.regions_sha256) throw new Error('la capa de grafitis no coincide con murals_v6.json');
const gdst = path.join(PUB, 'tex', 'T_nmg_graffiti_v6.webp'), rdst = path.join(PUB, 'tex', 'T_nmg_graffiti_v6.json');
await sharp(gsrc).webp({ quality: 90, alphaQuality: 95, effort: 6 }).toFile(gdst + '.tmp'); fs.renameSync(gdst + '.tmp', gdst);
fs.copyFileSync(rsrc, rdst);
const after = tree(PUB), changed = [];
for (const k of new Set([...Object.keys(before), ...Object.keys(after)])) if (before[k] !== after[k]) changed.push(k);
const foreign = changed.filter((k) => !['tex/T_nmg_murals_v6.webp', 'tex/T_nmg_graffiti_v6.webp', 'tex/T_nmg_graffiti_v6.json'].includes(k));
const out = { date: new Date().toISOString(), src: path.relative(ROOT, src), sha256: meta.atlas.sha256, public: path.relative(ROOT, dst), public_sha256: sha(dst), bytes: fs.statSync(dst).size, changed, foreign };
const task = arg('task', 'T6-R2'); fs.mkdirSync(path.join(EVID, task), { recursive: true });
fs.writeFileSync(path.join(EVID, task, 'sync-nmg-murals.json'), JSON.stringify(out, null, 1));
console.log(`mural NMG publicado: ${changed.length} cambiado(s)`, foreign.length ? `¡AJENOS: ${foreign.join(', ')}!` : 'ningún archivo ajeno cambiado');
if (foreign.length) process.exit(1);
