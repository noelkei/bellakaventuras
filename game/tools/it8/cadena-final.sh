#!/bin/zsh
# IT8 · cadena final desatendida (22 oct): espera a que termine la matriz E1 en marcha y luego, de una en una (nunca dos a la vez):
#   G2 memoria-larga → batería completa (con --v103 y la sección IT8) → suite R11 (copia it8) → huella final → 5244 de vuelta a lo publicado
#   → página de revisión. Cada paso apunta «EN CURSO» y «HECHO» en V10/IT8/REGISTRO_IT8.md. No analiza nada: el análisis lo hace después un chat.
# Si un servidor no responde, lo apunta (SERVIDOR-CAIDO) y sigue: esas pruebas habrá que repetirlas.
cd /Users/TU_USUARIO/Desktop/Bellakaventuras
REG=V10/IT8/REGISTRO_IT8.md; EV=V10/IT8/evidencias; U=http://127.0.0.1:5247/
apunta() { echo "- $1 $(date +%H:%M) · $2" >> $REG; }
vivo() { for p in 5247 5240 5233; do curl -s -m 3 http://127.0.0.1:$p/ > /dev/null || apunta AVISO "SERVIDOR-CAIDO $p antes de $1 (lo que dependa de él saldrá ERROR de conexión: repetir)"; done; }
apunta "EN CURSO" "cadena-final.sh (desatendida): espera a la matriz E1 y sigue con G2, batería+IT8, suite R11, huella, 5244, página"
while pgrep -f "it8/ui-matriz.mjs" > /dev/null; do sleep 30; done
apunta HECHO "E1 ui-matriz terminó (resultado: última línea de $EV/E1-ui-matriz/matriz.log; ANALIZAR)"
vivo memoria; apunta "EN CURSO" "G2 memoria-larga (log $EV/G2-memoria/memoria.log)"; mkdir -p $EV/G2-memoria
node game/tools/it8/memoria-larga.mjs --url $U --min 12 > $EV/G2-memoria/memoria.log 2>&1
apunta HECHO "G2 memoria-larga · $(grep -E 'it8-memoria' $EV/G2-memoria/memoria.log | tail -1 | cut -c1-160)"
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
