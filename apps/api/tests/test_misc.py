import uuid
from types import SimpleNamespace

from app.services.face_service import det_size_for
from app.services.rate_limit import hit
from app.services.storage_service import _signed_url, storage, with_path_prefix
from app.services.usage import disk_usage, upload_block
from app.services.visitors import visitor_key


def test_det_size_scales_with_photo():
    assert det_size_for(640, 480) == 640
    assert det_size_for(1600, 1200) == 960
    assert det_size_for(6000, 4000) == 1280


def test_path_prefix_keeps_query_signature():
    url = "https://localhost/photos/events/a/original/b.jpg?X-Amz-Signature=abc&X-Amz-Expires=3600"
    assert with_path_prefix(url, "/storage") == (
        "https://localhost/storage/photos/events/a/original/b.jpg?X-Amz-Signature=abc&X-Amz-Expires=3600"
    )
    assert with_path_prefix(url, "") == url


class FakeRedis:
    def __init__(self):
        self.store, self.ttls = {}, {}

    def pipeline(self):
        return FakePipe(self)


class FakePipe:
    def __init__(self, r):
        self.r, self.ops = r, []

    def incr(self, k):
        self.ops.append(("incr", k))

    def expire(self, k, s, nx=False):
        self.ops.append(("expire", k, s, nx))

    def ttl(self, k):
        self.ops.append(("ttl", k))

    def execute(self):
        out = []
        for op in self.ops:
            if op[0] == "incr":
                self.r.store[op[1]] = self.r.store.get(op[1], 0) + 1
                out.append(self.r.store[op[1]])
            elif op[0] == "expire":
                if not (op[3] and op[1] in self.r.ttls):
                    self.r.ttls[op[1]] = op[2]
                out.append(True)
            else:
                out.append(self.r.ttls.get(op[1], -1))
        return out


def test_visitor_key_is_per_event_and_rejects_junk():
    a, b = uuid.uuid4(), uuid.uuid4()
    raw = "0123456789abcdef0123456789abcdef"
    assert visitor_key(a, raw) == visitor_key(a, raw)
    assert visitor_key(a, raw) != visitor_key(b, raw)  # can't follow someone across events
    assert raw not in visitor_key(a, raw)
    assert len(visitor_key(a, raw)) <= 64  # fits the column
    for junk in (None, "", "short", "x" * 65, "not valid id with spaces!!"):
        assert visitor_key(a, junk) is None


class FakeUsageDb:
    """Answers upload_block's sums in the order it asks for them."""

    def __init__(self, *sums, owner=None):
        self.sums, self.owner = list(sums), owner

    def scalar(self, _):
        return self.sums.pop(0)

    def get(self, *_):
        return self.owner


def test_upload_block_checks_album_then_owner(monkeypatch):
    monkeypatch.setattr("app.services.usage.disk_usage", lambda: None)
    event = SimpleNamespace(id=uuid.uuid4(), owner_id=uuid.uuid4(), storage_quota_bytes=100)
    owner = SimpleNamespace(id=event.owner_id, storage_quota_bytes=500)
    assert upload_block(FakeUsageDb(50, 400, owner=owner), event, 50) is None  # exactly full still fits
    assert "อัลบั้ม" in upload_block(FakeUsageDb(50, owner=owner), event, 51)
    event.storage_quota_bytes = None
    assert "บัญชี" in upload_block(FakeUsageDb(450, owner=owner), event, 51)
    owner.storage_quota_bytes = None
    assert upload_block(FakeUsageDb(owner=owner), event, 51) is None


def test_upload_block_keeps_disk_space_free(monkeypatch):
    event = SimpleNamespace(id=uuid.uuid4(), owner_id=None, storage_quota_bytes=None)
    gb = 1024**3
    monkeypatch.setattr("app.services.usage.disk_usage", lambda: {"total": 100 * gb, "used": 97 * gb, "free": 3 * gb})
    assert upload_block(FakeUsageDb(), event, 100) is None
    monkeypatch.setattr("app.services.usage.disk_usage", lambda: {"total": 100 * gb, "used": 99 * gb, "free": gb})
    assert "เซิร์ฟเวอร์" in upload_block(FakeUsageDb(), event, 100)


def test_signed_links_are_reused_then_renewed(monkeypatch):
    clock = [1_000_000.0]
    monkeypatch.setattr("app.services.storage_service.time.time", lambda: clock[0])
    monkeypatch.setattr("app.services.storage_service.settings.presigned_url_ttl", 3600)
    monkeypatch.setattr("app.services.storage_service.settings.s3_public_url", "https://example.test/storage")
    key = f"events/{uuid.uuid4()}/thumb.webp"
    first = storage.get_url(key)
    assert first.startswith("https://example.test/storage/")
    assert storage.get_url(key) == first  # same link, so browsers can cache the image
    assert storage.get_url(key, download_name="a.jpg") != first  # a download is a different link
    signed = _signed_url.cache_info().misses
    storage.get_url(key)
    assert _signed_url.cache_info().misses == signed  # reused, no signing
    clock[0] += 1800
    storage.get_url(key)
    assert _signed_url.cache_info().misses == signed + 1  # renewed before it could expire


def test_disk_usage_is_none_without_the_volume(monkeypatch):
    monkeypatch.setattr("app.services.usage.settings.storage_disk_path", "/no/such/path")
    assert disk_usage() is None


def test_rate_limit_blocks_after_limit():
    r = FakeRedis()
    results = [hit(r, "k", 3, 60)[0] for _ in range(5)]
    assert results == [True, True, True, False, False]
    assert hit(r, "k", 3, 60)[1] == 60
