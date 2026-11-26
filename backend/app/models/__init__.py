"""aptpick 데이터베이스 모델 (TiDB Cloud · database=aptpick)

가격 단위는 모두 '만원'(국토교통부 실거래가 API 거래금액 단위와 동일), 면적은 전용면적 ㎡.
source 컬럼으로 실데이터(molit 등)와 가상 샘플 데이터(sample)를 구분합니다.
"""
from datetime import date, datetime, timezone

from sqlalchemy import (JSON, Boolean, Date, DateTime, Float, ForeignKey, Index, Integer, String, Text,
                        UniqueConstraint)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from ..database import Base


def utcnow() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


class TimestampMixin:
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)


# ---------------------------------------------------------------- 사용자 / 권한
class User(TimestampMixin, Base):
    __tablename__ = "users"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    email: Mapped[str] = mapped_column(String(191), unique=True, index=True)
    name: Mapped[str] = mapped_column(String(60))
    password_hash: Mapped[str | None] = mapped_column(String(255))
    role: Mapped[str] = mapped_column(String(20), default="user")  # user | admin | test_admin
    provider: Mapped[str] = mapped_column(String(20), default="local")  # local | google | naver | kakao
    phone: Mapped[str | None] = mapped_column(String(20))
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    last_login_at: Mapped[datetime | None] = mapped_column(DateTime)
    preference: Mapped["UserPreference | None"] = relationship(back_populates="user", cascade="all, delete-orphan",
                                                               uselist=False)


class UserPreference(Base):
    __tablename__ = "user_preferences"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), unique=True)
    region_codes: Mapped[list] = mapped_column(JSON, default=list)
    deal_type: Mapped[str] = mapped_column(String(10), default="sale")  # sale | jeonse | monthly
    budget_min: Mapped[int | None] = mapped_column(Integer)
    budget_max: Mapped[int | None] = mapped_column(Integer)
    monthly_max: Mapped[int | None] = mapped_column(Integer)
    area_min: Mapped[float | None] = mapped_column(Float)
    area_max: Mapped[float | None] = mapped_column(Float)
    rooms_min: Mapped[int | None] = mapped_column(Integer)
    build_year_min: Mapped[int | None] = mapped_column(Integer)
    transport_weight: Mapped[int] = mapped_column(Integer, default=3)  # 1~5
    school_weight: Mapped[int] = mapped_column(Integer, default=3)
    infra_weight: Mapped[int] = mapped_column(Integer, default=3)
    purpose: Mapped[str] = mapped_column(String(12), default="residence")  # residence | investment
    saved_searches: Mapped[list] = mapped_column(JSON, default=list)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow, onupdate=utcnow)
    user: Mapped[User] = relationship(back_populates="preference")


class AdminUser(Base):
    __tablename__ = "admin_users"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), unique=True)
    level: Mapped[str] = mapped_column(String(20), default="super")  # super | readonly
    granted_by: Mapped[str] = mapped_column(String(60), default="admin_secret_key")
    granted_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)
    last_access_at: Mapped[datetime | None] = mapped_column(DateTime)


class AuditLog(TimestampMixin, Base):
    __tablename__ = "audit_logs"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int | None] = mapped_column(Integer, index=True)
    actor_email: Mapped[str] = mapped_column(String(191))
    role: Mapped[str] = mapped_column(String(20))
    action: Mapped[str] = mapped_column(String(60), index=True)
    target: Mapped[str] = mapped_column(String(120), default="")
    detail: Mapped[dict] = mapped_column(JSON, default=dict)
    ip: Mapped[str] = mapped_column(String(64), default="")


