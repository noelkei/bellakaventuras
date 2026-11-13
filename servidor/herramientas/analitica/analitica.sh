#!/bin/bash
# Informe de analítica desde el Mac: sube bk_analitica.py al servidor, lo ejecuta y guarda el resultado
# (solo totales, sin IP) en informes/analitica-<fecha>.txt.
#   herramientas/analitica/analitica.sh [--desde AAAA-MM-DD] [--horas] [--guardar] [--historico]
# Además trae al Mac los resúmenes diarios guardados en el servidor (informes/diario/, sin IP): copia que no caduca.
D="$(cd "$(dirname "$0")" && pwd)"; F="$D/../../informes/analitica-$(date +%Y%m%d-%H%M).txt"
scp -q "$D/bk_analitica.py" bellaka:/usr/local/bin/bk-analitica && ssh -o BatchMode=yes bellaka "chmod 755 /usr/local/bin/bk-analitica && nice bk-analitica $*" | tee "$F"
mkdir -p "$D/../../informes/diario" && scp -q 'bellaka:/var/lib/bk-analitica/dias/*.json' "$D/../../informes/diario/" 2>/dev/null || true
