"""
Database configuration and session management.

This module sets up the SQLite engine via SQLModel + SQLAlchemy,
enables WAL mode and synchronous=NORMAL pragmas for performance,
provides the session factory, and exposes helper functions for
creating tables and obtaining database sessions for dependency injection.
"""

import os
from collections.abc import Generator

from sqlalchemy import event
from sqlmodel import Session, SQLModel, create_engine

DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///./pricemonitor.db")

engine = create_engine(DATABASE_URL, echo=False)


def _set_sqlite_pragma(dbapi_connection, connection_record):
    """Enable WAL mode and relaxed synchronous for better SQLite performance."""
    cursor = dbapi_connection.cursor()
    cursor.execute("PRAGMA journal_mode=WAL")
    cursor.execute("PRAGMA synchronous=NORMAL")
    cursor.close()


event.listen(engine, "connect", _set_sqlite_pragma)


def create_db_and_tables() -> None:
    """Create all SQLModel tables that have been registered via metadata."""
    SQLModel.metadata.create_all(engine)


def get_session() -> Generator[Session, None, None]:
    """FastAPI dependency that yields a database session and closes it after use."""
    with Session(engine) as session:
        yield session
