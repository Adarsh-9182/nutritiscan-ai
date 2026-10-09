import hashlib
import hmac
import os
import secrets
from datetime import timedelta

from fastapi import HTTPException
from sqlalchemy import select

from .database import Account, LoginSession, now


def password_hash(password):
    salt = os.urandom(16)
    digest = hashlib.scrypt(password.encode(), salt=salt, n=16384, r=8, p=1)
    return f"scrypt${salt.hex()}${digest.hex()}"


def password_valid(password, stored):
    try:
        _, salt, expected = stored.split("$")
        actual = hashlib.scrypt(
            password.encode(), salt=bytes.fromhex(salt), n=16384, r=8, p=1
        )
        return hmac.compare_digest(actual.hex(), expected)
    except (ValueError, TypeError):
        return False


def email_index(email, key):
    return hmac.new(
        bytes.fromhex(key), email.casefold().encode(), hashlib.sha256
    ).hexdigest()


def start_session(db, account):
    token = secrets.token_urlsafe(48)
    db.add(
        LoginSession(
            token_hash=hashlib.sha256(token.encode()).hexdigest(),
            owner=account.id,
            expires_at=now() + timedelta(days=7),
        )
    )
    return {
        "access_token": token,
        "token_type": "bearer",
        "expires_in": 604800,
        "user_id": account.id,
    }


def authenticate(db, header):
    if not header or not header.startswith("Bearer ") or len(header) > 256:
        raise HTTPException(401, "Sign in to access your health records.")
    token_hash = hashlib.sha256(header[7:].encode()).hexdigest()
    login = db.get(LoginSession, token_hash)
    if not login or login.expires_at.replace(tzinfo=now().tzinfo) <= now():
        raise HTTPException(401, "Your session expired. Please sign in again.")
    account = db.scalar(select(Account).where(Account.id == login.owner))
    if not account:
        raise HTTPException(401, "Please sign in again.")
    return account, login
