#!/usr/bin/env python3
"""Comprueba desde fuera que el sitio publicado coincide con la build local (Bellakaventuras, oct 2026).

    python3 -I herramientas/verificar_sitio.py <carpeta-build> [URL] [informe.json]

Para cada archivo de la build: 200, SHA-256 idéntico sin comprimir y con cada compresión ofrecida (zstd, br, gzip),
tipo MIME y Cache-Control esperados. Además: 304 al revalidar, redirecciones www/http, 404, señal /e/ y certificado.
Las peticiones llevan la cabecera X-BK-Prueba para que la analítica las descarte.
"""
import concurrent.futures as cf
import hashlib
import json
import os
import subprocess
import sys
import tempfile
import time

CURL = "/usr/bin/curl"
UA = "BK-Prueba/verificar (+bellakaventuras pruebas)"
TIPOS = {".js": "text/javascript", ".css": "text/css", ".html": "text/html", ".json": "application/json",
         ".glb": "model/gltf-binary", ".webp": "image/webp", ".png": "image/png", ".m4a": "audio/mp4",
         ".mp3": "audio/mpeg", ".svg": "image/svg+xml", ".ttf": "font/ttf", ".webmanifest": "application/manifest+json",
         ".bin": "application/octet-stream", ".txt": "text/plain",
         ".jpg": "image/jpeg", ".xml": "text/xml"}
# Contraseña de la fase de pruebas (si existe): usuario:contraseña en ../.acceso-pruebas
_F = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", ".acceso-pruebas")
ACCESO = open(_F).read().strip() if os.path.exists(_F) else ""
COMPRIMIBLES = (".js", ".css", ".html", ".json", ".glb", ".bin", ".svg", ".ttf", ".txt", ".webmanifest")
DECOD = {"zstd": ["zstd", "-dqc"], "br": ["brotli", "-dc"], "gzip": ["gzip", "-dc"]}


def sha(b):
    return hashlib.sha256(b).hexdigest()


def pedir(url, enc=None, extra=()):
    with tempfile.NamedTemporaryFile() as cuerpo, tempfile.NamedTemporaryFile() as cab:
        cmd = [CURL, "-sS", "-m", "60", "-A", UA, "-H", "X-BK-Prueba: verificar", "-o", cuerpo.name, "-D", cab.name,
               "-w", "%{http_code} %{time_total}"]
        if ACCESO:
            cmd += ["-u", ACCESO]
        if enc:
            cmd += ["-H", f"Accept-Encoding: {enc}"]
        for h in extra:
            cmd += ["-H", h]
        r = subprocess.run(cmd + [url], capture_output=True, text=True)
        codigo, t = (r.stdout.split() + ["0", "0"])[:2]
        heads = {}
        for linea in open(cab.name, encoding="latin-1").read().splitlines():
            if ":" in linea:
                k, v = linea.split(":", 1)
                heads[k.strip().lower()] = v.strip()
        return int(codigo), heads, open(cuerpo.name, "rb").read(), float(t)


def decodificar(datos, enc):
    return subprocess.run(DECOD[enc], input=datos, capture_output=True).stdout


def cache_esperada(ruta):
    if ruta.startswith("build/"):
        return "public, max-age=31536000, immutable"
    if ruta == "game-config.json":
        return "no-store"
    return "public, max-age=0, must-revalidate"


def comprobar(base, url, ruta):
    fallos = []
    local = open(os.path.join(base, ruta), "rb").read()
    codigo, h, cuerpo, t = pedir(f"{url}/{ruta}", enc="identity")
    if codigo != 200:
        return {"ruta": ruta, "fallos": [f"HTTP {codigo}"]}
    if sha(cuerpo) != sha(local):
        fallos.append("SHA distinto sin comprimir")
    ext = os.path.splitext(ruta)[1]
    tipo = h.get("content-type", "")
    if ext in TIPOS and not tipo.startswith(TIPOS[ext]):
        fallos.append(f"tipo {tipo!r}, esperado {TIPOS[ext]}")
    if h.get("cache-control") != cache_esperada(ruta):
        fallos.append(f"cache-control {h.get('cache-control')!r}")
    comprimidas = {}
    if ext in COMPRIMIBLES:
        for enc in ("zstd", "br", "gzip"):
            c2, h2, b2, _ = pedir(f"{url}/{ruta}", enc=enc)
            ce = h2.get("content-encoding", "")
            if c2 != 200:
                fallos.append(f"{enc}: HTTP {c2}")
            elif ce not in ("", enc):
                fallos.append(f"{enc}: content-encoding {ce!r}")
            elif sha(decodificar(b2, enc) if ce else b2) != sha(local):
                fallos.append(f"{enc}: SHA distinto al descomprimir")
            elif ce:
                comprimidas[enc] = len(b2)
    return {"ruta": ruta, "bytes": len(local), "comprimidas": comprimidas, "fallos": fallos,
            "etag": h.get("etag"), "t": t}


