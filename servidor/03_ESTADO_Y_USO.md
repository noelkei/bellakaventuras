> **CERRADO el 7 nov 2026, 12:20.** Copia y datos finales en `respaldos/cierre-20261107/` (LEEME.md) y `datos/`. Hecho: timers `bk-*` desactivados,
> en Bunny se quitó `www.bellakaventuras.com` de la zona 6857371, se desactivó «servir guardado si cae» y se vació la caché; el VPS se apagó (`systemctl poweroff`).
> Para volver: encender el VPS desde el panel de IONOS, `systemctl enable --now` los timers `bk-*`, y `herramientas/bunny/bunny.sh encender` + `aplicar`.
> El DNS sigue igual (www → Bunny, raíz → 203.0.113.10; correo sin tocar). Cancelar contratos: lo hace el usuario.

# Estado y uso del servidor (actualizado el 25 oct 2026, 16:35: V10.6.2 con cronómetro y top 3)

## Cambios desde la madrugada (mandan sobre la tabla de abajo, que es la foto de las 01:05)

| Pieza | Estado ahora |
| --- | --- |
| Web | **Abierta al público desde el 24 oct, 15:37** (`abrir_al_publico.sh`). Sin contraseña |
| Juego | **V10.6.2** (cronómetro de speedrun + top 3), versión `20261025-163137_v10-6-2` (`index-D802oi18.js`), publicada el **25 oct a las 16:31** (antes: V10.6.1 a las 16:00). Copia congelada: `implementacion/site-v10-6-2` (`PUBLICADA.txt`). Volver: `ssh bellaka bk-version volver`. Detalle: `V10/IT10/ESTADO_CRONOMETRO.md` |
| Récord (top 3) | **Empezado de cero el 25 oct a las 16:31 con un único 10:00.0** (`record.sh empezar`). `bk-record` (timer cada 2 min) lee los avisos `/e/crono` y sirve el top en `/e/record` (Caddy, `log_skip`; Bunny: BYPASS). Aviso ntfy cada vez que cambia el top 3 (🏆/🥈/🥉). Manejo desde el Mac: `herramientas/record/record.sh ver · quitar [tiempo] · devolver tiempo · empezar tiempo`. Copias: Caddyfile `/root/respaldo-record-20261025-155931`; programa y datos `/root/respaldo-bk-record-20261025-163122` (`actualizar_bk_record.sh --volver`) |
| Dirección principal | **`www.bellakaventuras.com`**. La raíz redirige con un 302 (`/una/ruta?x` → `www/una/ruta?x`), salvo `/salud` y `/salud-version` |
| DNS (IONOS) | A `@` → 203.0.113.10 · **CNAME `www` → `bellakaventuras.b-cdn.net`** (Bunny) · MX y TXT del correo sin tocar |
| CDN | **Bunny** delante de `www` (zona 6857371): escudo, agrupado, sirve lo guardado si el VPS cae; la telemetría `/e/*` nunca va a caché. Manual: `BUNNY.md` |
| IP real del jugador | `trusted_proxies` con las IP de Bunny (`/etc/caddy/cdn-bunny.caddy`, renovadas a diario por `bk-cdn-ips`). El registro, el guardián y la analítica ven personas |
| Guardián | Nunca bloquea a Bunny (lista `/etc/bk/cdn-ips.txt` + red de seguridad por `X-Real-Ip`) |
| Avisos ntfy | Vigilante y guardián como antes, más: `bk-cdn-vigia` (Bunny no responde / versión vieja / certificado de www), `bk-contadores` (cada 100 sesiones; Bunny al 50 % y al 90 % de 20 $) |
| Vigilancia externa | HetrixTools: `bellakaventuras.com/salud` (servidor) y `www.bellakaventuras.com/salud` (por Bunny), 4 lugares, 1 min |
| Cabeceras | Ya **sin `noindex`** (Google puede indexar); `robots.txt` y `sitemap.xml` en el juego. Con Bunny, la cabecera `Server` es la de Bunny (el origen sigue sin ella: P0 W7) |
| `/privacidad` | Página mínima: responsable «Equipo de ANMI» · contacto@bellakaventuras.com (reenvío de IONOS al Gmail del usuario). Sirve en `www` |
| P0 | `herramientas/pruebas/p0_comprobar.sh --abierta`: **34/34** (adaptado a www y a la CDN) |
| Analítica | `herramientas/analitica/analitica.sh` (v3; guía `METRICAS.md`); resúmenes diarios sin IP cada 6 h en `/var/lib/bk-analitica/dias` (también en las copias del servidor y en `informes/diario/`) |
| Acceso SSH | Llave `~/.ssh/bellakaventuras_ionos_2` (cambiada el 24 oct a las 14:25) |
| Pendientes | `V10/IT9/PENDIENTES_TRAS_V10_6.md` |


