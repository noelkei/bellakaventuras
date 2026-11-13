// V10 · NOSVAMOSDEAQUÍ (dossier de diseño v4, Auditoría 9; V10/plan/20_nosvamosdeaqui.md). Sustituye al circuito tutorial V3–V9.
// Contrato ÚNICO `nvda_kit.json` (receta assets/derived/v10/nvda/make_nvda_kit.py desde layout.json + geometria-rg1.json de la planta v8):
// puente P1 a +3,40 con mesetas M1/M2, escalinata E1 (19 alzadas), bajada B1 de perfil coseno, pilar C1, paso agachado T1, rampa R1,
// herradura G1 y el rail RG1 continuo (42,89 m, vuelta horizontal descendente de Ø 2,50, tres ondas). Cada pieza crea su malla y su
// colisión de los mismos números. Marco local del dossier: x tangencial (horario), y radial, h altura; mundo con el eje del sector A:
// X = x·cosA + y·sinA, Z = x·sinA − y·cosA (V10: A = 333°, eje V3–V9 + giro de corona).
import * as THREE from 'three';
import { copingPipe } from './coping';
import RAPIER from '@dimforge/rapier3d-compat';
import KIT from './nvda_kit.json';
import { SECTOR_BY_ID } from './manifest';
import { extrudeProfile, Place } from './geo';
import { palm, rot } from './props';
import { tex, ASSET_BASE } from '../assets';
import type { Park } from './park';

const D2R = Math.PI / 180;
export const NV_KIT = KIT;
type K3 = [number, number, number];

/** Marco de NVDA. `W(x, y, h)` punto del mundo. `PX` coloca piezas con X local = +x y Z local = −y; `PY` con Z local = +y (perfiles
 *  radiales) y X local = −x; `PXZ` con Z local = +x (perfiles tangenciales) y X local = +y. `heading(dx, dy)` rumbo three. */
export function nvFrame() {
  const a = SECTOR_BY_ID.nosvamosdeaqui.axis * D2R, c = Math.cos(a), s = Math.sin(a);
  const W = (x: number, y: number, h = 0) => new THREE.Vector3(x * c + y * s, h, x * s - y * c);
  const at = (x: number, y: number, h: number, yaw: number): Place => { const w = W(x, y, h); return { x: w.x, y: h, z: w.z, yaw }; };
  const PX = (x: number, y: number, h = 0) => at(x, y, h, -a);
  const PY = (x: number, y: number, h = 0) => at(x, y, h, Math.PI - a);
  const PXZ = (x: number, y: number, h = 0) => at(x, y, h, Math.PI / 2 - a);
  const heading = (dx: number, dy: number) => Math.atan2(dx * c + dy * s, dx * s - dy * c);
  /** Mundo → local (x, y). */
  const local = (p: { x: number; z: number }) => ({ x: p.x * c + p.z * s, y: p.x * s - p.z * c });
  return { a, W, PX, PY, PXZ, heading, local };
}

/** V10.1 P14: perfil suave por los puntos dados (spline cúbica monótona de Fritsch–Carlson, tangente 0 en los extremos y en las mesetas):
 *  pasa EXACTAMENTE por cada punto (mismas cotas del kit) y no sobrepasa ninguno (sin chichones). `k` muestras por tramo. */
export function smoothProfile(P: [number, number][], k: number): [number, number][] {
  const n = P.length, d: number[] = [], m: number[] = new Array(n).fill(0);
  for (let i = 0; i < n - 1; i++) d.push((P[i + 1][1] - P[i][1]) / (P[i + 1][0] - P[i][0]));
  for (let i = 1; i < n - 1; i++) m[i] = d[i - 1] * d[i] <= 0 ? 0 : (d[i - 1] + d[i]) / 2;
  for (let i = 0; i < n - 1; i++) { if (d[i] === 0) { m[i] = 0; m[i + 1] = 0; continue; } const a = m[i] / d[i], b = m[i + 1] / d[i], s = a * a + b * b; if (s > 9) { const t = 3 / Math.sqrt(s); m[i] = t * a * d[i]; m[i + 1] = t * b * d[i]; } }
  const out: [number, number][] = [];
  for (let i = 0; i < n - 1; i++) { const [x0, y0] = P[i], [x1, y1] = P[i + 1], h = x1 - x0;
    for (let j = 0; j < k; j++) { const t = j / k, t2 = t * t, t3 = t2 * t; out.push([x0 + h * t, (2 * t3 - 3 * t2 + 1) * y0 + (t3 - 2 * t2 + t) * h * m[i] + (-2 * t3 + 3 * t2) * y1 + (t3 - t2) * h * m[i + 1]]); } }
  out.push(P[n - 1]); return out;
}

