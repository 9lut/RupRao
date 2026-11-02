"""Stamp the event logo onto photos attendees download (originals in storage stay untouched)."""

import io
from functools import lru_cache

from PIL import Image

from app.db.models import Event
from app.services.storage_service import storage

POSITIONS = {"tl", "tr", "bl", "br", "center"}


def watermark_options(event: Event) -> dict | None:
    """Settings if this event stamps downloads, else None (no logo = nothing to stamp)."""
    custom = event.theme_custom or {}
    if not custom.get("watermark") or not event.logo_key:
        return None
    return {
        "logo_key": event.logo_key,
        "position": custom.get("watermark_position") if custom.get("watermark_position") in POSITIONS else "br",
        "size": float(custom.get("watermark_size") or 18),  # % of the photo's width
        "opacity": float(custom.get("watermark_opacity") or 0.8),
    }


@lru_cache(maxsize=16)
def _logo(key: str) -> Image.Image:
    # Keys change on every upload, so caching by key never serves a stale logo.
    return Image.open(io.BytesIO(storage.download(key))).convert("RGBA")


def apply_watermark(jpeg: bytes, opts: dict) -> bytes:
    img = Image.open(io.BytesIO(jpeg)).convert("RGB")
    logo = _logo(opts["logo_key"])
    width = max(24, int(img.width * opts["size"] / 100))
    height = max(1, int(logo.height * width / logo.width))
    mark = logo.resize((width, height), Image.Resampling.LANCZOS)
    if opts["opacity"] < 1:
        alpha = mark.getchannel("A").point(lambda a: int(a * opts["opacity"]))
        mark.putalpha(alpha)

    margin = int(min(img.width, img.height) * 0.03)
    x = {"tl": margin, "bl": margin, "tr": img.width - width - margin, "br": img.width - width - margin}.get(
        opts["position"], (img.width - width) // 2
    )
    y = {"tl": margin, "tr": margin, "bl": img.height - height - margin, "br": img.height - height - margin}.get(
        opts["position"], (img.height - height) // 2
    )
    img.paste(mark, (x, y), mark)
    out = io.BytesIO()
    img.save(out, "JPEG", quality=92, optimize=True)
    return out.getvalue()
