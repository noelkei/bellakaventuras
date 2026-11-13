// V10.4 R9 (W03, W-D04, W-D14, R4-02) · línea amarilla discontinua del modo ayuda por un camino ANDABLE: rejilla horneada sobre el mapa de
// V10.3 (game/tools/v10_4/hornear-caminos.mjs → assets/nav/caminos.json: celdas de 0,5 m, hasta 2 suelos por celda y sus vecinos andables)
// + escaleras de mano como enlaces; A* en el juego (pocos ms; se recalcula cada ~0,5 s). La línea va pegada al suelo (sube rampas y
// escaleras, rodea muros), semitransparente (no del todo opaca), y se dibuja con un solo material y una sola malla.
import * as THREE from 'three';
import { ASSET_BASE } from './assets';

interface Nav { n: number; cell: number; half: number; cnt: Uint8Array; off: Int32Array; h: Float32Array; e: Uint8Array; eb: Uint8Array; cellOf: Int32Array; ladders: { foot: number[]; top: number[] }[] }
const D8 = [[1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1], [0, -1], [1, -1]];
let NAV: Promise<Nav | null> | null = null;
export function loadNav() {
  return (NAV ??= fetch(`${ASSET_BASE}nav/caminos.json`).then((r) => (r.ok ? r.json() : null)).then((j) => {
    if (!j) return null; const bin = atob(j.data), N = j.n, cnt = new Uint8Array(N * N), off = new Int32Array(N * N), h: number[] = [], e: number[] = [], eb: number[] = []; let p = 0;
    for (let c = 0; c < N * N; ) { const hd = bin.charCodeAt(p++), k = hd & 3, hasEb = (hd & 128) !== 0;
      if (!k) { const run = bin.charCodeAt(p++); for (let r = 0; r < run; r++) { cnt[c + r] = 0; off[c + r] = h.length; } c += run; continue; }
      cnt[c] = k; off[c] = h.length;
      for (let a = 0; a < k; a++) { let u = bin.charCodeAt(p) | (bin.charCodeAt(p + 1) << 8); p += 2; if (u & 0x8000) u -= 0x10000; h.push(u / 100); e.push(bin.charCodeAt(p++)); eb.push(hasEb ? bin.charCodeAt(p++) : 0); }
      c++; }
    const cellOf = new Int32Array(h.length); for (let c = 0; c < N * N; c++) for (let a = 0; a < cnt[c]; a++) cellOf[off[c] + a] = c;
    return { n: N, cell: j.cell, half: j.half, cnt, off, h: new Float32Array(h), e: new Uint8Array(e), eb: new Uint8Array(eb), cellOf, ladders: j.ladders } as Nav;
  }).catch(() => null));
}
export const navReady = () => NAV;

/** Nodo = índice de suelo global (off[c] + capa). */
function nodeAt(N: Nav, p: THREE.Vector3): number {
  const i = Math.floor((p.x + N.half) / N.cell), j = Math.floor((p.z + N.half) / N.cell);
  if (i < 0 || j < 0 || i >= N.n || j >= N.n) return -1;
  let best = -1, bd = 1e9;
  for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) { const ii = i + di, jj = j + dj; if (ii < 0 || jj < 0 || ii >= N.n || jj >= N.n) continue; const c = jj * N.n + ii;
    for (let a = 0; a < N.cnt[c]; a++) { const k = N.off[c] + a, x = -N.half + (ii + 0.5) * N.cell, z = -N.half + (jj + 0.5) * N.cell, d = Math.hypot(x - p.x, z - p.z) + Math.abs(N.h[k] - p.y) * 2 + (di || dj ? 0.3 : 0);
      if (d < bd) { bd = d; best = k; } } }
  return best;
}
/** A* entre dos puntos del mundo. `blocked(x, z)` excluye celdas (p. ej. dentro de la valla del centro antes de 20). Devuelve los puntos del
 *  camino (centro de celda, a la altura del suelo) o null si no hay camino; si el destino no es alcanzable andando, el camino acaba en la
 *  celda alcanzable más cercana a él («al pie»; la pista dice el truco). */
