import logging
from pathlib import Path
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, DeclarativeBase
from app.core.config import settings

log = logging.getLogger("medigraph.db")

db_url = settings.database_url
if db_url.startswith("postgres://"):
    db_url = db_url.replace("postgres://", "postgresql+psycopg://", 1)
elif db_url.startswith("postgresql://") and not db_url.startswith("postgresql+"):
    db_url = db_url.replace("postgresql://", "postgresql+psycopg://", 1)

sqlite_path = Path(__file__).resolve().parents[2] / "medigraph.db"
sqlite_url = f"sqlite:///{sqlite_path.as_posix()}"

try:
    connect_args = {"check_same_thread": False} if db_url.startswith("sqlite") else {}
    test_engine = create_engine(db_url, future=True, connect_args=connect_args)
    with test_engine.connect():
        pass
    engine = test_engine
    log.info("Connected to configured database: %s", engine.url.render_as_string(hide_password=True))
except Exception as exc:
    log.warning("Configured database connection failed (%s). Falling back to local SQLite: %s", exc, sqlite_url)
    engine = create_engine(sqlite_url, future=True, connect_args={"check_same_thread": False})

SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False)

class Base(DeclarativeBase):
    pass

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()