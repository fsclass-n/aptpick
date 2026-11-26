import logging
import threading
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import func, select

from .core.config import settings
from .database import Base, SessionLocal, engine
from .middleware import RateLimitMiddleware, ReadOnlyGuardMiddleware, SecurityHeadersMiddleware
from .models import AnalysisReport, RegionalStatistic
from .routers import admin, ai, apartments, auth, market, me, reports, ws
from .services import prediction, report, stats
from .services.seed import seed_base, seed_sample

log = logging.getLogger("aptpick")


def _warm_up() -> None:
    """기동 직후 백그라운드에서 AI 모델 학습 + 초기 리포트 생성 (첫 요청 지연 방지)"""
    try:
        with SessionLocal() as db:
            prediction.get_state(db)
            if not db.scalar(select(func.count(AnalysisReport.id))) and db.scalar(select(func.count(RegionalStatistic.id))):
                report.generate(db, "weekly")
                top = stats.region_latest(db)[:2]
                for r in top:
                    report.generate(db, "monthly", r["code"])
                report.generate(db, "volume_jeonse")
    except Exception:  # 워밍업 실패는 서비스 기동을 막지 않음 (첫 요청 시 재시도)
        log.exception("warm-up failed")


@asynccontextmanager
async def lifespan(_: FastAPI):
    Base.metadata.create_all(engine)
    with SessionLocal() as db:
        seed_base(db)
        if seed_sample(db) or not db.scalar(select(func.count(RegionalStatistic.id))):
            stats.refresh_regional_statistics(db)
    if settings.warmup_on_startup:
        threading.Thread(target=_warm_up, daemon=True).start()
    yield


app = FastAPI(title="aptpick API", version=settings.version, lifespan=lifespan,
              description="데이터로 분석하고, AI로 찾는 나에게 맞는 부동산 — 실거래가·시장 분석·AI 가격 추정·맞춤 추천 API")
app.add_middleware(ReadOnlyGuardMiddleware)
app.add_middleware(RateLimitMiddleware)
app.add_middleware(SecurityHeadersMiddleware)
app.add_middleware(CORSMiddleware, allow_origins=settings.cors_origins, allow_credentials=True,
                   allow_methods=["*"], allow_headers=["*"])

for module in (auth, apartments, market, ai, me, reports, admin, ws):
    app.include_router(module.router)


@app.get("/", include_in_schema=False)
def root():
    return {"service": "aptpick-api", "docs": "/docs", "health": "/api/health"}


# UptimeRobot 등은 HEAD 로 확인하므로 GET/HEAD 모두 허용. /health·/healthz 는 별칭
@app.api_route("/healthz", methods=["GET", "HEAD"], include_in_schema=False)
@app.api_route("/health", methods=["GET", "HEAD"], include_in_schema=False)
@app.head("/api/health", include_in_schema=False)
@app.get("/api/health", tags=["system"], summary="Health Check")
def health():
    return {"status": "ok", "service": "aptpick-api", "env": settings.app_env, "version": settings.version,
            "commit": settings.git_commit, "db": settings.db_kind}
