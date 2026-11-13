// V10.4 R12 (usuario, 20 oct: «la plaza del inicio no tiene textura, hay que mejorarla que es muy cutre»): el suelo ocre de la plaza de salida
// y de su camino (malla D-BORDE-BLANCO-GRIS de bola_lobby.glb: color por vértice, SIN coordenadas de textura) pasa a un empedrado dibujado en el
// shader con la posición en el mundo (0 bytes de textura): en la plaza, anillos de adoquines alrededor del centro con una cenefa rosa y crema
// y una rosa de los vientos de ocho puntas en el medio (rosa de ANMI y crema); en el camino hacia el parque, adoquín rectangular a matajunta.
// Arenisca cálida con cada piedra de un tono algo distinto (y alguna de barro), juntas finas más oscuras con el canto un poco hundido. El borde
// blanco y gris de la plaza no cambia (solo se pinta el color ocre de la malla). Con su propia clave de programa (lección yy.ts).
import * as THREE from 'three';
import { BOLA } from './bola';

const C = (h: string) => { const c = new THREE.Color(h); return new THREE.Vector3(c.r, c.g, c.b); };   // THREE.Color guarda en lineal
/** Paleta (sRGB) y medidas del empedrado. */
export const PLAZA = {
  ocre: [171, 122, 59],                                   // color por vértice del suelo de la maqueta que se sustituye
  piedra: ['#C89B66', '#DDBB8C'], barro: '#B9764E', junta: '#7F6C57', rosa: '#E07AA6', rosaOsc: '#B04C7E', crema: '#F1E2C4',
  anillo: 0.40, piedraLargo: 0.52, juntaAncho: 0.022, rosaR: 1.62, cenefa: [6.2, 6.62],
};

export function paintPlaza(mesh: THREE.Mesh) {
  const src = [mesh.material].flat()[0] as THREE.MeshStandardMaterial, m = src.clone(); mesh.material = m;
  const c = BOLA.plaza, P = PLAZA, oc = P.ocre.map((v) => v / 255);
  // eje del camino: de la plaza hacia el centro del parque
  const d = new THREE.Vector2(-c.x, -c.z).normalize();
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, {
      bkC: { value: new THREE.Vector2(c.x, c.z) }, bkD: { value: d }, bkOc: { value: new THREE.Vector3(...oc) },
      bkS0: { value: C(P.piedra[0]) }, bkS1: { value: C(P.piedra[1]) }, bkBa: { value: C(P.barro) }, bkJu: { value: C(P.junta) },
      bkRo: { value: C(P.rosa) }, bkRo2: { value: C(P.rosaOsc) }, bkCr: { value: C(P.crema) },
      bkM: { value: new THREE.Vector4(P.anillo, P.piedraLargo, P.juntaAncho, P.rosaR) }, bkCe: { value: new THREE.Vector2(...P.cenefa) }, bkR: { value: c.R },
    });
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec2 vBkPW;')
      .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvBkPW = (modelMatrix * vec4(transformed, 1.0)).xz;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>
varying vec2 vBkPW; uniform vec2 bkC, bkD, bkCe; uniform vec3 bkOc, bkS0, bkS1, bkBa, bkJu, bkRo, bkRo2, bkCr; uniform vec4 bkM; uniform float bkR;
float bkH(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
/* junta: 1 en la línea, 0 en la piedra; d = distancia (m) al borde de la piedra más cercano */
float bkJ(float d, float w) { float f = fwidth(d) + 1e-4; return 1.0 - smoothstep(w - f, w + f, d); }
vec3 bkStone(vec2 id) { float h = bkH(id), k = bkH(id + 17.3); vec3 s = mix(bkS0, bkS1, h); return k > 0.93 ? mix(s, bkBa, 0.75) : s * (0.93 + 0.1 * bkH(id + 3.1)); }`)
      .replace('#include <color_fragment>', `#include <color_fragment>
#ifdef USE_COLOR
if (distance(vColor.rgb, bkOc) < 0.07) {
  vec2 p = vBkPW - bkC; float r = length(p), w = bkM.z; vec3 col; float j = 0.0, edge = 1.0;
  if (r < bkR + 0.05) {
    float a = atan(p.y, p.x);
    if (r < bkM.w) {
      /* rosa de los vientos: 4 puntas largas (rosa, a los ejes) y 4 cortas (crema, en diagonal), de lados rectos; cada punta en dos tonos */
      float q = 1.5707963, e1 = mod(a + q * 0.5, q) - q * 0.5, e2 = mod(a, q) - q * 0.5;
      float rl = 0.26 + (bkM.w - 0.38) * max(0.0, 1.0 - abs(e1) / 0.62), rs = 0.26 + (bkM.w - 0.38) * 0.62 * max(0.0, 1.0 - abs(e2) / 0.62);
      col = mix(bkS0, bkS1, 0.4);
      if (r < rs) col = e2 > 0.0 ? bkCr : bkCr * 0.80;
      if (r < rl) col = e1 > 0.0 ? bkRo : bkRo2;
      if (r < 0.16) col = bkRo2;
      j = max(bkJ(abs(r - bkM.w + 0.06), 0.04), bkJ(abs(r - 0.42), 0.012) * step(rl, 0.42) * step(rs, 0.42));
    } else {
      /* anillos de adoquines al tresbolillo; en la cenefa, piedras rosas y crema alternas */
      float t = (r - bkM.w) / bkM.x, i = floor(t), rr = fract(t), Rm = bkM.w + (i + 0.5) * bkM.x;
      float n = max(8.0, floor(6.2831853 * Rm / bkM.y)), s = (a / 6.2831853 + 0.5) * n + 0.5 * mod(i, 2.0), jj = floor(s), f = fract(s);
      float L = 6.2831853 * Rm / n;
      float dr = min(rr, 1.0 - rr) * bkM.x, da = min(f, 1.0 - f) * L;
      j = max(bkJ(dr, w), bkJ(da, w)); edge = smoothstep(0.0, 0.07, min(dr, da));
      col = bkStone(vec2(i, mod(jj, n)));
      if (Rm > bkCe.x && Rm < bkCe.y) col = mod(jj, 2.0) < 1.0 ? mix(bkRo, bkCr, 0.25) : bkCr;
    }
  } else {
    /* camino: adoquín rectangular (0,30 × 0,60 m) atravesado y a matajunta */
    vec2 n2 = vec2(-bkD.y, bkD.x); float u = dot(p, bkD) / 0.30, v = dot(p, n2) / 0.60;
    float ri = floor(u); float vv = v + 0.5 * mod(ri, 2.0), ci = floor(vv);
    float du = min(fract(u), 1.0 - fract(u)) * 0.30, dv = min(fract(vv), 1.0 - fract(vv)) * 0.60;
    j = max(bkJ(du, w), bkJ(dv, w)); edge = smoothstep(0.0, 0.06, min(du, dv));
    col = bkStone(vec2(ri + 101.0, ci));
  }
  col *= mix(0.86, 1.0, edge);                  /* canto algo hundido junto a la junta */
  diffuseColor.rgb = mix(col, bkJu, j);
}
#endif`);
  };
  m.customProgramCacheKey = () => 'bk_plaza_v104';
  m.needsUpdate = true;
}
