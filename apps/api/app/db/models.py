import secrets
import uuid
from datetime import datetime

from pgvector.sqlalchemy import Vector
from sqlalchemy import Boolean, Float, ForeignKey, Integer, String, Text, func
from sqlalchemy.dialects.postgresql import ARRAY, JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.database import Base

EMBEDDING_DIM = 512

# No look-alike characters (0/o, 1/l/i) so the code is easy to type from a poster.
_TOKEN_ALPHABET = "abcdefghjkmnpqrstuvwxyz23456789"


def new_share_token() -> str:
    return "".join(secrets.choice(_TOKEN_ALPHABET) for _ in range(8))


class PhotoStatus:
    PENDING = "PENDING"
    PROCESSING = "PROCESSING"
    PROCESSED = "PROCESSED"
    FAILED = "FAILED"


class Role:
    SUPERADMIN = "superadmin"  # every event + manages organizer accounts
    ORGANIZER = "organizer"  # only the events they own


class User(Base):
    __tablename__ = "users"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    username: Mapped[str] = mapped_column(String(64))
    display_name: Mapped[str | None] = mapped_column(String(255))
    password_hash: Mapped[str] = mapped_column(Text)
    role: Mapped[str] = mapped_column(String(20), default=Role.ORGANIZER)
    active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(server_default=func.now())
    last_login_at: Mapped[datetime | None] = mapped_column()


class RemovalStatus:
    PENDING = "PENDING"
    APPROVED = "APPROVED"
    REJECTED = "REJECTED"


class Event(Base):
    __tablename__ = "events"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name: Mapped[str] = mapped_column(String(255))
    description: Mapped[str | None] = mapped_column(Text)
    share_token: Mapped[str] = mapped_column(String(32), unique=True, default=new_share_token)
    access_code: Mapped[str | None] = mapped_column(String(16))
    match_threshold: Mapped[float | None] = mapped_column(Float)
    expires_at: Mapped[datetime | None] = mapped_column()
    public_album: Mapped[bool] = mapped_column(Boolean, default=False)
    theme: Mapped[str] = mapped_column(String(32), default="default")
    theme_custom: Mapped[dict] = mapped_column(JSONB, default=dict)
    banner_key: Mapped[str | None] = mapped_column(Text)
    logo_key: Mapped[str | None] = mapped_column(Text)
    favicon_key: Mapped[str | None] = mapped_column(Text)
    owner_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))
    created_at: Mapped[datetime] = mapped_column(server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(server_default=func.now(), onupdate=func.now())

    photos: Mapped[list["Photo"]] = relationship(back_populates="event", passive_deletes=True)


class Photo(Base):
    __tablename__ = "photos"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    event_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("events.id", ondelete="CASCADE"))
    storage_key: Mapped[str] = mapped_column(Text)
    thumbnail_key: Mapped[str | None] = mapped_column(Text)
    original_filename: Mapped[str | None] = mapped_column(Text)
    mime_type: Mapped[str | None] = mapped_column(String(100))
    width: Mapped[int | None] = mapped_column(Integer)
    height: Mapped[int | None] = mapped_column(Integer)
    status: Mapped[str] = mapped_column(String(50), default=PhotoStatus.PENDING)
    face_count: Mapped[int] = mapped_column(Integer, default=0)
    error: Mapped[str | None] = mapped_column(Text)
    content_hash: Mapped[str | None] = mapped_column(String(64))  # SHA-256 of the uploaded file
    phash: Mapped[str | None] = mapped_column(String(64))  # browser 256-bit dHash, for near-duplicates
    created_at: Mapped[datetime] = mapped_column(server_default=func.now())

    event: Mapped[Event] = relationship(back_populates="photos")
    faces: Mapped[list["Face"]] = relationship(back_populates="photo", passive_deletes=True)


class Face(Base):
    __tablename__ = "faces"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    photo_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("photos.id", ondelete="CASCADE"))
    x: Mapped[int] = mapped_column(Integer)
    y: Mapped[int] = mapped_column(Integer)
    width: Mapped[int] = mapped_column(Integer)
    height: Mapped[int] = mapped_column(Integer)
    det_score: Mapped[float | None] = mapped_column(Float)
    embedding = mapped_column(Vector(EMBEDDING_DIM))
    created_at: Mapped[datetime] = mapped_column(server_default=func.now())

    photo: Mapped[Photo] = relationship(back_populates="faces")


class RemovalRequest(Base):
    __tablename__ = "removal_requests"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    event_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("events.id", ondelete="CASCADE"))
    photo_ids: Mapped[list[uuid.UUID]] = mapped_column(ARRAY(UUID(as_uuid=True)))
    contact: Mapped[str | None] = mapped_column(String(255))
    note: Mapped[str | None] = mapped_column(Text)
    status: Mapped[str] = mapped_column(String(20), default=RemovalStatus.PENDING)
    created_at: Mapped[datetime] = mapped_column(server_default=func.now())
    resolved_at: Mapped[datetime | None] = mapped_column()
