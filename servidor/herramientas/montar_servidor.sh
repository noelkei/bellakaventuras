#!/bin/bash
# Reconstruye el servidor de Bellakaventuras en un Ubuntu 24.04 limpio (R8 §4.7), desde el Mac. Idempotente:
# cada paso mira antes de hacer y se puede repetir.
#
#   herramientas/montar_servidor.sh --comprobar [host]   solo dice qué cambiaría (no toca nada). Por defecto host=bellaka
#   herramientas/montar_servidor.sh <host> <IP>          lo monta en <host> (entrada de ~/.ssh/config) y publica la web
#
# Qué usa:
#   - herramientas/servidor/…          Caddyfile, bk-version, p0/ (vigilante, guardián, tabla, unidades, privacidad)
#   - la copia más reciente de respaldos/servidor-*.tar.gz (herramientas/respaldo_servidor.sh): certificados de Caddy,
#     acceso-pruebas.caddy (contraseña de pruebas, si sigue), avisos.conf (mismo tema de ntfy), el binario de Caddy
#     parcheado y la configuración de SSH
#   - la build publicada de verdad: ../implementacion/<carpeta de PUBLICADA.txt> (si no existe, «site» = r3), con publicar.sh
#
# Antes (lo hace el usuario en el panel de IONOS): crear el VPS con Ubuntu 24.04 y la clave pública
# clave_publica_bellakaventuras_ionos.pub, abrir 80/tcp, 443/tcp y 443/udp en su cortafuegos y añadir al Mac:
#   Host bellaka2 / HostName <IP> / User root / IdentityFile ~/.ssh/bellakaventuras_ionos_2 / IdentitiesOnly yes
# Después: cambiar los registros A @ y www a la IP nueva (TTL 5 min) y pasar herramientas/pruebas/p0_comprobar.sh.
set -euo pipefail
DIR="$(cd "$(dirname "$0")/.." && pwd)"; S="$DIR/herramientas/servidor"
if [ "${1:-}" = --comprobar ]; then MODO=comprobar; H="${2:-bellaka}"; IP=""
else MODO=montar; H="${1:?Uso: montar_servidor.sh <host> <IP> | --comprobar [host]}"; IP="${2:?Falta la IP del servidor nuevo}"; fi
T=$(ls -t "$DIR"/respaldos/servidor-*.tar.gz | head -1); echo "== Copia que se usa: $(basename "$T")"
ssh -o BatchMode=yes -o ConnectTimeout=10 "$H" true || { echo "Sin acceso SSH a $H" >&2; exit 1; }

# Paquete con todo lo necesario (privado): se sube a /root/montaje y se borra al final.
P=$(mktemp -d); trap 'rm -rf "$P"' EXIT; umask 077
mkdir -p "$P/copia" && tar xzf "$T" -C "$P/copia" etc/caddy etc/bk/avisos.conf usr/bin/caddy.custom \
  var/lib/caddy/.local/share/caddy etc/ssh/sshd_config.d/00-bellakaventuras.conf etc/sysctl.d/90-bellakaventuras.conf 2>/dev/null
cp "$S/Caddyfile" "$S/bk-version" "$P/"; cp -R "$S/p0" "$P/p0"
ssh -o BatchMode=yes "$H" 'rm -rf /root/montaje && mkdir -m 700 /root/montaje'
rsync -a "$P"/ "$H:/root/montaje/"

ssh -o BatchMode=yes "$H" "MODO=$MODO bash -s" <<'REMOTO'
set -euo pipefail
M=/root/montaje; C=$M/copia; cambios=0
paso() { echo "== $1"; }
hacer() {  # hacer <descripción> <orden…>: en modo comprobar solo lo dice
  cambios=$((cambios+1))
  if [ "$MODO" = comprobar ]; then echo "   CAMBIARÍA: $1"; else echo "   $1"; shift; "$@"; fi
}
poner() {  # poner <origen> <destino> <permisos>: copia si es distinto
  if ! cmp -s "$1" "$2"; then hacer "instalar $2" install -D -m "$3" "$1" "$2"; fi
}

paso "1. Sistema"
[ "$(timedatectl show -p Timezone --value)" = Europe/Madrid ] || hacer "zona horaria Europe/Madrid" timedatectl set-timezone Europe/Madrid
faltan=""; for p in ufw curl rsync zstd jq openssl unattended-upgrades debian-keyring debian-archive-keyring apt-transport-https gpg; do
  dpkg -s $p >/dev/null 2>&1 || faltan="$faltan $p"; done
[ -z "$faltan" ] || hacer "instalar paquetes:$faltan" bash -c "apt-get update -qq && DEBIAN_FRONTEND=noninteractive apt-get install -y -qq $faltan >/dev/null"
if [ ! -f /swapfile ]; then hacer "swap de 1 GB" bash -c 'fallocate -l 1G /swapfile && chmod 600 /swapfile && mkswap /swapfile >/dev/null && swapon /swapfile && echo "/swapfile none swap sw 0 0" >> /etc/fstab'; fi

paso "2. SSH (solo si la clave ya entra: estamos dentro con ella)"
if [ -s /root/.ssh/authorized_keys ]; then
  if ! cmp -s $C/etc/ssh/sshd_config.d/00-bellakaventuras.conf /etc/ssh/sshd_config.d/00-bellakaventuras.conf; then
    hacer "SSH solo con clave" bash -c "install -m 644 $C/etc/ssh/sshd_config.d/00-bellakaventuras.conf /etc/ssh/sshd_config.d/ && sshd -t && systemctl reload ssh"; fi
