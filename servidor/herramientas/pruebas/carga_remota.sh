#!/bin/bash
# Parte que corre en el servidor (/root/pruebas/carga_remota.sh); la lanza carga_local.sh desde el Mac.
# Lee de stdin la cabecera de acceso (base64) y el modo.
read -r AUTH; read -r MODO
ulimit -n 65535   # h2load abre una conexión por cliente
DOM=www.bellakaventuras.com; act=/srv/bellaka/current; L=$(mktemp)
(cd $act && find . -type f ! -name '*.br' ! -name '*.zst' ! -name '*.gz' ! -name '.*' | sed "s|^\./|https://$DOM/|") > $L
n=$(wc -l < $L)
H=(-H "authorization: Basic $AUTH" -H "accept-encoding: br, zstd, gzip" -H "x-bk-prueba: carga" -H "user-agent: BK-Prueba/carga")
uso() {  # CPU real de Caddy (delta de /proc/<pid>/stat cada segundo; 100 % = un núcleo, hay 2) y su memoria
  local pid=$(systemctl show caddy -p MainPID --value) tck=$(getconf CLK_TCK) a b
  a=$(awk '{print $14+$15}' /proc/$pid/stat)
  while [ -e "$1" ]; do sleep 1; b=$(awk '{print $14+$15}' /proc/$pid/stat)
    echo "$(( (b - a) * 100 / tck )) $(( $(awk '/VmRSS/{print $2}' /proc/$pid/status) / 1024 ))"; a=$b
  done > "$1.uso"
}
esc() {  # esc <nombre> <visitas> <a la vez> [ritmo: -r/-R…]
  local nom=$1 vis=$2 con=$3; shift 3
  local f=$(mktemp); touch $f.vivo; uso $f.vivo & local up=$!
  # -i: lista de URL; -n total; -c clientes (cada uno una conexión, como un navegador con HTTP/2); -m 6 flujos a la vez
  h2load -i $L -n $((vis * n)) -c $con -m 6 -w 23 -W 24 "${H[@]}" "$@" > $f 2>&1
  rm -f $f.vivo; wait $up
  local fin=$(grep -oE 'finished in [0-9.]+[a-z]+' $f | awk '{print $3}')
  local ok=$(grep -oE '[0-9]+ succeeded' $f | awk '{print $1}')
  local fal=$(grep -oE '[0-9]+ failed' $f | head -1 | awk '{print $1}')
  local mb=$(grep -oE 'traffic: [0-9.]+[KMG]?B' $f | awk '{print $2}')
  local st=$(grep -E '^status codes' $f | sed 's/status codes: //')
  local lat=$(grep -E '^time for request' $f | awk '{print "media " $6 ", máx " $5}')
  local cpu=$(sort -n $f.vivo.uso | tail -1 | awk '{print $1}'); local mem=$(sort -k2 -n $f.vivo.uso | tail -1 | awk '{print $2}')
  echo "$nom: $vis visitas ($con a la vez) → $fin, $ok bien / $fal mal, $mb; [$st]; petición: $lat; CPU Caddy máx ${cpu} % (2 núcleos = 200 %; h2load comparte la CPU), memoria máx ${mem} MB"
  grep -qE " 0 failed" $f && echo "R 0 $nom sin fallos" || echo "R 1 $nom con fallos"
  rm -f $f $f.vivo.uso
}
echo "Lista: $n archivos por visita"
libre0=$(awk '/MemAvailable/{print int($2/1024)}' /proc/meminfo)
esc "A · 10 visitas en el mismo segundo" 10 10
esc "B · 100 visitas en un minuto (ritmo real: 1 nueva cada 0,6 s)" 100 100 -r 1 --rate-period=600ms
esc "C · 100 visitas a la vez (lo peor de B)" 100 100
[ "$MODO" = techo ] && esc "D · techo: 300 visitas a la vez" 300 300
[ "$MODO" = techo ] && esc "E · sobrecarga: 500 visitas a la vez (se espera algún fallo)" 500 500
echo "Memoria disponible antes: ${libre0} MB; después: $(awk '/MemAvailable/{print int($2/1024)}' /proc/meminfo) MB"
[ "$(curl -s -m 3 --resolve $DOM:443:127.0.0.1 https://$DOM/salud)" = ok ]; echo "R $? la web responde al terminar"
rm -f $L
