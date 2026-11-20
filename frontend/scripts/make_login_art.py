"""Generate simple PNG art for the login page: 4 role line-icons + side scene.
Run: python frontend/scripts/make_login_art.py
Requires: Pillow (already in backend/requirements.txt).
Style: flat, minimal, on-brand (amber #E0A73A / moss #5F8F6B on ink).
"""
from pathlib import Path
from PIL import Image, ImageDraw
import random

AMBER = (224, 167, 58, 255)
AMBER_SOFT = (224, 167, 58, 70)
MOSS = (95, 143, 107, 255)
INK = (13, 18, 16, 255)
GRID = (26, 34, 29, 255)

OUT = Path(__file__).resolve().parent.parent / "public"
(OUT / "roles").mkdir(parents=True, exist_ok=True)
S = 512  # draw size, downscaled for crisp edges


def new_transparent():
    return Image.new("RGBA", (S, S), (0, 0, 0, 0))


INK2 = (20, 26, 23, 255)  # dark glyph on the amber disc


def save_icon(img: Image.Image, name: str, size: int = 144):
    small = img.resize((size, size), Image.LANCZOS)
    p = OUT / "roles" / f"{name}.png"
    small.save(p)
    print("wrote", p, small.size)


def badge():
    """Amber disc badge base; glyphs drawn dark on top (v2 style)."""
    img = new_transparent()
    d = ImageDraw.Draw(img)
    d.ellipse([28, 28, S - 28, S - 28], fill=AMBER)
    d.ellipse([28, 28, S - 28, S - 28], outline=(154, 111, 22, 255), width=10)
    return img, d


def icon_admin():
    img, d = badge()
    pts = [(176, 140), (336, 140), (336, 268), (256, 400), (176, 268)]
    d.line(pts + [pts[0]], fill=INK2, width=30, joint="curve")
    d.line([(222, 240), (256, 276), (308, 200)], fill=INK2, width=28, joint="curve")  # check
    return img


def icon_operator():
    img, d = badge()
    pts = [(296, 96), (190, 290), (252, 290), (222, 420), (330, 224), (262, 224)]
    d.line(pts + [pts[0]], fill=INK2, width=30, joint="curve")
    return img


def icon_manager():
    img, d = badge()
    for x0, y0 in [(142, 300), (222, 232), (302, 164)]:
        d.rectangle([x0, y0, x0 + 56, 392], outline=INK2, width=24)
    d.line([(112, 392), (404, 392)], fill=INK2, width=24)
    return img


def icon_viewer():
    img, d = badge()
    d.ellipse([112, 208, 400, 308], outline=INK2, width=28)
    d.ellipse([228, 228, 284, 284], fill=INK2)
    return img


def scene(w: int = 960, h: int = 1200):
    img = Image.new("RGBA", (w, h), INK)
    d = ImageDraw.Draw(img)
    for x in range(0, w, 64):
        d.line([(x, 0), (x, h)], fill=GRID, width=1)
    for y in range(0, h, 64):
        d.line([(0, y), (w, y)], fill=GRID, width=1)
    rng = random.Random(7)
    for _ in range(120):  # faint sensor dots up top
        x, y = rng.randint(0, w), rng.randint(0, h // 2)
        d.ellipse([x, y, x + 3, y + 3], fill=(236, 232, 221, 22))
    cx, cy, r = w // 2, 730, 205
    d.ellipse([cx - r - 70, cy - r - 70, cx + r + 70, cy + r + 70], outline=AMBER_SOFT, width=3)
    d.ellipse([cx - r, cy - r, cx + r, cy + r], outline=AMBER, width=9)
    import math
    for k in range(12):  # sun ticks
        a = math.pi * 2 * k / 12
        x1, y1 = cx + (r + 26) * math.cos(a), cy + (r + 26) * math.sin(a)
        x2, y2 = cx + (r + 52) * math.cos(a), cy + (r + 52) * math.sin(a)
        d.line([(x1, y1), (x2, y2)], fill=AMBER, width=6)
    d.line([(0, 985), (w, 985)], fill=MOSS, width=5)  # horizon / feeder bus
    path = [(cx, 985), (640, 905), (790, 815), (w - 40, 745)]
    d.line(path, fill=AMBER, width=7, joint="curve")
    for x, y in path[1:]:
        d.ellipse([x - 15, y - 15, x + 15, y + 15], fill=AMBER)
        d.ellipse([x - 26, y - 26, x + 26, y + 26], outline=AMBER_SOFT, width=3)
    for i, x in enumerate(range(90, w - 60, 110)):  # fleet dots charging on the bus
        c = AMBER if i % 3 else MOSS
        d.ellipse([x, 1006, x + 18, 1024], fill=c)
    p = OUT / "login-side.png"
    img.convert("RGB").save(p)
    print("wrote", p, img.size)


if __name__ == "__main__":
    save_icon(icon_admin(), "admin")
    save_icon(icon_operator(), "operator")
    save_icon(icon_manager(), "manager")
    save_icon(icon_viewer(), "viewer")
    scene()
