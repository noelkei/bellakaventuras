#!/bin/bash
# Batería P0: comprueba desde el Mac lo imprescindible antes de abrir. Solo lee; no cambia nada.
# Uso: herramientas/pruebas/p0_comprobar.sh            → web con contraseña (fase de pruebas)
#      herramientas/pruebas/p0_comprobar.sh --abierta   → web ya abierta al público (sin contraseña)
# Imprime OK/FALLA por punto y un total.
DIR="$(cd "$(dirname "$0")/../.." && pwd)"
DOM=bellakaventuras.com
WEB=www.$DOM   # dirección principal desde el 24 oct (opción A de Bunny): la raíz redirige aquí
IP=203.0.113.10
ABIERTA=; [ "${1:-}" = --abierta ] && ABIERTA=1
AUTH=(); [ -z "$ABIERTA" ] && [ -f "$DIR/.acceso-pruebas" ] && AUTH=(-u "$(cat "$DIR/.acceso-pruebas")")
C=(curl -s -o /dev/null --max-time 20 -H "X-BK-Prueba: p0")
ok=0; mal=0
res() { if [ "$1" = 0 ]; then echo "OK    $2"; ok=$((ok+1)); else echo "FALLA $2${3:+  → $3}"; mal=$((mal+1)); fi; }

# --- Servidor (por SSH, solo lectura) ---
S=$(ssh -o BatchMode=yes -o ConnectTimeout=10 bellaka '
  echo "restart=$(systemctl show caddy -p Restart --value)"
  echo "go=$(caddy build-info | awk "/^go/{print \$2}")"
  echo "xnet=$(caddy build-info | awk "\$2==\"golang.org/x/net\"{print \$3}")"
  echo "panic=$(sysctl -n kernel.panic)"
  echo "journal=$(systemd-analyze cat-config systemd/journald.conf 2>/dev/null | grep -E "^SystemMaxUse=" | tail -1)"
  echo "vigilante=$(systemctl is-active bk-vigilante.timer 2>/dev/null)"
  echo "guardian=$(systemctl is-active bk-guardian.timer 2>/dev/null)"
  echo "copias=$(systemctl is-enabled caddy)"
  echo "bueno=$(cmp -s /etc/caddy/Caddyfile /etc/bk/Caddyfile.bueno && echo si)"
  echo "casa=$(nft list set inet bk permitidos 2>/dev/null | grep -c 198.51.100.20)"
  echo "version=$(cat /srv/bellaka/current/salud.txt 2>/dev/null)"
' 2>/dev/null)
v() { echo "$S" | sed -n "s/^$1=//p"; }
[ -n "$S" ]; res $? "S0 acceso SSH"
[ "$(v restart)" != no ] && [ -n "$(v restart)" ]; res $? "S1 Caddy se relanza solo (Restart=$(v restart))"
g=$(v go); [ "$(printf '%s\n' go1.26.10 "$g" | sort -V | head -1)" = go1.26.10 ]; res $? "S2 Caddy con Go parcheado ($g ≥ go1.26.10)"
x=$(v xnet); [ -n "$x" ] && [ "$(printf '%s\n' v0.60.0 "$x" | sort -V | head -1)" = v0.60.0 ]; res $? "S2b HTTP/2 de x/net parcheado ($x ≥ v0.60.0; GO-2026-6603/6611/6612/6617)"
[ "$(v panic)" -gt 0 ] 2>/dev/null; res $? "S3 reinicio solo si el kernel se cuelga (kernel.panic=$(v panic))"
[ -n "$(v journal)" ]; res $? "S4 tope del diario del sistema ($(v journal))"
[ "$(v vigilante)" = active ]; res $? "S5 vigilante local activo"
[ "$(v guardian)" = active ]; res $? "S6 guardián de abusos activo"
[ "$(v copias)" = enabled ]; res $? "S7 Caddy arranca solo al reiniciar"
[ "$(v bueno)" = si ]; res $? "S8 último Caddyfile bueno guardado (se repone solo si se rompe)"
[ "$(v casa)" = 1 ]; res $? "S9 la IP de casa nunca se bloquea (tabla inet bk)"

