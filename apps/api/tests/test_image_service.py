import io

import pytest
from PIL import Image

from app.services.image_service import ImageValidationError, process_upload


def _jpeg(w=800, h=600, **kw) -> bytes:
    buf = io.BytesIO()
    Image.new("RGB", (w, h), (200, 120, 80)).save(buf, "JPEG", **kw)
    return buf.getvalue()


def test_valid_jpeg_produces_original_and_thumbnail():
    out = process_upload(_jpeg(2000, 1000))
    assert (out.width, out.height) == (2000, 1000)
    thumb = Image.open(io.BytesIO(out.thumbnail))
    assert thumb.format == "WEBP" and max(thumb.size) <= 1440
    assert Image.open(io.BytesIO(out.original)).format == "JPEG"


def test_exif_orientation_applied():
    img = Image.new("RGB", (400, 200))
    exif = img.getexif()
    exif[0x0112] = 6  # rotate 90° CW
    buf = io.BytesIO()
    img.save(buf, "JPEG", exif=exif)
    out = process_upload(buf.getvalue())
    assert (out.width, out.height) == (200, 400)


@pytest.mark.parametrize("data", [b"", b"not an image at all", b"\xff\xd8\xff\xe0garbage"])
def test_rejects_non_images(data):
    with pytest.raises(ImageValidationError):
        process_upload(data)


def test_rejects_disallowed_format():
    buf = io.BytesIO()
    Image.new("RGB", (10, 10)).save(buf, "GIF")
    with pytest.raises(ImageValidationError):
        process_upload(buf.getvalue())
