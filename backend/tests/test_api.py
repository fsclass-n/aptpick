from datetime import date

import httpx

from app.core.config import settings
from app.database import SessionLocal
from app.models import TransactionHistory
from app.services import collector, metrics, report


def test_health(client):
    for path in ("/api/health", "/health", "/healthz"):
        assert client.get(path).json()["status"] == "ok"
    assert client.head("/api/health").status_code == 200


def test_signup_login_profile(client):
    weak = client.post("/api/auth/signup", json={"email": "a@b.com", "password": "weakpass", "name": "약함"})
    assert weak.status_code == 422
    body = {"email": "new.user@aptpick.kr", "password": "Strong1234!", "name": "신규", "phone": "01012345678"}
    assert client.post("/api/auth/signup", json=body).status_code == 201
    assert client.post("/api/auth/signup", json=body).status_code == 409
    login = client.post("/api/auth/login", json={"email": body["email"], "password": body["password"]})
    assert login.status_code == 200
    headers = {"Authorization": f"Bearer {login.json()['access_token']}"}
    assert client.get("/api/auth/me", headers=headers).json()["role"] == "user"
    assert client.patch("/api/auth/me", json={"name": "변경"}, headers=headers).json()["name"] == "변경"
    assert client.post("/api/auth/login", json={"email": body["email"], "password": "Wrong1234!"}).status_code == 401
    assert client.post("/api/auth/me/withdraw", json={"confirm": "Strong1234!"}, headers=headers).json()["ok"]
    assert client.get("/api/auth/me", headers=headers).status_code == 401


def test_admin_key_login(client):
    assert client.post("/api/auth/admin-key-login", json={"admin_key": "wrong"}).status_code == 401


def test_oauth_not_configured_redirect(client):
    res = client.get("/api/auth/oauth/google/login", follow_redirects=False)
    assert res.status_code in (302, 307) and "oauth_not_configured" in res.headers["location"]
    assert client.get("/api/auth/oauth/providers").json() == {"google": False, "naver": False, "kakao": False}


def test_market_overview_and_region(client):
    ov = client.get("/api/market/overview").json()
    assert ov["meta"]["is_sample"] and ov["meta"]["as_of"]
    assert ov["kpi"]["ppm2"] > 0 and len(ov["series"]) >= 30 and len(ov["regions"]) == 15
    detail = client.get("/api/market/regions/11680").json()
    assert detail["has_data"] and detail["monthly"] and detail["quarterly"] and detail["yearly"]
    assert detail["area_distribution"] and 0 < detail["monthly"][-1]["jeonse_ratio"] < 1
    assert client.get("/api/market/regions/11110").json()["has_data"] is False
    assert client.get("/api/market/regions/99999").status_code == 404
    heat = client.get("/api/market/heatmap?months=6").json()
    assert len(heat["periods"]) == 6 and heat["rows"]
    assert client.get("/api/market/compare?codes=11680,11350").json()["items"]
    assert client.get("/api/market/recent-transactions?limit=5").json()["items"][0]["source"] == "sample"
    assert client.get("/api/market/popular-regions").json()["items"]


def test_search_listing_vs_transactions(client):
    res = client.get("/api/apartments/search?deal_type=sale&price_max=150000&sort=price_asc&size=5").json()
    prices = [i["price"] for i in res["items"]]
    assert prices == sorted(prices) and all(p <= 150000 for p in prices)
    item = res["items"][0]
    assert item["price_kind"].startswith("매물 호가") and item["ai_price"]["kind"].startswith("AI")
    assert client.get("/api/apartments/search?q=강남").json()["total"] > 0
    tx = client.get("/api/transactions/search?region=11680&size=5").json()
    assert tx["total"] > 0 and all(t["region"].endswith("강남구") for t in tx["items"])
    assert client.get("/api/apartments/suggest?q=마을").json()["complexes"]


