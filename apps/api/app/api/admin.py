"""Organizer endpoints. Every route requires an admin bearer token."""

import uuid
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status
from fastapi.concurrency import run_in_threadpool
from fastapi.responses import StreamingResponse
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.api.serializers import effective_threshold, event_admin_out, photo_out
from app.config import settings
from app.db.database import get_db
from app.db.models import (
    Event, Face, Photo, PhotoStatus, RemovalRequest, RemovalStatus, new_share_token,
)
from app.schemas.common import (
    EventAdminOut, EventCreate, EventUpdate, PhotoIds, PhotoOut, RemovalOut, UploadError, UploadResult,
)
from app.services.auth import require_admin
from app.services.calibration import calibrate
from app.services.image_service import ImageValidationError, process_upload
from app.services.queue import enqueue_photos, queue_stats
from app.services.retention import delete_event, delete_photos
from app.services.storage_service import photo_keys, storage
from app.services.zip_service import build_zip

router = APIRouter(prefix="/admin", tags=["admin"], dependencies=[Depends(require_admin)])


def get_event_or_404(db: Session, event_id: uuid.UUID) -> Event:
    event = db.get(Event, event_id)
    if event is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "ไม่พบอีเวนต์")
    return event


def get_photo_or_404(db: Session, photo_id: uuid.UUID) -> Photo:
    photo = db.get(Photo, photo_id)
    if photo is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "ไม่พบรูปภาพ")
    return photo


# ---------- Dashboard ----------

@router.get("/stats")
def stats(db: Session = Depends(get_db)):
    by_status = dict(db.execute(select(Photo.status, func.count()).group_by(Photo.status)).all())
    try:
        queue = queue_stats()
    except Exception:  # noqa: BLE001
        queue = None
    return {
        "events": db.scalar(select(func.count(Event.id))),
        "photos": sum(by_status.values()),
        "photos_by_status": by_status,
        "faces": db.scalar(select(func.count(Face.id))),
        "pending_removals": db.scalar(
            select(func.count(RemovalRequest.id)).where(RemovalRequest.status == RemovalStatus.PENDING)
        ),
        "queue": queue,
    }


# ---------- Events ----------

@router.post("/events", response_model=EventAdminOut, status_code=status.HTTP_201_CREATED)
def create_event(body: EventCreate, db: Session = Depends(get_db)):
    expires_at = None
    if not body.no_expiry:
        days = body.retention_days or settings.retention_days_default
        expires_at = datetime.now(timezone.utc) + timedelta(days=days)
    event = Event(
        name=body.name.strip(),
        description=(body.description or "").strip() or None,
        access_code=body.access_code,
        expires_at=expires_at,
        public_album=body.public_album,
    )
    db.add(event)
    db.commit()
    db.refresh(event)
    return event_admin_out(db, event)


@router.get("/events", response_model=list[EventAdminOut])
def list_events(db: Session = Depends(get_db)):
    events = db.scalars(select(Event).order_by(Event.created_at.desc())).all()
    return [event_admin_out(db, e) for e in events]


@router.get("/events/{event_id}", response_model=EventAdminOut)
def get_event(event_id: uuid.UUID, db: Session = Depends(get_db)):
    return event_admin_out(db, get_event_or_404(db, event_id))


@router.patch("/events/{event_id}", response_model=EventAdminOut)
def update_event(event_id: uuid.UUID, body: EventUpdate, db: Session = Depends(get_db)):
    event = get_event_or_404(db, event_id)
    for field in body.model_fields_set:
        value = getattr(body, field)
        if field == "name":
            if not value:
                raise HTTPException(status.HTTP_400_BAD_REQUEST, "ต้องมีชื่ออีเวนต์")
            value = value.strip()
        if field == "description":
            value = (value or "").strip() or None
        if field == "public_album" and value is None:
            continue
        setattr(event, field, value)
    db.commit()
    db.refresh(event)
    return event_admin_out(db, event)


@router.post("/events/{event_id}/rotate-link", response_model=EventAdminOut)
def rotate_share_link(event_id: uuid.UUID, db: Session = Depends(get_db)):
    """Invalidate the old share link / QR code."""
    event = get_event_or_404(db, event_id)
    event.share_token = new_share_token()
    db.commit()
    return event_admin_out(db, event)


@router.delete("/events/{event_id}", status_code=status.HTTP_204_NO_CONTENT)
def remove_event(event_id: uuid.UUID, db: Session = Depends(get_db)):
    delete_event(db, get_event_or_404(db, event_id))


@router.post("/events/{event_id}/calibrate")
def calibrate_event(event_id: uuid.UUID, db: Session = Depends(get_db)):
    event = get_event_or_404(db, event_id)
    result = calibrate(db, event.id, effective_threshold(event))
    return {**result, "current_threshold": effective_threshold(event)}


# ---------- Photos ----------

def _safe_filename(name: str | None) -> str | None:
    # Kept for display only; never used to build storage paths.
    if not name:
        return None
    return name.replace("\\", "/").rsplit("/", 1)[-1][:255]


