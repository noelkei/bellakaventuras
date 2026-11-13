#!/usr/bin/env python3
# Prueba de bk-record en el Mac (sin servidor): registro de Caddy falso, estado y avisos en una carpeta temporal.
# Usuario (25 oct): el juego enseña SIEMPRE el top 3, sin nombres; aviso al móvil cada vez que cambia el top 3 (1.º, 2.º o 3.º).
# Uso: python3 -I prueba_bk_record.py   → «VERDE» o la lista de fallos (código de salida 1)
import gzip, json, os, shutil, subprocess, sys, tempfile, time

AQUI = os.path.dirname(os.path.abspath(__file__)); BK = os.path.join(AQUI, "bk-record")
T = tempfile.mkdtemp(prefix="bk-record-"); LOG = os.path.join(T, "bellaka-acceso.log"); EST = os.path.join(T, "est"); NT = os.path.join(T, "ntfy.txt")
ENV = {**os.environ, "BK_LOG": LOG, "BK_EST": EST, "BK_NTFY_ARCHIVO": NT}
fallos = []
UA_IP = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Instagram 350.0"
UA_AN = "Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 Chrome/124.0 Mobile Safari/537.36"
UA_HL = "Mozilla/5.0 HeadlessChrome/124.0"
_ts = [time.time()]


def linea(uri, ua=UA_AN, status=204, ts=None, h=None):
    _ts[0] += 1   # cada tiempo, un instante distinto (como en la realidad)
    hd = {"User-Agent": [ua], **(h or {})}
    return json.dumps({"ts": ts or _ts[0], "status": status, "request": {"uri": uri, "method": "POST", "headers": hd, "client_ip": "1.2.3.4"}}) + "\n"


def escribir(*ls, modo="a"):
    with open(LOG, modo) as f: f.write("".join(ls))


def correr(*a, codigo=0):
    r = subprocess.run([sys.executable, "-I", BK, *a], env=ENV, capture_output=True, text=True)
    if r.returncode != codigo: fallos.append(f"bk-record {a} salió con {r.returncode}: {r.stderr[-300:]}")
    return r.stdout


def rec(): return json.load(open(os.path.join(EST, "record.json")))
def top(): return [x["ds"] for x in rec()["top"]]
def avisos():
    try: return [json.loads(l) for l in open(NT)]
    except FileNotFoundError: return []
def nuevos_avisos(n0): return avisos()[n0:]


def ok(cond, que, dato=None):
    print(("OK    " if cond else "FALLO ") + que + (f"  {dato}" if dato is not None and not cond else ""))
    if not cond: fallos.append(que)


