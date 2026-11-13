"""V8 · Pares «referencia elegida | juego» de YINYANG (seis vistas Menta y rosa, M01, T02, logo, E1). Toma las capturas de la
última ejecución de yy-shots con la etiqueta indicada. No juzga: la valoración final es del usuario.
Uso: python3 game/tools/v8/yy-pairs.py <carpeta runs> <etiqueta> <salida> [--sheet]"""
import sys, glob, os
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont
ROOT = Path(__file__).resolve().parents[3]
D = ROOT / 'referencias/escenarios/YINYANG/dossier-definitivo-menta-rosa-v4-2026-10-15'
REFS = {'v01': 'imagenes-seleccionadas/01-propuesta-menta-rosa.png', 'v04': 'imagenes-seleccionadas/04-vista-cenital.png', 'v05': 'imagenes-seleccionadas/05-lateral-entrada-e1.png',
        'v06': 'imagenes-seleccionadas/06-lateral-opuesto.png', 'v07': 'imagenes-seleccionadas/07-interior-hacia-parque.png', 'v08': 'imagenes-seleccionadas/08-parque-hacia-interior.png',
        'm01': 'imagenes-seleccionadas/M01-mobiliario-macizo.png', 't02': 'imagenes-seleccionadas/T02-torre-grafica-fennec.png', 'logo': 'branding/Bellakaciones-curvado-original.png',
        'e1': 'imagenes-seleccionadas/05-lateral-entrada-e1.png'}
TITLES = {'v01': '01 propuesta', 'v04': '04 cenital', 'v05': '05 lateral entrada E1', 'v06': '06 lateral opuesto', 'v07': '07 interior hacia parque', 'v08': '08 parque hacia interior',
          'm01': 'M01 mobiliario', 't02': 'T02 torre', 'logo': 'Bellakaciones (PNG original)', 'e1': 'E1 (detalle de 05)'}
runs, label, out = Path(sys.argv[1]), sys.argv[2], Path(sys.argv[3]); out.mkdir(parents=True, exist_ok=True)
H = 520
try: font = ImageFont.truetype('/System/Library/Fonts/Helvetica.ttc', 20)
except Exception: font = ImageFont.load_default()
made = []
for k, rel in REFS.items():
    shots = sorted(glob.glob(str(runs / f'yy-shots_{label}_*_{k}.png')))
    if not shots: continue
    a = Image.open(D / rel); a = Image.alpha_composite(Image.new('RGBA', a.size, (90, 160, 130, 255)), a.convert('RGBA')).convert('RGB') if a.mode == 'RGBA' else a.convert('RGB')
    b = Image.open(shots[-1]).convert('RGB')
    a = a.resize((int(a.width * H / a.height), H), Image.LANCZOS); b = b.resize((int(b.width * H / b.height), H), Image.LANCZOS)
    cv = Image.new('RGB', (a.width + b.width + 12, H + 40), (28, 26, 32)); cv.paste(a, (0, 40)); cv.paste(b, (a.width + 12, 40))
    d = ImageDraw.Draw(cv); d.text((10, 9), f'{TITLES[k]} · referencia elegida', fill=(255, 220, 232), font=font); d.text((a.width + 22, 9), f'juego · {os.path.basename(shots[-1])[9:45]}', fill=(255, 220, 232), font=font)
    f = out / f'par_{k}.jpg'; cv.save(f, quality=86); made.append(f)
if '--sheet' in sys.argv and made:
    ims = [Image.open(f) for f in made]; w = max(i.width for i in ims); sh = Image.new('RGB', (w, sum(i.height for i in ims)), (20, 20, 24)); y = 0
    for i in ims: sh.paste(i, (0, y)); y += i.height
    sh.save(out / 'pares_hoja.jpg', quality=80)
print('pares:', [m.name for m in made])
