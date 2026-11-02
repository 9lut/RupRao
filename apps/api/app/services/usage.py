"""How much storage events and organizers use, and whether more photos still fit.

Album sizes come from photos.size_bytes (original + thumbnail), so they stay right when photos are
deleted. Banner, logo and favicon aren't counted: they are a few hundred KB against many GB of photos.
"""

import logging
import shutil
import uuid

from sqlalchemy import func, select, update
from sqlalchemy.orm import Session

from app.config import settings
from app.db.database import SessionLocal
from app.db.models import Event, Photo, User
from app.services.storage_service import event_prefix, storage

log = logging.getLogger(__name__)

GB = 1024**3


def event_bytes(db: Session, event_id: uuid.UUID) -> int:
    return int(db.scalar(select(func.coalesce(func.sum(Photo.size_bytes), 0)).where(Photo.event_id == event_id)))


def owner_bytes(db: Session, owner_id: uuid.UUID) -> int:
    return int(
        db.scalar(select(func.coalesce(func.sum(Photo.size_bytes), 0)).join(Event).where(Event.owner_id == owner_id))
    )


def disk_usage() -> dict | None:
    """The disk holding the photos. None when photos live elsewhere (R2, GCS) or outside Docker."""
    try:
        total, used, free = shutil.disk_usage(settings.storage_disk_path)
    except OSError:
        return None
    return {"total": total, "used": used, "free": free}


def _gb(n: int) -> str:
    return f"{n / GB:.1f} GB"


def upload_block(db: Session, event: Event, incoming: int) -> str | None:
    """Why `incoming` more bytes can't go into this event, or None if they fit."""
    if event.storage_quota_bytes is not None and event_bytes(db, event.id) + incoming > event.storage_quota_bytes:
        return f"พื้นที่ของอัลบั้มนี้เต็มแล้ว (จำกัด {_gb(event.storage_quota_bytes)})"
    owner = db.get(User, event.owner_id) if event.owner_id else None
    if owner and owner.storage_quota_bytes is not None and owner_bytes(db, owner.id) + incoming > owner.storage_quota_bytes:
        return f"พื้นที่ของบัญชีนี้เต็มแล้ว (จำกัด {_gb(owner.storage_quota_bytes)})"
    disk = disk_usage()
    # A completely full disk would also stop Postgres, so stop taking photos a little before that.
    if disk and disk["free"] - incoming < settings.storage_min_free_gb * GB:
        return "พื้นที่เซิร์ฟเวอร์ใกล้เต็ม กรุณาติดต่อผู้ดูแลระบบ"
    return None


def lock_quota(db: Session, event: Event) -> None:
    """Hold the owner and event rows until commit, so parallel uploads can't both take the last space."""
    if event.owner_id:
        db.execute(select(User.id).where(User.id == event.owner_id).with_for_update(key_share=True))
    db.execute(select(Event.id).where(Event.id == event.id).with_for_update(key_share=True))


def backfill_photo_sizes() -> int:
    """Fill in size_bytes for photos uploaded before it existed. Safe to run on every start."""
    with SessionLocal() as db:
        rows = db.execute(
            select(Photo.id, Photo.event_id, Photo.storage_key, Photo.thumbnail_key).where(Photo.size_bytes.is_(None))
        ).all()
        if not rows:
            return 0
        sizes: dict[str, int] = {}
        for event_id in {r.event_id for r in rows}:
            sizes.update(storage.sizes(event_prefix(event_id)))
        db.execute(
            update(Photo),
            [{"id": r.id, "size_bytes": sizes.get(r.storage_key, 0) + sizes.get(r.thumbnail_key, 0)} for r in rows],
        )
        db.commit()
        log.info("Counted the storage of %d existing photos", len(rows))
        return len(rows)
