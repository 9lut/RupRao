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


def test_password_hash_roundtrip():
    from app.services.auth import hash_password, verify_password

    stored = hash_password("correct horse battery")
    assert stored.startswith("scrypt$")
    assert verify_password("correct horse battery", stored)
    assert not verify_password("wrong", stored)
    assert not verify_password("anything", "garbage")
    assert hash_password("same") != hash_password("same")  # salted
