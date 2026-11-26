"""관심 매물 · 가격 알림 · 알림함 · 선호 조건 · 검색 조건 저장 · 문의"""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import or_, select, update
from sqlalchemy.orm import Session

from ..database import get_db
from ..dependencies import get_current_user, get_optional_user
from ..models import (Apartment, ApartmentComplex, FavoriteProperty, Inquiry, Notification, PriceAlert, Property,
                      SearchLog, User, UserPreference, utcnow)
from ..schemas import AlertIn, AlertUpdateIn, FavoriteIn, InquiryIn, PreferenceIn, SavedSearchIn
from ..services import stats
from ..services.common import evaluate_alert

router = APIRouter(prefix="/api", tags=["me"])


def _owned(db: Session, model, obj_id: int, user: User):
    obj = db.get(model, obj_id)
    if not obj or obj.user_id != user.id:
        raise HTTPException(404, "항목을 찾을 수 없습니다.")
    return obj


# ---------------------------------------------------------------- 관심 매물
@router.get("/favorites", summary="관심 아파트·매물 목록")
def favorites(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    rows = db.execute(select(FavoriteProperty, ApartmentComplex).join(ApartmentComplex, FavoriteProperty.complex_id == ApartmentComplex.id)
                      .where(FavoriteProperty.user_id == user.id).order_by(FavoriteProperty.id.desc())).all()
    names = stats.region_names(db)
    out = []
    for fav, c in rows:
        prop = db.get(Property, fav.property_id) if fav.property_id else None
        types = db.scalars(select(Apartment).where(Apartment.complex_id == c.id)).all()
        market = [{"type_name": a.type_name, "area": a.exclusive_area, **stats.apartment_market(db, a.id)} for a in types]
        out.append({"id": fav.id, "complex_id": c.id, "complex_name": c.name, "region": names.get(c.region_code, {}).get("name"),
                    "build_year": c.build_year, "households": c.households, "memo": fav.memo, "source": c.source,
                    "created_at": fav.created_at.isoformat(), "market": market,
                    "property": None if not prop else {"id": prop.id, "deal_type": prop.deal_type, "price": prop.price,
                                                       "monthly_rent": prop.monthly_rent, "floor": prop.floor, "status": prop.status}})
    return out


@router.post("/favorites", status_code=201, summary="관심 매물 등록")
def add_favorite(body: FavoriteIn, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    if not db.get(ApartmentComplex, body.complex_id):
        raise HTTPException(404, "단지를 찾을 수 없습니다.")
    q = select(FavoriteProperty).where(FavoriteProperty.user_id == user.id, FavoriteProperty.complex_id == body.complex_id,
                                       FavoriteProperty.property_id.is_(None) if body.property_id is None else FavoriteProperty.property_id == body.property_id)
    fav = db.scalar(q)
    if not fav:
        fav = FavoriteProperty(user_id=user.id, **body.model_dump())
        db.add(fav)
        db.commit()
    return {"id": fav.id, "complex_id": fav.complex_id, "property_id": fav.property_id}


@router.delete("/favorites/{fav_id}", summary="관심 매물 삭제")
def remove_favorite(fav_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    db.delete(_owned(db, FavoriteProperty, fav_id, user))
    db.commit()
    return {"ok": True}


# ---------------------------------------------------------------- 가격 알림
def _alert_out(db: Session, a: PriceAlert) -> dict:
    c = db.get(ApartmentComplex, a.complex_id)
    apt = db.get(Apartment, a.apartment_id) if a.apartment_id else None
    return {"id": a.id, "complex_id": a.complex_id, "complex_name": c.name if c else "", "apartment_id": a.apartment_id,
            "type_name": apt.type_name if apt else "전체 평형", "deal_type": a.deal_type, "condition": a.condition,
            "target_price": a.target_price, "active": a.active, "created_at": a.created_at.isoformat(),
            "last_triggered_at": a.last_triggered_at.isoformat() if a.last_triggered_at else None,
            "last_triggered_price": a.last_triggered_price}


@router.get("/alerts", summary="가격 알림 목록")
def alerts(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return [_alert_out(db, a) for a in db.scalars(select(PriceAlert).where(PriceAlert.user_id == user.id).order_by(PriceAlert.id.desc()))]


@router.post("/alerts", status_code=201, summary="가격 알림 등록 (등록 즉시 현재 호가로 1회 평가)")
def add_alert(body: AlertIn, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    if not db.get(ApartmentComplex, body.complex_id):
        raise HTTPException(404, "단지를 찾을 수 없습니다.")
    alert = PriceAlert(user_id=user.id, **body.model_dump())
    db.add(alert)
    db.flush()
    note = evaluate_alert(db, alert)
    db.commit()
    return {**_alert_out(db, alert), "triggered": bool(note)}


@router.patch("/alerts/{alert_id}", summary="가격 알림 수정")
def update_alert(alert_id: int, body: AlertUpdateIn, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    alert = _owned(db, PriceAlert, alert_id, user)
    for k, v in body.model_dump(exclude_unset=True).items():
        setattr(alert, k, v)
    alert.last_triggered_price = None
    evaluate_alert(db, alert)
    db.commit()
    return _alert_out(db, alert)


@router.delete("/alerts/{alert_id}", summary="가격 알림 삭제")
def delete_alert(alert_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    db.delete(_owned(db, PriceAlert, alert_id, user))
    db.commit()
    return {"ok": True}


# ---------------------------------------------------------------- 알림함
@router.get("/notifications", summary="내 알림 (개인 + 전체 공지)")
def notifications(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    rows = db.scalars(select(Notification).where(or_(Notification.user_id == user.id, Notification.user_id.is_(None)))
                      .order_by(Notification.id.desc()).limit(50)).all()
    return {"items": [{"id": n.id, "kind": n.kind, "title": n.title, "message": n.message, "link": n.link,
                       "read": n.read or n.user_id is None, "broadcast": n.user_id is None,
                       "created_at": n.created_at.isoformat()} for n in rows],
            "unread": sum(1 for n in rows if not n.read and n.user_id == user.id)}


@router.post("/notifications/read-all", summary="알림 모두 읽음")
def read_all(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    db.execute(update(Notification).where(Notification.user_id == user.id).values(read=True))
    db.commit()
    return {"ok": True}


# ---------------------------------------------------------------- 선호 조건 / 검색 조건
def _pref_out(p: UserPreference | None) -> dict:
    if not p:
        return {**PreferenceIn().model_dump(), "saved_searches": []}
    return {**{k: getattr(p, k) for k in PreferenceIn.model_fields}, "saved_searches": p.saved_searches or []}


@router.get("/me/preferences", summary="개인화 선호 조건")
def get_preferences(user: User = Depends(get_current_user)):
    return _pref_out(user.preference)


@router.put("/me/preferences", summary="개인화 선호 조건 저장")
def put_preferences(body: PreferenceIn, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    pref = user.preference or UserPreference(user_id=user.id, saved_searches=[])
    for k, v in body.model_dump().items():
        setattr(pref, k, v)
    db.add(pref)
    db.commit()
    return _pref_out(pref)


@router.post("/me/saved-searches", status_code=201, summary="검색 조건 저장")
def save_search(body: SavedSearchIn, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    pref = user.preference or UserPreference(user_id=user.id, saved_searches=[])
    items = [s for s in (pref.saved_searches or []) if s.get("name") != body.name]
    pref.saved_searches = ([{"name": body.name, "query": body.query, "saved_at": utcnow().isoformat()}] + items)[:10]
    db.add(pref)
    db.commit()
    return pref.saved_searches


@router.delete("/me/saved-searches/{name}", summary="저장한 검색 조건 삭제")
def delete_search(name: str, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    pref = user.preference
    if pref:
        pref.saved_searches = [s for s in (pref.saved_searches or []) if s.get("name") != name]
        db.commit()
    return pref.saved_searches if pref else []


@router.get("/me/recent-searches", summary="최근 검색 내역")
def recent_searches(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    rows = db.scalars(select(SearchLog).where(SearchLog.user_id == user.id).order_by(SearchLog.id.desc()).limit(10)).all()
    names = stats.region_names(db)
    return [{"id": r.id, "keyword": r.keyword, "region_code": r.region_code,
             "region": names.get(r.region_code, {}).get("name", ""), "deal_type": r.deal_type, "filters": r.filters,
             "created_at": r.created_at.isoformat()} for r in rows]


# ---------------------------------------------------------------- 고객센터 / 제휴 문의
@router.post("/inquiries", status_code=201, summary="고객센터·제휴 문의 접수")
def inquiry(body: InquiryIn, user: User | None = Depends(get_optional_user), db: Session = Depends(get_db)):
    item = Inquiry(user_id=user.id if user else None, **body.model_dump())
    db.add(item)
    db.commit()
    return {"id": item.id, "status": item.status}
