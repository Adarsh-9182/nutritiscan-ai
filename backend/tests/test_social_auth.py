from datetime import timedelta
from unittest.mock import MagicMock

import httpx
import pytest
from fastapi import HTTPException
from fastapi.testclient import TestClient
from sqlalchemy import select

from nutritiscan.app import create_app
from nutritiscan.config import Settings
from nutritiscan.database import LoginSession, now
from nutritiscan.social import SocialCode, exchange_code


@pytest.fixture
def api(tmp_path):
    settings = Settings(
        database_url=f"sqlite:///{tmp_path}/social.db",
        data_key="ab" * 32,
        object_dir=str(tmp_path / "docs"),
        google_client_id="test-google-client",
        google_client_secret="synthetic-google-secret",
        github_client_id="test-github-client",
        github_client_secret="synthetic-github-secret",
    )
    with TestClient(create_app(settings)) as client:
        yield client, settings


def payload(**extra):
    return {
        "code": "synthetic-code",
        "code_verifier": "v" * 43,
        "nonce": "n" * 43,
        "redirect_uri": "http://localhost:3000/api/account/oauth/github/callback",
        **extra,
    }


def mock_identity(monkeypatch, subject="12345", email="synthetic@example.test"):
    monkeypatch.setattr("nutritiscan.social.exchange_code", lambda *_: (subject, email))


def register(client, email="synthetic@example.test"):
    r = client.post(
        "/auth/register", json={"email": email, "password": "synthetic-long-password"}
    )
    assert r.status_code == 201
    return r.json()


def test_providers_expose_readiness_without_secrets(api):
    client, _ = api
    r = client.get("/auth/providers")
    assert r.json()["github"] == {"configured": True, "client_id": "test-github-client"}
    assert "secret" not in r.text


def test_github_signin_reuses_stable_identity_with_default_private_consents(
    api, monkeypatch
):
    client, _ = api
    mock_identity(monkeypatch)
    first = client.post("/auth/oauth/github", json=payload()).json()
    second = client.post("/auth/oauth/github", json=payload()).json()
    assert first["user_id"] == second["user_id"]
    headers = {"Authorization": f"Bearer {second['access_token']}"}
    assert client.get("/consent", headers=headers).json()["storage"] is False
    assert client.get("/auth/oauth/links", headers=headers).json() == {
        "google": False,
        "github": True,
    }
    assert (
        client.request(
            "DELETE",
            "/account",
            headers=headers,
            json={"confirmation": "DELETE MY HEALTH DATA"},
        ).status_code
        == 204
    )
    assert client.get("/consent", headers=headers).status_code == 401


def test_matching_email_does_not_merge_or_grant_access(api, monkeypatch):
    client, _ = api
    register(client)
    mock_identity(monkeypatch)
    r = client.post("/auth/oauth/github", json=payload())
    assert r.status_code == 409
    assert "access_token" not in r.json()


def test_explicit_link_preserves_account_and_is_one_use(api, monkeypatch):
    client, _ = api
    owner = register(client)
    headers = {"Authorization": f"Bearer {owner['access_token']}"}
    ticket = client.post(
        "/auth/oauth/link-intent", headers=headers, json={"provider": "github"}
    ).json()["ticket"]
    mock_identity(monkeypatch)
    linked = client.post("/auth/oauth/github", json=payload(link_ticket=ticket))
    assert linked.status_code == 200
    assert linked.json()["user_id"] == owner["user_id"]
    assert (
        client.post("/auth/oauth/github", json=payload(link_ticket=ticket)).status_code
        == 401
    )


def test_revoked_session_cannot_authorize_provider_link(api, monkeypatch):
    client, _ = api
    owner = register(client)
    headers = {"Authorization": f"Bearer {owner['access_token']}"}
    ticket = client.post(
        "/auth/oauth/link-intent", headers=headers, json={"provider": "github"}
    ).json()["ticket"]
    assert client.post("/auth/logout", headers=headers).status_code == 204
    mock_identity(monkeypatch)
    assert (
        client.post("/auth/oauth/github", json=payload(link_ticket=ticket)).status_code
        == 401
    )


def test_link_requires_recent_signin(api):
    client, _ = api
    owner = register(client)
    with client.app.state.factory() as db:
        session = db.scalar(
            select(LoginSession).where(LoginSession.owner == owner["user_id"])
        )
        session.expires_at = now() + timedelta(days=6)
        db.commit()
    r = client.post(
        "/auth/oauth/link-intent",
        headers={"Authorization": f"Bearer {owner['access_token']}"},
        json={"provider": "github"},
    )
    assert r.status_code == 401


def test_link_never_transfers_an_existing_provider_identity(api, monkeypatch):
    client, _ = api
    mock_identity(monkeypatch, "12345", "first@example.test")
    first = client.post("/auth/oauth/github", json=payload()).json()
    second = register(client, "second@example.test")
    ticket = client.post(
        "/auth/oauth/link-intent",
        headers={"Authorization": f"Bearer {second['access_token']}"},
        json={"provider": "github"},
    ).json()["ticket"]
    r = client.post("/auth/oauth/github", json=payload(link_ticket=ticket))
    assert r.status_code == 409
    assert (
        client.post("/auth/oauth/github", json=payload()).json()["user_id"]
        == first["user_id"]
    )


def test_exchange_validates_callback_before_contacting_provider(api, monkeypatch):
    _, settings = api
    http = MagicMock()
    monkeypatch.setattr("nutritiscan.social.httpx.Client", http)
    with pytest.raises(HTTPException) as failure:
        exchange_code(
            "github",
            SocialCode(**payload(redirect_uri="https://evil.example/callback")),
            settings,
            None,
        )
    assert failure.value.status_code == 400
    http.assert_not_called()


def test_github_exchange_requires_verified_primary_email_and_uses_pkce(
    api, monkeypatch
):
    _, settings = api
    http = MagicMock()
    http.post.return_value = httpx.Response(
        200, json={"access_token": "synthetic-token", "token_type": "bearer"}
    )
    http.get.side_effect = [
        httpx.Response(200, json={"id": 12345}),
        httpx.Response(
            200,
            json=[
                {"email": "synthetic@example.test", "primary": True, "verified": False}
            ],
        ),
    ]
    constructor = MagicMock()
    constructor.return_value.__enter__.return_value = http
    monkeypatch.setattr("nutritiscan.social.httpx.Client", constructor)
    with pytest.raises(HTTPException) as failure:
        exchange_code("github", SocialCode(**payload()), settings, None)
    assert failure.value.status_code == 409
    assert http.post.call_args.kwargs["data"]["code_verifier"] == "v" * 43


def test_google_exchange_rejects_wrong_nonce(api, monkeypatch):
    _, settings = api
    http = MagicMock()
    http.post.return_value = httpx.Response(
        200, json={"id_token": "synthetic-id-token"}
    )
    constructor = MagicMock()
    constructor.return_value.__enter__.return_value = http
    monkeypatch.setattr("nutritiscan.social.httpx.Client", constructor)
    claims = {
        "sub": "google-123",
        "email": "synthetic@gmail.com",
        "nonce": "wrong-nonce",
    }
    with pytest.raises(HTTPException) as failure:
        exchange_code(
            "google",
            SocialCode(
                **payload(
                    redirect_uri="http://localhost:3000/api/account/oauth/google/callback"
                )
            ),
            settings,
            lambda *_: claims,
        )
    assert failure.value.status_code == 401
