"""V6 · pares referencia | juego (misma tarea de revisión artística). Uso: python3 game/tools/v6/fg-pairs.py <run-prefix> <salida.jpg>"""
import sys, glob
from PIL import Image
ROOT = '/Users/TU_USUARIO/Desktop/Bellakaventuras'
REF = ROOT + '/Auditoría 6/Fashion Girl/referencias-seleccionadas/'
pre, out = sys.argv[1], sys.argv[2]
pairs = [('FG-001.png', 'general_v9'), ('FG-003.png', 'general_v9_lejos'), ('FG-002.png', 'cenital')]
rows = []
for ref, shot in pairs:
    a = Image.open(REF + ref).convert('RGB'); b = Image.open(sorted(glob.glob(pre + '*_' + shot + '.png'))[-1]).convert('RGB')
    h = 420; a = a.resize((int(a.width * h / a.height), h)); b = b.resize((int(b.width * h / b.height), h))
    r = Image.new('RGB', (a.width + b.width + 10, h), 'white'); r.paste(a, (0, 0)); r.paste(b, (a.width + 10, 0)); rows.append(r)
W = max(r.width for r in rows); s = Image.new('RGB', (W, sum(r.height + 10 for r in rows)), 'white'); y = 0
for r in rows: s.paste(r, (0, y)); y += r.height + 10
s.save(out, quality=88); print(out)