/** RG1 en mundo: puntos, longitud acumulada, tangente; muestreo por longitud de arco. */
export function rg1() {
  const F = nvFrame(), R = KIT.rail;
  const pts = (R.pts as K3[]).map(([x, y, h]) => F.W(x, y, h));
  const S = R.s as number[];
  const at = (s: number, out = new THREE.Vector3()) => {
    s = THREE.MathUtils.clamp(s, 0, S[S.length - 1]);
    let i = 1; while (i < S.length - 1 && S[i] < s) i++;
    const t = (s - S[i - 1]) / Math.max(1e-6, S[i] - S[i - 1]);
    return out.lerpVectors(pts[i - 1], pts[i], t);
  };
  const tangent = (s: number, out = new THREE.Vector3()) => { const a = at(s - 0.12), b = at(s + 0.12); return out.subVectors(b, a).normalize(); };
  return { pts, S, length: S[S.length - 1], at, tangent, marks: R.marks_s as Record<string, number>, crossing: R.crossing };
}

export function registerNvMaterials(P: Park) {
  const T = (n: string) => tex(`tex/${n}.webp`);
  P.mats.set('nv_concrete', new THREE.MeshStandardMaterial({ map: T('T_nv_concrete'), roughness: 0.9 }));
  P.mats.set('nv_pink', new THREE.MeshStandardMaterial({ map: T('T_nv_pink_worn'), roughness: 0.82 }));
  P.mats.set('nv_beam', new THREE.MeshStandardMaterial({ color: '#5d7387', roughness: 0.55, metalness: 0.35 }));
  // guardas «claras» y remate de G1: gris azulado claro de los acercamientos aceptados A1–B2 (antes crema y casi negro)
  P.mats.set('nv_guard', new THREE.MeshStandardMaterial({ color: '#a9b9c8', roughness: 0.5, metalness: 0.3 }));
  P.mats.set('nv_rail', new THREE.MeshStandardMaterial({ color: '#ee6fa8', roughness: 0.35, metalness: 0.35 }));
  P.mats.set('nv_coping', new THREE.MeshStandardMaterial({ color: '#8fa3b6', roughness: 0.45, metalness: 0.5 }));
  P.mats.set('nv_post', new THREE.MeshStandardMaterial({ color: '#4f5f6e', roughness: 0.5, metalness: 0.4 }));
  const perf = new THREE.MeshStandardMaterial({ map: T('T_nv_perforado'), alphaTest: 0.4, side: THREE.DoubleSide, roughness: 0.45, metalness: 0.4 });
  perf.map!.repeat.set(1, 1); P.mats.set('nv_bench', perf);
}

