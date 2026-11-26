"""사용자 조건 기반 맞춤형 매물 추천.

1) 조건 수집 → 2) 매물 필터링(거래유형·면적·방·준공연도·예산 +5% 허용) → 3) 예산·지역 적합도
4) 입지·생활 인프라 → 5) 가격 경쟁력(호가 vs AI 적정가/최근 전세 시세) → 6) 목적별 가중치 × 사용자 중요도
7) 추천 점수 → 8) 상위 K개 + 추천 근거·주의 사항.
상승률은 투자 목적에서도 가중치 일부(상한 적용)로만 반영하고 변동성·전세가율 위험을 함께 고려합니다.
※ frontend/src/mock/recommend.js 가 같은 가중치 규칙을 사용합니다 (변경 시 함께 수정).
"""
import numpy as np
import pandas as pd
from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from ..models import Apartment, ApartmentComplex, Property
from . import features, prediction, stats

ALGORITHM_VERSION = "recommend-weighted-v1"
BASE_WEIGHTS = {
    "residence": {"budget": 0.20, "region": 0.15, "transport": 0.15, "school": 0.10, "infra": 0.12, "price": 0.18,
                  "momentum": 0.0, "liquidity": 0.05, "stability": 0.05},
    "investment": {"budget": 0.15, "region": 0.10, "transport": 0.08, "school": 0.04, "infra": 0.04, "price": 0.24,
                   "momentum": 0.12, "liquidity": 0.13, "stability": 0.10},
}
USER_WEIGHT_KEYS = {"transport": "transport_weight", "school": "school_weight", "infra": "infra_weight"}
LABEL = {"budget": "예산 적합도", "region": "지역 적합도", "transport": "교통 접근성", "school": "학군", "infra": "생활 인프라",
         "price": "가격 경쟁력", "momentum": "시세 흐름", "liquidity": "거래 활발도", "stability": "가격 안정성"}


def _budget_score(cost: float, lo: float | None, hi: float | None) -> float:
    if hi and cost > hi:
        return max(0.0, 55 - (cost / hi - 1) * 600)  # 최대 5% 초과까지만 후보 유지
    if lo and cost < lo:
        return max(40.0, 80 - (1 - cost / lo) * 100)
    if hi:
        lo = lo or 0
        mid, half = (lo + hi) / 2, max(1.0, (hi - lo) / 2)
        return 85 + 15 * (1 - min(1.0, abs(cost - mid) / half))
    return 80.0


def _price_score(ask: float, fair: float | None) -> float | None:
    if not fair:
        return None
    return float(np.clip(50 + (1 - ask / fair) * 400, 0, 100))  # 적정가 대비 -12.5% → 100, +12.5% → 0


def _region_market(db: Session) -> dict:
    df = stats.stats_df(db)
    out = {}
    for code, g in df.groupby("region_code"):
        ret = g.ma3.pct_change().dropna().tail(12)
        out[code] = {"yoy": float(g.yoy.iloc[-1]) if not pd.isna(g.yoy.iloc[-1]) else 0.0,
                     "volatility": float(ret.std() * 100) if len(ret) > 2 else 1.0,
                     "jeonse_ratio": float(g.jeonse_ratio.tail(3).mean()) if g.jeonse_ratio.notna().any() else None}
    return out


