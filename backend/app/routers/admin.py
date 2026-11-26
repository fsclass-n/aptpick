"""관리자 API — 조회는 admin·test_admin, 쓰기는 admin 전용 (test_admin 은 미들웨어에서도 403)"""
from datetime import timedelta

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query, Request
from sqlalchemy import delete, func, select
from sqlalchemy.orm import Session, selectinload

from ..core.config import settings
from ..database import SessionLocal, get_db
from ..dependencies import is_masked, require_admin_view, require_admin_write
from ..models import (AnalysisReport, Apartment, ApartmentComplex, AuditLog, DataCollectionLog, DataSource,
                      FavoriteProperty, Infrastructure, Inquiry, ModelVersion, Notification, PriceAlert, PricePrediction,
                      Property, RecommendationHistory, RentalHistory, SearchLog, TransactionHistory, User, utcnow)
from ..schemas import (BroadcastIn, CollectIn, InquiryAnswerIn, PropertyIn, PropertyUpdateIn, UserAdminUpdateIn)
from ..services import anomaly, collector, features, prediction, stats
from ..services.common import audit, evaluate_alerts_for_complex, mask_email, mask_name, mask_phone
from ..services.realtime import hub
from .apartments import property_card

router = APIRouter(prefix="/api/admin", tags=["admin"])


def _user_out(u: User, masked: bool) -> dict:
    return {"id": u.id, "email": mask_email(u.email) if masked else u.email, "name": mask_name(u.name) if masked else u.name,
            "phone": mask_phone(u.phone) if masked else u.phone, "role": u.role, "provider": u.provider,
            "is_active": u.is_active, "created_at": u.created_at.isoformat(),
            "last_login_at": u.last_login_at.isoformat() if u.last_login_at else None}


@router.get("/dashboard", summary="관리자 통합 대시보드")
def dashboard(user: User = Depends(require_admin_view), db: Session = Depends(get_db)):
    count = lambda m, *w: db.scalar(select(func.count()).select_from(m).where(*w)) or 0  # noqa: E731
    logs = db.scalars(select(DataCollectionLog).order_by(DataCollectionLog.id.desc()).limit(200)).all()
    finished = [l for l in logs if l.status in ("success", "failed")]
    trades_total, rents_total = count(TransactionHistory), count(RentalHistory)
    missing_floor = count(TransactionHistory, TransactionHistory.floor.is_(None))
    missing_build = count(ApartmentComplex, ApartmentComplex.build_year.is_(None))
    dup_props = len(_duplicates(db))
    since = utcnow() - timedelta(days=30)
    trend = db.execute(select(SearchLog.keyword, SearchLog.region_code, func.count(SearchLog.id)).where(SearchLog.created_at >= since)
                       .group_by(SearchLog.keyword, SearchLog.region_code).order_by(func.count(SearchLog.id).desc()).limit(10)).all()
    names = stats.region_names(db)
    model = prediction.model_info(db)
    ov = stats.overview(db)
    return {
        "counts": {"users": count(User), "active_users": count(User, User.is_active.is_(True)), "complexes": count(ApartmentComplex),
                   "apartments": count(Apartment), "properties": count(Property), "pending": count(Property, Property.status == "pending"),
                   "transactions": trades_total, "rentals": rents_total, "reports": count(AnalysisReport),
                   "favorites": count(FavoriteProperty), "alerts": count(PriceAlert, PriceAlert.active.is_(True)),
                   "recommendations": count(RecommendationHistory), "predictions": count(PricePrediction),
                   "inquiries_open": count(Inquiry, Inquiry.status == "open"), "infrastructure": count(Infrastructure)},
        "data_quality": {
            "as_of": stats.as_of(db), "collection_success_rate": round(sum(l.status == "success" for l in finished) / len(finished) * 100, 1) if finished else None,
            "collection_runs": len(logs), "api_errors": sum(l.status == "failed" for l in logs),
            "missing_rate": {"floor": round(missing_floor / trades_total * 100, 2) if trades_total else 0,
                             "build_year": round(missing_build / max(1, count(ApartmentComplex)) * 100, 2)},
            "duplicate_listing_groups": dup_props,
            "duplicate_rate": round(sum(l.duplicates for l in logs) / max(1, sum(l.fetched for l in logs)) * 100, 2) if logs else 0,
            "canceled_trades": count(TransactionHistory, TransactionHistory.canceled.is_(True)),
            "sample_rows": count(TransactionHistory, TransactionHistory.source == "sample"),
            "real_rows": count(TransactionHistory, TransactionHistory.source != "sample"),
        },
        "model": model, "market": {"kpi": ov["kpi"], "regions": ov["regions"][:15], "series": ov["series"][-12:]},
        "search_trend": [{"keyword": k, "region": names.get(r, {}).get("name", ""), "count": int(n)} for k, r, n in trend],
        "recommend_stats": {"total": count(RecommendationHistory), "last_30d": count(RecommendationHistory, RecommendationHistory.created_at >= since)},
        "system": {"db": settings.db_kind, "database": settings.database_name, "env": settings.app_env,
                   "gemini": bool(settings.gemini_api_key), "data_go_kr": bool(settings.data_go_kr_api_key),
                   "kakao_rest": bool(settings.kakao_rest_api_key), "ws_connections": hub.connections,
                   "model_ready": model.get("ready", False), "version": settings.version, "commit": settings.git_commit[:7]},
        "masked": is_masked(user),
    }