# ---------------------------------------------------------------- 지역 / 단지 / 평형 / 매물
class Region(Base):
    __tablename__ = "regions"
    code: Mapped[str] = mapped_column(String(5), primary_key=True)  # 법정동코드 앞 5자리 (시군구)
    sido: Mapped[str] = mapped_column(String(20))
    sigungu: Mapped[str] = mapped_column(String(30))
    lat: Mapped[float] = mapped_column(Float)
    lng: Mapped[float] = mapped_column(Float)

    @property
    def full_name(self) -> str:
        return f"{self.sido} {self.sigungu}".strip()


class ApartmentComplex(TimestampMixin, Base):
    __tablename__ = "apartment_complexes"
    __table_args__ = (Index("ix_complex_region_name", "region_code", "name"), Index("ix_complex_geo", "lat", "lng"))
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    complex_code: Mapped[str] = mapped_column(String(40), unique=True)  # 국토부 aptSeq 또는 sample 코드
    name: Mapped[str] = mapped_column(String(100), index=True)
    region_code: Mapped[str] = mapped_column(ForeignKey("regions.code"))
    dong: Mapped[str] = mapped_column(String(40), default="")
    address: Mapped[str] = mapped_column(String(200), default="")
    lat: Mapped[float] = mapped_column(Float)
    lng: Mapped[float] = mapped_column(Float)
    geo_precise: Mapped[bool] = mapped_column(Boolean, default=True)
    build_year: Mapped[int | None] = mapped_column(Integer)
    households: Mapped[int | None] = mapped_column(Integer)
    max_floor: Mapped[int | None] = mapped_column(Integer)
    source: Mapped[str] = mapped_column(String(20), default="sample", index=True)
    region: Mapped[Region] = relationship()
    apartments: Mapped[list["Apartment"]] = relationship(back_populates="complex", cascade="all, delete-orphan",
                                                         order_by="Apartment.exclusive_area")


class Apartment(Base):
    """단지 내 평형(전용면적) 타입"""
    __tablename__ = "apartments"
    __table_args__ = (UniqueConstraint("complex_id", "exclusive_area", name="uq_apartment_type"),)
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    complex_id: Mapped[int] = mapped_column(ForeignKey("apartment_complexes.id", ondelete="CASCADE"), index=True)
    exclusive_area: Mapped[float] = mapped_column(Float)
    supply_area: Mapped[float | None] = mapped_column(Float)
    rooms: Mapped[int | None] = mapped_column(Integer)
    bathrooms: Mapped[int | None] = mapped_column(Integer)
    type_name: Mapped[str] = mapped_column(String(20), default="")
    complex: Mapped[ApartmentComplex] = relationship(back_populates="apartments")


class Property(Base):
    """중개업체·판매자가 등록한 매물 (호가) — 실거래가와 구분"""
    __tablename__ = "properties"
    __table_args__ = (Index("ix_property_search", "deal_type", "status", "price"),)
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    apartment_id: Mapped[int] = mapped_column(ForeignKey("apartments.id", ondelete="CASCADE"), index=True)
    complex_id: Mapped[int] = mapped_column(ForeignKey("apartment_complexes.id", ondelete="CASCADE"), index=True)
    deal_type: Mapped[str] = mapped_column(String(10))  # sale | jeonse | monthly
    price: Mapped[int] = mapped_column(Integer, default=0)  # 매매가 또는 전세·월세 보증금 (만원)
    monthly_rent: Mapped[int] = mapped_column(Integer, default=0)  # 월 임대료 (만원)
    floor: Mapped[int | None] = mapped_column(Integer)
    direction: Mapped[str] = mapped_column(String(10), default="")
    description: Mapped[str] = mapped_column(Text, default="")
    agency: Mapped[str] = mapped_column(String(60), default="")
    status: Mapped[str] = mapped_column(String(12), default="approved", index=True)  # pending | approved | rejected
    source: Mapped[str] = mapped_column(String(20), default="sample")
    registered_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow, onupdate=utcnow)
    apartment: Mapped[Apartment] = relationship()
    complex: Mapped[ApartmentComplex] = relationship()
    images: Mapped[list["PropertyImage"]] = relationship(cascade="all, delete-orphan",
                                                         order_by="PropertyImage.sort_order")


