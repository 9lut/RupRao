import uuid
from datetime import datetime
from typing import Annotated, Literal

from pydantic import BaseModel, Field, StringConstraints, field_validator


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


# Attendee-page looks. Keep in sync with apps/web/lib/themes.ts.
EventTheme = Literal["default", "lavender", "sakura", "ocean"]
HexColor = Annotated[str, StringConstraints(pattern=r"^#[0-9a-fA-F]{6}$")]


class EventLink(BaseModel):
    kind: Literal["facebook", "instagram", "line", "tiktok", "youtube", "website"]
    url: Annotated[str, StringConstraints(strip_whitespace=True, max_length=500, pattern=r"^https?://\S+$")]
    label: str | None = Field(default=None, max_length=40)


class ThemeCustom(BaseModel):
    """Organizer overrides on top of the preset. Omitted / null = use the preset's value."""

    ink: HexColor | None = None  # buttons, headings
    accent: HexColor | None = None  # highlights, scan line
    soft: HexColor | None = None  # secondary surfaces
    page_bg: HexColor | None = None
    title_color: HexColor | None = None
    banner_from: HexColor | None = None  # banner gradient when there is no image
    banner_to: HexColor | None = None
    overlay: float | None = Field(default=None, ge=0, le=0.9)  # darken the banner image
    motif: bool | None = None  # draw the preset's decoration (lavender field, petals, waves)
    banner_height: Literal["sm", "md", "lg"] | None = None
    banner_position: Literal["top", "center", "bottom"] | None = None  # legacy, superseded by x/y
    # Facebook-cover style framing of the uploaded image: focal point in % and zoom factor.
    banner_x: float | None = Field(default=None, ge=0, le=100)
    banner_y: float | None = Field(default=None, ge=0, le=100)
    banner_zoom: float | None = Field(default=None, ge=1, le=3)
    tab_title: str | None = Field(default=None, max_length=80)  # browser tab; default = event name
    # Stamp the event logo on photos attendees download.
    watermark: bool | None = None
    watermark_position: Literal["tl", "tr", "bl", "br", "center"] | None = None
    watermark_size: float | None = Field(default=None, ge=5, le=50)  # % of photo width
    watermark_opacity: float | None = Field(default=None, ge=0.1, le=1)
    # Content shown on the attendee page.
    links: list[EventLink] | None = Field(default=None, max_length=6)  # buttons under the banner
    announcement_title: str | None = Field(default=None, max_length=120)
    announcement: str | None = Field(default=None, max_length=2000)  # welcome message / notice
    title_font: Literal["noto", "kanit", "prompt", "mitr", "chakra", "pridi", "charm", "itim"] | None = None
    nav_overlay: bool | None = None  # transparent site header over the banner (default: on with a photo)


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
    theme: EventTheme = "default"
    owner_id: uuid.UUID | None = None  # super admin only: create on behalf of an organizer

    _code = field_validator("access_code")(_clean_code)


class EventUpdate(BaseModel):
    """Only fields present in the request are changed (send null / "" to clear)."""

    name: str | None = Field(default=None, min_length=1, max_length=255)
    description: str | None = Field(default=None, max_length=5000)
    access_code: str | None = None
    match_threshold: float | None = Field(default=None, ge=0.2, le=0.9)
    expires_at: datetime | None = None
    public_album: bool | None = None
    theme: EventTheme | None = None
    theme_custom: ThemeCustom | None = None
    owner_id: uuid.UUID | None = None  # super admin only

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
    theme: str
    theme_custom: dict
    banner_url: str | None = None
    logo_url: str | None = None
    favicon_url: str | None = None
    owner_id: uuid.UUID | None = None
    owner_name: str | None = None
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
    theme: str
    theme_custom: dict
    banner_url: str | None = None
    logo_url: str | None = None
    favicon_url: str | None = None


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


# ---------- Accounts ----------

Username = Annotated[str, StringConstraints(strip_whitespace=True, min_length=3, max_length=64, pattern=r"^[A-Za-z0-9._-]+$")]
Password = Annotated[str, StringConstraints(min_length=8, max_length=128)]
RoleName = Literal["superadmin", "organizer"]


class UserCreate(BaseModel):
    username: Username
    password: Password
    display_name: str | None = Field(default=None, max_length=255)
    role: RoleName = "organizer"


class UserUpdate(BaseModel):
    display_name: str | None = Field(default=None, max_length=255)
    password: Password | None = None  # set = reset the password
    role: RoleName | None = None
    active: bool | None = None


class UserOut(BaseModel):
    id: uuid.UUID
    username: str
    display_name: str | None
    role: str
    active: bool
    created_at: datetime
    last_login_at: datetime | None
    event_count: int = 0
