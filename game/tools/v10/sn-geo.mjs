// V10 R6 · sn-geo · geometría de SECRETNOVIO contra su contrato (`game/src/world/sn_kit.json`, de la geometría aprobada del 17 oct; plan 30
// S-01…S-15). Fixture declarada: partida con las 20 patatas y la revelación vista (la arquitectura del reto existe).
//  · S-01/02 suelo por radios con rayos VISUALES: hormigón (r < 16), asfalto (16–22), bordes rosas en r 16,075 y 21,925;
//  · S-03/04 muro A: coronación a 7,00 (± 2 cm); apoyo curvo = cuarto de R 3,20 tangente al suelo en Z −8,60 (± 3 cm en 6 puntos);
//  · S-07 escalera: ladder `sn` en (4,75; −12,70) con cima 7; · S-08 B: perfil Bézier del contrato (± 3 cm en 8 muestras);
//  · S-10/11 D a Y 1 (± 1 cm) y libre por encima (cápsula); mesas de rana y fennec a Y 1; · S-13 seis montículos con cima 1,05 (± 2 cm);
//  · S-14 radiocasete en (4,80; −0,30) (± 0,3 m); · S-15 eje de paso |x| < 3 libre entre Z −8,6 y 7,25 salvo B (cápsula).
// Uso: node tools/v10/sn-geo.mjs --url v10 --task V10-R6 --label final
import fs from 'node:fs';
import { Report, runTest, launch, openGame, clickStart, sleep, arg } from '../v8/lib.mjs';
const R = new Report('sn-geo');
const K = JSON.parse(fs.readFileSync(arg('kit', '/Users/TU_USUARIO/Desktop/Bellakaventuras/game/src/world/sn_kit.json'), 'utf8'));
const ALL = ['no_me_guillo', 'nosvamosdeaqui', 'yinyang', 'tratratra', 'fashion_girl'].flatMap((z) => ['visible', 'medium', 'hidden', 'activity'].map((k) => `${z}.${k}`));
const SAVE = { version: 5, migV10: 99, collected: ALL, activities: { pantherTalk: true, skateTutorial: true, graffiti: true, bridgeTalk: true, danceCombo: true }, bridgeReached: true, finalDone: false, finalProof: null, revealSeen: true,
  checkpoint: null, checkpointRevision: 7, saveEpoch: 'sn-geo', hints: ['basic'], settings: { volume: 0.8, muted: false, advancedControls: true, camSens: 1, invertY: false, reducedMotion: false, orientation: 'auto', mouseLock: true },
  partials: { tutorialStep: 0, tutorialStarted: false, bridgeRest: 4, bridgeHeard: { aissa: true, juseph: true }, graffitiMask: null, graffitiCheck: 0, graffitiRev: 8, graffitiErrRun: 0, graffitiIntro: true, danceRounds: 0 } };
