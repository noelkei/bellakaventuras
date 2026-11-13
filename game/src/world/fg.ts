// V6 FASHION GIRL (Auditoría 6/plan-v6, revisión 07): conjunto continuo deck → U → pista de baile sobre un eje, pista
// rosa sobre trapecio 3D, cuñas enfrentadas, túnel ciego de 5 m bajo el deck con pozo de acceso, ledge con radiocasete,
// soporte de tablas, equipo (speakers, pórtico, focos, road case) y farolillos en los paseos rosas. Contrato ÚNICO
// `fg_kit.json`: cada pieza genera su malla Y su colisión desde la misma función (no hay copia de números).
// Marco de planta v10: W radial hacia fuera, S tangente desde el deck hacia la pista. En coordenadas locales three de las
// mallas: x = W, y = altura, z = −S (yaw del marco = 90° − θ). Las mallas estáticas van al lote del Builder (trozo
// `fashion_girl`); el interior del túnel lleva color por vértice (luz de la boca horneada) y va como malla propia.
import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import KIT from './fg_kit.json';
import { polar, coronaTh, coronaYaw } from './manifest';
import type { Place } from './geo';
import { speaker, rot } from './props';
import { tex } from '../assets';
import type { Park, OBox } from './park';

const D2R = Math.PI / 180;
export const FG_KIT = KIT;
/** Piezas del atrezzo Blender (`fg/fg_props.glb`, receta assets/derived/v6/fashion_girl/build_fg_props.py) y su colocación;
 *  `pitch` = inclinación de la cabeza del foco. Park.loadFgProps las instancia y oculta los proxies `proxy_fgprops_<pieza>`. */
export interface FgSlot { piece: string; place: Place; pitch?: number }
export const FG_SLOTS: FgSlot[] = [];

/** Marco de la planta v10. `V(w, s, h)` punto del mundo; `P(w, s, h)` colocación con el rumbo del marco (x local = W). */
export function fgFrame() {
  // V10: el marco (θ del contrato, orientación V3–V9) gira con la corona: 108° → 117°
  const th = coronaTh(KIT.origin.theta) * D2R, O = polar(KIT.origin.r, coronaTh(KIT.origin.theta));
  const W = new THREE.Vector3(Math.sin(th), 0, -Math.cos(th)), S = new THREE.Vector3(-Math.cos(th), 0, -Math.sin(th));
  const yaw = Math.PI / 2 - th;
  const V = (w: number, s: number, h = 0) => new THREE.Vector3(O.x + W.x * w + S.x * s, h, O.z + W.z * w + S.z * s);
  const P = (w: number, s: number, h = 0, yawOff = 0): Place => { const v = V(w, s, h); return { x: v.x, y: h, z: v.z, yaw: yaw + yawOff }; };
  /** Rumbo three (atan2(dx, dz)) de una dirección del marco (dw, ds). */
  const heading = (dw: number, ds: number) => Math.atan2(W.x * dw + S.x * ds, W.z * dw + S.z * ds);
  const base: Place = { x: O.x, y: 0, z: O.z, yaw };
  return { O, W, S, yaw, V, P, heading, base };
}

// ------------------------------------------------------------------ perfiles (funciones puras, compartidas malla/colisión)
// R2 (13 oct): deck a 1,8 m y pista a 1,0 m → la U tiene dos extremos distintos: drop-in desde el deck (labio `lipDeck`,
// casi vertical) y subida a la zona de entrada (labio `lipStage` 45°, se sale andando)
const U = KIT.u, DK = KIT.deck;
const RISE_D = DK.h - U.floor, R_D = RISE_D / (1 - Math.cos(U.lipDeck * D2R)), RUN_D = R_D * Math.sin(U.lipDeck * D2R);
const RISE_S = U.h - U.floor, R_S = RISE_S / (1 - Math.cos(U.lipStage * D2R)), RUN_S = R_S * Math.sin(U.lipStage * D2R);
const R_SIDE = U.side.R, SIDE_RISE = U.side.top - U.floor, SIDE_ANG = Math.acos(1 - SIDE_RISE / R_SIDE), RUN_SIDE = R_SIDE * Math.sin(SIDE_ANG);
const circ = (R: number, d: number) => R - Math.sqrt(Math.max(R * R - d * d, 0));
/** Transición del lado del deck (drop-in) en s. */
function uDeck(s: number) { const a = U.s0 + RUN_D; return s <= a ? U.floor + circ(R_D, Math.min(RUN_D, a - s)) : U.floor; }
/** Altura del extremo de la U (transición longitudinal) en s. */
export function uEnd(s: number) {
  const b = U.s1 - RUN_S;
  if (s >= b) return U.floor + circ(R_S, Math.min(RUN_S, s - b));
  return uDeck(s);
}
/** Coronación de los muros laterales: 1,0 m salvo junto al deck, donde acompañan al drop-in hasta su altura. */
export function uWallTop(s: number) { return Math.max(U.h, uDeck(s)); }
/** Altura de la transición lateral de la U en w. */
export function uSide(w: number) {
  const d = Math.abs(w) - (U.inner - RUN_SIDE);
  return d > 0 ? U.floor + circ(R_SIDE, Math.min(RUN_SIDE, d)) : U.floor;
}
/** Superficie de la U (pool): máximo de las dos transiciones. */
export function uHeight(w: number, s: number) { return Math.max(uEnd(s), uSide(w)); }
/** Longitud de arco desde el centro (UV en metros sobre las curvas). */
function arcEnd(s: number) {
  const a = U.s0 + RUN_D, b = U.s1 - RUN_S;
  if (s < a) { const d = Math.min(RUN_D, a - s); return a - R_D * Math.asin(Math.min(1, d / R_D)); }
  if (s > b) { const d = Math.min(RUN_S, s - b); return b + R_S * Math.asin(Math.min(1, d / R_S)); }
  return s;
}
function arcSide(w: number) {
  const k = U.inner - RUN_SIDE, d = Math.abs(w) - k;
  return d > 0 ? Math.sign(w) * (k + R_SIDE * Math.asin(Math.min(1, Math.min(RUN_SIDE, d) / R_SIDE))) : w;
}
/** Suelo del túnel (pozo, boca y rampa interior) en w. */

