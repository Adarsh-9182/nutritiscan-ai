"""Explicit account backups, isolated from health consent, records and model calls."""
import json
from datetime import datetime, timezone
from typing import Literal
from uuid import UUID

from fastapi import Depends, HTTPException, Request, Response
from pydantic import BaseModel, ConfigDict, Field, ValidationError
from sqlalchemy import update
from sqlalchemy.exc import IntegrityError

from .database import ResearchWorkspace, new_id, now


class Snapshot(BaseModel):
    model_config = ConfigDict(extra="forbid", allow_inf_nan=False)
    format: Literal["nutritiscan-research"]
    version: Literal[1]
    exportedAt: datetime
    threads: list[dict] = Field(max_length=8)


class Revision(BaseModel):
    model_config = ConfigDict(extra="forbid")
    revision: UUID | None


class SaveBackup(Revision):
    consent: Literal[True]
    backup: Snapshot


def install_research_routes(app, cipher, db_session, account):
    async def read_input(request, model, limit):
        chunks, size = [], 0
        async for chunk in request.stream():
            size += len(chunk)
            if size > limit:
                raise HTTPException(413, "Research request exceeds its size limit.")
            chunks.append(chunk)
        try:
            def invalid_constant(_):
                raise ValueError("Non-finite JSON value")
            return model.model_validate(json.loads(b"".join(chunks), parse_constant=invalid_constant))
        except (ValidationError, ValueError, RecursionError):
            raise HTTPException(400, "Invalid research backup request.")

    def view(row, include_backup=True):
        return {
            "revision": row.revision if row else None,
            "updatedAt": (row.updated_at if row.updated_at.tzinfo else row.updated_at.replace(tzinfo=timezone.utc)).isoformat() if row else None,
            **({"backup": cipher.open(row.cipher, f"{row.owner}:research:v1") if row and row.cipher else None} if include_backup else {}),
        }

    def commit(db, owner, revision, payload):
        token, timestamp = new_id(), now()
        encrypted = cipher.seal(payload, f"{owner}:research:v1") if payload is not None else None
        if revision is None:
            db.add(ResearchWorkspace(owner=owner, revision=token, cipher=encrypted, updated_at=timestamp))
            try:
                db.commit()
            except IntegrityError:
                db.rollback()
                raise HTTPException(409, "Account backup changed. Check it again before saving or deleting.")
        else:
            changed = db.execute(update(ResearchWorkspace).where(
                ResearchWorkspace.owner == owner, ResearchWorkspace.revision == str(revision)
            ).values(revision=token, cipher=encrypted, updated_at=timestamp))
            if changed.rowcount != 1:
                db.rollback()
                raise HTTPException(409, "Account backup changed. Check it again before saving or deleting.")
            db.commit()
        db.expire_all()
        return db.get(ResearchWorkspace, owner)

    @app.get("/research/backup")
    def read_backup(response: Response, user=Depends(account), db=Depends(db_session)):
        row = db.get(ResearchWorkspace, user.id)
        if row:
            response.headers["etag"] = f'"{row.revision}"'
        return view(row)

    @app.put("/research/backup")
    async def save_backup(request: Request, user=Depends(account), db=Depends(db_session)):
        data = await read_input(request, SaveBackup, 1_050_000)
        payload = data.backup.model_dump(mode="json")
        # This service stores an opaque versioned backup. The web boundary validates
        # the complete source/turn schema before upload and again before restoration.
        try:
            raw = json.dumps(payload, ensure_ascii=False, allow_nan=False, separators=(",", ":")).encode()
        except (ValueError, RecursionError):
            raise HTTPException(400, "Invalid research backup content.")
        if len(raw) > 1_000_000:
            raise HTTPException(413, "Research backup exceeds 1 MB.")
        return view(commit(db, user.id, data.revision, payload), include_backup=False)

    @app.delete("/research/backup")
    async def delete_backup(request: Request, user=Depends(account), db=Depends(db_session)):
        data = await read_input(request, Revision, 1024)
        # Keep a revision tombstone so an old browser cannot recreate deleted data.
        return view(commit(db, user.id, data.revision, None))
