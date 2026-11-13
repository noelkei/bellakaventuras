// V10 · vegetación por distancia (D-EX-07). El exterior repite ~2.600 plantas (la maqueta aprobada) y los presupuestos de perf-v8 no
// admiten dibujarlas todas con la malla del juego. Cada instancia va en UNO de tres niveles según su distancia (plana) a la cámara:
//   · cerca (< NEAR m): la malla del juego;
//   · media (< MID m): la versión diezmada por receta (si la familia no tiene, la misma malla);
//   · lejos: una cúpula facetada del color de la planta (todas las familias de mata en una sola malla por cuadrante) o, para palmeras y
//     árboles, su versión diezmada.
// Las listas se rehacen cuando la cámara se mueve más de STEP m (barato: solo matrices). El número de llamadas de dibujo es fijo y
// pequeño (una por familia y nivel ocupado + cuatro cuadrantes de cúpulas). Mismo aspecto de cerca; a distancia, la mancha de color.
import * as THREE from 'three';
import { vcMaterial, type VcPart } from './vcmerge';

export const VEG_NEAR = 12, VEG_MID = 22;
const STEP = 1.0;

/** Cúpula facetada de radio 1 y alto 1 (base en Y 0), con el color oscureciéndose hacia la base (sombra propia sin luz extra). */
function domeGeometry() {
  const g = new THREE.SphereGeometry(1, 6, 2, 0, Math.PI * 2, 0, Math.PI / 2).toNonIndexed();   // 18 triángulos
  const p = g.attributes.position, c = new Float32Array(p.count * 3);
  for (let i = 0; i < p.count; i++) { const k = 0.55 + 0.45 * p.getY(i); c[i * 3] = c[i * 3 + 1] = c[i * 3 + 2] = k; }
  g.setAttribute('color', new THREE.BufferAttribute(c, 3)); g.deleteAttribute('uv'); g.computeVertexNormals();
  return g;
}
interface Level { meshes: THREE.InstancedMesh[]; idx: Int32Array; n: number; }
interface Fam { name: string; mats: THREE.Matrix4[]; pos: Float32Array; levels: (Level | null)[]; dome: THREE.Matrix4[] | null; color: THREE.Color | null; color2: THREE.Color | null; frac2: number; }

export class VegTiers {
  readonly root = new THREE.Group();
  private fams: Fam[] = [];
  private domes: THREE.InstancedMesh[] = [];
  private last = new THREE.Vector3(1e9, 0, 1e9);
  stats = { near: 0, mid: 0, far: 0, updates: 0 };
  constructor() { this.root.name = 'VEG_TIERS'; }

