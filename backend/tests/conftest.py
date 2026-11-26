import os
import tempfile

import pytest

_db = os.path.join(tempfile.mkdtemp(), "test.db")
os.environ.update({
    "DATABASE_URL": f"sqlite:///{_db}",
    "ADMIN_SECRET_KEY": "test-admin-secret",
    "JWT_SECRET_KEY": "test-jwt-secret",
    "GEMINI_API_KEY": "",
    "DATA_GO_KR_API_KEY": "",
    "KAKAO_REST_API_KEY": "",
    "SEED_SAMPLE_DATA": "true",
    "WARMUP_ON_STARTUP": "false",
    "RATE_LIMIT_PER_MINUTE": "100000",
    "TIDB_HOST": "",
    # 로컬 .env 의 실제 키가 테스트에 섞이지 않도록 명시적으로 비움 (load_dotenv 는 기존 값을 덮어쓰지 않음)
    **{f"{p}_CLIENT_{k}": "" for p in ("GOOGLE", "NAVER", "KAKAO") for k in ("ID", "SECRET")},
})

from fastapi.testclient import TestClient  # noqa: E402

from app.main import app  # noqa: E402


@pytest.fixture(scope="session")
def client():
    with TestClient(app) as c:
        yield c


def _token(client, path, body):
    res = client.post(path, json=body)
    assert res.status_code == 200, res.text
    return {"Authorization": f"Bearer {res.json()['access_token']}"}


@pytest.fixture(scope="session")
def user_headers(client):
    return _token(client, "/api/auth/test-login", {"kind": "user"})


@pytest.fixture(scope="session")
def test_admin_headers(client):
    return _token(client, "/api/auth/test-login", {"kind": "test_admin"})


@pytest.fixture(scope="session")
def admin_headers(client):
    return _token(client, "/api/auth/admin-key-login", {"admin_key": "test-admin-secret"})
