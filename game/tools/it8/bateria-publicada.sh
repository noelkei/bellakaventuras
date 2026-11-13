#!/bin/zsh
# IT8 · paso 2: batería completa + suite R11 contra la build PUBLICADA (game/dist-v10 = index-aSky7GjC) servida en 5247.
# Copia de V10/IT7/tools/final105-portada.sh con otras salidas. Necesita 5233 (base V7) y 5240 (base V9) encendidos.
cd /Users/TU_USUARIO/Desktop/Bellakaventuras
U=http://127.0.0.1:5247/
D=V10/IT8/evidencias/bateria
mkdir -p $D
echo "LANZADA $(date)" > $D/estado.txt
BKALIAS=$U BKPORT=5247 TASK=IT8-bateria OUT=$D/bateria.txt REGARGS="--exclude exterior,nvda,centro" zsh game/tools/v8/r11/battery-r11.sh
echo "BATERIA-FIN $(date)" >> $D/estado.txt
zsh game/tools/v8/r11/run-r11.sh $U ../V10/IT8/evidencias/bateria/suite_r11.txt
echo "TODO-FIN $(date)" >> $D/bateria.txt
echo "TODO-FIN $(date)" >> $D/estado.txt
