// V7 TRA TRA TRA (Auditoría 7/plan-v7, revisión 08): vuelta ascendente abierta. E1 (dos tramos) → camino inferior +1,20 →
// giro → escalera de mano EV1 (+2 m) → P1 +3,20 → E2 → trasera +4,40 con el único agujero H → abanico E3 (2 m de ancho) →
// recta +5,60 con la rampita R1 → corte de 2 m → recepción alineada → limo rosa perpendicular apoyada solo en el centro,
// con Aissa y Juseph sentados en los extremos y EV2 al techo. Contrato ÚNICO `tt_kit.json`: cada pieza genera su malla Y su
// colisión desde los mismos números. Marco: local (x, y, h) girado `frame.rotDeg` y llevado a `frame.origin` (WX/WZ; con 0°,
// three (x + ox, h, oz − y), norte local +Y = −Z). V7 R1: 180°, E1 mira a SECRETNOVIO. Las mallas
// estáticas van al lote del Builder (trozo `tratratra`); la pintura rosa de los cantos y los grafitis son capas pintadas
// (una malla y un material por capa).
import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import KIT from './tt_kit.json';
import ATLAS from './tt_atlas.json';
import type { Place } from './geo';
import { PROP_SLOTS, palm, nmgPlant, nmgFlowerShrub, nmgTree } from './props';
import { tex, ASSET_BASE } from '../assets';
import type { Park } from './park';
import { coronaXZ, CORONA_ROT_DEG } from './manifest';

export const TT_KIT = KIT;
const D2R = Math.PI / 180;
/** V10: giro de corona. El origen es un punto de MUNDO del contrato (orientación V3–V9): se gira como punto ((2; 29,55) → (−2,647; 29,499));
 *  el giro del marco es un yaw three: se RESTAN 9° (180° → 171°). */
const [OX, OZ] = coronaXZ(KIT.frame.origin[0], KIT.frame.origin[1]);
/** Giro del marco (rad). Un giro local antihorario de `ROT` es un yaw three de +`ROT`. */
const ROT = (((KIT.frame as { rotDeg?: number }).rotDeg ?? 0) - CORONA_ROT_DEG) * D2R, CR = Math.round(Math.cos(ROT) * 1e12) / 1e12, SR = Math.round(Math.sin(ROT) * 1e12) / 1e12;
/** local (x, y) → mundo x / z. */
const WX = (x: number, y: number) => OX + x * CR - y * SR, WZ = (x: number, y: number) => OZ - (x * SR + y * CR);
type V3 = [number, number, number];   // local (x, y, h)

/** Marco. `V(x, y, h)` punto del mundo; `P(x, y, h, yaw)` colocación (yaw LOCAL; se le suma el giro del marco); `H(dx, dy)` rumbo three de una dirección local. */
export function ttFrame() {
  const V = (x: number, y: number, h = 0) => new THREE.Vector3(WX(x, y), h, WZ(x, y));
  const P = (x: number, y: number, h = 0, yaw = 0): Place => ({ x: WX(x, y), y: h, z: WZ(x, y), yaw: yaw + ROT });
  const H = (dx: number, dy: number) => Math.atan2(dx * CR - dy * SR, -(dx * SR + dy * CR));
  return { V, P, H };
}
/** Punto del mundo → local (x, y). */
export function ttLocal(p: { x: number; z: number }) { const dx = p.x - OX, dz = OZ - p.z; return { x: dx * CR + dz * SR, y: -dx * SR + dz * CR }; }

/** Farolillos bajos de TT (pieza `fg_lamp` del atrezzo FG, instanciada aparte por Park.loadFgProps). */
export const TT_LAMPS: { x: number; z: number; yaw: number }[] = [];
/** Pilares construidos (para colocar grafitis por cara y para las herramientas). */
export const TT_PILLARS: Record<string, { cx: number; cy: number; sx: number; sy: number; h0: number; h1: number }> = {};

// ------------------------------------------------------------------ acumulador (posiciones ya en mundo; UV en metros de mundo)
const UVK = 1 / 3.2;   // texturas de hormigón: 3,2 m por repetición
class Geo {
  pos: number[] = []; uv: number[] = []; idx: number[] = [];
  /** Polígono convexo (puntos locales, cualquier orden alrededor); `n` = normal deseada (local). UV por el eje dominante. */
  poly(pts: V3[], n: V3, uvs?: [number, number][]) {
    const ax = Math.abs(n[0]), ay = Math.abs(n[1]), ah = Math.abs(n[2]);
    const base = this.pos.length / 3;
    pts.forEach((p, i) => {
      this.pos.push(WX(p[0], p[1]), p[2], WZ(p[0], p[1]));
      if (uvs) this.uv.push(uvs[i][0], uvs[i][1]);
      else if (ah >= ax && ah >= ay) this.uv.push(p[0] * UVK, p[1] * UVK);
      else if (ax >= ay) this.uv.push(p[1] * UVK, p[2] * UVK);
      else this.uv.push(p[0] * UVK, p[2] * UVK);
    });
    const W = (i: number) => new THREE.Vector3(this.pos[i * 3], this.pos[i * 3 + 1], this.pos[i * 3 + 2]);
    const want = new THREE.Vector3(n[0] * CR - n[1] * SR, n[2], -(n[0] * SR + n[1] * CR));
    for (let k = 1; k < pts.length - 1; k++) {
      const a = base, b = base + k, c = base + k + 1;
      const nn = W(b).sub(W(a)).cross(W(c).sub(W(a)));
      if (nn.dot(want) < 0) this.idx.push(a, c, b); else this.idx.push(a, b, c);
    }
  }
  get empty() { return !this.idx.length; }
  build() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    g.setIndex(this.idx); g.computeVertexNormals();
    return g;
  }
}

type Edge = 'open' | 'join' | 'flush';
interface Edges { W?: Edge; E?: Edge; S?: Edge; N?: Edge }
/** Tramo de canto pintado: `a`→`b` en planta, `out` = normal exterior, `h` = cota superior; `drop` = alto de cara disponible. */
interface PaintEdge { a: [number, number]; b: [number, number]; out: [number, number]; h: number; drop: number; top: boolean }

// ------------------------------------------------------------------ materiales TT
function ttMaterials(P: Park) {
  const M = P.mats;
  const std = (k: string, o: THREE.MeshStandardMaterialParameters) => { try { M.get(k); } catch { M.set(k, new THREE.MeshStandardMaterial(o)); } };
  const T = (n: string) => tex(`tex/${n}.webp`);
  // R2 (prueba del usuario, reversible con tt_kit.json → concrete): hormigón gris liso de NMG en lugar del bloque beige de V7
  const nmg = (KIT as { concrete?: string }).concrete === 'nmg';
  std('tt_side', { map: T(nmg ? 'T_tt_nmggris' : 'T_tt_side'), roughness: 0.94 });   // hormigón de caras y pilares
  std('tt_top', { map: T(nmg ? 'T_tt_nmggris' : 'T_tt_top'), roughness: 0.9 });      // losas de rodadura
  std('tt_pink', { map: T('T_tt_pink'), roughness: 0.72 });           // pintura rosa de cantos y bordillos
  std('tt_yellow', { map: T('T_tt_yellow'), roughness: 0.74 });       // rampita R1
  std('tt_iron', { color: '#3d383b', roughness: 0.26, metalness: 0.88, envMapIntensity: 1.35 });   // barandillas: acero oscuro con brillo (R5; entorno en game.ts)
  std('tt_ladder', { color: '#ee3f8e', roughness: 0.38, metalness: 0.3, envMapIntensity: 0.6 });   // escaleras de mano rosas (pintura sobre metal)
  return M;
}

