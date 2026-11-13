// Parque del remake: un único mundo físico residente. Corona de cinco sectores de 72° (V4: r 22–42, ancho 20 m),
// perímetro inspirado en Bola de Oro hasta el cuadrado (±52) y disco central de SECRETNOVIO siempre abierto (V4: sin
// cierre; antes de 20 solo el radiocasete; a 20 emerge el reto —muro A, rampa B, recepción D— y llegan los coches).
// Todas las colisiones esenciales se crean aquí antes de dar el control y no se liberan nunca.
// Coordenadas locales de sector: pl(r, da, h, yaw) → X local = tangente antihoraria (hacia el siguiente sector
// recomendado), Z local = hacia fuera (radial). da en grados (positivo = horario).
import * as THREE from 'three';
import { vcParts } from './vcmerge';
import type { VegTiers } from './vegtiers';
import RAPIER from '@dimforge/rapier3d-compat';
import { Builder, Materials, Place, funboxProfile, kickerProfile, bankProfile, quarterProfile, smoothBankProfile } from './geo';
import { WORLD, WorldManifest, polar, ZoneId, SECTORS, FryKind, FrySpawn, ActivityId, SECTOR_BY_ID, remapV3Radius, coronaTh } from './manifest';
import { buildNoMeGuillo, NMG_SLOTS, NMG_KIT, uPit, uPitWorld, uPlace } from './nmg';
import { buildTraTraTra, TT_KIT, TT_LAMPS } from './tt';
import { buildFashionGirl, FG_SLOTS } from './fg';
import { buildYinYang, registerYyMaterials, yyRemovedTile, yyHoleWorld, YY } from './yy';
import { palm, tree, bush, lamp, bench, cone, speaker, truss, railing, sprayCans, limo, mulberry, rot, planter, PROP_SLOTS, PropKind, PropSlot } from './props';
import { loadGlb, ASSET_BASE } from '../assets';
import { GLOW_TEXTURE } from '../fx';
import { tex } from '../assets';
import type { Rail } from '../skater';
import type { Surface } from '../audio';
import { TUNING } from '../tuning';
import { buildBola, BOLA } from './bola';
import { buildNosVamos, registerNvMaterials } from './nvda';
import { buildSecretNovio, registerSnMaterials, SnDyn } from './sn';
import { buildValla, registerVallaMaterials, VallaDyn, VALLA } from './valla';
import { tintFloor } from './suelo';
import { buildIslas } from './islas';

const D2R = Math.PI / 180;

export interface Zone { pos: THREE.Vector3; r: number; yMin: number; yMax: number }
export function inZone(z: Zone, p: THREE.Vector3, margin = 0) {
  return Math.hypot(p.x - z.pos.x, p.z - z.pos.z) < z.r + margin && p.y >= z.yMin - 0.1 && p.y <= z.yMax + 0.1;
}
/** Caja orientada (rumbo yaw) para triggers/etapas: `c` centro, `h` semiextensiones locales. */
export interface OBox { c: THREE.Vector3; h: THREE.Vector3; yaw: number }
export function inOBox(b: OBox, p: THREE.Vector3) {
  const dx = p.x - b.c.x, dz = p.z - b.c.z, cs = Math.cos(b.yaw), sn = Math.sin(b.yaw);
  const lx = dx * cs - dz * sn, lz = dx * sn + dz * cs; // inversa de la rotación de la pieza
  return Math.abs(lx) <= b.h.x && Math.abs(p.y - b.c.y) <= b.h.y && Math.abs(lz) <= b.h.z;
}

export interface Dyn { mesh: THREE.Object3D; colliders: RAPIER.Collider[] }

export class Park {
  root = new THREE.Group();
  manifest = new WorldManifest();
  mats = new Materials();
  b: Builder;
  zones = new Map<string, Zone>();
  boxes = new Map<string, OBox>();
  signs: THREE.Mesh[] = [];
  // dinámicos
  /** V10: arquitectura del reto de SECRETNOVIO (A, escalera, B, D, mesas, montículos y sus anfitriones): emerge con la revelación a 20. */
  sn!: SnDyn;
  /** V10.3 R1 (W04): valla de circuito del centro (de pie con 0–19 patatas; se hunde en la revelación). */
  valla!: VallaDyn;
  /** V10.3: «reducir movimiento» en la revelación: la valla desaparece en corte. */
  vallaCut = false;
  /** V3: barrera de la rampa de bajada; V4 no existe (la bajada es la escalera). */
  bridgeGate: Dyn | null = null;
  muralMesh!: THREE.Mesh;
  tutorialGates: OBox[] = [];
  bridgeStages: OBox[] = [];
  deckBox!: OBox;
  danceFloorMat!: THREE.MeshStandardMaterial;
  /** V6 FG: luz puntual del fondo del túnel (intensidad por distancia en game.ts) y farolillos de los paseos rosas. */
  fgLamps: { x: number; z: number; yaw: number; h: number }[] = [];
  stats = { colliders: 0, staticMeshes: 0 };
  /** Rails de grind (EXT-02): eje, altura de la cara superior; collider fino coherente con la malla. */
  rails: Rail[] = [];
  /** V10: exterior Bola de Oro (world/bola.ts): estadísticas de colisión y de carga de capas/familias. */
  bolaStats: { colliders: number } = { colliders: 0 };
  bolaLoad: Record<string, unknown> = {};
  /** V10: colisiones de transición de NVDA (herradura G1): un contacto inclinado no es una «pared». */
  nvTransitions: number[] = [];
  /** V10: collider del exterior → id del contrato (EXT-…, SE-M02…). */
  bolaPartOf = new Map<number, string>();
  /** V10 (D-EX-07): vegetación del exterior por niveles de distancia a la cámara (se actualiza en Game.render). */
  vegTiers: VegTiers | null = null;
  /** Colliders que la cámara no usa para acercarse (follaje fino, postes de señal). */
  cameraIgnore = new Set<number>();
  private colliderNames = new Map<number, string>();
  colliderName(handle: number) { return this.colliderNames.get(handle) ?? ''; }
  /** V5 T5-14: nombra colliders creados fuera del Builder (radiocasetes) para el inventario. */
  nameCollider(handle: number, name: string) { this.colliderNames.set(handle, name); }
  /** V5 T5-14: colliders que bloquean y desvían pero nunca producen estrella (conos de entrenamiento). */
  noImpact = new Set<number>();
  /** R11 (F7: RAMP-02/05, NMG-23): colliders de TRANSICIÓN (quarters y U): un contacto inclinado (ny ≥ 0,15) no es una «pared». */
  transitions = new Set<number>();
  /** V10 IT2: transiciones con labio más empinado que la subida del KCC (52°): al tocar su parte alta en tabla, la marcha pasa a vertical
   *  («vert», sube y vuelve por la cara) o, en un kicker, a salida por el labio («kick»). Solo piezas nuevas de V10. */
  vertFaces = new Map<number, 'vert' | 'kick'>();
  /** R11 (NMG-19): conos: solo golpe (sin caída). */
  cones = new Set<number>();

  constructor(public world: RAPIER.World) { this.b = new Builder(world, this.mats); }

