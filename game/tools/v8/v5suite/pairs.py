# Hoja de pares: python3 pairs.py <salida.jpg> <etiquetaA> <prefijoA> <etiquetaB> <prefijoB> nombre1 nombre2 ...
# Cada fila: A | B (mismo encuadre), reducidas a 640 px de ancho, con rótulo.
import sys
from PIL import Image, ImageDraw
out, la, pa, lb, pb, *names = sys.argv[1:]
W = 640; rows = []
for n in names:
    ims = []
    for lab, pre in ((la, pa), (lb, pb)):
        im = Image.open(f'{pre}_{n}.png').convert('RGB'); im = im.resize((W, int(im.height * W / im.width)))
        d = ImageDraw.Draw(im); d.rectangle([0, 0, 330, 18], fill='black'); d.text((4, 3), f'{lab} · {n}', fill='white'); ims.append(im)
    rows.append(ims)
H = sum(r[0].height for r in rows); sheet = Image.new('RGB', (2 * W, H), 'white'); y = 0
for a, b in rows: sheet.paste(a, (0, y)); sheet.paste(b, (W, y)); y += a.height
sheet.save(out, quality=88); print(out)
