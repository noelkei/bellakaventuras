// Constructor de geometría del parque: cada pieza crea su malla (UV en metros, materiales compartidos) y su colisión
// Rapier exacta a partir de la misma forma. Las mallas estáticas se fusionan por material al final (pocos draw calls).
// Las piezas dinámicas (puertas, barreras, superrampa) devuelven malla + collider propios para animar/activar.
import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { tex } from '../assets';
import { boxUV, extrudeProfile, flipWinding } from './shapes';
export * from './shapes';

export type MatKey = string;

/** Biblioteca de materiales compartidos (texturas WebP en public/assets/tex, repetidas por metro). */
export class Materials {
  private m = new Map<MatKey, THREE.Material>();
  constructor() {
    const std = (key: string, o: THREE.MeshStandardMaterialParameters) => this.m.set(key, new THREE.MeshStandardMaterial(o));
    const T = (n: string) => tex(`tex/${n}.webp`);
    std('concrete', { map: T('T_concrete_cream'), roughness: 0.92, color: '#f2ece4' });
    std('concrete_grey', { map: T('T_concrete_light'), roughness: 0.92 });   // hormigón gris claro (Maspalomas)
    std('graffiti', { map: T('T_graffiti_wall'), roughness: 0.85 });                            // muros/bloques grafiteados
    std('paving', { map: T('T_concrete_cream'), roughness: 0.9, color: '#b9c6cf' });          // suelo bajo el puente
    std('concrete_pink', { map: T('T_concrete_pink'), roughness: 0.85 });
    std('concrete_roof', { map: T('T_concrete_rooftop'), roughness: 0.9 });
    std('bola_ground', { map: T('T_bola_ground'), roughness: 0.95 });
    std('bola_box', { map: T('T_bola_box'), roughness: 0.9 });
    std('bola_azulado', { map: T('T_bola_azulado'), roughness: 0.9 });   // V10: suelo común azulado del exterior (receta assets/derived/v10/bola/make_bola_textures.py)
    std('dirt', { map: T('T_dirt'), roughness: 1.0 });
    std('asphalt', { map: T('T_asphalt'), roughness: 0.85 });
    std('grass', { map: T('T_grass'), roughness: 1.0 });
    std('plaster', { map: T('T_wall_plaster_warm'), roughness: 0.9 });
    std('wood', { map: T('T_wood_planks_painted'), roughness: 0.85 });
    std('grille', { map: T('T_speaker_grille'), roughness: 0.95 });
    std('led', { map: T('T_led_floor'), roughness: 0.35, emissive: '#ffffff', emissiveMap: T('T_led_floor'), emissiveIntensity: 0.55 });
    std('stripes', { map: T('T_edge_stripes'), roughness: 0.6 });
    std('black', { color: '#24212B', roughness: 0.5, metalness: 0.2 });
    this.m.get('black')!.name = 'M_black';   // R11 (CAM-01): marcos de los carteles y postes: tramado junto al segmento cámara→cabeza
    std('black_matte', { color: '#2b2830', roughness: 0.85 });
    std('steel', { color: '#9aa0ab', roughness: 0.35, metalness: 0.8 });
    std('steel_blue', { color: '#6c7f96', roughness: 0.45, metalness: 0.6 });
    std('pink', { color: '#F18AAE', roughness: 0.6 });
    std('pink_dark', { color: '#C2507E', roughness: 0.55 });
    std('fuchsia', { color: '#E8418C', roughness: 0.45 });
    std('cream', { color: '#FFF2DF', roughness: 0.6 });
    std('white', { color: '#FBFAF7', roughness: 0.5 });
    std('green', { color: '#3E8E6B', roughness: 0.7 });
    std('turquoise', { color: '#3BB8B0', roughness: 0.6 });
    std('leaf', { color: '#4E8B4A', roughness: 0.8 });
    std('leaf_light', { color: '#7DB06A', roughness: 0.8 });
    std('trunk', { color: '#8C6A4E', roughness: 0.9 });
    std('violet', { color: '#7D5BD0', roughness: 0.55 });
    std('yellow', { color: '#F4BD48', roughness: 0.55 });
    std('neon_pink', { color: '#ff7ab8', emissive: '#ff3c96', emissiveIntensity: 2.2, roughness: 0.4 });
    std('neon_blue', { color: '#7ad0ff', emissive: '#38a8ff', emissiveIntensity: 2.0, roughness: 0.4 });
    std('neon_warm', { color: '#FFE6B0', emissive: '#FFD58A', emissiveIntensity: 2.0, roughness: 0.4 });
    std('glass', { color: '#cfe8ff', roughness: 0.1, metalness: 0.1, transparent: true, opacity: 0.45 });
    std('nmg_floor', { map: T('T_nmg_floor'), roughness: 0.93 });          // V5 ART-09: hormigón gris cálido, losas 1,6 m (textura de 8 × 8 m)
    std('nmg_floor_pink', { map: T('T_nmg_floor_pink'), roughness: 0.9 });
    std('facade_a', { map: T('T_facade_a'), roughness: 0.85 });
    std('facade_b', { map: T('T_facade_b'), roughness: 0.85 });
    std('facade_c', { map: T('T_facade_c'), roughness: 0.85 });
  }
  get(k: MatKey) { const m = this.m.get(k); if (!m) throw new Error(`material ${k}`); return m; }
  set(k: MatKey, m: THREE.Material) { this.m.set(k, m); }
}

