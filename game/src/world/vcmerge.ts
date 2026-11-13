// V10 · rendimiento (D-EX-02): una malla de vegetación o atrezzo con VARIAS primitivas de color liso (p. ej. el arbusto floral de NMG:
// 7 materiales lima/oliva/tallo/flor) se dibuja con UNA geometría y el color en los vértices. Los materiales lisos de estas mallas
// comparten rugosidad y metal, así que el aspecto es el mismo (color lineal × luz) y cada instancia pasa de N llamadas a 1.
// Las primitivas con textura, transparencia o emisión se quedan como estaban (se devuelven aparte).
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

const MATS = new Map<string, THREE.MeshStandardMaterial>();
/** Material compartido de color por vértice (uno por rugosidad/metal/lado). */
export function vcMaterial(rough: number, metal: number, side: THREE.Side = THREE.FrontSide) {
  const k = `${rough.toFixed(3)}|${metal.toFixed(3)}|${side}`;
  let m = MATS.get(k);
  if (!m) { m = new THREE.MeshStandardMaterial({ color: 0xffffff, vertexColors: true, roughness: rough, metalness: metal, side }); m.name = `M_vc_${k}`; MATS.set(k, m); }
  return m;
}
const flat = (m: any) => m && m.isMeshStandardMaterial && !m.map && !m.emissiveMap && !m.alphaMap && !m.normalMap && !m.transparent && m.opacity === 1 && m.alphaTest === 0
  && (!m.emissive || m.emissive.r + m.emissive.g + m.emissive.b === 0) && !m.vertexColors;

export interface VcPart { geometry: THREE.BufferGeometry; material: THREE.Material; matrix: THREE.Matrix4; }
/** Recorre `root` (con matrixWorld actualizado): devuelve las partes a dibujar. Las lisas que comparten rugosidad/metal/lado se funden
 *  en una geometría (en el espacio de `root`, matriz identidad); las demás salen tal cual con su matrixWorld. */
export function vcParts(root: THREE.Object3D): VcPart[] {
  const groups = new Map<string, { mat: THREE.MeshStandardMaterial; geos: THREE.BufferGeometry[] }>(), rest: VcPart[] = [];
  root.traverse((o: any) => {
    if (!o.isMesh) return;
    const m = o.material;
    if (Array.isArray(m) || !flat(m)) { rest.push({ geometry: o.geometry, material: m, matrix: o.matrixWorld.clone() }); return; }
    const vm = vcMaterial(m.roughness, m.metalness, m.side), k = vm.name;
    let g = o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone();
    for (const a of Object.keys(g.attributes)) if (a !== 'position' && a !== 'normal') g.deleteAttribute(a);
    // las mallas optimizadas vienen CUANTIZADAS (enteros normalizados; la escala va en el nodo): se pasan a coma flotante ANTES de aplicar
    // la matriz (si no, las coordenadas fuera de ±1 se recortan y una palmera de 6 m queda como un bloque)
    for (const a of ['position', 'normal'] as const) { const at = g.attributes[a]; if (!at) continue;
      const f = new Float32Array(at.count * 3); for (let i = 0; i < at.count; i++) { f[i * 3] = at.getX(i); f[i * 3 + 1] = at.getY(i); f[i * 3 + 2] = at.getZ(i); }
      g.setAttribute(a, new THREE.BufferAttribute(f, 3)); }
    if (!g.attributes.normal) g.computeVertexNormals();
    g.applyMatrix4(o.matrixWorld);
    const n = g.attributes.position.count, c = new Float32Array(n * 3), col = m.color as THREE.Color;
    for (let i = 0; i < n; i++) { c[i * 3] = col.r; c[i * 3 + 1] = col.g; c[i * 3 + 2] = col.b; }
    g.setAttribute('color', new THREE.BufferAttribute(c, 3));
    let e = groups.get(k); if (!e) { e = { mat: vm, geos: [] }; groups.set(k, e); }
    e.geos.push(g);
  });
  const out: VcPart[] = [];
  for (const { mat, geos } of groups.values()) { const g = geos.length === 1 ? geos[0] : mergeGeometries(geos, false); if (!g) continue; g.computeBoundingSphere(); out.push({ geometry: g, material: mat, matrix: new THREE.Matrix4() }); }
  return out.concat(rest);
}
