# Informe de V10.6 (24 oct 2026) — CERRADA

Plan: `PLAN_V10_6.md` (+ `B0`…`B10`). Registro hora a hora: `REGISTRO_V10_6.md`. Decisiones propias: `DECISIONES_V10_6.md`.
Pendientes de todo (juego, servidor y tareas del usuario): **`PENDIENTES_TRAS_V10_6.md`**.

**Estado final:**
- **Publicada** en IONOS el 24 oct a las 14:40: `20261024-143935_v10-6`, `index-BYd45JXP.js`.
- **Web abierta al público** a las 15:37.
- **Bunny (CDN) encendido** a las 15:48, con `www.bellakaventuras.com` como dirección principal.
- La V10.6 está integrada en `game/src` y `game/dist-v10`, y hay una copia congelada en `alojamiento de juego/implementacion/site-v10-6`.

## 1. Qué hay en la V10.6 (y cómo se comprobó)

| Punto | Para el jugador | Prueba (rojo en r3 → verde en V10.6) |
|---|---|---|
| 0.1 r3 en `game/src` | Lo publicado ya está en el código principal | build idéntica byte a byte a la publicada |
| 0.2 rutas personales | Ninguna ruta de tu Mac en la web | `estatico`, grep |
| 0.3 herramientas | Pruebas que no mienten (caos, lib8, Python con Pillow) | sondas |
| H8-13 | ◀/▶ ya no queda pegado tras pausar en el grind | CE-01 (r3 rojo → verde ×2) |
| H8-16 | El dedo del joystick vuelve a mandar tras una charla; «Vale» responde con el pulgar apoyado | **no medible en emulación** (Chrome cancela el toque al ocultar los controles): iPhone real |
| H8-08 | El primer toque en JUGAR con la pantalla girada funciona (el botón ya no salta al activarse) | d2-movil (TIMEOUT → 35/35) |
| H8-20 | Botones de pausa/Ajustes/Créditos de 44 px y barras de 44 px | `v10_6/capas` (32/72 rojos → 108/108) |
| 1.5 | Girar el móvil en una actividad pausa | `v10_6/girar-pausa` (4 rojos → 16/16) |
| 1.6 | II se puede tocar durante un diálogo 2D | `v10_6/pausa-2d` (13 rojos → 35/35) |
| 1.7 | Pausa y Ajustes caben sin desplazar en móviles pequeños (también el SE horizontal con «Créditos» en la pausa) | `v10_6/capas` 108/108 |
| H8-02/03/11 | Recargar ya no pierde la explicación del reto, la despedida ni una presentación | recarga-todo 72/72, narrativa-cortes N3 |
| H8-12 | La pista del modo ayuda espera a que ANMI esté en el suelo | narrativa-cortes N4 |
| resto H8-10 | «Volver a la plaza» corta la presentación (y la vuelve a ofrecer a los 3 s) | `v10_6/plaza-narrativa` (2 rojos → 7/7) |
| 2.6 | «Saltar tutorial» ya no deja sin responder la pregunta del modo ayuda | `v10_6/saltar-pregunta` (3 rojos → 4/4) |
| H8-14/15/17 | La pausa queda por encima de todo (SALTAR, flechas, Esc en «Modo app») | CE-05/06/12 |
| B5 métricas | El servidor sabe, sin identificar a nadie, cómo va cada partida | `v10_6/avisos` (4 rojos → 22/22); `bk_analitica.py` v3 con datos reales |
| B6 créditos | «Créditos» en el **menú de pausa** y en el pie de la portada. Textos: Diseño y desarrollo: Noel Pedrosa Alba · Proyecto y música: ANMI · Creativo: Joan Because · Colaboradores: La Mano de Oro · Adrián Rodríguez · enlace «Privacidad» | `v10_6/creditos` 28/28 |
| B6 compartir | Imagen y texto al mandar el enlace por WhatsApp/Instagram | `v10_6/compartir` (3 rojos → 3/3) |
| Cascos (nuevo, 24 oct) | Al pulsar JUGAR/CONTINUAR, «Recomendamos usar cascos» con ANMI con cascos rosas; velo chocolate; «Continuar», Esc o B del mando la cierran. Arreglado el toque fantasma que la cerraba en vertical | `v10_6/cascos` 105/105; `v10_6/cascos-navegadores` (Chrome y Firefox a 3 tamaños, Safari a 1280×720) |
| Google y privacidad | `robots.txt`, `sitemap.xml`, `canonical`; el servidor sin «noindex»; página de privacidad mínima (Equipo de ANMI · contacto@bellakaventuras.com) | `estatico`, `compartir`, P0 |

## 2. Regresiones y batería completa
- **Regresiones de lo tocado (46 pruebas, antes de integrar):** 45 verdes a la primera; `portada-mando` roja solo porque el recorrido de la
  cruceta incluye ahora «Créditos» (cambio aprobado; orden esperado actualizado con copia previa) → verde.
- **Campaña (partida entera automática):** intermitente en las dos versiones (r3 3/4, V10.6 3/8). Los fallos son del piloto automático y no
  regresiones: la r3 falla igual y la traza muestra el juego limpio.
