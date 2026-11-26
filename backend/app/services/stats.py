"""실거래 데이터 기반 지역별 시장 통계 (pandas).

- 해제(취소)된 거래는 통계에서 제외
- 전세가율 = 전세(월세 0) 보증금 ㎡당 평균 / 매매 ㎡당 평균 (면적 차이 보정)
- 변동률은 월별 ㎡당 평균의 3개월 이동평균 기준 (표본 수가 적은 월의 노이즈 완화)
"""
import threading
from datetime import date

import numpy as np
import pandas as pd
from sqlalchemy import delete, func, insert, select
from sqlalchemy.orm import Session

from ..models import (ApartmentComplex, Property, Region, RegionalStatistic, RentalHistory, TransactionHistory, utcnow)

PYEONG = 3.3058
AREA_BUCKETS = [(0, 60, "60㎡ 이하"), (60, 85, "60~85㎡"), (85, 102, "85~102㎡"), (102, 135, "102~135㎡"), (135, 1e9, "135㎡ 초과")]
SOURCE_LABEL = {"sample": "aptpick 가상 샘플 데이터 (실제 실거래가 아님)", "molit": "국토교통부 실거래가 공개시스템"}
_lock = threading.Lock()
_cache: dict = {}


def invalidate() -> None:
    with _lock:
        _cache.clear()


def _cached(key, builder):
    with _lock:
        if key in _cache:
            return _cache[key]
    value = builder()
    with _lock:
        _cache[key] = value
    return value


def trades_df(db: Session) -> pd.DataFrame:
    def build():
        rows = db.execute(select(TransactionHistory.id, TransactionHistory.complex_id, TransactionHistory.apartment_id,
                                 TransactionHistory.region_code, TransactionHistory.exclusive_area, TransactionHistory.floor,
                                 TransactionHistory.price, TransactionHistory.deal_date, TransactionHistory.dealing_type,
                                 TransactionHistory.source).where(TransactionHistory.canceled.is_(False))).all()
        df = pd.DataFrame(rows, columns=["id", "complex_id", "apartment_id", "region_code", "area", "floor", "price",
                                         "deal_date", "dealing_type", "source"])
        df["deal_date"] = pd.to_datetime(df.deal_date)
        df["period"] = df.deal_date.dt.strftime("%Y-%m")
        df["ppm2"] = df.price / df.area
        return df
    return _cached("trades", build)


def rents_df(db: Session) -> pd.DataFrame:
    def build():
        rows = db.execute(select(RentalHistory.id, RentalHistory.complex_id, RentalHistory.apartment_id,
                                 RentalHistory.region_code, RentalHistory.exclusive_area, RentalHistory.floor,
                                 RentalHistory.deposit, RentalHistory.monthly_rent, RentalHistory.contract_type,
                                 RentalHistory.deal_date, RentalHistory.source)).all()
        df = pd.DataFrame(rows, columns=["id", "complex_id", "apartment_id", "region_code", "area", "floor", "deposit",
                                         "monthly_rent", "contract_type", "deal_date", "source"])
        df["deal_date"] = pd.to_datetime(df.deal_date)
        df["period"] = df.deal_date.dt.strftime("%Y-%m")
        df["jeonse"] = df.monthly_rent == 0
        df["dpm2"] = df.deposit / df.area
        return df
    return _cached("rents", build)


def as_of(db: Session) -> str:
    latest = db.scalar(select(func.max(TransactionHistory.deal_date)))
    return latest.isoformat() if latest else ""


def sources(db: Session) -> list[dict]:
    codes = sorted(set(db.scalars(select(TransactionHistory.source).distinct())))
    return [{"code": c, "label": SOURCE_LABEL.get(c, c)} for c in codes]


def meta(db: Session) -> dict:
    srcs = sources(db)
    return {"as_of": as_of(db), "sources": srcs, "is_sample": any(s["code"] == "sample" for s in srcs),
            "unit": "만원", "basis": "실거래(계약일 기준, 해제 거래 제외)"}


