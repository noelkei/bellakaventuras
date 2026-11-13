#!/bin/zsh
# IT8 · paso 2: lo que la batería de la noche no midió (5247 se apagó a las 01:14): v10.4 baile-suelo y radio-limpia, las 18 de V10.5 y la
# suite R11; y la repetición en solitario de tt-talks (ERROR de entorno) y ux-mouse (FALLO nuevo). Mismo filtro que battery-r11.sh.
cd /Users/TU_USUARIO/Desktop/Bellakaventuras
OUT=V10/IT8/evidencias/bateria/bateria_resto.txt; : > $OUT
U=http://127.0.0.1:5247/; TASK=IT8-bateria
F='^(FALLO|ERROR|INVÁL)|: (VERDE|FALLOS|ERROR|VACIO|TIMEOUT|INVALIDO)'
vivo() { curl -s -m 3 $U > /dev/null || echo "SERVIDOR-CAIDO $(date) antes de $1" >> $OUT; }
echo "INICIO $(date) · servida: $(curl -s $U | grep -o 'build/index-[A-Za-z0-9_-]*\.js')" >> $OUT
for t in tt-talks ux-mouse; do vivo $t; node game/tools/v8/$t.mjs --url $U --task $TASK --label resto 2>&1 | grep -E "$F" | cut -c1-320 >> $OUT; done
for t in baile-suelo radio-limpia; do vivo $t; node game/tools/v10_4/$t.mjs --url $U --task $TASK --label final 2>&1 | grep -E "$F" | cut -c1-320 | sed "s/^/[v10.4] /" >> $OUT; done
for t in toque-fantasma saltar-tactil anim-dialogo d2-movil controles-tactil hud-tactil recarga-narrativa migracion-v105 modo-eficiente cine-vertical patatas-tactil portada-contrato portada-carga portada-ciclo portada-audio portada-formatos portada-movimiento portada-mando; do
  vivo $t; node game/tools/v10_5/$t.mjs --url $U --task $TASK --label final 2>&1 | grep -E "$F" | cut -c1-320 | sed "s/^/[v10.5] /" >> $OUT; done
echo "BATERIA-RESTO-FIN $(date)" >> $OUT
vivo suite; zsh game/tools/v8/r11/run-r11.sh $U ../V10/IT8/evidencias/bateria/suite_r11.txt
echo "TODO-FIN $(date)" >> $OUT