- **Batería completa** (09:52–13:55, build de la mañana `index-BEQX7s7K`): **155 verdes**. Los rojos son todos ya conocidos o esperados:
  - cam-orbit y cam-cases (H8-06 y H8-07, bloque 7);
  - impact-seq (H8-04, bloque 7);
  - ext-entrada (aceptado);
  - campaign-v8 (piloto automático);
  - grafiti-mando, y CE-07 de entradas-cortes (H8-01/09, bloque 4);
  - CE-11 (H8-16, solo medible en iPhone);
  - v10_6/creditos y el estado «creditos» de capas: esperados, porque esa build aún tenía «Créditos» en Ajustes.
  - charlas dio ERROR porque la pestaña del navegador se cerró: repetida sobre la versión final, 105/105.
  - La suite R11 (física del skate, no tocada) se cortó por prioridad.
- **Sobre la versión final** (`index-BYd45JXP`, post-bateria2, 14:07–15:07): **22 verdes**. Solo rojean los 2 conocidos de entradas-cortes. Pasaron:
  - capas 108, creditos 28, cascos 105;
  - menús con mando y teclado, portada ×3, ajustes, editor, interfaz, charlas 105;
  - hud-tactil 180, controles, zurdo, ui-matriz;
  - toque-fantasma 41, interrupciones 254, pause-input, orient-emu, d2-movil, saltar-tactil.
- **Navegadores reales:** Chrome y Firefox 6/6 y Safari 2/2 a 1280×720; dos tamaños de Safari no cargaron a tiempo con la automatización.
- **Lo que cazaron las pruebas el mismo día** (arreglado antes de publicar):
  - toque fantasma de los cascos en móvil vertical;
  - pausa y créditos que no cabían en el SE horizontal;
  - criterios mal escritos en dos pruebas nuevas, corregidos con copia previa.

## 3. Lo que queda para aparatos reales
- **iPhone:**
  - H8-16 (pulgar en el joystick al cerrar una charla);
  - primer toque en JUGAR girada;
  - girar en una actividad;
  - pausa en el 2D;
  - Safari a otros tamaños.
- **Android:** aviso `jugar` con red wifi/datos.
- **Métricas reales** (desde las 15:37): los avisos llegan desde iPhone, Android e Instagram. Errores a mirar en una próxima versión:
  - E06, el sonido no arranca (~100, casi seguro Instagram en iPhone);
  - E01, sin WebGL (19);
  - E02, WebGL perdido (19).

## 4. Publicación (24 oct 14:40, con el «sí» del usuario)
- **En el servidor:** `20261024-143935_v10-6`.
  - Verificación: P0, 216 archivos idénticos (salvo los 2 que limpia el gancho), `/e/` 204, sin «noindex».
  - Volver: `herramientas/volver.sh` (= `bk-version volver` + vaciar Bunny).
- **Un solo paso:** `herramientas/publicar_v10_6.sh`:
  1. copias;
  2. privacidad;
  3. Caddyfile;
  4. juego + copia congelada (`PUBLICADA.txt` → `site-v10-6`, la que repone `montar_servidor.sh`);
  5. comprobaciones.
- **Decisiones del usuario:** Google sí; servidor de reserva no; ZeroSSL no.

## 5. Lanzamiento, Bunny y métricas (24 oct tarde)
- **15:37, web abierta** (`abrir_al_publico.sh`, P0 34/34).
- **`www` es la dirección principal** (opción A): la raíz redirige con un 302, salvo `/salud`. Las partidas que se jugaron en la raíz antes del cambio fueron solo pruebas internas.
- **15:48, Bunny encendido:**
  - zona 6857371, certificado de `www`, escudo, agrupado de peticiones;
  - si el VPS cae, sirve lo guardado;
  - la telemetría nunca va a caché;
  - comprobado por Movistar, Vodafone, Orange y Digi.
  - Manual completo en `alojamiento de juego/ionos-2026-10/BUNNY.md`.
  - Incidencia: un usuario vio `ERR_NAME_NOT_RESOLVED` unos minutos (hueco entre borrar el A y crear el CNAME); se arregló solo.
- **Vuelta a IONOS si Bunny cae: semiautomática** (aviso ntfy urgente con los pasos). La API de DNS de IONOS no se puede activar con este contrato.
- **Avisos ntfy nuevos:**
  - cada 100 sesiones;
  - Bunny al 50 % y al 90 % de los 20 $;
  - vigía de Bunny (no responde, versión vieja, certificado de www).
- **Métricas** (`herramientas/analitica/analitica.sh`, guía `METRICAS.md`):
  - embudo por sesiones, por día, hora y canal (`?o=ig`, `?o=tiktok`);
  - tiempos por paso y máximo jugado;
  - resúmenes diarios guardados cada 6 h (no caducan).
- **Primeras horas:**
  - 16:41: 1.551 sesiones, 1.263 JUGAR;
  - 17:33: 1.978 sesiones, 1.596 JUGAR;
  - el 81 % de las sesiones pulsan JUGAR, y ~85 % llegan por el enlace de Instagram (`?o=ig`);
  - pasarse el juego lleva unos 18 min de mediana (récord 10:55).