def recommend(db: Session, cond: dict, top_k: int = 10) -> dict:
    deal_type = cond.get("deal_type", "sale")
    purpose = cond.get("purpose", "residence") if cond.get("purpose") in BASE_WEIGHTS else "residence"
    regions = [r for r in cond.get("region_codes") or [] if r]
    q = (select(Property).join(Apartment, Property.apartment_id == Apartment.id)
         .where(Property.status == "approved", Property.deal_type == deal_type)
         .options(selectinload(Property.apartment).selectinload(Apartment.complex).selectinload(ApartmentComplex.apartments)))
    if cond.get("area_min"):
        q = q.where(Apartment.exclusive_area >= cond["area_min"])
    if cond.get("area_max"):
        q = q.where(Apartment.exclusive_area <= cond["area_max"])
    if cond.get("rooms_min"):
        q = q.where(Apartment.rooms >= cond["rooms_min"])
    props = db.scalars(q).all()
    if cond.get("build_year_min"):
        props = [p for p in props if (p.apartment.complex.build_year or 0) >= cond["build_year_min"]]
    budget_max = cond.get("budget_max")
    monthly_max = cond.get("monthly_max")
    candidates = [p for p in props if not budget_max or p.price <= budget_max * 1.05]
    if monthly_max and deal_type == "monthly":
        candidates = [p for p in candidates if p.monthly_rent <= monthly_max * 1.05]
    region_sido = {stats.region_names(db).get(r, {}).get("sido") for r in regions}
    cf = features.complex_features(db)
    market = _region_market(db)
    trades = stats.trades_df(db)
    recent = trades[trades.deal_date > trades.deal_date.max() - pd.DateOffset(months=12)] if len(trades) else trades
    liquidity = recent.groupby("complex_id").size() / recent.groupby("complex_id").size().max() * 100 if len(recent) else pd.Series(dtype=float)
    weights = dict(BASE_WEIGHTS[purpose])
    for key, field in USER_WEIGHT_KEYS.items():
        weights[key] *= (cond.get(field) or 3) / 3
    names = stats.region_names(db)
    fair_cache: dict[int, dict | None] = {}
    results = []
    for p in candidates:
        apt, c = p.apartment, p.apartment.complex
        if regions and c.region_code not in regions and names.get(c.region_code, {}).get("sido") not in region_sido:
            continue
        region_score = 100.0 if not regions or c.region_code in regions else 55.0
        cost = p.price + (p.monthly_rent * 12 / 0.05 if deal_type == "monthly" else 0)  # 월세 → 전세 환산(전환율 5%)
        if apt.id not in fair_cache:
            fair_cache[apt.id] = prediction.estimate(db, apt) if deal_type == "sale" else stats.apartment_market(db, apt.id)
        fair_info = fair_cache[apt.id]
        if deal_type == "sale":
            fair = fair_info["price"] if fair_info else None
        else:
            fair = (fair_info or {}).get("jeonse_avg")
        loc = features.scores_for(cf.loc[c.id]) if c.id in cf.index else {"transport": None, "school": None, "infra": None}
        mk = market.get(c.region_code, {"yoy": 0.0, "volatility": 1.0, "jeonse_ratio": None})
        comp = {
            "budget": _budget_score(p.price if deal_type != "monthly" else cost, cond.get("budget_min"), budget_max),
            "region": region_score, **loc, "price": _price_score(cost, fair),
            "momentum": float(np.clip(50 + mk["yoy"] * 5, 0, 100)),  # ±10% 에서 상한
            "liquidity": float(liquidity.get(c.id, 0.0)),
            "stability": float(np.clip(100 - mk["volatility"] * 40, 0, 100)),
        }
        used = {k: w for k, w in weights.items() if w > 0 and comp.get(k) is not None}
        total = sum(comp[k] * w for k, w in used.items()) / sum(used.values())
        cautions = []
        if budget_max and p.price > budget_max:
            cautions.append(f"희망 최대 예산을 {round((p.price / budget_max - 1) * 100, 1)}% 초과합니다.")
        if fair and cost > fair * 1.05:
            cautions.append(f"{'AI 추정 적정가' if deal_type == 'sale' else '최근 1년 전세 실거래 평균'} 대비 호가가 {round((cost / fair - 1) * 100, 1)}% 높습니다.")
        if c.build_year and c.build_year < 1995:
            cautions.append(f"준공 {c.build_year}년 노후 단지 — 관리 상태·재건축 여부를 확인하세요.")
        if mk["jeonse_ratio"] and mk["jeonse_ratio"] >= 0.75 and deal_type == "jeonse":
            cautions.append(f"지역 전세가율 {round(mk['jeonse_ratio'] * 100, 1)}% — 보증금 반환 위험(깡통전세) 점검이 필요합니다.")
        if purpose == "investment" and mk["volatility"] > 1.2:
            cautions.append("최근 1년 지역 가격 변동성이 큽니다.")
        if comp["liquidity"] < 15:
            cautions.append("최근 1년 거래가 적어 시세 확인과 환금성에 유의하세요.")
        if loc["transport"] is None:
            cautions.append("이 지역은 생활 인프라 데이터가 아직 없어 입지 점수가 제외되었습니다.")
        if c.source == "sample":
            cautions.append("가상 샘플 데이터 기반 결과입니다.")
        unset = {k for k, flag in (("region", not regions), ("budget", not budget_max and not cond.get("budget_min"))) if flag}
        ranked = sorted(((k, comp[k]) for k in used if k not in unset), key=lambda kv: -kv[1] * weights[kv[0]])
        reasons = [f"{LABEL[k]} {round(v)}점" + _reason_detail(k, p, cf, c, fair, cost, deal_type) for k, v in ranked[:3]]
        results.append({
            "property_id": p.id, "complex_id": c.id, "apartment_id": apt.id, "complex_name": c.name,
            "region": names.get(c.region_code, {}).get("name", c.region_code), "region_code": c.region_code,
            "deal_type": deal_type, "price": p.price, "monthly_rent": p.monthly_rent, "area": apt.exclusive_area,
            "type_name": apt.type_name, "rooms": apt.rooms, "floor": p.floor, "build_year": c.build_year,
            "lat": c.lat, "lng": c.lng, "score": round(total, 1),
            "components": {k: (None if v is None else round(v, 1)) for k, v in comp.items()},
            "fair_price": fair, "reasons": reasons, "cautions": cautions, "source": p.source,
        })
    results.sort(key=lambda r: -r["score"])
    top = _diversify(results, top_k)
    for r in top:
        r["similar_trades"] = _similar(trades, r)
    return {"purpose": purpose, "deal_type": deal_type, "weights": {k: round(v, 3) for k, v in weights.items()},
            "candidates": len(results), "results": top, "algorithm": ALGORITHM_VERSION, "meta": stats.meta(db),
            "notice": "추천 점수는 입력 조건과 공개 데이터 기반의 참고 지표이며 매물의 실제 상태·권리관계는 반드시 현장·서류로 확인해야 합니다."}


