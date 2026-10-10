from io import BytesIO

import pytest
from fastapi.testclient import TestClient
from nutritiscan.app import create_app
from nutritiscan.config import Settings
from nutritiscan.database import Conversation, Resource
from nutritiscan.fhir import normalized_observation
from pypdf import PdfWriter
from sqlalchemy import select


@pytest.fixture
def api(tmp_path):
    settings = Settings(
        database_url=f"sqlite:///{tmp_path}/test.db",
        data_key="ab" * 32,
        object_dir=str(tmp_path / "documents"),
        google_client_id="test-google-client",
    )
    with TestClient(create_app(settings)) as client:
        yield client


def user(api, email="first@example.test", consent=True):
    response = api.post(
        "/auth/register",
        json={"email": email, "password": "a-long-test-password"},
    )
    assert response.status_code == 201, response.text
    token = response.json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}
    if consent:
        assert (
            api.put(
                "/consent", headers=headers, json={"storage": True, "cloud_ai": False}
            ).status_code
            == 200
        )
    return headers


def test_status_reports_database_and_storage_readiness(api):
    response = api.get("/status")
    assert response.status_code == 200
    assert response.json()["database"] == "connected"
    assert response.json()["document_storage"] == "local_only"


def test_registration_does_not_require_an_age_attestation(api):
    response = api.post(
        "/auth/register",
        json={"email": "all-ages@example.test", "password": "a-long-test-password"},
    )
    assert response.status_code == 201, response.text


def test_legacy_age_field_is_accepted_but_not_required(api):
    response = api.post(
        "/auth/register",
        json={"email": "legacy-client@example.test", "password": "a-long-test-password", "adult": False},
    )
    assert response.status_code == 201, response.text


def test_google_sign_in_creates_then_reuses_provider_identity(api, monkeypatch):
    claims = {
        "iss": "https://accounts.google.com",
        "aud": "test-google-client",
        "sub": "google-subject-123",
        "email": "scan.user@gmail.com",
        "email_verified": True,
    }
    monkeypatch.setattr("nutritiscan.app.verify_google_credential", lambda credential, client_id: claims)
    first = api.post("/auth/google", json={"credential": "x" * 120})
    assert first.status_code == 200, first.text
    first_user = first.json()["user_id"]
    second = api.post("/auth/google", json={"credential": "x" * 120})
    assert second.status_code == 200, second.text
    assert second.json()["user_id"] == first_user
    headers = {"Authorization": f"Bearer {second.json()['access_token']}"}
    consent = api.get("/consent", headers=headers).json()
    assert consent["storage"] is False and consent["cloud_ai"] is False


def test_google_sign_in_does_not_merge_untrusted_existing_email(api, monkeypatch):
    user(api, "patient@outside.test", consent=False)
    claims = {
        "iss": "https://accounts.google.com",
        "aud": "test-google-client",
        "sub": "unlinked-subject",
        "email": "patient@outside.test",
        "email_verified": True,
    }
    monkeypatch.setattr("nutritiscan.app.verify_google_credential", lambda credential, client_id: claims)
    response = api.post("/auth/google", json={"credential": "x" * 120})
    assert response.status_code == 409


def test_google_only_account_can_be_deleted_after_recent_sign_in(api, monkeypatch):
    claims = {
        "iss": "https://accounts.google.com",
        "aud": "test-google-client",
        "sub": "deletable-google-user",
        "email": "delete.me@gmail.com",
        "email_verified": True,
    }
    monkeypatch.setattr("nutritiscan.app.verify_google_credential", lambda credential, client_id: claims)
    login = api.post("/auth/google", json={"credential": "x" * 120}).json()
    response = api.request(
        "DELETE",
        "/account",
        headers={"Authorization": f"Bearer {login['access_token']}"},
        json={"confirmation": "DELETE MY HEALTH DATA"},
    )
    assert response.status_code == 204


def measurement(value=13.2, unit="g/dL", measured_at="2026-07-01"):
    return {
        "name": "Hemoglobin",
        "value": value,
        "unit": unit,
        "measured_at": measured_at,
    }


def pdf():
    writer = PdfWriter()
    writer.add_blank_page(width=200, height=200)
    result = BytesIO()
    writer.write(result)
    return result.getvalue()


def test_consent_required_and_revocation_keeps_export(api):
    headers = user(api, consent=False)
    assert api.get("/records", headers=headers).status_code == 403
    assert (
        api.post("/observations", headers=headers, json=measurement()).status_code
        == 403
    )
    assert api.get("/export", headers=headers).status_code == 200
    assert api.get("/records").status_code == 401


def test_units_and_exact_trend(api):
    headers = user(api)
    for data in [measurement(132, "g/L"), measurement(14, "g/dL", "2026-08-01")]:
        assert api.post("/observations", headers=headers, json=data).status_code == 201
    trend = api.get("/trends?name=Hemoglobin", headers=headers).json()
    assert [p["value"] for p in trend["series"][0]["points"]] == [13.2, 14]
    assert trend["series"][0]["unit"] == "g/dL"
    answer = api.post(
        "/chat", headers=headers, json={"message": "Mera hemoglobin ka trend kya hai?"}
    ).json()
    assert answer["tool"] == "lab_analysis"
    assert [p["value"] for p in answer["chart"]["points"]] == [13.2, 14]
    assert len(answer["citations"]) == 2
    assert api.get("/conversations", headers=headers).json()["conversations"][0][
        "turns"
    ][-1]["chart"]


