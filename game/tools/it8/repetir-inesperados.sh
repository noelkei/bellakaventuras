#!/bin/zsh
# IT8 (relevo 23 oct): repite EN SOLITARIO los 3 rojos de la batería final que no estaban en la lista de esperados
# (perf-v8, grafitear, anim-dialogo), dos veces cada uno, contra 5247 (aSky7GjC). Solo mide; no toca el juego.
cd /Users/TU_USUARIO/Desktop/Bellakaventuras
OUT=V10/IT8/evidencias/bateria/inesperados_solo.txt; : > $OUT
REG=V10/IT8/REGISTRO_IT8.md
U=http://127.0.0.1:5247/
F='^(FALLO|ERROR|INVÁL)|: (VERDE|FALLOS|ERROR|VACIO|TIMEOUT|INVALIDO)'
echo "- EN CURSO $(date +%H:%M) · repetir-inesperados.sh: perf-v8, grafitear, anim-dialogo ×2 en solitario → $OUT" >> $REG
echo "INICIO $(date) · $(curl -s $U | grep -o 'index-[A-Za-z0-9_-]*\.js')" >> $OUT
for i in 1 2; do
  echo "== vuelta $i" >> $OUT
  node game/tools/v8/perf-v8.mjs --url $U --task IT8-final --label solo$i 2>&1 | grep -E "$F" | cut -c1-320 >> $OUT
  node game/tools/v10_2/grafitear.mjs --url $U --task IT8-final --label solo$i 2>&1 | grep -E "$F" | cut -c1-320 | sed "s/^/[v10.2] /" >> $OUT
  node game/tools/v10_5/anim-dialogo.mjs --url $U --task IT8-final --label solo$i 2>&1 | grep -E "$F" | cut -c1-320 | sed "s/^/[v10.5] /" >> $OUT
done
echo "FIN $(date)" >> $OUT
echo "- HECHO $(date +%H:%M) · repetir-inesperados.sh · verdes $(grep -c ': VERDE' $OUT) · fallos $(grep -c ': FALLOS' $OUT) · error/timeout $(grep -cE ': (ERROR|TIMEOUT|INVALIDO)' $OUT) (ANALIZAR)" >> $REG
