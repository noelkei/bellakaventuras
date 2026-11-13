#!/bin/zsh
# IT8 · repite las pruebas de la sección IT8 de la batería final que no midieron nada porque el Mac se durmió (tapa cerrada, 22 oct ~19:00:
# servidores apagados → ERR_CONNECTION_REFUSED). Espera a que acabe cadena-resto2.sh. Mismo filtro que battery-r11.sh.
cd /Users/TU_USUARIO/Desktop/Bellakaventuras
REG=V10/IT8/REGISTRO_IT8.md; OUT=V10/IT8/evidencias/bateria/bateria_final_it8_repetidas.txt; U=http://127.0.0.1:5247/
F='^(FALLO|ERROR|INVÁL)|: (VERDE|FALLOS|ERROR|VACIO|TIMEOUT|INVALIDO)'
apunta() { echo "- $1 $(date +%H:%M) · $2" >> $REG; }
while pgrep -f "cadena-resto2.sh" > /dev/null; do sleep 30; done
apunta "EN CURSO" "cadena-repetir.sh: repite 13 pruebas IT8 de la batería final que dieron conexión rechazada (Mac dormido) → $OUT"
: > $OUT; echo "INICIO $(date) · $(curl -s $U | grep -o 'build/index-[A-Za-z0-9_-]*\.js')" >> $OUT
r() { curl -s -m 3 $U > /dev/null || echo "SERVIDOR-CAIDO $(date) antes de $1" >> $OUT; node game/tools/it8/$1.mjs --url $U --task IT8-final --label repetida "${@:2}" 2>&1 | grep -E "$F" | cut -c1-320 | sed "s/^/[it8] /" >> $OUT; }
r recarga-todo; r interrupciones; r menus --via mando; r menus --via teclado; r ajustes-efecto; r audio-sistema; r volver-plaza
r mecanicas-entradas; r orden-libre; r narrativa-cortes; r entradas-cortes; r grafiti-mando; r bordes --n 250; r carga-red --casos 404,cache
echo "FIN $(date)" >> $OUT
apunta HECHO "cadena-repetir.sh · verdes $(grep -c ': VERDE' $OUT) · fallos $(grep -c ': FALLOS' $OUT) · error/timeout $(grep -cE ': (ERROR|TIMEOUT|INVALIDO)' $OUT) · caídas $(grep -c SERVIDOR-CAIDO $OUT) (ANALIZAR; rojas esperadas: recarga-todo, narrativa-cortes, entradas-cortes, grafiti-mando)"
