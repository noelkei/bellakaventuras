// Orquestador V3: render, mundo físico único y residente (Park), jugador, cassettes, patatas, NPCs, actividades,
// música por sector, revelación del centro (20/20), reto final de SECRETNOVIO (V10) y preview.
// Tiempo (BASE-03): la lógica de juego corre SOLO en pasos fijos de 60 Hz (`fixedUpdate`), con su reloj de simulación
// (`sim.now` = `clock`); la presentación (`present`) interpola snapshots con alpha = acumulado / paso. Pausa, modal y
// segundo plano no ejecutan pasos: ninguna etapa, charla, baile ni premio avanza. El audio tiene su reloj propio.
// Modos excluyentes: explore · activity (la actividad consume la entrada) · reveal · final (intento del triple; el
// jugador sigue controlando) · preview. La pausa se superpone a cualquiera.
import { skyMaterial, lowPolySun, lowPolyClouds } from './sky';
import { FinalCine, SkyLogo, loadLogoData } from './finale';
import { snL, SN_ROT } from './world/sn';
import { lightPreset, type LightPreset } from './light';
import { watchHud, layoutButtonScale, layoutHand } from './hudlayout';
import { GestureDrive, GESTURE_ON } from './gesture';
import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import { applyCamFade, camSeg, shadowEdge } from './world/camfade';
import { GameState } from './state';
import { Input, InputFrame, EMPTY_FRAME } from './input';
import { AudioEngine } from './audio';
import { loadGlb } from './assets';
import { Skater, PlaceholderVisual, SkaterVisual, StepCtx, standAreaOk } from './skater';
import { CameraRig, CAM } from './camera';
import { FryPickup, Bursts, GLOW_TEXTURE, SkidMarks, SprayFx } from './fx';
import { $, toast, hint, setHud, showAction, dialogOpen, triggerAction, setObjective, setSayGate } from './ui';
import { Park, inZone } from './world/park';
import { TT_KIT, TT } from './world/tt';
import { SECTORS, SECTOR_BY_ID, ZoneId, toPolar, angleDelta, WORLD, TOTAL_FRIES, zoneAt } from './world/manifest';
import { Activity, PantherTalk, BenchSit, FreeDance, RailGrind, Graffiti, BridgeTalk, DanceCombo, SecretJump, LadderClimb } from './activities';
import { NpcActor, loadNpcGltf, BELLA_VARIANTS, blobShadow, type Variant } from './npc';
import { loadYyPool, loadYyProps, YY_KIT, YY } from './world/yy';
import { loadBolaColliders, loadBola } from './world/bola';
import { PoolWall } from './poolwall';
import { VALLA_R_OUT } from './world/valla';
import { Narrativa } from './narrativa';
import { Ayuda } from './ayuda';
import { d2Say, d2Close, d2Open, setD2Gate } from './dialogo2d';
import { TEXTOS, TEXTOS105 } from './textos2d';
import { DriftCars, CARS } from './vehicles';
import { TUNING } from './tuning';
import { SimClock, Token } from './sim';
import type { AnmiVisual } from './anmi';
import { orient } from './orient';
import * as avisos from './avisos';   // V10.6 (B5): métricas sin identificadores
import * as crono from './crono';   // V10.6.1: cronómetro de speedrun

export interface GameConfig {
  audio: { masterVolume: number; tracks: Record<string, string>; radio?: Record<string, number>; trims?: Record<string, number>; trimsPre?: Record<string, number>; loops?: Record<string, { xfade: number }>;
    cuts?: Record<string, { in: number; out: number; samples: number; sampleRate: number; sha256?: string }>; central?: { flashPeriod: number; flashHold: number; flashLevel: number; flashRamp: number } };
  preview: { visual: string | null; visualLabel: string; audioTrack: string; label: string };
  cta: { enabled: boolean; url: string | null; label: string; disabledNote: string };
  share: { enabled: boolean; text: string };
}

export type Mode = 'explore' | 'activity' | 'reveal' | 'final' | 'preview' | 'narr';   // V10.4: 'narr' = secuencia de los anfitriones 2D
export const FIXED_DT = 1 / 60;
/** R11 (SIS-23): ¿la textura ya tiene su imagen (o datos) para subirla a la GPU? */
const texReady = (t: THREE.Texture) => { const im: any = t.image ?? (t as any).source?.data; return !!im && (im.complete !== false) && ((im.width ?? 0) > 0 || !!im.data || Array.isArray(im)); };
const DEV = import.meta.env.DEV;

/** R13: dónde está cada patata y qué hacer, en palabras del jugador (sin nombres internos ni medidas). Lo usa la guía de «Falta:». */
const FRY_GUIDE: Record<string, string> = {
  'no_me_guillo.visible': 'A la vista, detrás del corazón según llegas desde la plaza',   // V10: la partida empieza en la plaza exterior
  'no_me_guillo.medium': 'Encima del cajón frente a la escalera (salta para cogerla)',
  'no_me_guillo.hidden': 'En el fondo de la U, por detrás: rodéala o mira desde el bank',
  'no_me_guillo.activity': 'Frente a La Pantera',
  'nosvamosdeaqui.visible': 'Arriba del todo de la escalera grande, al llegar al puente',   // V10: planta nueva (dossier NVDA §9)
  'nosvamosdeaqui.hidden': 'Dentro del paso bajo: entra agachada sobre la tabla',
  'nosvamosdeaqui.activity': 'Al final del rail, cuando Bellakat te da su regalo',
  'nosvamosdeaqui.medium': 'A media altura de la rampa empinada, junto a la escalera grande',
  'yinyang.visible': 'En el fondo de la piscina, al bajar la escalera',
  'yinyang.medium': 'Encima del banco del lado de TRA TRA TRA (salta para cogerla)',
  'yinyang.hidden': 'En el centro de la parte honda de la piscina',
  'yinyang.activity': 'Junto al muro pintado',
  'tratratra.visible': 'En el camino de abajo, al pie de la escalera de mano',
  'tratratra.medium': 'Sobre el agujero de la plataforma de atrás: sáltalo con carrerilla',
  'tratratra.hidden': 'Debajo del agujero de la plataforma: entra entre los pilares',
  'tratratra.activity': 'En el techo de la limo',
  'fashion_girl.medium': 'En el aire entre las dos cuñas rosas: salta desde una cuña',
  'fashion_girl.visible': 'En el fondo de la U, se ve desde el deck',
  'fashion_girl.hidden': 'Encima del muro bajo de la radio: súbete de un salto',   // V10.3 (W05): sin túnel
  'fashion_girl.activity': 'Junto a la rampa lateral de la pista',
};

const npcW = new THREE.Vector3();
/** V10 IT3 (usuario, 18 oct: «la nueva rana, al menos la altura hasta donde llega su cabeza, igual que la que había en YY; Fennec también:
 *  su cabeza, no las orejas, a esa altura»): la coronilla (hueso HeadTop_End, sin orejas ni gorro) de Rana y Fennec queda a la de la rana
 *  de YINYANG tal como se veía (rana.glb antigua: 1,791 m × 0,5 del contrato YY = 0,895 m; con ese modelo la escala sale 0,5, como antes). */
const NPC_HEAD_TOP = 0.895 * 1.3;   // V10.1 P21 (D15, usuario: «quiero que los hagas x1.3 más altos»): coronilla a 1,16 m
/** Cápsula de colisión de esos NPC: la del tamaño FÍSICO (cabeza a 0,895 m = la rana de YINYANG con su ×0,5 de contrato, validada por
 *  YY-09: ANMI no se queda de pie encima al saltar), no la del factor de escala de cada modelo (×0,449 la hacía saltable). */
const NPC_COLLIDER_K = 0.5 * 1.3;   // V10.1 P21: la cápsula crece en proporción (YY-09 sigue sin poder quedarse encima)
function npcHeadScale(a: NpcActor) {
  a.root.updateMatrixWorld(true); let y = 0; const v = new THREE.Vector3();
  a.root.traverse((o) => { if (o.name.endsWith('HeadTop_End')) y = o.getWorldPosition(v).y - a.root.position.y; });
  return y > 0.1 ? NPC_HEAD_TOP / (y / a.root.scale.y) : 1;
}

let panteraUrl = '';
const PANTERA_URL = () => panteraUrl || (panteraUrl = new URL('./audio/pantera_ambiente.mp3', document.baseURI).href);
/** V10.4 R19: factor de la música con un diálogo abierto (0,63 ≈ −4 dB: «ligeramente»). */
const DIALOG_DUCK = 0.63;
/** V10.5: bache de la música al cambiar de zona: baja casi a cero (6 %) en 0,5 s y sube en 1,1 s. */
const ZONA_DIP_MIN = 0.06, ZONA_BAJA = 0.5, ZONA_SUBE = 1.1;
export class Game {
  renderer: THREE.WebGLRenderer;
  steelEnv: THREE.Texture | null = null;   // V6: entorno de reflejos del acero (FG y NMG)
  scene = new THREE.Scene();
  rig: CameraRig;
  input = new Input();
  audio: AudioEngine;
  world!: RAPIER.World;
  park!: Park;
  skater: Skater | null = null;
  visual: SkaterVisual = new PlaceholderVisual();
  pickups: FryPickup[] = [];
  bursts: Bursts;
  skid: SkidMarks;   // V10.1 P17
  sprayFx: SprayFx;   // V10.2 Q13
  activities: Activity[] = [];
  npcs = new Map<string, NpcActor[]>();
  npcColliders = new Set<number>();
  cars!: DriftCars;
  cassettes: { zone: string; group: THREE.Group; hero: THREE.Object3D | null; proxy: THREE.Object3D; bars: THREE.Mesh[] }[] = [];
  sun!: THREE.DirectionalLight;
  /** V5 T5-26: ajuste de luz activo y dirección hacia el sol. */
  light: { id: string; p: LightPreset } | null = null; sunDir = new THREE.Vector3(-0.45, 0.8, 0.4).normalize();
  mode: Mode = 'explore';
  /** V10.4: recorrido 2D (tutorial, presentaciones, bloqueo de 3, final) y modo ayuda. */
  narr!: Narrativa; ayuda!: Ayuda;
  /** V10.4: capa 2D (para las pruebas y la ayuda). */
  readonly d2 = { say: d2Say, close: d2Close };
  /** V10.4: modelo de patata (también para la de práctica del tutorial). */
  fryModel: THREE.Object3D | null = null;
  paused = false;
  started = false;
  sim = new SimClock();
  acc = 0; last = performance.now();
  frameMs = 16;
  /** ?debug=1 (diagnóstico); las herramientas que alteran la partida solo existen en desarrollo. */
  debug = new URLSearchParams(location.search).get('debug') === '1';
  quality = 1;
  stats = { drawCalls: 0, tris: 0, geometries: 0, textures: 0, steps: 0, renders: 0, camFadeMats: 0, npcTiers: { full: 0, mid: 0, low: 0, off: 0 } };
  private npcFrustum = new THREE.Frustum(); private npcMat = new THREE.Matrix4(); private npcSph = new THREE.Sphere(); private npcSeen = new Map<NpcActor, boolean>();
  zone: ZoneId | null = null;
  centerOpen = false;
  frame0: InputFrame = EMPTY_FRAME;
  revealT = -1;   // (V10.4: lo lee la narrativa)
  private actionOwner: string | null = null;
  private safeT = 0;
  private signT = 0;
  private hintT = 0;
  private fenceT = -99;
  /** V10.3 R1: peso del reparto de música «con valla» (1 = valla de pie). */
  /** V10.5: música por zona con bache al cambiar (ver updateMusic). */
  zonaMus: string | null = null; zonaSig: string | null = null; zonaFase: 'baja' | 'sube' | null = null; zonaDip = 1;
  vallaMusicK = 1;
  autoMode = false;                         // el piloto controla el tiempo (simulate); el bucle real solo dibuja
  workMs = 0;
  log: string[] = [];
  private lastSource = '';
  /** R11 (NMG-07): instante desde el que se puede recoger cada premio recién aparecido. */
  private pickArm = new Map<string, number>();
  /** R11 (ANIM-01): tiempo de animación acumulado de los NPC lejanos (45–70 m). */
  private npcLod = new Map<NpcActor, number>();
  makeVisual: (() => Promise<SkaterVisual>) | null = null;
  private boomboxGltf: any = null;
  private npcLoading = new Set<string>();
  previewToken: Token | null = null;
  /** V10.1 escena final: cinemática en curso y logo de nubes del cielo (null hasta pasarse el juego). */
  cine: FinalCine | null = null; skyLogo: SkyLogo | null = null;
  async ensureSkyLogo() {
    if (this.skyLogo) return this.skyLogo;
    const d = await loadLogoData(); if (!d || this.skyLogo) return this.skyLogo;
    this.skyLogo = new SkyLogo(d); this.skyLogo.clouds = (this.scene.getObjectByName('SKY_CLOUDS_ROOT')?.userData.avoid ?? null) as any; this.skyLogo.rest(); this.scene.add(this.skyLogo.group); this.skyLogo.update(0, this.rig.cam, true); return this.skyLogo;   // R18: completo (con la fecha) y en reposo
  }
  /** Notificaciones a la interfaz de pausa (bootstrap). */
  onPauseChange: ((on: boolean) => void) | null = null;