def refresh_regional_statistics(db: Session) -> int:
    """transaction_history / rental_history → regional_statistics 재계산"""
    invalidate()
    trades, rents = trades_df(db), rents_df(db)
    db.execute(delete(RegionalStatistic))
    if trades.empty:
        db.commit()
        return 0
    sale = trades.groupby(["region_code", "period"]).agg(avg_price=("price", "mean"), median_price=("price", "median"),
                                                         price_sum=("price", "sum"), area_sum=("area", "sum"),
                                                         volume=("id", "count"),
                                                         sources=("source", lambda s: sorted(set(s))))
    sale["avg_price_per_m2"] = sale.price_sum / sale.area_sum
    jeonse = rents[rents.jeonse].groupby(["region_code", "period"]).agg(avg_jeonse=("deposit", "mean"),
                                                                       dep_sum=("deposit", "sum"), area_sum=("area", "sum"))
    jeonse["jeonse_per_m2"] = jeonse.dep_sum / jeonse.area_sum
    rent_volume = rents.groupby(["region_code", "period"]).size().rename("rent_volume")
    merged = sale.join(jeonse[["avg_jeonse", "jeonse_per_m2"]], how="left").join(rent_volume, how="left").reset_index()
    merged["jeonse_ratio"] = merged.jeonse_per_m2 / merged.avg_price_per_m2
    now = utcnow()
    rows = [dict(region_code=r.region_code, period=r.period, avg_price=round(r.avg_price, 1), median_price=float(r.median_price),
                 avg_price_per_m2=round(r.avg_price_per_m2, 2), volume=int(r.volume),
                 avg_jeonse=None if pd.isna(r.avg_jeonse) else round(r.avg_jeonse, 1),
                 jeonse_per_m2=None if pd.isna(r.jeonse_per_m2) else round(r.jeonse_per_m2, 2),
                 jeonse_ratio=None if pd.isna(r.jeonse_ratio) else round(r.jeonse_ratio, 4),
                 rent_volume=0 if pd.isna(r.rent_volume) else int(r.rent_volume), sources=list(r.sources), computed_at=now)
            for r in merged.itertuples()]
    for i in range(0, len(rows), 1000):
        db.execute(insert(RegionalStatistic), rows[i:i + 1000])
    db.commit()
    invalidate()
    return len(rows)


def stats_df(db: Session) -> pd.DataFrame:
    def build():
        rows = db.execute(select(RegionalStatistic.region_code, RegionalStatistic.period, RegionalStatistic.avg_price,
                                 RegionalStatistic.median_price, RegionalStatistic.avg_price_per_m2, RegionalStatistic.volume,
                                 RegionalStatistic.avg_jeonse, RegionalStatistic.jeonse_ratio, RegionalStatistic.rent_volume)
                          .order_by(RegionalStatistic.region_code, RegionalStatistic.period)).all()
        df = pd.DataFrame(rows, columns=["region_code", "period", "avg_price", "median_price", "ppm2", "volume",
                                         "avg_jeonse", "jeonse_ratio", "rent_volume"])
        df["ma3"] = df.groupby("region_code").ppm2.transform(lambda s: s.rolling(3, min_periods=1).mean())
        df["mom"] = df.groupby("region_code").ma3.pct_change() * 100
        df["yoy"] = df.groupby("region_code").ma3.pct_change(12) * 100
        return df
    return _cached("stats", build)


def region_names(db: Session) -> dict[str, dict]:
    return {r.code: {"code": r.code, "sido": r.sido, "sigungu": r.sigungu, "name": r.full_name, "lat": r.lat, "lng": r.lng}
            for r in db.scalars(select(Region))}


def _num(v, digits=2):
    return None if v is None or (isinstance(v, float) and np.isnan(v)) else round(float(v), digits)


