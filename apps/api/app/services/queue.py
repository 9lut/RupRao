"""Redis-backed job queue (RQ). The API enqueues; the `worker` service processes."""

import uuid

from redis import Redis
from rq import Queue, Retry

from app.config import settings

redis_conn = Redis.from_url(settings.redis_url)
photo_queue = Queue("photos", connection=redis_conn, default_timeout=600)


def job_id(photo_id) -> str:
    return f"photo-{photo_id}"


def enqueue_photos(photo_ids: list[uuid.UUID]) -> None:
    for pid in photo_ids:
        photo_queue.enqueue(
            "app.services.processing.process_photo",
            str(pid),
            job_id=job_id(pid),
            retry=Retry(max=3, interval=[10, 30, 60]),
            result_ttl=0,
            failure_ttl=7 * 24 * 3600,
        )


def queue_stats() -> dict:
    return {
        "queued": photo_queue.count,
        "failed": photo_queue.failed_job_registry.count,
        "running": photo_queue.started_job_registry.count,
    }
