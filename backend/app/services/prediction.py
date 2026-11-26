"""AI 아파트 적정가격 추정 모델 (scikit-learn HistGradientBoosting).

- 타깃: log(㎡당 거래가) — 면적 규모 차이를 정규화
- 피처: 전용면적·층·경과연수·세대수·좌표·입지(역·학교·인프라 거리) + 지역 시세지수(직전 3개월, 누수 방지) + 단지 프리미엄(평활 타깃 인코딩)
- 검증: 시간 기준 분할(최근 3개월 holdout) → MAE·RMSE·MAPE·R², 80% 예측구간 포함률
- 구간: 분위수 회귀(10%·90%) 모델 + holdout 기반 분할 등각(conformal) 배율 보정으로 80% 포함률 목표
결과는 확정 시세가 아닌 통계적 추정치입니다.
"""
import threading
from datetime import date

import numpy as np
import pandas as pd
from sklearn.ensemble import HistGradientBoostingRegressor
from sqlalchemy import select, update
from sqlalchemy.orm import Session

from ..models import Apartment, ApartmentComplex, ModelVersion, PricePrediction
from . import features, stats
from .metrics import regression_metrics

ALGORITHM = "HistGradientBoostingRegressor (log ㎡당가) + Quantile(0.1/0.9)"
FEATURES = ["area", "floor", "age", "log_households", "lat", "lng", "d_subway", "d_school", "n_bus", "n_mart",
            "n_hospital", "n_park", "region_index", "complex_premium", "t"]
HOLDOUT_MONTHS = 3
LIMITATIONS = [
    "과거 실거래 데이터의 통계적 패턴을 학습한 추정치이며 미래 시세나 투자 수익을 보장하지 않습니다.",
    "금리·정책·개별 호실 상태(수리·조망·동 위치) 등 데이터에 없는 요인은 반영되지 않습니다.",
    "거래가 적은 단지·평형은 오차가 커질 수 있어 예측 범위를 함께 확인해야 합니다.",
]
_lock = threading.Lock()
_train_lock = threading.Lock()
_state: dict = {}


def _month_index(periods: pd.Series, base: pd.Period) -> pd.Series:
    return periods.apply(lambda p: (p - base).n)


def _prepare(db: Session) -> tuple[pd.DataFrame, dict]:
    trades = stats.trades_df(db).copy()
    cf = features.complex_features(db)
    if trades.empty:
        return trades, {}
    trades = trades[trades.dealing_type != "직거래"]  # 특수관계 거래 가능성이 높은 직거래는 학습에서 제외
    trades = trades.join(cf[["build_year", "households", "lat", "lng", "d_subway", "d_school", "n_bus", "n_mart",
                             "n_hospital", "n_park"]], on="complex_id")
    trades["mp"] = trades.deal_date.dt.to_period("M")
    base = trades.mp.min()
    trades["t"] = _month_index(trades.mp, base)
    trades["y"] = np.log(trades.ppm2)
    # 지역 시세지수: 직전 3개월(현재 월 제외) 지역 평균 log ㎡당가
    reg = trades.groupby(["region_code", "t"]).y.mean().rename("ry").reset_index()
    reg = reg.sort_values(["region_code", "t"])
    reg["region_index"] = reg.groupby("region_code").ry.transform(lambda s: s.shift(1).rolling(3, min_periods=1).mean())
    reg["region_index"] = reg.region_index.fillna(reg.ry)
    trades = trades.merge(reg[["region_code", "t", "region_index"]], on=["region_code", "t"], how="left")
    trades["age"] = (trades.deal_date.dt.year - trades.build_year).clip(lower=0)
    trades["log_households"] = np.log1p(trades.households.fillna(500))
    trades["floor"] = trades.floor.fillna(5)
    context = {"base": base, "reg": reg}
    return trades, context


def _premium(train: pd.DataFrame, m: float = 8.0) -> pd.Series:
    resid = train.y - train.region_index
    g = resid.groupby(train.complex_id).agg(["sum", "count"])
    return g["sum"] / (g["count"] + m)


def _fit(train: pd.DataFrame):
    X, y = train[FEATURES], train.y
    params = dict(max_iter=220, learning_rate=0.08, max_leaf_nodes=31, min_samples_leaf=20, l2_regularization=0.1,
                  random_state=42)
    point = HistGradientBoostingRegressor(**params).fit(X, y)
    lower = HistGradientBoostingRegressor(loss="quantile", quantile=0.1, **params).fit(X, y)
    upper = HistGradientBoostingRegressor(loss="quantile", quantile=0.9, **params).fit(X, y)
    return point, lower, upper