def _diversify(results: list[dict], k: int) -> list[dict]:
    """같은 단지가 상위를 독점하지 않도록 단지당 최대 2건"""
    out, per = [], {}
    for r in results:
        if per.get(r["complex_id"], 0) < 2:
            out.append(r)
            per[r["complex_id"]] = per.get(r["complex_id"], 0) + 1
        if len(out) == k:
            break
    return out


def _reason_detail(key: str, p: Property, cf: pd.DataFrame, c: ApartmentComplex, fair, cost, deal_type) -> str:
    row = cf.loc[c.id] if c.id in cf.index else {}
    if key == "transport" and len(row) and not pd.isna(row.get("d_subway")):
        return f" · 지하철역 도보 약 {max(1, round(row['d_subway'] / 67))}분"
    if key == "school" and len(row) and not pd.isna(row.get("d_school")):
        return f" · 학교 {int(row['d_school'])}m"
    if key == "price" and fair:
        diff = (cost / fair - 1) * 100
        return f" · 기준 시세 대비 {'-' if diff < 0 else '+'}{abs(round(diff, 1))}%"
    if key == "infra" and len(row):
        return f" · 1km 내 병원 {int(row.get('n_hospital', 0))} · 마트 {int(row.get('n_mart', 0))} · 공원 {int(row.get('n_park', 0))}"
    return ""


def _similar(trades: pd.DataFrame, r: dict) -> list[dict]:
    t = trades[(trades.apartment_id == r["apartment_id"])].sort_values("deal_date").tail(3)
    return [{"price": int(x.price), "deal_date": x.deal_date.date().isoformat(), "floor": None if pd.isna(x.floor) else int(x.floor)}
            for x in t.iloc[::-1].itertuples()]
