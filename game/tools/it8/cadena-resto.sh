#!/bin/zsh
# IT8 · cadena RESTO desatendida (22 oct): la parte final de cadena-final.sh (que se paró para hacer antes la verificación por agente con la
# máquina libre): batería completa (--v103 + IT8) → suite R11 → huella final → 5244 de vuelta a lo publicado → página. Espera a que no quede
# ninguna memoria-larga en marcha. Apunta EN CURSO/HECHO en V10/IT8/REGISTRO_IT8.md. No analiza nada.
cd /Users/TU_USUARIO/Desktop/Bellakaventuras
REG=V10/IT8/REGISTRO_IT8.md; EV=V10/IT8/evidencias; U=http://127.0.0.1:5247/
apunta() { echo "- $1 $(date +%H:%M) · $2" >> $REG; }
vivo() { for p in 5247 5240 5233; do curl -s -m 3 http://127.0.0.1:$p/ > /dev/null || apunta AVISO "SERVIDOR-CAIDO $p antes de $1 (lo que dependa de él saldrá ERROR de conexión: repetir)"; done; }
apunta "EN CURSO" "cadena-resto.sh (desatendida): batería+IT8, suite R11, huella, 5244, página"
while pgrep -f "it8/memoria-larga.mjs" > /dev/null; do sleep 30; done
vivo bateria; apunta "EN CURSO" "batería completa + IT8 contra 5247 ($EV/bateria/bateria_final_it8.txt; ~4-5 h)"
BKALIAS=$U BKPORT=5247 TASK=IT8-final OUT=$EV/bateria/bateria_final_it8.txt REGARGS="--exclude exterior,nvda,centro --v103" zsh game/tools/v8/r11/battery-r11.sh
apunta HECHO "batería final · verdes $(grep -c ': VERDE' $EV/bateria/bateria_final_it8.txt) · fallos $(grep -c ': FALLOS' $EV/bateria/bateria_final_it8.txt) · error/timeout/inválido $(grep -cE ': (ERROR|TIMEOUT|INVALIDO|VACIO)' $EV/bateria/bateria_final_it8.txt) (ANALIZAR)"
vivo suite; apunta "EN CURSO" "suite R11 (copia it8) → $EV/bateria/suite_r11_final.txt"
zsh game/tools/it8/suite-r11.sh $U ../$EV/bateria/suite_r11_final.txt
apunta HECHO "suite R11 · verdes $(grep -c ': VERDE' $EV/bateria/suite_r11_final.txt) · fallos $(grep -c ': FALLOS' $EV/bateria/suite_r11_final.txt)"
apunta "EN CURSO" "huella final"
zsh V10/IT8/huella.sh $EV/sha_fin.txt > /dev/null
N=$(diff $EV/sha_inicio.txt $EV/sha_fin.txt | grep '^[<>]' | grep -vc 'V10/IT7/wip-portada/')
apunta HECHO "huella final $EV/sha_fin.txt · diferencias fuera de V10/IT7/wip-portada (cambiada por el chat de V10.5, D8-05): $N (tiene que ser 0)"
rsync -a --delete game/dist-v10/ game/dist-v10-prev/ && apunta HECHO "5244 (game/dist-v10-prev) devuelto a lo publicado (D8-03)"
python3 V10/IT8/tools/revision_it8.py > /dev/null && apunta HECHO "página de revisión regenerada (V10/IT8/revision/index.html)"
apunta HECHO "cadena-final.sh terminada · FALTA: analizar E1, G2 y la batería final, verificación por agente, completar INFORME §4 y §8, memoria, avisar al chat de V10.5"
