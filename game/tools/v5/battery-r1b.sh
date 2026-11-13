#!/bin/zsh
# R1-G8 b: repite lo que falló o se vio afectado en battery-r1 (índice de actividades, murales c, cartel rosa).
cd /Users/TU_USUARIO/Desktop/Bellakaventuras
OUT=V5/evidencias/R1-G8/bateria_r1b.txt; : > $OUT
run() { local t=$1; shift; node game/tools/v5/$t.mjs --url v5 --task R1-G8 --label r1b "$@" 2>&1 | grep -E "^(FALLO|ERROR)|: (VERDE|FALLOS|ERROR|VACIO|TIMEOUT)" | cut -c1-260 >> $OUT; }
for t in final-v5 final-touch persist-matrix cam-cases lettering-read bench-sit geo-coherence nmg-supports u-pit quarter-palm perf identity-v5; do run $t; done
U="http://127.0.0.1:5199/?bktest=1&"
for t in esc-routes final-v4 campaign-v4; do (cd game && node tools/v4/$t.mjs --url "$U" 2>&1 | grep -E "^(FALLO|ERROR)|: (VERDE|FALLOS|ERROR|VACIO|TIMEOUT)" | cut -c1-260 | sed "s/^/[v4] /") >> $OUT; done
echo "FIN $(date)" >> $OUT
