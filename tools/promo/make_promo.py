"""
รูปเรา (RupRao) — 20 s vertical promo (1080x1920, 30 fps), built entirely in code.

    python tools/promo/make_promo.py            # renders media/ruprao-promo-20s.mp4
    python tools/promo/make_promo.py --preview  # every 3rd frame, faster

Everything is timed on a 120 BPM grid (1 beat = 0.5 s = 15 frames): cuts, hits and captions land
on beats. Thai captions are typeset by headless Microsoft Edge (Pillow has no Thai shaping here),
the soundtrack is synthesised with numpy, and frames are piped straight into ffmpeg.
Illustrated people only — no real attendee photos are used.
"""

from __future__ import annotations

import math
import os
import random
import subprocess
import sys
import wave
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont

# ------------------------------------------------------------------ setup

ROOT = Path(__file__).resolve().parents[2]
BUILD = ROOT / "media" / "promo_build"
OUT = ROOT / "media" / "ruprao-promo-20s.mp4"
BRAND = ROOT / "apps" / "web" / "public" / "brand"
EDGE = r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe"
FONT_TH = r"C:\Windows\Fonts\IBMPlexSansThai-Bold.ttf"

W, H, FPS, DUR = 1080, 1920, 30, 20.0
NFRAMES = int(FPS * DUR)
BPM = 120
BEAT = 60 / BPM  # 0.5 s


def b(beats: float) -> float:
    """Beat number -> seconds."""
    return beats * BEAT


INK = (18, 18, 17)
BLUE = (0, 93, 251)
WHITE = (255, 255, 255)
MIST = (246, 246, 245)
LINE = (236, 236, 236)
MUTED = (107, 107, 107)

rng = random.Random(7)

# ------------------------------------------------------------------ easing


def clamp(x, a=0.0, b_=1.0):
    return max(a, min(b_, x))


def prog(t, t0, dur):
    return clamp((t - t0) / dur) if dur > 0 else float(t >= t0)


def ease_out_cubic(p):
    return 1 - (1 - p) ** 3


def ease_in_cubic(p):
    return p**3


def ease_in_out(p):
    return 4 * p**3 if p < 0.5 else 1 - (-2 * p + 2) ** 3 / 2


def ease_out_back(p, s=1.9):
    p -= 1
    return 1 + (s + 1) * p**3 + s * p**2


def ease_out_expo(p):
    return 1 if p >= 1 else 1 - 2 ** (-10 * p)


# ------------------------------------------------------------------ text sprites (Edge)

SPRITES: dict[str, tuple[str, int, str]] = {
    "hook": ("เจอรูปของคุณ ในไม่กี่วินาที", 66, "#121211"),
    "prob1": ("รูปในงาน เป็นพัน ๆ ใบ", 84, "#121211"),
    "prob2": ("หาตัวเองไม่เจอ?", 128, "#FFFFFF"),
    "step1": ("ถ่ายเซลฟี่ 1 รูป", 92, "#121211"),
    "step2": ("AI สแกนใบหน้า", 92, "#121211"),
    "step3": ("เจอรูปที่มีคุณทันที", 88, "#121211"),
    "sel": ("เลือก 4 รูป", 46, "#121211"),
    "btn": ("ดาวน์โหลด", 44, "#FFFFFF"),
    "dl": ("ดาวน์โหลดทีเดียว", 104, "#121211"),
    "dl_sub": ("ทุกรูปที่เลือก ในไฟล์เดียว", 48, "#6B6B6B"),
    "org_label": ("สำหรับผู้จัดงาน", 54, "#005DFB"),
    "org": ("อัปโหลด แล้วแชร์ QR", 88, "#121211"),
    "autoscan": ("สแกนใบหน้าอัตโนมัติ", 44, "#121211"),
    "qr_cap": ("สแกนเพื่อหารูปของคุณ", 46, "#121211"),
    "priv": ("ปลอดภัย เป็นส่วนตัว", 92, "#121211"),
    "p1": ("เซลฟี่ไม่ถูกเก็บ", 58, "#121211"),
    "p2": ("ค้นหาได้เฉพาะในงาน", 58, "#121211"),
    "p3": ("ขอลบรูปได้เสมอ", 58, "#121211"),
    "tag": ("สแกน QR · ถ่ายเซลฟี่ · ได้รูปของคุณ", 54, "#121211"),
    "credit": ("พัฒนาโดย Lutfee", 40, "#6B6B6B"),
    **{f"found{n}": (f"พบ {n} รูป", 84, "#005DFB") for n in range(1, 7)},
    "found7": ("พบ 7 รูปที่มีคุณ", 84, "#005DFB"),
}
SLOT = 260


def render_sprites() -> dict[str, Image.Image]:
    """Typeset every caption in one headless-Edge screenshot, then slice + trim each slot."""
    BUILD.mkdir(parents=True, exist_ok=True)
    keys = list(SPRITES)
    font_url = "file:///" + FONT_TH.replace("\\", "/")
    rows = "\n".join(
        f'<div style="top:{i * SLOT}px;font-size:{size}px;color:{color}">{text}</div>'
        for i, (text, size, color) in enumerate(SPRITES[k] for k in keys)
    )
    html = f"""<!doctype html><html><head><meta charset="utf-8"><style>
@font-face{{font-family:P;src:url("{font_url}")}}
html,body{{margin:0;background:transparent}}
div{{position:absolute;left:0;height:{SLOT}px;line-height:{SLOT}px;padding:0 40px;font-family:P;white-space:nowrap}}
</style></head><body>{rows}</body></html>"""
    page = BUILD / "sprites.html"
    page.write_text(html, encoding="utf-8")
    shot = BUILD / "sprites.png"
    if shot.exists():
        shot.unlink()
    subprocess.run(
        [
            EDGE, "--headless=new", "--disable-gpu", "--hide-scrollbars", "--no-first-run",
            f"--user-data-dir={BUILD / 'edge-profile'}", "--default-background-color=00000000",
            f"--window-size=1600,{SLOT * len(keys)}", f"--screenshot={shot}", page.as_uri(),
        ],
        check=True, timeout=120,
    )
    # msedge.exe hands off to a child process and returns early; wait for the file to settle.
    import time

    last = -1
    for _ in range(240):
        if shot.exists() and shot.stat().st_size == last and last > 0:
            break
        last = shot.stat().st_size if shot.exists() else -1
        time.sleep(0.25)
    sheet = Image.open(shot).convert("RGBA")
    out = {}
    for i, k in enumerate(keys):
        slot = sheet.crop((0, i * SLOT, sheet.width, (i + 1) * SLOT))
        bbox = slot.getchannel("A").getbbox()
        out[k] = slot.crop((bbox[0] - 6, bbox[1] - 6, bbox[2] + 6, bbox[3] + 6)) if bbox else slot
    return out


