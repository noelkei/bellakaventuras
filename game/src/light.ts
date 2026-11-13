// V5 T5-26 (A1, decisión del usuario 12 oct): luz cálida de tarde en TODO el mapa, moderada y sin coste en MB (solo
// parámetros: sol, hemisferio, cielo, bruma y exposición). Las sombras quedan teñidas de forma natural por el hemisferio
// (ambiente de cielo algo violáceo frente al sol cálido). Ajustes comparables con ?bklight=<id>; el predeterminado es el elegido
// con pares (V5/evidencias/T5-26). 'mediodia' = la luz V4, como control.
export interface LightPreset {
  sun: string; sunI: number; dir: [number, number, number];      // dirección HACIA el sol (se normaliza)
  hemiSky: string; hemiGround: string; hemiI: number;
  skyTop: string; skyMid: string; skyBottom: string; bg: string;
  fog: string; fogNear: number; fogFar: number; exposure: number;
}
export const LIGHTS: Record<string, LightPreset> = {
  mediodia: { sun: '#fff0dc', sunI: 2.6, dir: [-0.45, 0.8, 0.4], hemiSky: '#dff0ff', hemiGround: '#b9a98f', hemiI: 1.15,
    skyTop: '#5fa8e8', skyMid: '#bfe0f7', skyBottom: '#fbe9d8', bg: '#bfe0f7', fog: '#d6e6f0', fogNear: 60, fogFar: 235, exposure: 1.02 },
  // A: tarde suave (sol a ~34°, color miel), sombra ligeramente lavanda
  tarde_a: { sun: '#ffd9a8', sunI: 2.75, dir: [-0.62, 0.6, 0.5], hemiSky: '#d9dcf2', hemiGround: '#c2a487', hemiI: 1.05,
    skyTop: '#6aa6e0', skyMid: '#cfe0ee', skyBottom: '#ffdcbc', bg: '#cfe0ee', fog: '#e8dccd', fogNear: 60, fogFar: 235, exposure: 1.03 },
  // B: tarde dorada (sol a ~28°, más naranja), sombra violeta
  tarde_b: { sun: '#ffc98a', sunI: 2.9, dir: [-0.7, 0.5, 0.52], hemiSky: '#cfd2ef', hemiGround: '#c49a7c', hemiI: 1.0,
    skyTop: '#719fd6', skyMid: '#dcdfe8', skyBottom: '#ffcfa6', bg: '#dcdfe8', fog: '#efd8c2', fogNear: 55, fogFar: 230, exposure: 1.04 },
  // C: como A con algo más de contraste sol/sombra (ambiente más bajo)
  tarde_c: { sun: '#ffd4a0', sunI: 3.0, dir: [-0.64, 0.56, 0.52], hemiSky: '#d2d6f0', hemiGround: '#bb9c82', hemiI: 0.92,
    skyTop: '#6aa3dc', skyMid: '#d4e0ec', skyBottom: '#ffd7b4', bg: '#d4e0ec', fog: '#ead9c8', fogNear: 60, fogFar: 235, exposure: 1.04 },
};
export const DEFAULT_LIGHT = 'tarde_a';
export function lightPreset(): { id: string; p: LightPreset } {
  const q = new URLSearchParams(location.search).get('bklight');
  const id = q && LIGHTS[q] ? q : DEFAULT_LIGHT;
  return { id, p: LIGHTS[id] };
}