# --- Web desde fuera ---
H=$(curl -s -D - -o /dev/null --max-time 20 "${AUTH[@]}" -H "X-BK-Prueba: p0" "https://$WEB/")
hdr() { echo "$H" | grep -i "^$1:" | head -1 | tr -d '\r'; }
if [ -z "$ABIERTA" ]; then
  echo "$H" | head -1 | grep -q " 200"; res $? "W1 portada 200 con contraseña"
  [ "$("${C[@]}" -w '%{http_code}' "https://$WEB/")" = 401 ]; res $? "W2 sin contraseña pide contraseña (401)"
else
  echo "$H" | head -1 | grep -q " 200"; res $? "W1 portada 200 sin contraseña (web abierta)"
  ssh -o BatchMode=yes bellaka 'test ! -e /etc/caddy/acceso-pruebas.caddy'; res $? "W2 la contraseña de pruebas ya no está en el servidor"
fi
[ "$("${C[@]}" -w '%{http_code}' "https://$DOM/salud")" = 200 ] && [ "$("${C[@]}" -w '%{http_code}' "https://$WEB/salud")" = 200 ]; res $? "W3 /salud responde sin contraseña (raíz y www)"
hdr strict-transport-security | grep -q max-age; res $? "W4 HSTS" "$(hdr strict-transport-security)"
hdr content-security-policy | grep -q "frame-ancestors 'none'"; res $? "W5 no se puede incrustar (frame-ancestors)"
[ -n "$(hdr permissions-policy)" ]; res $? "W6 Permissions-Policy"
# Con Bunny delante, la cabecera Server es la de Bunny: W7 mira el servidor de origen directamente
so=$(curl -s -D - -o /dev/null --max-time 20 --resolve "$WEB:443:$IP" -H "X-BK-Prueba: p0" "https://$WEB/salud" | grep -i "^server:" | tr -d '\r')
[ -z "$so" ]; res $? "W7 sin cabecera Server (origen)" "$so"
F=/assets/portada/capas.json
FA=/audio/fashion_girl-v4.m4a   # Safari pide el audio por trozos (Range): por la CDN y en el origen
[ "$("${C[@]}" "${AUTH[@]}" -w '%{http_code}' -H 'Range: bytes=0-99' "https://$WEB$FA")" = 206 ] && [ "$("${C[@]}" "${AUTH[@]}" --resolve "$WEB:443:$IP" -w '%{http_code}' -H 'Range: bytes=0-99' "https://$WEB$FA")" = 206 ]; res $? "W8 Range simple → 206 en el audio (CDN y origen)"
R="bytes=0-1,1-2,2-3,3-4,4-5,5-6,6-7,7-8,8-9,9-10,10-11,11-12"
c=$("${C[@]}" "${AUTH[@]}" --resolve "$WEB:443:$IP" -w '%{http_code}' -H "Range: $R" "https://$WEB$F"); [ "$c" != 206 ]; res $? "W9 Range con muchos trozos rechazado" "código $c"
! curl -s "${AUTH[@]}" --max-time 20 -H "X-BK-Prueba: p0" "https://$WEB$F" | grep -q "/Users/"; res $? "W10 sin rutas /Users/ del autor en capas.json"
[ "$("${C[@]}" -w '%{http_code}' "https://$WEB/privacidad")" = 200 ]; res $? "W11 página /privacidad sin contraseña"
# (sed quita usuario:contraseña, que curl mete en redirect_url: nunca se imprimen)
l=$("${C[@]}" "${AUTH[@]}" -w '%{http_code} %{redirect_url}' "https://$WEB/?bktest=1" | sed -E 's#//[^/@ ]+@#//#'); [ "$l" = "302 https://$WEB/" ]; res $? "W12 el modo de pruebas ?bktest no se ofrece (→ /)" "$l"
sv=$(curl -s --max-time 10 -H "X-BK-Prueba: p0" "https://$DOM/salud-version"); [ -n "$sv" ] && [ "$sv" = "$(v version)" ]; res $? "W13 /salud-version dice la versión activa ($sv)"
fin=$(echo | openssl s_client -connect $DOM:443 -servername $DOM -verify_return_error 2>/dev/null | openssl x509 -noout -enddate 2>/dev/null | cut -d= -f2)
d=$(( ( $(date -j -f "%b %e %T %Y %Z" "$fin" +%s 2>/dev/null || echo 0) - $(date +%s) ) / 86400 )); [ $d -gt 20 ]; res $? "W14 certificado válido con cadena completa ($d días)"
fin=$(echo | openssl s_client -connect $IP:443 -servername $WEB -verify_return_error 2>/dev/null | openssl x509 -noout -enddate 2>/dev/null | cut -d= -f2)
d=$(( ( $(date -j -f "%b %e %T %Y %Z" "$fin" +%s 2>/dev/null || echo 0) - $(date +%s) ) / 86400 )); [ $d -gt 20 ]; res $? "W14b certificado de www en el servidor ($d días)"
l=$("${C[@]}" -w '%{http_code} %{redirect_url}' "https://$DOM/una/ruta?x=1"); [ "$l" = "302 https://$WEB/una/ruta?x=1" ]; res $? "W15 la raíz redirige a www con la ruta" "$l"

# --- Entradas raras ---
b=$(curl -s --max-time 10 "http://$IP/" | head -c 400); ! echo "$b" | grep -qi "<script"; res $? "X1 http://IP no enseña el juego"
b=$(curl -sk --max-time 10 "https://$IP/" 2>/dev/null | head -c 400); ! echo "$b" | grep -qi "<script"; res $? "X2 https://IP no enseña el juego"
b=$(curl -sk --max-time 10 --resolve "otro.example:443:$IP" "https://otro.example/" | head -c 400); ! echo "$b" | grep -qi "<script"; res $? "X3 otro nombre apuntando a la IP no enseña el juego"
l=$(curl -s -o /dev/null -w '%{redirect_url}' --max-time 10 "https://$DOM//evil.example/x"); echo "$l" | grep -q "^https://$WEB/"; res $? "X4 la raíz no es redirección abierta" "$l"
mal_ruta=0
for p in /.env /.git/config /.DS_Store /.sha256 /index.html.sha256 /build/ /assets/ "/..%2f..%2fetc/passwd" "/%2e%2e/%2e%2e/etc/passwd" "/assets/../../../etc/passwd" /etc/passwd "/index.html~"; do
  c=$("${C[@]}" "${AUTH[@]}" --path-as-is -w '%{http_code}' "https://$WEB$p")
  case "$c" in 404|400|403|405|308|301) ;; *) echo "      ruta $p → $c"; mal_ruta=1;; esac
done
res $mal_ruta "X5 rutas trucadas y archivos ocultos no sirven nada"
c=$("${C[@]}" "${AUTH[@]}" -X TRACE -w '%{http_code}' "https://$WEB/"); [ "$c" != 200 ]; res $? "X6 método TRACE rechazado ($c)"
t=$(python3 -I - "$WEB" "$IP" <<'EOF'
import socket, ssl, sys, time
s = ssl.create_default_context().wrap_socket(socket.create_connection((sys.argv[2], 443), 10), server_hostname=sys.argv[1])
s.sendall(b"GET / HTTP/1.1\r\nHost: " + sys.argv[1].encode() + b"\r\nX-Lento: ")
t = time.time(); s.settimeout(90)
try:
    while s.recv(1024): pass
except Exception: pass
print(int(time.time() - t))
EOF
)
[ "${t:-99}" -le 25 ]; res $? "X7 conexión lenta cortada en ≤25 s en el origen (tardó ${t}s)"

echo; echo "Total: $ok OK, $mal FALLA"
