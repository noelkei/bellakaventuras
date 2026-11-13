#!/bin/bash
# Vuelve a la versión anterior del juego (ssh bellaka bk-version volver) y vacía la caché de Bunny para que se vea al momento.
#   herramientas/volver.sh
set -euo pipefail
D="$(cd "$(dirname "$0")" && pwd)"
ssh -o BatchMode=yes bellaka bk-version volver
[ -x "$D/bunny/bunny.sh" ] && { "$D/bunny/bunny.sh" purgar || true; }
curl -s https://bellakaventuras.com/salud-version; echo
