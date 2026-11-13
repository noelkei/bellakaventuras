#!/bin/zsh
# Batería de regresión V5 contra una build identificada. Uso: game/tools/v5/battery.sh <url A|v5> <tarea> <etiqueta>
# Ejecuta todas las pruebas V5 y las V4 relevantes; resumen en V5/evidencias/<tarea>/bateria_<etiqueta>.txt
U=${1:-v5}; T=${2:-T5-xx}; L=${3:-bat}
cd /Users/TU_USUARIO/Desktop/Bellakaventuras
OUT=V5/evidencias/$T/bateria_$L.txt; mkdir -p V5/evidencias/$T; : > $OUT
for t in heading-contract hop-ratio speed-matrix pause-input geo-coherence nmg-supports quarter-palm u-pit car-matrix step-matrix; do
  node game/tools/v5/$t.mjs --url $U --task $T --label $L 2>&1 | grep -E "^(FALLO|ERROR)|: (VERDE|FALLOS|ERROR|VACIO|TIMEOUT)" >> $OUT
done
node game/tools/v5/impact-matrix.mjs --url $U --task $T --label $L --speeds 8.6,9.3 --angles 0,30 --tries 1 2>&1 | grep -E "^(FALLO|ERROR)|: (VERDE|FALLOS|ERROR|VACIO)" >> $OUT
node game/tools/v5/impact-matrix.mjs --url $U --task $T --label $L-alta --vfix --speeds 16,20 --angles 0,30 --tries 1 2>&1 | grep -E "^(FALLO|ERROR)|: (VERDE|FALLOS|ERROR|VACIO)" >> $OUT
URL=$([ "$U" = "A" ] && echo "http://127.0.0.1:5197/?bktest=1&" || echo "http://127.0.0.1:5199/?bktest=1&")
for t in esc-routes land-support final-v4 ctrl-contract anim-v4 impact-seq; do
  (cd game && node tools/v4/$t.mjs --url "$URL" 2>&1 | grep -E "^(FALLO|ERROR)|: (VERDE|FALLOS|ERROR|VACIO|TIMEOUT)" | sed "s/^/[v4] /") >> $OUT
done
echo "FIN $(date)" >> $OUT
