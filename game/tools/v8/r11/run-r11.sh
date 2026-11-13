#!/bin/zsh
# R11 · suite rojo→verde completa. Uso: zsh tools/v8/r11/run-r11.sh <alias: pre|v8|r11|r11b> [salida]
# Contra `pre` (línea base congelada, 5234) deben salir ROJAS las comprobaciones que reproducen cada hallazgo; contra la build nueva, VERDES.
cd /Users/TU_USUARIO/Desktop/Bellakaventuras/game
U=${1:-v8}; OUT=${2:-../V8/evidencias/R11/suite_r11_$U.txt}; : > $OUT
F='^(FALLO|ERROR|INV|NOTA  #. §6)|: (VERDE|FALLOS|ERROR)'
echo "INICIO $(date) · $U · $(curl -s $(node -e "import('./tools/v8/lib.mjs').then(m=>console.log(m.URLS['$U']))") | grep -o 'build/[a-z]*-[A-Za-z0-9_-]*\.js' | head -1)" >> $OUT
for t in f1-dialogo f1-varios f1-pestanas f2-baile f3-centro f4-latch f5-pared f5-npc-camara f6-arista f6-cresta f6-varios f7-rampas f7-impactos f8-trucos f8-fps f9-camara f10-audio f11-hud f11-multitactil f11-baile-dedos f12-guia f13-rend f13-hitch f14-slide2 f14-bail f14-rana f15-bajos; do
  node tools/v8/r11/$t.mjs --url $U --task R11 --label suite-$U 2>&1 | grep -E "$F" | cut -c1-300 >> $OUT
done
# ANIM-08: solo el caso del golpe de coche (la sonda copiada tiene también escalera y vaso, fuera de R11)
node tools/v8/r11/f14-impact-ladder.mjs --url $U --task R11 --label suite-$U --only A 2>&1 | grep -E "$F" | cut -c1-300 >> $OUT
echo "FIN $(date)" >> $OUT
