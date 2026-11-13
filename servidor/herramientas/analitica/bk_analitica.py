#!/usr/bin/env python3
"""Analítica propia de Bellakaventuras a partir del registro de Caddy (24 oct 2026; v2 de los avisos del juego con la V10.6). Corre en el
servidor y solo imprime totales.

    python3 bk_analitica.py [--desde AAAA-MM-DD] [--horas] [--guardar] [--historico]

v3 (24 oct 2026, con Bunny delante): resumen y embudo por sesiones (aviso «carga-portada» del juego, que siempre llega al
servidor aunque Bunny sirva el resto), tabla por día y por hora, canal de origen (?o=ig, ?o=tiktok… del enlace, o la app),
errores con nombre, tráfico y gasto de Bunny, y resúmenes diarios guardados (--guardar, sin IP) para no perder los datos cuando
el registro se borra a los 30 días (--historico los lee todos).

- Visitante = (IP recortada a /24 + navegador) por día que pide la portada Y su JS (build/index-*.js): así no cuentan los
  escáneres que solo piden «/» con un navegador falso. Nunca se imprime ni se guarda ninguna IP (R2: IP recortada).
- Partida (señal de JUGAR, opción B de R2) = un visitante que descarga algún modelo de personaje (assets/npcs/*.glb):
  la portada no los pide nunca; se piden al pulsar JUGAR (medido el 24 oct con la r3).
- Avisos del juego (/e/…, V10/IT9/B5_METRICAS.md): solo totales, sin unir los de una misma persona; partidos por dispositivo y
  app de origen (del navegador de cada aviso).
- Se descartan: peticiones de prueba (cabecera X-BK-Prueba o navegador BK-Prueba), las IP de «permitidos» de
  /etc/bk/bk.nft (casa y el propio servidor), los robots conocidos y las respuestas 401 (contraseña de la fase de pruebas).
"""
import collections, datetime, glob, gzip, hashlib, ipaddress, json, os, re, statistics, sys, urllib.parse, urllib.request

LOGS = os.environ.get("BK_LOGS", "/var/log/caddy/bellaka-acceso*.log*")   # BK_LOGS: solo para probar
PERMITIDOS = os.environ.get("BK_NFT", "/etc/bk/bk.nft")
HITOS = ["jugar", "tutorial", "secretnovio", "animacion-final", "dialogo-final"]
MINUTOS = [2, 5, 10, 20, 30, 45, 60]
ROBOTS = ("bot", "crawl", "spider", "slurp", "curl", "wget", "python", "go-http", "httpclient", "scan", "headless",
          "preview", "facebookexternalhit", "whatsapp/", "telegrambot", "discord", "h2load", "slowhttptest")
MARCA_JUGAR = "/assets/npcs/"
DIAS = os.environ.get("BK_DIAS", "/var/lib/bk-analitica/dias")   # resúmenes diarios (--guardar)
ERRORES = {"E01": "sin 3D (WebGL)", "E02": "3D perdido", "E03": "sin memoria", "E04": "descarga fallida", "E05": "física",
           "E06": "el sonido no arranca", "E07": "no se puede guardar", "E99": "otro"}


def canal(h, ua):
    """De dónde viene la sesión: la etiqueta ?o= del enlace (va en el Referer del aviso, que es la página), o la app."""
    ref = (h.get("referer") or [""])[0]
    qs = urllib.parse.parse_qs(urllib.parse.urlparse(ref).query)
    o = re.sub(r"[^a-z0-9_-]", "", (qs.get("o") or [""])[0].lower())[:20]
    if o:
        return o
    app = tipo(ua)[1]
    if "ttclid" in qs or app == "TikTok":
        return "tiktok (sin etiqueta)"
    if "fbclid" in qs or app in ("Instagram", "Facebook"):
        return (app.lower() if app != "Navegador" else "instagram/facebook") + " (sin etiqueta)"
    return "whatsapp (sin etiqueta)" if app == "WhatsApp" else "directo/otros"


def permitidos():
    try:
        t = open(PERMITIDOS).read().split("set permitidos", 1)[1].split("{", 2)[2].split("}", 1)[0]
        return {x.strip() for x in t.split(",") if x.strip()}
    except Exception:
        return {"127.0.0.1"}


