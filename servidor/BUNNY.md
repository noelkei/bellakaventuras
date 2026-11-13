# Bunny.net (CDN) · estado y manual

> **24 oct, 15:48: BUNNY ENCENDIDO.** `www.bellakaventuras.com` → CNAME `bellakaventuras.b-cdn.net`, con el certificado de Bunny y https forzado.
> La vuelta a IONOS es **semiautomática**: IONOS no permite su API con este contrato. Si Bunny falla 3 veces seguidas, el vigía manda un
> aviso urgente por ntfy con los pasos: panel de IONOS → DNS → borrar el CNAME `www` y crear `A www 203.0.113.10`.
> Comprobado por Movistar, Vodafone, Orange y Digi: 200 desde Bunny Madrid (~110 ms).
>
> **Avisos al móvil (ntfy), desde las 16:15:**
> - `bk-contadores` cada 5 min: «🎮 N sesiones» cada 100 sesiones (aviso `carga-portada` del juego; sin pruebas ni IP de casa) con cuántas pulsan JUGAR.
> - «⚠️ BUNNY AL 50 %» (10 $) y «⚠️ BUNNY AL 90 %» (18 $, urgente) cuando el gasto estimado (GB desde el 24 oct × 0,01 $, o la facturación si es mayor) llega a 18 de 20 $.
> - La clave de Bunny está en el servidor en `/etc/bk/bunny.key` (root, 600) para leer el gasto. Si se cambia la clave en Bunny, hay que volver a copiarla (`servidor_cdn.sh --aplicar`).
> - Consulta: `ssh bellaka bk-contadores --estado`.
> - P0 con la CDN: W7, W9 y X7 miran el origen (`--resolve`) y W8 el audio por la CDN y el origen. 34/34.

Capa POR ENCIMA del VPS: el servidor sigue sirviendo igual con o sin Bunny.

Copias previas:
- `V10/IT9/backups/antes-bunny-20261024-1449/`;
- `respaldos/servidor-20261024-1449.tar.gz` y `respaldos/servidor-20261024-1513.tar.gz`;
- `respaldos/bunny/`: Caddyfile, guardián y `publicar.sh` de antes, y la zona tal como se creó.

## Hecho y comprobado

| Pieza | Estado |
|---|---|
| Zona `bellakaventuras` (id 6857371) | Creada. `bellakaventuras.b-cdn.net` (aún NO es la web: el dominio sigue yendo directo al VPS) |
| Clave de API | `.bunny-api`, permisos 600, nunca mostrada |
| Origen | `https://bellakaventuras.com` (Host `bellakaventuras.com`), con verificación de certificado |
| Escudo de origen | Activo (FR) + agrupado de peticiones: el VPS recibe ~1 petición por archivo aunque entren miles |
| Si el VPS cae | Bunny sirve lo que ya tiene guardado (*stale while offline / updating*) |
| Caché en Bunny | 1 día por defecto; `build/*` 1 año; portada y listas 60 s; telemetría `/e/*`, `/salud`, `/salud-version` y `game-config.json` **nunca** se guardan (BYPASS comprobado). Se vacía al publicar |
| Navegador | Igual que ahora: pregunta siempre (`max-age=0`, ETag/304), salvo `build/*`, que se guarda 1 año. Así no hay mezclas de versiones |
| Gasto | Solo regiones Europa y EE. UU. (0,01 $/GB); tope mensual 1,8 TB ≈ 18 $ (prueba gratuita de 20 $). Latinoamérica entra por EE. UU. |
| Errores | No se guardan en caché (comprobado: un 401 no queda guardado) |
| Servidor: IP real del jugador | `trusted_proxies` con las 905 IP de Bunny (`/etc/caddy/cdn-bunny.caddy`, se renueva a diario con `bk-cdn-ips.timer`). Comprobado: vía Bunny, el registro guarda la IP real, así que telemetría, métricas y guardián ven personas |
| Guardián | Nunca bloquea una IP de Bunny. Si llega una IP con `X-Real-Ip` que no está en la lista, no la bloquea, renueva la lista y avisa por ntfy. Probado en seco con y sin capa |
| Vigía de la CDN | `bk-cdn-vigia` cada 2 min. Avisa por ntfy si Bunny no responde (3 veces seguidas, con el servidor bien) o si sirve una portada vieja; también avisa de «Resuelto» |
| Publicar | La prueba de humo va siempre al VPS (`--resolve`), nunca a Bunny. Al terminar se vacía la caché de Bunny (3 intentos; si falla, solo avisa). Si la publicación se deshace, también se vacía |
| Volver de versión | `herramientas/volver.sh` = `bk-version volver` + vaciar Bunny |
| P0 | 32/32 con la capa puesta |

