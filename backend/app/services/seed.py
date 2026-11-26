"""기본 마스터 데이터 + 데모용 '가상 샘플 데이터' 적재.

- 지역(행정구역 코드), 데이터 출처, 테스트 계정은 항상 준비합니다.
- 공공데이터 API 인증키가 없는 환경(Netlify 데모·로컬·CI)에서도 화면을 시연할 수 있도록
  SEED_SAMPLE_DATA=true 이고 단지 데이터가 비어 있을 때만 가상 단지·거래를 생성합니다.
- 생성되는 모든 행은 source='sample' 이며 UI 에서 '가상 샘플 데이터' 로 표시됩니다.
  (실제 국토교통부 실거래가가 아님 — 관리자 > 데이터 관제에서 일괄 삭제 가능)
"""
import hashlib
import math
from datetime import date, timedelta

import numpy as np
from sqlalchemy import func, insert, select
from sqlalchemy.orm import Session

from ..core.config import settings
from ..models import (Apartment, ApartmentComplex, DataSource, FavoriteProperty, Infrastructure, PriceAlert, Property,
                      Region, RentalHistory, TransactionHistory, User, UserPreference, utcnow)
from .geo import haversine_m, offset
from .regions import REGIONS, SAMPLE_PARAMS

TEST_USER = {"email": "user@aptpick.kr", "name": "테스트 사용자", "role": "user"}
TEST_ADMIN = {"email": "testadmin@aptpick.kr", "name": "테스트 관리자", "role": "test_admin"}
TEAM = [("park.mg@aptpick.kr", "박미금"), ("kim.mr@aptpick.kr", "김모란"),
        ("lee.or@aptpick.kr", "이오리"), ("hong.kh@aptpick.kr", "홍기흥")]

DATA_SOURCES = [
    ("molit_trade", "아파트 매매 실거래가 자료", "국토교통부", "https://www.data.go.kr/data/15126469/openapi.do",
     "공공데이터포털 OpenAPI · 법정동코드 5자리 + 계약년월"),
    ("molit_rent", "아파트 전월세 실거래가 자료", "국토교통부", "https://www.data.go.kr/data/15126474/openapi.do",
     "공공데이터포털 OpenAPI · 법정동코드 5자리 + 계약년월"),
    ("mois_region", "행정표준코드(법정동코드)", "행정안전부", "https://www.code.go.kr",
     "시군구 마스터(regions) 기준 코드"),
    ("reb_stats", "부동산통계정보 R-ONE", "한국부동산원", "https://www.reb.or.kr/r-one/",
     "가격지수 비교 검증용 — 연동 예정"),
    ("kakao_local", "Kakao Local API (주소→좌표)", "Kakao", "https://developers.kakao.com/docs/latest/ko/local/dev-guide",
     "실거래 단지 좌표 변환 (KAKAO_REST_API_KEY)"),
    ("gemini", "Gemini API (분석 리포트)", "Google", "https://ai.google.dev/gemini-api/docs",
     "검증된 통계만 전달하여 리포트 생성 (GEMINI_API_KEY)"),
    ("sample", "aptpick 가상 샘플 데이터", "aptpick", "", "데모 전용 — 실제 시세·실거래가 아님"),
]

TYPES = [(59.97, 3, 2, "59A"), (74.93, 3, 2, "74A"), (84.98, 3, 2, "84A"), (101.94, 4, 2, "101A"),
         (114.86, 4, 2, "114A"), (134.72, 4, 2, "134A")]
NAME_HEAD = ["한빛", "푸른숲", "새솔", "하늘채움", "미르", "라온", "다온", "솔빛", "누리", "햇살", "별빛", "가람", "온누리",
             "은빛", "산들", "아름", "늘봄", "도담", "한울", "참빛", "해든", "윤슬", "여울", "나래", "다솜", "마루"]
