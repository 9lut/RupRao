"""
App screens for the tutorial video, authored as static HTML that mirrors the real รูปเรา UI and
rendered to PNG with headless Edge (proper Thai shaping, crisp text).

Key elements are absolutely positioned so the animation knows exactly where to tap / zoom:
TARGETS[screen][name] = (x, y, w, h) in CSS px of that screen.
Only illustrated people are used — no real attendee photos.
"""

from __future__ import annotations

import subprocess
import sys
import time
from pathlib import Path

from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "tools" / "promo"))
import make_promo as P  # noqa: E402  (reuse illustration helpers)

BUILD = ROOT / "media" / "tutorial_build"
IMG = BUILD / "img"
SCREENS = BUILD / "screens"
EDGE = P.EDGE
FONT = "file:///" + P.FONT_TH.replace("\\", "/")
MARK = (P.BRAND / "ruprao-mark.png").resolve().as_uri()

PHONE = (390, 844, 2.5)     # css w, h, device scale
DESKTOP = (1440, 900, 1.5)

EVENT = "งานเลี้ยงรุ่น 2569"

# ------------------------------------------------------------------ images


def make_images():
    IMG.mkdir(parents=True, exist_ok=True)
    for i, h in enumerate([560, 420, 470, 600, 430, 520, 500, 450]):
        P.make_photo(470, h, 300 + i, hero=True).save(IMG / f"hero{i}.png")
    for i in range(16):
        P.make_photo(320, 320, 700 + i, crowd=(i % 3) + 1).save(IMG / f"other{i}.png")
    face = Image.new("RGBA", (900, 1200), (0, 0, 0, 0))
    P.draw_person(ImageDraw.Draw(face), 450, 1300, 300, **P.HERO)
    face.save(IMG / "selfie_face.png")
    # selfie photo (portrait with background)
    sel = P.make_photo(600, 800, 42, hero=True, crowd=1)
    sel.save(IMG / "selfie.png")
    # face picker crops: three different people
    for i, (skin, hair, shirt) in enumerate([(P.HERO["skin"], P.HERO["hair"], P.BLUE), ((204, 152, 112), (60, 40, 30), (255, 122, 89)), ((250, 222, 196), (35, 28, 24), (46, 196, 140))]):
        im = Image.new("RGBA", (200, 200), (232, 240, 255, 255))
        P.draw_person(ImageDraw.Draw(im), 100, 300, 78, skin, hair, shirt)
        im.save(IMG / f"face{i}.png")
    mark = Image.open(P.BRAND / "ruprao-mark.png").convert("RGBA")
    P.qr_card(560, mark).save(IMG / "qr.png")


def img(name):
    return (IMG / name).resolve().as_uri()


# ------------------------------------------------------------------ shared CSS / pieces

CSS = f"""
@font-face{{font-family:P;src:url("{FONT}")}}
*{{box-sizing:border-box;margin:0}}
html,body{{background:#fff;color:#121211;font-family:P;-webkit-font-smoothing:antialiased}}
.abs{{position:absolute}}
.muted{{color:#6b6b6b}}
.line{{border:1px solid #ececec}}
.hdr{{position:absolute;left:0;right:0;top:0;height:56px;border-bottom:1px solid #ececec;display:flex;align-items:center;justify-content:space-between;padding:0 16px;background:#fff}}
.logo{{display:flex;align-items:center;gap:8px;font-size:17px;font-weight:700}}
.logo img{{width:32px;height:32px}}
.logo small{{font-size:14px}} .logo small b{{color:#005DFB;font-weight:700}}
.btn{{display:flex;align-items:center;justify-content:center;gap:8px;border-radius:999px;font-size:14px}}
.dark{{background:#0a0a0a;color:#fff}}
.card{{border:1px solid #ececec;border-radius:28px;background:linear-gradient(#fff,#f6f6f5)}}
.pill{{border:1px solid #ececec;border-radius:999px;background:#fff}}
.photo{{position:absolute;border-radius:16px;overflow:hidden;background:#f6f6f5}}
.photo img{{width:100%;height:100%;object-fit:cover;display:block}}
.pct{{position:absolute;left:8px;bottom:8px;background:rgba(255,255,255,.92);border-radius:999px;padding:2px 9px;font-size:11px}}
.heart{{position:absolute;right:8px;top:8px;width:28px;height:28px;border-radius:999px;background:rgba(255,255,255,.92);display:grid;place-items:center}}
.tick{{position:absolute;left:8px;top:8px;width:26px;height:26px;border-radius:999px;border:2px solid #fff;background:rgba(0,0,0,.2);display:grid;place-items:center;color:transparent;font-size:12px}}
.tick.on{{background:#0a0a0a;border-color:#0a0a0a;color:#fff}}
.sel{{outline:3px solid #0a0a0a;outline-offset:2px}}
"""

