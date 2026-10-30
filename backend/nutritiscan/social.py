"""OAuth code exchange and explicit linking to the existing health identity.

Provider access/refresh tokens are used only in memory, never stored or logged.
Only verified primary email and a stable provider subject enter account logic.
"""

import hashlib
import secrets
from datetime import timedelta, timezone
from typing import Literal

import httpx
from fastapi import Depends, HTTPException, Request
from pydantic import Field
from sqlalchemy import delete, select
from sqlalchemy.exc import IntegrityError

from .auth import authenticate, email_index, password_hash, start_session
from .database import (
    Account,
    Consent,
    GitHubIdentity,
    GoogleIdentity,
    LoginSession,
    OAuthLinkIntent,
    audit,
    new_id,
    now,
)
from .schemas import Strict

Provider = Literal["google", "github"]


class SocialCode(Strict):
    code: str = Field(min_length=1, max_length=2048)
    code_verifier: str = Field(pattern=r"^[A-Za-z0-9._~-]{43,128}$")
    redirect_uri: str = Field(max_length=512)
    nonce: str = Field(min_length=32, max_length=128)
    link_ticket: str | None = Field(default=None, pattern=r"^[A-Za-z0-9_-]{43}$")


class LinkRequest(Strict):
    provider: Provider


def utc(value):
    return value.replace(tzinfo=timezone.utc) if value.tzinfo is None else value


def configured(settings, provider):
    return bool(
        getattr(settings, f"{provider}_client_id")
        and getattr(settings, f"{provider}_client_secret")
    )


def checked_json(response):
    if response.status_code != 200:
        raise HTTPException(
            401, "Social sign-in could not be verified. Please start again."
        )
    return response.json()


def exchange_code(provider, data, settings, verify_google):
    if not configured(settings, provider):
        raise HTTPException(503, "This sign-in provider is not configured yet.")
    allowed = {
        f"{origin.rstrip('/')}/api/account/oauth/{provider}/callback"
        for origin in settings.origins
        if origin
    }
    if data.redirect_uri not in allowed:
        raise HTTPException(400, "The sign-in callback is not allowed.")
    try:
        with httpx.Client(timeout=10, follow_redirects=False) as client:
            endpoint = (
                "https://oauth2.googleapis.com/token"
                if provider == "google"
                else "https://github.com/login/oauth/access_token"
            )
            result = checked_json(
                client.post(
                    endpoint,
                    headers={"Accept": "application/json"},
                    data={
                        "client_id": getattr(settings, f"{provider}_client_id"),
                        "client_secret": getattr(settings, f"{provider}_client_secret"),
                        "grant_type": "authorization_code",
                        "code": data.code,
                        "code_verifier": data.code_verifier,
                        "redirect_uri": data.redirect_uri,
                    },
                )
            )
            if provider == "google":
                claims = verify_google(
                    result.get("id_token", ""), settings.google_client_id
                )
                if not secrets.compare_digest(str(claims.get("nonce", "")), data.nonce):
                    raise HTTPException(
                        401, "Google sign-in could not be verified. Please start again."
                    )
                return str(claims["sub"]), str(claims["email"]).casefold()
            token = result.get("access_token")
            if (
                not isinstance(token, str)
                or not token
                or result.get("token_type", "").lower() != "bearer"
            ):
                raise HTTPException(
                    401, "GitHub sign-in could not be verified. Please start again."
                )
            headers = {
                "Authorization": f"Bearer {token}",
                "Accept": "application/vnd.github+json",
                "X-GitHub-Api-Version": "2026-03-10",
                "User-Agent": "NutritiScan",
            }
            user = checked_json(
                client.get("https://api.github.com/user", headers=headers)
            )
            emails = checked_json(
                client.get("https://api.github.com/user/emails", headers=headers)
            )
            subject = user.get("id")
            if type(subject) is not int or subject <= 0 or not isinstance(emails, list):
                raise HTTPException(401, "GitHub sign-in could not be verified.")
            address = next(
                (
                    e.get("email")
                    for e in emails
                    if isinstance(e, dict)
                    and e.get("primary") is True
                    and e.get("verified") is True
                ),
                None,
            )
            if (
                not isinstance(address, str)
                or address.count("@") != 1
                or len(address) > 254
            ):
                raise HTTPException(
                    409,
                    {
                        "code": "verified-email-required",
                        "message": "Add a verified primary email to your GitHub account, then retry.",
                    },
                )
            return str(subject), address.casefold()
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(
            503, "The sign-in provider could not be reached. Please retry."
        ) from exc