// ------------------------------------------------------------------ acumulador de geometría (x = w, y, z = −s)
class Geo {
  pos: number[] = []; uv: number[] = []; col: number[] = []; idx: number[] = [];
  constructor(public colorFn: ((w: number, y: number, s: number) => number) | null = null) {}
  vtx(w: number, y: number, s: number, u: number, v: number) {
    this.pos.push(w, y, -s); this.uv.push(u, v);
    if (this.colorFn) { const c = this.colorFn(w, y, s); this.col.push(c, c, c); }
    return this.pos.length / 3 - 1;
  }
  /** Cuadrilátero a-b-c-d (orden cualquiera alrededor); `nrm` orienta la cara (normal deseada en coordenadas w, y, s). */
  quad(a: number[], b: number[], c: number[], d: number[], uvs: number[][], nrm: [number, number, number]) {
    const i = [a, b, c, d].map((p, k) => this.vtx(p[0], p[1], p[2], uvs[k][0], uvs[k][1]));
    this.tri(i[0], i[1], i[2], nrm); this.tri(i[0], i[2], i[3], nrm);
  }
  /** Triángulo con la orientación de `nrm` (w, y, s). */
  tri(i0: number, i1: number, i2: number, nrm: [number, number, number]) {
    const P = this.pos, p = (i: number) => new THREE.Vector3(P[i * 3], P[i * 3 + 1], P[i * 3 + 2]);
    const n = p(i1).sub(p(i0)).cross(p(i2).sub(p(i0)));
    const want = new THREE.Vector3(nrm[0], nrm[1], -nrm[2]);
    if (n.dot(want) < 0) this.idx.push(i0, i2, i1); else this.idx.push(i0, i1, i2);
  }
  /** Rectángulo vertical o plano con UV en metros: `axis` = 'w' | 's' | 'y' (normal), en `at`; rangos u y v. */
  rect(axis: 'w' | 's' | 'y', at: number, r1: [number, number], r2: [number, number], sign: 1 | -1, uvScale = 1, uvOff: [number, number] = [0, 0]) {
    const [a0, a1] = r1, [b0, b1] = r2, k = uvScale, [ou, ov] = uvOff;
    if (axis === 'w') this.quad([at, b0, a0], [at, b0, a1], [at, b1, a1], [at, b1, a0], [[a0 * k + ou, b0 * k + ov], [a1 * k + ou, b0 * k + ov], [a1 * k + ou, b1 * k + ov], [a0 * k + ou, b1 * k + ov]], [sign, 0, 0]);
    else if (axis === 's') this.quad([a0, b0, at], [a1, b0, at], [a1, b1, at], [a0, b1, at], [[a0 * k + ou, b0 * k + ov], [a1 * k + ou, b0 * k + ov], [a1 * k + ou, b1 * k + ov], [a0 * k + ou, b1 * k + ov]], [0, 0, sign]);
    else this.quad([a0, at, b0], [a1, at, b0], [a1, at, b1], [a0, at, b1], [[a0 * k + ou, b0 * k + ov], [a1 * k + ou, b0 * k + ov], [a1 * k + ou, b1 * k + ov], [a0 * k + ou, b1 * k + ov]], [0, sign, 0]);
  }
  build(smooth = false) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    if (this.colorFn) g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    g.setIndex(this.idx);
    g.computeVertexNormals(); void smooth;
    return g;
  }
}

/** Muestras ordenadas en [a, b] con paso `fine` dentro de los tramos `dense` y `coarse` fuera. */
function samples(a: number, b: number, dense: [number, number][], fine: number, coarse: number) {
  const out = new Set<number>([a, b]);
  for (let x = a; x < b; x += coarse) out.add(+x.toFixed(4));
  for (const [d0, d1] of dense) for (let x = Math.max(a, d0); x <= Math.min(b, d1) + 1e-9; x += fine) out.add(+x.toFixed(4));
  for (const [d0, d1] of dense) { if (d0 > a && d0 < b) out.add(d0); if (d1 > a && d1 < b) out.add(d1); }
  return [...out].sort((x, y) => x - y);
}

// ------------------------------------------------------------------ materiales FG (texturas propias con respaldo de color)
function fgMaterials(P: Park) {
  const M = P.mats;
  const T = (n: string) => { const t = tex(`tex/${n}.webp`); return t; };
  const std = (k: string, o: THREE.MeshStandardMaterialParameters) => { try { M.get(k); } catch { M.set(k, new THREE.MeshStandardMaterial(o)); } };
  std('fg_panel', { map: T('T_fg_panel'), roughness: 0.92 });         // hormigón del interior del túnel (el usuario lo quiere como estaba)
  // R3 (usuario): zona de skate (deck, U, entrada, ledge) con el hormigón pintado de los módulos de NMG (receta NMG V5)
  { const side = T('T_fg_sk_side'); side.repeat.set(1 / 2, 1);         // paredes: 4 m × 2 m por repetición (UV 0,5/m)
    std('fg_sk_side', { map: side, roughness: 0.9 }); }
  std('fg_sk_top', { map: T('T_fg_sk_top'), roughness: 0.9 });
  std('fg_sk_bowl', { map: T('T_fg_sk_bowl'), roughness: 0.88 });
  std('fg_pink_tile', { map: T('T_fg_pink_tile'), roughness: 0.78 }); // baldosa rosa mate del tablero
  std('fg_wedge', { map: T('T_fg_wedge'), roughness: 0.82 });         // caras rosas de las cuñas (mural con logos del Imaginario)
  std('fg_coping', { color: '#1d1b22', roughness: 0.42, metalness: 0.65 });
  // R2: acero galvanizado de skatepark (barandillas, escalera, cantoneras): claro y poco metálico (no hay mapa de entorno)
  std('fg_steel', { color: '#b9bec5', roughness: 0.26, metalness: 0.85, envMapIntensity: 0.75 });   // R3: inox pulido; game.ts le da un mapa de entorno (reflejos)
  std('fg_lamp_glow', { color: '#ffe2a8', emissive: '#ffbf66', emissiveIntensity: 2.2, roughness: 0.4 });
  std('fg_spot_glow', { color: '#ff9ad6', emissive: '#ff3fae', emissiveIntensity: 1.6, roughness: 0.3 });
  return M;
}

