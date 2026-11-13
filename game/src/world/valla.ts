// V10.3 R1 (W04, W-D05, W-D07): valla de circuito alrededor del asfalto de SECRETNOVIO, en el borde del paseo rosa interior.
// Como la foto de referencia del usuario (circuito de carreras) en el estilo del juego: muro bajo de hormigón crema por paneles (~1 m),
// encima una malla metálica alta y tupida con cables horizontales y postes negros que arriba se doblan hacia dentro (hacia la pista).
// Hecha en código (sin arte nuevo): paneles y postes con el constructor (pocas llamadas de dibujo por material) y la malla con una textura
// de rombos dibujada en un lienzo (transparente, con mipmaps: de lejos se ve como una veladura gris). Colisión: una caja por panel hasta
// 3,6 m (no se puede saltar ni hacer ollie por encima). A 20 patatas se hunde en el suelo dentro de la revelación (Park.setCenter) y sus
// colisiones se quitan al empezar a bajar (nadie se queda encerrado).
import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import { Builder } from './geo';
import type { Park } from './park';

export const VALLA = {
  rIn: 22.0,        // cara interior del muro (lado de la pista); los coches barren hasta r ≈ 21,0 (caja) / 21,6 (envolvente)
  depth: 0.28,      // grosor del muro
  wallH: 1.0,       // muro bajo de hormigón
  meshTop: 3.1,     // malla vertical hasta aquí
  bendIn: 0.45,     // el tramo de arriba se dobla hacia la pista…
  bendTop: 3.62,    // …hasta esta altura
  colH: 3.6,        // altura de la colisión
  panels: 48,       // paneles de ~2,9 m
  sink: 3.9,        // lo que baja al hundirse (queda entero bajo el suelo)
};
export const VALLA_R_OUT = VALLA.rIn + VALLA.depth;

export interface VallaDyn { group: THREE.Group; colliders: RAPIER.Collider[] }

