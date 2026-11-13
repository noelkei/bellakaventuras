// V8 YINYANG (Auditoría 8/plan-v8, revisión 09): piscina de tres niveles con torre T1 sobre P1. Contrato ÚNICO
// `yy_kit.json` + planta v24/T1 v2. La superficie del vaso (suelo N1/N2/N3, rampas R1/R2/R3a/R3b, curva inferior y tramo
// vertical de 0,80 m, escalera E1) la genera `assets/derived/v8/yinyang/build_yy_pool.py` desde esos mismos datos en
// `assets/yy/yy_pool.bin`: los MISMOS triángulos son malla y colisión. Coordenadas del contrato = lámina v24 SIN rotar (x, v, h);
// la rotación de 4° y el marco se aplican UNA vez aquí (`yyWorld`), igual que en la receta (yy_geom.py), y se comprueban con
// las sondas de la cabecera al cargar.
import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import KIT from './yy_kit.json';
import { ASSET_BASE, tex, loadGlb } from '../assets';
import type { Park } from './park';
import type { Place } from './geo';
import { coronaTh, coronaYaw, SECTOR_BY_ID } from './manifest';
import { nmgLamp, nmgFlowerShrub, palm, rot, PROP_SLOTS } from './props';

const D2R = Math.PI / 180;
export const YY_KIT = KIT;

interface GroupRef { offset: number; count: number; type: 'f32' | 'u32' }
export interface YyHeader {
  version: string; frame: string; perimeter_m: number; bytes: number;
  groups: Record<'shell' | 'stairs' | 'coping' | 'deck' | 'stairsCol' | 'stairsSide', Record<string, GroupRef>>;
  removedTiles: [number, number][]; deckBoxes: [number, number, number, number][];
  outlineWorld: [number, number][]; copingWorld: [number, number][]; lipWorld: [number, number][];
  wallRide?: { step: number; vertical: number; cols: string[]; pts: number[][] };
  probes: Record<string, { local: [number, number]; world: [number, number, number]; h: number | null }>;
  inputs: Record<string, string>; stats: Record<string, number>;
}
export let YY: { hdr: YyHeader; bin: ArrayBuffer } | null = null;
/** Carga la geometría del vaso ANTES de construir el parque (la colisión esencial se crea antes de dar el control). */
export async function loadYyPool() {
  let last: unknown = null;
  for (let i = 0; i < 3; i++) {
    try {
      const [hdr, bin] = await Promise.all([
        fetch(`${ASSET_BASE}yy/yy_pool.json`).then((r) => { if (!r.ok) throw new Error(`yy_pool.json ${r.status}`); return r.json(); }),
        fetch(`${ASSET_BASE}yy/yy_pool.bin`).then((r) => { if (!r.ok) throw new Error(`yy_pool.bin ${r.status}`); return r.arrayBuffer(); }),
      ]);
      if (bin.byteLength !== hdr.bytes) throw new Error('yy_pool.bin incompleto');
      if (hdr.version !== KIT.version) throw new Error(`yy_pool ${hdr.version} ≠ contrato ${KIT.version}`);
      YY = { hdr, bin }; return;
    } catch (e) { last = e; await new Promise((r) => setTimeout(r, 400 * (i + 1))); }
  }
  throw last;
}

// ------------------------------------------------------------------ marco (rotación de planta UNA vez + quiralidad del contrato)
export function yyRotate(x: number, v: number): [number, number] {
  const a = KIT.rotation.deg * D2R, [px, pv] = KIT.rotation.pivot, dx = x - px, dv = v - pv;
  return [px + dx * Math.cos(a) - dv * Math.sin(a), pv + dx * Math.sin(a) + dv * Math.cos(a)];
}
export function yyWorld(x: number, v: number, h = 0, out = new THREE.Vector3()) {
  const [xr, vr0] = yyRotate(x, v), vr = vr0 + ((KIT.frame as any).offsetV ?? 0), th = KIT.frame.axis_deg * D2R, s = Math.sin(th), c = Math.cos(th);   // R1 usuario: +1 m hacia fuera
  if (KIT.frame.handedness === 'plan_top_view') out.set(vr * s + xr * c, h, -vr * c + xr * s);
  else out.set(vr * s - xr * c, h, -vr * c - xr * s);
  return out;
}
/** Rumbo three (atan2(dx, dz)) de la dirección local (dx, dv). */
export function yyHeadingOf(dx: number, dv: number) { const o = yyWorld(0, 30), p = yyWorld(dx, 30 + dv); return Math.atan2(p.x - o.x, p.z - o.z); }
export function yyHeadingTo(from: [number, number], to: [number, number]) { const a = yyWorld(from[0], from[1]), b = yyWorld(to[0], to[1]); return Math.atan2(b.x - a.x, b.z - a.z); }
/** Sondas de la cabecera: la conversión de runtime debe dar lo mismo que la receta (contrato único). */
export function yyCheckProbes(): string[] {
  const errs: string[] = []; if (!YY) return ['yy_pool sin cargar'];
  if (KIT.frame.axis_deg !== SECTOR_BY_ID.yinyang.axis) errs.push(`eje del contrato YY ${KIT.frame.axis_deg} ≠ eje del sector ${SECTOR_BY_ID.yinyang.axis} (V10: giro de corona)`);
  if (YY.hdr.frame !== KIT.frame.handedness) errs.push(`yy_pool generado con marco ${YY.hdr.frame} ≠ contrato ${KIT.frame.handedness}`);
  for (const [k, p] of Object.entries(YY.hdr.probes)) { const w = yyWorld(p.local[0], p.local[1]); if (Math.hypot(w.x - p.world[0], w.z - p.world[2]) > 1e-4) errs.push(`sonda ${k} no coincide`); }
  return errs;
}
export const yyRemovedTile = (x: number, z: number) => !!YY?.hdr.removedTiles.some(([a, b]) => Math.abs(a - x) < 1e-6 && Math.abs(b - z) < 1e-6);
export const yyHoleWorld = () => (YY ? YY.hdr.lipWorld : []) as [number, number][];

