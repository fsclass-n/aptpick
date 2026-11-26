"""이상 거래 탐지 평가 — 운영 규칙(robust z-score) vs IsolationForest.

샘플 데이터에는 '직거래 + 시세 대비 22~38% 할인' 이상 거래가 약 1.2% 주입되어 있어 이를 정답 라벨로 사용합니다.
(실데이터 전환 후에는 신고가·해제 거래 등 별도 라벨링이 필요)
사용: python -m ai.anomaly_detection.detect
결과: ai/evaluation/results/anomaly_eval.json
"""
import json
from pathlib import Path

import numpy as np

from .._backend import session

RESULTS = Path(__file__).resolve().parents[1] / "evaluation" / "results"


def _pr(pred: set, truth: set) -> dict:
    tp = len(pred & truth)
    return {"flagged": len(pred), "precision": round(tp / len(pred), 4) if pred else 0.0,
            "recall": round(tp / len(truth), 4) if truth else 0.0}


def run() -> dict:
    from sklearn.ensemble import IsolationForest

    from app.services import anomaly, stats
    with session() as db:
        trades = stats.trades_df(db).copy()
        truth = set(trades[(trades.dealing_type == "직거래") & (trades.source == "sample")].id)
        rule = {o["transaction_id"] for o in anomaly.transaction_outliers(db, limit=100000)}
    trades["rel"] = trades.ppm2 / trades.groupby(["apartment_id", "period"]).ppm2.transform("median")
    X = np.column_stack([np.log(trades.rel), np.log(trades.ppm2), trades.area])
    iso = IsolationForest(contamination=0.015, random_state=42).fit_predict(X)
    out = {"labelled_anomalies": len(truth), "transactions": int(len(trades)),
           "robust_zscore": _pr(rule, truth), "isolation_forest": _pr(set(trades.id[iso == -1]), truth)}
    RESULTS.mkdir(parents=True, exist_ok=True)
    (RESULTS / "anomaly_eval.json").write_text(json.dumps(out, ensure_ascii=False, indent=2), encoding="utf-8")
    return out


if __name__ == "__main__":
    print(json.dumps(run(), ensure_ascii=False, indent=2))
