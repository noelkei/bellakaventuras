// V4-CAM-02 · Disolución por tramado de la geometría del MUNDO muy cercana a la cámara. Troncos de palmera, farolas y
// postes son colliders «finos» que la cámara ignora a propósito (si los esquivara, cortaría el plano al pasar junto a
// ellos), pero entonces podían llenar media pantalla (recorrido NMG-06). Entre `near1` y `near0` metros de la cámara el
// fragmento se descarta con una matriz de Bayer 4×4 (sin transparencias ni orden de dibujado; la colisión no cambia).
// Solo se parchea la raíz del parque: ANMI, NPCs, coches, premios y cielo quedan intactos.
import * as THREE from 'three';

export const CAM_FADE = { near0: 1.1, near1: 2.0 };   // m: < near0 invisible; near0…near1 tramado creciente
export const camFadeUniform = { value: new THREE.Vector2(CAM_FADE.near0, CAM_FADE.near1) };
/** R11 (CAM-02): segmento cámara → cabeza de ANMI (mundo), lo actualiza el juego cada fotograma. El FOLLAJE (copas de árbol, hojas)
 *  se trama solo cerca de ese segmento: la copa que tapa a ANMI se abre; el resto del árbol se ve entero. */
export const camSeg = { a: { value: new THREE.Vector3() }, b: { value: new THREE.Vector3(0, -1000, 0) } };
const uniforms = { uCamFade: camFadeUniform, uSegA: camSeg.a, uSegB: camSeg.b };
/** V10.5 (S-01, E5-33): ancho (en coordenadas del mapa de sombras, 0–0,5) del borde desvanecido de la zona de sombras: 0 = como siempre (borde
 *  duro, sin cambio); 0,12 en el Modo eficiente (zona de 28 m: la sombra se apaga suave hacia los 14 m en vez de cortarse). Uniforme compartido:
 *  cambiarlo no recompila nada. */
export const shadowEdge = { value: 0 };
const sedgeDone = new WeakSet<THREE.Material>();
const SHADOW_RET = 'return mix( 1.0, shadow, shadowIntensity );';
function patchShadowEdge(m: THREE.Material) {
  if (sedgeDone.has(m)) return; sedgeDone.add(m);
  if (!(m as any).isMeshStandardMaterial && !(m as any).isMeshLambertMaterial && !(m as any).isMeshPhongMaterial) return;
  const prev = m.onBeforeCompile.bind(m), prevKey = m.customProgramCacheKey.bind(m);
  m.onBeforeCompile = (sh, r) => {
    prev(sh, r);
    sh.uniforms.uShadowEdge = shadowEdge;
    const chunk = THREE.ShaderChunk.shadowmap_pars_fragment, cut = chunk.indexOf('getPointShadow');
    const head = (cut > 0 ? chunk.slice(0, cut) : chunk).split(SHADOW_RET).join('{ vec2 se = min( shadowCoord.xy, 1.0 - shadowCoord.xy ); float sk = uShadowEdge > 0.0 ? smoothstep( 0.0, uShadowEdge, min( se.x, se.y ) ) : 1.0; return mix( 1.0, shadow, shadowIntensity * sk ); }');
    sh.fragmentShader = sh.fragmentShader.replace('#include <shadowmap_pars_fragment>', 'uniform float uShadowEdge;\n' + head + (cut > 0 ? chunk.slice(cut) : ''));
  };
  m.customProgramCacheKey = () => prevKey() + '|sedge';
  m.needsUpdate = true;
}
const FOLIAGE_MAT = /^(M_tree_|M_veg_canopy|M_plant_)/;
const done = new WeakSet<THREE.Material>();

