"""Texturas propias del remake (reproducibles, sin recursos de terceros) → environments/textures_remake/*.png

    python3 game/tools/make_remake_textures.py

- T_dirt: suelo terroso de YINYANG (solo visual: la colisión es lisa y patinable).
- T_bola_box: cajones claros tipo ladrillo de Bola de Oro (perímetro), T_bola_ground: hormigón gris verdoso.
- T_asphalt: asfalto del centro (SECRENOVIO), T_grass: césped de arbolado.
- Mural YINYANG (2048×1280, mismas coordenadas en las tres): T_yy_final (pintado), T_yy_stencil (plantilla sobre pared),
  T_yy_mask (zona pintable, L). Símbolo yin-yang dominante arriba y, debajo y más pequeño (≈60 % del ancho del
  símbolo), el logo ANMI EXACTO de assets/source/branding/ANMI_logo_referencia.jpeg (trazos umbralizados, sin redibujar).
"""
import math
import random
from pathlib import Path
import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageChops

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "environments" / "textures_remake"
OUT.mkdir(parents=True, exist_ok=True)
rng = np.random.default_rng(7)


def noise(size, scale, octaves=4, seed=0):
    r = np.random.default_rng(seed)
    acc = np.zeros((size, size))
    amp, tot = 1.0, 0.0
    for o in range(octaves):
        n = max(2, int(size / scale * 2 ** o))
        g = r.random((n + 1, n + 1))
        g[-1, :] = g[0, :]; g[:, -1] = g[:, 0]  # repetible
        im = Image.fromarray((g * 255).astype(np.uint8)).resize((size, size), Image.BICUBIC)
        acc += np.asarray(im, dtype=float) / 255 * amp
        tot += amp; amp *= 0.5
    return acc / tot


def save_rgb(arr, name):
    Image.fromarray(np.clip(arr, 0, 255).astype(np.uint8)).save(OUT / name)
    print(name)


S = 512
# tierra beige/terrosa con piedrecitas
n1 = noise(S, 128, 5, 1); n2 = noise(S, 24, 3, 2)
base = np.array([196, 168, 128])
dirt = base[None, None, :] * (0.82 + 0.25 * n1[..., None]) + (n2[..., None] - 0.5) * 30
for _ in range(260):
    x, y = rng.integers(0, S, 2); r = rng.integers(1, 4); c = rng.integers(120, 215)
    yy, xx = np.ogrid[:S, :S]
    m = ((xx - x) % S - 0) ** 2 + ((yy - y) % S) ** 2 <= r * r
    dirt[m] = [c, c * 0.92, c * 0.82]
save_rgb(dirt, "T_dirt.png")

# hormigón gris verdoso de Bola de Oro
g1 = noise(S, 96, 5, 3); g2 = noise(S, 8, 2, 4)
bola = np.array([168, 176, 166])[None, None, :] * (0.86 + 0.18 * g1[..., None]) + (g2[..., None] - 0.5) * 18
save_rgb(bola, "T_bola_ground.png")

