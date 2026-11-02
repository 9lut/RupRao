"""Anonymous per-event counts: how many people opened, scanned and downloaded.

The browser sends a random id (X-Visitor-Id, kept in its localStorage). Only a keyed hash of it is
stored, different for every event, and nothing links it to a person, a selfie or an IP address.
Counting must never get in the way of the attendee, so every failure here is swallowed.
"""

import logging
import re
import uuid
from typing import Literal

from fastapi import Request
from sqlalchemy import func, select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.orm import Session

from app.config import settings
from app.db.models import EventVisitor
from app.services.auth import sign_value
from app.services.queue import redis_conn
from app.services.rate_limit import client_ip, hit

log = logging.getLogger(__name__)

_VISITOR_ID = re.compile(r"[A-Za-z0-9-]{16,64}")


def visitor_key(event_id: uuid.UUID, raw: str | None) -> str | None:
    if not raw or not _VISITOR_ID.fullmatch(raw):
        return None
    return sign_value("visitor", f"{event_id}:{raw}")


def record(
    db: Session, request: Request, event_id: uuid.UUID, kind: Literal["scan", "download"] | None = None, count: int = 1
) -> None:
    """Note this visitor on the event; `kind` also adds to what they did. kind=None is just a visit."""
    try:
        visitor = visitor_key(event_id, request.headers.get("x-visitor-id"))
        if visitor is None:
            return
        # Each new id is a new row, so don't let a script invent them endlessly.
        allowed, _ = hit(redis_conn, f"rl:visitor:60:{client_ip(request)}", settings.rate_visitor_per_minute, 60)
        if not allowed:
            return
        column = f"{kind}_count" if kind else None
        stmt = insert(EventVisitor).values(event_id=event_id, visitor=visitor, **({column: count} if column else {}))
        stmt = (
            stmt.on_conflict_do_update(
                index_elements=[EventVisitor.event_id, EventVisitor.visitor],
                set_={column: getattr(EventVisitor, column) + count},
            )
            if column
            else stmt.on_conflict_do_nothing()
        )
        db.execute(stmt)
        db.commit()
    except Exception:  # noqa: BLE001
        log.exception("Could not record a visit")
        db.rollback()


def visitor_totals(db: Session, where) -> dict[str, int]:
    """Totals over the event_visitors rows matching `where`."""
    visitors, scan_people, scans, download_people, downloads = db.execute(
        select(
            func.count(),
            func.count().filter(EventVisitor.scan_count > 0),
            func.coalesce(func.sum(EventVisitor.scan_count), 0),
            func.count().filter(EventVisitor.download_count > 0),
            func.coalesce(func.sum(EventVisitor.download_count), 0),
        ).where(where)
    ).one()
    return {
        "visitors": visitors,
        "scan_people": scan_people,
        "scans": scans,
        "download_people": download_people,
        "downloads": downloads,
    }