def _national_series(db: Session) -> pd.DataFrame:
    trades, rents = trades_df(db), rents_df(db)
    g = trades.groupby("period").agg(price_sum=("price", "sum"), area_sum=("area", "sum"), volume=("id", "count"),
                                     avg_price=("price", "mean"))
    g["ppm2"] = g.price_sum / g.area_sum
    j = rents[rents.jeonse].groupby("period").agg(dep=("deposit", "sum"), area=("area", "sum"))
    g["jeonse_ratio"] = (j.dep / j.area) / g.ppm2
    g["ma3"] = g.ppm2.rolling(3, min_periods=1).mean()
    g["mom"] = g.ma3.pct_change() * 100
    g["yoy"] = g.ma3.pct_change(12) * 100
    return g.reset_index()


def region_latest(db: Session) -> list[dict]:
    df, names = stats_df(db), region_names(db)
    if df.empty:
        return []
    listings = dict(db.execute(select(ApartmentComplex.region_code, func.count(Property.id)).join(Property, Property.complex_id == ApartmentComplex.id)
                               .where(Property.status == "approved").group_by(ApartmentComplex.region_code)).all())
    out = []
    for code, g in df.groupby("region_code"):
        last = g.iloc[-1]
        recent = g.tail(3)
        out.append({**names.get(code, {"code": code, "name": code}), "period": last.period,
                    "avg_price": _num(recent.avg_price.mean(), 0), "ppm2": _num(last.ma3, 1),
                    "pyeong_price": _num(last.ma3 * PYEONG, 0), "volume": int(last.volume),
                    "volume_3m": int(recent.volume.sum()), "jeonse_ratio": _num(recent.jeonse_ratio.mean(), 4),
                    "mom": _num(last.mom), "yoy": _num(last.yoy), "listings": int(listings.get(code, 0))})
    return sorted(out, key=lambda r: -(r["ppm2"] or 0))


def overview(db: Session) -> dict:
    nat = _national_series(db)
    regions = region_latest(db)
    if nat.empty:
        return {"meta": meta(db), "kpi": None, "series": [], "regions": [], "risers": [], "fallers": []}
    last, prev_year = nat.iloc[-1], nat.iloc[-13] if len(nat) > 12 else nat.iloc[0]
    ranked = [r for r in regions if r["yoy"] is not None]
    kpi = {"period": last.period, "avg_price": _num(nat.tail(3).avg_price.mean(), 0), "ppm2": _num(last.ma3, 1),
           "pyeong_price": _num(last.ma3 * PYEONG, 0), "volume": int(last.volume),
           "volume_yoy": _num((last.volume / prev_year.volume - 1) * 100 if prev_year.volume else None),
           "jeonse_ratio": _num(nat.tail(3).jeonse_ratio.mean(), 4), "mom": _num(last.mom), "yoy": _num(last.yoy),
           "region_count": len(regions)}
    series = [{"period": r.period, "ppm2": _num(r.ppm2, 1), "ma3": _num(r.ma3, 1), "volume": int(r.volume),
               "jeonse_ratio": _num(r.jeonse_ratio, 4), "mom": _num(r.mom)} for r in nat.itertuples()]
    return {"meta": meta(db), "kpi": kpi, "series": series, "regions": regions,
            "risers": sorted(ranked, key=lambda r: -r["yoy"])[:5], "fallers": sorted(ranked, key=lambda r: r["yoy"])[:5]}


