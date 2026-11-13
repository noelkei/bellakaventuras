// NO ME GUILLO V4 (cap. 10–12): planta nueva en la corona de 20 m con el cluster corazón + plataforma/escalera/bank,
// quarter separado al final del carril del bank, cajones, U del secreto, cuatro palmas en islas, mobiliario y cassette.
// Medidas: contrato único `nmg_kit.json` (también lo lee el script de Blender del kit). Aquí se crean las COLISIONES
// exactas (cajas y prismas de los mismos números) y un blockout visual en trozos `proxy_nmgkit_<pieza>` que se oculta
// cuando carga el GLB del kit (Park.loadNmgKit); si el GLB falla, el blockout queda visible y la colisión no cambia.
import * as THREE from 'three';
import KIT from './nmg_kit.json';
import { copingPipe } from './coping';
import { polar, toPolar, coronaTh, coronaYaw } from './manifest';
import { Place, smoothBankProfile, quarterProfile, bankProfile, extrudeProfile } from './geo';
import { palm, nmgLamp, nmgPlant, nmgFlowerShrub, nmgTree, rot } from './props';
import type { Park } from './park';

const D2R = Math.PI / 180;
/** Altura de la tierra visible dentro de la isla del kit (medida en el GLB servido con nmg-supports, T5-11). */
// V5 ART-11: bordillo bajo (isla 0,08 m). R6: tierra visible a 0,048 m (nmg-supports; el 0,03 anterior compensaba que la base
// de las rosetas viejas empezaba 2 cm sobre su origen; las matas nuevas apoyan en su origen)
export const BED_SOIL = 0.048;
export const NMG_KIT = KIT;
/** Piezas del kit con GLB propio y su colocación (rellenado al construir; Park.loadNmgKit las instancia). */
export interface KitSlot { piece: string; place: Place; sn?: boolean }   // V10.3: `sn` = isla de SECRETNOVIO (sube con la revelación)
export const NMG_SLOTS: KitSlot[] = [];

/** Marco del cluster: X = tangente horaria en el origen, Z = hacia el centro; yaw three del marco = −θ. */
/** V5 T5-12: hueco de la U en coordenadas locales de la pieza (x hacia la boca, z lateral) y medidas de la boca. */
export function uPit() {
  const U = KIT.uWall as typeof KIT.uWall & { pit: { depth: number; steps: number; tread: number } };
  const depth = U.pit.depth, steps = U.pit.steps, tread = U.pit.tread;
  return { depth, steps, tread, rise: depth / steps, x0: -U.w / 2 + U.t, x1: U.w / 2, z0: -U.d / 2 + U.t, z1: U.d / 2 - U.t };
}
/** V5 T5-12: colocación de la U (marco de la pieza). */
export function uPlace() { const { C } = nmgFrame(); return C(KIT.layout.uWall[0], KIT.layout.uWall[1]); }
/** V5 T5-12: esquinas del hueco de la U en el mundo (x, z), para recortar suelo físico y visual. */
export function uPitWorld() {
  const { C } = nmgFrame(), L = KIT.layout, up = C(L.uWall[0], L.uWall[1]), P = uPit();
  return [[P.x0, P.z0], [P.x1, P.z0], [P.x1, P.z1], [P.x0, P.z1]].map(([x, z]) => { const r = rot(up, x, 0, z); return [r.x, r.z] as [number, number]; });
}

export function nmgFrame() {
  // V10: el marco (θ del contrato, escrito con la orientación V3–V9) gira con la corona: 33° → 42° (NO se corrige al eje 45°, §07)
  const th = coronaTh(KIT.layout.origin.theta) * D2R, O = polar(KIT.layout.origin.r, coronaTh(KIT.layout.origin.theta));
  const X = new THREE.Vector3(Math.cos(th), 0, Math.sin(th)), Z = new THREE.Vector3(-Math.sin(th), 0, Math.cos(th));
  const yaw = -th;
  const C = (x: number, z: number, h = 0, yawOff = 0): Place => ({ x: O.x + X.x * x + Z.x * z, y: h, z: O.z + X.z * x + Z.z * z, yaw: yaw + yawOff });
  const V = (x: number, z: number, h = 0) => new THREE.Vector3(O.x + X.x * x + Z.x * z, h, O.z + X.z * x + Z.z * z);
  return { C, V, X, Z, yaw, O };
}

