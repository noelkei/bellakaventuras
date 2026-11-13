"""V7 T7-13 · Pares «referencia del dossier | juego servido» para la comparación visual obligatoria (06 · validación).
Toma las capturas de la última ejecución de tt-shots (cámara directa dentro del juego, recurso optimizado cargado) con la
etiqueta indicada y monta un par por vista: V01–V06 y D01–D06. No juzga: la valoración artística es del usuario.
Uso: python3 game/tools/v7/tt-pairs.py <carpeta runs> <etiqueta> <salida>
"""
import sys, glob, os
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont
ROOT = Path(__file__).resolve().parents[3]
REF = ROOT / 'referencias/escenarios/TRATRATRA'
REFS = {'v01': 'vistas-texturizadas-v7-2026-10-13/01-axonometria-frontal-seleccionada.png', 'v02': 'vistas-texturizadas-v7-2026-10-13/03-alzado-frontal.png',
        'v03': 'vistas-texturizadas-v7-2026-10-13/04-alzado-posterior.png', 'v04': 'vistas-texturizadas-v7-2026-10-13/05-lateral-derecho.png',
        'v05': 'vistas-texturizadas-v7-2026-10-13/06-lateral-izquierdo.png', 'v06': 'vistas-texturizadas-v7-2026-10-13/07-planta-superior.png',
        'd01': 'acercamientos-v7-2026-10-13/01-escaleras-principales.png', 'd02': 'acercamientos-v7-2026-10-13/02-camino-inferior.png',
        'd03': 'acercamientos-v7-2026-10-13/03-acceso-vertical-EV1-P1-E2.png', 'd04': 'acercamientos-v7-2026-10-13/04-escalera-curva-E3.png',
        'd05': 'acercamientos-v7-2026-10-13/05-recta-rampita-y-salto.png', 'd06': 'acercamientos-v7-2026-10-13/06-pasarela-y-limusina.png'}
TITLES = {'v01': 'V01 · axonometría frontal (elegida)', 'v02': 'V02 · frontal', 'v03': 'V03 · posterior', 'v04': 'V04 · lateral derecho', 'v05': 'V05 · lateral izquierdo', 'v06': 'V06 · superior',
          'd01': 'D01 · escaleras principales', 'd02': 'D02 · camino inferior', 'd03': 'D03 · EV1 / P1 / E2', 'd04': 'D04 · E3 y descanso', 'd05': 'D05 · recta, rampita y salto', 'd06': 'D06 · pasarela y limusina'}
runs, label, out = Path(sys.argv[1]), sys.argv[2], Path(sys.argv[3]); out.mkdir(parents=True, exist_ok=True)
H = 620
try: font = ImageFont.truetype('/System/Library/Fonts/Helvetica.ttc', 22)
except Exception: font = ImageFont.load_default()
made = []
for k, rel in REFS.items():
    shots = sorted(glob.glob(str(runs / f'tt-shots_{label}_*_{k}.png')))
    if not shots: continue
    a = Image.open(REF / rel).convert('RGB'); b = Image.open(shots[-1]).convert('RGB')
    a = a.resize((int(a.width * H / a.height), H), Image.LANCZOS); b = b.resize((int(b.width * H / b.height), H), Image.LANCZOS)
    cv = Image.new('RGB', (a.width + b.width + 12, H + 44), (28, 26, 32)); cv.paste(a, (0, 44)); cv.paste(b, (a.width + 12, 44))
    d = ImageDraw.Draw(cv); d.text((10, 10), f'{TITLES[k]} · referencia del dossier', fill=(255, 220, 232), font=font); d.text((a.width + 22, 10), f'juego (build servida, {os.path.basename(shots[-1])[9:40]})', fill=(255, 220, 232), font=font)
    f = out / f'par_{k}.jpg'; cv.save(f, quality=88); made.append(f.name)
print('pares:', made)
