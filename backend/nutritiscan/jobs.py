from celery import Celery

from .config import Settings
from .database import Cipher, Consent, Document, audit, connect
from .extraction import extract
from .storage import DocumentStorage

celery = Celery("nutritiscan")


def process_document(factory, cipher, storage, document_id):
    with factory() as db:
        doc = db.get(Document, document_id)
        if not doc or doc.status not in ("queued", "processing"):
            return
        consent = db.get(Consent, doc.owner)
        if not consent or not consent.storage:
            return
        doc.status = "processing"
        db.commit()
        metadata = cipher.open(doc.cipher, doc.owner)
        try:
            draft = extract(storage.get(doc.object_key, doc.owner), metadata["mime"])
            metadata.update(draft)
            doc.status = "review"
        except Exception:
            metadata["review_note"] = (
                "Automatic extraction could not finish. Open the original and enter measurements manually. No lab values were saved."
            )
            metadata.update(candidates=[], pages=[])
            doc.status = "manual_review"
        doc.cipher = cipher.seal(metadata, doc.owner)
        audit(db, doc.owner, "document.extracted", doc.id)
        db.commit()


@celery.task(
    name="nutritiscan.extract", autoretry_for=(), time_limit=60, soft_time_limit=50
)
def extract_job(document_id):
    settings = Settings.from_env()
    _, factory = connect(settings)
    cipher = Cipher(settings.data_key)
    process_document(factory, cipher, DocumentStorage(settings, cipher), document_id)


def configure_jobs(settings):
    celery.conf.update(
        broker_url=settings.redis_url or None,
        task_ignore_result=True,
        task_serializer="json",
        accept_content=["json"],
        worker_prefetch_multiplier=1,
    )