export function buildNoMeGuillo(P: Park) {
  NMG_SLOTS.length = 0;
  const b = P.b, m = P.manifest, id = 'no_me_guillo' as const;
  const { C, V, yaw } = nmgFrame();
  const L = KIT.layout;
  const slot = (piece: string, place: Place) => { NMG_SLOTS.push({ piece, place }); };
  const proxy = (piece: string, draw: () => void) => { const c = b.chunk; b.chunk = `proxy_nmgkit_${piece}`; try { draw(); } finally { b.chunk = c; } };

  // ---------------------------------------------------------------- llegada, Pantera, cassette
  const spawn = V(L.spawn[0], L.spawn[1]);
  const heartP = C(L.heart[0], L.heart[1], 0, -Math.PI / 2);   // frente +Z del corazón → −X del marco (hacia la llegada)
  // V5 T5-23 (OPUS-011, plan 15 §4): llegada girada hacia la caja de música 0,12 → 0,45 rad (+19°). Barrido medido
  // (`T5-23/runs/arrival-sweep_s1`): con 0,12 la cabeza de ANMI tapaba el 22–32 % de Pantera; 0,33 aún el 15 % en vertical;
  // 0,45 es el único valor con Pantera y corazón libres en escritorio, vertical y horizontal (ANMI a su izquierda, como la
  // ref 03). Supera los 10–15° orientativos del plan por ese dato. No se escala nada ni se mueve el spawn.
  m.spawn = { pos: spawn, heading: Math.atan2(heartP.x - spawn.x, heartP.z - spawn.z) + 0.45 };
  m.anchor('nmg.llegada', spawn, m.spawn.heading);   // V10: la partida nueva empieza en la plaza exterior (Park.build); esta es la llegada de NMG
  m.checkpoints.push({ id: 'cp.no_me_guillo', zone: id, pos: spawn.clone(), heading: m.spawn.heading });
  // V4-NMG-05: sentada en el bordillo del corazón como en la referencia (03-llegada): de cara a la llegada, la raíz en el
  // suelo bajo el borde delantero del bordillo (pose horneada: asiento 0,392 m, suelas a 1–5 mm, manos en las rodillas;
  // tools/build_npcs.py → sit_fit/hand_rest_fit). El asiento cae 0,25 m por detrás del canto: muslos encima, piernas fuera.
  const H0 = KIT.heart;
  // V5 T5-11: con el kit a su altura real (T5-03) pies y pantorrillas atravesaban la cara frontal (11 cm): ancla 11,5 cm más al borde
  const seat = rot(heartP, -(H0.block[0] + H0.ledge[0]) / 2 + 0.1, 0, H0.ledge[2] / 2 - 0.135);
  const seatPos = new THREE.Vector3(seat.x, 0, seat.z), panFace = heartP.yaw!;
  m.anchor('npc.la_pantera', seatPos, panFace);
  m.anchor('npc.la_pantera.seat', new THREE.Vector3(seat.x, H0.ledge[1], seat.z), panFace);
  const talk = rot(seat, 0.2, 0, 1.75);
  P.zone('act.pantherTalk', new THREE.Vector3(talk.x, 0, talk.z), 2.2);
  const bb = V(L.boombox[0], L.boombox[1]);
  // V5 ART-15: el radiocasete se apoya directamente en el suelo (sin zócalo, como en la referencia); conserva su collider (T5-14)
  m.cassettes.push({ zone: id, pos: bb, heading: Math.atan2(spawn.x - bb.x, spawn.z - bb.z), lift: 0 });

  // ---------------------------------------------------------------- pieza 02 (espejada): plataforma + escalera + bank
  const K = KIT.platform, pf = C(L.platform[0], L.platform[1]);
  b.solid(pf, K.w, K.h, K.d, 'nmg_platform');
  // V5 T5-05 (D4, OPUS-006, DT-05): la escalera colisiona como RAMPA continua (como tt_stair_ramp) de la arista exterior del
  // peldaño bajo al canto de la plataforma; los peldaños se ven igual (kit) pero ya no son cajas que el autostep sube una a
  // una: a pie se camina (pendiente ≈23° < maxSlope), en skate no se puede empujar en ella (pushMaxSlope) y la gravedad frena:
  // desde parado no sube, con impulso sí. Collider sin malla (la rampa asomaría entre las huellas).
  // Perfil por el CENTRO de las huellas (pendiente rise/tread): desviación pie-huella ±rise/2 = ±0,10 m (DT-05); arranca
  // media huella delante del primer peldaño y acaba media huella dentro de la plataforma (bajo su cara superior).
  { const slope = K.stairs.rise / K.stairs.tread, run = K.h / slope, zFoot = K.d / 2 + K.stairs.tread * K.stairs.steps + K.stairs.tread / 2;
    const foot = rot(pf, 0, 0, zFoot);
    b.trimesh(extrudeProfile(bankProfile(K.h, run, 0), K.w), { ...foot, yaw: (foot.yaw ?? 0) + Math.PI }, 'nmg_stair_ramp', 'ramp'); }
  const bankFoot = C(L.platform[0] + K.w / 2 + K.bank.run, L.platform[1], 0, -Math.PI / 2);
  proxy('platform', () => P.b.prism(bankFoot, smoothBankProfile(K.h, K.bank.run, K.bank.blend), K.d, { mat: 'concrete_grey', name: 'nmg_bank', collide: true }));
  slot('platform', pf);
  proxy('platform', () => {
    b.box(pf, K.w, K.h, K.d, { mat: 'concrete_grey', collide: false });
    for (let i = 0; i < K.stairs.steps; i++) { const h = K.stairs.rise * (K.stairs.steps - i), z = K.d / 2 + K.stairs.tread * (i + 0.5); b.box(rot(pf, 0, 0, z), K.w, h, K.stairs.tread, { mat: 'concrete_grey', collide: false }); }
  });
  m.anchor('nmg.platform', V(L.platform[0], L.platform[1], K.h), yaw);
  m.anchor('nmg.bank.foot', V(L.platform[0] + K.w / 2 + K.bank.run + 0.5, L.platform[1]), yaw - Math.PI / 2);

  // ---------------------------------------------------------------- pieza 01: corazón + bordillo (frente hacia la llegada)
  const H = KIT.heart;
  b.solid(heartP, H.block[0], H.block[1], H.block[2], 'nmg_heart');
  b.solid(rot(heartP, -(H.block[0] + H.ledge[0]) / 2, 0, 0), H.ledge[0], H.ledge[1], H.ledge[2], 'nmg_heart_ledge');
  slot('heart', heartP);
  proxy('heart', () => {
    b.box(heartP, H.block[0], H.block[1], H.block[2], { mat: 'concrete_grey', collide: false });
    b.box(rot(heartP, -(H.block[0] + H.ledge[0]) / 2, 0, 0), H.ledge[0], H.ledge[1], H.ledge[2], { mat: 'concrete_grey', collide: false });
    P.paintFace('T_nmg_heart_front', rot(heartP, 0, 0, H.block[2] / 2 + 0.005), heartP.yaw!, H.block[0], H.block[1]).name = 'STATIC_proxy_nmgkit_heart|paint';
  });
  m.anchor('nmg.heart', V(L.heart[0], L.heart[1], 0.5), heartP.yaw!);

  // ---------------------------------------------------------------- cajones, bordillo largo, U del secreto
  const box = (piece: 'boxSmall' | 'boxMedium' | 'ledgeLong', at: number[], name: string) => {
    const s = KIT[piece].size, p = C(at[0], at[1]);
    b.solid(p, s[0], s[1], s[2], name); slot(piece, p);
    proxy(piece, () => b.box(p, s[0], s[1], s[2], { mat: 'graffiti', uv: 0.45, collide: false }));
    return p;
  };
  // V10.3 (U-09): coping decorativo en los dos cantos largos de arriba de los cajones (como los raíles, pero sin grind)
  for (const [pc, at] of [['boxSmall', L.boxSmall], ['boxMedium', L.boxMedium]] as const) { const p = box(pc, at, pc === 'boxSmall' ? 'nmg_box_small' : 'nmg_block'), s = KIT[pc].size;
    for (const sz of [-1, 1]) { const a = rot(p, -s[0] / 2, s[1] + 0.012, sz * (s[2] / 2 - 0.02)), c = rot(p, s[0] / 2, s[1] + 0.012, sz * (s[2] / 2 - 0.02));
      copingPipe(b, new THREE.Vector3(a.x, a.y, a.z), new THREE.Vector3(c.x, c.y, c.z)); } }
  box('ledgeLong', L.ledgeLong, 'nmg_ledge_long');
  const U = KIT.uWall, up = C(L.uWall[0], L.uWall[1]);
  const uParts: [number, number, number, number][] = [   // [x, z, w, d] locales: muro trasero (−X) y dos laterales; boca en +X
    [-U.w / 2 + U.t / 2, 0, U.t, U.d], [U.t / 2, -U.d / 2 + U.t / 2, U.w - U.t, U.t], [U.t / 2, U.d / 2 - U.t / 2, U.w - U.t, U.t]];
  // V5 T5-12 (HUM-004, DT-02): muro exterior de 0,625 m sobre el suelo y hoyo interior de `pit.depth`: los muros nacen en el
  // fondo (su cara interior baja hasta −depth), suelo del hoyo y boca con rampa de colisión por el centro de las huellas
  const PIT = uPit();
  for (const [x, z, w, d] of uParts) b.solid({ ...rot(up, x, 0, z), y: -PIT.depth }, w, U.h + PIT.depth, d, 'nmg_alcove');
  b.solid({ ...rot(up, (PIT.x0 + PIT.x1) / 2, 0, 0), y: -PIT.depth - 0.4 }, PIT.x1 - PIT.x0 + 0.02, 0.4, PIT.z1 - PIT.z0 + 0.02, 'nmg_pit_floor');
  { const slope = PIT.rise / PIT.tread, run = PIT.depth / slope, xTop = PIT.x1 + PIT.tread / 2;   // la rampa nace media huella fuera de la boca
    const foot = rot(up, xTop, 0, 0);
    // perfil: sube hacia +z local; con yaw −π/2 relativo, +z local de la rampa apunta a −X de la U (hacia dentro) y baja: se
    // construye invertida (y negativa): de (0, 0) en la boca a (run, −depth) en el fondo
    b.trimesh(extrudeProfile([[0, 0], [run, -PIT.depth], [run, -PIT.depth - 0.05], [0, -0.05]], PIT.z1 - PIT.z0), { ...foot, y: 0, yaw: (foot.yaw ?? 0) - Math.PI / 2 }, 'nmg_pit_ramp', 'ramp'); }
  slot('uWall', up);
  // V10.3 (U-09): coping decorativo en los cantos interiores de arriba de la U (muro trasero y laterales)
  { const y = U.h + 0.012, e = 0.02, P3 = (x: number, z: number) => { const q = rot(up, x, y, z); return new THREE.Vector3(q.x, q.y, q.z); };
    copingPipe(b, P3(-U.w / 2 + U.t - e, -U.d / 2 + U.t), P3(-U.w / 2 + U.t - e, U.d / 2 - U.t));
    for (const sz of [-1, 1]) copingPipe(b, P3(-U.w / 2 + U.t, sz * (U.d / 2 - U.t + e)), P3(U.w / 2, sz * (U.d / 2 - U.t + e))); }
  { const mo = rot(up, 1, 0, 0); m.anchor('nmg.u', V(L.uWall[0], L.uWall[1]), Math.atan2(mo.x - up.x, mo.z - up.z)); }   // heading = hacia la boca (+X local)
  proxy('uWall', () => { for (const [x, z, w, d] of uParts) b.box({ ...rot(up, x, 0, z), y: -PIT.depth }, w, U.h + PIT.depth, d, { mat: 'graffiti', uv: 0.45, collide: false }); });

  // ---------------------------------------------------------------- quarter separado (encarado al bank)
  const Q = KIT.quarter, qp = C(L.quarter[0], L.quarter[1], 0, Math.PI / 2);   // perfil hacia +X (sube alejándose del bank)
  const qR = (Q.run * Q.run + Q.h * Q.h) / (2 * Q.h);
  proxy('quarter', () => P.b.prism(qp, quarterProfile(Q.h, qR, Q.deck), Q.w, { mat: 'concrete_grey', name: 'nmg_quarter' }));
  slot('quarter', qp);
  m.anchor('nmg.quarter', V(L.quarter[0], L.quarter[1]), yaw + Math.PI / 2);

  // ---------------------------------------------------------------- patatas (IDs y tipos V3 conservados)
  const F = L.fries;
  P.fry(id, 'visible', V(F.visible[0], F.visible[1]), 'roll', 'A la vista desde la llegada, entre el spawn y el corazón', 'Suelo plano');
  P.fry(id, 'medium', V(F.medium[0], F.medium[1], F.medium[2]), 'ollie', 'Encima del cajón de 0,9 m frente a la escalera: ollie desde el suelo', 'Saltar al suelo por cualquier lado');
  // V5 T5-12: la patata secreta está en el FONDO del hoyo y su parte superior queda bajo el nivel del suelo (hover reducido)
  P.fry(id, 'hidden', V(F.hidden[0], F.hidden[1], -uPit().depth), 'camera', 'En el fondo hundido de la U, con la boca de espaldas a la llegada: rodearla o mirar desde el bank', 'Salir por los peldaños de la boca de la U', 0.12);
  P.fry(id, 'activity', V(F.activity[0], F.activity[1]), 'roll', 'Aparece frente a La Pantera tras «Fuuuuck...»', 'Suelo plano');

  // ---------------------------------------------------------------- vegetación y mobiliario (islas, palmas, farolas, banco, árboles)
  const bed = KIT.bed;
  L.palms.forEach(([r, th0], i) => {
    const th = coronaTh(th0), p = polar(r, th);   // V10: θ literal del kit + giro de corona
    const pl: Place = { x: p.x, z: p.z, yaw: -th * D2R };
    slot('bed', pl);
    proxy('bed', () => b.box(pl, bed.w, bed.h, bed.d, { mat: 'dirt', collide: false, shadow: false }));
    // V5 ART-12: palmera NMG nativa (hojas lima, anillos), solo en este sector
    palm(b, { ...pl, y: 0 }, [6.2, 5.8, 6.0, 5.6][i], [0.06, 0.16, 0.1, 0.14][i], 3 + i, true);
    // R6 (usuario, 12 oct): matas nuevas (referencias vegetacion-mejora-2026-10-12) apoyadas en la TIERRA visible de la isla:
    // tres por isla alrededor del tronco (a la escala del modelo: matas de ≈ 0,5 m que se tocan), mezcla de A/B/C con flores
    // en dos islas, tamaños y giros moderadamente distintos; dejan ver tierra (no cubren la isla entera)
    const ISL: string[][] = [['a', 'b', 'c'], ['a_flor', 'c', 'b'], ['b', 'a', 'c'], ['c', 'a_flor', 'b']];
    ISL[i].forEach((v, k) => {
      const ang = i * 0.9 + k * 2.094 + 0.35 + (k % 2 ? 0.15 : -0.1), rr = v === 'b' ? 0.46 : 0.5;
      const sc = (v === 'c' ? 0.9 : v === 'b' ? 0.78 : 0.92) * [1.0, 0.92, 1.06, 0.96][(i + k) % 4];
      const q = rot(pl, Math.cos(ang) * rr, BED_SOIL, Math.sin(ang) * rr);
      nmgPlant(b, { ...q, yaw: (pl.yaw ?? 0) - ang + (v === 'b' ? Math.PI / 2 : 0.4 * k) }, v as 'a' | 'a_flor' | 'b' | 'c', sc);
    });
  });
  for (const [r, th0] of L.lamps) { const th = coronaTh(th0); nmgLamp(b, { ...(() => { const p = polar(r, th); return { x: p.x, z: p.z }; })(), yaw: -th * D2R }); }   // V5 ART-14 · V10: θ + giro de corona
  { const [r, th0] = L.bench, th = coronaTh(th0); const p = polar(r, th);   // V10: θ + giro de corona
    const bp: Place = { x: p.x, z: p.z, yaw: -th * D2R + Math.PI }; slot('bench', bp);
    b.solid(bp, KIT.bench.w, KIT.bench.seat, KIT.bench.d, 'bench');
    // V5 T5-11 (REV04-013): el respaldo también colisiona (caja fina)
    b.solid(rot(bp, 0, KIT.bench.seat, -KIT.bench.d / 2 + 0.04), KIT.bench.w, KIT.bench.back, 0.08, 'bench_back');
    // V5 (usuario, 12 oct): sentarse en este banco. ANMI a 0,35 m del centro (la tabla queda en el asiento a su derecha),
    // cadera algo por detrás del centro del asiento; mira al frente del banco (+Z local). Zona delante del asiento.
    { const st = rot(bp, 0.35, 0, -0.05); m.anchor('nmg.bench.sit', new THREE.Vector3(st.x, 0, st.z), bp.yaw!);
      const fz = rot(bp, 0.35, 0, 0.85); P.zone('act.benchSit', new THREE.Vector3(fz.x, 0, fz.z), 1.25); }
    proxy('bench', () => { b.box(bp, KIT.bench.w, KIT.bench.seat, KIT.bench.d, { mat: 'wood', collide: false }); b.box(rot(bp, 0, KIT.bench.seat, -KIT.bench.d / 2 + 0.04), KIT.bench.w, KIT.bench.back, 0.08, { mat: 'wood', collide: false }); }); }
  (L.trees as [number, number][]).forEach(([r, th], i) => {   // V10.3 (V-02): los 3 de r 44,5 se quitaron (lista vacía en el kit); las matas sueltas van en islas (islas.ts)
    const p = polar(r, coronaTh(th)); nmgTree(b, { x: p.x, z: p.z, yaw: coronaYaw(i * 1.7) },   // V10: girados con la corona (a r 44,5: ver D-EX-03)
    i % 2 ? 'open' : 'round', i % 2 ? 4.3 : 3.9); });   // V5 ART-13: a su altura medida (tronco corto, copa ancha y baja)
  // franja de vegetación junto al paseo exterior (lectura de la general 01), fuera del carril del bank y del quarter. R6: matas
  // nuevas; la extendida (B) a lo largo del paseo (su eje largo X sigue la tangente: yaw = −θ)
  for (const [r, th0, v, s, dy] of (L.shrubRow ?? []) as [number, number, 'a' | 'a_flor' | 'b' | 'c', number, number][]) { const th = coronaTh(th0), p = polar(r, th); nmgPlant(b, { x: p.x, z: p.z, yaw: -th * D2R + (dy ?? 0) }, v, s); }
  // R6: arbusto floral como ACENTO en el borde exterior, entre los árboles (fuera de recorridos)
  for (const [r, th0, s, dy] of ((L as any).flowerShrubs ?? []) as [number, number, number, number][]) { /* V10 (D-EX-03 revisada): se conservan también fuera de r 42 */ const th = coronaTh(th0), p = polar(r, th); nmgFlowerShrub(b, { x: p.x, z: p.z, yaw: -th * D2R + dy }, s); }

  // ---------------------------------------------------------------- grafiti de suelo en el paseo rosa: pegatinas oficiales del
  // Imaginario (Frame 04, con su borde blanco) en lugar del conejo inventado de la ilustración (GRAF-01)
  for (const [tex, r, th0, size] of (L.floorDecals ?? []) as [string, number, number, number][]) {
    const th = coronaTh(th0), p = polar(r, th); P.floorDecal(tex, p.x, p.z, size, size, -th * D2R + Math.PI, 0.012);   // V10: θ + giro (simétricas respecto al eje nuevo, 45°)
  }

  // ---------------------------------------------------------------- cámaras
  // charla: ¾ delantero desde el lado de la llegada a altura de ojos sentada; Pantera y ANMI en el mismo encuadre
  const cp = rot(seat, -2.3, 0, 3.7);
  m.anchor('cam.pantera', new THREE.Vector3(cp.x, 1.75, cp.z), 0);
  void toPolar;
}