  build() {
    PROP_SLOTS.length = 0;
    const b = this.b;
    registerYyMaterials(this);   // V8: materiales del vaso (el suelo del sector los usa)
    registerNvMaterials(this);   // V10: NOSVAMOSDEAQUÍ (acabado «Caras y cómic»)
    registerSnMaterials(this);   // V10: SECRETNOVIO
    registerVallaMaterials(this);   // V10.3: valla del centro
    tintFloor(this.mats.get('nmg_floor') as THREE.MeshStandardMaterial);   // V10.3 R3 (U-15): color del suelo por zona
    b.chunk = 'ground'; this.ground();
    b.chunk = 'perimeter'; buildBola(this);   // V10: exterior Bola de Oro (dossier definitivo v1); el perímetro V3–V9 queda en V10/backups/R1/src
    b.chunk = 'no_me_guillo'; buildNoMeGuillo(this);
    b.chunk = 'nosvamosdeaqui'; buildNosVamos(this);   // V10: planta v8 + RG1 + Fennec (world/nvda.ts); el circuito V3–V9 queda en V10/backups
    b.chunk = 'yinyang'; buildYinYang(this);   // V8: piscina de tres niveles y T1 (world/yy.ts, yy_kit.json); el descampado V7 queda en V8/baseline_V7
    b.chunk = 'tratratra'; buildTraTraTra(this, 'tratratra');
    b.chunk = 'fashion_girl'; buildFashionGirl(this);   // V6: Fashion Girl desde fg_kit.json (world/fg.ts)
    b.chunk = 'center'; this.sn = buildSecretNovio(this);   // V10: SECRETNOVIO (world/sn.ts); la superrampa V3–V9 queda en V10/backups
    this.valla = buildValla(this);   // V10.3 R1: valla de circuito (world/valla.ts)
    b.chunk = 'islas'; buildIslas(b);   // V10.3 R4: plantas en islas (world/islas.ts)
    b.chunk = 'signs'; this.sectorSigns();
    // V10 (Bola de Oro §05, §16): la partida nueva empieza en la plaza exterior, mirando al centro (después de NMG, que fijaba su llegada)
    this.manifest.spawn = { pos: BOLA.spawn.pos.clone(), heading: BOLA.spawn.heading };
    // V7: las dos charlas de TRA TRA TRA se marcan SOBRE EL TECHO de la limo, cada una junto a su extremo (recuadro del ancho del
    // techo). La de Aissa ocupa el índice que tenía la charla conjunta; la de Juseph se añade al final.
    { const N = TT_KIT.npcs, roof = TT_KIT.limo.roof;
      for (const [id, y] of [['act.pantherTalk', 0], ['act.graffiti', 0], ['act.danceCombo', 1.0]] as const) this.activityArea(id, y);
      this.activityArea('act.bridgeTalk.aissa', roof, N.aissa.area as [number, number]);
      this.activityArea('act.bridgeTalk.juseph', roof, N.juseph.area as [number, number]); }
    this.root.add(this.b.finish());
    // V10.4 R13 (usuario: «la plaza de SN se ve bugeada parpadeando» desde lo alto de la cinemática): los suelos del centro están a 2–6 mm sobre
    // el asfalto general y, de lejos, la precisión de profundidad no los separa (z-fighting). Cada capa gana por desfase de profundidad, en su orden
    { const capa: Record<string, number> = { asphalt: -1, sn_concrete: -2, white: -3, pink: -3 };
      this.root.traverse((o: any) => { const m = /^STATIC_center\|(\w+)$/.exec(o.name ?? ''); if (!o.isMesh || !m || !(m[1] in capa)) return;
        const mat = (o.material as THREE.Material).clone(); mat.polygonOffset = true; mat.polygonOffsetFactor = capa[m[1]]; mat.polygonOffsetUnits = capa[m[1]] * 2; o.material = mat; }); }
    // colisiones invisibles (cierre alto del perímetro): la cámara mira a través
    for (const e of this.b.colliders) if (e.name === 'bound') this.cameraIgnore.add(e.c.handle);
    for (const c of this.b.colliders) { this.colliderNames.set(c.c.handle, c.name); if (c.kind === 'small') this.noImpact.add(c.c.handle);
      if (c.name === 'fg_u' || c.name === 'nmg_quarter' || c.name === 'bola_quarter' || c.name === 'bola_hip' || c.name === 'bola_curved_ledge') this.transitions.add(c.c.handle);   // V10: quarters/hip/onda nativos del exterior
      if (c.name === 'cone') this.cones.add(c.c.handle);
      if (c.name === 'bola_quarter') this.vertFaces.set(c.c.handle, 'vert'); }
    for (const h of this.nvTransitions) this.transitions.add(h);   // V10
    this.stats.colliders = this.b.stats.colliders;
    this.stats.staticMeshes = this.root.children.length;
    const errs = this.manifest.validate();
    if (errs.length) console.error('MANIFEST', errs);
    return errs;
  }

  // ---------------------------------------------------------------- utilidades de sector
  /** Utilidades polares de un sector. V4: para los sectores sin planta propia (NV, YY, FG) las coordenadas V3 se
   *  reubican con `remapV3Radius` (solo posición radial; tamaños, alturas y rumbos locales intactos). */
  sector(id: ZoneId) {
    const axis = SECTOR_BY_ID[id].axis;
    const remap = id === 'nosvamosdeaqui' || id === 'yinyang' || id === 'fashion_girl';
    const P = (r: number, da: number, h = 0) => polar(remap ? remapV3Radius(r) : r, axis + da, h);
    const out = (da = 0) => Math.PI - (axis + da) * D2R;
    const pl = (r: number, da: number, h = 0, yaw = 0): Place => { const p = P(r, da, h); return { x: p.x, y: h, z: p.z, yaw: out(da) + yaw }; };
    const ccw = (da = 0) => out(da) + Math.PI / 2;   // rumbo hacia el siguiente sector recomendado
    const inward = (da = 0) => out(da) + Math.PI;
    return { id, axis, P, out, pl, ccw, inward };
  }

  fry(zone: ZoneId, kind: FryKind, pos: THREE.Vector3, access: FrySpawn['access'], hint: string, returnRoute: string, hover = 0.55) {
    const act = SECTOR_BY_ID[zone].activity;
    this.manifest.fries.push({
      id: `${zone}.${kind}`, zone, kind, pos: pos.clone(), hover, trigger: new THREE.Vector3(0.8, 0.8, 0.8),
      availability: kind === 'activity' ? act : 'initial', access, hint, returnRoute,
    });
  }
  zone(id: string, pos: THREE.Vector3, r: number, yMin = -0.5, yMax = 2.5) { this.zones.set(id, { pos: pos.clone(), r, yMin, yMax }); }

