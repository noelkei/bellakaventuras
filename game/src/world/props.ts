// Props procedurales ligeros (geometría propia, materiales compartidos): árboles, palmeras, farolas, bancos, conos,
// altavoces, truss, latas, barandillas, limusina y coche de drifting. Sin descargas: se dibujan en el lote estático
// salvo los que se animan (coches), que se devuelven como grupos.
import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import { Builder, Place, boxUV } from './geo';

const v3 = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
function rot(p: Place, lx: number, ly: number, lz: number): Place {
  const c = Math.cos(p.yaw ?? 0), s = Math.sin(p.yaw ?? 0);
  return { x: p.x + lx * c + lz * s, y: (p.y ?? 0) + ly, z: p.z - lx * s + lz * c, yaw: p.yaw };
}

/** Huecos de props con derivado GLB (ASSET-02): la geometría procedural de cada uno queda como proxy en el trozo
 *  `proxy_<tipo>` y se oculta cuando el GLB carga (Park.loadProps); si falla, el proxy y la colisión siguen. */
export type PropKind = 'palm_straight' | 'palm_lean' | 'tree_compact' | 'tree_open' | 'shrub' | 'lamp_double' | 'speaker' | 'planter_rect' | 'planter_corner' | 'limo'
  | 'nmg_plant_a' | 'nmg_plant_a_flor' | 'nmg_plant_b' | 'nmg_plant_c' | 'nmg_shrub_flor' | 'nmg_tree_round' | 'nmg_tree_open' | 'nmg_palm_straight' | 'nmg_palm_lean';
/** `group` (V7): los huecos con grupo van a su PROPIA malla instanciada (`PROP_<tipo>_<grupo>`), con su esfera envolvente, para que
 *  se descarten cuando su sector no está a la vista; sin grupo, la malla común de siempre (`PROP_<tipo>`). */
export interface PropSlot { kind: PropKind; x: number; y: number; z: number; yaw: number; h: number; group?: string }
export const PROP_SLOTS: PropSlot[] = [];
function proxy<T>(b: Builder, kind: PropKind, p: Place, h: number, draw: () => T): T {
  PROP_SLOTS.push({ kind, x: p.x, y: p.y ?? 0, z: p.z, yaw: p.yaw ?? 0, h });
  const c = b.chunk; b.chunk = `proxy_${kind}`; try { return draw(); } finally { b.chunk = c; }
}

export function palm(b: Builder, p: Place, h = 6, lean = 0.12, seed = 1, nmg = false) {
  // V4 COL-01: el tronco es sólido (cilindro ajustado al pie, 2,4 m); la copa no bloquea al jugador. R6: la palmera NMG nueva
  // tiene la base ensanchada (radio ≈ 0,26 m a 0,5 m de altura): su cilindro es de 0,25 m
  b.addCollider(RAPIER.ColliderDesc.cylinder(1.2, nmg ? 0.25 : 0.22).setTranslation(p.x, (p.y ?? 0) + 1.2, p.z), 'palm_trunk');
  // palmera inclinada para las de más inclinación; el derivado se orienta con el rumbo del hueco
  // V5 ART-12: en NO ME GUILLO la palmera es la nativa NMG (hojas lima, anillos); el resto del parque conserva su derivado
  const kind: PropKind = nmg ? (lean > 0.12 ? 'nmg_palm_lean' : 'nmg_palm_straight') : lean > 0.12 ? 'palm_lean' : 'palm_straight';
  return proxy(b, kind, { ...p, yaw: (p.yaw ?? 0) + seed * 1.3 }, h, () => palmProc(b, p, h, lean, seed));
}
function palmProc(b: Builder, p: Place, h: number, lean: number, seed: number) {
  const segs = 7; let x = 0, y = 0;
  for (let i = 0; i < segs; i++) {
    const L = h / segs, r = 0.2 - 0.08 * i / segs;
    const g = new THREE.CylinderGeometry(r * 0.86, r, L * 1.04, 7);
    g.translate(0, L / 2, 0); g.rotateZ(-lean * (i / segs));
    b.decor(g, rot(p, x, y, 0), 'trunk');
    x += Math.sin(lean * (i / segs)) * L; y += Math.cos(lean * (i / segs)) * L;
  }
  const top = rot(p, x, y, 0);
  b.decor(new THREE.IcosahedronGeometry(0.32, 0), top, 'leaf');
  const rnd = mulberry(seed);
  for (let k = 0; k < 8; k++) {
    const a = k / 8 * Math.PI * 2 + rnd() * 0.3;
    const L = 2.2 + rnd() * 0.8;
    const g = new THREE.PlaneGeometry(L, 0.55, 6, 1);
    const pos = g.attributes.position;
    for (let i = 0; i < pos.count; i++) { const t = (pos.getX(i) + L / 2) / L; pos.setY(i, pos.getY(i) * Math.sin(Math.PI * Math.min(1, t * 1.1)) ); pos.setZ(i, -1.3 * t * t + 0.4 * t); }
    g.rotateX(-Math.PI / 2); g.translate(L / 2, 0, 0); g.rotateZ(0); g.rotateY(a);
    g.computeVertexNormals();
    b.decor(g, top, k % 2 ? 'leaf_light' : 'leaf', { shadow: true });
  }
}

