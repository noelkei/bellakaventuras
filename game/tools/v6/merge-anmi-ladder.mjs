// V6 T6-04 · Añade SK_LadderClimb y SK_LadderDown (assets/derived/v6/fashion_girl/anim) al ANMI PUBLICADO sin regenerarlo:
// copia los canales por nombre de hueso, conserva todo lo demás y COMPRUEBA que los datos decodificados de las 43 animaciones
// V5, las mallas y la piel quedan idénticos. Actualiza anmi.clips.json con la meta de los clips nuevos (curvas de subida/bajada).
// Base protegida: V6/baseline_V5/public/assets/character/anmi.glb. Uso: node game/tools/v6/merge-anmi-ladder.mjs [--task T6-04]
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { MeshoptEncoder, MeshoptDecoder } from 'meshoptimizer';
import fs from 'node:fs';
import crypto from 'node:crypto';
import path from 'node:path';
import { GAME, ROOT, EVID, arg } from './lib.mjs';
await MeshoptEncoder.ready; await MeshoptDecoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.encoder': MeshoptEncoder, 'meshopt.decoder': MeshoptDecoder });
const sha = (f) => crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex');
const BASE = path.join(ROOT, 'V6/baseline_V5/public/assets/character/anmi.glb');           // siempre desde la base V5 (idempotente)
const BASEC = path.join(ROOT, 'V6/baseline_V5/public/assets/character/anmi.clips.json');
const LAD = path.join(ROOT, 'assets/derived/v6/fashion_girl/anim/glb/anmi_ladder_clips.glb');
const REP = JSON.parse(fs.readFileSync(path.join(ROOT, 'assets/derived/v6/fashion_girl/anim/ladder_clips_report.json'), 'utf8'));
const DST = path.join(GAME, 'public/assets/character/anmi.glb'), DSTC = path.join(GAME, 'public/assets/character/anmi.clips.json');
if (sha(LAD) !== REP.glb.sha256) throw new Error('el GLB de escalera no coincide con su informe');
const digest = (doc) => {   // huella de los datos decodificados (animaciones, mallas, piel)
  const h = {}; const root = doc.getRoot();
  for (const a of root.listAnimations()) { const c = crypto.createHash('sha256'); for (const ch of a.listChannels()) { const s = ch.getSampler(); c.update(ch.getTargetNode()?.getName() + ch.getTargetPath()); c.update(Buffer.from(s.getInput().getArray().buffer)); c.update(Buffer.from(s.getOutput().getArray().buffer)); } h['anim:' + a.getName()] = c.digest('hex').slice(0, 16); }
  for (const m of root.listMeshes()) { const c = crypto.createHash('sha256'); for (const p of m.listPrimitives()) for (const s of p.listSemantics()) c.update(Buffer.from(p.getAttribute(s).getArray().buffer)); h['mesh:' + m.getName()] = c.digest('hex').slice(0, 16); }
  for (const s of root.listSkins()) { const c = crypto.createHash('sha256'); c.update(Buffer.from(s.getInverseBindMatrices().getArray().buffer)); h['skin:' + s.getName()] = c.digest('hex').slice(0, 16); }
  return h;
};
const doc = await io.read(BASE), lad = await io.read(LAD);
const before = digest(doc);
const nodes = new Map(doc.getRoot().listNodes().map((n) => [n.getName(), n]));
const buf = doc.getRoot().listBuffers()[0];
const added = {};
for (const a of lad.getRoot().listAnimations()) {
  const name = a.getName(); if (!REP.clips[name]) continue;
  const na = doc.createAnimation(name); let n = 0, skipped = 0;
  for (const ch of a.listChannels()) {
    const tn = nodes.get(ch.getTargetNode()?.getName()); if (!tn) { skipped++; continue; }
    const s = ch.getSampler();
    const inp = doc.createAccessor().setType('SCALAR').setArray(s.getInput().getArray().slice()).setBuffer(buf);
    const out = doc.createAccessor().setType(s.getOutput().getType()).setArray(s.getOutput().getArray().slice()).setBuffer(buf);
    const ns = doc.createAnimationSampler().setInput(inp).setOutput(out).setInterpolation(s.getInterpolation());
    na.addSampler(ns).addChannel(doc.createAnimationChannel().setTargetNode(tn).setTargetPath(ch.getTargetPath()).setSampler(ns)); n++;
  }
  added[name] = { channels: n, skipped };
}
await io.write(DST, doc);
const after = digest(await io.read(DST));
const changed = Object.keys(before).filter((k) => before[k] !== after[k]);
const clips = JSON.parse(fs.readFileSync(BASEC, 'utf8'));
const C = REP.clips.SK_LadderClimb, Dn = REP.clips.SK_LadderDown;
clips.clips.SK_LadderClimb = { loop: true, source: 'ladder-v6 Fast_Ladder_Climb (en el sitio)', seconds: C.seconds, rise: C.rise, rise_per_cycle: C.rise_per_cycle, plane_forward: 0.4 };
clips.clips.SK_LadderDown = { loop: false, source: 'ladder-v6 climbing_down_wall f20–48 (en el sitio)', seconds: Dn.seconds, drop: Dn.drop, drop_total: Dn.drop_total, plane_forward: 0.4 };
fs.writeFileSync(DSTC, JSON.stringify(clips, null, 1));
const res = { date: new Date().toISOString(), base: { glb: sha(BASE), clips: sha(BASEC) }, ladder: { glb: path.relative(ROOT, LAD), sha256: sha(LAD), recipe_sha256: REP.recipe_sha256, sources: REP.sources },
  public: { glb: sha(DST), bytes: fs.statSync(DST).size, clips: sha(DSTC) }, added, v5DataChanged: changed, v5Entries: Object.keys(before).length };
const task = arg('task', 'T6-04'); fs.mkdirSync(path.join(EVID, task), { recursive: true });
fs.writeFileSync(path.join(EVID, task, 'merge-anmi-ladder.json'), JSON.stringify(res, null, 1));
console.log('ANMI + escalera', res.public.bytes, 'B; añadidos', JSON.stringify(added), '; datos V5 cambiados:', changed.length ? changed.join(',') : 'ninguno', `(${res.v5Entries} comprobados)`);
if (changed.length) process.exitCode = 1;
