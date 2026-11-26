"""국토교통부 실거래 원본(data/raw) 전처리 — 결측·단위·코드 정규화, 중복 제거, 이상치 플래그.

사용: python -m ai.data_processing.preprocess data/raw/trades_11680_202609.csv
원본 컬럼(국토부 OpenAPI 영문 태그): aptNm, aptSeq, sggCd, umdNm, jibun, excluUseAr, dealYear, dealMonth, dealDay,
dealAmount, floor, buildYear, dealingGbn, cdealType
"""
import sys
from pathlib import Path

import numpy as np
import pandas as pd

ROOT = Path(__file__).resolve().parents[2]
REQUIRED = ["aptNm", "excluUseAr", "dealYear", "dealMonth", "dealDay", "dealAmount"]


def normalize(raw: pd.DataFrame) -> tuple[pd.DataFrame, dict]:
    report = {"rows_in": int(len(raw))}
    df = raw.copy()
    missing = [c for c in REQUIRED if c not in df.columns]
    if missing:
        raise ValueError(f"필수 컬럼 누락: {missing}")
    report["missing_rate"] = {c: round(float(df[c].isna().mean() * 100), 2) for c in REQUIRED + ["floor", "buildYear"] if c in df}
    df = df.dropna(subset=REQUIRED)
    df["price"] = pd.to_numeric(df.dealAmount.astype(str).str.replace(",", "").str.strip(), errors="coerce")  # 만원
    df["area"] = pd.to_numeric(df.excluUseAr, errors="coerce").round(2)
    df["floor"] = pd.to_numeric(df.get("floor"), errors="coerce")
    df["build_year"] = pd.to_numeric(df.get("buildYear"), errors="coerce")
    df["deal_date"] = pd.to_datetime(dict(year=df.dealYear.astype(int), month=df.dealMonth.astype(int), day=df.dealDay.astype(int)),
                                     errors="coerce")
    df["region_code"] = df.get("sggCd", pd.Series(index=df.index, dtype=str)).astype(str).str.zfill(5).str[:5]
    df["canceled"] = df.get("cdealType", "").astype(str).str.strip().eq("O")
    df = df.dropna(subset=["price", "area", "deal_date"])
    df = df[(df.price > 0) & (df.area > 10) & (df.area < 400)]
    before = len(df)
    df = df.drop_duplicates(subset=["aptSeq" if "aptSeq" in df else "aptNm", "area", "floor", "price", "deal_date"])
    report["duplicates_removed"] = int(before - len(df))
    df["ppm2"] = df.price / df.area
    grp = df.groupby(["aptNm", df.area.round(0)]).ppm2
    med = grp.transform("median")
    mad = grp.transform(lambda s: np.median(np.abs(s - s.median())) * 1.4826).replace(0, np.nan)
    df["outlier"] = ((df.ppm2 - med).abs() / mad.fillna(med * 0.02)) >= 3.5
    report.update(rows_out=int(len(df)), outliers=int(df.outlier.sum()), canceled=int(df.canceled.sum()))
    return df, report


def main(path: str) -> None:
    raw = pd.read_csv(path, dtype=str)
    df, report = normalize(raw)
    out = ROOT / "data" / "processed" / (Path(path).stem + "_clean.csv")
    out.parent.mkdir(parents=True, exist_ok=True)
    df.to_csv(out, index=False, encoding="utf-8-sig")
    print(report, "->", out)


if __name__ == "__main__":
    main(sys.argv[1])
