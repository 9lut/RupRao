"""Delete events (DB rows + stored files) whose retention period has ended."""

import logging
import uuid

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.db.database import SessionLocal
from app.db.models import Event, Photo
from app.services.storage_service import event_prefix, storage

log = logging.getLogger(__name__)


def delete_event(db: Session, event: Event) -> None:
    event_id = event.id
    db.delete(event)  # photos, faces, removal requests cascade in Postgres
    db.commit()
    storage.delete_prefix(event_prefix(event_id))


def delete_photos(db: Session, event_id: uuid.UUID, photo_ids: list[uuid.UUID]) -> int:
    photos = db.scalars(select(Photo).where(Photo.event_id == event_id, Photo.id.in_(photo_ids))).all()
    keys = [k for p in photos for k in (p.storage_key, p.thumbnail_key)]
    for p in photos:
        db.delete(p)
    db.commit()
    storage.delete(*keys)
    return len(photos)


def delete_expired_events() -> int:
    with SessionLocal() as db:
        expired = db.scalars(
            select(Event).where(Event.expires_at.is_not(None), Event.expires_at < func.now())
        ).all()
        for event in expired:
            log.info("Retention: deleting expired event %s (%s)", event.id, event.name)
            delete_event(db, event)
        return len(expired)
