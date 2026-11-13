// Formas puras (sin DOM ni física): cajas con UV en metros, extrusión de perfiles y perfiles de rampas.
// Se pueden probar en Node (tools/test-shapes.mjs).
import * as THREE from 'three';

/** Caja con UV en metros por cara (las texturas se repiten sin estirarse). */
export function boxUV(w: number, h: number, d: number, uvScale = 1) {
  const g = new THREE.BoxGeometry(w, h, d);
  const uv = g.attributes.uv as THREE.BufferAttribute;
  const n = g.attributes.normal as THREE.BufferAttribute;
  const p = g.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < uv.count; i++) {
    const nx = Math.abs(n.getX(i)), ny = Math.abs(n.getY(i));
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    let u: number, v: number;
    if (nx > 0.5) { u = z; v = y; } else if (ny > 0.5) { u = x; v = z; } else { u = x; v = y; }
    uv.setXY(i, u * uvScale * 0.5, v * uvScale * 0.5);
  }
  return g;
}

export function flipWinding(g: THREE.BufferGeometry) {
  const idx = g.index!; for (let i = 0; i < idx.count; i += 3) { const a = idx.getX(i + 1); idx.setX(i + 1, idx.getX(i + 2)); idx.setX(i + 2, a); }
}

/** Extruye un perfil cerrado (lista de [z, y] en sentido antihorario visto desde +X) a lo ancho en X centrado. */
export function extrudeProfile(profile: [number, number][], width: number, uvScale = 1) {
  // orientación canónica: antihorario en (z, y)
  if (THREE.ShapeUtils.isClockWise(profile.map(([z, y]) => new THREE.Vector2(z, y)))) profile = [...profile].reverse();
  const pos: number[] = [], uvs: number[] = [], idx: number[] = [];
  const n = profile.length;
  const hw = width / 2;
  // superficie lateral (cada arista del perfil se extruye en X)
  let acc = 0;
  for (let i = 0; i < n; i++) {
    const [z0, y0] = profile[i], [z1, y1] = profile[(i + 1) % n];
    const len = Math.hypot(z1 - z0, y1 - y0);
    const b = pos.length / 3;
    pos.push(-hw, y0, z0, hw, y0, z0, -hw, y1, z1, hw, y1, z1);
    uvs.push(-hw * uvScale * 0.5, acc * uvScale * 0.5, hw * uvScale * 0.5, acc * uvScale * 0.5, -hw * uvScale * 0.5, (acc + len) * uvScale * 0.5, hw * uvScale * 0.5, (acc + len) * uvScale * 0.5);
    idx.push(b, b + 2, b + 1, b + 1, b + 2, b + 3);
    acc += len;
  }
  // tapas: triangulación del polígono (perfiles monótonos simples)
  const shape = new THREE.Shape(profile.map(([z, y]) => new THREE.Vector2(z, y)));
  const tris = THREE.ShapeUtils.triangulateShape(shape.getPoints(), []);
  for (const side of [-1, 1]) {
    const b = pos.length / 3;
    for (const [z, y] of profile) { pos.push(side * hw, y, z); uvs.push(z * uvScale * 0.5, y * uvScale * 0.5); }
    for (const t of tris) side > 0 ? idx.push(b + t[0], b + t[1], b + t[2]) : idx.push(b + t[0], b + t[2], b + t[1]);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  flipWinding(g); g.computeVertexNormals(); // la construcción sale hacia dentro en sentido antihorario
  return g;
}

// ---------------------------------------------------------------- perfiles de rampas (z hacia delante, y arriba)
/** Kicker/funbox: subida curva → mesa → bajada. Empieza en z=0 a nivel de suelo. */
export function funboxProfile(Hk: number, Lk: number, deck: number, Ll: number): [number, number][] {
  const pts: [number, number][] = [[0, 0]];
  const n = 12, R = (Lk * Lk + Hk * Hk) / (2 * Hk);
  for (let i = 1; i <= n; i++) { const y = Lk * i / n; pts.push([y, Math.min(Hk, R - Math.sqrt(Math.max(R * R - y * y, 0)))]); }
  pts.push([Lk + deck, Hk]);
  for (let i = 1; i <= n; i++) { const t = i / n; pts.push([Lk + deck + Ll * t, Hk * (1 - (3 * t * t - 2 * t * t * t))]); }
  return closeBottom(pts);
}
/** Kicker de un solo lado (lanzadera curva) con plataforma trasera y caída vertical. */
export function kickerProfile(H: number, L: number, deck = 0.6): [number, number][] {
  const pts: [number, number][] = [[0, 0]];
  const n = 12, R = (L * L + H * H) / (2 * H);
  for (let i = 1; i <= n; i++) { const z = L * i / n; pts.push([z, Math.min(H, R - Math.sqrt(Math.max(R * R - z * z, 0)))]); }
  pts.push([L + deck, H]);
  return closeBottom(pts);
}
/** Rampa recta (plano inclinado) con plataforma. */
export function bankProfile(H: number, L: number, deck = 0): [number, number][] {
  const pts: [number, number][] = [[0, 0], [L, H]];
  if (deck > 0) pts.push([L + deck, H]);
  return closeBottom(pts);
}
/** Bank con los extremos suavizados (NMG pieza 02, geometry.json: run 2,6, H 0,6, transición de 0,25 m en cada extremo). */
export function smoothBankProfile(H = 0.6, L = 2.6, blend = 0.25): [number, number][] {
  const pts: [number, number][] = [];
  const m = H / (L - blend);                       // pendiente del tramo recto (las transiciones parabólicas suman blend)
  for (let i = 0; i <= 5; i++) { const t = i / 5 * blend; pts.push([t, (m / (2 * blend)) * t * t]); }
  for (let i = 5; i >= 0; i--) { const t = i / 5 * blend; pts.push([L - t, H - (m / (2 * blend)) * t * t]); }
  return closeBottom(pts);
}
/** Quarterpipe: transición circular (sin llegar a vertical) + plataforma. */
export function quarterProfile(H: number, R: number, deck = 1.2): [number, number][] {
  const pts: [number, number][] = [[0, 0]];
  const n = 14, th = H < R ? Math.acos(1 - H / R) : Math.PI / 2;
  for (let i = 1; i <= n; i++) { const a = i / n * th; pts.push([R * Math.sin(a), R - R * Math.cos(a)]); }
  const ztop = pts[pts.length - 1][0];
  pts.push([ztop + deck, H]);
  return closeBottom(pts);
}
function closeBottom(pts: [number, number][]): [number, number][] {
  const last = pts[pts.length - 1];
  if (last[1] > 0) pts.push([last[0], 0]);
  // invertir para sentido antihorario visto desde +X (z hacia delante, y arriba): fondo primero
  return pts.reverse();
}
