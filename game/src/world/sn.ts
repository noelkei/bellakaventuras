// V10 · SECRETNOVIO (centro; dossier completo en Markdown v1 + contrato geométrico aprobado 17 oct «damos por cerrada la geometria»;
// V10/plan/30_secretnovio.md). Sustituye la superrampa y el triple V3–V9. Three: X este, Y arriba, Z sur; el salto va hacia +Z. El centro NO
// gira con la corona. Suelo: hormigón gris r < 16, asfalto r 16–22 con bordes rosas de 0,15. Arquitectura del reto (emerge a 20, D-SN-01):
// A = mural vertical (cara Z −11,8, trasera −13,8, ancho 9) sobre apoyo curvo (cuarto de R 3,20 tangente al suelo en Z −8,60; base hasta
// 12 de ancho), coronación Y 7 con barandilla 1,05 salvo el carril de bajada de 2,40, escalera vertical en el costado este; B = rampa de
// 4,50 × 3,60 × 2 (Bézier exacto, 101 muestras), pie Z −3,60, labio Z 0; D = recepción libre 5,50² a Y 1 centrada en (0; 10) con mesas
// laterales 1,50² para rana (−3,5) y fennec (+3,5); seis montículos (r 1,65 → 0,85, alto 1,05); radiocasete lateral en (4,80; 0; −0,30).
import * as THREE from 'three';
import { copingPipe } from './coping';
import RAPIER from '@dimforge/rapier3d-compat';
import KIT from './sn_kit.json';
import { Builder } from './geo';
import { tex, ASSET_BASE } from '../assets';
import type { Park } from './park';

export const SN_KIT = KIT;
/** V10.1: giro del interior del reto alrededor del centro (radianes, sentido de `rotation.y`). −45°: el muro A queda hacia la esquina de la
 *  plaza de salida (40, −40) y el salto va hacia la esquina opuesta. El suelo, el asfalto y los coches no giran. */
export const SN_ROT = -Math.PI / 4;
const SN_Q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), SN_ROT), SN_QI = SN_Q.clone().invert();
/** Marco del reto → mundo (punto o dirección), mundo → marco del reto, y rumbo del marco → rumbo del mundo. */
export const snW = (v: THREE.Vector3) => v.clone().applyQuaternion(SN_Q);
export const snL = (v: THREE.Vector3) => v.clone().applyQuaternion(SN_QI);
export const snH = (h: number) => h + SN_ROT;
export interface SnDyn { group: THREE.Group; colliders: RAPIER.Collider[]; rest: number }

export function registerSnMaterials(P: Park) {
  const T = (n: string) => tex(`tex/${n}.webp`);
  P.mats.set('sn_concrete', new THREE.MeshStandardMaterial({ map: T('T_sn_concrete'), roughness: 0.93 }));
  P.mats.set('sn_olive', new THREE.MeshStandardMaterial({ map: T('T_sn_olive'), roughness: 0.9 }));
  // IT2: tapa de D y de las mesas en hormigón gris más oscuro que el suelo (detalle D del dossier); con `sn_concrete` se confundía con el suelo
  // IT3 (Codex SN-4: «oscurecer una textura cálida mediante sn_cap no la vuelve gris neutro»): la tapa usa el hormigón gris neutro que ya se
  // descarga (T_concrete_light, de geo.ts: 0 bytes más), algo más oscuro que el suelo crema
  P.mats.set('sn_cap', new THREE.MeshStandardMaterial({ map: tex('tex/T_concrete_light.webp'), color: '#c2c3c3', roughness: 0.96 }));
  P.mats.set('sn_wallpink', new THREE.MeshStandardMaterial({ color: (KIT as any).mural.background_hex ?? '#d95294', roughness: 0.85 }));
  P.mats.set('sn_ladder', new THREE.MeshStandardMaterial({ color: '#3c3f46', roughness: 0.45, metalness: 0.6 }));
}

