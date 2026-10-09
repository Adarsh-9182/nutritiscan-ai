from sqlalchemy import text

from .config import Settings
from .database import Base, connect


def main():
    settings = Settings.from_env()
    engine, _ = connect(settings)
    Base.metadata.create_all(engine)
    # Optional pgvector index: no embeddings are sent or stored automatically.
    # Apply migrations/0001_document_search.sql when enabling consented search.
    with engine.connect() as db:
        db.execute(text("SELECT 1"))
    print("Health schema ready.")


if __name__ == "__main__":
    main()
