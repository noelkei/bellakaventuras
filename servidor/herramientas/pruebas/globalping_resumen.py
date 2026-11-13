#!/usr/bin/env python3
"""Resume un resultado de Globalping (stdin, JSON) de /salud: una línea por sonda y un total. Lo usa globalping.sh."""
import json, sys

d = json.load(sys.stdin); et = sys.argv[1]; ok = mal = 0
for x in d.get("results", []):
    p, r = x["probe"], x["result"]
    t = r.get("timings") or {}
    bien = r.get("statusCode") == 200 and (r.get("rawBody") or "").strip() == "ok"
    ok += bien; mal += not bien
    marca = "OK   " if bien else "FALLA"
    print(f"  {marca} {p.get('country')} {p.get('city', '')[:14]:<14} {p.get('network', '')[:28]:<28} "
          f"código {r.get('statusCode')}  total {t.get('total')} ms  TLS {t.get('tls')} ms  1.er byte {t.get('firstByte')} ms"
          + ("" if bien else f"  ({(r.get('rawOutput') or '')[:80]!r})"))
print(f"{et}: {ok} OK, {mal} FALLA")
