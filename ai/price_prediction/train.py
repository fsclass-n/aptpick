"""가격 예측 모델 비교 실험 — 운영 모델(HistGradientBoosting)과 기준선·대안 모델을 같은 시간 기준 holdout 으로 평가.

사용: python -m ai.price_prediction.train [--optuna 30] [--shap]
- 피처·분할·지표는 backend/app/services/prediction.py 와 동일 (운영 모델과 비교 가능한 조건)
- XGBoost·LightGBM·Optuna·SHAP 은 ai/requirements.txt 설치 시에만 실행 (미설치 시 건너뜀)
결과: ai/evaluation/results/price_model_comparison.json
"""
import argparse
import json
import os
import time
from pathlib import Path

import numpy as np

from .._backend import session

RESULTS = Path(os.getenv("AI_RESULTS_DIR") or Path(__file__).resolve().parents[1] / "evaluation" / "results")


def dataset(db):
    from app.services import prediction
    data, _ = prediction._prepare(db)
    cutoff = data.t.max() - prediction.HOLDOUT_MONTHS + 1
    tr, va = data[data.t < cutoff].copy(), data[data.t >= cutoff].copy()
    prem = prediction._premium(tr)
    tr["complex_premium"], va["complex_premium"] = tr.complex_id.map(prem).fillna(0), va.complex_id.map(prem).fillna(0)
    return tr, va, prediction.FEATURES


def evaluate(name, model_fn, tr, va, feats) -> dict:
    from app.services.metrics import regression_metrics
    t0 = time.time()
    pred_log = model_fn(tr, va, feats)
    m = regression_metrics(va.price, np.exp(pred_log) * va.area)
    return {"model": name, **m, "seconds": round(time.time() - t0, 2)}


def run(optuna_trials: int = 0, with_shap: bool = False) -> dict:
    from sklearn.ensemble import HistGradientBoostingRegressor, RandomForestRegressor
    from sklearn.linear_model import Ridge
    from sklearn.pipeline import make_pipeline
    from sklearn.preprocessing import StandardScaler

    with session() as db:
        tr, va, feats = dataset(db)
        from app.services import stats
        meta = stats.meta(db)
    fill = lambda X: X.fillna(X.median())  # noqa: E731 — 선형·RF 는 결측 미지원
    models = {
        "baseline(지역지수+단지프리미엄)": lambda tr, va, f: va.region_index + va.complex_premium,
        "Ridge": lambda tr, va, f: make_pipeline(StandardScaler(), Ridge(alpha=1.0)).fit(fill(tr[f]), tr.y).predict(fill(va[f])),
        "RandomForest": lambda tr, va, f: RandomForestRegressor(n_estimators=200, min_samples_leaf=3, n_jobs=-1, random_state=42)
        .fit(fill(tr[f]), tr.y).predict(fill(va[f])),
        "HistGradientBoosting(운영)": lambda tr, va, f: HistGradientBoostingRegressor(
            max_iter=220, learning_rate=0.08, max_leaf_nodes=31, min_samples_leaf=20, l2_regularization=0.1, random_state=42)
        .fit(tr[f], tr.y).predict(va[f]),
    }
    try:
        import xgboost as xgb
        models["XGBoost"] = lambda tr, va, f: xgb.XGBRegressor(n_estimators=400, learning_rate=0.05, max_depth=6, subsample=0.9,
                                                               colsample_bytree=0.9, random_state=42).fit(tr[f], tr.y).predict(va[f])
    except ImportError:
        pass
    try:
        import lightgbm as lgb
        models["LightGBM"] = lambda tr, va, f: lgb.LGBMRegressor(n_estimators=400, learning_rate=0.05, num_leaves=31,
                                                                 random_state=42, verbose=-1).fit(tr[f], tr.y).predict(va[f])
    except ImportError:
        pass
    results = [evaluate(name, fn, tr, va, feats) for name, fn in models.items()]
    out = {"meta": meta, "train_rows": len(tr), "valid_rows": len(va), "valid_period": f"{va.mp.min()} ~ {va.mp.max()}",
           "features": feats, "results": sorted(results, key=lambda r: r["mape"])}
    if optuna_trials:
        out["optuna"] = tune(tr, va, feats, optuna_trials)
    if with_shap:
        out["shap"] = shap_importance(tr, va, feats)
    RESULTS.mkdir(parents=True, exist_ok=True)
    (RESULTS / "price_model_comparison.json").write_text(json.dumps(out, ensure_ascii=False, indent=2, default=str), encoding="utf-8")
    return out


def tune(tr, va, feats, trials: int) -> dict:
    try:
        import optuna
    except ImportError:
        return {"skipped": "optuna 미설치"}
    from sklearn.ensemble import HistGradientBoostingRegressor
    from sklearn.metrics import mean_absolute_error

    def objective(trial):
        model = HistGradientBoostingRegressor(
            learning_rate=trial.suggest_float("learning_rate", 0.02, 0.2, log=True),
            max_leaf_nodes=trial.suggest_int("max_leaf_nodes", 15, 63),
            min_samples_leaf=trial.suggest_int("min_samples_leaf", 5, 60),
            l2_regularization=trial.suggest_float("l2_regularization", 1e-3, 1.0, log=True), max_iter=300, random_state=42)
        model.fit(tr[feats], tr.y)
        return mean_absolute_error(va.price, np.exp(model.predict(va[feats])) * va.area)

    optuna.logging.set_verbosity(optuna.logging.WARNING)
    study = optuna.create_study(direction="minimize")
    study.optimize(objective, n_trials=trials)
    return {"best_mae": round(study.best_value, 1), "best_params": study.best_params, "trials": trials}


def shap_importance(tr, va, feats) -> list | dict:
    try:
        import shap
    except ImportError:
        return {"skipped": "shap 미설치"}
    from sklearn.ensemble import HistGradientBoostingRegressor
    model = HistGradientBoostingRegressor(max_iter=220, learning_rate=0.08, random_state=42).fit(tr[feats], tr.y)
    sample = va[feats].sample(min(300, len(va)), random_state=0)
    values = shap.Explainer(model.predict, sample)(sample).values
    return sorted(({"feature": f, "mean_abs_shap": round(float(np.abs(values[:, i]).mean()), 5)} for i, f in enumerate(feats)),
                  key=lambda x: -x["mean_abs_shap"])


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--optuna", type=int, default=0)
    parser.add_argument("--shap", action="store_true")
    args = parser.parse_args()
    result = run(args.optuna, args.shap)
    for r in result["results"]:
        print(f"{r['model']:<32} MAE {r['mae']:>9,.1f}  RMSE {r['rmse']:>9,.1f}  MAPE {r['mape']:>5.2f}%  R² {r['r2']}")
