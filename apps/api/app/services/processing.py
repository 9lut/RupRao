"""Photo -> faces pipeline. Runs inside the RQ worker (app/worker.py)."""

import io
import logging
import uuid

from PIL import Image
from sqlalchemy import select, update

from app.db.database import SessionLocal
from app.db.models import Face, Photo, PhotoStatus
from app.services.face_service import det_size_for, face_service
from app.services.image_service import to_bgr_array
from app.services.storage_service import storage

log = logging.getLogger(__name__)


def process_photo(photo_id: str | uuid.UUID) -> int:
    """Detect + embed faces for one photo. Raises on failure so RQ retries it."""
    photo_id = uuid.UUID(str(photo_id))
    with SessionLocal() as db:
        photo = db.get(Photo, photo_id)
        if photo is None:
            return 0  # deleted while queued
        photo.status = PhotoStatus.PROCESSING
        photo.error = None
        db.commit()

        try:
            data = storage.download(photo.storage_key)
            img = Image.open(io.BytesIO(data)).convert("RGB")
            faces = face_service.detect(to_bgr_array(img), det_size=det_size_for(img.width, img.height))

            db.query(Face).filter(Face.photo_id == photo.id).delete()
            for f in faces:
                db.add(Face(
                    photo_id=photo.id, x=f.x, y=f.y, width=f.width, height=f.height,
                    det_score=f.score, embedding=f.embedding,
                ))
            photo.face_count = len(faces)
            photo.status = PhotoStatus.PROCESSED
            db.commit()
            log.info("Photo %s: %d faces", photo.id, len(faces))
            return len(faces)
        except Exception as exc:
            db.rollback()
            log.exception("Processing failed for photo %s", photo_id)
            db.execute(
                update(Photo)
                .where(Photo.id == photo_id)
                .values(status=PhotoStatus.FAILED, error=str(exc)[:500])
            )
            db.commit()
            raise


def unfinished_photo_ids() -> list[uuid.UUID]:
    """Photos left PENDING/PROCESSING (e.g. by a crash). PROCESSING ones are reset to PENDING."""
    with SessionLocal() as db:
        db.execute(
            update(Photo).where(Photo.status == PhotoStatus.PROCESSING).values(status=PhotoStatus.PENDING)
        )
        db.commit()
        return list(
            db.scalars(select(Photo.id).where(Photo.status == PhotoStatus.PENDING).order_by(Photo.created_at))
        )
