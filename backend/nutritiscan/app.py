import hashlib
import secrets
import threading
import time
from contextlib import asynccontextmanager
from io import BytesIO
from pathlib import Path

from fastapi import (
    BackgroundTasks,
    Depends,
    FastAPI,
    File,
    HTTPException,
    Query,
    Request,
    Response,
    UploadFile,
)
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import delete, select
from sqlalchemy.exc import IntegrityError

from .auth import (
    authenticate,
    email_index,
    password_hash,
    password_valid,
    start_session,
)
from .config import Settings
from .database import (
    Account,
    Audit,
    Base,
    Cipher,
    Consent,
    Conversation,
    Document,
    LoginSession,
    Resource,
    audit,
    connect,
    new_id,
    now,
)
from .fhir import label, observation, record, resource_date
from .jobs import configure_jobs, extract_job, process_document
from .schemas import (
    ChatInput,
    ConfirmInput,
    ConsentInput,
    Credentials,
    DeleteInput,
    ObservationInput,
    RecordInput,
)
from .storage import DocumentStorage
from .supervisor import supervisor

MAX_UPLOAD = 10 * 1024 * 1024


def create_app(settings=None):
    settings = settings or Settings.from_env()
    engine, factory = connect(settings)
    cipher = Cipher(settings.data_key)
    storage = DocumentStorage(settings, cipher)
    configure_jobs(settings)

    @asynccontextmanager
    async def lifespan(app):
        # Production schema changes are applied explicitly with `python -m ...migrate`.
        if settings.environment != "production":
            Base.metadata.create_all(engine)
        yield
        engine.dispose()

    app = FastAPI(title="NutritiScan Health API", version="1.0.0", lifespan=lifespan)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=list(settings.origins),
        allow_methods=["GET", "POST", "PUT", "DELETE"],
        allow_headers=["Authorization", "Content-Type"],
        allow_credentials=False,
    )
    app.state.factory, app.state.cipher, app.state.storage = factory, cipher, storage
    # Local limiter for development. Production also uses the ingress's global
    # limiter; Redis below shares counters across API workers.
    buckets = {}
    lock = threading.Lock()

    def rate_limit(key, limit):
        if settings.redis_url:
            from redis import Redis

            try:
                redis = Redis.from_url(settings.redis_url, socket_timeout=2)
                k = (
                    "nutritiscan:limit:"
                    + hashlib.sha256(key.encode()).hexdigest()
                    + ":"
                    + str(int(time.time() // 60))
                )
                count = redis.incr(k)
                if count == 1:
                    redis.expire(k, 65)
            except Exception:
                raise HTTPException(
                    503, "The request limiter is unavailable. Please try later."
                )
        else:
            with lock:
                minute = int(time.time() // 60)
                for k in list(buckets):
                    if buckets[k][0] != minute:
                        del buckets[k]
                if len(buckets) > 10000:
                    raise HTTPException(503, "Please try again later.")
                previous = buckets.get(key, (minute, 0))
                count = previous[1] + 1
                buckets[key] = (minute, count)
        if count > limit:
            raise HTTPException(
                429,
                "Too many requests. Try again in a minute.",
                headers={"Retry-After": "60"},
            )

    def db_session():
        with factory() as db:
            yield db

    def account(request: Request, db=Depends(db_session)):
        user, _ = authenticate(db, request.headers.get("authorization"))
        rate_limit("account:" + user.id, 120)
        return user

    def permitted(user=Depends(account), db=Depends(db_session)):
        consent = db.get(Consent, user.id)
        if not consent or not consent.storage:
            raise HTTPException(
                403,
                "Health storage consent is required. You can still export or delete your existing data.",
            )
        return user

    def owned(db, model, item_id, owner):
        item = db.scalar(select(model).where(model.id == item_id, model.owner == owner))
        if not item:
            raise HTTPException(404, "Record not found.")
        return item

    def save_resource(db, user, data, source_id=None):
        db.add(
            Resource(
                id=data["id"],
                owner=user.id,
                kind=data["resourceType"],
                cipher=cipher.seal(data, user.id),
                source_id=source_id,
            )
        )

    def read_resources(db, owner):
        return [
            cipher.open(r.cipher, owner)
            for r in db.scalars(
                select(Resource)
                .where(Resource.owner == owner)
                .order_by(Resource.created_at)
            ).all()
        ]

    def document_json(doc):
        data = cipher.open(doc.cipher, doc.owner)
        return {
            "id": doc.id,
            "status": doc.status,
            "created_at": doc.created_at.isoformat(),
            **data,
        }

    @app.middleware("http")
    async def security(request, call_next):
        # Never log message text, authorization, filenames or clinical values.
        response = await call_next(request)
        response.headers.update(
            {
                "Cache-Control": "no-store",
                "X-Content-Type-Options": "nosniff",
                "Referrer-Policy": "no-referrer",
            }
        )
        return response

    @app.get("/status")
    def status():
        return {
            "status": "ok",
            "api_version": "1.0.0",
            "fhir_version": "5.0.0",
            "clinical_validation": "not_completed",
            "cloud_ai": settings.model_approved and bool(settings.provider_key),
            "voice": settings.model_approved
            and settings.provider == "openai"
            and bool(settings.provider_key),
        }

    @app.post("/auth/register", status_code=201)
    def register(data: Credentials, request: Request, db=Depends(db_session)):
        rate_limit("auth:" + (request.client.host if request.client else "unknown"), 10)
        if not data.adult:
            raise HTTPException(
                400, "This prototype is for adults 18+. Confirm your age to continue."
            )
        user = Account(
            email_index=email_index(data.email, settings.data_key),
            email_cipher=b"",
            password_hash=password_hash(data.password),
        )
        user.id = new_id()
        user.email_cipher = cipher.seal(data.email, user.id)
        db.add(user)
        db.add(Consent(owner=user.id, storage=False, cloud_ai=False))
        result = start_session(db, user)
        audit(db, user.id, "account.created")
        try:
            db.commit()
        except IntegrityError:
            db.rollback()
            raise HTTPException(
                409,
                "Unable to create this account. Try signing in or use another email.",
            )
        return result

    @app.post("/auth/login")
    def login(data: Credentials, request: Request, db=Depends(db_session)):
        rate_limit("auth:" + (request.client.host if request.client else "unknown"), 10)
        user = db.scalar(
            select(Account).where(
                Account.email_index == email_index(data.email, settings.data_key)
            )
        )
        # Run the same costly hash for an unknown account to reduce timing leakage.
        stored = (
            user.password_hash if user else password_hash(secrets.token_urlsafe(16))
        )
        if not password_valid(data.password, stored) or not user:
            raise HTTPException(401, "Email or password is incorrect.")
        result = start_session(db, user)
        audit(db, user.id, "account.login")
        db.commit()
        return result

    @app.post("/auth/logout", status_code=204)
    def logout(request: Request, user=Depends(account), db=Depends(db_session)):
        _, login = authenticate(db, request.headers.get("authorization"))
        db.delete(login)
        audit(db, user.id, "account.logout")
        db.commit()
        return Response(status_code=204)

    @app.get("/consent")
    def get_consent(user=Depends(account), db=Depends(db_session)):
        c = db.get(Consent, user.id)
        return {
            "storage": c.storage,
            "cloud_ai": c.cloud_ai,
            "version": c.version,
            "training": False,
        }

    @app.put("/consent")
    def set_consent(data: ConsentInput, user=Depends(account), db=Depends(db_session)):
        if data.cloud_ai and not data.storage:
            raise HTTPException(
                400, "Cloud AI consent requires health storage consent."
            )
        consent = db.get(Consent, user.id)
        consent.storage, consent.cloud_ai, consent.version, consent.updated_at = (
            data.storage,
            data.cloud_ai,
            data.version,
            now(),
        )
        audit(db, user.id, "consent.updated")
        db.commit()
        return {**data.model_dump(), "training": False}

    @app.get("/records")
    def records(user=Depends(permitted), db=Depends(db_session)):
        audit(db, user.id, "records.read")
        result = read_resources(db, user.id)
        db.commit()
        return {"records": result}

    @app.post("/records", status_code=201)
    def add_record(data: RecordInput, user=Depends(permitted), db=Depends(db_session)):
        result = record(data, user.id)
        save_resource(db, user, result)
        audit(db, user.id, "record.created", result["id"])
        db.commit()
        return result

    @app.post("/observations", status_code=201)
    def add_observation(
        data: ObservationInput, user=Depends(permitted), db=Depends(db_session)
    ):
        result = observation(data, user.id)
        save_resource(db, user, result)
        audit(db, user.id, "observation.created", result["id"])
        db.commit()
        return result

    @app.delete("/records/{resource_id}", status_code=204)
    def remove_record(
        resource_id: str, user=Depends(permitted), db=Depends(db_session)
    ):
        item = owned(db, Resource, resource_id, user.id)
        # Linked report confirmation is a batch; edit the source instead of leaving
        # a DiagnosticReport pointing to a missing Observation.
        if item.source_id:
            raise HTTPException(
                409,
                "This measurement belongs to a confirmed report. Remove the report to remove its linked measurements.",
            )
        db.delete(item)
        audit(db, user.id, "record.deleted", resource_id)
        db.commit()
        return Response(status_code=204)

    @app.get("/timeline")
    def timeline(user=Depends(permitted), db=Depends(db_session)):
        rows = sorted(read_resources(db, user.id), key=resource_date, reverse=True)
        return {
            "items": [
                {
                    "id": r["id"],
                    "kind": r["resourceType"],
                    "title": label(r),
                    "date": resource_date(r),
                    "quantity": r.get("valueQuantity"),
                }
                for r in rows
            ]
        }

    @app.get("/trends")
    def trends(
        name: str = Query(min_length=1, max_length=120),
        user=Depends(permitted),
        db=Depends(db_session),
    ):
        rows = [
            r
            for r in read_resources(db, user.id)
            if r["resourceType"] == "Observation"
            and "valueQuantity" in r
            and label(r).casefold() == name.casefold()
        ]
        series = {}
        for r in sorted(rows, key=resource_date):
            q = r["valueQuantity"]
            series.setdefault(q["unit"], []).append(
                {"date": resource_date(r), "value": q["value"], "source_id": r["id"]}
            )
        return {
            "name": name,
            "series": [
                {"unit": unit, "points": points} for unit, points in series.items()
            ],
            "uncertainty": "Recorded measurements; a trend is not a diagnosis.",
        }

    @app.post("/documents", status_code=201)
    async def upload(
        background: BackgroundTasks,
        file: UploadFile = File(),
        user=Depends(permitted),
        db=Depends(db_session),
    ):
        data = await file.read(MAX_UPLOAD + 1)
        await file.close()
        if not data or len(data) > MAX_UPLOAD:
            raise HTTPException(413, "Use a report smaller than 10 MB.")
        mime = (
            "application/pdf"
            if data.startswith(b"%PDF-")
            else "image/png"
            if data.startswith(b"\x89PNG\r\n\x1a\n")
            else "image/jpeg"
            if data.startswith(b"\xff\xd8\xff")
            else ""
        )
        if not mime:
            raise HTTPException(415, "Upload a PDF, PNG or JPEG report.")
        doc_id = new_id()
        key = f"{user.id}/{doc_id}.enc"
        metadata = {
            "filename": Path(file.filename or "report").name[:180],
            "mime": mime,
            "sha256": hashlib.sha256(data).hexdigest(),
            "candidates": [],
            "pages": [],
        }
        storage.put(key, data, user.id)
        doc = Document(
            id=doc_id,
            owner=user.id,
            cipher=cipher.seal(metadata, user.id),
            object_key=key,
            status="queued",
        )
        db.add(doc)
        audit(db, user.id, "document.uploaded", doc_id)
        try:
            db.commit()
        except Exception:
            db.rollback()
            storage.delete(key)
            raise
        if settings.redis_url:
            try:
                extract_job.delay(doc_id)
            except Exception:
                doc.status = "manual_review"
                db.commit()
        else:
            background.add_task(process_document, factory, cipher, storage, doc_id)
        return document_json(doc)

    @app.get("/documents")
    def documents(user=Depends(permitted), db=Depends(db_session)):
        return {
            "documents": [
                document_json(d)
                for d in db.scalars(
                    select(Document)
                    .where(Document.owner == user.id)
                    .order_by(Document.created_at.desc())
                ).all()
            ]
        }

    @app.get("/documents/{doc_id}/original")
    def original(doc_id: str, user=Depends(account), db=Depends(db_session)):
        doc = owned(db, Document, doc_id, user.id)
        meta = cipher.open(doc.cipher, user.id)
        audit(db, user.id, "document.downloaded", doc_id)
        db.commit()
        return Response(
            storage.get(doc.object_key, user.id),
            media_type=meta["mime"],
            headers={"Content-Disposition": 'inline; filename="health-report"'},
        )

    @app.post("/documents/{doc_id}/confirm")
    def confirm(
        doc_id: str, data: ConfirmInput, user=Depends(permitted), db=Depends(db_session)
    ):
        # Lock a source so concurrent confirmations cannot insert duplicate truths.
        doc = db.scalar(
            select(Document)
            .where(Document.id == doc_id, Document.owner == user.id)
            .with_for_update()
        )
        if not doc:
            raise HTTPException(404, "Record not found.")
        if doc.status == "confirmed":
            raise HTTPException(409, "This report is already confirmed.")
        if doc.status not in ("review", "manual_review"):
            raise HTTPException(409, "Wait for report extraction to finish.")
        meta = cipher.open(doc.cipher, user.id)
        items = [observation(item, user.id, doc_id) for item in data.observations]
        document_ref = {
            "resourceType": "DocumentReference",
            "id": doc_id,
            "status": "current",
            "subject": {"reference": f"Patient/{user.id}"},
            "content": [
                {
                    "attachment": {
                        "contentType": meta["mime"],
                        "url": f"/documents/{doc_id}/original",
                        "title": meta["filename"],
                    }
                }
            ],
        }
        report = {
            "resourceType": "DiagnosticReport",
            "id": new_id(),
            "status": "final",
            "subject": {"reference": f"Patient/{user.id}"},
            "code": {"text": meta["filename"]},
            "result": [{"reference": f"Observation/{item['id']}"} for item in items],
        }
        for item in [document_ref, report, *items]:
            save_resource(db, user, item, doc_id)
        doc.status = "confirmed"
        meta["confirmed_at"] = now().isoformat()
        meta["confirmed_measurements"] = data.model_dump(mode="json")["observations"]
        doc.cipher = cipher.seal(meta, user.id)
        audit(db, user.id, "document.confirmed", doc_id)
        db.commit()
        return {
            "observations": items,
            "document": document_ref,
            "diagnostic_report": report,
        }

    @app.delete("/documents/{doc_id}", status_code=204)
    def remove_document(doc_id: str, user=Depends(account), db=Depends(db_session)):
        doc = owned(db, Document, doc_id, user.id)
        storage.delete(doc.object_key)
        db.execute(
            delete(Resource).where(
                Resource.owner == user.id, Resource.source_id == doc_id
            )
        )
        db.delete(doc)
        audit(db, user.id, "document.deleted", doc_id)
        db.commit()
        return Response(status_code=204)

    @app.post("/chat")
    async def chat(data: ChatInput, user=Depends(permitted), db=Depends(db_session)):
        rate_limit("chat:" + user.id, 20)
        conversation = (
            owned(db, Conversation, data.conversation_id, user.id)
            if data.conversation_id
            else None
        )
        history = (
            cipher.open(conversation.cipher, user.id)
            if conversation
            else {"title": data.message[:80], "turns": []}
        )
        consent = db.get(Consent, user.id)
        result = await supervisor.ainvoke(
            {
                "message": data.message,
                "records": read_resources(db, user.id),
                "history": history["turns"][-20:],
                "settings": settings,
                "cloud_consent": consent.cloud_ai,
            }
        )
        answer = result["answer"]
        answer["generated_at"] = now().isoformat()
        history["turns"] += [
            {"role": "user", "text": data.message},
            {"role": "assistant", **answer},
        ]
        history["turns"] = history["turns"][-200:]
        if not conversation:
            conversation = Conversation(id=new_id(), owner=user.id, cipher=b"")
            db.add(conversation)
        conversation.cipher = cipher.seal(history, user.id)
        conversation.updated_at = now()
        audit(db, user.id, "chat.answered", conversation.id)
        db.commit()
        return {"conversation_id": conversation.id, **answer}

    @app.get("/conversations")
    def conversations(user=Depends(permitted), db=Depends(db_session)):
        return {
            "conversations": [
                {
                    "id": c.id,
                    "updated_at": c.updated_at.isoformat(),
                    **cipher.open(c.cipher, user.id),
                }
                for c in db.scalars(
                    select(Conversation)
                    .where(Conversation.owner == user.id)
                    .order_by(Conversation.updated_at.desc())
                ).all()
            ]
        }

    @app.get("/doctor-summary")
    async def summary(user=Depends(permitted), db=Depends(db_session)):
        result = await supervisor.ainvoke(
            {
                "message": "doctor visit summary",
                "records": read_resources(db, user.id),
                "settings": settings,
                "cloud_consent": False,
            }
        )
        audit(db, user.id, "summary.created")
        db.commit()
        return result["answer"]

    @app.post("/voice")
    async def voice(
        file: UploadFile = File(), user=Depends(permitted), db=Depends(db_session)
    ):
        consent = db.get(Consent, user.id)
        if not consent.cloud_ai:
            raise HTTPException(
                403,
                "Voice transcription sends audio to the configured AI provider. Enable cloud AI consent first.",
            )
        if (
            not settings.model_approved
            or settings.provider != "openai"
            or not settings.provider_key
        ):
            raise HTTPException(503, "Voice transcription is not configured.")
        audio = await file.read(MAX_UPLOAD + 1)
        await file.close()
        if not audio or len(audio) > MAX_UPLOAD:
            raise HTTPException(413, "Record a shorter voice question (maximum 10 MB).")
        import httpx

        async with httpx.AsyncClient(timeout=40) as client:
            try:
                res = await client.post(
                    "https://api.openai.com/v1/audio/transcriptions",
                    headers={"Authorization": f"Bearer {settings.provider_key}"},
                    files={"file": ("question.m4a", BytesIO(audio), "audio/mp4")},
                    data={"model": "whisper-1"},
                )
                res.raise_for_status()
                text = res.json().get("text", "")
            except (httpx.HTTPError, ValueError):
                raise HTTPException(
                    503, "Transcription could not finish. Your audio was not saved."
                )
        audit(db, user.id, "voice.transcribed")
        db.commit()
        return {"text": text, "requires_review": True, "audio_stored": False}

    @app.get("/export")
    def export(user=Depends(account), db=Depends(db_session)):
        resources = read_resources(db, user.id)
        docs = [
            document_json(d)
            for d in db.scalars(select(Document).where(Document.owner == user.id)).all()
        ]
        result = {
            "fhir": {
                "resourceType": "Bundle",
                "type": "collection",
                "entry": [{"resource": r} for r in resources],
            },
            "documents": docs,
            "conversations": [
                {"id": c.id, **cipher.open(c.cipher, user.id)}
                for c in db.scalars(
                    select(Conversation).where(Conversation.owner == user.id)
                ).all()
            ],
            "audit": [
                {
                    "action": a.action,
                    "target": a.target,
                    "date": a.created_at.isoformat(),
                }
                for a in db.scalars(select(Audit).where(Audit.owner == user.id)).all()
            ],
        }
        audit(db, user.id, "data.exported")
        db.commit()
        return result

    @app.delete("/account", status_code=204)
    def remove_account(
        data: DeleteInput, user=Depends(account), db=Depends(db_session)
    ):
        if not password_valid(data.password, user.password_hash):
            raise HTTPException(401, "Password is incorrect.")
        for d in db.scalars(select(Document).where(Document.owner == user.id)).all():
            storage.delete(d.object_key)
        for model in (Resource, Document, Conversation, Consent, LoginSession, Audit):
            db.execute(delete(model).where(model.owner == user.id))
        db.delete(user)
        db.commit()
        return Response(status_code=204)

    return app