  constructor(public canvas: HTMLCanvasElement, public state: GameState, public cfg: GameConfig) {
    const mobile = matchMedia('(pointer: coarse)').matches;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: !mobile || devicePixelRatio < 2, powerPreference: 'high-performance' });
    this.quality = mobile ? 0.8 : 1;
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, mobile ? 1.6 : 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.NeutralToneMapping;
    this.renderer.toneMappingExposure = 1.02;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;   // V4: PCFSoft ya no existe en three r18x (avisaba y usaba PCF): mismo resultado, sin aviso
    this.rig = new CameraRig(orient.width / orient.height);
    this.audio = new AudioEngine({ masterVolume: cfg.audio.masterVolume, music: { tracks: cfg.audio.tracks, radio: cfg.audio.radio as any, trims: cfg.audio.trims, trimsPre: cfg.audio.trimsPre, loops: cfg.audio.loops, cuts: cfg.audio.cuts, central: cfg.audio.central } });
    this.audio.volume = state.p.settings.volume; this.audio.muted = state.p.settings.muted;
    this.bursts = new Bursts(this.scene);
    this.skid = new SkidMarks(this.scene);   // V10.1 P17
    this.sprayFx = new SprayFx(this.scene);   // V10.2 Q13
    addEventListener('resize', () => { this.resize(); const fd = this.activities.find((a) => a.id === 'freeDance') as any; if (fd?.menu) fd.toggleMenu(false); });   // R11 (SIS-33)
    screen.orientation?.addEventListener?.('change', () => setTimeout(() => { orient.evaluate(); this.resize(); }, 150));
    orient.onChange(() => { this.resize(); this.input.clear(); const fd = this.activities.find((a) => a.id === 'freeDance') as any; if (fd?.menu) fd.toggleMenu(false); });   // un gesto en curso se cancela limpio al girar · R11 (SIS-33): el abanico de bailes se cierra
    watchHud();   // V5 T5-23: avisos flotantes sin montarse con la columna del HUD
    this.resize();
    // V10.5 (regla de oro, E5-11/E5-12): ningún 2D se abre hasta que la cámara esté quieta (< 0,2 m/s y < 4 °/s durante 0,25 s); el bocadillo de
    // una charla, igual (primero llega la cámara con su fundido). Como mucho 2,5 s / 1,5 s de espera (nunca se queda sin abrir)
    setD2Gate(() => this.camStill(2.5)); setSayGate(() => this.camArrived(1.0));
  }
  /** V10.5: seguimiento de la cámara en cada fotograma (velocidad lineal y angular) para la espera común antes de los diálogos. */
  private camPrev = { t: 0, p: new THREE.Vector3(), q: new THREE.Quaternion(), ok: false }; camStillSince = 0;
  private trackCam(now: number) {
    const c = this.rig.cam, P = this.camPrev, dt = (now - P.t) / 1000;
    if (P.ok && dt > 0) { const v = c.position.distanceTo(P.p) / dt, w = 2 * Math.acos(Math.min(1, Math.abs(c.quaternion.dot(P.q)))) * 180 / Math.PI / dt;
      if (v > 0.2 || w > 4) this.camStillSince = now; }
    else this.camStillSince = now;
    P.t = now; P.p.copy(c.position); P.q.copy(c.quaternion); P.ok = true;
  }
  /** V10.5 (E5-12): promesa que se cumple cuando la cámara ha terminado su fundido hacia el encuadre de la charla (o pasados `max` segundos). */
  camArrived(max: number) {
    const t0 = performance.now(), ok = () => this.rig.blendDone || performance.now() - t0 > max * 1000 || !this.started;
    if (ok()) return Promise.resolve();
    return new Promise<void>((res) => { const loop = () => { if (ok()) res(); else requestAnimationFrame(loop); }; requestAnimationFrame(loop); });
  }
  /** Promesa que se cumple cuando la cámara lleva 0,25 s quieta (o pasados `max` segundos). */
  camStill(max: number) {
    const t0 = performance.now(), ok = () => performance.now() - this.camStillSince >= 250 || performance.now() - t0 > max * 1000 || !this.started;
    if (ok()) return Promise.resolve();
    return new Promise<void>((res) => { const loop = () => { if (ok()) res(); else requestAnimationFrame(loop); }; requestAnimationFrame(loop); });
  }

  /** Reloj de simulación en segundos (compatibilidad: actividades y pruebas lo leen como `clock`). */
  get clock() { return this.sim.now; }
  get manifest() { return this.park.manifest; }
  /** V5 T5-18: tamaño LÓGICO (con el contenedor girado por la orientación de respaldo, ancho y alto se intercambian). */
  resize() {
    // R11 (FPS-02): el pixel ratio sigue a devicePixelRatio (cambio de monitor o de zoom), conservando lo que bajó la adaptación
    const max = Math.min(devicePixelRatio, matchMedia('(pointer: coarse)').matches ? 1.6 : 2);
    if (Math.abs(max - this.maxPixelRatio) > 1e-3) { this.maxPixelRatio = max; this.renderer.setPixelRatio(Math.max(Math.min(1, max), max - this.prDrop)); this.watchDpr(); }
    this.renderer.setSize(orient.width, orient.height, false); this.rig.resize(orient.width, orient.height);
    this.frozenDrawn = false;
  }
  private dprMq: MediaQueryList | null = null; private lastDpr = devicePixelRatio;
  /** R11 (FPS-02): el cambio de monitor no siempre dispara `resize`: se escucha la media query de la densidad actual. */
  watchDpr() {
    try { this.dprMq?.removeEventListener('change', this.onDpr); this.dprMq = matchMedia(`(resolution: ${devicePixelRatio}dppx)`); this.dprMq.addEventListener('change', this.onDpr); } catch { /* */ }
  }
  private onDpr = () => this.resize();

  // ------------------------------------------------------------------ carga
  async preload(onProgress: (f: number, label: string) => void) {
    onProgress(0.05, 'Parque…');
    this.watchDpr();   // R11 (FPS-02)
    this.world = new RAPIER.World({ x: 0, y: -9.81, z: 0 });
    await Promise.all([loadYyPool(), loadBolaColliders()]);   // V8: superficie del vaso YY · V10: colisiones nativas del exterior (antes de construir el parque)
    this.park = new Park(this.world);
    const errs = this.park.build();
    if (errs.length) this.log.push('MANIFEST ' + errs.join('; '));
    this.scene.add(this.park.root);
    this.rig.world = this.world;
    this.rig.ignore = (c) => !this.npcColliders.has(c.handle) && !this.park.cameraIgnore.has(c.handle) && !this.park.b.thin.has(c.handle);
    this.world.step();
    this.setupLights();
    // V6 R3: el acero inox de FG (barandillas, escalera, cantoneras) refleja un entorno sencillo de exterior (cielo claro,
    // horizonte cálido, suelo oscuro): sin él sale mate y beis con la luz cálida. Solo ese material; PMREM generado una vez.
    try { const steel = this.park.mats.get('fg_steel') as THREE.MeshStandardMaterial, pm = new THREE.PMREMGenerator(this.renderer);
      const env = new THREE.Scene(), g = new THREE.SphereGeometry(10, 32, 16), col: number[] = [], pos = g.attributes.position;
      for (let i = 0; i < pos.count; i++) { const y = pos.getY(i) / 10;
        const c = y > 0.05 ? new THREE.Color(0.95, 0.9, 0.84).lerp(new THREE.Color(0.62, 0.72, 0.86), Math.min(1, (y - 0.05) * 2.2)) : new THREE.Color(0.42, 0.38, 0.35).lerp(new THREE.Color(0.16, 0.15, 0.15), Math.min(1, -y * 3 + 0.15));
        col.push(c.r, c.g, c.b); }
      g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
      env.add(new THREE.Mesh(g, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide })));
      this.steelEnv = pm.fromScene(env, 0.02).texture; steel.envMap = this.steelEnv; steel.needsUpdate = true; pm.dispose(); g.dispose();
      // V7 R5 (usuario): el acero oscuro de las barandillas de TRA TRA TRA y la pintura metálica de sus escaleras, con los mismos reflejos
      for (const k of ['tt_iron', 'tt_ladder', 'yy_t1_bronze', 'yy_t1_grille', 'yy_lip', 'valla_poste', 'valla_malla', /* V10.3 (U-08): brillo metálico en todas las barandillas y remates */ 'steel', 'nv_guard', 'nv_coping', 'nv_rail', 'nv_post', 'fg_coping', 'sn_ladder']) { try { const mt = this.park.mats.get(k) as THREE.MeshStandardMaterial; mt.envMap = this.steelEnv; mt.needsUpdate = true; } catch { /* sin TT */ } } } catch (e) { console.warn('entorno del acero FG', e); }
    this.cars = new DriftCars(this.park.mats, GLOW_TEXTURE, this.world);
    this.scene.add(this.cars.group);
    onProgress(0.15, 'Personaje…');
    // R11 (SIS-35): la barra avanza con cada pieza que termina (antes se quedaba en 15 % casi toda la carga con red lenta)
    let partsDone = 0; const PARTS = 10, part = <T,>(p: Promise<T>, label: string) => p.finally(() => { partsDone++; onProgress(0.15 + 0.65 * partsDone / PARTS, label); });
    // R11 (SIS-16): un corte puntual de red al pedir la patata ya no impide arrancar (2 reintentos)
    const retry = async <T,>(f: () => Promise<T>) => { for (const w of [500, 2000]) { try { return await f(); } catch { await new Promise((r) => setTimeout(r, w)); } } return f(); };
    const [fry] = await Promise.all([
      part(retry(() => loadGlb('props/fry.glb')), 'Patatas…'),
      part((async () => { if (this.makeVisual) { try { this.visual = await this.makeVisual(); } catch (e) { console.error('ANMI no cargó; figura provisional', e); } } })(), 'Personaje…'),
      part(loadGlb('props/boombox.glb').then((g) => (this.boomboxGltf = g)).catch((e) => console.warn('cassette no cargó (se usa proxy)', e)), 'Cassettes…'),
      part(this.loadNpc('la_pantera'), 'La Pantera…'),
      part(this.park.loadProps(), 'Vegetación…'),   // derivados de vegetación/mobiliario (si alguno falla, queda su proxy)
      part(this.park.loadNmgKit(), 'NO ME GUILLO…'),  // V4: kit NO ME GUILLO de Blender (si falla, queda el blockout)
      part(this.park.loadFgProps(), 'FASHION GIRL…'), // V6: atrezzo FASHION GIRL de Blender (si falla, quedan los proxies)
      part(loadYyProps(this.park).then((r) => (this.park.yyProps = r)), 'YINYANG…'), // V8: mobiliario M01 de YINYANG (si falla, proxies)
      part(loadGlb('props/car.glb').then((g) => this.cars.useModel(g.scene)).catch((e) => console.warn('coche derivado no cargó (queda el procedural)', e)), 'Coches…'),
      part(loadBola(this.park), 'Bola de Oro…'),   // V10: exterior (capas GLB + familias instanciadas)
    ]);
    onProgress(0.8, 'Colocando…');
    // V10.2 Q13: la lata de espray del usuario (receta assets/derived/v10_2/lata_espray), para GRAFITEAR; sin bloquear el arranque
    void loadGlb('props/lata.glb').then((g) => { g.scene.traverse((m: any) => { if (m.isMesh && this.steelEnv) for (const mt of [m.material].flat()) if (mt && !mt.envMap) { mt.envMap = this.steelEnv; mt.envMapIntensity = 0.8; mt.needsUpdate = true; } });
      (this.visual as any)?.setSprayModel?.(g.scene); }).catch((e) => console.warn('lata no cargó (se usa el bote provisional)', e));
    // V6 R5 (usuario): el acero del kit NMG (cantoneras, barras) con los mismos reflejos que el de FG
    // V8: el inox de la fuente M01 y el aro interior de la papelera, con el mismo entorno (sin él salen negros)
    if (this.steelEnv) this.park.root.getObjectByName('YY_PROPS')?.traverse((m: any) => { if (!m.isMesh) return;
      for (const mt of [m.material].flat()) if (mt && mt.metalness > 0.3 && !mt.envMap) { mt.envMap = this.steelEnv; mt.envMapIntensity = 0.85; mt.needsUpdate = true; } });
    if (this.steelEnv) this.park.root.getObjectByName('NMG_KIT')?.traverse((m: any) => { if (!m.isMesh) return;
      for (const mt of [m.material].flat()) if (mt?.name === 'M_nmg_steel' && !mt.envMap) { mt.envMap = this.steelEnv; mt.envMapIntensity = 0.75; mt.roughness = Math.min(mt.roughness, 0.28); mt.needsUpdate = true; } });
    this.spawnPlayer();
    this.setupCassettes();
    this.setupFries(fry.scene);
    this.narr = new Narrativa(this); this.ayuda = new Ayuda(this, this.narr);
    this.activities = [new PantherTalk(this), new RailGrind(this), new Graffiti(this), new BridgeTalk(this), new DanceCombo(this), new SecretJump(this), new BenchSit(this), new FreeDance(this), new LadderClimb(this)];   // BenchSit y FreeDance al FINAL: las pruebas V4/V5 localizan actividades por índice
    for (const a of this.activities) a.init?.();
    this.applyCenterState(false);
    this.input.onDir = (d) => { for (const a of this.activities) a.onDir?.(d); };
    onProgress(0.9, 'Preparando…');
    await this.precompile(this.scene);   // R11 (SIS-23)
    onProgress(1, 'Listo');
  }

  /** R11 (SIS-23 = PERF-01, NMG-21): shaders y texturas de TODO lo cargado se preparan al final de la carga (antes se compilaban la
   *  primera vez que entraban en cuadro: tirones de 145–385 ms al ver por primera vez YINYANG, TRA TRA TRA o FASHION GIRL). El tramado
   *  de cámara se aplica antes (cambia los programas) y lo oculto se hace visible solo durante la compilación. */
  /** R11 (SIS-23): texturas por subir a la GPU. R13: TODAS van aquí (antes las que ya tenían imagen se subían de golpe al final de la
   *  carga: ~1 s de las 94 texturas con la pantalla de carga parada); se suben en la pantalla de inicio y en los primeros fotogramas,
   *  con un presupuesto de ~6 ms por fotograma (al menos una). Una textura aún sin imagen espera a que llegue. */
  private texPending: THREE.Texture[] = [];
  /** R13: al pulsar JUGAR con texturas aún en cola se suben ya (con la portada a la vista), para que el primer fotograma de juego
   *  no las suba todas de golpe (congelón de 0,4–0,7 s si se pulsaba en cuanto se activa el botón). */
  flushPending() { this.texPending = this.texPending.filter((t) => { if (!texReady(t)) return true; try { this.renderer.initTexture(t); } catch { /* */ } return false; }); }
  uploadPending() {
    if (!this.texPending.length) return;
    const t0 = performance.now(); let n = 0;
    this.texPending = this.texPending.filter((t) => { if ((n > 0 && performance.now() - t0 > 6) || !texReady(t)) return true; n++; try { this.renderer.initTexture(t); } catch { /* */ } return false; });
  }
  async precompile(root: THREE.Object3D) {
    try {
      applyCamFade(this.park.root);
      const shown: THREE.Object3D[] = []; root.traverse((o) => { if (!o.visible) { shown.push(o); o.visible = true; } });
      try { const r = this.renderer as any; if (r.compileAsync) await r.compileAsync(root, this.rig.cam, this.scene); else r.compile(root, this.rig.cam); }
      finally { for (const o of shown) o.visible = false; }
      const texs = new Set<THREE.Texture>();
      root.traverse((o: any) => { if (!o.isMesh) return; for (const m of [o.material].flat()) if (m) { for (const v of Object.values(m)) if ((v as any)?.isTexture) texs.add(v as THREE.Texture); for (const t of (m.userData?.extraTextures ?? [])) texs.add(t); } });
      for (const t of texs) if (!this.texPending.includes(t)) this.texPending.push(t);   // R13: subida repartida (uploadPending)
      (this.stats as any).precompiled = ((this.stats as any).precompiled ?? 0) + texs.size;
    } catch (e) { console.warn('precompilación', e); }
  }

  private setupLights() {
    // V5 T5-26: luz por ajuste (cálida de tarde por defecto en todo el mapa; ?bklight=mediodia = V4)
    const L = lightPreset(); this.light = L; const P = L.p;
    const hemi = new THREE.HemisphereLight(P.hemiSky, P.hemiGround, P.hemiI);
    const sun = new THREE.DirectionalLight(P.sun, P.sunI);
    this.sunDir.set(...P.dir).normalize();
    this.renderer.toneMappingExposure = P.exposure;
    sun.castShadow = true;
    const ms = this.quality < 1 ? 1024 : 2048;
    sun.shadow.mapSize.set(ms, ms);
    const c = sun.shadow.camera as THREE.OrthographicCamera;
    c.left = -20; c.right = 20; c.top = 20; c.bottom = -20; c.near = 1; c.far = 90;
    sun.shadow.bias = -0.0005; sun.shadow.normalBias = 0.04;
    sun.shadow.camera.layers.enable(1);
    this.sun = sun;
    this.scene.add(hemi, sun, sun.target);
    // V10 IT3: cúpula con resplandor del sol y estratos de atardecer, sol low-poly y nubes low-poly (sky.ts)
    const sky = new THREE.Mesh(new THREE.SphereGeometry(400, 24, 12), skyMaterial(P, this.sunDir));
    sky.renderOrder = -10; sky.frustumCulled = false;
    this.scene.add(sky, lowPolySun(this.sunDir), lowPolyClouds(() => this.state.p.settings.reducedMotion));
    // V10.1 escena final: el logo de nubes de Bellakaciones queda en el cielo una vez pasado el juego (se ve desde todo el mapa)
    if (this.state.p.finalDone) void this.ensureSkyLogo();
    this.scene.background = new THREE.Color(P.bg);
    this.scene.fog = new THREE.Fog(P.fog, P.fogNear, P.fogFar);   // ART-02: separa planos del fondo con algo más de bruma
  }

  /** Checkpoint persistido: se revalida contra el suelo y el volumen de pie actuales (geometría puede haber cambiado). */
  /** V10: con el reto de SECRETNOVIO a la vista, su arquitectura elevada (coronación de A, curva, B, D y mesas) no es punto seguro ni de
   *  reaparición (sustituye a la huella de la superrampa, R11 PEN-01): se vuelve al pie de la escalera. */
  onSuperRamp(p: THREE.Vector3) {
    if (!(this.state.centerUnlocked && this.state.p.revealSeen) || p.y < 0.3) return false;
    p = snL(p);   // V10.1: en el marco del reto (girado)
    return (Math.abs(p.x) < 6.2 && p.z > -14 && p.z < -8.4) || (Math.abs(p.x) < 2.5 && p.z > -3.8 && p.z < 0.2) || (Math.abs(p.x) < 4.5 && p.z > 7.0 && p.z < 13.0);
  }
  private safeSpawn() {
    const m = this.park.manifest;
    const cp = this.state.p.checkpoint;
    if (!cp) return null;
    const p = new THREE.Vector3(cp.x, cp.y, cp.z);
    if (Math.abs(p.x) > WORLD.half - 1 || Math.abs(p.z) > WORLD.half - 1) return null;
    // V5 T5-10 (OPUS-005): un checkpoint antiguo dentro de la banda de coches (con coches activos) se recoloca fuera de ella
    if (this.state.centerUnlocked && this.state.p.revealSeen) {
      const r = Math.hypot(p.x, p.z);
      if (Math.abs(r - CARS.R) < 4.1) { const rr = r >= CARS.R ? CARS.R + 4.6 : CARS.R - 4.6, k = rr / Math.max(1e-3, r); p.x *= k; p.z *= k; p.y = 0; this.log.push(`checkpoint en la banda de coches recolocado a r ${rr}`); }
    }
    // R11 (PEN-01): un checkpoint sobre la superrampa (guardado antes del arreglo) se cambia por el ancla de reintento del centro
    if (this.onSuperRamp(p)) { const a = this.park.manifest.get('sn.retry'); this.log.push('checkpoint sobre el reto de SECRETNOVIO recolocado al pie de la escalera'); return { pos: a.pos.clone(), heading: a.heading }; }
    // suelo bajo el punto y cápsula de pie libre (no dentro de NPC, pared u objeto nuevo)
    const R = RAPIER; const ray = new R.Ray({ x: p.x, y: p.y + 2.2, z: p.z }, { x: 0, y: -1, z: 0 });
    const hit = this.world.castRay(ray, 3.5, true, R.QueryFilterFlags.EXCLUDE_SENSORS);
    if (!hit) return null;
    p.y = p.y + 2.2 - hit.timeOfImpact;
    const shape = new R.Capsule(0.6, 0.29);
    const blocked = this.world.intersectionWithShape({ x: p.x, y: p.y + 0.95, z: p.z }, { x: 0, y: 0, z: 0, w: 1 }, shape, R.QueryFilterFlags.EXCLUDE_SENSORS);
    if (blocked) return null;
    // R11 (MOV-11): un checkpoint viejo guardado en el techo de una barandilla/poste no se usa (se empieza en el de la zona)
    if (!standAreaOk(this.world, p, this.skater?.collider)) { this.log.push('checkpoint sin suelo alrededor descartado'); return null; }
    void m;
    return { pos: p, heading: cp.heading };
  }

  private spawnPlayer() {
    const m = this.park.manifest;
    // V8: un checkpoint guardado con la geometría anterior dentro de YINYANG (el descampado V3–V7 es ahora la piscina) no se
    // reinterpreta sobre el vaso nuevo: va al punto seguro del sector (deck junto a E1), con todo el progreso intacto
    // V10 (D-SV-01, paso 2): checkpoint guardado dentro de NVDA antes de la planta nueva → punto seguro del sector, con todo el progreso
    if ((this.state.p as any).__relocate === 'secretnovio') { delete (this.state.p as any).__relocate; const c = m.checkpoints.find((q) => q.id === 'cp.secretnovio')!;
      this.state.p.checkpoint = { x: c.pos.x, y: c.pos.y, z: c.pos.z, heading: c.heading }; this.log.push('checkpoint del centro anterior a V10 recolocado en el punto seguro de SECRETNOVIO'); }
    if ((this.state.p as any).__relocate === 'nosvamosdeaqui') { delete (this.state.p as any).__relocate; const c = m.checkpoints.find((q) => q.id === 'cp.nosvamosdeaqui')!;
      this.state.p.checkpoint = { x: c.pos.x, y: c.pos.y, z: c.pos.z, heading: c.heading }; this.log.push('checkpoint de NOSVAMOSDEAQUÍ anterior a V10 recolocado en el punto seguro del sector'); }
    const cpOld = this.state.p.checkpoint, yyOld = !!cpOld && this.state.p.checkpointRevision < 6 && zoneAt(cpOld) === 'yinyang';
    const safe = yyOld ? null : this.safeSpawn();
    let pos = safe?.pos ?? m.spawn.pos.clone(), heading = safe?.heading ?? m.spawn.heading;
    if (yyOld) { const c = m.checkpoints.find((q) => q.id === 'cp.yinyang')!; pos = c.pos.clone(); heading = c.heading; this.log.push('checkpoint de YINYANG anterior a V8 recolocado en el deck junto a E1'); }
    if (this.state.p.checkpoint && !safe && !yyOld) {
      this.log.push('checkpoint descartado: punto no seguro con la geometría actual');
      // V7: un checkpoint del TRA TRA TRA anterior (tablero viejo, descansos) que ya no tiene suelo o cae dentro de la obra nueva
      // vuelve al pie de la escalera de entrada del mismo sector, con todo el progreso intacto (no a NO ME GUILLO)
      const cp = this.state.p.checkpoint, tt = m.checkpoints.find((c) => c.id === 'cp.tratratra');
      if (tt && zoneAt(cp) === 'tratratra') { pos = tt.pos.clone(); heading = tt.heading; this.log.push('checkpoint de TRA TRA TRA recolocado al pie de la entrada'); }
      const yc = m.checkpoints.find((c) => c.id === 'cp.yinyang');
      if (yc && zoneAt(cp) === 'yinyang') { pos = yc.pos.clone(); heading = yc.heading; this.log.push('checkpoint de YINYANG no seguro recolocado en el deck junto a E1'); }
    }
    this.skater = new Skater(this.world, pos, heading);
    const s = this.skater;
    // V8 R2 (usuario): mecánica de pared del vaso de YINYANG (tabla del borde generada con la malla; solo dentro del vaso)
    if (YY?.hdr.wallRide && YY_KIT.wallRide) s.pool = new PoolWall(YY.hdr.wallRide, YY_KIT.wallRide as never);
    if (s.pool) s.pool.onSfx = (n, p) => this.audio.sfx(n, p);
    s.onJump = (k) => this.audio.sfx(k === 'hop' ? 'hop' : 'jump');
    s.onLand = (imp, hard) => {
      this.audio.sfx('land', imp);
      if (hard && !this.state.p.settings.reducedMotion) this.rig.shake = 0.5;
      if (imp > 3) this.bursts.emit(s.footPos.clone().add(new THREE.Vector3(0, 0.08, 0)), '#E9DCC6', 10, 1.6, 0.32);
    };
    s.onTrick = (k, ok) => {
      if (k === 'triple') return;
      if (!ok) return;
      this.audio.sfx('trick');
      const nm = ({ kickflip: 'KICKFLIP!', heelflip: 'HEELFLIP!', spin180: '180! (fakie)', spin360: '360!', frontflip: 'FRONTFLIP!', backflip: 'BACKFLIP!' } as Record<string, string>)[k] ?? '';
      toast('¡' + (s.chain.length ? `×${s.chain.length + (s.trick ? 1 : 0)} ` : '') + nm, 1300);   // V10.1 P22: contador en el aire (R5, QA C10: «¡×2 KICKFLIP!»)
    };
    // V10.1 P22 (D16): contador de combo al aterrizar varios trucos en el mismo aire
    s.onCombo = (list) => { const N: Record<string, string> = { kickflip: 'KICKFLIP', heelflip: 'HEELFLIP', spin180: '180', spin360: '360', frontflip: 'FRONTFLIP', backflip: 'BACKFLIP' };
      const same = list.every((k) => k === list[0]); this.audio.sfx('success'); toast(same ? `¡×${list.length} ${N[list[0]] ?? list[0]}!` : `¡COMBO ×${list.length}! ${list.map((k) => N[k] ?? k).join(' · ')}`, 2000); };
    s.onDeny = (why) => {
      this.audio.sfx('deny');
      const msg: Record<string, string> = {
        aire: 'Sin aire suficiente para ese truco', techo: 'Sin espacio para saltar',
        'aire-flip': 'Frontflip y backflip: lánzate desde una rampa',   // R11 (MOV-01)
        'bajar-rapido': 'Vas demasiado rápido para bajar: frena un poco', 'bajar-pendiente': 'Para en llano para bajar', 'bajar-techo': 'Aquí no cabes de pie',
        'bajar-aire': 'Aterriza antes de bajar', 'bajar-final': 'Termina el intento antes de bajar', 'bajar-ocupado': 'Termina el truco antes de bajar',
        'bajar-pared': 'En la pared no puedes bajar de la tabla', 'giro-pared': 'En el vaso: F / X = grab · giros con SALTO + dirección',
        'subir-rapido': 'Vas demasiado rápido para subir a la tabla', 'subir-pendiente': 'Busca suelo llano para subir', 'subir-aire': 'Toca suelo para subir a la tabla',
      };
      toast(msg[why] ?? 'Ahora no', 1300);
    };
    s.onBail = (why) => { this.audio.sfx('bail'); this.log.push('bail ' + why); if (!/truco incompleto triple|final/.test(why)) toast('¡Uy! Caída suave: sigues con todo tu progreso', 1800); };
    s.onPushContact = () => this.audio.sfx('push');
    // R11 (TRK-03): el grab y el revert también responden (antes, nada)
    s.onGrab = () => { this.audio.sfx('trick'); toast('¡GRAB!', 900); };
    s.onRevert = () => { this.audio.sfx('trick'); toast('¡REVERT!', 900); };
    // V5 T5-09: contacto intermedio contra una cara (4,5–8,5 m/s de cierre): golpe sonoro y sacudida breve, sin caída
    s.onBump = (c) => { this.audio.sfx('land', 2 + c * 0.6); if (!this.state.p.settings.reducedMotion) this.rig.shake = Math.max(this.rig.shake, 0.25); };
    // V4-AUD-03: eventos que faltaban (recepción, manual, scoot, levantarse); uno por evento físico, con enfriamiento
    s.onCatch = () => this.audio.sfx('catch');
    s.onScootContact = () => this.audio.sfx('scoot');
    s.onGrind = (on) => { this.audio.setGrind(on); if (on) this.audio.sfx('grindIn'); };
    s.onMode = (l) => { if (l === 'mount') this.audio.sfx('mount'); if (l === 'dismount') this.audio.sfx('dismount'); if (l === 'manual') this.audio.sfx('manualIn'); this.updateModeChip(); };
    s.onImpact = (ph, info) => {
      if (ph === 'launch') { this.chipMode = null;   /* V10.1 P11: al levantarse se ve otra vez «A pie · Q para subir» */ this.audio.sfx('bail'); if (!this.state.p.settings.reducedMotion) this.rig.shake = 0.6; this.log.push(`impacto ${s.bailReason} ${info.closing.toFixed(1)}`); }
      if (ph === 'getup') this.audio.sfx('getup');
      if (ph === 'land') { this.audio.sfx('land', 6); this.bursts.emit(s.footPos.clone().add(new THREE.Vector3(0, 0.1, 0)), '#E9DCC6', 12, 1.8, 0.3); }
      if (ph === 'getup') this.recoverOffTrack();
      document.getElementById('hint')?.classList.toggle('impact', ph === 'launch' || ph === 'air' || ph === 'land');   // V5 T5-23: sin avisos sobre el cuerpo en vuelo
      this.updateModeChip();
    };
    // V5 T5-10 (DT-12, OPUS-005): banda de coches activa = |r − R| < 3,3 (deslizamiento) / < 4,1 (sin puntos seguros)
    s.bandAt = (p) => { if (!this.cars.active) return null; const r = Math.hypot(p.x, p.z); const out = r > 1e-3 ? new THREE.Vector3(p.x / r, 0, p.z / r) : new THREE.Vector3(1, 0, 0);
      return { inBand: Math.abs(r - CARS.R) < 3.6, dir: r >= CARS.R ? out : out.negate() }; };
    s.safeOk = (p) => (!this.cars.active || Math.abs(Math.hypot(p.x, p.z) - CARS.R) >= 4.1) && !this.onSuperRamp(p)
      && !(this.activities.find((a) => a.id === 'secretJump') as any)?.inAttempt;   // R11 (PEN-01)
    s.noImpact = this.park.noImpact;
    s.transitions = this.park.transitions; s.vertFaces = this.park.vertFaces; s.cones = this.park.cones; s.softBail = this.npcColliders;   // R11 (F7)
    // V5 T5-15: altura de los colliders bajo un punto (apoyo de la tabla por la cuerda nariz–cola)
    const gray = new RAPIER.Ray({ x: 0, y: 0, z: 0 }, { x: 0, y: -1, z: 0 });
    (this.visual as AnmiVisual).groundAt = (x, z, y0) => { gray.origin = { x, y: y0, z }; const h = this.world.castRay(gray, 1.6, true, RAPIER.QueryFilterFlags.EXCLUDE_SENSORS | RAPIER.QueryFilterFlags.EXCLUDE_KINEMATIC, undefined, s.collider); return h ? y0 - h.timeOfImpact : null; };
    this.updateModeChip();
    this.scene.add(this.visual.root);
    // V10.3 R1: con la valla de pie (0–19 patatas o revelación sin ver) un punto guardado dentro del centro sale al paseo interior
    { const r = Math.hypot(pos.x, pos.z); if (!(this.state.centerUnlocked && this.state.p.revealSeen) && r < VALLA_R_OUT + 0.4) {
      const k = 23.8 / Math.max(1e-3, r); pos = r > 1e-3 ? new THREE.Vector3(pos.x * k, 0, pos.z * k) : new THREE.Vector3(23.8, 0, 0); heading = Math.atan2(pos.x, pos.z);
      this.log.push('punto guardado dentro de la valla del centro recolocado en el paseo interior'); } }
    this.skater.teleport(pos, heading);
    this.rig.snapBehind(this.skater);
    this.zone = zoneAt(pos);
  }

  private setupCassettes() {
    const proxyGeo = new THREE.BoxGeometry(0.9, 0.55, 0.34); proxyGeo.translate(0, 0.27, 0);
    const proxyMat = new THREE.MeshStandardMaterial({ color: '#F18AAE', roughness: 0.5 });
    const barOn = new THREE.MeshStandardMaterial({ color: '#7dffb0', emissive: '#3dff8a', emissiveIntensity: 1.6 });
    const barOff = new THREE.MeshStandardMaterial({ color: '#3a3542', roughness: 0.7 });
    for (const c of this.park.manifest.cassettes) {
      const group = new THREE.Group();
      group.position.copy(c.pos); group.position.y += c.lift ?? 0.3; group.rotation.y = c.heading;
      let hero: THREE.Object3D | null = null;
      if (this.boomboxGltf) {
        hero = this.boomboxGltf.scene.clone(true);
        const box = new THREE.Box3().setFromObject(hero!); const s = 0.95 / Math.max(0.01, box.max.x - box.min.x);
        hero!.scale.setScalar(s); hero!.position.y = -box.min.y * s;
        hero!.traverse((o) => { if ((o as THREE.Mesh).isMesh) (o as THREE.Mesh).castShadow = false; });
        group.add(hero!);
      }
      const proxy = new THREE.Mesh(proxyGeo, proxyMat); proxy.visible = !hero; group.add(proxy);
      // V5 T5-14 (DT-06): el radiocasete es sólido (caja de su volumen visible, girada con él)
      { const hb = hero ? new THREE.Box3().setFromObject(hero) : new THREE.Box3(new THREE.Vector3(-0.45, 0, -0.17), new THREE.Vector3(0.45, 0.55, 0.17));
        const sz = hb.getSize(new THREE.Vector3()), q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), c.heading);
        const col = this.world.createCollider(RAPIER.ColliderDesc.cuboid(sz.x / 2, sz.y / 2, sz.z / 2).setTranslation(group.position.x, group.position.y + sz.y / 2, group.position.z).setRotation(q));
        this.park.nameCollider(col.handle, 'boombox'); }
      const blob = blobShadow(0.7); blob.scale.set(1, 0.6, 1); blob.position.y = 0.01; group.add(blob);
      const bars: THREE.Mesh[] = [];
      const n = c.zone === 'secretnovio' ? 1 : 4;
      for (let i = 0; i < n; i++) {
        const bm = new THREE.Mesh(new THREE.BoxGeometry(n === 1 ? 0.5 : 0.12, 0.05 + i * 0.05, 0.05), barOff);
        bm.position.set(n === 1 ? 0 : -0.22 + i * 0.15, 0.85 + (0.05 + i * 0.05) / 2, 0); bm.userData.on = barOn; bm.userData.off = barOff;
        group.add(bm); bars.push(bm);
      }
      this.scene.add(group);
      this.cassettes.push({ zone: c.zone, group, hero, proxy, bars });
    }
    this.updateMeters();
  }

  /** R11 (SIS-01): progreso llegado de otra pestaña del mismo linaje. Se aplica al mundo solo explorando (no en mitad de una actividad). */
  externalPending = false;
  private lowCeilAt: THREE.Vector3 | null = null; private openCrouchT = 0; private crouchNagT = -1e9;
  applyExternalProgress() {
    this.externalPending = false;
    for (const p of this.pickups) {
      if (!p.collected && this.state.isCollected(p.id)) { p.collected = true; this.scene.remove(p.group); continue; }
      const act = p.spawn?.kind === 'activity' ? p.spawn.availability : null;
      if (act && !p.available && this.state.p.activities[act as keyof typeof this.state.p.activities]) { p.available = true; p.group.visible = true; }
    }
    this.updateHud(); this.updateMeters(); this.updateObjective();
    if (this.state.centerUnlocked) { if (this.state.p.revealSeen) this.applyCenterState(false); else this.sim.after(0.6, () => this.beginReveal()); }
  }
  private setupFries(model: THREE.Object3D) {
    this.fryModel = model;
    for (const f of this.park.manifest.fries) {
      if (this.state.isCollected(f.id)) continue;
      const p = new FryPickup(f.id, f.pos, f.hover, model);
      const act = f.kind === 'activity' ? f.availability : null;
      p.available = !act || this.state.p.activities[act as keyof typeof this.state.p.activities];
      p.group.visible = p.available;
      p.spawn = f;
      this.pickups.push(p); this.scene.add(p.group);
    }
  }

  private yyExitHintT = -1e9; private yyHintStep = 0; private yyHintAt = 0;
  private npcFailedAt = new Map<string, number>();
  async loadNpc(id: string) {
    if (this.npcs.has(id) || this.npcLoading.has(id)) return;
    if (performance.now() - (this.npcFailedAt.get(id) ?? -1e9) < 10000) return;
    this.npcLoading.add(id);
    try {
      const gltf = await loadNpcGltf(id);
      if (this.npcs.has(id)) return; // A→B→A: una carga tardía no duplica actores
      const m = this.park.manifest;
      const list: NpcActor[] = [];
      if (id === 'bella') {
        BELLA_VARIANTS.forEach((v, i) => {
          const a = new NpcActor(gltf, { idle: 'Sway', variant: v, timeScale: 0.92 + i * 0.07, phase: i * 0.37 });
          const an = m.get(`girl.${i + 1}`); a.place(an.pos, an.heading); list.push(a);
        });
      } else {
        // Idle = bucle de respiración (Quaternius UAL, NPC-01): fase y ritmo distintos para que no vayan sincronizados
        // V4-NMG-05: La Pantera sentada en el bordillo (SitIdle/SitTalk horneados al asiento) si el derivado los trae
        // V7: Aissa y Juseph, sentados en los extremos de la limo con sus propios SitIdle/SitTalk (encajados sobre la carrocería)
        const seated = (id === 'la_pantera' || id === 'aissa' || id === 'juseph') && (gltf.animations as THREE.AnimationClip[]).some((c) => c.name === 'SitIdle');
        const onCar = seated && id !== 'la_pantera';
        const a = new NpcActor(gltf, { idle: seated ? 'SitIdle' : 'Idle', timeScale: { la_pantera: 1, aissa: 0.94, juseph: 0.88 }[id] ?? 1, phase: { la_pantera: 0, aissa: 0.41, juseph: 0.73 }[id] ?? 0 });
        a.seated = seated;
        const an = id === 'fennec' ? m.get(this.state.p.activities.skateTutorial ? 'nv.fennec.bottom' : 'nv.fennec.top') : m.get(`npc.${id}`); a.place(an.pos, an.heading); list.push(a);
        if (id === 'fennec') a.waveOpen = true;   // V10.5 (G9)
        if (id === 'rana') a.walkFix = true;   // V10.5 (G8)
        if (id === 'rana' || id === 'fennec') { const k = npcHeadScale(a); a.root.scale.setScalar(k); a.root.userData.scale = NPC_COLLIDER_K; a.lookAt = this.anmiLook(a); }   // V10.1 P21: mirada   // V8 R1 usuario: rana a la mitad; V10 IT3: por coronilla (npcHeadScale)
        if (onCar) { a.root.userData.onCar = true; a.root.children.forEach((c) => { if ((c as THREE.Mesh).isMesh && c !== a.model) c.visible = false; }); }   // sin mancha de sombra en el aire (la raíz queda bajo el asiento)
      }
      for (const a of list) {
        this.scene.add(a.root); void this.precompile(a.root);   // R11 (SIS-23): NPC cargados después, también preparados
        // sentada, el volumen sólido está delante de la raíz (rodillas y pies fuera del bordillo)
        const fwd = a.seated ? new THREE.Vector3(Math.sin(a.yaw), 0, Math.cos(a.yaw)).multiplyScalar(0.35) : new THREE.Vector3();
        // V7: sentados sobre la limo, el volumen sólido es el torso sobre el asiento (no las piernas que cuelgan fuera del coche)
        let col: RAPIER.Collider;
        if (a.root.userData.onCar) col = this.addNpcCollider(a.root.position.clone().add(new THREE.Vector3(-Math.sin(a.yaw) * 0.08, TT_KIT.npcs.seatH - 0.2, -Math.cos(a.yaw) * 0.08)));
        else if (id === 'rana' || id === 'fennec') col = this.addNpcCollider(a.root.position.clone(), a.root.userData.scale ?? 1);
        else col = this.addNpcCollider(a.root.position.clone().add(fwd));
        this.npcHomes.push({ actor: a, col, root0: a.root.position.clone() });
      }
      this.npcs.set(id, list);
    } catch (e) { console.warn('NPC no cargó', id, e); this.log.push(`npc ${id} fallo`); this.npcFailedAt.set(id, performance.now()); }
    finally { this.npcLoading.delete(id); }
  }
  /** V10 (SECRETNOVIO §5): rana y fennec ROSAS sobre sus mesas laterales de D y seis violinistas, uno por montículo. Cuelgan del grupo del
   *  reto (emergen con la revelación a 20); sus cápsulas se activan con el resto de colisiones del reto (Park.setCenter). Si un modelo no
   *  carga, ese personaje no aparece (el reto no depende de ellos). */
  snCast: NpcActor[] = [];
  async loadSnCast() {
    if (this.snCast.length || this.npcLoading.has('sn_cast')) return;
    this.npcLoading.add('sn_cast');
    const m = this.park.manifest, G = this.park.sn.group;
    // V10 IT3 (feedback: violinistas de Meshy, chico y chica, con la animación de tocar): reparto y variantes de la receta
    // assets/derived/v10/violinistas_meshy/variantes.json: GLB, escala, color de PELO (ya no hay gorra), piel, fase y velocidad
    const VARS: ['chico' | 'chica', number, string, number, number, number][] = [['chico', 0.92, '#251c18', 1.0, 0.0, 1.0], ['chica', 0.88, '#5c321b', 1.0, 0.19, 1.0], ['chico', 0.97, '#3A2418', 0.58, 0.41, 0.97],
      ['chica', 0.92, '#D9B26E', 1.12, 0.58, 0.98], ['chico', 1.0, '#6A4428', 1.12, 0.73, 1.03], ['chica', 0.95, '#18120F', 0.8, 0.88, 1.02]];
    const HAIR_LUM = { chico: 0.0138, chica: 0.053 };
    const put = (gltf: any, anchor: string, idle: string, scale = 1, phase = 0, timeScale = 1, variant?: Variant) => {
      const a = new NpcActor(gltf, { idle, phase, timeScale, variant }); const an = m.get(anchor); a.place(snL(an.pos), an.heading - SN_ROT);   /* V10.1: el grupo del reto está girado: el NPC se coloca en su marco */ let colK = scale; if (scale < 0) { scale = npcHeadScale(a); colK = NPC_COLLIDER_K; } if (!variant) a.root.scale.setScalar(scale);
      G.add(a.root); this.snCast.push(a);
      const c = this.world.createCollider(RAPIER.ColliderDesc.capsule(0.5 * colK, 0.3 * colK).setTranslation(an.pos.x, an.pos.y + 0.82 * colK, an.pos.z)); c.setEnabled(this.centerOpen);
      this.npcColliders.add(c.handle); this.park.sn.colliders.push(c); return a; };
    try {
      const [rana, fen, vChico, vChica] = await Promise.all([loadNpcGltf('rana_rosa').catch(() => null), loadNpcGltf('fennec_rosa').catch(() => null), loadNpcGltf('violinista_chico').catch(() => null), loadNpcGltf('violinista_chica').catch(() => null)]);
      if (rana) put(rana, 'sn.rana', 'Idle', -1).lookAt = null;   // IT3: escala por coronilla (npcHeadScale), como la rana de YINYANG
      if (fen) { const fa = put(fen, 'sn.fennec', 'Idle', -1); fa.lookAt = null; fa.waveOpen = true; }   // V10.5 (G9): Bellakat rosa también
      for (const a of this.snCast.slice(0, (rana ? 1 : 0) + (fen ? 1 : 0))) a.lookAt = this.anmiLook(a);   // V10.1 P21: también miran en SN
      ['M01', 'M02', 'M03', 'M04', 'M05', 'M06'].forEach((id, i) => { const [who, sc, hair, skin, ph, ts] = VARS[i], vio = who === 'chico' ? vChico : vChica; if (!vio) return;
        const hasV = (vio.animations as THREE.AnimationClip[]).some((c) => c.name === 'Violin');
        put(vio, `sn.musico.${id}`, hasV ? 'Violin' : 'Idle', sc, ph, ts, { hair, skin, iris: '', scale: sc, hairLum: HAIR_LUM[who] }); });
      this.npcs.set('sn_cast', this.snCast);
      void this.precompile(G);
    } catch (e) { console.warn('SECRETNOVIO: personajes no disponibles', e); this.log.push('sn_cast fallo'); }
    finally { this.npcLoading.delete('sn_cast'); }
  }
  /** V10.1 P21: punto que mira un NPC pequeño (cabeza de ANMI) cuando ANMI está a menos de 3,5 m y no muy por encima o por debajo. */
  private anmiLook(a: NpcActor) { const w = new THREE.Vector3(), out = new THREE.Vector3();
    return () => { const s = this.skater; if (!s) return null; a.root.getWorldPosition(w); const p = s.visualPos, d = Math.hypot(p.x - w.x, p.z - w.z);
      if (d > 3.5 || Math.abs(p.y - w.y) > 2.2) return null; return out.set(p.x, p.y + (s.isCrouched ? 1.0 : 1.52), p.z); }; }
  /** Colisión simple y estable del NPC (CTRL-05): cápsula fija en su base; la cámara la ignora. */
  private addNpcCollider(p: THREE.Vector3, k = 1) {
    const c = this.world.createCollider(RAPIER.ColliderDesc.capsule(0.5 * k, 0.3 * Math.max(k, 0.6)).setTranslation(p.x, p.y + 0.82 * k, p.z));
    this.npcColliders.add(c.handle);
    return c;
  }
  /** R11 (YY-20 = NPC-02): la cápsula de un NPC es fija en su sitio de reposo; mientras el NPC anda lejos de él (rana camino de T1, Aissa y
   *  Juseph volviendo a su asiento) se desactiva (antes ANMI chocaba con un NPC invisible en casa y atravesaba al visible) y se reactiva
   *  al volver, sin solaparse con ANMI. */
  npcHomes: { actor: NpcActor; col: RAPIER.Collider; root0: THREE.Vector3 }[] = [];
  private syncNpcColliders() {
    const s = this.skater; if (!s) return;
    for (const h of this.npcHomes) {
      const away = h.actor.root.position.distanceTo(h.root0) > 0.3;
      if (away) { if (h.col.isEnabled()) h.col.setEnabled(false); continue; }
      if (!h.col.isEnabled()) { const t = h.col.translation(); if (Math.hypot(t.x - s.footPos.x, t.z - s.footPos.z) > 0.75) h.col.setEnabled(true); }
    }
  }

  // ------------------------------------------------------------------ inicio y bucle
  /** V10.5: pantalla táctil (la misma condición que pone body.touch al empezar). */
  touchUI = matchMedia('(pointer: coarse)').matches;
  start() {
    this.started = true;
    $('hud').hidden = false; $('touch').hidden = false;
    const coarse = matchMedia('(pointer: coarse)').matches;
    if (!coarse) $('touch').classList.add('desktop'); else document.body.classList.add('touch');
    $('stick').hidden = !coarse;   // V10.4 R20: en móvil y tablet el joystick se ve siempre (en su sitio fijo)
    this.applySettings();
    this.audio.unlock();
    this.audio.music?.ensure(this.zone ?? 'no_me_guillo');
    this.updateHud();
    if (this.state.hintOnce('basic')) {
      hint(coarse ? `<b>Joystick</b>: arriba avanza/empuja, abajo frena y retrocede, a los lados gira (a pie, dando pasos) · <b>SUBIR/BAJAR</b>: tabla · <b>Mirar</b>: arrastra a la ${this.state.p.settings.leftHanded ? 'izquierda' : 'derecha'}`
        : '<b>W</b> avanza/empuja · <b>S</b> frena y retrocede · <b>A/D</b> giran (a pie, dando pasos) · <b>Q</b> subir/bajar de la tabla · <b>Espacio</b> saltar · <b>Ratón</b> mirar · <b>Esc</b> pausa', 8000);
    }
    const order = ['fennec', 'aissa', 'juseph', 'bella', 'rana'];   // V10: Fennec (NVDA) también en segundo plano   // R11 (SIS-23): la rana también en segundo plano (al cargarse al llegar a YY daba un tirón de 270–380 ms)
    let k = 0; const next = () => { if (k < order.length) this.loadNpc(order[k++]).then(() => setTimeout(next, 400)); };
    setTimeout(next, 1500);
    if (this.state.centerUnlocked && !this.state.p.revealSeen) { if (this.narr.off || this.narr.N.vistos.includes('FIN')) this.sim.after(1.0, () => this.beginReveal()); else this.narr.enqueue('FIN'); }
    // V10 (Bola de Oro §05, E-38): partida nueva en la plaza: cámara de presentación a 6° (más baja que el seguimiento normal) para leer
    // BELLAKACIONES de frente; mirar a izquierda/derecha descubre la Rana y el Fennec. El seguimiento recupera su inclinación al moverse.
    // R3 (ext-entrada): bajar solo la inclinación no reproduce el encuadre (el ojo quedaba a 1,2 m): se usa el encuadre EXACTO del dossier
    // (`entrada-v27/camaras.json` → camara-entrada, ancla `cam.entrada`) como cámara guionizada hasta que el jugador se mueve o gira la
    // cámara; entonces vuelve al seguimiento normal sin salto (H-04: no sustituye al seguimiento general)
    if (!this.state.hasSave && !this.state.p.checkpoint && this.narr.N.estado !== 'nuevo') this.entranceCam();
    this.narr.start();   // V10.4: tutorial (partida nueva), pregunta del modo ayuda (partida antigua) o nada
    this.updateObjective();
    requestAnimationFrame(this.frame);
  }

  /** V10.5 (E5-33): Modo eficiente activo (la casilla, solo en táctil). */
  efficient = false;
  applySettings() {
    const st = this.state.p.settings;
    this.efficient = !!st.eficiente && this.touchUI; this.audio.setEfficient(this.efficient);
    document.body.classList.toggle('reduced', st.reducedMotion);
    document.body.classList.toggle('zurdo', !!st.leftHanded); layoutHand();   // V10.4 R20
    this.rig.sens = st.camSens; this.rig.invertY = st.invertY;
    document.documentElement.style.setProperty('--btn-k', String(st.btnScale ?? 1)); layoutButtonScale();   // V10.1 P05
  }

  frame = (now: number) => {
    requestAnimationFrame(this.frame);
    if (!this.skater) { this.last = now; return; }
    if (devicePixelRatio !== this.lastDpr) { this.lastDpr = devicePixelRatio; this.resize(); }   // R11 (FPS-02): no siempre llega un evento
    const w0 = performance.now();
    const raw = now - this.last, dt = Math.min(0.1, raw / 1000);
    this.last = now;
    this.frameMs = this.frameMs * 0.92 + dt * 1000 * 0.08;
    // con la simulación parada (inicio, pausa) el mando se lee aquí: si no, los menús no recibían A/B/cruceta
    this.uploadPending();   // R11 (SIS-23)
    if (!this.started) { this.input.pollIdle(); return; }
    // pausa, segundo plano y preview (UI global) congelan la simulación: ni coches ni relojes de juego avanzan
    // V10.5 (O-10, E5-32): en pausa (y en segundo plano) se dibuja UNA vez: el fondo queda quieto bajo el velo
    if ((this.paused || document.hidden) && !this.autoMode) { this.input.pollIdle(); if (!this.frozenDrawn) { this.frozenDrawn = true; this.render(); } this.trackCam(now); return; }
    this.avisosPaso(dt);   // V10.6 (B5): reloj de juego (sin pausa ni pestaña oculta; los diálogos cuentan) y revisión de cada 0,5 s
    crono.paso(raw);   // V10.6.1: el cronómetro, con las mismas exclusiones pero en tiempo real
    if (this.autoMode || (this.mode === 'preview' && !this.cine?.active)) { this.input.pollIdle(); this.render(); this.trackCam(now); return; }   // V10.1: la escena final sí avanza
    // V10.5 (E5-10, T3): con el 2D abierto el mundo se para (coches, personajes, física, relojes de juego) y se deja el último dibujo bajo el velo;
    // la música sigue (y baja como con cualquier diálogo, R19); el mando y el teclado siguen avanzando la frase. Al cerrarla todo sigue donde estaba
    if (d2Open() && !this.cine?.active) {
      this.input.pollIdle(); this.updateMusic(dt);
      if (!this.frozenDrawn) { this.frozenDrawn = true; const s = this.skater!; this.audio.setRoll(0, s.grounded, this.park.surfaceAt(s.footPos), false); this.audio.setEngine(0, 0); this.render(); }
      this.trackCam(now); return;
    }
    this.frozenDrawn = false;
    this.tick(dt);
    this.trackCam(now);
    this.workMs = this.workMs * 0.9 + (performance.now() - w0) * 0.1;
    this.adaptResolution(dt);
    this.slowWatch(dt);
  };
  /** V10.5 (O-02, S-01, E5-33): sombras del Modo eficiente. Zona de 28×28 m con lejanía 60 y el borde desvanecido (la grande de siempre en la
   *  cinemática del parque, la escena final, el reto y la revelación) y el mapa recalculado cada 2 fotogramas (plan B de E5-33; la sombra de ANMI
   *  puede ir un fotograma tarde). Apagado, todo como siempre. */
  shadowPolicy: string | null = null; shadowEdge = 0;
  private shadowPolicyApply() {
    const big = !this.efficient || !!this.narr?.inCine || !!this.cine?.active || this.mode === 'final' || this.mode === 'reveal' || this.mode === 'preview';
    const want = this.efficient ? (big ? 'eficiente-grande' : 'eficiente') : null, c = this.sun.shadow.camera as THREE.OrthographicCamera, sm = this.renderer.shadowMap;
    if (want !== this.shadowPolicy) { this.shadowPolicy = want; const h = big ? 20 : 14;
      c.left = -h; c.right = h; c.top = h; c.bottom = -h; c.far = big ? 90 : 60; c.updateProjectionMatrix();
      this.shadowEdge = shadowEdge.value = big ? 0 : 0.12; sm.autoUpdate = !this.efficient; sm.needsUpdate = true; }
    if (this.efficient && this.stats.renders % 2 === 0) sm.needsUpdate = true;
  }
  /** V10.5 (E5-40, T4): 5 toques seguidos (en ~2 s) en el contador de patatas encienden o apagan el recuadro de FPS (versión corta del de ?debug=1). */
  fpsBox = false; private counterTaps: number[] = [];
  counterTap() { const now = performance.now(); this.counterTaps = this.counterTaps.filter((t) => now - t < 2000); this.counterTaps.push(now);
    if (this.counterTaps.length >= 5) { this.counterTaps = []; this.fpsBox = !this.fpsBox; const el = $('debug'); el.classList.toggle('mini', this.fpsBox); if (!this.fpsBox && !this.debug) el.hidden = true; } }
  /** V10.5 (E5-33, E5-43, T7): aviso «¿Va lento?» una vez por partida si va por debajo de ~25 FPS unos 8 s explorando (no en el tutorial, en una
   *  cinemática ni con un diálogo abierto), solo en táctil y con el modo apagado. */
  private slowAcc = 0;
  private slowWatch(dt: number) {
    if (!this.touchUI || this.efficient || this.mode !== 'explore' || this.narr?.inTutorial || this.narr?.inCine || this.narr?.busy || dialogOpen() || this.sim.now < 20) { this.slowAcc = 0; return; }
    if (this.frameMs > 40) this.slowAcc += dt; else this.slowAcc = Math.max(0, this.slowAcc - dt * 2);
    if (this.slowAcc > 8) { this.slowAcc = -1e9; if (!this.state.p.hints.includes('va-lento') && this.state.hintOnce('va-lento')) toast(TEXTOS105.vaLento, 4000); }
  }
  /** V10.6 (B5): avisos ligados al bucle: reloj, zona en la que se entra (dentro del anillo del parque), mando, orientación, sonido, Modo eficiente
   *  y sonido que no arranca. Nunca lanza (avisos.ts lo envuelve todo). */
  private avisosT = 0;
  private avisosPaso(dt: number) {
    if (this.autoMode) return;
    avisos.tick(dt); this.avisosT += dt; if (this.avisosT < 0.5) return; this.avisosT = 0;
    try {
      const esc = this.skater && this.ayuda ? this.ayuda.escenario() : 'fuera'; if (esc !== 'fuera' && esc !== 'centro' && this.narr?.N.estado !== 'nuevo') avisos.zona(esc);
      const st = this.state.p.settings;
      avisos.estado({ mando: this.input.source === 'gamepad', horizontal: this.touchUI ? orient.width > orient.height : null, sonido: !st.muted && st.volume > 0,
        eficiente: this.efficient, audioParado: !!this.audio.ctx && this.audio.ctx.state !== 'running' });
    } catch { /* */ }
  }
  /** V10.5: ya se dibujó el fotograma que queda bajo el 2D con el mundo parado (redimensionar lo borra: se vuelve a dibujar). */
  private frozenDrawn = false;
  /** V10.5 (O-11): vuelve a dibujar una vez el fondo parado (p. ej. tras encender el parque del tutorial con el 2D delante). */
  redrawFrozen() { this.frozenDrawn = false; }

  /** Un fotograma de render: pasos fijos pendientes + presentación interpolada (alpha) + dibujo. */
  tick(dt: number, interpolate = true) {
    this.acc += dt;
    let steps = 0;
    // R11 (FPS-05): 6 pasos = el tope de dt (0,1 s); con 5 se tiraba tiempo y a 10 fps el juego iba a cámara lenta (×0,83)
    // V10.5 (O-05, E5-33): en el Modo eficiente, como mucho 3 pasos por fotograma (corta la «bola de nieve»: cuanto más lento, más pasos y más
    // coste); por debajo de ~20 FPS el juego va algo a cámara lenta en vez de a tirones. Sin tope en la cinemática del parque ni en la escena final
    const cap = this.efficient && !this.narr?.inCine && !this.cine?.active ? 3 : 6;
    while (this.acc >= FIXED_DT && steps < cap) { this.fixedUpdate(FIXED_DT); this.acc -= FIXED_DT; steps++; }
    if (steps === cap) this.acc = 0; // al volver de un tirón no se recupera en un golpe varios segundos
    this.skater!.alpha = interpolate ? this.acc / FIXED_DT : 1;
    this.present(dt);
    this.render();
    return steps;
  }

  private slowT = 0; private fastT = 0;
  maxPixelRatio = Math.min(devicePixelRatio, matchMedia('(pointer: coarse)').matches ? 1.6 : 2);
  /** R11 (FPS-02): cuánto ha bajado la resolución adaptativa respecto al máximo (se conserva al cambiar de pantalla o de zoom). */
  private prDrop = 0;
  adaptResolution(dt: number) {
    if (this.paused || document.hidden) return;
    const pr = this.renderer.getPixelRatio();
    // R11 (FPS-01): un ritmo FIJO de ~30 Hz con poco trabajo es el navegador (ahorro de energía, pantalla de 30 Hz), no la GPU: no baja
    const steady30 = Math.abs(dt - 1 / 30) < 0.004 && this.workMs < 12;
    // V10.5 (O-18, E5-32): solo se baja la nitidez si el límite es la GPU (el trabajo de la CPU por fotograma es < 70 % del fotograma); si el que
    // no llega es la CPU, bajarla no gana nada y se pierde nitidez
    const gpuBound = this.workMs < 0.7 * dt * 1000;
    if (dt > 1 / 40 && !steady30) { if (gpuBound) this.slowT += dt; this.fastT = 0; } else if (dt < 1 / 55 || steady30) { this.fastT += dt; this.slowT = 0; }
    if (this.slowT > 2 && pr > 1) { this.renderer.setPixelRatio(Math.max(1, pr - 0.25)); this.slowT = 0; this.prDrop = this.maxPixelRatio - this.renderer.getPixelRatio(); this.resize(); }
    if (this.fastT > 8 && pr < this.maxPixelRatio) { this.renderer.setPixelRatio(Math.min(this.maxPixelRatio, pr + 0.25)); this.fastT = 0; this.prDrop = this.maxPixelRatio - this.renderer.getPixelRatio(); this.resize(); }
  }

  /** Pruebas aisladas: avanza `sec` segundos con pasos fijos (mismo código que el bucle real). Se declara «sim». */
  async simulate(sec: number, each?: (t: number) => void) {
    const n = Math.round(sec / FIXED_DT);
    for (let i = 0; i < n; i++) {
      each?.(i * FIXED_DT);
      if (!this.paused) { this.fixedUpdate(FIXED_DT); this.skater!.alpha = 1; this.present(FIXED_DT); }
      if (i % 60 === 59) await new Promise((r) => setTimeout(r, 0));
    }
    this.render();
  }

  /** Paso fijo de simulación: entrada → controlador → física → lógica de juego (actividades, patatas, zonas). */
  /** Reloj del destello central (V4 AUD-01): segundos de JUEGO de la sesión (solo pasos fijos; pausa, preview y segundo
   *  plano lo congelan). Global: no depende de la distancia ni se reinicia al visitar el cassette. */
  centralClock = 0;
  gesture = new GestureDrive();
  fixedUpdate(dt: number) {
    const s = this.skater; if (!s) return;
    // R11 (COD-05): los registros de diagnóstico no crecen sin fin en partidas largas
    if (this.log.length > 4000) this.log.splice(0, this.log.length - 2000);
    if (this.input.log.length > 4000) this.input.log.splice(0, this.input.log.length - 2000);
    if (this.externalPending && this.mode === 'explore') this.applyExternalProgress();   // R11 (SIS-01)
    this.syncNpcColliders();   // R11 (YY-20)
    // R11 (TAC-02): la alternancia táctil de AGACHARSE se apaga sola 2 m después de salir de un paso bajo; a pie y agachada en abierto
    // más de 3 s, un recordatorio (antes se quedaba puesta: ANMI a 1 m/s y sin manual sin saber por qué)
    if (this.input.crouchToggle && this.mode === 'explore') {
      const under = !s.headroomFree(s.footPos);
      if (under) { this.lowCeilAt = s.footPos.clone(); this.openCrouchT = 0; }
      else if (this.lowCeilAt && Math.hypot(s.footPos.x - this.lowCeilAt.x, s.footPos.z - this.lowCeilAt.z) > 2) { this.lowCeilAt = null; this.input.setCrouchToggle(false); }
      else if (!this.lowCeilAt && s.onFoot) { this.openCrouchT += dt; if (this.openCrouchT > 3 && this.clock - this.crouchNagT > 20) { this.crouchNagT = this.clock; toast('AGACHADO sigue activo: toca AGACHARSE para levantarte', 2600); } }
    } else { this.lowCeilAt = null; this.openCrouchT = 0; }
    this.stats.steps++;
    this.sim.advance(dt);
    this.centralClock += dt;
    const f = this.input.sample();
    this.frame0 = f;
    // V4: la conducción es local (frame directo al controlador); la cámara no transforma los ejes (HUM-A4-003)
    const worldInput = this.mode === 'explore' || this.mode === 'final';
    const ctx: StepCtx = { rails: this.park.rails, now: this.sim.now, noDismount: this.mode === 'final' || (this.activities[5] as SecretJump)?.inAttempt };
    let fs = f;
    // R8: modo ratón con cámara de seguimiento: la marcha va respecto a la vista (rumbo objetivo de la cámara, no el suavizado)
    if (this.input.mouseLook && this.rig.mode === 'follow' && !this.rig.isRecentering) fs = { ...fs, aim: this.rig.yaw };   // R11 (YY-19): sin girar la tabla hacia la vista mientras se recoloca
    // V5 T5-17: variante C′ a pie (solo con ?bkctl=gesto; sin el parámetro devuelve el frame tal cual)
    if (GESTURE_ON) fs = this.gesture.apply(fs, this.input, s, this.rig.forward, this.rig.recenterCount);
    for (const a of this.activities) if (a.preStep?.(f)) fs = { ...fs, jumpPressed: false };
    // coches: un dueño de movimiento, avanzan en el paso fijo ANTES del controlador (sus cuerpos cinemáticos se aplican
    // en este world.step); nunca ceden ni se paran por ANMI ni por el final (HUM-A4-009)
    this.cars.step(dt);
    const prevFoot = s.footPos.clone();
    s.step(dt, worldInput ? fs : EMPTY_FRAME, ctx);
    this.world.step();
    s.postStep();
    this.carContact(prevFoot);
    this.npcTopContact();
    this.gameplay(dt, f);
    this.narr.update(dt); this.ayuda.update(dt);   // V10.4
  }

  /** Contacto coche–ANMI tras el paso (poses actuales de ambos, barrido desde las anteriores). Impacto si la velocidad
   *  normal relativa supera el umbral; si no (roce lento o protección de levantarse), separación física sin impacto. */
  carHits = 0; carSeparations = 0;
  private carContact(prevFoot: THREE.Vector3) {
    const s = this.skater!;
    if (!this.cars.active) return;
    const c = this.cars.contact(s.footPos, prevFoot, TUNING.radius, s.capsuleHeight);
    if (!c) return;
    const rel = s.vel.clone().setY(0).sub(c.carVel);           // velocidad del jugador respecto al coche
    const hit = s.loco !== 'impact' && s.hitByMover('coche', rel, c.n, c.carVel);
    if (hit) { this.carHits++; this.log.push(`coche golpea a ANMI (car ${c.car}, cierre ${(-(rel.x * c.n.x + rel.z * c.n.z)).toFixed(2)} m/s)`); return; }
    // sin impacto: sacar la cápsula fuera de la caja del coche (nunca se queda dentro de un collider)
    this.carSeparations++;
    s.nudge(s.footPos.clone().addScaledVector(c.n, c.depth + 0.03));
    const into = s.vel.x * c.n.x + s.vel.z * c.n.z; if (into < 0) s.vel.addScaledVector(c.n, -into);
  }

  /** R11 (YY-09): encima de la cápsula de un NPC (saltando a su lado se quedaba de pie sobre la rana): se la saca en horizontal,
   *  como la separación de los coches. A ras de suelo (andando contra él) no actúa: ahí lo resuelve el KCC. */
  npcTopPushes = 0;
  private npcTopContact() {
    const s = this.skater!; if (s.loco === 'grind') return;
    const f = s.footPos;
    for (const h of this.npcHomes) {
      const c = h.col; if (!c.isEnabled()) continue;
      const t = c.translation(), hh = c.halfHeight(), r = c.radius(), base = t.y - hh - r;
      if (f.y < base + 0.35 || f.y > t.y + hh + r + 0.2) continue;
      const dx = f.x - t.x, dz = f.z - t.z, d = Math.hypot(dx, dz);
      if (d >= r + TUNING.radius + TUNING.kccOffset + 0.03) continue;   // el KCC la mantiene a su separación (0,03) del costado
      const ux = d > 1e-3 ? dx / d : Math.sin(s.heading), uz = d > 1e-3 ? dz / d : Math.cos(s.heading), lim = r + TUNING.radius + TUNING.kccOffset + 0.06;
      s.nudge(new THREE.Vector3(t.x + ux * lim, f.y, t.z + uz * lim)); this.npcTopPushes++;
      if (this.npcTopPushes % 30 === 1) this.log.push(`ANMI fuera de encima del NPC (${t.x.toFixed(1)}, ${t.z.toFixed(1)})`);
    }
  }

  /** Al pasar a levantarse tras un impacto sobre la pista de coches, ANMI se levanta fuera de la banda r 15–20 (los
   *  coches no paran): punto radial más cercano libre, apoyado y con espacio. */
  private recoverOffTrack() {
    const s = this.skater!;
    if (!this.cars.active) return;
    const p = s.footPos, r = Math.hypot(p.x, p.z);
    if (Math.abs(r - CARS.R) > 3.3) return;
    const dirOut = r > 1e-3 ? new THREE.Vector3(p.x / r, 0, p.z / r) : new THREE.Vector3(1, 0, 0);
    const cands = [CARS.R + 3.7, CARS.R - 3.7, CARS.R + 4.6, CARS.R - 4.6].sort((a, b) => Math.abs(a - r) - Math.abs(b - r));
    for (const rr of cands) {
      const q = dirOut.clone().multiplyScalar(rr);
      const ray = new RAPIER.Ray({ x: q.x, y: p.y + 2.5, z: q.z }, { x: 0, y: -1, z: 0 });
      const hit = this.world.castRay(ray, 6, true, RAPIER.QueryFilterFlags.EXCLUDE_SENSORS, undefined, s.collider);
      if (!hit) continue;
      q.y = p.y + 2.5 - hit.timeOfImpact;
      if (q.y > 0.4 || !s.headroomFree(q)) continue;              // solo suelo plano del centro, no encima de la superrampa
      s.nudge(q); this.log.push(`levantarse fuera de la pista: r ${r.toFixed(1)} → ${rr.toFixed(1)}`);
      return;
    }
  }

  /** Lógica de juego en tiempo de simulación. */
  private gameplay(dt: number, f: InputFrame) {
    const s = this.skater!;
    for (const p of this.pickups) {
      if (!p.available || p.collected || !p.spawn) continue;
      const sp = p.spawn;
      const dx = s.footPos.x - sp.pos.x, dz = s.footPos.z - sp.pos.z, dy = s.footPos.y - sp.pos.y;
      const yOk = sp.reach ? s.footPos.y >= sp.reach[0] && s.footPos.y <= sp.reach[1] : dy > -0.55 && dy < sp.trigger.y + 0.4;   // V6: alcance absoluto (FG)
      // R11 (NMG-07): el premio que acaba de aparecer no se recoge solo durante 0,8 s (aparecía bajo ANMI y se recogía sin verse)
      if (this.clock < (this.pickArm.get(p.id) ?? -1)) continue;
      // V10.5 (AM-26, E5-27): en táctil la caja de recogida crece 0,15 m en horizontal (x/z; la altura no cambia). Medido: ninguna se coge a través de un sólido
      const e = this.touchUI ? 0.15 : 0;
      if (Math.abs(dx) < sp.trigger.x + e && Math.abs(dz) < sp.trigger.z + e && yOk && !s.frozen && this.mode === 'explore' && s.loco !== 'bail' && s.loco !== 'impact') this.collect(p);
    }
    this.updateZone();
    for (const a of this.activities) a.update(dt);
    if (this.mode === 'explore' && f.interactPressed) triggerAction();
    if (this.revealT >= 0) this.stepReveal(dt);
    this.hintT -= dt;
    if (this.hintT <= 0 && this.mode === 'explore') {
      this.hintT = 0.5;
      const touch = matchMedia('(pointer: coarse)').matches;
      for (const p of this.pickups) {
        const sp = p.spawn; if (!sp || p.collected || !p.available) continue;
        if ((sp.access === 'ollie' || sp.access === 'crouch') && Math.hypot(sp.pos.x - s.footPos.x, sp.pos.z - s.footPos.z) < 5.5) {
          // V5 T5-30 (N5-05, D5): si la altura se alcanza a pie con el salto doble (≤ footReach, medido en T5-08), la pista no impone
          // el skate; si no, se mantiene el ollie patinando
          if (sp.access === 'ollie' && sp.pos.y <= TUNING.footReach && this.state.hintOnce('ollie-pie')) hint(`Patata en alto: <b>salta</b>${this.input.source === 'gamepad' ? ' (A)' : touch ? '' : ' (Espacio)'} o haz un ollie patinando`, 4200);
          if (sp.access === 'ollie' && sp.pos.y > TUNING.footReach && this.state.hintOnce('ollie')) hint(`Patata en alto: coge carrerilla <b>patinando</b> y pulsa <b>SALTO</b>${this.input.source === 'gamepad' ? ' (A)' : touch ? '' : ' (Espacio)'} antes del borde`, 4200);
          if (sp.access === 'crouch' && this.state.hintOnce('crouch')) hint(`Paso bajo: <b>AGACHARSE</b>${this.input.source === 'gamepad' ? ' (mantén B)' : touch ? ' (se queda activo)' : ' (mantén C)'} y pasa por debajo`, 4200);
        }
      }
      const rr = Math.hypot(s.footPos.x, s.footPos.z);
      // V10.3 R1 (W-D33, R3-04): el aviso de «señal rota» salta al acercarse a la valla (el radiocasete se ve detrás de la malla)
      if (!this.state.centerUnlocked && this.park.vallaUp && rr < WORLD.rCenter + 2 && this.clock - this.fenceT > 20) { this.fenceT = this.clock; toast(`La señal de SECRETNOVIO está rota… con las 20 patatas llega su desafío (${this.state.total}/${TOTAL_FRIES})`, 3000); }
    }
    if (s.footPos.y < -4 || Math.abs(s.footPos.x) > WORLD.half + 2 || Math.abs(s.footPos.z) > WORLD.half + 2) this.recover();
    this.safeT += dt;
    // V6: sin checkpoint trepando (V10.3: el túnel de FASHION GIRL ya no existe)
    if (this.safeT > 1.5 && this.mode === 'explore' && s.grounded && !s.frozen && !s.isCrouched && s.loco !== 'bail' && s.groundNormal.y > 0.94) { this.safeT = 0; this.setSafe(false); }
    // V7: junto al agujero de TRA TRA TRA, a pie y sobre la trasera: pista de saltarlo (una vez)
    { const hb = this.park.boxes.get('tt.h'); if (hb && s.onFoot && s.grounded && Math.abs(s.footPos.y - TT.rearH) < 0.3 && Math.hypot(s.footPos.x - hb.c.x, s.footPos.z - hb.c.z) < 2.6 && this.state.hintOnce('tt-hole')) hint(`Agujero: <b>salta</b>${this.input.source === 'gamepad' ? ' (A)' : matchMedia('(pointer: coarse)').matches ? '' : ' (Espacio)'} para cruzarlo… o déjate caer a la plaza`, 4200); }
    // V8 R2: dentro del vaso, en tabla, una pista (una vez por perfil) de la mecánica de pared y de la salida por la escalera
    // V10.5 (AM-35, E5-21): en dos avisos seguidos (antes, 6 líneas de golpe) y nunca a la vez que el aviso de patata (se espera a que se vaya)
    if (this.zone === 'yinyang' && s.riding && s.grounded && s.footPos.y < -0.6 && s.pool?.inPool && this.clock - this.yyExitHintT > 30 && this.yyHintStep === 0 && this.state.hintOnce('yy-pared')) { this.yyExitHintT = this.clock; this.yyHintStep = 1; }
    if (this.yyHintStep > 0 && this.clock >= this.yyHintAt && $('toast').hidden) {
      const T = TEXTOS105[this.yyHintStep === 1 ? 'yy1' : 'yy2'], src = this.input.source === 'gamepad' ? 'mando' : this.input.source === 'touch' ? 'tactil' : 'teclado';
      hint(T[src], 4600); this.yyHintAt = this.clock + 5.2; this.yyHintStep = this.yyHintStep === 1 ? 2 : 0;
    }
    // V10.1 P03: una vez, junto a un raíl del exterior en tabla: el grind es automático
    if (s.riding && s.grounded && this.park.rails.some((r) => { const ab = r.b.clone().sub(r.a); ab.y = 0; const L = ab.length(); ab.divideScalar(L); const ap = s.footPos.clone().sub(r.a); ap.y = 0; const t = ap.dot(ab); return t > 0 && t < L && Math.abs(ap.x * ab.z - ap.z * ab.x) < 2.5; }) && this.state.hintOnce('grind-auto')) hint('Raíl: salta y <b>cae encima</b> alineada con él para hacer grind (sales con otro salto)', 4200);
  }

  /** Presentación (cada fotograma de render): ANMI, cámara, NPCs, música, efectos. Congelada durante la pausa. */
  present(dt: number) {
    const s = this.skater!;
    this.visual.update(dt, s);
    { const tb = this.park.boxes.get('nv.t1'); /* V10: paso agachado T1 de NVDA (techo bajo: cámara de túnel) */ if (tb) { const p = s.footPos, dx = p.x - tb.c.x, dz = p.z - tb.c.z, c = Math.cos(-tb.yaw), sn = Math.sin(-tb.yaw);
        this.rig.inTunnel = Math.abs(dx * c + dz * sn) < tb.h.x + 0.3 && Math.abs(-dx * sn + dz * c) < tb.h.z + 0.6 && p.y < tb.c.y + 2 * tb.h.y + 0.5; } }   // R11 (NMG-03)
    // R5 (fg-cams): termina al moverse, girar la cámara, cambiar de modo o alejarse ANMI de la salida; solo devuelve al seguimiento si la
    // cámara sigue siendo la de presentación (una actividad puede haber puesto ya la suya, p. ej. el baile de FG)
    if (this.introCam && (Math.hypot(s.vel.x, s.vel.z) > 0.15 || this.input.lastCamInput !== this.introCam.mark || this.mode !== 'explore' || s.footPos.distanceTo(this.introCam.at) > 0.5)) {
      const mine = this.rig.mode === 'scripted' && this.rig.scripted === this.introCam.get, jump = s.footPos.distanceTo(this.introCam.at) > 2; this.introCam = null; if (mine) this.rig.toFollow(s, jump); }   /* sin transición solo si ANMI aparece lejos (colocada) */
    this.cine?.update(dt); this.skyLogo?.update(dt, this.rig.cam);   // V10.1 escena final (la cinemática pone su cámara antes del rig)
    this.rig.update(dt, s, this.mode === 'explore' || this.mode === 'final' ? this.input : null);
    camSeg.a.value.copy(this.rig.cam.position); camSeg.b.value.copy(s.visualPos).y += s.isCrouched ? 1.0 : 1.45;   // R11 (CAM-02)
    // V5 T5-23: en una actividad con diálogo abierto, encuadre en la región que el diálogo deja libre (coordenadas lógicas)
    { const dl = document.getElementById('dialog'); let top = 0, bottom = 0;
      if (this.mode === 'activity' && dl && !dl.hidden && dl.offsetHeight > 0) { const H = orient.height, y0 = dl.offsetTop, y1 = y0 + dl.offsetHeight;
        if (y0 + y1 > H) bottom = H - y0 + 8; else top = y1 + 8; }
      // V6: baile de FG: el encuadre va a la franja que dejan la cabecera (timer/secuencia/mensaje) y la botonera ancha de abajo
      const dn = document.getElementById('dance');
      if (this.mode === 'activity' && dn && !dn.hidden) { const H = orient.height, msg = document.getElementById('dance-msg')!, pad = document.getElementById('dance-pad')!;
        top = msg.offsetTop + msg.offsetHeight + 6; bottom = pad.offsetWidth > orient.width * 0.5 ? H - pad.offsetTop + 6 : 0; }
      this.rig.setFrameInset(top, bottom); this.rig.stepInset(dt); }
    this.park.updateAreas(s.footPos);   // V5 T5-23: recuadros de actividad por proximidad
    // V6: luz del fondo del túnel FG encendida solo cerca (intensidad 0 lejos: la luz existe siempre, sin recompilar shaders)
    this.input.showCrouch(s.isCrouched, s.wantsCrouch);
    if (this.input.source !== this.lastSource) { this.lastSource = this.input.source; this.updateModeChip(); document.body.classList.toggle('pad', this.input.source === 'gamepad'); this.narr?.onSource(); }   // R11 (PADX-05) · V10.1 P10: teclas del mando en los botones
    this.audio.setRoll(s.riding && s.loco !== 'grind' ? (s.wallRiding ? s.pool!.speedOnWall : s.speed) : 0, s.grounded, this.park.surfaceAt(s.footPos), s.braking);   // V8 R10: en la pared, la velocidad por la superficie
    if (!this.audio.previewMode) this.audio.setGrind(s.loco === 'grind');   // R11 (MEZ-06): ligado al estado (una caída o recolocación en pleno grind lo dejaba sonando)
    this.sun.target.position.copy(s.visualPos);
    this.sun.position.copy(s.visualPos).addScaledVector(this.sunDir, 46);
    const camP = this.rig.cam.position;
    for (const p of this.pickups) {
      if (!p.available || p.collected) continue;
      const far = p.base.distanceToSquared(camP) > 48 * 48;
      p.group.visible = !far;
      if (!far) p.update(dt);
    }
    this.bursts.update(dt);
    this.sprayFx.update(dt, (this.visual as any)?.sprayNozzle ?? null, this.state.p.settings.reducedMotion);   // V10.2 Q13
    // V10.1 P17: marcas de ruedas solo rodando en tabla apoyada a > 1 m/s (ni grind, ni pared del vaso, ni en el reto de SN guionizado)
    this.skid.update(this.clock, s.riding && s.grounded && s.loco !== 'grind' && !s.wallRiding && !s.frozen && Math.abs(s.speed) > 1 && this.mode !== 'final', s.visualPos, s.headingVis, s.groundNormal);
    this.updateMusic(dt);
    // R11 (ANIM-01): entre 45 y 70 m se ven, así que también se animan (cada ~0,1 s con el tiempo acumulado; antes, congelados)
    // V10.5 (O-06, E5-33): en el Modo eficiente, ritmo completo hasta 22 m y en cuadro; más lejos, 12 Hz; fuera de cuadro, 5 Hz; al entrar en
    // cuadro se ponen al día en el mismo fotograma. Siempre a ritmo completo en actividades, bailes, charlas, cinemáticas y escena final
    const T = this.stats.npcTiers; T.full = T.mid = T.low = T.off = 0;
    const lod = this.efficient && this.mode === 'explore' && !this.cine?.active && !this.narr?.inCine && !dialogOpen() && !this.activities.some((a: any) => a.busy || a.inAttempt || a.dancing >= 0 || a.fgDancing);
    if (lod) { this.rig.cam.updateMatrixWorld(); this.npcFrustum.setFromProjectionMatrix(this.npcMat.multiplyMatrices(this.rig.cam.projectionMatrix, this.rig.cam.matrixWorldInverse)); }
    for (const list of this.npcs.values()) for (const n of list) { const d = n.root.getWorldPosition(npcW).distanceTo(camP); n.root.visible = d < 70;   // V10: posición en el MUNDO (el reparto de SECRETNOVIO cuelga de su grupo)
      if (d >= 70) { T.off++; continue; }
      if (lod) { this.npcSph.center.copy(npcW).y += 0.9; this.npcSph.radius = 1.6; const seen = this.npcFrustum.intersectsSphere(this.npcSph), was = this.npcSeen.get(n) ?? true; this.npcSeen.set(n, seen);
        const every = !seen ? 0.2 : d < 22 ? 0 : 1 / 12; if (every === 0) T.full++; else if (seen) T.mid++; else T.low++;
        const a = (this.npcLod.get(n) ?? 0) + dt; if (a >= every || (seen && !was)) { n.update(a); this.npcLod.delete(n); } else this.npcLod.set(n, a); continue; }
      if (d < 45) { T.full++; n.update(dt + (this.npcLod.get(n) ?? 0)); this.npcLod.delete(n); }
      else { T.mid++; const a = (this.npcLod.get(n) ?? 0) + dt; if (a >= 0.1) { n.update(a); this.npcLod.delete(n); } else this.npcLod.set(n, a); } }
    this.syncNpcColliders();   // R11 (YY-20): también tras animarlos (la rana se mueve aquí; sin esto, un paso de desfase al salir de casa)
    if (this.mode !== 'preview') for (const [id, axis] of [['aissa', SECTOR_BY_ID.tratratra.axis], ['juseph', SECTOR_BY_ID.tratratra.axis], ['bella', SECTOR_BY_ID.fashion_girl.axis], ['rana', SECTOR_BY_ID.yinyang.axis], ['fennec', SECTOR_BY_ID.nosvamosdeaqui.axis]] as const) {   // V8: la rana de YINYANG · V10: ejes del sector (giro de corona)
      if (!this.npcs.has(id) && Math.abs(angleDelta(toPolar(s.footPos).th, axis)) < 60) this.loadNpc(id);
    }
    if (!this.snCast.length && (this.centerOpen || Math.hypot(s.footPos.x, s.footPos.z) < 34)) void this.loadSnCast();   // V10: reparto del centro al acercarse o al abrirse
    for (const c of this.cassettes) {
      const d = c.group.position.distanceTo(camP);
      if (c.hero) { c.hero.visible = d < 38; c.proxy.visible = d >= 38 && d < 90; }
      c.group.visible = d < 90;
    }
    for (const a of this.activities) a.present?.(dt);
    this.rewardPresent(dt);   // V10.1 P07
    this.cars.present(dt, s.alpha, this.rig.cam.position);
    if (this.cars.active) {
      const dCar = Math.min(...this.cars.cars.map((c) => c.g.position.distanceTo(s.footPos)));
      this.audio.setEngine(this.mode === 'preview' ? 0 : THREE.MathUtils.clamp(1 - (dCar - 6) / 30, 0, 1), this.cars.avgSpeed / 8.7);
    }
    this.signT -= dt;
    if (this.debug || this.fpsBox) this.updateDebug();
  }

  /** Guarda el último punto seguro (llamado también por actividades al alcanzar un descanso). */
  setSafe(now = true) {
    const s = this.skater!;
    // V5 T5-10: nunca se guarda un punto en la banda de coches activa ni a mitad de impacto/caída
    if (s.loco === 'impact' || s.loco === 'bail') return;
    if (now) { if (s.safeOk && !s.safeOk(s.footPos)) return; if (!s.standArea(s.footPos)) return; /* R11 (MOV-11) */ s.lastSafe.copy(s.footPos); s.lastSafeHeading = s.heading; }
    const p = s.lastSafe;
    if (s.safeOk && !s.safeOk(p)) return;
    this.state.setCheckpoint({ x: p.x, y: p.y, z: p.z, heading: s.lastSafeHeading });
  }
  recover() {
    if (this.mode !== 'explore' && this.mode !== 'final') return;
    const s = this.skater!; s.respawns++;
    { const ft = this.activities.find((a) => a.id === 'secretJump') as any; if (ft?.inAttempt) ft.cancel?.(); }   // R11 (EVT-01)
    this.log.push(`recover ${s.footPos.x.toFixed(1)},${s.footPos.y.toFixed(1)},${s.footPos.z.toFixed(1)}`);
    s.teleport(s.lastSafe.clone(), s.lastSafeHeading);
    this.rig.snapBehind(s);
    toast('Vuelta al último punto seguro. Tus patatas siguen contigo.', 2400);
  }

  private zoneT = 0;
  updateZone() {
    const p = this.skater!.footPos;
    const { r, th } = toPolar(p);
    // R11 (CEN-02): el ancla del reintento (r 22,3) y la carrerilla son del centro aunque pasen el radio del disco
    const corridor = false;   // V10: el reto de SECRETNOVIO está dentro del disco (r < 16): sin corredor que salga del centro
    let z: ZoneId | null = r < WORLD.rCenter - 0.5 || corridor ? null : this.zone;
    if (r >= WORLD.rCenter - 0.5 && !corridor) {
      const cur = this.zone ? SECTOR_BY_ID[this.zone] : null;
      const dcur = cur ? Math.abs(angleDelta(th, cur.axis)) : 999;
      if (dcur > 38 || !cur) z = zoneAt(p);
    }
    if (z !== this.zone) { this.zone = z; this.zoneIdleT = 0; this.zoneIdleShown = false; this.updateHud(); this.updateObjective(); }
    if (this.mode === 'explore' && this.zone) { this.zoneIdleT += FIXED_DT; if (this.zoneIdleT >= 45 && !this.zoneIdleShown) { this.zoneIdleShown = true; this.updateObjective(); } }   // R11 (GUIA-01)
  }
  updateHud(bump = false) {
    const z = this.zone;
    if (z) { const s = SECTOR_BY_ID[z]; setHud(s.name, `♪ ${s.song}`, this.state.zoneCount(z), this.state.total, bump); }
    else setHud('SECRETNOVIO', this.state.previewUnlocked ? '♪ SECRETNOVIO' : '♪ señal rota…', 0, this.state.total, bump);
    $('local').hidden = !z;
  }
  /** Guía (UX-04): siguiente objetivo legible sin flechas a través de paredes. */
  updateObjective() {
    const st = this.state;
    if (st.centerUnlocked) { setObjective(st.p.finalDone ? 'Bellakaciones · disponible el 30/10 · repite el salto cuando quieras' : 'SECRETNOVIO: sube por la escalera del muro y haz el SALTO'); return; }
    const z = this.zone;
    if (z) {
      const sec = SECTOR_BY_ID[z];
      // V10.4 (dossier 04 §8): con la actividad bloqueada (faltan patatas de exploración) el objetivo pide las 3 patatas, no la actividad
      if (!st.p.activities[sec.activity] && this.narr && !this.narr.activityOpen(z)) { setObjective(TEXTOS.objetivoBloqueo.replace('{zona}', sec.name).replace('{n}', String(st.zoneCount(z)))); return; }
      if (!st.p.activities[sec.activity]) {
        // V7: TRA TRA TRA dice a quién falta escuchar
        const bh = st.p.partials.bridgeHeard, lab = z === 'tratratra' && (bh.aissa || bh.juseph) ? `Falta hablar con ${bh.aissa ? 'Juseph' : 'Aissa'}` : sec.activityLabel;
        setObjective(`${lab} · ${st.zoneCount(z)}/4 aquí`); return;
      }
      if (st.rewardPending(sec.activity) && z === 'tratratra') { setObjective(`Sube al techo de la limo y coge la patata · ${st.zoneCount(z)}/4`); return; }
      // R11 (GUIA-06): el premio pendiente se dice en todas las zonas, con su sitio (antes solo en TRA TRA TRA)
      if (st.rewardPending(sec.activity)) { const at = ({ no_me_guillo: 'frente a La Pantera', nosvamosdeaqui: 'al final del rail, junto a Bellakat', yinyang: 'junto al muro pintado', fashion_girl: 'junto a la rampa lateral de la pista' } as Record<string, string>)[z];
        if (at) { setObjective(`Tu premio te espera ${at} · ${st.zoneCount(z)}/4`); return; } }
      if (st.zoneCount(z) < 4) {
        // R11 (GUIA-01): tras 45 s en la zona sin recoger nada, el objetivo dice dónde está la que falta (la más cercana) y qué hacer
        const f = this.zoneIdleT >= 45 ? this.missingFry(z) : null;
        setObjective(f ? `Falta: ${f} · ${st.zoneCount(z)}/4` : `Busca las patatas de ${sec.name} · ${st.zoneCount(z)}/4`); return;
      }
      const next = this.nextZone();
      setObjective(next ? `Siguiente: ${next}` : 'Vuelve al centro');
    } else { const next = this.nextZone(); setObjective(next ? `Siguiente: ${next} · ${st.total}/20` : `${st.total}/20 patatas · con las 20 despierta SECRETNOVIO`); }   // R11 (GUIA-05)
  }
  /** R11 (SIS-24, GUIA-05): zona incompleta más cercana por ángulo desde donde está ANMI, con el sentido real de la vuelta (antes, siempre
   *  la siguiente en sentido antihorario: a veces cuatro sectores en vez de uno). */
  private nextZone() {
    const s = this.skater; if (!s) return null;
    const th = toPolar(s.footPos).th;
    const cand = SECTORS.filter((x) => x.id !== this.zone && this.state.zoneCount(x.id) < 4).map((x) => ({ x, d: angleDelta(x.axis, th) })).sort((a, b) => Math.abs(a.d) - Math.abs(b.d))[0];
    if (!cand) return null;
    return `${cand.x.name} (${Math.abs(cand.d) < 12 ? 'por aquí' : cand.d < 0 ? 'sentido antihorario' : 'sentido horario'})`;
  }
  /** R11 (GUIA-01): pista corta de la patata pendiente más cercana de la zona (las de actividad, solo con la actividad hecha). */
  private missingFry(z: ZoneId) {
    const s = this.skater; if (!s) return null;
    const st = this.state;
    const left = this.park.manifest.fries.filter((f) => f.zone === z && !st.isCollected(f.id) && (f.kind !== 'activity' || st.p.activities[SECTOR_BY_ID[z].activity]))
      .sort((a, b) => a.pos.distanceTo(s.footPos) - b.pos.distanceTo(s.footPos))[0];
    if (!left) return null;
    const g = FRY_GUIDE[left.id]; if (g) return g;   // R13: texto para el jugador (la pista del manifiesto es una nota de diseño)
    const place = left.hint.split(':')[0].replace(/\s*\([^)]*\)/g, '').trim();
    const verb = ({ ollie: 'salta para cogerla', crouch: 'agáchate', camera: 'mira bien desde arriba', ramp: 'coge carrerilla' } as Record<string, string>)[left.access];
    const txt = verb && !new RegExp(verb.split(' ')[0], 'i').test(place) ? `${place} (${verb})` : place;
    return txt.length > 78 ? txt.slice(0, 76) + '…' : txt;
  }
  /** R11 (GUIA-01): segundos en la zona actual sin recoger ninguna patata. */
  zoneIdleT = 0; private zoneIdleShown = false;
  private chipMode: boolean | null = null; private chipFullUntil = 0; private chipTimer = 0;
  /** Chip de modo y botón TABLA (V4): estado real a pie / en tabla y la acción que hará la próxima pulsación. */
  updateModeChip() {
    const s = this.skater; const el = $('mode-chip'); if (!s) return;
    const touch = matchMedia('(pointer: coarse)').matches, pad = this.input.source === 'gamepad';
    const walking = s.onFoot || s.loco === 'dismount' || s.loco === 'bail' || s.loco === 'impact';
    const key = pad ? 'LB' : touch ? (walking ? 'SUBIR' : 'BAJAR') : 'Q';   // IT3 (QA-8): en táctil, el nombre real del botón · V10.5 (AM-23): con mando (también en tablet), LB
    // V5 T5-23 (OPUS-011): el chip completo se ve 2,5 s tras cada cambio de modo y después queda como icono en la esquina
    // superior (dentro de la safe-area), nunca sobre el cuerpo
    const full = walking ? `A pie · ${key} para subir a la tabla` : `En tabla · ${key} para bajar`;
    if (this.chipMode !== walking) { this.chipMode = walking; this.chipFullUntil = performance.now() + 2500; }
    const mini = performance.now() > this.chipFullUntil;
    el.textContent = mini ? (walking ? '🚶' : '🛹') : full; el.classList.toggle('mini', mini); el.title = full;
    // V5 T5-09 (OPUS-009): durante el impacto (hasta terminar de levantarse) el chip no aparece sobre el cuerpo
    el.hidden = s.loco === 'impact';
    clearTimeout(this.chipTimer); if (!mini) this.chipTimer = window.setTimeout(() => this.updateModeChip(), this.chipFullUntil - performance.now() + 30);
    const b = document.getElementById('btn-board');
    if (b) { b.textContent = walking ? 'SUBIR' : 'BAJAR'; b.setAttribute('aria-label', walking ? 'Subir a la tabla' : 'Bajar de la tabla'); }
  }

  // ------------------------------------------------------------------ música por sector
  musicDebug: Record<string, number> = {};
  /** V10.1 P24: factor de la música fuera del parque (1 dentro, 0 desde r 45) y aviso de la salida en curso. */
  musicOutside = 1; outsideWarned = false;
  panteraGain = 0; panteraFar = 0; private panteraSent = 1;
  private updateMusic(dt: number) {
    const mu = this.audio.music; if (!mu) return;
    const p = this.narr?.musicProbe ?? this.skater!.visualPos;   // V10.4: en la cinemática del parque suena por donde pasa la cámara
    const { r, th } = toPolar(p);
    if (this.started && this.outsideWarned === false && r > WORLD.rOuter + 1.5 && this.clock < 0.5) this.outsideWarned = true;   // V10.1 P24: la partida nueva empieza fuera: el aviso solo al SALIR
    const w: Record<string, number> = {};
    // V10.3 R1 (W-D06, R3-05): con la valla de pie el paseo interior (r 22–25) se reparte por mitades: pegada a la valla (r 22–23,5) suena
    // SN y en la mitad exterior (23,5–25) la zona, con un fundido estrecho de 1 m centrado en 23,5; sin valla, el reparto de siempre.
    // Al hundirse la valla se pasa de uno a otro en ~2 s (sin salto en la revelación)
    this.vallaMusicK = THREE.MathUtils.clamp(this.vallaMusicK + (this.park.vallaUp ? dt : -dt) / 2, 0, 1);
    const wc = THREE.MathUtils.lerp(1 - THREE.MathUtils.smoothstep(r, WORLD.rCenter - 3, WORLD.rCenter + 4), 1 - THREE.MathUtils.smoothstep(r, 23.0, 24.0), this.vallaMusicK);
    let sum = 0;
    for (const s of SECTORS) { const d = Math.abs(angleDelta(th, s.axis)); const v = 1 - THREE.MathUtils.smoothstep(d, 31, 41); w[s.id] = v; sum += v; }
    for (const s of SECTORS) w[s.id] = sum > 0 ? w[s.id] / sum * (1 - wc) : 0;
    w.secretnovio = wc;
    // V10.5 (usuario: «que al cambiar de zona la música baje casi a cero y vuelva a subir, no por proximidad o coordenadas, simplemente al
    // entrar a la zona, a la velocidad que vayas da igual»): suena UNA canción, la de la zona en la que estás; al entrar claramente en otra
    // (su peso ≥ 0,75: margen para no parpadear en la frontera) la actual baja casi a cero en 0,5 s, cambia a la nueva y sube en 1,1 s. Por
    // tiempo, no por distancia. Si se vuelve atrás mientras baja, sube otra vez la misma
    mu.prefetch(Object.keys(w).filter((k) => w[k] > 0.02));   // la canción de al lado, descargada antes de cambiar
    { let cand = 'secretnovio', mx = -1; for (const k in w) if (w[k] > mx) { mx = w[k]; cand = k; }
      if (!this.zonaMus) this.zonaMus = cand;
      if (cand !== this.zonaMus && w[cand] >= 0.75 && this.zonaFase !== 'baja') { this.zonaSig = cand; this.zonaFase = 'baja'; }
      else if (this.zonaFase === 'baja' && cand === this.zonaMus && w[cand] >= 0.75) { this.zonaSig = null; this.zonaFase = 'sube'; }
      if (this.zonaFase === 'baja') { this.zonaDip = Math.max(ZONA_DIP_MIN, this.zonaDip - dt / ZONA_BAJA); if (this.zonaDip <= ZONA_DIP_MIN + 1e-4) { if (this.zonaSig) this.zonaMus = this.zonaSig; this.zonaSig = null; this.zonaFase = 'sube'; } }
      else if (this.zonaFase === 'sube') { this.zonaDip = Math.min(1, this.zonaDip + dt / ZONA_SUBE); if (this.zonaDip >= 1) this.zonaFase = null; }
      for (const k in w) w[k] = k === this.zonaMus ? 1 : 0;
      const e = THREE.MathUtils.clamp((this.zonaDip - ZONA_DIP_MIN) / (1 - ZONA_DIP_MIN), 0, 1);
      mu.zoneDip = ZONA_DIP_MIN + (1 - ZONA_DIP_MIN) * e * e * (3 - 2 * e); }
    const levels: Record<string, number> = {};
    for (const s of SECTORS) levels[s.id] = this.state.zoneCount(s.id) / 4;
    levels.secretnovio = this.state.p.finalDone ? 0.85 : -1;   // −1 = estado central (ligeramente peor que un 0/4)
    /* V10.1 (usuario): con el reto hecho la canción de SN suena limpia, igual que en la escena final */
    if (this.state.p.finalDone) this.audio.music?.cleanIds.add('secretnovio'); else this.audio.music?.cleanIds.delete('secretnovio');
    // V10.4 R13 (usuario: «cuando las tienes todas aún hay un filtro de radio»): con las 4 patatas de una zona su canción suena limpia (sin radio)
    for (const s of SECTORS) { if (this.state.zoneCount(s.id) >= 4) this.audio.music?.cleanIds.add(s.id); else this.audio.music?.cleanIds.delete(s.id); }
    const flash: Record<string, number> = { secretnovio: this.state.p.finalDone ? 0 : this.centralFlash() };
    const presence: Record<string, { prox: number; pan: number }> = {};
    const right = new THREE.Vector3(); this.rig.cam.getWorldDirection(right); right.set(-right.z, 0, right.x).normalize();
    for (const c of this.cassettes) {
      const d = c.group.position.distanceTo(p);
      const dir = c.group.position.clone().sub(p).setY(0).normalize();
      presence[c.zone] = { prox: THREE.MathUtils.clamp(1 - d / 22, 0, 1), pan: dir.dot(right) };
    }
    // V10.1 P24 (D18 b, usuario: «que vaya desapareciendo el sonido y a los 3 metros de radio ya no se escucha nada»): del borde exterior del
    // paseo rosa (r 42) a r 45 la música se apaga y entra el ambiente; aviso una vez por salida (se rearma al volver dentro de r 40)
    // V10.4 R12: en la cinemática del parque suena su corte de NO ME GUILLO (salida del preview): ni música del parque ni ambiente
    { const cine = !!this.narr?.cineAudio, f = cine ? 0 : 1 - THREE.MathUtils.smoothstep(r, WORLD.rOuter, WORLD.rOuter + 3); mu.outside = f; this.musicOutside = f;
      if (!this.audio.previewMode) this.audio.ambience(cine ? 0 : 1 - f);
      if (r > WORLD.rOuter + 1.5 && !this.outsideWarned && this.mode === 'explore') { this.outsideWarned = true; toast('Vuelve al parque para seguir escuchando la música', 2600); }
      if (r < WORLD.rOuter - 2) this.outsideWarned = false; }
    mu.dialogDuck = dialogOpen() ? DIALOG_DUCK : 1;   // V10.4 R19: con un diálogo abierto, la música algo más baja (−4 dB)
    mu.update(dt, w, levels, presence, flash);
    // R2-G8 (usuario, 12 oct): La Pantera suena desde su sitio: pleno junto al recuadro de charla (≈ nivel de la canción),
    // casi nada al salir del sector, y calla mientras se habla con ella
    { const P = TUNING.panteraSound, a = this.manifest.get('npc.la_pantera');
      if (a) {
        const d = Math.hypot(a.pos.x - p.x, a.pos.z - p.z);
        // silencio en el BORDE REAL del sector en la dirección del jugador (La Pantera no está en el centro angular: a un lado
        // hay ~14 m y al otro ~25 m): primer punto del rayo La Pantera → jugador fuera de NMG o fuera de los paseos (r 22–42)
        const ux = d > 1e-3 ? (p.x - a.pos.x) / d : 1, uz = d > 1e-3 ? (p.z - a.pos.z) / d : 0;
        const inNmg = (t: number) => { const q = { x: a.pos.x + ux * t, z: a.pos.z + uz * t }, rr = Math.hypot(q.x, q.z); return rr >= WORLD.innerPath[0] && rr <= WORLD.outerPath[1] && zoneAt(q) === 'no_me_guillo'; };
        let far = 1; while (far < 60 && inNmg(far)) far += 1;
        let lo = far - 1, hi = far; for (let k = 0; k < 6; k++) { const m = (lo + hi) / 2; if (inNmg(m)) lo = m; else hi = m; } far = lo;
        const s = THREE.MathUtils.clamp((d - P.near) / Math.max(1, far - P.near), 0, 1); this.panteraFar = far;
        const talking = !!this.activities.find((x) => x.id === 'pantherTalk')?.busy;
        const dir = a.pos.clone().sub(p).setY(0).normalize();
        this.panteraGain = talking ? 0 : P.gain * (1 - s) * (1 - s);
        // R4 (usuario): dentro del recuadro de charla la canción baja (transición de duckRamp m desde el borde)
        const z = this.park.zones.get('act.pantherTalk');
        if (z) { const dz = Math.hypot(p.x - z.pos.x, p.z - z.pos.z); mu.zoneDuck = THREE.MathUtils.lerp(1, P.talkDuck, 1 - THREE.MathUtils.smoothstep(dz, z.r, z.r + P.duckRamp)); }
        // V10.5 (O-12, O-13): el emisor solo se alimenta cerca (y una última vez a 0 al alejarse); la URL, una sola vez
        if (this.panteraGain > 0 || this.panteraSent > 0) { this.audio.emitter('pantera', PANTERA_URL(), this.panteraGain, dir.dot(right) * 0.6 * Math.min(1, d / 3)); this.panteraSent = this.panteraGain; }
      } }
    if (this.zone) {
      const i = SECTORS.findIndex((s) => s.id === this.zone);
      const prev = SECTORS[(i + 4) % 5], next = SECTORS[(i + 1) % 5];
      const near = Math.abs(angleDelta(th, prev.axis)) < Math.abs(angleDelta(th, next.axis)) ? prev : next;
      if (Math.abs(angleDelta(th, SECTORS[i].axis)) > 22) mu.prefetch([near.id]);
    }
    if (r < WORLD.rCenter + 8) mu.prefetch(['secretnovio']);
    this.musicDebug = w;
  }
  /** Destello central: trapecio en el reloj de juego. El primero llega al completar `flashPeriod` (no al primer
   *  fotograma); sube en `flashRamp`, mantiene la calidad 2/4 durante `flashHold` y baja en `flashRamp`. */
  centralFlash(t = this.centralClock) {
    const C = this.cfg.audio.central; if (!C) return 0;
    const P = C.flashPeriod, R = C.flashRamp, H = C.flashHold;
    if (t < P) return 0;
    const u = (t - P) % P;                       // 0 = inicio del destello
    if (u < R) return u / R;
    if (u < R + H) return 1;
    if (u < 2 * R + H) return 1 - (u - R - H) / R;
    return 0;
  }
  updateMeters() {
    for (const c of this.cassettes) {
      const n = c.zone === 'secretnovio' ? (this.state.p.finalDone ? 1 : 0) : this.state.zoneCount(c.zone as ZoneId);
      c.bars.forEach((b, i) => (b.material = i < n ? b.userData.on : b.userData.off));
    }
  }

  // ------------------------------------------------------------------ patatas y premios
  collect(p: FryPickup) {
    if (p.collected) return;
    if (!this.state.collect(p.id)) return; // solo una recogida aceptada cambia la escena
    avisos.patata(p.id, this.state.total);   // V10.6 (B5)
    this.zoneIdleT = 0; this.zoneIdleShown = false;   // R11 (GUIA-01)
    p.collected = true;
    this.scene.remove(p.group);
    this.bursts.emit(p.group.position, '#F4BD48', 18, 3.4);
    const zone = p.id.split('.')[0] as ZoneId;
    const n = this.state.zoneCount(zone);
    this.audio.sfx('pickup', n * 3);
    this.updateHud(true); this.updateMeters(); this.updateObjective();
    const total = this.state.total;
    if (n === 4) toast(`${SECTOR_BY_ID[zone].song} 4/4 · ¡la señal ya se entiende!`, 2600);
    else toast(`Patata ${total}/${TOTAL_FRIES} · la radio de ${SECTOR_BY_ID[zone].name} suena un poco mejor`, 2000);
    if (total === TOTAL_FRIES && this.narr.off) this.sim.after(0.6, () => this.beginReveal());   // V10.4: con el recorrido, la revelación va dentro de FIN
    this.narr.onCollect(p.id); this.ayuda.onCollect(p.id);
  }
  /** Hace aparecer la patata de recompensa de un sector (una sola vez por premio; se reconstruye al recargar). */
  revealReward(zone: ZoneId) {
    const p = this.pickups.find((x) => x.id === `${zone}.activity` && !x.collected);
    if (p && !p.available) { p.available = true; p.appear(); this.bursts.emit(p.base, '#FFF2DF', 10, 2.2, 0.25); this.pickArm.set(p.id, this.clock + 0.8); }   // R11 (NMG-07)
    if (p) { this.rewardMark(p); this.rewardShot(p, 0); }   // V10.1 P07
    this.audio.sfx('reward');
    toast('¡Premio! Recoge la patata', 2200);
    this.updateObjective();
  }

  /** V10.1 P07: patata premio por recoger (marca pulsante encima y flecha en el borde de la pantalla mientras esté fuera de cuadro). */
  rewardPending: FryPickup | null = null; private rewardRing: THREE.Sprite | null = null; rewardShots = 0; rewardShotOn = false;
  private rewardMark(p: FryPickup) {
    this.rewardPending = p;
    if (!this.rewardRing) { this.rewardRing = new THREE.Sprite(new THREE.SpriteMaterial({ map: GLOW_TEXTURE, color: '#FFE08A', depthWrite: false, transparent: true, opacity: 0.9 })); this.rewardRing.renderOrder = 5; this.scene.add(this.rewardRing); }
    this.rewardRing.visible = true;
  }
  /** Plano corto (1,8 s) que mira la patata y vuelve, en cuanto ANMI explora sin charla abierta (espera hasta 60 s); cualquier movimiento lo
   *  corta. Con «reducir movimiento», corte directo y vuelta directa. */
  private rewardShot(p: FryPickup, tries: number) {
    if (p.collected) return;
    // V10.4 R13 (usuario: en FG, tras la charla con la chica, no se enseñaba la patata): antes esperaba como mucho 8 s y la celebración + charla de FG
    // (o leer despacio en cualquier zona) duraban más; ahora hasta 60 s, y también a que acaben la narrativa 2D y la actividad
    const busy = this.mode !== 'explore' || dialogOpen() || this.paused || !!this.narr?.busy || this.activities.some((a: any) => a.busy || a.inAttempt || a.dancing >= 0 || a.fgDancing);
    if (busy) { if (tries < 240) this.sim.after(0.25, () => this.rewardShot(p, tries + 1)); return; }
    const s = this.skater!, reduced = this.state.p.settings.reducedMotion, look = p.base.clone().add(new THREE.Vector3(0, 0.2, 0));
    const from = s.footPos.clone().add(new THREE.Vector3(0, 1.6, 0)), dir = from.clone().sub(look).setY(0); if (dir.lengthSq() < 1e-4) dir.set(0, 0, 1); dir.normalize();
    const eye = look.clone().addScaledVector(dir, Math.min(4.5, Math.max(2.6, from.distanceTo(look) * 0.6))).add(new THREE.Vector3(0, 1.5, 0));
    const get = () => ({ pos: eye, look, hfov: 54 }); this.rig.toScripted(get, reduced); this.rewardShots++;
    const mark = this.input.lastCamInput, at = s.footPos.clone(); let t = 0;
    this.rewardShotOn = true;   // V10.5 (regla de oro): mientras dura el plano no empieza ninguna secuencia 2D encima
    const tick = () => { t += 0.1; if (this.rig.mode !== 'scripted' || this.rig.scripted !== get) { this.rewardShotOn = false; return; }
      if (t >= 1.8 || this.mode !== 'explore' || this.input.lastCamInput !== mark || s.footPos.distanceTo(at) > 0.3 || Math.hypot(s.vel.x, s.vel.z) > 0.2) { this.rewardShotOn = false; this.rig.toFollow(s, reduced); return; }
      this.sim.after(0.1, tick); };
    this.sim.after(0.1, tick);
  }
  private rewardPresent(dt: number) {
    const p = this.rewardPending, el = document.getElementById('reward-arrow');
    if (!p || p.collected || !p.available) { if (this.rewardRing) this.rewardRing.visible = false; if (el && !el.hidden) el.hidden = true; this.rewardPending = p && !p.collected ? p : null; return; }
    const reduced = this.state.p.settings.reducedMotion, k = reduced ? 1 : 1 + 0.18 * Math.sin(this.clock * 6);
    this.rewardRing!.position.copy(p.group.position).add(new THREE.Vector3(0, 0.75, 0)); this.rewardRing!.scale.setScalar(0.9 * k); this.rewardRing!.visible = true;
    if (!el) return;
    const v = p.group.position.clone().add(new THREE.Vector3(0, 0.3, 0)).project(this.rig.cam), W = orient.width, H = orient.height;
    const on = v.z < 1 && Math.abs(v.x) < 0.92 && Math.abs(v.y) < 0.9;
    { const hide = on || this.mode !== 'explore'; if (el.hidden !== hide) el.hidden = hide; }
    if (on) return;
    let x = v.x, y = v.y; if (v.z > 1) { x = -x; y = -y; }   // detrás de la cámara: hacia el lado contrario
    const m = Math.max(Math.abs(x), Math.abs(y), 1e-3), ex = x / m, ey = y / m, px = (ex * 0.5 + 0.5) * W, py = (-ey * 0.5 + 0.5) * H, pad = 44;
    el.style.left = `${THREE.MathUtils.clamp(px, pad, W - pad)}px`; el.style.top = `${THREE.MathUtils.clamp(py, pad + 40, H - pad - 60)}px`;
    el.style.transform = `rotate(${Math.atan2(-ey, ex)}rad)`; void dt;
  }

  // ------------------------------------------------------------------ centro: siempre transitable · desafío y coches a 20/20
  applyCenterState(animated: boolean) {
    const open = this.state.centerUnlocked && (this.state.p.revealSeen || animated);
    this.centerOpen = open && !animated;
    if (!animated) { this.park.setCenter(open ? 1 : 0); this.vallaMusicK = this.park.vallaUp ? 1 : 0; }
    // V10.3 R1 (W04, R3-02): los coches derrapan SIEMPRE, también con 0–19 patatas (detrás de la valla no pueden tocar a ANMI)
    if (!this.cars.active) this.cars.setActive(true, DriftCars.safePhase(this.skater?.footPos ?? new THREE.Vector3()));
  }
  /** Revelación: espera a que no haya actividad/diálogo; corre en reloj de simulación (pausable, retomable). */
  private revealWaitT = 0; private revealFroze = false;
  beginReveal() {
    if (this.revealT >= 0 || this.centerOpen || !this.state.centerUnlocked) return;
    if (this.mode !== 'explore' || dialogOpen()) { this.sim.after(0.5, () => this.beginReveal()); return; }
    // R11 (SIS-12): no quitar el control con ANMI en el aire, cayendo o en la pared del vaso (tope 2 s); durante la revelación, quieta
    const sk = this.skater!;
    if ((!sk.grounded || sk.loco === 'impact' || sk.loco === 'bail' || sk.pool?.active) && this.revealWaitT < 2) { this.revealWaitT += 0.25; this.sim.after(0.25, () => this.beginReveal()); return; }
    this.revealWaitT = 0; sk.vel.set(0, 0, 0); this.revealFroze = !sk.frozen; sk.frozen = true;
    this.setMode('reveal');
    this.revealT = 0; this.park.vallaCut = this.state.p.settings.reducedMotion;
    this.rig.toFixed({ pos: this.park.manifest.get('cam.reveal').pos, target: new THREE.Vector3(0, 3.0, -3), hfov: 70 });   // V10: encuadra A, B y D
    this.audio.sfx('reveal');
    toast('¡20/20! Despierta SECRETNOVIO…', 3400);
  }
  /** V10.4: la misma revelación dentro de la secuencia FIN (sin el disparador automático ni sus esperas de modo). Termina al acabar. */
  async runReveal(t: Token) {
    if (this.centerOpen || this.revealT >= 0) return;
    this.park.vallaCut = this.state.p.settings.reducedMotion; this.revealT = 0; this.revealInNarr = true;
    this.rig.toFixed({ pos: this.park.manifest.get('cam.reveal').pos, target: new THREE.Vector3(0, 3.0, -3), hfov: 70 });
    this.audio.sfx('reveal'); toast('¡20/20! Despierta SECRETNOVIO…', 3400);
    while (t.alive && this.revealT >= 0) await this.sim.wait(0.1, t);
  }
  private revealInNarr = false;
  private stepReveal(dt: number) {
    this.revealT += dt / 3.4;
    this.park.setCenter(Math.min(1, this.revealT));
    if (this.revealT >= 1) {
      this.revealT = -1; this.centerOpen = true; this.state.setRevealSeen(); if (this.revealFroze) { this.skater!.frozen = false; this.revealFroze = false; }
      this.park.setCenter(1); if (!this.cars.active) this.cars.setActive(true, DriftCars.safePhase(this.skater!.footPos));
      if (this.revealInNarr) { this.revealInNarr = false; this.updateObjective(); return; }   // V10.4: sigue la secuencia FIN
      this.setMode('explore'); this.rig.toFollow(this.skater!);
      hint('Desafío: sube por la <b>escalera</b> del muro, <b>¡BAJAR!</b> arriba, <b>SALTO</b> en la rampa y acierta los <b>círculos</b> en el aire. Ojo: los coches no paran', 7500);   // R5d: 3 líneas (ux-layouts)
      this.updateObjective();
    }
  }
  onFinalSuccess(first: boolean) {
    crono.terminar();   // V10.6.1: el tiempo queda fijo al conseguir el final
    avisos.secretnovio(); avisos.actividad('secretnovio', 'completa', !first);   // V10.6 (B5)
    this.updateMeters(); this.updateHud(); this.updateObjective();
    toast(first ? '¡SALTAZO! Señal limpia: preview desbloqueado' : '¡Salto de SECRETNOVIO otra vez!', 3200);
    void this.audio.music?.loadFinal('audio/secretnovio-final-v103.m4a'); void loadLogoData();   // V10.1: la escena final empieza en 1,1 s
    this.sim.after(1.1, () => { if (this.mode === 'explore') this.showPreview(); });
  }

  // ------------------------------------------------------------------ preview limpio y visual (repetible y cancelable)
  private visualRAF = 0;
  showPreview() {
    if (!this.state.previewUnlocked) return;
    this.previewToken?.cancel();
    const token = new Token('preview'); this.previewToken = token;
    this.setMode('preview');
    // V10.1 (usuario, 19 oct): en vez del preview, la escena final cinematográfica (finale.ts); el modal antiguo queda solo si la escena no
    // se puede montar (sin el logo de nubes)
    void this.startFinale(token); return;
  }
  private async startFinale(token: Token) {
    const logo = await this.ensureSkyLogo(); if (!token.alive) return;
    if (!logo) { this.showPreviewModal(token); return; }
    this.cine = new FinalCine(this, logo); await this.cine.start();
    if (!token.alive) this.cine?.finish();
  }
  /** Lo llama la escena al terminar: vuelta a explorar con la cámara detrás de ANMI. */
  onFinaleEnd(natural = false) {
    this.narr?.onFinaleEnd(natural);   // V10.4: despedida tras el fin natural o SALTAR (no tras una cancelación técnica)
    if (!natural || !this.narr || this.narr.off) crono.resultado();   // V10.6.1: sin despedida, el tiempo final sale ya (si no, al acabar ella)
    this.previewToken?.cancel(); this.previewToken = null; this.cine = null;
    this.setMode('explore'); this.rig.toFollow(this.skater!, true); this.input.clear(); this.updateHud(); this.updateObjective();
  }
  private showPreviewModal(token: Token) {
    const P = this.cfg.preview;
    $('final-note').textContent = P.label; $('final-note').hidden = !P.label;   // sin texto técnico en pantalla (FIN-04)
    $('visual-label').textContent = P.visual ? '' : P.visualLabel;
    const cta = $('btn-cta') as HTMLAnchorElement;
    if (this.cfg.cta.enabled && this.cfg.cta.url) { cta.hidden = false; cta.href = this.cfg.cta.url; cta.textContent = this.cfg.cta.label; }
    else cta.hidden = true;
    $('btn-share').hidden = !(this.cfg.share.enabled && this.cfg.cta.url);
    this.onModal?.('final', true);
    this.runVisualizer(token);
    this.playPreviewAudio(token);
  }
  onModal: ((id: string, open: boolean) => void) | null = null;
  async playPreviewAudio(token = this.previewToken) {
    const mu = this.audio.music; if (!mu || !token?.alive) return;
    this.audio.setEngine(0, 0);
    $('final-status').textContent = 'Cargando…';
    $('btn-play-preview').textContent = '…';
    const r = await mu.playPreview(this.cfg.preview.audioTrack, token, () => { if (token.alive) { $('btn-play-preview').textContent = '⟲ OTRA VEZ'; $('final-status').textContent = 'Fin del preview'; } });
    if (!token.alive) return; // cerrado mientras cargaba: no suena nada
    if (r === 'ok') { $('btn-play-preview').textContent = '⟲ DESDE EL PRINCIPIO'; $('final-status').textContent = this.audio.ctx?.state === 'running' ? 'Sonando' : 'Pulsa para activar el sonido'; }
    else { $('btn-play-preview').textContent = '▶ REINTENTAR'; $('final-status').textContent = 'No se pudo cargar el audio. Reintenta o vuelve al parque.'; }
  }
  private runVisualizer(token: Token) {
    cancelAnimationFrame(this.visualRAF);
    const c = $('visual-canvas') as HTMLCanvasElement, g = c.getContext('2d')!;
    const an = this.audio.previewAnalyser; const data = new Uint8Array(an ? an.frequencyBinCount : 64);
    const reduced = this.state.p.settings.reducedMotion;
    let t0 = performance.now();
    const loop = () => {
      if (!token.alive) return;
      this.visualRAF = requestAnimationFrame(loop);
      const W = c.width = Math.max(2, c.clientWidth * Math.min(2, devicePixelRatio)), H = c.height = Math.max(2, c.clientHeight * Math.min(2, devicePixelRatio));
      an?.getByteFrequencyData(data);
      const t = (performance.now() - t0) / 1000;
      drawPreviewVisual(g, W, H, data, t, reduced);
    };
    t0 = performance.now(); loop();
  }
  closePreview() {
    if (this.cine?.active) { this.cine.end(true); return; }   // V10.1: Esc / SALTAR / «Volver a la plaza» cortan la escena final
    this.previewToken?.cancel(); this.previewToken = null;
    this.audio.music?.stopPreview();
    cancelAnimationFrame(this.visualRAF);
    this.onModal?.('final', false);
    crono.resultado();   // V10.6.1: el preview antiguo (sin escena final) no tiene despedida
    this.setMode('explore'); this.rig.toFollow(this.skater!);
  }

  // ------------------------------------------------------------------ modos, pausa e interacción
  setMode(m: Mode) {
    this.mode = m;
    const world = m === 'explore' || m === 'final';
    this.input.setWorld(world);
    $('touch').hidden = !world || !this.started;
    if (m !== 'explore') { showAction(null); this.actionOwner = null; }
    if ((m === 'preview') !== this.audio.previewMode) this.audio.setPreviewMode(m === 'preview');
  }
  /** Pausa superpuesta (no cambia el modo). Congela simulación, presentación y audio; libera entradas mantenidas. */
  setPaused(on: boolean) {
    if (on === this.paused) return;
    this.paused = on;
    this.input.setModal(on || this.mode === 'preview');
    if (on) this.audio.suspend(); else { this.audio.resume(); this.last = performance.now(); this.acc = 0; }
    this.onPauseChange?.(on);
  }
  offerAction(label: string, fn: () => void, owner: string, opts: { off?: boolean; note?: string } = {}) {
    if (this.actionOwner && this.actionOwner !== owner) return;
    this.actionOwner = owner; showAction(label, () => { this.actionOwner = null; fn(); }, this.input.source === 'gamepad' ? 'Y' : 'E', opts);
  }
  withdrawAction(owner: string) { if (this.actionOwner === owner) { this.actionOwner = null; showAction(null); } }
  /** Baja de la tabla con la misma regla que el botón TABLA y, al quedar a pie, ejecuta `fn` (reloj de simulación). */
  thenOnFoot(fn: () => void) {
    const s = this.skater!;
    if (s.onFoot) { fn(); return; }
    if (!s.requestBoard({ rails: this.park.rails, now: this.sim.now })) return;   // denegado: el aviso ya explica por qué
    let tries = 0;
    const wait = () => { if (s.onFoot) { if (this.mode === 'explore') fn(); return; } if (++tries < 40 && this.mode === 'explore') this.sim.after(0.05, wait); };
    this.sim.after(0.05, wait);
  }
  /** V10.1 P12 (usuario): de vuelta a la plaza de salida, a pie, como al empezar (cámara de entrada incluida); el progreso no se toca. */
  goToPlaza() {
    const s = this.skater!;
    this.narr?.cortarParaPlaza();   // V10.6 (resto de H8-10): la presentación en curso se corta (y se vuelve a ofrecer); antes seguía por debajo
    this.exitActivity();
    for (const a of this.activities) { const x = a as any; if (x.busy || x.dancing >= 0 || x.seated || x.inAttempt || x.painting) a.cancel?.(); }   // R5 (QA C7): también un grafiti a medias
    if (this.cine?.active) this.cine.finish();   // V10.1: la escena final se corta en seco (todo vuelve a su sitio antes de ir a la plaza)
    if (this.mode === 'preview') this.closePreview();
    if (this.mode !== 'explore') this.setMode('explore');
    s.frozen = false; this.input.clear(); this.input.releaseMoveLatch(); this.input.setCrouchToggle(false);
    const sp = this.park.manifest.spawn; s.teleport(sp.pos.clone(), sp.heading, 'walk'); this.rig.snapBehind(s);
    this.entranceCam();
    this.setSafe(true); this.updateZone(); this.updateObjective();
    // R5 (QA B1): la plaza de salida está fuera del radio de la música (P24): al llegar así no se avisa de la salida (como al empezar) y el
    // aviso de la plaza no queda tapado; (QA C12) sin la acción de donde se venía
    this.outsideWarned = true; showAction(null); this.actionOwner = null;
    this.log.push('volver a la plaza'); toast('De vuelta en la plaza. Tu progreso sigue contigo.', 2400);
  }
  /** V10 (E-38) · V10.1 P12: encuadre de presentación de la plaza hasta el primer movimiento o giro de cámara. */
  entranceCam() {
    if (!this.park.manifest.anchors.has('cam.entrada')) return;
    const eye = this.park.manifest.get('cam.entrada').pos.clone(), look = this.skater!.footPos.clone().add(new THREE.Vector3(0, 1.15, 0));
    const get = () => ({ pos: eye, look, hfov: CAM.hfov });
    this.rig.toScripted(get, true);
    this.introCam = { mark: this.input.lastCamInput, get, at: this.skater!.footPos.clone() };
  }
  /** V10.1 P06 (D08): actividad larga en curso que se puede dejar desde la pausa (null si no hay ninguna). */
  exitableActivity(): { id: string; label: string } | null {
    const A = (id: string) => this.activities.find((a) => a.id === id) as any;
    if (A('skateTutorial')?.inRun) return { id: 'skateTutorial', label: 'Salir del grind' };
    const gr = A('graffiti'); if (gr?.busy && (gr.phase === 'paint' || gr.phase === 'failed')) return { id: 'graffiti', label: 'Dejar de pintar' };
    if (A('danceCombo')?.busy) return { id: 'danceCombo', label: 'Salir del baile' };
    if (A('secretJump')?.inAttempt) return { id: 'secretJump', label: 'Salir del reto' };
    if (A('ladderClimb')?.busy) return { id: 'ladderClimb', label: 'Soltar la escalera' };
    if (A('benchSit')?.seated) return { id: 'benchSit', label: 'Levantarse del banco' };
    if (A('freeDance')?.painting) return { id: 'freeDance', label: 'Dejar de pintar' };   // R5 (QA C7)
    return null;
  }
  /** V10.1 P06: deja la actividad en curso como lo haría su propia salida y deja a ANMI a pie en un sitio seguro de esa actividad. */
  exitActivity(): string | null {
    const e = this.exitableActivity(); if (!e) return null;
    const s = this.skater!, a = this.activities.find((x) => x.id === e.id) as any, m = this.park.manifest;
    const put = (anchor: string) => { const an = m.get(anchor); s.teleport(an.pos.clone(), an.heading, 'walk'); this.rig.toFollow(s, true); };
    if (e.id === 'skateTutorial') { a.end(); a.phase = 'off'; put('nv.retry'); }
    else if (e.id === 'graffiti') ($('graffiti-exit') as HTMLButtonElement).click();
    else if (e.id === 'danceCombo') ($('dance-exit') as HTMLButtonElement).click();
    else if (e.id === 'secretJump') { a.cancel(); put('sn.retry'); }
    else if (e.id === 'ladderClimb') { const L = a.L ?? m.ladders.find((l) => l.id === 'fg'), z = L ? this.park.zones.get(L.footZone) : null; a.end();
      if (z) { const p = z.pos.clone(); p.y = L!.bottom; s.teleport(p, L!.heading, 'walk'); this.rig.toFollow(s, true); } }
    else if (e.id === 'benchSit') a.end();
    else if (e.id === 'freeDance') a.cancelPaint('salir');
    if (this.mode === 'activity') { this.setMode('explore'); this.rig.toFollow(s); }
    s.frozen = false; this.input.releaseMoveLatch();
    this.log.push(`salir de la actividad: ${e.id}`); return e.id;
  }
  faceSkater(p: THREE.Vector3) { const s = this.skater!; s.heading = Math.atan2(p.x - s.footPos.x, p.z - s.footPos.z); s.prevHeading = s.heading; }

  private camFadeAt = -1;
  /** V10 (E-38): encuadre de presentación de la partida nueva, activo hasta el primer movimiento o giro de cámara. */
  introCam: { mark: number; get: () => { pos: THREE.Vector3; look: THREE.Vector3; hfov: number }; at: THREE.Vector3 } | null = null;

  render() {
    // V4-CAM-02: tramado de la geometría del parque pegada a la cámara (piezas cargadas después incluidas)
    if (this.stats.renders - this.camFadeAt >= 90 || this.camFadeAt < 0) { this.camFadeAt = this.stats.renders; this.stats.camFadeMats += applyCamFade(this.park.root); }
    this.park.vegTiers?.update(this.rig.cam.position);   // V10 (D-EX-07): niveles de la vegetación del exterior
    this.shadowPolicyApply();
    // V10.5 (AM-13, E5-26, E5-38, T6): en vertical, la cinemática del parque y la escena final en una franja 16:9 centrada con negro arriba y abajo
    // (los planos de PAS, FIN y la guía de SN siguen a pantalla completa, E5-39)
    const strip = (!!this.narr?.inCine || !!this.cine?.active) && orient.height > orient.width;
    if (strip !== this.rig.letterbox) { this.rig.setLetterbox(strip); document.documentElement.classList.toggle('franja', strip); }
    if (strip) {
      const r = this.renderer, W = orient.width, H = orient.height, bh = Math.round(W * 9 / 16), y = Math.round((H - bh) / 2);
      document.documentElement.style.setProperty('--franja-pad', `${y}px`);
      r.setScissorTest(false); r.setClearColor(0x000000, 1); r.clear();
      r.setViewport(0, y, W, bh); r.setScissor(0, y, W, bh); r.setScissorTest(true);
      r.render(this.scene, this.rig.cam);
      r.setScissorTest(false); r.setViewport(0, 0, W, H);
    } else this.renderer.render(this.scene, this.rig.cam);
    this.stats.renders++;
    const info = this.renderer.info;
    this.stats.drawCalls = info.render.calls; this.stats.tris = info.render.triangles;
    this.stats.geometries = info.memory.geometries; this.stats.textures = info.memory.textures;
  }

  // ------------------------------------------------------------------ depuración (?debug=1; herramientas solo en desarrollo)
  updateDebug() {
    const el = $('debug'); el.hidden = false;
    const s = this.skater!;
    if (!this.debug) { el.textContent = `${(1000 / this.frameMs).toFixed(0)} fps · cpu ${this.workMs.toFixed(1)} ms · ${this.stats.drawCalls} llamadas · ${(this.stats.tris / 1000).toFixed(0)}k triángulos${this.efficient ? ' · eficiente' : ''}`; return; }   // V10.5 (E5-40): versión corta
    if (!el.dataset.built) {
      el.dataset.built = '1';
      el.innerHTML = `<div id="dbg-text"></div>` + (DEV ? SECTORS.map((z) => `<button data-tp="${z.id}">${z.name.slice(0, 6)}</button>`).join('') +
        `<button data-tp="center">CENTRO</button><button data-act="all">19→20</button>` : '');
      el.onclick = (e) => {
        if (!DEV) return;
        const b = (e.target as HTMLElement).closest('button') as HTMLButtonElement | null; if (!b) return;
        if (b.dataset.tp) this.teleportTo(b.dataset.tp);
        if (b.dataset.act === 'all') this.debugCollectAll(TOTAL_FRIES - 1);
      };
    }
    $('dbg-text').textContent = `${(1000 / this.frameMs).toFixed(0)} fps  cpu ${this.workMs.toFixed(1)}ms  dc ${this.stats.drawCalls}  tris ${(this.stats.tris / 1000).toFixed(0)}k  geo ${this.stats.geometries} tex ${this.stats.textures}\n` +
      `vLong ${s.vLong.toFixed(2)} vy ${s.vy.toFixed(1)} ${s.loco}/${s.state} g:${s.grounded ? 1 : 0}(kcc ${s.kccGrounded ? 1 : 0} gap ${s.supportGap.toFixed(2)}) crouch:${s.isCrouched ? 1 : 0} in ${s.steer.toFixed(2)}/${s.throttle.toFixed(2)}\n` +
      `pos ${s.footPos.x.toFixed(1)},${s.footPos.y.toFixed(2)},${s.footPos.z.toFixed(1)} zona ${this.zone ?? 'centro'} ${this.state.total}/20 modo ${this.mode}\n` +
      `anim ${(this.visual as AnmiVisual).activeActions?.join(' ') ?? ''}\nmúsica ${this.audio.music?.soundingIds.join(',') ?? '-'}`;
  }
  /** Fixture de inspección (solo desarrollo/pruebas): colocar al jugador. No acredita un recorrido. */
  teleportTo(id: string) {
    const s = this.skater!;
    if (id === 'center') { const a = this.park.manifest.get('sn.retry'); s.teleport(a.pos, a.heading); }
    else { const S = this.park.sector(id as ZoneId); const p = S.P(24, 0); s.teleport(p, S.out(0)); }
    this.rig.snapBehind(s);
  }
  /** Fixture 19→20 (solo desarrollo/pruebas): completa actividades y recoge patatas SIN física. Se declara como tal. */
  debugCollectAll(n: number) {
    this.state.setBridgeHeard('aissa'); this.state.setBridgeHeard('juseph');   // V7: la charla de TT exige las dos frases
    for (const s of SECTORS) if (this.state.complete(s.activity)) this.revealReward(s.id);
    for (const p of this.pickups) if (!p.collected && this.state.total < n) { p.available = true; this.collect(p); }
  }
}

