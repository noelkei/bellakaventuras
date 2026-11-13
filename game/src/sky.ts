// V10 IT3 (usuario, 18 oct: «nubes en 3D, del estilo low-poly del juego, con estratos de atardecer, y el sol también low-poly con
// resplandor que tiñe el cielo; no tiene que ser súper detallado porque lo veremos de lejos»). Tres piezas, todas sin niebla (están más
// allá de la niebla del parque) y sin sombras:
//   · cielo: el degradado de siempre + resplandor rosado alrededor del sol + estratos rosa-melocotón finos y rotos sobre los tejados
//     (en el propio shader de la cúpula: 0 triángulos, 0 bytes);
//   · sol: disco amarillo redondo y halo suave (usuario: «solo amarillo, más redondo, más lejos, resplandor al 50 %»), en la dirección
//     real del sol del juego, mirando al centro del parque;
//   · nubes: cúmulos de icosaedros achatados (las copas de los árboles son igual de facetadas), rosas e iluminados por el sol del juego;
//     una sola malla instanciada en anillo lejano (r 170–250 m, 55–95 m de alto); derivan muy despacio salvo con «reducir movimiento».
import * as THREE from 'three';

export interface SkyColors { skyTop: string; skyMid: string; skyBottom: string }

/** Material de la cúpula: degradado + resplandor del sol + estratos de atardecer. */
export function skyMaterial(P: SkyColors, sunDir: THREE.Vector3) {
  return new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: {
      top: { value: new THREE.Color(P.skyTop) }, mid: { value: new THREE.Color(P.skyMid) }, bottom: { value: new THREE.Color(P.skyBottom) },
      sunDir: { value: sunDir.clone().normalize() }, glow: { value: new THREE.Color('#f7b3c4') }, strata: { value: new THREE.Color('#f6b2ae') },
    },
    vertexShader: 'varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: `uniform vec3 top; uniform vec3 mid; uniform vec3 bottom; uniform vec3 sunDir; uniform vec3 glow; uniform vec3 strata; varying vec3 vP;
      float band(float h, float a, float h0, float w, float ph) {
        float y = h0 + 0.014 * sin(a * 3.0 + ph) + 0.006 * sin(a * 11.0 + ph * 2.3); float d = (h - y) / w;
        float brk = smoothstep(0.25, 0.75, (0.5 + 0.5 * sin(a * 5.0 + ph * 3.1)) * (0.6 + 0.4 * sin(a * 17.0 + ph)));   // franjas rotas
        return exp(-d * d) * brk; }
      void main(){ vec3 P = normalize(vP); float h = P.y; vec3 c = h > 0.0 ? mix(mid, top, pow(h, 0.6)) : mix(mid, bottom, min(1.0, -h * 4.0));
        float s = max(dot(P, normalize(sunDir)), 0.0);
        c = mix(c, glow, pow(s, 3.0) * 0.1 + pow(s, 10.0) * 0.225);                      // resplandor que tiñe el cielo alrededor del sol (al 50 %, usuario)
        float a = atan(P.z, P.x);
        float st = band(h, a, 0.20, 0.010, 1.0) * 0.75 + band(h, a, 0.25, 0.007, 2.0) * 0.6 + band(h, a, 0.31, 0.012, 3.0) * 0.45 + band(h, a, 0.37, 0.006, 4.0) * 0.3;
        c = mix(c, mix(strata, glow, s), clamp(st * (0.75 + 0.5 * s), 0.0, 0.8));          // estratos, más encendidos hacia el sol
        gl_FragColor = vec4(c, 1.0); }`,
  });
}

/** Sol (usuario: «solo amarillo, no tan geométrico, más redondo, un poco más lejos, resplandor al 50 %»): disco amarillo de 28 lados
 *  (centro algo más claro) y halo amarillo suave a la mitad de opacidad, a `dist` m en la dirección del sol, mirando al centro del parque. */
export function lowPolySun(sunDir: THREE.Vector3, dist = 390) {
  const g = new THREE.Group(); g.name = 'SKY_SUN';
  const R = 13, seg = 28;
  const disc = new THREE.CircleGeometry(R, seg), pos = disc.attributes.position, col = new Float32Array(pos.count * 3);
  const centro = new THREE.Color('#fff2a8'), borde = new THREE.Color('#ffd23c'), c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) { c.copy(centro).lerp(borde, Math.hypot(pos.getX(i), pos.getY(i)) / R); col.set([c.r, c.g, c.b], i * 3); }
  disc.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const mDisc = new THREE.MeshBasicMaterial({ vertexColors: true, fog: false, depthWrite: false, toneMapped: false });
  const halo = new THREE.RingGeometry(R, R * 2.6, seg, 1), hp = halo.attributes.position, ha = new Float32Array(hp.count * 4);
  const hc = new THREE.Color('#ffe08a');
  for (let i = 0; i < hp.count; i++) { const t = (Math.hypot(hp.getX(i), hp.getY(i)) - R) / (R * 1.6); ha.set([hc.r, hc.g, hc.b, 0.21 * (1 - t)], i * 4); }
  halo.setAttribute('color', new THREE.BufferAttribute(ha, 4));
  const mHalo = new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, fog: false, depthWrite: false, toneMapped: false });
  const dm = new THREE.Mesh(disc, mDisc), hm = new THREE.Mesh(halo, mHalo); hm.position.z = -0.5;
  dm.renderOrder = hm.renderOrder = -9; g.add(hm, dm);
  g.position.copy(sunDir).normalize().multiplyScalar(dist); g.lookAt(0, 0, 0);
  g.traverse((o) => { o.frustumCulled = false; });
  return g;
}

/** Nubes low-poly instanciadas; `reduced()` se consulta cada fotograma (deriva parada con «reducir movimiento»). */
export function lowPolyClouds(reduced: () => boolean) {
  const rng = mulberry(18), blobs: THREE.Matrix4[] = [], q = new THREE.Quaternion(), e = new THREE.Euler(), s = new THREE.Vector3(), p = new THREE.Vector3();
  const N = 12, centers: THREE.Vector3[] = [], clusterSize: number[] = [], Y = new THREE.Vector3(0, 1, 0);
  for (let i = 0; i < N; i++) {
    const a = (i / N) * Math.PI * 2 + (rng() - 0.5) * 0.35, r = 170 + rng() * 80, y = 55 + rng() * 40, size = 0.7 + rng() * 0.6;
    const cx = Math.cos(a) * r, cz = Math.sin(a) * r, tx = -Math.sin(a), tz = Math.cos(a);   // a lo largo del anillo (tangente)
    const k = 5 + Math.floor(rng() * 3); centers.push(new THREE.Vector3(cx, 0, cz)); clusterSize.push(k);
    for (let j = 0; j < k; j++) {
      const t = (j / (k - 1) - 0.5) * 2, w = (1 - 0.45 * t * t) * (9 + rng() * 5) * size;   // más gordas en el centro
      p.set(cx + tx * t * 16 * size + (rng() - 0.5) * 4, y + (1 - t * t) * 4 * size + (rng() - 0.5) * 2, cz + tz * t * 16 * size + (rng() - 0.5) * 4);
      s.set(w, w * (0.55 + rng() * 0.15), w * (0.8 + rng() * 0.3)); q.setFromEuler(e.set(rng() * 0.4, rng() * Math.PI * 2, rng() * 0.4));
      blobs.push(new THREE.Matrix4().compose(p, q, s));
    }
  }
  const geo = new THREE.IcosahedronGeometry(1, 0);   // 20 triángulos por bola
  // ligeramente translúcidas (usuario): con escritura de profundidad, cada nube se ve por su cara delantera (sin bolas internas)
  const mat = new THREE.MeshLambertMaterial({ color: '#f6bcd0', emissive: '#8a4a68', emissiveIntensity: 0.35, flatShading: true, fog: false, transparent: true, opacity: 0.82 });
  const im = new THREE.InstancedMesh(geo, mat, blobs.length); im.name = 'SKY_CLOUDS';
  blobs.forEach((m, i) => im.setMatrixAt(i, m)); im.instanceMatrix.needsUpdate = true; im.computeBoundingSphere();
  im.castShadow = false; im.receiveShadow = false; im.frustumCulled = false; im.renderOrder = -8;
  const g = new THREE.Group(); g.name = 'SKY_CLOUDS_ROOT'; g.add(im);
  // V10.4 R18: con el logo de Bellakaciones en reposo en el cielo, las nubes que pasan por delante de él (±24° de su dirección vista desde el
  // centro) se recogen y vuelven al salir de ese cono (se comprueba cada 0,5 s; giran ~40 min por vuelta)
  const owner: number[] = []; { let n = 0; for (let i = 0; i < N; i++) { const k = clusterSize[i]; for (let j = 0; j < k; j++) owner[n++] = i; } }
  const zero = new THREE.Matrix4().makeScale(0, 0, 0), hidden = new Array(N).fill(false), v = new THREE.Vector3(); let nextCheck = 0;
  const avoid = (g.userData.avoid = { dir: null as THREE.Vector3 | null });
  im.onBeforeRender = () => { if (!reduced()) g.rotation.y = (performance.now() / 1000) * 0.0025;   // ~40 min por vuelta
    const now = performance.now(); if (now < nextCheck) return; nextCheck = now + 500;
    let changed = false;
    for (let i = 0; i < N; i++) { v.copy(centers[i]).applyAxisAngle(Y, g.rotation.y).setY(0).normalize();
      const h = !!avoid.dir && v.dot(avoid.dir) > Math.cos(24 * Math.PI / 180); if (h !== hidden[i]) { hidden[i] = h; changed = true; } }
    if (changed) { blobs.forEach((m, k) => im.setMatrixAt(k, hidden[owner[k]] ? zero : m)); im.instanceMatrix.needsUpdate = true; } };
  return g;
}

function mulberry(seed: number) { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