else echo "   AVISO: no hay authorized_keys; no se toca SSH"; fi

paso "3. Cortafuegos (ufw)"
for r in 22/tcp 80/tcp 443/tcp 443/udp; do ufw status | grep -q "^$r .*ALLOW" || hacer "ufw permitir $r" ufw allow $r >/dev/null; done
ufw status | grep -q "Status: active" || hacer "ufw activar" bash -c 'ufw default deny incoming >/dev/null && ufw --force enable >/dev/null'

paso "4. Red y kernel (sysctl)"
poner $C/etc/sysctl.d/90-bellakaventuras.conf /etc/sysctl.d/90-bellakaventuras.conf 644
awk -v d=$M/u '/^=== /{f=d $2; system("mkdir -p $(dirname " f ")"); next} {print > f}' $M/p0/unidades.txt
for f in $(cd $M/u && find . -type f | sed 's|^\./|/|'); do poner $M/u$f $f 644; done
[ "$MODO" = montar ] && sysctl -q --system

paso "5. Caddy (repositorio oficial 2.11.7 + binario parcheado)"
if ! dpkg -s caddy >/dev/null 2>&1; then
  hacer "instalar Caddy 2.11.7 del repositorio oficial" bash -c '
    curl -1sLf https://dl.cloudsmith.io/public/caddy/stable/gpg.key | gpg --dearmor --yes -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
    curl -1sLf https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt > /etc/apt/sources.list.d/caddy-stable.list
    chmod o+r /usr/share/keyrings/caddy-stable-archive-keyring.gpg /etc/apt/sources.list.d/caddy-stable.list
    apt-get update -qq && DEBIAN_FRONTEND=noninteractive apt-get install -y -qq caddy=2.11.7 >/dev/null && apt-mark hold caddy >/dev/null
    systemctl stop caddy'
fi
[ -e /usr/bin/caddy.default ] || hacer "apartar el Caddy del paquete" dpkg-divert --divert /usr/bin/caddy.default --rename /usr/bin/caddy
poner $C/usr/bin/caddy.custom /usr/bin/caddy.custom 755
if [ "$(readlink -f /usr/bin/caddy 2>/dev/null)" != /usr/bin/caddy.custom ]; then
  hacer "usar el Caddy parcheado" bash -c 'update-alternatives --install /usr/bin/caddy caddy /usr/bin/caddy.default 10 >/dev/null
    update-alternatives --install /usr/bin/caddy caddy /usr/bin/caddy.custom 50 >/dev/null'; fi

paso "6. Certificados y configuración de Caddy"
if [ ! -d /var/lib/caddy/.local/share/caddy/certificates ]; then
  hacer "restaurar certificados" bash -c "mkdir -p /var/lib/caddy/.local/share && cp -a $C/var/lib/caddy/.local/share/caddy /var/lib/caddy/.local/share/ && chown -R caddy:caddy /var/lib/caddy/.local"; fi
poner $M/Caddyfile /etc/caddy/Caddyfile 644
if [ -f $C/etc/caddy/acceso-pruebas.caddy ]; then poner $C/etc/caddy/acceso-pruebas.caddy /etc/caddy/acceso-pruebas.caddy 644
else echo "   (la copia no tiene contraseña de pruebas: la web queda abierta)"; fi
poner $M/p0/privacidad.html /srv/bellaka/paginas/privacidad.html 644

paso "7. Scripts, avisos y tabla propia"
poner $M/bk-version /usr/local/bin/bk-version 755
poner $M/p0/bk-vigilante /usr/local/bin/bk-vigilante 755
poner $M/p0/bk-guardian /usr/local/bin/bk-guardian 755
poner $M/p0/bk.nft /etc/bk/bk.nft 644
[ -f /etc/bk/avisos.conf ] || hacer "avisos (mismo tema de ntfy que antes)" install -D -m 600 $C/etc/bk/avisos.conf /etc/bk/avisos.conf
[ -d /srv/bellaka/releases ] || hacer "carpeta de versiones" mkdir -p /srv/bellaka/releases

paso "8. Arranque"
if [ "$MODO" = montar ]; then
  systemctl daemon-reload; systemctl restart systemd-journald
  for u in caddy bk-nft.service bk-vigilante.timer bk-guardian.timer; do systemctl enable --now $u >/dev/null 2>&1; done
  if sudo -u caddy caddy validate --config /etc/caddy/Caddyfile >/dev/null 2>&1; then systemctl restart caddy; else echo "   FALLA: Caddyfile no válido"; exit 3; fi
  sleep 3; echo "   salud: $(curl -s -m 5 --resolve bellakaventuras.com:443:127.0.0.1 https://bellakaventuras.com/salud)"
  systemctl --failed --no-legend
else
  for u in caddy bk-nft.service bk-vigilante.timer bk-guardian.timer; do
    [ "$(systemctl is-enabled $u 2>/dev/null)" = enabled ] || echo "   CAMBIARÍA: activar $u"; done
fi
rm -rf $M
echo "== Cambios: $cambios $( [ "$MODO" = comprobar ] && echo '(solo comprobado, nada tocado)')"
REMOTO

if [ "$MODO" = montar ]; then
  echo "== Publicando la web en el servidor nuevo"
  BK_HOST="$H" BK_IP="$IP" "$DIR/herramientas/publicar.sh" "$DIR/../implementacion/$(cat "$DIR/../implementacion/PUBLICADA.txt" 2>/dev/null || echo site)" reconstruida
  echo "Listo. Falta: registros A @ y www → $IP en IONOS, añadir $IP a «permitidos» si se quiere, y p0_comprobar.sh"
fi
