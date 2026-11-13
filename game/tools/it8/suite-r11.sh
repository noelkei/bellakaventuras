#!/bin/zsh
# IT8 · copia de tools/v8/r11/run-r11.sh (sin tocarlo) para pasar la suite R11 contra una URL completa: run-r11.sh pone la URL en la etiqueta
# del informe (`--label suite-http://…/`) y con una URL completa cada prueba muere al crear su archivo (pasó en el cierre de V10.5 y aquí).
# f3-centro se RETIRA (obsoleta: busca la actividad `finalTriple`, hoy `secretJump`; la sustituyen las sn-* de tools/v10; INVENTARIO.md).
cd /Users/TU_USUARIO/Desktop/Bellakaventuras/game
U=${1:-http://127.0.0.1:5247/}; OUT=${2:-../V10/IT8/evidencias/bateria/suite_r11.txt}; : > $OUT
F='^(FALLO|ERROR|INV|NOTA  #. §6)|: (VERDE|FALLOS|ERROR)'
echo "INICIO $(date) · $U · $(curl -s $U | grep -o 'build/index-[A-Za-z0-9_-]*\.js' | head -1)" >> $OUT
for t in f1-dialogo f1-varios f1-pestanas f2-baile f4-latch f5-pared f5-npc-camara f6-arista f6-cresta f6-varios f7-rampas f7-impactos f8-trucos f8-fps f9-camara f10-audio f11-hud f11-multitactil f11-baile-dedos f12-guia f13-rend f13-hitch f14-slide2 f14-bail f14-rana f15-bajos; do
  node tools/v8/r11/$t.mjs --url $U --task R11 --label suite-it8 2>&1 | grep -E "$F" | cut -c1-300 >> $OUT
done
node tools/v8/r11/f14-impact-ladder.mjs --url $U --task R11 --label suite-it8 --only A 2>&1 | grep -E "$F" | cut -c1-300 >> $OUT
echo "FIN $(date)" >> $OUT
