"""모델 성능 평가 지표 (회귀: MAE·RMSE·MAPE·R², 추천: Precision@K·Recall@K·NDCG@K)"""
import numpy as np


def regression_metrics(y_true, y_pred) -> dict:
    y_true, y_pred = np.asarray(y_true, float), np.asarray(y_pred, float)
    err = y_pred - y_true
    ss_res, ss_tot = float((err ** 2).sum()), float(((y_true - y_true.mean()) ** 2).sum())
    return {"mae": round(float(np.abs(err).mean()), 1), "rmse": round(float(np.sqrt((err ** 2).mean())), 1),
            "mape": round(float((np.abs(err) / np.abs(y_true)).mean() * 100), 2),
            "r2": round(1 - ss_res / ss_tot, 4) if ss_tot else None, "n": int(len(y_true))}


def precision_at_k(recommended: list, relevant: set, k: int) -> float:
    top = recommended[:k]
    return sum(1 for x in top if x in relevant) / k if k else 0.0


def recall_at_k(recommended: list, relevant: set, k: int) -> float:
    return sum(1 for x in recommended[:k] if x in relevant) / len(relevant) if relevant else 0.0


def ndcg_at_k(recommended: list, relevance: dict, k: int) -> float:
    gains = [relevance.get(x, 0) for x in recommended[:k]]
    dcg = sum(g / np.log2(i + 2) for i, g in enumerate(gains))
    ideal = sorted(relevance.values(), reverse=True)[:k]
    idcg = sum(g / np.log2(i + 2) for i, g in enumerate(ideal))
    return float(dcg / idcg) if idcg else 0.0
