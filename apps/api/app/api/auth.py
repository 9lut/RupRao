from fastapi import APIRouter, Depends, HTTPException, Request, status
from pydantic import BaseModel

from app.config import settings
from app.services import rate_limit
from app.services.auth import check_credentials, create_token, require_admin

router = APIRouter(prefix="/auth", tags=["auth"])


class LoginBody(BaseModel):
    username: str
    password: str


@router.post("/login")
def login(body: LoginBody, request: Request):
    rate_limit.enforce(request, "login", settings.rate_login_per_minute, 60)
    if not settings.admin_password:
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, "ยังไม่ได้ตั้งค่า ADMIN_PASSWORD ในไฟล์ .env")
    if not check_credentials(body.username, body.password):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง")
    return {"token": create_token(body.username), "expires_in": settings.auth_token_ttl_hours * 3600}


@router.get("/me")
def me(user: str = Depends(require_admin)):
    return {"username": user}
