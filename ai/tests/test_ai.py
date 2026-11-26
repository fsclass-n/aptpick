import os
import tempfile

os.environ.update({"DATABASE_URL": f"sqlite:///{os.path.join(tempfile.mkdtemp(), 'ai.db')}", "SEED_SAMPLE_DATA": "true",
                   "AI_RESULTS_DIR": tempfile.mkdtemp(), "WARMUP_ON_STARTUP": "false",
                   "GEMINI_API_KEY": "", "DATA_GO_KR_API_KEY": ""})

import pandas as pd  # noqa: E402

from ai.anomaly_detection import detect  # noqa: E402
from ai.data_processing.preprocess import normalize  # noqa: E402
from ai.price_prediction import train  # noqa: E402
from ai.recommendation import evaluate  # noqa: E402


def test_preprocess_normalizes_and_dedupes():
    raw = pd.DataFrame([
        {"aptNm": "A", "aptSeq": "1", "sggCd": "11680", "excluUseAr": "84.97", "dealYear": "2026", "dealMonth": "9",
         "dealDay": "1", "dealAmount": "120,000", "floor": "5", "buildYear": "2010", "cdealType": ""},
    ] * 2 + [{"aptNm": "B", "excluUseAr": None, "dealYear": "2026", "dealMonth": "9", "dealDay": "1", "dealAmount": "1"}])
    df, report = normalize(raw)
    assert report["duplicates_removed"] == 1 and len(df) == 1
    assert df.iloc[0].price == 120000 and df.iloc[0].region_code == "11680"


def test_model_comparison_runs():
    out = train.run()
    names = {r["model"] for r in out["results"]}
    assert {"Ridge", "HistGradientBoosting(운영)"} <= names
    best = out["results"][0]
    assert best["mape"] < 15 and out["valid_rows"] > 0


def test_recommendation_eval_beats_random():
    s = evaluate.run(n_personas=12)["summary"]
    assert s["aptpick"]["ndcg@10"] > s["random"]["ndcg@10"]


def test_anomaly_eval():
    out = detect.run()
    assert out["labelled_anomalies"] > 0 and out["robust_zscore"]["precision"] > 0.3
