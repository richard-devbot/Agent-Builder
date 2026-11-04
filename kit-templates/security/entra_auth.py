"""Microsoft Entra ID bearer token validator for Cloud Run APIs and web apps.
Enforces docs/AUTH-STANDARD.md: every route except /healthz must depend on require_user."""
from __future__ import annotations

import os
from typing import Any

# TODO(verify): confirm exact PyJWT + cryptography JWKS verification settings for your Entra tenant.
import jwt
from jwt import PyJWKClient
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

_bearer = HTTPBearer(auto_error=True)
_jwk_client: PyJWKClient | None = None


def _get_jwk_client() -> PyJWKClient:
    global _jwk_client
    if _jwk_client is None:
        tenant_id = os.environ.get("ENTRA_TENANT_ID", "")
        if not tenant_id:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="ENTRA_TENANT_ID environment variable is not set.",
            )
        jwks_url = f"https://login.microsoftonline.com/{tenant_id}/discovery/v2.0/keys"
        _jwk_client = PyJWKClient(jwks_url)
    return _jwk_client


def require_user(
    creds: HTTPAuthorizationCredentials = Depends(_bearer),
) -> dict[str, Any]:
    """Validate an Entra ID v2.0 JWT access token and enforce ENTRA_ALLOWED_ROLES."""
    tenant_id = os.environ.get("ENTRA_TENANT_ID", "")
    audience = os.environ.get("ENTRA_CLIENT_ID", "")
    if not tenant_id or not audience:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="ENTRA_TENANT_ID and ENTRA_CLIENT_ID must be configured.",
        )
    token = creds.credentials
    try:
        signing_key = _get_jwk_client().get_signing_key_from_jwt(token)
        claims: dict[str, Any] = jwt.decode(
            token,
            signing_key.key,
            algorithms=["RS256"],
            audience=audience,
            issuer=f"https://login.microsoftonline.com/{tenant_id}/v2.0",
        )
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired Microsoft Entra ID token.",
        ) from exc

    allowed_raw = os.environ.get("ENTRA_ALLOWED_ROLES", "")
    allowed_roles = {r.strip() for r in allowed_raw.split(",") if r.strip()}
    if allowed_roles:
        token_roles = set(claims.get("roles") or [])
        if not token_roles.intersection(allowed_roles):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Your Entra ID role is not authorised for this agent endpoint.",
            )

    return {
        "oid": claims.get("oid") or claims.get("sub"),
        "name": claims.get("name"),
        "email": claims.get("preferred_username") or claims.get("email"),
        "roles": claims.get("roles") or [],
    }
