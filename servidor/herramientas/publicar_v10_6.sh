#!/bin/bash
# Publica la V10.6 completa en un solo paso, SOLO con el «sí» del usuario (24 oct 2026):
#   1. copia del servidor; 2. página de privacidad nueva (mínima, «Equipo de ANMI»); 3. Caddyfile sin «noindex» (Google puede indexar),
#   validado antes de recargar y devuelto al anterior si no valida; 4. el juego (publicar.sh game/dist-v10 v10-6) y su copia congelada en
#   implementacion/site-v10-6 (la que repone montar_servidor.sh); 5. comprobaciones; 6. copia del servidor después.
# NO abre al público (eso es abrir_al_publico.sh, cuando el usuario lo diga). Volver el juego atrás: ssh bellaka bk-version volver
# Volver la privacidad y el Caddyfile: respaldos/v10_6/ (privacidad-servidor-<fecha>.html, Caddyfile.con-noindex).
set -euo pipefail
D="$(cd "$(dirname "$0")/.." && pwd)"; J="$(cd "$D/../.." && pwd)/game/dist-v10"; F=$(date +%Y%m%d-%H%M)
ssh -o BatchMode=yes -o ConnectTimeout=10 bellaka true || { echo "Sin acceso SSH: no se toca nada" >&2; exit 1; }
grep -q 'lnk-privacidad' "$J/index.html" && [ -f "$J/robots.txt" ] || { echo "game/dist-v10 no es la V10.6 final (falta el enlace de privacidad o robots.txt)" >&2; exit 1; }
echo "== 1. Copia del servidor"; "$D/herramientas/respaldo_servidor.sh"
echo "== 2. Privacidad"; ssh -o BatchMode=yes bellaka 'cat /srv/bellaka/paginas/privacidad.html' > "$D/respaldos/v10_6/privacidad-servidor-$F.html"
scp -q "$D/herramientas/servidor/p0/privacidad.html" bellaka:/root/p0/privacidad.html
ssh -o BatchMode=yes bellaka 'install -m 644 /root/p0/privacidad.html /srv/bellaka/paginas/privacidad.html'
echo "== 3. Caddyfile (Google)"; scp -q "$D/herramientas/servidor/Caddyfile" bellaka:/root/Caddyfile.nuevo
ssh -o BatchMode=yes bellaka 'set -e; cp /etc/caddy/Caddyfile /root/Caddyfile.antes-'"$F"'; install -m 644 /root/Caddyfile.nuevo /etc/caddy/Caddyfile
  if sudo -u caddy caddy validate --config /etc/caddy/Caddyfile >/dev/null 2>&1; then systemctl reload caddy; echo "   recargado"
  else install -m 644 /root/Caddyfile.antes-'"$F"' /etc/caddy/Caddyfile; echo "   NO válido: se deja el anterior" >&2; exit 3; fi'
echo "== 4. Juego"; "$D/herramientas/publicar.sh" "$J" v10-6
# Copia congelada de lo publicado: montar_servidor.sh (servidor nuevo desde cero) publica esa carpeta, no la r3 ni game/dist-v10 (que cambia)
I="$D/../implementacion"; rsync -a --delete "$J/" "$I/site-v10-6/"; echo site-v10-6 > "$I/PUBLICADA.txt"; echo "   copia congelada: implementacion/site-v10-6"
echo "== 5. Comprobaciones"; sleep 2
c() { [ "$1" = "$2" ] && echo "   OK  $3" || { echo "   MAL $3 ($1)"; MAL=1; }; }; MAL=0
c "$(curl -s -o /dev/null -w '%{http_code}' https://bellakaventuras.com/privacidad)" 200 "/privacidad sin contraseña"
c "$(curl -s https://bellakaventuras.com/privacidad | grep -c 'Equipo de ANMI')" 1 "privacidad nueva («Equipo de ANMI»)"
c "$(curl -sI https://bellakaventuras.com/salud | grep -ci 'x-robots-tag')" 0 "sin «noindex» en las cabeceras"
c "$(curl -s https://bellakaventuras.com/salud-version | grep -c 'v10-6')" 1 "versión servida = v10-6"
"$D/herramientas/pruebas/p0_comprobar.sh" | tail -1
echo "== 6. Copia del servidor ya con la V10.6 (para que una reconstrucción la reponga igual)"; "$D/herramientas/respaldo_servidor.sh"
[ $MAL = 0 ] && echo "Hecho." || { echo "Revisar lo marcado MAL" >&2; exit 4; }
