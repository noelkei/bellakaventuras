#!/bin/bash
# Sondas de Globalping (gratis, sin cuenta; R1) desde operadoras españolas y Latinoamérica contra /salud.
# Solo /salud: los resultados de Globalping son PÚBLICOS, así que nunca se manda la contraseña ni otra ruta.
# Sirve para ver si alguna operadora no llega (p. ej. un bloqueo de LaLiga durante un partido) y cuánto tarda.
#   herramientas/pruebas/globalping.sh            → España (operadoras) + Latinoamérica
#   herramientas/pruebas/globalping.sh espana     → solo operadoras españolas (para mirar durante un partido)
set -euo pipefail
DOM=bellakaventuras.com
ES='[{"magic":"Movistar","limit":2},{"magic":"Orange+ES","limit":2},{"magic":"Vodafone+ES","limit":2},{"magic":"DIGI+ES","limit":2},{"magic":"MasMovil","limit":1},{"magic":"ES","limit":3}]'
LA='[{"magic":"MX","limit":2},{"magic":"AR","limit":2},{"magic":"CO","limit":2},{"magic":"CL","limit":1},{"magic":"PE","limit":1}]'
pedir() {  # pedir <etiqueta> <lista de sitios JSON>
  local cuerpo id r
  cuerpo=$(printf '{"type":"http","target":"%s","locations":%s,"measurementOptions":{"protocol":"HTTPS","request":{"path":"/salud","method":"GET"}}}' "$DOM" "$2")
  id=$(curl -s -m 20 -X POST https://api.globalping.io/v1/measurements -H 'content-type: application/json' -d "$cuerpo" |
       python3 -I -c 'import json,sys; d=json.load(sys.stdin); print(d.get("id") or ("ERROR " + json.dumps(d)[:200]))')
  case "$id" in ERROR*) echo "$1: $id"; return;; esac
  for i in $(seq 30); do
    r=$(curl -s -m 20 "https://api.globalping.io/v1/measurements/$id")
    echo "$r" | grep -q '"status":"in-progress"' || break; sleep 2
  done
  echo "$r" | python3 -I "$(dirname "$0")/globalping_resumen.py" "$1"
}
echo "== Globalping $(date '+%F %T') — https://$DOM/salud"
pedir "España (operadoras)" "$ES"
[ "${1:-}" = espana ] || pedir "Latinoamérica" "$LA"