// ------------------------------------------------------------------ construcción
export function buildFashionGirl(P: Park) {
  FG_SLOTS.length = 0;
  const b = P.b, m = P.manifest, id = 'fashion_girl' as const;
  const slot = (piece: string, place: Place, draw: () => void, pitch?: number) => {
    FG_SLOTS.push({ piece, place, pitch }); const c = b.chunk; b.chunk = `proxy_fgprops_${piece}`; try { draw(); } finally { b.chunk = c; } };
  const F = fgFrame(), base = F.base;
  fgMaterials(P);
  P.danceFloorMat = P.mats.get('fg_spot_glow') as THREE.MeshStandardMaterial;   // pulso del baile en las lentes de los focos
  const D = KIT.deck, ST = KIT.stage, WD = KIT.wedges;   // (DK = D)
  const solidL = (w0: number, w1: number, s0: number, s1: number, y0: number, y1: number, name: string, kind = 'solid') =>
    b.solid(F.P((w0 + w1) / 2, (s0 + s1) / 2, y0), w1 - w0, y1 - y0, s1 - s0, name, kind);
  const cop = new THREE.CylinderGeometry(1, 1, 1, 10); cop.rotateZ(Math.PI / 2);
  const pipe = (w0: number, s0: number, w1: number, s1: number, y: number, r: number, mat = 'fg_steel') => {
    const g2 = cop.clone(); const L = Math.hypot(w1 - w0, s1 - s0); g2.scale(L, r, r);
    g2.rotateY(-Math.atan2(-(s1 - s0), w1 - w0)); g2.translate((w0 + w1) / 2, y, -(s0 + s1) / 2);
    b.decor(g2, base, mat, { shadow: false });
  };
  const hull = (pts: number[][], name: string, kind = 'ramp') => {
    const arr = new Float32Array(pts.flatMap(([w, y, s]) => { const v = F.V(w, s, y); return [v.x, y, v.z]; }));
    return b.addCollider(RAPIER.ColliderDesc.convexHull(arr)!, name, kind);
  };

  // ================================================================ U (pool) + zona plana de entrada (R2)
  const LD = KIT.landing;
  { const ws = samples(-U.inner, U.inner, [[-U.inner, -U.inner + RUN_SIDE + 0.05], [U.inner - RUN_SIDE - 0.05, U.inner]], 0.09, 0.45);
    const ss = samples(U.s0, U.s1, [[U.s0, U.s0 + RUN_D + 0.05], [U.s1 - RUN_S - 0.05, U.s1]], 0.08, 0.5);
    const g = new Geo(), nw = ws.length;
    for (const s of ss) for (const w of ws) g.vtx(w, uHeight(w, s), s, arcSide(w) * 0.5, arcEnd(s) * 0.5);
    for (let j = 0; j < ss.length - 1; j++) for (let i = 0; i < nw - 1; i++) {
      const a = j * nw + i, c = a + nw;
      g.tri(a, a + 1, c + 1, [0, 1, 0]); g.tri(a, c + 1, c, [0, 1, 0]);
    }
    const geo = g.build(true);
    b.decor(geo, base, 'fg_sk_bowl', { name: 'fg_u' });
    b.trimesh(geo, base, 'fg_u', 'ramp');
    // muros laterales: cara interior (superficie → coronación variable), coronación y cara exterior (deck + U + entrada)
    const wl = new Geo(), sv = samples(U.s0, U.s1, [[U.s0, U.s0 + RUN_D], [U.s1 - RUN_S, U.s1]], 0.08, 0.5);
    for (const sg of [-1, 1] as const) {
      const wi = sg * U.inner, wo = sg * (U.inner + U.wall);
      for (let k = 0; k < sv.length - 1; k++) {
        const s0 = sv[k], s1 = sv[k + 1], h0 = uHeight(wi, s0), h1 = uHeight(wi, s1), t0 = uWallTop(s0), t1 = uWallTop(s1);
        if (t0 - h0 > 1e-3 || t1 - h1 > 1e-3) wl.quad([wi, h0, s0], [wi, h1, s1], [wi, t1, s1], [wi, t0, s0], [[s0 * 0.5, h0 * 0.5], [s1 * 0.5, h1 * 0.5], [s1 * 0.5, t1 * 0.5], [s0 * 0.5, t0 * 0.5]], [-sg, 0, 0]);
      }
      solidL(Math.min(wi, wo), Math.max(wi, wo), U.s0, U.s1, 0, U.h, 'fg_u_wall');
      // tramo junto al deck donde el muro acompaña al drop-in (láminas conservadoras)
      for (let s0 = U.s0; s0 < U.s0 + RUN_D; s0 += 0.1) { const t = uWallTop(s0); if (t > U.h + 0.01) solidL(Math.min(wi, wo), Math.max(wi, wo), s0, s0 + 0.1, U.h, t, 'fg_u_wall'); }
    }
    b.decor(wl.build(), base, 'fg_sk_bowl', { name: 'fg_u_inner_wall' });
    const prof = (s: number) => (s < U.s0 ? DK.h : s <= U.s1 ? uWallTop(s) : LD.h);   // coronación exterior a lo largo del eje
    const so = samples(DK.s0, LD.s1, [[U.s0 - 0.01, U.s0 + RUN_D]], 0.08, 0.5);
    const wo = new Geo(), cap = new Geo();
    for (const sg of [-1, 1] as const) {
      const wx = sg * (U.inner + U.wall);
      for (let k = 0; k < so.length - 1; k++) {
        const s0 = so[k], s1 = so[k + 1]; if (sg > 0 && s1 <= DK.s1 + 1e-6) continue;   // el lado derecho del deck lleva la boca (malla propia)
        const t0 = prof(s0), t1 = prof(s1 - 1e-6);
        wo.quad([wx, 0, s0], [wx, 0, s1], [wx, t1, s1], [wx, t0, s0], [[s0 * 0.5, 0], [s1 * 0.5, 0], [s1 * 0.5, t1 * 0.5], [s0 * 0.5, t0 * 0.5]], [sg, 0, 0]);
        if (s0 >= U.s0 - 1e-6 && s1 <= U.s1 + 1e-6) {   // coronación de los muros de la U
          const wa = sg * U.inner; cap.quad([wa, t0, s0], [wx, t0, s0], [wx, t1, s1], [wa, t1, s1], [[wa * 0.5, s0 * 0.5], [wx * 0.5, s0 * 0.5], [wx * 0.5, s1 * 0.5], [wa * 0.5, s1 * 0.5]], [0, 1, 0]);
        }
      }
    }
    b.decor(wo.build(), base, 'fg_sk_side', { name: 'fg_u_outer' });
    b.decor(cap.build(), base, 'fg_sk_top', { name: 'fg_u_cap' });
    // coping galvanizado en el labio interior de los muros (sigue su coronación) y en los dos extremos de la U
    const cpPts = (sg: number) => sv.map((s) => new THREE.Vector3(sg * U.inner, uWallTop(s) - 0.02, -s));
    for (const sg of [-1, 1]) b.decor(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(cpPts(sg), false, 'catmullrom', 0.05), sv.length * 2, 0.035, 8, false), base, 'fg_steel', { shadow: false });
    pipe(-U.inner, U.s0, U.inner, U.s0, DK.h - 0.02, 0.035); pipe(-U.inner, U.s1, U.inner, U.s1, U.h - 0.02, 0.035);
    m.anchor('fg.u.center', F.V(KIT.fries.visible[0], KIT.fries.visible[1], U.floor), F.heading(0, 1));
    // --- zona plana de entrada: losa de hormigón a la cota de la pista, ancho exterior de la U (los costados son la cara exterior)
    const hw = U.inner + U.wall;
    solidL(-hw, hw, LD.s0, LD.s1, 0, LD.h, 'fg_landing');
    const lt = new Geo(); lt.rect('y', LD.h, [-hw, hw], [LD.s0, LD.s1], 1, 0.5); b.decor(lt.build(), base, 'fg_sk_top', { name: 'fg_landing_top' });
    m.anchor('fg.landing', F.V(0, (LD.s0 + LD.s1) / 2, LD.h), F.heading(0, 1));
  }

  // ================================================================ deck de inicio, barandillas y escalera
  // V10.3 (W05, W-D08): sin túnel ni pozo, «como si nunca hubiese existido»: bloque macizo con su losa, frente y laterales lisos (mismo
  // material y juntas que el resto del deck). El túnel V6–V10.2 queda en V10/IT6/backups/R2/wip/src/world/fg.ts
  {
    solidL(D.w0, D.w1, D.s0, D.s1, 0, D.h, 'fg_deck');
    // --- malla exterior del deck: tapa, frente, lateral izquierdo (lo cubre el muro de la U) y lateral derecho
    const ext = new Geo();
    ext.rect('s', D.s0, [D.w0, D.w1], [0, D.h], -1, 0.5);
    { const side = new Geo(); side.rect('w', D.w1, [D.s0, D.s1], [0, D.h], 1, 0.5); b.decor(side.build(), base, 'fg_sk_side', { name: 'fg_deck_right' }); }
    b.decor(ext.build(), base, 'fg_sk_side', { name: 'fg_deck_faces' });
    const dtop = new Geo(); dtop.rect('y', D.h, [D.w0, D.w1], [D.s0, D.s1], 1, 0.5); b.decor(dtop.build(), base, 'fg_sk_top', { name: 'fg_deck_top' });
    // R2: cantonera galvanizada (angular) en las aristas superiores del deck: frente y laterales
    { const ang = new Geo(), f = 0.055, t = 0.008;
      ang.rect('y', DK.h + t, [DK.w0 - t, DK.w1 + t], [DK.s0 - t, DK.s0 + f], 1, 1); ang.rect('s', DK.s0 - t, [DK.w0 - t, DK.w1 + t], [DK.h - f, DK.h + t], -1, 1);
      for (const sg of [-1, 1] as const) { const wx = sg * (DK.w1 + t); ang.rect('y', DK.h + t, sg < 0 ? [wx, wx + f] : [wx - f, wx], [DK.s0 - t, DK.s1], 1, 1); ang.rect('w', wx, [DK.s0 - t, DK.s1], [DK.h - f, DK.h + t], sg, 1); }
      b.decor(ang.build(), base, 'fg_steel', { name: 'fg_deck_angle', shadow: false }); }
    // --- R2: barandillas galvanizadas de skatepark (imágenes del usuario): pasamanos continuo que baja en curva a los postes
    // extremos y dobla en la esquina, barra inferior y barrotes verticales cada 0,14 m; colisión fina por tramo
    const tubeAlong = (pts: THREE.Vector3[], r: number, bend: number) => {   // polilínea con esquinas redondeadas
      const path = new THREE.CurvePath<THREE.Vector3>(); let prev = pts[0].clone();
      for (let i = 1; i < pts.length; i++) {
        const p = pts[i], last = i === pts.length - 1;
        if (last) { path.add(new THREE.LineCurve3(prev, p.clone())); break; }
        const n = pts[i + 1], a = p.clone().sub(prev).normalize(), c = n.clone().sub(p).normalize();
        const k = Math.min(bend, p.distanceTo(prev) * 0.45, p.distanceTo(n) * 0.45), p0 = p.clone().addScaledVector(a, -k), p1 = p.clone().addScaledVector(c, k);
        path.add(new THREE.LineCurve3(prev, p0)); path.add(new THREE.QuadraticBezierCurve3(p0, p.clone(), p1)); prev = p1;
      }
      return new THREE.TubeGeometry(path, pts.length * 24, r, 10, false);
    };
    const L3 = (w: number, y: number, s: number) => new THREE.Vector3(w, y, -s);
    { const R = DK.rail, y0 = DK.h, inset = 0.07, gap = R.gap / 2, H = R.h, yb = y0 + 0.11, rp = R.post;
      const parts: THREE.BufferGeometry[] = [];
      const flange = (w: number, s2: number) => {   // pletina de anclaje con cuatro tornillos
        const fl = new THREE.CylinderGeometry(0.065, 0.068, 0.014, 16); fl.translate(w, y0 + 0.007, -s2); parts.push(fl);
        for (let k = 0; k < 4; k++) { const a = Math.PI / 4 + k * Math.PI / 2, bo = new THREE.CylinderGeometry(0.009, 0.009, 0.012, 6); bo.translate(w + Math.cos(a) * 0.045, y0 + 0.018, -s2 + Math.sin(a) * 0.045); parts.push(bo); }
      };
      for (const sg of [-1, 1]) {
        const A: [number, number] = [sg * gap, DK.s0 + inset], C: [number, number] = [sg * (DK.w1 - inset), DK.s0 + inset], B: [number, number] = [sg * (DK.w1 - inset), DK.s1 - 0.06];
        // pasamanos continuo: sube del poste del hueco, dobla en la esquina y baja al poste del final (curvas amplias)
        parts.push(tubeAlong([L3(A[0], y0, A[1]), L3(A[0], y0 + H, A[1]), L3(C[0], y0 + H, C[1]), L3(B[0], y0 + H, B[1]), L3(B[0], y0, B[1])], R.tube, R.bend));
        parts.push(tubeAlong([L3(A[0], yb, A[1]), L3(C[0], yb, C[1]), L3(B[0], yb, B[1])], R.tube * 0.75, R.bend * 0.6));
        for (const [p0, p1] of [[A, C], [C, B]] as [number, number][][]) {
          const Ls = Math.hypot(p1[0] - p0[0], p1[1] - p0[1]);
          const np = Math.max(1, Math.round(Ls / R.postSpacing)), lerp = (t: number): [number, number] => [p0[0] + (p1[0] - p0[0]) * t, p0[1] + (p1[1] - p0[1]) * t];
          for (let k = 1; k < np; k++) { const [w, s2] = lerp(k / np);   // postes intermedios gruesos hasta el pasamanos
            const po = new THREE.CylinderGeometry(rp, rp, H, 12); po.translate(w, y0 + H / 2, -s2); parts.push(po); flange(w, s2); }
          const n = Math.floor(Ls / R.spacing);
          for (let k = 1; k < n; k++) { const t = k / n, [w, s2] = lerp(t);   // barrotes entre la barra baja y el pasamanos
            if ([...Array(np - 1).keys()].some((j) => Math.abs(t - (j + 1) / np) * Ls < R.spacing * 0.5)) continue;
            const bar = new THREE.CylinderGeometry(R.baluster, R.baluster, H - (yb - y0), 8); bar.translate(w, yb + (H - (yb - y0)) / 2, -s2); parts.push(bar); }
        }
        { const po = new THREE.CylinderGeometry(rp, rp, H - 0.1, 12); po.translate(C[0], y0 + (H - 0.1) / 2, -C[1]); parts.push(po); }   // poste de la esquina
        for (const [w, s2] of [A, C, B]) flange(w, s2);
        solidL(Math.min(A[0], C[0]), Math.max(A[0], C[0]), DK.s0, DK.s0 + 0.12, y0, y0 + H + 0.1, 'fg_railing', 'rail');
        solidL(Math.min(C[0], C[0] - sg * 0.12), Math.max(C[0], C[0] - sg * 0.12), DK.s0, DK.s1, y0, y0 + H + 0.1, 'fg_railing', 'rail');
      }
      b.decor(mergeGeometries(parts.map((g) => (g.index ? g.toNonIndexed() : g)).map((g) => { for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(k)) g.deleteAttribute(k); return g; }))!, base, 'fg_steel', { name: 'fg_railings' });
    }
    // --- R2: escalera galvanizada pegada al frente: largueros de tubo con cuello de cisne que vuelven a apoyarse en el deck,
    // peldaños redondos cada 0,22 m y soportes atornillados al muro
    { const L = KIT.ladder, sF = L.face - L.standoff, hw = L.width / 2, parts: THREE.BufferGeometry[] = [], rr = 0.027;
      const plate = (x: number, y: number, s2: number, w: number, h: number) => {   // pletina al muro con dos tornillos
        const pl = new THREE.BoxGeometry(w, h, 0.012); pl.translate(x, y, -s2); parts.push(pl);
        for (const dy of [-h * 0.3, h * 0.3]) { const bo = new THREE.CylinderGeometry(0.01, 0.01, 0.014, 6); bo.rotateX(Math.PI / 2); bo.translate(x, y + dy, -(s2 - 0.01)); parts.push(bo); }
      };
      const collar = (x: number, y: number, s2: number) => { const c = new THREE.CylinderGeometry(rr + 0.008, rr + 0.008, 0.06, 12); c.translate(x, y, -s2); parts.push(c); };
      for (const sg of [-1, 1]) {
        const x = L.w + sg * hw, top = DK.h + L.goose, sBack = DK.s0 + 0.3;
        // larguero con cuello de cisne: sube por delante del muro, se curva amplio por encima del deck y vuelve a apoyarse en él
        parts.push(tubeAlong([L3(x, 0, sF), L3(x, top, sF), L3(x, top, sBack), L3(x, DK.h, sBack)], rr, 0.2));
        { const fl = new THREE.CylinderGeometry(0.055, 0.058, 0.014, 14); fl.translate(x, DK.h + 0.007, -sBack); parts.push(fl); }   // pletina en el deck
        for (const y of L.brackets) {   // soportes al muro: abrazadera en el larguero + brazo + pletina atornillada
          collar(x, y, sF); parts.push(tubeAlong([L3(x, y, sF), L3(x, y, DK.s0 - 0.006)], 0.014, 0.01)); plate(x, y, DK.s0 - 0.006, 0.09, 0.15);
        }
        collar(x, DK.h + 0.02, sF);   // abrazadera a la altura del canto
        const fl = new THREE.CylinderGeometry(0.06, 0.064, 0.016, 14); fl.translate(x, 0.008, -sF); parts.push(fl);
        b.thin.add(b.solid(F.P(x, sF, 0), 0.06, DK.h + L.goose, 0.06, 'fg_ladder', 'small').handle);
      }
      for (let y = L.rung; y < DK.h - 0.02; y += L.rung) {   // peldaños con casquillo en cada larguero
        const r = new THREE.CylinderGeometry(0.018, 0.018, L.width, 10); r.rotateZ(Math.PI / 2); r.translate(L.w, y, -sF); parts.push(r);
        for (const sg of [-1, 1]) { const c = new THREE.CylinderGeometry(0.024, 0.024, 0.03, 10); c.rotateZ(Math.PI / 2); c.translate(L.w + sg * (hw - 0.03), y, -sF); parts.push(c); }
      }
      b.decor(mergeGeometries(parts.map((g) => (g.index ? g.toNonIndexed() : g)).map((g) => { for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(k)) g.deleteAttribute(k); return g; }))!, base, 'fg_steel', { name: 'fg_ladder' });
      m.anchor('fg.ladder.foot', F.V(L.w, L.face - 0.42, 0), F.heading(0, 1));          // de cara a la pared
      m.anchor('fg.ladder.top', F.V(L.w, DK.s0 + 0.5, DK.h), F.heading(0, 1));            // sobre el deck, de espaldas al borde
      m.anchor('fg.ladder.axis', F.V(L.w, sF, 0), F.heading(0, 1));
      P.zone('act.ladderFoot', F.V(L.w, L.face - 0.6), 0.75, -0.3, 0.4);
      P.zone('act.ladderTop', F.V(L.w, DK.s0 + 0.45), 0.55, DK.h - 0.2, DK.h + 0.5);
      // V7: trepa generalizada (activities.LadderClimb): la de FG es la instancia `fg`, base 0, mismas anclas y zonas
      m.ladders.push({ id: 'fg', axis: F.V(L.w, sF, 0), heading: F.heading(0, 1), bottom: 0, top: DK.h, topPos: F.V(L.w, DK.s0 + 0.5, DK.h), footZone: 'act.ladderFoot', topZone: 'act.ladderTop' }); }
  }

  // ================================================================ pista de baile: tablero rosa sobre trapecio de cemento
  { const hw = ST.w / 2, wb = hw + ST.sideRun, sr = ST.s1 + ST.rearRun, h = ST.h;
    const g = new Geo(), vt = new Geo();
    g.quad([-hw, h, ST.s1], [hw, h, ST.s1], [hw, 0, sr], [-hw, 0, sr], [[-hw * 0.5, 0], [hw * 0.5, 0], [hw * 0.5, 1.03], [-hw * 0.5, 1.03]], [0, 1, 1]);     // rampa trasera
    for (const sg of [-1, 1]) {
      g.quad([sg * hw, h, ST.s0], [sg * hw, h, ST.s1], [sg * wb, 0, ST.s1], [sg * wb, 0, ST.s0], [[ST.s0 * 0.5, 0], [ST.s1 * 0.5, 0], [ST.s1 * 0.5, 1.03], [ST.s0 * 0.5, 1.03]], [sg, 1, 0]);   // laterales
      const a = g.vtx(sg * hw, h, ST.s1, 0, 1), c = g.vtx(sg * wb, 0, ST.s1, -0.9, 0), d = g.vtx(sg * hw, 0, sr, 0.9, 0); g.tri(a, c, d, [sg, 1, 1]);   // esquinas recortadas
      const e = vt.vtx(sg * hw, h, ST.s0, 0, h * 0.5), f = vt.vtx(sg * hw, 0, ST.s0, 0, 0), k = vt.vtx(sg * wb, 0, ST.s0, sg * ST.sideRun * 0.5, 0); vt.tri(e, f, k, [0, 0, -1]);   // testeros frontales
    }
    // R2: el tablero es más ancho que la entrada: testeros verticales del tablero a los lados de la zona de entrada
    { const lw = U.inner + U.wall; if (hw > lw) for (const sg of [-1, 1] as const) vt.rect('s', ST.s0, sg < 0 ? [-hw, -lw] : [lw, hw], [0, h], -1, 0.5); }
    // R5 (usuario): la base de la pista con el mismo hormigón NMG que la zona de skate (rampas = tapas; caras verticales = paredes)
    b.decor(g.build(), base, 'fg_sk_top', { name: 'fg_stage_base' });
    b.decor(vt.build(), base, 'fg_sk_side', { name: 'fg_stage_base_faces' });
    const tp = new Geo(); tp.rect('y', h, [-hw, hw], [ST.s0, ST.s1], 1, 1); b.decor(tp.build(), base, 'fg_pink_tile', { name: 'fg_stage_top' });
    // canto negro alrededor del tablero (bordes paralelos al eje)
    { const e = new Geo(), t = 0.06; e.rect('y', h + 0.004, [-hw, hw], [ST.s1 - t, ST.s1], 1, 1); e.rect('y', h + 0.004, [-hw, hw], [ST.s0, ST.s0 + t], 1, 1); for (const sg of [-1, 1]) e.rect('y', h + 0.004, sg < 0 ? [-hw, -hw + t] : [hw - t, hw], [ST.s0, ST.s1], 1, 1);
      b.decor(e.build(), base, 'fg_coping', { shadow: false }); }
    hull([[-hw, h, ST.s0], [hw, h, ST.s0], [hw, h, ST.s1], [-hw, h, ST.s1], [-wb, 0, ST.s0], [wb, 0, ST.s0], [wb, 0, ST.s1], [hw, 0, sr], [-hw, 0, sr], [-wb, 0, ST.s1]], 'fg_stage', 'ramp');
  }

  // ================================================================ cuñas enfrentadas (suben hacia el hueco central)
  for (const sg of [-1, 1]) {
    const wi = sg * WD.inner, wo = sg * WD.outer, h = WD.h;
    const g = new Geo();
    g.quad([wo, 0, WD.s0], [wo, 0, WD.s1], [wi, h, WD.s1], [wi, h, WD.s0], [[0, WD.s0 * 0.5], [0, WD.s1 * 0.5], [1.43, WD.s1 * 0.5], [1.43, WD.s0 * 0.5]], [-sg * 0.3, 1, 0]);   // rodadura gris
    b.decor(g.build(), base, 'fg_sk_top', { name: 'fg_wedge_top' });   // R5 (usuario): rodadura de las cuñas con el hormigón NMG
    // caras rosas: UV al atlas T_fg_wedge (una pintura propia por cara; orientación de u = derecha del observador)
    const AT = KIT.wedgeAtlas, [AW, AH] = AT.px, pk = new Geo();
    const auv = (r: number[], uf: number, yf: number) => [(r[0] + uf * r[2]) / AW, 1 - (r[1] + (1 - yf) * r[3]) / AH];
    { const r = sg < 0 ? AT.innerL : AT.innerR, L = WD.s1 - WD.s0;
      const uf = (s: number) => (sg < 0 ? (s - WD.s0) / L : (WD.s1 - s) / L);
      const q = [[wi, 0, WD.s0], [wi, 0, WD.s1], [wi, h, WD.s1], [wi, h, WD.s0]];
      pk.quad(q[0], q[1], q[2], q[3], q.map(([, y, s]) => auv(r, uf(s), y / h)), [-sg, 0, 0]); }
    for (const [sAt, sn] of [[WD.s0, -1], [WD.s1, 1]] as const) {        // testeros triangulares
      const key = (sg < 0 ? 'triL' : 'triR') + (sn < 0 ? '0' : '1') as 'triL0' | 'triL1' | 'triR0' | 'triR1', r = AT[key];
      const lo = Math.min(wo, wi), Lw = Math.abs(wo - wi);
      const uf = (w: number) => (sn < 0 ? (w - lo) / Lw : (lo + Lw - w) / Lw);   // s0: derecha = +W; s1: derecha = −W
      const P3 = [[wo, 0], [wi, 0], [wi, h]].map(([w, y]) => pk.vtx(w, y, sAt, ...(auv(r, uf(w), y / h) as [number, number])));
      pk.tri(P3[0], P3[1], P3[2], [0, 0, sn]);
    }
    b.decor(pk.build(), base, 'fg_wedge', { name: 'fg_wedge_face' });
    // coping negro en la arista alta
    const cp = new THREE.CylinderGeometry(0.03, 0.03, WD.s1 - WD.s0, 10); cp.rotateX(Math.PI / 2); cp.translate(wi, h - 0.015, -(WD.s0 + WD.s1) / 2); b.decor(cp, base, 'fg_coping', { shadow: false });
    hull([[wo, 0, WD.s0], [wo, 0, WD.s1], [wi, 0, WD.s0], [wi, 0, WD.s1], [wi, h, WD.s0], [wi, h, WD.s1]], 'fg_wedge', 'ramp');
  }

  // ================================================================ ledge de dos alturas con el radiocasete (R2: hormigón + cantonera)
  { const Lg = KIT.ledge, sC = (Lg.s0 + Lg.s1) / 2, f = 0.05, t = 0.008;
    const ang = new Geo();
    const block = (w0: number, w1: number, hh: number, name: string, edges: ('s0' | 's1' | 'w0' | 'w1')[]) => {
      solidL(w0, w1, Lg.s0, Lg.s1, 0, hh, name);
      const g = new Geo();
      g.rect('s', Lg.s0, [w0, w1], [0, hh], -1, 0.5); g.rect('s', Lg.s1, [w0, w1], [0, hh], 1, 0.5);
      g.rect('w', w0, [Lg.s0, Lg.s1], [0, hh], -1, 0.5); g.rect('w', w1, [Lg.s0, Lg.s1], [0, hh], 1, 0.5);
      b.decor(g.build(), base, 'fg_sk_side', { name });
      const tp = new Geo(); tp.rect('y', hh, [w0, w1], [Lg.s0, Lg.s1], 1, 0.5); b.decor(tp.build(), base, 'fg_sk_top', { name: name + '_top' });
      // cantonera galvanizada (angular) en las aristas superiores
      for (const ed of edges) {
        if (ed === 's0' || ed === 's1') { const sa = ed === 's0' ? Lg.s0 - t : Lg.s1 + t, sn = ed === 's0' ? -1 : 1;
          ang.rect('y', hh + t, [w0 - t, w1 + t], sn < 0 ? [sa, sa + f] : [sa - f, sa], 1, 1); ang.rect('s', sa, [w0 - t, w1 + t], [hh - f, hh + t], sn as 1 | -1, 1); }
        else { const wa = ed === 'w0' ? w0 - t : w1 + t, sn = ed === 'w0' ? -1 : 1;
          ang.rect('y', hh + t, sn < 0 ? [wa, wa + f] : [wa - f, wa], [Lg.s0 - t, Lg.s1 + t], 1, 1); ang.rect('w', wa, [Lg.s0 - t, Lg.s1 + t], [hh - f, hh + t], sn as 1 | -1, 1); }
      }
    };
    block(Lg.w0, Lg.lowW, Lg.high, 'fg_ledge', ['s0', 's1', 'w0', 'w1']);
    block(Lg.lowW, Lg.w1, Lg.low, 'fg_ledge_low', ['s0', 's1', 'w1']);
    b.decor(ang.build(), base, 'fg_steel', { name: 'fg_ledge_angle', shadow: false });
    const cc = F.V((Lg.lowW + Lg.w1) / 2, sC);
    m.cassettes.push({ zone: id, pos: cc, heading: F.heading(-0.15, -1), lift: Lg.low });   // R2: de frente hacia quien llega (imagen 1 del usuario)
  }

  // ================================================================ soporte de tablas (colisión baja; el modelo llega con el atrezzo)
  { const R = KIT.rack, rp = F.P((R.w0 + R.w1) / 2, (R.s0 + R.s1) / 2, 0, 0);   // +z local = −S: ruedas de las tablas hacia fuera del deck (v9)
    slot('fg_rack', rp, () => { b.box(rp, R.w1 - R.w0, 0.05, R.s1 - R.s0, { mat: 'fg_coping', collide: false }); b.box(rot(rp, -0.35, 0.05, 0.1), 0.21, 0.8, 0.03, { mat: 'fg_coping', collide: false }); b.box(rot(rp, 0.35, 0.05, 0.1), 0.21, 0.8, 0.03, { mat: 'fg_spot_glow', collide: false }); });
    b.solid(F.P((R.w0 + R.w1) / 2, (R.s0 + R.s1) / 2, 0), R.w1 - R.w0, R.h, R.s1 - R.s0, 'fg_rack', 'small');
    m.anchor('fg.rack', F.V((R.w0 + R.w1) / 2, (R.s0 + R.s1) / 2), F.heading(0, 1)); }

  // ================================================================ equipo en la pista
  { const SP = KIT.speakers;
    for (const sg of [-1, 1]) speaker(b, F.P(sg * SP.w, SP.s, ST.h), 1.1, SP.h);
    const TR = KIT.truss, yTop = ST.h + TR.hOver, tp = F.P(0, TR.s, ST.h);
    slot('fg_truss', tp, () => { for (const sg of [-1, 1]) b.box(rot(tp, sg * TR.axis / 2, 0, 0), 0.24, TR.hOver, 0.24, { mat: 'fg_coping', collide: false }); b.box(rot(tp, 0, TR.hOver - 0.24, 0), TR.axis + 0.24, 0.24, 0.24, { mat: 'fg_coping', collide: false }); });
    for (const sg of [-1, 1]) b.thin.add(b.solid(F.P(sg * TR.axis / 2, TR.s, ST.h), 0.3, TR.hOver, 0.3, 'fg_truss', 'small').handle);
    m.anchor('fg.truss', F.V(0, TR.s, yTop), F.heading(0, -1));
    // R2/R3 (usuario): el road case sube a la pista, a la izquierda del speaker derecho (vista desde la U) y alineado con él, con el corazón hacia la U
    const R = KIT.roadcase, ry = R.onStage ? ST.h : 0, cp = F.P((R.w0 + R.w1) / 2, (R.s0 + R.s1) / 2, ry, 0);
    slot('fg_roadcase', cp, () => b.box(cp, 0.78, R.h, 0.6, { mat: 'fg_coping', collide: false }));
    b.solid(F.P((R.w0 + R.w1) / 2, (R.s0 + R.s1) / 2, ry), R.w1 - R.w0, R.h, R.s1 - R.s0, 'fg_roadcase', 'small');
    m.anchor('fg.roadcase', F.V((R.w0 + R.w1) / 2, (R.s0 + R.s1) / 2), F.heading(-1, 0));
    // focos: posición bajo el travesaño y punto al que apuntan (los modela el atrezzo; aquí ancla)
    // focos colgados del cordón inferior del travesaño, orientados al centro del baile (yaw del yugo + inclinación de la cabeza)
    const aim = F.V(KIT.spots.aim[0], KIT.spots.aim[1], ST.h + 0.9);
    for (const sg of [-1, 1]) {
      const hang = F.V(sg * KIT.spots.w, TR.s, yTop - 0.24), pivot = hang.clone().add(new THREE.Vector3(0, -0.39, 0));
      const d = aim.clone().sub(pivot), yawS = Math.atan2(d.x, d.z), pitch = Math.atan2(-d.y, Math.hypot(d.x, d.z));
      const pl: Place = { x: hang.x, y: hang.y, z: hang.z, yaw: yawS };
      slot('fg_spot', pl, () => { b.box({ ...pl, y: hang.y - 0.55 }, 0.36, 0.36, 0.36, { mat: 'fg_coping', collide: false }); }, pitch);
      m.anchor(`fg.spot.${sg < 0 ? 'l' : 'r'}`, pivot, yawS);
    }
    m.anchor('fg.spot.aim', aim, 0);
  }

  // ================================================================ farolillos bajos en los paseos rosas (bordes que miran a la plaza)
  { const LA = KIT.lamps;   // V10.3 (U-03, usuario): sin farolillos (listas vacías en fg_kit.json)
    for (const [r, list] of [LA.inner, LA.outer] as [number, number[]][]) for (const th0 of list) {
      const th = coronaTh(th0), p = polar(r, th);   // V10: θ literal + giro de corona
      const lp: Place = { x: p.x, y: 0, z: p.z, yaw: -th * D2R };
      slot('fg_lamp', lp, () => { b.box(lp, 0.14, LA.h - 0.3, 0.14, { mat: 'fg_coping', collide: false }); b.box({ ...lp, y: LA.h - 0.3 }, 0.27, 0.2, 0.27, { mat: 'fg_lamp_glow', collide: false }); b.box({ ...lp, y: LA.h - 0.1 }, 0.34, 0.08, 0.34, { mat: 'fg_coping', collide: false }); });
      b.thin.add(b.solid(lp, 0.24, LA.h, 0.24, 'fg_lamp', 'small').handle);
      P.fgLamps.push({ x: p.x, z: p.z, yaw: -th * D2R, h: LA.h });
    } }

  // ================================================================ baile: centro de ANMI, cinco chicas, tabla aparcada, cámara
  { const DN = KIT.dance, h = ST.h, c = F.V(DN.center[0], DN.center[1], h), cam = F.V(DN.cam[0], DN.cam[1], DN.cam[2]);
    m.anchor('dance.center', c, Math.atan2(cam.x - c.x, cam.z - c.z));
    P.zone('act.danceCombo', F.V(DN.center[0], DN.center[1]), DN.zoneR, h - 0.25, h + 1.6);
    DN.girls.forEach(([w, s, dy], i) => { const v = F.V(w, s, h); m.anchor(`girl.${i + 1}`, v, Math.atan2(cam.x - v.x, cam.z - v.z) + dy); });
    m.anchor('board.park', F.V(DN.boardPark[0], DN.boardPark[1], h), F.heading(1, 0.15));
    m.anchor('cam.dance', cam, 0);
  }

  // ================================================================ patatas (IDs V3 estables; posiciones complementos v2 + revisión 07)
  { const FR = KIT.fries;
    P.fry(id, 'medium', F.V(FR.medium[0], FR.medium[1], 0), 'ollie', 'Suspendida en el aire entre las dos cuñas rosas: sube a una cuña y salta (o un ollie)', 'Bajar por la rampa de la cuña', FR.medium[2]);
    // recogida por alcance real: el cuerpo de ANMI (1,8 m) debe llegar a la patata (pie ≥ centro − 1,9 m); andar por debajo no la toca
    { const f = m.fries[m.fries.length - 1]; f.reach = [FR.medium[2] - 1.9, FR.medium[2] + 0.4]; }
    P.fry(id, 'visible', F.V(FR.visible[0], FR.visible[1], U.floor), 'roll', 'En el fondo de la U, a la vista desde el deck y la pista', 'Subir andando por la transición hacia la zona de entrada de la pista');
    // V10.3 (W05, W-D08, W-D34): encima del TRAMO ALTO del muro bajo, justo al lado del bloque de la radio (la radio no se mueve); el
    // disparador (±0,8 m) no toca la radio y solo se coge subida al muro (o saltando por encima), no desde el suelo de al lado
    { const Lg = KIT.ledge, H = FR.hiddenLedge as number[];
      P.fry(id, 'hidden', F.V(H[0], H[1], Lg.high), 'ollie', 'Encima del muro bajo, junto a la radio: súbete de un salto (o con un ollie)', 'Bajar del muro de un salto', 0.5);
      const f = m.fries[m.fries.length - 1]; f.reach = [Lg.high - 0.15, Lg.high + 1.6]; }
    P.fry(id, 'activity', F.V(FR.activity[0], FR.activity[1]), 'roll', 'Junto a la rampa lateral de la pista, al terminar el baile', 'Suelo plano');
  }

  // V10.3 (U-12, usuario): sin las manchas rosas extra del suelo de la plaza (antes FG_SPLATS; lista vacía en fg_kit.json)
  // ================================================================ R2/R3: grafitis FG en calcomanías por cara (nunca cortados por las aristas): tags de
  // espray rosa de las imágenes del usuario (fila de arriba del atlas) y los cinco grafitis FG aprobados (filas 2-3)
  { const parts: THREE.BufferGeometry[] = [], Lg = KIT.ledge, hw = U.inner + U.wall, e = 0.008;
    for (const [face, c, y, size, cell] of KIT.tags.list as [string, number, number, number, number][]) {
      // cara → (posición del plano en coordenadas del marco, normal (dw, ds))
      const at: Record<string, [number, number, number, number]> = { deckFront: [c, DK.s0 - e, 0, -1], ledgeFront: [c, Lg.s0 - e, 0, -1], ledgeBack: [c, Lg.s1 + e, 0, 1],
        uLeft: [-hw - e, c, -1, 0], uRight: [hw + e, c, 1, 0], landingLeft: [-hw - e, c, -1, 0], landingRight: [hw + e, c, 1, 0] };
      const [w, s2, nw, ns] = at[face]; const g = new THREE.PlaneGeometry(size, size);
      const uv = g.attributes.uv; for (let i = 0; i < uv.count; i++) { uv.setX(i, ((cell % 4) + uv.getX(i)) / 4); uv.setY(i, (uv.getY(i) + 2 - Math.floor(cell / 4)) / 3); }   // atlas 4 × 3
      g.rotateY(F.yaw + Math.atan2(nw, -ns)); const v = F.V(w, s2); g.translate(v.x, y, v.z); parts.push(g.toNonIndexed());
    }
    const mat = new THREE.MeshStandardMaterial({ map: tex('tex/T_fg_tags.webp'), transparent: true, alphaTest: 0.02, roughness: 0.85, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3 });
    const mesh = new THREE.Mesh(mergeGeometries(parts)!, mat); mesh.name = 'FG_TAGS'; mesh.receiveShadow = true; P.root.add(mesh); }

  void rot;
}

/** Rótulo/selección de la superficie para el sonido: pista de baile (LED en V5) → hormigón. */
export function fgSurfaceIsStage(p: THREE.Vector3) {
  const F = fgFrame(), dx = p.x - F.O.x, dz = p.z - F.O.z;
  const w = dx * F.W.x + dz * F.W.z, s = dx * F.S.x + dz * F.S.z;
  return Math.abs(w) <= KIT.stage.w / 2 && s >= KIT.stage.s0 && s <= KIT.stage.s1 && p.y > KIT.stage.h - 0.2;
}
