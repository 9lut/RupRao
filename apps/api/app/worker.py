"""Background worker: face processing jobs from Redis + periodic retention cleanup.

Run with `python -m app.worker`. Scale with `docker compose up -d --scale worker=N`.
"""

import logging
import threading
import time

from rq import SimpleWorker

from app.config import settings
from app.services.face_service import face_service
from app.services.processing import unfinished_photo_ids
from app.services.queue import enqueue_photos, job_id, photo_queue, redis_conn
from app.services.retention import delete_expired_events

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
log = logging.getLogger("worker")


def requeue_orphans() -> None:
    """Re-enqueue photos the DB says are unfinished but that have no job in Redis
    (worker crash, Redis wiped, or photos uploaded before the queue existed)."""
    queued = set(photo_queue.job_ids)
    orphans = [pid for pid in unfinished_photo_ids() if job_id(pid) not in queued]
    if orphans:
        log.info("Re-queueing %d orphaned photos", len(orphans))
        enqueue_photos(orphans)


def cleanup_loop() -> None:
    while True:
        try:
            # Only one worker replica should do the sweep per interval.
            if redis_conn.set("lock:retention", "1", nx=True, ex=settings.cleanup_interval_minutes * 60):
                deleted = delete_expired_events()
                if deleted:
                    log.info("Retention: deleted %d expired events", deleted)
        except Exception:  # noqa: BLE001
            log.exception("Retention sweep failed")
        time.sleep(60)


def main() -> None:
    # Load once; SimpleWorker runs jobs in this process, so the model stays warm between jobs.
    face_service.load()
    requeue_orphans()
    threading.Thread(target=cleanup_loop, daemon=True, name="retention").start()
    SimpleWorker([photo_queue], connection=redis_conn).work(with_scheduler=True)


if __name__ == "__main__":
    main()
