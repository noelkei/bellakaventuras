#!/bin/bash
# Capa del servidor para Bunny (CDN), oct 2026. NO cambia cómo se sirve la web: solo hace que el servidor reconozca a Bunny.
#   bunny/servidor_cdn.sh --seco      → comprueba qué haría (valida el Caddyfile con la capa) sin tocar nada
#   bunny/servidor_cdn.sh --aplicar   → copia previa; Caddyfile con «import /etc/caddy/cdn-*.caddy»; guardián que nunca bloquea a
#                                       Bunny; /etc/bk/cdn-ips.txt y /etc/caddy/cdn-bunny.caddy (trusted_proxies → IP real del jugador
#                                       en el registro: métricas y guardián siguen viendo personas, no a Bunny); bk-cdn-ips.timer que
#                                       renueva la lista de IP cada día (si la descarga falla o viene corta, deja la anterior)
#   bunny/servidor_cdn.sh --deshacer  → quita la capa (borra los dos archivos y el timer, recarga). El Caddyfile y el guardián nuevos
#                                       se quedan: sin esos archivos se comportan exactamente como antes
# Validación SIEMPRE antes de recargar Caddy; si no valida, no se recarga (y el vigilante repone el último Caddyfile bueno).
set -euo pipefail
D="$(cd "$(dirname "$0")/../.." && pwd)"; S="$D/herramientas/servidor"; MODO="${1:---seco}"
ssh -o BatchMode=yes -o ConnectTimeout=10 bellaka true || { echo "Sin acceso SSH: no se toca nada" >&2; exit 1; }
REMOTO_IPS='set -e
L=$(mktemp); trap "rm -f $L $L.6" EXIT
curl -fsS -m 30 https://api.bunny.net/system/edgeserverlist/plain | tr -d "\r" > $L; echo >> $L
curl -fsS -m 30 https://bunnycdn.com/api/system/edgeserverlist/IPv6 | python3 -c "import json,sys;[print(x) for x in json.load(sys.stdin)]" > $L.6 || true
cat $L.6 >> $L
n=$(grep -cE "^[0-9a-f:.]+$" $L); [ "$n" -ge 100 ] || { echo "lista de Bunny corta ($n): se deja la anterior" >&2; exit 0; }
grep -E "^[0-9a-f:.]+$" $L | sort -u > /etc/bk/cdn-ips.txt.nuevo
{ echo "# Lo escribe bk-cdn-ips (IP de Bunny): el registro guarda la IP real del jugador"; printf "trusted_proxies static";
  while read -r ip; do case $ip in *:*) printf " %s/128" "$ip";; *) printf " %s/32" "$ip";; esac; done < /etc/bk/cdn-ips.txt.nuevo; echo; } > /etc/caddy/cdn-bunny.caddy.nuevo
if cmp -s /etc/caddy/cdn-bunny.caddy.nuevo /etc/caddy/cdn-bunny.caddy 2>/dev/null; then rm -f /etc/caddy/cdn-bunny.caddy.nuevo /etc/bk/cdn-ips.txt.nuevo; echo "IP de Bunny sin cambios"; exit 0; fi
[ -f /etc/caddy/cdn-bunny.caddy ] && cp /etc/caddy/cdn-bunny.caddy /etc/caddy/cdn-bunny.caddy.anterior
mv /etc/caddy/cdn-bunny.caddy.nuevo /etc/caddy/cdn-bunny.caddy; chmod 644 /etc/caddy/cdn-bunny.caddy
if sudo -u caddy caddy validate --config /etc/caddy/Caddyfile >/dev/null 2>&1; then
  mv /etc/bk/cdn-ips.txt.nuevo /etc/bk/cdn-ips.txt; systemctl reload caddy; echo "IP de Bunny: $n · Caddy recargado"
else
  if [ -f /etc/caddy/cdn-bunny.caddy.anterior ]; then mv /etc/caddy/cdn-bunny.caddy.anterior /etc/caddy/cdn-bunny.caddy; else rm -f /etc/caddy/cdn-bunny.caddy; fi
  rm -f /etc/bk/cdn-ips.txt.nuevo; logger -t bk-cdn-ips "lista nueva no valida en Caddy: se deja la anterior"; exit 3