  /** `mats`: matriz de mundo de cada instancia (la parte se multiplica a la derecha). `far`: 'dome' (cúpula del color medio, con la
   *  caja `domeBox` de la malla) o partes propias. */
  add(name: string, mats: THREE.Matrix4[], near: VcPart[], mid: VcPart[] | null, far: VcPart[] | 'dome', opts: { castShadow?: boolean; domeBox?: THREE.Box3; color?: THREE.Color; color2?: THREE.Color | null; frac2?: number } = {}) {
    const n = mats.length, pos = new Float32Array(n * 2), v = new THREE.Vector3();
    mats.forEach((m, i) => { v.setFromMatrixPosition(m); pos[i * 2] = v.x; pos[i * 2 + 1] = v.z; });
    const mk = (parts: VcPart[], tag: string, shadow: boolean): Level => ({ n: 0, idx: new Int32Array(n), meshes: parts.map((p) => {
      const im = new THREE.InstancedMesh(p.geometry, p.material, n); im.name = `VEG_${name}_${tag}`; im.count = 0; im.visible = false;
      im.castShadow = shadow; im.receiveShadow = true; im.userData.part = p.matrix; this.root.add(im); return im; }) });
    const levels: (Level | null)[] = [mk(near, 'cerca', !!opts.castShadow), mk(mid ?? near, 'media', false), far === 'dome' ? null : mk(far, 'lejos', false)];
    let dome: THREE.Matrix4[] | null = null;
    if (far === 'dome') {
      const b = opts.domeBox!, c = b.getCenter(new THREE.Vector3()), s = b.getSize(new THREE.Vector3());
      const local = new THREE.Matrix4().makeTranslation(c.x, b.min.y, c.z).multiply(new THREE.Matrix4().makeScale(s.x * 0.5, s.y, s.z * 0.5));
      dome = mats.map((m) => m.clone().multiply(local));
    }
    this.fams.push({ name, mats, pos, levels, dome, color: opts.color ?? null, color2: opts.color2 ?? null, frac2: opts.frac2 ?? 0 });
  }
  /** Crea las cuatro mallas de cúpulas (por cuadrante, para que la cámara descarte las que no ve). */
  finalize() {
    const total = this.fams.reduce((a, f) => a + (f.dome ? f.mats.length : 0), 0); if (!total) return;
    const g = domeGeometry(), mat = vcMaterial(0.88, 0);
    for (let q = 0; q < 4; q++) { const im = new THREE.InstancedMesh(g, mat, total); im.name = `VEG_cupulas_${q}`; im.count = 0; im.castShadow = false; im.receiveShadow = true;
      im.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(total * 3), 3); this.domes.push(im); this.root.add(im); }
  }
  /** Reparte las instancias por nivel según la cámara (solo si se ha movido más de STEP m o `force`). */
  update(cam: THREE.Vector3, force = false) {
    const dx0 = cam.x - this.last.x, dz0 = cam.z - this.last.z;
    if (!force && dx0 * dx0 + dz0 * dz0 < STEP * STEP) return;
    this.last.copy(cam); this.stats.updates++;
    const M = new THREE.Matrix4(), dn = [0, 0, 0, 0]; let nN = 0, nM = 0, nF = 0;
    for (const f of this.fams) {
      for (const L of f.levels) if (L) L.n = 0;
      for (let i = 0; i < f.mats.length; i++) {
        const dx = f.pos[i * 2] - cam.x, dz = f.pos[i * 2 + 1] - cam.z, d2 = dx * dx + dz * dz;
        const t = d2 < VEG_NEAR * VEG_NEAR ? 0 : d2 < VEG_MID * VEG_MID ? 1 : 2;
        if (t === 2 && f.dome) { const q = (f.pos[i * 2] >= 0 ? 1 : 0) + (f.pos[i * 2 + 1] >= 0 ? 2 : 0), im = this.domes[q], k = dn[q]++;
          const col = f.color2 && domeHash(i) < f.frac2 ? f.color2 : f.color!;   // IT3 (Codex EX-1): reparto verde/flor entre cúpulas
          im.setMatrixAt(k, f.dome[i]); im.instanceColor!.setXYZ(k, col.r, col.g, col.b); nF++; continue; }
        const L = f.levels[t]!; L.idx[L.n++] = i; if (t === 0) nN++; else if (t === 1) nM++; else nF++;
      }
      for (const L of f.levels) if (L) for (const im of L.meshes) {
        for (let k = 0; k < L.n; k++) { M.multiplyMatrices(f.mats[L.idx[k]], im.userData.part); im.setMatrixAt(k, M); }
        im.count = L.n; im.visible = L.n > 0; im.instanceMatrix.needsUpdate = true; if (L.n) im.computeBoundingSphere();
      }
    }
    this.domes.forEach((im, q) => { im.count = dn[q]; im.visible = dn[q] > 0; im.instanceMatrix.needsUpdate = true; im.instanceColor!.needsUpdate = true; if (dn[q]) im.computeBoundingSphere(); });
    this.stats.near = nN; this.stats.mid = nM; this.stats.far = nF;
  }
}

/** IT3 (Codex EX-1: «la cascada floral se convierte en masas aisladas… como pegotes magenta»): los dos colores de más área y la fracción
 *  del segundo sobre ambos; las cúpulas lejanas se reparten entre los dos (fijo por instancia), sin triángulos nuevos. */
export function twoColors(parts: VcPart[]) {
  const acc = areaByColor(parts); const e = [...acc.values()].sort((x, y) => y[0] - x[0]);
  if (e.length < 2) return { color: e[0]?.[1] ?? new THREE.Color(0.25, 0.45, 0.1), color2: null, frac2: 0 };
  return { color: e[0][1], color2: e[1][1], frac2: e[1][0] / (e[0][0] + e[1][0]) };
}
const domeHash = (i: number) => ((Math.imul(i + 1, 2654435761) >>> 0) % 1000) / 1000;
function areaByColor(parts: VcPart[]) {
  const acc = new Map<string, [number, THREE.Color]>(); const a = new THREE.Vector3(), bb = new THREE.Vector3(), c = new THREE.Vector3();
  for (const p of parts) { const P = p.geometry.attributes.position, C = p.geometry.attributes.color; if (!C) continue;
    for (let i = 0; i + 2 < P.count; i += 3) { a.fromBufferAttribute(P, i); bb.fromBufferAttribute(P, i + 1); c.fromBufferAttribute(P, i + 2);
      const ar = bb.sub(a).cross(c.sub(a)).length() * 0.5, k = `${C.getX(i).toFixed(3)},${C.getY(i).toFixed(3)},${C.getZ(i).toFixed(3)}`;
      const e = acc.get(k); if (e) e[0] += ar; else acc.set(k, [ar, new THREE.Color(C.getX(i), C.getY(i), C.getZ(i))]); } }
  return acc;
}
/** Color dominante (el de más área) de las partes de color por vértice: el de la cúpula lejana (la media de verde y flor saldría parda). */
export function meanColor(parts: VcPart[]) {
  let best: [number, THREE.Color] | null = null; for (const e of areaByColor(parts).values()) if (!best || e[0] > best[0]) best = e;
  return best ? best[1] : new THREE.Color(0.25, 0.45, 0.1);
}

