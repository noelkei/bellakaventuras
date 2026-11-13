// V5 T5-17 · Variante C′ «dirección por gesto a pie» (HUM-A5-014, DT-15). SOLO detrás de `?bkctl=gesto` (no publicada);
// el perfil por defecto sigue siendo T+. A pie y con el stick táctil mandando, el gesto señala una dirección del mundo:
//  · base = proyección horizontal de la vista real de la cámara AL EMPEZAR el gesto (si es degenerada, el rumbo de ANMI);
//  · se renueva al soltar el pulgar, al recentrar la cámara, al cambiar de modo (a pie ↔ tabla) o al cancelar (clear);
//  · rumbo objetivo = base − ángulo del pulgar (arriba = de frente a la vista, derecha = a la derecha de la vista);
//  · el giro sale por el canal normal (mismo `walkTurnRate`) y, mientras el error es grande, sin propulsión: el controlador
//    da los pasos cortos de `walkTurnStep` (HUM-A5-007);
//  · lateral puro (pulgar a > 67,5° de la vertical): propulsión limitada a `walkTurnStep` también DESPUÉS de alinear;
//  · mover la cámara a mano durante el gesto no cambia la intención activa (la base no se recalcula hasta soltar).
// La salida es un `InputFrame` normal (move.x = giro, move.y = propulsión) para no tocar el controlador.
import * as THREE from 'three';
import type { InputFrame } from './input';
import { TUNING } from './tuning';

const T = TUNING;
const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));
/** Valor de canal que, tras la zona muerta del controlador (reescalada), da `out`. */
const undead = (out: number, d: number) => (out === 0 ? 0 : Math.sign(out) * (d + Math.min(1, Math.abs(out)) * (1 - d)));

export const GESTURE_ON = new URLSearchParams(location.search).get('bkctl') === 'gesto';

export interface GestureIn { stickDriving: boolean; stickRaw: { x: number; y: number; m: number }; gestureId: number }
export interface GestureSkater { onFoot: boolean; heading: number; loco: string }

export class GestureDrive {
  base: number | null = null;
  private gid = -1; private loco = ''; private rc = -1;
  /** Último cálculo (pruebas). */
  last = { active: false, base: 0, target: 0, err: 0, lateral: false };

  apply(f: InputFrame, inp: GestureIn, s: GestureSkater, camFwd: THREE.Vector3, recenterCount: number): InputFrame {
    const active = GESTURE_ON && s.onFoot && inp.stickDriving;
    const recentered = recenterCount !== this.rc;
    if (!active || inp.gestureId !== this.gid || s.loco !== this.loco) this.base = null;
    this.gid = inp.gestureId; this.loco = s.loco; this.rc = recenterCount;
    if (!active) { this.last.active = false; return f; }
    // recentrar: la vista va a ponerse detrás de ANMI (destino del recentrado), no a medio giro → base = rumbo de ANMI
    if (recentered) this.base = s.heading;
    if (this.base === null) {
      const h = Math.hypot(camFwd.x, camFwd.z);
      this.base = h > 1e-3 ? Math.atan2(camFwd.x, camFwd.z) : s.heading;
    }
    const { x, y, m } = inp.stickRaw;
    const g = Math.atan2(x, y);                         // 0 = arriba, + = derecha
    const target = wrap(this.base - g);                 // derecha = rumbo decreciente (convención del controlador)
    const err = wrap(target - s.heading);
    const steer = Math.abs(err) < 2 * Math.PI / 180 ? 0 : THREE.MathUtils.clamp(-err / (Math.PI / 4), -1, 1);
    const alpha = Math.atan2(Math.abs(x), Math.abs(y));
    const lateral = alpha > 67.5 * Math.PI / 180 && alpha < 112.5 * Math.PI / 180;
    let thr = Math.abs(err) > 50 * Math.PI / 180 ? 0 : m * Math.cos(err);
    if (lateral) thr = Math.min(thr, T.walkTurnStep / T.walkMax);
    this.last = { active: true, base: this.base, target, err, lateral };
    return { ...f, move: { x: undead(steer, T.steerDead), y: undead(Math.max(0, thr), T.throttleDead) } };
  }
}
