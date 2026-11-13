// V10.3 R3 (U-15, usuario: «paleta A v2… su color, muy suave», sin verde): el suelo de losas de los cinco escenarios (material `nmg_floor`,
// la misma textura para todos) se tiñe por zona sobre la textura actual (las losas grises con manchas de pintura se conservan). La frontera
// entre dos zonas NO es un corte recto: un borde irregular (ruido suave + losas de 1,6 m que cambian de color de forma salteada, ±1,6 m)
// con el MISMO tipo de irregularidad, ancho y suavidad en las cinco fronteras de sector (9°, 81°, 153°, 225° y 297°). Sin texturas nuevas
// ni llamadas de dibujo: un trozo de shader en el material (con su propia clave de programa, lección yy.ts). Paseos rosas, asfalto, SN y
// exterior no usan este material y no cambian. Receta de los colores: V10/IT5/propuestas_suelo/propuestas_v2.py (tinte mix(1, objetivo/base,
// 0,85) en lineal).
import * as THREE from 'three';
import { CORONA_ROT_DEG } from './manifest';

/** Color de las losas por zona en el orden de los sectores desde 9° (NMG, FG, TT, YY, NVDA) y el gris actual de la textura. */
export const SUELO = { base: '#B0A89E', zonas: ['#B9AEB2', '#B4ADC6', '#C6B9A4', '#A9B2C4', '#CBB3A5'], mezcla: 0.85, banda: 0.35 };

export function tintFloor(mat: THREE.MeshStandardMaterial) {
  const base = new THREE.Color(SUELO.base);   // THREE.Color guarda en lineal
  const tints = SUELO.zonas.map((h) => { const c = new THREE.Color(h); return new THREE.Vector3(
    THREE.MathUtils.lerp(1, c.r / base.r, SUELO.mezcla), THREE.MathUtils.lerp(1, c.g / base.g, SUELO.mezcla), THREE.MathUtils.lerp(1, c.b / base.b, SUELO.mezcla)); });
  const first = CORONA_ROT_DEG;   // primera frontera: el eje de NMG − 36° = 0° + giro de la corona (9°)
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.bkTints = { value: tints }; sh.uniforms.bkFirst = { value: first }; sh.uniforms.bkBand = { value: SUELO.banda };
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec2 vBkW;')
      .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvBkW = (modelMatrix * vec4(transformed, 1.0)).xz;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>
varying vec2 vBkW; uniform vec3 bkTints[5]; uniform float bkFirst; uniform float bkBand;
float bkHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float bkNoise(vec2 p) { vec2 i = floor(p), f = fract(p), u = f * f * (3.0 - 2.0 * f);
  return mix(mix(bkHash(i), bkHash(i + vec2(1.0, 0.0)), u.x), mix(bkHash(i + vec2(0.0, 1.0)), bkHash(i + vec2(1.0, 1.0)), u.x), u.y); }
vec3 bkTint(int i) { return i == 0 ? bkTints[0] : i == 1 ? bkTints[1] : i == 2 ? bkTints[2] : i == 3 ? bkTints[3] : bkTints[4]; }`)
      .replace('#include <map_fragment>', `#include <map_fragment>
{ float r = length(vBkW), th = degrees(atan(vBkW.x, -vBkW.y));
  float t = mod(th - bkFirst + 720.0, 360.0), fi = floor(t / 72.0), loc = t - fi * 72.0;
  int i = int(fi); int j = loc < 36.0 ? (i + 4) - 5 * ((i + 4) / 5) : (i + 1) - 5 * ((i + 1) / 5);
  float d = radians(min(loc, 72.0 - loc)) * r;   /* distancia a la frontera más cercana (m), positiva dentro de la zona i */
  float off = 1.0 * (bkNoise(vBkW * 0.35) * 2.0 - 1.0) + 0.6 * (bkHash(floor(vBkW / 1.6)) * 2.0 - 1.0);
  float side = loc < 36.0 ? 1.0 : -1.0;   /* el ruido es del mundo: el mismo borde visto desde las dos zonas */
  float k = smoothstep(-bkBand, bkBand, d + side * off);
  diffuseColor.rgb *= mix(bkTint(j), bkTint(i), k); }`);
  };
  mat.customProgramCacheKey = () => 'bk_suelo_v103';
  mat.needsUpdate = true;
}