# ---------------------------------------------------------------- 회원
@router.get("/users", summary="회원 목록 (test_admin 은 마스킹)")
def users(q: str | None = None, role: str | None = None, page: int = Query(1, ge=1), size: int = Query(20, ge=1, le=100),
          user: User = Depends(require_admin_view), db: Session = Depends(get_db)):
    query = select(User)
    if q:
        query = query.where(User.email.like(f"%{q}%") | User.name.like(f"%{q}%"))
    if role:
        query = query.where(User.role == role)
    total = db.scalar(select(func.count()).select_from(query.subquery())) or 0
    rows = db.scalars(query.order_by(User.id).offset((page - 1) * size).limit(size)).all()
    return {"items": [_user_out(u, is_masked(user)) for u in rows], "total": total, "masked": is_masked(user)}


@router.patch("/users/{user_id}", summary="회원 권한·활성 상태 변경")
def update_user(user_id: int, body: UserAdminUpdateIn, request: Request, admin: User = Depends(require_admin_write),
                db: Session = Depends(get_db)):
    target = db.get(User, user_id)
    if not target:
        raise HTTPException(404, "회원을 찾을 수 없습니다.")
    if target.id == admin.id:
        raise HTTPException(400, "자기 자신의 권한·상태는 변경할 수 없습니다.")
    changes = body.model_dump(exclude_unset=True)
    for k, v in changes.items():
        setattr(target, k, v)
    audit(db, admin, "user.update", f"user:{target.id}", changes, request)
    db.commit()
    return _user_out(target, False)


# ---------------------------------------------------------------- 매물
def _duplicates(db: Session) -> list[dict]:
    rows = db.execute(select(Property.apartment_id, Property.deal_type, Property.price, Property.floor, func.count(Property.id),
                             func.min(Property.id), func.max(Property.id))
                      .where(Property.status != "rejected")
                      .group_by(Property.apartment_id, Property.deal_type, Property.price, Property.floor)
                      .having(func.count(Property.id) > 1)).all()
    return [{"apartment_id": a, "deal_type": d, "price": p, "floor": f, "count": int(n), "ids": [int(lo), int(hi)]}
            for a, d, p, f, n, lo, hi in rows]


