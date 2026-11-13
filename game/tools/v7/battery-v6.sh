#!/bin/zsh
# Batería de cierre V6 contra dist-v6 identificada (bk-v6-dist, 5212; base V5 en 5213 para comparativas).
# Contrato vigente (qué mide cada prueba, resultado esperado, «no aplica» y pendientes humanos): Auditoría 6/plan-v6/09_CONTRATO_PRUEBAS_V6.md
# Resumen en V6/evidencias/T6-14/bateria_v6.txt (una línea por prueba; FALLO/ERROR detallados).
cd /Users/TU_USUARIO/Desktop/Bellakaventuras
OUT=${OUT:-V6/evidencias/T6-14/bateria_v6.txt}; mkdir -p V6/evidencias/T6-14; : > $OUT
echo "INICIO $(date) · identidad: $(curl -s http://127.0.0.1:5212/ | grep -o 'build/[a-z]*-[A-Za-z0-9_-]*\.js' | head -2 | tr '\n' ' ')" >> $OUT
run6() { local t=$1; shift; node game/tools/v6/$t.mjs --url v6 --task T6-14 --label final "$@" 2>&1 | grep -E "^(FALLO|ERROR)|: (VERDE|FALLOS|ERROR|VACIO|TIMEOUT)" | cut -c1-300 >> $OUT; }
run5() { local t=$1; shift; node game/tools/v6/v5suite/$t.mjs --url v6 --task T6-14 --label final "$@" 2>&1 | grep -E "^(FALLO|ERROR)|: (VERDE|FALLOS|ERROR|VACIO|TIMEOUT)" | cut -c1-300 | sed "s/^/[v5] /" >> $OUT; }
for t in fg-routes fg-ladder fg-dance fg-cams fg-tunnel-cam regression-nmg perf-fg fg-cartel nmg-graffiti-shots fg-shots; do run6 $t; done
for t in ${=V5LIST:-heading-contract hop-ratio speed-matrix pause-input geo-coherence nmg-supports quarter-palm u-pit car-matrix step-matrix collision-inventory board-curves touch-tasks orient-emu feet-v5 anmi-pie npc-arms cam-orbit cam-cases ux-layouts actividades-ux final-v5 final-touch persist-matrix fry-access free-dance bench-sit pantera-npc lettering-read vehicles-v5}; do run5 $t; done
U="http://127.0.0.1:5212/?bktest=1&"
for t in ${=V4LIST:-esc-routes land-support final-v4 impact-seq}; do (cd game && node tools/v4/$t.mjs --url "$U" 2>&1 | grep -E "^(FALLO|ERROR)|: (VERDE|FALLOS|ERROR|VACIO|TIMEOUT)" | cut -c1-300 | sed "s/^/[v4] /") >> $OUT; done
(cd game && node tools/v6/campaign-v6.mjs --url "$U" 2>&1 | grep -E "^(FALLO|ERROR)|: (VERDE|FALLOS|ERROR|VACIO|TIMEOUT)" | cut -c1-300 | sed "s/^/[v6-campaña] /") >> $OUT
echo "FIN $(date)" >> $OUT