await runTest(R, async () => {
  const b = await launch();
  try {
    const page = await openGame(b, R, { save: SAVE }); await clickStart(page); await sleep(2500);
    R.fixture('partida con 20 patatas y la revelación vista (arquitectura del reto levantada)', {});
    const M = await page.evaluate((K) => {
      const g = window.__bk, RA = window.__bkRapier, W = g.world, T = window.__bkTHREE, FL = RA.QueryFilterFlags.EXCLUDE_SENSORS | RA.QueryFilterFlags.EXCLUDE_KINEMATIC;
      const skip = (c) => g.npcColliders.has(c.handle) || c === g.skater.collider;
      // V10.1: el reto gira con su grupo (−45°): cada punto del contrato (marco del reto) se lleva al mundo; escalera y radiocasete, de vuelta
      const th = g.park.sn.group.rotation.y, cs = Math.cos(th), sn = Math.sin(th), Wx = (x, z) => x * cs + z * sn, Wz = (x, z) => -x * sn + z * cs, Lx = (x, z) => x * cs - z * sn, Lz = (x, z) => x * sn + z * cs;
      const top = (x0, z0, from = 12) => { const x = Wx(x0, z0), z = Wz(x0, z0); const h = W.castRay(new RA.Ray({ x, y: from, z }, { x: 0, y: -1, z: 0 }), from + 2, true, FL, undefined, undefined, undefined, (c) => !skip(c)); return h ? +(from - h.timeOfImpact).toFixed(3) : null; };
      const capFree = (x0, y, z0) => !W.intersectionWithShape({ x: Wx(x0, z0), y: y + 0.97, z: Wz(x0, z0) }, { x: 0, y: 0, z: 0, w: 1 }, new RA.Capsule(0.45, 0.4), FL, undefined, undefined, undefined, (c) => !skip(c));
      // suelo visual
      const rc = new T.Raycaster(), meshes = []; g.park.root.traverse((o) => { if (o.isMesh && !o.isSprite && /^STATIC_/.test(o.name)) meshes.push(o); });
      const matAt = (x, z) => { rc.set(new T.Vector3(Wx(x, z), 3, Wz(x, z)), new T.Vector3(0, -1, 0)); const h = rc.intersectObjects(meshes, false)[0]; return h ? h.object.name.replace(/^STATIC_[^|]*\|/, '') : null; };
      const ang = 150 * Math.PI / 180,   /* a 150° no hay muro, montículos ni mesas en r 8 y 12 */ at = (r) => [r * Math.sin(ang), -r * Math.cos(ang)];
      const floor = { r8: matAt(...at(8)), r12: matAt(...at(12)), r17: matAt(...at(17.2)), r21: matAt(...at(20.8)), rosaIn: matAt(...at(K.pink_stripe_centers[0])), rosaOut: matAt(...at(K.pink_stripe_centers[1])) };
      // muro A
      const Wl = K.wall, crest = [-3, 0, 3].map((x) => top(x, (Wl.rear_z + Wl.face_z) / 2));
      const R0 = Wl.quarter_radius, z0 = Wl.quarter_ground_z, quarter = [];
      for (const a of [0.15, 0.4, 0.6, 0.8, 1.0, 1.3]) { const z = z0 - R0 * Math.sin(a), e = R0 * (1 - Math.cos(a)), h = top(0, z, 5); quarter.push({ z: +z.toFixed(2), e: +e.toFixed(3), h }); }
      const lad = g.manifest.ladders.find((l) => l.id === 'sn');
      // B
      const S = K.kicker.profile_samples_world_z_y, kick = [];
      for (const i of [10, 25, 40, 55, 70, 80, 90, 95, 97, 99]) { const z = (S[i][0] + S[i - 1][0]) / 2, y = (S[i][1] + S[i - 1][1]) / 2;   /* a mitad de tramo: en una fila de vértices el rayo cae en la arista (caso degenerado) */ kick.push({ z: +z.toFixed(2), e: +y.toFixed(3), h: top(0.37, z, 4) }); }   /* fuera del eje: en x = 0 el rayo cae justo en la diagonal de los triángulos */
      // D y mesas
      const D = K.landing, dTop = [], dFree = [];
      for (const dx of [-2, 0, 2]) for (const dz of [-2, 0, 2]) { dTop.push(top(D.center_xz[0] + dx, D.center_xz[1] + dz, 4)); dFree.push(capFree(D.center_xz[0] + dx, D.top_y, D.center_xz[1] + dz)); }
      const tables = D.side_platforms.map((s) => ({ owner: s.owner, h: top(s.center_xz[0], s.center_xz[1], 4) }));
      const mounds = K.mounds.map((m) => ({ id: m.id, h: top(m.x, m.z, 4) }));
      const cas = g.manifest.cassettes.find((c) => c.zone === 'secretnovio');
      // eje de paso
      const block = []; for (let z = -8.4; z <= 7.0; z += 0.5) { if (z > K.kicker.start_z - 0.1 && z < K.kicker.lip_z + 0.3) continue; for (const x of [-2.5, 0, 2.5]) if (!capFree(x, 0, z)) block.push([x, +z.toFixed(1)]); }
      return { floor, crest, quarter, lad: lad ? { axis: [Lx(lad.axis.x, lad.axis.z), Lz(lad.axis.x, lad.axis.z)], top: lad.top } : null, kick, dTop, dFree, tables, mounds, cas: cas ? [Lx(cas.pos.x, cas.pos.z), Lz(cas.pos.x, cas.pos.z)] : null, block };
    }, K);
    R.measure('sn', M);
    const f = M.floor;
    R.check(f.r8 === 'sn_concrete' && f.r12 === 'sn_concrete' && f.r17 === 'asphalt' && f.r21 === 'asphalt' && f.rosaIn === 'pink' && f.rosaOut === 'pink', 'suelo: hormigón r < 16, asfalto r 16–22 y bordes rosas en r 16,075 y 21,925', 'static', f);
    R.check(M.crest.every((h) => h !== null && Math.abs(h - K.wall.deck_height) <= 0.02), `muro A: coronación a ${K.wall.deck_height} (± 2 cm)`, 'static', M.crest);
    R.check(M.quarter.every((q) => q.h !== null && Math.abs(q.h - q.e) <= 0.03), 'muro A: apoyo curvo = cuarto de R 3,20 tangente al suelo en Z −8,60 (± 3 cm)', 'static', M.quarter);
    R.check(!!M.lad && Math.hypot(M.lad.axis[0] - K.ladder.axis_xyz[0], M.lad.axis[1] - K.ladder.axis_xyz[2]) < 0.05 && Math.abs(M.lad.top - K.ladder.top) < 0.01, 'escalera vertical del muro A en su eje, con cima 7', 'static', M.lad);
    R.check(M.kick.every((q) => q.h !== null && Math.abs(q.h - q.e) <= 0.03), 'rampa B: perfil Bézier del contrato (± 3 cm)', 'static', M.kick);
    R.check(M.dTop.every((h) => h !== null && Math.abs(h - K.landing.top_y) <= 0.01) && M.dFree.every(Boolean), 'recepción D a Y 1 (± 1 cm) y libre por encima', 'static', { dTop: M.dTop, dFree: M.dFree });
    R.check(M.tables.every((t) => t.h !== null && Math.abs(t.h - 1) <= 0.01), 'mesas de la rana y el fennec a Y 1', 'static', M.tables);
    R.check(M.mounds.length === 6 && M.mounds.every((m) => m.h !== null && Math.abs(m.h - 1.05) <= 0.02), 'seis montículos con cima 1,05 (± 2 cm)', 'static', M.mounds);
    R.check(!!M.cas && Math.hypot(M.cas[0] - K.cassette.anchor_xyz[0], M.cas[1] - K.cassette.anchor_xyz[2]) <= 0.3, 'radiocasete central en (4,80; −0,30)', 'static', M.cas);
    R.check(M.block.length === 0, `eje de paso |x| < 3 libre entre el muro y D salvo la rampa B (${M.block.length} puntos bloqueados)`, 'static', M.block.slice(0, 8));
  } finally { await b.close(); }
}, { timeoutMs: 300000 });
