# Desenha a logo do Ares Studio (um A geométrico com o ponto de pincel) e grava web/icone.ico e web/icone.png.
# Rodar de novo só se quiser mudar o desenho: python fazer_icone.py
import os

from PIL import Image, ImageDraw

BASE = os.path.dirname(os.path.abspath(__file__))
T = 1024  # desenha grande e reduz, para as bordas ficarem lisas
FUNDO, TINTA = (0, 0, 0, 255), (255, 255, 255, 255)


def desenhar():
    img = Image.new("RGBA", (T, T), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    p = lambda v: round(v * T)
    pts = lambda *xy: [(p(x), p(y)) for x, y in xy]
    d.rounded_rectangle([0, 0, T - 1, T - 1], radius=p(0.225), fill=FUNDO)
    d.polygon(pts((0.500, 0.215), (0.790, 0.760), (0.210, 0.760)), fill=TINTA)  # o A cheio
    d.polygon(pts((0.500, 0.470), (0.654, 0.760), (0.346, 0.760)), fill=FUNDO)  # abertura de baixo
    d.rectangle([p(0.330), p(0.585), p(0.670), p(0.665)], fill=TINTA)  # travessa do A
    cx, cy, r = p(0.500), p(0.760), p(0.058)
    d.ellipse([cx - r, cy - r, cx + r, cy + r], fill=TINTA)  # o ponto do pincel
    return img


if __name__ == "__main__":
    img = desenhar()
    web = os.path.join(BASE, "web")
    img.resize((512, 512), Image.LANCZOS).save(os.path.join(web, "icone.png"))
    img.save(os.path.join(web, "icone.ico"), sizes=[(s, s) for s in (16, 20, 24, 32, 40, 48, 64, 128, 256)])
    print("ok")
