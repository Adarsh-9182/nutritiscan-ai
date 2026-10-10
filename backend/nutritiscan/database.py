import json
import os
import uuid
from datetime import datetime, timezone
from pathlib import Path

from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from sqlalchemy import (
    Boolean,
    DateTime,
    ForeignKey,
    LargeBinary,
    String,
    create_engine,
    event,
)
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, sessionmaker


def now():
    return datetime.now(timezone.utc)


def new_id():
    return str(uuid.uuid4())


class Base(DeclarativeBase):
    pass


class Account(Base):
    __tablename__ = "health_accounts"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    email_index: Mapped[str] = mapped_column(String(64), unique=True)
    email_cipher: Mapped[bytes] = mapped_column(LargeBinary)
    password_hash: Mapped[str] = mapped_column(String(256))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)


class GoogleIdentity(Base):
    __tablename__ = "health_google_identities"
    subject: Mapped[str] = mapped_column(String(255), primary_key=True)
    owner: Mapped[str] = mapped_column(ForeignKey("health_accounts.id"), index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)


class LoginSession(Base):
    __tablename__ = "health_sessions"
    token_hash: Mapped[str] = mapped_column(String(64), primary_key=True)
    owner: Mapped[str] = mapped_column(ForeignKey("health_accounts.id"), index=True)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))


class Consent(Base):
    __tablename__ = "health_consents"
    owner: Mapped[str] = mapped_column(
        ForeignKey("health_accounts.id"), primary_key=True
    )
    storage: Mapped[bool] = mapped_column(Boolean, default=False)
    cloud_ai: Mapped[bool] = mapped_column(Boolean, default=False)
    version: Mapped[str] = mapped_column(String(30), default="2026-10-09")
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)


class Resource(Base):
    __tablename__ = "health_resources"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    owner: Mapped[str] = mapped_column(ForeignKey("health_accounts.id"), index=True)
    kind: Mapped[str] = mapped_column(String(40), index=True)
    cipher: Mapped[bytes] = mapped_column(LargeBinary)
    source_id: Mapped[str | None] = mapped_column(String(36), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)


class Document(Base):
    __tablename__ = "health_documents"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    owner: Mapped[str] = mapped_column(ForeignKey("health_accounts.id"), index=True)
    cipher: Mapped[bytes] = mapped_column(LargeBinary)
    object_key: Mapped[str] = mapped_column(String(180))
    status: Mapped[str] = mapped_column(String(30), default="queued")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)


class Conversation(Base):
    __tablename__ = "health_conversations"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    owner: Mapped[str] = mapped_column(ForeignKey("health_accounts.id"), index=True)
    cipher: Mapped[bytes] = mapped_column(LargeBinary)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)


class Audit(Base):
    __tablename__ = "health_audit"
    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id)
    owner: Mapped[str] = mapped_column(String(36), index=True)
    action: Mapped[str] = mapped_column(String(60))
    target: Mapped[str | None] = mapped_column(String(36), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)


class Cipher:
    def __init__(self, key: str):
        self.aes = AESGCM(bytes.fromhex(key))

    def seal_bytes(self, value: bytes, owner: str) -> bytes:
        nonce = os.urandom(12)
        return nonce + self.aes.encrypt(nonce, value, owner.encode())

    def open_bytes(self, value: bytes, owner: str) -> bytes:
        return self.aes.decrypt(value[:12], value[12:], owner.encode())

    def seal(self, value, owner: str):
        return self.seal_bytes(
            json.dumps(value, ensure_ascii=False, allow_nan=False).encode(), owner
        )

    def open(self, value, owner: str):
        return json.loads(self.open_bytes(value, owner))


def connect(settings):
    if settings.database_url.startswith("sqlite:///"):
        path = settings.database_url.removeprefix("sqlite:///")
        if path != ":memory:":
            Path(path).parent.mkdir(parents=True, exist_ok=True)
    engine = create_engine(
        settings.database_url,
        pool_pre_ping=True,
        **(
            {"connect_args": {"check_same_thread": False}}
            if settings.database_url.startswith("sqlite")
            else {}
        ),
    )
    if settings.database_url.startswith("sqlite"):

        def foreign_keys(dbapi_connection, _):
            dbapi_connection.execute("PRAGMA foreign_keys=ON")

        event.listen(engine, "connect", foreign_keys)
    return engine, sessionmaker(engine, expire_on_commit=False)


def audit(db, owner, action, target=None):
    db.add(Audit(owner=owner, action=action, target=target))
