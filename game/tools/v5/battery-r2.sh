#!/bin/zsh
# Batería R2-G8 (revisión del usuario 12 oct: marcha V4 + pie plano, murales gastados, BAILAR, sonido de La Pantera) — lista R1 + walk-compare, free-dance, pantera-audio contra dist-v5 identificada: todas las pruebas V5 por tarea + V4 relevantes.
# Resumen en V5/evidencias/R2-G8/bateria_r2.txt (una línea por prueba; FALLO/ERROR detallados).
cd /Users/TU_USUARIO/Desktop/Bellakaventuras
OUT=V5/evidencias/R2-G8/bateria_r2.txt; : > $OUT
run() { local t=$1; shift; node game/tools/v5/$t.mjs --url v5 --task R2-G8 --label r2 "$@" 2>&1 | grep -E "^(FALLO|ERROR)|: (VERDE|FALLOS|ERROR|VACIO|TIMEOUT)" | cut -c1-260 >> $OUT; }
for t in heading-contract hop-ratio speed-matrix pause-input geo-coherence nmg-supports quarter-palm u-pit car-matrix step-matrix collision-inventory board-curves touch-tasks gesture-c orient-emu feet-v5 anmi-pie npc-arms cam-orbit cam-cases ux-layouts actividades-ux final-v5 final-touch persist-matrix fry-access lettering-read vehicles-v5 preview-audio bench-sit walk-compare free-dance pantera-audio perf coverage-v5 identity-v5; do run $t; done
run arrival-sweep --offs 0.45
run impact-matrix --speeds 8.6,9.3 --angles 0,30 --tries 1
node game/tools/v5/impact-matrix.mjs --url v5 --task R2-G8 --label r2-alta --vfix --speeds 16,20 --angles 0,30 --tries 1 2>&1 | grep -E "^(FALLO|ERROR)|: (VERDE|FALLOS|ERROR|VACIO)" >> $OUT
U="http://127.0.0.1:5199/?bktest=1&"
for t in esc-routes land-support final-v4 ctrl-contract impact-seq campaign-v4 vehicles-shots; do (cd game && node tools/v4/$t.mjs --url "$U" 2>&1 | grep -E "^(FALLO|ERROR)|: (VERDE|FALLOS|ERROR|VACIO|TIMEOUT)" | cut -c1-260 | sed "s/^/[v4] /") >> $OUT; done
(cd game && node tools/v4/anim-v4.mjs --url "$U" --start -43.2,0,-50,0.6807 2>&1 | grep -E "^(FALLO|ERROR)|: (VERDE|FALLOS|ERROR|VACIO|TIMEOUT)" | cut -c1-260 | sed "s/^/[v4] /") >> $OUT
echo "FIN $(date)" >> $OUT
