"""Stateless admin tokens: base64url(json payload) + "." + HMAC-SHA256 signature."""

import base64
import hashlib
import hmac
import json
import logging
import secrets
import time

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from app.config import settings

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


def check_credentials(username: str, password: str) -> bool:
    if not settings.admin_password:
        return False
    # Compare both fields in constant time, always.
    user_ok = hmac.compare_digest(username.encode(), settings.admin_username.encode())
    pass_ok = hmac.compare_digest(password.encode(), settings.admin_password.encode())
    return user_ok and pass_ok


_bearer = HTTPBearer(auto_error=False)


def require_admin(creds: HTTPAuthorizationCredentials | None = Depends(_bearer)) -> str:
    subject = verify_token(creds.credentials) if creds else None
    if subject is None:
        raise HTTPException(
            status.HTTP_401_UNAUTHORIZED, "กรุณาเข้าสู่ระบบผู้ดูแล", headers={"WWW-Authenticate": "Bearer"}
        )
    return subject
