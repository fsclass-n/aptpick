"""국토교통부 아파트 매매·전월세 실거래가 OpenAPI 수집 파이프라인.

API → 응답/스키마 검증 → 정규화(금액 단위 만원·면적·층·지역코드) → 중복 제거(source_key 해시)
→ 단지/평형 매핑(aptSeq) → TiDB 적재 → 수집 이력(data_collection_logs) 기록 → 통계 재계산.
- 호출 실패 시 지수 백오프로 최대 3회 재시도
- 해제(cdealType='O') 거래는 canceled=True 로 저장하고 통계에서 제외
- 좌표: KAKAO_REST_API_KEY 가 있으면 주소 → 좌표 변환, 없으면 시군구 대표 좌표(geo_precise=False)
"""
import hashlib
import time
import xml.etree.ElementTree as ET
from datetime import date

import httpx
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..core.config import settings
from ..models import (Apartment, ApartmentComplex, DataCollectionLog, DataSource, Region, RentalHistory,
                      TransactionHistory, utcnow)
from .geo import offset

ENDPOINTS = {
    "molit_trade": "https://apis.data.go.kr/1613000/RTMSDataSvcAptTrade/getRTMSDataSvcAptTrade",
    "molit_rent": "https://apis.data.go.kr/1613000/RTMSDataSvcAptRent/getRTMSDataSvcAptRent",
}
PAGE_SIZE = 1000


class CollectError(Exception):
    pass


def _text(item: ET.Element, *tags: str) -> str:
    for tag in tags:
        el = item.find(tag)
        if el is not None and el.text:
            return el.text.strip()
    return ""


def _int(v: str) -> int | None:
    v = (v or "").replace(",", "").strip()
    try:
        return int(float(v))
    except ValueError:
        return None


def fetch_page(source: str, lawd_cd: str, deal_ymd: str, page: int, client: httpx.Client) -> tuple[list[ET.Element], int]:
    params = {"serviceKey": settings.data_go_kr_api_key, "LAWD_CD": lawd_cd, "DEAL_YMD": deal_ymd,
              "pageNo": page, "numOfRows": PAGE_SIZE}
    last_error = ""
    for attempt in range(3):
        try:
            res = client.get(ENDPOINTS[source], params=params, timeout=30)
            res.raise_for_status()
            root = ET.fromstring(res.content)
            code = _text(root, "header/resultCode", ".//resultCode")
            if code not in {"00", "000"}:
                raise CollectError(f"API 오류 {code}: {_text(root, 'header/resultMsg', './/resultMsg', './/returnAuthMsg')}")
            items = root.findall(".//items/item")
            total = _int(_text(root, "body/totalCount", ".//totalCount")) or len(items)
            return items, total
        except CollectError:
            raise
        except (httpx.HTTPError, ET.ParseError) as exc:
            last_error = str(exc)
            time.sleep(2 ** attempt)
    raise CollectError(f"API 호출 실패(3회 재시도): {last_error}")


def parse_trade(item: ET.Element, lawd_cd: str) -> dict | None:
    price, area = _int(_text(item, "dealAmount")), _text(item, "excluUseAr")
    y, m, d = _int(_text(item, "dealYear")), _int(_text(item, "dealMonth")), _int(_text(item, "dealDay"))
    name = _text(item, "aptNm")
    if not (price and area and y and m and d and name):
        return None
    return {"apt_seq": _text(item, "aptSeq") or f"{lawd_cd}-{name}-{_text(item, 'jibun')}", "name": name,
            "dong": _text(item, "umdNm"), "jibun": _text(item, "jibun"), "build_year": _int(_text(item, "buildYear")),
            "area": round(float(area), 2), "floor": _int(_text(item, "floor")), "price": price, "deal_date": date(y, m, d),
            "dealing_type": _text(item, "dealingGbn") or "중개거래", "canceled": _text(item, "cdealType") == "O"}


def parse_rent(item: ET.Element, lawd_cd: str) -> dict | None:
    deposit, area = _int(_text(item, "deposit")), _text(item, "excluUseAr")
    y, m, d = _int(_text(item, "dealYear")), _int(_text(item, "dealMonth")), _int(_text(item, "dealDay"))
    name = _text(item, "aptNm")
    if deposit is None or not (area and y and m and d and name):
        return None
    return {"apt_seq": _text(item, "aptSeq") or f"{lawd_cd}-{name}-{_text(item, 'jibun')}", "name": name,
            "dong": _text(item, "umdNm"), "jibun": _text(item, "jibun"), "build_year": _int(_text(item, "buildYear")),
            "area": round(float(area), 2), "floor": _int(_text(item, "floor")), "deposit": deposit,
            "monthly_rent": _int(_text(item, "monthlyRent")) or 0, "contract_type": _text(item, "contractType") or "신규",
            "deal_date": date(y, m, d)}


