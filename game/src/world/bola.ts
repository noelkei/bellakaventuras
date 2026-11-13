// V10 · Exterior Bola de Oro (dossier definitivo v1, Auditoría 11; V10/plan/10_exterior-bola-de-oro.md). Sustituye al perímetro antiguo
// (módulos de esquina, bandas de árboles, bancos, farolas y fondo simplificado) por la distribución aprobada v2.8 + detalle fase 16:
//  · visual: GLB por capas de la receta `assets/derived/v10/bola/export_bola.mjs` (núcleo jugable fusionado por material, letras
//    BELLAKACIONES, fondo de edificios/jardines, figuras Fennec y Rana, plaza/paseo/borde de la fase 16) + instancias de las 11 familias
//    reutilizadas (palmeras, árboles, arbustos, plantas, farolas, bancos) y la floración nativa, con la malla del juego de cada familia;
//  · colisión: `bola_colliders.json` (receta `make_bola_colliders.mjs`): las 130 raíces físicas del contrato + 44 tramos de muro + troncos,
//    con las mallas nativas (cascos convexos por pieza; triángulos para quarters, hip, ledges curvos, jardineras curvas y BK-BASAMENTO;
//    cilindros para fustes de farola y troncos; bancos con hueco inferior);
//  · suelo: azulado común en Y 0 (cuadrado − r 42); la plaza (desierto) y el borde blanco-gris van en `bola_lobby.glb`.
// Nada de esto toca la corona ni el centro (Bola de Oro §07: el exterior no gira).
import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import { loadGlb, loadJson } from '../assets';
import { WORLD } from './manifest';
import type { Park } from './park';
import { vcParts } from './vcmerge';
import { VegTiers, meanColor, palmProxy, twoColors } from './vegtiers';
import INST from './bola_instancias.json';
import { paintPlaza } from './plaza';

export interface BolaPart { id: string; k: string; m: string; t: 'hull' | 'tri' | 'cyl'; v?: number[]; i?: number[]; c?: [number, number, number]; r?: number; h?: number }
let PARTS: BolaPart[] | null = null;
/** Colisiones del exterior: se cargan ANTES de construir el parque (las esenciales existen antes de dar el control). */
export async function loadBolaColliders() { PARTS = (await loadJson<{ parts: BolaPart[] }>('bola/bola_colliders.json')).parts; }

/** Contrato del lobby (contrato-maestro.json → `lobby`, `paving`). */
export const BOLA = {
  plaza: { x: 40, z: -40, R: 8.5, band: 8.9 },
  spawn: { pos: new THREE.Vector3(40, 0, -40), heading: -Math.PI / 4 },   // §05: contacto de suelo; el controlador añade 0,02
};
/** Familias reutilizadas → malla del juego (Bola de Oro §12). La maqueta las normaliza a alto 1, centradas en XZ y con base en Y 0. */
const FAMILY: Record<string, { glb: string; native?: boolean; lod?: string }> = {
  palm: { glb: 'props/nmg_palm_straight.glb' }, palm_lean: { glb: 'props/nmg_palm_lean.glb' }, tree: { glb: 'props/nmg_tree_round.glb' },
  // D-EX-02: las instancias de FUERA del cuadrado (fondo, tras los muros) usan la versión diezmada de la misma familia
  shrub: { glb: 'props/nmg_shrub_flor.glb', lod: 'bola/lod_nmg_shrub_flor.glb' }, plant_a: { glb: 'props/nmg_plant_a_flor.glb', lod: 'bola/lod_nmg_plant_a_flor.glb' },
  plant_b: { glb: 'props/nmg_plant_b.glb', lod: 'bola/lod_nmg_plant_b.glb' }, plant_c: { glb: 'props/nmg_plant_c.glb', lod: 'bola/lod_nmg_plant_c.glb' }, lamp: { glb: 'props/lamp_double.glb' }, bench: { glb: 'bola/bola_bench.glb' },
  native_bougainvillea: { glb: 'bola/bola_bougainvillea.glb', native: true },
};

