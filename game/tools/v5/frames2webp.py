# Monta los fotogramas de recordClip (fNNNN_<ms>ms.jpg) en un WebP animado con sus tiempos reales y una hoja de contacto
# (cada k-ésimo fotograma con su marca de tiempo). Uso: python3 frames2webp.py <carpeta> [columnas] [n_hoja]
import sys, os, re
from PIL import Image, ImageDraw
d = sys.argv[1]; cols = int(sys.argv[2]) if len(sys.argv) > 2 else 6; nsheet = int(sys.argv[3]) if len(sys.argv) > 3 else 24
fs = sorted(f for f in os.listdir(d) if f.endswith('.jpg'))
if not fs: sys.exit('sin fotogramas')
ts = [int(re.search(r'_(\d+)ms', f).group(1)) for f in fs]
ims = [Image.open(os.path.join(d, f)).convert('RGB') for f in fs]
durs = [max(16, ts[i + 1] - ts[i]) for i in range(len(ts) - 1)] + [100]
ims[0].save(os.path.join(d, 'clip.webp'), save_all=True, append_images=ims[1:], duration=durs, loop=0, quality=70)
k = max(1, len(ims) // nsheet); pick = list(range(0, len(ims), k))[:nsheet]
w, h = ims[0].size; tw = 320; th = int(h * tw / w); rows = (len(pick) + cols - 1) // cols
sheet = Image.new('RGB', (cols * tw, rows * th), 'white')
for j, i in enumerate(pick):
    t = ims[i].resize((tw, th)); dr = ImageDraw.Draw(t); dr.rectangle([0, 0, 92, 16], fill='black'); dr.text((3, 2), f'{ts[i]} ms', fill='white')
    sheet.paste(t, ((j % cols) * tw, (j // cols) * th))
sheet.save(os.path.join(d, 'hoja.jpg'), quality=85)
print(os.path.join(d, 'clip.webp'), os.path.join(d, 'hoja.jpg'), len(ims), 'fotogramas')
