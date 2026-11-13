#!/bin/bash
# Bunny.net (CDN delante del VPS), oct 2026. Capa POR ENCIMA: el servidor sigue sirviendo igual con o sin Bunny.
# La clave de API está en ../../.bunny-api (permisos 600; NUNCA se muestra ni se sube a ningún sitio). Zona: zona.txt.
#   bunny.sh estado      → ajustes clave, reglas, tráfico del mes y tope
#   bunny.sh purgar      → vacía la caché de toda la zona (lo hace publicar.sh y volver.sh); nunca falla en duro
#   bunny.sh aplicar     → reaplica ajustes-zona.json y reglas.json (configuración reproducible)
#   bunny.sh verificar [host] → comprueba por la CDN: caché, BYPASS de telemetría/salud, cabeceras al navegador
#   bunny.sh ips         → lista actual de IP de Bunny (para trusted_proxies y nftables del servidor)
#   bunny.sh registros [dd]  → baja los registros de Bunny de hace dd días (por defecto 1) a respaldos/bunny-registros/
#   bunny.sh encender    → la web pasa por Bunny: www en la zona + certificado + DNS www → Bunny + vuelta automática activada
#                          (solo con la web ABIERTA: con contraseña, Bunny guardaría el juego y lo daría sin pedirla)
#   bunny.sh apagar      → www vuelve al servidor de IONOS (DNS), sin tocar nada más
set -uo pipefail
D="$(cd "$(dirname "$0")" && pwd)"; R="$(cd "$D/../.." && pwd)"
K="$(cat "$R/.bunny-api" 2>/dev/null)"; Z="$(cat "$D/zona.txt" 2>/dev/null)"
[ -n "$K" ] && [ -n "$Z" ] || { echo "   Bunny: falta la clave (.bunny-api) o la zona (zona.txt)" >&2; exit 1; }
api() { curl -s -m 30 -H "AccessKey: $K" -H "Accept: application/json" "$@"; }
case "${1:-estado}" in
  purgar)
    for i in 1 2 3; do
      c=$(api -o /dev/null -w '%{http_code}' -X POST "https://api.bunny.net/pullzone/$Z/purgeCache")
      [ "$c" = 204 ] && { echo "   Bunny: caché vaciada"; exit 0; }; sleep 5
    done
    echo "   AVISO: Bunny no vació la caché (código $c). Repite: herramientas/bunny/bunny.sh purgar" >&2; exit 3;;
  aplicar)
    c=$(api -o /dev/null -w '%{http_code}' -X POST -H "Content-Type: application/json" --data @"$D/ajustes-zona.json" "https://api.bunny.net/pullzone/$Z")
    echo "   ajustes de la zona → $c"
    python3 -c "import json;[print(json.dumps(r)) for r in json.load(open('$D/reglas.json'))]" | while read -r r; do
      echo "$r" | api -o /dev/null -w "   regla → %{http_code}\n" -X POST -H "Content-Type: application/json" --data @- "https://api.bunny.net/pullzone/$Z/edgerules/addOrUpdate"; done;;
  estado)
    api "https://api.bunny.net/pullzone/$Z" | python3 -c '
