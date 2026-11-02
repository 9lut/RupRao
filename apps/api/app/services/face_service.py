"""Face detection (SCRFD) + 512-d ArcFace embeddings via InsightFace on ONNX Runtime (CPU)."""

import fcntl
import logging
import os
import threading
from dataclasses import dataclass

import numpy as np

from app.config import settings

log = logging.getLogger(__name__)


@dataclass
class DetectedFace:
    x: int
    y: int
    width: int
    height: int
    score: float
    embedding: np.ndarray | None  # L2-normalized, shape (512,); None if not asked for (see detect)

    @property
    def area(self) -> int:
        return self.width * self.height


def det_size_for(width: int, height: int) -> int:
    """Bigger photos get a bigger detector input so faces at the back of group shots survive the
    downscale. The detector model has a dynamic input shape; sizes must be multiples of 32."""
    long_side = max(width, height)
    size = 1280 if long_side >= 2400 else 960 if long_side >= 1400 else 640
    return max(320, min(size, settings.face_det_size_max) // 32 * 32)


class FaceBusy(RuntimeError):
    """Too many searches queued for the face model; the caller should retry shortly."""


class FaceService:
    def __init__(self) -> None:
        self._app = None
        self._load_lock = threading.Lock()
        # ONNX Runtime sessions are thread-safe, but running more inferences than CPU cores only
        # makes every one of them slower; the gate queues the rest.
        self._gate = threading.BoundedSemaphore(settings.face_concurrency or os.cpu_count() or 1)

    @property
    def ready(self) -> bool:
        return self._app is not None

    def load(self) -> None:
        with self._load_lock:
            if self._app is not None:
                return
            from insightface.app import FaceAnalysis

            log.info("Loading face model %s into %s (downloads on first run)", settings.face_model, settings.model_dir)
            # api and worker share the model folder and start together: a file lock makes the first
            # one download/unzip while the other waits, instead of reading a half-written .onnx.
            os.makedirs(settings.model_dir, exist_ok=True)
            with open(os.path.join(settings.model_dir, ".download.lock"), "w") as lock:
                fcntl.flock(lock, fcntl.LOCK_EX)
                try:
                    app = FaceAnalysis(
                        name=settings.face_model,
                        root=settings.model_dir,
                        allowed_modules=["detection", "recognition"],
                        providers=["CPUExecutionProvider"],
                    )
                finally:
                    fcntl.flock(lock, fcntl.LOCK_UN)
            app.prepare(ctx_id=-1, det_size=(settings.face_det_size, settings.face_det_size))
            self._app = app
            log.info("Face model ready")

    def detect(
        self, bgr: np.ndarray, det_size: int | None = None, wait: float | None = None, only_face: int | None = None
    ) -> list[DetectedFace]:
        """Detect faces and embed them. Returned list is sorted by face area, largest first.
        `only_face` embeds just that one (clamped to the last face): embedding is the slow step, and a
        search needs one person, however many people are in the selfie's background.
        Waits for a free inference slot; with `wait` seconds set, raises FaceBusy when none frees up."""
        self.load()
        if not self._gate.acquire(timeout=wait):
            raise FaceBusy
        try:
            return self._detect(bgr, det_size, only_face)
        finally:
            self._gate.release()

    def _detect(self, bgr: np.ndarray, det_size: int | None, only_face: int | None = None) -> list[DetectedFace]:
        from insightface.app.common import Face

        size = det_size or settings.face_det_size
        bboxes, kpss = self._app.det_model.detect(bgr, input_size=(size, size), max_num=0, metric="default")
        recognizer = self._app.models["recognition"]

        h, w = bgr.shape[:2]
        found: list[tuple[DetectedFace, int]] = []
        for i in range(bboxes.shape[0]):
            score = float(bboxes[i, 4])
            if score < settings.face_min_det_score or kpss is None:
                continue
            x1, y1, x2, y2 = bboxes[i, :4].astype(int)
            x1, y1, x2, y2 = max(0, x1), max(0, y1), min(w, x2), min(h, y2)
            if min(x2 - x1, y2 - y1) < settings.face_min_size:
                continue
            found.append(
                (DetectedFace(x=int(x1), y=int(y1), width=int(x2 - x1), height=int(y2 - y1), score=score, embedding=None), i)
            )
        found.sort(key=lambda pair: pair[0].area, reverse=True)

        wanted = range(len(found)) if only_face is None else {min(only_face, len(found) - 1)}
        for n in wanted:
            detected, i = found[n]
            face = Face(bbox=bboxes[i, :4], kps=kpss[i], det_score=detected.score)
            recognizer.get(bgr, face)  # aligns on landmarks, sets face.embedding
            detected.embedding = face.normed_embedding.astype(np.float32)
        return [detected for detected, _ in found]


face_service = FaceService()
