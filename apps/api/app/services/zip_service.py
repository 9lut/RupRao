import tempfile
import zipfile
from collections.abc import Callable, Iterator

from app.db.models import Photo
from app.services.storage_service import storage

CHUNK = 1024 * 1024


def build_zip(photos: list[Photo], transform: Callable[[bytes], bytes] | None = None) -> Iterator[bytes]:
    """Zip originals into a spooled temp file (RAM up to 64 MB, then disk) and stream it out.
    `transform` rewrites each JPEG first (e.g. the event watermark)."""
    spool = tempfile.SpooledTemporaryFile(max_size=64 * 1024 * 1024)
    # JPEGs are already compressed; STORED is much faster and barely larger.
    with zipfile.ZipFile(spool, "w", compression=zipfile.ZIP_STORED) as zf:
        for i, photo in enumerate(photos, 1):
            data = storage.download(photo.storage_key)
            zf.writestr(f"photo-{i:03d}-{str(photo.id)[:8]}.jpg", transform(data) if transform else data)
    spool.seek(0)

    def stream() -> Iterator[bytes]:
        try:
            while chunk := spool.read(CHUNK):
                yield chunk
        finally:
            spool.close()

    return stream()
