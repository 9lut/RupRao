"""Attendee endpoints. An event is reachable only through its share token (link / QR code),
optionally protected by an access code sent in the X-Event-Code header."""

import hmac
import threading
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
    EventPublicOut, FaceBox, PhotoIds, PublicPhotoOut, PublicPhotoPage, QueueStatus, RemovalCreate, SearchMatch, SearchResult,
)
from app.services import rate_limit, scan_queue, visitors
from app.services.auth import sign_value
from app.services.face_service import FaceBusy, face_service
from app.services.image_service import ImageValidationError, load_image, to_bgr_array
from app.services.search_service import search_event
from app.services.storage_service import storage
from app.services.watermark import apply_watermark, watermark_options
from app.services.zip_service import build_zip

def _public_limit(request: Request) -> None:
    rate_limit.enforce(request, "public", settings.rate_public_per_minute, 60)


router = APIRouter(prefix="/public", tags=["public"], dependencies=[Depends(_public_limit)])

# Zips sit on the server until sent, so a burst of them could exhaust memory and disk.
_zip_gate = threading.BoundedSemaphore(settings.max_concurrent_zips)


def _event_by_token(db: Session, token: str, request: Request | None = None) -> Event:
    """`request`: count misses against this visitor, so share links can't be guessed by trying them."""
    ip = rate_limit.client_ip(request) if request else None
    if ip:
        rate_limit.refuse_after_failures("token", ip, settings.token_misses_per_ip)
    event = db.scalar(select(Event).where(Event.share_token == token.lower()))
    if event is None or (event.expires_at is not None and event.expires_at.timestamp() < time.time()):
        if ip:
            rate_limit.add_failure("token", ip, 600)
        raise HTTPException(status.HTTP_404_NOT_FOUND, "ไม่พบอีเวนต์ หรือลิงก์หมดอายุแล้ว")
    # Read-only, so end the transaction now: a request shouldn't hold a pooled connection while it
    # does anything else. Under load those waits add up until the pool runs dry and requests fail.
    db.commit()
    return event


def _check_code(event: Event, code: str | None) -> None:
    if event.access_code and not hmac.compare_digest((code or "").strip().encode(), event.access_code.encode()):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "รหัสเข้าชมไม่ถูกต้อง")


def accessible_event(
    token: str, request: Request, x_event_code: str | None = Header(None), db: Session = Depends(get_db)
) -> Event:
    event = _event_by_token(db, token, request)
    if event.access_code:
        rate_limit.enforce(request, "access", settings.rate_access_per_minute, 60)
        who = f"{rate_limit.client_ip(request)}:{event.id}"
        rate_limit.refuse_after_failures("code", who, settings.code_failures_per_event)
        try:
            _check_code(event, x_event_code)
        except HTTPException:
            rate_limit.add_failure("code", who, 900)
            raise
    return event


def _photos_in_event(db: Session, event: Event, ids: list[uuid.UUID]) -> list[Photo]:
    photos = list(db.scalars(select(Photo).where(Photo.event_id == event.id, Photo.id.in_(ids))).all())
    db.commit()  # see _event_by_token
    return photos


@router.get("/events/{token}", response_model=EventPublicOut)
def get_event(token: str, request: Request, db: Session = Depends(get_db)):
    event = _event_by_token(db, token, request)
    count = db.scalar(select(func.count(Photo.id)).where(Photo.event_id == event.id))
    db.commit()  # see _event_by_token
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
    db.commit()  # see _event_by_token
    return PublicPhotoPage(photos=[public_photo_out(p) for p in photos], total=total)


@router.post("/events/{token}/photos/lookup", response_model=list[PublicPhotoOut])
def lookup(body: PhotoIds, event: Event = Depends(accessible_event), db: Session = Depends(get_db)):
    """Fresh URLs for photos the attendee saved as favourites (presigned URLs expire)."""
    return [public_photo_out(p) for p in _photos_in_event(db, event, body.photo_ids)]


@router.post("/events/{token}/access")
def check_access(event: Event = Depends(accessible_event)):
    return {"ok": True}


@router.post("/events/{token}/visit", status_code=status.HTTP_204_NO_CONTENT)
def visit(token: str, request: Request, db: Session = Depends(get_db)):
    """Someone opened the event page (the web app calls this once per page load)."""
    visitors.record(db, request, _event_by_token(db, token, request).id)


# ---------- Scan queue (see services/scan_queue.py) ----------