class PropertyImage(Base):
    __tablename__ = "property_images"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    property_id: Mapped[int] = mapped_column(ForeignKey("properties.id", ondelete="CASCADE"), index=True)
    url: Mapped[str] = mapped_column(String(500))  # Object Storage URL
    sort_order: Mapped[int] = mapped_column(Integer, default=0)


# ---------------------------------------------------------------- 실거래 (국토교통부)
class TransactionHistory(TimestampMixin, Base):
    """아파트 매매 실거래 (계약 완료 정보)"""
    __tablename__ = "transaction_history"
    __table_args__ = (Index("ix_trade_complex_date", "complex_id", "deal_date"),
                      Index("ix_trade_region_date", "region_code", "deal_date"))
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    complex_id: Mapped[int] = mapped_column(ForeignKey("apartment_complexes.id", ondelete="CASCADE"))
    apartment_id: Mapped[int | None] = mapped_column(ForeignKey("apartments.id", ondelete="SET NULL"), index=True)
    region_code: Mapped[str] = mapped_column(String(5))
    exclusive_area: Mapped[float] = mapped_column(Float)
    floor: Mapped[int | None] = mapped_column(Integer)
    price: Mapped[int] = mapped_column(Integer)  # 거래금액 (만원)
    deal_date: Mapped[date] = mapped_column(Date)
    dealing_type: Mapped[str] = mapped_column(String(10), default="중개거래")  # 중개거래 | 직거래
    canceled: Mapped[bool] = mapped_column(Boolean, default=False)
    source: Mapped[str] = mapped_column(String(20), default="sample", index=True)
    source_key: Mapped[str] = mapped_column(String(64), unique=True)  # 중복 방지 해시


class RentalHistory(TimestampMixin, Base):
    """아파트 전월세 실거래 (monthly_rent=0 → 전세)"""
    __tablename__ = "rental_history"
    __table_args__ = (Index("ix_rent_complex_date", "complex_id", "deal_date"),
                      Index("ix_rent_region_date", "region_code", "deal_date"))
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    complex_id: Mapped[int] = mapped_column(ForeignKey("apartment_complexes.id", ondelete="CASCADE"))
    apartment_id: Mapped[int | None] = mapped_column(ForeignKey("apartments.id", ondelete="SET NULL"), index=True)
    region_code: Mapped[str] = mapped_column(String(5))
    exclusive_area: Mapped[float] = mapped_column(Float)
    floor: Mapped[int | None] = mapped_column(Integer)
    deposit: Mapped[int] = mapped_column(Integer)  # 보증금 (만원)
    monthly_rent: Mapped[int] = mapped_column(Integer, default=0)  # 월세 (만원)
    contract_type: Mapped[str] = mapped_column(String(10), default="신규")  # 신규 | 갱신
    deal_date: Mapped[date] = mapped_column(Date)
    source: Mapped[str] = mapped_column(String(20), default="sample", index=True)
    source_key: Mapped[str] = mapped_column(String(64), unique=True)


class RegionalStatistic(Base):
    """실거래 기반 지역·월별 집계 (services/stats.py 가 재계산)"""
    __tablename__ = "regional_statistics"
    __table_args__ = (UniqueConstraint("region_code", "period", name="uq_region_period"),)
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    region_code: Mapped[str] = mapped_column(ForeignKey("regions.code"), index=True)
    period: Mapped[str] = mapped_column(String(7))  # YYYY-MM
    avg_price: Mapped[float] = mapped_column(Float, default=0)
    median_price: Mapped[float] = mapped_column(Float, default=0)
    avg_price_per_m2: Mapped[float] = mapped_column(Float, default=0)
    volume: Mapped[int] = mapped_column(Integer, default=0)
    avg_jeonse: Mapped[float | None] = mapped_column(Float)
    jeonse_per_m2: Mapped[float | None] = mapped_column(Float)
    jeonse_ratio: Mapped[float | None] = mapped_column(Float)
    rent_volume: Mapped[int] = mapped_column(Integer, default=0)
    sources: Mapped[list] = mapped_column(JSON, default=list)
    computed_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)


