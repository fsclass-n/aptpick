import os
from pathlib import Path
from urllib.parse import quote_plus

from dotenv import load_dotenv

BACKEND_DIR = Path(__file__).resolve().parents[2]
ROOT_DIR = BACKEND_DIR.parent  # 저장소 루트 (단일 .env 위치)
load_dotenv(ROOT_DIR / ".env")


def _env(name: str, default: str = "") -> str:
    return os.getenv(name, default).strip()


def _bool(name: str, default: bool) -> bool:
    return _env(name, str(default)).lower() in {"1", "true", "yes", "on"}


def _database_url() -> str:
    if _env("DATABASE_URL"):
        return _env("DATABASE_URL")
    host = _env("TIDB_HOST")
    if host:
        user, password = quote_plus(_env("TIDB_USER")), quote_plus(_env("TIDB_PASSWORD"))
        return f"mysql+pymysql://{user}:{password}@{host}:{_env('TIDB_PORT', '4000')}/{_env('TIDB_DATABASE', 'aptpick') or 'aptpick'}"
    return f"sqlite:///{(BACKEND_DIR / 'storage' / 'aptpick.db').as_posix()}"


class Settings:
    app_env = _env("APP_ENV", "development")
    version = "1.0.0"
    git_commit = _env("RENDER_GIT_COMMIT") or _env("GIT_COMMIT")
    jwt_secret_key = _env("JWT_SECRET_KEY") or "dev-only-jwt-secret"
    jwt_expire_minutes = int(_env("JWT_EXPIRE_MINUTES", "720"))
    admin_secret_key = _env("ADMIN_SECRET_KEY")
    admin_email = (_env("ADMIN_EMAIL") or "admin@aptpick.kr").lower()
    database_url = _database_url()
    database_name = _env("TIDB_DATABASE", "aptpick") or "aptpick"
    tidb_ssl_mode = _env("TIDB_SSL_MODE", "VERIFY_IDENTITY").upper()
    cors_origins = [o.strip().rstrip("/") for o in _env(
        "CORS_ORIGINS",
        "http://localhost:5173,https://aptpick.netlify.app,https://aptpick.onrender.com,https://aptpick.duckdns.org",
    ).split(",") if o.strip()]
    frontend_url = _env("FRONTEND_URL", "http://localhost:5173").rstrip("/")
    backend_url = _env("BACKEND_URL", "http://localhost:8000").rstrip("/")
    rate_limit_per_minute = int(_env("RATE_LIMIT_PER_MINUTE", "240"))
    seed_sample_data = _bool("SEED_SAMPLE_DATA", True)
    warmup_on_startup = _bool("WARMUP_ON_STARTUP", True)
    data_go_kr_api_key = _env("DATA_GO_KR_API_KEY")
    kakao_rest_api_key = _env("KAKAO_REST_API_KEY")
    gemini_api_key = _env("GEMINI_API_KEY")
    gemini_model = _env("GEMINI_MODEL", "gemini-2.5-flash")
    oauth = {
        provider: {"client_id": _env(f"{provider.upper()}_CLIENT_ID"), "client_secret": _env(f"{provider.upper()}_CLIENT_SECRET")}
        for provider in ("google", "naver", "kakao")
    }

    @property
    def db_kind(self) -> str:
        return "sqlite" if self.database_url.startswith("sqlite") else "tidb/mysql"


settings = Settings()