// ------------------------------------------------------------------ construcción
export function buildTraTraTra(P: Park, id: 'tratratra') {
  TT_LAMPS.length = 0; for (const k of Object.keys(TT_PILLARS)) delete TT_PILLARS[k];
  const b = P.b, m = P.manifest, { V, P: PL, H } = ttFrame();
  ttMaterials(P);
  const G = { side: new Geo(), top: new Geo(), pink: new Geo(), yellow: new Geo() };
  const paint: PaintEdge[] = [];
  const C = KIT.slab.chamfer, R = KIT.stairs.riser;
  const ID: Place = { x: 0, z: 0 };
  const solid = (x0: number, y0: number, x1: number, y1: number, h0: number, h1: number, name: string, kind = 'solid') =>
    b.solid(PL((x0 + x1) / 2, (y0 + y1) / 2, h0), x1 - x0, h1 - h0, y1 - y0, name, kind);
  const hull = (pts: V3[], name: string, kind = 'solid') =>
    b.addCollider(RAPIER.ColliderDesc.convexHull(new Float32Array(pts.flatMap(([x, y, h]) => [WX(x, y), h, WZ(x, y)])))!, name, kind);

  /** Losa rectangular biselada: tapa, bisel rosa en los cantos abiertos, caras y fondo. */
  const slab = (x0: number, y0: number, x1: number, y1: number, top: number, t: number, e: Edges, name: string, collide = true, topGeo: Geo = G.top) => {
    const o = (k: keyof Edges) => (e[k] ?? 'open') === 'open', drawn = (k: keyof Edges) => (e[k] ?? 'open') !== 'join';
    const cw = o('W') ? C : 0, ce = o('E') ? C : 0, cs = o('S') ? C : 0, cn = o('N') ? C : 0;
    topGeo.poly([[x0 + cw, y0 + cs, top], [x1 - ce, y0 + cs, top], [x1 - ce, y1 - cn, top], [x0 + cw, y1 - cn, top]], [0, 0, 1]);
    const hb = top - t, hc = top - C;
    if (o('W')) G.pink.poly([[x0 + C, y0 + cs, top], [x0 + C, y1 - cn, top], [x0, y1, hc], [x0, y0, hc]], [-1, 0, 1]);
    if (o('E')) G.pink.poly([[x1 - C, y0 + cs, top], [x1 - C, y1 - cn, top], [x1, y1, hc], [x1, y0, hc]], [1, 0, 1]);
    if (o('S')) G.pink.poly([[x0 + cw, y0 + C, top], [x1 - ce, y0 + C, top], [x1, y0, hc], [x0, y0, hc]], [0, -1, 1]);
    if (o('N')) G.pink.poly([[x0 + cw, y1 - C, top], [x1 - ce, y1 - C, top], [x1, y1, hc], [x0, y1, hc]], [0, 1, 1]);
    if (drawn('W')) G.side.poly([[x0, y0, hb], [x0, y1, hb], [x0, y1, o('W') ? hc : top], [x0, y0, o('W') ? hc : top]], [-1, 0, 0]);
    if (drawn('E')) G.side.poly([[x1, y0, hb], [x1, y1, hb], [x1, y1, o('E') ? hc : top], [x1, y0, o('E') ? hc : top]], [1, 0, 0]);
    if (drawn('S')) G.side.poly([[x0, y0, hb], [x1, y0, hb], [x1, y0, o('S') ? hc : top], [x0, y0, o('S') ? hc : top]], [0, -1, 0]);
    if (drawn('N')) G.side.poly([[x0, y1, hb], [x1, y1, hb], [x1, y1, o('N') ? hc : top], [x0, y1, o('N') ? hc : top]], [0, 1, 0]);
    G.side.poly([[x0, y0, hb], [x1, y0, hb], [x1, y1, hb], [x0, y1, hb]], [0, 0, -1]);
    if (o('W')) paint.push({ a: [x0, y1], b: [x0, y0], out: [-1, 0], h: top, drop: t, top: true });
    if (o('E')) paint.push({ a: [x1, y0], b: [x1, y1], out: [1, 0], h: top, drop: t, top: true });
    if (o('S')) paint.push({ a: [x0, y0], b: [x1, y0], out: [0, -1], h: top, drop: t, top: true });
    if (o('N')) paint.push({ a: [x1, y1], b: [x0, y1], out: [0, 1], h: top, drop: t, top: true });
    if (collide) solid(x0, y0, x1, y1, hb, top, name, 'solid');
  };
  /** Bloque macizo sin bisel (pilas, macizos): caras verticales que se pidan y tapa opcional. */
  const block = (x0: number, y0: number, x1: number, y1: number, h0: number, h1: number, name: string, faces = 'WESN', top = false, collide = true) => {
    if (faces.includes('W')) G.side.poly([[x0, y0, h0], [x0, y1, h0], [x0, y1, h1], [x0, y0, h1]], [-1, 0, 0]);
    if (faces.includes('E')) G.side.poly([[x1, y0, h0], [x1, y1, h0], [x1, y1, h1], [x1, y0, h1]], [1, 0, 0]);
    if (faces.includes('S')) G.side.poly([[x0, y0, h0], [x1, y0, h0], [x1, y0, h1], [x0, y0, h1]], [0, -1, 0]);
    if (faces.includes('N')) G.side.poly([[x0, y1, h0], [x1, y1, h0], [x1, y1, h1], [x0, y1, h1]], [0, 1, 0]);
    if (faces.includes('B')) G.side.poly([[x0, y0, h0], [x1, y0, h0], [x1, y1, h0], [x0, y1, h0]], [0, 0, -1]);
    if (top) G.top.poly([[x0, y0, h1], [x1, y0, h1], [x1, y1, h1], [x0, y1, h1]], [0, 0, 1]);
    if (collide) solid(x0, y0, x1, y1, h0, h1, name);
  };
  /** Pilar prismático robusto con aristas matadas (bisel vertical de 5 cm). */
  const pillar = (cx: number, cy: number, top: number, sx: number, sy: number, name: string, h0 = 0) => {
    const c = 0.05, x0 = cx - sx / 2, x1 = cx + sx / 2, y0 = cy - sy / 2, y1 = cy + sy / 2;
    const ring: [number, number][] = [[x0 + c, y0], [x1 - c, y0], [x1, y0 + c], [x1, y1 - c], [x1 - c, y1], [x0 + c, y1], [x0, y1 - c], [x0, y0 + c]];
    const nrm: V3[] = [[0, -1, 0], [1, -1, 0], [1, 0, 0], [1, 1, 0], [0, 1, 0], [-1, 1, 0], [-1, 0, 0], [-1, -1, 0]];
    ring.forEach((p, i) => { const q = ring[(i + 1) % 8]; G.side.poly([[p[0], p[1], h0], [q[0], q[1], h0], [q[0], q[1], top], [p[0], p[1], top]], nrm[i]); });
    solid(x0, y0, x1, y1, h0, top, `tt_pillar_${name}`);
    TT_PILLARS[name] = { cx, cy, sx, sy, h0, h1: top };
  };
  /** Escalera recta que sube hacia +Y: peldaños reales (malla = colisión) o rampa por el perfil; bordillos escalonados rosas. */
  const stairsN = (x0: number, x1: number, y0: number, y1: number, h0: number, n: number, name: string, base: number | 'soffit', soffit = 0.45) => {
    const d = (y1 - y0) / n, cwd = KIT.stairs.curb.w, ch = KIT.stairs.curb.h, h1 = h0 + n * R;
    const bot = (y: number) => (base === 'soffit' ? h0 + (y - y0) / (y1 - y0) * (h1 - h0) - soffit : base);
    for (let k = 0; k < n; k++) {
      const ya = y0 + k * d, yb = ya + d, ht = h0 + (k + 1) * R;
      G.side.poly([[x0 + cwd, ya, ht - R], [x1 - cwd, ya, ht - R], [x1 - cwd, ya, ht], [x0 + cwd, ya, ht]], [0, -1, 0]);     // contrahuella
      G.top.poly([[x0 + cwd, ya, ht], [x1 - cwd, ya, ht], [x1 - cwd, yb, ht], [x0 + cwd, yb, ht]], [0, 0, 1]);               // huella
      for (const sg of [-1, 1] as const) {
        const xo = sg < 0 ? x0 : x1, xi = sg < 0 ? x0 + cwd : x1 - cwd, hcu = ht + ch;
        G.side.poly([[xo, ya, bot(ya)], [xo, yb, bot(yb)], [xo, yb, hcu - C], [xo, ya, hcu - C]], [sg, 0, 0]);               // costado
        G.side.poly([[xi, ya, ht], [xi, yb, ht], [xi, yb, hcu], [xi, ya, hcu]], [-sg, 0, 0]);                               // cara interior del bordillo
        G.pink.poly([[xo + (sg < 0 ? C : -C), ya, hcu], [xi, ya, hcu], [xi, yb, hcu], [xo + (sg < 0 ? C : -C), yb, hcu]], [0, 0, 1]);   // tapa del bordillo
        G.pink.poly([[xo, ya, hcu - C], [xo, yb, hcu - C], [xo + (sg < 0 ? C : -C), yb, hcu], [xo + (sg < 0 ? C : -C), ya, hcu]], [sg, 0, 1]);
        G.pink.poly([[xo, ya, hcu - R - (k === 0 ? ch : 0)], [xi, ya, hcu - R - (k === 0 ? ch : 0)], [xi, ya, hcu], [xo, ya, hcu]], [0, -1, 0]);   // frente del bordillo
        if (k === n - 1) G.pink.poly([[xo, yb, ht], [xi, yb, ht], [xi, yb, hcu], [xo, yb, hcu]], [0, 1, 0]);                 // remate trasero
        paint.push({ a: sg < 0 ? [xo, yb] : [xo, ya], b: sg < 0 ? [xo, ya] : [xo, yb], out: [sg, 0], h: hcu, drop: hcu - bot(ya), top: false });
        solid(Math.min(xo, xi), ya, Math.max(xo, xi), yb, ht - 0.02, hcu, `${name}_curb`);
      }
      if (KIT.stairs.collision === 'steps') solid(x0, ya, x1, yb, Math.min(bot(ya), ht - R - 0.3), ht, name, 'ground');
    }
    if (base === 'soffit') G.side.poly([[x0, y0, bot(y0)], [x1, y0, bot(y0)], [x1, y1, bot(y1)], [x0, y1, bot(y1)]], [0, 1, -2]);   // intradós
    if (KIT.stairs.collision !== 'steps') {   // rampa por el punto medio de los peldaños (pie a ±R/2 de la huella dibujada)
      const ya = y0 - d / 2, yb = y1 - d / 2;
      hull([[x0, ya, h0], [x1, ya, h0], [x0, yb, h1], [x1, yb, h1], [x0, y1, h1], [x1, y1, h1], [x0, ya, bot(y0) - 0.2], [x1, ya, bot(y0) - 0.2], [x0, y1, bot(y1) - 0.2], [x1, y1, bot(y1) - 0.2]], name, 'ramp');
    }
  };

  // ================================================================ E1: dos tramos macizos con descanso
  { const E = KIT.E1, [x0, x1] = E.x;
    stairsN(x0, x1, E.a[0], E.a[1], E.h[0], 4, 'tt_e1', 0);
    stairsN(x0, x1, E.b[0], E.b[1], E.h[1], 4, 'tt_e1', 0);
    // descanso (entre los bordillos, que lo cruzan a su cota)
    const [ya, yb] = E.landing, h = E.h[1], cwd = KIT.stairs.curb.w, ch = KIT.stairs.curb.h;
    G.top.poly([[x0 + cwd, ya, h], [x1 - cwd, ya, h], [x1 - cwd, yb, h], [x0 + cwd, yb, h]], [0, 0, 1]);
    solid(x0, ya, x1, yb, 0, h, 'tt_e1', 'ground');
    for (const sg of [-1, 1] as const) {
      const xo = sg < 0 ? x0 : x1, xi = sg < 0 ? x0 + cwd : x1 - cwd, hcu = h + ch, bx = xo + (sg < 0 ? C : -C);
      G.side.poly([[xo, ya, 0], [xo, yb, 0], [xo, yb, hcu - C], [xo, ya, hcu - C]], [sg, 0, 0]);
      G.side.poly([[xi, ya, h], [xi, yb, h], [xi, yb, hcu], [xi, ya, hcu]], [-sg, 0, 0]);
      G.pink.poly([[bx, ya, hcu], [xi, ya, hcu], [xi, yb, hcu], [bx, yb, hcu]], [0, 0, 1]);
      G.pink.poly([[xo, ya, hcu - C], [xo, yb, hcu - C], [bx, yb, hcu], [bx, ya, hcu]], [sg, 0, 1]);
      paint.push({ a: sg < 0 ? [xo, yb] : [xo, ya], b: sg < 0 ? [xo, ya] : [xo, yb], out: [sg, 0], h: hcu, drop: hcu, top: false });
      solid(Math.min(xo, xi), ya, Math.max(xo, xi), yb, h - 0.02, hcu, 'tt_e1_curb');
    }
    m.anchor('tt.e1.foot', V(0, E.a[0] - 1.0, 0), H(0, 1));
  }

  // ================================================================ camino inferior +1,20 (frente + giro derecho) sobre apoyos cortos
  { const L = KIT.lower, t = KIT.slab.lower, f = L.front, g = L.turn, E = KIT.E1;
    // el canto sur del frente se abre donde llega E1
    slab(f[0], f[1], E.x[0], f[3], L.h, t, { E: 'join' }, 'tt_lower', false);
    slab(E.x[0], f[1], E.x[1], f[3], L.h, t, { W: 'join', E: 'join', S: 'join' }, 'tt_lower', false);
    slab(E.x[1], f[1], f[2], f[3], L.h, t, { W: 'join', E: 'join' }, 'tt_lower', false);
    // el giro: su canto norte toca P1 (más alto) entre los cantos de la pila
    const pr = KIT.P1.pier;
    slab(g[0], g[1], pr[0], g[3], L.h, t, { W: 'join', E: 'join' }, 'tt_lower', false);
    slab(pr[0], g[1], pr[2], g[3], L.h, t, { W: 'join', E: 'join', N: 'join' }, 'tt_lower', false);
    slab(pr[2], g[1], g[2], g[3], L.h, t, { W: 'join' }, 'tt_lower', false);
    G.side.poly([[g[0], g[3], L.h - t], [g[0], f[3], L.h - t], [g[0], f[3], L.h], [g[0], g[3], L.h]], [1, 0, 0]);   // tramo del canto este del frente que el giro (más corto al norte) deja visto
    solid(f[0], f[1], f[2], f[3], L.h - t, L.h, 'tt_lower', 'ground');
    solid(g[0], g[1], g[2], g[3], L.h - t, L.h, 'tt_lower', 'ground');
    m.anchor('tt.lower', V(4, 0, L.h), H(1, 0));
  }

  // ================================================================ P1 +3,20 sobre pila ancha (cara de EV1) y E2
  { const p = KIT.P1, [x0, y0, x1, y1] = p.bounds, t = KIT.slab.upper, pr = p.pier;
    slab(x0, y0, x1, y1, p.h, t, { N: 'join' }, 'tt_p1');
    block(pr[0], pr[1], pr[2], pr[3], 0, p.h - t, 'tt_p1_pier', 'WESN');
    TT_PILLARS.p1 = { cx: (pr[0] + pr[2]) / 2, cy: (pr[1] + pr[3]) / 2, sx: pr[2] - pr[0], sy: pr[3] - pr[1], h0: 0, h1: p.h - t };
    m.anchor('tt.p1', V((x0 + x1) / 2, (y0 + y1) / 2, p.h), H(0, 1));
    const e = KIT.E2, [a0, b0, a1, b1] = e.bounds;
    stairsN(a0, a1, b0, b1, e.h0, e.steps, 'tt_e2', 'soffit', e.soffit);
  }

  // ================================================================ trasera +4,40 con el ÚNICO agujero H (hueco real hasta la plaza)
  { const r = KIT.rear, [x0, y0, x1, y1] = r.bounds, [hx0, hy0, hx1, hy1] = r.hole, t = KIT.slab.upper, e2 = KIT.E2.bounds, rc = KIT.recta.bounds;
    // franja sur por tramos: unida al zócalo de la recta hasta x = 8, abierta entre la recta y E2, unida a E2, abierta al este;
    // su canto norte solo es canto (del agujero) entre hx0 y hx1
    { const xs = [...new Set([x0, rc[2], hx0, e2[0], hx1, e2[2], x1])].sort((a, b) => a - b);   // R1: H puede quedar al oeste del final de la recta
      for (let i = 0; i < xs.length - 1; i++) { const a = xs[i], c = xs[i + 1], mid = (a + c) / 2;
        const S: Edge = mid < rc[2] || (mid > e2[0] && mid < e2[2]) ? 'join' : 'open', N: Edge = mid > hx0 && mid < hx1 ? 'open' : 'join';
        slab(a, y0, c, hy0, r.h, t, { W: 'join', E: i === xs.length - 2 ? 'open' : 'join', S, N }, 'tt_rear', false); } }
    // lados del agujero y franja norte (el canto oeste de la trasera lo cubre el abanico)
    slab(x0, hy0, hx0, hy1, r.h, t, { W: 'join', S: 'join', N: 'join' }, 'tt_rear', false);
    slab(hx1, hy0, x1, hy1, r.h, t, { S: 'join', N: 'join' }, 'tt_rear', false);
    slab(x0, hy1, hx0, y1, r.h, t, { W: 'flush', E: 'join', S: 'join' }, 'tt_rear', false);
    slab(hx0, hy1, hx1, y1, r.h, t, { W: 'join', E: 'join' }, 'tt_rear', false);
    slab(hx1, hy1, x1, y1, r.h, t, { W: 'join', S: 'join' }, 'tt_rear', false);
    // colisión: cuatro losas alrededor del hueco (nada sobre H ni dentro de su columna)
    solid(x0, y0, x1, hy0, r.h - t, r.h, 'tt_rear', 'ground'); solid(x0, hy1, x1, y1, r.h - t, r.h, 'tt_rear', 'ground');
    solid(x0, hy0, hx0, hy1, r.h - t, r.h, 'tt_rear', 'ground'); solid(hx1, hy0, x1, hy1, r.h - t, r.h, 'tt_rear', 'ground');
    // zócalo bajo el canto norte de la recta: la trasera queda adosada a un muro, como en D04
    const a = r.apron; block(a[0], a[1], a[2], a[3], r.h - t - 0.05, KIT.recta.h - KIT.slab.upper, 'tt_apron', 'ESN');
    G.side.poly([[a[0], a[1], r.h - t - 0.05], [a[2], a[1], r.h - t - 0.05], [a[2], a[3], r.h - t - 0.05], [a[0], a[3], r.h - t - 0.05]], [0, 0, -1]);
    G.side.poly([[a[0], a[1], r.h - t - 0.05], [a[0], a[3], r.h - t - 0.05], [a[0], a[3], KIT.recta.h - KIT.slab.upper], [a[0], a[1], KIT.recta.h - KIT.slab.upper]], [-1, 0, 0]);
    m.anchor('tt.h2', V(10.6, (hy0 + hy1) / 2, r.h), H(-1, 0));
    m.anchor('tt.h.center', V((hx0 + hx1) / 2, (hy0 + hy1) / 2, r.h), H(-1, 0));
    m.anchor('tt.h.ground', V((hx0 + hx1) / 2, (hy0 + hy1) / 2, 0), H(0, 1));
    m.anchor('tt.e3.entry', V(KIT.E3.center[0] + 0.75, KIT.E3.center[1] + 1.6, r.h), H(-1, 0));
    P.boxes.set('tt.h', { c: V((hx0 + hx1) / 2, (hy0 + hy1) / 2, r.h / 2), h: new THREE.Vector3((hx1 - hx0) / 2, r.h / 2 + 0.3, (hy1 - hy0) / 2), yaw: ROT });
  }

  // ================================================================ E3: abanico de un cuarto de vuelta, 2 m de ancho, ocho subidas
  { const e = KIT.E3, [cx, cy] = e.center, [r0, r1] = e.r, n = e.steps, da = (e.deg[1] - e.deg[0]) / n, t = KIT.slab.upper, hb = e.h0 - t;
    const pt = (r: number, deg: number): [number, number] => [cx + r * Math.cos(deg * D2R), cy + r * Math.sin(deg * D2R)];
    for (let k = 0; k < n; k++) {
      const a0 = e.deg[0] + k * da, a1 = a0 + da, ht = e.h0 + (k + 1) * R;
      const i0 = pt(r0, a0), o0 = pt(r1, a0), i1 = pt(r0, a1), o1 = pt(r1, a1);
      const mid = (a0 + a1) / 2 * D2R, on: V3 = [Math.cos(mid), Math.sin(mid), 0];
      const rn: V3 = [Math.sin(a0 * D2R), -Math.cos(a0 * D2R), 0];   // la contrahuella mira contra el sentido de subida
      // huella con bisel rosa en el canto exterior
      const oc0 = pt(r1 - C, a0), oc1 = pt(r1 - C, a1);
      G.top.poly([[i0[0], i0[1], ht], [oc0[0], oc0[1], ht], [oc1[0], oc1[1], ht], [i1[0], i1[1], ht]], [0, 0, 1]);
      G.pink.poly([[oc0[0], oc0[1], ht], [oc1[0], oc1[1], ht], [o1[0], o1[1], ht - C], [o0[0], o0[1], ht - C]], [on[0], on[1], 1]);
      G.side.poly([[i0[0], i0[1], ht - R], [o0[0], o0[1], ht - R], [o0[0], o0[1], ht], [i0[0], i0[1], ht]], rn);              // contrahuella
      G.side.poly([[o0[0], o0[1], hb], [o1[0], o1[1], hb], [o1[0], o1[1], ht - C], [o0[0], o0[1], ht - C]], on);            // cara exterior (hasta el intradós)
      G.side.poly([[i0[0], i0[1], hb], [o0[0], o0[1], hb], [o1[0], o1[1], hb], [i1[0], i1[1], hb]], [0, 0, -1]);            // intradós
      paint.push({ a: [o0[0], o0[1]], b: [o1[0], o1[1]], out: [on[0], on[1]], h: ht, drop: ht - hb, top: false });
      if (KIT.stairs.collision === 'steps') hull([[i0[0], i0[1], hb], [o0[0], o0[1], hb], [i1[0], i1[1], hb], [o1[0], o1[1], hb], [i0[0], i0[1], ht], [o0[0], o0[1], ht], [i1[0], i1[1], ht], [o1[0], o1[1], ht]], 'tt_e3', 'ground');
    }
    // R1: rampa helicoidal por el punto medio de los peldaños (pie a ±R/2 de la huella dibujada), en cuñas finas de 1/4 de
    // peldaño: empieza media huella antes de la primera contrahuella (a ras de la trasera) y llega a +5,60 media huella antes
    // del final. En el borde interior (r 0,60, pegado al núcleo) la pendiente es la máxima que admite el controlador (52°).
    if (KIT.stairs.collision !== 'steps') {
      const hAt = (deg: number) => Math.min(e.h1, Math.max(e.h0, e.h0 + R / 2 + (deg - e.deg[0]) / da * R));
      const d0 = e.deg[0] - da / 2, d1 = e.deg[1], sub = n * 4 + 2;
      for (let k = 0; k < sub; k++) {
        const a0 = d0 + (d1 - d0) * k / sub, a1 = d0 + (d1 - d0) * (k + 1) / sub, h0 = hAt(a0), h1 = hAt(a1);
        const i0 = pt(r0, a0), o0 = pt(r1, a0), i1 = pt(r0, a1), o1 = pt(r1, a1);
        hull([[i0[0], i0[1], hb - 0.2], [o0[0], o0[1], hb - 0.2], [i1[0], i1[1], hb - 0.2], [o1[0], o1[1], hb - 0.2], [i0[0], i0[1], h0], [o0[0], o0[1], h0], [i1[0], i1[1], h1], [o1[0], o1[1], h1]], 'tt_e3', 'ramp');
      }
    }
    // cara de arranque bajo la primera contrahuella (lado este del abanico, por debajo de la trasera queda tapada por su losa)
    // núcleo: cuarto de cilindro a ras de la recta (donde las huellas serían demasiado estrechas)
    { const seg = 6, top = e.h1, ring: [number, number][] = [];
      for (let i = 0; i <= seg; i++) ring.push(pt(r0, e.deg[0] + (e.deg[1] - e.deg[0]) * i / seg));
      for (let i = 0; i < seg; i++) { const p = ring[i], q = ring[i + 1], am = (e.deg[0] + (e.deg[1] - e.deg[0]) * (i + 0.5) / seg) * D2R;
        G.side.poly([[p[0], p[1], e.h0], [q[0], q[1], e.h0], [q[0], q[1], top], [p[0], p[1], top]], [Math.cos(am), Math.sin(am), 0]);
        G.top.poly([[cx, cy, top], [p[0], p[1], top], [q[0], q[1], top]], [0, 0, 1]); }
      // R2 (usuario): las dos caras planas del núcleo (radios de 90° y 180°). Sin ellas, desde la trasera se veía a través del
      // rincón entre el muro de la recta y el primer peldaño (la colisión ya estaba cerrada: solo faltaba la malla)
      for (const [deg, sg] of [[e.deg[0], 1], [e.deg[1], -1]] as const) {
        const a = deg * D2R, p = ring[sg > 0 ? 0 : seg], nrm: V3 = [Math.sin(a) * sg, -Math.cos(a) * sg, 0];
        G.side.poly([[cx, cy, hb], [p[0], p[1], hb], [p[0], p[1], top], [cx, cy, top]], nrm);
      }
      hull([[cx, cy, hb], [cx, cy, top], ...ring.flatMap((p) => [[p[0], p[1], hb], [p[0], p[1], top]] as V3[])], 'tt_e3_core'); }
    m.anchor('tt.e3.top', V(cx - 1.6, cy + 0.2, e.h1), H(0, -1));
  }

  // ================================================================ recta +5,60 con la rampita R1 y recepción alineada del mismo ancho
  { const rc = KIT.recta, [x0, y0, x1, y1] = rc.bounds, t = KIT.slab.upper, r1 = KIT.R1, lip = rc.h + r1.rise;
    const e3 = KIT.E3, fx0 = e3.center[0] - e3.r[1], fx1 = e3.center[0];   // el canto norte se une al abanico entre x 4,0 y 6,6
    slab(r1.x[1], y0, fx0, y1, rc.h, t, { W: 'join', E: 'join' }, 'tt_recta', false);
    slab(fx0, y0, fx1, y1, rc.h, t, { W: 'join', E: 'join', N: 'join' }, 'tt_recta', false);
    slab(fx1, y0, x1, y1, rc.h, t, { W: 'join' }, 'tt_recta', false);
    slab(x0, y0, r1.x[1], y1, rc.h, t, { E: 'join', W: 'flush' }, 'tt_recta', false);   // bajo R1 (la cuña se apoya encima, entre los biseles)
    solid(x0, y0, x1, y1, rc.h - t, rc.h, 'tt_recta', 'ground');
    // R1: cuña corta a todo el ancho (prisma inclinado; ni cubo ni lanzador)
    const xa = r1.x[0], xb = r1.x[1], ya = y0 + C, yb = y1 - C;
    // R1 (usuario): la rampita deja de ser amarilla: misma pintura rosa sobre hormigón que los cantos
    G.pink.poly([[xb, ya, rc.h], [xb, yb, rc.h], [xa + C, yb, lip], [xa + C, ya, lip]], [-0.25, 0, 1]);
    G.pink.poly([[xa + C, ya, lip], [xa + C, yb, lip], [xa, yb, lip - C], [xa, ya, lip - C]], [-1, 0, 1]);
    G.side.poly([[xa, ya, rc.h], [xa, yb, rc.h], [xa, yb, lip - C], [xa, ya, lip - C]], [-1, 0, 0]);
    for (const [yy, sn] of [[ya, -1], [yb, 1]] as const) G.pink.poly([[xa, yy, rc.h], [xb, yy, rc.h], [xa, yy, lip - C], [xa + C, yy, lip]], [0, sn, 0]);
    paint.push({ a: [xa, y1], b: [xa, y0], out: [-1, 0], h: lip, drop: t + r1.rise, top: false });
    hull([[xa, y0, rc.h], [xa, y1, rc.h], [xb, y0, rc.h], [xb, y1, rc.h], [xa, y0, lip], [xa, y1, lip]], 'tt_r1', 'ramp');
    m.anchor('tt.recta.east', V(x1 - 0.8, (y0 + y1) / 2, rc.h), H(-1, 0));
    m.anchor('tt.recta.run', V(5.0, (y0 + y1) / 2, rc.h), H(-1, 0));
    m.anchor('tt.r1.lip', V(xa, (y0 + y1) / 2, lip), H(-1, 0));
    const rp = KIT.reception, [u0, v0, u1, v1] = rp.bounds;
    slab(u0, v0, u1, v1, rp.h, t, {}, 'tt_reception', false);
    solid(u0, v0, u1, v1, rp.h - t, rp.h, 'tt_reception', 'ground');
    m.anchor('tt.reception', V(u1 - 1.6, (v0 + v1) / 2, rp.h), H(-1, 0));
  }

  // ================================================================ pilares
  for (const [x, y, top, sx, sy, name] of KIT.pillars.list as unknown as [number, number, number, number, number, string][]) pillar(x, y, top, sx, sy, name);

  // ================================================================ barandillas de acero oscuro (R5, segunda referencia del usuario)
  // Postes de tubo cuadrado sobre pletina atornillada a la losa, pasamanos redondo grueso y continuo (casquillo en cada poste,
  // curvas en las esquinas) y barra intermedia fina. Acero oscuro con brillo metálico (game.ts le da el mapa de entorno del
  // acero). Mismo trazado (polilíneas del contrato) y misma colisión fina de siempre.
  { const RL = KIT.rails, iron: THREE.BufferGeometry[] = [];
    const PW = 0.07, TOP = 0.96, MID = 0.5, HR = 0.034, MR = 0.016;
    const W3 = (x: number, y: number, h: number) => new THREE.Vector3(WX(x, y), h, WZ(x, y));
    const tube = (pts: THREE.Vector3[], r: number, bend = 0.14) => {
      const path = new THREE.CurvePath<THREE.Vector3>(); let prev = pts[0].clone();
      for (let i = 1; i < pts.length; i++) {
        const p = pts[i]; if (i === pts.length - 1) { path.add(new THREE.LineCurve3(prev, p.clone())); break; }
        const nx = pts[i + 1], a = p.clone().sub(prev).normalize(), c = nx.clone().sub(p).normalize();
        const k = Math.min(bend, p.distanceTo(prev) * 0.45, p.distanceTo(nx) * 0.45), p0 = p.clone().addScaledVector(a, -k), p1 = p.clone().addScaledVector(c, k);
        path.add(new THREE.LineCurve3(prev, p0)); path.add(new THREE.QuadraticBezierCurve3(p0, p.clone(), p1)); prev = p1;
      }
      return new THREE.TubeGeometry(path, Math.max(10, pts.length * 12), r, 10, false);
    };
    /** Cilindro de `a` a `b` (mundo). */
    const rod = (a: THREE.Vector3, c: THREE.Vector3, r: number, seg = 10) => {
      const d = c.clone().sub(a), L = d.length(), g = new THREE.CylinderGeometry(r, r, L, seg);
      g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize())); g.translate((a.x + c.x) / 2, (a.y + c.y) / 2, (a.z + c.z) / 2); return g;
    };
    /** Poste de tubo cuadrado con pletina de 4 tornillos y casquillo del pasamanos (orientado por `t`, dirección local del trazado). */
    const post = (x: number, y: number, h: number, t: [number, number], name: string, slope = 0, top = h + TOP) => {
      const yawL = Math.atan2(t[1], t[0]), w = W3(x, y, h), ph = top - h - 0.03;
      const g = new THREE.BoxGeometry(PW, ph, PW); g.rotateY(yawL + ROT); g.translate(w.x, h + ph / 2, w.z); iron.push(g);
      const pl = new THREE.BoxGeometry(0.15, 0.014, 0.15); pl.rotateY(yawL + ROT); pl.translate(w.x, h + 0.007, w.z); iron.push(pl);
      for (const [du, dv] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
        const bx = x + (Math.cos(yawL) * du - Math.sin(yawL) * dv) * 0.052, by = y + (Math.sin(yawL) * du + Math.cos(yawL) * dv) * 0.052;
        const bo = new THREE.CylinderGeometry(0.011, 0.011, 0.014, 6); bo.translate(WX(bx, by), h + 0.019, WZ(bx, by)); iron.push(bo);
      }
      // casquillo del pasamanos (alineado con el tramo, también en pendiente)
      const L = Math.hypot(t[0], t[1]) || 1, ux = t[0] / L, uy = t[1] / L, half = 0.04;
      iron.push(rod(W3(x - ux * half, y - uy * half, top - slope * half), W3(x + ux * half, y + uy * half, top + slope * half), HR + 0.009, 12));
      b.thin.add(b.solid(PL(x, y, h, yawL), PW, top - h, PW, name, 'rail').handle);
    };
    /** Colisión fina por tramo (la cámara la ignora): caja girada con el tramo; en pendiente, varias. */
    const railCol = (a: number[], c: number[], name: string) => {
      const L = Math.hypot(c[0] - a[0], c[1] - a[1]); if (L < 0.05) return;
      const halves = Math.abs(c[2] - a[2]) > 0.05 ? 4 : 1;
      for (let hk = 0; hk < halves; hk++) {
        const t0 = hk / halves, t1 = (hk + 1) / halves, p0 = [a[0] + (c[0] - a[0]) * t0, a[1] + (c[1] - a[1]) * t0, a[2] + (c[2] - a[2]) * t0], p1 = [a[0] + (c[0] - a[0]) * t1, a[1] + (c[1] - a[1]) * t1, a[2] + (c[2] - a[2]) * t1];
        const pl = PL((p0[0] + p1[0]) / 2, (p0[1] + p1[1]) / 2, Math.min(p0[2], p1[2]), Math.atan2(p1[1] - p0[1], p1[0] - p0[0]));
        b.thin.add(b.solid(pl, L / halves, Math.abs(p1[2] - p0[2]) + RL.h + 0.08, 0.08, name, 'rail').handle);
      }
    };
    const railLine = (line: number[][], name: string) => {
      // postes: en cada vértice y, en tramos llanos, cada ≤ 1,5 m (en pendiente, en los extremos y a mitad si pasa de 2,6 m)
      for (let i = 0; i < line.length; i++) {
        const p = line[i], prev = line[i - 1], next = line[i + 1];
        if (prev && Math.hypot(p[0] - prev[0], p[1] - prev[1]) < 0.2) continue;   // vértice pegado al anterior (giro corto): sin poste
        const d: [number, number] = next ? [next[0] - p[0], next[1] - p[1]] : [p[0] - prev![0], p[1] - prev![1]];
        const dl = Math.hypot(d[0], d[1]) || 1, sl = (next ? next[2] - p[2] : p[2] - prev![2]) / dl;
        post(p[0], p[1], p[2], d, `${name}_post`, sl);
        if (next) {
          const slope = Math.abs(next[2] - p[2]) > 0.05, n = slope ? (dl > 2.6 ? 2 : 1) : Math.max(1, Math.ceil(dl / 1.5));
          for (let k = 1; k < n; k++) { const tt = k / n; post(p[0] + d[0] * tt, p[1] + d[1] * tt, p[2] + (next[2] - p[2]) * tt, d, `${name}_post`, sl); }
        }
      }
      iron.push(tube(line.map((p) => W3(p[0], p[1], p[2] + TOP)), HR));
      iron.push(tube(line.map((p) => W3(p[0], p[1], p[2] + MID)), MR, 0.08));
      for (const end of [line[0], line[line.length - 1]]) { const c = new THREE.SphereGeometry(HR * 1.05, 12, 8); const w = W3(end[0], end[1], end[2] + TOP); c.translate(w.x, w.y, w.z); iron.push(c); }   // remates
      for (let i = 0; i < line.length - 1; i++) railCol(line[i], line[i + 1], name);
    };
    for (const [name, line] of Object.entries(RL.lines)) railLine(line as number[][], `tt_rail_${name}`);
    // arco exterior del abanico E3: postes sobre el borde de los peldaños; pasamanos e intermedia siguen la subida
    { const e = KIT.E3, [cx, cy] = e.center, n = e.steps, da = (e.deg[1] - e.deg[0]) / n, rp = e.r[1] - 0.07, rr = RL.e3_arc.r;
      const stepTop = (deg: number) => e.h0 + Math.min(n, Math.floor((deg - e.deg[0]) / da) + 1) * R;
      const hLine = (deg: number) => e.h0 + R / 2 + (deg - e.deg[0]) / (e.deg[1] - e.deg[0]) * (e.h1 - e.h0 - R / 2);
      const at = (r: number, deg: number): [number, number] => [cx + r * Math.cos(deg * D2R), cy + r * Math.sin(deg * D2R)];
      const pd = [e.deg[0] + da * 0.5, 112, 135, 158, e.deg[1] - da * 0.5];
      const slope = (e.h1 - e.h0) / (rp * (e.deg[1] - e.deg[0]) * D2R);
      const hT = (deg: number) => stepTop(pd[0]) + (hLine(deg) - hLine(pd[0]));   // línea del pasamanos (sube con la rampa)
      for (const deg of pd) { const [x, y] = at(rp, deg), tg: [number, number] = [-Math.sin(deg * D2R), Math.cos(deg * D2R)];
        post(x, y, stepTop(deg), tg, 'tt_rail_e3_post', slope, hT(deg) + TOP); }   // el poste nace en su peldaño y llega al pasamanos
      for (const [hh, r] of [[TOP, HR], [MID, MR]] as const) { const arc: THREE.Vector3[] = [];
        for (let k = 0; k <= 32; k++) { const deg = pd[0] + (pd[4] - pd[0]) * k / 32, [x, y] = at(rp, deg); arc.push(W3(x, y, hT(deg) + hh)); }
        iron.push(tube(arc, r, 0.02)); }
      const line: number[][] = [];
      for (let k = 0; k <= n; k++) { const deg = e.deg[0] + k * da; line.push([...at(rr, deg), e.h0 + k * R]); }
      for (let i = 0; i < line.length - 1; i++) railCol(line[i], line[i + 1], 'tt_rail_e3');
    }
    const merged = mergeGeometries(iron.map((g) => { const q = g.index ? g.toNonIndexed() : g; for (const k of Object.keys(q.attributes)) if (!['position', 'normal', 'uv'].includes(k)) q.deleteAttribute(k); return q; }));
    if (merged) b.decor(merged, ID, 'tt_iron', { name: 'tt_rails', shadow: false });
  }

  // ================================================================ escaleras de mano rosas EV1 y EV2 (malla + registro para la trepa)
  // R5 (usuario, 14 oct, imagen de referencia): largueros de perfil rectangular que suben sobre el canto y se doblan hacia la
  // losa como asidero (con tope oscuro), peldaños planos, soportes a la pared con pletina atornillada y pies apoyados.
  { const pink: THREE.BufferGeometry[] = [], dark: THREE.BufferGeometry[] = [];
    /** Caja en coordenadas locales: centro (x, y, h), medidas a lo largo de `u` (lateral), de `dv` (hacia la pared) y en alto. */
    const boxL = (list: THREE.BufferGeometry[], x: number, y: number, h: number, su: number, sd: number, sh: number, yawL: number) => {
      const g = new THREE.BoxGeometry(su, sh, sd); g.rotateY(yawL + ROT); g.translate(WX(x, y), h, WZ(x, y)); list.push(g);
    };
    for (const [key, L] of Object.entries(KIT.ladders).filter(([k]) => !k.startsWith('_')) as [string, any][]) {
      const dv: [number, number] = L.dir === 'N' ? [0, 1] : [-1, 0], side: [number, number] = [-dv[1], dv[0]];   // dirección hacia la pared y lateral
      const wall: [number, number] = L.dir === 'N' ? [L.at, L.face] : [L.face, L.at];
      const ax: [number, number] = [wall[0] - dv[0] * L.standoff, wall[1] - dv[1] * L.standoff], hw = L.width / 2;
      const yawL = Math.atan2(side[1], side[0]);   // giro local que lleva el eje X de la caja a `side`
      const RW = 0.055, RD = 0.04, hookUp = 0.34, hookIn = L.standoff + 0.2;
      for (const sg of [-1, 1]) {
        const x = ax[0] + side[0] * hw * sg, y = ax[1] + side[1] * hw * sg, len = L.top + hookUp - L.bottom;
        boxL(pink, x, y, L.bottom + len / 2, RW, RD, len, yawL);                                                        // larguero
        const hx = x + dv[0] * hookIn / 2, hy = y + dv[1] * hookIn / 2;
        boxL(pink, hx, hy, L.top + hookUp - RW / 2, RW, hookIn + RD / 2, RW, yawL);                                     // asidero: se dobla hacia la losa
        const ex = x + dv[0] * hookIn, ey = y + dv[1] * hookIn;
        boxL(pink, ex, ey, L.top + hookUp / 2 + 0.02, RW, RD, hookUp - 0.02, yawL);                                     // y baja hasta la losa
        boxL(dark, ex, ey, L.top + 0.02, RW + 0.012, RD + 0.012, 0.04, yawL);                                            // tope oscuro
        boxL(dark, x, y, L.bottom + 0.008, 0.12, 0.1, 0.016, yawL);                                                      // pie
        for (const hb of [L.bottom + 0.35, L.top - 0.32]) {                                                              // soportes a la pared
          const mx = x + dv[0] * L.standoff / 2, my = y + dv[1] * L.standoff / 2;
          boxL(pink, mx, my, hb, 0.035, L.standoff, 0.035, yawL);
          const px = wall[0] + side[0] * hw * sg - dv[0] * 0.006, py = wall[1] + side[1] * hw * sg - dv[1] * 0.006;
          boxL(pink, px, py, hb, 0.11, 0.012, 0.13, yawL);
          for (const [du, dh] of [[-0.035, -0.04], [0.035, -0.04], [-0.035, 0.04], [0.035, 0.04]]) boxL(dark, px + side[0] * du - dv[0] * 0.006, py + side[1] * du - dv[1] * 0.006, hb + dh, 0.018, 0.012, 0.018, yawL);
        }
        b.thin.add(b.solid(PL(x, y, L.bottom), 0.07, len, 0.07, `tt_ladder_${key}`, 'small').handle);
      }
      for (let hy = L.bottom + L.rung; hy < L.top - 0.02; hy += L.rung) boxL(pink, ax[0], ax[1], hy, L.width, 0.065, 0.04, yawL);   // peldaños planos
      const heading = H(dv[0], dv[1]);
      const top = V(wall[0] + dv[0] * L.topIn, wall[1] + dv[1] * L.topIn, L.top);
      const zf = `act.ladderFoot.${key}`, zt = `act.ladderTop.${key}`;
      P.zone(zf, V(ax[0] - dv[0] * 0.5, ax[1] - dv[1] * 0.5), 0.75, L.bottom - 0.3, L.bottom + 0.4);
      P.zone(zt, V(wall[0] + dv[0] * 0.45, wall[1] + dv[1] * 0.45), 0.55, L.top - 0.2, L.top + 0.5);
      m.ladders.push({ id: `tt.${key}`, axis: V(ax[0], ax[1], L.bottom), heading, bottom: L.bottom, top: L.top, topPos: top, footZone: zf, topZone: zt, width: L.width, rung: L.rung });
      m.anchor(`tt.${key}.foot`, V(ax[0] - dv[0] * 0.47, ax[1] - dv[1] * 0.47, L.bottom), heading);
      m.anchor(`tt.${key}.top`, top, heading);
    }
    const clean = (list: THREE.BufferGeometry[]) => mergeGeometries(list.map((g) => { const q = g.index ? g.toNonIndexed() : g; for (const k of Object.keys(q.attributes)) if (!['position', 'normal', 'uv'].includes(k)) q.deleteAttribute(k); return q; }));
    const mp = clean(pink), md = clean(dark);
    if (mp) b.decor(mp, ID, 'tt_ladder', { name: 'tt_ladders', shadow: false });
    if (md) b.decor(md, ID, 'tt_iron', { name: 'tt_ladders_dark', shadow: false });
  }

  // ================================================================ limo rosa perpendicular: derivado V5 a escala uniforme, colisión por secciones medidas
  { const L = KIT.limo, s = L.scale, [cx, cy] = L.center, S = L.sections;
    const Q = (l: number, w: number, z: number): V3 => [cx - w * s, cy + l * s, L.base + z * s];   // modelo (largo, ancho, alto) → local
    const boxS = (l0: number, l1: number, w0: number, w1: number, z0: number, z1: number, name: string, kind = 'solid') => solid(cx - w1 * s, cy + l0 * s, cx - w0 * s, cy + l1 * s, L.base + z0 * s, L.base + z1 * s, name, kind);
    boxS(S.body.l[0], S.body.l[1], -S.body.w, S.body.w, S.body.z[0], S.body.z[1], 'limo');
    { const h = S.hood; hull([-1, 1].flatMap((sg) => [Q(h.l[0], sg * h.w, h.z0), Q(h.l[1], sg * h.w, h.z0), Q(h.l[0], sg * h.w, h.zFront), Q(h.l[1], sg * h.w, h.zBack)]), 'limo_hood', 'ground'); }
    { const c = S.cabin; hull([-1, 1].flatMap((sg) => [Q(c.lBottom[0], sg * c.wBottom, c.z0), Q(c.lBottom[1], sg * c.wBottom, c.z0), Q(c.lTop[0], sg * c.wTop, c.zFront), Q(c.lTop[1], sg * c.wTop, c.zBack)]), 'limo_roof', 'ground'); }
    for (const sg of [-1, 1]) boxS(sg < 0 ? -S.bumpers.l[1] : S.bumpers.l[0], sg < 0 ? -S.bumpers.l[0] : S.bumpers.l[1], -S.bumpers.w, S.bumpers.w, S.bumpers.z[0], S.bumpers.z[1], 'limo_bumper');
    for (const sl of [-1, 1]) for (const sw of [-1, 1]) boxS(sl < 0 ? -S.wheels.l[1] : S.wheels.l[0], sl < 0 ? -S.wheels.l[0] : S.wheels.l[1], sw < 0 ? -S.wheels.w[1] : S.wheels.w[0], sw < 0 ? -S.wheels.w[0] : S.wheels.w[1], S.wheels.z[0], S.wheels.z[1], 'limo_wheel');
    // aspecto: derivado GLB instanciado por Park.loadProps (frente del GLB −X → −Y local = +Z del mundo: yaw three +90°; el
    // cargador suma −90° al rumbo del hueco). El proxy solo se ve si el GLB no carga.
    const slot = { kind: 'limo' as const, x: WX(cx, cy), y: L.base, z: WZ(cx, cy), yaw: Math.PI + ROT, h: s * L.refLength };
    PROP_SLOTS.push(slot);
    const ch = b.chunk; b.chunk = 'proxy_limo';
    b.box(PL(cx, cy, L.base + S.body.z[0] * s), 2 * S.body.w * s, (S.body.z[1] - S.body.z[0]) * s, (S.body.l[1] - S.body.l[0]) * s, { mat: 'pink', collide: false });
    b.box(PL(cx, cy + 0.5 * s, L.base + S.cabin.z0 * s), 2 * S.cabin.wTop * s, (S.cabin.zBack - S.cabin.z0) * s, (S.cabin.lTop[1] - S.cabin.lTop[0]) * s, { mat: 'pink', collide: false });
    b.chunk = ch;
    m.anchor('tt.roof.center', V(cx, cy, L.roof), H(0, -1));
    m.anchor('tt.roof.front', V(cx, cy + (S.cabin.lTop[0] + 0.45) * s, L.roof), H(0, -1));
    m.anchor('tt.roof.rear', V(cx, cy + (S.cabin.lTop[1] - 1.0) * s, L.roof), H(0, 1));
    m.anchor('tt.hood', V(cx, cy + (S.hood.l[0] + S.hood.l[1]) / 2 * s, L.base + S.hood.zBack * s), H(0, -1));
  }

  // ================================================================ Aissa y Juseph sentados en los extremos; una zona de charla por NPC, sobre el techo
  { const N = KIT.npcs;
    for (const who of ['aissa', 'juseph'] as const) {
      const n = N[who], [x, y, h] = n.root;
      m.anchor(`npc.${who}`, V(x, y, h), H(0, n.headingDeg === 0 ? -1 : 1));
      P.zone(`act.bridgeTalk.${who}`, V(n.zone[0], n.zone[1]), n.zone[2], n.zoneH[0], n.zoneH[1]);
      m.anchor(`cam.bridge.${who}`, V(n.cam[0], n.cam[1], n.cam[2]), 0);
    }
    P.zones.set('act.bridgeTalk', P.zones.get('act.bridgeTalk.aissa')!);   // compatibilidad: la zona genérica es la de Aissa
    m.anchor('cam.bridge', V(N.aissa.cam[0], N.aissa.cam[1], N.aissa.cam[2]), 0);
  }

  // ================================================================ patatas (cuatro IDs estables; recogida por altura absoluta del pie)
  { const F = KIT.fries;
    const put = (kind: 'visible' | 'medium' | 'hidden' | 'activity', support: number, access: 'roll' | 'ramp', hint: string, back: string) => {
      const f = F[kind], [x, y, h] = f.c;
      P.fry(id, kind, V(x, y, support), access, hint, back, h - support);
      const s = m.fries[m.fries.length - 1]; s.trigger.set(f.half, 0.8, f.half); s.reach = [f.reach[0], f.reach[1]];
    };
    put('visible', KIT.lower.h, 'roll', 'Sobre el camino inferior, delante del pie de la escalera de mano', 'Volver por el camino a la escalera de entrada');
    put('medium', 0, 'ramp', 'Flotando sobre el agujero de la plataforma trasera: se coge al saltarlo', 'Seguir hacia la escalera curva o dejarse caer a la plaza');
    put('hidden', 0, 'roll', 'En el suelo de la plaza, justo debajo del agujero: andando entre los pilares o cayendo por él', 'Salir andando entre los pilares y volver a la escalera de entrada');
    put('activity', KIT.limo.roof, 'ramp', 'En el centro del techo de la limo, tras hablar con Aissa y con Juseph', 'Bajar por la escalerilla de la limo');
  }

  // ================================================================ suelo del sector: cassette junto a E1, punto de control
  { const c = KIT.cassette, [x, y] = c.at, pos = V(x, y), hd = H(Math.sin(c.headingDeg * D2R), -Math.cos(c.headingDeg * D2R));
    m.cassettes.push({ zone: id, pos, heading: hd });
    b.box({ x: pos.x, z: pos.z, yaw: hd }, c.plinth[0], c.plinth[1], c.plinth[2], { mat: 'tt_side', name: 'plinth' });
    const cp = KIT.checkpoint; m.checkpoints.push({ id: 'cp.tratratra', zone: id, pos: V(cp.at[0], cp.at[1]), heading: H(0, 1) });
    // compatibilidad de anclas antiguas (herramientas): pie de la entrada, llegada a la recepción y centro
    m.anchor('bridge.rampBottom', V(0, KIT.E1.a[0] - 1.0, 0), H(0, 1));
    m.anchor('bridge.top', V(KIT.reception.bounds[2] - 1.6, 3, KIT.reception.h), H(-1, 0));
    m.anchor('bridge.deckCenter', V(-4.5, 3, KIT.reception.h + 1), 0);
  }

  // ================================================================ vegetación local facetada y farolillos (familia NMG; fuera de rutas, de H y de la cámara)
  { const VG = (KIT as any).vegetation, first = PROP_SLOTS.length;
    if (VG) {
      for (const [x, y, variant, s, yawDeg] of VG.plants as [number, number, 'a' | 'a_flor' | 'b' | 'c', number, number][]) nmgPlant(b, PL(x, y, 0, yawDeg * D2R), variant, s);
      for (const [x, y, s] of VG.shrubs as [number, number, number][]) nmgFlowerShrub(b, PL(x, y, 0), s);
      for (const [x, y, h, lean, seed] of VG.palms as [number, number, number, number, number][]) palm(b, PL(x, y, 0), h, lean, seed, true);
      for (const [x, y, variant, h] of VG.trees as [number, number, 'round' | 'open', number][]) nmgTree(b, PL(x, y, 0), variant, h);
      for (const [x, y] of (VG.lamps ?? []) as [number, number][]) { const v = V(x, y); TT_LAMPS.push({ x: v.x, z: v.z, yaw: -CORONA_ROT_DEG * D2R }); b.thin.add(b.solid({ x: v.x, y: 0, z: v.z }, 0.24, 0.9, 0.24, 'tt_lamp', 'small').handle); }   // R1 (usuario): sin farolillos
      // malla instanciada propia para la vegetación de TT: si compartiera la de NMG, su esfera abarcaría medio parque y las matas de
      // TT se dibujarían siempre (medido en perf-v7: +18 % de triángulos en la vista de FASHION GIRL)
      for (let i = first; i < PROP_SLOTS.length; i++) PROP_SLOTS[i].group = 'tt';
    }
  }

  // ================================================================ lote estático
  if (!G.side.empty) b.decor(G.side.build(), ID, 'tt_side', { name: 'tt_side' });
  if (!G.top.empty) b.decor(G.top.build(), ID, 'tt_top', { name: 'tt_top' });
  // biseles rosas y rampita: no proyectan sombra propia (la dan las losas que rematan)
  if (!G.pink.empty) b.decor(G.pink.build(), ID, 'tt_pink', { name: 'tt_pink', shadow: false });
  if (!G.yellow.empty) b.decor(G.yellow.build(), ID, 'tt_yellow', { name: 'tt_yellow', shadow: false });

  buildPaint(P, paint);
  buildGraffiti(P);
}

