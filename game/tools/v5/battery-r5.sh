#!/bin/zsh
# R4–R5 (12 oct): zoom bloqueado, volumen La Pantera + canción atenuada en su recuadro, mirada libre manteniendo la cámara.
cd /Users/TU_USUARIO/Desktop/Bellakaventuras
OUT=V5/evidencias/R5/bateria_r5.txt; mkdir -p V5/evidencias/R5; : > $OUT
run() { local t=$1; shift; node game/tools/v5/$t.mjs --url v5 --task R5 --label r5 "$@" 2>&1 | grep -E "^(FALLO|ERROR)|: (VERDE|FALLOS|ERROR|VACIO|TIMEOUT)" | cut -c1-260 >> $OUT; }
for t in cam-freelook cam-fortnite cam-cases cam-orbit touch-tasks gesture-c ux-layouts final-touch final-v5 pantera-audio no-zoom free-dance bench-sit heading-contract pause-input perf identity-v5; do run $t; done
U="http://127.0.0.1:5199/?bktest=1&"
for t in ctrl-contract campaign-v4; do (cd game && node tools/v4/$t.mjs --url "$U" 2>&1 | grep -E "^(FALLO|ERROR)|: (VERDE|FALLOS|ERROR|VACIO|TIMEOUT)" | cut -c1-260 | sed "s/^/[v4] /") >> $OUT; done
echo "FIN $(date)" >> $OUT
