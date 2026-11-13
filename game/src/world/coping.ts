// V10.3 R5 (U-09, W-D25): remate metálico (coping) donde faltaba —quarter de SN, cajones y U de NMG, R1 y B1 de NVDA—. Solo DECORATIVO
// (W-D25: «se ve como los demás, no se grinda»): tubo de acero sin colisión y fuera de `P.rails` (el grind no lo ve; `surfaceAt` solo da
// metal en los raíles). Material `steel` (con los reflejos del entorno de U-08).
import * as THREE from 'three';
import { Builder } from './geo';

/** Tubo de radio `r` entre dos puntos del mundo (o del marco del constructor). */
export function copingPipe(b: Builder, A: THREE.Vector3, B: THREE.Vector3, r = 0.03, mat = 'steel') {
  const L = A.distanceTo(B); if (L < 1e-3) return;
  const g = new THREE.CylinderGeometry(r, r, L, 10, 1);
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), B.clone().sub(A).normalize()));
  const m = A.clone().add(B).multiplyScalar(0.5); g.translate(m.x, m.y, m.z);
  b.decor(g, { x: 0, z: 0 }, mat, { shadow: false, name: 'coping_decor' });
}
