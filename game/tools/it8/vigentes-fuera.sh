#!/bin/zsh
# IT8 · paso 2: guardianes vigentes que NO corre ninguna batería (INVENTARIO.md, «Lo importante»), contra la build publicada en 5247.
# Mismo filtro de salida que battery-r11.sh. Uso: zsh game/tools/it8/vigentes-fuera.sh [salida]
cd /Users/TU_USUARIO/Desktop/Bellakaventuras
OUT=${1:-V10/IT8/evidencias/bateria/vigentes_fuera.txt}; : > $OUT
U=http://127.0.0.1:5247/
F='^(FALLO|ERROR|INVÁL)|: (VERDE|FALLOS|ERROR|VACIO|TIMEOUT|INVALIDO)'
echo "INICIO $(date) · $(curl -s $U | grep -o 'build/index-[A-Za-z0-9_-]*\.js')" >> $OUT
for t in ${=V4L:-anim-inventory anim-v4 cam-v4 camfade cars-v4 ctrl-contract graf-v4 kick-v4 nmg-ride nmg-secret repro-baseline sfx-v4 shadow-ab vehicles-shots}; do
  echo "== v4/$t" >> $OUT; (cd game && node tools/v4/$t.mjs --url "${U}?bktest=1&narr=off&" 2>&1 | grep -E "$F" | cut -c1-320) >> $OUT; done
for t in ${=V5L:-arrival-sweep cam-fortnite cam-freelook no-zoom gesture-c pantera-audio preview-audio walk-compare}; do
  echo "== v5suite/$t" >> $OUT; node game/tools/v8/v5suite/$t.mjs --url $U --task IT8-fuera --label it8 2>&1 | grep -E "$F" | cut -c1-320 >> $OUT; done
echo "== r11/f16-vaso-flips" >> $OUT; (cd game && node tools/v8/r11/f16-vaso-flips.mjs --url $U --task IT8-fuera --label it8 2>&1 | grep -E "$F" | cut -c1-320) >> $OUT
echo "== v10/r0-touch-glost" >> $OUT; node game/tools/v10/r0-touch-glost.mjs --url $U --task IT8-fuera --label it8 2>&1 | grep -E "$F" | cut -c1-320 >> $OUT
echo "FIN $(date)" >> $OUT
