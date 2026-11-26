import threading
import time
from collections import deque

from fastapi import Request
from fastapi.responses import JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware

from ..core.config import settings
from ..core.security import decode_token
from ..dependencies import bearer_token
from ..services.common import client_ip

WRITE_METHODS = {"POST", "PUT", "PATCH", "DELETE"}
# 세션 전환(로그인·로그아웃)과 조회 성격의 POST 는 테스트 관리자도 허용 (명시적 예외)
READ_ONLY_EXEMPT = {"/api/auth/login", "/api/auth/test-login", "/api/auth/admin-key-login", "/api/auth/logout",
                    "/api/ai/recommend", "/api/reports/ask"}


class ReadOnlyGuardMiddleware(BaseHTTPMiddleware):
    """테스트 관리자(role=test_admin) 토큰의 쓰기 요청을 403 으로 일괄 차단하는 최종 방어선."""

    async def dispatch(self, request: Request, call_next):
        if request.method in WRITE_METHODS and request.url.path not in READ_ONLY_EXEMPT:
            payload = decode_token(bearer_token(request) or "")
            if payload and payload.get("role") == "test_admin":
                return JSONResponse(status_code=403, content={"detail": "테스트 관리자 계정은 읽기 전용입니다.", "code": "READ_ONLY"})
        return await call_next(request)


STRICT_LIMITS = {"/api/auth/login": 20, "/api/auth/signup": 10, "/api/auth/admin-key-login": 10, "/api/reports/ask": 15,
                 "/api/inquiries": 10}


class RateLimitMiddleware(BaseHTTPMiddleware):
    """IP 기준 1분 슬라이딩 윈도 요청 제한 (단일 인스턴스 메모리 기반)"""

    def __init__(self, app):
        super().__init__(app)
        self.hits: dict[tuple[str, str], deque] = {}
        self.lock = threading.Lock()

    async def dispatch(self, request: Request, call_next):
        path = request.url.path
        if not path.startswith("/api/") or path.startswith("/api/health") or request.method == "OPTIONS":
            return await call_next(request)
        strict = request.method != "GET" and path in STRICT_LIMITS
        limit = STRICT_LIMITS[path] if strict else settings.rate_limit_per_minute
        bucket = path if strict else "*"
        key, now = (client_ip(request), bucket), time.monotonic()
        with self.lock:
            q = self.hits.setdefault(key, deque())
            while q and now - q[0] > 60:
                q.popleft()
            if len(q) >= limit:
                return JSONResponse(status_code=429, content={"detail": "요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.", "code": "RATE_LIMITED"},
                                    headers={"Retry-After": "60"})
            q.append(now)
            if len(self.hits) > 20000:
                self.hits.clear()
        return await call_next(request)


class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        response = await call_next(request)
        response.headers.setdefault("X-Content-Type-Options", "nosniff")
        response.headers.setdefault("Referrer-Policy", "strict-origin-when-cross-origin")
        response.headers.setdefault("X-Frame-Options", "DENY")
        return response