def region_detail(db: Session, code: str) -> dict | None:
    df = stats_df(db)
    g = df[df.region_code == code]
    names = region_names(db)
    if code not in names:
        return None
    if g.empty:
        return {"region": names[code], "meta": meta(db), "has_data": False}
    trades, rents = trades_df(db), rents_df(db)
    t = trades[trades.region_code == code]
    monthly = [{"period": r.period, "avg_price": _num(r.avg_price, 0), "median_price": _num(r.median_price, 0),
                "ppm2": _num(r.ppm2, 1), "ma3": _num(r.ma3, 1), "pyeong_price": _num(r.ma3 * PYEONG, 0),
                "volume": int(r.volume), "rent_volume": int(r.rent_volume), "avg_jeonse": _num(r.avg_jeonse, 0),
                "jeonse_ratio": _num(r.jeonse_ratio, 4), "mom": _num(r.mom), "yoy": _num(r.yoy)} for r in g.itertuples()]
    q = t.assign(quarter=t.deal_date.dt.to_period("Q").astype(str)).groupby("quarter").agg(p=("price", "sum"), a=("area", "sum"), n=("id", "count"))
    q["ppm2"] = q.p / q.a
    q["qoq"] = q.ppm2.pct_change() * 100
    quarterly = [{"period": idx, "ppm2": _num(r.ppm2, 1), "volume": int(r.n), "qoq": _num(r.qoq)} for idx, r in q.iterrows()]
    y = t.assign(year=t.deal_date.dt.year).groupby("year").agg(p=("price", "sum"), a=("area", "sum"), n=("id", "count"))
    y["ppm2"] = y.p / y.a
    y["change"] = y.ppm2.pct_change() * 100
    yearly = [{"year": int(idx), "ppm2": _num(r.ppm2, 1), "volume": int(r.n), "change": _num(r.change)} for idx, r in y.iterrows()]
    recent = t[t.deal_date >= t.deal_date.max() - pd.DateOffset(months=12)]
    buckets = []
    for lo, hi, label in AREA_BUCKETS:
        b = recent[(recent.area > lo) & (recent.area <= hi)]
        if len(b):
            buckets.append({"label": label, "count": int(len(b)), "avg_price": _num(b.price.mean(), 0),
                            "min_price": int(b.price.min()), "max_price": int(b.price.max()),
                            "ppm2": _num(b.price.sum() / b.area.sum(), 1)})
    returns = g.ma3.pct_change().dropna()
    vol_corr = g[["volume", "mom"]].dropna()
    complexes = db.execute(select(ApartmentComplex.id, ApartmentComplex.name, ApartmentComplex.households,
                                  ApartmentComplex.build_year).where(ApartmentComplex.region_code == code)).all()
    households = sum(c.households or 0 for c in complexes)
    by_complex = recent.groupby("complex_id").agg(p=("price", "sum"), a=("area", "sum"), n=("id", "count"))
    by_complex["ppm2"] = by_complex.p / by_complex.a
    cname = {c.id: c for c in complexes}
    top_complexes = [{"complex_id": int(cid), "name": cname[cid].name, "ppm2": _num(r.ppm2, 1), "volume": int(r.n),
                      "build_year": cname[cid].build_year} for cid, r in by_complex.sort_values("ppm2", ascending=False).iterrows() if cid in cname]
    listings = db.scalar(select(func.count(Property.id)).join(ApartmentComplex, Property.complex_id == ApartmentComplex.id)
                         .where(ApartmentComplex.region_code == code, Property.status == "approved")) or 0
    last12 = g.tail(12)
    r_recent = rents[(rents.region_code == code) & (rents.deal_date >= t.deal_date.max() - pd.DateOffset(months=12))]
    return {
        "region": names[code], "meta": meta(db), "has_data": True, "monthly": monthly, "quarterly": quarterly, "yearly": yearly,
        "area_distribution": buckets,
        "indicators": {
            "volatility": _num(returns.tail(12).std() * 100), "volatility_annual": _num(returns.tail(12).std() * np.sqrt(12) * 100),
            "volume_price_corr": _num(vol_corr.volume.corr(vol_corr.mom)) if len(vol_corr) > 6 else None,
            "volume_12m": int(last12.volume.sum()), "rent_volume_12m": int(last12.rent_volume.sum()),
            "rent_to_sale_ratio": _num(last12.rent_volume.sum() / max(1, last12.volume.sum())),
            "monthly_rent_share": _num((~r_recent.jeonse).mean() * 100 if len(r_recent) else None),
            "renewal_share": _num((r_recent.contract_type == "갱신").mean() * 100 if len(r_recent) else None),
            "households": households, "complex_count": len(complexes), "listings": int(listings),
            "listing_to_volume": _num(listings / max(1, last12.volume.tail(3).sum() / 3)),
        },
        "top_complexes": top_complexes[:10],
    }


