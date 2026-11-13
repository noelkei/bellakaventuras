#!/bin/zsh
# Batería FINAL V5 (T5-32) contra dist-v5 identificada: todas las pruebas V5 por tarea + V4 relevantes.
# Resumen en V5/evidencias/T5-32/bateria_final.txt (una línea por prueba; FALLO/ERROR detallados).
cd /Users/TU_USUARIO/Desktop/Bellakaventuras
OUT=V5/evidencias/T5-32/bateria_final.txt; : > $OUT
run() { local t=$1; shift; node game/tools/v5/$t.mjs --url v5 --task T5-32 --label final "$@" 2>&1 | grep -E "^(FALLO|ERROR)|: (VERDE|FALLOS|ERROR|VACIO|TIMEOUT)" | cut -c1-260 >> $OUT; }
for t in heading-contract hop-ratio speed-matrix pause-input geo-coherence nmg-supports quarter-palm u-pit car-matrix step-matrix collision-inventory board-curves touch-tasks gesture-c orient-emu feet-v5 anmi-pie npc-arms cam-orbit cam-cases ux-layouts actividades-ux final-v5 final-touch persist-matrix fry-access lettering-read vehicles-v5 preview-audio; do run $t; done
run arrival-sweep --offs 0.45
run impact-matrix --speeds 8.6,9.3 --angles 0,30 --tries 1
node game/tools/v5/impact-matrix.mjs --url v5 --task T5-32 --label final-alta --vfix --speeds 16,20 --angles 0,30 --tries 1 2>&1 | grep -E "^(FALLO|ERROR)|: (VERDE|FALLOS|ERROR|VACIO)" >> $OUT
U="http://127.0.0.1:5199/?bktest=1&"
for t in esc-routes land-support final-v4 ctrl-contract impact-seq campaign-v4 vehicles-shots; do (cd game && node tools/v4/$t.mjs --url "$U" 2>&1 | grep -E "^(FALLO|ERROR)|: (VERDE|FALLOS|ERROR|VACIO|TIMEOUT)" | cut -c1-260 | sed "s/^/[v4] /") >> $OUT; done
(cd game && node tools/v4/anim-v4.mjs --url "$U" --start -43.2,0,-50,0.6807 2>&1 | grep -E "^(FALLO|ERROR)|: (VERDE|FALLOS|ERROR|VACIO|TIMEOUT)" | cut -c1-260 | sed "s/^/[v4] /") >> $OUT
echo "FIN $(date)" >> $OUT
