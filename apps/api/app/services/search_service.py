import uuid
from dataclasses import dataclass

import numpy as np
from sqlalchemy import select, text
from sqlalchemy.orm import Session

from app.db.models import Face, Photo


@dataclass
class Match:
    photo: Photo
    face: Face
    similarity: float


def search_event(
    db: Session, event_id: uuid.UUID, embedding: np.ndarray, threshold: float, limit: int
) -> list[Match]:
    """Nearest faces in one event, deduplicated to the best face per photo."""
    # Over-fetch faces (a photo may match through several faces), then keep the best per photo.
    candidate_k = min(limit * 4, 1000)
    db.execute(text(f"SET LOCAL hnsw.ef_search = {max(candidate_k, 40)}"))
    # Filtered HNSW search: keep scanning until enough rows pass the event filter (pgvector >= 0.8).
    db.execute(text("SET LOCAL hnsw.iterative_scan = relaxed_order"))

    distance = Face.embedding.cosine_distance(embedding).label("distance")
    stmt = (
        select(Face, Photo, distance)
        .join(Photo, Photo.id == Face.photo_id)
        .where(Photo.event_id == event_id, Face.embedding.is_not(None))
        .order_by(distance)
        .limit(candidate_k)
    )

    best: dict[uuid.UUID, Match] = {}
    for face, photo, dist in db.execute(stmt):
        similarity = 1.0 - float(dist)
        if similarity < threshold:
            break  # rows are sorted by distance
        if photo.id not in best:
            best[photo.id] = Match(photo, face, round(similarity, 4))
            if len(best) >= limit:
                break
    db.commit()  # end the transaction so SET LOCAL is discarded (read-only; objects stay loaded)
    return list(best.values())
