import os
from dataclasses import dataclass


@dataclass(frozen=True)
class Settings:
    database_url: str
    data_key: str
    environment: str = "development"
    object_dir: str = ".local/documents"
    s3_bucket: str = ""
    s3_endpoint: str | None = None
    redis_url: str = ""
    provider: str = "none"
    model: str = ""
    provider_key: str = ""
    model_approved: bool = False
    origins: tuple[str, ...] = ("http://localhost:3000",)

    @classmethod
    def from_env(cls):
        env = os.getenv("ENVIRONMENT", "development")
        url = os.getenv("HEALTH_DATABASE_URL", "sqlite:///.local/health.db")
        key = os.getenv("HEALTH_DATA_KEY", "")
        if len(key) != 64:
            raise RuntimeError(
                "HEALTH_DATA_KEY must be a separately managed 32-byte hex key."
            )
        bytes.fromhex(key)
        if env == "production" and (
            not url.startswith(("postgresql://", "postgresql+psycopg://"))
            or not os.getenv("S3_BUCKET")
        ):
            raise RuntimeError(
                "Production requires PostgreSQL and a private S3-compatible bucket."
            )
        return cls(
            database_url=url.replace("postgresql://", "postgresql+psycopg://", 1),
            data_key=key,
            environment=env,
            object_dir=os.getenv("HEALTH_OBJECT_DIR", ".local/documents"),
            s3_bucket=os.getenv("S3_BUCKET", ""),
            s3_endpoint=os.getenv("S3_ENDPOINT_URL"),
            redis_url=os.getenv("REDIS_URL", ""),
            provider=os.getenv("HEALTH_LLM_PROVIDER", "none"),
            model=os.getenv("HEALTH_LLM_MODEL", ""),
            provider_key=os.getenv("HEALTH_LLM_KEY", ""),
            model_approved=os.getenv("HEALTH_MODEL_APPROVED") == "true",
            origins=tuple(
                x.strip()
                for x in os.getenv(
                    "HEALTH_ALLOWED_ORIGINS", "http://localhost:3000"
                ).split(",")
            ),
        )
