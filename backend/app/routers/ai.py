from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from ..database import get_db
from ..dependencies import get_current_user, get_optional_user
from ..models import Apartment, ApartmentComplex, RecommendationHistory, User, UserPreference
from ..schemas import RecommendIn
from ..services import prediction, recommendation

router = APIRouter(prefix="/api/ai", tags=["ai"])


@router.get("/model", summary="가격 예측 모델 정보·성능 지표")
def model(db: Session = Depends(get_db)):
    return prediction.model_info(db)


@router.get("/predict/{apartment_id}", summary="AI 아파트 적정가격 추정")
def predict(apartment_id: int, floor: int | None = Query(None, ge=1, le=120), db: Session = Depends(get_db)):
    apt = db.scalar(select(Apartment).where(Apartment.id == apartment_id)
                    .options(selectinload(Apartment.complex).selectinload(ApartmentComplex.apartments),
                             selectinload(Apartment.complex).selectinload(ApartmentComplex.region)))
    if not apt:
        raise HTTPException(404, "평형 정보를 찾을 수 없습니다.")
    result = prediction.predict_detail(db, apt, floor)
    c = apt.complex
    result["apartment"] = {"id": apt.id, "complex_id": c.id, "complex_name": c.name, "region": c.region.full_name, "region_code": c.region_code,
                           "type_name": apt.type_name, "area": apt.exclusive_area, "build_year": c.build_year,
                           "max_floor": c.max_floor, "households": c.households, "source": c.source,
                           "types": [{"id": a.id, "type_name": a.type_name, "area": a.exclusive_area} for a in c.apartments]}
    return result


@router.post("/recommend", summary="맞춤형 매물 추천")
def recommend(body: RecommendIn, user: User | None = Depends(get_optional_user), db: Session = Depends(get_db)):
    cond = body.model_dump(exclude={"top_k", "save_preference"})
    result = recommendation.recommend(db, cond, body.top_k)
    if user and user.role == "user":
        db.add(RecommendationHistory(user_id=user.id, conditions=cond, model_version=recommendation.ALGORITHM_VERSION,
                                     results=[{k: r[k] for k in ("property_id", "complex_id", "complex_name", "score", "price",
                                                                  "monthly_rent", "deal_type", "area")} for r in result["results"]]))
        if body.save_preference:
            pref = user.preference or UserPreference(user_id=user.id)
            for k, v in cond.items():
                setattr(pref, k, v)
            db.add(pref)
        db.commit()
    return result


@router.get("/recommendations/history", summary="내 추천 이력")
def history(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    rows = db.scalars(select(RecommendationHistory).where(RecommendationHistory.user_id == user.id)
                      .order_by(RecommendationHistory.id.desc()).limit(20)).all()
    return [{"id": r.id, "conditions": r.conditions, "results": r.results, "model_version": r.model_version,
             "created_at": r.created_at.isoformat()} for r in rows]