ICONS = {
    "camera": '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"><path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="3.5"/></svg>',
    "smile": '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><circle cx="12" cy="12" r="9"/><path d="M9 10v.5M15 10v.5M8.5 14.5a4.5 4.5 0 0 0 7 0"/></svg>',
    "lock": '<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"><rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/></svg>',
    "help": '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><circle cx="12" cy="12" r="9"/><path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .8-1 1.5v.2M12 17h.01"/></svg>',
    "album": '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="3" y="4" width="18" height="16" rx="3"/><circle cx="9" cy="10" r="1.6"/><path d="m21 16-5-5-9 9"/></svg>',
    "search": '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>',
    "heart": '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"><path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z"/></svg>',
    "scan": '<svg width="28" height="28" viewBox="0 0 64 64" fill="none" stroke="currentColor" stroke-width="5" stroke-linecap="round"><path d="M8 22V16a8 8 0 0 1 8-8h6M42 8h6a8 8 0 0 1 8 8v6M56 42v6a8 8 0 0 1-8 8h-6M22 56h-6a8 8 0 0 1-8-8v-6"/><circle cx="24.5" cy="27" r="3" fill="currentColor" stroke="none"/><circle cx="39.5" cy="27" r="3" fill="currentColor" stroke="none"/><path d="M23 37.5c5 5.6 13 5.6 18 0"/></svg>',
    "heart_s": '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#333" stroke-width="2"><path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z"/></svg>',
}


def phone_header():
    return f'<div class="hdr"><div class="logo"><img src="{MARK}">รูปเรา <small>Rup<b>Rao</b></small></div><span class="muted" style="font-size:13px">ความเป็นส่วนตัว</span></div>'


def bottom_nav():
    item = lambda ic, label, active=False: f'<div style="flex:1;display:flex;flex-direction:column;align-items:center;gap:2px;font-size:11px;{"font-weight:700" if active else "color:#6b6b6b"}">{ICONS[ic]}{label}</div>'
    return f"""<div class="abs" style="left:16px;right:16px;bottom:16px;height:64px;border:1px solid #ececec;border-radius:26px;background:#fff;display:flex;align-items:center;padding:0 8px;box-shadow:0 12px 40px -12px rgba(0,0,0,.18)">
{item("album","อัลบั้ม")}{item("search","ค้นหา",True)}<div style="width:76px"></div>{item("heart","ถูกใจ")}{item("help","ช่วยเหลือ")}
<div class="abs" style="left:50%;top:-26px;transform:translateX(-50%);width:68px;height:68px;border-radius:999px;background:#0a0a0a;border:5px solid #fff;display:grid;place-items:center;color:#fff">{ICONS["scan"]}</div></div>"""


def event_title(top=72):
    return f'<div class="abs" style="left:0;right:0;top:{top}px;text-align:center"><div class="muted" style="font-size:12px">อีเวนต์</div><div style="font-size:18px;font-weight:700">{EVENT}</div></div>'


# ------------------------------------------------------------------ phone screens

TARGETS: dict[str, dict[str, tuple]] = {}


def scr_qr():
    """Phone camera app pointed at the event QR poster."""
    TARGETS["qr"] = {"qr": (95, 250, 200, 200), "chip": (60, 520, 270, 44)}
    return f"""<div class="abs" style="inset:0;background:#2b2b2b"></div>
<div class="abs" style="left:45px;top:150px;width:300px;height:420px;border-radius:18px;background:#fff;transform:rotate(-3deg);box-shadow:0 20px 60px rgba(0,0,0,.5)">
  <div style="text-align:center;padding-top:24px;font-size:18px;font-weight:700">หารูปของคุณในงานนี้</div>
  <img src="{img('qr.png')}" style="position:absolute;left:55px;top:80px;width:190px">
  <div style="position:absolute;left:0;right:0;bottom:22px;text-align:center;font-size:13px" class="muted">สแกน · ถ่ายเซลฟี่ · ได้รูป</div>
</div>
<div class="abs" style="left:88px;top:222px;width:214px;height:214px;border:4px solid #FFD43B;border-radius:22px"></div>
<div class="abs pill" style="left:60px;top:520px;width:270px;height:44px;display:flex;align-items:center;gap:10px;padding:0 14px;font-size:13px;box-shadow:0 8px 30px rgba(0,0,0,.35)"><img src="{MARK}" style="width:26px">เปิด ruprao.app/e/k7m2qx9p</div>
<div class="abs" style="left:0;right:0;bottom:60px;display:flex;justify-content:center"><div style="width:72px;height:72px;border-radius:999px;border:5px solid #fff"></div></div>
"""


