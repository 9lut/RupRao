import uuid
from datetime import datetime

from pydantic import BaseModel, Field, field_validator


class PhotoOut(BaseModel):
    id: uuid.UUID
    event_id: uuid.UUID
    original_filename: str | None
    width: int | None
    height: int | None
    status: str
    face_count: int
    error: str | None
    created_at: datetime
    url: str
    thumbnail_url: str | None


class PublicPhotoOut(BaseModel):
    """What attendees see: no filenames, no processing internals."""

    id: uuid.UUID
    width: int | None
    height: int | None
    created_at: datetime
    url: str
    thumbnail_url: str | None


class UploadError(BaseModel):
    filename: str | None
    error: str


class UploadResult(BaseModel):
    uploaded: list[PhotoOut]
    errors: list[UploadError]


def _clean_code(v: str | None) -> str | None:
    if v is None:
        return None
    v = v.strip()
    if v and not (v.isalnum() and 4 <= len(v) <= 16):
        raise ValueError("รหัสเข้าชมต้องเป็นตัวอักษรหรือตัวเลข 4-16 ตัว")
    return v or None


class EventCreate(BaseModel):
    name: str = Field(min_length=1, max_length=255)
    description: str | None = Field(default=None, max_length=5000)
    access_code: str | None = None
    retention_days: int | None = Field(default=None, ge=1, le=3650)  # None => server default
    no_expiry: bool = False
    public_album: bool = False

    _code = field_validator("access_code")(_clean_code)


class EventUpdate(BaseModel):
    """Only fields present in the request are changed (send null / "" to clear)."""

    name: str | None = Field(default=None, min_length=1, max_length=255)
    description: str | None = Field(default=None, max_length=5000)
    access_code: str | None = None
    match_threshold: float | None = Field(default=None, ge=0.2, le=0.9)
    expires_at: datetime | None = None
    public_album: bool | None = None

    _code = field_validator("access_code")(_clean_code)


class EventAdminOut(BaseModel):
    id: uuid.UUID
    name: str
    description: str | None
    share_token: str
    access_code: str | None
    match_threshold: float | None
    effective_threshold: float
    expires_at: datetime | None
    public_album: bool
    created_at: datetime
    photo_count: int = 0
    face_count: int = 0
    pending_count: int = 0
    failed_count: int = 0
    pending_removals: int = 0
    cover_url: str | None = None


class EventPublicOut(BaseModel):
    name: str
    description: str | None
    requires_code: bool
    expires_at: datetime | None
    photo_count: int
    threshold: float
    public_album: bool


class PublicPhotoPage(BaseModel):
    photos: list[PublicPhotoOut]
    total: int


class FaceBox(BaseModel):
    x: int
    y: int
    width: int
    height: int


class SearchMatch(BaseModel):
    photo: PublicPhotoOut
    similarity: float
    face: FaceBox


class SearchResult(BaseModel):
    query_faces: list[FaceBox]  # largest first
    face_index: int
    query_width: int
    query_height: int
    threshold: float
    took_ms: int
    results: list[SearchMatch]


class PhotoIds(BaseModel):
    photo_ids: list[uuid.UUID] = Field(min_length=1, max_length=500)


class RemovalCreate(PhotoIds):
    contact: str | None = Field(default=None, max_length=255)
    note: str | None = Field(default=None, max_length=2000)


class RemovalOut(BaseModel):
    id: uuid.UUID
    event_id: uuid.UUID
    contact: str | None
    note: str | None
    status: str
    created_at: datetime
    resolved_at: datetime | None
    photos: list[PhotoOut]  # photos that still exist
