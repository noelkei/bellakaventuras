#!/bin/zsh
# Batería de cierre V8 contra dist-v8 identificada (bk-v8-dist, 5232; base V7 final R8 en 5233 para comparativas).
# R11: copia parametrizable (BKALIAS=r11 BKPORT=5235 TASK=R11 OUT=...) para pasarla contra dist-r11 sin tocar 5232.
# Contrato vigente: Auditoría 8/plan-v8/10_CONTRATO_PRUEBAS_V8.md. Resumen en V8/evidencias/$TASK/bateria_v8.txt (una línea por prueba).
cd /Users/TU_USUARIO/Desktop/Bellakaventuras
TASK=${TASK:-YY8-12}; OUT=${OUT:-V8/evidencias/$TASK/bateria_v8.txt}; mkdir -p V8/evidencias/$TASK; : > $OUT
echo "INICIO $(date) · servida: $(curl -s http://127.0.0.1:${BKPORT:-5232}/ | grep -o 'build/[a-z]*-[A-Za-z0-9_-]*\.js' | head -2 | tr '\n' ' ') · base: $(curl -s http://127.0.0.1:5233/ | grep -o 'build/[a-z]*-[A-Za-z0-9_-]*\.js' | head -1)" >> $OUT
F='^(FALLO|ERROR|INVÁL)|: (VERDE|FALLOS|ERROR|VACIO|TIMEOUT|INVALIDO)'   # V10 R0: INVALIDO = entorno (contexto WebGL perdido)
run8() { local t=$1; shift; node game/tools/v8/$t.mjs --url ${BKALIAS:-v8} --task $TASK --label final "$@" 2>&1 | grep -E "$F" | cut -c1-320 >> $OUT; }
run5() { local t=$1; shift; node game/tools/v8/v5suite/$t.mjs --url ${BKALIAS:-v8} --task $TASK --label final "$@" 2>&1 | grep -E "$F" | cut -c1-320 | sed "s/^/[v5] /" >> $OUT; }
echo "## YINYANG (V8)" >> $OUT
# V10: regression-v8 excluye por diseño las zonas que V10 sustituye (REGARGS, p. ej. "--exclude exterior,nvda,centro")
for t in ${=YYLIST:-yy-contract yy-routes yy-walls yy-wallride yy-wallfuzz yy-talk yy-graffiti yy-persist yy-cams yy-shots regression-v8 perf-v8}; do if [[ $t == regression-v8 ]]; then run8 $t ${=REGARGS}; else run8 $t; fi; done
echo "## TRA TRA TRA (pruebas V7, copia V8)" >> $OUT
run8 tt-routes --order aj; run8 tt-routes --order ja
for t in ${=TTLIST:-tt-matrix tt-talks tt-cams tt-shots tt-graffiti-shots ux-r5 ux-mouse}; do run8 $t; done
echo "## FASHION GIRL y NMG (pruebas V6, copia V8)" >> $OUT
for t in ${=V6LIST:-fg-routes fg-ladder fg-dance fg-cams fg-cartel nmg-graffiti-shots fg-shots}; do run8 $t; done
echo "## Suite heredada de V5 (copia V8)" >> $OUT
for t in ${=V5LIST:-heading-contract hop-ratio speed-matrix pause-input geo-coherence nmg-supports quarter-palm u-pit car-matrix step-matrix collision-inventory board-curves touch-tasks orient-emu feet-v5 anmi-pie npc-arms cam-orbit cam-cases ux-layouts actividades-ux persist-matrix fry-access free-dance bench-sit pantera-npc lettering-read vehicles-v5}; do run5 $t; done
echo "## V4 y campaña" >> $OUT
U="http://127.0.0.1:${BKPORT:-5232}/?bktest=1&"
# IT8 paso 2 (cambio de diseño aprobado V10.4: partida nueva = tutorial en la plaza blanca; copia previa en V10/backups/pruebas/IT8-paso2/):
# esc-routes coloca a ANMI con teleportes y necesita la narrativa apagada, como impact-seq (con ella, el tutorial la retenía: D1/D2 rojos desde V10.4)
(cd game && node tools/v8/esc-routes-v7.mjs --url "${U}narr=off&" 2>&1 | grep -E "$F" | cut -c1-320 | sed "s/^/[v4→v8] /") >> $OUT
# V10 R6: final-v4 y land-support (superrampa y mesa del triple) se sustituyen por sn-final/sn-reto (sección V10)
for t in ${=V4LIST:-impact-seq}; do (cd game && node tools/v4/$t.mjs --url "${U}narr=off&" 2>&1 | grep -E "$F" | cut -c1-320 | sed "s/^/[v4] /") >> $OUT; done
(cd game && node tools/v8/campaign-v8.mjs --url "$U" 2>&1 | grep -E "$F" | cut -c1-320 | sed "s/^/[v8-campaña] /") >> $OUT
# V10: pruebas nuevas (exterior, NVDA, SECRETNOVIO, giro y migración). final-v5/final-touch (V5) se sustituyen por sn-reto/sn-touch
echo "## V10 (pruebas nuevas)" >> $OUT
run10() { local t=$1; shift; node game/tools/v10/$t.mjs --url ${BKALIAS:-v10} --task $TASK --label final "$@" 2>&1 | grep -E "$F" | cut -c1-320 | sed "s/^/[v10] /" >> $OUT; }
run10 corona-v10 ${=REGARGS}
for t in ${=V10LIST:-migra-v10 no-bk-read ext-geo ext-rutas ext-quarter-detras ext-circulacion ext-cierre ext-entrada ext-grind ext-atrapada vert-camara nv-geo nv-grind nv-rutas nv-controles nv-dialogos sn-nombre sn-geo sn-reto sn-final sn-touch sn-mando sn-centro}; do run10 $t; done
# V10.1: pruebas nuevas (guardianes de lo aprobado y de cada punto de V10/IT4)
echo "## V10.1 (pruebas nuevas)" >> $OUT
run101() { local t=$1; shift; node game/tools/v10_1/$t.mjs --url ${BKALIAS:-v10} --task $TASK --label final "$@" 2>&1 | grep -E "$F" | cut -c1-320 | sed "s/^/[v10.1] /" >> $OUT; }
for t in ${=V101LIST:-caras no-perder animacion-limpia escaleras actividades-matriz interfaz premio-cam personajes correr skills mundo-r4 espalda piloto escena-final}; do run101 $t; done
echo "## V10.2 (pruebas nuevas)" >> $OUT
run102() { local t=$1; shift; node game/tools/v10_2/$t.mjs --url ${BKALIAS:-v10} --task $TASK --label final "$@" 2>&1 | grep -E "$F" | cut -c1-320 | sed "s/^/[v10.2] /" >> $OUT; }
for t in ${=V102LIST:-grafitis-pared teclas-visibles repetir grafitis-reinicio editor-botones charlas sn-cinco grafitear marcas}; do run102 $t; done
echo "FIN $(date)" >> $OUT
# V10.5 (cierre): los guardianes de V10.3, V10.4 y V10.5 (nunca se habían añadido a la batería)
run103() { local t=$1; shift; node game/tools/v10_3/$t.mjs --url ${BKALIAS:-v10} --task $TASK --label final "$@" 2>&1 | grep -E "$F" | cut -c1-320 | sed "s/^/[v10.3] /" >> $OUT; }
for t in ${=V103LIST:-valla-centro plantas-sitio}; do run103 $t; done
run104() { local t=$1; shift; node game/tools/v10_4/$t.mjs --url ${BKALIAS:-v10} --task $TASK --label final "$@" 2>&1 | grep -E "$F" | cut -c1-320 | sed "s/^/[v10.4] /" >> $OUT; }
for t in ${=V104LIST:-dialogo-2d tutorial bloqueo-3 recorrido modo-ayuda iphone-2d premio-camara logo-cielo musica-dialogo zurdo baile-suelo radio-limpia}; do run104 $t; done
run105() { local t=$1; shift; node game/tools/v10_5/$t.mjs --url ${BKALIAS:-v10} --task $TASK --label final "$@" 2>&1 | grep -E "$F" | cut -c1-320 | sed "s/^/[v10.5] /" >> $OUT; }
for t in ${=V105LIST:-toque-fantasma saltar-tactil anim-dialogo d2-movil controles-tactil hud-tactil recarga-narrativa migracion-v105 modo-eficiente cine-vertical patatas-tactil portada-contrato portada-carga portada-ciclo portada-audio portada-formatos portada-movimiento portada-mando}; do run105 $t; done
# IT8 (paso 4; copia previa en V10/backups/pruebas/IT8-paso4/): guardianes nuevos de la auditoría final (V10/IT8/PLAN_DE_PRUEBAS.md). Algunos salen
# ROJOS a propósito hasta que se arregle su hallazgo (grafiti-mando H8-01/09, recarga-todo H8-02/03, narrativa-cortes H8-10/11/12, entradas-cortes
# H8-13…17): ver V10/IT8/HALLAZGOS.md. bordes --n 250 y carga-red sin la red lenta para no alargar la batería.
echo "## IT8 (pruebas nuevas)" >> $OUT
run8n() { local t=$1; shift; node game/tools/it8/$t.mjs --url ${BKALIAS:-v10} --task $TASK --label final "$@" 2>&1 | grep -E "$F" | cut -c1-320 | sed "s/^/[it8] /" >> $OUT; }
for t in ${=IT8LIST:-estatico sin-almacen pestanas guardado-raro recarga-todo interrupciones menus ajustes-efecto audio-sistema volver-plaza mecanicas-entradas orden-libre narrativa-cortes entradas-cortes grafiti-mando}; do
  if [[ $t == menus ]]; then run8n menus --via mando; run8n menus --via teclado; else run8n $t; fi; done
run8n bordes --n 250; run8n carga-red --casos 404,cache
echo "IT8-FIN $(date)" >> $OUT
# V10.6 (V10/IT9/PLAN_V10_6.md; copia previa en V10/backups/pruebas/V10_6-R1/): guardianes nuevos de la V10.6
echo "## V10.6 (pruebas nuevas)" >> $OUT
run106() { local t=$1; shift; node game/tools/v10_6/$t.mjs --url ${BKALIAS:-v10} --task $TASK --label final "$@" 2>&1 | grep -E "$F" | cut -c1-320 | sed "s/^/[v10.6] /" >> $OUT; }
for t in ${=V106LIST:-capas girar-pausa pausa-2d plaza-narrativa saltar-pregunta avisos compartir creditos cascos}; do run106 $t; done
echo "V106-FIN $(date)" >> $OUT
