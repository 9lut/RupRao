"""
รูปเรา (RupRao) — how-to video, 16:9 1920x1080 @30fps, 60 s.

    python tools/tutorial/make_tutorial.py           # -> media/ruprao-howto-60s.mp4
    python tools/tutorial/make_tutorial.py --preview # every 3rd frame

App screens come from screens.py (HTML mock-ups of the real UI rendered by headless Edge). The
camera zooms on the device layer only; step text, callouts and tap markers are an overlay drawn
after the camera, so they stay readable and point at the right place while zoomed.
Sections start on bar lines of a 100 BPM track (1 bar = 2.4 s).
"""

from __future__ import annotations

import math
import subprocess
import sys
import wave
from dataclasses import dataclass, field
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "tools" / "promo"))
sys.path.insert(0, str(ROOT / "tools" / "tutorial"))
import make_promo as P  # noqa: E402
import screens as S  # noqa: E402

W, H, FPS = 1920, 1080, 30
P.W, P.H = W, H  # promo helpers (cam_transform, soft_bg) read these globals
BPM = 100
BAR = 4 * 60 / BPM  # 2.4 s
DUR = 25 * BAR      # 60 s
NFRAMES = int(round(DUR * FPS))
OUT = ROOT / "media" / "ruprao-howto-60s.mp4"
BUILD = S.BUILD

INK, BLUE, WHITE, LINE, MUTED = P.INK, P.BLUE, P.WHITE, P.LINE, P.MUTED
clamp, prog, ease_out_cubic, ease_in_out, ease_out_back, pop, paste = (
    P.clamp, P.prog, P.ease_out_cubic, P.ease_in_out, P.ease_out_back, P.pop, P.paste
)

# ------------------------------------------------------------------ text

TEXT = {
    # intro / outro / chapters
    "intro_title": ("วิธีใช้ รูปเรา", 96, "#121211"),
    "intro_sub": ("ค้นหารูปของคุณจากใบหน้า ใน 4 ขั้นตอน", 44, "#6B6B6B"),
    "ch_a": ("สำหรับผู้ร่วมงาน", 92, "#121211"),
    "ch_a_sub": ("ไม่ต้องติดตั้งแอป ใช้ผ่านเบราว์เซอร์บนมือถือได้เลย", 40, "#6B6B6B"),
    "ch_b": ("สำหรับผู้จัดงาน", 92, "#121211"),
    "ch_b_sub": ("สร้างงาน อัปโหลดรูป แชร์ให้ผู้ร่วมงาน ในไม่กี่นาที", 40, "#6B6B6B"),
    "outro_title": ("เริ่มใช้งานได้เลย", 76, "#121211"),
    "outro_sub": ("สแกน QR · ถ่ายเซลฟี่ · ได้รูปของคุณ", 44, "#6B6B6B"),
    "credit": ("พัฒนาโดย Lutfee", 32, "#6B6B6B"),
    "label_a": ("สำหรับผู้ร่วมงาน", 30, "#005DFB"),
    # attendee steps
    "s1": ("สแกน QR หรือเปิดลิงก์", 62, "#121211"),
    "s1a": ("จากโปสเตอร์หน้างาน หรือลิงก์ที่ผู้จัดงานส่งให้", 32, "#6B6B6B"),
    "s1b": ("ถ้ามีรหัสเข้าชม ให้ใส่รหัสจากผู้จัดงาน", 32, "#6B6B6B"),
    "s2": ("ถ่ายเซลฟี่ 1 รูป", 62, "#121211"),
    "s2a": ("กด “ถ่ายภาพใบหน้า” หรือ “ใช้ภาพใบหน้า”", 32, "#6B6B6B"),
    "s2b": ("หน้าตรง เห็นชัด แสงสว่างพอ", 32, "#6B6B6B"),
    "s3": ("ดูรูปที่มีคุณ", 62, "#121211"),
    "s3a": ("เรียงจากใกล้เคียงที่สุด แตะรูปเพื่อดูเต็มจอ", 32, "#6B6B6B"),
    "s3b": ("ใช้เวลาค้นหาไม่ถึงวินาที", 32, "#6B6B6B"),
    "s4": ("เลือกแล้วดาวน์โหลด", 62, "#121211"),
    "s4a": ("กด “เลือกหลายรูป” แล้วแตะรูปที่ต้องการ", 32, "#6B6B6B"),
    "s4b": ("ได้ทุกรูปในไฟล์ zip เดียว", 32, "#6B6B6B"),
    "tip": ("ไม่อยากให้รูปอยู่ในระบบ?", 58, "#121211"),
    "tipa": ("กด “ขอลบรูป” เลือกรูป แล้วส่งคำขอ", 32, "#6B6B6B"),
    "tipb": ("ผู้จัดงานจะตรวจสอบและลบให้", 32, "#6B6B6B"),
    "tip_label": ("เคล็ดลับ", 30, "#005DFB"),
    # callouts
    "c_link": ("แตะเพื่อเปิดหน้าอีเวนต์", 30, "#121211"),
    "c_event": ("หน้าอีเวนต์เปิดขึ้นมาแล้ว", 30, "#121211"),
    "c_cam": ("ถ่ายใหม่ หรือเลือกรูปจากเครื่อง", 30, "#121211"),
    "c_consent": ("ครั้งแรกจะขอความยินยอม", 30, "#121211"),
    "c_frame": ("วางหน้าให้อยู่ในกรอบ", 30, "#121211"),
    "c_scan": ("AI กำลังเทียบกับทุกรูปในงาน", 30, "#121211"),
    "c_found": ("จำนวนรูปที่เจอ", 30, "#121211"),
    "c_faces": ("หลายคนในรูป? แตะเลือกหน้าของคุณ", 30, "#121211"),
    "c_pct": ("% = ความใกล้เคียง", 30, "#121211"),
    "c_heart": ("กด ♥ เก็บไว้ดูทีหลัง", 30, "#121211"),
    "c_select": ("เริ่มเลือกหลายรูป", 30, "#121211"),
    "c_dl": ("ดาวน์โหลดทีเดียว", 30, "#121211"),
    "c_zip": ("my-photos.zip ✓", 30, "#121211"),
    "c_banner": ("เลือกรูปที่ต้องการให้ลบ", 30, "#121211"),
    "c_send": ("ส่งคำขอลบ", 30, "#121211"),
    "c_contact": ("ช่องทางติดต่อกลับ (ไม่บังคับ)", 30, "#121211"),
    # organizer lower thirds
    "o1": ("สร้างอีเวนต์", 44, "#121211"),
    "o1a": ("ตั้งชื่อ รหัสเข้าชม และวันลบข้อมูลอัตโนมัติ", 34, "#6B6B6B"),
    "o2": ("อัปโหลดรูป", 44, "#121211"),
    "o2a": ("ลากวางทีละหลายร้อยรูป ระบบสแกนใบหน้าให้อัตโนมัติ", 34, "#6B6B6B"),
    "o3": ("แชร์ลิงก์หรือ QR", 44, "#121211"),
    "o3a": ("ดาวน์โหลด QR ไปพิมพ์ติดหน้างาน", 34, "#6B6B6B"),
    "o4": ("ดูแลคำขอลบรูป", 44, "#121211"),
    "o4a": ("อนุมัติเพื่อลบรูปพร้อมข้อมูลใบหน้า หรือปฏิเสธ", 34, "#6B6B6B"),
    "co_name": ("ชื่อที่ผู้ร่วมงานจะเห็น", 30, "#121211"),
    "co_access": ("ต้องใส่รหัสก่อนเข้า = ปลอดภัยขึ้น", 30, "#121211"),
    "co_ret": ("ลบรูปและข้อมูลใบหน้าอัตโนมัติ", 30, "#121211"),
    "co_status": ("สถานะการสแกนของแต่ละรูป", 30, "#121211"),
    "co_qr": ("QR พาผู้ร่วมงานมาที่หน้าค้นหา", 30, "#121211"),
    "co_approve": ("ลบรูปและข้อมูลใบหน้าในรูปนั้น", 30, "#121211"),
}