export function buildNosVamos(P: Park) {
  const b = P.b, m = P.manifest, id = 'nosvamosdeaqui' as const, F = nvFrame(), K = KIT as any;
  const V = K.vertical, deck = V.bridge_floor as number;
  const boxXY = (bx: number[], h0: number, h1: number, mat: string, name: string, collide = true) => {
    const [x0, x1, y0, y1] = bx, p = F.PX((x0 + x1) / 2, (y0 + y1) / 2, h0);
    return b.box(p, x1 - x0, h1 - h0, y1 - y0, { mat, name, collide, uv: 1 / 3 });
  };
  // ---------------------------------------------------------------- puente P1, mesetas M1/M2, vigas, guardas
  boxXY(K.M1.box, 0, deck, 'nv_concrete', 'nv_m1');
  boxXY([K.M2.box[0], K.M1.box[0], K.M2.box[2], K.M2.box[3]], 0, deck, 'nv_concrete', 'nv_m2');   // V10.1 R1: M2 hasta donde empieza M1 (se solapaban 0,95 m: parpadeo)
  { const [x0, x1, y0, y1] = K.P1.box, xs = K.M1.box[1];   // tablero desde el borde de M1 hasta el extremo libre (x 5)
    boxXY([xs, x1, y0, y1], V.slab_bottom, deck, 'nv_concrete', 'nv_p1');
    // V10.1 P15: vigas 3 cm hacia dentro del canto del tablero y del extremo libre (compartían plano con él en 11,5 cm: parpadeaban)
    for (const [ya, yb] of [[y0 + 0.03, y0 + 0.25], [y1 - 0.25, y1 - 0.03]]) boxXY([x0, x1 - 0.03, ya, yb], V.beam_bottom, V.beam_top, 'nv_beam', 'nv_beam'); }
  boxXY(K.C1.box, 0, K.C1.top, 'nv_concrete', 'nv_c1');
  // guardas: postes + pasamanos superior y medio en los dos bordes largos de P1 y en el exterior de M1/M2; libres la llegada de E1/B1
  // (borde y 32,35 de M1/M2) y el arranque de RG1 en el extremo libre (x > 3,9)
  { const top = V.guard_top_axis - deck, mid = V.guard_mid_axis - deck;
    const run = (xa: number, xb: number, y: number) => {
      const L = xb - xa, n = Math.max(2, Math.ceil(L / 1.5) + 1);
      for (let i = 0; i < n; i++) { const x = xa + L * i / (n - 1); b.box(F.PX(x, y, deck), 0.05, top, 0.05, { mat: 'nv_guard', name: 'nv_guard_post' }); }
      for (const h of [top, mid]) b.box(F.PX((xa + xb) / 2, y, deck + h - 0.025), L, 0.05, 0.05, { mat: 'nv_guard', name: 'nv_guard', collide: h === top });
      b.solid(F.PX((xa + xb) / 2, y, deck), L, top, 0.06, 'nv_guard_col');   // barandilla sólida a su altura (no se cae del puente)
    };
    const [px0, px1, py0, py1] = K.P1.box, [mx0] = K.M2.box;
    run(mx0, 3.9, py1 + 0.03 - 0.03);   // exterior (y 34,8): toda la longitud salvo el arranque de RG1
    run(K.M1.box[1], 3.9, py0 + 0.03);  // interior del tablero (y 32,4) desde M1
    void px0; void px1; }
  // ---------------------------------------------------------------- E1: 19 peldaños reales
  { const [x0, x1, y0] = K.E1.box, n = K.E1.risers, ri = K.E1.riser, tr = K.E1.tread;
    // V10.1 P19 (D14 a): los peldaños se VEN; la colisión es una rampa continua por el centro de las huellas (como TT, YY y NMG): a pie se sube
    // al ritmo normal (antes el asistente de escalón la subía «del tirón»); la altura en el centro de cada huella sigue siendo k·contrahuella
    for (let k = 1; k <= n; k++) boxXY([x0, x1, y0 + (k - 1) * tr, y0 + k * tr], 0, k * ri, 'nv_concrete', 'nv_e1_peldano', false);
    { const L = n * tr, H = n * ri; b.trimesh(extrudeProfile([[-tr / 2, 0], [L - tr / 2, H], [L, H], [L, 0]], x1 - x0), F.PY((x0 + x1) / 2, y0, 0), 'nv_e1', 'ramp'); } }
  // ---------------------------------------------------------------- B1: perfil coseno H(t) = 1,7·(1 − cos πt)
  { const [x0, x1, y0, y1] = K.B1.box, L = y1 - y0, prof: [number, number][] = [];
    for (let i = 0; i <= 32; i++) { const t = i / 32; prof.push([t * L, K.B1.H * (1 - Math.cos(Math.PI * t))]); }
    prof.push([L, 0]);
    b.prism(F.PY((x0 + x1) / 2, y0, 0), prof, x1 - x0, { mat: 'nv_concrete', name: 'nv_b1', uv: 1 / 3 });
    copingPipe(b, F.W(x0, y1 - 0.02, 2 * K.B1.H + 0.01), F.W(x1, y1 - 0.02, 2 * K.B1.H + 0.01), 0.03, 'nv_coping'); }   // V10.3 (U-09): coping decorativo en el labio
  // ---------------------------------------------------------------- T1: paso agachado (paredes + losa; gálibo 1,25)
  { const [x0, x1, y0, y1] = K.T1.box, ch = K.T1.clear_height, roof = K.T1.roof, wy = (y1 - y0 - K.T1.clear_width) / 2;
    boxXY([x0, x1, y0, y0 + wy], 0, ch, 'nv_concrete', 'nv_t1');
    boxXY([x0, x1, y1 - wy, y1], 0, ch, 'nv_concrete', 'nv_t1');
    boxXY([x0, x1, y0, y1], ch, ch + roof, 'nv_concrete', 'nv_t1_roof');
    P.boxes.set('nv.t1', { c: F.W((x0 + x1) / 2, (y0 + y1) / 2, ch / 2), h: new THREE.Vector3((x1 - x0) / 2, ch / 2, K.T1.clear_width / 2), yaw: -F.a }); }
  // ---------------------------------------------------------------- R1: rampa de salto (perfil tangencial)
  // V10.1 P14 (usuario: «muy geométrica, debería ser curva smooth»): spline monótona por los 7 puntos del kit (mismas cotas: meseta 0,7, alto y
  // largo), tangente al suelo en los dos extremos, 14 muestras por tramo; colisión de la misma malla
  { const [x0, , y0, y1] = K.R1.box;
    b.prism(F.PXZ(x0, (y0 + y1) / 2, 0), smoothProfile(K.R1.profile as [number, number][], 14), y1 - y0, { mat: 'nv_pink', name: 'nv_r1', uv: 1 / 2 });
    // V10.3 (U-09): coping decorativo en los dos cantos de la meseta (0,7 m)
    { const pr = K.R1.profile as [number, number][], top = Math.max(...pr.map((q) => q[1])), xs = pr.filter((q) => q[1] >= top - 1e-6).map((q) => q[0]);
      for (const px of [Math.min(...xs), Math.max(...xs)]) copingPipe(b, F.W(x0 + px, y0, top + 0.012), F.W(x0 + px, y1, top + 0.012), 0.03, 'nv_coping'); } }
  // ---------------------------------------------------------------- G1: herradura (perfil radial medido en la maqueta v8, abierta 76° hacia −x)
  { const G = K.G1, [cx, cy] = G.center, prof = G.profile as [number, number][], a0 = G.ang_from * D2R, a1 = G.ang_to * D2R, NA = 72;
    const pos: number[] = [], idx: number[] = [], uv: number[] = [];
    const push = (x: number, y: number, h: number, u: number, v: number) => { const w = F.W(x, y, h); pos.push(w.x, w.y, w.z); uv.push(u, v); return pos.length / 3 - 1; };
    const ring = (r: number, h: number, i: number, u0 = 0) => { const a = a0 + (a1 - a0) * i / NA; return push(cx + r * Math.cos(a), cy + r * Math.sin(a), h, (a - a0) * 2.6 + u0, h); };
    // superficie curva (filas = perfil), cara exterior vertical (r 2,6 de 0,9 a 0), y tapas en los dos extremos
    const rows = prof.length, base: number[][] = [];
    for (let i = 0; i <= NA; i++) base.push(prof.map(([r, h]) => ring(r, h, i)));
    for (let i = 0; i < NA; i++) for (let j = 0; j < rows - 1; j++) { const a = base[i][j], c = base[i + 1][j], d2 = base[i][j + 1], e = base[i + 1][j + 1]; idx.push(a, d2, c, c, d2, e); }
    const outer: number[][] = []; for (let i = 0; i <= NA; i++) outer.push([ring(G.r_out, G.level, i), ring(G.r_out, 0, i)]);
    // V10.1 P13: la reflexión de nvFrame daba la vuelta a esta cara (miraba hacia dentro: desde fuera la herradura era invisible)
    for (let i = 0; i < NA; i++) { const [a, d2] = outer[i], [c, e] = outer[i + 1]; idx.push(a, d2, c, c, d2, e); }
    for (const i of [0, NA]) { const a = a0 + (a1 - a0) * i / NA, ids = prof.map(([r, h]) => push(cx + r * Math.cos(a), cy + r * Math.sin(a), h, r, h)), lo = push(cx + G.r_out * Math.cos(a), cy + G.r_out * Math.sin(a), 0, G.r_out, 0);
      for (let j = 0; j < ids.length - 1; j++) i === 0 ? idx.push(lo, ids[j + 1], ids[j]) : idx.push(lo, ids[j], ids[j + 1]); }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx); g.computeVertexNormals();
    b.decor(g, { x: 0, z: 0 }, 'nv_pink');
    const col = b.trimesh(g, { x: 0, z: 0 }, 'nv_g1', 'ramp'); P.nvTransitions.push(col.handle);
    // coping oscuro en el borde superior
    const cp: number[] = [], ci: number[] = [];
    for (let i = 0; i <= NA; i++) { const a = a0 + (a1 - a0) * i / NA; for (const [r, h] of [[G.r_out - 0.06, G.level + 0.03], [G.r_out + 0.02, G.level + 0.03]] as const) { const w = F.W(cx + r * Math.cos(a), cy + r * Math.sin(a), h); cp.push(w.x, w.y, w.z); } }
    for (let i = 0; i < NA; i++) { const q = i * 2; ci.push(q, q + 1, q + 2, q + 1, q + 3, q + 2); }   // V10.1 P13: el remate miraba hacia abajo
    const cg = new THREE.BufferGeometry(); cg.setAttribute('position', new THREE.Float32BufferAttribute(cp, 3)); cg.setIndex(ci); cg.computeVertexNormals();
    b.decor(cg, { x: 0, z: 0 }, 'nv_coping'); }
  // ---------------------------------------------------------------- RG1: tubo rosa (malla) + colisión fina por tramos + apoyos
  { const R = rg1(), rad = KIT.rail.tube_d / 2;
    const path = new THREE.CurvePath<THREE.Vector3>(); for (let i = 1; i < R.pts.length; i++) path.add(new THREE.LineCurve3(R.pts[i - 1], R.pts[i]));
    const tube = new THREE.TubeGeometry(path, R.pts.length * 2, rad, 10, false);
    b.decor(tube, { x: 0, z: 0 }, 'nv_rail', { shadow: true });
    for (let i = 1; i < R.pts.length; i++) {
      const a = R.pts[i - 1], c = R.pts[i], mid = a.clone().add(c).multiplyScalar(0.5), L = a.distanceTo(c); if (L < 1e-3) continue;
      const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), c.clone().sub(a).normalize());
      const col = b.addCollider(RAPIER.ColliderDesc.capsule(L / 2, rad).setTranslation(mid.x, mid.y, mid.z).setRotation(q), 'nv_rg1', 'small'); b.thin.add(col.handle);
    }
    // apoyos verticales cada ~2,6 m donde no pasa otro tramo del rail por debajo (en la vuelta solo en el exterior)
    let last = -9;
    for (let s = 0.6; s < R.length - 0.4; s += 0.2) {
      if (s - last < 2.6) continue;
      const p = R.at(s); if (p.y < 0.35) continue;
      const below = R.pts.some((q, i) => Math.hypot(q.x - p.x, q.z - p.z) < 0.45 && q.y < p.y - 0.2 && Math.abs(R.S[i] - s) > 1.5);
      if (below) continue;
      b.cylinder({ x: p.x, y: 0, z: p.z }, 0.035, p.y - rad, { mat: 'nv_post', collide: true, name: 'nv_rg1_post' });
      last = s;
    }
    m.anchor('nv.rg1.start', R.at(0), F.heading(1, 0));
    m.anchor('nv.rg1.end', R.at(R.length), F.heading(-1, 0)); }
  // ---------------------------------------------------------------- palmeras, cassette, banco rosa perforado, cajas y sprays
  for (const [x, y] of K.palms as [number, number][]) { const w = F.W(x, y); palm(b, { x: w.x, z: w.z, yaw: -F.a }, 6.0, 0.08, Math.round(x * 3), true); }
  { const [x, y] = K.cassette, w = F.W(x, y), h = F.heading(0, -1);   // radiocasete en su ancla v8, mirando al paseo interior
    m.cassettes.push({ zone: id, pos: w, heading: h });
    b.box({ x: w.x, z: w.z, yaw: h }, 1.4, 0.3, 0.9, { mat: 'nv_pink', name: 'plinth' }); }
  { const p = F.PX(-14.1, 29.8, 0), L = 1.8;   // banco metálico perforado rosa (acercamiento C1; ancla de la guía de atrezo)
    b.box(rot(p, 0, 0.42, 0), L, 0.04, 0.5, { mat: 'nv_bench', name: 'nv_bench' });
    b.box(rot(p, 0, 0.46, -0.27), L, 0.45, 0.04, { mat: 'nv_bench', collide: false });
    for (const sx of [-L / 2 + 0.08, L / 2 - 0.08]) b.box(rot(p, sx, 0, 0), 0.05, 0.415, 0.45, { mat: 'nv_beam', name: 'nv_bench_leg' });
    // V10.1 P23: sentarse también aquí (asiento a 0,46: el clip va calibrado a 0,45 → la raíz sube 1 cm), mirando al frente (+z local)
    { const st = rot(p, 0.35, 0, -0.05), fz = rot(p, 0.35, 0, 0.85); m.anchor('nv.bench.sit', new THREE.Vector3(st.x, 0.01, st.z), p.yaw!); P.zone('act.benchSit.nv', new THREE.Vector3(fz.x, 0, fz.z), 1.0); } }   // V10.1: 5 mm bajo el asiento perforado (coplanar)
  { const p = F.PX(0.75, 32.68, 0);   // dos cajas pequeñas apiladas y tres sprays junto al pilar (acercamiento C2)
    // cajas gris azulado (como en C2) y los tres sprays (rosa, azul, blanco) que faltaban, sin colisión
    b.box(p, 0.42, 0.3, 0.32, { mat: 'nv_post', name: 'nv_crate' }); b.box(rot(p, 0.03, 0.3, 0.02), 0.42, 0.3, 0.32, { mat: 'nv_post', name: 'nv_crate' });
    for (const [dx, dz, mat] of [[-0.34, -0.12, 'nv_rail'], [-0.42, 0.02, 'nv_beam'], [-0.3, 0.1, 'white']] as const) b.cylinder(rot(p, dx, 0, dz), 0.034, 0.2, { mat, collide: false, seg: 10 }); }
  // ---------------------------------------------------------------- patatas (IDs conservados; superficies de trabajo del contrato)
  { const Fr = K.fries;
    P.fry(id, 'hidden', F.W(Fr.hidden.surface[0], Fr.hidden.surface[1], 0), 'crouch', 'Debajo de T1, en el paso agachado', 'Salir agachada por cualquier lado', 0.45);
    P.fry(id, 'medium', F.W(Fr.medium.surface[0], Fr.medium.surface[1], Fr.medium.surface[2]), 'ramp', 'En medio de la bajada B1', 'Bajar o subir por B1');
    // acceso «ramp» (subida por escalera, como las de TT): está a +3,40 al final de E1; «roll» era rodar en llano (fry-access, R4)
    P.fry(id, 'visible', F.W(Fr.visible.surface[0], Fr.visible.surface[1], Fr.visible.surface[2]), 'ramp', 'Arriba en M1, al terminar la escalinata E1', 'Bajar por E1 o por B1');
    // premio: suelo próximo y accesible a la salida de RG1 (−2,00; 25,70; 0,12), sin la cota del tubo (contrato NV-F04)
    P.fry(id, 'activity', F.W(-2.0, 26.6, 0), 'roll', 'Al final del rail tras superar el grind', 'Suelo plano'); }
  m.checkpoints.push({ id: 'cp.nosvamosdeaqui', zone: id, pos: F.W(-4.2, 26.6, 0), heading: F.heading(0, 1) });
  // ---------------------------------------------------------------- Fennec y zona de la charla (arriba a la derecha, junto al arranque de RG1)
  m.anchor('nv.fennec.top', F.W(3.35, 34.05, deck), F.heading(-1, -0.5));
  m.anchor('nv.fennec.bottom', F.W(-3.3, 26.2, 0), F.heading(0.6, -1));
  P.zone('act.skateTutorial', F.W(2.2, 33.6, deck), 1.4, deck - 0.3, deck + 1.6);
  // V10.3 (U-11, usuario): recuadro de actividad también en NVDA (charla con Bellakat / empezar el grind), girado con el tablero y a su medida
  P.activityArea('act.skateTutorial', deck, [2.15, 2.15], F.heading(1, 0) - Math.PI / 2);
  m.anchor('nv.retry', F.W(2.0, 33.6, deck), F.heading(1, 0));
  m.anchor('cam.nv.talk', F.W(-0.6, 30.4, deck + 1.9), 0);
  // ---------------------------------------------------------------- cartel (contrato cartel.json, delegado): panel sobre la guarda exterior de P1
  // V10.3 (U-05): el cartel de NVDA lo pone Park.lettering (común a todas las zonas)
  nvDecals(P, F);
}