export function tree(b: Builder, p: Place, h = 5, seed = 2) {
  b.addCollider(RAPIER.ColliderDesc.cylinder(1.0, 0.24).setTranslation(p.x, (p.y ?? 0) + 1.0, p.z), 'tree_trunk');   // V4 COL-01: tronco sólido
  // los derivados son más anchos que altos (arboleda 1,3:1, abierto 1,1:1): altura reducida para que el ancho quede como el del proxy
  const compact = seed % 2 === 1;
  return proxy(b, compact ? 'tree_compact' : 'tree_open', { ...p, yaw: (p.yaw ?? 0) + seed * 0.9 }, h * (compact ? 0.6 : 0.8), () => treeProc(b, p, h, seed));
}
function treeProc(b: Builder, p: Place, h: number, seed: number) {
  const rnd = mulberry(seed);
  const g = new THREE.CylinderGeometry(0.14, 0.2, h * 0.55, 7); g.translate(0, h * 0.275, 0);
  b.decor(g, p, 'trunk');
  for (let k = 0; k < 3; k++) {
    const c = new THREE.IcosahedronGeometry(h * (0.26 - k * 0.04), 1);
    c.translate((rnd() - 0.5) * 0.8, h * (0.6 + k * 0.16), (rnd() - 0.5) * 0.8);
    b.decor(c, p, k === 1 ? 'leaf_light' : 'leaf');
  }
}

/** R6 (usuario, 12 oct): matas NMG nuevas (referencias vegetacion-mejora-2026-10-12): A compacta, A con flores, B extendida,
 *  C erguida. Decorativas: sin colisión (follaje bajo atravesable). `s` = escala sobre su tamaño de modelo; `yaw` tal cual. */
export const NMG_PLANT_H = { a: 0.519, a_flor: 0.55, b: 0.487, c: 1.02, shrub_flor: 0.948 };   // plants_report.json
export function nmgPlant(b: Builder, p: Place, variant: 'a' | 'a_flor' | 'b' | 'c', s = 1) {
  return proxy(b, `nmg_plant_${variant}` as PropKind, p, NMG_PLANT_H[variant] * s, () => bushProc(b, p, 0.55 * s));
}
/** R6: arbusto floral (03): acento en el borde exterior; núcleo fino de colisión como los arbustos > 0,6 m (la cámara lo ignora). */
export function nmgFlowerShrub(b: Builder, p: Place, s = 1) {
  const h = NMG_PLANT_H.shrub_flor * s;
  const c = b.addCollider(RAPIER.ColliderDesc.cylinder(h * 0.35, 0.16 * s).setTranslation(p.x, (p.y ?? 0) + h * 0.35, p.z), 'shrub_core', 'thin'); b.thin.add(c.handle);
  return proxy(b, 'nmg_shrub_flor', p, h, () => bushProc(b, p, s));
}
/** V4 NMG (VEG-01): árbol nativo de copa facetada; tronco sólido. */
export function nmgTree(b: Builder, p: Place, variant: 'round' | 'open', h = 4.9) {
  b.addCollider(RAPIER.ColliderDesc.cylinder(1.0, 0.24).setTranslation(p.x, (p.y ?? 0) + 1.0, p.z), 'tree_trunk');
  return proxy(b, `nmg_tree_${variant}` as PropKind, p, h, () => treeProc(b, p, h, 3));
}

