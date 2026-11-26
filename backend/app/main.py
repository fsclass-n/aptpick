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


STATE = {"data_ready": False}


def _bootstrap_data() -> None:
    """샘플 데이터 적재(데이터가 비어 있을 때) + 지역 통계 집계"""
    with SessionLocal() as db:
        if seed_sample(db) or not db.scalar(select(func.count(RegionalStatistic.id))):
            stats.refresh_regional_statistics(db)
    STATE["data_ready"] = True


def _warm_up() -> None:
    """AI 모델 학습 + 초기 리포트 생성 (첫 요청 지연 방지)"""
    with SessionLocal() as db:
        prediction.get_state(db)
        if not db.scalar(select(func.count(AnalysisReport.id))) and db.scalar(select(func.count(RegionalStatistic.id))):
            report.generate(db, "weekly")
            for r in stats.region_latest(db)[:2]:
                report.generate(db, "monthly", r["code"])
            report.generate(db, "volume_jeonse")


def _background_start() -> None:
    try:
        _bootstrap_data()
        _warm_up()
    except Exception:  # 실패해도 서비스 기동은 유지 (첫 요청 시 재시도)
        log.exception("background bootstrap failed")


@asynccontextmanager
async def lifespan(_: FastAPI):
    Base.metadata.create_all(engine)
    with SessionLocal() as db:
        seed_base(db)
    if settings.warmup_on_startup:
        # Render 무료 플랜(0.1 CPU)·원격 TiDB 에서도 포트를 즉시 열도록 데이터 적재·모델 학습은 백그라운드 실행
        threading.Thread(target=_background_start, daemon=True).start()
    else:  # 테스트·스크립트: 동기 실행
        _bootstrap_data()
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
            "commit": settings.git_commit, "db": settings.db_kind, "data_ready": STATE["data_ready"]}
