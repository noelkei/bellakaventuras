// Patatas (pickups) y pequeños efectos: brillo, giro, aparición, estallido de partículas.
import * as THREE from 'three';

function glowTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const g = c.getContext('2d')!;
  const grad = g.createRadialGradient(64, 64, 4, 64, 64, 64);
  grad.addColorStop(0, 'rgba(255,240,180,1)'); grad.addColorStop(0.35, 'rgba(244,189,72,0.55)'); grad.addColorStop(1, 'rgba(244,189,72,0)');
  g.fillStyle = grad; g.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
const GLOW = glowTexture();
export const GLOW_TEXTURE = GLOW;

export class FryPickup {
  group = new THREE.Group();
  collected = false;
  available = true;
  spawn: import('./world/manifest').FrySpawn | null = null;
  appearT = 1; // 0..1 animación de aparición
  t = Math.random() * 10;
  base: THREE.Vector3;
  constructor(public id: string, pos: THREE.Vector3, hover: number, model: THREE.Object3D) {
    this.base = pos.clone().add(new THREE.Vector3(0, hover, 0));
    const m = model.clone(true);
    m.scale.setScalar(1.25); // 0,50 m: exagerada para móvil
    m.traverse((o) => { const mm = o as THREE.Mesh; if (mm.isMesh) { mm.castShadow = true; const mat = (mm.material as THREE.MeshStandardMaterial).clone(); mat.emissive = new THREE.Color('#F4BD48'); mat.emissiveIntensity = 0.35; mm.material = mat; } });
    m.rotation.z = 0.25;
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: GLOW, depthWrite: false, blending: THREE.AdditiveBlending, transparent: true, opacity: 0.85 }));
    glow.scale.setScalar(1.25);
    const shadow = new THREE.Mesh(new THREE.CircleGeometry(0.22, 20), new THREE.MeshBasicMaterial({ color: '#000', transparent: true, opacity: 0.22, depthWrite: false }));
    shadow.rotation.x = -Math.PI / 2; shadow.position.y = -hover + 0.02;
    this.group.add(glow, m, shadow);
    this.group.position.copy(this.base);
    (this.group as any).userData.model = m;
  }
  appear() { this.appearT = 0; this.group.visible = true; }
  update(dt: number) {
    this.t += dt;
    const m = (this.group as any).userData.model as THREE.Object3D;
    m.rotation.y += dt * 2.4;
    this.group.position.y = this.base.y + Math.sin(this.t * 2.6) * 0.08;
    if (this.appearT < 1) {
      this.appearT = Math.min(1, this.appearT + dt * 1.8);
      const e = this.appearT; const s = e < 0.7 ? (e / 0.7) * 1.25 : 1.25 - (e - 0.7) / 0.3 * 0.25;
      this.group.scale.setScalar(Math.max(0.001, s));
      this.group.position.y += (1 - e) * 1.2;
    }
  }
}

/** V10.2 Q15 + R-06a (usuario: «mejorar las marcas que dejan los coches y la tabla en el suelo»): marcas en TIRA continua por rueda. Cada
 *  rueda deja un segmento desde su punto anterior al actual cada `step` m (sigue la trayectoria real: curvas, derrape, culeo), con los bordes
 *  suaves (degradado a lo ancho), apoyado en la superficie, que se desvanece en `life` s (edad por instancia en el shader) y con
 *  `polygonOffset`. Una llamada de dibujo por sistema (InstancedMesh con anillo de N segmentos, de sobra para no reciclarlos antes de tiempo). */