function arr(g: keyof YyHeader['groups'], k: string) {
  const r = YY!.hdr.groups[g][k]; if (!r) return null;
  return r.type === 'u32' ? new Uint32Array(YY!.bin, r.offset, r.count) : new Float32Array(YY!.bin, r.offset, r.count);
}
function geo(g: keyof YyHeader['groups'], extra: Record<string, [string, number]> = {}) {
  const ge = new THREE.BufferGeometry();
  ge.setAttribute('position', new THREE.BufferAttribute(arr(g, 'position') as Float32Array, 3));
  const n = arr(g, 'normal'); if (n) ge.setAttribute('normal', new THREE.BufferAttribute(n as Float32Array, 3));
  const uv = arr(g, 'uv'); if (uv) ge.setAttribute('uv', new THREE.BufferAttribute(uv as Float32Array, 2));
  for (const [name, [src, w]] of Object.entries(extra)) { const a = arr(g, src); if (a) ge.setAttribute(name, new THREE.BufferAttribute(a as Float32Array, w)); }
  ge.setIndex(new THREE.BufferAttribute(arr(g, 'index') as Uint32Array, 1));
  if (!n) ge.computeVertexNormals();
  ge.computeBoundingSphere(); ge.computeBoundingBox();
  return ge;
}

// ------------------------------------------------------------------ materiales
/** Mural de las paredes: atlas en filas (arco s del borde, profundidad por la superficie desde el labio). */
// R3: medidas ÚNICAS del atlas en el contrato (la receta y el shader no coincidían: tramos sin mural y piezas cortadas)
export const MURAL = { rowLen: KIT.mural.rowLen, rows: KIT.mural.rows, pxPerM: KIT.mural.pxPerM, rowPx: KIT.mural.rowPx, atlas: KIT.mural.atlas as [number, number], band: KIT.mural.band };
const LOGO = (() => {
  const L = KIT.logo, [pw, ph] = L.png, [x0, y0, x1, y1] = L.visiblePx;
  const mpp = L.visibleWidth / (x1 - x0), W = pw * mpp, H = ph * mpp;
  const left = L.K_axis_x - L.K_px * mpp;
  const vcPx = (y0 + y1) / 2, top = L.visibleCenterV + vcPx * mpp;   // fila 0 = arriba (v mayor)
  return { left, bottom: top - H, W, H };
})();
export const YY_LOGO = LOGO;