**Herramientas:**
- `herramientas/bunny/bunny.sh`: estado, purgar, aplicar, verificar, ips y registros.
- `herramientas/bunny/servidor_cdn.sh`: `--seco`, `--aplicar` y `--deshacer`.
- `herramientas/bunny/bk-cdn-vigia`.

La configuración es reproducible: `ajustes-zona.json` y `reglas.json`.

## Opción A elegida (24 oct, 15:35): www es la dirección principal. Aplicada y comprobada

- **Servidor:** la raíz `bellakaventuras.com` redirige siempre a `www` (302, reversible), salvo `/salud` y `/salud-version`. `www` sirve el juego (con o sin Bunny).
  - P0 adaptado: 34/34, con nuevos W15 «raíz → www con la ruta», W14b «certificado de www» y X4 «la raíz no es redirección abierta».
  - `verificar_sitio.py` contra www: 216 archivos idénticos (salvo los 2 del gancho de limpieza) y «raíz → www» OK.
- **Scripts que ahora miran www:** `publicar.sh` (prueba de humo, siempre contra el VPS), `verificar_sitio.py`, `carga_remota.sh` y `lentas_local.sh`.
  - La vigilancia (vigilante, HetrixTools, vigía) sigue con `/salud` en la raíz, que responde en el propio servidor.
- **Bunny:** pide al servidor `www` (Host `www.bellakaventuras.com`) a través de la IP del VPS. Comprobado: no hay redirección en bucle.
- **Vuelta automática a IONOS:**
  - `bk-dns-www` (API de DNS de IONOS: `a-ionos`, `a-bunny`, `estado`; si algo falla al cambiar, repone siempre www → VPS).
  - `bk-cdn-vigia`: con `CONMUTAR_AUTO=si`, 5 fallos seguidos de Bunny (~10 min), el servidor bien y salida a internet → www → A 203.0.113.10 + aviso ntfy «VUELTO A IONOS».
  - Volver a Bunny, siempre a mano.
- **Certificado de www en el servidor:** el vigía avisa si le quedan < 20 días. Detrás de Bunny podría no renovarse solo, y hace falta para la vuelta directa.
- **Encender y apagar (Mac):**
  - `herramientas/bunny/bunny.sh encender`: solo con la web abierta. Pone www en la zona, el DNS en Bunny y el certificado (si no sale, vuelve a IONOS), fuerza https y activa la vuelta automática.
  - `bunny.sh apagar`: www → IONOS.

### Falta (del usuario)
1. **Clave de la API de DNS de IONOS:** https://developer.hosting.ionos.com → activar el acceso a la API → «API Keys» → «Create New Key». Copiar «prefijo.secreto» al portapapeles; se guarda en `.ionos-dns` (Mac) y `/etc/bk/ionos-dns.key` (servidor), con permisos 600 y sin mostrarla.
2. **Abrir la web al público** (con contraseña no se puede encender Bunny: daría el juego sin pedirla).
3. Después: `bunny.sh encender` (lo hace Claude).
4. HetrixTools: añadir un monitor a `https://www.bellakaventuras.com/salud` (la ruta por Bunny). El actual (raíz) vigila el servidor.

**Notas:**
- **Partidas:** quien jugó en `bellakaventuras.com` sin www antes del cambio empieza de cero en `www` (el guardado va por dirección). Hasta ahora solo las pruebas internas.
- **Tras reconstruir el servidor desde cero** (`montar_servidor.sh`): `herramientas/bunny/servidor_cdn.sh --aplicar` y volver a poner la clave de DNS.

## Apagar Bunny a mano

- **Desde el Mac:** `herramientas/bunny/bunny.sh apagar`.
- **Sin el Mac:** panel de IONOS → Dominios → bellakaventuras.com → DNS: `www` CNAME → borrar y crear `www` A `203.0.113.10`. En ~5 min todo el mundo va directo al servidor.
- **Quitar la capa del servidor** (no hace falta para apagar): `herramientas/bunny/servidor_cdn.sh --deshacer`.
