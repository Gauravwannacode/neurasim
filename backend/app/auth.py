"""Supabase authentication.

The frontend signs users in with Supabase GitHub OAuth and sends the Supabase
access token as ``Authorization: Bearer <jwt>``. We verify it here:

* projects using the legacy shared secret -> HS256 with ``SUPABASE_JWT_SECRET``
* projects using asymmetric signing keys  -> RS256/ES256 via the project's JWKS

If Supabase is not configured (local development / demo) every request is
treated as an anonymous *guest* so the simulator remains usable.
"""
from __future__ import annotations

from dataclasses import dataclass
from functools import lru_cache

import jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from .config import settings

_bearer = HTTPBearer(auto_error=False)


@dataclass
class User:
    id: str
    email: str | None = None
    name: str | None = None
    guest: bool = False


GUEST = User(id="guest", name="Guest", guest=True)


@lru_cache(maxsize=1)
def _jwks_client() -> jwt.PyJWKClient | None:
    if not settings.supabase_url:
        return None
    return jwt.PyJWKClient(f"{settings.supabase_url}/auth/v1/.well-known/jwks.json", cache_keys=True)


def verify_token(token: str) -> User:
    """Decode and verify a Supabase access token, raising ``jwt.PyJWTError`` on failure."""
    # The header only selects which configured key to use; accepted algorithms are pinned.
    alg = jwt.get_unverified_header(token).get("alg")
    if alg == "HS256":
        if not settings.supabase_jwt_secret:
            raise jwt.InvalidTokenError("HS256 token but SUPABASE_JWT_SECRET is not set")
        claims = jwt.decode(token, settings.supabase_jwt_secret, algorithms=["HS256"], audience="authenticated")
    elif alg in ("RS256", "ES256"):
        client = _jwks_client()
        if client is None:
            raise jwt.InvalidTokenError("Asymmetric token but SUPABASE_URL is not set")
        key = client.get_signing_key_from_jwt(token).key
        claims = jwt.decode(token, key, algorithms=[alg], audience="authenticated")
    else:
        raise jwt.InvalidTokenError(f"Unsupported algorithm {alg!r}")
    meta = claims.get("user_metadata") or {}
    return User(
        id=str(claims["sub"]),
        email=claims.get("email"),
        name=meta.get("user_name") or meta.get("full_name") or claims.get("email"),
    )


def current_user(creds: HTTPAuthorizationCredentials | None = Depends(_bearer)) -> User:
    """FastAPI dependency: the signed-in user, or a guest when auth is optional."""
    if creds is None:
        if settings.require_auth:
            raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Sign in required")
        return GUEST
    if not settings.auth_enabled:
        if settings.require_auth:  # misconfigured server: fail closed
            raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Sign-in is required but not configured on the server")
        return GUEST
    try:
        return verify_token(creds.credentials)
    except jwt.PyJWTError as exc:
        if settings.require_auth:
            raise HTTPException(status.HTTP_401_UNAUTHORIZED, f"Invalid token: {exc}") from exc
        return GUEST
