#!/usr/bin/env bash
# Récord del cronómetro de speedrun (V10.6.1) desde el Mac: el juego enseña siempre el top 3; aquí se ve y se quita un tiempo falso (llega en < 2 min).
#   record.sh ver                      top 3 (lo que ve el juego) y los 10 mejores (con aparato y hora)
#   record.sh quitar                   quita el récord actual (falso); «quitar 7:41.2» quita ese tiempo
#   record.sh devolver 7:41.2          deshace un «quitar»
#   record.sh empezar 10:00.0          BORRA todos los tiempos y empieza el top con un único registro
set -euo pipefail
H="${BK_HOST:-bellaka}"; C="${1:-ver}"; shift || true
case "$C" in ver|quitar|devolver|empezar) ;; *) sed -n '2,6p' "$0"; exit 2;; esac
ARGS="--$C"; for x in "$@"; do ARGS+=" $(printf '%q' "$x")"; done
ssh -o BatchMode=yes "$H" "/usr/local/bin/bk-record $ARGS"
