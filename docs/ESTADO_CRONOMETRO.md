# Cronómetro de speedrun + récord (V10.6.1) · estado

**PUBLICADA la V10.6.2 el 25 oct 2026 a las 16:31** (`20261025-163137_v10-6-2`, `index-D802oi18.js`), con el «sí» del usuario; antes, la V10.6.1 a las 16:00.
Top 3 **empezado de cero a las 16:31 con un único 10:00.0** (se borró el 5:16.7 de prueba del usuario). Comprobado en la web real (iPhone y Android en vertical):
con «cascos» no cuenta, jugando cuenta, la esquina enseña «Récord 10:00.0», sin errores. Recetas: `PUBLICAR_V10_6_1.md` y `PUBLICAR_V10_6_2.md`.
Volver: `ssh bellaka bk-version volver`; guardador: `actualizar_bk_record.sh --volver`; quitar el récord del todo: `instalar_record.sh --quitar`.

## V10.6.2 (sobre la V10.6.1, decisiones del usuario tras probarla)

| Cambio | |
|---|---|
| Rótulo final con **CONTINUAR** | Ventana como «cascos»: se queda hasta cerrarla (también Esc, B o A del mando); protegido contra toques fantasma; probado en `boton.mjs` |
| **Siempre top 3**, con relleno | 1 tiempo → los 3 puestos; 2 → el 2.º dos veces. Sin `mostrar` |
| **Recargas cuentan** | Sin asterisco ni «no cuenta» (en el móvil pasan solas al cambiar de app; no dan ventaja). Siguen apuntadas por dentro |
| Aviso en **partidas viejas** | Una vez por visita: «⏱ Speedrun: … toca II (arriba a la derecha/izquierda) → Reiniciar partida» |
| Avisos ntfy | Cada vez que cambia el top 3: 🏆 1.º, 🥈 2.º, 🥉 3.º, con el top en el texto |
| Captura | A **@desventurasdeanmi por TikTok** |

**Actualizado el 25 oct 2026 por la tarde.** No hay nada publicado: la web sigue con la V10.6 y el servidor no se ha tocado.
Plan original en `PLAN_CRONOMETRO.md` (la parte del récord se añadió después, a petición del usuario).

## Decisiones del usuario

| Tema | Decisión |
|---|---|
| Prioridad para que funcione | Según las estadísticas: **móvil vertical > móvil horizontal > ordenador**; **iPhone = Android** |
| Qué importa | Que empiece y pare cuando toca, que no se pare solo, que siga en las actividades y que no se rompa aporreando botones. Que el contador quede tapado un momento no importa |
| Récord | El de todos, **desde que se publique** (lo anterior no cuenta), **automático** con aviso al móvil (ntfy) y comando para quitar uno falso |
| Dónde mandar la captura | Sin formularios (el jugador no escribe nada): al acabar, «haz captura»; si bate el récord o entra en el top, «mándasela a **@desventurasdeanmi** por TikTok» (usuario: solo TikTok) |
| Top | En vez de solo el récord, el **top 3**, que se actualiza solo (cada 2 min). **Sin nombres, nunca**: solo tiempos. Si entras en el top, tu tiempo sale en **otro color** (fondo fucsia, «· tú»). El usuario decide cuántos se enseñan (0–5) con `record.sh`, sin republicar |

## Dónde está cada cosa

| Qué | Dónde |
|---|---|
| Juego publicado (V10.6) | `game/src` + `game/index.html` = V10.6 **sin tocar** (huellas en `backups/pre-crono/SHA256.txt`) |
| Juego con cronómetro y récord | `V10/IT10/wip/game` (compilable: `node_modules` y `public` enlazados a `game/`) |
| Build de prueba | `game/dist-v10-crono`, servida con `bk-v10-crono` (puerto 5249) |
| Pruebas nuevas | `game/tools/v10_6_1/`: `crono.mjs`, `record.mjs`, `impacientes.mjs`, `huecos.mjs`. Lanzadores: `V10/IT10/tools/propias.sh` y `guardianes.sh` |
| Servidor (preparado, **sin instalar**) | `alojamiento de juego/ionos-2026-10/herramientas/record/`: `bk-record` (guardador), `record.sh` (manejo desde el Mac), `prueba_bk_record.py` (su prueba) e `instalar_record.sh` (instalador con copia y vuelta atrás) |

## Cómo funciona

