from sqlalchemy import text

from .db import Base, engine
from . import models  # noqa: F401


def init_db():
    Base.metadata.create_all(bind=engine)
    with engine.begin() as conn:
        conn.execute(
            text(
                "CREATE VIRTUAL TABLE IF NOT EXISTS notes_fts USING fts5(title, content)"
            )
        )
