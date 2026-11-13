#!/bin/bash
# Pruebas de autocuración (24 oct 2026). Se ejecuta desde el Mac; CAMBIA el estado del servidor a propósito
# (mata y para Caddy, bloquea una IP de documentación, llena el disco dejando > 20 GB libres) y comprueba que se cura solo.
#   herramientas/pruebas/autocuracion.sh                → T1–T5
#   herramientas/pruebas/autocuracion.sh --reiniciar    → además T6: reinicia el VPS y mide cuánto tarda en volver
# Imprime OK/FALLA por prueba y un total. Guardar la salida en informes/autocuracion-<fecha>.txt.
# Solo usar con la web aún con contraseña o en un momento tranquilo: T2 y T3 dejan la web caída 1–3 min.
DOM=bellakaventuras.com
ok=0; mal=0
res() { if [ "$1" = 0 ]; then echo "OK    $2"; ok=$((ok+1)); else echo "FALLA $2"; mal=$((mal+1)); fi; }
ssh -o BatchMode=yes -o ConnectTimeout=10 bellaka true || { echo "FALLA sin acceso SSH: no se prueba nada"; exit 1; }

# T1–T5 dentro del servidor. Cada línea «R <0|1> <texto>» es un resultado.
while read -r tag cod texto; do
  [ "$tag" = R ] && res "$cod" "$texto" || echo "      $tag $cod $texto"
done < <(ssh -o BatchMode=yes bellaka 'bash -s' <<'REMOTO'
DOM=bellakaventuras.com
salud() { [ "$(curl -s -m 3 --resolve $DOM:443:127.0.0.1 https://$DOM/salud)" = ok ]; }
esperar() {  # esperar <máx s> → imprime los segundos hasta que /salud vuelve (o 9999)
  local t0=$(date +%s.%N) fin=$(( $(date +%s) + $1 ))
  while [ $(date +%s) -lt $fin ]; do salud && { awk -v a="$(date +%s.%N)" -v b="$t0" 'BEGIN{printf "%.1f", a-b}'; return; }; sleep 0.5; done
  echo 9999
}
r() { echo "R $1 $2"; }
lt() { awk -v a="$1" -v b="$2" 'BEGIN{exit !(a<=b)}'; }

salud; r $? "T0 la web responde antes de empezar"

# T1. Caddy muere de golpe (kill -9): systemd (Restart=always, 2 s) debe levantarlo.
pid=$(systemctl show caddy -p MainPID --value); kill -9 "$pid"; sleep 0.3
s=$(esperar 30); lt "$s" 10; r $? "T1 kill -9 a Caddy → vuelve solo en ${s} s (≤ 10 s)"

# T2. Caddy parado (systemd no lo relanza al pararlo a mano): lo debe levantar el vigilante (2 fallos seguidos).
systemctl stop caddy; t2=$(date '+%Y-%m-%d %H:%M:%S')
s=$(esperar 240); lt "$s" 75; r $? "T2 Caddy parado → el vigilante lo levanta en ${s} s (≤ 75 s: al primer fallo si está parado)"
journalctl -t bk-vigilante --since "$t2" --no-pager -o cat | grep -q "Caddy reiniciado"; r $? "T2b el vigilante lo dejó escrito (y avisó)"

# T3. Caddy colgado (vivo pero sin responder: SIGSTOP): el vigilante debe reiniciarlo.
pid=$(systemctl show caddy -p MainPID --value); kill -STOP "$pid"
s=$(esperar 260); lt "$s" 200; r $? "T3 Caddy colgado → reiniciado en ${s} s (≤ 200 s)"
kill -CONT "$pid" 2>/dev/null

# T4. Guardián, con un registro falso: 21.000 peticiones de una IP de documentación (192.0.2.77) → bloqueada;
#     las mismas desde la IP de casa (permitida) → no; 100 visitas normales (~14.000 peticiones, 4,2 GB) desde otra → no.
tmp=$(mktemp -d); now=$(date +%s)
python3 - "$tmp/acceso.log" "$now" <<'PY'
import json, sys
f, now = open(sys.argv[1], "w"), float(sys.argv[2])
def linea(ip, i, size): f.write(json.dumps({"ts": now - 300 + i * 0.03, "size": size, "request": {"remote_ip": ip, "client_ip": ip}}) + "\n")
for i in range(21000): linea("192.0.2.77", i * 0.4, 1000); linea("198.51.100.20", i * 0.4, 1000)
for i in range(14000): linea("198.51.100.9", i * 0.6, 300_000)
for i in range(160): linea("203.0.113.5", i, 40_000_000)
PY
BK_LOG=$tmp/acceso.log BK_EST=$tmp/est /usr/local/bin/bk-guardian
set=$(nft list set inet bk bloqueados)
echo "$set" | grep -q "192.0.2.77"; r $? "T4 el guardián bloquea la IP abusiva (192.0.2.77)"
! echo "$set" | grep -q "198.51.100.20"; r $? "T4b nunca bloquea la IP de casa"
echo "$set" | grep -q "203.0.113.5"; r $? "T4e el guardián bloquea la IP que baja 6,4 GB (203.0.113.5)"
! echo "$set" | grep -q "198.51.100.9"; r $? "T4c no bloquea 100 visitas normales desde una IP (colegio, CGNAT)"
nft delete element inet bk bloqueados { 192.0.2.77 } 2>/dev/null; nft delete element inet bk bloqueados { 203.0.113.5 } 2>/dev/null
! nft list set inet bk bloqueados | grep -q "192.0.2.77"; r $? "T4d el bloqueo se quita con la orden del aviso"
rm -rf "$tmp"

# T5. Disco: relleno de 15 GB (quedan > 20 GB libres). La web sigue y el vigilante limpia y avisa (umbral bajado solo aquí).
libre_g=$(df -BG --output=avail / | tail -1 | tr -dc 0-9)
if [ "$libre_g" -gt 40 ]; then
  fallocate -l 15G /var/tmp/bk-relleno; t5=$(date '+%Y-%m-%d %H:%M:%S')
  libre2=$(df -BG --output=avail / | tail -1 | tr -dc 0-9); uso=$(df --output=pcent / | tail -1 | tr -dc 0-9)
  [ "$libre2" -gt 20 ]; r $? "T5 relleno de 15 GB dejando ${libre2} GB libres (> 20)"
  salud; r $? "T5b la web sigue respondiendo con el disco más lleno"
  rm -f /var/lib/bk-vigilante/aviso-disco
  UMBRAL_DISCO=$((uso - 1)) /usr/local/bin/bk-vigilante
  journalctl -t bk-vigilante --since "$t5" --no-pager -o cat | grep -q "Disco al"; r $? "T5c el vigilante detecta el disco lleno, limpia y avisa"
  rm -f /var/tmp/bk-relleno
  [ ! -e /var/tmp/bk-relleno ]; r $? "T5d relleno borrado"
else
  r 1 "T5 sin espacio para la prueba (${libre_g} GB libres): no se hace"
fi

salud; r $? "T9 la web responde al terminar"
[ "$(systemctl is-active caddy bk-vigilante.timer bk-guardian.timer bk-nft.service | sort -u)" = active ]; r $? "T9b Caddy, vigilante, guardián y tabla activos"
REMOTO
)

