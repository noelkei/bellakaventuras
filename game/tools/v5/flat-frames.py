# T5-22 · Fotogramas «planos» de un clip (cámara dentro de un sólido: un solo color cubre la imagen). Por fotograma:
# color dominante cuantizado (8 niveles por canal) y su fracción; plano si > 0,6. Salida JSON en stdout.
import sys, glob, json, os
from PIL import Image
d = sys.argv[1]
rows = []
for f in sorted(glob.glob(os.path.join(d, 'f*.jpg'))):
    im = Image.open(f).convert('RGB').resize((96, 54))
    hist = {}
    for p in im.getdata():
        k = (p[0] >> 5, p[1] >> 5, p[2] >> 5)
        hist[k] = hist.get(k, 0) + 1
    k, n = max(hist.items(), key=lambda x: x[1])
    frac = n / (96 * 54)
    if frac > 0.6:
        rows.append({'f': os.path.basename(f), 'frac': round(frac, 3), 'rgb': [c * 32 + 16 for c in k]})
print(json.dumps({'frames': len(glob.glob(os.path.join(d, 'f*.jpg'))), 'flat': len(rows), 'list': rows[:12]}))
