from datetime import date

import numpy as np
import pandas as pd
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func, select
from sqlalchemy.orm import Session, selectinload

from ..database import get_db
from ..dependencies import get_optional_user
from ..models import Apartment, ApartmentComplex, Property, Region, RentalHistory, SearchLog, TransactionHistory, User
from ..repositories import apartments as repo
from ..services import anomaly, features, prediction, stats
from ..services.geo import haversine_m

router = APIRouter(prefix="/api", tags=["apartments"])


def _latest_trades(db: Session) -> dict[int, dict]:
    t = stats.trades_df(db)
    if t.empty:
        return {}
    last = t.sort_values("deal_date").groupby("apartment_id").tail(1)
    return {int(r.apartment_id): {"price": int(r.price), "deal_date": r.deal_date.date().isoformat(),
                                  "floor": None if pd.isna(r.floor) else int(r.floor)} for r in last.itertuples()}


def _ai_price(db: Session, p: Property) -> dict | None:
    if p.deal_type == "sale":
        e = prediction.estimate(db, p.apartment)
        return e and {"price": e["price"], "lower": e["lower"], "upper": e["upper"], "kind": "AI 추정 적정 매매가"}
    m = stats.apartment_market(db, p.apartment_id)
    if p.deal_type == "jeonse" and m.get("jeonse_avg"):
        return {"price": m["jeonse_avg"], "kind": "최근 1년 전세 실거래 평균"}
    if p.deal_type == "monthly" and m.get("monthly_deposit_avg") is not None:
        return {"price": m["monthly_deposit_avg"], "monthly_rent": m.get("monthly_rent_avg"), "kind": "최근 1년 월세 실거래 평균"}
    return None


def property_card(db: Session, p: Property, latest: dict | None = None) -> dict:
    a, c = p.apartment, p.complex
    latest = latest if latest is not None else _latest_trades(db)
    return {"id": p.id, "complex_id": c.id, "apartment_id": a.id, "complex_name": c.name, "region": c.region.full_name,
            "region_code": c.region_code, "address": c.address, "deal_type": p.deal_type, "price": p.price,
            "monthly_rent": p.monthly_rent, "area": a.exclusive_area, "supply_area": a.supply_area, "type_name": a.type_name,
            "rooms": a.rooms, "bathrooms": a.bathrooms, "floor": p.floor, "max_floor": c.max_floor, "direction": p.direction,
            "build_year": c.build_year, "households": c.households, "lat": c.lat, "lng": c.lng, "agency": p.agency,
            "description": p.description, "status": p.status, "registered_at": p.registered_at.isoformat(),
            "recent_trade": latest.get(a.id), "ai_price": _ai_price(db, p), "source": p.source,
            "images": [i.url for i in p.images], "price_kind": "매물 호가 (등록 가격)"}


@router.get("/regions", summary="시군구 목록 (데이터 보유 여부 포함)")
def regions(db: Session = Depends(get_db)):
    counts = dict(db.execute(select(ApartmentComplex.region_code, func.count(ApartmentComplex.id)).group_by(ApartmentComplex.region_code)).all())
    return [{"code": r.code, "sido": r.sido, "sigungu": r.sigungu, "name": r.full_name, "lat": r.lat, "lng": r.lng,
             "complexes": int(counts.get(r.code, 0))} for r in db.scalars(select(Region).order_by(Region.code))]


@router.get("/apartments", summary="단지 목록 (지역·이름) + 평형")
def list_complexes(region: str | None = Query(None, max_length=5), q: str | None = Query(None, max_length=40),
                   limit: int = Query(100, ge=1, le=300), db: Session = Depends(get_db)):
    query = select(ApartmentComplex).options(selectinload(ApartmentComplex.apartments), selectinload(ApartmentComplex.region))
    if region:
        query = query.where(ApartmentComplex.region_code == region)
    if q:
        query = query.where(ApartmentComplex.name.like(f"%{q.strip()}%"))
    rows = db.scalars(query.order_by(ApartmentComplex.name).limit(limit)).all()
    return [{"id": c.id, "name": c.name, "region": c.region.full_name, "region_code": c.region_code, "build_year": c.build_year,
             "source": c.source, "types": [{"id": a.id, "type_name": a.type_name, "area": a.exclusive_area} for a in c.apartments]}
            for c in rows]


@router.get("/apartments/suggest", summary="단지명·지역 자동완성")
def suggest(q: str = Query(min_length=1, max_length=40), db: Session = Depends(get_db)):
    like = f"%{q.strip()}%"
    complexes = db.execute(select(ApartmentComplex.id, ApartmentComplex.name, Region.sido, Region.sigungu)
                           .join(Region, ApartmentComplex.region_code == Region.code)
                           .where(ApartmentComplex.name.like(like)).limit(8)).all()
    regions_ = db.scalars(select(Region).where(Region.sigungu.like(like) | Region.sido.like(like)).limit(5)).all()
    return {"complexes": [{"id": c.id, "name": c.name, "region": f"{c.sido} {c.sigungu}"} for c in complexes],
            "regions": [{"code": r.code, "name": r.full_name} for r in regions_]}


