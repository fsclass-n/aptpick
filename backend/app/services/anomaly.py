"""가격 이상치 및 지역 급등·급락 탐지.

- 거래 이상치: 같은 평형의 ±3개월 이웃 거래 ㎡당가 중앙값 대비 robust z-score(MAD) |z| ≥ 3.5 이면서 편차 ±15% 이상
  (층·향 차이로 인한 정상 편차(약 ±10%)를 오탐하지 않도록 최소 편차 조건 병행 — ai/anomaly_detection 평가 결과 반영)
- 지역 급등·급락: 3개월 이동평균 기준 전월 대비 ±1.5% 이상 변동
"""
import numpy as np
import pandas as pd
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..models import ApartmentComplex
from . import stats

Z_THRESHOLD = 3.5
MIN_DEVIATION = 0.15
SURGE_THRESHOLD = 1.5


def transaction_outliers(db: Session, complex_id: int | None = None, limit: int = 50) -> list[dict]:
    trades = stats.trades_df(db)
    if complex_id is not None:
        trades = trades[trades.complex_id == complex_id]
    if trades.empty:
        return []
    out = []
    for apt_id, g in trades.groupby("apartment_id"):
        if len(g) < 8:
            continue
        g = g.sort_values("deal_date")
        dates, values = g.deal_date.to_numpy(), g.ppm2.to_numpy()
        window = np.timedelta64(92, "D")
        for i, (d, v) in enumerate(zip(dates, values)):
            mask = (np.abs(dates - d) <= window)
            mask[i] = False
            neighbors = values[mask]
            if len(neighbors) < 4:
                continue
            med = np.median(neighbors)
            mad = np.median(np.abs(neighbors - med)) * 1.4826 or med * 0.02
            z = (v - med) / mad
            if abs(z) >= Z_THRESHOLD and abs(v / med - 1) >= MIN_DEVIATION:
                row = g.iloc[i]
                out.append({"transaction_id": int(row.id), "complex_id": int(row.complex_id), "apartment_id": int(apt_id),
                            "area": float(row.area), "floor": None if pd.isna(row.floor) else int(row.floor),
                            "price": int(row.price), "expected_price": int(med * row.area), "z_score": round(float(z), 2),
                            "deviation_pct": round(float((v / med - 1) * 100), 1), "deal_date": row.deal_date.date().isoformat(),
                            "dealing_type": row.dealing_type, "source": row.source,
                            "reason": "직거래 · 시세 대비 큰 편차" if row.dealing_type == "직거래" else "주변 거래 대비 큰 편차"})
    names = dict(db.execute(select(ApartmentComplex.id, ApartmentComplex.name)).all())
    for o in out:
        o["complex_name"] = names.get(o["complex_id"], "")
    return sorted(out, key=lambda o: (o["deal_date"], abs(o["z_score"])), reverse=True)[:limit]


def region_surges(db: Session, months: int = 6) -> list[dict]:
    df, names = stats.stats_df(db), stats.region_names(db)
    if df.empty:
        return []
    recent_periods = sorted(df.period.unique())[-months:]
    w = df[df.period.isin(recent_periods) & (df.mom.abs() >= SURGE_THRESHOLD)]
    return [{"region_code": r.region_code, "region": names.get(r.region_code, {}).get("name", r.region_code), "period": r.period,
             "mom": round(float(r.mom), 2), "kind": "급등" if r.mom > 0 else "급락", "volume": int(r.volume)}
            for r in w.sort_values("period", ascending=False).itertuples()]