def scr_event():
    TARGETS["event"] = {"camera": (40, 412, 146, 92), "file": (204, 412, 146, 92), "hero": (16, 120, 358, 450), "code_note": (40, 520, 310, 24)}
    return f"""{phone_header()}{event_title()}
<div class="abs card" style="left:16px;top:120px;width:358px;height:450px;text-align:center;box-shadow:0 30px 60px -40px rgba(0,0,0,.25)">
  <img src="{MARK}" style="width:128px;margin-top:34px">
  <div style="font-size:20px;font-weight:700;margin-top:16px">ค้นหารูปของคุณด้วยใบหน้า</div>
  <div class="muted" style="font-size:13px;margin-top:6px">เลือกวิธีค้นหา จากรูปทั้งหมด 1,248 รูปในงานนี้</div>
</div>
<div class="abs dark" style="left:40px;top:412px;width:146px;height:92px;border-radius:16px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:6px;font-size:14px">{ICONS['camera']}ถ่ายภาพใบหน้า</div>
<div class="abs" style="left:204px;top:412px;width:146px;height:92px;border-radius:16px;border:1px solid #ececec;background:#fff;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:6px;font-size:14px">{ICONS['smile']}ใช้ภาพใบหน้า</div>
<div class="abs muted" style="left:0;right:0;top:526px;text-align:center;font-size:11px">{ICONS['lock']} รูปใบหน้าใช้ค้นหาเท่านั้น ไม่ถูกบันทึกในระบบ</div>
<div class="abs pill" style="left:122px;top:590px;width:146px;height:40px;display:flex;align-items:center;justify-content:center;gap:6px;font-size:14px">{ICONS['help']}วิธีการค้นหา</div>
{bottom_nav()}"""


def scr_consent():
    TARGETS["consent"] = {"check": (40, 470, 310, 70), "accept": (40, 560, 310, 46), "modal": (20, 250, 350, 380)}
    return f"""{scr_event()}
<div class="abs" style="inset:0;background:rgba(0,0,0,.22)"></div>
<div class="abs" style="left:20px;top:250px;width:350px;height:380px;background:#fff;border-radius:24px;padding:22px;box-shadow:0 30px 80px -20px rgba(0,0,0,.3)">
  <div style="font-size:18px;font-weight:700">ก่อนเริ่มค้นหา</div>
  <div class="muted" style="font-size:13px;line-height:1.8;margin-top:12px">• ระบบใช้รูปใบหน้าค้นหารูปในงานนี้<b style="color:#121211">เท่านั้น</b><br>• เซลฟี่ประมวลผลแล้วทิ้งทันที <b style="color:#121211">ไม่ถูกบันทึก</b><br>• ขอให้ลบรูปของคุณได้ทุกเมื่อ</div>
</div>
<div class="abs" style="left:40px;top:470px;width:310px;height:70px;border:1px solid #ececec;border-radius:16px;display:flex;gap:10px;padding:12px;font-size:13px"><div style="width:18px;height:18px;border-radius:4px;background:#0a0a0a;color:#fff;font-size:12px;display:grid;place-items:center;flex:none">✓</div>ฉันยินยอมให้ประมวลผลข้อมูลใบหน้าเพื่อการค้นหารูป ตามนโยบายความเป็นส่วนตัว</div>
<div class="abs dark btn" style="left:40px;top:560px;width:310px;height:46px">ยินยอมและเริ่มค้นหา</div>"""


def scr_camera():
    TARGETS["camera"] = {"frame": (40, 80, 310, 413), "shutter": (159, 520, 72, 72), "timer": (78, 534, 44, 44), "switch": (268, 534, 44, 44)}
    return f"""<div class="abs" style="left:16px;right:16px;top:18px;display:flex;justify-content:space-between;font-size:14px;font-weight:700">ถ่ายเซลฟี่<span class="muted" style="font-size:22px;font-weight:400">×</span></div>
<div class="abs" style="left:40px;top:80px;width:310px;height:413px;border-radius:28px;overflow:hidden;background:#f6f6f5">
  <img src="{img('selfie.png')}" style="width:100%;height:100%;object-fit:cover">
  <div class="abs" style="left:50px;top:70px;width:210px;height:250px;border-radius:50%;border:3px solid rgba(255,255,255,.95)"></div>
  <div class="abs" style="left:0;right:0;bottom:14px;text-align:center;color:#fff;font-size:12px;text-shadow:0 1px 4px rgba(0,0,0,.4)">วางใบหน้าให้อยู่ในกรอบ มองตรง แสงสว่างพอ</div>
</div>
<div class="abs" style="left:78px;top:534px;width:44px;height:44px;border:1px solid #ececec;border-radius:999px;display:grid;place-items:center;font-size:12px" class="muted">3s</div>
<div class="abs" style="left:159px;top:520px;width:72px;height:72px;border:3px solid #0a0a0a;border-radius:999px;display:grid;place-items:center"><div style="width:56px;height:56px;border-radius:999px;background:#0a0a0a"></div></div>
<div class="abs" style="left:268px;top:534px;width:44px;height:44px;border:1px solid #ececec;border-radius:999px;display:grid;place-items:center;font-size:16px">⟲</div>"""