export interface PieceOpts { mat?: MatKey; collide?: boolean; shadow?: boolean; uv?: number; dynamic?: boolean; name?: string; kind?: string }

/** Transformación 2D en planta: posición (x,z), cota y rumbo (rad, rotación alrededor de Y). */
export interface Place { x: number; y?: number; z: number; yaw?: number }

export class Builder {
  buckets = new Map<MatKey, THREE.BufferGeometry[]>();
  shadowBuckets = new Set<MatKey>();
  dynamic: THREE.Object3D[] = [];
  colliders: { c: RAPIER.Collider; name: string; kind: string }[] = [];
  /** Handles de colliders finos (postes Ø < 0,3 m): la cámara no se acerca por ellos (pasan por delante un instante). */
  thin = new Set<number>();
  root = new THREE.Group();
  stats = { pieces: 0, colliders: 0 };
  /** V5 T5-14: registro de piezas visuales estáticas (trozo, material, caja mundo) para el inventario de colisión. */
  pieces: { chunk: string; mat: string; name: string; min: number[]; max: number[] }[] = [];
  /** Trozo espacial actual: las mallas fusionadas se agrupan por trozo + material para que el culling funcione. */
  chunk = 'base';

  constructor(public world: RAPIER.World, public mats: Materials) {}

  private addGeo(g: THREE.BufferGeometry, m: Place, mat: MatKey, opts: PieceOpts) {
    const mtx = new THREE.Matrix4().compose(new THREE.Vector3(m.x, m.y ?? 0, m.z), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), m.yaw ?? 0), new THREE.Vector3(1, 1, 1));
    if (opts.dynamic) {
      const mesh = new THREE.Mesh(g, this.mats.get(mat));
      mesh.applyMatrix4(mtx); mesh.castShadow = opts.shadow !== false; mesh.receiveShadow = true; mesh.name = opts.name ?? '';
      this.root.add(mesh); this.dynamic.push(mesh);
      return mesh;
    }
    const gg = (g.index ? g.toNonIndexed() : g.clone()).applyMatrix4(mtx);
    for (const k of Object.keys(gg.attributes)) if (!['position', 'normal', 'uv'].includes(k)) gg.deleteAttribute(k);
    // V10.3: todas las piezas de un lote con los mismos atributos (una pieza sin uv —p. ej. un perfil hecho a mano— y otra con uv rompían la
    // fusión del lote entero y desaparecía)
    if (!gg.attributes.normal) gg.computeVertexNormals();
    if (!gg.attributes.uv) gg.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(gg.attributes.position.count * 2), 2));
    const key = `${this.chunk}|${mat}`;
    const arr = this.buckets.get(key) ?? []; arr.push(gg); this.buckets.set(key, arr);
    gg.computeBoundingBox(); const bb = gg.boundingBox!;
    this.pieces.push({ chunk: this.chunk, mat, name: opts.name ?? '', min: bb.min.toArray().map((v) => +v.toFixed(3)), max: bb.max.toArray().map((v) => +v.toFixed(3)) });
    if (opts.shadow !== false) this.shadowBuckets.add(key);
    this.stats.pieces++;
    return null;
  }

  private collider(desc: RAPIER.ColliderDesc, name: string, kind: string, body?: RAPIER.RigidBody) {
    const c = this.world.createCollider(desc, body);
    this.colliders.push({ c, name, kind }); this.stats.colliders++;
    return c;
  }

  /** Caja: `p` es el centro de la cara inferior. */
  box(p: Place, w: number, h: number, d: number, opts: PieceOpts = {}) {
    const g = boxUV(w, h, d, opts.uv ?? 1);
    g.translate(0, h / 2, 0);
    const mesh = this.addGeo(g, p, opts.mat ?? 'concrete', opts);
    let c: RAPIER.Collider | null = null;
    if (opts.collide !== false) {
      const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), p.yaw ?? 0);
      c = this.collider(RAPIER.ColliderDesc.cuboid(w / 2, h / 2, d / 2).setTranslation(p.x, (p.y ?? 0) + h / 2, p.z).setRotation(q), opts.name ?? 'box', opts.kind ?? 'solid');
      if (w < 0.4 && d < 0.4 && h > 1) this.thin.add(c.handle);   // postes: no acercan la cámara
    }
    return { mesh, c };
  }

  /** Collider suelto (cilindros de tronco, conos…) registrado con nombre y rol para el inventario de colisiones (COL-01). */
  addCollider(desc: RAPIER.ColliderDesc, name: string, kind = 'solid') { return this.collider(desc, name, kind); }

  /** Colisión de caja sin malla (barandillas, límites, apoyos invisibles). `p` = centro de la base. */
  solid(p: Place, w: number, h: number, d: number, name = 'solid', kind = 'solid') {
    const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), p.yaw ?? 0);
    return this.collider(RAPIER.ColliderDesc.cuboid(w / 2, h / 2, d / 2).setTranslation(p.x, (p.y ?? 0) + h / 2, p.z).setRotation(q), name, kind);
  }

  /** Prisma extruido de un perfil (y = altura, z = profundidad local) a lo ancho (x). Colisión trimesh de la misma malla. */
  prism(p: Place, profile: [number, number][], width: number, opts: PieceOpts = {}) {
    const g = extrudeProfile(profile, width, opts.uv ?? 1);
    const mesh = this.addGeo(g, p, opts.mat ?? 'concrete', opts);
    let c: RAPIER.Collider | null = null;
    if (opts.collide !== false) c = this.trimesh(g, p, opts.name ?? 'ramp', opts.kind ?? 'ramp');
    return { mesh, c, geo: g };
  }

  trimesh(g: THREE.BufferGeometry, p: Place, name: string, kind: string) {
    const gg = g.clone();
    gg.applyMatrix4(new THREE.Matrix4().compose(new THREE.Vector3(p.x, p.y ?? 0, p.z), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), p.yaw ?? 0), new THREE.Vector3(1, 1, 1)));
    const pos = gg.attributes.position.array as Float32Array;
    const idx = gg.index ? new Uint32Array(gg.index.array) : new Uint32Array([...Array(pos.length / 3).keys()]);
    return this.collider(RAPIER.ColliderDesc.trimesh(new Float32Array(pos), idx), name, kind);
  }

  cylinder(p: Place, r: number, h: number, opts: PieceOpts & { seg?: number; r2?: number } = {}) {
    const g = new THREE.CylinderGeometry(opts.r2 ?? r, r, h, opts.seg ?? 10, 1);
    g.translate(0, h / 2, 0);
    const mesh = this.addGeo(g, p, opts.mat ?? 'steel', opts);
    let c: RAPIER.Collider | null = null;
    if (opts.collide) c = this.collider(RAPIER.ColliderDesc.cylinder(h / 2, r).setTranslation(p.x, (p.y ?? 0) + h / 2, p.z), opts.name ?? 'cyl', 'solid');
    if (c && r < 0.15) this.thin.add(c.handle);
    return { mesh, c };
  }

  /** Malla libre (decoración) sin colisión. */
  decor(g: THREE.BufferGeometry, p: Place, mat: MatKey, opts: PieceOpts = {}) { return this.addGeo(g, p, mat, { ...opts, collide: false }); }

  /** Suelo plano en forma de sector anular (corona/centro), solo visual; la colisión del suelo es una losa común. */
  annulus(r0: number, r1: number, th0: number, th1: number, y: number, mat: MatKey, uv = 0.25) {
    const segs = Math.max(4, Math.ceil(Math.abs(th1 - th0) / 3));
    const pos: number[] = [], nor: number[] = [], uvs: number[] = [], idx: number[] = [];
    for (let i = 0; i <= segs; i++) {
      const th = THREE.MathUtils.degToRad(th0 + (th1 - th0) * i / segs);
      for (const r of [r0, r1]) {
        const x = r * Math.sin(th), z = -r * Math.cos(th);
        pos.push(x, y, z); nor.push(0, 1, 0); uvs.push(x * uv, z * uv);
      }
    }
    for (let i = 0; i < segs; i++) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    g.setIndex(idx);
    if ((th1 - th0) > 0) flipWinding(g); // con θ horario la construcción queda mirando hacia abajo
    this.addGeo(g, { x: 0, z: 0 }, mat, { shadow: false });
  }

  /** V5 T5-12: sector anular (o rectángulo si `rect`) plano con AGUJEROS poligonales (x, z mundo); UV en metros como
   *  `annulus`. Lo usan el suelo NMG y el plano base para abrir el hoyo de la U sin z-fighting ni tapa visible. */
  planeWithHoles(outline: [number, number][], holes: [number, number][][], y: number, mat: MatKey, uv = 0.25, opts: { shadow?: boolean; uvOffset?: [number, number] } = {}) {
    const sh = new THREE.Shape(outline.map(([x, z]) => new THREE.Vector2(x, -z)));
    for (const h of holes) sh.holes.push(new THREE.Path(h.map(([x, z]) => new THREE.Vector2(x, -z))));
    const g = new THREE.ShapeGeometry(sh, 1); g.rotateX(-Math.PI / 2); g.translate(0, y, 0);
    const pos = g.attributes.position, uvs = g.attributes.uv, [ou, ov] = opts.uvOffset ?? [0, 0];
    for (let i = 0; i < pos.count; i++) uvs.setXY(i, (pos.getX(i) + ou) * uv, (pos.getZ(i) + ov) * uv);
    this.addGeo(g, { x: 0, z: 0 }, mat, { shadow: opts.shadow ?? false });
  }
  /** Contorno de un sector anular (radios r0/r1, θ0→θ1 en grados, convención polar del manifiesto). */
  static annulusOutline(r0: number, r1: number, th0: number, th1: number): [number, number][] {
    const segs = Math.max(4, Math.ceil(Math.abs(th1 - th0) / 3)), out: [number, number][] = [];
    for (let i = 0; i <= segs; i++) { const th = THREE.MathUtils.degToRad(th0 + (th1 - th0) * i / segs); out.push([r0 * Math.sin(th), -r0 * Math.cos(th)]); }
    for (let i = segs; i >= 0; i--) { const th = THREE.MathUtils.degToRad(th0 + (th1 - th0) * i / segs); out.push([r1 * Math.sin(th), -r1 * Math.cos(th)]); }
    return out;
  }

  /** Cierra el lote: fusiona por material y crea las mallas estáticas. */
  finish() {
    for (const [k, gs] of this.buckets) {
      const g = mergeGeometries(gs, false);
      if (!g) continue;
      g.computeBoundingSphere();
      const mesh = new THREE.Mesh(g, this.mats.get(k.split('|')[1]));
      mesh.name = `STATIC_${k}`;
      mesh.castShadow = this.shadowBuckets.has(k); mesh.receiveShadow = true;
      mesh.matrixAutoUpdate = false;
      this.root.add(mesh);
    }
    this.buckets.clear();
    return this.root;
  }
}