export function registerYyMaterials(P: Park) {
  const T = (n: string, rep = true) => { const t = tex(`tex/${n}.webp`); if (rep) t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 8; return t; };
  P.mats.set('yy_deck', new THREE.MeshStandardMaterial({ map: T('T_yy_deck'), roughness: 0.93 }));
  P.mats.set('yy_stair', new THREE.MeshStandardMaterial({ map: T('T_yy_stair'), roughness: 0.9 }));
  P.mats.set('yy_coping', new THREE.MeshStandardMaterial({ map: T('T_yy_coping'), roughness: 0.85, polygonOffset: true, polygonOffsetFactor: -2 }));
  // vaso: mosaico menta (planta en el suelo, desarrollo en las paredes) + mural + logo + desgaste, en un solo material
  const tiles = T('T_yy_tiles'), wear = T('T_yy_wear');
  const mural = tex('tex/T_yy_mural.webp'); mural.flipY = false; mural.wrapS = mural.wrapT = THREE.ClampToEdgeWrapping; mural.anisotropy = 8;
  const logo = tex('tex/T_yy_logo.webp'); logo.wrapS = logo.wrapT = THREE.ClampToEdgeWrapping; logo.anisotropy = 8;
  const m = new THREE.MeshStandardMaterial({ map: tiles, roughness: 0.82, metalness: 0 });
  m.name = 'M_yy_shell';
  m.userData.extraTextures = [mural, logo, wear];   // R11 (SIS-23): van por uniforms: la precarga de texturas debe verlas
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, { tMural: { value: mural }, tLogo: { value: logo }, tWear: { value: wear },
      uMural: { value: new THREE.Vector4(MURAL.rowLen, MURAL.rows, MURAL.pxPerM, MURAL.band) }, uAtlas: { value: new THREE.Vector3(MURAL.atlas[0], MURAL.atlas[1], MURAL.rowPx) },
      uLogo: { value: new THREE.Vector4(LOGO.left, LOGO.bottom, LOGO.W, LOGO.H) } });
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute vec2 aPlan; attribute float aCrest; varying vec2 vPlan; varying vec2 vMur; varying vec3 vWN; varying float vCrest;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvPlan = aPlan; vMur = uv; vWN = normal; vCrest = aCrest;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>
varying vec2 vPlan; varying vec2 vMur; varying vec3 vWN; varying float vCrest; uniform sampler2D tMural; uniform sampler2D tLogo; uniform sampler2D tWear;
uniform vec4 uMural; uniform vec3 uAtlas; uniform vec4 uLogo;`)
      .replace('#include <map_fragment>', `
{
  vec3 n = normalize(vWN);
  float flatK = smoothstep(0.45, 0.85, abs(n.y));
  vec4 tA = texture2D(map, vPlan * 0.5);                 // mosaico en planta (textura de 2 m); alfa = esmalte (1) / junta (0)
  vec4 tB = texture2D(map, vec2(vMur.x, -vMur.y) * 0.5); // mosaico desarrollado en pared y curva
  vec4 tt = mix(tB, tA, flatK);
  vec3 col = tt.rgb;
  float tileShade = clamp(dot(tt.rgb, vec3(0.299, 0.587, 0.114)) / 0.80, 0.75, 1.1);
  yyGloss = tt.a;
  vec3 w = texture2D(tWear, vPlan * 0.08).rgb; col *= w * 1.06;   // desgaste de gran escala (12,5 m)
  // mural pintado en la banda de pared
  if (vMur.y < uMural.w) {
    float row = floor(vMur.x / uMural.x);
    vec2 dx = dFdx(vMur), dy = dFdy(vMur);
    vec2 muv = vec2((vMur.x - row * uMural.x) / uMural.x, (row * uAtlas.z + vMur.y * uMural.z) / uAtlas.y);
    vec2 sc = vec2(1.0 / uMural.x, uMural.z / uAtlas.y);
    vec4 mc = textureGrad(tMural, muv, dx * sc, dy * sc);
    // R3: pintura de espray SOBRE el azulejo: toma la sombra de las juntas y el desgaste; mate donde hay pintura
    vec3 paint = mc.rgb * mix(1.0, tileShade, 0.45) * mix(vec3(1.0), w * 1.06, 0.6);
    col = mix(col, paint, mc.a); yyGloss *= 1.0 - mc.a * 0.85;
  }
  // remate crema redondeado en la cresta de cada rampa (las vistas lo marcan como un canto claro)
  col = mix(col, vec3(0.93, 0.88, 0.78) * mix(vec3(1.0), w, 0.5), smoothstep(0.15, 0.85, vCrest));
  // rótulo Bellakaciones pintado a ras del fondo
  vec2 luv = (vPlan - uLogo.xy) / uLogo.zw;
  if (luv.x > 0.0 && luv.x < 1.0 && luv.y > 0.0 && luv.y < 1.0) { vec4 lc = texture2D(tLogo, luv); col = mix(col, lc.rgb * mix(vec3(1.0), w, 0.6), lc.a * 0.96); }
  diffuseColor.rgb *= col;
}`).replace('#include <roughnessmap_fragment>', `float roughnessFactor = mix(roughness, 0.22, yyGloss);   // R3: esmalte brillante, junta y pintura mates`);
    sh.fragmentShader = sh.fragmentShader.replace('void main() {', 'void main() {\n  float yyGloss = 0.0;');
  };
  // clave de programa PROPIA: camfade.ts envuelve onBeforeCompile y, con la clave por defecto (el texto de la función), todos los
  // materiales envueltos comparten programa → este perdía sus uniformes (mural y logo) al reutilizar el de otro material
  m.customProgramCacheKey = () => 'yy_shell_v8';
  P.mats.set('yy_shell', m);
  // T1
  P.mats.set('yy_t1_shaft', new THREE.MeshStandardMaterial({ map: T('T_yy_t1_shaft', false), roughness: 0.9 }));
  P.mats.set('yy_t1_bronze', new THREE.MeshStandardMaterial({ map: T('T_yy_t1_bronze'), color: '#ffffff', roughness: 0.5, metalness: 0.75, envMapIntensity: 0.9 }));
  // R3 usuario: el metal de T1 es metal (acero envejecido), no oro: la luz cálida de la tarde es la que lo dora
  P.mats.set('yy_t1_grille', new THREE.MeshStandardMaterial({ color: '#8f9397', roughness: 0.42, metalness: 0.8, envMapIntensity: 0.9 }));
  { const lt = T('T_yy_lip'); lt.repeat.set(Math.round((YY?.hdr.perimeter_m ?? 57) / 0.8), 1);
    P.mats.set('yy_lip', new THREE.MeshStandardMaterial({ map: lt, color: '#ffffff', roughness: 0.34, metalness: 0.9, envMapIntensity: 1.0 })); }
}