NAME_TAIL = ["마을", "파크", "리버뷰", "센트럴", "힐스", "타운", "포레", "시티", "레이크"]
INFRA_PLAN = {  # category: (개수, 이름 목록)
    "subway": (4, ["중앙역", "공원역", "시청역", "남부역", "북부역", "호수역"]),
    "bus": (10, ["사거리 정류장", "주민센터 정류장", "시장 정류장", "공원입구 정류장", "도서관 정류장"]),
    "school": (6, ["한빛초등학교", "새솔초등학교", "가람중학교", "누리중학교", "도담고등학교", "한울고등학교"]),
    "hospital": (3, ["종합병원", "의원", "소아청소년과"]),
    "pharmacy": (4, ["온누리약국", "건강약국", "미소약국", "사랑약국"]),
    "mart": (2, ["대형마트", "식자재마트"]),
    "park": (3, ["근린공원", "수변공원", "체육공원"]),
    "culture": (2, ["도서관", "문화센터"]),
}


def _key(*parts) -> str:
    return hashlib.sha1("|".join(map(str, parts)).encode()).hexdigest()


def _months(end: date, count: int) -> list[date]:
    out, cur = [], end.replace(day=1)
    for _ in range(count):
        out.append(cur)
        cur = (cur - timedelta(days=1)).replace(day=1)
    return out[::-1]


def last_full_month(today: date | None = None) -> date:
    today = today or date.today()
    return (today.replace(day=1) - timedelta(days=1)).replace(day=1)


def seed_base(db: Session) -> None:
    existing = set(db.scalars(select(Region.code)))
    db.add_all(Region(code=c, sido=s, sigungu=g, lat=la, lng=ln) for c, s, g, la, ln in REGIONS if c not in existing)
    have = {s.code: s for s in db.scalars(select(DataSource))}
    for code, name, provider, url, notes in DATA_SOURCES:
        if code not in have:
            db.add(DataSource(code=code, name=name, provider=provider, url=url, notes=notes))
    db.flush()
    status = {
        "molit_trade": "active" if settings.data_go_kr_api_key else "needs_key",
        "molit_rent": "active" if settings.data_go_kr_api_key else "needs_key",
        "mois_region": "active", "reb_stats": "planned",
        "kakao_local": "active" if settings.kakao_rest_api_key else "needs_key",
        "gemini": "active" if settings.gemini_api_key else "needs_key", "sample": "sample",
    }
    for src in db.scalars(select(DataSource)):
        src.status = status.get(src.code, src.status)
    for account in (TEST_USER, TEST_ADMIN, *({"email": e, "name": n, "role": "user"} for e, n in TEAM)):
        if not db.scalar(select(User.id).where(User.email == account["email"])):
            db.add(User(**account))
    db.commit()