export function buildBola(P: Park) {
  const b = P.b, W = P.world;
  if (!PARTS) throw new Error('colisiones del exterior sin cargar');
  const prev = b.chunk; b.chunk = 'bola';
  // ---------------------------------------------------------------- suelo azulado común (Y 0) en el cuadrado menos el círculo r 42
  const H = WORLD.half, circle: [number, number][] = [];
  // V10.1 (sonda de caras): polígono CIRCUNSCRITO (vértices a r/cos(π/N)): con el inscrito el turquesa entraba en los suelos de la corona en r 42
  const NC = 360, RC = WORLD.rOuter / Math.cos(Math.PI / NC);
  for (let i = 0; i < NC; i++) { const a = -i / NC * Math.PI * 2; circle.push([RC * Math.sin(a), -RC * Math.cos(a)]); }
  b.planeWithHoles([[-H, -H], [H, -H], [H, H], [-H, H]], [circle], 0, 'bola_azulado', 0.125, { uvOffset: [H, -H] });
  // ---------------------------------------------------------------- colisiones nativas
  let n = 0;
  const stairs = PARTS.filter((p) => p.k === 'stairs' && p.t === 'hull');
  for (const p of PARTS) {
    if (stairs.includes(p)) continue;   // V10.1 P19: se sustituyen por la rampa de abajo
    let desc: RAPIER.ColliderDesc | null = null;
    if (p.t === 'hull') desc = RAPIER.ColliderDesc.convexHull(new Float32Array(p.v!));
    else if (p.t === 'tri') desc = RAPIER.ColliderDesc.trimesh(new Float32Array(p.v!), new Uint32Array(p.i!));
    else if (p.t === 'cyl') desc = RAPIER.ColliderDesc.cylinder(p.h! / 2, p.r!).setTranslation(p.c![0], p.c![1], p.c![2]);
    if (!desc) { console.warn('exterior: pieza sin casco', p.id, p.m); continue; }
    /* V10 IT2: los raíles (barra, postes y pletinas) son props finos como bolardos y farolas: chocar contra ellos da golpe y caída suave,
       nunca estrella (MOV-13, RAMP-01) */
    const c = b.addCollider(desc, `bola_${p.k}`, p.k === 'bollard' || p.k === 'lamp' || p.k === 'rail' ? 'small' : 'solid');
    if (p.t === 'cyl' && (p.r ?? 1) < 0.15) b.thin.add(c.handle);
    P.bolaPartOf.set(c.handle, p.id);   // id de la maqueta (contrato) de cada collider: lo usan las pruebas del exterior
    n++;
    // V10 IT2 (plan 10 E-16, zona «TE grind»): los raíles del exterior son de grind como el raíl de esquina de V9. La barra (casco largo y
    // fino; postes y pletinas quedan fuera por longitud) se da de alta con su eje en planta (centroide + dirección más larga) y su cima
    if (p.k === 'rail' && p.t === 'hull') {
      const v = p.v!, N = v.length / 3; let cx = 0, cz = 0, top = -9;
      for (let i = 0; i < N; i++) { cx += v[i * 3]; cz += v[i * 3 + 2]; top = Math.max(top, v[i * 3 + 1]); }
      cx /= N; cz /= N;
      let far = 0, ux = 1, uz = 0;
      for (let i = 0; i < N; i++) for (let j = i + 1; j < N; j++) { const dx = v[j * 3] - v[i * 3], dz = v[j * 3 + 2] - v[i * 3 + 2], d = dx * dx + dz * dz; if (d > far) { far = d; ux = dx; uz = dz; } }
      const ul = Math.hypot(ux, uz) || 1; ux /= ul; uz /= ul;
      let t0 = 1e9, t1 = -1e9; for (let i = 0; i < N; i++) { const t = (v[i * 3] - cx) * ux + (v[i * 3 + 2] - cz) * uz; t0 = Math.min(t0, t); t1 = Math.max(t1, t); }
      if (t1 - t0 >= 1.5 && top > 0.3) P.rails.push({ a: new THREE.Vector3(cx + ux * t0, 0, cz + uz * t0), b: new THREE.Vector3(cx + ux * t1, 0, cz + uz * t1), top, name: 'bola_rail' });
    }
  }
  // V10.1 P23 (usuario: «te tienes que poder sentar en cualquier banco»): los 16 bancos del exterior, desde su asiento (pieza `_seat`) y su
  // respaldo (`_back`): ANMI a 0,35 m del centro mirando al frente (lejos del respaldo), con la altura de SU asiento
  { const byId = new Map<string, BolaPart[]>(); for (const p of PARTS) if (p.k === 'bench' && p.t === 'hull') byId.set(p.id, [...(byId.get(p.id) ?? []), p]);
    const stat = (p: BolaPart) => { const v = p.v!; let x = 0, z = 0, top = -9; const N = v.length / 3; for (let i = 0; i < N; i++) { x += v[i * 3]; z += v[i * 3 + 2]; top = Math.max(top, v[i * 3 + 1]); } return { x: x / N, z: z / N, top }; };
    for (const [id, ps] of byId) { const seat = ps.find((p) => /_seat$/i.test(p.m)), back = ps.find((p) => /_back$/i.test(p.m)); if (!seat) continue;
      // sin respaldo (bancos corridos de TS sobre su zócalo): mirando hacia el parque (el centro)
      const S0 = stat(seat), B0 = back ? stat(back) : { x: S0.x * 1.05, z: S0.z * 1.05, top: 0 }; let fx = S0.x - B0.x, fz = S0.z - B0.z; const fl = Math.hypot(fx, fz) || 1; fx /= fl; fz /= fl;
      const h = Math.atan2(fx, fz), rx = -Math.cos(h), rz = Math.sin(h);
      P.manifest.anchor(`ext.bench.sit.${id}`, new THREE.Vector3(S0.x + rx * 0.35 - fx * 0.05, S0.top - 0.45, S0.z + rz * 0.35 - fz * 0.05), h);
      P.zone(`act.benchSit.ext.${id}`, new THREE.Vector3(S0.x + rx * 0.35 + fx * 0.85, 0, S0.z + rz * 0.35 + fz * 0.85), 1.0); } }
  if (stairs.length >= 2) {   // V10.1 P19/R6 (D14 a): rampa invisible por el centro de las huellas (como TT, YY y NMG)
    const info = stairs.map((p) => { const v = p.v!, N = v.length / 3; let x = 0, z = 0, top = -9; for (let i = 0; i < N; i++) { x += v[i * 3]; z += v[i * 3 + 2]; top = Math.max(top, v[i * 3 + 1]); } return { p, x: x / N, z: z / N, top }; }).sort((a, b) => a.top - b.top);
    const lo = info[0], hi = info[info.length - 1], dl = Math.hypot(hi.x - lo.x, hi.z - lo.z) || 1, dx = (hi.x - lo.x) / dl, dz = (hi.z - lo.z) / dl, lx = -dz, lz = dx;
    const ext = (p: BolaPart) => { const v = p.v!; let u0 = 1e9, u1 = -1e9, w0 = 1e9, w1 = -1e9; for (let i = 0; i < v.length; i += 3) { const u = v[i] * dx + v[i + 2] * dz, w = v[i] * lx + v[i + 2] * lz; u0 = Math.min(u0, u); u1 = Math.max(u1, u); w0 = Math.min(w0, w); w1 = Math.max(w1, w); } return { u0, u1, w0, w1 }; };
    const E = info.map((s) => ext(s.p)), nS = info.length, tr = (E[nS - 1].u0 - E[0].u0) / (nS - 1), H = hi.top, uF = E[0].u0, uB = Math.max(...E.map((e) => e.u1));
    const w0 = Math.min(...E.map((e) => e.w0)), w1 = Math.max(...E.map((e) => e.w1)), pts: number[] = [];
    for (const w of [w0, w1]) for (const [u, h] of [[uF - tr / 2, 0], [uF + (nS - 0.5) * tr, H], [uB, H], [uB, 0]]) pts.push(u * dx + w * lx, h, u * dz + w * lz);
    const c = b.addCollider(RAPIER.ColliderDesc.convexHull(new Float32Array(pts))!, 'bola_stairs', 'ramp'); P.bolaPartOf.set(c.handle, stairs[0].id); n++;
  }
  P.bolaStats = { colliders: n };
  void W;
  // ---------------------------------------------------------------- spawn de la partida nueva (§05, §16): plaza, mirando al centro (lo fija
  // Park.build al final, después de NO ME GUILLO, que conserva su llegada como ancla `nmg.llegada` y checkpoint de zona)
  P.manifest.anchor('bola.spawn', BOLA.spawn.pos, BOLA.spawn.heading);
  P.manifest.anchor('cam.entrada', new THREE.Vector3(43.7975, 1.7145, -43.7975), 0);   // §05: cámara de presentación a 6° (E-38)
  b.chunk = prev;
}

