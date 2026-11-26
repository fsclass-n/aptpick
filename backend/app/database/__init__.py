from pathlib import Path

import certifi
from sqlalchemy import create_engine, text
from sqlalchemy.engine import make_url
from sqlalchemy.orm import DeclarativeBase, sessionmaker

from ..core.config import settings


def _connect_args() -> dict:
    if settings.db_kind == "sqlite":
        return {"check_same_thread": False}
    mode = settings.tidb_ssl_mode
    if mode == "DISABLED":
        return {}
    # TiDB Cloud Serverless 는 TLS 필수 — 공인 CA(certifi) 로 서버 인증서를 검증
    return {"ssl_ca": certifi.where(), "ssl_verify_cert": True, "ssl_verify_identity": mode == "VERIFY_IDENTITY"}


def ensure_database() -> None:
    """TiDB/MySQL 에 aptpick 데이터베이스가 없으면 생성합니다."""
    if settings.db_kind == "sqlite":
        Path(settings.database_url.removeprefix("sqlite:///")).parent.mkdir(parents=True, exist_ok=True)
        return
    url = make_url(settings.database_url)
    name = url.database or settings.database_name
    server = create_engine(url.set(database=None), connect_args=_connect_args(), pool_pre_ping=True)
    with server.begin() as conn:
        conn.execute(text(f"CREATE DATABASE IF NOT EXISTS `{name}` CHARACTER SET utf8mb4 COLLATE utf8mb4_bin"))
    server.dispose()


ensure_database()
engine = create_engine(settings.database_url, connect_args=_connect_args(), pool_pre_ping=True,
                       **({} if settings.db_kind == "sqlite" else {"pool_recycle": 300, "pool_size": 5, "max_overflow": 5}))
SessionLocal = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)


class Base(DeclarativeBase):
    pass


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