/** Malla de rombos (alambre blanco sobre transparente; el color lo pone el material). 0,5 m por repetición, rombos de ~5 cm. */
function chainLinkTexture() {
  const S = 256, c = document.createElement('canvas'); c.width = c.height = S;
  const g = c.getContext('2d')!; g.clearRect(0, 0, S, S); g.strokeStyle = '#ffffff'; g.lineWidth = 3.2; g.lineCap = 'round';
  const n = 10, p = S / n;
  for (let i = -n; i <= 2 * n; i++) {
    g.beginPath(); g.moveTo(i * p, 0); g.lineTo(i * p + S, S); g.stroke();
    g.beginPath(); g.moveTo(i * p, S); g.lineTo(i * p + S, 0); g.stroke();
  }
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 8; t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export function registerVallaMaterials(P: Park) {
  P.mats.set('valla_hormigon', new THREE.MeshStandardMaterial({ map: (P.mats.get('concrete_grey') as THREE.MeshStandardMaterial).map, color: '#fbf3e3', roughness: 0.9 }));
  P.mats.set('valla_junta', new THREE.MeshStandardMaterial({ color: '#8f8676', roughness: 0.95 }));
  P.mats.set('valla_poste', new THREE.MeshStandardMaterial({ color: '#1e1d22', roughness: 0.42, metalness: 0.7 }));
  P.mats.set('valla_malla', new THREE.MeshStandardMaterial({ map: chainLinkTexture(), color: '#6f747c', roughness: 0.45, metalness: 0.55,
    transparent: true, alphaTest: 0.02, depthWrite: false, side: THREE.DoubleSide }));
}

export function buildValla(P: Park): VallaDyn {
  const V = VALLA, b = new Builder(P.world, P.mats); b.chunk = 'valla';
  const N = V.panels, rMid = V.rIn + V.depth / 2, step = Math.PI * 2 / N;
  const at = (r: number, a: number, y = 0) => new THREE.Vector3(r * Math.cos(a), y, r * Math.sin(a));
  const yawOf = (a: number) => { const tx = -Math.sin(a), tz = Math.cos(a); return Math.atan2(-tz, tx); };   // eje x local = tangente
  const chord = 2 * rMid * Math.sin(step / 2);
  const rPost = V.rIn + V.depth * 0.62, rMesh = V.rIn + V.depth * 0.42;
  const meshPos: number[] = [], meshUv: number[] = [];
  const quad = (a: THREE.Vector3, bq: THREE.Vector3, c: THREE.Vector3, d: THREE.Vector3, ua: number, ub: number, va: number, vb: number) => {
    // a-b abajo, d-c arriba
    meshPos.push(a.x, a.y, a.z, bq.x, bq.y, bq.z, c.x, c.y, c.z, a.x, a.y, a.z, c.x, c.y, c.z, d.x, d.y, d.z);
    meshUv.push(ua, va, ub, va, ub, vb, ua, va, ub, vb, ua, vb);
  };
  const TILE = 0.5; let arc = 0;
  for (let i = 0; i < N; i++) {
    const a = i * step, ac = a + step / 2, yaw = yawOf(ac), c = at(rMid, ac);
    // panel de hormigón (3 cm de junta entre paneles) + junta oscura metida detrás
    b.box({ x: c.x, z: c.z, yaw }, chord - 0.03, V.wallH, V.depth, { mat: 'valla_hormigon', collide: false, uv: 0.5 });
    { const j = at(rMid - 0.02, a); b.box({ x: j.x, z: j.z, yaw: yawOf(a) }, 0.06, V.wallH - 0.04, V.depth - 0.08, { mat: 'valla_poste', collide: false, shadow: false }); }
    // remate del muro: canto algo más ancho
    b.box({ x: c.x, y: V.wallH - 0.06, z: c.z, yaw }, chord - 0.03, 0.06, V.depth + 0.04, { mat: 'valla_hormigon', collide: false, uv: 0.5 });
    // colisión del panel: muro + malla hasta 3,6 m (algo más larga que la cuerda: sin rendijas)
    b.solid({ x: c.x, z: c.z, yaw }, chord + 0.04, V.colH, V.depth, 'sn_fence', 'solid');
    // poste en el arranque del panel: tramo vertical + tramo doblado hacia la pista
    { const p0 = at(rPost, a, V.wallH), p1 = at(rPost, a, V.meshTop), p2 = at(rPost - V.bendIn, a, V.bendTop);
      const post = (q0: THREE.Vector3, q1: THREE.Vector3) => { const L = q0.distanceTo(q1), g = new THREE.BoxGeometry(0.085, L, 0.085); g.translate(0, L / 2, 0);
        const m = new THREE.Matrix4().makeRotationFromQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), q1.clone().sub(q0).normalize()));
        g.applyMatrix4(m); b.decor(g, { x: q0.x, y: q0.y, z: q0.z }, 'valla_poste', { shadow: false }); };   // (sin sombra: perf-v8)
      post(p0, p1); post(p1, p2); }
    // malla del panel (vertical y tramo doblado) a lo largo de la cuerda entre postes
    { const a0 = a, a1 = a + step, L = 2 * rMesh * Math.sin(step / 2);
      const u0 = arc / TILE, u1 = (arc + L) / TILE;
      quad(at(rMesh, a0, V.wallH), at(rMesh, a1, V.wallH), at(rMesh, a1, V.meshTop), at(rMesh, a0, V.meshTop), u0, u1, V.wallH / TILE, V.meshTop / TILE);
      const bendL = Math.hypot(V.bendIn, V.bendTop - V.meshTop);
      quad(at(rMesh, a0, V.meshTop), at(rMesh, a1, V.meshTop), at(rMesh - V.bendIn, a1, V.bendTop), at(rMesh - V.bendIn, a0, V.bendTop), u0, u1, V.meshTop / TILE, (V.meshTop + bendL) / TILE);
      arc += L; }
    // cables horizontales (lado de la pista de la malla) y el del canto de arriba
    for (const [r, y] of [[rMesh - 0.03, 1.5], [rMesh - 0.03, 2.3], [rMesh - 0.03, V.meshTop - 0.02], [rMesh - V.bendIn - 0.02, V.bendTop - 0.02]] as [number, number][]) {
      const q0 = at(r, a, y), q1 = at(r, a + step, y), L = q0.distanceTo(q1), g = new THREE.BoxGeometry(L + 0.02, 0.018, 0.018);
      const mid = q0.clone().add(q1).multiplyScalar(0.5); b.decor(g, { x: mid.x, y: mid.y, z: mid.z, yaw: yawOf(a + step / 2) }, 'valla_poste', { shadow: false });
    }
  }
  const group = b.finish(); group.name = 'SN_FENCE';
  { const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(meshPos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(meshUv, 2)); g.computeVertexNormals();
    const m = new THREE.Mesh(g, P.mats.get('valla_malla')); m.name = 'SN_FENCE_MESH'; m.castShadow = false; m.receiveShadow = false; m.renderOrder = 2; group.add(m); }
  P.root.add(group);
  const cols = b.colliders.map((x) => { P.nameCollider(x.c.handle, x.name); return x.c; });
  return { group, colliders: cols };
}
