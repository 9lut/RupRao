import io
import struct

import numpy as np
import pytest
from PIL import Image, JpegImagePlugin

from app.services.image_service import ImageValidationError, load_image, process_upload


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


def _detailed(w=1200, h=800) -> Image.Image:
    """Fine, colourful detail: what a blurry or low-quality conversion would visibly damage."""
    rng = np.random.default_rng(1)
    coarse = rng.integers(0, 255, (h // 8, w // 8, 3), dtype=np.uint8)
    return Image.fromarray(coarse).resize((w, h), Image.Resampling.BICUBIC)


def _heic(img: Image.Image, **kw) -> bytes:
    buf = io.BytesIO()
    img.save(buf, "HEIF", quality=95, **kw)
    return buf.getvalue()


def test_heic_becomes_a_sharp_jpeg_and_webp_thumbnail():
    source = _detailed()
    out = process_upload(_heic(source))
    assert (out.width, out.height) == source.size
    jpeg = Image.open(io.BytesIO(out.original))
    assert jpeg.format == "JPEG"
    assert JpegImagePlugin.get_sampling(jpeg) == 0  # 4:4:4, no colour resolution thrown away
    assert Image.open(io.BytesIO(out.thumbnail)).format == "WEBP"
    decoded = Image.open(io.BytesIO(_heic(source))).convert("RGB")
    difference = np.asarray(jpeg, dtype=float) - np.asarray(decoded, dtype=float)
    assert 10 * np.log10(255**2 / np.mean(difference**2)) > 40  # PSNR in dB: visually the same


def with_rotation(heic: bytes, quarter_turns_ccw: int) -> bytes:
    """Add the `irot` box that phones write for portrait shots; the encoder here can't. Rebuilds the
    boxes that contain it and moves the file offsets in `iloc` past the bytes added."""

    def box(kind: bytes, body: bytes) -> bytes:
        return struct.pack(">I", len(body) + 8) + kind + body

    def children(data: bytes) -> list[list]:
        found, at = [], 0
        while at < len(data):
            size = struct.unpack_from(">I", data, at)[0]
            found.append([data[at + 4 : at + 8], data[at + 8 : at + size]])
            at += size
        return found

    def find(boxes: list[list], kind: bytes) -> list:
        return next(b for b in boxes if b[0] == kind)

    top = children(heic)
    meta = find(top, b"meta")
    inner = children(meta[1][4:])
    iprp = find(inner, b"iprp")
    props = children(iprp[1])

    ipco = find(props, b"ipco")
    index = len(children(ipco[1])) + 1
    ipco[1] += box(b"irot", bytes([quarter_turns_ccw]))

    ipma = find(props, b"ipma")
    wide_ids = ipma[1][0] >= 1
    id_size = 4 if wide_ids else 2
    assert struct.unpack_from(">I", ipma[1], 4)[0] == 1 and not ipma[1][3] & 1  # one image, short entries
    count_at = 8 + id_size
    body = bytearray(ipma[1])
    body[count_at] += 1
    ipma[1] = bytes(body) + bytes([index])  # appended: transformations must come last

    iprp[1] = b"".join(box(k, v) for k, v in props)
    added = 9 + 1  # the irot box, and one entry in ipma

    iloc = find(inner, b"iloc")
    body = bytearray(iloc[1])
    version = body[0]
    assert version < 2
    offset_size, length_size = body[4] >> 4, body[4] & 15
    base_size, index_size = body[5] >> 4, body[5] & 15 if version else 0

    def shift(at: int, size: int) -> None:
        offset = int.from_bytes(body[at : at + size], "big")
        body[at : at + size] = (offset + added).to_bytes(size, "big")

    at = 8
    for _ in range(struct.unpack_from(">H", body, 6)[0]):
        at += 2 + (2 if version else 0) + 2
        if base_size:
            shift(at, base_size)  # extents count from here, so they stay as they are
        at += base_size
        extents = struct.unpack_from(">H", body, at)[0]
        at += 2
        for _ in range(extents):
            at += index_size
            if not base_size:
                shift(at, offset_size)
            at += offset_size + length_size
    iloc[1] = bytes(body)

    meta[1] = meta[1][:4] + b"".join(box(k, v) for k, v in inner)
    return b"".join(box(k, v) for k, v in top)


@pytest.mark.parametrize("exif_too", [False, True])  # iPhones write both: it must not turn twice
def test_portrait_phone_heic_stands_upright(exif_too):
    img = Image.new("RGB", (400, 200), (10, 200, 90))
    img.paste((250, 0, 0), (0, 0, 100, 100))  # red in the top-left corner
    kw = {}
    if exif_too:
        exif = img.getexif()
        exif[0x0112] = 6
        kw["exif"] = exif
    out = process_upload(with_rotation(_heic(img, **kw), 3))  # a quarter turn clockwise
    assert (out.width, out.height) == (200, 400)
    upright = Image.open(io.BytesIO(out.original)).convert("RGB")
    assert upright.getpixel((190, 10))[0] > 200  # red moved to the top-right
    assert upright.getpixel((10, 10))[0] < 100


def test_heic_works_for_selfie_search():
    assert load_image(_heic(_detailed(640, 480))).size == (640, 480)


def test_truncated_heic_is_rejected():
    with pytest.raises(ImageValidationError):
        process_upload(_heic(_detailed())[:2000])


def test_damaged_colour_profile_keeps_the_photo():
    buf = io.BytesIO()
    Image.new("RGB", (100, 100), (200, 120, 80)).save(buf, "JPEG", icc_profile=b"not a real profile")
    assert process_upload(buf.getvalue()).width == 100


@pytest.mark.parametrize("data", [b"", b"not an image at all", b"\xff\xd8\xff\xe0garbage"])
def test_rejects_non_images(data):
    with pytest.raises(ImageValidationError):
        process_upload(data)


def test_rejects_disallowed_format():
    buf = io.BytesIO()
    Image.new("RGB", (10, 10)).save(buf, "GIF")
    with pytest.raises(ImageValidationError):
        process_upload(buf.getvalue())


def test_high_resolution_camera_photo_is_accepted_and_downscaled():
    # Sony a7R IV: 9504 x 6336 (61 MP), more than the old 50 MP cap.
    out = process_upload(_jpeg(9504, 6336, quality=70))
    assert max(out.width, out.height) == 6000
    assert abs(out.width / out.height - 9504 / 6336) < 0.01


def test_portrait_camera_photo_keeps_orientation_when_downscaled():
    img = Image.new("RGB", (8000, 5000))
    exif = img.getexif()
    exif[0x0112] = 6  # shot in portrait
    buf = io.BytesIO()
    img.save(buf, "JPEG", exif=exif, quality=60)
    out = process_upload(buf.getvalue())
    assert (out.width, out.height) == (3750, 6000)


def test_validation_messages_are_not_hidden_behind_generic_error():
    buf = io.BytesIO()
    Image.new("RGB", (10, 10)).save(buf, "GIF")
    with pytest.raises(ImageValidationError, match="รองรับเฉพาะ"):
        load_image(buf.getvalue())
    with pytest.raises(ImageValidationError, match="ไม่ใช่รูปภาพ"):
        load_image(b"definitely not an image")