/** Instancias de una familia: matriz = TRS de la maqueta · normalización de la malla del juego (alto 1, centrada en XZ, base en Y 0).
 *  D-EX-07: las matas y la buganvilla van por niveles de distancia (world/vegtiers.ts); farolas, bancos, palmeras y árboles (pocas
 *  instancias) con su malla en una sola instancia por parte. */
const TIERED = new Set(['shrub', 'plant_a', 'plant_b', 'plant_c', 'native_bougainvillea']);
async function familyInstances(P: Park, fam: string, list: [string, number[]][], veg: VegTiers) {
  const F = FAMILY[fam]; if (!F) { console.warn('exterior: familia sin malla', fam); return { fam, ok: false, n: list.length }; }
  const gltf = await loadGlb(F.glb); gltf.scene.updateMatrixWorld(true);
  const norm = new THREE.Matrix4(), bb = new THREE.Box3().setFromObject(gltf.scene);
  if (!F.native) {
    const sz = bb.getSize(new THREE.Vector3()), c = bb.getCenter(new THREE.Vector3());
    norm.makeScale(1 / sz.y, 1 / sz.y, 1 / sz.y).multiply(new THREE.Matrix4().makeTranslation(-c.x, -bb.min.y, -c.z));
  }
  const mats = list.map(([, m]) => new THREE.Matrix4().fromArray(m).multiply(norm));
  const near = vcParts(gltf.scene); let tris = 0;
  for (const o of near) tris += (o.geometry.index ? o.geometry.index.count : o.geometry.attributes.position.count) / 3;
  if (fam === 'tree') {   // R4: árboles con su malla (490 triángulos) a cualquier distancia, pero con SOMBRA solo de cerca (nivel «cerca»)
    veg.add(fam, mats, near, near, near, { castShadow: true });
    return { fam, ok: true, n: list.length, tris, tiers: true };
  }
  if (/^palm/.test(fam)) {   // D-EX-07: palmeras con su malla hasta VEG_MID y sustituto lejano (tronco + estrella de hojas)
    veg.add(fam, mats, near, null, palmProxy(near), { castShadow: true });
    return { fam, ok: true, n: list.length, tris, tiers: true };
  }
  if (TIERED.has(fam)) {
    const lod = F.lod ? await loadGlb(F.lod) : null; lod?.scene.updateMatrixWorld(true);
    veg.add(fam, mats, near, lod ? vcParts(lod.scene) : null, 'dome', { castShadow: false, domeBox: bb, ...twoColors(near) });
    return { fam, ok: true, n: list.length, tris, tiers: true };
  }
  const M = new THREE.Matrix4();
  for (const o of near) {
    const im = new THREE.InstancedMesh(o.geometry, o.material, mats.length); im.name = `BOLA_${fam}`;
    im.castShadow = /palm|tree/.test(fam); im.receiveShadow = true;
    mats.forEach((m, i) => { M.multiplyMatrices(m, o.matrix); im.setMatrixAt(i, M); });
    im.computeBoundingSphere(); P.root.add(im);
  }
  return { fam, ok: true, n: list.length, tris };
}

