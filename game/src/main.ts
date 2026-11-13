// Punto de entrada ligero: la pantalla de inicio (HTML) se ve al instante; el motor (three + Rapier WASM)
// se descarga en un chunk aparte mostrando progreso.
import { crearCarga, carga } from './portada/carga';
import { crearPortada } from './portada/portada';
import { cargaPortada, cargaSigue, error as avisoError } from './avisos';   // V10.6 (B5): métricas sin identificadores
const text = document.getElementById('load-text');
// R4 (usuario, 12 oct): Safari de iPhone ignora `user-scalable=no`: se bloquean por código el pellizco (gesture*) y el doble
// toque fuera de botones y campos (un toque rápido sobre el HUD ampliaba la página y no se podía volver sin recargar)
for (const ev of ['gesturestart', 'gesturechange', 'gestureend']) document.addEventListener(ev, (e) => e.preventDefault(), { passive: false });
document.addEventListener('dblclick', (e) => e.preventDefault(), { passive: false });
let lastTouchEnd = 0;
document.addEventListener('touchend', (e) => {
  const now = performance.now(), t = e.target as Element | null;
  if (e.cancelable && now - lastTouchEnd < 350 && !t?.closest?.('button, input, select, textarea, a, #cam-zone, #stick-zone')) e.preventDefault();   // V8: solo si es cancelable (con trazos rápidos seguidos el navegador avisaba)
  lastTouchEnd = now;
}, { passive: false });
document.addEventListener('touchmove', (e) => { if ((e as TouchEvent).touches.length > 1 && !(e.target as Element | null)?.closest?.('#cam-zone, #stick-zone')) e.preventDefault(); }, { passive: false });
if (text) text.textContent = 'Descargando motor…';
// V10.5 ronda PORTADA: la barra de carga con porcentaje real y la portada viva salen YA (este archivo es pequeño; el motor baja después)
try { crearCarga(); } catch (e) { console.warn('barra de carga', e); }
try { crearPortada(); } catch (e) { console.warn('portada', e); }
// V10.6 (B5): segundos hasta la portada a la vista (primer fotograma) y avance de la carga por si se va antes de acabar
try { requestAnimationFrame(() => cargaPortada()); cargaSigue(() => carga?.fraccion ?? 0); } catch { /* */ }
import('./bootstrap').then((m) => m.boot()).catch((e) => {
  const err = document.getElementById('start-error');
  if (err) { err.hidden = false; err.textContent = `No se pudo cargar el juego (${e?.message ?? e}). Comprueba la conexión y recarga.`; }
  carga?.error(); avisoError('E04');   // V10.6 (B5): el motor no se pudo descargar
});