def scr_scanning():
    TARGETS["scanning"] = {"photo": (67, 150, 256, 256)}
    return f"""{phone_header()}{event_title()}
<div class="abs" style="left:67px;top:150px;width:256px;height:256px;border-radius:36px;overflow:hidden;box-shadow:0 30px 60px -30px rgba(0,0,0,.35)">
  <img src="{img('selfie.png')}" style="width:100%;height:100%;object-fit:cover">
  <svg class="abs" style="left:12px;top:12px" width="232" height="232" viewBox="0 0 64 64" preserveAspectRatio="none" fill="none"><path d="M8 22V16a8 8 0 0 1 8-8h6M42 8h6a8 8 0 0 1 8 8v6M56 42v6a8 8 0 0 1-8 8h-6M22 56h-6a8 8 0 0 1-8-8v-6" stroke="#fff" stroke-width="2.4" stroke-linecap="round"/></svg>
  <div class="abs" style="left:30px;right:30px;top:120px;height:3px;border-radius:3px;background:#005DFB;box-shadow:0 0 14px 3px rgba(0,93,251,.6)"></div>
</div>
<div class="abs" style="left:0;right:0;top:440px;text-align:center"><div style="font-size:16px;font-weight:700">กำลังสแกนใบหน้า…</div><div class="muted" style="font-size:12px;margin-top:4px">เทียบกับทุกรูปในงานนี้ ใช้เวลาไม่กี่วินาที</div></div>
{bottom_nav()}"""


def gallery(top, selected=(), ticks=False, red=False):
    cols = [[], []]
    hts = [0, 0]
    out = []
    pcts = ["100%", "98.2%", "97.8%", "97.3%", "96.1%", "95.4%", "94.0%", "93.2%"]
    rects = []
    for i, h in enumerate([210, 160, 180, 220, 165, 200, 190, 170]):
        c = hts.index(min(hts))
        x = 16 + c * 183
        y = top + hts[c]
        hts[c] += h + 12
        sel = i in selected
        rects.append((x, y, 171, h))
        tick = f'<div class="tick {"on" if sel else ""}">✓</div>' if ticks else ""
        heart = "" if ticks else f'<div class="heart">{ICONS["heart_s"]}</div>'
        out.append(f'<div class="photo {"sel" if sel else ""}" style="left:{x}px;top:{y}px;width:171px;height:{h}px"><img src="{img(f"hero{i}.png")}">{tick}{heart}<div class="pct">{pcts[i]}</div></div>')
    return "".join(out), rects


def results_top():
    return f"""{phone_header()}{event_title(64)}
<div class="abs" style="left:16px;top:116px;width:358px;height:70px;border:1px solid #ececec;border-radius:22px;display:flex;align-items:center;gap:12px;padding:0 12px">
  <img src="{img('face0.png')}" style="width:48px;height:48px;border-radius:999px">
  <div style="flex:1"><div style="font-size:15px;font-weight:700">พบ 7 รูปที่มีคุณ</div><div class="muted" style="font-size:11px">ใช้เวลา 0.84 วินาที</div></div>
  <span class="muted" style="font-size:12px">ถ่ายใหม่</span><span class="muted" style="font-size:18px">×</span>
</div>"""


def scr_results():
    pics, rects = gallery(330)
    x0, y0, w0, h0 = rects[0]
    TARGETS["results"] = {"summary": (16, 116, 358, 70), "faces": (95, 214, 200, 56), "pct": (x0 + 4, y0 + h0 - 32, 62, 24),
                          "select": (262, 282, 112, 34), "remove": (182, 282, 76, 34), "first": rects[0], "heart": (x0 + w0 - 38, y0 + 6, 32, 32),
                          "tick0": (rects[0][0] + 6, rects[0][1] + 6, 30, 30), "tick1": (rects[1][0] + 6, rects[1][1] + 6, 30, 30), "tick2": (rects[2][0] + 6, rects[2][1] + 6, 30, 30)}
    faces = "".join(f'<img src="{img(f"face{i}.png")}" style="width:52px;height:52px;border-radius:999px;{"outline:2px solid #0a0a0a;outline-offset:2px" if i == 0 else "outline:1px solid #ececec"}">' for i in range(3))
    return f"""{results_top()}
<div class="abs muted" style="left:0;right:0;top:196px;text-align:center;font-size:11px">พบ 3 ใบหน้าในรูป — แตะเลือกใบหน้าของคุณ</div>
<div class="abs" style="left:95px;top:214px;width:200px;display:flex;justify-content:center;gap:12px">{faces}</div>
<div class="abs" style="left:16px;top:282px;right:16px;height:34px;display:flex;align-items:center;justify-content:space-between;font-size:11px">
  <span class="muted">ความแม่นยำ ●──── 45%</span>
  <span style="display:flex;gap:6px"><span class="btn muted" style="width:76px;height:34px;font-size:12px">ขอลบรูป</span><span class="btn pill" style="width:112px;height:34px;font-size:12px">เลือกหลายรูป</span></span>
</div>
{pics}{bottom_nav()}"""