function patch(m: THREE.Material, foliage = false, sign = false) {
  if (done.has(m)) return; done.add(m);
  if (!(m as any).isMeshStandardMaterial && !(m as any).isMeshLambertMaterial && !(m as any).isMeshBasicMaterial && !(m as any).isMeshPhongMaterial) return;
  if (m.transparent && (m as any).depthWrite === false) return;   // calcomanías/decals: son planas y no tapan
  const prev = m.onBeforeCompile.bind(m), prevKey = m.customProgramCacheKey.bind(m);
  m.onBeforeCompile = (sh, r) => {
    prev(sh, r);
    sh.uniforms.uCamFade = uniforms.uCamFade;
    if (foliage) { sh.uniforms.uSegA = uniforms.uSegA; sh.uniforms.uSegB = uniforms.uSegB; }
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying float vCamDist;' + (foliage ? '\nvarying vec3 vCamWP;' : ''))
      .replace('#include <project_vertex>', '#include <project_vertex>\nvCamDist = length(mvPosition.xyz);' + (foliage ? `
#ifdef USE_INSTANCING
vCamWP = (modelMatrix * instanceMatrix * vec4(transformed, 1.0)).xyz;
#else
vCamWP = (modelMatrix * vec4(transformed, 1.0)).xyz;
#endif` : ''));
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying float vCamDist; uniform vec2 uCamFade;' + (foliage ? '\nvarying vec3 vCamWP; uniform vec3 uSegA; uniform vec3 uSegB;' : ''))
      .replace('void main() {', `void main() {${foliage ? `
  {
    vec3 ab = uSegB - uSegA; float tt = clamp(dot(vCamWP - uSegA, ab) / max(dot(ab, ab), 1e-4), 0.0, 1.0);
    float dd = length(vCamWP - (uSegA + ab * tt));
    if (tt < 0.94 && dd < ${sign ? '1.8' : '1.2'}) {
      float a2 = smoothstep(${sign ? '1.0, 1.8' : '0.6, 1.2'}, dd);
      ivec2 q2 = ivec2(mod(gl_FragCoord.xy, 4.0)); int i2 = q2.x + q2.y * 4;
      float b2 = float(i2 == 0 ? 0 : i2 == 1 ? 8 : i2 == 2 ? 2 : i2 == 3 ? 10 : i2 == 4 ? 12 : i2 == 5 ? 4 : i2 == 6 ? 14 : i2 == 7 ? 6 : i2 == 8 ? 3 : i2 == 9 ? 11 : i2 == 10 ? 1 : i2 == 11 ? 9 : i2 == 12 ? 15 : i2 == 13 ? 7 : i2 == 14 ? 13 : 5) / 16.0 + 1.0 / 32.0;
      if (a2 < b2) discard;
    }
  }` : ''}
  if (vCamDist < uCamFade.y) {
    if (!gl_FrontFacing) discard;   // interior de un sólido de doble cara ya recortado por delante (tronco GLB)
    float a = smoothstep(uCamFade.x, uCamFade.y, vCamDist);
    ivec2 q = ivec2(mod(gl_FragCoord.xy, 4.0));
    int i = q.x + q.y * 4;
    float b = float(i == 0 ? 0 : i == 1 ? 8 : i == 2 ? 2 : i == 3 ? 10 : i == 4 ? 12 : i == 5 ? 4 : i == 6 ? 14 : i == 7 ? 6 : i == 8 ? 3 : i == 9 ? 11 : i == 10 ? 1 : i == 11 ? 9 : i == 12 ? 15 : i == 13 ? 7 : i == 14 ? 13 : 5) / 16.0 + 1.0 / 32.0;
    if (a < b) discard;
  }`);
  };
  m.customProgramCacheKey = () => prevKey() + (sign ? '|camfade-sign' : foliage ? '|camfade-fol' : '|camfade');
  m.needsUpdate = true;
}

/** Parchea (una sola vez por material) todos los materiales bajo `root`; barato de repetir para piezas cargadas después. */
export function applyCamFade(root: THREE.Object3D) {
  let n = 0;
  root.traverse((o) => {
    const mesh = o as THREE.Mesh; if (!mesh.isMesh) return;
    for (const m of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) if (m && mesh.receiveShadow && !sedgeDone.has(m)) { patchShadowEdge(m); n++; }   // V10.5 (S-01): también los suelos
    if (/ground|floor|decal|AREA_/i.test(mesh.name)) return;   // suelos y marcas: nunca tapan y no deben tramarse bajo la cámara
    for (const m of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) { if (!done.has(m)) { { const sign = /_LETTERING$/.test(mesh.name) || /_LETTERING$/.test(mesh.parent?.name ?? '') || m.name === 'M_black'; patch(m, sign || /\|leaf/.test(mesh.name) || FOLIAGE_MAT.test(m.name), sign); } n++; } }   // R11 (CAM-01): tableros de los carteles
  });
  return n;
}