@router.get("/apartments/search", summary="아파트 매물 통합 검색 (등록 매물 = 호가)")
def search(q: str | None = Query(None, max_length=40), region: str | None = Query(None, max_length=5),
           sido: str | None = None, deal_type: str | None = Query(None, pattern="^(sale|jeonse|monthly)$"),
           price_min: int | None = None, price_max: int | None = None, rent_max: int | None = None,
           area_min: float | None = None, area_max: float | None = None,
           build_year_min: int | None = None, build_year_max: int | None = None, rooms_min: int | None = None,
           sort: str = Query("recent", pattern="^(recent|price_asc|price_desc|area_desc|area_asc|build_year_desc)$"),
           page: int = Query(1, ge=1), size: int = Query(12, ge=1, le=50),
           user: User | None = Depends(get_optional_user), db: Session = Depends(get_db)):
    f = {k: v for k, v in locals().items() if k not in {"db", "user", "page", "size"}}
    rows, total = repo.search_properties(db, f, page, size)
    if q or region:
        db.add(SearchLog(user_id=user.id if user else None, keyword=(q or "")[:100], region_code=region or "",
                         deal_type=deal_type or "", filters={k: v for k, v in f.items() if v not in (None, "")}))
        db.commit()
    latest = _latest_trades(db)
    return {"items": [property_card(db, p, latest) for p in rows], "total": total, "page": page, "size": size,
            "pages": max(1, -(-total // size)), "meta": stats.meta(db)}


@router.get("/transactions/search", summary="실거래가 조회 (국토교통부 실거래 = 계약 완료 가격)")
def search_transactions(q: str | None = Query(None, max_length=40), region: str | None = Query(None, max_length=5),
                        price_min: int | None = None, price_max: int | None = None, area_min: float | None = None,
                        area_max: float | None = None, date_from: date | None = None, date_to: date | None = None,
                        page: int = Query(1, ge=1), size: int = Query(20, ge=1, le=100), db: Session = Depends(get_db)):
    f = {k: v for k, v in locals().items() if k not in {"db", "page", "size"}}
    rows, total = repo.search_transactions(db, f, page, size)
    return {"items": [{"id": t.id, "complex_id": t.complex_id, "complex_name": name, "region": f"{sido} {sigungu}",
                       "area": t.exclusive_area, "floor": t.floor, "price": t.price, "deal_date": t.deal_date.isoformat(),
                       "dealing_type": t.dealing_type, "source": t.source} for t, name, sido, sigungu in rows],
            "total": total, "page": page, "size": size, "pages": max(1, -(-total // size)), "meta": stats.meta(db)}


@router.get("/apartments/map", summary="지도 영역 내 단지 마커")
def map_complexes(sw_lat: float, sw_lng: float, ne_lat: float, ne_lng: float,
                  deal_type: str | None = Query(None, pattern="^(sale|jeonse|monthly)$"), db: Session = Depends(get_db)):
    complexes = repo.complexes_in_bounds(db, sw_lat, sw_lng, ne_lat, ne_lng)
    ids = [c.id for c in complexes]
    trades = stats.trades_df(db)
    recent = trades[trades.complex_id.isin(ids) & (trades.deal_date > trades.deal_date.max() - pd.DateOffset(months=12))] if len(trades) else trades
    rep = {}
    for cid, g in recent.groupby("complex_id"):
        near84 = g.iloc[(g.area - 84).abs().argsort()]
        area = near84.area.iloc[0]
        same = g[g.area == area]
        rep[cid] = {"price": int(same.price.mean()), "area": float(area), "ppm2": round(float(g.price.sum() / g.area.sum()), 1)}
    q = select(Property.complex_id, Property.deal_type, func.count(Property.id), func.min(Property.price)).where(
        Property.status == "approved", Property.complex_id.in_(ids)).group_by(Property.complex_id, Property.deal_type)
    listing = {}
    for cid, dt, n, mn in db.execute(q).all():
        listing.setdefault(cid, {})[dt] = {"count": int(n), "min_price": int(mn)}
    out = []
    for c in complexes:
        lst = listing.get(c.id, {})
        if deal_type and deal_type not in lst:
            continue
        out.append({"id": c.id, "name": c.name, "lat": c.lat, "lng": c.lng, "region": c.region.full_name,
                    "build_year": c.build_year, "households": c.households, "geo_precise": c.geo_precise,
                    "recent": rep.get(c.id), "listings": lst, "listing_count": sum(v["count"] for v in lst.values()),
                    "source": c.source})
    return {"items": out, "meta": stats.meta(db)}


@router.get("/infrastructure", summary="주변 생활 인프라 (지도 레이어)")
def infrastructure(lat: float, lng: float, radius: int = Query(1500, ge=100, le=5000), db: Session = Depends(get_db)):
    return {"items": features.nearby_infra(db, lat, lng, radius, limit_per_category=20)}


@router.get("/apartments/{complex_id}", summary="아파트 단지 상세")
def complex_detail(complex_id: int, db: Session = Depends(get_db)):
    c = db.scalar(select(ApartmentComplex).where(ApartmentComplex.id == complex_id)
                  .options(selectinload(ApartmentComplex.apartments), selectinload(ApartmentComplex.region)))
    if not c:
        raise HTTPException(404, "단지를 찾을 수 없습니다.")
    latest = _latest_trades(db)
    listings = db.scalars(select(Property).where(Property.complex_id == c.id, Property.status == "approved")
                          .options(selectinload(Property.apartment), selectinload(Property.complex).selectinload(ApartmentComplex.region),
                                   selectinload(Property.images)).order_by(Property.deal_type, Property.price)).all()
    types = [{"id": a.id, "type_name": a.type_name, "area": a.exclusive_area, "supply_area": a.supply_area, "rooms": a.rooms,
              "bathrooms": a.bathrooms, "market": stats.apartment_market(db, a.id), "estimate": prediction.estimate(db, a)}
             for a in c.apartments]
    trades = db.scalars(select(TransactionHistory).where(TransactionHistory.complex_id == c.id)
                        .order_by(TransactionHistory.deal_date.desc()).limit(30)).all()
    rents = db.scalars(select(RentalHistory).where(RentalHistory.complex_id == c.id)
                       .order_by(RentalHistory.deal_date.desc()).limit(30)).all()
    cf = features.complex_features(db)
    scores = features.scores_for(cf.loc[c.id]) if c.id in cf.index else {}
    others = db.scalars(select(ApartmentComplex).where(ApartmentComplex.region_code == c.region_code, ApartmentComplex.id != c.id)).all()
    t = stats.trades_df(db)
    recent = t[t.deal_date > t.deal_date.max() - pd.DateOffset(months=12)] if len(t) else t
    ppm2 = (recent.groupby("complex_id").price.sum() / recent.groupby("complex_id").area.sum()) if len(recent) else pd.Series(dtype=float)
    nearby = sorted(({"id": o.id, "name": o.name, "build_year": o.build_year, "households": o.households,
                      "distance_m": int(haversine_m(c.lat, c.lng, o.lat, o.lng)),
                      "ppm2": None if o.id not in ppm2.index else round(float(ppm2[o.id]), 1)} for o in others),
                    key=lambda x: x["distance_m"])[:6]
    return {
        "complex": {"id": c.id, "name": c.name, "complex_code": c.complex_code, "region": c.region.full_name,
                    "region_code": c.region_code, "dong": c.dong, "address": c.address, "lat": c.lat, "lng": c.lng,
                    "geo_precise": c.geo_precise, "build_year": c.build_year, "households": c.households,
                    "max_floor": c.max_floor, "age": date.today().year - c.build_year if c.build_year else None,
                    "source": c.source, "ppm2_12m": None if c.id not in ppm2.index else round(float(ppm2[c.id]), 1)},
        "types": types, "listings": [property_card(db, p, latest) for p in listings],
        "series": stats.complex_series(db, c.id),
        "trades": [{"id": x.id, "apartment_id": x.apartment_id, "area": x.exclusive_area, "floor": x.floor, "price": x.price,
                    "deal_date": x.deal_date.isoformat(), "dealing_type": x.dealing_type, "canceled": x.canceled,
                    "source": x.source} for x in trades],
        "rents": [{"id": x.id, "apartment_id": x.apartment_id, "area": x.exclusive_area, "floor": x.floor, "deposit": x.deposit,
                   "monthly_rent": x.monthly_rent, "contract_type": x.contract_type, "deal_date": x.deal_date.isoformat(),
                   "source": x.source} for x in rents],
        "infrastructure": features.nearby_infra(db, c.lat, c.lng), "scores": scores,
        "distances": {k: (None if np.isnan(v) else int(v)) for k, v in cf.loc[c.id].items() if k.startswith("d_")} if c.id in cf.index else {},
        "nearby": nearby, "anomalies": anomaly.transaction_outliers(db, c.id, limit=10), "meta": stats.meta(db),
    }


@router.get("/properties/{property_id}", summary="매물 상세")
def property_detail(property_id: int, db: Session = Depends(get_db)):
    p = db.scalar(select(Property).where(Property.id == property_id)
                  .options(selectinload(Property.apartment), selectinload(Property.complex).selectinload(ApartmentComplex.region),
                           selectinload(Property.images)))
    if not p or p.status != "approved":
        raise HTTPException(404, "매물을 찾을 수 없습니다.")
    return property_card(db, p)


@router.get("/apartments/{complex_id}/types/{apartment_id}", summary="평형 정보")
def apartment_type(complex_id: int, apartment_id: int, db: Session = Depends(get_db)):
    a = db.get(Apartment, apartment_id)
    if not a or a.complex_id != complex_id:
        raise HTTPException(404, "평형 정보를 찾을 수 없습니다.")
    return {"id": a.id, "type_name": a.type_name, "area": a.exclusive_area, "market": stats.apartment_market(db, a.id)}
