import sys
import logging
from pathlib import Path

# Ensure apps/api is in sys.path
api_dir = Path(__file__).resolve().parent
if str(api_dir) not in sys.path:
    sys.path.insert(0, str(api_dir))

from app.core.config import settings
from app.db.session import Base, engine, SessionLocal
from app.models import patient, intake, document, fact, timeline, audit, user, summary_draft  # noqa: F401
from app.services.auth_service import seed_default_admin

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("init_db")

def main():
    logger.info("Connecting to database: %s", engine.url.render_as_string(hide_password=True))
    logger.info("Creating all tables in database...")
    Base.metadata.create_all(bind=engine)
    logger.info("Tables created successfully!")

    logger.info("Seeding default admin user...")
    db = SessionLocal()
    try:
        seed_default_admin(db)
        logger.info("Default admin seeded / verified successfully!")
    except Exception as e:
        logger.warning("Seed admin note: %s", e)
    finally:
        db.close()

    # List tables
    from sqlalchemy import inspect
    inspector = inspect(engine)
    tables = inspector.get_table_names()
    logger.info("Existing tables in database: %s", tables)
    print("SUCCESS: Database initialized with tables:", tables)

if __name__ == "__main__":
    main()