let SOFT: THREE.Texture | null = null;
function softEdge() {
  if (SOFT) return SOFT;
  const c = document.createElement('canvas'); c.width = 64; c.height = 4; const x = c.getContext('2d')!, g = x.createLinearGradient(0, 0, 64, 0);
  g.addColorStop(0, '#000'); g.addColorStop(0.28, '#bbb'); g.addColorStop(0.5, '#fff'); g.addColorStop(0.72, '#bbb'); g.addColorStop(1, '#000');
  x.fillStyle = g; x.fillRect(0, 0, 64, 4); SOFT = new THREE.CanvasTexture(c); return SOFT;
}
export class TrailMarks {
  mesh: THREE.InstancedMesh; i = 0; emitted = 0; length = 0; private born: THREE.InstancedBufferAttribute; private uTime = { value: 0 }; private last: (THREE.Vector3 | null)[];
  constructor(parent: THREE.Object3D, public o: { n: number; tracks: number; width: number; life: number; step: number; color: string; opacity: number; name: string; lift: number }) {
    const g = new THREE.PlaneGeometry(1, 1); g.rotateX(-Math.PI / 2);   // ancho en X, largo en Z, apoyada en Y
    this.born = new THREE.InstancedBufferAttribute(new Float32Array(o.n).fill(-99), 1); g.setAttribute('aBorn', this.born);
    const m = new THREE.MeshBasicMaterial({ color: o.color, transparent: true, opacity: o.opacity, alphaMap: softEdge(), depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 });
    const uT = this.uTime, L = o.life.toFixed(2);
    m.onBeforeCompile = (sh) => { sh.uniforms.uTime = uT;
      sh.vertexShader = 'attribute float aBorn; uniform float uTime; varying float vFade;\n' + sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
        vFade = clamp(1.0 - (uTime - aBorn) / ${L}, 0.0, 1.0); vFade *= vFade * (3.0 - 2.0 * vFade);`);
      sh.fragmentShader = 'varying float vFade;\n' + sh.fragmentShader.replace('#include <alphamap_fragment>', '#include <alphamap_fragment>\n diffuseColor.a *= vFade;'); };
    m.customProgramCacheKey = () => `bk_trail_${L}`;
    this.mesh = new THREE.InstancedMesh(g, m, o.n); this.mesh.frustumCulled = false; this.mesh.count = 0; this.mesh.name = o.name;
    this.last = Array.from({ length: o.tracks }, () => null);
    parent.add(this.mesh);
  }
  setTime(t: number) { this.uTime.value = t; }
  cut(track = -1) { if (track < 0) this.last.fill(null); else this.last[track] = null; }
  clear() { this.mesh.count = 0; this.i = 0; this.born.array.fill(-99); this.born.needsUpdate = true; this.cut(); }
  /** Punto actual de la rueda `track` sobre una superficie de normal `n`: deja el segmento desde el anterior cuando se ha alejado `step`. */
  push(track: number, p: THREE.Vector3, n: THREE.Vector3, t: number) {
    const last = this.last[track];
    if (!last) { this.last[track] = p.clone(); return false; }
    const d = p.distanceTo(last); if (d < this.o.step) return false;
    if (d > this.o.step * 6) { this.last[track] = p.clone(); return false; }   // salto (teletransporte, caída): no se une
    const nn = n.clone().normalize(), f = p.clone().sub(last), fwd = f.addScaledVector(nn, -f.dot(nn)).normalize(), r = new THREE.Vector3().crossVectors(nn, fwd).normalize();
    const mid = p.clone().add(last).multiplyScalar(0.5).addScaledVector(nn, this.o.lift);
    const M = new THREE.Matrix4().makeBasis(r.multiplyScalar(this.o.width), nn, fwd.multiplyScalar(d + 0.03)).setPosition(mid);
    this.mesh.setMatrixAt(this.i, M); this.born.setX(this.i, t); this.i = (this.i + 1) % this.o.n; this.mesh.count = Math.min(this.o.n, this.mesh.count + 1); this.emitted++; this.length += d;
    this.mesh.instanceMatrix.needsUpdate = true; this.born.needsUpdate = true; this.last[track] = p.clone();
    return true;
  }
}

/** V10.1 P17 · V10.2 Q15: las dos ruedas traseras de la tabla dejan una tira continua (antes rayas sueltas de 0,4 m que, a > 11 m/s,
 *  desaparecían de golpe al reciclarse el anillo de 160): segmentos de 0,12 m, 1 200 en el anillo (4 s a 12 m/s con las dos ruedas). */
export class SkidMarks {
  static N = 1200; static LIFE = 4;
  trail: TrailMarks;
  constructor(scene: THREE.Scene) { this.trail = new TrailMarks(scene, { n: SkidMarks.N, tracks: 2, width: 0.035, life: SkidMarks.LIFE, step: 0.12, color: '#2a2328', opacity: 0.5, name: 'SKID_MARKS', lift: 0.006 }); }
  get mesh() { return this.trail.mesh; }
  get emitted() { return this.trail.emitted; }
  /** Llamar cada fotograma: `on` = rodando apoyada en la tabla (no en grind ni en la pared del vaso). */
  update(t: number, on: boolean, pos: THREE.Vector3, heading: number, normal: THREE.Vector3) {
    this.trail.setTime(t);
    if (!on) { this.trail.cut(); return; }
    const fwd = new THREE.Vector3(Math.sin(heading), 0, Math.cos(heading)), n = normal.clone().normalize();
    const f2 = fwd.clone().addScaledVector(n, -fwd.dot(n)).normalize(), r = new THREE.Vector3().crossVectors(f2, n).normalize();
    [-0.09, 0.09].forEach((sx, k) => this.trail.push(k, pos.clone().addScaledVector(r, sx).addScaledVector(f2, -0.22), n, t));
  }
}

/** Estallido de partículas (sprites) reutilizable. */
export class Bursts {
  pts: { s: THREE.Sprite; v: THREE.Vector3; life: number }[] = [];
  constructor(public scene: THREE.Scene) {}
  emit(at: THREE.Vector3, color = '#F4BD48', n = 16, speed = 3.2, size = 0.18) {
    for (let i = 0; i < n; i++) {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: GLOW, color, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
      s.scale.setScalar(size * (0.7 + Math.random() * 0.8)); s.position.copy(at);
      const v = new THREE.Vector3(Math.random() - .5, Math.random() * 0.9 + 0.3, Math.random() - .5).normalize().multiplyScalar(speed * (0.5 + Math.random() * 0.7));
      this.scene.add(s); this.pts.push({ s, v, life: 0.7 + Math.random() * 0.4 });
    }
  }
  update(dt: number) {
    for (let i = this.pts.length - 1; i >= 0; i--) {
      const p = this.pts[i]; p.life -= dt;
      p.v.y -= 6 * dt; p.s.position.addScaledVector(p.v, dt);
      (p.s.material as THREE.SpriteMaterial).opacity = Math.max(0, p.life * 1.4);
      if (p.life <= 0) { this.scene.remove(p.s); (p.s.material as THREE.Material).dispose(); this.pts.splice(i, 1); }
    }
  }
}

/** V10.2 Q13 (R-15): partículas ROSAS del espray (usuario: «que haya partículas rosas de graffitis»): un solo `Points` de 160 con su edad y
 *  tamaño por vértice (una llamada de dibujo, sin un material nuevo por chispa como `Bursts`). Salen de la boquilla hacia el punto que se
 *  pinta en un cono estrecho y se apagan al llegar a la pared; dos rosas mezclados. Con «reducir movimiento» no se emiten. */
export class SprayFx {
  points: THREE.Points; static N = 160; private pos: Float32Array; private vel: Float32Array; private life: Float32Array; private age: Float32Array; private size: Float32Array; private tint: Float32Array; private i = 0; private acc = 0;
  constructor(scene: THREE.Scene) {
    const N = SprayFx.N, g = new THREE.BufferGeometry();
    this.pos = new Float32Array(N * 3); this.vel = new Float32Array(N * 3); this.life = new Float32Array(N); this.age = new Float32Array(N).fill(9); this.size = new Float32Array(N); this.tint = new Float32Array(N);
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3)); g.setAttribute('aAge', new THREE.BufferAttribute(new Float32Array(N).fill(1), 1)); g.setAttribute('aSize', new THREE.BufferAttribute(this.size, 1)); g.setAttribute('aTint', new THREE.BufferAttribute(this.tint, 1));
    const color = new THREE.Color('#F18AAE');
    const m = new THREE.ShaderMaterial({ transparent: true, depthWrite: false, uniforms: { uColor: { value: color }, uColor2: { value: new THREE.Color('#E0478F') }, uScale: { value: 600 } },
      vertexShader: `attribute float aAge; attribute float aSize; attribute float aTint; varying float vA; varying float vT; uniform float uScale;
        void main() { vA = 1.0 - clamp(aAge, 0.0, 1.0); vT = aTint; vec4 mv = modelViewMatrix * vec4(position, 1.0); gl_PointSize = aSize * uScale / max(0.3, -mv.z) * (0.6 + 0.6 * clamp(aAge, 0.0, 1.0)); gl_Position = projectionMatrix * mv; }`,
      fragmentShader: `uniform vec3 uColor; uniform vec3 uColor2; varying float vA; varying float vT;
        void main() { vec2 c = gl_PointCoord - 0.5; float d = dot(c, c); if (d > 0.25) discard; gl_FragColor = vec4(mix(uColor, uColor2, vT), vA * 0.75 * (1.0 - d * 4.0)); }` });
    (m as any).color = color;   // (para las pruebas: el rosa principal)
    this.points = new THREE.Points(g, m); this.points.name = 'SPRAY_FX'; this.points.frustumCulled = false; this.points.userData.live = 0; this.points.visible = false; scene.add(this.points);
  }
  /** Cada fotograma: `src` = boquilla (punto, dirección al punto que pinta, si está pintando); `dist` = distancia de la boquilla a la pared. */
  update(dt: number, src: { p: THREE.Vector3; d: THREE.Vector3; on: boolean } | null, reduced: boolean) {
    const N = SprayFx.N, P = this.pos, Vv = this.vel, ageA = this.points.geometry.attributes.aAge as THREE.BufferAttribute;
    if (src?.on && !reduced) { this.acc += dt * 90;
      while (this.acc >= 1) { this.acc -= 1; const k = this.i; this.i = (this.i + 1) % N;
        const d = src.d.clone().add(new THREE.Vector3((Math.random() - 0.5) * 0.14, (Math.random() - 0.5) * 0.14, (Math.random() - 0.5) * 0.14)).normalize(), sp = 2.6 + Math.random() * 1.2;
        P[k * 3] = src.p.x; P[k * 3 + 1] = src.p.y; P[k * 3 + 2] = src.p.z; Vv[k * 3] = d.x * sp; Vv[k * 3 + 1] = d.y * sp; Vv[k * 3 + 2] = d.z * sp;
        this.life[k] = 0.32 + Math.random() * 0.12; this.age[k] = 0; this.size[k] = 0.012 + Math.random() * 0.012; this.tint[k] = Math.random(); } }
    let live = 0;
    for (let k = 0; k < N; k++) { if (this.age[k] >= this.life[k]) { ageA.setX(k, 1); continue; } live++;
      this.age[k] += dt; P[k * 3] += Vv[k * 3] * dt; P[k * 3 + 1] += Vv[k * 3 + 1] * dt; P[k * 3 + 2] += Vv[k * 3 + 2] * dt; Vv[k * 3 + 1] -= 0.6 * dt; ageA.setX(k, this.age[k] / this.life[k]); }
    this.points.userData.live = live; this.points.visible = live > 0;
    if (live || src?.on) { ageA.needsUpdate = true; (this.points.geometry.attributes.position as THREE.BufferAttribute).needsUpdate = true; (this.points.geometry.attributes.aSize as THREE.BufferAttribute).needsUpdate = true; (this.points.geometry.attributes.aTint as THREE.BufferAttribute).needsUpdate = true; }
  }
}