class Infrastructure(Base):
    """생활 인프라 POI (지하철·버스·학교·병원·약국·마트·공원·문화시설)"""
    __tablename__ = "infrastructure"
    __table_args__ = (Index("ix_infra_geo", "lat", "lng"),)
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    region_code: Mapped[str] = mapped_column(String(5), index=True)
    category: Mapped[str] = mapped_column(String(20), index=True)
    name: Mapped[str] = mapped_column(String(100))
    lat: Mapped[float] = mapped_column(Float)
    lng: Mapped[float] = mapped_column(Float)
    source: Mapped[str] = mapped_column(String(20), default="sample")


# ---------------------------------------------------------------- AI
class ModelVersion(TimestampMixin, Base):
    __tablename__ = "model_versions"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    kind: Mapped[str] = mapped_column(String(20))  # price | recommend
    version: Mapped[str] = mapped_column(String(60))
    algorithm: Mapped[str] = mapped_column(String(80), default="")
    metrics: Mapped[dict] = mapped_column(JSON, default=dict)
    trained_rows: Mapped[int] = mapped_column(Integer, default=0)
    data_as_of: Mapped[str] = mapped_column(String(10), default="")
    active: Mapped[bool] = mapped_column(Boolean, default=True)
    notes: Mapped[str] = mapped_column(Text, default="")


class PricePrediction(TimestampMixin, Base):
    __tablename__ = "price_predictions"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    apartment_id: Mapped[int] = mapped_column(ForeignKey("apartments.id", ondelete="CASCADE"), index=True)
    complex_id: Mapped[int] = mapped_column(Integer, index=True)
    model_version: Mapped[str] = mapped_column(String(60))
    floor: Mapped[int | None] = mapped_column(Integer)
    predicted_price: Mapped[int] = mapped_column(Integer)
    lower_price: Mapped[int] = mapped_column(Integer)
    upper_price: Mapped[int] = mapped_column(Integer)
    target_period: Mapped[str] = mapped_column(String(20))
    data_as_of: Mapped[str] = mapped_column(String(10))


class RecommendationHistory(TimestampMixin, Base):
    __tablename__ = "recommendation_history"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    conditions: Mapped[dict] = mapped_column(JSON, default=dict)
    results: Mapped[list] = mapped_column(JSON, default=list)
    model_version: Mapped[str] = mapped_column(String(60), default="")


# ---------------------------------------------------------------- 관심 매물 / 알림
class FavoriteProperty(TimestampMixin, Base):
    __tablename__ = "favorite_properties"
    __table_args__ = (UniqueConstraint("user_id", "complex_id", "property_id", name="uq_favorite"),)
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    complex_id: Mapped[int] = mapped_column(ForeignKey("apartment_complexes.id", ondelete="CASCADE"))
    property_id: Mapped[int | None] = mapped_column(ForeignKey("properties.id", ondelete="CASCADE"))
    memo: Mapped[str] = mapped_column(String(200), default="")


class PriceAlert(TimestampMixin, Base):
    __tablename__ = "price_alerts"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    complex_id: Mapped[int] = mapped_column(ForeignKey("apartment_complexes.id", ondelete="CASCADE"))
    apartment_id: Mapped[int | None] = mapped_column(ForeignKey("apartments.id", ondelete="CASCADE"))
    deal_type: Mapped[str] = mapped_column(String(10), default="sale")
    condition: Mapped[str] = mapped_column(String(10), default="below")  # below | above
    target_price: Mapped[int] = mapped_column(Integer)
    active: Mapped[bool] = mapped_column(Boolean, default=True)
    last_triggered_at: Mapped[datetime | None] = mapped_column(DateTime)
    last_triggered_price: Mapped[int | None] = mapped_column(Integer)


