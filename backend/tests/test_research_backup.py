from copy import deepcopy

import pytest
from test_health_api import api as api, user
from nutritiscan.database import ResearchWorkspace

SNAPSHOT = {"format": "nutritiscan-research", "version": 1, "exportedAt": "2026-11-02T10:00:00Z", "threads": []}


def save(api, headers, revision=None, backup=None):
    return api.put("/research/backup", headers=headers, json={"revision": revision, "consent": True, "backup": backup or SNAPSHOT})


def test_research_requires_auth_and_explicit_research_storage_choice(api):
    assert api.get("/research/backup").status_code == 401
    headers = user(api, consent=False)
    assert api.get("/research/backup", headers=headers).json()["backup"] is None
    rejected = api.put("/research/backup", headers=headers, json={"revision": None, "consent": False, "backup": SNAPSHOT})
    assert rejected.status_code == 400
    assert save(api, headers).status_code == 200
    assert api.get("/consent", headers=headers).json()["storage"] is False


def test_backup_is_encrypted_and_owner_scoped(api):
    first = user(api, consent=False)
    result = save(api, first)
    assert result.status_code == 200
    token = result.json()["revision"]
    second = user(api, "second-research@example.test", consent=False)
    assert api.get("/research/backup", headers=second).json()["backup"] is None
    assert save(api, second, token).status_code == 409
    loaded = api.get("/research/backup", headers=first)
    assert loaded.json()["backup"]["format"] == "nutritiscan-research"
    assert "no-store" in loaded.headers["cache-control"]
    with api.app.state.factory() as db:
        row = db.query(ResearchWorkspace).first()
        assert b"nutritiscan-research" not in row.cipher
        with pytest.raises(Exception):
            api.app.state.cipher.open(row.cipher, "a-different-owner:research:v1")


def test_conflicting_updates_and_deleted_backup_cannot_be_silently_overwritten(api):
    headers = user(api)
    first = save(api, headers).json()["revision"]
    next_token = save(api, headers, first).json()["revision"]
    assert next_token != first
    assert save(api, headers, first).status_code == 409
    deleted = api.request("DELETE", "/research/backup", headers=headers, json={"revision": next_token})
    assert deleted.status_code == 200 and deleted.json()["backup"] is None
    assert save(api, headers, None).status_code == 409
    assert save(api, headers, next_token).status_code == 409
    assert save(api, headers, deleted.json()["revision"]).status_code == 200


def test_account_deletion_erases_research_backup_and_revokes_access(api):
    headers = user(api)
    assert save(api, headers).status_code == 200
    removed = api.request("DELETE", "/account", headers=headers, json={"password": "a-long-test-password", "confirmation": "DELETE MY HEALTH DATA"})
    assert removed.status_code == 204
    assert api.get("/research/backup", headers=headers).status_code == 401
    with api.app.state.factory() as db:
        assert db.query(ResearchWorkspace).count() == 0


def test_invalid_versions_nan_and_oversized_payloads_are_rejected(api):
    headers = user(api)
    assert save(api, headers, backup={**SNAPSHOT, "version": 2}).status_code == 400
    oversized = deepcopy(SNAPSHOT)
    oversized["threads"] = [{"text": "x" * 1_050_000}]
    assert save(api, headers, backup=oversized).status_code == 413
    nan_body = '{"revision":null,"consent":true,"backup":{"format":"nutritiscan-research","version":1,"exportedAt":"2026-11-02T10:00:00Z","threads":[{"number":NaN}]}}'
    assert api.put("/research/backup", headers={**headers, "content-type": "application/json"}, content=nan_body).status_code == 400