def test_map_and_detail(client):
    items = client.get("/api/apartments/map?sw_lat=37.4&sw_lng=126.8&ne_lat=37.7&ne_lng=127.2").json()["items"]
    assert items and items[0]["recent"]
    cid = items[0]["id"]
    d = client.get(f"/api/apartments/{cid}").json()
    assert d["complex"]["id"] == cid and d["types"] and d["trades"] and d["infrastructure"]
    assert d["scores"]["transport"] is not None and d["types"][0]["estimate"]["model_version"]
    assert client.get("/api/apartments/999999").status_code == 404
    lat, lng = d["complex"]["lat"], d["complex"]["lng"]
    assert client.get(f"/api/infrastructure?lat={lat}&lng={lng}").json()["items"]


def test_prediction(client):
    info = client.get("/api/ai/model").json()
    assert info["ready"] and {"mae", "rmse", "mape", "r2"} <= set(info["metrics"]) and info["limitations"]
    res = client.get("/api/ai/predict/1?floor=10").json()
    est = res["estimate"]
    assert est["lower"] <= est["price"] <= est["upper"] and est["data_as_of"] and est["target_period"]
    assert res["effects"]["floor"] and res["history"]["12m"]["count"] >= 0 and "보장하지" in res["disclaimer"]


def test_recommend(client, user_headers):
    body = {"region_codes": ["11710"], "deal_type": "sale", "budget_max": 200000, "purpose": "residence", "top_k": 5}
    res = client.post("/api/ai/recommend", json=body, headers=user_headers).json()
    assert 0 < len(res["results"]) <= 5
    scores = [r["score"] for r in res["results"]]
    assert scores == sorted(scores, reverse=True)
    r = res["results"][0]
    assert r["reasons"] and set(r["components"]) >= {"budget", "region", "transport", "price"}
    inv = client.post("/api/ai/recommend", json={**body, "purpose": "investment"}).json()
    assert inv["weights"]["momentum"] > 0 and res["weights"]["momentum"] == 0
    jeonse = client.post("/api/ai/recommend", json={"deal_type": "jeonse", "budget_max": 80000}).json()
    assert all(x["deal_type"] == "jeonse" for x in jeonse["results"])
    assert client.get("/api/ai/recommendations/history", headers=user_headers).json()


def test_favorites_alerts_notifications(client, user_headers):
    detail = client.get("/api/apartments/search?deal_type=sale&size=1").json()["items"][0]
    fav = client.post("/api/favorites", json={"complex_id": detail["complex_id"]}, headers=user_headers)
    assert fav.status_code == 201
    assert any(f["complex_id"] == detail["complex_id"] for f in client.get("/api/favorites", headers=user_headers).json())
    alert = client.post("/api/alerts", json={"complex_id": detail["complex_id"], "deal_type": "sale", "condition": "below",
                                             "target_price": detail["price"] + 1000}, headers=user_headers).json()
    assert alert["triggered"]
    notes = client.get("/api/notifications", headers=user_headers).json()
    assert notes["unread"] >= 1 and notes["items"][0]["kind"] == "price_alert"
    client.post("/api/notifications/read-all", headers=user_headers)
    assert client.get("/api/notifications", headers=user_headers).json()["unread"] == 0
    assert client.patch(f"/api/alerts/{alert['id']}", json={"active": False}, headers=user_headers).json()["active"] is False
    assert client.delete(f"/api/alerts/{alert['id']}", headers=user_headers).json()["ok"]
    assert client.delete(f"/api/favorites/{fav.json()['id']}", headers=user_headers).json()["ok"]
    assert client.get("/api/favorites").status_code == 401


def test_preferences_and_saved_search(client, user_headers):
    pref = client.put("/api/me/preferences", json={"region_codes": ["11680"], "deal_type": "jeonse", "purpose": "residence"},
                      headers=user_headers).json()
    assert pref["deal_type"] == "jeonse"
    saved = client.post("/api/me/saved-searches", json={"name": "강남 전세", "query": {"region": "11680"}}, headers=user_headers).json()
    assert saved[0]["name"] == "강남 전세"
    client.get("/api/apartments/search?region=11680", headers=user_headers)
    assert client.get("/api/me/recent-searches", headers=user_headers).json()[0]["region_code"] == "11680"
    assert client.delete("/api/me/saved-searches/강남 전세", headers=user_headers).json() == []


