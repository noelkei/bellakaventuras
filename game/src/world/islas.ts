// V10.3 R4 (V-01, V-03, U-07, W-D27, W-D28, R3-12): TODAS las plantas de dentro de los escenarios en islas como las de NO ME GUILLO (la pieza
// `bed` del kit NMG: 1,9 × 1,9 m, bordillo y tierra marrón clara, sin colisión a propósito), con su palmera o su árbol en el centro y matas
// alrededor apoyadas en la tierra (como NMG: 3 matas por isla). Fuera de NMG solo las matas A y B (cada tipo son 4–7 llamadas de dibujo por
// grupo; presupuesto de perf, como ya hacía TT). Los sitios salen de una búsqueda de huecos libres en el mapa de V10.3
// (V10/IT6/tools/islas_huecos.mjs, islas_centro.mjs): sin colisiones a 1,25 m, a ras de suelo y a ≥ 2,2 m de patatas, zonas de actividad,
// radiocasetes, carteles y escaleras; en las esquinas de cada zona junto a los paseos (donde están las de NMG), no en las líneas de skate.
// En SECRETNOVIO van dentro del centro, junto al muro A y la recepción D, fuera de la pista de los coches, y suben con la revelación.
import { Builder, Place } from './geo';
import { palm, nmgPlant, nmgTree, rot, PROP_SLOTS } from './props';
import { NMG_SLOTS, BED_SOIL, NMG_KIT } from './nmg';
import { coronaTh, polar } from './manifest';
const D2R = Math.PI / 180;
import { snW } from './sn';
import * as THREE from 'three';

type Mata = 'a' | 'a_flor' | 'b' | 'c';
export interface Isla { zona: string; r?: number; da?: number; sn?: [number, number]; centro?: 'palm' | 'palm_lean' | 'tree'; matas: Mata[] }

/** Ejes de las zonas (θ sin el giro de la corona, como en manifest.ts). */
const EJE: Record<string, number> = { no_me_guillo: 36, fashion_girl: 108, tratratra: 180, yinyang: 252, nosvamosdeaqui: 324 };

export const ISLAS: Isla[] = [
  // NO ME GUILLO: las 5 matas sueltas junto al paseo exterior pasan a dos islas (las 4 islas con palmera de siempre siguen en nmg.ts)
  { zona: 'no_me_guillo', r: 36.8, da: -10.5, matas: ['b', 'a', 'c'] },
  { zona: 'no_me_guillo', r: 36.8, da: 9, matas: ['a_flor', 'b', 'c'] },
  // TRA TRA TRA: sus 2 palmeras y su árbol con matas alrededor (antes 22 matas sueltas, algunas dentro de los pilares y en los paseos)
  { zona: 'tratratra', r: 32, da: -28.5, centro: 'palm_lean', matas: ['a', 'b', 'b'] },
  { zona: 'tratratra', r: 36.4, da: -25.5, centro: 'tree', matas: ['a', 'b'] },
  { zona: 'tratratra', r: 34, da: 25.5, centro: 'palm_lean', matas: ['b', 'a', 'b'] },
  { zona: 'tratratra', r: 26.8, da: -22.5, matas: ['a', 'b', 'a'] },
  { zona: 'tratratra', r: 26.8, da: 19.5, matas: ['b', 'a', 'b'] },
  // FASHION GIRL (U-07: plantas nuevas)
  { zona: 'fashion_girl', r: 26.8, da: -30, centro: 'palm', matas: ['a', 'b', 'b'] },
  { zona: 'fashion_girl', r: 36.4, da: -30, matas: ['a', 'b', 'b'] },
  { zona: 'fashion_girl', r: 26.8, da: 21, matas: ['b', 'a', 'b'] },
  { zona: 'fashion_girl', r: 36.4, da: 27, centro: 'palm', matas: ['b', 'a', 'b'] },
  // NOSVAMOSDEAQUÍ: sus 3 palmeras en isla (la que estaba pegada a la isla de NMG pasa a su lado del sector, V-04) + matas nuevas
  { zona: 'nosvamosdeaqui', r: 36.4, da: -24.5, centro: 'palm', matas: ['a', 'b', 'b'] },   // (en −27 la palmera cortaba la recta libre de 114 m de speed-matrix y persist-matrix)
  { zona: 'nosvamosdeaqui', r: 36.8, da: 10.5, centro: 'palm', matas: ['b', 'a', 'b'] },   // (en r 26,8 quedaba bajo el raíl RG1)
  { zona: 'nosvamosdeaqui', r: 36.8, da: 28.5, centro: 'palm', matas: ['b', 'a', 'b'] },
  // SECRETNOVIO (W-D28): marco del reto [x, z] (A en −Z, D en +Z), solo matas (sin troncos que tapen el salto); suben con la revelación
  { zona: 'secretnovio', sn: [-8, -11.25], matas: ['a', 'b', 'b'] },
  { zona: 'secretnovio', sn: [9.25, -11], matas: ['b', 'a', 'b'] },
  { zona: 'secretnovio', sn: [-7.5, 9.5], matas: ['b', 'b', 'a'] },
  { zona: 'secretnovio', sn: [7.5, 9.5], matas: ['a', 'b', 'b'] },
];