def lineas():
    for f in sorted(glob.glob(LOGS)):
        abrir = gzip.open if f.endswith(".gz") else open
        with abrir(f, "rt", errors="ignore") as fh:
            yield from fh


def tipo(ua):
    u = ua.lower()
    app = ("Instagram" if "instagram" in u else "TikTok" if ("musical_ly" in u or "bytedance" in u or "tiktok" in u)
           else "Facebook" if ("fban" in u or "fbav" in u) else "WhatsApp" if "whatsapp" in u else "")
    disp = "iPhone/iPad" if ("iphone" in u or "ipad" in u) else "Android" if "android" in u else "Ordenador"
    return disp, app or "Navegador"


def main():
    desde = None
    if "--desde" in sys.argv:
        desde = datetime.date.fromisoformat(sys.argv[sys.argv.index("--desde") + 1])
    por_horas = "--horas" in sys.argv
    if "--historico" in sys.argv:
        return historico()
    ok_ips = permitidos()
    vis = collections.defaultdict(set)       # día → visitantes
    jug = collections.defaultdict(set)       # día → visitantes que juegan
    horas_v = collections.defaultdict(set); horas_j = collections.defaultdict(set)
    disp = collections.Counter(); apps = collections.Counter(); bytes_dia = collections.Counter()
    estados = collections.Counter(); descartes = collections.Counter()
    portada = collections.defaultdict(set); js = collections.defaultdict(set); hora_de = {}; ua_de = {}
    avisos = []   # (ruta, campos, dispositivo, app) de /e/… (ESPEC_AVISOS_JUEGO.md v2)
    for l in lineas():
        try:
            r = json.loads(l); q = r["request"]
        except Exception:
            continue
        h = {k.lower(): v for k, v in (q.get("headers") or {}).items()}
        ua = (h.get("user-agent") or [""])[0]
        ip = q.get("client_ip") or q.get("remote_ip") or ""
        st = int(r.get("status", 0))
        if "x-bk-prueba" in h or ua.startswith("BK-Prueba"):
            descartes["pruebas"] += 1; continue
        if ip in ok_ips:
            descartes["casa/servidor"] += 1; continue
        if st == 401:
            descartes["contraseña (401)"] += 1; continue
        if not ua or any(b in ua.lower() for b in ROBOTS):
            descartes["robots"] += 1; continue
        t = datetime.datetime.fromtimestamp(r["ts"])
        if desde and t.date() < desde:
            continue
        try:
            red = str(ipaddress.ip_network(ip + ("/24" if ":" not in ip else "/48"), strict=False).network_address)
        except ValueError:
            continue
        clave = hashlib.sha256(f"{red}|{ua}".encode()).hexdigest()[:16]
        dia = t.date().isoformat(); hora = t.strftime("%Y-%m-%d %H:00")
        uri = q.get("uri", "")
        estados[st // 100 * 100] += 1
        bytes_dia[dia] += int(r.get("size", 0))
        if uri in ("/", "/index.html") or uri.startswith("/?"):
            portada[dia].add(clave); hora_de.setdefault((dia, clave), hora); ua_de[(dia, clave)] = ua
        if uri.startswith("/build/index-") and uri.endswith(".js"):
            js[dia].add(clave)
        if uri.startswith(MARCA_JUGAR):
            jug[dia].add(clave); horas_j[hora].add(clave)
        if uri.startswith("/e/") and st < 400:
            ruta, _, qs = uri[3:].partition("?")
            q = {k: v[0] for k, v in urllib.parse.parse_qs(qs).items()}
            d_, a_ = tipo(ua)
            avisos.append((ruta, q, d_, a_, dia, hora, canal(h, ua)))

    for dia in portada:
        vis[dia] = portada[dia] & js[dia]
        for c in vis[dia]:
            horas_v[hora_de[(dia, c)]].add(c); d, a = tipo(ua_de[(dia, c)]); disp[d] += 1; apps[a] += 1
    print("Analítica de Bellakaventuras (sin IP). Desde que Bunny sirve el juego (24 oct 15:48), «Visitantes» solo cuenta lo que llega")
    print("directo al servidor: las cifras buenas son las de «Sesiones» (más abajo), que salen de los avisos del propio juego.")
    print("Visitantes directos al servidor (red /24 + navegador, por día)")
    print(f"{'Día':<12}{'Visitantes':>11}{'Juegan':>8}{'%':>6}{'Servido':>10}")
    for dia in sorted(set(vis) | set(jug)):
        v, j = len(vis[dia]), len(jug[dia])
        print(f"{dia:<12}{v:>11}{j:>8}{(100 * j / v if v else 0):>5.0f}%{bytes_dia[dia] / 1e9:>8.2f} GB")
    if por_horas:
        print("\nPor horas:")
        for hora in sorted(set(horas_v) | set(horas_j)):
            print(f"  {hora}  visitantes {len(horas_v[hora]):>4}  juegan {len(horas_j[hora]):>4}")
    tot = sum(disp.values()) or 1
    print("\nDispositivo: " + ", ".join(f"{k} {100 * v / tot:.0f} %" for k, v in disp.most_common()))
    print("Desde: " + ", ".join(f"{k} {100 * v / tot:.0f} %" for k, v in apps.most_common()))
    print("Respuestas: " + ", ".join(f"{k // 100}xx {v}" for k, v in sorted(estados.items())))
    print("Descartadas: " + ", ".join(f"{k} {v}" for k, v in descartes.most_common()))
    if avisos:
        resumen_sesiones(avisos, por_horas)
        tiempos(avisos)
        dentro_del_juego([(r, q) for r, q, *_ in avisos])
        dentro_del_juego_v2(avisos, sum(len(portada[d]) for d in portada))
    bunny()
    if "--guardar" in sys.argv:
        guardar(avisos, bytes_dia)


def num(q, k):
    try:
        return int(q.get(k, ""))
    except ValueError:
        return None


def med(xs):
    xs = [x for x in xs if x is not None]
    if not xs:
        return "—"
    m = round(statistics.median(xs)); return f"{m // 60}:{m % 60:02d}"   # min:seg


def dentro_del_juego(avisos):
    """Totales de los avisos del juego (sin unir los de una misma persona), por partida nueva (n) y continuada (c)."""
    print("\nDentro del juego (avisos /e/; nueva = partida nueva, sigue = partida guardada)")
    for p, nombre in (("n", "nueva"), ("c", "sigue")):
        av = [(r, q) for r, q in avisos if q.get("p", "n") == p]
        if not av:
            continue
        print(f"  Partidas {nombre}:")
        base = sum(1 for r, _ in av if r == "jugar") or 1
        for h in HITOS:
            ts = [num(q, "t") for r, q in av if r == h]
            extra = ""
            if h == "tutorial":
                m = collections.Counter(q.get("modo", "?") for r, q in av if r == h)
                extra = "  (" + ", ".join(f"{k} {v}" for k, v in m.most_common()) + ")"
            print(f"    {h:<16}{len(ts):>6}  {100 * len(ts) / base:>4.0f} %   a los {med(ts)} (mediana, min:seg){extra}")
        for m in MINUTOS:
            c = sum(1 for r, _ in av if r == f"min-{m}")
            print(f"    juegan {m:>2}+ min  {c:>6}  {100 * c / base:>4.0f} %")
        pat = [(r[len("patata-"):], q) for r, q in av if r.startswith("patata-")]
        if pat:
            print("    Patatas (min:seg, medianas): llegan a la n.ª · lo dejan ahí · desde la anterior · desde JUGAR")
            cuenta = {n: [q for _, q in pat if num(q, "n") == n] for n in range(1, 22)}
            for n in range(1, 21):
                g = cuenta[n]
                if g:
                    print(f"      {n:>2}.ª  {len(g):>6}  {len(g) - len(cuenta[n + 1]):>6}   +{med([num(q, 'd') for q in g]):>6}   {med([num(q, 't') for q in g]):>6}")
            zonas = collections.Counter((z, q.get("tipo", "?")) for z, q in pat)
            print("    Por zona y tipo: " + ", ".join(f"{z}/{t} {c}" for (z, t), c in sorted(zonas.items())))



def numf(q, k):
    try:
        return float(q.get(k, ""))
    except ValueError:
        return None


def tramos(xs, cortes, unidad="s"):
    xs = [x for x in xs if x is not None]
    if not xs:
        return "—"
    out, prev = [], None
    for c in cortes + [None]:
        n = sum(1 for x in xs if (prev is None or x >= prev) and (c is None or x < c))
        nombre = f"<{c}{unidad}" if prev is None else f"≥{prev}{unidad}" if c is None else f"{prev}–{c}{unidad}"
        out.append(f"{nombre} {100 * n / len(xs):.0f} %"); prev = c
    return ", ".join(out)


def cuenta(xs):
    c = collections.Counter(xs)
    return ", ".join(f"{k} {v}" for k, v in c.most_common()) or "—"


def dentro_del_juego_v2(avisos, portadas):
    """Avisos v2 (V10.6): carga, zonas, actividades, errores, experiencia y todo por dispositivo y app. Solo totales."""
    def de(nombre, f=lambda q: True):
        return [(q, d, a) for r, q, d, a, *_ in avisos if r == nombre and f(q)]
    print("\nAvisos v2 (V10.6): carga, zonas, actividades, errores, experiencia")
    # carga
    cp, cl, cs = de("carga-portada"), de("carga-lista"), de("carga-sale")
    print(f"  Carga: portada a la vista en {med2([numf(q, 's') for q, _, _ in cp])} s (mediana; {tramos([numf(q, 's') for q, _, _ in cp], [1, 3, 10])})")
    print(f"         JUGAR listo en {med2([numf(q, 's') for q, _, _ in cl])} s (mediana; {tramos([numf(q, 's') for q, _, _ in cl], [10, 30, 60])})")
    print(f"         abandono en la carga: {cuenta(q.get('pct', '?') + ' %' for q, _, _ in cs)} (avisos «se va antes de acabar»); "
          f"portadas pedidas {portadas} · cargas terminadas {len(cl)}")
    # zonas
    zs = [(r[5:], q) for r, q, *_ in avisos if r.startswith("zona-")]
    if zs:
        print("  Zonas descubiertas (veces · min:seg mediana desde JUGAR · orden más habitual):")
        for z in sorted({z for z, _ in zs}):
            g = [q for zz, q in zs if zz == z]
            orden = collections.Counter(q.get("orden", "?") for q in g).most_common(1)[0][0]
            print(f"    {z:<16}{len(g):>6}   {med([num(q, 't') for q in g]):>6}   {orden}.ª")
    # actividades
    acts = sorted({q.get("a") for r, q, *_ in avisos if r.startswith("act-") and q.get("a")})
    if acts:
        print("  Actividades: empiezan · completan (%) · min:seg hasta completar · intentos (mediana) · fallos por intento")
        for a in acts:
            e = de("act-empieza", lambda q: q.get("a") == a); c = de("act-completa", lambda q: q.get("a") == a); f = de("act-falla", lambda q: q.get("a") == a)
            pct = f"{100 * len(c) / len(e):.0f} %" if e else "—"
            ints = [num(q, "intentos") for q, _, _ in c]
            fall = collections.Counter(num(q, "intento") for q, _, _ in f)
            print(f"    {a:<14}{len(e):>6}{len(c):>6} ({pct:>5})   {med([num(q, 'dur') for q, _, _ in c]):>6}   {statistics.median([x for x in ints if x]) if [x for x in ints if x] else '—'}"
                  f"   {', '.join(f'{k}.º {v}' for k, v in sorted(fall.items()) if k) or '—'}")
    # errores
    er = de("error")
    if er:
        print("  Errores (código × fase): " + cuenta(f"{q.get('c')} {ERRORES.get(q.get('c'), '')}/{q.get('fase')}" + (f"/{q['m']}" if q.get("m") else "") for q, _, _ in er))
        print("           por dispositivo: " + cuenta(f"{q.get('c')} {d}" for q, d, _ in er))
    # experiencia
    print("  Control: " + cuenta(q.get("c") for q, _, _ in de("control")))
    print("  Orientación al empezar: " + cuenta(q.get("o") for q, _, _ in de("orientacion")) + " · la cambian: " + cuenta(q.get("o") for q, _, _ in de("orientacion-cambia")))
    print("  Sonido al empezar: " + cuenta(q.get("s") for q, _, _ in de("sonido")) + " · lo cambian a: " + cuenta(q.get("s") for q, _, _ in de("sonido-cambia")))
    print("  Modo eficiente: " + cuenta(q.get("modo") for q, _, _ in de("eficiente")))
    fp = de("fps")
    print(f"  Fluidez al minuto: {cuenta(q.get('tramo') for q, _, _ in fp)} · mediana {statistics.median([num(q, 'f') for q, _, _ in fp if num(q, 'f')]) if fp else '—'} FPS")
    print("  Modo ayuda (primera pista): " + cuenta(q.get("tipo") for q, _, _ in de("ayuda")) + " · SALTAR: " + cuenta(q.get("que") for q, _, _ in de("saltar")))
    jg = de("jugar")
    print("  Red al pulsar JUGAR: " + cuenta(q.get("red", "?") for q, _, _ in jg) + " · calidad: " + cuenta(q.get("calidad", "?") for q, _, _ in jg) + "  (? = el navegador no lo dice)")
    # por dispositivo y app de origen
    filas = [("pulsan JUGAR", lambda r, q: r == "jugar"), ("terminan el tutorial", lambda r, q: r == "tutorial"),
             ("5+ patatas", lambda r, q: r.startswith("patata-") and (num(q, "n") or 0) == 5), ("20 patatas", lambda r, q: r.startswith("patata-") and num(q, "n") == 20),
             ("superan SECRETNOVIO", lambda r, q: r == "secretnovio"), ("animación final", lambda r, q: r == "animacion-final"),
             ("último diálogo", lambda r, q: r == "dialogo-final"), ("10+ min", lambda r, q: r == "min-10"),
             ("fps lento", lambda r, q: r == "fps" and q.get("tramo") == "lento"), ("errores", lambda r, q: r == "error")]
    for eje, i in (("dispositivo", 2), ("app de origen", 3)):
        cols = sorted({x[i] for x in avisos})
        print(f"  Por {eje}: " + " · ".join(cols))
        for nombre, f in filas:
            print(f"    {nombre:<22}" + "".join(f"{sum(1 for x in avisos if x[i] == c and f(x[0], x[1])):>10}" for c in cols))


def med2(xs):
    xs = [x for x in xs if x is not None]
    return f"{statistics.median(xs):.1f}" if xs else "—"


def hitos(av):
    """Cuenta del embudo para una lista de avisos (r, q, …)."""
    c = collections.Counter()
    for r, q, *_ in av:
        if r in ("carga-portada", "carga-lista", "jugar", "tutorial", "secretnovio", "animacion-final", "dialogo-final") or r.startswith("min-"):
            c[r] += 1
            if r == "jugar":
                c["jugar-" + q.get("p", "n")] += 1
        elif r.startswith("patata-") and num(q, "n") in (1, 5, 10, 20):
            c[f"patata{num(q, 'n')}"] += 1
        elif r == "error":
            c["error"] += 1
    return c


EMBUDO = [("carga-portada", "Sesiones (abren la web)"), ("carga-lista", "Termina la carga"), ("jugar", "Pulsan JUGAR"),
          ("tutorial", "Acaban el tutorial"), ("patata1", "1.ª patata"), ("patata5", "5 patatas"), ("patata10", "10 patatas"),
          ("patata20", "20 patatas"), ("secretnovio", "Superan SECRETNOVIO"), ("animacion-final", "Ven la animación final"),
          ("dialogo-final", "Terminan el último diálogo")]


def resumen_sesiones(avisos, por_horas):
    c = hitos(avisos); ses = c["carga-portada"] or 1; jug = c["jugar"] or 1
    print("\nResumen por sesiones (avisos del juego; llegan siempre al servidor, con o sin Bunny)")
    print(f"  {'':<28}{'total':>8}{'% sesiones':>12}{'% JUGAR':>10}")
    for k, nombre in EMBUDO:
        v = c[k]; pj = f"{100 * v / jug:>9.0f}%" if k not in ("carga-portada", "carga-lista") else f"{'':>10}"
        print(f"  {nombre:<28}{v:>8}{100 * v / ses:>11.0f}%{pj}")
    print(f"  (JUGAR: {c['jugar-n']} partidas nuevas · {c['jugar-c']} siguen una partida guardada) · juegan 2/5/10/20+ min: "
          f"{c['min-2']} / {c['min-5']} / {c['min-10']} / {c['min-20']}")
    dias = sorted({x[4] for x in avisos})
    print(f"\n  {'Día':<12}{'Sesiones':>9}{'JUGAR':>7}{'%':>5}{'Tutorial':>9}{'20 pat.':>8}{'Final':>6}{'Errores':>8}")
    for d in dias:
        k = hitos([x for x in avisos if x[4] == d]); s_ = k["carga-portada"]
        print(f"  {d:<12}{s_:>9}{k['jugar']:>7}{(100 * k['jugar'] / s_ if s_ else 0):>4.0f}%{k['tutorial']:>9}{k['patata20']:>8}{k['dialogo-final']:>6}{k['error']:>8}")
    canales = collections.Counter(x[6] for x in avisos if x[0] == "carga-portada")
    print("\n  Canal de origen (?o= del enlace, o la app si no lleva etiqueta)")
    print(f"  {'Canal':<30}{'Sesiones':>9}{'JUGAR':>7}{'%':>5}{'20 pat.':>8}{'Final':>6}")
    for cn, _ in canales.most_common():
        k = hitos([x for x in avisos if x[6] == cn]); s_ = k["carga-portada"]
        print(f"  {cn:<30}{s_:>9}{k['jugar']:>7}{(100 * k['jugar'] / s_ if s_ else 0):>4.0f}%{k['patata20']:>8}{k['dialogo-final']:>6}")
    if por_horas:
        print("\n  Por horas (hora de Madrid): sesiones · JUGAR")
        for hh in sorted({x[5] for x in avisos}):
            k = hitos([x for x in avisos if x[5] == hh])
            if k["carga-portada"] or k["jugar"]:
                print(f"    {hh}  {k['carga-portada']:>6}  {k['jugar']:>6}  " + "▇" * min(60, k["carga-portada"] // 5))


def bunny():
    """Tráfico y gasto de Bunny (si el servidor tiene su clave). Nunca falla el informe."""
    try:
        k = open("/etc/bk/bunny.key").read().strip(); z = open("/etc/bk/bunny.zona").read().strip()
        u = f"https://api.bunny.net/statistics?pullZone={z}&dateFrom=2026-10-24&dateTo={datetime.date.today().isoformat()}"
        with urllib.request.urlopen(urllib.request.Request(u, headers={"AccessKey": k, "Accept": "application/json"}), timeout=30) as r:
            d = json.load(r)
        gb = d.get("TotalBandwidthUsed", 0) / 1e9
        print(f"\nBunny (CDN) desde el 24 oct: {gb:.1f} GB servidos · {d.get('TotalRequestsServed', 0)} peticiones · "
              f"{d.get('CacheHitRate', 0):.0f} % desde su caché · gasto ≈ {gb * 0.01:.2f} $ de 20 $ de prueba")
    except Exception:
        pass


def guardar(avisos, bytes_dia):
    """Un JSON por día con totales (sin IP ni nada que identifique): sobrevive al borrado del registro a los 30 días."""
    os.makedirs(DIAS, exist_ok=True)
    for d in sorted({x[4] for x in avisos}):
        av = [x for x in avisos if x[4] == d]
        res = {"dia": d, "embudo": dict(hitos(av)), "servido_directo_gb": round(bytes_dia.get(d, 0) / 1e9, 2),
               "canal": {cn: dict(hitos([x for x in av if x[6] == cn])) for cn in {x[6] for x in av}},
               "dispositivo": dict(collections.Counter(x[2] for x in av if x[0] == "carga-portada")),
               "app": dict(collections.Counter(x[3] for x in av if x[0] == "carga-portada")),
               "horas": {hh: dict(hitos([x for x in av if x[5] == hh])) for hh in sorted({x[5] for x in av})},
               "errores": dict(collections.Counter(q.get("c", "?") for r, q, *_ in av if r == "error")),
               "actividades": {a: {"empiezan": sum(1 for r, q, *_ in av if r == "act-empieza" and q.get("a") == a),
                                   "completan": sum(1 for r, q, *_ in av if r == "act-completa" and q.get("a") == a)}
                               for a in {q.get("a") for r, q, *_ in av if r.startswith("act-") and q.get("a")}},
               "guardado": datetime.datetime.now().isoformat(timespec="seconds")}
        tmp = os.path.join(DIAS, d + ".json.tmp"); json.dump(res, open(tmp, "w"), ensure_ascii=False, indent=1)
        os.replace(tmp, os.path.join(DIAS, d + ".json"))
    print(f"\nResúmenes diarios guardados en {DIAS} ({len({x[4] for x in avisos})} días)")


def historico():
    fs = sorted(glob.glob(os.path.join(DIAS, "*.json")))
    if not fs:
        print("Sin resúmenes guardados todavía (se guardan con --guardar)"); return
    print("Histórico (resúmenes diarios guardados; no caducan)")
    print(f"{'Día':<12}{'Sesiones':>9}{'JUGAR':>7}{'%':>5}{'Tutorial':>9}{'10 pat.':>8}{'20 pat.':>8}{'SN':>5}{'Final':>6}{'Errores':>8}")
    tot = collections.Counter()
    for f in fs:
        e = json.load(open(f))["embudo"]; tot.update(e); s_ = e.get("carga-portada", 0)
        print(f"{os.path.basename(f)[:10]:<12}{s_:>9}{e.get('jugar', 0):>7}{(100 * e.get('jugar', 0) / s_ if s_ else 0):>4.0f}%{e.get('tutorial', 0):>9}"
              f"{e.get('patata10', 0):>8}{e.get('patata20', 0):>8}{e.get('secretnovio', 0):>5}{e.get('dialogo-final', 0):>6}{e.get('error', 0):>8}")
    s_ = tot.get("carga-portada", 0)
    print(f"{'TOTAL':<12}{s_:>9}{tot.get('jugar', 0):>7}{(100 * tot.get('jugar', 0) / s_ if s_ else 0):>4.0f}%{tot.get('tutorial', 0):>9}"
          f"{tot.get('patata10', 0):>8}{tot.get('patata20', 0):>8}{tot.get('secretnovio', 0):>5}{tot.get('dialogo-final', 0):>6}{tot.get('error', 0):>8}")


def pct(xs, p):
    xs = sorted(x for x in xs if x is not None)
    if not xs:
        return None
    i = (len(xs) - 1) * p / 100; a = int(i); b = min(a + 1, len(xs) - 1)
    return xs[a] + (xs[b] - xs[a]) * (i - a)


def mmss(x):
    if x is None:
        return "—"
    x = round(x); return f"{x // 60}:{x % 60:02d}"


def tiempos(avisos):
    """Tiempos de juego (reloj del juego desde JUGAR: no cuenta la pausa ni la pestaña oculta). Percentiles: 10 % más rápidos ·
    25 % · mediana · 75 % · 10 % más lentos."""
    def ts(f):   # solo partidas nuevas: en una guardada el reloj empieza en esa visita y daría «récords» falsos
        return [num(q, "t") for r, q, *_ in avisos if f(r, q) and q.get("p", "n") == "n"]
    print("\nTiempos de las PARTIDAS NUEVAS (min:seg de juego desde JUGAR; no cuenta la pausa ni la pestaña oculta)")
    print(f"  {'Paso':<30}{'veces':>7}{'10 %':>8}{'25 %':>8}{'mediana':>9}{'75 %':>8}{'90 %':>8}{'récord':>8}")
    filas = [("Acaban el tutorial", lambda r, q: r == "tutorial"),
             ("1.ª patata", lambda r, q: r.startswith("patata-") and num(q, "n") == 1),
             ("5.ª patata", lambda r, q: r.startswith("patata-") and num(q, "n") == 5),
             ("10.ª patata", lambda r, q: r.startswith("patata-") and num(q, "n") == 10),
             ("15.ª patata", lambda r, q: r.startswith("patata-") and num(q, "n") == 15),
             ("20 patatas (todas)", lambda r, q: r.startswith("patata-") and num(q, "n") == 20),
             ("Superan SECRETNOVIO", lambda r, q: r == "secretnovio"),
             ("Ven la animación final", lambda r, q: r == "animacion-final"),
             ("Terminan el último diálogo", lambda r, q: r == "dialogo-final")]
    for nombre, f in filas:
        x = [v for v in ts(f) if v is not None]
        if x:
            print(f"  {nombre:<30}{len(x):>7}{mmss(pct(x, 10)):>8}{mmss(pct(x, 25)):>8}{mmss(pct(x, 50)):>9}{mmss(pct(x, 75)):>8}{mmss(pct(x, 90)):>8}{mmss(min(x)):>8}")
    # cuánto juegan (de los avisos min-N): reparto por tramos
    j = sum(1 for r, q, *_ in avisos if r == "jugar" and q.get("p", "n") == "n") or 1
    m = {n: sum(1 for r, q, *_ in avisos if r == f"min-{n}" and q.get("p", "n") == "n") for n in MINUTOS}
    tramos_ = [("menos de 2 min", j - m[2]), ("2–5 min", m[2] - m[5]), ("5–10 min", m[5] - m[10]), ("10–20 min", m[10] - m[20]),
               ("20–30 min", m[20] - m[30]), ("30–60 min", m[30] - m[60]), ("más de 60 min", m[60])]
    print("  Cuánto juega cada partida (de quienes pulsan JUGAR): " + " · ".join(f"{k} {100 * max(v, 0) / j:.0f} %" for k, v in tramos_))
    # el tiempo máximo: el aviso con el reloj más alto (es un mínimo: alguien puede seguir jugando sin mandar más avisos)
    con_t = [(num(q, "t"), r) for r, q, *_ in avisos if num(q, "t") is not None and q.get("p", "n") == "n"]
    con_tc = [num(q, "t") for r, q, *_ in avisos if num(q, "t") is not None and q.get("p") == "c"]
    if con_t:
        top = sorted(con_t, reverse=True)[:5]
        print(f"  Máximo jugado en una partida nueva: {mmss(top[0][0])} (último aviso: {top[0][1]}) · siguientes: " + ", ".join(mmss(t) for t, _ in top[1:]) +
              f" · superan 30 / 45 / 60 min: {m[30]} / {m[45]} / {m[60]}" + (f" · en partidas guardadas, máximo en una visita: {mmss(max(con_tc))}" if con_tc else ""))
    # zonas: cuándo se descubre cada una
    zs = sorted({r[5:] for r, *_ in avisos if r.startswith("zona-")})
    if zs:
        print("  Zonas, primera vez que entran (mediana · 25–75 %): " + " · ".join(
            f"{z} {mmss(pct(ts(lambda r, q, z=z: r == 'zona-' + z), 50))} ({mmss(pct(ts(lambda r, q, z=z: r == 'zona-' + z), 25))}–{mmss(pct(ts(lambda r, q, z=z: r == 'zona-' + z), 75))})" for z in zs))
    # actividades: cuánto tardan en completarse (dur) y en qué minuto de partida
    acts = sorted({q.get("a") for r, q, *_ in avisos if r == "act-completa" and q.get("a")})
    if acts:
        print("  Actividades completadas: duración (mediana · 25–75 %) · en qué minuto de partida (mediana)")
        for a in acts:
            d = [num(q, "dur") for r, q, *_ in avisos if r == "act-completa" and q.get("a") == a and q.get("p", "n") == "n"]
            t = [num(q, "t") for r, q, *_ in avisos if r == "act-completa" and q.get("a") == a and q.get("p", "n") == "n"]
            print(f"    {a:<14} {mmss(pct(d, 50)):>6} ({mmss(pct(d, 25))}–{mmss(pct(d, 75))})   minuto {mmss(pct(t, 50))}")
    # carga
    cp = [numf(q, "s") for r, q, *_ in avisos if r == "carga-portada"]; cl = [numf(q, "s") for r, q, *_ in avisos if r == "carga-lista"]
    if cp or cl:
        f1 = lambda x: "—" if x is None else f"{x:.1f} s"
        print(f"  Carga: portada visible {f1(pct(cp, 50))} (90 % en menos de {f1(pct(cp, 90))}) · JUGAR listo {f1(pct(cl, 50))} "
              f"(90 % en menos de {f1(pct(cl, 90))})")
    # ayudas y saltos: cuándo
    ay = ts(lambda r, q: r == "ayuda"); sa = ts(lambda r, q: r == "saltar")
    if ay or sa:
        print(f"  Primera pista del modo ayuda: minuto {mmss(pct(ay, 50))} (mediana) · SALTAR (tutorial/cinemática): minuto {mmss(pct(sa, 50))}")


if __name__ == "__main__":
    main()