def train(db: Session) -> dict:
    data, ctx = _prepare(db)
    if len(data) < 200:
        return {"ready": False, "reason": "학습 가능한 실거래 데이터가 부족합니다 (200건 미만)."}
    cutoff = data.t.max() - HOLDOUT_MONTHS + 1
    tr, va = data[data.t < cutoff].copy(), data[data.t >= cutoff].copy()
    prem = _premium(tr)
    tr["complex_premium"], va["complex_premium"] = tr.complex_id.map(prem).fillna(0), va.complex_id.map(prem).fillna(0)
    point, lower, upper = _fit(tr)
    pred = np.exp(point.predict(va[FEATURES])) * va.area
    lo, hi = np.exp(lower.predict(va[FEATURES])) * va.area, np.exp(upper.predict(va[FEATURES])) * va.area
    metrics = regression_metrics(va.price, pred)
    baseline = regression_metrics(va.price, np.exp(va.region_index + va.complex_premium) * va.area)
    raw_coverage = float(((va.price >= lo) & (va.price <= hi)).mean())
    scale = _calibrate(va.price.to_numpy(), pred.to_numpy(), lo.to_numpy(), hi.to_numpy())
    lo_c, hi_c = pred - scale * (pred - lo), pred + scale * (hi - pred)
    metrics.update({"interval_coverage": round(float(((va.price >= lo_c) & (va.price <= hi_c)).mean()), 3),
                    "interval_coverage_raw": round(raw_coverage, 3), "interval_scale": round(scale, 2),
                    "baseline": baseline, "train_rows": int(len(tr)), "valid_rows": int(len(va)),
                    "valid_period": f"{va.mp.min()} ~ {va.mp.max()}"})
    # 운영 모델: 전체 데이터로 재학습
    prem_all = _premium(data)
    data["complex_premium"] = data.complex_id.map(prem_all).fillna(0)
    point, lower, upper = _fit(data)
    importance = _importance(point, va.assign(complex_premium=va.complex_id.map(prem_all).fillna(0)))
    as_of = stats.as_of(db)
    version = f"price-hgb-v1.{date.today():%Y%m%d}.{len(data)}"
    state = {"ready": True, "point": point, "lower": lower, "upper": upper, "premium": prem_all, "ctx": ctx,
             "data_t_max": int(data.t.max()), "version": version, "interval_scale": scale, "metrics": metrics, "as_of": as_of,
             "trained_rows": int(len(data)), "importance": importance,
             "region_latest": data.sort_values("t").groupby("region_code").region_index.last().to_dict(),
             "region_slope": _region_slope(ctx["reg"])}
    with _lock:
        _state.clear()
        _state.update(state)
    if not db.scalar(select(ModelVersion.id).where(ModelVersion.version == version)):
        db.execute(update(ModelVersion).where(ModelVersion.kind == "price").values(active=False))
        db.add(ModelVersion(kind="price", version=version, algorithm=ALGORITHM, trained_rows=len(data), data_as_of=as_of,
                            metrics={**metrics, "feature_importance": importance}, active=True,
                            notes="시간 기준 holdout(최근 3개월) 평가 후 전체 데이터로 재학습"))
        db.commit()
    return state


def _calibrate(y, pred, lo, hi, target: float = 0.8) -> float:
    """분할 등각(split-conformal) 보정: holdout 에서 목표 포함률을 만족하는 최소 구간 배율"""
    for scale in np.arange(1.0, 4.01, 0.05):
        if np.mean((y >= pred - scale * (pred - lo)) & (y <= pred + scale * (hi - pred))) >= target:
            return float(scale)
    return 4.0


def _importance(model, va: pd.DataFrame) -> list[dict]:
    """간이 순열 중요도 (holdout 일부 표본)"""
    sample = va.sample(min(len(va), 400), random_state=0)
    base = np.abs(model.predict(sample[FEATURES]) - sample.y).mean()
    rng = np.random.default_rng(0)
    out = []
    for f in FEATURES:
        shuffled = sample[FEATURES].copy()
        shuffled[f] = rng.permutation(shuffled[f].to_numpy())
        out.append({"feature": f, "importance": round(float(np.abs(model.predict(shuffled) - sample.y).mean() - base), 5)})
    return sorted(out, key=lambda x: -x["importance"])


def _region_slope(reg: pd.DataFrame) -> dict:
    """지역별 최근 6개월 log 시세 기울기 (월간) — 단기 추세 전망용"""
    out = {}
    for code, g in reg.groupby("region_code"):
        g = g.tail(6)
        out[code] = float(np.polyfit(g.t, g.ry, 1)[0]) if len(g) >= 3 else 0.0
    return out