@router.get("/properties", summary="매물 목록 (검수 상태별)")
def properties(status: str | None = None, q: str | None = None, page: int = Query(1, ge=1), size: int = Query(20, ge=1, le=100),
               _: User = Depends(require_admin_view), db: Session = Depends(get_db)):
    query = select(Property).join(ApartmentComplex, Property.complex_id == ApartmentComplex.id)
    if status:
        query = query.where(Property.status == status)
    if q:
        query = query.where(ApartmentComplex.name.like(f"%{q}%"))
    total = db.scalar(select(func.count()).select_from(query.subquery())) or 0
    rows = db.scalars(query.options(selectinload(Property.apartment), selectinload(Property.complex).selectinload(ApartmentComplex.region),
                                    selectinload(Property.images))
                      .order_by(Property.id.desc()).offset((page - 1) * size).limit(size)).all()
    latest = {}
    return {"items": [property_card(db, p, latest) for p in rows], "total": total}


@router.get("/properties/duplicates", summary="중복 의심 매물 (동일 평형·유형·가격·층)")
def duplicates(_: User = Depends(require_admin_view), db: Session = Depends(get_db)):
    return {"items": _duplicates(db)}


@router.post("/properties", status_code=201, summary="매물 등록")
def create_property(body: PropertyIn, request: Request, admin: User = Depends(require_admin_write), db: Session = Depends(get_db)):
    apt = db.get(Apartment, body.apartment_id)
    if not apt:
        raise HTTPException(404, "평형 정보를 찾을 수 없습니다.")
    prop = Property(**body.model_dump(), complex_id=apt.complex_id, source="admin")
    db.add(prop)
    db.flush()
    audit(db, admin, "property.create", f"property:{prop.id}", body.model_dump(), request)
    evaluate_alerts_for_complex(db, apt.complex_id)
    db.commit()
    return {"id": prop.id, "status": prop.status}


@router.put("/properties/{prop_id}", summary="매물 수정 (승인·반려 포함)")
def update_property(prop_id: int, body: PropertyUpdateIn, request: Request, admin: User = Depends(require_admin_write),
                    db: Session = Depends(get_db)):
    prop = db.get(Property, prop_id)
    if not prop:
        raise HTTPException(404, "매물을 찾을 수 없습니다.")
    changes = body.model_dump(exclude_unset=True)
    for k, v in changes.items():
        setattr(prop, k, v)
    audit(db, admin, "property.update", f"property:{prop.id}", changes, request)
    evaluate_alerts_for_complex(db, prop.complex_id)
    db.commit()
    return {"id": prop.id, "status": prop.status, "price": prop.price}


@router.delete("/properties/{prop_id}", summary="매물 삭제")
def delete_property(prop_id: int, request: Request, admin: User = Depends(require_admin_write), db: Session = Depends(get_db)):
    prop = db.get(Property, prop_id)
    if not prop:
        raise HTTPException(404, "매물을 찾을 수 없습니다.")
    audit(db, admin, "property.delete", f"property:{prop.id}", {"price": prop.price, "deal_type": prop.deal_type}, request)
    db.delete(prop)
    db.commit()
    return {"ok": True}


@router.get("/complexes/{complex_id}/types", summary="단지 평형 목록 (매물 등록용)")
def complex_types(complex_id: int, _: User = Depends(require_admin_view), db: Session = Depends(get_db)):
    return [{"id": a.id, "type_name": a.type_name, "area": a.exclusive_area}
            for a in db.scalars(select(Apartment).where(Apartment.complex_id == complex_id))]


# ---------------------------------------------------------------- 데이터 관제
@router.get("/data/sources", summary="데이터 출처·수집 상태")
def data_sources(_: User = Depends(require_admin_view), db: Session = Depends(get_db)):
    return [{"code": s.code, "name": s.name, "provider": s.provider, "url": s.url, "status": s.status, "notes": s.notes,
             "record_count": s.record_count, "last_synced_at": s.last_synced_at.isoformat() if s.last_synced_at else None}
            for s in db.scalars(select(DataSource).order_by(DataSource.id))]


