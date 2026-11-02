"""Attendee endpoints. An event is reachable only through its share token (link / QR code),
optionally protected by an access code sent in the X-Event-Code header."""

import hmac
import time
import uuid

from fastapi import APIRouter, Depends, File, Form, Header, HTTPException, Query, Request, UploadFile, status
from fastapi.concurrency import run_in_threadpool
from fastapi.responses import Response, StreamingResponse
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.api.serializers import effective_threshold, public_photo_out
from app.config import settings
from app.db.database import get_db
from app.db.models import Event, Photo, RemovalRequest
from app.schemas.common import (
    EventPublicOut, FaceBox, PhotoIds, PublicPhotoOut, PublicPhotoPage, RemovalCreate, SearchMatch, SearchResult,
)
from app.services import rate_limit
from app.services.auth import sign_value
from app.services.face_service import face_service
from app.services.image_service import ImageValidationError, load_image, to_bgr_array
from app.services.search_service import search_event
from app.services.storage_service import storage
from app.services.watermark import apply_watermark, watermark_options
from app.services.zip_service import build_zip

router = APIRouter(prefix="/public", tags=["public"])


def _event_by_token(db: Session, token: str) -> Event:
    event = db.scalar(select(Event).where(Event.share_token == token.lower()))
    if event is None or (event.expires_at is not None and event.expires_at.timestamp() < time.time()):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "ไม่พบอีเวนต์ หรือลิงก์หมดอายุแล้ว")
    return event


def _check_code(event: Event, code: str | None) -> None:
    if event.access_code and not hmac.compare_digest((code or "").strip().encode(), event.access_code.encode()):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "รหัสเข้าชมไม่ถูกต้อง")


def accessible_event(
    token: str, request: Request, x_event_code: str | None = Header(None), db: Session = Depends(get_db)
) -> Event:
    event = _event_by_token(db, token)
    if event.access_code:
        rate_limit.enforce(request, "access", settings.rate_access_per_minute, 60)
    _check_code(event, x_event_code)
    return event


def _photos_in_event(db: Session, event: Event, ids: list[uuid.UUID]) -> list[Photo]:
    return list(db.scalars(select(Photo).where(Photo.event_id == event.id, Photo.id.in_(ids))).all())


@router.get("/events/{token}", response_model=EventPublicOut)
def get_event(token: str, db: Session = Depends(get_db)):
    event = _event_by_token(db, token)
    count = db.scalar(select(func.count(Photo.id)).where(Photo.event_id == event.id))
    return EventPublicOut(
        name=event.name,
        description=event.description,
        requires_code=bool(event.access_code),
        expires_at=event.expires_at,
        photo_count=count or 0,
        threshold=effective_threshold(event),
        public_album=event.public_album,
        theme=event.theme,
        theme_custom=event.theme_custom or {},
        banner_url=storage.get_url(event.banner_key) if event.banner_key else None,
        logo_url=storage.get_url(event.logo_key) if event.logo_key else None,
        favicon_url=storage.get_url(event.favicon_key) if event.favicon_key else None,
    )


@router.get("/events/{token}/photos", response_model=PublicPhotoPage)
def album(
    offset: int = Query(0, ge=0),
    limit: int = Query(60, ge=1, le=120),
    event: Event = Depends(accessible_event),
    db: Session = Depends(get_db),
):
    """Browse the whole album — only if the organizer enabled it for this event."""
    if not event.public_album:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "ผู้จัดงานไม่ได้เปิดให้ดูอัลบั้มทั้งหมด")
    total = db.scalar(select(func.count(Photo.id)).where(Photo.event_id == event.id)) or 0
    photos = db.scalars(
        select(Photo).where(Photo.event_id == event.id).order_by(Photo.created_at.desc(), Photo.id)
        .offset(offset).limit(limit)
    ).all()
    return PublicPhotoPage(photos=[public_photo_out(p) for p in photos], total=total)


@router.post("/events/{token}/photos/lookup", response_model=list[PublicPhotoOut])
def lookup(body: PhotoIds, event: Event = Depends(accessible_event), db: Session = Depends(get_db)):
    """Fresh URLs for photos the attendee saved as favourites (presigned URLs expire)."""
    return [public_photo_out(p) for p in _photos_in_event(db, event, body.photo_ids)]


@router.post("/events/{token}/access")
def check_access(event: Event = Depends(accessible_event)):
    return {"ok": True}