@router.post("/events/{event_id}/photos", response_model=UploadResult, status_code=status.HTTP_201_CREATED)
async def upload_photos(event_id: uuid.UUID, files: list[UploadFile] = File(...), db: Session = Depends(get_db)):
    get_event_or_404(db, event_id)
    if len(files) > settings.max_files_per_upload:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST, f"อัปโหลดได้สูงสุด {settings.max_files_per_upload} ไฟล์ต่อครั้ง"
        )

    uploaded: list[Photo] = []
    errors: list[UploadError] = []
    limit = settings.max_upload_mb * 1024 * 1024

    for file in files:
        filename = _safe_filename(file.filename)
        try:
            data = await file.read(limit + 1)
            image = await run_in_threadpool(process_upload, data)
        except ImageValidationError as exc:
            errors.append(UploadError(filename=filename, error=str(exc)))
            continue

        photo_id = uuid.uuid4()
        original_key, thumb_key = photo_keys(event_id, photo_id)
        await run_in_threadpool(storage.upload, original_key, image.original, "image/jpeg")
        await run_in_threadpool(storage.upload, thumb_key, image.thumbnail, "image/webp")

        photo = Photo(
            id=photo_id, event_id=event_id, storage_key=original_key, thumbnail_key=thumb_key,
            original_filename=filename, mime_type="image/jpeg", width=image.width, height=image.height,
            status=PhotoStatus.PENDING,
        )
        db.add(photo)
        uploaded.append(photo)

    db.commit()
    for photo in uploaded:
        db.refresh(photo)  # load server-side defaults (created_at)
    if uploaded:
        enqueue_photos([p.id for p in uploaded])
    return UploadResult(uploaded=[photo_out(p) for p in uploaded], errors=errors)


@router.get("/events/{event_id}/photos", response_model=list[PhotoOut])
def list_photos(event_id: uuid.UUID, db: Session = Depends(get_db)):
    get_event_or_404(db, event_id)
    photos = db.scalars(select(Photo).where(Photo.event_id == event_id).order_by(Photo.created_at.desc())).all()
    return [photo_out(p) for p in photos]


@router.post("/events/{event_id}/reprocess-failed")
def reprocess_failed(event_id: uuid.UUID, db: Session = Depends(get_db)):
    ids = list(db.scalars(select(Photo.id).where(Photo.event_id == event_id, Photo.status == PhotoStatus.FAILED)))
    return _requeue(db, ids)


@router.post("/events/{event_id}/reprocess-all")
def reprocess_all(event_id: uuid.UUID, db: Session = Depends(get_db)):
    """Re-scan every photo, e.g. after improving detection settings."""
    ids = list(db.scalars(select(Photo.id).where(Photo.event_id == event_id)))
    return _requeue(db, ids)


def _requeue(db: Session, ids: list[uuid.UUID]) -> dict:
    if ids:
        db.query(Photo).filter(Photo.id.in_(ids)).update({Photo.status: PhotoStatus.PENDING}, synchronize_session=False)
        db.commit()
        enqueue_photos(ids)
    return {"queued": len(ids)}


@router.post("/photos/{photo_id}/reprocess", response_model=PhotoOut)
def reprocess_photo(photo_id: uuid.UUID, db: Session = Depends(get_db)):
    photo = get_photo_or_404(db, photo_id)
    _requeue(db, [photo.id])
    db.refresh(photo)
    return photo_out(photo)


@router.delete("/photos/{photo_id}", status_code=status.HTTP_204_NO_CONTENT)
def remove_photo(photo_id: uuid.UUID, db: Session = Depends(get_db)):
    photo = get_photo_or_404(db, photo_id)
    delete_photos(db, photo.event_id, [photo.id])


@router.get("/photos/{photo_id}/download")
def download_url(photo_id: uuid.UUID, db: Session = Depends(get_db)):
    photo = get_photo_or_404(db, photo_id)
    return {"url": storage.get_url(photo.storage_key, download_name=f"photo-{str(photo.id)[:8]}.jpg")}


@router.post("/events/{event_id}/download")
def download_zip(event_id: uuid.UUID, body: PhotoIds, db: Session = Depends(get_db)):
    event = get_event_or_404(db, event_id)
    ids = body.photo_ids[: settings.max_zip_photos]
    photos = db.scalars(select(Photo).where(Photo.event_id == event.id, Photo.id.in_(ids))).all()
    return StreamingResponse(
        build_zip(list(photos)),
        media_type="application/zip",
        headers={"Content-Disposition": 'attachment; filename="photos.zip"'},
    )


# ---------- Removal requests (PDPA) ----------

def _removal_out(db: Session, req: RemovalRequest) -> RemovalOut:
    photos = db.scalars(select(Photo).where(Photo.id.in_(req.photo_ids))).all() if req.photo_ids else []
    return RemovalOut(
        id=req.id, event_id=req.event_id, contact=req.contact, note=req.note, status=req.status,
        created_at=req.created_at, resolved_at=req.resolved_at, photos=[photo_out(p) for p in photos],
    )


@router.get("/events/{event_id}/removal-requests", response_model=list[RemovalOut])
def list_removals(event_id: uuid.UUID, db: Session = Depends(get_db)):
    reqs = db.scalars(
        select(RemovalRequest)
        .where(RemovalRequest.event_id == event_id)
        .order_by((RemovalRequest.status == RemovalStatus.PENDING).desc(), RemovalRequest.created_at.desc())
    ).all()
    return [_removal_out(db, r) for r in reqs]


@router.post("/removal-requests/{request_id}/{action}", response_model=RemovalOut)
def resolve_removal(request_id: uuid.UUID, action: str, db: Session = Depends(get_db)):
    if action not in ("approve", "reject"):
        raise HTTPException(status.HTTP_404_NOT_FOUND)
    req = db.get(RemovalRequest, request_id)
    if req is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "ไม่พบคำขอ")
    if req.status != RemovalStatus.PENDING:
        raise HTTPException(status.HTTP_409_CONFLICT, "คำขอนี้ดำเนินการไปแล้ว")
    if action == "approve":
        delete_photos(db, req.event_id, list(req.photo_ids))
    req.status = RemovalStatus.APPROVED if action == "approve" else RemovalStatus.REJECTED
    req.resolved_at = datetime.now(timezone.utc)
    db.commit()
    return _removal_out(db, req)
