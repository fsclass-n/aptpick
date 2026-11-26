from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import SearchLog
from ..services import anomaly, stats

router = APIRouter(prefix="/api/market", tags=["market"])


@router.get("/overview", summary="전국(분석 대상 지역) 시장 개요")
def overview(db: Session = Depends(get_db)):
    return stats.overview(db)


@router.get("/regions", summary="지역별 최신 시장 지표")
def regions(db: Session = Depends(get_db)):
    return {"items": stats.region_latest(db), "meta": stats.meta(db)}


@router.get("/regions/{code}", summary="지역 상세 분석 (월·분기·연 변동, 거래량, 전세가율, 평형 분포, 변동성)")
def region_detail(code: str, db: Session = Depends(get_db)):
    detail = stats.region_detail(db, code)
    if not detail:
        raise HTTPException(404, "지역을 찾을 수 없습니다.")
    return detail


@router.get("/heatmap", summary="지역 × 월 가격 변동률 히트맵")
def heatmap(months: int = Query(12, ge=3, le=36), db: Session = Depends(get_db)):
    return stats.heatmap(db, months)


@router.get("/compare", summary="지역 비교")
def compare(codes: str = Query(..., description="콤마 구분 시군구 코드 (최대 4)"), db: Session = Depends(get_db)):
    out = []
    for code in [c.strip() for c in codes.split(",") if c.strip()][:4]:
        d = stats.region_detail(db, code)
        if d and d.get("has_data"):
            out.append({"region": d["region"], "monthly": d["monthly"], "indicators": d["indicators"]})
    return {"items": out, "meta": stats.meta(db)}


@router.get("/recent-transactions", summary="최근 수집 실거래")
def recent(limit: int = Query(20, ge=1, le=100), region: str | None = None, db: Session = Depends(get_db)):
    return {"items": stats.recent_transactions(db, limit, region), "meta": stats.meta(db)}


@router.get("/popular-regions", summary="인기 검색 지역")
def popular(db: Session = Depends(get_db)):
    names = stats.region_names(db)
    rows = db.execute(select(SearchLog.region_code, func.count(SearchLog.id)).where(SearchLog.region_code != "")
                      .group_by(SearchLog.region_code).order_by(func.count(SearchLog.id).desc()).limit(8)).all()
    items = [{"code": code, "name": names.get(code, {}).get("name", code), "count": int(n)} for code, n in rows]
    if len(items) < 6:  # 검색 이력이 적을 때는 최근 3개월 거래량 상위 지역으로 보완
        seen = {i["code"] for i in items}
        for r in sorted(stats.region_latest(db), key=lambda r: -r["volume_3m"]):
            if r["code"] not in seen and len(items) < 8:
                items.append({"code": r["code"], "name": r["name"], "count": 0, "by": "거래량"})
    return {"items": items}


@router.get("/anomalies", summary="지역 급등·급락 및 이상 거래")
def anomalies(db: Session = Depends(get_db)):
    return {"surges": anomaly.region_surges(db), "transactions": anomaly.transaction_outliers(db, limit=20),
            "meta": stats.meta(db), "method": {"transaction": f"robust z-score |z| ≥ {anomaly.Z_THRESHOLD} · 편차 ±{int(anomaly.MIN_DEVIATION * 100)}% 이상",
                                               "region": f"3개월 이동평균 전월 대비 ±{anomaly.SURGE_THRESHOLD}%"}}