def main():
    base = sys.argv[1]
    url = (sys.argv[2] if len(sys.argv) > 2 else "https://www.bellakaventuras.com").rstrip("/")
    salida = sys.argv[3] if len(sys.argv) > 3 else None
    rutas = sorted(os.path.relpath(os.path.join(d, f), base) for d, _, fs in os.walk(base) for f in fs
                   if not f.endswith((".zst", ".br", ".gz")) and f not in ("_headers", ".DS_Store"))
    t0 = time.time()
    with cf.ThreadPoolExecutor(8) as ex:
        res = list(ex.map(lambda r: comprobar(base, url, r), rutas))
    malos = [r for r in res if r["fallos"]]

    extra = []
    def caso(nombre, ok, detalle):
        extra.append({"caso": nombre, "ok": ok, "detalle": detalle})
    muestra = next(r for r in res if r["ruta"].endswith(".glb") and r.get("etag"))
    c, _, _, _ = pedir(f"{url}/{muestra['ruta']}", enc="identity", extra=[f"If-None-Match: {muestra['etag']}"])
    caso("revalidación 304", c == 304, f"{muestra['ruta']} → {c}")
    host = url.split("//", 1)[1]
    # Desde el 24 oct (opción A de Bunny) la dirección principal es www y la raíz redirige a www (302 por ahora)
    raiz = host[4:] if host.startswith("www.") else host
    c, h, _, _ = pedir(f"https://{raiz}/assets/x?y=1")
    caso("raíz → www", c in (301, 302, 308) and h.get("location") == f"https://www.{raiz}/assets/x?y=1", f"{c} {h.get('location')}")
    c, h, _, _ = pedir(f"http://{host}/")
    caso("http → https", c in (301, 308) and h.get("location", "").startswith("https://"), f"{c} {h.get('location')}")
    c, _, _, _ = pedir(f"{url}/no-existe-{int(time.time())}.js")
    caso("404 si no existe", c == 404, str(c))
    c, h, _, _ = pedir(f"{url}/e/prueba")
    caso("señal /e/ → 204", c == 204 and h.get("cache-control") == "no-store", f"{c} {h.get('cache-control')}")
    c, h, _, _ = pedir(f"{url}/")
    caso("cabeceras de seguridad", h.get("x-content-type-options") == "nosniff" and "server" not in h,
         f"nosniff={h.get('x-content-type-options')} server={h.get('server')} alt-svc={h.get('alt-svc')}")
    cert = subprocess.run(f"echo | openssl s_client -connect {host}:443 -servername {host} 2>/dev/null | "
                          "openssl x509 -noout -issuer -enddate -ext subjectAltName", shell=True,
                          capture_output=True, text=True).stdout.strip().replace("\n", " | ")
    caso("certificado", "Let's Encrypt" in cert, cert)

    total = sum(r.get("bytes", 0) for r in res)
    mejor = sum(min([r.get("bytes", 0)] + list(r.get("comprimidas", {}).values())) for r in res)
    resumen = {"url": url, "archivos": len(res), "fallidos": len(malos), "bytes": total,
               "bytes_mejor_compresion": mejor, "segundos": round(time.time() - t0, 1), "casos": extra,
               "malos": malos}
    print(f"{len(res)} archivos, {len(malos)} con fallos; {total/1e6:.1f} MB → {mejor/1e6:.1f} MB con la mejor compresión")
    for m in malos[:20]:
        print("  FALLO", m["ruta"], "; ".join(m["fallos"]))
    for e in extra:
        print(("  OK   " if e["ok"] else "  FALLO"), e["caso"], "—", e["detalle"])
    if salida:
        json.dump({"resumen": resumen, "archivos": res}, open(salida, "w"), indent=1, ensure_ascii=False)
    sys.exit(1 if malos or not all(e["ok"] for e in extra) else 0)


if __name__ == "__main__":
    main()
