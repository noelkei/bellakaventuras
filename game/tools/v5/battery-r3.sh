#!/bin/zsh
# R3 (12 oct): cámara «Fortnite» táctil/mando + frases de La Pantera + pruebas obsoletas del trote. Pruebas afectadas.
cd /Users/TU_USUARIO/Desktop/Bellakaventuras
OUT=V5/evidencias/R3/bateria_r3.txt; mkdir -p V5/evidencias/R3; : > $OUT
run() { local t=$1; shift; node game/tools/v5/$t.mjs --url v5 --task R3 --label r3 "$@" 2>&1 | grep -E "^(FALLO|ERROR)|: (VERDE|FALLOS|ERROR|VACIO|TIMEOUT)" | cut -c1-260 >> $OUT; }
for t in cam-fortnite touch-tasks gesture-c cam-cases cam-orbit ux-layouts final-touch final-v5 pantera-audio free-dance feet-v5 walk-compare coverage-v5 heading-contract perf identity-v5; do run $t; done
U="http://127.0.0.1:5199/?bktest=1&"
for t in ctrl-contract; do (cd game && node tools/v4/$t.mjs --url "$U" 2>&1 | grep -E "^(FALLO|ERROR)|: (VERDE|FALLOS|ERROR|VACIO|TIMEOUT)" | cut -c1-260 | sed "s/^/[v4] /") >> $OUT; done
echo "FIN $(date)" >> $OUT