def selection_bar(label, actions_html):
    return f"""<div class="abs" style="left:16px;right:16px;bottom:118px;height:96px;border:1px solid #ececec;border-radius:24px;background:rgba(255,255,255,.97);box-shadow:0 12px 40px -12px rgba(0,0,0,.25);padding:12px 14px">
  <div style="display:flex;gap:10px;align-items:baseline;font-size:14px"><b>{label}</b><span class="muted" style="font-size:12px">เลือกทั้งหมด (7)</span></div>
  <div style="display:flex;gap:6px;justify-content:flex-end;margin-top:8px">{actions_html}</div></div>"""


def scr_select():
    pics, rects = gallery(296, selected=(0, 1, 2), ticks=True)
    TARGETS["select"] = {"t0": rects[0][:2] + (34, 34), "t1": rects[1][:2] + (34, 34), "t2": rects[2][:2] + (34, 34), "download": (220, 844 - 118 - 96 + 52, 110, 36), "bar": (16, 844 - 214, 358, 96)}
    acts = '<span class="btn muted" style="width:56px;height:36px;font-size:13px">ขอลบ</span><span class="btn dark" style="width:110px;height:36px;font-size:13px">ดาวน์โหลด 3</span><span class="btn muted" style="width:56px;height:36px;font-size:13px">ยกเลิก</span>'
    return f"""{results_top()}
<div class="abs" style="left:16px;top:{286 - 46}px;right:16px;height:34px;display:flex;align-items:center;justify-content:flex-end"><span class="btn dark" style="width:60px;height:34px;font-size:12px">เสร็จ</span></div>
{pics}{selection_bar("เลือก 3 รูป", acts)}{bottom_nav()}"""


def scr_remove():
    pics, rects = gallery(366, selected=(1,), ticks=True)
    TARGETS["remove"] = {"banner": (16, 286, 358, 66), "pick": rects[1][:2] + (34, 34), "send": (232, 844 - 118 - 96 + 52, 130, 36)}
    acts = '<span class="btn" style="width:130px;height:36px;font-size:13px;background:#dc2626;color:#fff">ส่งคำขอลบ 1</span><span class="btn muted" style="width:56px;height:36px;font-size:13px">ยกเลิก</span>'
    return f"""{results_top()}
<div class="abs" style="left:16px;top:{286 - 46}px;right:16px;height:34px;display:flex;align-items:center;justify-content:flex-end"><span class="btn dark" style="width:60px;height:34px;font-size:12px">เสร็จ</span></div>
<div class="abs" style="left:16px;top:286px;width:358px;height:66px;border:1px solid #fecaca;background:#fef2f2;border-radius:16px;padding:10px 12px;display:flex;gap:10px">
 <div style="width:20px;height:20px;border-radius:999px;background:#ef4444;color:#fff;font-size:12px;display:grid;place-items:center;flex:none">!</div>
 <div><div style="font-size:13px;font-weight:700">เลือกรูปที่มีคุณ ที่ต้องการให้ลบออกจากระบบ</div><div class="muted" style="font-size:11px">แตะรูปเพื่อเลือก แล้วกด “ส่งคำขอลบ”</div></div></div>
{pics}{selection_bar("เลือก 1 รูป", acts)}{bottom_nav()}"""


