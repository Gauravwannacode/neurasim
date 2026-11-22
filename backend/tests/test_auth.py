import time

import jwt
from fastapi.testclient import TestClient

from app import auth, config


def test_guest_when_unconfigured():
    from app.main import app

    r = TestClient(app).get("/me")
    assert r.status_code == 200
    assert r.json()["guest"] is True


def test_hs256_token_verified(monkeypatch):
    s = config.Settings(supabase_jwt_secret="test-secret-that-is-long-enough-for-hs256")
    monkeypatch.setattr(auth, "settings", s)
    tok = jwt.encode(
        {"sub": "u1", "aud": "authenticated", "email": "a@b.c", "exp": int(time.time()) + 60,
         "user_metadata": {"user_name": "octo"}},
        s.supabase_jwt_secret, algorithm="HS256",
    )
    user = auth.verify_token(tok)
    assert user.id == "u1" and user.name == "octo" and not user.guest
