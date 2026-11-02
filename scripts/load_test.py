"""Measure how many face searches the server handles at once.

Runs INSIDE the api container against the api directly (Caddy is bypassed, so rate limits are
dodged by giving every simulated visitor its own X-Real-IP). It creates a throwaway event, uploads
a sample group photo, then fires selfie searches at increasing concurrency and deletes the event.

  docker compose exec -T api python scripts/load_test.py            (copy the file in first)
"""

import io
import os
import statistics
import threading
import time
import urllib.error
import urllib.request
import uuid
from concurrent.futures import ThreadPoolExecutor

import insightface

BASE = "http://localhost:8000"
SAMPLE = os.path.join(os.path.dirname(insightface.__file__), "data", "images", "t1.jpg")


def req(method, path, body=None, headers=None, files=None):
    headers = dict(headers or {})
    data = None
    if files:
        boundary = uuid.uuid4().hex
        buf = io.BytesIO()
        for name, (fname, content) in files.items():
            buf.write(f"--{boundary}\r\nContent-Disposition: form-data; name=\"{name}\"; filename=\"{fname}\"\r\nContent-Type: image/jpeg\r\n\r\n".encode())
            buf.write(content + b"\r\n")
        buf.write(f"--{boundary}--\r\n".encode())
        data = buf.getvalue()
        headers["Content-Type"] = f"multipart/form-data; boundary={boundary}"
    elif body is not None:
        import json

        data = json.dumps(body).encode()
        headers["Content-Type"] = "application/json"
    r = urllib.request.Request(BASE + path, data=data, method=method, headers=headers)
    with urllib.request.urlopen(r, timeout=120) as resp:
        raw = resp.read()
        import json

        return resp.status, (json.loads(raw) if raw and resp.headers.get_content_type() == "application/json" else None)


def main():
    import json

    _, tok = req("POST", "/auth/login", {"username": os.environ["ADMIN_USERNAME"], "password": os.environ["ADMIN_PASSWORD"]})
    auth = {"Authorization": f"Bearer {tok['token']}"}
    _, ev = req("POST", "/admin/events", {"name": "_load_test (auto-deleted)", "no_expiry": True}, auth)
    photo = open(SAMPLE, "rb").read()
    try:
        req("POST", f"/admin/events/{ev['id']}/photos", headers=auth, files={"files": ("group.jpg", photo)})
        # wait for the worker to index faces
        for _ in range(60):
            _, e = req("GET", f"/admin/events/{ev['id']}", headers=auth)
            if e["pending_count"] == 0 and e["face_count"] > 0:
                break
            time.sleep(1)
        print(f"indexed faces: {e['face_count']}")

        counter = iter(range(10**9))
        lock = threading.Lock()

        def search():
            with lock:
                n = next(counter)
            t = time.perf_counter()
            ip = {"X-Real-IP": f"10.9.{n // 250}.{n % 250}"}
            try:
                # Like the web app: wait in the scan queue, then upload when it's this visitor's turn.
                _, turn = req("POST", f"/public/events/{ev['share_token']}/queue", headers=ip)
                while not turn["ready"]:
                    time.sleep(1)
                    _, turn = req("GET", f"/public/queue/{turn['ticket']}", headers=ip)
                status, _ = req(
                    "POST", f"/public/events/{ev['share_token']}/search",
                    headers={**ip, "X-Scan-Ticket": turn["ticket"]},
                    files={"file": ("selfie.jpg", photo)},
                )
            except urllib.error.HTTPError as exc:  # 503 = queue full, the app asks to retry
                status = exc.code
            return time.perf_counter() - t, status

        search()  # warm-up
        for conc in (1, 5, 10, 20, 40):
            total = max(conc * 3, 10)
            t0 = time.perf_counter()
            with ThreadPoolExecutor(conc) as pool:
                results = list(pool.map(lambda _: search(), range(total)))
            wall = time.perf_counter() - t0
            lat = sorted(r[0] for r in results)
            ok = sum(1 for r in results if r[1] == 200)
            busy = sum(1 for r in results if r[1] == 503)
            p95 = lat[int(len(lat) * 0.95) - 1]
            print(
                f"concurrency {conc:>2}: {ok}/{total} ok, {busy} busy · {ok / wall:4.1f} searches/s · "
                f"median {statistics.median(lat):5.2f}s · p95 {p95:5.2f}s",
                flush=True,
            )
    finally:
        req("DELETE", f"/admin/events/{ev['id']}", headers=auth)
        print("test event deleted")


if __name__ == "__main__":
    main()