@lru_cache(maxsize=None)
def latin_font(size: int):
    return ImageFont.truetype(FONT_TH, size)  # Latin + digits shape fine without raqm


# ------------------------------------------------------------------ drawing helpers


def rounded_mask(size, radius):
    m = Image.new("L", size, 0)
    ImageDraw.Draw(m).rounded_rectangle((0, 0, size[0] - 1, size[1] - 1), radius=radius, fill=255)
    return m


@lru_cache(maxsize=None)
def shadow(size, radius, blur=28, alpha=60, spread=6):
    w, h = size
    pad = blur * 2
    s = Image.new("RGBA", (w + pad * 2, h + pad * 2), (0, 0, 0, 0))
    ImageDraw.Draw(s).rounded_rectangle(
        (pad - spread, pad - spread + 14, pad + w + spread, pad + h + spread + 14), radius=radius, fill=(0, 0, 0, alpha)
    )
    return s.filter(ImageFilter.GaussianBlur(blur)), pad


def paste(canvas: Image.Image, img: Image.Image, cx: float, cy: float, scale=1.0, alpha=1.0, rot=0.0):
    """Paste an RGBA image centred at (cx, cy) with scale / opacity / rotation."""
    if alpha <= 0.003 or scale <= 0.01:
        return
    im = img
    if abs(scale - 1) > 1e-3:
        im = im.resize((max(1, int(im.width * scale)), max(1, int(im.height * scale))), Image.BICUBIC)
    if rot:
        im = im.rotate(rot, resample=Image.BICUBIC, expand=True)
    if alpha < 0.999:
        a = im.getchannel("A").point(lambda v: int(v * alpha))
        im = im.copy()
        im.putalpha(a)
    canvas.alpha_composite(im, (int(round(cx - im.width / 2)), int(round(cy - im.height / 2))))


def pop(t, t0, dur=0.18, from_scale=0.6):
    """Caption entrance: (scale, alpha)."""
    p = prog(t, t0, dur)
    if p <= 0:
        return 0.0, 0.0
    return from_scale + (1 - from_scale) * ease_out_back(p), clamp(p * 2.5)


def slam(t, t0, dur=0.14, from_scale=2.2):
    p = prog(t, t0, dur)
    if p <= 0:
        return 0.0, 0.0
    return from_scale + (1 - from_scale) * ease_out_expo(p), clamp(p * 4)


def bg(color=WHITE):
    return Image.new("RGBA", (W, H), color + (255,))


def soft_bg(top=(255, 255, 255), bottom=(240, 244, 252)):
    arr = np.linspace(0, 1, H)[:, None, None]
    g = (np.array(top) * (1 - arr) + np.array(bottom) * arr).astype(np.uint8)
    g = np.repeat(g, W, axis=1)
    return Image.fromarray(np.dstack([g, np.full((H, W), 255, np.uint8)]), "RGBA")


SOFT_BG = None

# ------------------------------------------------------------------ illustrated people & photos

SKINS = [(246, 211, 179), (233, 190, 150), (204, 152, 112), (250, 222, 196), (176, 122, 86)]
HAIRS = [(18, 18, 17), (60, 40, 30), (35, 28, 24), (95, 64, 44), (18, 18, 17)]
SHIRTS = [(255, 122, 89), (46, 196, 140), (255, 196, 61), (155, 107, 255), (38, 198, 218), (255, 105, 160)]
HERO = dict(skin=(246, 211, 179), hair=(18, 18, 17), shirt=BLUE)


def draw_person(d: ImageDraw.ImageDraw, cx, base_y, s, skin, hair, shirt, smile=True):
    """Simple friendly figure: head radius = s, body below; base_y = bottom of torso."""
    head_cy = base_y - s * 2.5
    # torso
    d.rounded_rectangle((cx - s * 1.35, head_cy + s * 1.05, cx + s * 1.35, base_y + s * 0.6), radius=int(s * 0.9), fill=shirt)
    # bowl haircut like the logo: hair dome first, then the face over its lower part
    d.ellipse((cx - s * 1.1, head_cy - s * 1.2, cx + s * 1.1, head_cy + s * 0.55), fill=hair)
    d.ellipse((cx - s * 0.93, head_cy - s * 0.4, cx + s * 0.93, head_cy + s * 1.0), fill=skin)
    # little fringe dip so it reads as hair, not a helmet
    d.ellipse((cx - s * 0.45, head_cy - s * 0.62, cx + s * 0.55, head_cy - s * 0.18), fill=hair)
    # face
    e = max(1, s * 0.11)
    d.ellipse((cx - s * 0.42 - e, head_cy + s * 0.12 - e, cx - s * 0.42 + e, head_cy + s * 0.12 + e), fill=INK)
    d.ellipse((cx + s * 0.42 - e, head_cy + s * 0.12 - e, cx + s * 0.42 + e, head_cy + s * 0.12 + e), fill=INK)
    if smile:
        w = max(1, int(s * 0.1))
        d.arc((cx - s * 0.36, head_cy + s * 0.1, cx + s * 0.36, head_cy + s * 0.62), 20, 160, fill=INK, width=w)


SKIES = [
    ((180, 214, 255), (238, 246, 255)),
    ((255, 214, 196), (255, 244, 236)),
    ((200, 238, 214), (240, 252, 244)),
    ((230, 214, 255), (248, 244, 255)),
    ((255, 236, 186), (255, 250, 236)),
    ((196, 232, 240), (240, 250, 252)),
]


def make_photo(w, h, seed, hero=False, crowd=None):
    r = random.Random(seed)
    top, bot = r.choice(SKIES)
    arr = np.linspace(0, 1, h)[:, None, None]
    g = (np.array(top) * (1 - arr) + np.array(bot) * arr).astype(np.uint8)
    img = Image.fromarray(np.repeat(g, w, axis=1), "RGB").convert("RGBA")
    d = ImageDraw.Draw(img)
    # ground + a sun/blob for depth
    d.ellipse((w * 0.62, h * 0.08, w * 0.9, h * 0.08 + w * 0.28), fill=(255, 255, 255, 140))
    d.rectangle((0, h * 0.8, w, h), fill=(230, 230, 228))
    n = crowd or r.choice([1, 2, 2, 3, 3, 4])
    hero_at = r.randrange(n) if hero else -1
    s = min(w / (n * 3.2), h / 6.5)
    for i in range(n):
        cx = w * (i + 0.5) / n + r.uniform(-s * 0.2, s * 0.2)
        if i == hero_at:
            draw_person(d, cx, h * 0.86, s * 1.08, **HERO)
        else:
            draw_person(d, cx, h * 0.86, s * r.uniform(0.9, 1.05), r.choice(SKINS), r.choice(HAIRS), r.choice(SHIRTS))
    img.putalpha(rounded_mask((w, h), int(min(w, h) * 0.08)))
    return img


