#!/bin/bash
# Conexiones lentas a propósito DENTRO del VPS (slowhttptest contra el propio Caddy; nada sale a Internet).
# Mientras dura cada ataque, un «visitante normal» pide /salud cada segundo: debe responder siempre.
#   herramientas/pruebas/lentas_local.sh   → OK/FALLA por prueba (R5 punto 4)
ssh -o BatchMode=yes bellaka 'bash -s' <<'REMOTO'
command -v slowhttptest >/dev/null || DEBIAN_FRONTEND=noninteractive apt-get install -y -qq slowhttptest >/dev/null 2>&1
ulimit -n 65535; U=https://www.bellakaventuras.com/
normal() {  # cuenta respuestas correctas de /salud, una por segundo, mientras exista $1
  local ok=0 mal=0 peor=0 t
  while [ -e "$1" ]; do
    t=$(curl -s -o /dev/null -m 5 -w "%{http_code} %{time_total}" https://bellakaventuras.com/salud)
    [ "${t%% *}" = 200 ] && ok=$((ok+1)) || mal=$((mal+1))
    peor=$(awk -v a="$peor" -v b="${t##* }" 'BEGIN{print (b>a)?b:a}'); sleep 1
  done; echo "$ok $mal $peor"
}
prueba() {  # prueba <nombre> <opciones de slowhttptest>
  local nom=$1; shift; local f=$(mktemp); touch $f.vivo
  normal $f.vivo > $f.normal & local np=$!
  timeout 100 slowhttptest "$@" -l 60 -o $f.sal >/dev/null 2>&1
  rm -f $f.vivo; wait $np; read ok mal peor < $f.normal
  local fin=$(grep -oE "Exit status: .*|closed: [0-9]+|pending: [0-9]+|connected: [0-9]+" $f.sal.csv 2>/dev/null | tail -1)
  echo "      $nom: visitante normal $ok bien / $mal mal, peor ${peor} s"
  [ "$mal" = 0 ] && awk -v p="$peor" 'BEGIN{exit !(p<2)}'; echo "R $? $nom: la web sigue respondiendo (0 fallos, < 2 s)"
  rm -f $f $f.normal $f.sal*
}
prueba "Slowloris (cabeceras lentas, 1.000 conexiones)" -c 1000 -H -i 10 -r 200 -t GET -u $U -x 24 -p 3
prueba "Lectura lenta (1.000 conexiones leyendo a 32 B cada 5 s)" -c 1000 -X -r 200 -w 512 -y 1024 -n 5 -z 32 -k 3 -u ${U}build/ -p 3
prueba "Cuerpo lento (POST, 1.000 conexiones)" -c 1000 -B -i 10 -r 200 -s 8192 -t POST -u $U -x 10 -p 3
sleep 20; echo "      conexiones abiertas a Caddy tras 20 s: $(ss -Htn state established "( sport = :443 )" | wc -l)"
[ "$(curl -s -m 3 https://bellakaventuras.com/salud)" = ok ]; echo "R $? la web responde al terminar"
REMOTO