# T6. Reinicio del VPS (solo con --reiniciar): todo debe volver solo.
if [ "${1:-}" = --reiniciar ]; then
  ssh -o BatchMode=yes bellaka 'systemctl reboot' 2>/dev/null; t0=$(date +%s); sleep 5
  fin=$((t0 + 420)); s=9999
  while [ $(date +%s) -lt $fin ]; do
    [ "$(curl -s -m 3 https://$DOM/salud)" = ok ] && { s=$(( $(date +%s) - t0 )); break; }; sleep 2
  done
  [ $s -le 180 ]; res $? "T6 reinicio del VPS → la web vuelve en ${s} s (≤ 180 s)"
  sleep 130   # que pasen los primeros minutos de los temporizadores (OnBootSec 1–2 min)
  E=$(ssh -o BatchMode=yes -o ConnectTimeout=15 bellaka '
    systemctl is-active caddy bk-vigilante.timer bk-guardian.timer bk-nft.service | sort -u
    nft list table inet bk >/dev/null && echo tabla
    systemctl show bk-vigilante.service -p ExecMainStatus --value
    caddy build-info | awk "/^go/{print \$2}"' 2>/dev/null)
  [ -n "$E" ]; res $? "T6b SSH entra tras el reinicio"
  [ "$(echo "$E" | sed -n 1p)" = active ]; res $? "T6c Caddy, vigilante, guardián y tabla activos tras el reinicio"
  echo "$E" | grep -qx tabla; res $? "T6d tabla nftables cargada"
  [ "$(echo "$E" | sed -n 3p)" = 0 ]; res $? "T6e el vigilante ya ha pasado sin errores"
  [ "$(echo "$E" | sed -n 4p)" = go1.26.10 ]; res $? "T6f sigue el Caddy parcheado ($(echo "$E" | sed -n 4p))"
fi
echo; echo "Total: $ok OK, $mal FALLA"