export function findPath(N: Nav, from: THREE.Vector3, to: THREE.Vector3, blocked?: (x: number, z: number) => boolean, maxNodes = 60000): THREE.Vector3[] | null {
  const s = nodeAt(N, from), t = nodeAt(N, to); if (s < 0) return null;
  // índice de nodo → celda (búsqueda inversa por los offsets)
  const cellOf = (k: number) => N.cellOf[k];
  const pos = (k: number) => { const c = cellOf(k), i = c % N.n, j = (c / N.n) | 0; return new THREE.Vector3(-N.half + (i + 0.5) * N.cell, N.h[k], -N.half + (j + 0.5) * N.cell); };
  const goal = to.clone(), H = (k: number) => { const p = pos(k); return Math.hypot(p.x - goal.x, p.z - goal.z) + Math.abs(p.y - goal.y) * 0.5; };
  const g = new Map<number, number>([[s, 0]]), came = new Map<number, number>(), open: [number, number][] = [[H(s), s]], closed = new Set<number>();
  let best = s, bestH = H(s), seen = 0;
  const push = (f: number, k: number) => { open.push([f, k]); let i = open.length - 1; while (i > 0) { const pa = (i - 1) >> 1; if (open[pa][0] <= open[i][0]) break; [open[pa], open[i]] = [open[i], open[pa]]; i = pa; } };
  const pop = () => { const top = open[0], last = open.pop()!; if (open.length) { open[0] = last; let i = 0; for (;;) { const l = 2 * i + 1, r = l + 1; let m = i; if (l < open.length && open[l][0] < open[m][0]) m = l; if (r < open.length && open[r][0] < open[m][0]) m = r; if (m === i) break; [open[m], open[i]] = [open[i], open[m]]; i = m; } } return top; };
  const ladderLinks = new Map<number, number[]>();
  for (const L of N.ladders) { const a = nodeAt(N, new THREE.Vector3(L.foot[0], L.foot[1], L.foot[2])), b = nodeAt(N, new THREE.Vector3(L.top[0], L.top[1], L.top[2])); if (a >= 0 && b >= 0) { ladderLinks.set(a, [...(ladderLinks.get(a) ?? []), b]); ladderLinks.set(b, [...(ladderLinks.get(b) ?? []), a]); } }
  while (open.length && seen < maxNodes) {
    const [, k] = pop(); if (closed.has(k)) continue; closed.add(k); seen++;
    const hk = H(k); if (hk < bestH) { bestH = hk; best = k; }
    if (k === t) { best = k; break; }
    const c = cellOf(k), i = c % N.n, j = (c / N.n) | 0, a = k - N.off[c], gk = g.get(k)!;
    const nb: [number, number][] = [];
    for (let d = 0; d < 8; d++) if (N.e[k] & (1 << d)) { const ii = i + D8[d][0], jj = j + D8[d][1], cc = jj * N.n + ii, layer = (N.eb[k] >> d) & 1;
      const x = -N.half + (ii + 0.5) * N.cell, z = -N.half + (jj + 0.5) * N.cell; if (blocked?.(x, z)) continue; if (layer < N.cnt[cc]) nb.push([N.off[cc] + layer, d % 2 ? 1.4142 : 1]); }
    for (const q of ladderLinks.get(k) ?? []) nb.push([q, 6]);
    void a;
    for (const [q, w] of nb) { const ng = gk + w * N.cell; if (ng < (g.get(q) ?? 1e9)) { g.set(q, ng); came.set(q, k); push(ng + H(q), q); } }
  }
  const path: THREE.Vector3[] = []; let k: number | undefined = best; while (k !== undefined) { path.push(pos(k)); k = came.get(k); }
  return path.reverse();
}

/** Línea discontinua amarilla sobre el camino: guiones de 0,45 m cada 0,8 m, 0,16 m de ancho, 4 cm sobre el suelo, opacidad 0,6. */
export class LineaAyuda {
  mesh: THREE.Mesh; private mat: THREE.MeshBasicMaterial; private t = 0;
  constructor(scene: THREE.Scene) {
    this.mat = new THREE.MeshBasicMaterial({ color: '#ffd93b', transparent: true, opacity: 0.62, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, side: THREE.DoubleSide });
    this.mesh = new THREE.Mesh(new THREE.BufferGeometry(), this.mat); this.mesh.name = 'AYUDA_LINEA'; this.mesh.renderOrder = 3; this.mesh.frustumCulled = false; this.mesh.visible = false; scene.add(this.mesh);
  }
  set(path: THREE.Vector3[] | null) {
    if (!path || path.length < 2) { this.mesh.visible = false; return; }
    // suavizado ligero (media de 3) y remuestreo por longitud de arco
    const P = path.map((p, i) => i === 0 || i === path.length - 1 ? p.clone() : p.clone().add(path[i - 1]).add(path[i + 1]).multiplyScalar(1 / 3));
    const pos: number[] = [], DASH = 0.45, GAP = 0.35, W = 0.08; let acc = 0;
    for (let i = 1; i < P.length; i++) { const a = P[i - 1], b = P[i], L = a.distanceTo(b); if (L < 1e-4) continue; const dir = b.clone().sub(a).normalize(), side = new THREE.Vector3(-dir.z, 0, dir.x).normalize().multiplyScalar(W);
      for (let s = 0; s < L; s += 0.1) { const ph = (acc + s) % (DASH + GAP); if (ph > DASH) continue; const s1 = Math.min(L, s + 0.1), p0 = a.clone().lerp(b, s / L), p1 = a.clone().lerp(b, s1 / L); p0.y += 0.045; p1.y += 0.045;
        pos.push(p0.x - side.x, p0.y, p0.z - side.z, p0.x + side.x, p0.y, p0.z + side.z, p1.x + side.x, p1.y, p1.z + side.z, p0.x - side.x, p0.y, p0.z - side.z, p1.x + side.x, p1.y, p1.z + side.z, p1.x - side.x, p1.y, p1.z - side.z); }
      acc += L; }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    this.mesh.geometry.dispose(); this.mesh.geometry = g; this.mesh.visible = pos.length > 0;
  }
  /** Leve pulso de opacidad (sin movimiento con «reducir movimiento»). */
  update(dt: number, reduced: boolean) { this.t += dt; this.mat.opacity = reduced ? 0.62 : 0.55 + 0.1 * Math.sin(this.t * 3); }
  hide() { this.mesh.visible = false; }
}
