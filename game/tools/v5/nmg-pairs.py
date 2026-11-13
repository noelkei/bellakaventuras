# T5-26 · Tríos de revisión NMG: referencia | captura T5-25 (antes) | captura nueva (mismo encuadre de nmg-inventory).
# Reutiliza las hojas de pares de T5-25 (V5/evidencias/T5-25/pares: ref a la izquierda, juego a la derecha, separadas por
# una franja blanca) y añade a la derecha la captura nueva. Imágenes fijas: no sustituyen el recorrido continuo (G8-V).
# Uso: python3 game/tools/v5/nmg-pairs.py <prefijo_run_nmg-inventory> <dir_salida> [nombre_hoja nombres…]
import sys, os, glob
import numpy as np
from PIL import Image, ImageDraw

EV = os.path.join(os.path.dirname(__file__), '..', '..', '..', 'V5', 'evidencias')
pre, out = sys.argv[1], sys.argv[2]
os.makedirs(out, exist_ok=True)
caps = {os.path.basename(f)[len(os.path.basename(pre)) + 1:-4].lower(): f for f in glob.glob(pre + '_*.png')}
ALIAS = {'g06_charla': 'j02_charla_camara_juego', 'g03b_llegada_juego': 'j01_llegada_camara_juego', 'g01_general': 'g01_general_elevada_aprox',
         'g02_conjunto': 'g02_conjunto_aprox', 'g03_llegada': 'g03_llegada_aprox', 'g05_planta': 'g05_planta_cenital', 'p03_u_interior': 'p03_u_interior_fondo',
         'p08_suelo': 'p08_suelo_cerca', 'p09_paseo': 'p09_paseo_rosa', 'p11_lecho': 'p11_lecho_rosetas'}
done = []
for f in sorted(glob.glob(os.path.join(EV, 'T5-25', 'pares', '*.jpg'))):
    n = os.path.basename(f)[:-4]; key = ALIAS.get(n.lower(), n.lower())
    c = [k for k in caps if k == key] or [k for k in caps if k.startswith(key)]
    if not c: print('sin captura', n); continue
    g = np.asarray(Image.open(f).convert('L')).astype(int); white = (g[60:400] > 245).mean(0)
    cols = [x for x in range(200, g.shape[1] - 200) if white[x] > 0.97]
    if not cols: print('sin separador', n); continue
    pair = Image.open(f).convert('RGB'); ref = pair.crop((0, 0, cols[0], pair.height)); before = pair.crop((cols[-1] + 1, 0, pair.width, pair.height))
    new = Image.open(caps[c[0]]).convert('RGB'); h = pair.height - 22; new = new.resize((int(new.width * h / new.height), h))
    nb = Image.new('RGB', (new.width, pair.height), 'white'); nb.paste(new, (0, 22)); ImageDraw.Draw(nb).text((4, 5), f'V5 T5-26 · {c[0]}', fill='black')
    S = Image.new('RGB', (ref.width + before.width + nb.width + 16, pair.height), 'white')
    S.paste(ref, (0, 0)); S.paste(before, (ref.width + 8, 0)); S.paste(nb, (ref.width + before.width + 16, 0))
    S.save(os.path.join(out, f'{n}.jpg'), quality=86); done.append(n)
if len(sys.argv) > 4:
    ims = [Image.open(os.path.join(out, f'{n}.jpg')) for n in sys.argv[4:] if os.path.exists(os.path.join(out, f'{n}.jpg'))]
    W = max(i.width for i in ims); S = Image.new('RGB', (W, sum(i.height for i in ims)), 'white'); y = 0
    for i in ims: S.paste(i, (0, y)); y += i.height
    S.save(sys.argv[3] if sys.argv[3].endswith('.jpg') else os.path.join(out, sys.argv[3]), quality=80)
print(len(done), 'tríos →', out)