def test_unknown_units_not_combined(api):
    headers = user(api)
    for unit in ("g/dL", "mmol/L"):
        api.post("/observations", headers=headers, json=measurement(unit=unit))
    assert (
        len(api.get("/trends?name=Hemoglobin", headers=headers).json()["series"]) == 2
    )
    assert (
        api.post("/chat", headers=headers, json={"message": "hemoglobin trend"}).json()[
            "chart"
        ]
        is None
    )


def test_patient_isolation_and_no_cross_account_conversation(api):
    first = user(api)
    second = user(api, "second@example.test")
    record = api.post("/observations", headers=first, json=measurement()).json()
    assert api.get("/records", headers=second).json()["records"] == []
    assert api.delete(f"/records/{record['id']}", headers=second).status_code == 404
    answer = api.post(
        "/chat", headers=first, json={"message": "health timeline"}
    ).json()
    assert (
        api.post(
            "/chat",
            headers=second,
            json={"message": "hello", "conversation_id": answer["conversation_id"]},
        ).status_code
        == 404
    )


def test_report_draft_confirmation_and_original_access(api):
    first = user(api)
    second = user(api, "second@example.test")
    uploaded = api.post(
        "/documents",
        headers=first,
        files={"file": ("blood.pdf", pdf(), "application/pdf")},
    )
    assert uploaded.status_code == 201
    doc_id = uploaded.json()["id"]
    assert api.get("/records", headers=first).json()["records"] == []
    assert api.get(f"/documents/{doc_id}/original", headers=second).status_code == 404
    assert api.get(f"/documents/{doc_id}/original", headers=first).content == pdf()
    draft = api.get("/documents", headers=first).json()["documents"][0]
    assert draft["status"] == "review"
    assert draft["needs_ocr"] is True
    assert (
        api.post(
            f"/documents/{doc_id}/confirm",
            headers=first,
            json={"compared_with_original": False, "observations": [measurement()]},
        ).status_code
        == 422
    )
    confirm = {"compared_with_original": True, "observations": [measurement()]}
    result = api.post(f"/documents/{doc_id}/confirm", headers=first, json=confirm)
    assert result.status_code == 200
    assert (
        result.json()["observations"][0]["derivedFrom"][0]["reference"]
        == f"DocumentReference/{doc_id}"
    )
    assert (
        api.post(
            f"/documents/{doc_id}/confirm", headers=first, json=confirm
        ).status_code
        == 409
    )
    assert len(api.get("/records", headers=first).json()["records"]) == 3
    assert api.delete(f"/documents/{doc_id}", headers=second).status_code == 404
    assert api.delete(f"/documents/{doc_id}", headers=first).status_code == 204
    assert api.get("/records", headers=first).json()["records"] == []


def test_encrypted_record_and_conversation_storage(api):
    headers = user(api)
    api.post(
        "/records",
        headers=headers,
        json={"kind": "allergy", "title": "Secret allergy", "date": "2026-07-01"},
    )
    api.post("/chat", headers=headers, json={"message": "Secret conversation"})
    with api.app.state.factory() as db:
        r = db.scalar(select(Resource))
        c = db.scalar(select(Conversation))
        assert b"Secret" not in r.cipher and b"Secret" not in c.cipher
        with pytest.raises(Exception):
            api.app.state.cipher.open(r.cipher, "another-patient")


def test_emergency_and_medication_boundaries(api):
    headers = user(api)
    for question in (
        "I have chest pain",
        "saans nahi aa rahi",
        "I want to kill myself",
    ):
        answer = api.post("/chat", headers=headers, json={"message": question}).json()
        assert answer["tool"] == "urgent_care"
        assert "112" in answer["text"]
        assert answer["citations"] == []
    answer = api.post(
        "/chat",
        headers=headers,
        json={"message": "Should I increase my medicine dose?"},
    ).json()
    assert answer["tool"] == "medication" and "pharmacist" in answer["text"]


def test_export_after_revocation_delete_and_logout(api):
    headers = user(api)
    api.post("/observations", headers=headers, json=measurement())
    assert (
        api.put(
            "/consent", headers=headers, json={"storage": False, "cloud_ai": False}
        ).status_code
        == 200
    )
    assert api.get("/records", headers=headers).status_code == 403
    assert (
        api.get("/export", headers=headers).json()["fhir"]["entry"][0]["resource"][
            "resourceType"
        ]
        == "Observation"
    )
    assert (
        api.request(
            "DELETE",
            "/account",
            headers=headers,
            json={"password": "wrong", "confirmation": "DELETE MY HEALTH DATA"},
        ).status_code
        == 401
    )
    assert (
        api.request(
            "DELETE",
            "/account",
            headers=headers,
            json={
                "password": "a-long-test-password",
                "confirmation": "DELETE MY HEALTH DATA",
            },
        ).status_code
        == 204
    )
    assert api.get("/export", headers=headers).status_code == 401


def test_validation_and_voice_consent(api):
    headers = user(api)
    assert (
        api.post("/observations", headers=headers, json=measurement(-1)).status_code
        == 422
    )
    assert (
        api.post(
            "/observations", headers=headers, json=measurement(measured_at="2099-01-01")
        ).status_code
        == 422
    )
    assert (
        api.post(
            "/documents",
            headers=headers,
            files={"file": ("fake.pdf", b"not a PDF", "application/pdf")},
        ).status_code
        == 415
    )
    assert (
        api.post(
            "/voice",
            headers=headers,
            files={"file": ("test.m4a", b"audio", "audio/mp4")},
        ).status_code
        == 403
    )


def test_normalization_preserves_original_and_ranges():
    item = {**measurement(120, "g/L"), "reference_low": 110, "reference_high": 150}
    result = normalized_observation(item)
    assert (
        result["value"] == 12
        and result["reference_low"] == 11
        and result["reference_high"] == 15
    )
    assert item["value"] == 120
