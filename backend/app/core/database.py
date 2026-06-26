from collections.abc import Generator

from sqlmodel import Session, create_engine

from backend.app.core.settings import settings


engine = create_engine(str(settings.postgres_dsn))


def get_session() -> Generator[Session, None, None]:
    with Session(engine) as session:
        yield session
