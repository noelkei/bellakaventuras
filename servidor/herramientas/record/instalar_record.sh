#!/usr/bin/env bash
# V10.6.1 · instala en el VPS el récord del cronómetro de speedrun (usuario, 25 oct: automático + aviso al móvil). SOLO con el «sí» del usuario.
#   herramientas/record/instalar_record.sh            instala (copia antes) y comprueba
#   herramientas/record/instalar_record.sh --quitar   lo desinstala (vuelve la Caddyfile de la copia; el juego sin récord sigue funcionando)
# Qué hace:
#  1. Copia de la Caddyfile del servidor en /root/respaldo-record-<fecha>/.
#  2. Añade a la Caddyfile del Mac (la de referencia) el bloque /e/record, la sube, la VALIDA y solo entonces recarga Caddy.
#     /e/record va por /e/ porque Bunny nunca guarda /e/* en caché (reglas.json) y lleva log_skip: leerlo no ensucia las métricas.
#  3. Instala /usr/local/bin/bk-record y bk-record.timer (cada 2 min); la primera pasada fija «desde ahora» (lo de antes no cuenta).
#  4. Comprueba desde fuera (por Bunny y directo al VPS) que /e/record responde {"ds": null} sin caché.
# Requisito del juego: la V10.6.1 manda /e/crono?ds=… y lee /e/record; sin esta instalación el juego no enseña récord (no se rompe nada).
set -euo pipefail
HOST="${BK_HOST:-bellaka}"; URL="${BK_URL:-https://www.bellakaventuras.com}"
D="$(cd "$(dirname "$0")" && pwd)"; S="$D/../servidor"; CF="$S/Caddyfile"
FECHA="$(date +%Y%m%d-%H%M%S)"

if [ "${1:-}" = "--quitar" ]; then
  ssh -o BatchMode=yes "$HOST" 'set -e; R=$(ls -d /root/respaldo-record-* | tail -1); systemctl disable --now bk-record.timer >/dev/null 2>&1 || true
    cp "$R/Caddyfile" /etc/caddy/Caddyfile; if sudo -u caddy caddy validate --config /etc/caddy/Caddyfile >/dev/null 2>&1; then systemctl reload caddy; echo "Caddyfile repuesta de $R"; else echo "¡La copia no valida! Revisar a mano" >&2; exit 1; fi'
  python3 - "$CF" <<'EOF'
import sys, re
p = sys.argv[1]; s = open(p).read()
s = re.sub(r"\n\t# V10\.6\.1: récord del cronómetro.*?\n\t}\n", "\n", s, flags=re.S); open(p, "w").write(s)
EOF
  echo "Desinstalado. Datos del récord conservados en el servidor: /var/lib/bk-record"; exit 0
fi

# 2a · bloque en la Caddyfile de referencia (una sola vez), justo antes de la señal de analítica
python3 - "$CF" <<'EOF'
import sys
p = sys.argv[1]; s = open(p).read()
if "handle /e/record" not in s:
    ancla = "\t# Señal de analítica"
    assert ancla in s, "no encuentro la señal de analítica en la Caddyfile"
    bloque = ("\t# V10.6.1: récord del cronómetro de speedrun (lo escribe bk-record cada 2 min). Por /e/ para que Bunny no lo guarde nunca;\n"
              "\t# log_skip: leerlo no queda en el registro (no ensucia las métricas). Sin el archivo, 404: el juego no enseña récord.\n"
              "\thandle /e/record {\n\t\tlog_skip\n\t\theader Cache-Control \"no-store\"\n\t\theader Content-Type \"application/json\"\n"
              "\t\troot * /var/lib/bk-record\n\t\trewrite * /record.json\n\t\tfile_server\n\t}\n\n")
    s = s.replace(ancla, bloque + ancla, 1); open(p, "w").write(s); print("Caddyfile de referencia: bloque /e/record añadido")
else:
    print("Caddyfile de referencia: el bloque ya estaba")
EOF

# 1 + 2b + 3 · en el servidor
scp -q "$CF" "$HOST:/root/Caddyfile.record"; scp -q "$D/bk-record" "$HOST:/root/bk-record"
ssh -o BatchMode=yes "$HOST" "set -e
  R=/root/respaldo-record-$FECHA; mkdir -p \$R; cp /etc/caddy/Caddyfile \$R/Caddyfile; echo \"Copia: \$R\"
  install -m 755 /root/bk-record /usr/local/bin/bk-record
  mkdir -p /var/lib/bk-record; chmod 755 /var/lib/bk-record
  /usr/local/bin/bk-record; chmod 644 /var/lib/bk-record/record.json; echo \"record.json: \$(cat /var/lib/bk-record/record.json)\"
  printf '[Unit]\nDescription=Bellakaventuras: récord del cronómetro (avisos /e/crono) con ntfy\n[Service]\nType=oneshot\nNice=10\nExecStart=/usr/local/bin/bk-record\n' > /etc/systemd/system/bk-record.service
  printf '[Unit]\nDescription=Bellakaventuras: récord cada 2 min\n[Timer]\nOnBootSec=3min\nOnUnitActiveSec=2min\nAccuracySec=10s\n[Install]\nWantedBy=timers.target\n' > /etc/systemd/system/bk-record.timer
  systemctl daemon-reload; systemctl enable --now bk-record.timer >/dev/null 2>&1
  cp /root/Caddyfile.record /etc/caddy/Caddyfile.nueva
  if sudo -u caddy caddy validate --config /etc/caddy/Caddyfile.nueva >/dev/null 2>&1; then cp /etc/caddy/Caddyfile.nueva /etc/caddy/Caddyfile; systemctl reload caddy; echo 'Caddy recargado'
  else echo 'La Caddyfile nueva NO valida: Caddy sigue con la de antes' >&2; exit 1; fi"

# 4 · comprobación desde fuera
sleep 2
for via in "" "--resolve ${URL#https://}:443:${BK_IP:-203.0.113.10}"; do   # la misma IP que usa publicar.sh para ir directo al VPS
  r=$(curl -s -D - $via "$URL/e/record" -H 'User-Agent: BK-Prueba instalar_record') || true
  echo "$r" | grep -qi '^cache-control: no-store' && echo "$r" | grep -q '"ds"' && echo "OK /e/record ${via:+(directo al VPS)}: $(echo "$r" | tail -1)" || { echo "FALLO /e/record ${via:+(directo)}:"; echo "$r" | head -20; }
done
echo "Listo. Ver: ssh $HOST bk-record --ver · Quitar un récord falso: ssh $HOST sudo bk-record --quitar"
