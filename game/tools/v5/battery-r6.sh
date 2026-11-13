#!/bin/zsh
# R6 (12 oct): vegetación nueva de NO ME GUILLO (matas A/B/C, A con flores, palmeras, arbusto floral).
cd /Users/TU_USUARIO/Desktop/Bellakaventuras
OUT=V5/evidencias/R6-veg/bateria_r6.txt; : > $OUT
run() { local t=$1; shift; node game/tools/v5/$t.mjs --url v5 --task R6-veg --label r6 "$@" 2>&1 | grep -E "^(FALLO|ERROR)|: (VERDE|FALLOS|ERROR|VACIO|TIMEOUT)" | cut -c1-260 >> $OUT; }
for t in nmg-supports quarter-palm geo-coherence collision-inventory u-pit step-matrix fry-access bench-sit actividades-ux pantera-audio cam-cases cam-fortnite free-dance perf identity-v5 veg-shots nmg-inventory; do run $t; done
U="http://127.0.0.1:5199/?bktest=1&"
for t in esc-routes campaign-v4; do (cd game && node tools/v4/$t.mjs --url "$U" 2>&1 | grep -E "^(FALLO|ERROR)|: (VERDE|FALLOS|ERROR|VACIO|TIMEOUT)" | cut -c1-260 | sed "s/^/[v4] /") >> $OUT; done
echo "FIN $(date)" >> $OUT
