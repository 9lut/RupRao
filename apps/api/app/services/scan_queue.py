"""First-come queue for face searches, in Redis.

The CPU handles only a few searches at a time. Instead of everyone uploading a selfie and waiting on
an open request (and some being refused after 45 s), the browser takes a ticket, watches its place
in line, and uploads only when its turn comes. The selfie stays on the phone while it waits.

Everything here fails open: without Redis, searches fall back to waiting on the model directly.
"""

import logging
import os
import secrets
import time

from app.config import settings
from app.services.queue import redis_conn

log = logging.getLogger(__name__)

QUEUE = "scan:queue"  # ticket -> arrival number (the order of the line)
SEEN = "scan:seen"  # ticket -> last time the browser asked; closed tabs fall out
FRONT = "scan:front"  # ticket -> when it reached the front; turns not taken are given up
NEXT = "scan:next"
AVG = "scan:avg_seconds"


class QueueFull(RuntimeError):
    pass


def _cores() -> int:
    return settings.face_concurrency or os.cpu_count() or 1


def _front_size() -> int:
    # A few more than can run at once, so the CPU never idles while the next person uploads.
    return _cores() * 2


def _forget(*tickets) -> None:
    pipe = redis_conn.pipeline()
    for key in (QUEUE, SEEN, FRONT):
        pipe.zrem(key, *tickets)
    pipe.execute()


def _drop_stale(now: float) -> None:
    stale = set(redis_conn.zrangebyscore(SEEN, 0, now - settings.scan_ticket_idle_seconds))
    stale |= set(redis_conn.zrangebyscore(FRONT, 0, now - settings.scan_turn_seconds))
    if stale:
        _forget(*stale)


def _status(ticket: str, rank: int, now: float) -> dict:
    front = _front_size()
    if rank < front:
        redis_conn.zadd(FRONT, {ticket: now}, nx=True)
        return {"ticket": ticket, "ready": True, "position": 0, "eta_seconds": 0}
    position = rank - front + 1
    average = float(redis_conn.get(AVG) or settings.scan_default_seconds)
    return {
        "ticket": ticket,
        "ready": False,
        "position": position,
        "eta_seconds": max(1, round(position * average / _cores())),
    }


def join() -> dict:
    """Get in line. Without Redis, ticket is None and the search just goes ahead."""
    now = time.time()
    try:
        _drop_stale(now)
        if redis_conn.zcard(QUEUE) >= settings.scan_queue_max:
            raise QueueFull
        ticket = secrets.token_urlsafe(16)
        arrival = redis_conn.incr(NEXT)
        pipe = redis_conn.pipeline()
        pipe.zadd(QUEUE, {ticket: arrival})
        pipe.zadd(SEEN, {ticket: now})
        pipe.zrank(QUEUE, ticket)
        rank = pipe.execute()[-1]
        return _status(ticket, rank, now)
    except QueueFull:
        raise
    except Exception:  # noqa: BLE001
        log.exception("Scan queue unavailable")
        return {"ticket": None, "ready": True, "position": 0, "eta_seconds": 0}


def status(ticket: str) -> dict | None:
    """Where this ticket stands, or None if it fell out of line (the browser joins again)."""
    now = time.time()
    try:
        _drop_stale(now)
        rank = redis_conn.zrank(QUEUE, ticket)
        if rank is None:
            return None
        redis_conn.zadd(SEEN, {ticket: now}, xx=True)
        return _status(ticket, rank, now)
    except Exception:  # noqa: BLE001
        log.exception("Scan queue unavailable")
        return {"ticket": ticket, "ready": True, "position": 0, "eta_seconds": 0}


def may_wait(ticket: str | None) -> bool:
    """Has this request earned a place at the front? If not, it gets no patience from the model."""
    try:
        if not ticket:
            return False
        rank = redis_conn.zrank(QUEUE, ticket)
        return rank is not None and rank < _front_size()
    except Exception:  # noqa: BLE001
        log.exception("Scan queue unavailable")
        return True


def leave(ticket: str | None) -> None:
    if not ticket:
        return
    try:
        _forget(ticket)
    except Exception:  # noqa: BLE001
        log.exception("Scan queue unavailable")


def record_duration(seconds: float) -> None:
    """Keep a rolling average, so the wait shown matches how fast this server is right now."""
    try:
        previous = float(redis_conn.get(AVG) or seconds)
        redis_conn.set(AVG, round(previous * 0.8 + seconds * 0.2, 2))
    except Exception:  # noqa: BLE001
        log.exception("Scan queue unavailable")


def waiting() -> int:
    """People in line, for the admin overview."""
    try:
        return max(0, redis_conn.zcard(QUEUE) - _front_size())
    except Exception:  # noqa: BLE001
        return 0