def heatmap(db: Session, months: int = 12) -> dict:
    df, names = stats_df(db), region_names(db)
    periods = sorted(df.period.unique())[-months:]
    rows = []
    for code, g in df[df.period.isin(periods)].groupby("region_code"):
        values = dict(zip(g.period, g.mom))
        rows.append({"code": code, "name": names.get(code, {}).get("name", code),
                     "values": [_num(values.get(p)) for p in periods]})
    return {"meta": meta(db), "periods": periods, "rows": rows}


def recent_transactions(db: Session, limit: int = 20, region_code: str | None = None) -> list[dict]:
    q = (select(TransactionHistory, ApartmentComplex.name, ApartmentComplex.region_code)
         .join(ApartmentComplex, TransactionHistory.complex_id == ApartmentComplex.id)
         .where(TransactionHistory.canceled.is_(False)))
    if region_code:
        q = q.where(TransactionHistory.region_code == region_code)
    names = region_names(db)
    rows = db.execute(q.order_by(TransactionHistory.deal_date.desc(), TransactionHistory.id.desc()).limit(limit)).all()
    return [{"id": t.id, "complex_id": t.complex_id, "complex_name": name, "region": names.get(rc, {}).get("name", rc),
             "area": t.exclusive_area, "floor": t.floor, "price": t.price, "deal_date": t.deal_date.isoformat(),
             "dealing_type": t.dealing_type, "source": t.source} for t, name, rc in rows]


def complex_series(db: Session, complex_id: int) -> dict:
    trades, rents = trades_df(db), rents_df(db)
    t, r = trades[trades.complex_id == complex_id], rents[rents.complex_id == complex_id]
    out = {}
    for apt_id, g in t.groupby("apartment_id"):
        m = g.groupby("period").price.agg(["mean", "count", "min", "max"])
        rj = r[(r.apartment_id == apt_id) & r.jeonse].groupby("period").deposit.mean()
        out[int(apt_id)] = [{"period": p, "avg_price": _num(row["mean"], 0), "count": int(row["count"]),
                             "min": int(row["min"]), "max": int(row["max"]), "avg_jeonse": _num(rj.get(p), 0)}
                            for p, row in m.iterrows()]
    return out


def apartment_market(db: Session, apartment_id: int, months: int = 12) -> dict:
    """평형 단위 최근 시세 요약 (매매·전세·월세 평균, 최근 실거래)"""
    trades, rents = trades_df(db), rents_df(db)
    t, r = trades[trades.apartment_id == apartment_id], rents[rents.apartment_id == apartment_id]
    if t.empty and r.empty:
        return {}
    end = max(t.deal_date.max() if len(t) else pd.Timestamp.min, r.deal_date.max() if len(r) else pd.Timestamp.min)
    since = end - pd.DateOffset(months=months)
    t12, r12 = t[t.deal_date >= since], r[r.deal_date >= since]
    jeonse, monthly = r12[r12.jeonse], r12[~r12.jeonse]
    last = t.sort_values("deal_date").iloc[-1] if len(t) else None
    return {"sale_avg": _num(t12.price.mean(), 0), "sale_count": int(len(t12)), "jeonse_avg": _num(jeonse.deposit.mean(), 0),
            "jeonse_count": int(len(jeonse)), "monthly_deposit_avg": _num(monthly.deposit.mean(), 0),
            "monthly_rent_avg": _num(monthly.monthly_rent.mean(), 0), "monthly_count": int(len(monthly)),
            "jeonse_ratio": _num(jeonse.deposit.mean() / t12.price.mean(), 4) if len(jeonse) and len(t12) else None,
            "last_trade": None if last is None else {"price": int(last.price), "deal_date": last.deal_date.date().isoformat(),
                                                     "floor": None if pd.isna(last.floor) else int(last.floor)}}


def today_iso() -> str:
    return date.today().isoformat()
