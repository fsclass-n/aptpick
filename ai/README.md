# ai/ — 데이터 처리 · 모델 실험 · 평가

운영 추론 코드는 배포 단위 분리를 위해 `backend/app/services/{prediction,recommendation,anomaly,features,metrics}.py` 에 있고,
이 디렉터리는 동일 코드를 import(`ai/_backend.py`)해 같은 피처·분할·지표로 실험·평가합니다.

| 모듈 | 실행 | 결과 |
|---|---|---|
| data_processing/preprocess.py | `python -m ai.data_processing.preprocess data/raw/<file>.csv` | data/processed/*_clean.csv |
| price_prediction/train.py | `python -m ai.price_prediction.train [--optuna 30] [--shap]` | evaluation/results/price_model_comparison.json |
| recommendation/evaluate.py | `python -m ai.recommendation.evaluate` | evaluation/results/recommendation_eval.json |
| anomaly_detection/detect.py | `python -m ai.anomaly_detection.detect` | evaluation/results/anomaly_eval.json |

- `DATABASE_URL`(또는 TIDB_*)로 실데이터 DB 를 지정할 수 있으며, 비어 있으면 가상 샘플 데이터로 평가합니다.
- XGBoost·LightGBM·Optuna·SHAP: `pip install -r ai/requirements.txt` 후 자동 포함
- `feature_engineering/` 의 피처 정의는 `backend/app/services/features.py`·`prediction.py` 와 공유합니다.
