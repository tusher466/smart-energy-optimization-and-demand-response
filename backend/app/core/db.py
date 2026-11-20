from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, declarative_base
from .config import get_settings

settings = get_settings()
db_url = settings.database_url
if db_url.startswith("postgres://"):  # Render-style URL -> SQLAlchemy scheme
    db_url = "postgresql://" + db_url[len("postgres://"):]
connect_args = {"check_same_thread": False} if db_url.startswith("sqlite") else {}
engine = create_engine(db_url, connect_args=connect_args, future=True, pool_pre_ping=True)
SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False, future=True)
Base = declarative_base()


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def init_db():
    from app.services import ledger_models  # noqa: F401  (register models)
    Base.metadata.create_all(bind=engine)