def test_reports_and_verification(client, admin_headers, user_headers):
    listed = client.get("/api/reports").json()
    gen = client.post("/api/reports/generate", json={"kind": "monthly", "region_code": "11680"}, headers=admin_headers)
    assert gen.status_code == 201
    r = gen.json()
    assert r["generator"] == "rule" and all(f"## {i}." in r["content"] for i in range(1, 9))
    assert r["verification"]["passed"], r["verification"]
    assert client.get("/api/reports").json()["total"] == listed["total"] + 1
    assert client.post("/api/reports/ask", json={"question": "강남구 시장은?", "region_code": "11680"}, headers=user_headers).json()["answer"]
    assert client.post("/api/reports/generate", json={"kind": "weekly"}, headers=user_headers).status_code == 403
    assert client.delete(f"/api/reports/{r['id']}", headers=admin_headers).json()["ok"]


def test_verify_numbers_flags_fabricated():
    ctx = {"national": {"ppm2": 1234.5, "volume": 321}}
    assert report.verify_numbers("평균 1234.5만원, 거래 321건", ctx)["passed"]
    assert not report.verify_numbers("평균 9876.5만원", ctx)["passed"]


def test_test_admin_read_only(client, test_admin_headers):
    dash = client.get("/api/admin/dashboard", headers=test_admin_headers).json()
    assert dash["masked"] and dash["counts"]["transactions"] > 0
    users = client.get("/api/admin/users", headers=test_admin_headers).json()
    assert users["masked"] and all("*" in u["email"] for u in users["items"])
    for method, path, body in (("post", "/api/admin/properties", {"apartment_id": 1, "deal_type": "sale", "price": 1}),
                               ("put", "/api/admin/properties/1", {"price": 1}), ("delete", "/api/admin/properties/1", None),
                               ("patch", "/api/admin/users/1", {"is_active": False}),
                               ("post", "/api/favorites", {"complex_id": 1})):
        res = getattr(client, method)(path, headers=test_admin_headers, **({"json": body} if body else {}))
        assert res.status_code == 403 and res.json()["code"] == "READ_ONLY", (method, path)
    # 조회 성격의 POST 는 명시적 예외
    assert client.post("/api/ai/recommend", json={"deal_type": "sale"}, headers=test_admin_headers).status_code == 200


def test_admin_crud_and_audit(client, admin_headers, user_headers):
    assert client.get("/api/admin/dashboard", headers=user_headers).status_code == 403
    dash = client.get("/api/admin/dashboard", headers=admin_headers).json()
    assert dash["masked"] is False and dash["system"]["db"] == "sqlite"
    created = client.post("/api/admin/properties", json={"apartment_id": 1, "deal_type": "sale", "price": 99000, "floor": 7},
                          headers=admin_headers)
    assert created.status_code == 201
    pid = created.json()["id"]
    assert client.put(f"/api/admin/properties/{pid}", json={"status": "approved"}, headers=admin_headers).json()["status"] == "approved"
    assert client.get(f"/api/properties/{pid}").json()["price"] == 99000
    assert client.delete(f"/api/admin/properties/{pid}", headers=admin_headers).json()["ok"]
    assert client.get("/api/admin/properties/duplicates", headers=admin_headers).json()["items"]
    actions = [a["action"] for a in client.get("/api/admin/audit-logs", headers=admin_headers).json()]
    assert {"property.create", "property.update", "property.delete", "admin.login"} <= set(actions)
    assert client.get("/api/admin/models", headers=admin_headers).json()["versions"]
    assert client.get("/api/admin/anomalies", headers=admin_headers).json()["transactions"]
    assert client.get("/api/admin/data/sources", headers=admin_headers).json()
    res = client.post("/api/admin/data/collect", json={"source": "molit_trade", "region_code": "11680", "months": ["202609"]},
                      headers=admin_headers).json()
    assert res["queued"] is False and res["status"] == "skipped"
    assert client.get("/api/admin/data/logs", headers=admin_headers).json()[0]["status"] == "skipped"
    inq = client.post("/api/inquiries", json={"name": "홍길동", "email": "h@test.kr", "category": "partnership", "message": "제휴 문의드립니다."})
    assert inq.status_code == 201
    assert client.patch(f"/api/admin/inquiries/{inq.json()['id']}", json={"answer": "확인했습니다."}, headers=admin_headers).json()["status"] == "answered"
    assert client.post("/api/admin/notifications/broadcast", json={"title": "점검", "message": "점검 안내"}, headers=admin_headers).status_code == 201