@router.get("/data/logs", summary="데이터 수집 이력")
def data_logs(limit: int = Query(50, ge=1, le=200), _: User = Depends(require_admin_view), db: Session = Depends(get_db)):
    return [{"id": l.id, "source_code": l.source_code, "region_code": l.region_code, "period": l.period, "status": l.status,
             "fetched": l.fetched, "inserted": l.inserted, "duplicates": l.duplicates, "invalid": l.invalid, "error": l.error,
             "started_at": l.started_at.isoformat(), "finished_at": l.finished_at.isoformat() if l.finished_at else None}
            for l in db.scalars(select(DataCollectionLog).order_by(DataCollectionLog.id.desc()).limit(limit))]


def _after_data_change() -> None:
    with SessionLocal() as db:
        stats.refresh_regional_statistics(db)
        features.invalidate()
        prediction.invalidate()
        prediction.get_state(db)
    hub.broadcast({"type": "data_updated", "message": "실거래 데이터가 갱신되었습니다."})


def _run_collect(body: dict) -> None:
    with SessionLocal() as db:
        for ym in body["months"]:
            collector.collect(db, body["source"], body["region_code"], ym)
    _after_data_change()


@router.post("/data/collect", status_code=202, summary="국토교통부 실거래 수집 실행 (백그라운드)")
def collect(body: CollectIn, background: BackgroundTasks, request: Request, admin: User = Depends(require_admin_write),
            db: Session = Depends(get_db)):
    if any(len(m) != 6 or not m.isdigit() for m in body.months):
        raise HTTPException(422, "months 는 YYYYMM 형식이어야 합니다.")
    audit(db, admin, "data.collect", f"{body.source}:{body.region_code}", body.model_dump(), request)
    db.commit()
    if not settings.data_go_kr_api_key:
        log = collector.collect(db, body.source, body.region_code, body.months[0])
        return {"queued": False, "status": log.status, "message": log.error}
    background.add_task(_run_collect, body.model_dump())
    return {"queued": True, "message": f"{len(body.months)}개월 수집을 시작했습니다. 수집 이력에서 진행 상황을 확인하세요."}


@router.post("/data/refresh-stats", summary="지역 통계·AI 모델 재계산")
def refresh_stats(request: Request, admin: User = Depends(require_admin_write), db: Session = Depends(get_db)):
    audit(db, admin, "data.refresh_stats", "regional_statistics", request=request)
    db.commit()
    _after_data_change()
    return {"ok": True, "as_of": stats.as_of(db)}


@router.delete("/data/sample", summary="가상 샘플 데이터 일괄 삭제 (실데이터 전환 시)")
def purge_sample(request: Request, admin: User = Depends(require_admin_write), db: Session = Depends(get_db)):
    ids = list(db.scalars(select(ApartmentComplex.id).where(ApartmentComplex.source == "sample")))
    for model in (TransactionHistory, RentalHistory):
        db.execute(delete(model).where(model.source == "sample"))
    for model in (FavoriteProperty, PriceAlert, Property):
        db.execute(delete(model).where(model.complex_id.in_(ids)))
    db.execute(delete(PricePrediction).where(PricePrediction.complex_id.in_(ids)))
    db.execute(delete(Apartment).where(Apartment.complex_id.in_(ids)))
    db.execute(delete(ApartmentComplex).where(ApartmentComplex.id.in_(ids)))
    db.execute(delete(Infrastructure).where(Infrastructure.source == "sample"))
    audit(db, admin, "data.purge_sample", "sample", {"complexes": len(ids)}, request)
    db.commit()
    _after_data_change()
    return {"ok": True, "deleted_complexes": len(ids)}


