#!/bin/zsh
# Batería de cierre V8 contra dist-v8 identificada (bk-v8-dist, 5232; base V7 final R8 en 5233 para comparativas).
# Contrato vigente: Auditoría 8/plan-v8/10_CONTRATO_PRUEBAS_V8.md. Resumen en V8/evidencias/$TASK/bateria_v8.txt (una línea por prueba).
cd /Users/TU_USUARIO/Desktop/Bellakaventuras
TASK=${TASK:-YY8-12}; OUT=${OUT:-V8/evidencias/$TASK/bateria_v8.txt}; mkdir -p V8/evidencias/$TASK; : > $OUT
echo "INICIO $(date) · servida: $(curl -s http://127.0.0.1:5232/ | grep -o 'build/[a-z]*-[A-Za-z0-9_-]*\.js' | head -2 | tr '\n' ' ') · base: $(curl -s http://127.0.0.1:5233/ | grep -o 'build/[a-z]*-[A-Za-z0-9_-]*\.js' | head -1)" >> $OUT
F='^(FALLO|ERROR|INVÁL)|: (VERDE|FALLOS|ERROR|VACIO|TIMEOUT)'
run8() { local t=$1; shift; node game/tools/v8/$t.mjs --url v8 --task $TASK --label final "$@" 2>&1 | grep -E "$F" | cut -c1-320 >> $OUT; }
run5() { local t=$1; shift; node game/tools/v8/v5suite/$t.mjs --url v8 --task $TASK --label final "$@" 2>&1 | grep -E "$F" | cut -c1-320 | sed "s/^/[v5] /" >> $OUT; }
echo "## YINYANG (V8)" >> $OUT
for t in ${=YYLIST:-yy-contract yy-routes yy-walls yy-wallride yy-wallfuzz yy-talk yy-graffiti yy-persist yy-cams yy-shots regression-v8 perf-v8}; do run8 $t; done
echo "## TRA TRA TRA (pruebas V7, copia V8)" >> $OUT
run8 tt-routes --order aj; run8 tt-routes --order ja
for t in ${=TTLIST:-tt-matrix tt-talks tt-cams tt-shots tt-graffiti-shots ux-r5 ux-mouse}; do run8 $t; done
echo "## FASHION GIRL y NMG (pruebas V6, copia V8)" >> $OUT
for t in ${=V6LIST:-fg-routes fg-ladder fg-dance fg-cams fg-tunnel-cam fg-cartel nmg-graffiti-shots fg-shots}; do run8 $t; done
echo "## Suite heredada de V5 (copia V8)" >> $OUT
for t in ${=V5LIST:-heading-contract hop-ratio speed-matrix pause-input geo-coherence nmg-supports quarter-palm u-pit car-matrix step-matrix collision-inventory board-curves touch-tasks orient-emu feet-v5 anmi-pie npc-arms cam-orbit cam-cases ux-layouts actividades-ux final-v5 final-touch persist-matrix fry-access free-dance bench-sit pantera-npc lettering-read vehicles-v5}; do run5 $t; done
echo "## V4 y campaña" >> $OUT
U="http://127.0.0.1:5232/?bktest=1&"
(cd game && node tools/v8/esc-routes-v7.mjs --url "$U" 2>&1 | grep -E "$F" | cut -c1-320 | sed "s/^/[v4→v8] /") >> $OUT
for t in ${=V4LIST:-land-support final-v4 impact-seq}; do (cd game && node tools/v4/$t.mjs --url "$U" 2>&1 | grep -E "$F" | cut -c1-320 | sed "s/^/[v4] /") >> $OUT; done
(cd game && node tools/v8/campaign-v8.mjs --url "$U" 2>&1 | grep -E "$F" | cut -c1-320 | sed "s/^/[v8-campaña] /") >> $OUT
echo "FIN $(date)" >> $OUT