def scr_remove_dialog():
    TARGETS["remove_dialog"] = {"contact": (42, 400, 306, 44), "send": (42, 532, 306, 46), "modal": (20, 250, 350, 350)}
    return f"""{scr_remove()}
<div class="abs" style="inset:0;background:rgba(0,0,0,.22)"></div>
<div class="abs" style="left:20px;top:250px;width:350px;height:350px;background:#fff;border-radius:24px;padding:22px">
  <div style="font-size:18px;font-weight:700">ขอให้ลบรูปของฉัน</div>
  <div class="muted" style="font-size:13px;line-height:1.7;margin-top:10px">ส่งคำขอให้ผู้จัดงานลบรูปที่เลือก <b style="color:#121211">1 รูป</b> ออกจากระบบ (รวมข้อมูลใบหน้าในรูปนั้น)</div>
</div>
<div class="abs" style="left:42px;top:400px;width:306px;height:44px;border-radius:16px;background:#f6f6f5;padding:12px 14px;font-size:13px">LINE: @me.photo</div>
<div class="abs" style="left:42px;top:452px;width:306px;height:66px;border-radius:16px;background:#f6f6f5;padding:12px 14px;font-size:13px" class="muted"><span class="muted">หมายเหตุ (ไม่บังคับ)</span></div>
<div class="abs dark btn" style="left:42px;top:532px;width:306px;height:46px">ส่งคำขอลบ</div>"""


# ------------------------------------------------------------------ desktop screens


def admin_header():
    return f"""<div class="hdr" style="height:60px;padding:0 64px"><div class="logo"><img src="{MARK}">รูปเรา <small>Rup<b>Rao</b></small><span style="font-size:11px;background:#f6f6f5;border-radius:999px;padding:2px 8px;color:#6b6b6b;font-weight:400">ผู้จัดงาน</span></div>
<div style="display:flex;gap:18px;font-size:14px"><span style="background:#f6f6f5;border-radius:999px;padding:6px 12px">อีเวนต์</span><span class="muted" style="padding:6px 0">ออกจากระบบ</span></div></div>"""


def scr_admin_new():
    TARGETS["admin_new"] = {"name": (120, 236, 760, 50), "access": (120, 420, 760, 86), "retention": (120, 600, 760, 70), "create": (960, 560, 300, 52), "preview": (936, 150, 348, 470)}
    radio = lambda on, t, d: f'<div style="flex:1;border:1px solid {"#0a0a0a" if on else "#ececec"};border-radius:16px;padding:14px;display:flex;gap:10px"><div style="width:18px;height:18px;border-radius:999px;border:2px solid {"#0a0a0a" if on else "#cfcfcf"};display:grid;place-items:center">{"<div style=width:9px;height:9px;border-radius:9px;background:#0a0a0a></div>" if on else ""}</div><div><div style="font-size:14px">{t}</div><div class="muted" style="font-size:12px">{d}</div></div></div>'
    ret = "".join(f'<div style="flex:1;border:1px solid {"#0a0a0a" if on else "#ececec"};background:{"#0a0a0a" if on else "#fff"};color:{"#fff" if on else "#121211"};border-radius:16px;padding:12px;font-size:14px">{t}</div>' for t, on in [("30 วัน", False), ("90 วัน", True), ("6 เดือน", False), ("1 ปี", False), ("ไม่ลบอัตโนมัติ", False)])
    return f"""{admin_header()}
<div class="abs" style="left:120px;top:96px"><div class="muted" style="font-size:14px">← อีเวนต์ทั้งหมด</div><div style="font-size:26px;font-weight:700;margin-top:6px">สร้างอีเวนต์ใหม่</div></div>
<div class="abs line" style="left:96px;top:176px;width:808px;height:150px;border-radius:28px;padding:20px 24px">
 <div style="font-weight:700">① ข้อมูลอีเวนต์</div>
 <div style="margin-top:10px;height:50px;border:1px solid #0a0a0a;border-radius:16px;padding:12px 16px;font-size:16px;width:760px">{EVENT}</div></div>
<div class="abs line" style="left:96px;top:346px;width:808px;height:184px;border-radius:28px;padding:20px 24px">
 <div style="font-weight:700">② ใครเข้าถึงได้</div>
 <div style="display:flex;gap:12px;margin-top:12px">{radio(False,"มีลิงก์ก็เข้าได้","สะดวกที่สุด")}{radio(True,"ต้องใส่รหัสเข้าชม","รหัส 482913")}</div></div>
<div class="abs line" style="left:96px;top:550px;width:808px;height:150px;border-radius:28px;padding:20px 24px">
 <div style="font-weight:700">③ เก็บข้อมูลนานเท่าไร</div>
 <div style="display:flex;gap:10px;margin-top:12px">{ret}</div></div>
<div class="abs line" style="left:936px;top:150px;width:348px;height:490px;border-radius:28px;padding:20px">
 <div class="muted" style="font-size:12px">ตัวอย่างที่ผู้ร่วมงานเห็น</div>
 <div class="card" style="margin-top:10px;padding:18px;text-align:center;border-radius:18px"><div class="muted" style="font-size:11px">อีเวนต์</div><div style="font-weight:700">{EVENT}</div><img src="{MARK}" style="width:64px;margin-top:10px"><div style="font-size:13px;margin-top:8px">ค้นหารูปของคุณด้วยใบหน้า</div></div>
 <div style="font-size:13px;line-height:2;margin-top:14px" class="muted">✅ ตั้งชื่อแล้ว<br>✅ รหัสเข้าชม 482913<br>✅ เห็นเฉพาะรูปตัวเอง<br>✅ ลบอัตโนมัติใน 90 วัน</div>
</div>
<div class="abs dark btn" style="left:960px;top:560px;width:300px;height:52px;font-size:15px">สร้างอีเวนต์</div>"""