def _geocode(address: str, client: httpx.Client) -> tuple[float, float] | None:
    if not settings.kakao_rest_api_key:
        return None
    try:
        res = client.get("https://dapi.kakao.com/v2/local/search/address.json", params={"query": address},
                         headers={"Authorization": f"KakaoAK {settings.kakao_rest_api_key}"}, timeout=10)
        docs = res.json().get("documents", [])
        return (float(docs[0]["y"]), float(docs[0]["x"])) if docs else None
    except (httpx.HTTPError, ValueError, KeyError):
        return None


def _complex_for(db: Session, region: Region, row: dict, client: httpx.Client, cache: dict) -> tuple[ApartmentComplex, Apartment]:
    key = row["apt_seq"][:40]
    c = cache.get(key) or db.scalar(select(ApartmentComplex).where(ApartmentComplex.complex_code == key))
    if not c:
        address = f"{region.full_name} {row['dong']} {row['jibun']}".strip()
        geo = _geocode(address, client)
        h = int(hashlib.md5(key.encode()).hexdigest()[:8], 16)
        lat, lng = geo or offset(region.lat, region.lng, (h % 2000) - 1000, ((h >> 12) % 2000) - 1000)
        c = ApartmentComplex(complex_code=key, name=row["name"][:100], region_code=region.code, dong=row["dong"],
                             address=address, lat=lat, lng=lng, geo_precise=bool(geo), build_year=row["build_year"],
                             source="molit")
        db.add(c)
        db.flush()
    cache[key] = c
    apt = next((a for a in c.apartments if abs(a.exclusive_area - row["area"]) < 0.01), None)
    if not apt:
        apt = Apartment(complex_id=c.id, exclusive_area=row["area"], supply_area=None, type_name=f"{round(row['area'])}㎡",
                        rooms=3 if row["area"] >= 59 else 2, bathrooms=2 if row["area"] >= 59 else 1)
        c.apartments.append(apt)
        db.flush()
    return c, apt


def collect(db: Session, source: str, region_code: str, deal_ymd: str, client: httpx.Client | None = None) -> DataCollectionLog:
    if source not in ENDPOINTS:
        raise CollectError("지원하지 않는 데이터 소스입니다.")
    log = DataCollectionLog(source_code=source, region_code=region_code, period=f"{deal_ymd[:4]}-{deal_ymd[4:]}", status="running")
    db.add(log)
    db.commit()
    region = db.get(Region, region_code)
    own_client = client is None
    client = client or httpx.Client()
    try:
        if not settings.data_go_kr_api_key:
            raise CollectError("DATA_GO_KR_API_KEY 가 설정되지 않아 수집을 건너뜁니다.")
        if not region:
            raise CollectError(f"등록되지 않은 지역 코드입니다: {region_code}")
        items, page, total = [], 1, None
        while total is None or len(items) < total:
            batch, total = fetch_page(source, region_code, deal_ymd, page, client)
            items += batch
            if not batch:
                break
            page += 1
        parser = parse_trade if source == "molit_trade" else parse_rent
        rows = [parser(i, region_code) for i in items]
        valid = [r for r in rows if r]
        log.fetched, log.invalid = len(items), len(rows) - len(valid)
        model = TransactionHistory if source == "molit_trade" else RentalHistory
        existing = set(db.scalars(select(model.source_key).where(model.region_code == region_code,
                                                                 model.source == "molit")))
        cache, inserted, dup = {}, 0, 0
        for seq, r in enumerate(valid):
            amount = r.get("price", r.get("deposit"))
            key = hashlib.sha1(f"{source}|{r['apt_seq']}|{r['area']}|{r['floor']}|{amount}|{r.get('monthly_rent', 0)}|"
                               f"{r['deal_date']}".encode()).hexdigest()
            if key in existing:
                dup += 1
                continue
            existing.add(key)
            c, apt = _complex_for(db, region, r, client, cache)
            common = dict(complex_id=c.id, apartment_id=apt.id, region_code=region_code, exclusive_area=r["area"],
                          floor=r["floor"], deal_date=r["deal_date"], source="molit", source_key=key)
            if source == "molit_trade":
                db.add(TransactionHistory(**common, price=r["price"], dealing_type=r["dealing_type"][:10], canceled=r["canceled"]))
            else:
                db.add(RentalHistory(**common, deposit=r["deposit"], monthly_rent=r["monthly_rent"], contract_type=r["contract_type"][:10]))
            inserted += 1
        log.inserted, log.duplicates, log.status = inserted, dup, "success"
        src = db.scalar(select(DataSource).where(DataSource.code == source))
        if src:
            src.last_synced_at, src.record_count, src.status = utcnow(), (src.record_count or 0) + inserted, "active"
    except CollectError as exc:
        db.rollback()
        log.status = "skipped" if "DATA_GO_KR_API_KEY" in str(exc) else "failed"
        log.error = str(exc)
    except Exception as exc:  # 예기치 못한 오류도 수집 이력에 남김
        db.rollback()
        log.status, log.error = "failed", f"{type(exc).__name__}: {exc}"
    finally:
        log.finished_at = utcnow()
        db.add(log)
        db.commit()
        if own_client:
            client.close()
    return log
