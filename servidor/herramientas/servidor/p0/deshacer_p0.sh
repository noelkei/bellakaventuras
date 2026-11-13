#!/usr/bin/env bash
# Deshace aplicar_p0.sh: vuelve al Caddy del paquete, al Caddyfile y la contraseña anteriores, y apaga lo añadido.
#   herramientas/servidor/p0/deshacer_p0.sh
set -euo pipefail
ssh -o BatchMode=yes bellaka 'bash -s' <<'REMOTO'
set -euo pipefail
R=$(cat /root/p0/ultimo-respaldo)
systemctl disable --now bk-guardian.timer bk-vigilante.timer bk-nft.service 2>/dev/null || true
update-alternatives --set caddy /usr/bin/caddy.default
cp -a $R/caddy/. /etc/caddy/
rm -f /etc/systemd/system/caddy.service.d/bk.conf /etc/sysctl.d/90-bk.conf /etc/systemd/journald.conf.d/bk.conf
systemctl daemon-reload; sysctl -q --system; systemctl restart systemd-journald
systemctl restart caddy; sleep 3; systemctl is-active caddy
echo "Deshecho con la copia $R"
REMOTO