def scr_admin_upload():
    TARGETS["admin_upload"] = {"drop": (120, 240, 1200, 150), "progress": (520, 330, 400, 10), "grid": (120, 420, 1200, 420), "status": (128, 428, 110, 26)}
    thumbs = []
    for i in range(12):
        x = 120 + (i % 6) * 204
        y = 420 + (i // 6) * 210
        st = ["3 ใบหน้า", "2 ใบหน้า", "4 ใบหน้า", "1 ใบหน้า", "กำลังสแกน", "รอสแกน"][i % 6] if i < 10 else "รอสแกน"
        dot = "#10b981" if "ใบหน้า" in st else ("#fbbf24" if st == "กำลังสแกน" else "#c9c9c9")
        thumbs.append(f'<div class="photo" style="left:{x}px;top:{y}px;width:192px;height:192px"><img src="{img(f"other{i}.png")}"><div class="abs" style="left:8px;bottom:8px;background:rgba(255,255,255,.92);border-radius:999px;padding:3px 10px;font-size:12px;display:flex;align-items:center;gap:6px"><span style="width:7px;height:7px;border-radius:9px;background:{dot}"></span>{st}</div></div>')
    return f"""{admin_header()}
<div class="abs" style="left:120px;top:84px"><div class="muted" style="font-size:13px">← อีเวนต์ทั้งหมด</div><div style="font-size:24px;font-weight:700;margin-top:4px">{EVENT}</div><div class="muted" style="font-size:12px;margin-top:4px">1,248 รูป · 3,904 ใบหน้า · <span style="color:#121211">● กำลังสแกน 38 รูป</span></div></div>
<div class="abs" style="left:120px;top:184px;width:1200px;height:40px;border-bottom:1px solid #ececec;display:flex;gap:28px;font-size:14px"><b style="border-bottom:2px solid #0a0a0a;padding-bottom:10px">รูปภาพ 1,248</b><span class="muted">แชร์ / QR</span><span class="muted">ตั้งค่า</span><span class="muted">คำขอลบ <span style="background:#fbbf24;color:#121211;border-radius:999px;padding:0 6px">1</span></span></div>
<div class="abs" style="left:120px;top:240px;width:1200px;height:150px;border:2px dashed #dcdcdc;border-radius:24px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:12px">
 <div style="font-size:15px;font-weight:700">กำลังอัปโหลด 80 / 120</div>
 <div style="width:400px;height:10px;border-radius:9px;background:#ececec"><div style="width:66%;height:100%;border-radius:9px;background:#0a0a0a"></div></div></div>
{"".join(thumbs)}"""


def scr_admin_share():
    TARGETS["admin_share"] = {"qr": (160, 300, 300, 300), "link": (520, 380, 640, 46), "download_qr": (520, 470, 150, 40), "copy": (1080, 383, 90, 40)}
    return f"""{admin_header()}
<div class="abs" style="left:120px;top:84px"><div class="muted" style="font-size:13px">← อีเวนต์ทั้งหมด</div><div style="font-size:24px;font-weight:700;margin-top:4px">{EVENT}</div></div>
<div class="abs" style="left:120px;top:184px;width:1200px;height:40px;border-bottom:1px solid #ececec;display:flex;gap:28px;font-size:14px"><span class="muted">รูปภาพ 1,248</span><b style="border-bottom:2px solid #0a0a0a;padding-bottom:10px">แชร์ / QR</b><span class="muted">ตั้งค่า</span><span class="muted">คำขอลบ</span></div>
<div class="abs line" style="left:120px;top:260px;width:1200px;height:380px;border-radius:28px"></div>
<img class="abs" src="{img('qr.png')}" style="left:150px;top:290px;width:320px">
<div class="abs" style="left:520px;top:310px"><div style="font-size:16px;font-weight:700">ลิงก์สำหรับผู้ร่วมงาน</div><div class="muted" style="font-size:13px;margin-top:4px">ผู้ร่วมงานค้นหารูปได้เฉพาะในอีเวนต์นี้เท่านั้น และต้องใส่รหัสเข้าชม</div></div>
<div class="abs" style="left:520px;top:380px;width:640px;height:46px;border-radius:999px;background:#f6f6f5;display:flex;align-items:center;padding:0 18px;font-size:14px;font-family:monospace">https://ruprao.app/e/k7m2qx9p</div>
<div class="abs dark btn" style="left:1080px;top:383px;width:90px;height:40px;font-size:13px">คัดลอก</div>
<div class="abs muted" style="left:520px;top:438px;font-size:13px">รหัสอีเวนต์ <b style="color:#121211">k7m2qx9p</b> · รหัสเข้าชม <b style="color:#121211">482913</b></div>
<div class="abs pill btn" style="left:520px;top:470px;width:150px;height:40px;font-size:13px">ดาวน์โหลด QR</div>
<div class="abs pill btn" style="left:680px;top:470px;width:150px;height:40px;font-size:13px">เปิดหน้าค้นหา ↗</div>
<div class="abs pill btn muted" style="left:840px;top:470px;width:130px;height:40px;font-size:13px">สร้างลิงก์ใหม่</div>"""


def scr_admin_requests():
    TARGETS["admin_requests"] = {"card": (120, 260, 1200, 250), "approve": (1110, 286, 180, 42), "reject": (1000, 286, 100, 42)}
    return f"""{admin_header()}
<div class="abs" style="left:120px;top:84px"><div class="muted" style="font-size:13px">← อีเวนต์ทั้งหมด</div><div style="font-size:24px;font-weight:700;margin-top:4px">{EVENT}</div></div>
<div class="abs" style="left:120px;top:184px;width:1200px;height:40px;border-bottom:1px solid #ececec;display:flex;gap:28px;font-size:14px"><span class="muted">รูปภาพ 1,248</span><span class="muted">แชร์ / QR</span><span class="muted">ตั้งค่า</span><b style="border-bottom:2px solid #0a0a0a;padding-bottom:10px">คำขอลบ <span style="background:#fbbf24;border-radius:999px;padding:0 6px">1</span></b></div>
<div class="abs" style="left:120px;top:260px;width:1200px;height:250px;border:1px solid #fde68a;border-radius:28px;padding:24px">
 <div style="font-size:15px;font-weight:700">1 รูป · 2 ต.ค. 2569 14:32</div><div class="muted" style="font-size:13px;margin-top:4px">ติดต่อ: LINE: @me.photo</div>
 <div class="photo" style="left:24px;top:96px;width:180px;height:130px"><img src="{img('hero1.png')}"></div></div>
<div class="abs pill btn" style="left:1000px;top:286px;width:100px;height:42px;font-size:13px">ปฏิเสธ</div>
<div class="abs dark btn" style="left:1110px;top:286px;width:180px;height:42px;font-size:13px">อนุมัติและลบรูป</div>"""


PHONE_SCREENS = {"qr": scr_qr, "event": scr_event, "consent": scr_consent, "camera": scr_camera, "scanning": scr_scanning,
                 "results": scr_results, "select": scr_select, "remove": scr_remove, "remove_dialog": scr_remove_dialog}
DESKTOP_SCREENS = {"admin_new": scr_admin_new, "admin_upload": scr_admin_upload, "admin_share": scr_admin_share, "admin_requests": scr_admin_requests}


def edge_shot(html_body: str, out: Path, w: int, h: int, scale: float):
    page = out.with_suffix(".html")
    page.write_text(f'<!doctype html><html><head><meta charset="utf-8"><style>{CSS}</style></head><body style="width:{w}px;height:{h}px;position:relative;overflow:hidden">{html_body}</body></html>', encoding="utf-8")
    if out.exists():
        out.unlink()
    subprocess.run([EDGE, "--headless=new", "--disable-gpu", "--hide-scrollbars", "--no-first-run",
                    f"--user-data-dir={BUILD / 'edge-profile'}", f"--force-device-scale-factor={scale}",
                    f"--window-size={w},{h}", f"--screenshot={out}", page.as_uri()], check=True, timeout=120)
    last = -1
    for _ in range(240):
        if out.exists() and out.stat().st_size == last and last > 0:
            return
        last = out.stat().st_size if out.exists() else -1
        time.sleep(0.25)
    raise RuntimeError(f"Edge did not write {out}")


def build(force=False):
    SCREENS.mkdir(parents=True, exist_ok=True)
    make_images()
    for name, fn in PHONE_SCREENS.items():
        body = fn()
        out = SCREENS / f"{name}.png"
        if force or not out.exists():
            edge_shot(body, out, *PHONE)
    for name, fn in DESKTOP_SCREENS.items():
        body = fn()
        out = SCREENS / f"{name}.png"
        if force or not out.exists():
            edge_shot(body, out, *DESKTOP)
    return TARGETS


if __name__ == "__main__":
    build(force=True)
    print("screens:", sorted(p.name for p in SCREENS.glob("*.png")))
