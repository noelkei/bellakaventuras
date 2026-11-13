#!/usr/bin/env bash
# Publica una build del juego en el VPS de IONOS como versión nueva (Bellakaventuras, oct 2026).
#
#   herramientas/publicar.sh <carpeta-build> <etiqueta>
#   p. ej.: herramientas/publicar.sh "../implementacion/site" r3
#
# 1. Copia la build a una carpeta temporal (sin _headers ni .DS_Store).
# 2. Precomprime (zstd, brotli, gzip) los archivos que ganan al comprimir.
# 3. La sube a /srv/bellaka/releases/<fecha>_<etiqueta>, reutilizando lo que no cambia.
# 4. Comprueba en el servidor la huella SHA-256 de todos los archivos.
# 5. Conserva los build/*.js de la versión anterior (quien cargó el HTML viejo no se queda a medias).
# 6. Cambia la versión servida de golpe y prueba la página.
# Volver atrás: ssh bellaka bk-version volver
set -euo pipefail

ORIGEN="${1:?Uso: publicar.sh <carpeta-build> <etiqueta>}"
ETIQUETA="${2:?Falta la etiqueta (p. ej. r3)}"
HOST="${BK_HOST:-bellaka}"
URL="${BK_URL:-https://www.bellakaventuras.com}"   # dirección principal desde el 24 oct (opción A de Bunny)
DIR="$(cd "$(dirname "$0")" && pwd)"

[ -f "$ORIGEN/index.html" ] || { echo "No hay index.html en $ORIGEN" >&2; exit 1; }
case "$ETIQUETA" in *[!a-zA-Z0-9._-]*) echo "Etiqueta solo con letras, números, . _ -" >&2; exit 1;; esac
for b in zstd brotli gzip shasum rsync; do command -v "$b" >/dev/null || { echo "Falta $b" >&2; exit 1; }; done

ID="$(date +%Y%m%d-%H%M%S)_$ETIQUETA"
TMP="$(mktemp -d -t bk-publicar)"
STAGE="$TMP/$ID"
trap 'rm -rf "$TMP"' EXIT

echo "== Preparando $ID desde $ORIGEN"
rsync -a --exclude _headers --exclude .DS_Store "$ORIGEN"/ "$STAGE"/