fi'
case "$MODO" in
  --seco)
    scp -q "$S/Caddyfile" bellaka:/tmp/Caddyfile.cdn-seco
    ssh -o BatchMode=yes bellaka 'sudo -u caddy caddy validate --config /tmp/Caddyfile.cdn-seco >/dev/null 2>&1 && echo "   Caddyfile con la capa: válido" || echo "   Caddyfile con la capa: NO válido"; rm -f /tmp/Caddyfile.cdn-seco
      test -f /etc/caddy/cdn-bunny.caddy && echo "   capa CDN: PUESTA" || echo "   capa CDN: sin poner"'
    exit 0;;
  --aplicar)
    echo "== Copia del servidor"; "$D/herramientas/respaldo_servidor.sh"
    echo "== Caddyfile (con el import de la capa) y guardián (no bloquea a Bunny)"
    scp -q "$S/Caddyfile" bellaka:/root/Caddyfile.cdn; scp -q "$S/p0/bk-guardian" bellaka:/root/bk-guardian.cdn; scp -q "$D/herramientas/bunny/bk-cdn-vigia" bellaka:/root/bk-cdn-vigia; scp -q "$D/herramientas/bunny/bk-dns-www" bellaka:/root/bk-dns-www; scp -q "$D/herramientas/bunny/bk-contadores" bellaka:/root/bk-contadores; scp -q "$D/.bunny-api" bellaka:/root/.bunny-key.tmp; scp -q "$D/herramientas/bunny/zona.txt" bellaka:/root/bunny.zona.tmp
    printf '%s\n' "$REMOTO_IPS" | ssh bellaka 'cat > /usr/local/bin/bk-cdn-ips; chmod 755 /usr/local/bin/bk-cdn-ips'
    ssh -o BatchMode=yes bellaka 'set -e; F=$(date +%Y%m%d-%H%M); cp /etc/caddy/Caddyfile /root/Caddyfile.antes-cdn-$F; cp /usr/local/bin/bk-guardian /root/bk-guardian.antes-cdn-$F
      install -m 644 /root/Caddyfile.cdn /etc/caddy/Caddyfile
      if ! sudo -u caddy caddy validate --config /etc/caddy/Caddyfile >/dev/null 2>&1; then install -m 644 /root/Caddyfile.antes-cdn-$F /etc/caddy/Caddyfile; echo "   Caddyfile NO válido: se deja el anterior" >&2; exit 3; fi
      install -m 755 /root/bk-guardian.cdn /usr/local/bin/bk-guardian
      /usr/local/bin/bk-cdn-ips
      printf "[Unit]\nDescription=Bellakaventuras: IP de Bunny (CDN) para trusted_proxies\n[Service]\nType=oneshot\nExecStart=/usr/local/bin/bk-cdn-ips\n" > /etc/systemd/system/bk-cdn-ips.service
      printf "[Unit]\nDescription=Bellakaventuras: IP de Bunny cada día\n[Timer]\nOnBootSec=5min\nOnUnitActiveSec=1d\nRandomizedDelaySec=30min\n[Install]\nWantedBy=timers.target\n" > /etc/systemd/system/bk-cdn-ips.timer
      install -m 755 /root/bk-cdn-vigia /usr/local/bin/bk-cdn-vigia
      install -m 755 /root/bk-dns-www /usr/local/bin/bk-dns-www
      install -m 600 /root/.bunny-key.tmp /etc/bk/bunny.key; install -m 644 /root/bunny.zona.tmp /etc/bk/bunny.zona; rm -f /root/.bunny-key.tmp /root/bunny.zona.tmp
      install -m 755 /root/bk-contadores /usr/local/bin/bk-contadores
      printf "[Unit]\nDescription=Bellakaventuras: contadores (sesiones cada 100, gasto de Bunny) con ntfy\n[Service]\nType=oneshot\nNice=10\nExecStart=/usr/local/bin/bk-contadores\n" > /etc/systemd/system/bk-contadores.service
      printf "[Unit]\nDescription=Bellakaventuras: contadores cada 5 min\n[Timer]\nOnBootSec=4min\nOnUnitActiveSec=5min\nAccuracySec=15s\n[Install]\nWantedBy=timers.target\n" > /etc/systemd/system/bk-contadores.timer
      [ -f /etc/bk/cdn.conf ] || echo "CDN_HOST=bellakaventuras.b-cdn.net" > /etc/bk/cdn.conf
      printf "[Unit]\nDescription=Bellakaventuras: vigía de la CDN (Bunny)\n[Service]\nType=oneshot\nExecStart=/usr/local/bin/bk-cdn-vigia\n" > /etc/systemd/system/bk-cdn-vigia.service
      printf "[Unit]\nDescription=Bellakaventuras: vigía de la CDN cada 2 min\n[Timer]\nOnBootSec=3min\nOnUnitActiveSec=2min\nAccuracySec=10s\n[Install]\nWantedBy=timers.target\n" > /etc/systemd/system/bk-cdn-vigia.timer
      systemctl daemon-reload; systemctl enable --now bk-cdn-ips.timer bk-cdn-vigia.timer bk-contadores.timer >/dev/null 2>&1
      systemctl reload caddy; sleep 2; echo "   IP de Bunny en la lista: $(wc -l < /etc/bk/cdn-ips.txt)"'
    "$D/herramientas/pruebas/p0_comprobar.sh" | tail -1
    echo "== Copia ya con la capa"; "$D/herramientas/respaldo_servidor.sh";;
  --deshacer)
    ssh -o BatchMode=yes bellaka 'set -e; systemctl disable --now bk-cdn-ips.timer bk-cdn-vigia.timer bk-contadores.timer >/dev/null 2>&1 || true
      rm -f /etc/caddy/cdn-bunny.caddy /etc/caddy/cdn-bunny.caddy.anterior /etc/bk/cdn-ips.txt /etc/bk/cdn.conf /etc/systemd/system/bk-cdn-ips.timer /etc/systemd/system/bk-cdn-ips.service /etc/systemd/system/bk-cdn-vigia.timer /etc/systemd/system/bk-cdn-vigia.service /usr/local/bin/bk-cdn-vigia /usr/local/bin/bk-dns-www
      systemctl daemon-reload; sudo -u caddy caddy validate --config /etc/caddy/Caddyfile >/dev/null 2>&1 && systemctl reload caddy; echo "   capa CDN quitada"'
    "$D/herramientas/pruebas/p0_comprobar.sh" | tail -1;;
  *) sed -n 2,11p "$0"; exit 1;;
esac
