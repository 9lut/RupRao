"""Validate untrusted uploads and produce normalized original + thumbnail."""

import io
from dataclasses import dataclass

import numpy as np
from PIL import Image, ImageCms, ImageOps, UnidentifiedImageError
from pillow_heif import register_heif_opener

from app.config import settings

register_heif_opener()  # what iPhones and many Android phones shoot by default

ALLOWED_FORMATS = {"JPEG", "PNG", "WEBP", "HEIF"}
Image.MAX_IMAGE_PIXELS = settings.max_image_pixels
_SRGB = ImageCms.createProfile("sRGB")


class ImageValidationError(ValueError):
    pass


@dataclass
class ProcessedImage:
    original: bytes  # JPEG
    thumbnail: bytes  # WebP
    width: int
    height: int


def load_image(data: bytes, keep_alpha: bool = False) -> Image.Image:
    """Decode bytes, verify real image content (not the client-sent MIME), apply EXIF orientation."""
    if not data:
        raise ImageValidationError("ไฟล์ว่างเปล่า")
    if len(data) > settings.max_upload_mb * 1024 * 1024:
        raise ImageValidationError(f"ไฟล์ใหญ่เกิน {settings.max_upload_mb} MB")
    try:
        img = Image.open(io.BytesIO(data))
        if img.format not in ALLOWED_FORMATS:
            raise ImageValidationError("รองรับเฉพาะ JPEG, PNG, WebP, HEIC")
        if img.width * img.height > settings.max_image_pixels:
            raise ImageValidationError("ความละเอียดภาพสูงเกินไป")
        source_format = img.format
        img.load()
    except (UnidentifiedImageError, Image.DecompressionBombError, OSError, ValueError) as exc:
        raise ImageValidationError("ไฟล์ไม่ใช่รูปภาพที่ถูกต้อง") from exc
    img = ImageOps.exif_transpose(img).convert("RGBA" if keep_alpha else "RGB")
    img.info["source_format"] = source_format
    return img


def _to_srgb(img: Image.Image) -> Image.Image:
    """Phones shoot in wider colour (Display P3). Saving those numbers without their profile, which
    re-encoding drops, makes photos look washed out, so convert the colours to standard sRGB."""
    icc = img.info.get("icc_profile")
    if not icc:
        return img
    try:
        return ImageCms.profileToProfile(img, ImageCms.ImageCmsProfile(io.BytesIO(icc)), _SRGB, outputMode="RGB")
    except (ImageCms.PyCMSError, OSError):
        return img  # a damaged profile shouldn't cost anyone their photo


def process_upload(data: bytes) -> ProcessedImage:
    img = load_image(data)
    # A HEIC has never been a JPEG, so this is its one conversion: keep it sharp, with full-resolution
    # colour. JPEGs are already compressed, and more quality couldn't bring back what they lost.
    jpeg = {"quality": 95, "subsampling": 0} if img.info["source_format"] == "HEIF" else {"quality": 92}
    img = _to_srgb(img)

    original = io.BytesIO()
    # Re-encoding strips metadata (GPS etc.) and any embedded payloads.
    img.save(original, "JPEG", optimize=True, **jpeg)

    thumb = img.copy()
    thumb.thumbnail((settings.thumbnail_size, settings.thumbnail_size * 2), Image.Resampling.LANCZOS)
    thumbnail = io.BytesIO()
    thumb.save(thumbnail, "WEBP", quality=82, method=4)

    return ProcessedImage(original.getvalue(), thumbnail.getvalue(), img.width, img.height)


BANNER_MAX = (2400, 1200)


def process_banner(data: bytes) -> bytes:
    """Event page background: downscale, strip metadata, re-encode as WebP."""
    img = load_image(data)
    img.thumbnail(BANNER_MAX, Image.Resampling.LANCZOS)
    out = io.BytesIO()
    img.save(out, "WEBP", quality=82, method=4)
    return out.getvalue()


LOGO_MAX = (800, 400)


def process_logo(data: bytes) -> bytes:
    """Event logo: keep transparency (PNG/WebP), downscale, re-encode as WebP."""
    img = load_image(data, keep_alpha=True)
    img.thumbnail(LOGO_MAX, Image.Resampling.LANCZOS)
    out = io.BytesIO()
    img.save(out, "WEBP", quality=90, method=4)
    return out.getvalue()


FAVICON_SIZE = 256


def process_favicon(data: bytes) -> bytes:
    """Browser-tab icon: fit inside a transparent square so wide logos are not squashed."""
    img = load_image(data, keep_alpha=True)
    img.thumbnail((FAVICON_SIZE, FAVICON_SIZE), Image.Resampling.LANCZOS)
    square = Image.new("RGBA", (FAVICON_SIZE, FAVICON_SIZE), (0, 0, 0, 0))
    square.paste(img, ((FAVICON_SIZE - img.width) // 2, (FAVICON_SIZE - img.height) // 2))
    out = io.BytesIO()
    square.save(out, "PNG", optimize=True)
    return out.getvalue()


def to_bgr_array(img: Image.Image) -> np.ndarray:
    return np.asarray(img)[:, :, ::-1].copy()