def get_state(db: Session) -> dict:
    with _lock:
        if _state.get("ready"):
            return _state
    # 다른 스레드(기동 워밍업 등)가 학습 중이면 기다리지 않고 '준비 중' 반환 → 요청 지연 방지
    if not _train_lock.acquire(blocking=False):
        return {"ready": False, "reason": "AI 모델을 학습하는 중입니다. 잠시 후 다시 시도해 주세요."}
    try:
        with _lock:
            if _state.get("ready"):
                return _state
        return train(db)
    finally:
        _train_lock.release()


def invalidate() -> None:
    with _lock:
        _state.clear()


def model_info(db: Session) -> dict:
    s = get_state(db)
    if not s.get("ready"):
        return {"ready": False, "reason": s.get("reason")}
    return {"ready": True, "version": s["version"], "algorithm": ALGORITHM, "metrics": s["metrics"], "data_as_of": s["as_of"],
            "trained_rows": s["trained_rows"], "feature_importance": s["importance"], "limitations": LIMITATIONS}


def _rows_for(apt: Apartment, cf_row: pd.Series, s: dict, floors: list[int], year: int) -> pd.DataFrame:
    c = apt.complex
    return pd.DataFrame([{
        "area": apt.exclusive_area, "floor": f, "age": max(0, year - (c.build_year or year)),
        "log_households": np.log1p(c.households or 500), "lat": c.lat, "lng": c.lng,
        "d_subway": cf_row.get("d_subway"), "d_school": cf_row.get("d_school"), "n_bus": cf_row.get("n_bus", 0),
        "n_mart": cf_row.get("n_mart", 0), "n_hospital": cf_row.get("n_hospital", 0), "n_park": cf_row.get("n_park", 0),
        "region_index": s["region_latest"].get(c.region_code, np.mean(list(s["region_latest"].values()))),
        "complex_premium": float(s["premium"].get(c.id, 0.0)), "t": s["data_t_max"]} for f in floors])


