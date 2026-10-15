"""Unsupervised threshold calibration for one event.

Two samples are combined:
  * each sampled face's nearest neighbours in *other* photos — mostly the same person (high similarity)
  * random face pairs — almost always strangers (low similarity)
The histogram is therefore bimodal, and Otsu's method finds the valley between the two humps:
a data-driven match threshold for this event's photos.
"""

import uuid

import numpy as np
from sqlalchemy import text
from sqlalchemy.orm import Session

BINS = 50


def otsu_threshold(values: np.ndarray, lo: float = 0.15, hi: float = 0.85, bins: int = 200) -> float:
    hist, edges = np.histogram(values, bins=bins, range=(0.0, 1.0))
    centers = (edges[:-1] + edges[1:]) / 2
    total = hist.sum()
    if total == 0:
        return float("nan")
    best_t, best_var = float("nan"), -1.0
    for i in range(1, bins):
        if not (lo <= centers[i] <= hi):
            continue
        w0, w1 = hist[:i].sum(), hist[i:].sum()
        if w0 == 0 or w1 == 0:
            continue
        m0 = (hist[:i] * centers[:i]).sum() / w0
        m1 = (hist[i:] * centers[i:]).sum() / w1
        var = w0 * w1 * (m0 - m1) ** 2
        if var > best_var:
            best_var, best_t = var, float(edges[i])
    return best_t


def valley_threshold(values: np.ndarray, bins: int = 100) -> float:
    """Lowest point of the (smoothed) histogram between the two humps. Otsu only locates the split
    roughly — with very unequal hump sizes it drifts toward the bigger one — so we use it to find the
    two peaks and then take the middle of the emptiest stretch between them."""
    t0 = otsu_threshold(values)
    if np.isnan(t0):
        return t0
    hist, edges = np.histogram(values, bins=bins, range=(0.0, 1.0))
    smooth = np.convolve(hist, np.ones(7) / 7, mode="same")
    centers = (edges[:-1] + edges[1:]) / 2
    split = int(np.searchsorted(centers, t0))
    if split <= 0 or split >= bins:
        return t0
    left_peak = int(np.argmax(smooth[:split]))
    right_peak = split + int(np.argmax(smooth[split:]))
    if right_peak - left_peak < 2:
        return t0
    between = smooth[left_peak : right_peak + 1]
    # Everything within 2% of the tallest bar counts as "empty"; take the middle of that stretch.
    lows = np.flatnonzero(between <= between.min() + 0.02 * smooth.max()) + left_peak
    return float(centers[int(round(lows.mean()))])


def random_pair_similarities(db: Session, event_id: uuid.UUID, n: int = 3000) -> np.ndarray:
    """Similarities of random face pairs from different photos: overwhelmingly strangers."""
    rows = db.execute(
        text(
            """
            WITH f AS (
                SELECT f.photo_id, f.embedding
                FROM faces f JOIN photos p ON p.id = f.photo_id
                WHERE p.event_id = :event_id AND f.embedding IS NOT NULL
            ),
            a AS (SELECT x.*, row_number() OVER () AS rn FROM (SELECT * FROM f ORDER BY random() LIMIT :n) x),
            b AS (SELECT x.*, row_number() OVER () AS rn FROM (SELECT * FROM f ORDER BY random() LIMIT :n) x)
            SELECT 1 - (a.embedding <=> b.embedding)
            FROM a JOIN b ON a.rn = b.rn AND a.photo_id <> b.photo_id
            """
        ),
        {"event_id": event_id, "n": n},
    ).scalars()
    return np.fromiter(rows, dtype=np.float32)


def neighbour_similarities(db: Session, event_id: uuid.UUID, sample: int = 600, k: int = 3) -> np.ndarray:
    rows = db.execute(
        text(
            """
            WITH sample AS (
                SELECT f.photo_id, f.embedding
                FROM faces f JOIN photos p ON p.id = f.photo_id
                WHERE p.event_id = :event_id AND f.embedding IS NOT NULL
                ORDER BY random()
                LIMIT :sample
            )
            SELECT n.sim
            FROM sample s
            CROSS JOIN LATERAL (
                SELECT 1 - (f2.embedding <=> s.embedding) AS sim
                FROM faces f2 JOIN photos p2 ON p2.id = f2.photo_id
                WHERE p2.event_id = :event_id AND f2.photo_id <> s.photo_id AND f2.embedding IS NOT NULL
                ORDER BY f2.embedding <=> s.embedding
                LIMIT :k
            ) n
            """
        ),
        {"event_id": event_id, "sample": sample, "k": k},
    ).scalars()
    return np.fromiter(rows, dtype=np.float32)


def calibrate(db: Session, event_id: uuid.UUID, default: float) -> dict:
    # Exact scan (no HNSW) inside this transaction: the sample is small and recall matters here.
    db.execute(text("SET LOCAL enable_indexscan = off"))
    db.execute(text("SELECT setseed(0.42)"))  # same photos -> same suggestion
    neighbours = neighbour_similarities(db, event_id)
    db.rollback()
    db.execute(text("SELECT setseed(0.42)"))
    # Events where people are photographed many times have no "stranger" hump among nearest
    # neighbours; random pairs supply it so the valley between the two groups is always visible.
    sims = np.concatenate([neighbours, random_pair_similarities(db, event_id)])
    db.rollback()

    hist, edges = np.histogram(sims, bins=BINS, range=(0.0, 1.0))
    suggested = valley_threshold(sims) if sims.size >= 50 else float("nan")
    reliable = not np.isnan(suggested)
    if reliable:
        suggested = float(np.clip(round(suggested, 2), 0.3, 0.65))
    return {
        "samples": int(sims.size),
        "bins": [{"from": round(float(edges[i]), 2), "count": int(hist[i])} for i in range(BINS)],
        "suggested_threshold": suggested if reliable else default,
        "reliable": reliable,
    }
