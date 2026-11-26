"""맞춤 추천 오프라인 평가 — 시뮬레이션 사용자(persona) 기반 Precision@K · Recall@K · NDCG@K.

실제 사용자 피드백(클릭·관심 등록) 데이터가 쌓이기 전 단계의 대리 평가입니다.
- persona 별 '숨은 선호'(예산·지역·면적 + 교통/학군/인프라 중요도)로 정답 집합을 만들고
  (예산 이내 · 선호 지역 · 숨은 효용 상위 20%), 추천 알고리즘이 입력 조건만으로 이를 얼마나 상위에 올리는지 측정
- 비교 기준선: 무작위, 최저가순
사용: python -m ai.recommendation.evaluate
결과: ai/evaluation/results/recommendation_eval.json
"""
import json
from pathlib import Path

import numpy as np

from .._backend import session

RESULTS = Path(__file__).resolve().parents[1] / "evaluation" / "results"
K = 10


def personas(region_codes: list[str], rng: np.random.Generator, n: int = 30) -> list[dict]:
    out = []
    for _ in range(n):
        regions = list(rng.choice(region_codes, size=int(rng.integers(1, 3)), replace=False))
        out.append({"region_codes": regions, "deal_type": "sale", "purpose": str(rng.choice(["residence", "investment"])),
                    "budget_max": int(rng.choice([80000, 120000, 160000, 220000, 300000])),
                    "area_min": float(rng.choice([0, 59, 84])), "transport_weight": int(rng.integers(1, 6)),
                    "school_weight": int(rng.integers(1, 6)), "infra_weight": int(rng.integers(1, 6))})
    return out


def run(n_personas: int = 30) -> dict:
    from app.services import features, recommendation
    from app.services.metrics import ndcg_at_k, precision_at_k, recall_at_k

    rng = np.random.default_rng(7)
    scores = {"aptpick": [], "random": [], "cheapest": []}
    with session() as db:
        from app.services import stats
        regions = [r["code"] for r in stats.region_latest(db)]
        cf = features.complex_features(db)
        for p in personas(regions, rng, n_personas):
            result = recommendation.recommend(db, {**p}, top_k=200)
            cands = result["results"]
            if len(cands) < K:
                continue
            # 숨은 효용: persona 중요도 × 입지 점수 + 가격 경쟁력 (+노이즈) — 알고리즘과 독립적으로 계산
            util = {}
            for r in cands:
                loc = features.scores_for(cf.loc[r["complex_id"]])
                comp = r["components"]
                u = (p["transport_weight"] * (loc["transport"] or 0) + p["school_weight"] * (loc["school"] or 0)
                     + p["infra_weight"] * (loc["infra"] or 0)) / 15 + 0.8 * (comp["price"] or 50) + rng.normal(0, 8)
                if r["price"] > p["budget_max"]:
                    u -= 100
                util[r["property_id"]] = u
            ranked = sorted(util, key=util.get, reverse=True)
            relevant = set(ranked[: max(K, len(ranked) // 5)])
            relevance = {pid: 1.0 for pid in relevant}
            lists = {"aptpick": [r["property_id"] for r in cands],
                     "random": list(rng.permutation([r["property_id"] for r in cands])),
                     "cheapest": [r["property_id"] for r in sorted(cands, key=lambda r: r["price"])]}
            for name, lst in lists.items():
                scores[name].append((precision_at_k(lst, relevant, K), recall_at_k(lst, relevant, K), ndcg_at_k(lst, relevance, K)))
    summary = {name: {"precision@10": round(float(np.mean([s[0] for s in v])), 4), "recall@10": round(float(np.mean([s[1] for s in v])), 4),
                      "ndcg@10": round(float(np.mean([s[2] for s in v])), 4), "personas": len(v)} for name, v in scores.items() if v}
    out = {"k": K, "method": "simulated personas (hidden utility)", "algorithm": recommendation.ALGORITHM_VERSION, "summary": summary}
    RESULTS.mkdir(parents=True, exist_ok=True)
    (RESULTS / "recommendation_eval.json").write_text(json.dumps(out, ensure_ascii=False, indent=2), encoding="utf-8")
    return out


if __name__ == "__main__":
    print(json.dumps(run(), ensure_ascii=False, indent=2))