# ---------------------------------------------------------------- AI 모델 관제
@router.get("/models", summary="AI 모델 버전·성능 이력")
def models(_: User = Depends(require_admin_view), db: Session = Depends(get_db)):
    info = prediction.model_info(db)
    rows = db.scalars(select(ModelVersion).order_by(ModelVersion.id.desc()).limit(20)).all()
    return {"active": info, "inference_ready": info.get("ready", False),
            "versions": [{"id": m.id, "kind": m.kind, "version": m.version, "algorithm": m.algorithm, "active": m.active,
                          "metrics": {k: v for k, v in (m.metrics or {}).items() if k != "feature_importance"},
                          "trained_rows": m.trained_rows, "data_as_of": m.data_as_of, "notes": m.notes,
                          "created_at": m.created_at.isoformat()} for m in rows],
            "predictions_logged": db.scalar(select(func.count(PricePrediction.id))) or 0}


@router.post("/models/retrain", summary="가격 예측 모델 재학습")
def retrain(request: Request, admin: User = Depends(require_admin_write), db: Session = Depends(get_db)):
    prediction.invalidate()
    features.invalidate()
    state = prediction.get_state(db)
    audit(db, admin, "model.retrain", state.get("version", "-"), {k: state.get("metrics", {}).get(k) for k in ("mae", "rmse", "mape", "r2")}, request)
    db.commit()
    return prediction.model_info(db)


@router.get("/anomalies", summary="이상 거래·지역 급변 탐지 결과")
def anomalies(_: User = Depends(require_admin_view), db: Session = Depends(get_db)):
    return {"transactions": anomaly.transaction_outliers(db, limit=100), "surges": anomaly.region_surges(db, months=12)}


# ---------------------------------------------------------------- 운영
@router.get("/audit-logs", summary="관리자 감사 로그")
def audit_logs(limit: int = Query(100, ge=1, le=500), user: User = Depends(require_admin_view), db: Session = Depends(get_db)):
    masked = is_masked(user)
    return [{"id": a.id, "actor": mask_email(a.actor_email) if masked and "@" in a.actor_email else a.actor_email, "role": a.role,
             "action": a.action, "target": a.target, "detail": a.detail, "ip": "***" if masked else a.ip,
             "created_at": a.created_at.isoformat()}
            for a in db.scalars(select(AuditLog).order_by(AuditLog.id.desc()).limit(limit))]


@router.get("/inquiries", summary="사용자 문의 목록")
def inquiries(user: User = Depends(require_admin_view), db: Session = Depends(get_db)):
    masked = is_masked(user)
    return [{"id": i.id, "name": mask_name(i.name) if masked else i.name, "email": mask_email(i.email) if masked else i.email,
             "category": i.category, "message": i.message, "status": i.status, "answer": i.answer,
             "created_at": i.created_at.isoformat()} for i in db.scalars(select(Inquiry).order_by(Inquiry.id.desc()).limit(100))]


@router.patch("/inquiries/{inquiry_id}", summary="문의 답변·상태 변경")
def answer_inquiry(inquiry_id: int, body: InquiryAnswerIn, request: Request, admin: User = Depends(require_admin_write),
                   db: Session = Depends(get_db)):
    item = db.get(Inquiry, inquiry_id)
    if not item:
        raise HTTPException(404, "문의를 찾을 수 없습니다.")
    item.status, item.answer = body.status, body.answer
    if item.user_id and body.answer:
        db.add(Notification(user_id=item.user_id, kind="inquiry", title="문의 답변이 등록되었습니다.", message=body.answer[:500]))
    audit(db, admin, "inquiry.answer", f"inquiry:{item.id}", {"status": body.status}, request)
    db.commit()
    return {"id": item.id, "status": item.status}


@router.post("/notifications/broadcast", status_code=201, summary="전체 공지 알림 발송")
def broadcast(body: BroadcastIn, request: Request, admin: User = Depends(require_admin_write), db: Session = Depends(get_db)):
    note = Notification(user_id=None, kind="notice", **body.model_dump())
    db.add(note)
    audit(db, admin, "notification.broadcast", body.title, request=request)
    db.commit()
    hub.broadcast({"type": "notification", "id": note.id, "title": note.title, "message": note.message, "link": note.link})
    return {"id": note.id}