export function bush(b: Builder, p: Place, s = 1) {
  // V5 T5-14 (DT-06): arbusto > 0,6 m → núcleo de colisión fino (r 0,22·s) de la altura del arbusto: se roza el follaje pero
  // no se atraviesa el tronco; la cámara lo ignora (fino)
  const h = 0.9 * s;
  if (h > 0.6) { const c = b.addCollider(RAPIER.ColliderDesc.cylinder(h * 0.4, 0.22 * s).setTranslation(p.x, (p.y ?? 0) + h * 0.4, p.z), 'shrub_core', 'thin'); b.thin.add(c.handle); }
  return proxy(b, 'shrub', { ...p, yaw: (p.yaw ?? 0) + s * 7 }, h, () => bushProc(b, p, s));
}
function bushProc(b: Builder, p: Place, s: number) {
  const g = new THREE.IcosahedronGeometry(0.6 * s, 1); g.scale(1.3, 0.75, 1.1); g.translate(0, 0.35 * s, 0);
  b.decor(g, p, 'leaf');
}

export function lamp(b: Builder, p: Place, h = 5.5) {
  b.thin.add(b.solid({ ...p, y: 0 }, 0.16, h, 0.16, 'lamp').handle);   // colisión del poste (siempre; la cámara la ignora); aspecto proxy o derivado
  proxy(b, 'lamp_double', p, h, () => {
    b.cylinder(p, 0.08, h, { mat: 'black', seg: 8, collide: false, name: 'lamp' });
    b.box(rot(p, 0.35, h - 0.06, 0), 0.9, 0.12, 0.3, { mat: 'black', collide: false });
    b.box(rot(p, 0.38, h - 0.1, 0), 0.7, 0.03, 0.22, { mat: 'neon_warm', collide: false, shadow: false });
  });
}
/** V5 ART-14: farola NMG: poste negro fino con UNA sola cabeza pequeña (la referencia), procedural; colisión del poste. */
export function nmgLamp(b: Builder, p: Place, h = 5.2) {
  b.thin.add(b.solid({ ...p, y: 0 }, 0.12, h, 0.12, 'lamp').handle);
  b.cylinder(p, 0.065, h, { mat: 'black', seg: 8, collide: false, name: 'lamp', r2: 0.045 });
  b.cylinder(p, 0.09, 0.35, { mat: 'black', seg: 8, collide: false });   // base
  b.box(rot(p, 0.16, h - 0.03, 0), 0.34, 0.035, 0.05, { mat: 'black', collide: false });   // brazo corto
  b.box(rot(p, 0.36, h - 0.1, 0), 0.26, 0.11, 0.18, { mat: 'black', collide: false });     // cabeza
  b.box(rot(p, 0.36, h - 0.16, 0), 0.2, 0.02, 0.13, { mat: 'neon_warm', collide: false, shadow: false });
}
/** Jardinera (derivado nativo): colisión de caja y proxy simple de ladrillo/remate. */
export function planter(b: Builder, p: Place, corner = false) {
  const s = corner ? 2.04 : 2.04, d = corner ? 2.04 : 0.96, H = corner ? 0.6 : 0.55;
  if (corner) { b.solid(rot(p, 0, 0, 0.54), 2.04, H, 0.96, 'planter'); b.solid(rot(p, -0.54, 0, -0.54), 0.96, H, 1.08, 'planter'); }
  else b.solid(p, s, H, d, 'planter');
  proxy(b, corner ? 'planter_corner' : 'planter_rect', p, H, () => {
    if (corner) { b.box(rot(p, 0, 0, 0.54), 2.04, H, 0.96, { mat: 'concrete', collide: false }); b.box(rot(p, -0.54, 0, -0.54), 0.96, H, 1.08, { mat: 'concrete', collide: false }); }
    else b.box(p, s, H, d, { mat: 'concrete', collide: false });
  });
}