def load_text():
    P.SPRITES = TEXT
    P.BUILD = BUILD
    return P.render_sprites()


# ------------------------------------------------------------------ devices

PHONE_DS = 880 / 844                      # css px -> frame px
PHONE_SCREEN = (1360 - 203, 100)          # top-left of the screen in frame px
DESK_DS = 0.95
DESK_WIN = ((W - int(1440 * DESK_DS)) // 2, 26)   # window top-left
DESK_BAR = 34
DESK_SCREEN = (DESK_WIN[0], DESK_WIN[1] + DESK_BAR)


def css_to_frame(kind, rect):
    x, y, w, h = rect
    if kind == "phone":
        ox, oy, s = *PHONE_SCREEN, PHONE_DS
    else:
        ox, oy, s = *DESK_SCREEN, DESK_DS
    return ox + x * s, oy + y * s, w * s, h * s


def phone_layer(screen_img: Image.Image) -> Image.Image:
    sw, sh = int(390 * PHONE_DS), int(844 * PHONE_DS)
    layer = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    bezel = 14
    x0, y0 = PHONE_SCREEN[0] - bezel, PHONE_SCREEN[1] - bezel
    sh_img, pad = P.shadow((sw + bezel * 2, sh + bezel * 2), 60, blur=34, alpha=70)
    layer.alpha_composite(sh_img, (x0 - pad, y0 - pad))
    d = ImageDraw.Draw(layer)
    d.rounded_rectangle((x0, y0, x0 + sw + bezel * 2, y0 + sh + bezel * 2), radius=62, fill=INK)
    scr = screen_img.resize((sw, sh), Image.LANCZOS)
    scr.putalpha(P.rounded_mask((sw, sh), 48))
    layer.alpha_composite(scr, PHONE_SCREEN)
    return layer


def desk_layer(screen_img: Image.Image) -> Image.Image:
    cw, ch = int(1440 * DESK_DS), int(900 * DESK_DS)
    layer = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    x0, y0 = DESK_WIN
    sh_img, pad = P.shadow((cw, ch + DESK_BAR), 18, blur=34, alpha=60)
    layer.alpha_composite(sh_img, (x0 - pad, y0 - pad))
    win = Image.new("RGBA", (cw, ch + DESK_BAR), (0, 0, 0, 0))
    d = ImageDraw.Draw(win)
    d.rounded_rectangle((0, 0, cw - 1, ch + DESK_BAR - 1), radius=16, fill=(244, 244, 243))
    for i, col in enumerate([(255, 95, 86), (255, 189, 46), (39, 201, 63)]):
        d.ellipse((18 + i * 22, 11, 30 + i * 22, 23), fill=col)
    d.rounded_rectangle((cw / 2 - 220, 7, cw / 2 + 220, 27), radius=10, fill=WHITE)
    f = P.latin_font(14)
    url = "ruprao.app/admin"
    d.text((cw / 2 - d.textlength(url, font=f) / 2, 8), url, font=f, fill=MUTED)
    scr = screen_img.resize((cw, ch), Image.LANCZOS)
    mask = Image.new("L", (cw, ch), 255)
    ImageDraw.Draw(mask).rectangle((0, 0, cw, ch), fill=255)
    win.paste(scr, (0, DESK_BAR), mask)
    win.putalpha(P.rounded_mask(win.size, 16))
    layer.alpha_composite(win, (x0, y0))
    return layer


# ------------------------------------------------------------------ timeline model


@dataclass
class Shot:
    start: float
    end: float
    kind: str                         # phone | desk | card
    screens: list = field(default_factory=list)   # [(t, screen_name)]
    zooms: list = field(default_factory=list)     # [(t, dur, zoom, target)]  target None -> reset
    taps: list = field(default_factory=list)      # [(t, target)]
    callouts: list = field(default_factory=list)  # [(t0, t1, target, sprite)]
    text: dict = field(default_factory=dict)      # left panel / lower third
    extras: list = field(default_factory=list)    # special effects


def bars(n):
    return n * BAR


SHOTS = [
    Shot(0, bars(2), "card", text={"kind": "intro"}),
    Shot(bars(2), bars(3), "card", text={"kind": "chapter", "title": "ch_a", "sub": "ch_a_sub", "n": "A"}),
    Shot(bars(3), bars(5), "phone",
         screens=[(bars(3), "qr"), (bars(3) + 2.6, "event")],
         taps=[(bars(3) + 2.2, ("qr", "chip"))],
         callouts=[(bars(3) + 1.0, bars(3) + 2.4, ("qr", "chip"), "c_link"), (bars(3) + 3.0, bars(5) - 0.1, ("event", "hero"), "c_event")],
         zooms=[(bars(3) + 0.9, 0.6, 1.35, ("qr", "chip")), (bars(3) + 2.4, 0.4, 1.0, None)],
         text={"label": "label_a", "n": 1, "title": "s1", "lines": ["s1a", "s1b"]}),
    Shot(bars(5), bars(8), "phone",
         screens=[(bars(5), "event"), (bars(5) + 1.5, "consent"), (bars(5) + 3.3, "camera"), (bars(5) + 5.6, "scanning")],
         taps=[(bars(5) + 1.2, ("event", "camera")), (bars(5) + 3.0, ("consent", "accept")), (bars(5) + 5.3, ("camera", "shutter"))],
         callouts=[(bars(5) + 0.4, bars(5) + 1.4, ("event", "camera"), "c_cam"),
                   (bars(5) + 1.7, bars(5) + 3.2, ("consent", "check"), "c_consent"),
                   (bars(5) + 3.6, bars(5) + 5.2, ("camera", "frame"), "c_frame"),
                   (bars(5) + 5.9, bars(8) - 0.1, ("scanning", "photo"), "c_scan")],
         zooms=[(bars(5) + 0.3, 0.6, 1.4, ("event", "camera")), (bars(5) + 1.5, 0.4, 1.0, None),
                (bars(5) + 5.7, 0.6, 1.3, ("scanning", "photo"))],
         extras=[("flash", bars(5) + 5.3), ("scanline", ("scanning", "photo"))],
         text={"label": "label_a", "n": 2, "title": "s2", "lines": ["s2a", "s2b"]}),
    Shot(bars(8), bars(11), "phone",
         screens=[(bars(8), "results")],
         callouts=[(bars(8) + 0.5, bars(8) + 1.9, ("results", "summary"), "c_found"),
                   (bars(8) + 2.1, bars(8) + 3.7, ("results", "faces"), "c_faces"),
                   (bars(8) + 3.9, bars(8) + 5.4, ("results", "pct"), "c_pct"),
                   (bars(8) + 5.6, bars(11) - 0.1, ("results", "heart"), "c_heart")],
         taps=[(bars(8) + 2.8, ("results", "faces")), (bars(8) + 6.2, ("results", "heart"))],
         zooms=[(bars(8) + 0.4, 0.5, 1.35, ("results", "summary")), (bars(8) + 2.0, 0.5, 1.5, ("results", "faces")),
                (bars(8) + 3.8, 0.5, 1.6, ("results", "pct")), (bars(8) + 5.5, 0.5, 1.5, ("results", "heart"))],
         text={"label": "label_a", "n": 3, "title": "s3", "lines": ["s3a", "s3b"]}),
    Shot(bars(11), bars(13), "phone",
         screens=[(bars(11), "results"), (bars(11) + 2.2, "select")],
         taps=[(bars(11) + 0.5, ("results", "select")), (bars(11) + 1.1, ("results", "tick0")), (bars(11) + 1.45, ("results", "tick1")),
               (bars(11) + 1.8, ("results", "tick2")), (bars(11) + 3.1, ("select", "download"))],
         callouts=[(bars(11) + 0.1, bars(11) + 0.9, ("results", "select"), "c_select"),
                   (bars(11) + 2.4, bars(11) + 3.4, ("select", "download"), "c_dl"),
                   (bars(11) + 3.5, bars(13) - 0.1, ("select", "bar"), "c_zip")],
         zooms=[(bars(11) + 0.0, 0.5, 1.4, ("results", "select")), (bars(11) + 0.95, 0.4, 1.15, ("results", "tick1")),
                (bars(11) + 2.3, 0.5, 1.4, ("select", "download"))],
         extras=[("ticks", [bars(11) + 1.1, bars(11) + 1.45, bars(11) + 1.8])],
         text={"label": "label_a", "n": 4, "title": "s4", "lines": ["s4a", "s4b"]}),
    Shot(bars(13), bars(15), "phone",
         screens=[(bars(13), "remove"), (bars(13) + 2.5, "remove_dialog")],
         taps=[(bars(13) + 1.2, ("remove", "pick")), (bars(13) + 2.2, ("remove", "send")), (bars(13) + 4.0, ("remove_dialog", "send"))],
         callouts=[(bars(13) + 0.3, bars(13) + 1.9, ("remove", "banner"), "c_banner"),
                   (bars(13) + 2.7, bars(13) + 3.8, ("remove_dialog", "contact"), "c_contact"),
                   (bars(13) + 3.9, bars(15) - 0.1, ("remove_dialog", "send"), "c_send")],
         zooms=[(bars(13) + 0.2, 0.5, 1.3, ("remove", "banner")), (bars(13) + 2.4, 0.5, 1.25, ("remove_dialog", "modal"))],
         text={"label": "tip_label", "n": "!", "title": "tip", "lines": ["tipa", "tipb"]}),
    Shot(bars(15), bars(16), "card", text={"kind": "chapter", "title": "ch_b", "sub": "ch_b_sub", "n": "B"}),
    Shot(bars(16), bars(18), "desk",
         screens=[(bars(16), "admin_new")],
         callouts=[(bars(16) + 0.6, bars(16) + 1.9, ("admin_new", "name"), "co_name"),
                   (bars(16) + 2.0, bars(16) + 3.2, ("admin_new", "access"), "co_access"),
                   (bars(16) + 3.3, bars(18) - 0.1, ("admin_new", "retention"), "co_ret")],
         taps=[(bars(16) + 4.2, ("admin_new", "create"))],
         zooms=[(bars(16) + 0.5, 0.6, 1.35, ("admin_new", "name")), (bars(16) + 1.9, 0.5, 1.35, ("admin_new", "access")),
                (bars(16) + 3.2, 0.5, 1.35, ("admin_new", "retention")), (bars(16) + 4.0, 0.4, 1.0, None)],
         text={"n": 1, "title": "o1", "line": "o1a"}),
    Shot(bars(18), bars(20), "desk",
         screens=[(bars(18), "admin_upload")],
         callouts=[(bars(18) + 2.4, bars(20) - 0.1, ("admin_upload", "status"), "co_status")],
         zooms=[(bars(18) + 0.3, 0.6, 1.25, ("admin_upload", "drop")), (bars(18) + 2.3, 0.6, 1.5, ("admin_upload", "status"))],
         extras=[("progress", ("admin_upload", "progress"))],
         text={"n": 2, "title": "o2", "line": "o2a"}),
    Shot(bars(20), bars(22), "desk",
         screens=[(bars(20), "admin_share")],
         taps=[(bars(20) + 2.6, ("admin_share", "download_qr")), (bars(20) + 3.6, ("admin_share", "copy"))],
         callouts=[(bars(20) + 0.6, bars(20) + 2.3, ("admin_share", "qr"), "co_qr")],
         zooms=[(bars(20) + 0.4, 0.6, 1.3, ("admin_share", "qr")), (bars(20) + 2.3, 0.5, 1.3, ("admin_share", "download_qr"))],
         text={"n": 3, "title": "o3", "line": "o3a"}),
    Shot(bars(22), bars(23), "desk",
         screens=[(bars(22), "admin_requests")],
         taps=[(bars(22) + 1.6, ("admin_requests", "approve"))],
         callouts=[(bars(22) + 0.5, bars(23) - 0.1, ("admin_requests", "approve"), "co_approve")],
         zooms=[(bars(22) + 0.2, 0.5, 1.3, ("admin_requests", "card"))],
         text={"n": 4, "title": "o4", "line": "o4a"}),
    Shot(bars(23), DUR, "card", text={"kind": "outro"}),
]


def shot_at(t):
    for i, s in enumerate(SHOTS):
        if s.start <= t < s.end:
            return i
    return len(SHOTS) - 1


def screen_at(shot: Shot, t):
    cur, prev, since = shot.screens[0][1], None, 99.0
    for st, name in shot.screens:
        if t >= st:
            prev, cur, since = cur, name, t - st
    return cur, prev, since


def target_rect(shot: Shot, tgt):
    screen, name = tgt
    return css_to_frame(shot.kind, S.TARGETS[screen][name])


def zoom_state(shot: Shot, t):
    """Piecewise eased zoom toward targets; returns (zoom, focus_x, focus_y)."""
    z, fx, fy = 1.0, W * 0.6, H / 2
    if shot.kind == "phone":
        fx = PHONE_SCREEN[0] + 203
    cur = (1.0, fx, fy)
    for t0, dur, zt, tgt in shot.zooms:
        if t < t0:
            break
        if tgt is None:
            target = (1.0, cur[1], cur[2])
        else:
            x, y, w, h = target_rect(shot, tgt)
            target = (zt, x + w / 2, y + h / 2)
        p = ease_in_out(prog(t, t0, dur))
        cur = tuple(a + (b_ - a) * p for a, b_ in zip(cur, target))
    return cur


def cam_params(shot: Shot, t):
    """Affine (zoom, dx, dy) with out = c + d + z*(in - c): focus point drifts toward a comfy spot."""
    z, fx, fy = zoom_state(shot, t)
    # subtle continuous drift so the frame is never frozen
    z *= 1.0 + 0.012 * math.sin((t - shot.start) * 0.9)
    if shot.kind == "phone":
        gx, gy = 1360, 540
    else:
        gx, gy = W / 2, 470
    k = clamp((z - 1) / 0.5)  # pull the focus toward the goal as we zoom in
    tx, ty = fx + (gx - fx) * k, fy + (gy - fy) * k
    cx, cy = W / 2, H / 2
    dx = tx - cx - z * (fx - cx)
    dy = ty - cy - z * (fy - cy)
    if shot.kind == "desk":
        wx0, wy0 = DESK_WIN
        wx1, wy1 = wx0 + int(1440 * DESK_DS), wy0 + DESK_BAR + int(900 * DESK_DS)
        left, right = cx + z * (wx0 - cx), cx + z * (wx1 - cx)
        top, bottom = cy + z * (wy0 - cy), cy + z * (wy1 - cy)
        if right - left >= W:
            dx = clamp(dx, W - right, -left)
        else:
            dx = (W - (left + right)) / 2
        if bottom - top >= H:
            dy = clamp(dy, H - bottom, -top)
        else:
            dy = clamp(dy, -top + 10, H - 10 - bottom) if (H - 10 - bottom) >= (-top + 10) else (H - (top + bottom)) / 2
    return z, dx, dy


def map_point(cam, x, y):
    z, dx, dy = cam
    return W / 2 + dx + z * (x - W / 2), H / 2 + dy + z * (y - H / 2)


def apply_cam(img: Image.Image, cam):
    z, dx, dy = cam
    return P.cam_transform(img, z, dx, dy, 0.0, (255, 255, 255, 0) if img.mode == "RGBA" else WHITE)


# ------------------------------------------------------------------ assets


class Assets:
    pass


def load():
    A = Assets()
    S.build()
    A.spr = load_text()
    A.screens = {p.stem: Image.open(p).convert("RGBA") for p in (S.SCREENS).glob("*.png")}
    A.bg = P.soft_bg((255, 255, 255), (238, 243, 252)).resize((W, H))
    A.mark = Image.open(P.BRAND / "ruprao-mark.png").convert("RGBA")
    A.word = Image.open(P.BRAND / "ruprao-wordmark.png").convert("RGBA")
    A.check = P.check_badge(64)
    A.layers = {}
    for name, im in A.screens.items():
        A.layers[name] = desk_layer(im) if name.startswith("admin") else phone_layer(im)
    A.badge = {}
    for n in ["1", "2", "3", "4", "!", "A", "B"]:
        size = 84
        im = Image.new("RGBA", (size, size), (0, 0, 0, 0))
        d = ImageDraw.Draw(im)
        d.ellipse((0, 0, size - 1, size - 1), fill=BLUE if n not in "AB" else INK)
        f = P.latin_font(46)
        d.text(((size - d.textlength(n, font=f)) / 2, 8), n, font=f, fill=WHITE)
        A.badge[n] = im
    return A


# ------------------------------------------------------------------ overlay pieces


def callout_plate(A, key):
    spr = A.spr[key]
    pad_x, pad_y = 26, 14
    w, h = spr.width + pad_x * 2, spr.height + pad_y * 2
    im = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    d.rounded_rectangle((0, 0, w - 1, h - 1), radius=h // 2, fill=WHITE, outline=BLUE, width=3)
    im.alpha_composite(spr, (pad_x, pad_y))
    return P.card_with_shadow(im)


_plates = {}


def draw_callout(A, ov: Image.Image, shot: Shot, cam, t, t0, t1, tgt, key):
    if not (t0 <= t < t1 + 0.2):
        return
    a_in = ease_out_cubic(prog(t, t0, 0.25))
    a_out = 1 - prog(t, t1, 0.2)
    a = a_in * a_out
    if a <= 0:
        return
    plate = _plates.get(key) or _plates.setdefault(key, callout_plate(A, key))
    x, y, w, h = target_rect(shot, tgt)
    p0 = map_point(cam, x, y)
    p1 = map_point(cam, x + w, y + h)
    tx0, ty0, tx1, ty1 = p0[0], p0[1], p1[0], p1[1]
    d = ImageDraw.Draw(ov)
    # highlight ring on the target
    pad = 8
    ring_a = int(255 * a)
    d.rounded_rectangle((tx0 - pad, ty0 - pad, tx1 + pad, ty1 + pad), radius=18, outline=BLUE + (ring_a,), width=5)
    cy_t = (ty0 + ty1) / 2
    if shot.kind == "phone":
        # fixed slot under the step text (never covers it); elbow connector to the ring
        px = 150 + plate.width / 2
        py = 840
        sx = 150 + plate.width - 24
        ex = tx0 - pad
        mid = max(sx + 40, ex - 120)
        d.line((sx, py, mid, py, ex, cy_t), fill=BLUE + (ring_a,), width=4, joint="curve")
        d.ellipse((ex - 7, cy_t - 7, ex + 7, cy_t + 7), fill=BLUE + (ring_a,))
        slide = (1 - a_in) * 30
        paste(ov, plate, px, py + slide, alpha=a)
    else:
        # above (or below) the target on desktop
        above = ty0 > 260
        px = clamp((tx0 + tx1) / 2, plate.width / 2 + 40, W - plate.width / 2 - 40)
        py = ty0 - pad - 70 if above else ty1 + pad + 70
        d.line((px, py + (30 if above else -30), (tx0 + tx1) / 2, ty0 - pad if above else ty1 + pad), fill=BLUE + (ring_a,), width=4)
        paste(ov, plate, px, py + (1 - a_in) * (20 if above else -20), alpha=a)


def draw_tap(ov, shot, cam, t, tt, tgt):
    dt = t - tt
    if not (-0.35 <= dt <= 0.5):
        return
    x, y, w, h = target_rect(shot, tgt)
    cx, cy = map_point(cam, x + w / 2, y + h / 2)
    d = ImageDraw.Draw(ov)
    if dt < 0:  # finger approaching
        a = ease_out_cubic(prog(dt, -0.35, 0.2))
        r = 30
        d.ellipse((cx - r, cy - r, cx + r, cy + r), fill=(18, 18, 17, int(110 * a)), outline=(255, 255, 255, int(230 * a)), width=4)
    else:
        press = 1 - 0.25 * math.exp(-dt / 0.06)
        a = 1 - prog(dt, 0.15, 0.35)
        r = 30 * press
        d.ellipse((cx - r, cy - r, cx + r, cy + r), fill=(18, 18, 17, int(110 * a)), outline=(255, 255, 255, int(230 * a)), width=4)
        rr = 30 + 90 * ease_out_cubic(prog(dt, 0, 0.45))
        d.ellipse((cx - rr, cy - rr, cx + rr, cy + rr), outline=BLUE + (int(200 * (1 - prog(dt, 0, 0.45))),), width=5)


def left_panel(A, ov, shot: Shot, t):
    lt = t - shot.start
    tx = shot.text
    x = 150
    out_a = 1 - prog(t, shot.end - 0.25, 0.25)
    s, a = pop(lt, 0.1, 0.25, 0.85)
    paste(ov, A.spr[tx["label"]], x + A.spr[tx["label"]].width / 2, 330, alpha=a * out_a)
    s, a = pop(lt, 0.15, 0.3, 0.6)
    paste(ov, A.badge[str(tx["n"])], x + 42, 430, scale=s, alpha=a * out_a)
    s2, a2 = pop(lt, 0.25, 0.3, 0.9)
    title = A.spr[tx["title"]]
    paste(ov, title, x + 108 + title.width / 2, 430, alpha=a2 * out_a)
    for i, key in enumerate(tx["lines"]):
        spr = A.spr[key]
        _, a3 = pop(lt, 0.45 + 0.15 * i, 0.3, 0.95)
        paste(ov, spr, x + spr.width / 2 + (1 - a3) * 30, 530 + i * 58, alpha=a3 * out_a)
    # step dots (progress through the 4 attendee steps)
    if isinstance(tx["n"], int):
        for k in range(4):
            on = k + 1 <= tx["n"]
            d = ImageDraw.Draw(ov)
            cx = x + k * 34
            d.rounded_rectangle((cx, 720, cx + (26 if k + 1 == tx["n"] else 10), 730), radius=5, fill=(BLUE if on else LINE) + (int(255 * out_a),))


def lower_third(A, ov, shot: Shot, t):
    lt = t - shot.start
    tx = shot.text
    out_a = 1 - prog(t, shot.end - 0.2, 0.2)
    p = ease_out_back(prog(lt, 0.1, 0.35), 1.2)
    if p <= 0:
        return
    title, line = A.spr[tx["title"]], A.spr[tx["line"]]
    w = 84 + 28 + max(title.width, line.width) + 80
    h = 150
    plate = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    d = ImageDraw.Draw(plate)
    d.rounded_rectangle((0, 0, w - 1, h - 1), radius=40, fill=WHITE, outline=LINE, width=2)
    plate.alpha_composite(A.badge[str(tx["n"])], (32, (h - 84) // 2))
    plate.alpha_composite(title, (32 + 84 + 26, 16))
    plate.alpha_composite(line, (32 + 84 + 26, 16 + title.height - 6))
    paste(ov, P.card_with_shadow(plate), W / 2, H - 100 + (1 - p) * 140, alpha=out_a)


# ------------------------------------------------------------------ world (device layer) per shot


def world(A, shot: Shot, t):
    cur, prev, since = screen_at(shot, t)
    img = A.bg.copy()
    layer = A.layers[cur]
    if prev and since < 0.3:
        p = ease_out_cubic(since / 0.3)
        img.alpha_composite(A.layers[prev])
        fade = layer.copy()
        fade.putalpha(fade.getchannel("A").point(lambda v: int(v * p)))
        img.alpha_composite(fade)
    else:
        img.alpha_composite(layer)
    d = ImageDraw.Draw(img)
    for ex in shot.extras:
        if ex[0] == "scanline" and cur == ex[1][0]:
            x, y, w, h = target_rect(shot, ex[1])
            ph = (t - shot.start) / (60 / BPM)
            yy = y + 20 + (h - 40) * (0.5 - 0.5 * math.cos(math.pi * ph))
            P.scan_line(img, x + 24, x + w - 24, yy, thick=3)
        if ex[0] == "ticks" and cur == "results":
            for i, tt in enumerate(ex[1]):
                if t >= tt:
                    x, y, w, h = target_rect(shot, ("results", f"tick{i}"))
                    pk = ease_out_back(prog(t, tt, 0.15), 3)
                    paste(img, A.check, x + w / 2, y + h / 2, scale=0.55 * pk)
                    fx, fy, fw, fh = target_rect(shot, ("results", ["first", "first", "first"][0]))
        if ex[0] == "progress" and cur == ex[1][0]:
            x, y, w, h = target_rect(shot, ex[1])
            p = 0.66 + 0.34 * ease_in_out(prog(t, shot.start + 0.3, BAR * 2 - 0.6))
            d.rounded_rectangle((x, y, x + w, y + h), radius=h / 2, fill=LINE)
            d.rounded_rectangle((x, y, x + w * p, y + h), radius=h / 2, fill=INK)
        if ex[0] == "flash" and 0 <= t - ex[1] < 0.3:
            x, y, w, h = css_to_frame(shot.kind, (0, 0, 390, 844))
            a = int(255 * (1 - (t - ex[1]) / 0.3))
            fl = Image.new("RGBA", (int(w), int(h)), (255, 255, 255, a))
            fl.putalpha(Image.composite(fl.getchannel("A"), Image.new("L", fl.size, 0), P.rounded_mask(fl.size, 48)))
            img.alpha_composite(fl, (int(x), int(y)))
    return img


# ------------------------------------------------------------------ cards


def card(A, shot: Shot, t):
    lt = t - shot.start
    img = A.bg.copy()
    kind = shot.text["kind"]
    if kind == "intro":
        s, a = P.slam(lt, 0.15, 0.18, 2.4)
        paste(img, A.mark, W / 2, 400, scale=0.5 * s, alpha=a)
        if lt > 0.4:
            ph = (lt - 0.4) / (60 / BPM)
            P.scan_line(img, W / 2 - 110, W / 2 + 110, 400 - 95 + 190 * (0.5 - 0.5 * math.cos(math.pi * ph)), thick=3)
        s, a = pop(lt, 0.8, 0.3)
        paste(img, A.spr["intro_title"], W / 2, 640, scale=s, alpha=a)
        s, a = pop(lt, 1.2, 0.3, 0.9)
        paste(img, A.spr["intro_sub"], W / 2, 740, scale=s, alpha=a)
    elif kind == "chapter":
        s, a = pop(lt, 0.05, 0.3)
        paste(img, A.badge[shot.text["n"]], W / 2, 380, scale=s * 1.3, alpha=a)
        s, a = pop(lt, 0.2, 0.3)
        paste(img, A.spr[shot.text["title"]], W / 2, 520, scale=s, alpha=a)
        s, a = pop(lt, 0.45, 0.3, 0.9)
        paste(img, A.spr[shot.text["sub"]], W / 2, 620, scale=s, alpha=a)
    else:  # outro
        s, a = P.slam(lt, 0.1, 0.18, 2.4)
        paste(img, A.mark, W / 2, 330, scale=0.42 * s, alpha=a)
        s, a = pop(lt, 0.5, 0.3)
        paste(img, A.word, W / 2, 520, scale=0.62 * s, alpha=a)
        s, a = pop(lt, 0.9, 0.3)
        paste(img, A.spr["outro_title"], W / 2, 660, scale=s, alpha=a)
        s, a = pop(lt, 1.2, 0.3, 0.9)
        paste(img, A.spr["outro_sub"], W / 2, 750, scale=s, alpha=a)
        s, a = pop(lt, 1.8, 0.3, 0.9)
        paste(img, A.spr["credit"], W / 2, 960, scale=s, alpha=a)
    # gentle push so cards are never static
    z = 1.0 + 0.03 * (lt / (shot.end - shot.start))
    return P.cam_transform(img.convert("RGB"), z, 0, 0, 0, WHITE)


# ------------------------------------------------------------------ frame


def render_shot(A, idx, t):
    shot = SHOTS[idx]
    if shot.kind == "card":
        return np.asarray(card(A, shot, t), np.float32)
    cam = cam_params(shot, t)
    base = apply_cam(world(A, shot, t).convert("RGB"), cam)
    ov = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    for tt, tgt in shot.taps:
        draw_tap(ov, shot, cam, t, tt, tgt)
    for t0, t1, tgt, key in shot.callouts:
        draw_callout(A, ov, shot, cam, t, t0, t1, tgt, key)
    if shot.kind == "phone":
        # soft white wash behind the left panel so text stays legible over zoomed content
        wash = Image.fromarray(np.dstack([np.full((H, W, 3), 255, np.uint8),
                                          (np.clip(1.6 - np.linspace(0, 1.6, W) * 1.6, 0, 1) * 235 * (np.ones((H, 1)))).astype(np.uint8)]), "RGBA")
        out = base.convert("RGBA")
        out.alpha_composite(wash)
        out.alpha_composite(ov)
        left_panel(A, out, shot, t)
        return np.asarray(out.convert("RGB"), np.float32)
    out = base.convert("RGBA")
    out.alpha_composite(ov)
    lower_third(A, out, shot, t)
    return np.asarray(out.convert("RGB"), np.float32)


WHIP = 0.32


def frame_at(A, t):
    idx = shot_at(t)
    # whip pan when the device type changes (and into / out of cards)
    for i in range(1, len(SHOTS)):
        tc = SHOTS[i].start
        if SHOTS[i].kind != SHOTS[i - 1].kind and abs(t - tc) < WHIP / 2:
            p0 = (t - (tc - WHIP / 2)) / WHIP
            a_img = render_shot(A, i - 1, min(t, tc - 1e-3))
            b_img = render_shot(A, i, max(t, tc))
            acc = np.zeros_like(a_img)
            n = 16
            for k in range(n):
                p = ease_in_out(clamp(p0 - (k / (n - 1)) * (1 / FPS / WHIP) * 0.9))
                o = int(p * W)
                fr = np.empty_like(a_img)
                fr[:, : W - o] = a_img[:, o:]
                fr[:, W - o:] = b_img[:, : o] if o else fr[:, W - o:]
                acc += fr
            return acc / n
    return render_shot(A, idx, t)


# ------------------------------------------------------------------ audio (lo-fi bed + UI sounds)

SR = 44100


def synth(path: Path):
    n = int(SR * (DUR + 0.5))
    out = np.zeros(n)
    rng = np.random.default_rng(3)
    beat = 60 / BPM

    def add(sig, at, g=1.0):
        i = int(at * SR)
        j = min(n, i + len(sig))
        if 0 <= i < n:
            out[i:j] += g * sig[: j - i]

    def tt(d):
        return np.arange(int(d * SR)) / SR

    def kick():
        x = tt(0.4)
        f = 45 + 70 * np.exp(-x / 0.04)
        return np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-x / 0.18)

    def snap():
        x = tt(0.18)
        nz = np.diff(np.concatenate([[0], rng.standard_normal(len(x))]))
        return nz * np.exp(-x / 0.05) * 0.35

    def shaker():
        x = tt(0.06)
        return np.diff(np.concatenate([[0], rng.standard_normal(len(x))])) * np.exp(-x / 0.015) * 0.15

    def keys(freqs, d):
        x = tt(d)
        sig = sum(np.sin(2 * np.pi * f * x) + 0.3 * np.sin(4 * np.pi * f * x) * np.exp(-x / 0.3) for f in freqs)
        return sig * np.exp(-x / 1.4) * np.minimum(1, x / 0.01) * 0.12

    def sub(f, d):
        x = tt(d)
        return np.sin(2 * np.pi * f * x) * np.minimum(1, x / 0.02) * np.exp(-x / 1.2) * 0.45

    def click():
        x = tt(0.05)
        return np.sin(2 * np.pi * 2400 * x) * np.exp(-x / 0.008) * 0.5

    def chime():
        x = tt(0.8)
        return (np.sin(2 * np.pi * 1318.5 * x) + 0.5 * np.sin(2 * np.pi * 1975.5 * x)) * np.exp(-x / 0.35) * 0.18

    def whoosh(d=0.4):
        x = tt(d)
        nz = np.convolve(rng.standard_normal(len(x)), np.ones(8) / 8, mode="same")
        return nz * np.sin(np.pi * x / d) ** 2 * 0.6

    # Fmaj7 - Em7 - Dm7 - Cmaj7
    chords = [[174.6, 220.0, 261.6, 329.6], [164.8, 196.0, 246.9, 293.7], [146.8, 174.6, 220.0, 261.6], [130.8, 164.8, 196.0, 246.9]]
    roots = [43.65, 41.2, 36.7, 32.7]
    nbars = int(DUR / BAR)
    for bar in range(nbars):
        t0 = bar * BAR
        ci = bar % 4
        add(keys(chords[ci], BAR), t0)
        add(sub(roots[ci] * 2, BAR), t0)
        if bar == 0 or bar >= nbars - 1:
            continue
        for b4 in range(4):
            tb = t0 + b4 * beat
            if b4 in (0, 2):
                add(kick(), tb, 0.8)
            if b4 in (1, 3):
                add(snap(), tb, 0.8)
            for e in range(2):
                add(shaker(), tb + e * beat / 2, 1.0 if e else 0.6)
    for s in SHOTS:
        for tt_, _ in s.taps:
            add(click(), tt_, 0.9)
        add(chime(), s.start + 0.15, 0.8)
    for i in range(1, len(SHOTS)):
        if SHOTS[i].kind != SHOTS[i - 1].kind:
            add(whoosh(), SHOTS[i].start - 0.25, 0.5)
    out[int((DUR - 1.5) * SR):] *= np.linspace(1, 0, n - int((DUR - 1.5) * SR))
    out = np.tanh(out * 0.9)
    st = np.stack([out, np.roll(out, 7)], 1)
    with wave.open(str(path), "wb") as wf:
        wf.setnchannels(2)
        wf.setsampwidth(2)
        wf.setframerate(SR)
        wf.writeframes((st * 32767 * 0.9).astype(np.int16).tobytes())


# ------------------------------------------------------------------ main


def main():
    preview = "--preview" in sys.argv
    BUILD.mkdir(parents=True, exist_ok=True)
    print("assets…", flush=True)
    A = load()
    audio = BUILD / "music.wav"
    synth(audio)
    step = 3 if preview else 1
    out = BUILD / "preview.mp4" if preview else OUT
    ff = subprocess.Popen(
        ["ffmpeg", "-y", "-loglevel", "error", "-f", "rawvideo", "-pix_fmt", "rgb24", "-s", f"{W}x{H}", "-r", str(FPS / step), "-i", "-",
         "-i", str(audio), "-c:v", "libx264", "-preset", "medium", "-crf", "18", "-pix_fmt", "yuv420p",
         "-af", "loudnorm=I=-16:TP=-2:LRA=7,alimiter=limit=0.79:level=false", "-c:a", "aac", "-b:a", "192k",
         "-shortest", "-movflags", "+faststart", str(out)],
        stdin=subprocess.PIPE,
    )
    for fi in range(0, NFRAMES, step):
        t = fi / FPS
        ff.stdin.write(np.clip(frame_at(A, t), 0, 255).astype(np.uint8).tobytes())
        if fi % 150 == 0:
            print(f"  {t:5.1f}s", flush=True)
    ff.stdin.close()
    ff.wait()
    print("wrote", out)


if __name__ == "__main__":
    main()