Versión anterior: `respaldos/03_ESTADO_Y_USO-23oct.md`. Detalle de lo hecho la noche del 23 al 24: `INFORME_NOCHE.md`.

## Qué hay

| Pieza | Estado | Comprobado |
| --- | --- | --- |
| VPS M+ IONOS, España, Ubuntu 24.04.5, IP **203.0.113.10** | En marcha desde 22:37 | Sí |
| Acceso | Solo con la clave `~/.ssh/bellakaventuras_ionos_2` (frase en el Llavero; cambiada el 24 oct 14:25, la anterior retirada en `~/.ssh/archivo/`). Atajo: `ssh bellaka` | Contraseñas rechazadas |
| Cortafuegos (ufw) | Entra solo 22/tcp, 80/tcp, 443/tcp y 443/udp. El del panel de IONOS deja pasar 80 y 443 | Sí |
| Parches de seguridad | Automáticos (unattended-upgrades), sin reinicio automático | Sí |
| Red | BBR + fq; 1 GB de memoria de reserva (swap); hora de Madrid | Sí |
| DNS (IONOS) | A `@` y A `www` → 203.0.113.10, TTL 5 min; sin AAAA | En los DNS de IONOS, Google y Cloudflare |
| HTTPS | Caddy 2.11.7 + Let's Encrypt para los dos nombres; vence el 21 ene 2027 y se renueva solo. Cadena YE2 → Root YE → X2 → X1 | Sí |
| Caddy parcheado | Compilado aquí con **Go 1.26.10 y golang.org/x/net 0.60.0** (`/usr/bin/caddy.custom`; el del paquete queda en `/usr/bin/caddy.default`). Receta: `/root/build/caddy-xnet/` | `govulncheck`: solo GO-2026-5932 (openpgp, no se usa) |
| Autocuración | `Restart=always` (2 s); **vigilante** cada minuto (`bk-vigilante`): reinicia Caddy si no responde, repone el último Caddyfile bueno si se rompe, limpia el disco > 85 %, avisa de memoria, certificado, huellas, versión y parches que piden reinicio; `kernel.panic=10` | Pruebas T1–T6 y S2/S3b/S7 (`informes/autocuracion-*.txt`) |
| Abusos | **Guardián** cada minuto (`bk-guardian`): bloquea 1 h (solo 80/443) a una IP con > 6 GB o 20.000 peticiones en 10 min (subido el 24 oct para no bloquear colegios o wifis compartidas); tabla nftables `inet bk` con tope de 1.000 conexiones por IP (antes 400). Nunca bloquea la IP de casa (198.51.100.20) ni el servidor | T4 |
| Avisos | ntfy, tema en `/etc/bk/avisos.conf` (copia privada en `.avisos-ntfy`). Falta que el usuario se suscriba | — |
| Cabeceras | HSTS 1 día, nosniff, Referrer-Policy, `frame-ancestors 'none'`, X-Frame-Options, Permissions-Policy, `noindex`, sin `Server` | P0 W4–W7 |
| Tiempos | Cabeceras en 15 s, cuerpo 30 s, inactiva 2 min; **sin tope de escritura** (un móvil lento puede tardar lo que haga falta) | X7; descarga a 40 KB/s durante 146 s OK |
| `www` y `http` | Redirigen a `https://bellakaventuras.com` (301/308) | Sí |
| Juego | V10.5 r3 limpia (`index-BNwJHzyr.js`), versión **`20261024-004323_r3c`**: sin rutas personales ni `asset-report.json`, ETag estables, `salud.txt` | 211/211 archivos idénticos (`informes/verificacion-r3c-*.json`) |
| Caché | `build/*` un año (lleva hash); `game-config.json` sin caché; el resto se revalida (304) | Sí |
| Compresión | Precomprimida al publicar (zstd/brotli/gzip): 57,9 → 44,4 MB el sitio entero | Sí |
| Navegador | Carga sin errores; hasta JUGAR transfiere **30,9 MB** (135 recursos). Tras JUGAR, +7,8 MB hasta el tutorial | Chrome del panel de la app |
| Registros de acceso | `/var/log/caddy/bellaka-acceso.log` (JSON; 30 días; 100 MB por archivo, 30 archivos) | — |
| Capacidad medida (dentro del VPS) | 100 visitas completas en 1 min y 300 a la vez sin fallos; Caddy sirve ~220 MB/s. El límite es la red de 1 Gbit/s | `informes/carga-resumen-20261024.md` |
| `/salud-version` | Sin contraseña: dice qué versión se sirve | P0 W13 |
| `/privacidad` | Sin contraseña; con huecos amarillos de nombre y correo por rellenar | P0 W11 |

