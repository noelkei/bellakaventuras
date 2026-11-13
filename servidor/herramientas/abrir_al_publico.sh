#!/bin/bash
# Abrir la web al público (quitar la contraseña de pruebas) o volver a cerrarla. SOLO cuando el usuario lo diga.
#   herramientas/abrir_al_publico.sh --seco     → comprueba que todo está listo; no cambia nada
#   herramientas/abrir_al_publico.sh            → copia, quita la contraseña, valida, recarga y pasa P0 --abierta
#   herramientas/abrir_al_publico.sh --cerrar   → vuelve a poner la contraseña guardada (emergencia)
# La contraseña quitada se guarda en el servidor en /etc/bk/acceso-pruebas.caddy.guardada (solo la huella, no la clave).
set -euo pipefail
D="$(cd "$(dirname "$0")/.." && pwd)"; MODO="${1:-abrir}"
ssh -o BatchMode=yes -o ConnectTimeout=10 bellaka true || { echo "Sin acceso SSH: no se toca nada" >&2; exit 1; }
case "$MODO" in
  --seco)
    "$D/herramientas/pruebas/p0_comprobar.sh" | tail -1
    ssh -o BatchMode=yes bellaka 'test -f /etc/caddy/acceso-pruebas.caddy && echo "   contraseña puesta: se puede abrir" || echo "   la web YA está abierta"
      sudo -u caddy caddy validate --config /etc/caddy/Caddyfile >/dev/null 2>&1 && echo "   Caddyfile válido"'
    exit 0;;
  --cerrar)
    ssh -o BatchMode=yes bellaka 'set -e; install -m 644 /etc/bk/acceso-pruebas.caddy.guardada /etc/caddy/acceso-pruebas.caddy
      if sudo -u caddy caddy validate --config /etc/caddy/Caddyfile >/dev/null 2>&1; then systemctl reload caddy; echo "   cerrada con contraseña"; else echo "   NO válida: revisar" >&2; exit 3; fi'
    "$D/herramientas/pruebas/p0_comprobar.sh" | tail -1; exit 0;;
esac
echo "== Copia antes de abrir"; "$D/herramientas/respaldo_servidor.sh"
echo "== Quitando la contraseña"
ssh -o BatchMode=yes bellaka 'set -e; test -f /etc/caddy/acceso-pruebas.caddy || { echo "   ya estaba abierta"; exit 0; }
  install -m 600 /etc/caddy/acceso-pruebas.caddy /etc/bk/acceso-pruebas.caddy.guardada
  mv /etc/caddy/acceso-pruebas.caddy /root/acceso-pruebas.caddy.quitada-$(date +%Y%m%d-%H%M)
  if sudo -u caddy caddy validate --config /etc/caddy/Caddyfile >/dev/null 2>&1; then systemctl reload caddy; echo "   abierta"
  else install -m 644 /etc/bk/acceso-pruebas.caddy.guardada /etc/caddy/acceso-pruebas.caddy; echo "   Caddyfile no válido: sigue cerrada" >&2; exit 3; fi'
sleep 2
echo "== Batería P0 en modo abierto"; "$D/herramientas/pruebas/p0_comprobar.sh" --abierta | tee "$D/informes/p0-apertura-$(date +%Y%m%d-%H%M).txt" | grep -E "FALLA|Total"
echo "== Copia ya abierta (para que una reconstrucción no vuelva a poner la contraseña)"; "$D/herramientas/respaldo_servidor.sh"
echo "Hecho. Vigilar: herramientas/analitica/analitica.sh --horas · ssh bellaka journalctl -t bk-vigilante -n 20"