// ------------------------------------------------------------------ constructor
export interface YySlot { piece: 'yy_bench' | 'yy_bin' | 'yy_fountain'; place: Place }
export const YY_SLOTS: YySlot[] = [];

export function buildYinYang(P: Park) {
  if (!YY) throw new Error('yy_pool sin cargar');
  const b = P.b, m = P.manifest, K = KIT, id = 'yinyang' as const;
  const errs = yyCheckProbes(); if (errs.length) console.error('YY', errs);
  // vaso: malla (sin pasar por el lote del Builder: atributos propios) y colisión con los mismos triángulos
  const add = (g: THREE.BufferGeometry, mat: string, name: string, shadow = true) => { const me = new THREE.Mesh(g, P.mats.get(mat)); me.name = name; me.receiveShadow = true; me.castShadow = shadow; me.matrixAutoUpdate = false; P.root.add(me); return me; };
  const shell = add(geo('shell', { aPlan: ['uv1', 2], aCrest: ['crest', 1] }), 'yy_shell', 'YY_SHELL');
  add(geo('stairs'), 'yy_stair', 'YY_STAIRS');
  // R10: paredes laterales de E1 con el material del vaso (azulejo + mural pintado hasta la altura de cada peldaño)
  if (YY.hdr.groups.stairsSide) add(geo('stairsSide', { aPlan: ['uv1', 2], aCrest: ['crest', 1] }), 'yy_shell', 'YY_STAIRS_SIDE');
  add(geo('coping'), 'yy_coping', 'YY_COPING', false);
  // E1: colisión como RAMPA por los peldaños si el contrato lo pide (R1 usuario, como TT V7): la malla visible son peldaños
  const stairsCol = K.stairs?.collision === 'ramp' && YY.hdr.groups.stairsCol ? 'stairsCol' : 'stairs';
  for (const g of ['shell', stairsCol, 'deck'] as const) {
    const pos = arr(g, 'position') as Float32Array, idx = arr(g, 'index') as Uint32Array;
    b.addCollider(RAPIER.ColliderDesc.trimesh(new Float32Array(pos), new Uint32Array(idx)), g === 'stairsCol' ? 'yy_stairs' : `yy_${g}`, g === 'deck' ? 'solid' : 'ramp');
  }
  for (const gname of ['shell', 'stairs']) { const bb = (P.root.getObjectByName(gname === 'shell' ? 'YY_SHELL' : 'YY_STAIRS') as THREE.Mesh).geometry.boundingBox!; b.pieces.push({ chunk: 'yinyang', mat: `yy_${gname}`, name: `yy_${gname}`, min: bb.min.toArray(), max: bb.max.toArray() }); }
  void shell;
  // labio metálico (tubo fino sobre el borde, solo visual)
  { const pts = YY.hdr.lipWorld.map(([x, z]) => new THREE.Vector3(x, -0.012, z)); const curve = new THREE.CatmullRomCurve3(pts, true, 'centripetal');
    // R3 usuario: el canto metálico del borde, más grueso y negro metalizado (cepillado, con desgaste en la arista)
    const tg = new THREE.TubeGeometry(curve, pts.length * 2, 0.044, 10, true); const me = new THREE.Mesh(tg, P.mats.get('yy_lip')); me.name = 'YY_LIP'; me.receiveShadow = true; me.castShadow = false; P.root.add(me); }

  // ---------------------------------------------------------------- T1 sobre P1
  const c1 = yyWorld(K.p1.center[0], K.p1.center[1]);
  const frontYaw = yyHeadingOf(0, -1);   // frente (lado alto, rejilla) hacia N3
  const t1 = buildT1(P); t1.position.copy(c1); t1.rotation.y = frontYaw; P.root.add(t1); t1.updateMatrixWorld(true);
  b.addCollider(RAPIER.ColliderDesc.cylinder(K.t1.height / 2, K.t1.r).setTranslation(c1.x, K.t1.height / 2, c1.z), 'yy_t1', 'solid');
  P.muralMesh = t1.getObjectByName('YY_T1_GraffitiTarget') as THREE.Mesh;
  m.anchor('yy.t1', c1, frontYaw);

  // ---------------------------------------------------------------- actividad: rana + grafiti en el frente de T1
  const A = K.activity, F = K.frog;
  const paint = yyWorld(A.paintSpot[0], A.paintSpot[1]);
  m.anchor('mural.paint', paint, yyHeadingTo(A.paintSpot as [number, number], K.p1.center as [number, number]));
  m.anchor('cam.mural', yyWorld(A.cam[0], A.cam[1], A.cam[2]), 0);
  m.anchor('mural.center', yyWorld(A.camLook[0], A.camLook[1], A.camLook[2]), 0);
  m.anchor('cam.rana.celebrate', yyWorld(A.celebrateCam[0], A.celebrateCam[1], A.celebrateCam[2]), 0);
  const home = yyWorld(F.home[0], F.home[1]);
  m.anchor('npc.rana', home, yyHeadingTo(F.home as [number, number], F.faceTo as [number, number]));
  m.anchor('rana.watch', yyWorld(F.watch[0], F.watch[1]), yyHeadingTo(F.watch as [number, number], A.paintSpot as [number, number]));
  // camino de la rana por el anillo de P1 (lado derecho), de su sitio al de mirar
  { const [cx, cv] = K.p1.center, R = F.ringR;
    const route = [180, 150, 120, 90, 65].map((ph) => yyWorld(cx + R * Math.sin(ph * D2R), cv - R * Math.cos(ph * D2R)));
    route.forEach((p, i) => m.anchor(`rana.route.${i}`, p, 0)); }
  P.zone('act.graffiti', home, A.talkZoneR, -0.4, 0.9);

  // ---------------------------------------------------------------- premios, cassette y punto seguro
  const PK = K.pickups;
  const fryAt = (k: 'visible' | 'medium' | 'hidden' | 'activity', ret: string) => { const q = PK[k].p; P.fry(id, k, yyWorld(q[0], q[1], q[2]), PK[k].access as any, PK[k].hint, ret); };
  fryAt('visible', 'Subir por la escalera E1');
  fryAt('medium', 'Bajar del banco al deck');
  // R11 (YY-08): su acceso es «ollie»: hay que subirse al banco o saltar a su lado (antes se recogía pasando por al lado)
  { const f = P.manifest.fries[P.manifest.fries.length - 1]; f.reach = [0.25, 1.6]; }
  fryAt('hidden', 'Subir por R3b a N1 y salir por E1 (o por arriba pulsando ↑ en un aire de pared)');
  fryAt('activity', 'P1 a cota 0');
  const cas = yyWorld(K.cassette.p[0], K.cassette.p[1]);
  const casYaw = yyHeadingTo(K.cassette.p as [number, number], [K.cassette.p[0], 25] as [number, number]);   // mira al paseo interior
  m.cassettes.push({ zone: id, pos: cas, heading: casYaw });
  b.box({ x: cas.x, z: cas.z, yaw: casYaw }, K.cassette.plinth[0], K.cassette.plinth[1], K.cassette.plinth[2], { mat: 'yy_stair', name: 'plinth' });
  m.checkpoints.push({ id: 'cp.yinyang', zone: id, pos: yyWorld(K.checkpoint.p[0], K.checkpoint.p[1]), heading: yyHeadingTo(K.checkpoint.p as [number, number], K.checkpoint.faceTo as [number, number]) });

  // ---------------------------------------------------------------- mobiliario M01 (GLB en loadYyProps) y farolas existentes
  const along = yyHeadingOf(1, 0);   // largo del banco paralelo a x local (≈ paseo exterior)
  (K.props.bench as number[][]).forEach(([x, v, extra], bi) => {
    const p = yyWorld(x, v);
    // R8 usuario: el frente del banco (+Z local) mira al centro de la guitarra (lampAim); si no, eje X ∥ x local como antes
    const aimB = K.props.benchAim ? yyWorld(...(K.props.lampAim as [number, number])) : null;
    const yaw = aimB ? Math.atan2(aimB.x - p.x, aimB.z - p.z) : along - Math.PI / 2 + (extra ?? 0) * D2R;
    if (aimB) {   // papelera junto al banco, en el extremo más lejos del vaso
      const c1 = rot({ x: p.x, z: p.z, yaw }, 1.2, 0, 0), c2 = rot({ x: p.x, z: p.z, yaw }, -1.2, 0, 0);
      // V10: «más lejos del vaso» se mide contra el centro del vaso (antes contra lampAim, al que el banco mira de frente: empate exacto
      // resuelto por ruido de coma flotante, que cambiaba de lado al girar la corona). Mismo lado que V9 en los dos bancos.
      const pc = yyWorld(0, 30.5), q = Math.hypot(c1.x - pc.x, c1.z - pc.z) > Math.hypot(c2.x - pc.x, c2.z - pc.z) ? c1 : c2;
      YY_SLOTS.push({ piece: 'yy_bin', place: { x: q.x, z: q.z, yaw } });
      b.addCollider(RAPIER.ColliderDesc.cylinder(0.375, 0.23).setTranslation(q.x, 0.375, q.z), 'yy_bin', 'small');
    }
    YY_SLOTS.push({ piece: 'yy_bench', place: { x: p.x, z: p.z, yaw } });
    b.solid({ x: p.x, z: p.z, yaw }, 1.8, 0.45, 0.45, 'yy_bench');   // banco macizo: colisión de su caja (aspecto: GLB M01)
    // R4 usuario: sentarse como en el banco de NO ME GUILLO (mismo asiento a 0,45 m): ANMI a 0,35 m del centro, mirando al vaso
    const c = yyWorld(0, 30.5), fwd0 = new THREE.Vector3(Math.sin(yaw), 0, Math.cos(yaw)), toPool = c.clone().sub(new THREE.Vector3(p.x, 0, p.z));
    const sy = fwd0.dot(toPool) >= 0 ? yaw : yaw + Math.PI, sp: Place = { x: p.x, z: p.z, yaw: sy };
    const st = rot(sp, 0.35, 0, 0.0); m.anchor(`yy.bench.sit.${bi}`, new THREE.Vector3(st.x, 0, st.z), sy);
    const fz = rot(sp, 0.35, 0, 0.8); P.zone(`act.benchSit.yy${bi}`, new THREE.Vector3(fz.x, 0, fz.z), 1.2);
  });
  if (!K.props.benchAim) for (const [x, v] of K.props.bin as number[][]) {
    const p = yyWorld(x, v); YY_SLOTS.push({ piece: 'yy_bin', place: { x: p.x, z: p.z, yaw: along } });
    const c = b.addCollider(RAPIER.ColliderDesc.cylinder(0.375, 0.23).setTranslation(p.x, 0.375, p.z), 'yy_bin', 'small'); void c;
  }
  for (const [x, v] of K.props.fountain as number[][]) {
    const p = yyWorld(x, v); YY_SLOTS.push({ piece: 'yy_fountain', place: { x: p.x, z: p.z, yaw: yyHeadingOf(0, -1) } });
    const c = b.addCollider(RAPIER.ColliderDesc.cylinder(0.475, 0.2).setTranslation(p.x, 0.475, p.z), 'yy_fountain', 'small'); b.thin.add(c.handle);
  }
  // R7 usuario: la cabeza de cada farola (eje +X local de nmgLamp) apunta al centro de la guitarra, entre T1 y la K del rótulo
  { const aim = yyWorld(...(K.props.lampAim as [number, number]));
    for (const [x, v] of K.props.lamp as number[][]) { const p = yyWorld(x, v), dx = aim.x - p.x, dz = aim.z - p.z; nmgLamp(b, { x: p.x, z: p.z, yaw: Math.atan2(-dz, dx) }); } }
  // vegetación facetada reutilizada (familia NMG): palmeras y arbustos floridos fuera del paseo exterior y en los extremos del deck
  const veg0 = PROP_SLOTS.length;
  // (rendimiento V8: dos familias —palmera recta NMG y arbusto florido— en mallas propias del grupo `yy`; arbustos sin sombra)
  // V10.3 (V-02, usuario): las 13 de fuera (r 43–45, sobre el turquesa) se QUITAN; antes palmeras y arbustos floridos (D-EX-03 obsoleta)
  const VEG: [number, number, 'palm' | 'flor', number][] = [];
  for (const [th0, r, kind, sc] of VEG) {   // V10 (D-EX-03 revisada): las que están a r 43–45 se CONSERVAN (renders aprobados; §08-B: conciliar por instancia)
    const th = coronaTh(th0), t = th * D2R, p = { x: r * Math.sin(t), z: -r * Math.cos(t), yaw: coronaYaw(th0 * 0.7) };   // V10: θ literal + giro de corona (a r 43–45: ver D-EX-03)
    if (kind === 'palm') palm(b, p, sc, 0.08, Math.round(th), true); else nmgFlowerShrub(b, p, sc);
  }
  for (let i = veg0; i < PROP_SLOTS.length; i++) { const sl = PROP_SLOTS[i]; sl.group = 'yy'; if (sl.kind === 'nmg_palm_lean') sl.kind = 'nmg_palm_straight'; }
}