try:
    # 1 · lo de antes de instalar no cuenta
    escribir(linea("/e/crono?ds=100", ts=time.time() - 3600), modo="w")
    correr(); ok(rec() == {"n": 3, "top": [], "ds": None} and not avisos(), "1 · primera pasada: lo anterior no cuenta; top 3 vacío", (rec(), avisos()))
    ok(oct(os.stat(os.path.join(EST, "record.json")).st_mode & 0o777) == "0o644", "1 · record.json legible por Caddy (644)")
    # 2 · válidos, pruebas y basura → récord con aviso
    escribir(linea("/e/crono?ds=10", UA_HL), linea("/e/crono?ds=20", h={"X-Bk-Prueba": ["1"]}), linea("/e/crono?ds=0"), linea("/e/crono?ds=999999"),
             linea("/e/crono?ds=abc"), linea("/e/cronox?ds=30"), linea("/e/crono?ds=40", status=400), "no es json\n", linea("/e/crono?ds=5500", UA_AN))
    correr(); a = avisos()
    ok(top() == [5500], "2 · solo cuenta el válido (9:10.0); se descartan pruebas, 0, >24 h, texto, otra ruta, errores y basura", top())
    ok(len(a) == 1 and a[0]["titulo"] == "🏆 Nuevo récord: 9:10.0" and "Android" in a[0]["texto"] and "Top 3: 1. 9:10.0" in a[0]["texto"] and "record.sh quitar 9:10.0" in a[0]["texto"],
       "2 · aviso «🏆 Nuevo récord» con aparato, top 3 y cómo quitarlo", a)
    # 3 · sin novedades: ni cambia ni avisa
    n0 = len(avisos()); correr(); ok(not nuevos_avisos(n0), "3 · pasada sin novedades: no avisa")
    # 4 · entra 2.º y 3.º → avisos con su puesto
    n0 = len(avisos()); escribir(linea("/e/crono?ds=5800", UA_IP)); correr(); a = nuevos_avisos(n0)
    ok(top() == [5500, 5800] and len(a) == 1 and a[0]["titulo"] == "🥈 Nuevo 2.º del top: 9:40.0" and "1. 9:10.0 · 2. 9:40.0" in a[0]["texto"], "4 · entra 2.º → «🥈 Nuevo 2.º del top»", a)
    n0 = len(avisos()); escribir(linea("/e/crono?ds=6000", UA_IP)); correr(); a = nuevos_avisos(n0)
    ok(top() == [5500, 5800, 6000] and len(a) == 1 and a[0]["titulo"] == "🥉 Nuevo 3.º del top: 10:00.0", "4 · entra 3.º → «🥉 Nuevo 3.º del top»", a)
    # 5 · peor que el 3.º: no entra ni avisa (y el top sigue con 3)
    n0 = len(avisos()); escribir(linea("/e/crono?ds=7000", UA_AN)); correr()
    ok(top() == [5500, 5800, 6000] and rec()["n"] == 3 and not nuevos_avisos(n0), "5 · un 4.º no entra en el top ni avisa; siempre 3", (top(), nuevos_avisos(n0)))
    # 6 · uno nuevo entre medias: los de abajo bajan y el 3.º sale
    n0 = len(avisos()); escribir(linea("/e/crono?ds=5600", UA_IP)); correr(); a = nuevos_avisos(n0)
    ok(top() == [5500, 5600, 5800] and len(a) == 1 and a[0]["titulo"].startswith("🥈") and "1. 9:10.0 · 2. 9:20.0 · 3. 9:40.0" in a[0]["texto"], "6 · entra 2.º: el resto se reordena solo", (top(), a))
    # 7 · nuevo récord: todos bajan un puesto
    n0 = len(avisos()); escribir(linea("/e/crono?ds=5000", UA_AN)); correr(); a = nuevos_avisos(n0)
    ok(top() == [5000, 5500, 5600] and len(a) == 1 and a[0]["titulo"] == "🏆 Nuevo récord: 8:20.0", "7 · récord nuevo arriba; los demás bajan", (top(), a))
    # 8 · empate con el 1.º: entra 2.º (el primero que lo hizo sigue delante)
    n0 = len(avisos()); escribir(linea("/e/crono?ds=5000", UA_IP)); correr(); a = nuevos_avisos(n0)
    ok(top() == [5000, 5000, 5500] and len(a) == 1 and a[0]["titulo"].startswith("🥈"), "8 · empate: el que llega después queda detrás", (top(), a))
    # 9 · dos a la vez en la misma pasada: un aviso (el mejor puesto) con el top entero
    n0 = len(avisos()); escribir(linea("/e/crono?ds=4900", UA_AN), linea("/e/crono?ds=5100", UA_IP)); correr(); a = nuevos_avisos(n0)
    ok(top() == [4900, 5000, 5000] and len(a) == 1 and a[0]["titulo"] == "🏆 Nuevo récord: 8:10.0", "9 · dos en la misma pasada → un aviso con el top", (top(), a))
    # 10 · récord falso → quitar (con aviso) → pasa el siguiente; no vuelve; devolver
    escribir(linea("/e/crono?ds=1", UA_AN)); correr(); ok(top()[0] == 1, "10 · llega uno falso (0:00.1)")
    n0 = len(avisos()); out = correr("--quitar"); a = nuevos_avisos(n0)
    ok(top() == [4900, 5000, 5000] and len(a) == 1 and "quitado" in a[0]["titulo"].lower() and "1. 8:10.0" in a[0]["texto"], "10 · --quitar: vuelve el top anterior y avisa", (top(), a))
    escribir(linea("/e/crono?ds=1", UA_AN)); correr(); ok(top()[0] == 4900, "10 · el quitado no vuelve aunque se repita")
    correr("--devolver", "0:00.1"); ok(top()[0] == 1 and "devuelto" in avisos()[-1]["titulo"].lower(), "10 · --devolver lo deshace (tiempo escrito como en el juego)")
    correr("--quitar", "1"); ok(top()[0] == 4900, "10 · --quitar <décimas>")
    # 11 · ya no existe «mostrar» (siempre top 3)
    correr("--mostrar", "5", codigo=2); ok(rec()["n"] == 3, "11 · --mostrar no existe: siempre top 3")
    # 12 · rotación del registro: lo que quedó sin leer en el viejo no se pierde
    escribir(linea("/e/crono?ds=4800", UA_IP))
    with open(LOG, "rb") as f, gzip.open(os.path.join(T, "bellaka-acceso-2026-10-26T00-00-00.000.log.gz"), "wb") as g: g.write(f.read())
    os.remove(LOG); escribir(linea("/e/crono?ds=4700", UA_AN), modo="w")
    correr(); ok(top() == [4700, 4800, 4900], "12 · tras rotar el registro se leen el final del viejo (8:00.0) y el nuevo (7:50.0)", top())
    # 13 · línea a medias: se espera a que esté completa; la basura no rompe la siguiente
    l = linea("/e/crono?ds=4000", UA_AN)
    with open(LOG, "a") as f: f.write(l[:-30])
    correr(); ok(top()[0] == 4700, "13 · una línea a medias no se lee todavía")
    with open(LOG, "a") as f: f.write(l[-30:])
    correr(); ok(top()[0] == 4000, "13 · al completarse, cuenta (6:40.0)", top())
    escribir("basura sin cierre {\n", linea("/e/crono?ds=3900", UA_AN)); correr(); ok(top()[0] == 3900, "13 · la basura no rompe la siguiente (6:30.0)", top())
    # 15 · --empezar: borra todo y empieza con un único registro (lo de antes no vuelve; lo nuevo sí cuenta)
    n0 = len(avisos()); correr("--empezar", "10:00.0"); a = nuevos_avisos(n0)
    ok(top() == [6000] and len(a) == 1 and "empezado" in a[0]["titulo"].lower(), "15 · --empezar 10:00.0: top = un único 10:00.0 y aviso", (top(), a))
    correr(); ok(top() == [6000], "15 · una pasada después no recupera lo de antes")
    n0 = len(avisos()); escribir(linea("/e/crono?ds=6600", UA_IP)); correr(); a = nuevos_avisos(n0)
    ok(top() == [6000, 6600] and a and a[0]["titulo"].startswith("🥈"), "15 · uno más lento entra 2.º (el juego lo enseña 2.º y 3.º)", (top(), a))
    n0 = len(avisos()); escribir(linea("/e/crono?ds=5900", UA_AN)); correr(); a = nuevos_avisos(n0)
    ok(top() == [5900, 6000, 6600] and a and a[0]["titulo"] == "🏆 Nuevo récord: 9:50.0", "15 · bajar de 10:00.0 es récord", (top(), a))
    # 14 · --ver
    out = correr("--ver"); ok("Récord: 9:50.0" in out and "top 3" in out and "Registro inicial" in out and "3.º en el juego" in out, "14 · --ver enseña top 3, mejores y quitados", out)
finally:
    shutil.rmtree(T, ignore_errors=True)
print("VERDE" if not fallos else f"FALLOS: {len(fallos)}"); sys.exit(1 if fallos else 0)
