"""단지 단위 입지·생활 인프라 피처 (가격 예측·추천·상세 화면 공통)."""
import threading

import numpy as np
import pandas as pd
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..models import ApartmentComplex, Infrastructure
from .geo import haversine_m

CATEGORY_LABEL = {"subway": "지하철역", "bus": "버스정류장", "school": "학교", "hospital": "병원", "pharmacy": "약국",
                  "mart": "대형마트", "park": "공원", "culture": "문화시설"}
_lock = threading.Lock()
_cache: dict[str, pd.DataFrame] = {}


def invalidate() -> None:
    with _lock:
        _cache.clear()


def infra_frame(db: Session) -> pd.DataFrame:
    rows = db.execute(select(Infrastructure.id, Infrastructure.region_code, Infrastructure.category, Infrastructure.name,
                             Infrastructure.lat, Infrastructure.lng, Infrastructure.source)).all()
    return pd.DataFrame(rows, columns=["id", "region_code", "category", "name", "lat", "lng", "source"])


def complex_features(db: Session) -> pd.DataFrame:
    """index=complex_id. 거리(m)·반경 내 시설 수·인프라 데이터 보유 여부."""
    with _lock:
        if "complex" in _cache:
            return _cache["complex"]
    rows = db.execute(select(ApartmentComplex.id, ApartmentComplex.region_code, ApartmentComplex.lat, ApartmentComplex.lng,
                             ApartmentComplex.build_year, ApartmentComplex.households, ApartmentComplex.max_floor,
                             ApartmentComplex.source)).all()
    df = pd.DataFrame(rows, columns=["complex_id", "region_code", "lat", "lng", "build_year", "households", "max_floor",
                                     "source"]).set_index("complex_id")
    infra = infra_frame(db)
    for category in CATEGORY_LABEL:
        pts = infra[infra.category == category][["lat", "lng"]].to_numpy()
        if len(df) and len(pts):
            dist = haversine_m(df.lat.to_numpy()[:, None], df.lng.to_numpy()[:, None], pts[:, 0][None, :], pts[:, 1][None, :])
            df[f"d_{category}"] = dist.min(axis=1).round(0)
            radius = {"bus": 500, "school": 800}.get(category, 1000)
            df[f"n_{category}"] = (dist <= radius).sum(axis=1)
        else:
            df[f"d_{category}"] = np.nan
            df[f"n_{category}"] = 0
    df["infra_available"] = df.region_code.isin(set(infra.region_code))
    with _lock:
        _cache["complex"] = df
    return df


def nearby_infra(db: Session, lat: float, lng: float, radius: float = 1500, limit_per_category: int = 3) -> list[dict]:
    infra = infra_frame(db)
    if infra.empty:
        return []
    infra["distance"] = haversine_m(lat, lng, infra.lat.to_numpy(), infra.lng.to_numpy()).round(0)
    near = infra[infra.distance <= radius].sort_values("distance")
    out = []
    for category, group in near.groupby("category", sort=False):
        for row in group.head(limit_per_category).itertuples():
            out.append({"id": int(row.id), "category": category, "category_label": CATEGORY_LABEL.get(category, category),
                        "name": row.name, "lat": row.lat, "lng": row.lng, "distance_m": int(row.distance),
                        "walk_min": max(1, round(row.distance / 67)), "source": row.source})
    return sorted(out, key=lambda x: x["distance_m"])


def scores_for(row: pd.Series) -> dict:
    """0~100 입지 점수 (교통·학군·생활 인프라). 인프라 데이터가 없는 지역은 None."""
    if not bool(row.get("infra_available", False)):
        return {"transport": None, "school": None, "infra": None}
    d_sub = row.get("d_subway", np.nan)
    transport = 0.0 if pd.isna(d_sub) else float(np.clip((2000 - d_sub) / 1700, 0, 1) * 85)
    transport += min(15, 3 * int(row.get("n_bus", 0)))
    d_school = row.get("d_school", np.nan)
    school = (0.0 if pd.isna(d_school) else float(np.clip((1500 - d_school) / 1200, 0, 1) * 60)) + min(40, 14 * int(row.get("n_school", 0)))
    infra = sum(min(w, w * int(row.get(f"n_{c}", 0)) / k) for c, w, k in
                (("hospital", 25, 2), ("pharmacy", 15, 2), ("mart", 25, 1), ("park", 20, 1), ("culture", 15, 1)))
    return {"transport": round(min(transport, 100), 1), "school": round(min(school, 100), 1), "infra": round(min(infra, 100), 1)}