def card_with_shadow(img):
    sh, pad = shadow(img.size, int(min(img.size) * 0.08), blur=22, alpha=45, spread=2)
    out = sh.copy()
    out.alpha_composite(img, (pad, pad))
    return out


def scan_corners(d, x0, y0, x1, y1, color, width, length):
    r = length * 0.6
    for (ax, ay, sx, sy) in ((x0, y0, 1, 1), (x1, y0, -1, 1), (x0, y1, 1, -1), (x1, y1, -1, -1)):
        d.line((ax, ay + sy * length, ax, ay + sy * r), fill=color, width=width)
        d.line((ax + sx * r, ay, ax + sx * length, ay), fill=color, width=width)
        box = (min(ax, ax + sx * 2 * r), min(ay, ay + sy * 2 * r), max(ax, ax + sx * 2 * r), max(ay, ay + sy * 2 * r))
        start = {(1, 1): 180, (-1, 1): 270, (1, -1): 90, (-1, -1): 0}[(sx, sy)]
        d.arc(box, start, start + 90, fill=color, width=width)


def scan_line(canvas, x0, x1, y, alpha=1.0, thick=6):
    layer = Image.new("RGBA", (int(x1 - x0) + 80, 120), (0, 0, 0, 0))
    ld = ImageDraw.Draw(layer)
    ld.rounded_rectangle((40, 60 - thick, layer.width - 40, 60 + thick), radius=thick, fill=BLUE + (int(255 * alpha),))
    glow = layer.filter(ImageFilter.GaussianBlur(16))
    canvas.alpha_composite(glow, (int(x0 - 40), int(y - 60)))
    canvas.alpha_composite(glow, (int(x0 - 40), int(y - 60)))
    canvas.alpha_composite(layer, (int(x0 - 40), int(y - 60)))