/** Construye el centro. Devuelve el grupo/colisiones del RETO (emergen a 20); el suelo y el radiocasete existen siempre. */
export function buildSecretNovio(P: Park): SnDyn {
  const b = P.b, m = P.manifest, K = KIT as any, W = K.wall;
  // ---------------------------------------------------------------- suelo (siempre)
  // R6: coordenadas de textura PLANAS (con `annulus` el hormigón salía en rayas radiales: UV polares)
  { const circ = (r: number, n = 128) => Array.from({ length: n }, (_, i) => { const a = -i / n * Math.PI * 2; return [r * Math.sin(a), -r * Math.cos(a)] as [number, number]; });
    // a +3 mm / +2 mm: bajo el centro sigue el suelo general a Y 0 y en el mismo plano «peleaban» (rayas y manchas negras)
    b.planeWithHoles(circ(K.infield_radius), [], 0.003, 'sn_concrete', 0.125);
    b.planeWithHoles(circ(K.road_radii[1]), [circ(K.road_radii[0])], 0.002, 'asphalt', 0.25);
    // línea discontinua blanca en el centro del anillo (vistas del dossier): tramos de 1,6 m cada 3,2 m, ancho 0,12
    const rc = (K.road_radii[0] + K.road_radii[1]) / 2, n = Math.round(2 * Math.PI * rc / 3.2);
    for (let i = 0; i < n; i++) { const a0 = i / n * 360, a1 = a0 + 1.6 / (2 * Math.PI * rc) * 360; b.annulus(rc - 0.06, rc + 0.06, a0, a1, 0.006, 'white', 1); } }
  for (const c of K.pink_stripe_centers as number[]) b.annulus(c - K.pink_stripe_width / 2, c + K.pink_stripe_width / 2, 0, 360, 0.006, 'pink', 1);
  // radiocasete lateral al eje (S-14): mira al eje de paso (−X), donde pasa quien va hacia B
  const cas = snW(new THREE.Vector3(K.cassette.anchor_xyz[0], 0, K.cassette.anchor_xyz[2]));   // V10.1: con el giro del reto
  m.cassettes.push({ zone: 'secretnovio', pos: cas, heading: snH(-Math.PI / 2) });
  b.box({ x: cas.x, z: cas.z, yaw: snH(-Math.PI / 2) }, 1.4, 0.3, 0.9, { mat: 'black_matte', name: 'plinth_center' });
  m.checkpoints.push({ id: 'cp.secretnovio', zone: 'secretnovio', pos: snW(new THREE.Vector3(K.ladder.entry_pad_xz[0] + 1.6, 0, K.ladder.entry_pad_xz[1] + 2.2)), heading: snH(-Math.PI / 2) });

  // ---------------------------------------------------------------- arquitectura del reto (constructor aparte: colisiones activables)
  const rb = new Builder(P.world, P.mats); rb.chunk = 'sn';
  // A · cuerpo (Z −13,8…−11,8, Y 0…7)
  rb.box({ x: 0, z: (W.rear_z + W.face_z) / 2 }, W.width, W.deck_height, W.face_z - W.rear_z, { mat: 'sn_olive', name: 'sn_wall', uv: 1 / 3 });
  // cara del mural (pared vertical 3,2 → 7) pintada del rosa del fondo del mural + el mural idéntico en píxeles (contenido en 9 × 3,8)
  { const muralH = W.vertical_mural_height, aspect = K.mural.aspect, mw = Math.min(W.width, muralH * aspect), mh = mw / aspect;
    const face = new THREE.Mesh(new THREE.PlaneGeometry(W.width, muralH), P.mats.get('sn_wallpink')); face.position.set(0, W.base_height + muralH / 2, W.face_z + 0.006); face.receiveShadow = true; face.name = 'SN_MURAL_WALL'; rb.root.add(face);
    const t = new THREE.TextureLoader().load(`${ASSET_BASE}tex/T_sn_mural.webp`); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
    const mural = new THREE.Mesh(new THREE.PlaneGeometry(mw, mh), new THREE.MeshStandardMaterial({ map: t, roughness: 0.85, polygonOffset: true, polygonOffsetFactor: -2 }));
    mural.position.set(0, W.base_height + muralH / 2, W.face_z + 0.012); mural.name = 'SN_MURAL'; mural.userData.text = 'mural principal SECRETNOVIO (adjunto elegido)'; rb.root.add(mural); P.signs.push(mural); }
  // A · apoyo curvo: cuarto de círculo R 3,20 (Y 0 en Z −8,60 → Y 3,20 en Z −11,80), ancho que se abre de 9 a 12 en la base
  { const R = W.quarter_radius, z0 = W.quarter_ground_z, NQ = 32, pos: number[] = [], idx: number[] = [], uv: number[] = [];
    const half = (z: number) => 4.5 + 1.5 * THREE.MathUtils.clamp((z - W.face_z) / (-9.2 - W.face_z), 0, 1);
    const prof: [number, number][] = []; for (let i = 0; i <= NQ; i++) { const a = (i / NQ) * Math.PI / 2; prof.push([z0 - R * Math.sin(a), R - R * Math.cos(a)]); }   // [z, y] del pie a la cima
    const add = (x: number, y: number, z: number, u: number, v: number) => { pos.push(x, y, z); uv.push(u / 3, v / 3); return pos.length / 3 - 1; };
    // superficie curva
    const L: number[] = [], Rr: number[] = []; let acc = 0;
    prof.forEach(([z, y], i) => { if (i) acc += Math.hypot(z - prof[i - 1][0], y - prof[i - 1][1]); const h = half(z); L.push(add(-h, y, z, -h, acc)); Rr.push(add(h, y, z, h, acc)); });
    for (let i = 0; i < NQ; i++) idx.push(L[i], Rr[i], L[i + 1], Rr[i], Rr[i + 1], L[i + 1]);
    // costados (verticales, bajo la curva) y frente bajo del labio (Z z0 a ras de suelo: sin cara)
    for (const sx of [-1, 1]) { const top: number[] = [], bot: number[] = [];
      prof.forEach(([z, y]) => { const h = half(z) * sx; top.push(add(h, y, z, z, y)); bot.push(add(h, 0, z, z, 0)); });
      // V10.1 (sonda de caras): los dos costados miraban hacia DENTRO (invisibles desde fuera): orden de vértices invertido
      for (let i = 0; i < NQ; i++) sx > 0 ? idx.push(bot[i], bot[i + 1], top[i], top[i], bot[i + 1], top[i + 1]) : idx.push(bot[i], top[i], bot[i + 1], top[i], top[i + 1], bot[i + 1]); }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx); g.computeVertexNormals();
    rb.decor(g, { x: 0, z: 0 }, 'sn_olive'); const c = rb.trimesh(g, { x: 0, z: 0 }, 'sn_quarter', 'ramp'); P.transitions.add(c.handle); P.vertFaces.set(c.handle, 'vert');   /* V10 IT2: sube y vuelve */
    // V10.3 (U-09): coping decorativo en la cima del quarter (y = R, junto al muro rosa; tapa 3 cm del pie del mural pintado)
    copingPipe(rb, new THREE.Vector3(-4.5, R + 0.01, W.face_z + 0.035), new THREE.Vector3(4.5, R + 0.01, W.face_z + 0.035), 0.03, 'sn_ladder'); }
  // coronación: barandilla de lectura 1,05 en trasera, costados y frente salvo el carril de bajada (2,40, centrado); hueco en el costado
  // este para el desembarco de la escalera (Z −12,70 ± 0,5)
  { const y = W.deck_height, gh = W.guard_height, lane = W.drop_lane_width / 2;
    const rail = (x0: number, z0: number, x1: number, z1: number) => { const L = Math.hypot(x1 - x0, z1 - z0), yaw = Math.atan2(x1 - x0, z1 - z0), mx = (x0 + x1) / 2, mz = (z0 + z1) / 2;
      rb.box({ x: mx, y: y + gh - 0.04, z: mz, yaw }, 0.05, 0.05, L, { mat: 'steel', name: 'sn_guard' });
      rb.solid({ x: mx, y, z: mz, yaw }, 0.06, gh, L, 'sn_guard_col');
      for (let k = 0; k <= Math.max(1, Math.round(L / 1.4)); k++) { const t = k / Math.max(1, Math.round(L / 1.4)); rb.box({ x: x0 + (x1 - x0) * t, y, z: z0 + (z1 - z0) * t }, 0.05, gh, 0.05, { mat: 'steel', collide: false }); } };
    const hw = W.width / 2;
    rail(-hw, W.rear_z + 0.04, hw, W.rear_z + 0.04);
    rail(-hw + 0.04, W.rear_z, -hw + 0.04, W.face_z);
    rail(hw - 0.04, W.rear_z, hw - 0.04, -12.7 - 0.5); rail(hw - 0.04, -12.7 + 0.5, hw - 0.04, W.face_z);
    rail(-hw, W.face_z - 0.04, -lane, W.face_z - 0.04); rail(lane, W.face_z - 0.04, hw, W.face_z - 0.04); }
  // escalera vertical en el costado este (eje (4,75; 0; −12,70), ancho 0,65, cima 7)
  { const L = K.ladder, [ax, , az] = L.axis_xyz, w = L.width;
    for (const dz of [-w / 2, w / 2]) rb.box({ x: ax, z: az + dz }, 0.05, L.top + 0.9, 0.05, { mat: 'sn_ladder', collide: false });
    for (let y = 0.28; y < L.top; y += 0.28) rb.box({ x: ax, y, z: az }, 0.04, 0.035, w, { mat: 'sn_ladder', collide: false });
    m.ladders.push({ id: 'sn', axis: snW(new THREE.Vector3(ax - 0.0, 0, az)), heading: snH(-Math.PI / 2), bottom: 0, top: L.top, topPos: snW(new THREE.Vector3(L.top_pos_xyz[0], L.top, L.top_pos_xyz[2])), footZone: 'sn.ladder.foot', topZone: 'sn.ladder.top', width: w, rung: 0.28, rate: 2.0 });   // V10.1 P20 (usuario): la de SN al doble (≈ 8 s)
    P.zone('sn.ladder.foot', snW(new THREE.Vector3(L.entry_pad_xz[0], 0, L.entry_pad_xz[1])), L.entry_pad_size / 2 + 0.2, -0.3, 1.2);
    P.zone('sn.ladder.top', snW(new THREE.Vector3(L.top_pos_xyz[0], L.top, L.top_pos_xyz[2])), 0.7, L.top - 0.3, L.top + 1.6); }
  // carril de bajada (zona de la acción ¡BAJAR!) en la coronación, mirando a +Z
  P.zone('sn.drop', snW(new THREE.Vector3(0, W.deck_height, W.face_z - 0.6)), 1.1, W.deck_height - 0.3, W.deck_height + 1.6);
  // B · rampa de despegue: perfil Bézier exacto (101 muestras del contrato), ancho 4,50, trasera vertical en el labio
  { const S = K.kicker.profile_samples_world_z_y as [number, number][], z0 = S[0][0];
    const prof: [number, number][] = S.map(([z, y]) => [z - z0, y]); prof.push([S[S.length - 1][0] - z0, 0]);
    const r = rb.prism({ x: 0, z: z0, yaw: 0 }, prof, K.kicker.width, { mat: 'sn_olive', name: 'sn_kicker', uv: 1 / 3 }); if (r.c) { P.transitions.add(r.c.handle); P.vertFaces.set(r.c.handle, 'kick'); }   /* V10 IT2: sale por el labio */
    // remate rosa del labio (vistas 01–04 y detalle B): tubo de 6 cm a lo ancho, sin colisión propia
    rb.box({ x: 0, y: K.kicker.height - 0.03, z: K.kicker.lip_z - 0.028 }, K.kicker.width, 0.06, 0.06, { mat: 'pink', collide: false }); }   // V10.1: 2 mm fuera de la trasera (era coplanar)
  // D · recepción libre 5,50² a Y 1 + mesas laterales 1,50² (unidas, sin escalón)
  { const D = K.landing; rb.box({ x: D.center_xz[0], z: D.center_xz[1] }, D.size_x, D.top_y, D.size_z, { mat: 'sn_olive', name: 'sn_landing', uv: 1 / 3 });
    for (const s of D.side_platforms) rb.box({ x: s.center_xz[0], z: s.center_xz[1] }, s.size_x, s.top_y, s.size_z, { mat: 'sn_olive', name: `sn_table_${s.owner}`, uv: 1 / 3 });
    // tapa de hormigón gris de D y de las mesas (vistas 01–05 y detalle D: superficie gris, costados oliva), 3 mm por encima, sin colisión
    for (const t of [{ center_xz: D.center_xz, size_x: D.size_x, size_z: D.size_z, top_y: D.top_y }, ...D.side_platforms]) rb.box({ x: t.center_xz[0], y: t.top_y + 0.001, z: t.center_xz[1] }, t.size_x - 0.01, 0.004, t.size_z - 0.01, { mat: 'sn_cap', collide: false, uv: 1 / 4 });
    // IT2: canto metálico en el borde superior de D y de las mesas (detalle D del dossier), solo visual: angular de 4 cm por fuera de la tapa
    // V10.1 (sonda de caras): en los bordes donde D y una mesa se tocan no hay angular (quedaba encima de la tapa vecina, coplanar con ella)
    const tops = [{ center_xz: D.center_xz, size_x: D.size_x, size_z: D.size_z, top_y: D.top_y }, ...D.side_platforms] as { center_xz: number[]; size_x: number; size_z: number; top_y: number }[];
    for (const t of tops) {
      const [cx, cz] = t.center_xz, hx = t.size_x / 2 + 0.01, hz = t.size_z / 2 + 0.01, y = t.top_y - 0.035;   /* base del angular */
      for (const sz of [-1, 1]) rb.box({ x: cx, y, z: cz + sz * hz }, t.size_x + 0.04, 0.04, 0.02, { mat: 'steel', collide: false });
      for (const sx of [-1, 1]) { const ex = cx + sx * t.size_x / 2;
        const cut = tops.filter((o) => o !== t && Math.abs(o.center_xz[0] - sx * o.size_x / 2 - ex) < 0.02).map((o) => [o.center_xz[1] - o.size_z / 2, o.center_xz[1] + o.size_z / 2]).sort((a, b) => a[0] - b[0]);
        let z0 = cz - t.size_z / 2 - 0.02; const segs: [number, number][] = [];
        for (const [a, b] of cut) { if (a > z0) segs.push([z0, a]); z0 = Math.max(z0, b); }
        if (cz + t.size_z / 2 + 0.02 > z0) segs.push([z0, cz + t.size_z / 2 + 0.02]);
        for (const [a, b] of segs) if (b - a > 0.05) rb.box({ x: cx + sx * hx, y, z: (a + b) / 2 }, 0.02, 0.04, b - a, { mat: 'steel', collide: false }); } }
    m.anchor('sn.rana', snW(new THREE.Vector3(D.frog_xyz[0], D.top_y, D.frog_xyz[2])), snH(Math.PI / 2));
    m.anchor('sn.fennec', snW(new THREE.Vector3(D.fennec_xyz[0], D.top_y, D.fennec_xyz[2])), snH(-Math.PI / 2));
    P.boxes.set('sn.landing', { c: snW(new THREE.Vector3(D.center_xz[0], D.top_y + 0.5, D.center_xz[1])), h: new THREE.Vector3(D.size_x / 2, 0.8, D.size_z / 2), yaw: snH(0) }); }
  // montículos (troncos de cono) con un violinista cada uno
  (K.mounds as { id: string; x: number; z: number; base_radius: number; top_radius: number; height: number }[]).forEach((mo) => {
    const g = new THREE.CylinderGeometry(mo.top_radius, mo.base_radius, mo.height, 20, 1); g.translate(0, mo.height / 2, 0);
    rb.decor(g, { x: mo.x, z: mo.z }, 'sn_olive');
    const v = g.attributes.position.array as Float32Array, pts = new Float32Array(v.length); for (let i = 0; i < v.length; i += 3) { pts[i] = v[i] + mo.x; pts[i + 1] = v[i + 1]; pts[i + 2] = v[i + 2] + mo.z; }
    rb.addCollider(RAPIER.ColliderDesc.convexHull(pts)!, 'sn_mound', 'solid');
    m.anchor(`sn.musico.${mo.id}`, snW(new THREE.Vector3(mo.x, mo.height, mo.z)), snH(Math.atan2(-mo.x, -mo.z)));   // miran al eje
  });
  // ocho grafitis (D-SN-05; V10.2 Q07: fuera el 06 y el 08 de los costados de B, que asomaban por encima de su perfil curvo): pintados en
  // caras que no confunden el recorrido —trasera y costado oeste de A, trasera de B,
  // frente y trasera de D—; nunca en el carril de bajada, en la superficie de B ni encima de D. Arte tal cual (PNG con alfa, sin rectángulo),
  // tamaño por legibilidad, colores originales (D-GR-01)
  { const G = (K as any).graffiti as Record<string, { aspect: number }> | undefined;
    // V10.3 (U-04): texturas nuevas con espray, opacidad y desgaste por pieza (assets/derived/v10_3/grafitis/make_grafitis_v103.py); el dibujo
    // ocupa ~91 % del lienzo (deja sitio a la niebla y los goteos): el plano crece 1/escala para que el dibujo se vea del mismo tamaño
    const ESC: Record<string, number> = { '01': 0.9118, '02': 0.9112, '03': 0.9145, '04': 0.9123, '05': 0.9137, '07': 0.9062, '09': 0.9194, '10': 0.9146 };   // params.json
    const put = (id: string, x: number, y: number, z: number, yaw: number, h0: number) => {
      const h = h0 / (ESC[id] ?? 1), asp = G?.[id]?.aspect ?? 1, t = new THREE.TextureLoader().load(`${ASSET_BASE}tex/G_sn_${id}.webp`); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
      const mt = new THREE.MeshStandardMaterial({ map: t, transparent: true, alphaTest: 0.04, depthWrite: false, roughness: 0.9, polygonOffset: true, polygonOffsetFactor: -3 });
      const me = new THREE.Mesh(new THREE.PlaneGeometry(h * asp, h), mt); me.position.set(x, y, z); me.rotation.y = yaw; me.name = `SN_GRAFFITI_${id}`; me.receiveShadow = true; rb.root.add(me); };
    const rz = W.rear_z - 0.012, hw = W.width / 2;
    // V10.3 (U-04, usuario: «sus 4 grafitis juntos de la trasera de A se reparten por otras caras»): en la trasera de A se quedan dos, separados
    // en alto; el 07 y el 03 pasan a los costados libres de la recepción D (entre la mesa de cada uno y las esquinas)
    put('01', -2.4, 4.4, rz, Math.PI, 2.6); put('10', 2.5, 2.2, rz, Math.PI, 2.0);   // trasera de A
    { const D = K.landing, hx = D.size_x / 2 + 0.012; put('07', -hx, 0.5, D.center_xz[1] - 1.75, -Math.PI / 2, 0.8); put('03', hx, 0.5, D.center_xz[1] + 1.75, Math.PI / 2, 0.8); }   // costados de D
    put('02', -hw - 0.012, 3.9, -12.8, -Math.PI / 2, 2.4);   // costado oeste de A (el este lleva la escalera)
    const kz = K.kicker;
    put('05', 0, 1.0, kz.lip_z + 0.012, 0, 1.75);   // trasera de B (se ve desde el vuelo y desde D)
    const D = K.landing; put('09', 0, 0.5, D.center_xz[1] - D.size_z / 2 - 0.012, Math.PI, 0.8); put('04', 0, 0.5, D.center_xz[1] + D.size_z / 2 + 0.012, 0, 0.85);   // frente y trasera de D
  }
  // anclas del reto
  m.anchor('sn.lip', snW(new THREE.Vector3(0, K.kicker.height, K.kicker.lip_z)), snH(0));
  m.anchor('sn.landing', snW(new THREE.Vector3(K.landing.center_xz[0], K.landing.top_y, K.landing.center_xz[1])), snH(0));
  m.anchor('sn.retry', snW(new THREE.Vector3(K.ladder.entry_pad_xz[0] + 0.9, 0, K.ladder.entry_pad_xz[1] + 1.2)), snH(-Math.PI / 2));
  m.anchor('cam.reveal', snW(new THREE.Vector3(-14, 11.5, 15)), snH(0));
  m.anchor('final.preview', snW(new THREE.Vector3(9, 0, -9)), snH(Math.atan2(-9, 9)));
  const group = rb.finish(); group.name = 'SN_CHALLENGE'; P.root.add(group);
  // V10.1: el reto se ha construido en su marco; aquí se gira entero (mallas con el grupo; cada colisión: posición y giro alrededor del centro)
  group.rotation.y = SN_ROT;
  if (SN_ROT !== 0) for (const x of rb.colliders) { const t = x.c.translation(), r = x.c.rotation(); const p = snW(new THREE.Vector3(t.x, t.y, t.z)), q = SN_Q.clone().multiply(new THREE.Quaternion(r.x, r.y, r.z, r.w));
    x.c.setTranslation({ x: p.x, y: p.y, z: p.z }); x.c.setRotation({ x: q.x, y: q.y, z: q.z, w: q.w }); }
  const cols = rb.colliders.map((x) => { P.nameCollider(x.c.handle, x.name); return x.c; });
  return { group, colliders: cols, rest: -(W.deck_height + 0.6) };
}
