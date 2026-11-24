"""Draw the app icons (a dumbbell on dark) into icons/: python tools/make_icons.py"""
from pathlib import Path
from PIL import Image, ImageDraw

OUT = Path(__file__).resolve().parent.parent / "icons"
BG, ACC = (15, 17, 21), (255, 107, 44)


def draw(size, pad_frac, rounded):
    s = 4  # supersample
    S = size * s
    im = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    if rounded:
        d.rounded_rectangle([0, 0, S - 1, S - 1], radius=int(S * 0.22), fill=BG)
    else:
        d.rectangle([0, 0, S, S], fill=BG)
    u = S * (1 - 2 * pad_frac) / 100  # 100-unit drawing box
    o = S * pad_frac
    R = lambda x0, y0, x1, y1, r: d.rounded_rectangle([o + x0 * u, o + y0 * u, o + x1 * u, o + y1 * u], radius=r * u, fill=ACC)
    R(8, 38, 16, 62, 3); R(18, 24, 30, 76, 4); R(30, 45, 70, 55, 2); R(70, 24, 82, 76, 4); R(84, 38, 92, 62, 3)
    return im.resize((size, size), Image.LANCZOS)


OUT.mkdir(exist_ok=True)
draw(192, 0.16, True).save(OUT / "icon-192.png")
draw(512, 0.16, True).save(OUT / "icon-512.png")
draw(512, 0.24, False).save(OUT / "maskable-512.png")
(OUT / "icon.svg").write_text(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect width="100" height="100" rx="22" fill="#0f1115"/>'
    '<g fill="#ff6b2c" transform="translate(16 16) scale(.68)"><rect x="8" y="38" width="8" height="24" rx="3"/>'
    '<rect x="18" y="24" width="12" height="52" rx="4"/><rect x="30" y="45" width="40" height="10" rx="2"/>'
    '<rect x="70" y="24" width="12" height="52" rx="4"/><rect x="84" y="38" width="8" height="24" rx="3"/></g></svg>',
    encoding="utf-8")
print("icons written to", OUT)
