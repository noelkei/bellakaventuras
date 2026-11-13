#!/bin/zsh
# IT8 · paso 2: repeticiones en solitario y comprobación de las pruebas adaptadas (preparación) contra lo publicado (5247) y la base sin portada (5244).
cd /Users/TU_USUARIO/Desktop/Bellakaventuras
OUT=V10/IT8/evidencias/bateria/paso2_repetir.txt; : > $OUT
F='^(FALLO|ERROR|INVÁL)|: (VERDE|FALLOS|ERROR|VACIO|TIMEOUT|INVALIDO)'
P=http://127.0.0.1:5247/; B=http://127.0.0.1:5244/
r() { local lab=$1; shift; echo "== $lab" >> $OUT; "$@" 2>&1 | grep -E "$F" | cut -c1-320 >> $OUT; }
r "ux-mouse publicada (3.ª, sola)" node game/tools/v8/ux-mouse.mjs --url $P --task IT8-paso2 --label publicada
r "ux-mouse base sin portada" node game/tools/v8/ux-mouse.mjs --url $B --task IT8-paso2 --label base-sin-portada
r "d2-movil publicada (sola)" node game/tools/v10_5/d2-movil.mjs --url $P --task IT8-paso2 --label publicada
r "regression-v8 --v103" node game/tools/v8/regression-v8.mjs --url $P --task IT8-paso2 --label v103 --exclude exterior,nvda,centro --v103
r "corona-v10 --v103" node game/tools/v10/corona-v10.mjs --url $P --task IT8-paso2 --label v103 --exclude exterior,nvda,centro --v103
r "ext-rutas adaptada" node game/tools/v10/ext-rutas.mjs --url $P --task IT8-paso2 --label adaptada
r "ext-circulacion adaptada" node game/tools/v10/ext-circulacion.mjs --url $P --task IT8-paso2 --label adaptada
r "piloto adaptada" node game/tools/v10_1/piloto.mjs --url $P --task IT8-paso2 --label adaptada
echo "FIN $(date)" >> $OUT