/** M01 (assets/derived/v8/yinyang/props, Blender nativo): una instancia por hueco en un contenedor (lección T5-03: el nodo
 *  optimizado conserva su TRS). Si el GLB falla quedan proxies simples (la colisión no depende del aspecto). */
export async function loadYyProps(P: Park) {
  const group = new THREE.Group(); group.name = 'YY_PROPS';
  try {
    const gltf = await loadGlb('yy/yy_props.glb'); gltf.scene.updateMatrixWorld(true);
    // una malla INSTANCIADA por primitiva y tipo (pocas llamadas de dibujo); el nodo conserva su TRS (lección T5-03)
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0), one = new THREE.Vector3(1, 1, 1);
    for (const piece of ['yy_bench', 'yy_bin', 'yy_fountain'] as const) {
      const slots = YY_SLOTS.filter((x) => x.piece === piece); if (!slots.length) continue;
      const src = gltf.scene.getObjectByName(piece); if (!src) throw new Error(`pieza ${piece} ausente`);
      src.traverse((o: any) => { if (!o.isMesh) return;
        const im = new THREE.InstancedMesh(o.geometry, o.material, slots.length); im.name = `YY_${piece}`; im.castShadow = true; im.receiveShadow = true;
        slots.forEach((sl, i) => { m4.compose(new THREE.Vector3(sl.place.x, 0, sl.place.z), q.setFromAxisAngle(up, sl.place.yaw ?? 0), one).multiply(o.matrixWorld); im.setMatrixAt(i, m4); });
        im.computeBoundingSphere(); group.add(im); });
    }
    P.root.add(group); return { ok: true, pieces: YY_SLOTS.length };
  } catch (e: any) {
    console.warn('mobiliario YY no disponible (proxies)', e);
    for (const s of YY_SLOTS) {
      const g = s.piece === 'yy_bench' ? new THREE.BoxGeometry(1.8, 0.45, 0.45) : new THREE.CylinderGeometry(s.piece === 'yy_bin' ? 0.23 : 0.2, s.piece === 'yy_bin' ? 0.23 : 0.2, s.piece === 'yy_bin' ? 0.75 : 0.95, 12);
      g.translate(0, s.piece === 'yy_bench' ? 0.225 : s.piece === 'yy_bin' ? 0.375 : 0.475, 0);
      const me = new THREE.Mesh(g, P.mats.get(s.piece === 'yy_fountain' ? 'steel' : s.piece === 'yy_bin' ? 'violet' : 'cream'));
      me.position.set(s.place.x, 0, s.place.z); me.rotation.y = s.place.yaw ?? 0; group.add(me);
    }
    P.root.add(group); return { ok: false, pieces: 0, error: String(e?.message ?? e) };
  }
}