/** Acabado «Caras y cómic» (dossier v4 §5, acercamientos A1, A2, B1, B2 aceptados): grafitis PINTADOS sobre las piezas, como mallas finas
 *  que siguen la forma de cada cara (2 cm por fuera, sin colisión): ojo y mano de la paz sobre la superficie de la bajada B1 y en el costado
 *  de la escalinata E1 (lado del pilar); cara de dos ojos y lengua con mano en la cara del pilar C1 hacia la plaza; estallido en la bajada
 *  de la rampa R1; ojo y mano en la pared de T1 hacia la plaza; tira de caras en la cara exterior de la herradura G1 hacia la plaza. */
function nvDecals(P: Park, F: ReturnType<typeof nvFrame>) {
  const K = KIT as any, OFF = 0.02;
  const mk = (texName: string, pos: number[], uv: number[], idx: number[], name: string) => {
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx); g.computeVertexNormals();
    const m = new THREE.MeshStandardMaterial({ map: tex(`tex/${texName}.webp`), alphaTest: 0.5, roughness: 0.85, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
    const mesh = new THREE.Mesh(g, m); mesh.name = `NV_GRAFITI_${name}`; mesh.receiveShadow = true; P.root.add(mesh); return mesh;
  };
  /** Rejilla (nu × nv) con posición local `at(u, v)` → [x, y, h] (u, v ∈ 0…1) y uv = (u, v). */
  const grid = (texName: string, name: string, nu: number, nv: number, at: (u: number, v: number) => [number, number, number]) => {
    const pos: number[] = [], uv: number[] = [], idx: number[] = [];
    for (let j = 0; j <= nv; j++) for (let i = 0; i <= nu; i++) { const u = i / nu, v = j / nv, [x, y, h] = at(u, v), w = F.W(x, y, h); pos.push(w.x, w.y, w.z); uv.push(u, v); }
    for (let j = 0; j < nv; j++) for (let i = 0; i < nu; i++) { const a = j * (nu + 1) + i, c = a + 1, d = a + nu + 1, e = d + 1; idx.push(a, c, d, c, e, d); }
    return mk(texName, pos, uv, idx, name);
  };
  /** IT3: cara plana vertical. `axis` = eje local de la normal ('x' o 'y'), `plane` = su coordenada, `s` = sentido de la normal (±1),
   *  centro (cU a lo largo de la cara, cH en altura) y tamaño. La derecha de quien mira: cara −y → +x; +y → −x; −x → −y; +x → +y. */
  const face = (texName: string, name: string, axis: 'x' | 'y', plane: number, s: 1 | -1, cU: number, cH: number, w: number, h: number) =>
    grid(texName, name, 1, 1, (u, v) => { const r = axis === 'y' ? -s : s, a = cU + (u - 0.5) * w * r, hh = cH + (v - 0.5) * h;
      return axis === 'y' ? [a, plane + s * OFF, hh] : [plane + s * OFF, a, hh]; });
  /** tamaño que cabe en (maxW × maxH) con la proporción del dibujo (ancho/alto) */
  const fit = (A: number, maxW: number, maxH: number) => { const w = Math.min(maxW, maxH * A); return [w, w / A] as const; };
  // V10 IT3 (feedback: «usar los grafitis preparados para cada escenario, en NVDA no se usan»): los 11 del catálogo del dossier (arte del
  // usuario tal cual, `import_grafitis_catalogo.py`), uno de cada, en las caras que propone su ficha; sustituyen a los dibujados por código.
  // B1 (IT3, usuario 18 oct: BELLAKAT vertical en lugar de P02 · Fennec mirada y paz): superficie de la bajada, todo el ancho, centrado en el
  // tramo central (t ≈ 0,52); el largo se mide sobre la CURVA (arco = 2 × ancho, proporción 1 : 2 del dibujo) y v avanza por longitud de
  // arco, así las letras no se estiran en la parte empinada. u a lo ancho, v a lo largo hacia arriba
  { const [x0, x1, y0, y1] = K.B1.box, L = y1 - y0, H = K.B1.H, mx = 0.04, w = x1 - x0 - 2 * mx, N = 400;
    const hAt = (t: number) => H * (1 - Math.cos(Math.PI * t)), S: number[] = [0];
    for (let i = 1; i <= N; i++) S.push(S[i - 1] + Math.hypot(L / N, hAt(i / N) - hAt((i - 1) / N)));
    const tOf = (s: number) => { let i = 1; while (i < N && S[i] < s) i++; return (i - 1 + (s - S[i - 1]) / Math.max(1e-9, S[i] - S[i - 1])) / N; };
    const sc = S[Math.round(0.52 * N)], sa = Math.max(0, sc - w), sb = Math.min(S[N], sc + w);   // arco 2w (= w / 0,5)
    grid('G_nv_bellakat', 'B1', 2, 32, (u, v) => { const t = tOf(sa + v * (sb - sa)), y = y0 + t * L, h = hAt(t), dh = H * Math.PI * Math.sin(Math.PI * t) / L, n = Math.hypot(1, dh);
      return [x0 + mx + u * w, y - OFF * dh / n, h + OFF / n]; }); }
  // E1 (P11 · palmeras y onda): costado +x recortado por los peldaños; banda 2 : 1 desde el suelo (arriba la imagen es transparente)
  { const [, x1, y0] = K.E1.box, n = K.E1.risers, ri = K.E1.riser, tr = K.E1.tread, L = n * tr, Hb = L / 2;
    const pos: number[] = [], uv: number[] = [], idx: number[] = [];
    for (let k = 0; k < n; k++) { const ya = y0 + k * tr, yb = ya + tr, top = (k + 1) * ri;
      const q = [[ya, 0], [yb, 0], [yb, top], [ya, top]].map(([y, h]) => { const w = F.W(x1 + OFF, y, h); pos.push(w.x, w.y, w.z); uv.push((y - y0) / L, h / Hb); return pos.length / 3 - 1; });
      idx.push(q[0], q[2], q[1], q[0], q[3], q[2]); }
    const m = mk('G_nv_P11', pos, uv, idx, 'E1'); const t = (m.material as THREE.MeshStandardMaterial).map; if (t) { t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping; } }
  // C1 (Ai, antes P01): frente del pilar hacia la plaza; (P07 · cassette) costado +x; (P08 · skate alado) trasera +y
  { const [x0, x1, y0, y1] = K.C1.box, top = K.C1.top, cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
    // IT3 (usuario 18 oct): «Ai · palmeras y flow» en lugar de P01 · Fennec lengua, en el frente del pilar que sujeta el puente; 3 : 2 a todo
    // el ancho, centrado a media altura del pilar
    { const [w, h] = fit(1.5, x1 - x0 - 0.08, top - 0.12); face('G_nv_ai', 'C1', 'y', y0, -1, cx, Math.max(0.06 + h / 2, top * 0.45), w, h); }
    { const [w, h] = fit(1.5, y1 - y0 - 0.1, top - 0.6); face('G_nv_P07', 'C1x', 'x', x1, 1, cy, top * 0.5, w, h); }
    { const [w, h] = fit(1.5, x1 - x0 - 0.1, top - 0.6); face('G_nv_P08', 'C1y', 'y', y1, 1, cx, top * 0.5, w, h); } }
  // T1 (P04 · Fennec perfil bajo): pared hacia la plaza; (P10 · corazón con rayos) pared trasera
  { const [x0, x1, y0, y1] = K.T1.box, Ht = K.T1.clear_height + K.T1.roof, cx = (x0 + x1) / 2;
    { const [w, h] = fit(1.5, x1 - x0 - 0.1, Ht - 0.04); face('G_nv_P04', 'T1', 'y', y0, -1, cx, 0.02 + h / 2, w, h); }
    { const [w, h] = fit(1.5, x1 - x0 - 0.1, Ht - 0.04); face('G_nv_P10', 'T1b', 'y', y1, 1, cx, 0.02 + h / 2, w, h); } }
  // M1 (P06 · Rana paz de lado): muro trasero +y; M2 (P09 · puño eléctrico): costado −x
  { const [x0, x1, , y1] = K.M1.box, lv = K.M1.level; const [w, h] = fit(1.5, x1 - x0 - 0.2, lv - 0.2); face('G_nv_P06', 'M1', 'y', y1, 1, (x0 + x1) / 2, 0.08 + h / 2, w, h); }
  { const [x0, , y0, y1] = K.M2.box, lv = K.M2.level; const [w, h] = fit(0.8003, y1 - y0 - 0.1, lv - 0.2); face('G_nv_P09', 'M2', 'x', x0, -1, (y0 + y1) / 2, 0.08 + h / 2, w, h); }
  // V10.1 P14 (D17 b, usuario): la rampa R1 va sin grafiti (antes P05 · Fennec salto y estallido en su bajada)
  // G1 (P03 · Rana, ojos en secuencia): cara exterior (r_out) hacia la plaza, banda 3 : 1 a toda la altura
  // V10.1 P13 (usuario: «tiene que verse los graffitis rosas de la rana conectados de principio a fin como una secuencia que se repite»): de
  // boca a boca por toda la cara exterior, con la tira sin márgenes transparentes y un número entero de copias (estirado en u ≤ 12 %)
  { const G = K.G1, [cx, cy] = G.center, r = G.r_out + OFF, Hh = G.level - 0.04, a1 = G.ang_from * D2R, a2 = G.ang_to * D2R, ASPECT = 2.8672;
    const copies = Math.max(1, Math.round(Math.abs(a2 - a1) * r / (Hh * ASPECT)));
    const mesh = grid('G_nv_P03_tira', 'G1', 144, 1, (u, v) => { const a = a1 + u * (a2 - a1); return [cx + r * Math.cos(a), cy + r * Math.sin(a), 0.02 + v * Hh]; });
    const uvA = mesh.geometry.attributes.uv as THREE.BufferAttribute; for (let i = 0; i < uvA.count; i++) uvA.setX(i, uvA.getX(i) * copies); uvA.needsUpdate = true;
    const t = (mesh.material as THREE.MeshStandardMaterial).map; if (t) { t.wrapS = THREE.RepeatWrapping; t.needsUpdate = true; }
    mesh.userData.copias = copies; }
}

