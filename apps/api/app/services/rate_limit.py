"""Fixed-window rate limiting in Redis, keyed by client IP, plus failure counters against guessing."""

import hashlib
import logging

from fastapi import HTTPException, Request, status

from app.services.queue import redis_conn

log = logging.getLogger(__name__)


def client_ip(request: Request) -> str:
    # Caddy sets X-Real-IP to the visitor's address (Cloudflare-aware, see Caddyfile); fall back to
    # X-Forwarded-For, which Caddy rewrites to the real peer when the sender isn't a trusted proxy.
    real = request.headers.get("x-real-ip")
    if real:
        return real.strip()
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
        raise _too_many("ใช้งานถี่เกินไป", retry_after)


def _too_many(reason: str, retry_after: int) -> HTTPException:
    minutes = (retry_after + 59) // 60
    wait = f"{retry_after} วินาที" if retry_after < 120 else f"{minutes} นาที"
    return HTTPException(
        status.HTTP_429_TOO_MANY_REQUESTS,
        f"{reason} กรุณารอ {wait} แล้วลองใหม่",
        headers={"Retry-After": str(retry_after)},
    )


# ---------- wrong guesses (passwords, access codes, share links) ----------
# Only failures count, so normal use never gets near these limits, and they survive restarts.

def _failure_key(name: str, who: str) -> str:
    # `who` can include what a stranger typed, so its length and characters mustn't reach Redis.
    return f"fail:{name}:{hashlib.sha256(who.encode()).hexdigest()[:32]}"


def refuse_after_failures(name: str, who: str, limit: int) -> None:
    """Raise 429 when `who` has failed too often. Check BEFORE testing the guess."""
    try:
        key = _failure_key(name, who)
        count = int(redis_conn.get(key) or 0)
        retry_after = redis_conn.ttl(key) if count >= limit else 0
    except Exception:  # noqa: BLE001 - see enforce()
        log.exception("Rate limiter unavailable; allowing request")
        return
    if count >= limit:
        raise _too_many("ลองผิดหลายครั้งเกินไป", max(int(retry_after), 1))


def add_failure(name: str, who: str, window_seconds: int) -> None:
    try:
        key = _failure_key(name, who)
        pipe = redis_conn.pipeline()
        pipe.incr(key)
        pipe.expire(key, window_seconds, nx=True)
        pipe.execute()
    except Exception:  # noqa: BLE001
        log.exception("Rate limiter unavailable")


def clear_failures(name: str, who: str) -> None:
    try:
        redis_conn.delete(_failure_key(name, who))
    except Exception:  # noqa: BLE001
        log.exception("Rate limiter unavailable")
