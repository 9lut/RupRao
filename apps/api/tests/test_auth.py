from app.services.auth import create_token, verify_token


def test_roundtrip():
    assert verify_token(create_token("admin")) == "admin"


def test_tampered_payload_rejected():
    token = create_token("admin")
    payload, sig = token.split(".")
    forged = create_token("someone-else").split(".")[0]
    assert verify_token(f"{forged}.{sig}") is None
    assert verify_token(f"{payload}.{sig[:-2]}xx") is None


def test_expired_rejected():
    token = create_token("admin", ttl_seconds=10, now=1_000)
    assert verify_token(token, now=1_005) == "admin"
    assert verify_token(token, now=1_011) is None


def test_garbage_rejected():
    for bad in ("", "abc", "a.b", "....", "%%%.%%%"):
        assert verify_token(bad) is None
