"""Admin auth.

Stateless tokens: base64url(json payload) + "." + HMAC-SHA256 signature. The subject is either the
built-in super admin from .env (ADMIN_USERNAME) or "u:<uuid>" for an account in the users table,
which is re-checked on every request so disabling an account logs it out immediately.
"""

import base64
import hashlib
import hmac
import json
import logging
import secrets
import time
import uuid
from dataclasses import dataclass

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.config import settings
from app.db.database import get_db
from app.db.models import Role, User

log = logging.getLogger(__name__)

_secret = settings.auth_secret
if not _secret:
    _secret = secrets.token_urlsafe(32)
    log.warning("AUTH_SECRET is not set; using a random one (admin sessions reset on every restart)")
_SECRET = _secret.encode()


def _b64(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode()


def _unb64(data: str) -> bytes:
    return base64.urlsafe_b64decode(data + "=" * (-len(data) % 4))


def _sign(payload: str) -> str:
    return _b64(hmac.new(_SECRET, payload.encode(), hashlib.sha256).digest())


def sign_value(purpose: str, value: str) -> str:
    """Signature for a short value (e.g. a download link). The "purpose|" prefix keeps these from
    ever being valid admin-token signatures, whose payloads are base64 without "|"."""
    return _sign(f"{purpose}|{value}")


def create_token(subject: str, ttl_seconds: int | None = None, now: float | None = None) -> str:
    now = time.time() if now is None else now
    ttl = settings.auth_token_ttl_hours * 3600 if ttl_seconds is None else ttl_seconds
    payload = _b64(json.dumps({"sub": subject, "exp": int(now + ttl)}).encode())
    return f"{payload}.{_sign(payload)}"


def verify_token(token: str, now: float | None = None) -> str | None:
    try:
        payload, signature = token.split(".", 1)
    except ValueError:
        return None
    if not hmac.compare_digest(signature, _sign(payload)):
        return None
    try:
        data = json.loads(_unb64(payload))
    except ValueError:
        return None
    if data.get("exp", 0) < (time.time() if now is None else now):
        return None
    return data.get("sub")


# ---------- passwords (scrypt, stdlib only) ----------

_SCRYPT = {"n": 2**14, "r": 8, "p": 1}


def hash_password(password: str) -> str:
    salt = secrets.token_bytes(16)
    digest = hashlib.scrypt(password.encode(), salt=salt, dklen=32, **_SCRYPT)
    return f"scrypt${_SCRYPT['n']}${_SCRYPT['r']}${_SCRYPT['p']}${_b64(salt)}${_b64(digest)}"


def verify_password(password: str, stored: str) -> bool:
    try:
        algo, n, r, p, salt, digest = stored.split("$")
        if algo != "scrypt":
            return False
        actual = hashlib.scrypt(password.encode(), salt=_unb64(salt), dklen=32, n=int(n), r=int(r), p=int(p))
    except (ValueError, TypeError):
        return False
    return hmac.compare_digest(actual, _unb64(digest))


# Verified against when the username does not exist, so timing doesn't reveal valid usernames.
_DUMMY_HASH = hash_password(secrets.token_urlsafe(16))


def check_credentials(username: str, password: str) -> bool:
    if not settings.admin_password:
        return False
    # Compare both fields in constant time, always.
    user_ok = hmac.compare_digest(username.encode(), settings.admin_username.encode())
    pass_ok = hmac.compare_digest(password.encode(), settings.admin_password.encode())
    return user_ok and pass_ok


def find_user(db: Session, username: str) -> User | None:
    return db.scalar(select(User).where(func.lower(User.username) == username.strip().lower()))


def authenticate(db: Session, username: str, password: str) -> str | None:
    """Token subject for valid credentials, else None."""
    if check_credentials(username, password):
        return settings.admin_username
    user = find_user(db, username)
    ok = verify_password(password, user.password_hash if user else _DUMMY_HASH)
    if not (user and ok and user.active):
        return None
    return f"u:{user.id}"


# ---------- who is calling ----------

@dataclass(frozen=True)
class Principal:
    username: str
    role: str
    user_id: uuid.UUID | None = None  # None = built-in super admin from .env
    display_name: str | None = None

    @property
    def is_super(self) -> bool:
        return self.role == Role.SUPERADMIN


_bearer = HTTPBearer(auto_error=False)


def _unauthorized() -> HTTPException:
    return HTTPException(status.HTTP_401_UNAUTHORIZED, "กรุณาเข้าสู่ระบบผู้ดูแล", headers={"WWW-Authenticate": "Bearer"})


def require_admin(
    creds: HTTPAuthorizationCredentials | None = Depends(_bearer), db: Session = Depends(get_db)
) -> Principal:
    subject = verify_token(creds.credentials) if creds else None
    if subject is None:
        raise _unauthorized()
    if subject.startswith("u:"):
        try:
            user = db.get(User, uuid.UUID(subject[2:]))
        except ValueError:
            user = None
        if user is None or not user.active:
            raise _unauthorized()
        return Principal(user.username, user.role, user.id, user.display_name)
    if settings.admin_password and hmac.compare_digest(subject.encode(), settings.admin_username.encode()):
        return Principal(settings.admin_username, Role.SUPERADMIN, None, "ผู้ดูแลระบบ")
    raise _unauthorized()


def require_superadmin(me: Principal = Depends(require_admin)) -> Principal:
    if not me.is_super:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "เฉพาะแอดมินใหญ่เท่านั้น")
    return me