// ------------------------------------------------------------------ pintura rosa de cantos: goteo en las caras y sangrado sobre las tapas
/** Una sola malla y un material (atlas `T_tt_paint`, filas a todo el ancho: U repetible). */
function buildPaint(P: Park, edges: PaintEdge[]) {
  const A = (ATLAS as any).paint; if (!A) return;
  const pos: number[] = [], uv: number[] = [], idx: number[] = [];
  const quad = (p: V3[], uvs: [number, number][]) => { const b0 = pos.length / 3; p.forEach((q, i) => { pos.push(WX(q[0], q[1]), q[2], WZ(q[0], q[1])); uv.push(uvs[i][0], uvs[i][1]); }); idx.push(b0, b0 + 1, b0 + 2, b0, b0 + 2, b0 + 3); };
  let run = 0;
  const e = 0.006;
  for (const ed of edges) {
    const dx = ed.b[0] - ed.a[0], dy = ed.b[1] - ed.a[1], L = Math.hypot(dx, dy); if (L < 0.05) continue;
    const u0 = run / A.metres, u1 = (run + L) / A.metres; run += L + 0.37;   // desfase entre tramos: no se repite el mismo goteo
    const ox = ed.out[0] * e, oy = ed.out[1] * e;
    // cara: banda de goteo desde el canto hacia abajo (lo que quepa de cara)
    const d = Math.min(ed.drop, A.drip.metres), [v0, v1] = A.drip.v as [number, number], vb = v0 + (v1 - v0) * (d / A.drip.metres);
    quad([[ed.a[0] + ox, ed.a[1] + oy, ed.h - d], [ed.b[0] + ox, ed.b[1] + oy, ed.h - d], [ed.b[0] + ox, ed.b[1] + oy, ed.h - KIT.slab.chamfer], [ed.a[0] + ox, ed.a[1] + oy, ed.h - KIT.slab.chamfer]], [[u0, vb], [u1, vb], [u1, v0], [u0, v0]]);
    if (ed.top) {   // tapa: sangrado irregular hacia dentro
      const w = A.bleed.metres, [t0, t1] = A.bleed.v as [number, number], c = KIT.slab.chamfer, ix = -ed.out[0], iy = -ed.out[1];
      quad([[ed.a[0] + ix * c, ed.a[1] + iy * c, ed.h + e], [ed.b[0] + ix * c, ed.b[1] + iy * c, ed.h + e], [ed.b[0] + ix * (c + w), ed.b[1] + iy * (c + w), ed.h + e], [ed.a[0] + ix * (c + w), ed.a[1] + iy * (c + w), ed.h + e]], [[u0 + 0.31, t0], [u1 + 0.31, t0], [u1 + 0.31, t1], [u0 + 0.31, t1]]);
    }
  }
  if (!idx.length) return;
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx); g.computeVertexNormals();
  const t = new THREE.TextureLoader().load(`${ASSET_BASE}tex/T_tt_paint.webp`);
  t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; t.wrapS = THREE.RepeatWrapping; t.wrapT = THREE.ClampToEdgeWrapping; t.flipY = false;
  const mat = new THREE.MeshStandardMaterial({ map: t, transparent: true, alphaTest: 0.03, roughness: 0.7, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3, side: THREE.DoubleSide });
  const mesh = new THREE.Mesh(g, mat); mesh.name = 'TT_PAINT'; mesh.receiveShadow = true; mesh.renderOrder = 1; P.root.add(mesh);
}