export function bench(b: Builder, p: Place, L = 2) {
  b.box(p, L, 0.42, 0.5, { mat: 'wood', name: 'bench' });
  b.box(rot(p, 0, 0.42, 0.22), L, 0.45, 0.08, { mat: 'wood', name: 'bench_back' });   // V5 T5-11 (REV04-013): respaldo sólido
}

/** Cono de entrenamiento (HUM-A4-005): V3 era decorativo (`collide: false`); V4 es SÓLIDO. V5 T5-14 (OPUS-021): collider
 *  CILINDRO (radio 0,2, alto 0,5) en vez de cono: el cono desviaba 0,37 m de lado al andar contra él (y se cruzaba); el
 *  cilindro 0,14 m y bloquea (ensayo en `T5-14/runs/collision-inventory_b1`). Sin estrella (lista `noImpact`). */
export function cone(b: Builder, p: Place) {
  const g = new THREE.ConeGeometry(0.2, 0.5, 10); g.translate(0, 0.25, 0);
  b.decor(g, p, 'fuchsia');
  b.box(p, 0.42, 0.04, 0.42, { mat: 'black', collide: false });
  const c = b.addCollider(RAPIER.ColliderDesc.cylinder(0.25, 0.2).setTranslation(p.x, (p.y ?? 0) + 0.25, p.z), 'cone', 'small');
  b.thin.add(c.handle);
  return c;
}

export function speaker(b: Builder, p: Place, w = 1.1, h = 2.4, d = 0.8) {
  const draw = () => {
    b.box(p, w, h, d, { mat: 'black_matte', collide: false });
    for (let i = 0; i < 2; i++) { const g = new THREE.CircleGeometry(w * 0.34, 16); g.translate(0, h * (0.3 + i * 0.42), d / 2 + 0.01); b.decor(g, p, 'grille'); }
  };
  if (w > 1.4) { b.solid(p, w, h, d, 'speaker'); const c = b.chunk; draw(); b.chunk = c; return; }   // pila ancha: sigue procedural
  // caja de altavoz con derivado (escala uniforme): la colisión toma las proporciones del derivado (1,0 × 1,7 × 0,74)
  w = h * 0.586; d = h * 0.433;
  b.solid(p, w, h, d, 'speaker');
  proxy(b, 'speaker', p, h, draw);
}

export function truss(b: Builder, p: Place, L = 8, H = 3.6) {
  for (const sx of [-L / 2, L / 2]) b.box(rot(p, sx, 0, 0), 0.3, H, 0.3, { mat: 'steel', name: 'truss' });
  b.box(rot(p, 0, H, 0), L + 0.3, 0.3, 0.3, { mat: 'steel', collide: false });
  for (let i = 0; i < 5; i++) b.box(rot(p, -L / 2 + 0.8 + i * (L - 1.6) / 4, H - 0.25, 0.05), 0.24, 0.24, 0.3, { mat: i % 2 ? 'neon_pink' : 'neon_blue', collide: false, shadow: false });
}

export function railing(b: Builder, p: Place, L: number, H = 1.0, mat = 'black', collide = true) {
  const n = Math.max(2, Math.round(L / 1.5) + 1);
  for (let k = 0; k < n; k++) b.cylinder(rot(p, -L / 2 + k * L / (n - 1), 0, 0), 0.03, H, { mat, seg: 6 });
  const g = new THREE.CylinderGeometry(0.035, 0.035, L, 8); g.rotateZ(Math.PI / 2); g.translate(0, H, 0);
  b.decor(g, p, mat);
  const g2 = new THREE.CylinderGeometry(0.02, 0.02, L, 6); g2.rotateZ(Math.PI / 2); g2.translate(0, H * 0.5, 0);
  b.decor(g2, p, mat);
  if (collide) b.solid(p, L, H, 0.1, 'railing');
}

