from app.services.face_service import det_size_for
from app.services.rate_limit import hit
from app.services.storage_service import with_path_prefix


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


def test_rate_limit_blocks_after_limit():
    r = FakeRedis()
    results = [hit(r, "k", 3, 60)[0] for _ in range(5)]
    assert results == [True, True, True, False, False]
    assert hit(r, "k", 3, 60)[1] == 60
