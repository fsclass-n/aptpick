"""아파트·매물·실거래 검색 쿼리"""
from sqlalchemy import Select, func, or_, select
from sqlalchemy.orm import Session, selectinload

from ..models import Apartment, ApartmentComplex, Property, Region, TransactionHistory

SORTS = {
    "recent": (Property.registered_at.desc(),),
    "price_asc": (Property.price.asc(),),
    "price_desc": (Property.price.desc(),),
    "area_desc": (Apartment.exclusive_area.desc(),),
    "area_asc": (Apartment.exclusive_area.asc(),),
    "build_year_desc": (ApartmentComplex.build_year.desc(),),
}


def property_query(f: dict) -> Select:
    q = (select(Property).join(Apartment, Property.apartment_id == Apartment.id)
         .join(ApartmentComplex, Property.complex_id == ApartmentComplex.id)
         .join(Region, ApartmentComplex.region_code == Region.code)
         .where(Property.status == "approved"))
    if f.get("q"):
        like = f"%{f['q'].strip()}%"
        q = q.where(or_(ApartmentComplex.name.like(like), Region.sigungu.like(like), Region.sido.like(like),
                        ApartmentComplex.dong.like(like)))
    if f.get("region"):
        q = q.where(ApartmentComplex.region_code == f["region"])
    if f.get("sido"):
        q = q.where(Region.sido == f["sido"])
    if f.get("deal_type"):
        q = q.where(Property.deal_type == f["deal_type"])
    for key, col, op in (("price_min", Property.price, "ge"), ("price_max", Property.price, "le"),
                         ("area_min", Apartment.exclusive_area, "ge"), ("area_max", Apartment.exclusive_area, "le"),
                         ("build_year_min", ApartmentComplex.build_year, "ge"), ("build_year_max", ApartmentComplex.build_year, "le"),
                         ("rooms_min", Apartment.rooms, "ge"), ("rent_max", Property.monthly_rent, "le")):
        if f.get(key) is not None:
            q = q.where(col >= f[key] if op == "ge" else col <= f[key])
    if f.get("complex_id"):
        q = q.where(Property.complex_id == f["complex_id"])
    return q


def search_properties(db: Session, f: dict, page: int, size: int) -> tuple[list[Property], int]:
    q = property_query(f)
    total = db.scalar(select(func.count()).select_from(q.subquery())) or 0
    order = SORTS.get(f.get("sort") or "recent", SORTS["recent"])
    rows = db.scalars(q.options(selectinload(Property.apartment), selectinload(Property.complex).selectinload(ApartmentComplex.region),
                                selectinload(Property.images))
                      .order_by(*order, Property.id.desc()).offset((page - 1) * size).limit(size)).all()
    return list(rows), total


def search_transactions(db: Session, f: dict, page: int, size: int):
    q = (select(TransactionHistory, ApartmentComplex.name, Region.sido, Region.sigungu)
         .join(ApartmentComplex, TransactionHistory.complex_id == ApartmentComplex.id)
         .join(Region, ApartmentComplex.region_code == Region.code)
         .where(TransactionHistory.canceled.is_(False)))
    if f.get("q"):
        like = f"%{f['q'].strip()}%"
        q = q.where(or_(ApartmentComplex.name.like(like), Region.sigungu.like(like)))
    if f.get("region"):
        q = q.where(TransactionHistory.region_code == f["region"])
    for key, col, op in (("price_min", TransactionHistory.price, "ge"), ("price_max", TransactionHistory.price, "le"),
                         ("area_min", TransactionHistory.exclusive_area, "ge"), ("area_max", TransactionHistory.exclusive_area, "le"),
                         ("date_from", TransactionHistory.deal_date, "ge"), ("date_to", TransactionHistory.deal_date, "le")):
        if f.get(key) is not None:
            q = q.where(col >= f[key] if op == "ge" else col <= f[key])
    total = db.scalar(select(func.count()).select_from(q.subquery())) or 0
    rows = db.execute(q.order_by(TransactionHistory.deal_date.desc(), TransactionHistory.id.desc())
                      .offset((page - 1) * size).limit(size)).all()
    return rows, total


def complexes_in_bounds(db: Session, sw_lat: float, sw_lng: float, ne_lat: float, ne_lng: float, limit: int = 500):
    return db.scalars(select(ApartmentComplex).where(ApartmentComplex.lat.between(sw_lat, ne_lat),
                                                     ApartmentComplex.lng.between(sw_lng, ne_lng))
                      .options(selectinload(ApartmentComplex.apartments), selectinload(ApartmentComplex.region))
                      .limit(limit)).all()
