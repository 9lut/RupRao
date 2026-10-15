"""Fixed-window rate limiting in Redis, keyed by client IP."""

import logging

from fastapi import HTTPException, Request, status

from app.services.queue import redis_conn

log = logging.getLogger(__name__)


def client_ip(request: Request) -> str:
    # Caddy replaces X-Forwarded-For with the real peer address (it does not trust client-sent values).
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.client.host if request.client else "unknown"


def hit(redis, key: str, limit: int, window_seconds: int) -> tuple[bool, int]:
    """Count one hit. Returns (allowed, seconds until the window resets)."""
    pipe = redis.pipeline()
    pipe.incr(key)
    pipe.expire(key, window_seconds, nx=True)
    pipe.ttl(key)
    count, _, ttl = pipe.execute()
    return count <= limit, max(int(ttl), 1)


def enforce(request: Request, name: str, limit: int, window_seconds: int) -> None:
    key = f"rl:{name}:{window_seconds}:{client_ip(request)}"
    try:
        allowed, retry_after = hit(redis_conn, key, limit, window_seconds)
    except Exception:  # noqa: BLE001 - never take the site down because Redis hiccuped
        log.exception("Rate limiter unavailable; allowing request")
        return
    if not allowed:
        minutes = (retry_after + 59) // 60
        wait = f"{retry_after} วินาที" if retry_after < 120 else f"{minutes} นาที"
        raise HTTPException(
            status.HTTP_429_TOO_MANY_REQUESTS,
            f"ใช้งานถี่เกินไป กรุณารอ {wait} แล้วลองใหม่",
            headers={"Retry-After": str(retry_after)},
        )