import json,sys; d=json.load(sys.stdin)
print("Zona", d["Id"], [h["Value"] for h in d["Hostnames"]], "· origen", d["OriginUrl"], "· Host", d["OriginHostHeader"])
print("Escudo", d["EnableOriginShield"], d["OriginShieldZoneCode"], "· agrupa peticiones", d["EnableRequestCoalescing"], "· sirve guardado si el origen cae", d["UseStaleWhileOffline"])
print("Caché borde", d["CacheControlMaxAgeOverride"], "s · navegador", d["CacheControlPublicMaxAgeOverride"], "· regiones EU/US/ASIA/SA/AF", d["EnableGeoZoneEU"], d["EnableGeoZoneUS"], d["EnableGeoZoneASIA"], d["EnableGeoZoneSA"], d["EnableGeoZoneAF"])
print("Tráfico este mes %.2f GB de un tope de %.0f GB · facturado este mes %.2f $" % (d.get("MonthlyBandwidthUsed",0)/1e9, d["MonthlyBandwidthLimit"]/1e9, d.get("MonthlyCharges",0)))
for r in sorted(d["EdgeRules"], key=lambda r: r["OrderIndex"]): print("  regla", r["OrderIndex"], r["Description"])'
    api "https://api.bunny.net/billing" | python3 -c 'import json,sys; d=json.load(sys.stdin); print("Saldo de la cuenta:", d.get("Balance"), "$")';;
  verificar)
    H="${2:-bellakaventuras.b-cdn.net}"; ok=0
    v() { local p=$1 esp=$2; h=$(curl -s -o /dev/null -D - -m 20 -A "BK-Prueba/bunny" "https://$H$p" | tr -d '\r');
      c=$(echo "$h" | grep -i '^cdn-cache:' | awk '{print $2}'); cc=$(echo "$h" | grep -i '^cache-control:' | cut -d' ' -f2-)
      st=$(echo "$h" | head -1 | awk '{print $2}'); echo "   $p → $st · CDN $c · navegador «$cc»"; [[ "$c" =~ $esp ]] || ok=1; }
    v /salud BYPASS; v /salud-version BYPASS; v /game-config.json 'BYPASS|MISS'; v /privacidad 'HIT|MISS|STALE'
    v / 'HIT|MISS|STALE'; v /favicon.svg 'HIT|MISS|STALE'
    e=$(curl -s -o /dev/null -w '%{http_code}' -m 20 -X POST -A "BK-Prueba/bunny" "https://$H/e/prueba-bunny?x=1")
    echo "   POST /e/ (telemetría) → $e (204 con la web abierta; 401 mientras tenga contraseña)"
    exit $ok;;
  ips) curl -s -m 30 https://api.bunny.net/system/edgeserverlist/plain; echo; curl -s -m 30 https://bunnycdn.com/api/system/edgeserverlist/IPv6 | python3 -c 'import json,sys;[print(x) for x in json.load(sys.stdin)]';;
  registros)
    n="${2:-1}"; dia=$(date -v-"${n}"d +%m-%d-%y); o="$R/respaldos/bunny-registros"; mkdir -p "$o"; chmod 700 "$o"
    api "https://logging.bunnycdn.com/$dia/$Z.log" -o "$o/$dia.log" && gzip -f "$o/$dia.log" && echo "   $o/$dia.log.gz"
    find "$o" -name '*.log.gz' -mtime +30 -delete;;   # como mucho 30 días, como dice la página de privacidad
  encender)
    c=$(curl -s -o /dev/null -w '%{http_code}' -m 20 https://www.bellakaventuras.com/)
    [ "$c" = 200 ] || { echo "   La web no está abierta (www responde $c): no se enciende Bunny (daría el juego sin contraseña)" >&2; exit 1; }
    "$D/bk-dns-www" estado >/dev/null || { echo "   Falta la clave de DNS de IONOS (.ionos-dns)" >&2; exit 1; }
    echo "== www en la zona"; api -o /dev/null -w "   addHostname → %{http_code}\n" -X POST -H "Content-Type: application/json" --data '{"Hostname":"www.bellakaventuras.com"}' "https://api.bunny.net/pullzone/$Z/addHostname"
    echo "== DNS: www → Bunny"; "$D/bk-dns-www" a-bunny || exit 1
    echo "== Esperando a que el DNS lo diga (hasta 10 min) y certificado gratuito"
    for i in $(seq 1 60); do dig +short CNAME www.bellakaventuras.com @ns1101.ui-dns.de | grep -q b-cdn.net && break; sleep 10; done
    for i in $(seq 1 30); do c=$(api -o /dev/null -w '%{http_code}' "https://api.bunny.net/pullzone/loadFreeCertificate?hostname=www.bellakaventuras.com"); [ "$c" = 200 ] && break; sleep 20; done
    echo "   certificado → $c"; [ "$c" = 200 ] || { echo "   Sin certificado: vuelvo a IONOS" >&2; "$D/bk-dns-www" a-ionos; exit 1; }
    api -o /dev/null -w "   forzar https → %{http_code}\n" -X POST -H "Content-Type: application/json" --data '{"Hostname":"www.bellakaventuras.com","ForceSSL":true}' "https://api.bunny.net/pullzone/$Z/setForceSSL"
    ssh -o BatchMode=yes bellaka 'grep -q "^CONMUTAR_AUTO=" /etc/bk/cdn.conf && sed -i "s/^CONMUTAR_AUTO=.*/CONMUTAR_AUTO=si/" /etc/bk/cdn.conf || echo CONMUTAR_AUTO=si >> /etc/bk/cdn.conf'
    echo "   vuelta automática a IONOS: activada"; "$0" purgar; "$0" verificar www.bellakaventuras.com;;
  apagar) "$D/bk-dns-www" a-ionos;;
  *) sed -n 2,13p "$0"; exit 1;;
esac
