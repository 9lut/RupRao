from sqlalchemy import case, func, select
from sqlalchemy.orm import Session

from app.config import settings
from app.db.models import Event, Photo, PhotoStatus, RemovalRequest, RemovalStatus
from app.schemas.common import EventAdminOut, PhotoOut, PublicPhotoOut
from app.services.storage_service import storage


def _urls(photo: Photo) -> dict:
    return {
        "url": storage.get_url(photo.storage_key),
        "thumbnail_url": storage.get_url(photo.thumbnail_key) if photo.thumbnail_key else None,
    }


def photo_out(photo: Photo) -> PhotoOut:
    return PhotoOut(
        id=photo.id,
        event_id=photo.event_id,
        original_filename=photo.original_filename,
        width=photo.width,
        height=photo.height,
        status=photo.status,
        face_count=photo.face_count,
        error=photo.error,
        created_at=photo.created_at,
        **_urls(photo),
    )


def public_photo_out(photo: Photo) -> PublicPhotoOut:
    return PublicPhotoOut(
        id=photo.id, width=photo.width, height=photo.height, created_at=photo.created_at, **_urls(photo)
    )


def effective_threshold(event: Event) -> float:
    return event.match_threshold if event.match_threshold is not None else settings.search_default_threshold


def event_admin_out(db: Session, event: Event) -> EventAdminOut:
    unfinished = Photo.status.in_([PhotoStatus.PENDING, PhotoStatus.PROCESSING])
    photo_count, face_count, pending, failed = db.execute(
        select(
            func.count(Photo.id),
            func.coalesce(func.sum(Photo.face_count), 0),
            func.coalesce(func.sum(case((unfinished, 1), else_=0)), 0),
            func.coalesce(func.sum(case((Photo.status == PhotoStatus.FAILED, 1), else_=0)), 0),
        ).where(Photo.event_id == event.id)
    ).one()
    removals = db.scalar(
        select(func.count(RemovalRequest.id)).where(
            RemovalRequest.event_id == event.id, RemovalRequest.status == RemovalStatus.PENDING
        )
    )
    cover_key = db.scalar(
        select(Photo.thumbnail_key)
        .where(Photo.event_id == event.id, Photo.thumbnail_key.is_not(None))
        .order_by(Photo.face_count.desc(), Photo.created_at.desc())
        .limit(1)
    )
    return EventAdminOut(
        id=event.id,
        name=event.name,
        description=event.description,
        share_token=event.share_token,
        access_code=event.access_code,
        match_threshold=event.match_threshold,
        effective_threshold=effective_threshold(event),
        expires_at=event.expires_at,
        public_album=event.public_album,
        created_at=event.created_at,
        photo_count=photo_count,
        face_count=face_count,
        pending_count=pending,
        failed_count=failed,
        pending_removals=removals or 0,
        cover_url=storage.get_url(cover_key) if cover_key else None,
    )
