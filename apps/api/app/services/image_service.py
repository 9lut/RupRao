"""Validate untrusted uploads and produce normalized original + thumbnail."""

import io
from dataclasses import dataclass

import numpy as np
from PIL import Image, ImageOps, UnidentifiedImageError

from app.config import settings

ALLOWED_FORMATS = {"JPEG", "PNG", "WEBP"}
Image.MAX_IMAGE_PIXELS = settings.max_image_pixels


class ImageValidationError(ValueError):
    pass


@dataclass
class ProcessedImage:
    original: bytes  # JPEG
    thumbnail: bytes  # WebP
    width: int
    height: int


def load_image(data: bytes) -> Image.Image:
    """Decode bytes, verify real image content (not the client-sent MIME), apply EXIF orientation."""
    if not data:
        raise ImageValidationError("ไฟล์ว่างเปล่า")
    if len(data) > settings.max_upload_mb * 1024 * 1024:
        raise ImageValidationError(f"ไฟล์ใหญ่เกิน {settings.max_upload_mb} MB")
    try:
        img = Image.open(io.BytesIO(data))
        if img.format not in ALLOWED_FORMATS:
            raise ImageValidationError("รองรับเฉพาะ JPEG, PNG, WebP")
        if img.width * img.height > settings.max_image_pixels:
            raise ImageValidationError("ความละเอียดภาพสูงเกินไป")
        img.load()
    except (UnidentifiedImageError, Image.DecompressionBombError, OSError) as exc:
        raise ImageValidationError("ไฟล์ไม่ใช่รูปภาพที่ถูกต้อง") from exc
    img = ImageOps.exif_transpose(img)
    return img.convert("RGB")


def process_upload(data: bytes) -> ProcessedImage:
    img = load_image(data)

    original = io.BytesIO()
    # Re-encoding strips metadata (GPS etc.) and any embedded payloads.
    img.save(original, "JPEG", quality=92, optimize=True)

    thumb = img.copy()
    thumb.thumbnail((settings.thumbnail_size, settings.thumbnail_size * 2), Image.Resampling.LANCZOS)
    thumbnail = io.BytesIO()
    thumb.save(thumbnail, "WEBP", quality=82, method=4)

    return ProcessedImage(original.getvalue(), thumbnail.getvalue(), img.width, img.height)


def to_bgr_array(img: Image.Image) -> np.ndarray:
    return np.asarray(img)[:, :, ::-1].copy()
