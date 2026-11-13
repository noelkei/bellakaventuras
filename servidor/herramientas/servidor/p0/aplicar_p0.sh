#!/usr/bin/env bash
# Aplica las medidas P0 en el servidor (23–24 oct 2026). Se ejecuta desde el Mac:
#   herramientas/servidor/p0/aplicar_p0.sh
# Antes guarda en el servidor una copia de todo lo que toca (/root/respaldo-p0-<fecha>/).
# Deshacer: herramientas/servidor/p0/deshacer_p0.sh
set -euo pipefail
D="$(cd "$(dirname "$0")" && pwd)"
RAIZ="$(cd "$D/../../.." && pwd)"
H=bellaka

ssh -o BatchMode=yes -o ConnectTimeout=10 $H true || { echo "Sin acceso SSH: no se toca nada" >&2; exit 1; }
echo "== Subiendo archivos a /root/p0"
rsync -a "$D/" "$H:/root/p0/"
rsync -a "$RAIZ/herramientas/servidor/Caddyfile" "$H:/root/p0/Caddyfile"

ssh -o BatchMode=yes $H 'bash -s' <<'REMOTO'
set -euo pipefail
F=$(date +%Y%m%d-%H%M%S); R=/root/respaldo-p0-$F; mkdir -p $R
cp -a /etc/caddy $R/ ; cp -a /etc/sysctl.d $R/ ; mkdir -p $R/systemd && cp -a /etc/systemd/system/caddy.service.d $R/systemd/ 2>/dev/null || true
echo $R > /root/p0/ultimo-respaldo; echo "   copia en $R"

echo "== 1. Caddy con Go parcheado"
if [ ! -e /usr/bin/caddy.default ]; then dpkg-divert --divert /usr/bin/caddy.default --rename /usr/bin/caddy; fi
install -m 755 /root/build/caddy-2.11.7-go1.26.10 /usr/bin/caddy.custom
update-alternatives --install /usr/bin/caddy caddy /usr/bin/caddy.default 10 >/dev/null
update-alternatives --install /usr/bin/caddy caddy /usr/bin/caddy.custom 50 >/dev/null
caddy build-info | grep '^go'

echo "== 2. Unidades systemd, sysctl y diario"
awk '/^=== /{f=$2; system("mkdir -p $(dirname " f ")"); next} {print > f}' /root/p0/unidades.txt
sysctl -q --system
systemctl restart systemd-journald
install -d -m 755 /etc/bk
install -m 644 /root/p0/bk.nft /etc/bk/bk.nft
install -m 755 /root/p0/bk-vigilante /usr/local/bin/bk-vigilante
install -m 755 /root/p0/bk-guardian /usr/local/bin/bk-guardian
if [ ! -f /etc/bk/avisos.conf ]; then
  echo "NTFY_URL=https://ntfy.sh/bk-$(openssl rand -hex 12)" > /etc/bk/avisos.conf; chmod 600 /etc/bk/avisos.conf
fi
systemctl daemon-reload

echo "== 3. Página de privacidad y Caddyfile"
install -d -m 755 /srv/bellaka/paginas
install -m 644 /root/p0/privacidad.html /srv/bellaka/paginas/privacidad.html
sed -i 's|^@bk_protegido not path /salud$|@bk_protegido not path /salud /privacidad|' /etc/caddy/acceso-pruebas.caddy
cp /etc/caddy/Caddyfile /etc/caddy/Caddyfile.antes-p0
install -m 644 /root/p0/Caddyfile /etc/caddy/Caddyfile
if sudo -u caddy caddy validate --config /etc/caddy/Caddyfile >/root/p0/validar.log 2>&1; then
  systemctl restart caddy; sleep 3
else
  echo "   Caddyfile NO válido: se deja el anterior"; cat /root/p0/validar.log | tail -5
  cp /etc/caddy/Caddyfile.antes-p0 /etc/caddy/Caddyfile; systemctl restart caddy; exit 3
fi
systemctl is-active caddy
curl -s -o /dev/null -w "   salud %{http_code}\n" --resolve bellakaventuras.com:443:127.0.0.1 https://bellakaventuras.com/salud

echo "== 4. Tabla nftables propia, vigilante y guardián"
nft -c -f /etc/bk/bk.nft
systemctl enable --now bk-nft.service bk-vigilante.timer bk-guardian.timer
nft list table inet bk | head -5
echo "   Restart=$(systemctl show caddy -p Restart --value)  panic=$(sysctl -n kernel.panic)"
REMOTO

echo "== Comprobando que SSH sigue entrando (conexión nueva)"
ssh -o BatchMode=yes -o ConnectTimeout=10 $H 'echo "   SSH OK"'
ssh -o BatchMode=yes $H 'sed -n "s/^NTFY_URL=//p" /etc/bk/avisos.conf' > "$RAIZ/.avisos-ntfy"; chmod 600 "$RAIZ/.avisos-ntfy"
echo "Tema de avisos guardado en .avisos-ntfy (privado)"