def check_badge(size, color=BLUE):
    im = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    d.ellipse((0, 0, size - 1, size - 1), fill=color + (255,), outline=WHITE, width=max(2, size // 12))
    w = max(3, size // 9)
    d.line((size * 0.28, size * 0.52, size * 0.44, size * 0.68, size * 0.74, size * 0.34), fill=WHITE, width=w, joint="curve")
    return im


def pill(text_img, pad_x=40, pad_y=22, fill=WHITE, icon=None):
    w = text_img.width + pad_x * 2 + (text_img.height + 10 if icon else 0)
    h = text_img.height + pad_y * 2
    im = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    d.rounded_rectangle((0, 0, w - 1, h - 1), radius=h // 2, fill=fill + (255,), outline=LINE, width=2)
    x = pad_x
    if icon:
        ic = icon.resize((text_img.height, text_img.height), Image.LANCZOS)
        im.alpha_composite(ic, (pad_x - 8, (h - ic.height) // 2))
        x += ic.width + 10
    im.alpha_composite(text_img, (x, pad_y))
    return card_with_shadow(im)


def step_badge(n, size=96):
    im = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    d.ellipse((0, 0, size - 1, size - 1), fill=BLUE + (255,))
    f = latin_font(int(size * 0.56))
    tw = d.textlength(str(n), font=f)
    d.text(((size - tw) / 2, size * 0.12), str(n), font=f, fill=WHITE)
    return im


def lock_icon(size=80):
    im = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    d.ellipse((0, 0, size - 1, size - 1), fill=BLUE + (255,))
    s = size
    d.rounded_rectangle((s * 0.28, s * 0.45, s * 0.72, s * 0.76), radius=int(s * 0.06), fill=WHITE)
    d.arc((s * 0.34, s * 0.22, s * 0.66, s * 0.6), 180, 360, fill=WHITE, width=max(3, s // 12))
    return im


def qr_card(size, mark):
    r = random.Random(3)
    n = 25
    cell = size / (n + 4)
    im = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    d.rounded_rectangle((0, 0, size - 1, size - 1), radius=int(size * 0.08), fill=WHITE)
    off = cell * 2

    def mod(i, j):
        d.rounded_rectangle((off + i * cell, off + j * cell, off + (i + 1) * cell - 1, off + (j + 1) * cell - 1), radius=int(cell * 0.25), fill=INK)

    finder = {(i, j) for fi, fj in ((0, 0), (n - 7, 0), (0, n - 7)) for i in range(fi, fi + 7) for j in range(fj, fj + 7)}
    for i in range(n):
        for j in range(n):
            if (i, j) in finder or (9 <= i <= 15 and 9 <= j <= 15):
                continue
            if r.random() < 0.48:
                mod(i, j)
    for fi, fj in ((0, 0), (n - 7, 0), (0, n - 7)):
        x0, y0 = off + fi * cell, off + fj * cell
        d.rounded_rectangle((x0, y0, x0 + 7 * cell, y0 + 7 * cell), radius=int(cell * 1.6), fill=INK)
        d.rounded_rectangle((x0 + cell, y0 + cell, x0 + 6 * cell, y0 + 6 * cell), radius=int(cell * 1.2), fill=WHITE)
        d.rounded_rectangle((x0 + 2 * cell, y0 + 2 * cell, x0 + 5 * cell, y0 + 5 * cell), radius=int(cell * 0.8), fill=INK)
    m = mark.resize((int(cell * 6.4), int(cell * 6.4)), Image.LANCZOS)
    d.rounded_rectangle((size / 2 - cell * 3.6, size / 2 - cell * 3.6, size / 2 + cell * 3.6, size / 2 + cell * 3.6), radius=int(cell), fill=WHITE)
    im.alpha_composite(m, (int(size / 2 - m.width / 2), int(size / 2 - m.height / 2)))
    return card_with_shadow(im)


# ------------------------------------------------------------------ assets

@dataclass
class Assets:
    mark: Image.Image
    wordmark: Image.Image
    spr: dict
    wall: list
    hero_photos: list
    thumbs: list
    hero_face: Image.Image
    qr: Image.Image
    badges: dict


def load_assets() -> Assets:
    mark = Image.open(BRAND / "ruprao-mark.png").convert("RGBA")
    word = Image.open(BRAND / "ruprao-wordmark.png").convert("RGBA")
    spr = render_sprites()

    wall = [card_with_shadow(make_photo(320, rng.choice([380, 420, 300]), 100 + i)) for i in range(36)]
    hero_photos = [make_photo(470, h, 300 + i, hero=True) for i, h in enumerate([560, 420, 470, 600, 430, 520])]
    thumbs = [make_photo(230, 230, 500 + i, hero=(i % 2 == 0), crowd=(i % 3) + 1) for i in range(10)]

    # big hero portrait for selfie / scan
    face = Image.new("RGBA", (900, 900), (0, 0, 0, 0))
    draw_person(ImageDraw.Draw(face), 450, 980, 260, **HERO)
    badges = {
        "check": check_badge(84),
        "step1": step_badge(1),
        "step2": step_badge(2),
        "step3": step_badge(3),
        "lock": lock_icon(80),
    }
    return Assets(mark, word, spr, wall, hero_photos, thumbs, face, qr_card(560, mark), badges)


# ------------------------------------------------------------------ scenes (local time lt in seconds)

def scene_hook(A: Assets, t):
    c = SOFT_BG.copy()
    s, a = slam(t, 0.0, dur=0.16, from_scale=2.6)
    paste(c, A.mark, W / 2, 760, scale=0.78 * s, alpha=a)
    if t > 0.15:  # scan line over the symbol
        ph = (t - 0.15) / BEAT
        y = 760 - 150 + 300 * (0.5 - 0.5 * math.cos(math.pi * ph))
        scan_line(c, W / 2 - 170, W / 2 + 170, y, alpha=0.85, thick=4)
    s2, a2 = slam(t, b(1), dur=0.12, from_scale=1.9)
    paste(c, A.wordmark, W / 2, 1150 + (1 - min(1, s2 if s2 else 0)) * 0, scale=0.82 * s2, alpha=a2)
    s3, a3 = pop(t, b(1.5), 0.2)
    paste(c, A.spr["hook"], W / 2, 1330, scale=s3, alpha=a3)
    return c


def scene_problem(A: Assets, t):
    c = SOFT_BG.copy()
    # endless wall scrolling up, decelerating into a hold at beat 2 (local)
    speed_p = ease_out_cubic(prog(t, 0, b(2)))
    offset = 2600 * speed_p + 40 * t
    cols = 3
    colw = W / cols
    for k, card in enumerate(A.wall):
        col = k % cols
        row = k // cols
        x = colw * (col + 0.5)
        y = 300 + row * 430 + (col % 2) * 180 - offset
        if -300 < y < H + 300:
            c.alpha_composite(card, (int(x - card.width / 2), int(y - card.height / 2)))
    # caption 1 on a white plate (top)
    s, a = pop(t, b(0.5), 0.2)
    if a:
        plate = pill(A.spr["prob1"], pad_x=48, pad_y=26)
        paste(c, plate, W / 2, 330, scale=s, alpha=a)
    # beat 2: dim + slam the question
    p = prog(t, b(2), 0.08)
    if p > 0:
        dim = Image.new("RGBA", (W, H), (10, 12, 20, int(190 * p)))
        c.alpha_composite(dim)
        s2, a2 = slam(t, b(2), 0.12, 2.0)
        paste(c, A.spr["prob2"], W / 2, H / 2, scale=s2, alpha=a2)
    return c


def phone(screen: Image.Image, w=640, h=1240):
    im = Image.new("RGBA", (w + 60, h + 60), (0, 0, 0, 0))
    sh, pad = shadow((w, h), 90, blur=30, alpha=70)
    im.alpha_composite(sh.resize((w + 60, h + 60)), (0, 0))
    body = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    bd = ImageDraw.Draw(body)
    bd.rounded_rectangle((0, 0, w - 1, h - 1), radius=90, fill=INK)
    inset = 22
    sc = screen.resize((w - inset * 2, h - inset * 2), Image.BICUBIC)
    sc.putalpha(rounded_mask(sc.size, 70))
    body.alpha_composite(sc, (inset, inset))
    bd.rounded_rectangle((w / 2 - 70, inset + 18, w / 2 + 70, inset + 50), radius=16, fill=INK)  # notch
    im.alpha_composite(body, (30, 20))
    return im


def selfie_screen(A: Assets, t, flash=0.0, frozen=False):
    sw, sh = 596, 1196
    sc = Image.new("RGBA", (sw, sh), (0, 0, 0, 255))
    arr = np.linspace(0, 1, sh)[:, None, None]
    g = (np.array((214, 230, 255)) * (1 - arr) + np.array((250, 247, 240)) * arr).astype(np.uint8)
    sc = Image.fromarray(np.repeat(g, sw, axis=1), "RGB").convert("RGBA")
    bob = 0 if frozen else math.sin(t * 5) * 6
    face = A.hero_face.resize((560, 560), Image.BICUBIC)
    sc.alpha_composite(face, (int(sw / 2 - 280), int(sh / 2 - 330 + bob)))
    d = ImageDraw.Draw(sc)
    scan_corners(d, 110, 300, sw - 110, 820, WHITE, 10, 70)
    # shutter
    d.ellipse((sw / 2 - 62, sh - 190, sw / 2 + 62, sh - 66), outline=WHITE, width=8)
    d.ellipse((sw / 2 - 48, sh - 176, sw / 2 + 48, sh - 80), fill=WHITE)
    if flash > 0:
        sc.alpha_composite(Image.new("RGBA", sc.size, (255, 255, 255, int(255 * flash))))
    return sc


def caption_with_step(c, A, key, step, t, y=300, t0=0.0):
    s, a = pop(t, t0, 0.2)
    paste(c, A.badges[step], W / 2, y - 110, scale=s, alpha=a)
    s2, a2 = pop(t, t0 + 0.06, 0.2)
    paste(c, A.spr[key], W / 2, y, scale=s2, alpha=a2)


def scene_selfie(A: Assets, t):
    c = SOFT_BG.copy()
    shutter = b(2)  # local beat 2
    flash = clamp(1 - (t - shutter) / 0.25) if t >= shutter else 0.0
    ph = phone(selfie_screen(A, t, flash=flash, frozen=t >= shutter))
    press = 1 - 0.04 * math.exp(-max(0, t - shutter) / 0.08) if t >= shutter else 1.0
    s, a = pop(t, 0.0, 0.22, 0.85)
    paste(c, ph, W / 2, 1150, scale=0.92 * s * press, alpha=a)
    caption_with_step(c, A, "step1", "step1", t, y=330, t0=b(0.25))
    return c


def scene_scan(A: Assets, t):
    c = SOFT_BG.copy()
    d = ImageDraw.Draw(c)
    cx, cy = W / 2, 980
    # orbiting thumbnails that get matched on beats
    hits = [b(1), b(1.5), b(2), b(2.5), b(3)]
    n = len(A.thumbs)
    for i, th in enumerate(A.thumbs):
        ang = (i / n) * math.tau + t * 0.9
        rad = 450
        x, y = cx + math.cos(ang) * rad, cy + math.sin(ang) * rad * 0.95
        inn = ease_out_back(prog(t, 0.04 * i, 0.3))
        th_s = 0.72 * inn
        matched_idx = [0, 2, 4, 6, 8]
        hit_t = hits[matched_idx.index(i)] if i in matched_idx else None
        dim = 0.35 if (hit_t is None and t > hits[0]) else 1.0
        paste(c, card_with_shadow(th) if False else th, x, y, scale=th_s, alpha=dim)
        if hit_t is not None and t >= hit_t:
            pk = ease_out_back(prog(t, hit_t, 0.16), 3)
            ring = Image.new("RGBA", (190, 190), (0, 0, 0, 0))
            ImageDraw.Draw(ring).rounded_rectangle((3, 3, 186, 186), radius=22, outline=BLUE + (255,), width=8)
            paste(c, ring, x, y, scale=th_s * 1.0 * pk, alpha=1)
            paste(c, A.badges["check"], x + 60, y - 60, scale=0.75 * pk, alpha=1)
    # hero face in a circle with scan frame
    face = A.hero_face.resize((600, 600), Image.BICUBIC)
    disc = Image.new("RGBA", (440, 440), (0, 0, 0, 0))
    ImageDraw.Draw(disc).ellipse((0, 0, 439, 439), fill=(232, 240, 255, 255))
    disc.alpha_composite(face, (-80, -40))
    disc.putalpha(Image.composite(disc.getchannel("A"), Image.new("L", disc.size, 0), rounded_mask(disc.size, 220)))
    paste(c, disc, cx, cy, scale=1.0)
    scan_corners(d, cx - 270, cy - 270, cx + 270, cy + 270, INK, 12, 80)
    ph = t / BEAT
    y = cy - 230 + 460 * (0.5 - 0.5 * math.cos(math.pi * ph))
    scan_line(c, cx - 250, cx + 250, y, thick=5)
    caption_with_step(c, A, "step2", "step2", t, y=300, t0=b(0.25))
    # counter
    k = sum(t >= h for h in hits)
    if k:
        key = f"found{min(7, [1, 2, 3, 5, 7][k - 1])}"
        last = hits[k - 1]
        s = 1 + 0.18 * math.exp(-(t - last) / 0.08)
        paste(c, A.spr[key], W / 2, 1640, scale=s)
    return c


def gallery_layout():
    # two-column masonry of hero photos
    cols = [[], []]
    heights = [0, 0]
    out = []
    for i, ph in enumerate(range(6)):
        col = heights.index(min(heights))
        h = [560, 420, 470, 600, 430, 520][i] * 0.9
        x = 270 + col * 540
        y = 620 + heights[col] + h / 2
        heights[col] += h + 36
        out.append((x, y, h))
    return out


GALLERY = gallery_layout()
PCTS = ["100%", "98.2%", "97.8%", "97.3%", "96.1%", "95.4%"]


def scene_results(A: Assets, t):
    """Results grid -> tick 4 photos on beats -> selection bar -> download (local 0..b(7))."""
    c = SOFT_BG.copy()
    scroll = 60 * t  # never fully still
    dl_t = b(4)  # local: press download
    dim_after = prog(t, dl_t + 0.06, 0.15)
    for i, (x, y, h) in enumerate(GALLERY):
        drop = ease_out_back(prog(t, b(0.25) * i, 0.28), 1.4)
        if drop <= 0:
            continue
        img = A.hero_photos[i].resize((500, int(h)), Image.BICUBIC)
        d = ImageDraw.Draw(img)
        f = latin_font(30)
        tw = d.textlength(PCTS[i], font=f)
        d.rounded_rectangle((18, img.height - 70, 18 + tw + 36, img.height - 20), radius=25, fill=(255, 255, 255, 235))
        d.text((36, img.height - 70), PCTS[i], font=f, fill=INK)
        card = card_with_shadow(img)
        yy = y - scroll + (1 - drop) * 220
        paste(c, card, x, yy, scale=0.9 + 0.1 * drop, alpha=clamp(drop * 1.5) * (1 - 0.6 * dim_after))
        tick_t = b(2) + b(0.5) * i if i < 4 else None
        if tick_t is not None and t >= tick_t:
            pk = ease_out_back(prog(t, tick_t, 0.14), 3)
            paste(c, A.badges["check"], x - 190, yy - h / 2 + 70, scale=pk, alpha=1 - 0.6 * dim_after)
    # caption plate
    s, a = pop(t, b(0.25), 0.2)
    if a:
        cap = Image.new("RGBA", (W, 420), (255, 255, 255, 0))
        c.alpha_composite(Image.fromarray(np.dstack([np.full((420, W, 3), 255, np.uint8),
                                                   (np.linspace(255, 0, 420)[:, None] * np.ones((1, W))).astype(np.uint8)]), "RGBA"), (0, 0))
        caption_with_step(c, A, "step3", "step3", t, y=300, t0=b(0.25))
    # selection bar
    bar_p = ease_out_back(prog(t, b(2.25), 0.25), 1.2)
    if bar_p > 0:
        bw, bh = 900, 150
        bar = Image.new("RGBA", (bw, bh), (0, 0, 0, 0))
        bd = ImageDraw.Draw(bar)
        bd.rounded_rectangle((0, 0, bw - 1, bh - 1), radius=75, fill=WHITE, outline=LINE, width=2)
        bar.alpha_composite(A.spr["sel"], (60, (bh - A.spr["sel"].height) // 2))
        press = 0.92 if dl_t <= t < dl_t + 0.1 else 1.0
        btn = Image.new("RGBA", (360, 104), (0, 0, 0, 0))
        ImageDraw.Draw(btn).rounded_rectangle((0, 0, 359, 103), radius=52, fill=INK)
        btn.alpha_composite(A.spr["btn"], ((360 - A.spr["btn"].width) // 2, (104 - A.spr["btn"].height) // 2))
        bar.alpha_composite(btn.resize((int(360 * press), int(104 * press))), (bw - 380 + int(360 * (1 - press) / 2), (bh - int(104 * press)) // 2))
        paste(c, card_with_shadow(bar), W / 2, H - 170 + (1 - bar_p) * 300, alpha=1 - 0.6 * dim_after)
    # download payoff
    if t >= dl_t:
        wash = prog(t, dl_t, 0.18)
        c.alpha_composite(Image.new("RGBA", (W, H), (255, 255, 255, int(235 * wash))))
        p = ease_out_back(prog(t, dl_t + 0.04, 0.22), 1.6)
        icon = Image.new("RGBA", (300, 300), (0, 0, 0, 0))
        idr = ImageDraw.Draw(icon)
        idr.ellipse((0, 0, 299, 299), fill=BLUE)
        idr.line((150, 70, 150, 190), fill=WHITE, width=24)
        idr.line((92, 140, 150, 198, 208, 140), fill=WHITE, width=24, joint="curve")
        idr.line((86, 228, 214, 228), fill=WHITE, width=22)
        fly = (1 - ease_out_cubic(prog(t, dl_t, 0.3))) * 600
        paste(c, icon, W / 2, 820 + fly, scale=p)
        s2, a2 = pop(t, dl_t + b(0.5), 0.2)
        paste(c, A.spr["dl"], W / 2, 1110, scale=s2, alpha=a2)
        s3, a3 = pop(t, dl_t + b(1), 0.2)
        paste(c, A.spr["dl_sub"], W / 2, 1230, scale=s3, alpha=a3)
    return c


def scene_organizer(A: Assets, t):
    c = SOFT_BG.copy()
    s, a = pop(t, b(0.25), 0.18)
    paste(c, A.spr["org_label"], W / 2, 210, scale=s, alpha=a)
    s, a = pop(t, b(0.4), 0.2)
    paste(c, A.spr["org"], W / 2, 320, scale=s, alpha=a)
    qr_t = b(3)
    box_alpha = 1 - prog(t, qr_t - 0.05, 0.12)
    if box_alpha > 0:
        # upload box
        bx = Image.new("RGBA", (820, 620), (0, 0, 0, 0))
        bd = ImageDraw.Draw(bx)
        bd.rounded_rectangle((0, 0, 819, 619), radius=60, fill=WHITE, outline=(200, 205, 215), width=4)
        bd.line((410, 200, 410, 330), fill=BLUE, width=22)
        bd.line((350, 260, 410, 198, 470, 260), fill=BLUE, width=22, joint="curve")
        pr = ease_in_out(prog(t, b(0.75), b(2)))
        bd.rounded_rectangle((110, 450, 710, 482), radius=16, fill=LINE)
        bd.rounded_rectangle((110, 450, 110 + 600 * pr, 482), radius=16, fill=BLUE)
        f = latin_font(40)
        txt = f"{int(pr * 248)} / 248"
        bd.text((410 - bd.textlength(txt, font=f) / 2, 370), txt, font=f, fill=INK)
        paste(c, card_with_shadow(bx), W / 2, 980, alpha=box_alpha)
        # photos flying in on 8ths
        for i in range(6):
            ft = b(0.75) + b(0.5) * i
            fp = prog(t, ft, 0.32)
            if 0 < fp < 1:
                x = W / 2 + (i - 2.5) * 140 * (1 - fp)
                y = 1800 - ease_in_cubic(fp) * 820
                paste(c, A.wall[i], x, y, scale=0.55 * (1 - 0.6 * fp), alpha=box_alpha * (1 - fp ** 4), rot=(i - 2.5) * 8 * (1 - fp))
        if pr >= 1:
            s2, a2 = pop(t, b(2.75), 0.2)
            plate = pill(A.spr["autoscan"], icon=A.badges["check"])
            paste(c, plate, W / 2, 1420, scale=s2, alpha=a2 * box_alpha)
    if t >= qr_t:
        s2, a2 = slam(t, qr_t, 0.14, 1.8)
        paste(c, A.qr, W / 2, 1010, scale=s2, alpha=a2)
        s3, a3 = pop(t, qr_t + b(0.5), 0.2)
        paste(c, A.spr["qr_cap"], W / 2, 1400, scale=s3, alpha=a3)
    return c


def scene_privacy(A: Assets, t):
    c = SOFT_BG.copy()
    s, a = pop(t, b(0.25), 0.2)
    paste(c, A.spr["priv"], W / 2, 620, scale=s, alpha=a)
    for i, key in enumerate(["p1", "p2", "p3"]):
        t0 = b(0.75 + 0.75 * i)
        p = prog(t, t0, 0.22)
        if p > 0:
            plate = pill(A.spr[key], pad_x=46, pad_y=30, icon=A.badges["lock"])
            x = W / 2 + (1 - ease_out_cubic(p)) * (700 if i % 2 == 0 else -700)
            paste(c, plate, x, 900 + i * 250, scale=1.15, alpha=clamp(p * 3))
    return c


def scene_end(A: Assets, t):
    c = SOFT_BG.copy()
    s, a = slam(t, 0.0, 0.16, 2.8)
    paste(c, A.mark, W / 2, 700, scale=0.86 * s, alpha=a)
    if t > 0.2:
        ph = (t - 0.2) / BEAT
        y = 700 - 165 + 330 * (0.5 - 0.5 * math.cos(math.pi * ph))
        scan_line(c, W / 2 - 185, W / 2 + 185, y, alpha=0.85, thick=4)
    s2, a2 = slam(t, b(1), 0.12, 1.9)
    paste(c, A.wordmark, W / 2, 1110, scale=0.9 * s2, alpha=a2)
    s3, a3 = pop(t, b(2), 0.22)
    paste(c, A.spr["tag"], W / 2, 1290, scale=s3, alpha=a3)
    s4, a4 = pop(t, b(3), 0.25, 0.9)
    paste(c, A.spr["credit"], W / 2, 1720, scale=s4, alpha=a4)
    return c


# ------------------------------------------------------------------ timeline

# (name, fn, start_beat, end_beat)
SCENES = [
    ("hook", scene_hook, 0, 4),
    ("problem", scene_problem, 4, 8),
    ("selfie", scene_selfie, 8, 12),
    ("scan", scene_scan, 12, 16),
    ("results", scene_results, 16, 23),
    ("organizer", scene_organizer, 23, 28),
    ("privacy", scene_privacy, 28, 32),
    ("end", scene_end, 32, 40),
]

# transitions at scene boundaries: kind, direction
TRANS = {
    4: ("crash_in", None),
    8: ("whip", (-1, 0)),
    12: ("crash_in", None),
    16: ("whip", (0, -1)),
    23: ("whip", (1, 0)),
    28: ("crash_out", None),
    32: ("crash_in", None),
}
WHIP_DUR = 0.2          # seconds, centred on the cut
CRASH_PRE, CRASH_POST = 0.14, 0.22

# camera impacts: (time, punch zoom, shake px)
IMPACTS = [
    (0.0, 0.16, 26), (b(1), 0.07, 14), (b(4), 0.05, 10), (b(6), 0.12, 24), (b(10), 0.06, 12),
    (b(12), 0.05, 10), (b(13), 0.03, 6), (b(14), 0.03, 6), (b(15), 0.05, 10), (b(20), 0.08, 16),
    (b(26), 0.12, 22), (b(28.75), 0.03, 6), (b(29.5), 0.03, 6), (b(30.25), 0.03, 6),
    (b(32), 0.18, 30), (b(33), 0.07, 14), (b(34), 0.04, 8), (b(35), 0.03, 6), (b(36), 0.02, 4), (b(38), 0.05, 10),
]


def scene_at(t):
    for i, (name, fn, sb, eb) in enumerate(SCENES):
        if b(sb) <= t < b(eb) or i == len(SCENES) - 1:
            return i
    return len(SCENES) - 1


def camera(t, idx):
    """Continuous drift per scene + punches + decaying shake."""
    name, fn, sb, eb = SCENES[idx]
    lt = t - b(sb)
    zoom = 1.0 + 0.045 * lt / (b(eb) - b(sb))
    dx = dy = rot = 0.0
    if name in ("selfie", "privacy", "organizer"):
        rot = 0.6 * math.sin(lt * 1.3)
    for ti, pz, sh in IMPACTS:
        if t >= ti:
            k = math.exp(-(t - ti) / 0.11)
            zoom += pz * k
            dx += sh * k * math.sin(91 * (t - ti) + ti * 13)
            dy += sh * k * math.cos(77 * (t - ti) + ti * 7)
    return zoom, dx, dy, rot


def cam_transform(img: Image.Image, zoom, dx, dy, rot, fill):
    r = math.radians(rot)
    cs, sn = math.cos(r), math.sin(r)
    cx, cy = W / 2, H / 2
    a, bb = cs / zoom, sn / zoom
    d, e = -sn / zoom, cs / zoom
    c = cx - (cs * (cx + dx) + sn * (cy + dy)) / zoom
    f = cy - (-sn * (cx + dx) + cs * (cy + dy)) / zoom
    return img.transform((W, H), Image.AFFINE, (a, bb, c, d, e, f), resample=Image.BILINEAR, fillcolor=fill)


def render_scene(A, idx, t):
    name, fn, sb, eb = SCENES[idx]
    return fn(A, max(0.0, t - b(sb))).convert("RGB")


def shot(A, idx, t, extra_zoom=1.0, extra_dx=0.0, extra_dy=0.0, samples=1, spread=None, cache=None):
    """Scene idx at time t through the camera; motion-blurred over `samples` camera positions."""
    key = (idx, round(t, 4))
    img = cache.get(key) if cache is not None else None
    if img is None:
        img = render_scene(A, idx, t)
        if cache is not None:
            cache[key] = img
    z, dx, dy, rot = camera(t, idx)
    if samples <= 1:
        return np.asarray(cam_transform(img, z * extra_zoom, dx + extra_dx, dy + extra_dy, rot, WHITE), np.float32)
    acc = np.zeros((H, W, 3), np.float32)
    for k in range(samples):
        zz, xx, yy = spread(k / (samples - 1))
        acc += np.asarray(cam_transform(img, z * zz, dx + xx, dy + yy, rot, WHITE), np.float32)
    return acc / samples


def frame_at(A, t, cache):
    # find a transition window
    for beat, (kind, direction) in TRANS.items():
        tc = b(beat)
        out_idx = scene_at(tc - 1e-4)
        in_idx = scene_at(tc + 1e-4)
        if kind == "whip" and abs(t - tc) <= WHIP_DUR / 2:
            p0 = (t - (tc - WHIP_DUR / 2)) / WHIP_DUR
            ex, ey = direction
            dist = W if ex else H
            step = 1 / FPS / WHIP_DUR

            def off(p):
                return ease_in_out(clamp(p)) * dist

            acc = np.zeros((H, W, 3), np.float32)
            n = 28  # enough sub-frames that the smear reads as a streak, not stacked copies
            img_a = render_scene(A, out_idx, min(t, tc - 1e-3))
            img_b = render_scene(A, in_idx, max(t, tc))
            za, dxa, dya, ra = camera(min(t, tc - 1e-3), out_idx)
            zb, dxb, dyb, rb = camera(max(t, tc), in_idx)
            for k in range(n):
                p = p0 - step * 0.9 * (k / (n - 1))
                o = off(p)
                base = Image.new("RGB", (W, H), WHITE)
                a_img = cam_transform(img_a, za, dxa + ex * -o, dya + ey * -o, ra, WHITE)
                b_img = cam_transform(img_b, zb, dxb + ex * (dist - o), dyb + ey * (dist - o), rb, WHITE)
                # composite: whichever side the pixel belongs to
                arr_a = np.asarray(a_img, np.float32)
                arr_b = np.asarray(b_img, np.float32)
                if ex:
                    split = int(W - o) if ex > 0 else int(o)
                    frame = arr_a.copy()
                    if ex > 0:
                        frame[:, split:] = arr_b[:, split:]
                    else:
                        frame[:, :split] = arr_b[:, :split]
                else:
                    split = int(H - o) if ey > 0 else int(o)
                    frame = arr_a.copy()
                    if ey > 0:
                        frame[split:] = arr_b[split:]
                    else:
                        frame[:split] = arr_b[:split]
                acc += frame
            return acc / n
        if kind in ("crash_in", "crash_out") and tc - CRASH_PRE <= t < tc + CRASH_POST:
            zoom_in = kind == "crash_in"
            if t < tc:
                p = (t - (tc - CRASH_PRE)) / CRASH_PRE
                target = 9.0 if zoom_in else 0.25

                def spread(k, p=p):
                    pp = clamp(p - k * 0.2)
                    return (1 + (target - 1) * ease_in_cubic(pp) if zoom_in else 1 - (1 - target) * ease_in_cubic(pp)), 0, 0

                return shot(A, out_idx, t, samples=24, spread=spread, cache=cache)
            p = (t - tc) / CRASH_POST
            start = 0.35 if zoom_in else 2.4

            def spread(k, p=p):
                pp = clamp(p - k * 0.16)
                return start + (1 - start) * ease_out_expo(pp), 0, 0

            frame = shot(A, in_idx, t, samples=18, spread=spread, cache=cache)
            flash = clamp(1 - (t - tc) / 0.09)
            return frame * (1 - flash) + 255 * flash
    return shot(A, scene_at(t), t, cache=cache)


# ------------------------------------------------------------------ audio

SR = 44100


def synth_audio(path: Path):
    n = int(SR * (DUR + 0.6))
    out = np.zeros(n, np.float64)
    t_all = np.arange(n) / SR
    rngn = np.random.default_rng(1)

    def add(sig, at, gain=1.0):
        i = int(at * SR)
        j = min(n, i + len(sig))
        if i < n:
            out[i:j] += gain * sig[: j - i]

    def env(dur, decay):
        tt = np.arange(int(dur * SR)) / SR
        return tt, np.exp(-tt / decay)

    def kick():
        tt, e = env(0.45, 0.16)
        f = 48 + 110 * np.exp(-tt / 0.035)
        ph = 2 * np.pi * np.cumsum(f) / SR
        click = rngn.standard_normal(len(tt)) * np.exp(-tt / 0.004) * 0.3
        return np.tanh(2.2 * np.sin(ph) * e) + click

    def clap():
        tt, e = env(0.25, 0.07)
        nz = rngn.standard_normal(len(tt))
        nz = np.diff(np.concatenate([[0], nz]))  # brighten
        bursts = sum(np.exp(-np.clip(tt - d, 0, None) / 0.008) * (tt >= d) for d in (0, 0.012, 0.024))
        return nz * e * 0.6 + nz * bursts * 0.25

    def hat(open_=False):
        tt, e = env(0.18 if open_ else 0.05, 0.05 if open_ else 0.012)
        nz = np.diff(np.concatenate([[0], rngn.standard_normal(len(tt))]))
        return nz * e * 0.35

    def bass_note(freq, dur):
        tt = np.arange(int(dur * SR)) / SR
        saw = 2 * ((tt * freq) % 1) - 1
        sub = np.sin(2 * np.pi * freq / 2 * tt)
        y = 0.55 * saw + 0.6 * sub
        # one-pole lowpass with a short filter envelope
        cutoff = 300 + 1600 * np.exp(-tt / 0.06)
        alpha = 1 - np.exp(-2 * np.pi * cutoff / SR)
        z = np.zeros_like(y)
        acc = 0.0
        for k in range(len(y)):
            acc += alpha[k] * (y[k] - acc)
            z[k] = acc
        return z * np.minimum(1, tt / 0.004) * np.exp(-tt / 0.18)

    def pluck(freq, dur=0.22):
        tt = np.arange(int(dur * SR)) / SR
        sq = np.sign(np.sin(2 * np.pi * freq * tt)) * 0.5 + np.sin(2 * np.pi * freq * 2 * tt) * 0.3
        return sq * np.exp(-tt / 0.07) * 0.18

    def whoosh(dur=0.32, up=True):
        tt = np.arange(int(dur * SR)) / SR
        nz = rngn.standard_normal(len(tt))
        # band sweep via crude resonant filter (moving average differences)
        e = np.sin(np.pi * tt / dur) ** 2
        sweep = np.convolve(nz, np.ones(6) / 6, mode="same") if up else nz
        return sweep * e * 0.5

    def impact():
        tt, e = env(1.2, 0.35)
        boom = np.sin(2 * np.pi * (38 + 60 * np.exp(-tt / 0.08)) * tt) * e
        nz = rngn.standard_normal(len(tt)) * np.exp(-tt / 0.05) * 0.4
        return np.tanh(1.8 * boom) + nz

    def riser(dur):
        tt = np.arange(int(dur * SR)) / SR
        nz = rngn.standard_normal(len(tt))
        tone = np.sin(2 * np.pi * np.cumsum(200 + 1400 * (tt / dur) ** 2) / SR)
        return (nz * 0.25 + tone * 0.25) * (tt / dur) ** 2

    music_end = b(38)
    roots = [55.0, 43.65, 65.41, 49.0]  # A1 F1 C2 G1
    arp = [0, 7, 12, 15, 12, 7, 19, 12]
    for beat in range(40):
        t0 = b(beat)
        if t0 >= music_end:
            break
        intro = beat < 1
        add(kick(), t0, 0.95)
        if beat % 2 == 1:
            add(clap(), t0, 0.5)
        for s in range(4):  # 16th hats
            add(hat(open_=(s == 2)), t0 + s * BEAT / 4, 0.55 if s == 2 else 0.3)
        root = roots[(beat // 4) % 4]
        if not intro and not (28 <= beat < 32 and beat % 2):  # thin out under the riser a little
            add(bass_note(root * 2, BEAT / 2 * 0.95), t0 + BEAT / 2, 0.55)
            add(bass_note(root * 2, BEAT / 4 * 0.9), t0 + BEAT * 0.75, 0.35)
        if beat >= 4:
            for s in range(4):
                semis = arp[(beat * 4 + s) % len(arp)]
                add(pluck(root * 4 * 2 ** (semis / 12)), t0 + s * BEAT / 4, 0.6)

    # sidechain duck everything melodic under the kick
    duck = np.ones(n)
    for beat in range(40):
        i = int(b(beat) * SR)
        L = int(0.22 * SR)
        if i < n:
            seg = 1 - 0.55 * np.exp(-np.arange(min(L, n - i)) / SR / 0.06)
            duck[i : i + len(seg)] = np.minimum(duck[i : i + len(seg)], seg)
    out *= duck

    for beat, (kind, _) in TRANS.items():
        add(whoosh(0.34), b(beat) - 0.22, 0.9)
    for ti, pz, sh in IMPACTS:
        if pz >= 0.07:
            add(impact(), ti, 0.55 + pz * 2)
    add(riser(b(4)), b(28), 0.7)
    for k in range(4):  # selection ticks
        add(pluck(1760, 0.12), b(18) + b(0.5) * k, 1.4)
    add(pluck(2093, 0.25), b(10), 1.6)  # shutter
    add(impact(), b(38), 1.0)

    # master: gentle fade at the very end, soft clip, stereo widen hats slightly
    out[int(19.6 * SR):] *= np.linspace(1, 0, n - int(19.6 * SR))
    out = np.tanh(out * 0.9) * 0.92
    left = out
    right = np.roll(out, 9)
    stereo = np.stack([left, right], axis=1)
    pcm = (stereo * 32767).astype(np.int16)
    with wave.open(str(path), "wb") as wf:
        wf.setnchannels(2)
        wf.setsampwidth(2)
        wf.setframerate(SR)
        wf.writeframes(pcm.tobytes())


# ------------------------------------------------------------------ main

def main():
    global SOFT_BG
    preview = "--preview" in sys.argv
    BUILD.mkdir(parents=True, exist_ok=True)
    SOFT_BG = soft_bg()
    print("assets…", flush=True)
    A = load_assets()
    audio = BUILD / "music.wav"
    print("audio…", flush=True)
    synth_audio(audio)

    step = 3 if preview else 1
    out = BUILD / "preview.mp4" if preview else OUT
    ff = subprocess.Popen(
        [
            "ffmpeg", "-y", "-loglevel", "error",
            "-f", "rawvideo", "-pix_fmt", "rgb24", "-s", f"{W}x{H}", "-r", str(FPS / step), "-i", "-",
            "-i", str(audio),
            "-c:v", "libx264", "-preset", "medium", "-crf", "17", "-pix_fmt", "yuv420p",
            # -14 LUFS / -1.5 dBTP: the level Reels / TikTok / Shorts normalise to, no clipping
            "-af", "loudnorm=I=-14:TP=-2:LRA=7,alimiter=limit=0.79:level=false", "-c:a", "aac", "-b:a", "192k", "-shortest", "-movflags", "+faststart", str(out),
        ],
        stdin=subprocess.PIPE,
    )
    cache: dict = {}
    for fi in range(0, NFRAMES, step):
        t = fi / FPS
        frame = frame_at(A, t, cache)
        ff.stdin.write(np.clip(frame, 0, 255).astype(np.uint8).tobytes())
        if len(cache) > 8:
            cache.clear()
        if fi % 30 == 0:
            print(f"  {t:5.1f}s", flush=True)
    ff.stdin.close()
    ff.wait()
    print("wrote", out)


if __name__ == "__main__":
    main()