def estimate(db: Session, apt: Apartment, floor: int | None = None) -> dict | None:
    """평형(apartment) 단위 적정가 추정. 모델 미준비 시 None"""
    s = get_state(db)
    if not s.get("ready"):
        return None
    cf = features.complex_features(db)
    cf_row = cf.loc[apt.complex_id] if apt.complex_id in cf.index else pd.Series(dtype=float)
    floor = floor or max(3, min(15, (apt.complex.max_floor or 15) // 2))
    year = int(s["as_of"][:4]) if s["as_of"] else date.today().year
    X = _rows_for(apt, cf_row, s, [floor], year)
    point = float(np.exp(s["point"].predict(X[FEATURES])[0]) * apt.exclusive_area)
    lo = float(np.exp(s["lower"].predict(X[FEATURES])[0]) * apt.exclusive_area)
    hi = float(np.exp(s["upper"].predict(X[FEATURES])[0]) * apt.exclusive_area)
    scale = s.get("interval_scale", 1.0)
    lo, hi = point - scale * max(point - lo, 0), point + scale * max(hi - point, 0)
    lo, hi = min(lo, point * 0.97), max(hi, point * 1.03)
    slope = s["region_slope"].get(apt.complex.region_code, 0.0)
    horizon = 3
    outlook = {"months": horizon, "monthly_trend_pct": round(slope * 100, 2),
               "price": int(round(point * np.exp(slope * horizon), -1)),
               "lower": int(round(lo * np.exp(slope * horizon - 0.01 * horizon), -1)),
               "upper": int(round(hi * np.exp(slope * horizon + 0.01 * horizon), -1))}
    mape = s["metrics"].get("mape") or 10
    confidence = "높음" if mape < 6 and (hi - lo) / point < 0.2 else "보통" if mape < 10 else "낮음"
    return {"price": int(round(point, -1)), "lower": int(round(lo, -1)), "upper": int(round(hi, -1)), "floor": floor,
            "confidence": confidence, "outlook": outlook, "model_version": s["version"], "data_as_of": s["as_of"],
            "target_period": f"{s['as_of'][:7]} 기준 적정가 · 향후 {horizon}개월 추세 전망" if s["as_of"] else "",
            "metrics": {k: s["metrics"].get(k) for k in ("mae", "rmse", "mape", "r2", "interval_coverage", "interval_coverage_raw")}}


def effects(db: Session, apt: Apartment) -> dict:
    """층수·경과연수 변화에 따른 추정가 민감도 (다른 조건 고정)"""
    s = get_state(db)
    if not s.get("ready"):
        return {}
    cf = features.complex_features(db)
    cf_row = cf.loc[apt.complex_id] if apt.complex_id in cf.index else pd.Series(dtype=float)
    year = int(s["as_of"][:4]) if s["as_of"] else date.today().year
    max_floor = apt.complex.max_floor or 25
    floors = sorted({1, 3, 5, 10, 15, 20, 25, 30} & set(range(1, max_floor + 1))) or [1]
    fx = _rows_for(apt, cf_row, s, floors, year)
    floor_curve = [{"floor": f, "price": int(round(float(np.exp(p) * apt.exclusive_area), -1))}
                   for f, p in zip(floors, s["point"].predict(fx[FEATURES]))]
    ages = [0, 5, 10, 15, 20, 25, 30]
    ax = pd.concat([_rows_for(apt, cf_row, s, [10], year).assign(age=a) for a in ages])
    age_curve = [{"age": a, "price": int(round(float(np.exp(p) * apt.exclusive_area), -1))}
                 for a, p in zip(ages, s["point"].predict(ax[FEATURES]))]
    return {"floor": floor_curve, "age": age_curve}


def predict_detail(db: Session, apt: Apartment, floor: int | None = None) -> dict:
    est = estimate(db, apt, floor)
    trades = stats.trades_df(db)
    t = trades[trades.apartment_id == apt.id].sort_values("deal_date")
    history = {}
    if len(t):
        end = t.deal_date.max()
        for label, months in (("3m", 3), ("6m", 6), ("12m", 12)):
            w = t[t.deal_date > end - pd.DateOffset(months=months)]
            prev = t[(t.deal_date <= end - pd.DateOffset(months=months)) & (t.deal_date > end - pd.DateOffset(months=2 * months))]
            history[label] = {"avg_price": int(w.price.mean()) if len(w) else None, "count": int(len(w)),
                              "change_pct": round((w.price.mean() / prev.price.mean() - 1) * 100, 2) if len(w) and len(prev) else None}
    recent = [{"price": int(r.price), "deal_date": r.deal_date.date().isoformat(), "floor": None if pd.isna(r.floor) else int(r.floor),
               "dealing_type": r.dealing_type} for r in t.tail(10).iloc[::-1].itertuples()]
    similar = similar_trades(db, apt)
    by_area = []
    for other in apt.complex.apartments:
        e = estimate(db, other)
        if e:
            by_area.append({"apartment_id": other.id, "type_name": other.type_name, "area": other.exclusive_area,
                            "price": e["price"], "ppm2": round(e["price"] / other.exclusive_area, 1)})
    if est:
        db.add(PricePrediction(apartment_id=apt.id, complex_id=apt.complex_id, model_version=est["model_version"],
                               floor=est["floor"], predicted_price=est["price"], lower_price=est["lower"],
                               upper_price=est["upper"], target_period=est["target_period"][:20], data_as_of=est["data_as_of"]))
        db.commit()
    return {"estimate": est, "history": history, "recent_trades": recent, "similar": similar, "by_area": by_area,
            "effects": effects(db, apt), "model": model_info(db), "meta": stats.meta(db),
            "disclaimer": "AI 추정 가격은 과거 실거래 기반 통계 추정치로, 미래 시세나 투자 수익을 보장하지 않는 참고용 정보입니다."}


def similar_trades(db: Session, apt: Apartment, limit: int = 6) -> list[dict]:
    """같은 지역·유사 면적(±10%) 다른 단지의 최근 6개월 거래 요약"""
    trades = stats.trades_df(db)
    c = apt.complex
    w = trades[(trades.region_code == c.region_code) & (trades.complex_id != c.id)
               & trades.area.between(apt.exclusive_area * 0.9, apt.exclusive_area * 1.1)]
    if w.empty:
        return []
    w = w[w.deal_date > w.deal_date.max() - pd.DateOffset(months=6)]
    names = dict(db.execute(select(ApartmentComplex.id, ApartmentComplex.name).where(ApartmentComplex.id.in_(w.complex_id.unique().tolist()))).all())
    years = dict(db.execute(select(ApartmentComplex.id, ApartmentComplex.build_year).where(ApartmentComplex.id.in_(w.complex_id.unique().tolist()))).all())
    g = w.groupby("complex_id").agg(avg_price=("price", "mean"), count=("id", "count"), area=("area", "mean"), last=("deal_date", "max"))
    g = g.sort_values("count", ascending=False).head(limit)
    return [{"complex_id": int(cid), "name": names.get(cid, ""), "build_year": years.get(cid), "avg_price": int(r.avg_price),
             "count": int(r["count"]), "area": round(float(r.area), 2), "last_deal": r["last"].date().isoformat()}
            for cid, r in g.iterrows()]