def seed_sample(db: Session, today: date | None = None) -> bool:
    if not settings.seed_sample_data or db.scalar(select(func.count(ApartmentComplex.id))):
        return False
    rng = np.random.default_rng(20261126)
    regions = {r.code: r for r in db.scalars(select(Region))}
    months = _months(last_full_month(today), 36)
    names = iter(f"{h}{t}" for t in NAME_TAIL for h in rng.permutation(NAME_HEAD))
    used_names: set[str] = set()
    trades, rents, complexes_meta = [], [], []

    for code, (base_m2, growth, jeonse_ratio, vol_factor, n_complex) in SAMPLE_PARAMS.items():
        region = regions[code]
        phase = rng.uniform(0, 2 * math.pi)
        walk = np.cumsum(rng.normal(0, 0.0045, len(months)))
        index = np.exp(growth * np.arange(len(months)) / 12 + 0.025 * np.sin(2 * np.pi * np.arange(len(months)) / 30 + phase)
                       + walk - walk[-1] * 0.2)
        # 생활 인프라 POI (가상)
        pois = []
        for category, (count, labels) in INFRA_PLAN.items():
            for i in range(count):
                r, theta = 2600 * math.sqrt(rng.uniform()), rng.uniform(0, 2 * math.pi)
                lat, lng = offset(region.lat, region.lng, r * math.cos(theta), r * math.sin(theta))
                label = labels[i % len(labels)]
                pois.append(Infrastructure(region_code=code, category=category, lat=lat, lng=lng, source="sample",
                                           name=f"{region.sigungu.split()[-1]} {label}{'' if i < len(labels) else f' {i + 1}'} (샘플)"))
        db.add_all(pois)
        subway = np.array([(p.lat, p.lng) for p in pois if p.category == "subway"])

        for k in range(n_complex):
            name = next(names)
            while name in used_names:
                name = next(names)
            used_names.add(name)
            r, theta = 2000 * math.sqrt(rng.uniform(0.05, 1)), rng.uniform(0, 2 * math.pi)
            lat, lng = offset(region.lat, region.lng, r * math.cos(theta), r * math.sin(theta))
            build_year = int(rng.integers(1988, 2023))
            households = int(rng.integers(30, 300)) * 10
            complex_ = ApartmentComplex(
                complex_code=f"SAMPLE-{code}-{k + 1:02d}", name=f"{name}{' ' + str(k % 3 + 1) + '단지' if rng.uniform() < 0.4 else ''}",
                region_code=code, dong="샘플동", address=f"{region.full_name} (가상 샘플 단지)", lat=lat, lng=lng,
                build_year=build_year, households=households, max_floor=int(rng.integers(12, 36)), source="sample")
            picks = sorted(rng.choice(len(TYPES), size=int(rng.integers(2, 4)), replace=False))
            complex_.apartments = [Apartment(exclusive_area=TYPES[i][0], supply_area=round(TYPES[i][0] * 1.33, 2),
                                             rooms=TYPES[i][1], bathrooms=TYPES[i][2], type_name=TYPES[i][3]) for i in picks]
            db.add(complex_)
            d_subway = float(haversine_m(lat, lng, subway[:, 0], subway[:, 1]).min())
            age = 2025 - build_year
            premium = ((1 - 0.007 * max(0, age - 5)) * (1 + 0.035 * math.log(households / 900))
                       * (1 + 0.09 * max(0.0, 1 - d_subway / 1500)) * rng.uniform(0.92, 1.1))
            complexes_meta.append((complex_, premium, index, base_m2, jeonse_ratio, vol_factor))
    db.flush()

    for complex_, premium, index, base_m2, jeonse_ratio, vol_factor in complexes_meta:
        n_types = len(complex_.apartments)
        for apt in complex_.apartments:
            area = apt.exclusive_area
            area_factor = 1 + 0.05 * (84 - area) / 84
            lam = 0.75 * vol_factor * (complex_.households / 1200) ** 0.6 * 2.4 / n_types
            for t, month in enumerate(months):
                days_in_month = ((month.replace(day=28) + timedelta(days=4)).replace(day=1) - month).days
                momentum = index[t] / index[max(0, t - 3)] - 1
                for j in range(int(rng.poisson(max(0.05, lam * (1 + 4 * momentum))))):
                    floor = int(rng.integers(1, complex_.max_floor + 1))
                    floor_factor = 0.94 if floor <= 2 else 1 + 0.004 * min(floor, 20)
                    price = base_m2 * index[t] * premium * area_factor * floor_factor * area * rng.lognormal(0, 0.035)
                    dealing = "중개거래"
                    if rng.uniform() < 0.012:  # 특수관계 직거래 등 이상 거래 (이상치 탐지 데모)
                        price *= rng.uniform(0.62, 0.78)
                        dealing = "직거래"
                    deal_date = month + timedelta(days=int(rng.integers(0, days_in_month)))
                    price = int(round(price / 50) * 50)
                    trades.append(dict(complex_id=complex_.id, apartment_id=apt.id, region_code=complex_.region_code,
                                       exclusive_area=area, floor=floor, price=price, deal_date=deal_date,
                                       dealing_type=dealing, canceled=bool(rng.uniform() < 0.01), source="sample",
                                       source_key=_key("sample-trade", complex_.complex_code, area, floor, price, deal_date, j)))
                for j in range(int(rng.poisson(lam * 1.4))):
                    floor = int(rng.integers(1, complex_.max_floor + 1))
                    sale_est = base_m2 * index[t] * premium * area_factor * area
                    jr = jeonse_ratio * (1 + 0.0035 * (complex_.build_year - 2005) / 2) * rng.lognormal(0, 0.05)
                    jeonse = sale_est * min(jr, 0.9)
                    renewal = rng.uniform() < 0.3
                    if renewal:
                        jeonse *= 0.95
                    monthly = 0
                    if rng.uniform() < 0.4:
                        deposit = jeonse * rng.uniform(0.1, 0.4)
                        monthly = int(round((jeonse - deposit) * 0.05 / 12))
                        jeonse = deposit
                    deposit = int(round(jeonse / 100) * 100)
                    deal_date = month + timedelta(days=int(rng.integers(0, days_in_month)))
                    rents.append(dict(complex_id=complex_.id, apartment_id=apt.id, region_code=complex_.region_code,
                                      exclusive_area=area, floor=floor, deposit=deposit, monthly_rent=monthly,
                                      contract_type="갱신" if renewal else "신규", deal_date=deal_date, source="sample",
                                      source_key=_key("sample-rent", complex_.complex_code, area, floor, deposit, monthly, deal_date, j)))
            # 등록 매물 (호가) — 최근 시세 대비 약간 높은 호가
            est = base_m2 * index[-1] * premium * area_factor * area
            listings = [("sale", est * rng.uniform(1.0, 1.09), 0) for _ in range(int(rng.integers(1, 3)))]
            listings.append(("jeonse", est * jeonse_ratio * rng.uniform(0.98, 1.08), 0))
            if rng.uniform() < 0.6:
                deposit = est * jeonse_ratio * rng.uniform(0.1, 0.3)
                listings.append(("monthly", deposit, (est * jeonse_ratio - deposit) * 0.055 / 12))
            for deal_type, price, rent in listings:
                db.add(Property(apartment_id=apt.id, complex_id=complex_.id, deal_type=deal_type,
                                price=int(round(price / 500) * 500) if deal_type != "monthly" else int(round(price / 100) * 100),
                                monthly_rent=int(round(rent)), floor=int(rng.integers(2, complex_.max_floor + 1)),
                                direction=str(rng.choice(["남향", "남동향", "남서향", "동향", "서향"])),
                                description=f"{apt.type_name}타입 · {'역세권 ' if rng.uniform() < 0.5 else ''}가상 샘플 매물",
                                agency=f"aptpick 샘플공인중개사 {int(rng.integers(1, 30)):02d}",
                                status="pending" if rng.uniform() < 0.05 else "approved", source="sample",
                                registered_at=utcnow() - timedelta(days=int(rng.integers(0, 40)), hours=int(rng.integers(0, 24)))))
    for chunk in range(0, len(trades), 1000):
        db.execute(insert(TransactionHistory), trades[chunk:chunk + 1000])
    for chunk in range(0, len(rents), 1000):
        db.execute(insert(RentalHistory), rents[chunk:chunk + 1000])
    db.flush()
    # 중복 매물 관리 데모: 동일 조건 매물 2건
    for prop in db.scalars(select(Property).where(Property.deal_type == "sale").limit(2)):
        db.add(Property(apartment_id=prop.apartment_id, complex_id=prop.complex_id, deal_type="sale", price=prop.price,
                        floor=prop.floor, direction=prop.direction, description=prop.description + " (중복 등록 의심)",
                        agency="aptpick 샘플공인중개사 99", status="pending", source="sample"))
    _seed_test_user_data(db)
    db.commit()
    return True


def _seed_test_user_data(db: Session) -> None:
    user = db.scalar(select(User).where(User.email == TEST_USER["email"]))
    if not user or user.preference:
        return
    user.preference = UserPreference(region_codes=["11710", "41135"], deal_type="sale", budget_min=80000,
                                     budget_max=160000, area_min=59, area_max=100, rooms_min=3, transport_weight=4,
                                     school_weight=4, infra_weight=3, purpose="residence")
    complex_ids = list(db.scalars(select(ApartmentComplex.id).where(ApartmentComplex.region_code == "11710").limit(2)))
    for cid in complex_ids:
        db.add(FavoriteProperty(user_id=user.id, complex_id=cid, memo="주말 임장 예정"))
    if complex_ids:
        apt = db.scalar(select(Apartment).where(Apartment.complex_id == complex_ids[0]))
        db.add(PriceAlert(user_id=user.id, complex_id=complex_ids[0], apartment_id=apt.id, deal_type="sale",
                          condition="below", target_price=100000))
