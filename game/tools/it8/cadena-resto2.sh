#!/bin/zsh
# IT8 · cadena RESTO 2 (22 oct 18:40): sustituye a cadena-resto.sh SIN el paso de copiar lo publicado a game/dist-v10-prev (esa carpeta la
# recompiló otro chat a las 15:02: no se pisa; D8-06). Espera a que acabe la batería en marcha → suite R11 → huella final → página.
cd /Users/TU_USUARIO/Desktop/Bellakaventuras
REG=V10/IT8/REGISTRO_IT8.md; EV=V10/IT8/evidencias; U=http://127.0.0.1:5247/
apunta() { echo "- $1 $(date +%H:%M) · $2" >> $REG; }
vivo() { for p in 5247 5240 5233; do curl -s -m 3 http://127.0.0.1:$p/ > /dev/null || apunta AVISO "SERVIDOR-CAIDO $p antes de $1 (repetir lo que dependa de él)"; done; }
apunta "EN CURSO" "cadena-resto2.sh: espera a la batería en marcha → suite R11 → huella → página (sin tocar dist-v10-prev)"
while pgrep -f "v8/r11/battery-r11.sh" > /dev/null; do sleep 30; done
apunta HECHO "batería final · verdes $(grep -c ': VERDE' $EV/bateria/bateria_final_it8.txt) · fallos $(grep -c ': FALLOS' $EV/bateria/bateria_final_it8.txt) · error/timeout/inválido $(grep -cE ': (ERROR|TIMEOUT|INVALIDO|VACIO)' $EV/bateria/bateria_final_it8.txt) · ¿IT8-FIN? $(grep -c 'IT8-FIN' $EV/bateria/bateria_final_it8.txt) (ANALIZAR)"
vivo suite; apunta "EN CURSO" "suite R11 (copia it8) → $EV/bateria/suite_r11_final.txt"
zsh game/tools/it8/suite-r11.sh $U ../$EV/bateria/suite_r11_final.txt
apunta HECHO "suite R11 · verdes $(grep -c ': VERDE' $EV/bateria/suite_r11_final.txt) · fallos $(grep -c ': FALLOS' $EV/bateria/suite_r11_final.txt)"
apunta "EN CURSO" "huella final"
zsh V10/IT8/huella.sh $EV/sha_fin.txt > /dev/null
N=$(diff $EV/sha_inicio.txt $EV/sha_fin.txt | grep '^[<>]' | grep -vc 'V10/IT7/wip-portada/')
apunta HECHO "huella final $EV/sha_fin.txt · diferencias fuera de V10/IT7/wip-portada (D8-05): $N (tiene que ser 0)"
python3 V10/IT8/tools/revision_it8.py > /dev/null && apunta HECHO "página de revisión regenerada (V10/IT8/revision/index.html)"
apunta HECHO "cadena-resto2.sh terminada · FALTA: analizar la batería final y la suite, verificación por agente (§4 D), completar INFORME §8, memoria, avisar al chat de V10.5"