  decal(texName: string, p: Place, w: number, h: number, lift = 0.02) {
    const m = new THREE.MeshStandardMaterial({ map: tex(`tex/${texName}.webp`), transparent: true, alphaTest: 0.35, roughness: 0.8, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 });
    const g = new THREE.PlaneGeometry(w, h);
    const mesh = new THREE.Mesh(g, m);
    mesh.position.set(p.x, (p.y ?? 0) + h / 2 + lift, p.z); mesh.rotation.y = p.yaw ?? 0;
    mesh.receiveShadow = true;
    this.root.add(mesh);
    return mesh;
  }
  /** ASSET-02/05: sustituye los proxies procedurales por instancias de los derivados GLB (una descarga por tipo, una malla
   *  instanciada por primitiva). Si un GLB falla, ese tipo conserva su proxy (la colisión no depende del aspecto). */
  propStats: Record<string, { slots: number; ok: boolean; tris?: number; error?: string }> = {};
  readonly propSlots = PROP_SLOTS;
  /** V4 NMG: kit nativo de Blender (un GLB con un nodo por pieza). Sustituye el blockout de cada pieza; la colisión ya
   *  existe (mismos números del contrato). Si el GLB falla, el blockout se queda. */
  nmgKit: { ok: boolean; pieces: number; error?: string } = { ok: false, pieces: 0 };
  async loadNmgKit() {
    const NODE: Record<string, string> = { platform: 'nmg_platform', heart: 'nmg_heart', boxSmall: 'nmg_box_small', boxMedium: 'nmg_box_medium', ledgeLong: 'nmg_ledge_long', uWall: 'nmg_u', quarter: 'nmg_quarter', bed: 'nmg_bed', bench: 'nmg_bench' };
    try {
      const gltf = await loadGlb('nmg/nmg_kit.glb');
      gltf.scene.updateMatrixWorld(true);
      const group = new THREE.Group(); group.name = 'NMG_KIT';
      const placed = new Set<string>();
      const beds: typeof NMG_SLOTS = [];
      for (const s of NMG_SLOTS) {
        if (s.piece === 'bed') { beds.push(s); continue; }   // V10.3 R4: las islas (22) van instanciadas (abajo)
        const src = gltf.scene.getObjectByName(NODE[s.piece]); if (!src) throw new Error(`pieza ${s.piece} ausente en el kit`);
        // V5 T5-03 (SOL-001/OPUS-001): el nodo optimizado (meshopt) lleva en su TRS la traslación/escala de descuantización;
        // V4 la sobrescribía con la colocación y el kit quedaba hundido a media altura y desplazado de sus colliders. Ahora la
        // colocación va en un contenedor por slot y el clon conserva intacto su TRS local.
        const o = src.clone(true);
        const slotG = new THREE.Group(); slotG.name = `${NODE[s.piece]}_slot`;
        slotG.position.set(s.place.x, s.place.y ?? 0, s.place.z); slotG.rotation.set(0, s.place.yaw ?? 0, 0);
        o.traverse((m: any) => { if (m.isMesh) { m.castShadow = s.piece !== 'bed'; m.receiveShadow = true; } });
        slotG.add(o); group.add(slotG); placed.add(s.piece);
      }
      // V10.3 R4: islas instanciadas (una malla por primitiva del nodo): las del parque en el kit y las de SECRETNOVIO aparte (suben con la
      // revelación, como las plantas del grupo `sn`)
      if (beds.length) { const src = gltf.scene.getObjectByName(NODE.bed); if (!src) throw new Error('pieza bed ausente en el kit');
        const pinv = new THREE.Matrix4().copy(src.parent!.matrixWorld).invert(), mm = new THREE.Matrix4(), up = new THREE.Vector3(0, 1, 0), q = new THREE.Quaternion();
        for (const sn of [false, true]) { const list = beds.filter((b) => !!b.sn === sn); if (!list.length) continue;
          src.traverse((o: any) => { if (!o.isMesh) return; const rel = pinv.clone().multiply(o.matrixWorld);
            const im = new THREE.InstancedMesh(o.geometry, o.material, list.length); im.name = sn ? 'nmg_bed_sn' : 'nmg_bed_islas';   // (las pruebas buscan /nmg_bed/) im.castShadow = false; im.receiveShadow = true;
            list.forEach((b, i) => { mm.compose(new THREE.Vector3(b.place.x, b.place.y ?? 0, b.place.z), q.setFromAxisAngle(up, b.place.yaw ?? 0), new THREE.Vector3(1, 1, 1)).multiply(rel); im.setMatrixAt(i, mm); });
            im.computeBoundingSphere(); if (sn) this.snFollow.push(im); group.add(im); }); }
        placed.add('bed'); this.syncSnFollow(); }
      // V6 R4 (usuario, 13 oct): murales con los cinco grafitis de NMG pintados en color (assets/derived/v6/nmg/
      // make_nmg_murals_v6.py; mismo atlas y reparto que V5): se cambia el mapa del material de murales; el GLB V5 no se toca
      { const mats = new Set<THREE.MeshStandardMaterial>();
        group.traverse((m: any) => { if (m.isMesh) for (const mt of [m.material].flat()) if (mt?.name === 'M_nmg_mural') mats.add(mt); });
        if (mats.size) { const t = await new THREE.TextureLoader().loadAsync(`${ASSET_BASE}tex/T_nmg_murals_v6.webp`).catch(() => null);
          if (t) for (const mt of mats) { const old = mt.map!; t.flipY = old.flipY; t.colorSpace = old.colorSpace; t.wrapS = old.wrapS; t.wrapT = old.wrapT; t.anisotropy = old.anisotropy;
            t.channel = old.channel; t.offset.copy(old.offset); t.repeat.copy(old.repeat); t.rotation = old.rotation; t.center.copy(old.center); mt.map = t; mt.needsUpdate = true; old.dispose(); } } }
      // V6 R5 (usuario: grafitis de NMG nítidos): capa de grafitis a 2,5× la resolución del mural. Para cada cara con grafiti,
      // la geometría del mural se recorta (en espacio UV) a la región del grafiti y se dibuja encima con su propia textura
      await this.nmgGraffitiOverlay(group).catch((e) => console.warn('capa de grafitis NMG no disponible', e));
      this.root.add(group);
      this.root.traverse((o) => { for (const p of placed) if (o.name.startsWith(`STATIC_proxy_nmgkit_${p}|`)) o.visible = false; });
      this.nmgKit = { ok: true, pieces: NMG_SLOTS.length };
    } catch (e: any) { this.nmgKit = { ok: false, pieces: 0, error: String(e?.message ?? e) }; console.warn('kit NMG no disponible (se queda el blockout)', e); }
  }
  nmgGraffiti: { meshes: number; tris: number } = { meshes: 0, tris: 0 };
  private async nmgGraffitiOverlay(kit: THREE.Object3D) {
    const meta = await (await fetch(`${ASSET_BASE}tex/T_nmg_graffiti_v6.json`)).json() as { regions: { face: number; mural: number[]; over: number[] }[] };
    const tex = await new THREE.TextureLoader().loadAsync(`${ASSET_BASE}tex/T_nmg_graffiti_v6.webp`);
    tex.flipY = false; tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 8; tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;   // UV con v hacia abajo (glTF)
    const mat = new THREE.MeshStandardMaterial({ map: tex, transparent: true, depthWrite: false, roughness: 0.9, metalness: 0, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
    mat.name = 'M_nmg_graffiti_v6';
    { let side: THREE.Side = THREE.FrontSide; kit.traverse((m: any) => { if (m.isMesh && m.material?.name === 'M_nmg_mural') side = m.material.side; }); mat.side = side; }   // el mural es de doble cara (algún lateral tiene el giro invertido)
    type V = { p: THREE.Vector3; uv: THREE.Vector2 };
    const lerpV = (a: V, b: V, t: number): V => ({ p: a.p.clone().lerp(b.p, t), uv: a.uv.clone().lerp(b.uv, t) });
    const clip = (poly: V[], axis: 'x' | 'y', lim: number, keepGreater: boolean) => {   // Sutherland–Hodgman en espacio UV
      const out: V[] = []; const inside = (v: V) => (keepGreater ? v.uv[axis] >= lim : v.uv[axis] <= lim);
      for (let i = 0; i < poly.length; i++) { const a = poly[i], b = poly[(i + 1) % poly.length], ia = inside(a), ib = inside(b);
        if (ia) out.push(a); if (ia !== ib) out.push(lerpV(a, b, (lim - a.uv[axis]) / (b.uv[axis] - a.uv[axis]))); }
      return out;
    };
    const meshes: THREE.Mesh[] = [];
    kit.traverse((m: any) => { if (m.isMesh && [m.material].flat().some((mt: any) => mt?.name === 'M_nmg_mural')) meshes.push(m); });
    for (const mesh of meshes) {
      const g = mesh.geometry as THREE.BufferGeometry, pos = g.attributes.position, uv = g.attributes.uv, idx = g.index, map = (mesh.material as THREE.MeshStandardMaterial).map;
      if (!uv) continue;
      map?.updateMatrix(); const um = map ? map.matrix : new THREE.Matrix3();
      const P: number[] = [], U: number[] = [];
      const n = idx ? idx.count : pos.count, at = (k: number) => (idx ? idx.getX(k) : k);
      const vtx = (i: number): V => ({ p: new THREE.Vector3(pos.getX(i), pos.getY(i), pos.getZ(i)), uv: new THREE.Vector2(uv.getX(i), uv.getY(i)).applyMatrix3(um) });
      for (let k = 0; k < n; k += 3) {
        const tri = [vtx(at(k)), vtx(at(k + 1)), vtx(at(k + 2))];
        for (const r of meta.regions) {
          const [u0, v0, u1, v1] = r.mural, [o0, p0, o1, p1] = r.over;
          let poly: V[] = tri; for (const [ax, lim, gt] of [['x', u0, true], ['x', u1, false], ['y', v0, true], ['y', v1, false]] as const) { poly = clip(poly, ax, lim, gt); if (!poly.length) break; }
          if (poly.length < 3) continue;
          for (let j = 1; j < poly.length - 1; j++) for (const v of [poly[0], poly[j], poly[j + 1]]) {
            P.push(v.p.x, v.p.y, v.p.z); U.push(o0 + (v.uv.x - u0) / (u1 - u0) * (o1 - o0), p0 + (v.uv.y - v0) / (v1 - v0) * (p1 - p0)); }
        }
      }
      if (!P.length) continue;
      const og = new THREE.BufferGeometry(); og.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); og.setAttribute('uv', new THREE.Float32BufferAttribute(U, 2)); og.computeVertexNormals();
      const o = new THREE.Mesh(og, mat); o.name = 'NMG_GRAFFITI'; o.receiveShadow = true; o.castShadow = false; o.renderOrder = 1; mesh.add(o);
      this.nmgGraffiti.meshes++; this.nmgGraffiti.tris += P.length / 9;
    }
  }

  /** V6 FG: atrezzo Blender (`fg/fg_props.glb`): una instancia por hueco en un contenedor (el nodo optimizado conserva su TRS de
   *  descuantización: lección T5-03). El foco son dos nodos (yugo + cabeza inclinada en su pivote). Si falla, quedan los proxies. */
  fgProps: { ok: boolean; pieces: number; error?: string } = { ok: false, pieces: 0 };
  /** V8: mobiliario M01 de YINYANG (yy/yy_props.glb). */
  yyProps: { ok: boolean; pieces: number; error?: string } = { ok: false, pieces: 0 };
  fgSpotHalos: THREE.Sprite[] = [];
  async loadFgProps() {
    try {
      const gltf = await loadGlb('fg/fg_props.glb'); gltf.scene.updateMatrixWorld(true);
      const group = new THREE.Group(); group.name = 'FG_PROPS'; const placed = new Set<string>();
      const get = (n: string) => { const o = gltf.scene.getObjectByName(n); if (!o) throw new Error(`pieza ${n} ausente`); return o; };
      // piezas repetidas (farolillos): una malla instanciada por primitiva (pocas llamadas de dibujo)
      const reps = new Map<string, typeof FG_SLOTS>(); for (const s of FG_SLOTS) if (s.piece === 'fg_lamp') reps.set(s.piece, [...(reps.get(s.piece) ?? []), s]);
      for (const [piece, slots] of reps) {
        const src = get(piece); src.updateMatrixWorld(true); const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0);
        src.traverse((o: any) => { if (!o.isMesh) return;
          const im = new THREE.InstancedMesh(o.geometry, o.material, slots.length); im.name = `FG_${piece}`; im.castShadow = false; im.receiveShadow = true;
          slots.forEach((sl, i) => { m4.compose(new THREE.Vector3(sl.place.x, sl.place.y ?? 0, sl.place.z), q.setFromAxisAngle(up, sl.place.yaw ?? 0), new THREE.Vector3(1, 1, 1)).multiply(o.matrixWorld); im.setMatrixAt(i, m4); });
          im.computeBoundingSphere(); group.add(im); });
        placed.add(piece);
      }
      // V7: farolillos bajos de TRA TRA TRA: la misma pieza `fg_lamp`, en una malla instanciada aparte (la de FG no cambia)
      if (TT_LAMPS.length) { const src = get('fg_lamp'); src.updateMatrixWorld(true); const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0);
        src.traverse((o: any) => { if (!o.isMesh) return;
          const im = new THREE.InstancedMesh(o.geometry, o.material, TT_LAMPS.length); im.name = 'TT_fg_lamp'; im.castShadow = false; im.receiveShadow = true;
          TT_LAMPS.forEach((sl, i) => { m4.compose(new THREE.Vector3(sl.x, 0, sl.z), q.setFromAxisAngle(up, sl.yaw), new THREE.Vector3(1, 1, 1)).multiply(o.matrixWorld); im.setMatrixAt(i, m4); });
          im.computeBoundingSphere(); group.add(im); }); }
      for (const s of FG_SLOTS) {
        if (reps.has(s.piece)) continue;
        const g = new THREE.Group(); g.name = `${s.piece}_slot`; g.position.set(s.place.x, s.place.y ?? 0, s.place.z); g.rotation.set(0, s.place.yaw ?? 0, 0);
        if (s.piece === 'fg_spot') {
          g.add(get('fg_spot_yoke').clone(true));
          const pv = new THREE.Group(); pv.position.y = -0.39; pv.rotation.x = s.pitch ?? 0; pv.add(get('fg_spot_head').clone(true)); g.add(pv);
          // halo aditivo en la lente (FG-001: focos magenta encendidos); late con el baile (DanceCombo.present)
          const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: GLOW_TEXTURE, color: '#ff4fb4', blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0.7 }));
          halo.position.set(0, 0, 0.26); halo.scale.setScalar(0.95); halo.name = 'FG_SPOT_HALO'; pv.add(halo); this.fgSpotHalos.push(halo);
        } else g.add(get(s.piece).clone(true));
        g.traverse((m: any) => { if (m.isMesh) { m.castShadow = s.piece === 'fg_truss' || s.piece === 'fg_roadcase'; /* V6 perf: sin sombra en soporte y focos colgados */ m.receiveShadow = true; if (s.piece === 'fg_spot' && /lens/i.test(m.material?.name ?? '')) m.material = this.danceFloorMat ?? m.material; } });
        group.add(g); placed.add(s.piece);
      }
      this.root.add(group);
      this.root.traverse((o) => { for (const p of placed) if (o.name.startsWith(`STATIC_proxy_fgprops_${p}|`)) o.visible = false; });
      this.fgProps = { ok: true, pieces: FG_SLOTS.length };
    } catch (e: any) { this.fgProps = { ok: false, pieces: 0, error: String(e?.message ?? e) }; console.warn('atrezzo FG no disponible (quedan los proxies)', e); }
  }
  async loadProps() {
    const REF: Record<PropKind, number> = { palm_straight: 6.4, palm_lean: 5.8, tree_compact: 4.6, tree_open: 5.4, shrub: 0.9, lamp_double: 5.6, speaker: 1.7, planter_rect: 0.55, planter_corner: 0.6, limo: 7.218,
      nmg_plant_a: 0.519, nmg_plant_a_flor: 0.55, nmg_plant_b: 0.487, nmg_plant_c: 1.02, nmg_shrub_flor: 0.948,
      nmg_tree_round: 3.859, nmg_tree_open: 4.114, nmg_palm_straight: 6.065, nmg_palm_lean: 6.065 };   // alturas medidas: veg_report.json (árboles) y nmg_plants/plants_report.json (R6)
    const YAW0: Partial<Record<PropKind, number>> = { limo: -Math.PI / 2 };   // frente del GLB en +X → +Z del parque
    const kinds = [...new Set(PROP_SLOTS.map((s) => s.kind))];
    await Promise.all(kinds.map(async (kind) => {
      const all = PROP_SLOTS.filter((s) => s.kind === kind);
      // V7: una malla instanciada por grupo (sin grupo = la común de siempre); cada una con su propia esfera envolvente
      const byGroup = new Map<string, PropSlot[]>(); for (const s of all) byGroup.set(s.group ?? '', [...(byGroup.get(s.group ?? '') ?? []), s]);
      try {
        const gltf = await loadGlb(`props/${kind}.glb`);
        gltf.scene.updateMatrixWorld(true);
        const m = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0);
        let tris = 0;
        // V10 (D-EX-02): las primitivas de color liso de cada malla se funden en una con color por vértice (mismo aspecto, 1 llamada)
        for (const o of vcParts(gltf.scene)) {
          for (const [grp, slots] of byGroup) {
          const im = new THREE.InstancedMesh(o.geometry, o.material, slots.length);
          im.name = grp ? `PROP_${kind}_${grp}` : `PROP_${kind}`; im.castShadow = !((grp === 'tt' || grp === 'yy') && !/palm/.test(kind)) && kind !== 'shrub' && kind !== 'planter_rect' && kind !== 'planter_corner' && !/^nmg_plant_(a|a_flor|b)$/.test(kind);   // R6: sombra en la mata erguida, el arbusto floral y las palmeras (no en las matas bajas: coste) im.receiveShadow = true;
          slots.forEach((s, i) => { const k = s.h / REF[kind]; m.compose(new THREE.Vector3(s.x, s.y, s.z), q.setFromAxisAngle(up, s.yaw + (YAW0[kind] ?? 0)), new THREE.Vector3(k, k, k)).multiply(o.matrix); im.setMatrixAt(i, m); });
          im.computeBoundingSphere(); this.root.add(im); if (grp === 'sn') this.snFollow.push(im);
          }
          tris += (o.geometry.index ? o.geometry.index.count : o.geometry.attributes.position.count) / 3;
        }
        this.root.traverse((o) => { if (o.name.startsWith(`STATIC_proxy_${kind}|`)) o.visible = false; });
        this.syncSnFollow();
        this.propStats[kind] = { slots: all.length, ok: true, tris };
      } catch (e: any) { this.propStats[kind] = { slots: all.length, ok: false, error: String(e?.message ?? e) }; console.warn('prop no disponible (se queda el proxy)', kind, e); }
    }));
  }

  /** Cara pintada opaca pegada a una cara vertical: plano w×h con base en p.y, normal hacia `yaw`; UV en metros
   *  (mU/mV metros por repetición; v0 desplaza la franja vertical para que contrahuellas consecutivas continúen el dibujo). */
  paintFace(texName: string, p: Place, yaw: number, w: number, h: number, mU = 0, mV = 0, v0 = 0) {
    const g = new THREE.PlaneGeometry(w, h);
    if (mU > 0) { const uv = g.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * w / mU, v0 + uv.getY(i) * h / mV); }
    const m = new THREE.MeshStandardMaterial({ map: tex(`tex/${texName}.webp`), roughness: 0.85, polygonOffset: true, polygonOffsetFactor: -2 });
    const mesh = new THREE.Mesh(g, m);
    mesh.position.set(p.x, (p.y ?? 0) + h / 2, p.z); mesh.rotation.y = yaw; mesh.receiveShadow = true;
    this.root.add(mesh);
    return mesh;
  }
  floorDecal(texName: string, x: number, z: number, w: number, d: number, yaw = 0, y = 0.03) {
    const m = new THREE.MeshStandardMaterial({ map: tex(`tex/${texName}.webp`), transparent: true, alphaTest: 0.3, roughness: 0.8, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3 });
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, d), m);
    mesh.rotation.set(-Math.PI / 2, 0, yaw); mesh.position.set(x, y, z); mesh.receiveShadow = true;
    this.root.add(mesh);
    return mesh;
  }
  /** Rótulo de texto (canvas → textura, sin descargas). */
  sign(text: string, p: Place, w: number, h: number, opts: { bg?: string; fg?: string; font?: string; lift?: number; double?: boolean } = {}) {
    const c = document.createElement('canvas'); c.width = 1024; c.height = Math.round(1024 * h / w);
    drawSign(c, text, opts.bg ?? '#24212B', opts.fg ?? '#F18AAE', opts.font ?? 'Bungee');
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
    const m = new THREE.MeshStandardMaterial({ map: t, roughness: 0.7, emissive: '#ffffff', emissiveMap: t, emissiveIntensity: 0.25 });
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), m);
    if (opts.double) { const back = new THREE.Mesh(mesh.geometry, m); back.rotation.y = Math.PI; back.position.z = -0.01; mesh.add(back); } // legible por ambas caras
    mesh.position.set(p.x, (p.y ?? 0) + (opts.lift ?? 0), p.z); mesh.rotation.y = p.yaw ?? 0;
    mesh.userData.canvas = c; mesh.userData.text = text;
    this.root.add(mesh); this.signs.push(mesh);
    return mesh;
  }

  /** V5 T5-23 (OPUS-016): recuadros de actividad con su centro y semilado, para el fundido por proximidad. */
  areas: { mesh: THREE.Mesh; x: number; z: number; half: number }[] = [];
  /** V5 T5-23 (OPUS-016): el recuadro aparece por proximidad — opacidad máxima 0,55 (antes 0,85 fija) a ≤ 4 m del borde,
   *  fundido hasta 0 a 5 m. No se elimina la función: sigue marcando dónde se activa la actividad. */
  updateAreas(p: THREE.Vector3) {
    for (const a of this.areas) { const d = Math.max(0, Math.max(Math.abs(p.x - a.x), Math.abs(p.z - a.z)) - a.half);
      const o = 0.55 * THREE.MathUtils.clamp(5 - d, 0, 1); (a.mesh.material as THREE.MeshBasicMaterial).opacity = o; a.mesh.visible = o > 0.01; }
  }
  /** Recuadro discontinuo de actividad (D04): se anda dentro y se activa; no es barrera. */
  activityArea(id: string, y = 0, rect?: [number, number], yaw = 0) {   // V10.3 (U-11): `yaw` para recuadros girados (NVDA)
    const z = this.zones.get(id)!;
    const size = z.r * 2 + 0.4;
    const c = document.createElement('canvas'); c.width = c.height = 256;
    const g = c.getContext('2d')!;
    g.clearRect(0, 0, 256, 256); g.strokeStyle = '#FFF2DF'; g.lineWidth = 9; g.setLineDash([26, 18]); g.lineCap = 'round';
    g.strokeRect(10, 10, 236, 236);
    g.strokeStyle = 'rgba(241,138,174,0.9)'; g.lineWidth = 4; g.setLineDash([26, 18]); g.lineDashOffset = 13; g.strokeRect(20, 20, 216, 216);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
    const m = new THREE.MeshBasicMaterial({ map: t, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, opacity: 0.85 });
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(rect ? rect[0] : size, rect ? rect[1] : size), m);
    mesh.rotation.set(-Math.PI / 2, 0, yaw); mesh.position.set(z.pos.x, y + 0.035, z.pos.z); mesh.renderOrder = 2; mesh.name = 'AREA_' + id;
    this.root.add(mesh); this.areas.push({ mesh, x: z.pos.x, z: z.pos.z, half: rect ? Math.max(rect[0], rect[1]) / 2 : size / 2 });
    return mesh;
  }
  /** Superficie bajo el jugador para el sonido de rodadura. */
  surfaceAt(p: THREE.Vector3): Surface {
    // metal solo SOBRE un rail: altura de su borde y a ≤ 0,25 m de su eje en planta (V3: antes bastaba la altura y cualquier
    // suelo a la cota de un rail de otra zona sonaba a metal)
    if (this.rails.some((r) => Math.abs(p.y - r.top) < 0.12 && distToSegXZ(p, r.a, r.b) < 0.25)) return 'metal';
    const r = Math.hypot(p.x, p.z);
    if (r < WORLD.rCenter) return p.y > 0.3 ? 'concrete' : 'asphalt';
    const th = (Math.atan2(p.x, -p.z) * 180 / Math.PI + 360) % 360;
    const sec = SECTORS.reduce((a, s) => (Math.abs(((th - s.axis + 540) % 360) - 180) < Math.abs(((th - a.axis + 540) % 360) - 180) ? s : a));
    if (r > WORLD.innerPath[1] && r < WORLD.outerPath[0]) {
      // V8: YINYANG ya no es descampado (deck y vaso de hormigón/mosaico)
      if (sec.id === 'tratratra' && p.y > 3.5) return 'concrete';
    }
    return 'concrete';
  }
  /** Rail de grind: barra redonda con apoyos; collider fino (no bloquea más que la barra visible). */
  rail(a: THREE.Vector3, b2: THREE.Vector3, top: number, name = 'rail') {
    const b = this.b;
    const d = b2.clone().sub(a); d.y = 0; const L = d.length(); const yaw = Math.atan2(d.x, d.z);
    const mid = a.clone().add(b2).multiplyScalar(0.5);
    const bar = new THREE.CylinderGeometry(0.03, 0.03, L, 10); bar.rotateX(Math.PI / 2); bar.translate(0, top - 0.03, 0);
    b.decor(bar, { x: mid.x, z: mid.z, yaw }, 'steel');
    for (const k of [-0.42, 0, 0.42]) {
      const post = new THREE.BoxGeometry(0.05, top - 0.06, 0.05); post.translate(0, (top - 0.06) / 2, k * L);
      b.decor(post, { x: mid.x, z: mid.z, yaw }, 'black');
      const foot = new THREE.BoxGeometry(0.24, 0.02, 0.14); foot.translate(0, 0.01, k * L);
      b.decor(foot, { x: mid.x, z: mid.z, yaw }, 'black');
    }
    b.solid({ x: mid.x, y: 0, z: mid.z, yaw }, 0.07, top, L, name, 'rail');
    this.rails.push({ a: a.clone().setY(0), b: b2.clone().setY(0), top, name });
  }

  // ---------------------------------------------------------------- suelo, límites y caminos
  private ground() {
    const b = this.b, H = WORLD.half;
    // losa de colisión común (suelo patinable liso en todo el cuadrado; el aspecto cambia por zona)
    // V3: rejilla de losas de 12 m × 2 m de espesor en vez de una sola de 112 m: el barrido de forma del controlador
    // atravesaba la losa gigante en algunas posiciones/rumbos (penetración de hasta 0,16 m medida en la esquina de 135°).
    const tile = 12, n = Math.ceil((H * 2 + 4) / tile);
    // V5 T5-12: hueco del hoyo de la U. Las losas que lo tocan no se crean; su superficie la cubren 4 franjas giradas con la U
    // alrededor del hueco (mismo techo y = 0, mismo espesor; solaparse con las losas vecinas no importa)
    // (V6–V10.2 había un segundo hueco, el pozo y túnel de FASHION GIRL, quitado en V10.3). Cada hueco tiene sus losas quitadas y sus franjas en su
    // propio marco; las de NMG se calculan exactamente igual que en V5 (mismo marco, mismas esquinas)
    const hole = uPitWorld();
    const bbox = (h: [number, number][]) => { const hx = h.map((p) => p[0]), hz = h.map((p) => p[1]); return { x0: Math.min(...hx) - 0.05, x1: Math.max(...hx) + 0.05, z0: Math.min(...hz) - 0.05, z1: Math.max(...hz) + 0.05 }; };
    const holes = [{ hb: bbox(hole), up: uPlace(), P: uPit(), skipped: [] as [number, number][] }];
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
      const x = -n * tile / 2 + (i + 0.5) * tile, z = -n * tile / 2 + (j + 0.5) * tile;
      const H = holes.find(({ hb }) => x + tile / 2 > hb.x0 && x - tile / 2 < hb.x1 && z + tile / 2 > hb.z0 && z - tile / 2 < hb.z1);
      if (H) { H.skipped.push([x, z]); continue; }
      if (yyRemovedTile(x, z)) continue;   // V8: losas que toca la piscina YY → cajas macizas + deck del contrato (abajo)
      b.solid({ x, y: -2, z }, tile, 2, tile, 'ground', 'ground');
    }
    for (const { up, P, skipped } of holes) { const cy = Math.cos(up.yaw ?? 0), sy = Math.sin(up.yaw ?? 0);
      // esquinas de las losas quitadas en el marco local del hueco (inversa de rot): lx = dx·cos − dz·sin, lz = dx·sin + dz·cos
      const loc = skipped.flatMap(([x, z]) => [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([a, c]) => { const dx = x + a * tile / 2 - up.x, dz = z + c * tile / 2 - up.z; return [dx * cy - dz * sy, dx * sy + dz * cy]; }));
      const X0 = Math.min(...loc.map((p) => p[0])) - 0.5, X1 = Math.max(...loc.map((p) => p[0])) + 0.5, Z0 = Math.min(...loc.map((p) => p[1])) - 0.5, Z1 = Math.max(...loc.map((p) => p[1])) + 0.5;
      const strip = (x0: number, x1: number, z0: number, z1: number) => { const c = rot(up, (x0 + x1) / 2, 0, (z0 + z1) / 2); b.solid({ ...c, y: -2 }, x1 - x0, 2, z1 - z0, 'ground', 'ground'); };
      strip(X0, P.x0, Z0, Z1); strip(P.x1, X1, Z0, Z1); strip(P.x0, P.x1, Z0, P.z0); strip(P.x0, P.x1, P.z1, Z1); }
    // V8 YY: las losas quitadas se sustituyen por cajas macizas (techo 0, 2 m de canto) donde no tocan el vaso; la franja que lo
    // toca la cubre el deck triangulado del contrato (colisión `yy_deck`, creada en buildYinYang). No se resella NMG ni FG.
    for (const [x0, z0, x1, z1] of YY!.hdr.deckBoxes) b.solid({ x: (x0 + x1) / 2, y: -2, z: (z0 + z1) / 2 }, x1 - x0, 2, z1 - z0, 'ground', 'ground');
    const yyHole = yyHoleWorld();
    // perímetro (Bola de Oro): hormigón gris verdoso
    // bajo la corona: sin z-fighting a distancia. V5 T5-12: con el hueco del hoyo de la U
    // V10: el plano base de la corona solo cubre el disco r ≤ 42,3 (fuera, el suelo azulado del exterior en Y 0, world/bola.ts)
    { const disc: [number, number][] = []; for (let i = 0; i < 128; i++) { const a = -i / 128 * Math.PI * 2; disc.push([42.3 * Math.sin(a), -42.3 * Math.cos(a)]); }
      b.planeWithHoles(disc, [hole, yyHole], -0.035, 'bola_ground', 0.25, { uvOffset: [H, -H] }); }   // V8: también el hueco YY
    // corona: caminos y sectores; centro
    const y = 0.0;
    // V4 NMG (KIT-04): en el arco de NO ME GUILLO los paseos son de losa rosa (referencia seleccionada) y el sector de losa
    // crema 1 × 1 m; el resto del anillo conserva su hormigón (rework artístico de otras zonas diferido)
    // V6 (D6-08): en el arco de FASHION GIRL (72–144°) los paseos son la losa rosa de NMG con su misma escala (UV de mundo:
    // continúan sin costura desde NMG); el resto del anillo conserva su hormigón
    // V7 (R7-05): también en el arco de TRA TRA TRA (144–216°), como en V01: continúa sin costura desde FG
    // V8: el arco de YINYANG (216–288°) también lleva paseos rosas (vistas Menta y rosa): continúa sin costura desde TT
    // V10: arcos derivados de los ejes (eje ± 36°) en lugar de 0/72/288/360 literales: giran con la corona
    const ARC = (id: ZoneId) => [SECTOR_BY_ID[id].axis - 36, SECTOR_BY_ID[id].axis + 36] as const;
    const nv = ARC('nosvamosdeaqui'), nmg = ARC('no_me_guillo'), fg0 = ARC('fashion_girl')[0], yy1 = ARC('yinyang')[1];
    b.annulus(WORLD.innerPath[0], WORLD.innerPath[1], nv[0], nv[1], y, 'nmg_floor_pink', 0.125);   // V10 NVDA: paseos rosas como NMG (dossier §4)
    b.annulus(WORLD.outerPath[0], WORLD.outerPath[1], nv[0], nv[1], y, 'nmg_floor_pink', 0.125);
    b.annulus(WORLD.innerPath[0], WORLD.innerPath[1], fg0, yy1, y, 'nmg_floor_pink', 0.125);
    b.annulus(WORLD.outerPath[0], WORLD.outerPath[1], fg0, yy1, y, 'nmg_floor_pink', 0.125);
    // V5 ART-09/10: suelos NMG de 8 × 8 m por repetición (losas de 1,6 m, macrovariación sin repetición visible)
    b.annulus(WORLD.innerPath[0], WORLD.innerPath[1], nmg[0], nmg[1], y, 'nmg_floor_pink', 0.125);
    b.annulus(WORLD.outerPath[0], WORLD.outerPath[1], nmg[0], nmg[1], y, 'nmg_floor_pink', 0.125);
    const fill: Record<ZoneId, string> = { no_me_guillo: 'nmg_floor', nosvamosdeaqui: 'nmg_floor',   /* V10: suelo cálido NMG (dossier NVDA §4) */ yinyang: 'nmg_floor', tratratra: 'nmg_floor', fashion_girl: 'nmg_floor' };   // V6: plaza gris de NMG en FG; V7: también en TRA TRA TRA; V8 R3 (usuario): también en YINYANG (mismo suelo que NMG/FG/TT)
    for (const s of SECTORS) {
      const uvk = 0.125;   // V10: todos los sectores con el suelo NMG de 8 × 8 m
      // V5 T5-12: el sector NMG lleva el hueco del hoyo de la U
      if (s.id === 'no_me_guillo') b.planeWithHoles(Builder.annulusOutline(WORLD.innerPath[1], WORLD.outerPath[0], s.axis - 36, s.axis + 36), [hole], y, fill[s.id], uvk);
      else if (s.id === 'yinyang') b.planeWithHoles(Builder.annulusOutline(WORLD.innerPath[1], WORLD.outerPath[0], s.axis - 36, s.axis + 36), [yyHole], y, fill[s.id], uvk);   // V8: hueco del vaso
      else b.annulus(WORLD.innerPath[1], WORLD.outerPath[0], s.axis - 36, s.axis + 36, y, fill[s.id], uvk);
    }
    b.annulus(0, WORLD.rCenter, 0, 360, y, 'asphalt', 0.25);
    // bordillos de los caminos (rayas rosas, solo visuales)
    // V10.3 (U-01, usuario): la raya ROSA de 16 cm en todas las zonas (antes negra de FG a YY)
    for (const r of [WORLD.innerPath[1], WORLD.outerPath[0]]) b.annulus(r - 0.08, r + 0.08, 0, 360, y + 0.004, 'pink', 1);
    // V10 (Bola de Oro §13, D-EX-01): el cierre lo forman los 44 tramos de muro NATIVO del exterior (world/bola.ts); sin valla de 1,10 ni
    // cierre invisible alto detrás (el contrato: «sin recrecido detrás», sin barreras invisibles en las letras)
  }

  // V10: el perímetro V3–V9 (esquinas con cajones/bank/quarter_bola/rail, lanzadera de trucos, bandas de árboles, fondo simplificado) se
  // sustituye por el exterior Bola de Oro (world/bola.ts). Código anterior: V10/backups/R1/src/world/park.ts.

  // ---------------------------------------------------------------- 2. NOSVAMOSDEAQUI — V10 en world/nvda.ts (el circuito V3–V9 queda en
  // V10/backups/R4/src/world/park.ts)

  // ---------------------------------------------------------------- 3. YINYANG — V8 en world/yy.ts (el descampado V7 queda en
  // V8/baseline_V7/game/src/world/park.ts)

  // ---------------------------------------------------------------- 5. FASHION GIRL — V6 en world/fg.ts (el constructor V5 queda en
  // V6/baseline_V5/src/world/park.ts)

  // V10: el centro (SECRETNOVIO) se construye en world/sn.ts; la superrampa y el triple V3–V9 quedan en V10/backups/R6/src/world/park.ts

  /** V10.3 (U-05, usuario: «parte de arriba a la misma altura, todos en el mismo anillo junto al paseo interior, cada uno con la proporción
   *  de sus letras, colocados de la mejor forma y en el mismo sitio con respecto al escenario»): UN solo cartel para todas las zonas. Lettering
   *  rosa del usuario (cada uno con su textura y su proporción), marco fino negro, legible por las dos caras, dos postes; la parte de arriba
   *  a `SIGN_TOP` y todos a r 25,6, a +33° del eje (la llegada desde la zona anterior del recorrido), de cara al paseo interior y al centro.
   *  Antes cada uno tenía su altura y su sitio (NMG a r 38,5). Texturas y orígenes: NMG assets/derived/v5/lettering, YY
   *  assets/derived/v8/yinyang_lettering, FG assets/derived/v6/fashion_girl, TT assets/derived/v10/tratratra_lettering, NVDA
   *  assets/derived/v10/nvda/lettering_rosa. */
  static readonly SIGN_TOP = 2.45;
  private lettering(p: Place, texName: string, name: string, text: string, W: number, H: number) {
    const top = Park.SIGN_TOP, bottom = top - H, yaw = p.yaw ?? 0, c = { x: p.x, z: p.z };
    const t = new THREE.TextureLoader().load(`${ASSET_BASE}tex/${texName}.webp`);
    t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
    const m = new THREE.MeshStandardMaterial({ map: t, color: 0xffffff, roughness: 0.8, metalness: 0 });
    const g = new THREE.PlaneGeometry(W, H);
    const front = new THREE.Mesh(g, m); front.name = name;
    const back = new THREE.Mesh(g, m); back.rotation.y = Math.PI; back.position.z = -0.045; front.add(back);   // dorso legible (mismo dibujo)
    front.position.set(c.x, bottom + H / 2, c.z); front.rotation.y = yaw; front.userData.text = text;
    this.root.add(front); this.signs.push(front);
    const place = (dx: number, dy: number, dz: number): Place => ({ x: c.x + Math.cos(yaw) * dx + Math.sin(yaw) * dz, y: dy, z: c.z - Math.sin(yaw) * dx + Math.cos(yaw) * dz, yaw });
    this.b.box(place(0, bottom - 0.04, -0.022), W + 0.08, H + 0.08, 0.035, { mat: 'black', collide: false, name: `${name.toLowerCase()}_frame` });   // marco fino
    const inset = W > 2.8 ? 0.25 : 0.2;
    for (const dx of [-W / 2 + inset, W / 2 - inset]) this.b.box(place(dx, 0, -0.022), 0.07, bottom, 0.07, { mat: 'black', collide: true, name: 'signpost' });
  }

  private sectorSigns() {
    // V10.3 (U-05): [textura, nombre, texto, ancho, alto] por zona (SN sin cartel)
    const L: Record<ZoneId, [string, string, string, number, number]> = {
      no_me_guillo: ['T_nmg_lettering_v2_rosa', 'NMG_LETTERING', 'NO ME GUILLO (lettering V2)', 2.4, 1.2],
      fashion_girl: ['T_fg_lettering', 'FG_LETTERING', 'FASHION GIRL (lettering principal)', 2.4, 1.6],
      tratratra: ['T_tt_lettering_v10', 'TT_LETTERING', 'TRA TRA TRA (lettering del usuario, 18 oct)', 3.0, 1.0],
      yinyang: ['T_yy_lettering', 'YY_LETTERING', 'YINYANG (lettering main Y09)', 2.4, 1.2],
      nosvamosdeaqui: ['T_nv_lettering_rosa', 'NV_LETTERING', 'NOSVAMOSDEAQUÍ (lettering MAIN, rosa)', 2.4, 2.4 / (1780 / 884)],
    };
    for (const s of SECTORS) {
      const S = this.sector(s.id);
      const [tx, nm, text, W, H] = L[s.id]; this.lettering(S.pl(25.6, 33, 0, Math.PI), tx, nm, text, W, H);
      // flecha antihoraria hacia el siguiente sector recomendado (discreta, en el suelo del paseo)
      const a = S.P(23.5, -30);
      const next = SECTORS[(SECTORS.indexOf(s) + 1) % SECTORS.length];
      this.floorDecal('G_takeoff_chevrons', a.x, a.z, 1.6, 0.8, -S.ccw(-30) + 0, 0.03).userData.next = next.id;
    }
  }

  // ---------------------------------------------------------------- estados dinámicos
  /** Desafío central: 0 = sin desafío (rampa oculta y sin colisión, sin marcas); 1 = superrampa y pista presentes.
   *  `t` intermedio para la animación de revelación a 20. V10.3 (W04): con t = 0 la valla cierra el centro; a t > 0 baja. */
  setCenter(t: number) {
    t = THREE.MathUtils.clamp(t, 0, 1);
    const rt = THREE.MathUtils.smoothstep(t, 0.15, 1);
    this.sn.group.visible = t > 0.02;
    this.sn.group.position.y = this.sn.rest * (1 - rt);
    for (const c of this.sn.colliders) c.setEnabled(t >= 1);
    this.snT = t; this.syncSnFollow();
    // V10.3 R1 (W-D07): la valla se hunde en el suelo en la primera parte de la revelación; sin colisiones desde que empieza a bajar
    const vt = this.vallaCut && t > 0 ? 1 : THREE.MathUtils.smoothstep(t, 0, 0.6);
    this.valla.group.position.y = -VALLA.sink * vt;
    this.valla.group.visible = vt < 0.999;
    for (const c of this.valla.colliders) c.setEnabled(t <= 0);
  }
  /** V10.3 R4 (W-D28): islas y plantas de SECRETNOVIO: suben con el reto (misma altura y visibilidad que su grupo). */
  snFollow: THREE.Object3D[] = []; private snT = 0;
  private syncSnFollow() { if (!this.sn) return; for (const o of this.snFollow) { o.position.y = this.sn.group.position.y; o.visible = this.sn.group.visible; } }
  /** V10.3: la valla está de pie (con colisiones). */
  get vallaUp() { return this.valla.group.visible && this.valla.group.position.y > -0.01; }
  setBridgeOpen(open: boolean) {
    if (!this.bridgeGate) return;
    this.bridgeGate.mesh.position.y = open ? -1.7 : 0;
    this.bridgeGate.mesh.visible = !open;
    for (const c of this.bridgeGate.colliders) c.setEnabled(!open);
  }
}

