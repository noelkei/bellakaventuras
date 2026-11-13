#!/bin/bash
# Copia privada de la configuración del servidor (y los certificados de Caddy) en respaldos/ del Mac.
#   herramientas/respaldo_servidor.sh   → respaldos/servidor-<fecha>.tar.gz (permisos 600; NO subir a ningún sitio)
# No copia el juego (está en el Mac) ni los registros de acceso (datos de visitantes).
set -euo pipefail
DIR="$(cd "$(dirname "$0")/.." && pwd)"; F="$DIR/respaldos/servidor-$(date +%Y%m%d-%H%M).tar.gz"
umask 077
ssh -o BatchMode=yes bellaka 'tar czf - --ignore-failed-read \
  /etc/caddy /var/lib/caddy/.local/share/caddy /etc/bk /etc/sysctl.d /etc/systemd/system /etc/systemd/journald.conf.d \
  /etc/ufw /etc/ssh/sshd_config /etc/ssh/sshd_config.d /etc/apt/apt.conf.d /etc/netplan /etc/fstab \
  /usr/local/bin /usr/bin/caddy.custom /srv/bellaka/paginas /root/p0 /var/lib/bk-analitica 2>/dev/null' > "$F"
chmod 600 "$F"; echo "Copia: $F ($(du -h "$F" | cut -f1), $(tar tzf "$F" | wc -l | tr -d ' ') entradas)"
