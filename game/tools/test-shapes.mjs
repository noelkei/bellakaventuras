// Comprueba que las piezas extruidas tienen las caras hacia fuera (colisión y sombreado correctos).  node tools/test-shapes.mjs
import * as THREE from 'three';
import { extrudeProfile, funboxProfile, kickerProfile, bankProfile, quarterProfile } from '../src/world/shapes.ts';
let fail = 0;
function check(name, prof) {
  const g = extrudeProfile(prof, 2, 1);
  const p = g.attributes.position, idx = g.index; let bad = 0, n = 0;
  // test por rayo: el punto 1 cm fuera a lo largo de la normal no debe estar dentro del sólido (perfil 2D + |x|<1)
  const poly = prof.map(([z, y]) => new THREE.Vector2(z, y));
  const inside = (q) => Math.abs(q.x) < 1 - 1e-6 && pointInPoly(new THREE.Vector2(q.z, q.y), poly);
  for (let i = 0; i < idx.count; i += 3) {
    const a = new THREE.Vector3().fromBufferAttribute(p, idx.getX(i)), b = new THREE.Vector3().fromBufferAttribute(p, idx.getX(i + 1)), d = new THREE.Vector3().fromBufferAttribute(p, idx.getX(i + 2));
    const nn = b.clone().sub(a).cross(d.clone().sub(a)); if (nn.length() < 1e-9) continue; nn.normalize();
    const m = a.clone().add(b).add(d).divideScalar(3); n++;
    if (inside(m.clone().addScaledVector(nn, 0.01))) bad++;
  }
  console.log(name.padEnd(10), 'tris', n, 'hacia dentro', bad); if (bad) fail++;
}
function pointInPoly(pt, poly) { let c = false; for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) { const a = poly[i], b = poly[j]; if ((a.y > pt.y) !== (b.y > pt.y) && pt.x < (b.x - a.x) * (pt.y - a.y) / (b.y - a.y) + a.x) c = !c; } return c; }
check('box ccw', [[0, 0], [2, 0], [2, 1], [0, 1]]);
check('box cw', [[0, 1], [2, 1], [2, 0], [0, 0]]);
check('funbox', funboxProfile(1.1, 2.6, 3.4, 3));
check('kicker', kickerProfile(1.6, 3.2));
check('bank', bankProfile(1, 3, 1));
check('quarter', quarterProfile(1.6, 2.2, 1.2));
console.log(fail ? 'SHAPES FALLO' : 'SHAPES OK'); process.exit(fail ? 1 : 0);