class Notification(TimestampMixin, Base):
    __tablename__ = "notifications"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)  # None=공지
    kind: Mapped[str] = mapped_column(String(20), default="price_alert")
    title: Mapped[str] = mapped_column(String(120))
    message: Mapped[str] = mapped_column(String(500))
    link: Mapped[str] = mapped_column(String(200), default="")
    read: Mapped[bool] = mapped_column(Boolean, default=False)


class SearchLog(TimestampMixin, Base):
    __tablename__ = "search_logs"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int | None] = mapped_column(Integer, index=True)
    keyword: Mapped[str] = mapped_column(String(100), default="")
    region_code: Mapped[str] = mapped_column(String(5), default="")
    deal_type: Mapped[str] = mapped_column(String(10), default="")
    filters: Mapped[dict] = mapped_column(JSON, default=dict)


class Inquiry(TimestampMixin, Base):
    __tablename__ = "inquiries"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int | None] = mapped_column(Integer)
    name: Mapped[str] = mapped_column(String(60))
    email: Mapped[str] = mapped_column(String(191))
    category: Mapped[str] = mapped_column(String(20), default="general")  # general | partnership | data | bug
    message: Mapped[str] = mapped_column(Text)
    status: Mapped[str] = mapped_column(String(12), default="open")  # open | answered | closed
    answer: Mapped[str] = mapped_column(Text, default="")


# ---------------------------------------------------------------- 리포트 / 데이터 수집
class AnalysisReport(TimestampMixin, Base):
    __tablename__ = "analysis_reports"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    kind: Mapped[str] = mapped_column(String(20), index=True)
    title: Mapped[str] = mapped_column(String(160))
    region_code: Mapped[str | None] = mapped_column(String(5))
    summary: Mapped[str] = mapped_column(String(500), default="")
    content: Mapped[str] = mapped_column(Text)  # Markdown
    stats: Mapped[dict] = mapped_column(JSON, default=dict)  # LLM 에 전달한 검증된 근거 데이터 + 수치 검증 결과
    generator: Mapped[str] = mapped_column(String(20), default="rule")  # gemini | rule
    model: Mapped[str] = mapped_column(String(60), default="")
    data_as_of: Mapped[str] = mapped_column(String(10), default="")
    created_by: Mapped[str] = mapped_column(String(191), default="system")


class DataSource(Base):
    __tablename__ = "data_sources"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    code: Mapped[str] = mapped_column(String(30), unique=True)
    name: Mapped[str] = mapped_column(String(100))
    provider: Mapped[str] = mapped_column(String(60))
    url: Mapped[str] = mapped_column(String(300), default="")
    status: Mapped[str] = mapped_column(String(20), default="needs_key")  # active | needs_key | sample | planned
    last_synced_at: Mapped[datetime | None] = mapped_column(DateTime)
    record_count: Mapped[int] = mapped_column(Integer, default=0)
    notes: Mapped[str] = mapped_column(String(300), default="")


class DataCollectionLog(Base):
    __tablename__ = "data_collection_logs"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    source_code: Mapped[str] = mapped_column(String(30), index=True)
    region_code: Mapped[str] = mapped_column(String(5), default="")
    period: Mapped[str] = mapped_column(String(7), default="")
    status: Mapped[str] = mapped_column(String(12))  # success | failed | skipped
    fetched: Mapped[int] = mapped_column(Integer, default=0)
    inserted: Mapped[int] = mapped_column(Integer, default=0)
    duplicates: Mapped[int] = mapped_column(Integer, default=0)
    invalid: Mapped[int] = mapped_column(Integer, default=0)
    error: Mapped[str] = mapped_column(Text, default="")
    started_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)
    finished_at: Mapped[datetime | None] = mapped_column(DateTime)
