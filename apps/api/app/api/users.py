"""Organizer accounts. Super admins only."""

import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.config import settings
from app.db.database import get_db
from app.db.models import Event, User
from app.schemas.common import UserCreate, UserOut, UserUpdate
from app.services.auth import Principal, find_user, hash_password, require_superadmin
from app.services.usage import owner_bytes

router = APIRouter(prefix="/admin/users", tags=["users"], dependencies=[Depends(require_superadmin)])


def _out(db: Session, user: User) -> UserOut:
    count = db.scalar(select(func.count(Event.id)).where(Event.owner_id == user.id)) or 0
    return UserOut.model_validate({**user.__dict__, "event_count": count, "storage_bytes": owner_bytes(db, user.id)})


def _get(db: Session, user_id: uuid.UUID) -> User:
    user = db.get(User, user_id)
    if user is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "ไม่พบบัญชี")
    return user


@router.get("", response_model=list[UserOut])
def list_users(db: Session = Depends(get_db)):
    return [_out(db, u) for u in db.scalars(select(User).order_by(User.created_at.desc())).all()]


@router.post("", response_model=UserOut, status_code=status.HTTP_201_CREATED)
def create_user(body: UserCreate, db: Session = Depends(get_db)):
    if find_user(db, body.username) or body.username.lower() == settings.admin_username.lower():
        raise HTTPException(status.HTTP_409_CONFLICT, "ชื่อผู้ใช้นี้ถูกใช้แล้ว")
    user = User(
        username=body.username,
        display_name=(body.display_name or "").strip() or None,
        password_hash=hash_password(body.password),
        role=body.role,
        storage_quota_bytes=body.storage_quota_bytes,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return _out(db, user)


@router.patch("/{user_id}", response_model=UserOut)
def update_user(user_id: uuid.UUID, body: UserUpdate, db: Session = Depends(get_db), me: Principal = Depends(require_superadmin)):
    user = _get(db, user_id)
    if user.id == me.user_id and (body.active is False or (body.role and body.role != user.role)):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "ปิดหรือลดสิทธิ์บัญชีของตัวเองไม่ได้")
    if body.display_name is not None:
        user.display_name = body.display_name.strip() or None
    if body.password:
        user.password_hash = hash_password(body.password)
    if body.role is not None:
        user.role = body.role
    if body.active is not None:
        user.active = body.active
    if "storage_quota_bytes" in body.model_fields_set:
        user.storage_quota_bytes = body.storage_quota_bytes
    db.commit()
    db.refresh(user)
    return _out(db, user)


@router.delete("/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_user(user_id: uuid.UUID, db: Session = Depends(get_db), me: Principal = Depends(require_superadmin)):
    """Their events stay (owner becomes empty, visible to super admins) so no photos are lost."""
    user = _get(db, user_id)
    if user.id == me.user_id:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "ลบบัญชีของตัวเองไม่ได้")
    db.delete(user)
    db.commit()