function drawSign(c: HTMLCanvasElement, text: string, bg: string, fg: string, font: string) {
  const g = c.getContext('2d')!;
  g.fillStyle = bg; g.fillRect(0, 0, c.width, c.height);
  g.strokeStyle = fg; g.lineWidth = Math.max(6, c.height * 0.06); g.strokeRect(g.lineWidth, g.lineWidth, c.width - 2 * g.lineWidth, c.height - 2 * g.lineWidth);
  let size = c.height * 0.62;
  g.font = `${size}px ${font}, Impact, sans-serif`;
  while (g.measureText(text).width > c.width * 0.88 && size > 10) { size *= 0.92; g.font = `${size}px ${font}, Impact, sans-serif`; }
  g.fillStyle = fg; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(text, c.width / 2, c.height / 2 + size * 0.04);
}
export function redrawSign(mesh: THREE.Mesh, text: string, bg: string, fg: string) {
  drawSign(mesh.userData.canvas, text, bg, fg, 'Bungee');
  ((mesh.material as THREE.MeshStandardMaterial).map as THREE.Texture).needsUpdate = true;
}
export type { ActivityId };

function distToSegXZ(p: { x: number; z: number }, a: { x: number; z: number }, b: { x: number; z: number }) {
  const dx = b.x - a.x, dz = b.z - a.z, L2 = dx * dx + dz * dz;
  const t = L2 > 0 ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.z - a.z) * dz) / L2)) : 0;
  return Math.hypot(p.x - (a.x + dx * t), p.z - (a.z + dz * t));
}