/** Cota de la cima (m) de las dos figuras gigantes sentadas (Rana y Fennec de las esquinas); antes 13,6 (Rana) y 15,4 (Fennec). */
export const FIGURE_TOP = 20;
/** Fennec: cima propia (usuario: con la misma cima se veía pequeño, las orejas son ~4 m y de rodilla a rodilla medía 8,3 m frente a
 *  14 m de la Rana; primero ×1,5 → 27,1 m, luego «quítale 2 m»): cima de las orejas a 25,1 m. */
export const FENNEC_TOP = 25.1;

/** Triángulos del suelo de la maqueta (PAV25_NO_0…5, los seis turquesas de make_bola_textures.py) dentro de una malla de color por
 *  vértice: planos (normal hacia arriba), a ras de suelo (y < 2 cm) y de uno de esos colores. Los quita del índice; devuelve cuántos. */
const PAV25 = ['#7daca1', '#82b4a8', '#85b8ac', '#88bcb0', '#8bc1b4', '#8fc6b9'].map((h) => new THREE.Color(h));
function dropMaquetteFloor(o: THREE.Mesh) {
  const g = o.geometry as THREE.BufferGeometry, P = g.attributes.position, C = g.attributes.color; if (!C) return 0;
  o.updateWorldMatrix(true, false); const idx = g.index ? Array.from(g.index.array as ArrayLike<number>) : [...Array(P.count).keys()];
  const v = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()], c = new THREE.Color(), keep: number[] = []; let n = 0;
  const isPav = (i: number) => { c.setRGB(C.getX(i), C.getY(i), C.getZ(i)); return PAV25.some((p) => Math.abs(p.r - c.r) + Math.abs(p.g - c.g) + Math.abs(p.b - c.b) < 0.06); };
  for (let t = 0; t + 2 < idx.length; t += 3) {
    const a = idx[t], b = idx[t + 1], d = idx[t + 2]; v[0].fromBufferAttribute(P, a).applyMatrix4(o.matrixWorld); v[1].fromBufferAttribute(P, b).applyMatrix4(o.matrixWorld); v[2].fromBufferAttribute(P, d).applyMatrix4(o.matrixWorld);
    const low = Math.max(v[0].y, v[1].y, v[2].y) < 0.02, nrm = new THREE.Vector3().subVectors(v[1], v[0]).cross(new THREE.Vector3().subVectors(v[2], v[0])).normalize();
    if (low && Math.abs(nrm.y) > 0.95 && isPav(a) && isPav(b) && isPav(d)) { n++; continue; }
    keep.push(a, b, d);
  }
  if (n) g.setIndex(keep);
  return n;
}

