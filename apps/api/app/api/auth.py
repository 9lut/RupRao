import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Request, status
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.config import settings
from app.db.database import get_db
from app.db.models import User
from app.services import rate_limit
from app.services.auth import Principal, authenticate, create_token, require_admin

router = APIRouter(prefix="/auth", tags=["auth"])


class LoginBody(BaseModel):
    username: str = Field(max_length=255)
    password: str = Field(max_length=1024)


@router.post("/login")
def login(body: LoginBody, request: Request, db: Session = Depends(get_db)):
    rate_limit.enforce(request, "login", settings.rate_login_per_minute, 60)
    # Limits apply to any name typed, so being refused doesn't reveal which accounts exist.
    ip, account = rate_limit.client_ip(request), body.username.strip().lower()
    rate_limit.refuse_after_failures("login-ip", ip, settings.login_failures_per_ip)
    rate_limit.refuse_after_failures("login-account", account, settings.login_failures_per_account)
    subject = authenticate(db, body.username, body.password)
    if subject is None:
        if not settings.admin_password and db.query(User).count() == 0:
            raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, "ยังไม่ได้ตั้งค่า ADMIN_PASSWORD ในไฟล์ .env")
        rate_limit.add_failure("login-ip", ip, 3600)
        rate_limit.add_failure("login-account", account, 900)
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง")
    rate_limit.clear_failures("login-account", account)
    if subject.startswith("u:"):
        user = db.get(User, uuid.UUID(subject[2:]))
        user.last_login_at = datetime.now(timezone.utc)
        db.commit()
    return {"token": create_token(subject), "expires_in": settings.auth_token_ttl_hours * 3600}


@router.get("/me")
def me(me: Principal = Depends(require_admin)):
    return {"username": me.username, "display_name": me.display_name, "role": me.role, "builtin": me.user_id is None}
