"""평가 지표 — 운영 코드와 동일한 구현(backend/app/services/metrics.py)을 재노출합니다."""
from .. import _backend  # noqa: F401
from app.services.metrics import ndcg_at_k, precision_at_k, recall_at_k, regression_metrics  # noqa: E402,F401