// ------------------------------------------------------------------ grafitis TT y lettering L02 pintados sobre caras (cada uno UNA vez)
export const TT_GRAFFITI: { id: string; pos: THREE.Vector3; normal: THREE.Vector3; w: number; h: number }[] = [];
function buildGraffiti(P: Park) {
  TT_GRAFFITI.length = 0;
  const A = (ATLAS as any).graffiti, list = (KIT as any).graffiti?.list as any[] | undefined; if (!A || !list) return;
  const pos: number[] = [], uv: number[] = [], idx: number[] = [];
  for (const it of list) {
    const cell = A.cells[it.id]; if (!cell) continue;
    // cara: de un pilar (`pillar` + lado N/S/E/W) o explícita (`at` [x, y] del plano + `face`)
    let cx: number, cy: number, faceW = Infinity; const n: [number, number] = it.face === 'N' ? [0, 1] : it.face === 'S' ? [0, -1] : it.face === 'E' ? [1, 0] : [-1, 0];
    if (it.pillar) { const p = TT_PILLARS[it.pillar]; if (!p) continue; cx = p.cx + n[0] * p.sx / 2 + (n[0] === 0 ? (it.off ?? 0) : 0); cy = p.cy + n[1] * p.sy / 2 + (n[1] === 0 ? (it.off ?? 0) : 0);
      faceW = (n[0] === 0 ? p.sx : p.sy) - 2 * Math.abs(it.off ?? 0) - 0.04; }   // V10.2 R-07a: el dibujo cabe en su cara del pilar (2 cm a cada lado)
    else { cx = it.at[0]; cy = it.at[1]; }
    const k = Math.min(1, faceW / (it.size * cell.aspect)), hgt = it.size * k, wid = hgt * cell.aspect, e = 0.012;
    const right: [number, number] = [-n[1], n[0]];   // derecha del observador que mira la cara de frente (para leer sin espejo)
    const px = cx + n[0] * e, py = cy + n[1] * e, h0 = it.h - hgt / 2, h1 = it.h + hgt / 2;
    const a: V3 = [px - right[0] * wid / 2, py - right[1] * wid / 2, h0], c: V3 = [px + right[0] * wid / 2, py + right[1] * wid / 2, h0];
    const b0 = pos.length / 3; const [u0, v0, u1, v1] = cell.uv as number[];
    for (const [q, uu, vv] of [[a, u0, v1], [c, u1, v1], [[c[0], c[1], h1] as V3, u1, v0], [[a[0], a[1], h1] as V3, u0, v0]] as [V3, number, number][]) { pos.push(WX(q[0], q[1]), q[2], WZ(q[0], q[1])); uv.push(uu, vv); }
    idx.push(b0, b0 + 1, b0 + 2, b0, b0 + 2, b0 + 3);
    TT_GRAFFITI.push({ id: it.id, pos: new THREE.Vector3(WX(px, py), it.h, WZ(px, py)), normal: new THREE.Vector3(n[0] * CR - n[1] * SR, 0, -(n[0] * SR + n[1] * CR)), w: wid, h: hgt });
  }
  if (!idx.length) return;
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx); g.computeVertexNormals();
  const t = new THREE.TextureLoader().load(`${ASSET_BASE}tex/T_tt_graffiti.webp`);
  t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping; t.flipY = false;
  const mat = new THREE.MeshStandardMaterial({ map: t, transparent: true, alphaTest: 0.02, roughness: 0.88, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4, side: THREE.DoubleSide });
  const mesh = new THREE.Mesh(g, mat); mesh.name = 'TT_GRAFFITI'; mesh.receiveShadow = true; mesh.renderOrder = 2; P.root.add(mesh);
}

/** Cotas útiles para el juego (charla, cámara, pistas). */
export const TT = { roof: KIT.limo.roof, receptionH: KIT.reception.h, hole: KIT.rear.hole, rearH: KIT.rear.h };