/** Sustituto lejano de una palmera (D-EX-07) a partir de su propia malla de color por vértice: tronco hexagonal ahusado del color de las
 *  bandas, desde la base hasta la corona (sigue la inclinación de la palmera inclinada), y siete hojas en estrella del verde dominante,
 *  caídas hacia fuera. ~40 triángulos frente a 1.832. Mismo espacio que las partes (se instancia con las mismas matrices). */
export function palmProxy(parts: VcPart[]): VcPart[] {
  const P: THREE.Vector3[] = [], C: THREE.Color[] = [];
  for (const p of parts) { const pa = p.geometry.attributes.position, ca = p.geometry.attributes.color; if (!ca) continue;
    for (let i = 0; i < pa.count; i++) { P.push(new THREE.Vector3().fromBufferAttribute(pa, i).applyMatrix4(p.matrix)); C.push(new THREE.Color(ca.getX(i), ca.getY(i), ca.getZ(i))); } }
  if (!P.length) return parts;
  const isLeaf = (c: THREE.Color) => c.g > c.r * 1.05, trunk = P.filter((_, i) => !isLeaf(C[i])), leaf = P.filter((_, i) => isLeaf(C[i]));
  const ys = trunk.map((v) => v.y).sort((a, b) => a - b), y0 = ys[0], y1 = ys[ys.length - 1], hT = y1 - y0;
  const mean = (a: THREE.Vector3[]) => a.reduce((s, v) => s.add(v), new THREE.Vector3()).multiplyScalar(1 / Math.max(1, a.length));
  const bot = mean(trunk.filter((v) => v.y < y0 + hT * 0.08)), top = mean(trunk.filter((v) => v.y > y1 - hT * 0.08));
  const rad = (a: THREE.Vector3[], c: THREE.Vector3) => a.reduce((s, v) => s + Math.hypot(v.x - c.x, v.z - c.z), 0) / Math.max(1, a.length);
  const rb = Math.max(0.08, rad(trunk.filter((v) => v.y < y0 + hT * 0.08), bot)), rt = Math.max(0.06, rad(trunk.filter((v) => v.y > y1 - hT * 0.08), top));
  const crown = mean(leaf), lr = leaf.map((v) => Math.hypot(v.x - top.x, v.z - top.z)).sort((a, b) => a - b), R = lr[Math.floor(lr.length * 0.85)] ?? 1;
  const ly = leaf.map((v) => v.y).sort((a, b) => a - b), droop = Math.max(0.2, crown.y - (ly[Math.floor(ly.length * 0.1)] ?? crown.y));
  const avg = (cs: THREE.Color[]) => { const c = new THREE.Color(0, 0, 0); for (const x of cs) c.add(x); return c.multiplyScalar(1 / Math.max(1, cs.length)); };
  const cT = avg(C.filter((c) => !isLeaf(c))), cL = meanColor(parts.filter(() => true)).clone();
  const pos: number[] = [], col: number[] = [], tri = (a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3, k: THREE.Color) => { for (const v of [a, b, c]) { pos.push(v.x, v.y, v.z); col.push(k.r, k.g, k.b); } };
  for (let i = 0; i < 6; i++) { const a0 = i / 6 * Math.PI * 2, a1 = (i + 1) / 6 * Math.PI * 2;
    const b0 = new THREE.Vector3(bot.x + rb * Math.cos(a0), bot.y, bot.z + rb * Math.sin(a0)), b1 = new THREE.Vector3(bot.x + rb * Math.cos(a1), bot.y, bot.z + rb * Math.sin(a1));
    const t0 = new THREE.Vector3(top.x + rt * Math.cos(a0), top.y, top.z + rt * Math.sin(a0)), t1 = new THREE.Vector3(top.x + rt * Math.cos(a1), top.y, top.z + rt * Math.sin(a1));
    tri(b0, t0, b1, cT); tri(b1, t0, t1, cT); }
  for (let i = 0; i < 7; i++) { const a = i / 7 * Math.PI * 2 + 0.3, d = new THREE.Vector3(Math.cos(a), 0, Math.sin(a)), s = new THREE.Vector3(-d.z, 0, d.x).multiplyScalar(R * 0.16);
    const base = top.clone().setY(top.y + 0.05), mid = base.clone().addScaledVector(d, R * 0.55).setY(base.y + droop * 0.25), tip = base.clone().addScaledVector(d, R).setY(base.y - droop);
    const m0 = mid.clone().add(s), m1 = mid.clone().sub(s);
    tri(base, m0, m1, cL); tri(m1, m0, tip, cL); tri(base, m1, m0, cL); tri(m1, tip, m0, cL); }   // dos caras (sin culling de cara trasera)
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3)); g.computeVertexNormals(); g.computeBoundingSphere();
  return [{ geometry: g, material: vcMaterial(0.88, 0), matrix: new THREE.Matrix4() }];
}
