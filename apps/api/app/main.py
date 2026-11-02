import logging
import threading
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from sqlalchemy import text

from app.api import admin, auth, public, users
from app.config import settings
from app.db.database import engine
from app.db.migrate import run_migrations
from app.services.face_service import face_service
from app.services.queue import queue_stats, redis_conn
from app.services.storage_service import public_base_var, storage

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
log = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(_: FastAPI):
    run_migrations()
    if settings.s3_auto_create_bucket:
        storage.ensure_bucket()
    # Warm the model in the background so /health answers immediately on first boot (download ~300 MB).
    threading.Thread(target=face_service.load, daemon=True).start()
    yield


app = FastAPI(
    title="RupRao API",
    description="รูปเรา (RupRao) — ค้นหารูปของคุณจากใบหน้า · พัฒนาโดย Lutfee",
    version="0.2.0",
    contact={"name": "Lutfee"},
    lifespan=lifespan,
    root_path=settings.api_root_path,
)

# Only needed when the web app calls the API cross-origin (e.g. local dev without Caddy).
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.middleware("http")
async def storage_public_base(request: Request, call_next):
    """Sign storage URLs for the host the browser actually used (localhost, LAN IP, domain).
    Caddy serves MinIO under /storage on the same origin."""
    host = request.headers.get("x-forwarded-host")
    token = None
    if host:
        proto = request.headers.get("x-forwarded-proto", "https")
        token = public_base_var.set(f"{proto}://{host}/storage")
    try:
        response = await call_next(request)
    finally:
        if token is not None:
            public_base_var.reset(token)
    response.headers.setdefault("X-Content-Type-Options", "nosniff")
    return response


app.include_router(auth.router)
app.include_router(admin.router)
app.include_router(users.router)
app.include_router(public.router)


def _ping_db() -> None:
    with engine.connect() as conn:
        conn.execute(text("SELECT 1"))


@app.get("/health")
def health():
    checks: dict[str, str] = {}
    for name, probe in (
        ("database", _ping_db),
        ("redis", redis_conn.ping),
        ("storage", storage.ping),
    ):
        try:
            probe()
            checks[name] = "ok"
        except Exception as exc:  # noqa: BLE001
            checks[name] = f"error: {type(exc).__name__}"
    healthy = all(v == "ok" for v in checks.values())
    body = {"status": "ok" if healthy else "degraded", "model_ready": face_service.ready, "checks": checks}
    try:
        body["queue"] = queue_stats()
    except Exception:  # noqa: BLE001
        pass
    return JSONResponse(body, status_code=200 if healthy else 503)