# cajón claro con caras de ladrillo (juntas suaves)
img = Image.new("RGB", (S, S), (226, 214, 196))
d = ImageDraw.Draw(img)
bh, bw = 32, 96
for row in range(S // bh):
    off = (row % 2) * bw // 2
    for col in range(-1, S // bw + 1):
        x0 = col * bw + off
        tone = int(rng.integers(-14, 14))
        d.rectangle([x0 + 2, row * bh + 2, x0 + bw - 2, row * bh + bh - 2], fill=(226 + tone, 212 + tone, 192 + tone))
img = img.filter(ImageFilter.GaussianBlur(0.8))
arr = np.asarray(img, dtype=float) * (0.92 + 0.12 * noise(S, 64, 3, 5)[..., None])
save_rgb(arr, "T_bola_box.png")

# asfalto oscuro
a1 = noise(S, 64, 4, 6); a2 = rng.random((S, S))
asph = np.array([66, 64, 72])[None, None, :] * (0.85 + 0.25 * a1[..., None]) + ((a2 > 0.985) * 60)[..., None]
save_rgb(asph, "T_asphalt.png")

# césped
c1 = noise(S, 80, 5, 8); c2 = noise(S, 6, 2, 9)
grass = np.array([104, 150, 86])[None, None, :] * (0.8 + 0.3 * c1[..., None]) + (c2[..., None] - 0.5) * 30
save_rgb(grass, "T_grass.png")

# ------------------------------------------------------------------ mural YINYANG
W, H = 2048, 1280
logo_src = Image.open(ROOT / "assets/source/branding/ANMI_logo_referencia.jpeg").convert("L")
logo_mask = logo_src.point(lambda v: 255 if v > 128 else 0)
bbox = logo_mask.getbbox()
logo_mask = logo_mask.crop(bbox)

cx, cy, R = W // 2, 470, 400            # símbolo: diámetro 800 px
logo_w = int(2 * R * 0.60)              # logo ≈ 60 % del ancho del símbolo
logo_h = int(logo_w * logo_mask.height / logo_mask.width)
logo_mask = logo_mask.resize((logo_w, logo_h), Image.LANCZOS)
lx, ly = cx - logo_w // 2, cy + R + 90


def yinyang_layers():
    """Devuelve (máscara disco, máscara mitad oscura) a resolución completa."""
    disc = Image.new("L", (W, H), 0); dark = Image.new("L", (W, H), 0)
    dd = ImageDraw.Draw(disc); dd.ellipse([cx - R, cy - R, cx + R, cy + R], fill=255)
    dk = ImageDraw.Draw(dark)
    dk.pieslice([cx - R, cy - R, cx + R, cy + R], 90, 270, fill=255)       # mitad izquierda oscura
    dk.ellipse([cx - R // 2, cy - R, cx + R // 2, cy], fill=0)              # lóbulo superior claro
    dk.ellipse([cx - R // 2, cy, cx + R // 2, cy + R], fill=255)            # lóbulo inferior oscuro
    r2 = R // 7
    dk.ellipse([cx - r2, cy - R // 2 - r2, cx + r2, cy - R // 2 + r2], fill=255)  # punto oscuro arriba
    dk.ellipse([cx - r2, cy + R // 2 - r2, cx + r2, cy + R // 2 + r2], fill=0)    # punto claro abajo
    dark = ImageChops.multiply(dark, disc)
    return disc, dark


disc, dark = yinyang_layers()
logo_full = Image.new("L", (W, H), 0); logo_full.paste(logo_mask, (lx, ly))

# pared: enlucido claro con manchas (fondo común de las tres imágenes)
wn = noise(512, 128, 5, 11)
wall = (np.array([214, 205, 192])[None, None, :] * (0.86 + 0.16 * wn[..., None])).astype(np.uint8)
wall = Image.fromarray(wall).resize((W, H), Image.BICUBIC)
grime = Image.fromarray((noise(512, 64, 4, 12) * 255).astype(np.uint8)).resize((W, H), Image.BICUBIC)
wall = Image.composite(Image.new("RGB", (W, H), (176, 166, 152)), wall, grime.point(lambda v: max(0, v - 150) * 2))

PINK, INK, WHITE = (241, 120, 168), (34, 28, 40), (250, 246, 240)


def spray(mask, color, img, soft=2.0):
    m = mask.filter(ImageFilter.GaussianBlur(soft))
    img.paste(Image.new("RGB", (W, H), color), (0, 0), m)


final = wall.copy()
# sombra/aura rosa alrededor de ambas partes
aura = ImageChops.lighter(disc, logo_full).filter(ImageFilter.MaxFilter(31)).filter(ImageFilter.GaussianBlur(14))
spray(aura.point(lambda v: int(v * 0.55)), PINK, final, 0)
spray(disc, WHITE, final)
spray(dark, INK, final)
ring = ImageChops.subtract(disc.filter(ImageFilter.MaxFilter(23)), disc)
spray(ring, INK, final, 1.2)
logo_outline = ImageChops.subtract(logo_full.filter(ImageFilter.MaxFilter(17)), logo_full)
spray(logo_outline, INK, final, 1.0)
spray(logo_full, WHITE, final, 0.6)
# goteos
dr = ImageDraw.Draw(final)
for _ in range(14):
    x = int(rng.integers(cx - R, cx + R)); y0 = int(cy + math.sqrt(max(0, R * R - (x - cx) ** 2))) - 6
    dr.line([x, y0, x, y0 + int(rng.integers(20, 90))], fill=INK if x < cx else PINK, width=int(rng.integers(4, 9)))
final.save(OUT / "T_yy_final.png"); print("T_yy_final.png")

# plantilla: pared + contornos discontinuos de lo que hay que pintar
sten = wall.copy()
edge = ImageChops.subtract(disc.filter(ImageFilter.MaxFilter(9)), disc.filter(ImageFilter.MinFilter(9)))
edge2 = ImageChops.subtract(dark.filter(ImageFilter.MaxFilter(7)), dark.filter(ImageFilter.MinFilter(7)))
edge3 = ImageChops.subtract(logo_full.filter(ImageFilter.MaxFilter(7)), logo_full.filter(ImageFilter.MinFilter(7)))
dash = Image.new("L", (W, H), 0); ddraw = ImageDraw.Draw(dash)
for k in range(0, W + H, 36):
    ddraw.line([k, 0, k - H, H], fill=255, width=18)
lines = ImageChops.multiply(ImageChops.lighter(ImageChops.lighter(edge, edge2), edge3), dash)
spray(ImageChops.lighter(disc, logo_full).point(lambda v: int(v * 0.16)), PINK, sten, 0)
spray(lines, (120, 60, 90), sten, 0.8)
sten.save(OUT / "T_yy_stencil.png"); print("T_yy_stencil.png")

# máscara pintable: disco + logo (ligeramente dilatado para no exigir precisión)
mask = ImageChops.lighter(disc, logo_full.filter(ImageFilter.MaxFilter(13)))
mask.save(OUT / "T_yy_mask.png"); print("T_yy_mask.png")
# comprobación de proporciones (registrar en CONTINUE)
print("LOGO_RATIO", round(logo_w / (2 * R), 3), "logo_px", logo_w, logo_h, "symbol_d", 2 * R, "logo_bbox_src", bbox)

# ------------------------------------------------------------------ muro grafiteado (NO ME GUILLO, referencia Maspalomas)
# Hormigón gris claro cubierto de piezas de colores (letras burbuja abstractas), tags negros/blancos y goteos.
# Generado: no reproduce ninguna pieza real de las fotos; solo su densidad y paleta.
from PIL import ImageFont
GW, GH = 1024, 512
gn = noise(512, 96, 5, 21)
base = (np.array([196, 200, 202])[None, None, :] * (0.88 + 0.14 * gn[..., None])).astype(np.uint8)
gw = Image.fromarray(base).resize((GW, GH), Image.BICUBIC).convert("RGBA")
r2 = random.Random(5)
PAL = [(244, 196, 48), (64, 140, 220), (240, 110, 170), (120, 200, 120), (250, 140, 60), (150, 110, 220), (235, 235, 235)]
font_path = ROOT / "environments/third_party/fonts/bungee/Bungee-Regular.ttf"
layer = Image.new("RGBA", (GW, GH), (0, 0, 0, 0)); dl = ImageDraw.Draw(layer)
for k in range(9):  # piezas: palabras burbuja con contorno
    word = r2.choice(["NMG", "BK", "ANMI", "FUU", "SKT", "LPT", "GC"])
    size = r2.randint(70, 150)
    fnt = ImageFont.truetype(str(font_path), size)
    x, y = r2.randint(-40, GW - 120), r2.randint(-20, GH - 120)
    col = r2.choice(PAL)
    for dx in range(-7, 8, 2):
        for dy in range(-7, 8, 2):
            dl.text((x + dx, y + dy), word, font=fnt, fill=(25, 22, 30, 255))
    dl.text((x, y), word, font=fnt, fill=col + (255,))
    dl.text((x + 4, y + 4), word, font=fnt, fill=tuple(min(255, c + 40) for c in col) + (90,))
for k in range(26):  # tags (trazos)
    x, y = r2.randint(0, GW), r2.randint(0, GH)
    pts = [(x, y)]
    for _ in range(r2.randint(5, 12)):
        x += r2.randint(-30, 40); y += r2.randint(-25, 25); pts.append((x, y))
    dl.line(pts, fill=r2.choice([(20, 18, 24, 255), (245, 245, 245, 255), (200, 40, 60, 255)]), width=r2.randint(3, 7), joint="curve")
for k in range(16):  # goteos
    x = r2.randint(0, GW); y0 = r2.randint(0, GH - 60)
    dl.line([(x, y0), (x, y0 + r2.randint(20, 70))], fill=r2.choice(PAL) + (220,), width=r2.randint(3, 6))
layer = layer.filter(ImageFilter.GaussianBlur(0.7))
gw.alpha_composite(layer)
# repetible en horizontal: mezclar bordes
arr = np.asarray(gw.convert("RGB")).astype(float)
w = 48
for i in range(w):
    a = i / w
    arr[:, i] = arr[:, i] * a + arr[:, GW - w + i] * (1 - a)
Image.fromarray(arr.astype(np.uint8)).save(OUT / "T_graffiti_wall.png"); print("T_graffiti_wall.png")

# hormigón gris claro neutro (suelo de NO ME GUILLO) con juntas de losa suaves
cn = noise(512, 110, 5, 31); cd_ = noise(512, 10, 2, 32)
conc = np.array([205, 207, 206])[None, None, :] * (0.9 + 0.12 * cn[..., None]) + (cd_[..., None] - 0.5) * 10
conc[::256, :, :] *= 0.86; conc[:, ::256, :] *= 0.86
save_rgb(conc, "T_concrete_light.png")
