#!/bin/zsh
# Batería de cierre V7 contra dist-v7 identificada (bk-v7-dist, 5222; base V6 final R7 en 5223 para comparativas).
# Contrato vigente: Auditoría 7/plan-v7/09_CONTRATO_PRUEBAS_V7.md. Resumen en V7/evidencias/T7-14/bateria_v7.txt (una línea por prueba).
cd /Users/TU_USUARIO/Desktop/Bellakaventuras
TASK=${TASK:-T7-14}; OUT=${OUT:-V7/evidencias/$TASK/bateria_v7.txt}; mkdir -p V7/evidencias/$TASK; : > $OUT
echo "INICIO $(date) · servida: $(curl -s http://127.0.0.1:5222/ | grep -o 'build/[a-z]*-[A-Za-z0-9_-]*\.js' | head -2 | tr '\n' ' ') · base: $(curl -s http://127.0.0.1:5223/ | grep -o 'build/[a-z]*-[A-Za-z0-9_-]*\.js' | head -1)" >> $OUT
F='^(FALLO|ERROR|INVÁL)|: (VERDE|FALLOS|ERROR|VACIO|TIMEOUT)'
run7() { local t=$1; shift; node game/tools/v7/$t.mjs --url v7 --task $TASK --label final "$@" 2>&1 | grep -E "$F" | cut -c1-320 >> $OUT; }
run5() { local t=$1; shift; node game/tools/v7/v5suite/$t.mjs --url v7 --task $TASK --label final "$@" 2>&1 | grep -E "$F" | cut -c1-320 | sed "s/^/[v5] /" >> $OUT; }
echo "## TRA TRA TRA (V7)" >> $OUT
run7 tt-routes --order aj --clip; run7 tt-routes --order ja
for t in ${=V7LIST:-tt-matrix tt-talks tt-cams tt-shots tt-graffiti-shots regression-v7 perf-v7 ux-r5 ux-mouse}; do run7 $t; done   # R5–R6: + tt-graffiti-shots, ux-r5 · R8: + ux-mouse
echo "## FASHION GIRL y NMG (pruebas V6, copia V7)" >> $OUT
for t in ${=V6LIST:-fg-routes fg-ladder fg-dance fg-cams fg-tunnel-cam fg-cartel nmg-graffiti-shots fg-shots}; do run7 $t; done
echo "## Suite heredada de V5 (copia V7)" >> $OUT
for t in ${=V5LIST:-heading-contract hop-ratio speed-matrix pause-input geo-coherence nmg-supports quarter-palm u-pit car-matrix step-matrix collision-inventory board-curves touch-tasks orient-emu feet-v5 anmi-pie npc-arms cam-orbit cam-cases ux-layouts actividades-ux final-v5 final-touch persist-matrix fry-access free-dance bench-sit pantera-npc lettering-read vehicles-v5}; do run5 $t; done
echo "## V4 y campaña" >> $OUT
U="http://127.0.0.1:5222/?bktest=1&"
(cd game && node tools/v7/esc-routes-v7.mjs --url "$U" 2>&1 | grep -E "$F" | cut -c1-320 | sed "s/^/[v4→v7] /") >> $OUT
for t in ${=V4LIST:-land-support final-v4 impact-seq}; do (cd game && node tools/v4/$t.mjs --url "$U" 2>&1 | grep -E "$F" | cut -c1-320 | sed "s/^/[v4] /") >> $OUT; done
(cd game && node tools/v7/campaign-v7.mjs --url "$U" 2>&1 | grep -E "$F" | cut -c1-320 | sed "s/^/[v7-campaña] /") >> $OUT
echo "FIN $(date)" >> $OUT
