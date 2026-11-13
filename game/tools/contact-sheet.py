"""Hojas de contacto y animaciones WebP a partir de capturas de ANMI (sin ffmpeg).

    python3 tools/contact-sheet.py captures/anmi-baseline [--every 2] [--cols 12]

Para cada segmento/vista crea <dir>/sheet_<seg>_<vista>.jpg (fotogramas en orden) y <dir>/anim_<seg>_<vista>.webp
(15 fps, tiempo real) y <dir>/anim_<seg>_<vista>_slow.webp (cámara lenta ×0,33).
"""
import sys
import re
from collections import defaultdict
from pathlib import Path
from PIL import Image, ImageDraw

d = Path(sys.argv[1])
every = int(sys.argv[sys.argv.index("--every") + 1]) if "--every" in sys.argv else 2
cols = int(sys.argv[sys.argv.index("--cols") + 1]) if "--cols" in sys.argv else 12
groups = defaultdict(list)
for p in sorted(d.glob("*.png")):
    m = re.match(r"(.+)_(side|front|q34)_(\d+)\.png", p.name)
    if m:
        groups[(m.group(1), m.group(2))].append(p)
for (seg, view), files in groups.items():
    frames = [Image.open(f).convert("RGB") for f in files]
    w, h = frames[0].size
    tw, th = w // 2, h // 2
    pick = frames[::every]
    rows = (len(pick) + cols - 1) // cols
    sheet = Image.new("RGB", (cols * tw, rows * th), (30, 28, 36))
    for i, im in enumerate(pick):
        t = im.resize((tw, th))
        dr = ImageDraw.Draw(t)
        dr.text((4, 2), str(i * every), fill=(255, 255, 255))
        sheet.paste(t, ((i % cols) * tw, (i // cols) * th))
    sheet.save(d / f"sheet_{seg}_{view}.jpg", quality=82)
    small = [f.resize((w * 3 // 4, h * 3 // 4)) for f in frames]
    small[0].save(d / f"anim_{seg}_{view}.webp", save_all=True, append_images=small[1:], duration=int(1000 / 15), loop=0, quality=70)
    small[0].save(d / f"anim_{seg}_{view}_slow.webp", save_all=True, append_images=small[1:], duration=int(1000 / 5), loop=0, quality=70)
    print("sheet", seg, view, len(frames))