Medidas de referencia: desde el Mac del usuario, ida y vuelta ~7–9 ms y ~270 Mbit/s en total. Es su conexión, no el techo del servidor.

## Contraseña mientras se prueba (desde el 23 oct, 23:10)

- Toda la web pide usuario y contraseña. Están en `.acceso-pruebas`, en esta carpeta (oculto y legible solo por el usuario del Mac).
- `/salud`, `/salud-version` y `/privacidad` responden sin contraseña.
- Los scripts `publicar.sh` y `verificar_sitio.py` usan ese archivo solos.
- En el servidor está en `/etc/caddy/acceso-pruebas.caddy`; solo guarda la huella de la contraseña, no la contraseña.
- **Abrir al público** el día del lanzamiento:

  ```bash
  ssh bellaka 'rm /etc/caddy/acceso-pruebas.caddy && systemctl reload caddy'
  ```

- La copia de workers.dev sigue abierta a cualquiera que tenga su enlace.

## Publicar una versión nueva (desde el Mac)

```bash
cd "/Users/TU_USUARIO/Desktop/Bellakaventuras/alojamiento de juego/ionos-2026-10"
herramientas/publicar.sh <carpeta-de-la-build> <etiqueta>
```

Hace todo esto:
1. Copia la build y le pasa los ganchos (`herramientas/ganchos/`): quita rutas personales y se niega a publicar si quedan, si hay `.map`, WAV o audio de más de 75 s; fija fechas para que el ETag solo cambie si cambia el archivo. Precomprime.
2. La sube como versión nueva sin tocar la que se sirve.
3. Comprueba las huellas SHA-256.
4. Conserva los `build/*.js` de la versión anterior.
5. Cambia de versión de golpe y pasa una **prueba de humo** (portada, `/salud-version` y los JS más grandes). **Si falla, vuelve sola a la versión anterior.**

Para comprobarla entera:

```bash
python3 -I herramientas/verificar_sitio.py <carpeta-de-la-build>
```

## Volver a la versión anterior

```bash
ssh bellaka bk-version volver
```

Otras órdenes:

| Orden | Qué hace |
| --- | --- |
| `ssh bellaka bk-version lista` | Versiones guardadas; la marcada con `*` es la que se sirve |
| `ssh bellaka bk-version activar <id>` | Sirve esa versión |
| `ssh bellaka bk-version limpiar` | Deja solo las 6 más recientes |

## Comprobar y mantener

| Orden (desde esta carpeta, en el Mac) | Qué hace |
| --- | --- |
| `herramientas/pruebas/p0_comprobar.sh` | Batería P0 (solo lee): 32 puntos OK/FALLA |
| `herramientas/pruebas/autocuracion.sh [--reiniciar]` | Pruebas de autocuración (**rompen cosas a propósito**: solo con la web cerrada o en un momento tranquilo) |
| `herramientas/pruebas/carga_local.sh [techo]` | Prueba de carga dentro del VPS |
| `herramientas/pruebas/lentas_local.sh` | Conexiones lentas a propósito dentro del VPS |
| `herramientas/respaldo_servidor.sh` | Copia privada de la configuración y los certificados en `respaldos/` |
| `herramientas/montar_servidor.sh --comprobar` / `<host> <IP>` | Reconstruir el servidor en un Ubuntu 24.04 limpio (provisional: solo probado en seco) |
| `herramientas/analitica/analitica.sh [--horas]` | Visitantes y partidas (pulsan JUGAR) por día, sin IP |
| `ssh bellaka journalctl -t bk-vigilante -n 20` | Qué ha hecho el vigilante |
| `ssh bellaka nft delete element inet bk bloqueados { <IP> }` | Desbloquear una IP |

## Archivos

- `herramientas/publicar.sh`: publicación desde el Mac.
- `herramientas/verificar_sitio.py`: comprobación completa desde fuera.
- `herramientas/servidor/Caddyfile`: copia de `/etc/caddy/Caddyfile`.
- `herramientas/servidor/bk-version`: copia de `/usr/local/bin/bk-version`.
- `informes/verificacion-r3-2026-10-23.json`: resultado de la comprobación del 23 oct.

## Pendiente

- Vigilancia externa y suscripción a ntfy (las hace el usuario: `INFORME_NOCHE.md`).
- UDP 443 en el cortafuegos del panel (usuario).
- Probar en iPhone (aviso de certificado YE2 en algunos, R7) y en los navegadores de Instagram, TikTok y WhatsApp.
- Probar `montar_servidor.sh` en una máquina nueva.
- Pruebas desde Latinoamérica (Globalping, sin la contraseña).
- Comprobación de bloqueos durante un partido.
- Decidir si Google puede indexar la web (ahora `noindex`).
- Vista previa del enlace al compartirlo.
- Cancelación.