TRADE_XML = """<?xml version="1.0" encoding="UTF-8"?><response><header><resultCode>000</resultCode><resultMsg>OK</resultMsg></header>
<body><items>
<item><aptNm>테스트아파트</aptNm><aptSeq>11680-9999</aptSeq><buildYear>2010</buildYear><dealAmount>123,500</dealAmount>
<dealDay>15</dealDay><dealMonth>9</dealMonth><dealYear>2026</dealYear><excluUseAr>84.97</excluUseAr><floor>12</floor>
<umdNm>대치동</umdNm><jibun>100</jibun><dealingGbn>중개거래</dealingGbn><cdealType> </cdealType></item>
<item><aptNm>테스트아파트</aptNm><aptSeq>11680-9999</aptSeq><buildYear>2010</buildYear><dealAmount>123,500</dealAmount>
<dealDay>15</dealDay><dealMonth>9</dealMonth><dealYear>2026</dealYear><excluUseAr>84.97</excluUseAr><floor>12</floor>
<umdNm>대치동</umdNm><jibun>100</jibun><dealingGbn>중개거래</dealingGbn></item>
<item><aptNm></aptNm><dealAmount>1</dealAmount></item>
</items><numOfRows>1000</numOfRows><pageNo>1</pageNo><totalCount>3</totalCount></body></response>"""


def test_collector_parses_dedupes_and_logs(monkeypatch):
    monkeypatch.setattr(settings, "data_go_kr_api_key", "dummy-key")
    transport = httpx.MockTransport(lambda req: httpx.Response(200, content=TRADE_XML.encode()))
    with SessionLocal() as db, httpx.Client(transport=transport) as http:
        log = collector.collect(db, "molit_trade", "11680", "202609", client=http)
        assert (log.status, log.fetched, log.inserted, log.duplicates, log.invalid) == ("success", 3, 1, 1, 1)
        row = db.query(TransactionHistory).filter(TransactionHistory.source == "molit").one()
        assert row.price == 123500 and row.deal_date == date(2026, 9, 15) and row.exclusive_area == 84.97
        again = collector.collect(db, "molit_trade", "11680", "202609", client=http)
        assert again.inserted == 0 and again.duplicates == 2
    error = httpx.MockTransport(lambda req: httpx.Response(200, content=b"<response><header><resultCode>30</resultCode><resultMsg>SERVICE KEY IS NOT REGISTERED</resultMsg></header></response>"))
    with SessionLocal() as db, httpx.Client(transport=error) as http:
        log = collector.collect(db, "molit_trade", "11680", "202608", client=http)
        assert log.status == "failed" and "30" in log.error


def test_metrics():
    m = metrics.regression_metrics([100, 200], [110, 190])
    assert m["mae"] == 10 and m["mape"] == 7.5
    assert metrics.precision_at_k([1, 2, 3], {1, 3}, 2) == 0.5
    assert metrics.recall_at_k([1, 2, 3], {1, 3}, 3) == 1.0
    assert metrics.ndcg_at_k([1, 2], {1: 1, 2: 1}, 2) == 1.0


def test_rate_limit_login(client, monkeypatch):
    from app.middleware import STRICT_LIMITS
    monkeypatch.setitem(STRICT_LIMITS, "/api/auth/login", 2)
    codes = [client.post("/api/auth/login", json={"email": "x@y.kr", "password": "Nope1234!"}).status_code for _ in range(4)]
    assert codes[-1] == 429


def test_websocket(client, user_headers):
    token = user_headers["Authorization"].split()[1]
    with client.websocket_connect(f"/ws/notifications?token={token}") as ws:
        assert ws.receive_json() == {"type": "hello", "authenticated": True}
        ws.send_text("ping")
        assert ws.receive_json()["type"] == "pong"
