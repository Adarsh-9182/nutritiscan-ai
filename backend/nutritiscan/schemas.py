from datetime import date
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator


class Strict(BaseModel):
    model_config = ConfigDict(
        extra="forbid", str_strip_whitespace=True, allow_inf_nan=False
    )


class Credentials(Strict):
    email: str = Field(min_length=5, max_length=254)
    password: str = Field(min_length=12, max_length=128)
    # Accepted for compatibility with older web and Android clients. Account
    # creation no longer uses a self-declared age gate.
    adult: bool | None = None

    @field_validator("email")
    @classmethod
    def email_valid(cls, value):
        if (
            value.count("@") != 1
            or "." not in value.split("@")[1]
            or any(c.isspace() for c in value)
        ):
            raise ValueError("Enter a valid email address.")
        return value.casefold()


class ConsentInput(Strict):
    storage: bool
    cloud_ai: bool = False
    version: Literal["2026-10-09"] = "2026-10-09"


class ObservationInput(Strict):
    name: str = Field(min_length=1, max_length=120)
    value: float = Field(ge=0, le=1e9)
    unit: str = Field(min_length=1, max_length=40)
    measured_at: date
    reference_low: float | None = None
    reference_high: float | None = None
    source_page: int | None = Field(default=None, ge=1, le=30)
    source_text: str = Field(default="", max_length=1000)

    @field_validator("measured_at")
    @classmethod
    def valid_date(cls, value):
        if value > date.today() or value.year < 1900:
            raise ValueError(
                "The measurement date must be a real past or present date."
            )
        return value


class GoogleCredential(Strict):
    credential: str = Field(min_length=100, max_length=8192)


class RecordInput(Strict):
    kind: Literal["condition", "allergy", "medication", "visit", "nutrition"]
    title: str = Field(min_length=1, max_length=120)
    date: date
    notes: str = Field(default="", max_length=2000)


class ConfirmInput(Strict):
    compared_with_original: Literal[True]
    observations: list[ObservationInput] = Field(min_length=1, max_length=200)


class ChatInput(Strict):
    message: str = Field(min_length=1, max_length=6000)
    conversation_id: str | None = Field(default=None, max_length=36)


class DeleteInput(Strict):
    password: str | None = Field(default=None, min_length=1, max_length=128)
    confirmation: Literal["DELETE MY HEALTH DATA"]