def social_account(db, settings, cipher, provider, subject, address, link_owner=None):
    identity_type = GoogleIdentity if provider == "google" else GitHubIdentity
    identity = db.get(identity_type, subject)
    if identity:
        if link_owner and identity.owner != link_owner:
            raise HTTPException(
                409, "This provider is already linked to another NutritiScan account."
            )
        user = db.get(Account, identity.owner)
        if not user:
            raise HTTPException(
                401, "This sign-in is no longer linked to an active account."
            )
        return user
    existing = db.scalar(
        select(Account).where(
            Account.email_index == email_index(address, settings.data_key)
        )
    )
    if link_owner:
        if existing and existing.id != link_owner:
            raise HTTPException(
                409,
                "This email belongs to another NutritiScan account. Accounts were not merged.",
            )
        user = db.get(Account, link_owner)
        if not user:
            raise HTTPException(401, "Sign in again before linking this provider.")
    elif existing:
        # Email matching is not permission to merge accounts or subscriptions.
        raise HTTPException(
            409,
            "Sign in with your current method, then link this provider in Account settings.",
        )
    else:
        user = Account(
            id=new_id(),
            email_index=email_index(address, settings.data_key),
            email_cipher=b"",
            password_hash=password_hash(secrets.token_urlsafe(48)),
        )
        user.email_cipher = cipher.seal(address, user.id)
        db.add(user)
        db.add(Consent(owner=user.id, storage=False, cloud_ai=False))
    db.add(identity_type(subject=subject, owner=user.id))
    return user


def install_social_routes(
    app, settings, cipher, db_session, account, rate_limit, verify_google
):
    @app.get("/auth/providers")
    def providers():
        return {
            p: {
                "configured": configured(settings, p),
                "client_id": getattr(settings, f"{p}_client_id"),
            }
            for p in ("google", "github")
        }

    @app.get("/auth/oauth/links")
    def links(user=Depends(account), db=Depends(db_session)):
        return {
            p: db.scalar(select(cls.subject).where(cls.owner == user.id).limit(1))
            is not None
            for p, cls in (("google", GoogleIdentity), ("github", GitHubIdentity))
        }

    @app.post("/auth/oauth/link-intent")
    def link_intent(
        data: LinkRequest,
        request: Request,
        user=Depends(account),
        db=Depends(db_session),
    ):
        rate_limit("oauth-link:" + user.id, 10)
        if not configured(settings, data.provider):
            raise HTTPException(503, "This sign-in provider is not configured yet.")
        _, session = authenticate(db, request.headers.get("authorization"))
        if utc(session.expires_at) - timedelta(days=7) < now() - timedelta(minutes=15):
            raise HTTPException(
                401, "Sign in again before linking another sign-in method."
            )
        ticket = secrets.token_urlsafe(32)
        db.execute(delete(OAuthLinkIntent).where(OAuthLinkIntent.expires_at <= now()))
        db.add(
            OAuthLinkIntent(
                token_hash=hashlib.sha256(ticket.encode()).hexdigest(),
                owner=user.id,
                session_hash=session.token_hash,
                provider=data.provider,
                expires_at=now() + timedelta(minutes=10),
            )
        )
        audit(db, user.id, "account.link_requested", data.provider)
        db.commit()
        return {"ticket": ticket}

    @app.post("/auth/oauth/{provider}")
    def oauth_login(
        provider: Provider, data: SocialCode, request: Request, db=Depends(db_session)
    ):
        rate_limit("auth:" + (request.client.host if request.client else "unknown"), 10)
        subject, address = exchange_code(provider, data, settings, verify_google)
        link_owner = None
        if data.link_ticket:
            digest = hashlib.sha256(data.link_ticket.encode()).hexdigest()
            intent = db.get(OAuthLinkIntent, digest)
            if (
                not intent
                or intent.provider != provider
                or utc(intent.expires_at) <= now()
            ):
                raise HTTPException(
                    401, "This account-link request has expired. Start again."
                )
            session = db.get(LoginSession, intent.session_hash)
            if (
                not session
                or session.owner != intent.owner
                or utc(session.expires_at) <= now()
            ):
                raise HTTPException(401, "Sign in again before linking this provider.")
            link_owner = intent.owner
            removed = db.execute(
                delete(OAuthLinkIntent).where(OAuthLinkIntent.token_hash == digest)
            )
            if removed.rowcount != 1:
                raise HTTPException(401, "This account-link request was already used.")
        user = social_account(
            db, settings, cipher, provider, subject, address, link_owner
        )
        result = start_session(db, user)
        audit(
            db,
            user.id,
            "account.provider_linked" if link_owner else "account.social_login",
            provider,
        )
        try:
            db.commit()
        except IntegrityError as exc:
            db.rollback()
            raise HTTPException(
                409, "Unable to finish sign-in. Please retry with your current method."
            ) from exc
        return result
