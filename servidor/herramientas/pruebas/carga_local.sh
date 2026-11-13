#!/bin/bash
# Prueba de carga DENTRO del VPS (24 oct 2026): h2load en el propio servidor contra Caddy, sin salir a Internet
# (la política de IONOS prohíbe el tráfico masivo desde fuera). Mide lo que aguantan Caddy, la CPU y la memoria;
# NO mide la red de IONOS ni la de los jugadores (eso lo limita el enlace del VPS, ver el informe).
#   herramientas/pruebas/carga_local.sh            → escenarios A–C
#   herramientas/pruebas/carga_local.sh techo      → además D (300 a la vez) y E (500 a la vez, sobrecarga)
# «Visita» = los 211 archivos del sitio con brotli/zstd, ~44 MB (más que una visita real hasta el tutorial, ~39 MB).
# Las peticiones llevan X-BK-Prueba: carga (para quitarlas de la analítica). La contraseña de pruebas viaja por stdin.
DIR="$(cd "$(dirname "$0")/../.." && pwd)"
AUTH=$(tr -d "\n" < "$DIR/.acceso-pruebas" | base64 | tr -d "\n")
ssh -o BatchMode=yes bellaka 'mkdir -p /root/pruebas' && scp -q "$(dirname "$0")/carga_remota.sh" bellaka:/root/pruebas/carga_remota.sh
{ echo "$AUTH"; echo "${1:-}"; } | ssh -o BatchMode=yes bellaka 'bash /root/pruebas/carga_remota.sh'