// ------------------------------------------------------------------ T1 procedural (dimensiones-t1.json; local three: frente +Z)
function buildT1(P: Park) {
  const T = KIT.t1, g = new THREE.Group(); g.name = 'YY_T1';
  const mesh = (ge: THREE.BufferGeometry, mat: string, name: string, shadow = true) => { const me = new THREE.Mesh(ge, P.mats.get(mat)); me.name = name; me.castShadow = shadow; me.receiveShadow = true; g.add(me); return me; };
  // fuste blanco Ø2 hasta 4,80 (u = 0 detrás → frente en u = 0,5; v hacia arriba)
  { const ge = new THREE.CylinderGeometry(T.r, T.r, T.shaftTop, 72, 6, true, Math.PI, Math.PI * 2); ge.translate(0, T.shaftTop / 2, 0); mesh(ge, 'yy_t1_shaft', 'YY_T1_Shaft'); }
  // cabeza: envolvente completa r 0,985 de 4,80 al plano y = 6,60 + z (frente +Z alto); banda blanca hasta 5,60 y metal por encima
  const cut = (z: number) => T.cutCenter + z;   // plano a 45° (Blender z = 6,60 − y; y_blender = −z_three)
  const ring = (y0: (a: number) => number, y1: (a: number) => number, r: number, seg = 96) => {
    const pos: number[] = [], uv: number[] = [], idx: number[] = [];
    for (let i = 0; i <= seg; i++) { const a = Math.PI + (i / seg) * Math.PI * 2, x = r * Math.sin(a), z = r * Math.cos(a);
      pos.push(x, y0(z), z, x, y1(z), z); uv.push(i / seg * 6.19, y0(z), i / seg * 6.19, y1(z)); }
    for (let i = 0; i < seg; i++) { const k = i * 2; idx.push(k, k + 2, k + 1, k + 1, k + 2, k + 3); }
    const ge = new THREE.BufferGeometry(); ge.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); ge.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); ge.setIndex(idx); ge.computeVertexNormals(); return ge;
  };
  if (T.whiteTop > T.shaftTop + 1e-3) mesh(ring(() => T.shaftTop, () => T.whiteTop, T.headR), 'cream', 'YY_T1_HeadShell_white', false);   // R2 usuario: sin tramo blanco
  mesh(ring(() => T.whiteTop, (z) => cut(z), T.headR), 'yy_t1_bronze', 'YY_T1_HeadShell');
  // tapa inclinada ENTERA: disco en planta (x² + z² ≤ r²) sobre el plano; elíptica en el plano
  { const seg = 96, pos: number[] = [0, cut(0), 0], uv: number[] = [0.5, 0.5], idx: number[] = [];
    for (let i = 0; i <= seg; i++) { const a = (i / seg) * Math.PI * 2, x = T.headR * Math.cos(a), z = T.headR * Math.sin(a); pos.push(x, cut(z), z); uv.push(0.5 + x / 2, 0.5 + z * Math.SQRT2 / 2); }
    for (let i = 1; i <= seg; i++) idx.push(0, i + 1, i);
    const ge = new THREE.BufferGeometry(); ge.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); ge.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); ge.setIndex(idx); ge.computeVertexNormals();
    if (ge.attributes.normal.getY(0) < 0) { const ix = ge.index!; for (let k = 0; k < ix.count; k += 3) { const t = ix.getX(k + 1); ix.setX(k + 1, ix.getX(k + 2)); ix.setX(k + 2, t); } ge.computeVertexNormals(); }
    mesh(ge, 'yy_t1_bronze', 'YY_T1_InclinedCap', false); }
  // rejilla frontal: 33 medias barras horizontales (Ø16 mm) + aro superior + 4 montantes
  { const parts: THREE.BufferGeometry[] = [];
    for (let k = 0; k < T.grille.n; k++) { const t = new THREE.TorusGeometry(T.grille.r, T.grille.bar / 2, 4, 40, Math.PI); t.rotateX(Math.PI / 2); /* arco en z ≥ 0 = FRENTE (lado alto) */ t.translate(0, T.grille.z0 + T.grille.pitch * k, 0); parts.push(t); }
    { const t = new THREE.TorusGeometry(T.grille.rimR + 0.01, T.grille.rimD / 2, 6, 48, Math.PI); t.rotateX(Math.PI / 2); t.translate(0, T.grille.rimZ, 0); parts.push(t); }
    for (const ab of T.posts.anglesBlender) { const a = ab * D2R, x = T.posts.r * Math.cos(a), z = -T.posts.r * Math.sin(a);
      const c = new THREE.CylinderGeometry(T.posts.d / 2, T.posts.d / 2, T.posts.z[1] - T.posts.z[0], 6); c.translate(x * 1.01, (T.posts.z[0] + T.posts.z[1]) / 2, z * 1.01); parts.push(c); }
    const merged = mergeGeos(parts); mesh(merged, 'yy_t1_grille', 'YY_T1_Grille', false); }
  // capa del grafiti de la actividad (independiente de la decoración T02 del fuste): arco ±60° del frente
  { const A = KIT.activity.target, H = A.h1 - A.h0;
    const ge = new THREE.CylinderGeometry(A.r, A.r, H, 48, 1, true, -A.arcDeg / 2 * D2R, A.arcDeg * D2R); ge.translate(0, A.h0 + H / 2, 0);
    const mt = new THREE.MeshStandardMaterial({ map: tex('tex/T_yy_stencil.webp'), transparent: true, alphaTest: 0.02, roughness: 0.88, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 });
    const me = new THREE.Mesh(ge, mt); me.name = 'YY_T1_GraffitiTarget'; me.receiveShadow = true; me.renderOrder = 1; g.add(me); }
  return g;
}

function mergeGeos(gs: THREE.BufferGeometry[]) {
  const pos: number[] = [], nor: number[] = [], idx: number[] = []; let off = 0;
  for (const g0 of gs) { const g = g0.index ? g0 : g0; const p = g.attributes.position, n = g.attributes.normal;
    for (let i = 0; i < p.count; i++) { pos.push(p.getX(i), p.getY(i), p.getZ(i)); nor.push(n.getX(i), n.getY(i), n.getZ(i)); }
    if (g.index) for (let i = 0; i < g.index.count; i++) idx.push(g.index.getX(i) + off); else for (let i = 0; i < p.count; i++) idx.push(i + off);
    off += p.count; }
  const ge = new THREE.BufferGeometry(); ge.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); ge.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3)); ge.setIndex(idx); return ge;
}