export function sprayCans(b: Builder, p: Place) {
  const cols = ['fuchsia', 'turquoise', 'yellow', 'black'];
  cols.forEach((c, i) => { const g = new THREE.CylinderGeometry(0.035, 0.035, 0.2, 8); g.translate(i * 0.1 - 0.15, 0.1, (i % 2) * 0.07); b.decor(g, p, c); });
}

/** Limusina rosa alargada (estática, en el puente). Longitud L, frente hacia +Z local. */
export function limo(b: Builder, p: Place, L = 7.2) {
  const W = 2.0;
  b.solid(rot(p, 0, 0, 0), W, 1.1, L, 'limo'); b.solid(rot(p, 0, 1.1, -0.2), W * 0.92, 0.62, L * 0.78, 'limo_top');   // colisión (siempre)
  // aspecto: derivado de la limusina Meshy (ASSET-03); este bloque es el proxy si no carga
  proxy(b, 'limo', p, L, () => {
    b.box(rot(p, 0, 0.35, 0), W, 0.75, L, { mat: 'pink', collide: false });
    b.box(rot(p, 0, 1.1, -0.2), W * 0.92, 0.62, L * 0.78, { mat: 'pink', collide: false });
    b.box(rot(p, 0, 1.15, -0.2), W * 0.94, 0.42, L * 0.74, { mat: 'glass', collide: false, shadow: false });
    b.box(rot(p, 0, 0.5, L / 2 - 0.02), W * 0.9, 0.22, 0.06, { mat: 'steel', collide: false });
    b.box(rot(p, 0, 0.5, -L / 2 + 0.02), W * 0.9, 0.22, 0.06, { mat: 'steel', collide: false });
    for (const sx of [-1, 1]) for (const sz of [L / 2 - 1.1, -L / 2 + 1.1, 0.4]) {
      const g = new THREE.CylinderGeometry(0.36, 0.36, 0.28, 14); g.rotateZ(Math.PI / 2); g.translate(sx * (W / 2 - 0.06), 0.36, sz);
      b.decor(g, p, 'black_matte');
    }
    for (const sx of [-0.65, 0.65]) b.box(rot(p, sx, 0.62, L / 2 + 0.01), 0.36, 0.14, 0.04, { mat: 'neon_warm', collide: false, shadow: false });
  });
}

/** Coche de drifting sencillo compartido (dos pinturas): devuelve un grupo animable con ruedas. */
export function driftCar(paint: THREE.Material, mats: { get(k: string): THREE.Material }) {
  const g = new THREE.Group();
  const add = (geo: THREE.BufferGeometry, m: THREE.Material, x = 0, y = 0, z = 0) => { const me = new THREE.Mesh(geo, m); me.position.set(x, y, z); me.castShadow = true; g.add(me); return me; };
  const L = 4.3, W = 1.85;
  add(boxUV(W, 0.55, L), paint, 0, 0.55, 0);
  add(boxUV(W * 0.86, 0.5, L * 0.5), paint, 0, 1.05, -0.25);
  add(boxUV(W * 0.88, 0.36, L * 0.46), mats.get('glass'), 0, 1.07, -0.25);
  add(boxUV(W * 1.02, 0.12, 0.3), mats.get('black'), 0, 0.95, -L / 2 + 0.1);   // alerón
  add(boxUV(W * 0.9, 0.16, 0.06), mats.get('neon_warm'), 0, 0.62, L / 2 + 0.01);
  add(boxUV(W * 0.9, 0.12, 0.06), mats.get('neon_pink'), 0, 0.66, -L / 2 - 0.01);
  const wheels: THREE.Mesh[] = [];
  for (const sx of [-1, 1]) for (const sz of [1.35, -1.35]) {
    const wg = new THREE.CylinderGeometry(0.34, 0.34, 0.26, 12); wg.rotateZ(Math.PI / 2);
    const w = add(wg, mats.get('black_matte'), sx * (W / 2 - 0.02), 0.34, sz); wheels.push(w);
  }
  g.userData.wheels = wheels;
  return g;
}

export function mulberry(a: number) { return () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
export { v3, rot };