# Ganchos opcionales sobre la copia (p. ej. analítica): cada script recibe la carpeta preparada.
if [ -d "$DIR/ganchos" ]; then
  for g in "$DIR"/ganchos/*; do [ -x "$g" ] && { echo "== Gancho $(basename "$g")"; "$g" "$STAGE"; }; done
fi

echo "== Precomprimiendo"
find "$STAGE" -type f \( -name '*.js' -o -name '*.css' -o -name '*.html' -o -name '*.json' -o -name '*.glb' \
  -o -name '*.bin' -o -name '*.svg' -o -name '*.ttf' -o -name '*.txt' -o -name '*.webmanifest' \) -size +1k -print0 |
  xargs -0 -n 1 -P 8 sh -c '
    f="$1"; s=$(wc -c < "$f")
    zstd -19 -q -f -o "$f.zst" "$f"; brotli -q 11 -f -o "$f.br" "$f"; gzip -9 -n -c "$f" > "$f.gz"
    for c in "$f.zst" "$f.br" "$f.gz"; do
      [ $(( $(wc -c < "$c") * 100 )) -lt $(( s * 90 )) ] && touch -r "$f" "$c" || rm -f "$c"
    done' _
echo "   $(find "$STAGE" -type f ! -name '*.zst' ! -name '*.br' ! -name '*.gz' | wc -l | tr -d ' ') archivos, $(find "$STAGE" -name '*.zst' | wc -l | tr -d ' ') con versión comprimida"

# Para /salud-version (lo usan la prueba de humo y la vigilancia): el id de esta versión.
printf '%s\n' "$ID" > "$STAGE/salud.txt"

(cd "$STAGE" && find . -type f | LC_ALL=C sort | xargs shasum -a 256) > "$TMP/$ID.sha256"

echo "== Subiendo"
ssh "$HOST" "mkdir -p /srv/bellaka/releases && test -x /usr/local/bin/bk-version"
LINK=""; ssh "$HOST" "test -d /srv/bellaka/current/" && LINK="--link-dest=/srv/bellaka/current/"
rsync -a --chmod=Du=rwx,Dgo=rx,Fu=rw,Fgo=r $LINK "$STAGE"/ "$HOST:/srv/bellaka/releases/$ID/"
rsync -a "$TMP/$ID.sha256" "$HOST:/srv/bellaka/releases/$ID.sha256"

echo "== Comprobando en el servidor"
ssh "$HOST" "cd /srv/bellaka/releases/$ID && sha256sum --quiet -c ../$ID.sha256 && echo '   huellas OK' &&
  if [ -d /srv/bellaka/current/build ]; then rsync -a --ignore-existing /srv/bellaka/current/build/ build/; fi &&
  mv ../$ID.sha256 ../.$ID.sha256 && bk-version activar $ID"

echo "== Prueba de humo en $URL"
# Si la web no sirve exactamente esta versión, se vuelve sola a la anterior (R8 §3.7).
AUTH=(); [ -f "$DIR/../.acceso-pruebas" ] && AUTH=(-u "$(cat "$DIR/../.acceso-pruebas")")
P=(-A "BK-Prueba/publicar" -H "X-BK-Prueba: publicar")
# BK_IP: probar un servidor nuevo antes de cambiar el DNS (lo usa montar_servidor.sh).
# La prueba de humo va SIEMPRE al servidor (no a la CDN, que podría tener la versión anterior guardada): IP del VPS o BK_IP
P+=(--resolve "${URL#https://}:443:${BK_IP:-203.0.113.10}")
esperada="$(grep -oE 'build/index-[A-Za-z0-9_-]+\.js' "$STAGE/index.html" | head -1)"
sha() { shasum -a 256 | cut -c1-64; }
humo() {  # 0 si la portada, /salud-version, la entrada JS y los 3 JS más grandes son los de esta versión
  local html entrada f
  [ -n "${BK_PRUEBA_HUMO_FALLA:-}" ] && { echo "   humo: fallo forzado (BK_PRUEBA_HUMO_FALLA, solo para probar la vuelta atrás)" >&2; return 1; }
  html="$(curl -fsS -m 20 "${AUTH[@]}" "${P[@]}" "$URL/")" || { echo "   humo: la portada no responde" >&2; return 1; }
  entrada="$(printf '%s' "$html" | grep -oE 'build/index-[A-Za-z0-9_-]+\.js' | head -1)"
  [ -n "$esperada" ] && [ "$entrada" = "$esperada" ] || { echo "   humo: la portada pide '${entrada:-nada}', se esperaba '$esperada'" >&2; return 1; }
  [ "$(curl -fsS -m 10 "${P[@]}" "$URL/salud-version")" = "$ID" ] || { echo "   humo: /salud-version no es $ID" >&2; return 1; }
  for f in "$entrada" $(cd "$STAGE" && ls -S build/*.js | head -3); do
    [ "$(curl -fsS -m 60 "${AUTH[@]}" "${P[@]}" -H 'Accept-Encoding: identity' "$URL/$f" | sha)" = "$(sha < "$STAGE/$f")" ] ||
      { echo "   humo: $f no coincide" >&2; return 1; }
  done
}
sleep 1
if humo; then
  echo "   OK: $URL sirve $ID ($esperada)"
else
  echo "   FALLA la prueba de humo: vuelvo a la versión anterior" >&2
  ssh "$HOST" bk-version volver >&2
  [ -z "${BK_IP:-}" ] && [ -x "$DIR/bunny/bunny.sh" ] && "$DIR/bunny/bunny.sh" purgar >&2
  exit 2
fi
echo "Publicada $ID"
# Bunny (CDN): vaciar su caché para que sirva ya la versión nueva. Si falla, solo avisa (la web sigue bien en el servidor)
[ -z "${BK_IP:-}" ] && [ -x "$DIR/bunny/bunny.sh" ] && { "$DIR/bunny/bunny.sh" purgar || true; }
