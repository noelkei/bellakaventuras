"""Hoja de poses de .cache/preview: una fila por clip y vista (5 fotogramas).  python3 tools/pose-sheet.py CLIP[,CLIP] [out.jpg]"""
import sys
from pathlib import Path
from PIL import Image, ImageDraw
P = Path(__file__).resolve().parents[1] / ".cache" / "preview"
names = sys.argv[1].split(",")
out = sys.argv[2] if len(sys.argv) > 2 else str(P / "sheet.jpg")
rows = []
for n in names:
    for v in ("side", "front", "q"):
        ims = [Image.open(P / f"{n}_{v}_{i}.png").convert("RGB") for i in range(5) if (P / f"{n}_{v}_{i}.png").exists()]
        if ims:
            rows.append((f"{n} {v}", ims))
W, H = rows[0][1][0].size
s = Image.new("RGB", (W * 5, H * len(rows)), (40, 40, 40))
for r, (label, ims) in enumerate(rows):
    for c, im in enumerate(ims):
        s.paste(im, (c * W, r * H))
    ImageDraw.Draw(s).text((4, r * H + 4), label, fill=(0, 0, 0))
s = s.resize((s.width * 2 // 3, s.height * 2 // 3))
s.save(out, quality=85)
print(out, s.size)