/** Capas visuales y vegetación del exterior (si alguna falla, la colisión sigue: se registra y el juego continúa). */
export async function loadBola(P: Park) {
  const out: Record<string, unknown> = {};
  const veg = new VegTiers();
  const layers: [string, boolean, boolean][] = [['nucleo', true, true], ['detalle', false, true], ['letras', true, true], ['fondo', false, true], ['figuras', true, false], ['lobby', false, true]];
  await Promise.all([
    ...layers.map(async ([L, cast, recv]) => {
      try {
        const g = await loadGlb(`bola/bola_${L}.glb`); const s = g.scene; s.name = `BOLA_${L.toUpperCase()}`; s.updateMatrixWorld(true);   // matrices de mundo para UV/escala
        s.traverse((o: any) => { if (!o.isMesh) return; o.castShadow = cast; o.receiveShadow = recv;
          // la plaza y el borde de la fase 16 están enrasados a Y 0 sobre el azulado y el paseo rosa: desfase de profundidad, sin elevarlos
          if (L === 'lobby') for (const m of [o.material].flat()) { m.polygonOffset = true; m.polygonOffsetFactor = -2; m.polygonOffsetUnits = -2; }
          if (L === 'lobby' && o.name === 'D-BORDE-BLANCO-GRIS') paintPlaza(o);   // V10.4 R12: empedrado de la plaza de salida y su camino (plaza.ts)
          // IT3 (usuario, 18 oct: «BELLAKACIONES sin textura, como antes pero rosa; es muy importante que desde cualquier punto se entiendan
          // las letras, cómo juegan las sombras y los bordes 3D»): color liso por vértice en dos tonos del rosa elegido (R3 fucsia lavado):
          // las caras de delante y detrás (las del dibujo de la letra) más claras y los cantos más oscuros, con el techo intermedio. Así el
          // contorno de cada letra se lee de frente, de lado y de lejos sin depender solo de la luz. El eje de las caras se mide en la propia
          // malla (dirección horizontal de más área)
          if (L === 'letras') {
            const g = o.geometry as THREE.BufferGeometry, P = g.attributes.position, N = g.attributes.normal, nm = new THREE.Matrix3().getNormalMatrix(o.matrixWorld), n = new THREE.Vector3();
            let sxx = 0, szz = 0, sxz = 0;
            for (let i = 0; i < N.count; i++) { n.fromBufferAttribute(N, i).applyMatrix3(nm).normalize(); if (Math.abs(n.y) < 0.5) { sxx += n.x * n.x; szz += n.z * n.z; sxz += n.x * n.z; } }
            const th = 0.5 * Math.atan2(2 * sxz, sxx - szz), fx = Math.cos(th), fz = Math.sin(th);   // eje de las caras (±)
            const cara = new THREE.Color('#f29cc0'), canto = new THREE.Color('#8e2f5c'), techo = new THREE.Color('#c45a8a'), col = new Float32Array(N.count * 3);
            for (let i = 0; i < N.count; i++) { n.fromBufferAttribute(N, i).applyMatrix3(nm).normalize();
              const c = Math.abs(n.x * fx + n.z * fz) > 0.7 ? cara : n.y > 0.6 ? techo : canto; col.set([c.r, c.g, c.b], i * 3); }
            g.setAttribute('color', new THREE.BufferAttribute(col, 3));
            // autoiluminación POR VÉRTICE (emisivo × color del vértice): la cara en sombra conserva su rosa claro y el canto su rosa oscuro
            for (const m of [o.material].flat()) { m.vertexColors = true; m.color = new THREE.Color('#ffffff'); m.emissive = new THREE.Color('#ffffff'); m.emissiveIntensity = 0.42;
              m.onBeforeCompile = (sh: any) => { sh.fragmentShader = sh.fragmentShader.replace('vec3 totalEmissiveRadiance = emissive;', 'vec3 totalEmissiveRadiance = emissive * vColor.rgb;'); };
              m.customProgramCacheKey = () => 'bk_letras_vc_emissive'; m.needsUpdate = true; } } });
        // IT3 (usuario, 18 oct: «agrandar a Rana y Fennec… que ambos lleguen más o menos a 20 m»): cada figura crece desde el centro de su
        // base hasta que su cima queda a FIGURE_TOP (Rana ×1,82) o FENNEC_TOP (Fennec), así sigue sentada en su plataforma; solo decorado
        // (sin colisión ni animación), mismos triángulos
        // IT3 (usuario: «¿dónde has metido el suelo? no lo veo»): la capa de detalle trae, 1 mm por encima del azulado texturizado, las losas
        // de la maqueta en sus seis turquesas (PAV25, color por vértice) y lo tapaban casi entero. Se quitan solo esos triángulos (planos, a
        // ras de suelo y de esos colores); el resto del detalle (flores pintadas, jardineras…) queda igual. Solo visual: la colisión no cambia
        if (L === 'detalle') { let quitados = 0; s.traverse((o: any) => { if (o.isMesh) quitados += dropMaquetteFloor(o); }); out.sueloMaquetaQuitado = quitados; }
        if (L === 'figuras') { s.updateMatrixWorld(true); const ks: Record<string, number> = {}; out.figureScale = ks; for (const f of [...s.children]) { const bb = new THREE.Box3().setFromObject(f, true); if (bb.isEmpty()) continue;
          const pv = new THREE.Vector3((bb.min.x + bb.max.x) / 2, bb.min.y, (bb.min.z + bb.max.z) / 2);
          const k = ((f.name === 'BG-FEN' ? FENNEC_TOP : FIGURE_TOP) - bb.min.y) / (bb.max.y - bb.min.y); f.position.sub(pv).multiplyScalar(k).add(pv); f.scale.multiplyScalar(k);
          // IT3 (usuario: «tienen más espacio con el edificio por un lado que por otro»): la receta las sentó en el centro medido de la
          // plataforma, ~0,6 m fuera de la diagonal de la esquina; los edificios acaban a la misma distancia del vértice por los dos lados, así
          // que se llevan a la diagonal (mismo hueco a cada lado, ~10,3 m)
          const lat = new THREE.Vector3(-Math.sign(pv.z), 0, Math.sign(pv.x)).normalize(), off = pv.x * lat.x + pv.z * lat.z;
          f.position.addScaledVector(lat, -off);
          ks[f.name] = +k.toFixed(3); } }
        P.root.add(s); out[L] = { ok: true };
      } catch (e: any) { out[L] = { ok: false, error: String(e?.message ?? e) }; console.warn('exterior: capa no disponible', L, e); }
    }),
    ...Object.entries((INST as any).families as Record<string, [string, number[]][]>).map(async ([fam, list]) => {
      try { out[`inst_${fam}`] = await familyInstances(P, fam, list, veg); } catch (e: any) { out[`inst_${fam}`] = { ok: false, error: String(e?.message ?? e) }; console.warn('exterior: familia no disponible', fam, e); }
    }),
  ]);
  veg.finalize(); P.root.add(veg.root); P.vegTiers = veg; veg.update(BOLA.spawn.pos, true);
  P.bolaLoad = out;
  return out;
}