/** Visual provisional propio del preview (D14): composición de marca con barras de espectro; rotulado discreto. */
export function drawPreviewVisual(g: CanvasRenderingContext2D, W: number, H: number, data: Uint8Array, t: number, reduced: boolean) {
  const grd = g.createLinearGradient(0, 0, W, H); grd.addColorStop(0, '#2a1f45'); grd.addColorStop(0.55, '#5a1f45'); grd.addColorStop(1, '#F18AAE');
  g.fillStyle = grd; g.fillRect(0, 0, W, H);
  // sol retro con franjas y horizonte (motivo del parque)
  const cx = W / 2, cy = H * 0.62, R = H * 0.42;
  const sun = g.createLinearGradient(0, cy - R, 0, cy); sun.addColorStop(0, '#FFD98A'); sun.addColorStop(1, '#F18AAE');
  g.save(); g.beginPath(); g.arc(cx, cy, R, Math.PI, 0); g.closePath(); g.clip(); g.fillStyle = sun; g.fillRect(cx - R, cy - R, 2 * R, R);
  g.fillStyle = '#5a1f45'; for (let i = 0; i < 6; i++) { const y = cy - R * 0.08 - i * R * 0.13; g.fillRect(cx - R, y, 2 * R, R * 0.035 * (1 + i * 0.25)); }
  g.restore();
  g.strokeStyle = 'rgba(255,209,227,.35)'; g.lineWidth = Math.max(1, H / 180);
  const sh = reduced ? 0 : (t * 0.6) % 1;
  for (let i = 0; i < 9; i++) { const y = cy + (H - cy) * Math.pow((i + sh) / 9, 1.8); g.beginPath(); g.moveTo(0, y); g.lineTo(W, y); g.stroke(); }
  for (let i = -8; i <= 8; i++) { g.beginPath(); g.moveTo(cx + i * W * 0.02, cy); g.lineTo(cx + i * W * 0.16, H); g.stroke(); }
  const n = 40, bw = W / n;
  for (let i = 0; i < n; i++) {
    const v = data.length ? data[Math.floor(i / n * data.length * 0.6)] / 255 : 0;
    g.fillStyle = i % 2 ? 'rgba(241,138,174,.85)' : 'rgba(255,209,227,.85)';
    g.fillRect(i * bw + 1, H - H * v * 0.3, bw - 2, H * v * 0.3);
  }
  g.fillStyle = '#24212B'; g.font = `${Math.round(H * 0.15)}px Bungee, sans-serif`; g.textAlign = 'center';
  g.fillText('SECRETNOVIO', W / 2 + H * 0.01, H * 0.3 + H * 0.012);
  g.fillStyle = '#FFF2DF'; g.fillText('SECRETNOVIO', W / 2, H * 0.3);
}
