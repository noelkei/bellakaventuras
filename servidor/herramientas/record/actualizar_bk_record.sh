#!/usr/bin/env bash
# Actualiza bk-record en el VPS (V10.6.2: siempre top 3, aviso cada vez que cambia el top 3, «--empezar»). SOLO con el «sí» del usuario.
#   herramientas/record/actualizar_bk_record.sh            copia (programa + datos) y actualiza; una pasada y --ver
#   herramientas/record/actualizar_bk_record.sh --volver   repone el programa y los datos de la última copia
# No toca Caddy ni el reloj (bk-record.timer sigue igual): solo /usr/local/bin/bk-record.
set -euo pipefail
HOST="${BK_HOST:-bellaka}"; D="$(cd "$(dirname "$0")" && pwd)"; FECHA="$(date +%Y%m%d-%H%M%S)"
if [ "${1:-}" = "--volver" ]; then
  ssh -o BatchMode=yes "$HOST" 'set -e; R=$(ls -d /root/respaldo-bk-record-* | tail -1); install -m 755 "$R/bk-record" /usr/local/bin/bk-record
    cp "$R/estado.json" "$R/record.json" /var/lib/bk-record/; chmod 644 /var/lib/bk-record/record.json; echo "Repuesto de $R"; bk-record --ver'
  exit 0
fi
python3 -I -c "import ast,sys; ast.parse(open(sys.argv[1]).read())" "$D/bk-record"
scp -q "$D/bk-record" "$HOST:/root/bk-record.nuevo"
ssh -o BatchMode=yes "$HOST" "set -e
  R=/root/respaldo-bk-record-$FECHA; mkdir -p \$R; cp /usr/local/bin/bk-record /var/lib/bk-record/estado.json /var/lib/bk-record/record.json \$R/; echo \"Copia: \$R\"
  install -m 755 /root/bk-record.nuevo /usr/local/bin/bk-record
  /usr/local/bin/bk-record; chmod 644 /var/lib/bk-record/record.json; echo \"record.json: \$(cat /var/lib/bk-record/record.json)\"; bk-record --ver"
