"""Tiny forward-only SQL migration runner (files in ./migrations, applied in name order)."""

import logging
from pathlib import Path

from sqlalchemy import text

from app.db.database import engine

log = logging.getLogger(__name__)
MIGRATIONS_DIR = Path(__file__).parent / "migrations"
LOCK_ID = 7_274_101  # arbitrary; serializes API replicas / worker starting at once


def run_migrations() -> None:
    with engine.begin() as conn:
        conn.execute(text("SELECT pg_advisory_xact_lock(:id)"), {"id": LOCK_ID})
        conn.exec_driver_sql(
            "CREATE TABLE IF NOT EXISTS schema_migrations ("
            " version TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW())"
        )
        applied = set(conn.execute(text("SELECT version FROM schema_migrations")).scalars())
        for path in sorted(MIGRATIONS_DIR.glob("*.sql")):
            if path.stem in applied:
                continue
            log.info("Applying migration %s", path.name)
            conn.exec_driver_sql(path.read_text(encoding="utf-8"))
            conn.execute(text("INSERT INTO schema_migrations (version) VALUES (:v)"), {"v": path.stem})