@router.post("/events/{token}/queue", response_model=QueueStatus)
def join_queue(request: Request, event: Event = Depends(accessible_event)):
    rate_limit.enforce(request, "queue", settings.rate_queue_per_minute, 60)
    try:
        return scan_queue.join()
    except scan_queue.QueueFull as exc:
        raise HTTPException(
            status.HTTP_503_SERVICE_UNAVAILABLE, "ตอนนี้มีคนรอคิวเต็มแล้ว ลองใหม่อีกครั้งในอีกสักครู่", headers={"Retry-After": "30"}
        ) from exc


@router.get("/queue/{ticket}", response_model=QueueStatus)
def queue_status(ticket: str):
    status_ = scan_queue.status(ticket)
    if status_ is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "หมดเวลารอคิว")
    return status_


@router.delete("/queue/{ticket}", status_code=status.HTTP_204_NO_CONTENT)
def leave_queue(ticket: str):
    scan_queue.leave(ticket)


def _scan_ticket(x_scan_ticket: str | None = Header(None)):
    """The search's ticket; it leaves the line when the request ends, however it ends."""
    try:
        yield x_scan_ticket
    finally:
        scan_queue.leave(x_scan_ticket)


@router.post("/events/{token}/search", response_model=SearchResult)
async def search(
    request: Request,
    file: UploadFile = File(...),
    face_index: int = Form(0, ge=0, le=50),
    event: Event = Depends(accessible_event),
    db: Session = Depends(get_db),
    ticket: str | None = Depends(_scan_ticket),
):
    rate_limit.enforce(request, "search-min", settings.rate_search_per_minute, 60)
    rate_limit.enforce(request, "search-day", settings.rate_search_per_day, 24 * 3600)
    started = time.perf_counter()

    event_id, threshold = event.id, effective_threshold(event)
    # Give the DB connection back while the CPU-heavy part runs: under a crowd, searches wait for
    # the face model for seconds, and holding connections meanwhile exhausts the pool.
    db.rollback()

    # The selfie lives only in memory for this request; it is never written to storage or the DB.
    data = await file.read(settings.max_upload_mb * 1024 * 1024 + 1)
    try:
        img = await run_in_threadpool(load_image, data)  # decoding a 12 MP photo would block the event loop
    except ImageValidationError as exc:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, str(exc)) from exc
    finally:
        del data

    # Taking a turn in line earns a wait for the model; skipping the line only works when it's idle.
    wait = settings.search_queue_timeout if await run_in_threadpool(scan_queue.may_wait, ticket) else 0
    try:
        faces = await run_in_threadpool(lambda: face_service.detect(to_bgr_array(img), None, wait, face_index))
    except FaceBusy as exc:
        raise HTTPException(
            status.HTTP_503_SERVICE_UNAVAILABLE, "ตอนนี้มีคนค้นหาพร้อมกันเยอะมาก ลองใหม่อีกครั้งในอีกสักครู่", headers={"Retry-After": "10"}
        ) from exc
    if not faces:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "ไม่พบใบหน้าในรูป ลองใช้รูปที่เห็นหน้าชัดขึ้น")
    face_index = min(face_index, len(faces) - 1)

    matches = await run_in_threadpool(
        search_event, db, event_id, faces[face_index].embedding, threshold, settings.search_max_results
    )
    result = SearchResult(
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
    await run_in_threadpool(visitors.record, db, request, event_id, "scan")
    await run_in_threadpool(scan_queue.record_duration, time.perf_counter() - started)
    return result


@router.get("/events/{token}/photos/{photo_id}/download")
def download_url(
    photo_id: uuid.UUID, request: Request, event: Event = Depends(accessible_event), db: Session = Depends(get_db)
):
    photos = _photos_in_event(db, event, [photo_id])
    if not photos:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "ไม่พบรูปภาพ")
    name = f"photo-{str(photo_id)[:8]}.jpg"
    visitors.record(db, request, event.id, "download")
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
    if not _zip_gate.acquire(timeout=20):
        raise HTTPException(
            status.HTTP_503_SERVICE_UNAVAILABLE, "ตอนนี้มีคนดาวน์โหลดพร้อมกันเยอะ ลองใหม่อีกครั้งในอีกสักครู่", headers={"Retry-After": "20"}
        )
    try:
        stream = build_zip(photos, (lambda data: apply_watermark(data, opts)) if opts else None)
    finally:
        _zip_gate.release()
    visitors.record(db, request, event.id, "download", len(photos))
    return StreamingResponse(
        stream,
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
