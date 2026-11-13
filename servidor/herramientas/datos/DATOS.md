# Datos en bruto de Bellakaventuras (un único archivo)

**Archivo:** `alojamiento de juego/ionos-2026-10/datos/bellakaventuras.sqlite` (SQLite: un archivo con varias tablas).

**Actualizarlo** (trae lo nuevo, nunca duplica):
```bash
"/Users/TU_USUARIO/Desktop/Bellakaventuras/alojamiento de juego/ionos-2026-10/herramientas/datos/datos.sh"
```
- Con `--parquet` exporta además cada tabla a `datos/parquet/<tabla>.parquet`; con `--csv`, a `datos/csv/<tabla>.csv.gz`.
- El servidor lo actualiza **solo cada hora** (`bk-datos.timer`, a y 20) en `/var/lib/bk-datos/bellakaventuras.sqlite`. Bunny solo guarda sus registros 3 días e IONOS 30, así que el archivo los va recogiendo aunque no ejecutes nada.
- `datos.sh` hace una copia consistente y la baja con `rsync`, que solo transfiere lo que ha cambiado.

**Cómo abrirlo:**
- Python: `pandas.read_sql("SELECT * FROM eventos", sqlite3.connect(ruta))`.
- La app gratuita «DB Browser for SQLite».
- Los Parquet: pandas, DuckDB o Power BI.

## Tablas

Una fila es un dato tal como llegó. **Sin IP, sin el navegador completo y sin el referer completo:** solo lo útil, ya desglosado.
**Sin pruebas propias, sin la IP de casa y sin el propio servidor.**

| Tabla | Una fila es… | Fuente | Columnas clave |
|---|---|---|---|
| `eventos` | un aviso del juego (`/e/jugar`, `/e/patata-yinyang`, `/e/act-falla`…) | registro de IONOS (llegan todos, aunque Bunny sirva el resto) | `evento`, `p` (n = partida nueva, c = guardada), `t` (s de juego desde JUGAR), `params` (JSON con todos los campos del aviso), `estado` |
| `ionos_peticiones` | una petición que llegó al servidor (no `/e/`) | registro de IONOS | `ruta`, `consulta` (solo `?o=`), `estado`, `bytes`, `ms`, `proto`, `desde_bunny` |
| `bunny_peticiones` | una petición servida por Bunny (también los `/e/`) | registros de Bunny | `cache` (HIT, MISS, BYPASS, STALE…), `estado`, `bytes`, `pais` (del jugador), `pais_borde` (servidor de Bunny), `ruta`, `consulta` |
| `bunny_horas` | una métrica de Bunny en una hora | API de estadísticas de Bunny | `fecha_hora` (UTC), `metrica` (BandwidthUsed, RequestsServed, CacheHitRate, Error4xx, OriginTraffic…), `valor` |
| `bunny_geo` | bytes por ubicación de Bunny y día | API de Bunny | `fecha`, `ubicacion`, `bytes` |
| `cursores`, `info` | control interno y descripción | — | — |

**Comunes a eventos y peticiones:**
- `ts` (segundos Unix) y `fecha` (hora de Madrid);
- `dispositivo` (iPhone, iPad, Android, Ordenador) y `so` (iOS 26, Android 16…);
- `app` (Instagram, TikTok, Facebook, WhatsApp o vacío) y `navegador` (Safari, Chrome, WebView…);
- `canal`: la etiqueta `?o=` del enlace (`ig`, `tiktok`…) o la app si no lleva etiqueta;
- `robot`: 1 si es un robot conocido.

**Qué significa cada aviso y cada campo:** `V10/IT9/B5_METRICAS.md` §2 (esquema cerrado de `avisos.ts`).

**Ejemplos:**
```sql
-- partidas nuevas por canal
SELECT canal, COUNT(*) FROM eventos WHERE evento = 'jugar' AND p = 'n' GROUP BY canal;
-- tiempo hasta pasarse el juego (segundos de juego)
SELECT t FROM eventos WHERE evento = 'dialogo-final' AND p = 'n';
-- peticiones a Bunny por país
SELECT pais, COUNT(*), SUM(bytes) / 1e9 AS GB FROM bunny_peticiones GROUP BY pais ORDER BY 2 DESC;
```

**Comprobado el 24 oct:** el archivo coincide al 100 % con el registro completo de Bunny (366.750 de 366.750 peticiones). Una segunda pasada solo añade lo nuevo.

Las métricas ya calculadas (embudo, tiempos…) siguen en `herramientas/analitica/analitica.sh`. Este archivo es la base en bruto para calcular otras nuevas.

## Tablas extra (añadidas el 7 nov 2026, antes de cerrar el servidor)

Sacadas del registro completo de Caddy (23 oct → 7 nov) **sin ninguna IP**: cada IP se convirtió en identificadores seudónimos con una sal
aleatoria que solo existió en memoria y se perdió al terminar (no se pueden volver a convertir en IP ni ampliar con datos nuevos).
Ubicación y operador por DB-IP Lite (db-ip.com, CC BY 4.0). Programas: `respaldos/cierre-20261107/programas/`.

| Tabla / vista | Una fila es… | Columnas clave |
|---|---|---|
| `extra` | lo que faltaba de cada fila de `eventos` e `ionos_peticiones` (se une por `clave`, cobertura 100 %) | `jugador` (IP+navegador), `conexion` (IP), `red` (/24 o /48), `pais`, `region` (comunidad), `ciudad`, `lat`/`lon` (centro de la ciudad), `asn`, `operador`, `idioma`, `referer_host`, `bunny_region` (2.ª opinión de región, código de Bunny), `ja4`, `alpn` (h2/h3), `ipv` |
| `agentes` | un navegador distinto (texto completo) | `ua_id`, `user_agent`, `modelo` (iPhone y Android: solo si lo dice el navegador; los iPhone solo dentro de Instagram), `marca`, `pantalla`, `app_version`, `app_idioma` |
| `eventos_completos` (vista) | `eventos` + `extra` + `agentes` | todo junto |
| `jugadores` | un jugador estimado (misma IP + mismo navegador) | primera/última vez, días activos, visitas, sesiones, partidas, patatas máx., termina, intentos y mejor crono, aparato, modelo, región, ciudad, operador, idioma |
| `visitas` | una visita (mismo jugador, huecos de < 30 min) | inicio, fin, minutos, sesiones, partidas, patatas máx., termina, nº de visita |

**Cómo leer «jugador»:** es una estimación. Un móvil que cambia de IP (wifi ↔ datos) cuenta como varios jugadores; varias personas tras la misma salida
de operador con el mismo navegador (los iPhone con iOS 26 dicen todos «iOS 18») cuentan como uno. Por eso los primeros puestos por sesiones mezclan gente.
La región coincide con la de Bunny en el 80 % de los jugadores. Cloudflare/Akamai como «operador» = Relay privado de iCloud (ubicación poco fiable).