// (perf-v8: NVDA comparte las mallas de TT —el mismo grupo de culling para dos zonas vecinas de YY— en vez de tener las suyas)
const GRUPO: Record<string, string | undefined> = { tratratra: 'tt', fashion_girl: 'fg', nosvamosdeaqui: 'tt', secretnovio: 'sn' };

/** Sitio de una isla (centro y giro: un lado mirando al centro del parque). */
export function islaPlace(I: Isla): Place {
  if (I.sn) { const p = snW(new THREE.Vector3(I.sn[0], 0, I.sn[1])); return { x: p.x, z: p.z, yaw: Math.atan2(p.x, p.z) }; }
  const th = coronaTh(EJE[I.zona] + (I.da ?? 0)), p = polar(I.r!, th); return { x: p.x, z: p.z, yaw: -th * D2R };
}

/** Pone todas las islas: la pieza `bed` (ranura del kit NMG; las de SN, marcadas para subir con la revelación) y sus plantas. */
export function buildIslas(b: Builder) {
  const bed = (NMG_KIT as any).bed;
  ISLAS.forEach((I, i) => {
    const pl = islaPlace(I), first = PROP_SLOTS.length;
    NMG_SLOTS.push({ piece: 'bed', place: pl, sn: !!I.sn } as any);
    if (!I.sn) { const c = b.chunk; b.chunk = 'proxy_nmgkit_bed'; try { b.box(pl, bed.w, bed.h, bed.d, { mat: 'dirt', collide: false, shadow: false }); } finally { b.chunk = c; } }
    if (I.centro === 'palm' || I.centro === 'palm_lean') palm(b, { ...pl, y: 0 }, 5.6 + (i % 3) * 0.3, I.centro === 'palm_lean' ? 0.16 : 0.08, 7 + i, true);
    if (I.centro === 'tree') nmgTree(b, { ...pl, y: 0 }, 'round', 4.0);
    I.matas.forEach((v, k) => {
      const ang = i * 0.9 + k * 2.094 + 0.35 + (k % 2 ? 0.15 : -0.1), rr = I.centro ? (v === 'b' ? 0.46 : 0.5) : 0.42 + 0.06 * (k % 2);
      const sc = (v === 'c' ? 0.9 : v === 'b' ? 0.78 : 0.92) * [1.0, 0.92, 1.06, 0.96][(i + k) % 4];
      const q = rot(pl, Math.cos(ang) * rr, BED_SOIL, Math.sin(ang) * rr);
      nmgPlant(b, { ...q, yaw: (pl.yaw ?? 0) - ang + (v === 'b' ? Math.PI / 2 : 0.4 * k) }, v, sc);
    });
    const g = GRUPO[I.zona]; if (g) for (let k = first; k < PROP_SLOTS.length; k++) PROP_SLOTS[k].group = g;
  });
}
