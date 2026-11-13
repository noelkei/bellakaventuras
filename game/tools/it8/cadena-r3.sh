#!/bin/zsh
# IT8 · cruce con la r3 (23 oct; petición del usuario: «pasa todas las pruebas para tenerlo auditado de cabo a rabo» sobre lo PUBLICADO, que es
# la r3 de V10.5: index-BNwJHzyr, servida en 5244 desde game/dist-v10-prev, construida desde V10/IT7/wip-portada/game = arreglos-tras-it8/nuevo).
# Solo mide: no compila, no integra, no publica. Desatendida; cada paso escribe EN CURSO/HECHO en el registro. No analiza nada.
#  1 · guardianes de la r3 contra r3 (5244) y contra r2 (5247) para ver que distinguen: saltar-tutorial-camara (D5-26), musica-zona-bache
#      (D5-27), it8/r3-riesgos (revelación, cinemática, entrada de ANMI con CPU lenta)
#  2 · batería completa + sección IT8 contra la r3 (incluye la campaña con teclado)            ~4,5–5 h
#  3 · suite R11 contra la r3                                                                   ~15 min
#  4 · partida completa con el dedo (iPhone h) y con el mando (tele) contra la r3              ~1 h
#  5 · memoria larga (G2) contra la r3 (la r3 precarga la canción de al lado)                  ~20 min
#  6 · repite en solitario cada prueba de la batería que dio ERROR/TIMEOUT/INVALIDO (entorno)
cd /Users/TU_USUARIO/Desktop/Bellakaventuras
REG=V10/IT8/REGISTRO_IT8.md; EV=V10/IT8/evidencias/r3; mkdir -p $EV; U=http://127.0.0.1:5244/; U2=http://127.0.0.1:5247/
F='^(FALLO|ERROR|INVÁL)|: (VERDE|FALLOS|ERROR|VACIO|TIMEOUT|INVALIDO)'
apunta() { echo "- $1 $(date +%H:%M) · $2" >> $REG; }
vivo() { for p in 5244 5247 5240 5233; do curl -s -m 3 http://127.0.0.1:$p/ > /dev/null || apunta AVISO "SERVIDOR-CAIDO $p antes de $1 (repetir lo que dependa de él)"; done; }
huella() { curl -s -m 3 $U | grep -o 'index-[A-Za-z0-9_-]*\.js'; }
[[ "$(huella)" == "index-BNwJHzyr.js" ]] || { apunta AVISO "cadena-r3: 5244 no sirve index-BNwJHzyr ($(huella)) → PARADA"; exit 1; }
apunta "EN CURSO" "cadena-r3.sh (desatendida): guardianes r3 → batería+IT8 → suite R11 → partidas dedo/mando → memoria → repetir entorno (log $EV/)"

# 1 · guardianes
G=$EV/guardianes.txt; : > $G; vivo guardianes; apunta "EN CURSO" "guardianes de la r3 (r3 y r2) → $G"
for url lab in $U r3 $U2 r2; do
  echo "== $lab $(curl -s $url | grep -o 'index-[A-Za-z0-9_-]*\.js')" >> $G
  node game/tools/v10_5/saltar-tutorial-camara.mjs --url $url --task IT8-r3 --label $lab 2>&1 | grep -E "$F" | cut -c1-320 >> $G
  node game/tools/v10_5/musica-zona-bache.mjs --url $url --task IT8-r3 --label $lab 2>&1 | grep -E "$F" | cut -c1-320 >> $G
  node game/tools/it8/r3-riesgos.mjs --url $url --task IT8-r3 --label $lab 2>&1 | grep -E "$F" | cut -c1-320 >> $G
done
apunta HECHO "guardianes r3 · verdes $(grep -c ': VERDE' $G) · fallos $(grep -c ': FALLOS' $G) · error $(grep -cE ': (ERROR|TIMEOUT|INVALIDO)' $G) (ANALIZAR: en r2 se esperan rojas saltar-tutorial-camara y musica-zona-bache)"

# 2 · batería completa + IT8
B=$EV/bateria_r3.txt; vivo bateria; apunta "EN CURSO" "batería completa + IT8 contra la r3 (5244) → $B (~4,5–5 h)"
BKALIAS=$U BKPORT=5244 TASK=IT8-r3 OUT=$B REGARGS="--exclude exterior,nvda,centro --v103" zsh game/tools/v8/r11/battery-r11.sh
apunta HECHO "batería r3 · verdes $(grep -c ': VERDE' $B) · fallos $(grep -c ': FALLOS' $B) · error/timeout/inválido $(grep -cE ': (ERROR|TIMEOUT|INVALIDO|VACIO)' $B) · ¿IT8-FIN? $(grep -c 'IT8-FIN' $B) (ANALIZAR)"

# 3 · suite R11
S=$EV/suite_r11_r3.txt; vivo suite; apunta "EN CURSO" "suite R11 contra la r3 → $S"
zsh game/tools/it8/suite-r11.sh $U ../$S
apunta HECHO "suite R11 r3 · verdes $(grep -c ': VERDE' $S) · fallos $(grep -c ': FALLOS' $S)"

# 4 · partidas completas con el dedo y con el mando
P=$EV/partidas.txt; : > $P; vivo partidas; apunta "EN CURSO" "partida completa con el dedo (ip14 h) y con el mando contra la r3 → $P"
(cd game && node tools/it8/partida-entradas.mjs --url "${U}?bktest=1&" --modo tactil --o h 2>&1 | grep -E "$F|sinEquivalente" | cut -c1-320 | sed "s/^/[dedo] /") >> $P
(cd game && node tools/it8/partida-entradas.mjs --url "${U}?bktest=1&" --modo mando 2>&1 | grep -E "$F|sinEquivalente" | cut -c1-320 | sed "s/^/[mando] /") >> $P
apunta HECHO "partidas r3 · verdes $(grep -c ': VERDE' $P) · fallos $(grep -c ': FALLOS' $P) · error $(grep -cE ': (ERROR|TIMEOUT|INVALIDO)' $P) (ANALIZAR)"

# 5 · memoria larga
M=$EV/memoria_r3.log; vivo memoria; apunta "EN CURSO" "memoria larga (G2, 12 min) contra la r3 → $M"
node game/tools/it8/memoria-larga.mjs --url $U --min 12 --task IT8-r3 > $M 2>&1
apunta HECHO "memoria r3 · $(grep -E ': (VERDE|FALLOS|ERROR|TIMEOUT|INVALIDO)' $M | tail -1 | cut -c1-200)"

# 6 · repetir en solitario lo que dio error de entorno en la batería (una vez)
X=$EV/repetidas_r3.txt; : > $X; vivo repetir; apunta "EN CURSO" "repetir en solitario los ERROR/TIMEOUT/INVALIDO de la batería r3 → $X"
grep -E ': (ERROR|TIMEOUT|INVALIDO|VACIO) \(exit' $B | sed -E 's/^(\[[^]]*\] )?([A-Za-z0-9._-]+): .*/\1|\2/' | sort -u | while IFS='|' read pre name; do
  pre=${pre% }; dir=''; extra=(); file=$name
  case "$pre" in
    '') dir=v8;; '[v5]') dir=v8/v5suite;; '[v10]') dir=v10;; '[v10.1]') dir=v10_1;; '[v10.2]') dir=v10_2;; '[v10.3]') dir=v10_3;; '[v10.4]') dir=v10_4;; '[v10.5]') dir=v10_5;;
    '[it8]') dir=it8; file=${name#it8-}
      case $file in menus-mando) file=menus; extra=(--via mando);; menus-teclado) file=menus; extra=(--via teclado);; mecanicas) file=mecanicas-entradas;; ajustes) file=ajustes-efecto;;
        bordes) extra=(--n 250);; carga-red) extra=(--casos 404,cache);; esac;;
    *) echo "SIN-REPETIR $pre $name (repetir a mano)" >> $X; continue;;
  esac
  [[ $name == regression-v8 || $name == corona-v10 ]] && extra=(--exclude exterior,nvda,centro --v103)
  [[ -f game/tools/$dir/$file.mjs ]] || { echo "SIN-REPETIR $pre $name (no encuentro game/tools/$dir/$file.mjs)" >> $X; continue; }
  node game/tools/$dir/$file.mjs --url $U --task IT8-r3 --label repetida ${extra[@]} 2>&1 < /dev/null | grep -E "$F" | cut -c1-320 | sed "s/^/$pre /" >> $X
done
apunta HECHO "repetidas r3 · verdes $(grep -c ': VERDE' $X) · fallos $(grep -c ': FALLOS' $X) · error $(grep -cE ': (ERROR|TIMEOUT|INVALIDO)' $X) · sin repetir $(grep -c SIN-REPETIR $X)"
apunta HECHO "cadena-r3.sh terminada (huella 5244: $(huella)) · FALTA: analizar $EV/ y cruzar con HALLAZGOS"