@router.post("/events/{token}/search", response_model=SearchResult)
async def search(
    request: Request,
    file: UploadFile = File(...),
    face_index: int = Form(0, ge=0, le=50),
    event: Event = Depends(accessible_event),
    db: Session = Depends(get_db),
):
    rate_limit.enforce(request, "search-min", settings.rate_search_per_minute, 60)
    rate_limit.enforce(request, "search-day", settings.rate_search_per_day, 24 * 3600)
    started = time.perf_counter()

    # The selfie lives only in memory for this request; it is never written to storage or the DB.
    data = await file.read(settings.max_upload_mb * 1024 * 1024 + 1)
    try:
        img = load_image(data)
    except ImageValidationError as exc:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, str(exc)) from exc
    finally:
        del data

    faces = await run_in_threadpool(face_service.detect, to_bgr_array(img))
    if not faces:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "ไม่พบใบหน้าในรูป ลองใช้รูปที่เห็นหน้าชัดขึ้น")
    face_index = min(face_index, len(faces) - 1)
    threshold = effective_threshold(event)

    matches = await run_in_threadpool(
        search_event, db, event.id, faces[face_index].embedding, threshold, settings.search_max_results
    )
    return SearchResult(
        query_faces=[FaceBox(x=f.x, y=f.y, width=f.width, height=f.height) for f in faces],
        face_index=face_index,
        query_width=img.width,
        query_height=img.height,
        threshold=threshold,
        took_ms=int((time.perf_counter() - started) * 1000),
        results=[
            SearchMatch(
                photo=public_photo_out(m.photo),
                similarity=m.similarity,
                face=FaceBox(x=m.face.x, y=m.face.y, width=m.face.width, height=m.face.height),
            )
            for m in matches
        ],
    )


@router.get("/events/{token}/photos/{photo_id}/download")
def download_url(photo_id: uuid.UUID, event: Event = Depends(accessible_event), db: Session = Depends(get_db)):
    photos = _photos_in_event(db, event, [photo_id])
    if not photos:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "ไม่พบรูปภาพ")
    name = f"photo-{str(photo_id)[:8]}.jpg"
    if watermark_options(event) is None:
        return {"url": storage.get_url(photos[0].storage_key, download_name=name)}
    # Watermarked copies are made on the fly; hand out a short-lived signed link to this API.
    exp = int(time.time()) + 300
    sig = sign_value("file", f"{photo_id}:{exp}")
    return {"url": f"{settings.api_root_path}/public/files/{photo_id}?exp={exp}&sig={sig}"}


@router.get("/files/{photo_id}")
def download_file(photo_id: uuid.UUID, exp: int, sig: str, db: Session = Depends(get_db)):
    """A single watermarked photo, reached through the signed link from download_url."""
    if exp < time.time() or not hmac.compare_digest(sig, sign_value("file", f"{photo_id}:{exp}")):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "ลิงก์ดาวน์โหลดหมดอายุ ลองกดดาวน์โหลดอีกครั้ง")
    photo = db.get(Photo, photo_id)
    if photo is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "ไม่พบรูปภาพ")
    _event_by_token(db, photo.event.share_token)  # still live (not expired)
    data = storage.download(photo.storage_key)
    opts = watermark_options(photo.event)
    return Response(
        apply_watermark(data, opts) if opts else data,
        media_type="image/jpeg",
        headers={"Content-Disposition": f'attachment; filename="photo-{str(photo_id)[:8]}.jpg"', "Cache-Control": "private, no-store"},
    )


@router.post("/events/{token}/download")
def download_zip(
    body: PhotoIds, request: Request, event: Event = Depends(accessible_event), db: Session = Depends(get_db)
):
    rate_limit.enforce(request, "zip", settings.rate_zip_per_hour, 3600)
    photos = _photos_in_event(db, event, body.photo_ids[: settings.max_zip_photos])
    if not photos:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "ไม่พบรูปภาพ")
    opts = watermark_options(event)
    return StreamingResponse(
        build_zip(photos, (lambda data: apply_watermark(data, opts)) if opts else None),
        media_type="application/zip",
        headers={"Content-Disposition": 'attachment; filename="my-photos.zip"'},
    )


@router.post("/events/{token}/removal-requests", status_code=status.HTTP_201_CREATED)
def request_removal(
    body: RemovalCreate, request: Request, event: Event = Depends(accessible_event), db: Session = Depends(get_db)
):
    rate_limit.enforce(request, "removal", settings.rate_removal_per_hour, 3600)
    photos = _photos_in_event(db, event, body.photo_ids)
    if not photos:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "ไม่พบรูปที่เลือก")
    req = RemovalRequest(
        event_id=event.id,
        photo_ids=[p.id for p in photos],
        contact=(body.contact or "").strip() or None,
        note=(body.note or "").strip() or None,
    )
    db.add(req)
    db.commit()
    return {"id": req.id, "photo_count": len(photos)}