| Pieza | Comportamiento |
|---|---|
| Arranque | Al pulsar JUGAR en una partida **nueva**. No cuenta mientras está abierto «Recomendamos usar cascos» (aún no se puede jugar) |
| Qué cuenta | Tiempo real con el juego en marcha: tutorial, diálogos, cinemáticas y **actividades**. No cuentan la pausa ni la pestaña oculta |
| Final | Se para al conseguir el salto de SECRETNOVIO (una sola vez aunque se repita) y se pone rosa |
| Rótulo | Al cerrar la última frase de la despedida (o al acabar la escena si no hay despedida). Va **por encima** de los avisos. 15 s; si es récord, 30 s y dorado |
| Mensaje del rótulo | Bate el 1.º: «¡NUEVO RÉCORD!»; entra en el top: «¡ENTRAS EN EL TOP 3!»; en los dos, «Haz captura y mándasela a @desventurasdeanmi por TikTok». Si no: «Haz captura y compártela en TikTok». Sin conexión o con `mostrar 0`: no presume de nada |
| Top en el rótulo | La lista («TOP 3 · 1. 7:41.2 · 2. 7:58.0 · 3. 8:05.3 · tú») con el tiempo de la partida ya colocado y en otro color; con `mostrar 1`, «RÉCORD». Si el servidor mandara cualquier otra cosa, se ignora |
| Esquina | Tiempo y, debajo y en pequeño, el récord de todos |
| Recargas / otra pestaña | El tiempo sigue, con asterisco, y **no cuenta para el récord** (no se envía) |
| Envío | Carrera sin recargas → aviso anónimo `/e/crono?ds=<décimas>` (como el resto de métricas; en pruebas no sale del aparato) |
| Servidor | `bk-record` cada 2 min: lee esos avisos del registro de Caddy, guarda los 200 mejores y publica `{"n": 3, "top": [{"ds": …}]}` en `/e/record` (por `/e/` para que Bunny no lo guarde; con `log_skip` para no ensuciar las métricas). Récord nuevo → ntfy «🏆 Nuevo récord: 7:41.2 (iPhone · Instagram, 26/10 18:03)» |
| Manejo (desde el Mac) | `herramientas/record/record.sh`: `ver` · `mostrar 0-5` · `quitar` (el récord actual, falso) o `quitar 7:41.2` · `devolver 7:41.2`. Llega al juego en < 2 min |
| Privacidad | Solo un número, sin nada que identifique. Entra en «estadísticas generales y anónimas» de la página de privacidad: no hace falta cambiarla |

## Pruebas (todas contra la build de prueba, 5249)

| Prueba | Resultado |
|---|---|
| Guardianes antiguos de lo tocado (métricas, girar = pausa, pausa sobre 2D, narrativa de la plaza, capas, escena final, recorrido) | ✅ 7/7 en verde, 219 comprobaciones |
| `record.mjs`: sin récord, batido, no batido, sin conexión, conexión lenta, con recargas; iPhone, Android, horizontal, ordenador | ✅ 33/33 |
| `huecos.mjs`: grind, baile, grafiti y avisos en 7 aparatos | ✅ 35/35 (antes del arreglo: 6 choques) |
| `crono.mjs` y `impacientes.mjs` | ver «Última pasada» abajo |
| `prueba_bk_record.py` (servidor, en el Mac) | ✅ verde: lo anterior no cuenta, descarta pruebas y basura, avisa solo con récord nuevo, quitar/devolver, rotación del registro, líneas a medias, top 0–5, sin nombres, quitar/devolver dentro del top |

## Rojo tras publicar (25 oct, 16:09) · revisado, no es del juego

El guardián `v10_6/avisos` exigía «ninguna petición a /e/ en modo prueba» y el juego hace una: **leer** el top (`GET /e/record`, sin datos y sin quedar
en el registro). No es un aviso de métricas: los 21 controles de métricas de verdad seguían en verde, incluido que el aviso nuevo `crono` no sale en
pruebas. Se precisó la prueba (copia previa en `backups/avisos.mjs.antes-record`): toda petición a `/e/` sigue siendo fallo salvo un `GET /e/record`
limpio, y se añadió que esa lectura no lleve ningún dato. Repetida contra lo publicado: ✅ 24/24. No se volvió atrás (versión sin defecto).

## Pruebas de la V10.6.2 (25 oct, 16:21–16:36)

Red de seguridad 29/29 (y otra vez sobre la build publicada) · récord y top con relleno 49/49 · botón CONTINUAR 25/25 · cronómetro con aviso de
reiniciar 64/64 · impacientes 68/68 · métricas 24/24 · Chrome de ordenador 6/6 (incluido CONTINUAR). **Firefox y Safari automáticos no arrancan en
este Mac** (Firefox: no responde a puppeteer en 120 s; Safari: safaridriver no llega a abrir sesión): es del entorno, no del juego; se cubren a mano.

## Lo que falta

| # | Qué | Quién |
|---|---|---|
| 1 | Safari y Firefox (ordenador) y un móvil real (iPhone y Android, en vertical) | Claude / usuario |
| 2 | ~~Integrar, instalar el récord, publicar, copia congelada~~ | Hecho el 25 oct, 15:59–16:05 |
| 3 | **Prueba real de punta a punta:** el usuario juega una partida nueva entera en su móvil → su tiempo en `record.sh ver` y aviso ntfy | Usuario |
| 4 | Avisar en el anuncio: para competir, partida nueva («Borrar y empezar») | Usuario |

Vuelta atrás: juego `ssh bellaka bk-version volver`; servidor `instalar_record.sh --quitar`.
