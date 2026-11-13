// V10.2 Q13 (D-13) · GRAFITEAR: tiempos y trazo comunes a la animación de ANMI (anmi.ts), al dibujo que se revela (activities.ts) y a
// las partículas (fx.ts). Usuario: «que mueva la mano como de arriba abajo y de izquierda a derecha, como un zigzag, empieza izquierda,
// luego derecha, luego izquierda y acaba en derecha».
import * as THREE from 'three';
/** Duración total (~3 s, D-13); coger la lata de la cadera al principio y guardarla al final. */
export const SPRAY = { sec: 2.9, grab: 0.45, stow: 0.4 };
/** Progreso del trazo (0–1) en el segundo `t` del grafiti (0 mientras coge la lata, 1 mientras la guarda). */
export const strokeK = (t: number) => THREE.MathUtils.clamp((t - SPRAY.grab) / (SPRAY.sec - SPRAY.grab - SPRAY.stow), 0, 1);
/** Punto del trazo en el dibujo (x a la derecha, y arriba, en fracciones de su ancho y alto, −0,5…0,5): tres barridos izquierda → derecha →
 *  izquierda → derecha, bajando, con una pausa breve en cada extremo (como el brazo de verdad). */
export function zigzag(k: number, amp = 0.42): [number, number] {
  const s = Math.min(2, Math.floor(k * 3)), f = k * 3 - s, e = f * f * (3 - 2 * f), xs = [-amp, amp, -amp, amp];
  return [xs[s] + (xs[s + 1] - xs[s]) * e, 0.34 - 0.68 * k];
}
/** Lo que la animación necesita del grafiti en curso: dónde está (centro, normal hacia fuera, «arriba»), su tamaño y el segundo actual. */
export interface SprayJob { p: THREE.Vector3; n: THREE.Vector3; u: THREE.Vector3; w: number; h: number; t: number }
/** Punto del dibujo al que apunta la boquilla en el segundo t. */
export function sprayAim(j: SprayJob, reduced: boolean) {
  const r = new THREE.Vector3().crossVectors(j.u, j.n).normalize(), [x, y] = zigzag(strokeK(j.t), reduced ? 0.3 : 0.42);
  return j.p.clone().addScaledVector(r, x * j.w).addScaledVector(j.u, y * j.h);
}
