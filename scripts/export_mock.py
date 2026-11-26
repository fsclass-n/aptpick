"""Netlify 데모(VITE_USE_MOCK=true)용 Mock 스냅샷 생성.

임시 SQLite 에 가상 샘플 데이터를 적재한 백엔드를 실제로 호출해 응답을 기록합니다.
→ frontend/src/mock/snapshot.json (Mock 서버가 필터·정렬·페이지네이션만 수행)
사용: .venv/Scripts/python scripts/export_mock.py
"""
import json
import os
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
os.environ.update({"DATABASE_URL": f"sqlite:///{Path(tempfile.mkdtemp()) / 'mock.db'}", "SEED_SAMPLE_DATA": "true",
                   "WARMUP_ON_STARTUP": "false", "GEMINI_API_KEY": "", "DATA_GO_KR_API_KEY": "", "KAKAO_REST_API_KEY": "",
                   "RATE_LIMIT_PER_MINUTE": "1000000", "ADMIN_SECRET_KEY": "mock-export-only"})
sys.path.insert(0, str(ROOT / "backend"))

from fastapi.testclient import TestClient  # noqa: E402

from app.database import SessionLocal  # noqa: E402
from app.models import Infrastructure  # noqa: E402
from app.main import _warm_up, app  # noqa: E402
from app.services import recommendation  # noqa: E402

OUT = ROOT / "frontend" / "src" / "mock" / "snapshot.json"


def main() -> None:
    recommendation._diversify = lambda results, k: results[:k]  # 후보 전체 기록 (Mock 에서 재가중·다양화)
    with TestClient(app) as c:
        _warm_up()
        get = lambda path, **params: c.get(path, params=params).raise_for_status().json()  # noqa: E731
        ta = {"Authorization": "Bearer " + c.post("/api/auth/test-login", json={"kind": "test_admin"}).json()["access_token"]}
        aget = lambda path, **params: c.get(path, params=params, headers=ta).raise_for_status().json()  # noqa: E731
        regions = get("/api/regions")
        overview = get("/api/market/overview")
        codes = [r["code"] for r in overview["regions"]]
        props, page = [], 1
        while True:
            res = get("/api/apartments/search", size=50, page=page)
            props += res["items"]
            if page >= res["pages"]:
                break
            page += 1
        complexes = get("/api/apartments", limit=300)
        details = {}
        for cx in complexes:
            d = get(f"/api/apartments/{cx['id']}")
            d["trades"], d["rents"] = d["trades"][:20], d["rents"][:20]
            d.pop("listings")  # Mock 에서 properties 로 재구성 (중복 제거)
            d.pop("meta")
            details[cx["id"]] = d
        predicts = {}
        for cx in complexes:
            for t in cx["types"]:
                p = get(f"/api/ai/predict/{t['id']}")
                p.pop("model", None)
                p.pop("meta", None)
                predicts[t["id"]] = p
        as_of = overview["meta"]["as_of"]
        tx, page = [], 1
        while True:
            res = get("/api/transactions/search", size=100, page=page, date_from=f"{int(as_of[:4]) - 1}{as_of[4:]}")
            tx += res["items"]
            if page >= res["pages"]:
                break
            page += 1
        with SessionLocal() as db:  # API 의 top_k 상한(30) 없이 거래유형별 후보 전체의 점수 구성요소를 기록
            reco = {dt: recommendation.recommend(db, {"deal_type": dt, "purpose": "residence"}, top_k=100000)
                    for dt in ("sale", "jeonse", "monthly")}
        reports = get("/api/reports", size=50)
        with SessionLocal() as db:
            infra = [{"id": p.id, "category": p.category, "name": p.name, "lat": p.lat, "lng": p.lng, "source": p.source}
                     for p in db.query(Infrastructure)]
        snapshot = {
            "generated_from": "aptpick backend (가상 샘플 데이터)", "as_of": as_of, "regions": regions, "overview": overview,
            "market_regions": get("/api/market/regions"), "heatmap": get("/api/market/heatmap", months=12),
            "anomalies": get("/api/market/anomalies"), "recent": get("/api/market/recent-transactions", limit=50),
            "popular": get("/api/market/popular-regions"),
            "region_detail": {code: get(f"/api/market/regions/{code}") for code in codes},
            "properties": props, "complexes": complexes, "details": details, "predicts": predicts, "model": get("/api/ai/model"),
            "transactions": tx, "reco": reco, "meta": overview["meta"],
            "map": get("/api/apartments/map", sw_lat=33, sw_lng=124, ne_lat=39, ne_lng=132)["items"],
            "infra": infra,
            "reports": reports, "report_detail": {r["id"]: get(f"/api/reports/{r['id']}") for r in reports["items"]},
            "admin": {
                "dashboard": aget("/api/admin/dashboard"), "users": aget("/api/admin/users", size=100),
                "properties": aget("/api/admin/properties", size=100, status=""),
                "pending": aget("/api/admin/properties", size=100, status="pending"),
                "duplicates": aget("/api/admin/properties/duplicates"), "sources": aget("/api/admin/data/sources"),
                "logs": aget("/api/admin/data/logs"), "models": aget("/api/admin/models"), "anomalies": aget("/api/admin/anomalies"),
                "audit": aget("/api/admin/audit-logs"), "inquiries": aget("/api/admin/inquiries"),
                "types": {cx["id"]: cx["types"] for cx in complexes},
            },
        }
    OUT.write_text(json.dumps(snapshot, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print(f"wrote {OUT} ({OUT.stat().st_size / 1024:.0f} KB) · properties={len(props)} complexes={len(complexes)} predicts={len(predicts)}")


if __name__ == "__main__":
    main()
